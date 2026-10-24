// Jeux Switch récents (firmware 22 et plus) : leur exécutable (NSO) est compressé en ZBIC, un format que Citron ne lit
// pas encore (le jeu reste alors sur « Launching… »). Avant le lancement, Smash Emu déchiffre l'ExeFS du jeu avec les
// clés de l'utilisateur, décompresse les NSO concernés et les dépose comme mod ExeFS de Citron :
// load/<id du titre>/Smash Emu - ZBIC/exefs/<nom>. Tout reste sur le PC.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zbic = require('./zbic');

const MOD_NAME = 'Smash Emu - ZBIC';
const FORMAT = 1;

const readKeys = (files) => {
	const keys = {};
	for (const file of files) {
		let text;
		try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
		for (const line of text.split(/\r?\n/)) {
			const m = line.match(/^\s*([0-9A-Za-z_]+)\s*=\s*([0-9A-Fa-f]{32,64})\s*$/);
			if (m && !(m[1].toLowerCase() in keys)) keys[m[1].toLowerCase()] = Buffer.from(m[2], 'hex');
		}
	}
	return keys;
};

const ecb = (key, data) => {
	const d = crypto.createDecipheriv('aes-128-ecb', key, null);
	d.setAutoPadding(false);
	return Buffer.concat([d.update(data), d.final()]);
};

// Système de fichiers de partition : PFS0 (NSP, ExeFS) ou HFS0 (cartouche XCI).
const partition = (read, base) => {
	const head = read(base, 16);
	const magic = head.toString('latin1', 0, 4);
	const entry = magic === 'PFS0' ? 0x18 : magic === 'HFS0' ? 0x40 : 0;
	const count = head.readUInt32LE(4), strSize = head.readUInt32LE(8);
	if (!entry || count > 4096) return null;
	const table = read(base + 16, count * entry), strings = read(base + 16 + count * entry, strSize);
	const data = base + 16 + count * entry + strSize;
	return Array.from({ length: count }, (_, i) => {
		const nameOff = table.readUInt32LE(i * entry + 16);
		return {
			name: strings.toString('utf8', nameOff, strings.indexOf(0, nameOff)),
			off: data + Number(table.readBigUInt64LE(i * entry)),
			size: Number(table.readBigUInt64LE(i * entry + 8)),
		};
	});
};

// Contenu d'un NSP, ou de la partition « secure » d'une cartouche XCI.
const contents = (read, file) => {
	if (!/\.xci$/i.test(file)) return partition(read, 0);
	const head = read(0x100, 0x40);
	if (head.toString('latin1', 0, 4) !== 'HEAD') return null;
	const root = partition(read, Number(head.readBigUInt64LE(0x30)));
	const secure = root && root.find(e => e.name === 'secure');
	return secure ? partition(read, secure.off) : null;
};

// Déchiffrement AES-128-XTS d'un secteur, refait à partir d'AES-ECB (la bibliothèque crypto d'Electron n'a pas XTS).
// Nintendo place le numéro de secteur en big-endian dans le tweak.
const xtsDecrypt = (key, sector, data) => {
	const iv = Buffer.alloc(16);
	iv.writeBigUInt64BE(BigInt(sector), 8);
	const c = crypto.createCipheriv('aes-128-ecb', key.subarray(16, 32), null);
	c.setAutoPadding(false);
	const tweak = Buffer.concat([c.update(iv), c.final()]);
	const masks = Buffer.alloc(data.length);
	for (let o = 0; o < data.length; o += 16) {
		tweak.copy(masks, o);
		// Tweak du bloc suivant : multiplication par x dans GF(2^128).
		let carry = 0;
		for (let i = 0; i < 16; i++) { const b = tweak[i]; tweak[i] = ((b << 1) | carry) & 0xff; carry = b >> 7; }
		if (carry) tweak[0] ^= 0x87;
	}
	const x = Buffer.alloc(data.length);
	for (let i = 0; i < data.length; i++) x[i] = data[i] ^ masks[i];
	const out = ecb(key.subarray(0, 16), x);
	for (let i = 0; i < out.length; i++) out[i] ^= masks[i];
	return out;
};

// En-tête NCA (0xC00 octets) chiffré en AES-128-XTS par secteurs de 0x200.
const ncaHeader = (read, off, headerKey) => {
	const enc = read(off, 0xc00);
	const out = Buffer.concat(Array.from({ length: 6 }, (_, s) => xtsDecrypt(headerKey, s, enc.subarray(s * 0x200, (s + 1) * 0x200))));
	return out.toString('latin1', 0x200, 0x204) === 'NCA3' ? out : null;
};

