// Décompression zstd en JavaScript pur, y compris « ZBIC », la variante que Nintendo utilise depuis le firmware 22
// pour compresser les exécutables (NSO) des jeux. ZBIC reprend le format zstd (RFC 8878) avec un autre nombre
// magique et une autre description des tables FSE : leurs effectifs cumulés sont transmis par codage interpolatif
// binaire. Les émulateurs Switch ne lisent pas encore ce format ; switchgame.js s'en sert pour leur préparer une copie
// décompressée de l'exécutable.

const MAGIC_ZSTD = 0xfd2fb528;
const MAGIC_ZBIC = 0x4349425a;

const fail = (what) => { throw new Error(`Données compressées invalides : ${what}.`); };
const u32 = (src, p) => (src[p] | (src[p + 1] << 8) | (src[p + 2] << 16) | (src[p + 3] << 24)) >>> 0;

// Flux de bits lu à rebours, depuis le bit de marquage du dernier octet. Les bits situés avant le début du flux
// valent 0 et « pos » devient négatif quand on les lit.
class Bits {
	constructor(src, start, end) {
		if (end <= start || !src[end - 1]) fail('flux de bits');
		this.src = src;
		this.start = start;
		this.pos = (end - start - 1) * 8 + 31 - Math.clz32(src[end - 1]);
	}

	// n bits (24 au plus) juste sous la position courante, sans avancer.
	peek(n) {
		const s = this.src;
		const p = this.pos - n;
		if (p >= 0) {
			const i = this.start + (p >> 3);
			return ((s[i] | (s[i + 1] << 8) | (s[i + 2] << 16) | (s[i + 3] << 24)) >>> (p & 7)) & ((1 << n) - 1);
		}
		if (this.pos <= 0) return 0;
		const i = this.start;
		return ((s[i] | (s[i + 1] << 8) | (s[i + 2] << 16)) & ((1 << this.pos) - 1)) << -p;
	}

	read(n) {
		if (n > 24) return this.read(n - 16) * 65536 + this.read(16);
		const v = this.peek(n);
		this.pos -= n;
		return v;
	}
}

// Table de décodage FSE (RFC 8878, 4.1.1) d'après les effectifs normalisés ; -1 marque un symbole rare.
const fseTable = (norm, last, log) => {
	const size = 1 << log;
	const sym = new Uint8Array(size), bits = new Uint8Array(size), base = new Uint16Array(size);
	const next = new Uint16Array(last + 1);
	let high = size - 1;
	for (let s = 0; s <= last; s++) {
		if (norm[s] === -1) { sym[high--] = s; next[s] = 1; } else next[s] = norm[s];
	}
	const step = (size >> 1) + (size >> 3) + 3;
	let pos = 0;
	for (let s = 0; s <= last; s++) {
		for (let i = 0; i < norm[s]; i++) {
			sym[pos] = s;
			do pos = (pos + step) & (size - 1); while (pos > high);
		}
	}
	if (pos) fail('table FSE');
	for (let u = 0; u < size; u++) {
		const n = next[sym[u]]++;
		bits[u] = log - (31 - Math.clz32(n));
		base[u] = (n << bits[u]) - size;
	}
	return { sym, bits, base, log };
};
const rleTable = (symbol) => ({ sym: Uint8Array.of(symbol), bits: new Uint8Array(1), base: new Uint16Array(1), log: 0 });

