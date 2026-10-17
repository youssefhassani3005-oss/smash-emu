// Outils ROM N64 : ordre des octets, identification, patchs IPS / BPS.
const crypto = require('crypto');

const SM64_US_MD5 = '20b854b239203baf6c961b850a4a51a2';

const KNOWN_ROMS = {
	[SM64_US_MD5]: 'Super Mario 64 (US)',
	'85d61f5525af708c9f1e84dce6dc10e9': 'Super Mario 64 (JP)',
	'45676429ef6b90e65b517129b700308e': 'Super Mario 64 (EU)',
	'2a0a8acb61538235bc1094d297fb6556': 'Majora\'s Mask (US)',
	'5bd1fe107bf8106b2ab6650abecd54d6': 'Ocarina of Time (US 1.0)',
	'57a9719ad547c516342e1a15d5c28c3d': 'Ocarina of Time (US 1.2)',
	'8bc2712139fbf0c56c8ea835802c52dc': 'Mario Party (US)',
	'1561c75d11cedf356a8ddb1a4a5f9d5d': 'Pokémon Stadium 2 (US)',
};

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();

const crc32 = (buf, end = buf.length) => {
	let c = 0xffffffff;
	for (let i = 0; i < end; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
};

const md5 = buf => crypto.createHash('md5').update(buf).digest('hex');

// z64 = big-endian (natif), v64 = mots de 16 bits inversés, n64 = mots de 32 bits inversés.
const detectByteOrder = buf => {
	if (buf.length < 4) return null;
	const sig = buf.readUInt32BE(0);
	if (sig === 0x80371240) return 'z64';
	if (sig === 0x37804012) return 'v64';
	if (sig === 0x40123780) return 'n64';
	return null;
};

const toZ64 = buf => {
	const order = detectByteOrder(buf);
	if (!order) throw new Error('Ce fichier n\'est pas une ROM N64 reconnue.');
	if (order === 'z64') return buf;
	const out = Buffer.from(buf);
	if (order === 'v64') {
		for (let i = 0; i + 1 < out.length; i += 2) { const a = out[i]; out[i] = out[i + 1]; out[i + 1] = a; }
	} else {
		for (let i = 0; i + 3 < out.length; i += 4) {
			const a = out[i], b = out[i + 1];
			out[i] = out[i + 3]; out[i + 1] = out[i + 2]; out[i + 2] = b; out[i + 3] = a;
		}
	}
	return out;
};

const REGIONS = { E: 'US', J: 'Japon', P: 'Europe', D: 'Allemagne', F: 'France', U: 'Australie', A: 'Asie' };

const romInfo = (raw) => {
	const order = detectByteOrder(raw);
	if (!order) return null;
	const z = toZ64(raw);
	const hash = md5(z);
	return {
		byteOrder: order,
		title: z.toString('ascii', 0x20, 0x34).replace(/\0/g, '').trim(),
		gameCode: z.toString('ascii', 0x3b, 0x3f),
		region: REGIONS[String.fromCharCode(z[0x3e])] || String.fromCharCode(z[0x3e]),
		crc1: z.readUInt32BE(0x10).toString(16).toUpperCase().padStart(8, '0'),
		crc2: z.readUInt32BE(0x14).toString(16).toUpperCase().padStart(8, '0'),
		size: z.length,
		md5: hash,
		known: KNOWN_ROMS[hash] || null,
		isSm64Us: hash === SM64_US_MD5,
	};
};

const applyIps = (source, patch) => {
	if (patch.toString('ascii', 0, 5) !== 'PATCH') throw new Error('Patch IPS invalide (en-tête PATCH absent).');
	let out = Buffer.from(source);
	const grow = size => { if (size > out.length) { const n = Buffer.alloc(size); out.copy(n); out = n; } };
	let p = 5;
	while (p + 3 <= patch.length) {
		if (patch.toString('ascii', p, p + 3) === 'EOF') {
			p += 3;
			if (p + 3 <= patch.length) out = out.subarray(0, patch.readUIntBE(p, 3)); // troncature optionnelle
			return out;
		}
		const offset = patch.readUIntBE(p, 3); p += 3;
		const size = patch.readUInt16BE(p); p += 2;
		if (size === 0) {
			const count = patch.readUInt16BE(p); const value = patch[p + 2]; p += 3;
			grow(offset + count); out.fill(value, offset, offset + count);
		} else {
			grow(offset + size); patch.copy(out, offset, p, p + size); p += size;
		}
	}
	throw new Error('Patch IPS tronqué (marqueur EOF absent).');
};

const applyBps = (source, patch) => {
	if (patch.toString('ascii', 0, 4) !== 'BPS1') throw new Error('Patch BPS invalide (en-tête BPS1 absent).');
	let p = 4;
	const decode = () => {
		let data = 0, shift = 1;
		for (;;) {
			const x = patch[p++];
			data += (x & 0x7f) * shift;
			if (x & 0x80) break;
			shift *= 128;
			data += shift;
		}
		return data;
	};
	const end = patch.length - 12;
	const sourceSize = decode();
	const targetSize = decode();
	const metaSize = decode();
	p += metaSize;

	const expectedSourceCrc = patch.readUInt32LE(end);
	const expectedTargetCrc = patch.readUInt32LE(end + 4);
	if (patch.readUInt32LE(end + 8) !== crc32(patch, end + 8)) throw new Error('Patch BPS corrompu (CRC du patch incorrect).');
	if (source.length !== sourceSize || crc32(source) !== expectedSourceCrc) {
		throw new Error('Ce patch BPS ne correspond pas à cette ROM de base (CRC source différent).');
	}

	const target = Buffer.alloc(targetSize);
	let out = 0, sourceRel = 0, targetRel = 0;
	while (p < end) {
		const action = decode();
		const command = action % 4;
		let length = Math.floor(action / 4) + 1;
		if (command === 0) {
			source.copy(target, out, out, out + length); out += length;
		} else if (command === 1) {
			patch.copy(target, out, p, p + length); p += length; out += length;
		} else {
			const d = decode();
			const delta = (d & 1 ? -1 : 1) * Math.floor(d / 2);
			if (command === 2) {
				sourceRel += delta;
				source.copy(target, out, sourceRel, sourceRel + length); sourceRel += length; out += length;
			} else {
				targetRel += delta;
				while (length--) target[out++] = target[targetRel++];
			}
		}
	}
	if (crc32(target) !== expectedTargetCrc) throw new Error('Résultat du patch BPS incorrect (CRC cible différent).');
	return target;
};

const patchKind = (name) => {
	const ext = name.toLowerCase().split('.').pop();
	return ext === 'ips' || ext === 'bps' ? ext : null;
};

const applyPatch = (source, patch, name) => {
	const kind = patchKind(name);
	if (kind === 'ips') return applyIps(source, patch);
	if (kind === 'bps') return applyBps(source, patch);
	throw new Error(`Format de patch non pris en charge : ${name} (IPS et BPS uniquement).`);
};

module.exports = { SM64_US_MD5, crc32, md5, detectByteOrder, toZ64, romInfo, applyIps, applyBps, applyPatch, patchKind };