// Clé AES-CTR des sections : clé de titre (ticket ou title.keys) ou zone de clés de l'en-tête. Les clés dérivées
// absentes du fichier prod.keys sont recalculées depuis la clé maître.
const ncaKey = (h, keys, titleKeys) => {
	const gen = Math.max(h[0x206], h[0x220]);
	const idx = (gen ? gen - 1 : 0).toString(16).padStart(2, '0');
	const master = keys[`master_key_${idx}`];
	const rights = h.subarray(0x230, 0x240);
	if (rights.some(b => b)) {
		const enc = titleKeys[rights.toString('hex')] || keys[rights.toString('hex')];
		const kek = keys[`titlekek_${idx}`] || (master && keys.titlekek_source && ecb(master, keys.titlekek_source));
		return enc && kek ? ecb(kek, enc) : null;
	}
	const kind = ['application', 'ocean', 'system'][h[0x207]];
	let kaek = keys[`key_area_key_${kind}_${idx}`];
	if (!kaek && master && keys.aes_kek_generation_source && keys.aes_key_generation_source && keys[`key_area_key_${kind}_source`]) {
		kaek = ecb(ecb(ecb(master, keys.aes_kek_generation_source), keys[`key_area_key_${kind}_source`]), keys.aes_key_generation_source);
	}
	return kaek ? ecb(kaek, h.subarray(0x300, 0x340)).subarray(0x20, 0x30) : null;
};

// ExeFS : section 0 du NCA Program (PFS0), chiffrée en AES-CTR ; le compteur suit la position dans le NCA.
const exefsOf = (read, nca, h, key) => {
	const start = h.readUInt32LE(0x240) * 0x200;
	const fsh = h.subarray(0x400, 0x600);
	const enc = fsh[4];
	if (fsh[2] !== 1 || fsh[3] !== 2 || (enc !== 1 && enc !== 3)) return null;
	const upper = Buffer.from(fsh.subarray(0x140, 0x148)).reverse();
	const rd = (abs, len) => {
		if (enc === 1) return read(nca.off + abs, len);
		const a = abs - (abs % 16), pad = abs - a;
		const iv = Buffer.alloc(16);
		upper.copy(iv);
		iv.writeBigUInt64BE(BigInt(a / 16), 8);
		const d = crypto.createDecipheriv('aes-128-ctr', key, iv);
		return Buffer.concat([d.update(read(nca.off + a, Math.ceil((pad + len) / 16) * 16)), d.final()]).subarray(pad, pad + len);
	};
	const files = partition(rd, start + Number(fsh.readBigUInt64LE(0x40)));
	return files && { files, read: rd };
};

// NSO dont les segments sont en ZBIC (drapeau 0x80) → même NSO avec des segments non compressés, empreintes vérifiées.
const unpackNso = (nso) => {
	const flags = nso.readUInt32LE(0xc);
	const head = Buffer.from(nso.subarray(0, 0x100));
	const nameOff = nso.readUInt32LE(0x1c), nameSize = nso.readUInt32LE(0x2c);
	const name = nso.subarray(nameOff, nameOff + nameSize);
	const segments = [0, 1, 2].map(s => {
		const fileOff = nso.readUInt32LE(0x10 + s * 0x10), size = nso.readUInt32LE(0x18 + s * 0x10);
		const packed = (flags >> s) & 1;
		const raw = nso.subarray(fileOff, fileOff + (packed ? nso.readUInt32LE(0x60 + s * 4) : size));
		const data = packed ? zbic.decompress(raw, size) : raw;
		const hash = nso.subarray(0xa0 + s * 0x20, 0xc0 + s * 0x20);
		if (data.length !== size || ((flags >> (3 + s)) & 1 && !crypto.createHash('sha256').update(data).digest().equals(hash))) {
			throw new Error('Exécutable du jeu illisible après décompression (fichier abîmé ?).');
		}
		return data;
	});
	let off = 0x100 + nameSize;
	head.writeUInt32LE(flags & 0x38, 0xc);
	head.writeUInt32LE(0x100, 0x1c);
	segments.forEach((data, s) => {
		head.writeUInt32LE(off, 0x10 + s * 0x10);
		head.writeUInt32LE(data.length, 0x60 + s * 4);
		off += data.length;
	});
	return Buffer.concat([head, name, ...segments]);
};