// Description standard d'une table FSE : effectifs à nombre de bits variable, suites de zéros en blocs de 2 bits.
const readNCountStd = (src, pos, end, maxSym) => {
	let bit = pos * 8;
	const peek = () => u32(src, bit >> 3) >>> (bit & 7);
	const log = (peek() & 15) + 5;
	if (log > 15) fail('précision FSE');
	bit += 4;
	const norm = new Int16Array(maxSym + 1);
	let remaining = (1 << log) + 1, threshold = 1 << log, width = log + 1, s = 0, zero = false;
	for (;;) {
		if (zero) {
			let r;
			do { r = peek() & 3; bit += 2; s += r; } while (r === 3);
		}
		if (s > maxSym) fail('table FSE');
		const v = peek(), max = 2 * threshold - 1 - remaining;
		let count;
		if ((v & (threshold - 1)) < max) { count = v & (threshold - 1); bit += width - 1; }
		else { count = v & (2 * threshold - 1); if (count >= threshold) count -= max; bit += width; }
		count--;
		remaining -= Math.abs(count);
		norm[s++] = count;
		zero = count === 0;
		if (remaining <= 1) break;
		while (remaining < threshold) { width--; threshold >>= 1; }
	}
	if (remaining !== 1 || (bit + 7) >> 3 > end) fail('table FSE');
	return { norm, last: s - 1, log, size: ((bit + 7) >> 3) - pos };
};

// Ordre de lecture ZBIC des effectifs cumulés : milieu de l'intervalle, puis moitié haute, puis moitié basse ; une
// dernière étape (0, 0, 1) clôt la lecture.
const BIC_STEPS = new Map();
const bicSteps = (top) => {
	if (!BIC_STEPS.has(top)) {
		const steps = [];
		const visit = (a, b) => {
			if (b - a < 2) return;
			const m = (a + b) >> 1;
			steps.push([m, a, b]);
			visit(m, b);
			visit(a, m);
		};
		visit(0, top);
		steps.push([0, 0, 1]);
		BIC_STEPS.set(top, steps);
	}
	return BIC_STEPS.get(top);
};

// Description ZBIC d'une table FSE. Un premier octet donne la longueur L (7 bits) et l'option « symboles rares »
// (bit 7). Les L octets suivants forment un entier, lu à partir du dernier octet, dont on extrait par divisions
// successives le dernier symbole, la précision, le total puis chaque effectif cumulé.
const readNCountBic = (src, pos, end, maxSym) => {
	const head = src[pos];
	const low = head >> 7;
	let left = head & 0x7f;
	if (pos + left + 1 >= end) fail('table ZBIC');
	let v = 0;
	const refill = () => { while (left && v < 2 ** 40) v = v * 256 + src[pos + left--]; };
	const take = (n) => { const r = v % n; v = Math.floor(v / n); refill(); return r; };
	refill();
	const last = take(52) + 1;
	if (last > maxSym) fail('table ZBIC');
	const log = take(8) + 5;
	const extra = take(1 << log);
	let top = 1;
	while (top <= last) top <<= 1;
	const cum = new Array(top + 1).fill(0);
	cum[top] = low ? last + extra + 2 : extra + 1;
	for (const [m, a, b] of bicSteps(top)) {
		if (cum[a] === cum[b]) cum.fill(cum[a], a + 1, b);
		else if (cum[b] < cum[a]) fail('table ZBIC');
		else cum[m] = cum[a] + take(cum[b] - cum[a] + 1);
	}
	const norm = new Int16Array(last + 1);
	let total = 0;
	for (let s = 0; s <= last; s++) {
		norm[s] = cum[s + 1] - (s ? cum[s] : 0) - low;
		total += Math.abs(norm[s]);
	}
	if (left || total !== 1 << log) fail('table ZBIC');
	return { norm, last, log, size: (head & 0x7f) + 1 };
};

// Description d'un arbre de Huffman (RFC 8878, 4.2.1) → table indexée par maxBits bits : symbole et longueur.
const huffmanTable = (src, pos, end, readNCount) => {
	const head = src[pos];
	const weights = [];
	let next;
	if (head < 128) {
		next = pos + 1 + head;
		if (next > end) fail('arbre de Huffman');
		const t = readNCount(src, pos + 1, next, 255);
		if (t.log > 6) fail('arbre de Huffman');
		const fse = fseTable(t.norm, t.last, t.log);
		const br = new Bits(src, pos + 1 + t.size, next);
		let s1 = br.read(fse.log), s2 = br.read(fse.log);
		for (;;) {
			weights.push(fse.sym[s1]);
			s1 = fse.base[s1] + br.read(fse.bits[s1]);
			if (br.pos < 0) { weights.push(fse.sym[s2]); break; }
			weights.push(fse.sym[s2]);
			s2 = fse.base[s2] + br.read(fse.bits[s2]);
			if (br.pos < 0) { weights.push(fse.sym[s1]); break; }
			if (weights.length > 255) fail('arbre de Huffman');
		}
	} else {
		const n = head - 127;
		next = pos + 1 + ((n + 1) >> 1);
		for (let i = 0; i < n; i++) weights.push((src[pos + 1 + (i >> 1)] >> (i & 1 ? 0 : 4)) & 15);
	}
	// Le dernier poids est implicite : il complète la somme des 2^(poids-1) jusqu'à une puissance de 2.
	let total = 0;
	for (const w of weights) { if (w > 12) fail('arbre de Huffman'); if (w) total += 1 << (w - 1); }
	if (!total || weights.length > 255) fail('arbre de Huffman');
	const maxBits = 32 - Math.clz32(total);
	const rest = (1 << maxBits) - total;
	if (maxBits > 12 || (rest & (rest - 1))) fail('arbre de Huffman');
	weights.push(32 - Math.clz32(rest));
	const size = 1 << maxBits;
	const sym = new Uint8Array(size), bits = new Uint8Array(size);
	let p = 0;
	for (let w = 1; w <= maxBits; w++) {
		const len = 1 << (w - 1);
		weights.forEach((x, s) => {
			if (x !== w) return;
			sym.fill(s, p, p + len);
			bits.fill(maxBits + 1 - w, p, p + len);
			p += len;
		});
	}
	if (p !== size) fail('arbre de Huffman');
	return { sym, bits, maxBits, next };
};

const huffmanStream = (src, start, end, h, out, from, count) => {
	const br = new Bits(src, start, end);
	const { sym, bits, maxBits } = h;
	for (let k = from, stop = from + count; k < stop; k++) {
		const v = br.peek(maxBits);
		out[k] = sym[v];
		br.pos -= bits[v];
	}
	if (br.pos !== 0) fail('flux de littéraux');
};

// Section des littéraux d'un bloc : brute, répétée (RLE) ou compressée en Huffman (1 ou 4 flux).
const readLiterals = (src, pos, end, st) => {
	const b0 = src[pos], type = b0 & 3, format = (b0 >> 2) & 3;
	if (type < 2) {
		let size, head;
		if (!(format & 1)) { size = b0 >> 3; head = 1; }
		else if (format === 1) { size = (b0 >> 4) + (src[pos + 1] << 4); head = 2; }
		else { size = (b0 >> 4) + (src[pos + 1] << 4) + (src[pos + 2] << 12); head = 3; }
		const at = pos + head;
		if (type === 1) return { lit: new Uint8Array(size).fill(src[at]), next: at + 1 };
		if (at + size > end) fail('littéraux');
		return { lit: src.subarray(at, at + size), next: at + size };
	}
	const head = [3, 3, 4, 5][format], width = [10, 10, 14, 18][format];
	let v = 0;
	for (let i = head - 1; i >= 0; i--) v = v * 256 + src[pos + i];
	const size = Math.floor(v / 16) % 2 ** width;
	const comp = Math.floor(v / 2 ** (4 + width)) % 2 ** width;
	let p = pos + head;
	const stop = p + comp;
	if (stop > end) fail('littéraux');
	if (type === 2) { st.huf = huffmanTable(src, p, stop, st.readNCount); p = st.huf.next; }
	else if (!st.huf) fail('arbre de Huffman absent');
	const lit = new Uint8Array(size);
	if (format === 0) huffmanStream(src, p, stop, st.huf, lit, 0, size);
	else {
		const quarter = Math.floor((size + 3) / 4);
		if (size < 3 * quarter) fail('littéraux');
		let q = p + 6;
		for (let i = 0; i < 4; i++) {
			const len = i < 3 ? src[p + 2 * i] | (src[p + 2 * i + 1] << 8) : stop - q;
			if (q + len > stop) fail('littéraux');
			huffmanStream(src, q, q + len, st.huf, lit, i * quarter, i < 3 ? quarter : size - 3 * quarter);
			q += len;
		}
	}
	return { lit, next: stop };
};