// Examine un jeu Switch et, si unpack est vrai, prépare pour l'émulateur (dossier utilisateur userDir) une copie
// décompressée de ses exécutables ZBIC. keyFiles : prod.keys puis title.keys.
// Renvoie { sdk, zbic } (sdk : version du kit de développement, ex. « 22.2.0 ») et, après préparation, { tid, files, cached }.
const prepare = (file, { userDir, keyFiles, unpack = true }) => {
	if (!/\.(nsp|xci)$/i.test(file)) return { zbic: false };
	const keys = readKeys(keyFiles);
	if (!keys.header_key) return { zbic: false, reason: 'keys' };
	const fd = fs.openSync(file, 'r');
	const read = (pos, len) => { const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, pos); return b; };
	try {
		const list = contents(read, file);
		if (!list) return { zbic: false };
		const titleKeys = {};
		for (const tik of list.filter(e => /\.tik$/i.test(e.name) && e.size >= 0x2c0)) {
			const t = read(tik.off, Math.min(tik.size, 0x400));
			const data = 4 + ({ 0x10000: 0x23c, 0x10001: 0x13c, 0x10002: 0x7c, 0x10003: 0x23c, 0x10004: 0x13c, 0x10005: 0x7c }[t.readUInt32LE(0)] || 0x13c);
			if (t[data + 0x141] === 0) titleKeys[t.toString('hex', data + 0x160, data + 0x170)] = t.subarray(data + 0x40, data + 0x50);
		}
		for (const nca of list.filter(e => /\.nca$/i.test(e.name) && !/\.cnmt\.nca$/i.test(e.name))) {
			const h = ncaHeader(read, nca.off, keys.header_key);
			if (!h || h[0x205] !== 0) continue;
			const sdk = `${h[0x21f]}.${h[0x21e]}.${h[0x21d]}`;
			const tid = h.readBigUInt64LE(0x210).toString(16).toUpperCase().padStart(16, '0');
			const key = ncaKey(h, keys, titleKeys);
			if (!key) return { sdk, tid, zbic: false, reason: 'keys' };
			const exefs = exefsOf(read, nca, h, key);
			if (!exefs) return { sdk, tid, zbic: false };
			const packed = exefs.files.filter(e => !/\.npdm$/i.test(e.name) && e.size > 0x100).filter(e => {
				const head = exefs.read(e.off, 0x10);
				return head.toString('latin1', 0, 4) === 'NSO0' && head.readUInt32LE(0xc) & 0x80;
			});
			if (!packed.length || !unpack) return { sdk, tid, zbic: packed.length > 0 };
			const modDir = path.join(userDir, 'load', tid, MOD_NAME);
			const stat = fs.statSync(file);
			const stamp = { format: FORMAT, source: path.basename(file), size: stat.size, mtimeMs: Math.round(stat.mtimeMs), files: packed.map(e => e.name) };
			const files = stamp.files.map(n => path.join(modDir, 'exefs', n));
			try {
				const old = JSON.parse(fs.readFileSync(path.join(modDir, 'smash-emu.json'), 'utf8'));
				if (JSON.stringify(old) === JSON.stringify(stamp) && files.every(f => fs.existsSync(f))) return { sdk, zbic: true, tid, files: stamp.files, cached: true };
			} catch { /* pas encore préparé */ }
			fs.mkdirSync(path.join(modDir, 'exefs'), { recursive: true });
			packed.forEach((e, i) => {
				fs.writeFileSync(`${files[i]}.tmp`, unpackNso(exefs.read(e.off, e.size)));
				fs.renameSync(`${files[i]}.tmp`, files[i]);
			});
			fs.writeFileSync(path.join(modDir, 'smash-emu.json'), JSON.stringify(stamp));
			return { sdk, zbic: true, tid, files: stamp.files, cached: false };
		}
		return { zbic: false };
	} finally {
		fs.closeSync(fd);
	}
};

// Avertissement affiché au lancement d'un jeu plus récent que ce que l'émulateur choisi sait lancer.
const notice = (info, engine, hasEden) => {
	const major = parseInt(info && info.sdk, 10) || 0;
	const tryEden = engine === 'eden' ? '' : hasEden
		? ' Choisis Eden dans les options de ce jeu : il va plus loin que Citron.'
		: ' Installe Eden (Paramètres → Émulateurs) : il va plus loin que Citron avec ces jeux.';
	if (major >= 22) return `Jeu très récent (kit de développement Nintendo ${info.sdk}, firmware ${major}) : les émulateurs Switch actuels risquent de ne pas le lancer jusqu’au bout (écran « Launching… » ou fermeture).${info.zbic && engine === 'citron' ? ' Smash Emu a déjà décompressé son exécutable (format ZBIC).' : ''}${tryEden}`;
	if (major === 21 && engine === 'citron') return `Jeu récent (kit de développement Nintendo ${info.sdk}) : Citron n’en gère pas encore toutes les fonctions.${tryEden}`;
	return null;
};

module.exports = { prepare, notice, unpackNso, xtsDecrypt, MOD_NAME };