// Codes des longueurs (RFC 8878, 3.1.1.3.2.1) et distributions prédéfinies.
const LL_BASE = [...Array(16).keys(), 16, 18, 20, 22, 24, 28, 32, 40, 48, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536];
const LL_BITS = [...Array(16).fill(0), 1, 1, 1, 1, 2, 2, 3, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const ML_BASE = [...Array(32).keys()].map(i => i + 3).concat([35, 37, 39, 41, 43, 47, 51, 59, 67, 83, 99, 131, 259, 515, 1027, 2051, 4099, 8195, 16387, 32771, 65539]);
const ML_BITS = [...Array(32).fill(0), 1, 1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const DEFAULTS = {
	ll: [6, [4, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 2, 1, 1, 1, 1, 1, -1, -1, -1, -1]],
	ml: [6, [1, 4, 3, 2, 2, 2, 2, 2, 2, ...Array(37).fill(1), ...Array(7).fill(-1)]],
	of: [5, [1, 1, 1, 1, 1, 1, 2, 2, 2, ...Array(15).fill(1), ...Array(5).fill(-1)]],
};
const PREDEFINED = {};
const predefined = (key) => PREDEFINED[key] || (PREDEFINED[key] = fseTable(DEFAULTS[key][1], DEFAULTS[key][1].length - 1, DEFAULTS[key][0]));
const SEQ_TABLES = [['ll', 6, 35, 9], ['of', 4, 31, 8], ['ml', 2, 52, 9]];

// Bloc compressé : littéraux, puis séquences (littéraux à recopier, puis copie depuis la sortie déjà produite).
const decodeBlock = (src, pos, end, out, op, st) => {
	const { lit, next } = readLiterals(src, pos, end, st);
	pos = next;
	let nb = src[pos++];
	if (nb === 0) {
		if (op + lit.length > out.length) fail('taille de sortie');
		out.set(lit, op);
		return op + lit.length;
	}
	if (nb === 255) { nb = src[pos] + (src[pos + 1] << 8) + 0x7f00; pos += 2; }
	else if (nb >= 128) nb = ((nb - 128) << 8) + src[pos++];
	const modes = src[pos++];
	if (modes & 3) fail('séquences');
	for (const [key, shift, maxSym, maxLog] of SEQ_TABLES) {
		const mode = (modes >> shift) & 3;
		if (mode === 0) st[key] = predefined(key);
		else if (mode === 1) st[key] = rleTable(src[pos++]);
		else if (mode === 2) {
			const t = st.readNCount(src, pos, end, maxSym);
			if (t.log > maxLog) fail('précision FSE');
			st[key] = fseTable(t.norm, t.last, t.log);
			pos += t.size;
		} else if (!st[key]) fail('table à répéter absente');
	}
	const { ll, of, ml, rep } = st;
	const br = new Bits(src, pos, end);
	let sl = br.read(ll.log), so = br.read(of.log), sm = br.read(ml.log);
	let lp = 0;
	for (let n = 0; n < nb; n++) {
		const oc = of.sym[so], lc = ll.sym[sl], mc = ml.sym[sm];
		if (oc > 31 || lc > 35 || mc > 52) fail('séquences');
		let offset = 2 ** oc + br.read(oc);
		const mlen = ML_BASE[mc] + br.read(ML_BITS[mc]);
		const llen = LL_BASE[lc] + br.read(LL_BITS[lc]);
		if (offset > 3) {
			offset -= 3;
			rep[2] = rep[1]; rep[1] = rep[0]; rep[0] = offset;
		} else {
			const k = offset - 1 + (llen === 0 ? 1 : 0);
			if (k === 0) offset = rep[0];
			else {
				offset = k === 3 ? rep[0] - 1 : rep[k];
				if (k > 1) rep[2] = rep[1];
				rep[1] = rep[0];
				rep[0] = offset;
			}
		}
		if (lp + llen > lit.length || op + llen + mlen > out.length) fail('séquences');
		if (llen > 16) out.set(lit.subarray(lp, lp + llen), op);
		else for (let k = 0; k < llen; k++) out[op + k] = lit[lp + k];
		op += llen;
		lp += llen;
		if (offset < 1 || offset > op) fail('distance');
		let from = op - offset;
		if (offset >= mlen && mlen > 16) { out.copyWithin(op, from, from + mlen); op += mlen; }
		else for (let k = 0; k < mlen; k++) out[op++] = out[from++];
		if (n < nb - 1) {
			sl = ll.base[sl] + br.read(ll.bits[sl]);
			sm = ml.base[sm] + br.read(ml.bits[sm]);
			so = of.base[so] + br.read(of.bits[so]);
		}
	}
	if (br.pos !== 0) fail('fin des séquences');
	if (op + lit.length - lp > out.length) fail('taille de sortie');
	out.set(lit.subarray(lp), op);
	return op + lit.length - lp;
};

const decompressFrame = (src, pos, expected) => {
	const magic = u32(src, pos);
	if (magic !== MAGIC_ZSTD && magic !== MAGIC_ZBIC) fail('nombre magique');
	const desc = src[pos + 4];
	if (desc & 8) fail('en-tête');
	let p = pos + 5;
	const single = desc & 0x20;
	if (!single) p++;
	const dictBytes = [0, 1, 2, 4][desc & 3];
	for (let i = 0; i < dictBytes; i++) if (src[p + i]) fail('dictionnaire non pris en charge');
	p += dictBytes;
	const sizeBytes = [single ? 1 : 0, 2, 4, 8][desc >> 6];
	let size = expected;
	if (sizeBytes === 1) size = src[p];
	else if (sizeBytes === 2) size = (src[p] | (src[p + 1] << 8)) + 256;
	else if (sizeBytes === 4) size = u32(src, p);
	else if (sizeBytes === 8) size = u32(src, p) + u32(src, p + 4) * 2 ** 32;
	p += sizeBytes;
	if (!(size >= 0)) fail('taille inconnue');
	const out = new Uint8Array(size);
	const st = { rep: [1, 4, 8], readNCount: magic === MAGIC_ZBIC ? readNCountBic : readNCountStd };
	let op = 0;
	for (;;) {
		if (p + 3 > src.length) fail('bloc tronqué');
		const head = src[p] | (src[p + 1] << 8) | (src[p + 2] << 16);
		const type = (head >> 1) & 3, bsize = head >> 3;
		p += 3;
		if (type === 0) {
			if (op + bsize > size || p + bsize > src.length) fail('bloc brut');
			out.set(src.subarray(p, p + bsize), op);
			op += bsize;
			p += bsize;
		} else if (type === 1) {
			if (op + bsize > size) fail('bloc répété');
			out.fill(src[p], op, op + bsize);
			op += bsize;
			p += 1;
		} else if (type === 2) {
			if (p + bsize > src.length) fail('bloc tronqué');
			op = decodeBlock(src, p, p + bsize, out, op, st);
			p += bsize;
		} else fail('type de bloc');
		if (head & 1) break;
	}
	if (desc & 4) p += 4;
	if (op !== size) fail('taille finale');
	return { out, end: p };
};

// Décompresse une ou plusieurs trames zstd ou ZBIC mises bout à bout. « expected » sert quand la trame n'indique pas
// sa taille décompressée.
const decompress = (data, expected) => {
	const src = data instanceof Uint8Array ? data : new Uint8Array(data);
	const parts = [];
	let pos = 0;
	while (pos < src.length) {
		const magic = u32(src, pos);
		if ((magic & 0xfffffff0) === 0x184d2a50) { pos += 8 + u32(src, pos + 4); continue; }
		const { out, end } = decompressFrame(src, pos, expected);
		parts.push(out);
		pos = end;
	}
	const all = parts.length === 1 ? parts[0] : Buffer.concat(parts);
	return Buffer.from(all.buffer, all.byteOffset, all.length);
};

const isZbic = (data) => data.length >= 4 && u32(data, 0) === MAGIC_ZBIC;

module.exports = { decompress, isZbic, bicSteps };
