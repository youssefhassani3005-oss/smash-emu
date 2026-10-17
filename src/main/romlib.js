// Bibliothèque de jeux toutes consoles : import (fichier, zip, image disque), identification,
// dédoublonnage et détection dans les téléchargements.
// Les cartouches (≤ 64 Mo) sont copiées dans Documents\Smash Emu\roms ; les images disque restent
// à leur emplacement (référencées) pour ne pas dupliquer plusieurs Go.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const store = require('./store');
const rom = require('./rom');
const systems = require('./systems');

const INDEX = () => path.join(store.ROMS_DIR, 'index.json');
const COPY_MAX = 64 * 1024 * 1024;
const MAX_ZIP = 1.5 * 1024 * 1024 * 1024;

const readIndex = () => store.readJson(INDEX(), []).map(r => ({ system: 'n64', ...r }));
const writeIndex = list => store.writeJson(INDEX(), list);

const extOf = n => path.extname(n).slice(1).toLowerCase();

// « Legend of Zelda, The - Ocarina of Time (U) (V1.2) [!] » → « The Legend of Zelda - Ocarina of Time (V1.2) »
const prettyName = (fileName) => {
	let n = fileName.replace(/\.[^.]+$/, '').replace(/\[[^\]]*\]/g, '').replace(/\((?:U|USA|E|Europe|J|Japan|UE|JU|EU|En,Fr,De|Fr)\)/gi, '');
	n = n.replace(/^(.+?), The\b/i, 'The $1').replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim();
	return n || fileName;
};

// ---------- En-têtes de cartouches : validation et titre ----------

const printable = b => b.toString('latin1').replace(/[^\x20-\x7e]/g, '').trim();
const NINTENDO_LOGO_GB = Buffer.from('ceed6666cc0d000b03730083000c000d0008111f8889000edccc6ee6ddddd999bbbb67636e0eecccdddc999fbbb9333e', 'hex');

// Renvoie null si le contenu ne correspond pas à la console (ex. README.md pris pour une ROM Mega Drive).
const cartInfo = (system, buf, ext = '') => {
	switch (system) {
	case 'n64': return rom.romInfo(buf);
	case 'nes': return buf.toString('latin1', 0, 4) === 'NES\x1a' || buf.toString('latin1', 0, 4) === 'FDS\x1a' || buf[0] === 0x01 ? {} : null;
	case 'gb': case 'gbc':
		if (buf.length < 0x150 || !buf.subarray(0x104, 0x134).equals(NINTENDO_LOGO_GB)) return null;
		return { title: printable(buf.subarray(0x134, 0x143)) };
	case 'gba':
		if (buf.length < 0xc0 || buf[0xb2] !== 0x96) return null;
		return { title: printable(buf.subarray(0xa0, 0xac)), gameCode: printable(buf.subarray(0xac, 0xb0)) };
	case 'nds':
		if (buf.length < 0x200) return null;
		return { title: printable(buf.subarray(0, 12)), gameCode: printable(buf.subarray(0x0c, 0x10)) };
	case 'md':
		// En-tête « SEGA » à 0x100 ; les dumps .smd entrelacés n'en ont pas de lisible.
		if (buf.length > 0x110 && /SEGA/.test(buf.toString('latin1', 0x100, 0x110))) return { title: printable(buf.subarray(0x150, 0x180)) };
		return ext === 'md' ? null : {};
	case 'snes': {
		for (const off of [0x7fc0, 0xffc0, 0x81c0, 0x101c0]) {
			if (buf.length < off + 0x20) continue;
			const t = printable(buf.subarray(off, off + 21));
			const ck = buf.readUInt16LE(off + 0x1c) ^ buf.readUInt16LE(off + 0x1e);
			if (t.length >= 3 && ck === 0xffff) return { title: t };
		}
		return {};
	}
	default: return {};
	}
};

// Identifiant stable : MD5 pour les fichiers raisonnables, empreinte partielle pour les images disque.
const fileId = (file, size) => {
	if (size <= COPY_MAX) return crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
	const fd = fs.openSync(file, 'r');
	try {
		const chunk = 4 * 1024 * 1024;
		const h = crypto.createHash('sha1').update(String(size));
		for (const pos of [0, Math.max(0, size - chunk)]) {
			const b = Buffer.alloc(Math.min(chunk, size));
			fs.readSync(fd, b, 0, b.length, pos);
			h.update(b);
		}
		return h.digest('hex').slice(0, 32);
	} finally { fs.closeSync(fd); }
};

// ---------- Index ----------

const romPath = r => r.linked || path.join(store.ROMS_DIR, r.file);

const list = () => readIndex()
	.filter(r => fs.existsSync(romPath(r)))
	.sort((a, b) => a.name.localeCompare(b.name));

const get = (id) => {
	const r = readIndex().find(x => x.id === id);
	if (!r) throw new Error('Jeu introuvable dans la bibliothèque.');
	return { ...r, path: romPath(r) };
};

const remember = (existing, source, index) => {
	if (source && !(existing.sources || []).includes(source)) {
		existing.sources = [...(existing.sources || []), source];
		writeIndex(index);
	}
	return { ...existing, duplicate: true };
};

// Ajoute un fichier déjà présent sur le disque. N64 : conversion en .z64 et identifiant MD5 (comme avant).
const addFile = (file, { source = null, displayName = null, forceSystem = null } = {}) => {
	const st = fs.statSync(file);
	const ext = extOf(file);
	const det = forceSystem ? { system: forceSystem, sure: true, candidates: [forceSystem] } : systems.detect(file);
	if (!det.system && !det.candidates.length) return null;
	const system = det.system || det.candidates[0];
	const fileName = displayName || path.basename(file);
	const index = readIndex();
	store.ensureDirs();

	if (system === 'n64') {
		const raw = fs.readFileSync(file);
		const info = rom.romInfo(raw);
		if (!info) return null;
		const existing = index.find(r => r.id === info.md5);
		if (existing) return remember(existing, source, index);
		const rel = `${info.md5}.z64`;
		fs.writeFileSync(path.join(store.ROMS_DIR, rel), rom.toZ64(raw));
		const entry = { id: info.md5, system, name: info.known || prettyName(fileName), file: rel, originalName: fileName, info, addedAt: Date.now(), sources: source ? [source] : [] };
		writeIndex([...index, entry]);
		return entry;
	}

	const disc = st.size > COPY_MAX || ['cue', 'chd', 'iso', 'bin', 'img', 'cso', 'rvz', 'gcz', 'wbfs', 'wua', 'wux', 'wud', 'nsp', 'xci', 'pkg', 'xiso', 'pbp', 'm3u', 'ccd'].includes(ext);
	let info = {};
	if (!disc) {
		const buf = fs.readFileSync(file);
		const ci = cartInfo(system, buf, ext);
		if (ci === null) return null;
		info = ci;
	}
	const id = fileId(file, st.size);
	const existing = index.find(r => r.id === id);
	if (existing) return remember(existing, source, index);

	const entry = {
		id,
		system,
		name: prettyName(fileName),
		originalName: fileName,
		info: { ...info, size: st.size, region: (fileName.match(/\((USA|U|Europe|E|Japan|J|France|F|World)\)/i) || [])[1] || '', md5: id },
		needsSystem: !det.sure && det.candidates.length > 1 ? det.candidates : null,
		addedAt: Date.now(),
		sources: source ? [source] : [],
	};
	if (disc) {
		entry.linked = file;
	} else {
		const rel = path.join(system, `${id}.${ext}`);
		fs.mkdirSync(path.join(store.ROMS_DIR, system), { recursive: true });
		fs.copyFileSync(file, path.join(store.ROMS_DIR, rel));
		entry.file = rel;
	}
	writeIndex([...index, entry]);
	return entry;
};

// Fichier principal d'un jeu sur disque parmi plusieurs (cue > m3u > chd > iso > bin…).
const MAIN_DISC = ['m3u', 'cue', 'chd', 'pbp', 'iso', 'cso', 'gcm', 'rvz', 'wbfs', 'img', 'bin'];

// Contenu d'un zip qui ressemble à des jeux (les .bin seuls ne comptent qu'accompagnés d'un .cue ou volumineux).
const gameEntries = (entries) => {
	const supported = new Set(systems.supportedExtensions());
	const files = entries.filter(e => !e.isDirectory);
	const hasCue = files.some(e => /\.cue$/i.test(e.entryName));
	return files.filter((e) => {
		const ext = extOf(e.entryName);
		if (!supported.has(ext)) return false;
		if (ext === 'bin') return hasCue || e.header.size > 20 * 1024 * 1024;
		if (ext === 'md') return e.header.size > 64 * 1024; // pas les README.md
		return true;
	});
};

// Un zip de jeu sur disque est extrait dans roms\discs\<nom>, puis son fichier principal est référencé.
const importZip = (zipFile, source) => {
	const zip = new AdmZip(zipFile);
	const games = gameEntries(zip.getEntries());
	if (!games.length) throw new Error(`« ${path.basename(zipFile)} » ne contient aucun jeu reconnu.`);
	const out = [];
	const tmp = path.join(store.CACHE_DIR, `import-${Date.now()}`);
	const discs = games.filter(e => !/\.(z64|v64|n64|nes|sfc|smc|gb|gbc|gba|nds|sms|md|gen|gg|pce|a26|a78|lnx|vb|32x|j64)$/i.test(e.entryName));
	try {
		for (const e of games.filter(g => !discs.includes(g))) {
			const f = path.join(tmp, path.basename(e.entryName));
			fs.mkdirSync(tmp, { recursive: true });
			fs.writeFileSync(f, e.getData());
			const r = addFile(f, { source, displayName: path.basename(e.entryName) });
			if (r) out.push(r);
		}
	} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
	if (discs.length) {
		const dir = path.join(store.ROMS_DIR, 'discs', path.basename(zipFile).replace(/\.zip$/i, '').replace(/[<>:"/\\|?*]/g, '_'));
		fs.mkdirSync(dir, { recursive: true });
		zip.extractAllTo(dir, true);
		const main = MAIN_DISC.map(x => discs.find(e => extOf(e.entryName) === x)).find(Boolean);
		const r = addFile(path.join(dir, main.entryName), { source });
		if (r) out.push(r);
	}
	if (!out.length) throw new Error(`« ${path.basename(zipFile)} » ne contient aucun jeu reconnu.`);
	return out;
};

// Importe un fichier (jeu, image disque ou zip). Renvoie les jeux ajoutés ou déjà présents.
const importFile = (file) => {
	if (/\.zip$/i.test(file)) {
		if (fs.statSync(file).size > MAX_ZIP) throw new Error('Archive trop volumineuse : décompresse-la d’abord, puis importe le jeu.');
		return importZip(file, file);
	}
	const r = addFile(file, { source: file });
	if (!r) throw new Error(`« ${path.basename(file)} » n’est pas un jeu reconnu.`);
	return [r];
};

// Import depuis des octets (tests, téléchargements) : écrit un fichier temporaire puis l'importe.
const importData = (fileName, data, source = null) => {
	const tmp = path.join(store.CACHE_DIR, `import-${Date.now()}-${path.basename(fileName)}`);
	fs.mkdirSync(store.CACHE_DIR, { recursive: true });
	fs.writeFileSync(tmp, data);
	try {
		if (/\.zip$/i.test(fileName)) return importZip(tmp, source);
		const r = addFile(tmp, { source, displayName: fileName });
		if (!r) throw new Error(`« ${fileName} » n’est pas un jeu reconnu.`);
		return [r];
	} finally { fs.rmSync(tmp, { force: true }); }
};

const update = (id, fn) => {
	const index = readIndex();
	const r = index.find(x => x.id === id);
	if (!r) throw new Error('Jeu introuvable.');
	fn(r);
	writeIndex(index);
	return r;
};

const rename = (id, name) => update(id, (r) => { r.name = String(name).trim() || r.name; });

const setSystem = (id, system) => {
	if (!systems.SYSTEMS[system]) throw new Error('Console inconnue.');
	return update(id, (r) => {
		if (r.file && !r.linked) {
			// Fichier copié : on le range dans le dossier de sa console.
			const rel = path.join(system, path.basename(r.file));
			fs.mkdirSync(path.join(store.ROMS_DIR, system), { recursive: true });
			fs.renameSync(path.join(store.ROMS_DIR, r.file), path.join(store.ROMS_DIR, rel));
			r.file = rel;
		}
		r.system = system;
		r.needsSystem = null;
	});
};

const remove = (id) => {
	const index = readIndex();
	const r = index.find(x => x.id === id);
	if (!r) return;
	if (r.file && !r.linked) fs.rmSync(path.join(store.ROMS_DIR, r.file), { force: true });
	// Disque extrait d'un zip par Smash Emu : on supprime aussi le dossier.
	if (r.linked && r.linked.startsWith(path.join(store.ROMS_DIR, 'discs') + path.sep)) fs.rmSync(path.dirname(r.linked), { recursive: true, force: true });
	writeIndex(index.filter(x => x.id !== id));
};

// ---------- Détection dans les téléchargements ----------

const zipCache = new Map(); // chemin -> { mtime, roms: [noms] }

const romsInZipStat = (file, st) => {
	const cached = zipCache.get(file);
	if (cached && cached.mtime === st.mtimeMs) return cached.roms;
	let roms = [];
	try {
		if (st.size <= MAX_ZIP) roms = gameEntries(new AdmZip(file).getEntries()).map(e => path.basename(e.entryName));
	} catch { /* zip illisible */ }
	zipCache.set(file, { mtime: st.mtimeMs, roms });
	return roms;
};

// Noms des jeux contenus dans un zip (vide si ce n'en est pas un ou s'il est illisible).
const romsInZip = (file) => { try { return romsInZipStat(file, fs.statSync(file)); } catch { return []; } };

// Un fichier isolé est proposé seulement si sa console est sûre (pas un .iso de Windows, par exemple).
const looksLikeGame = (file) => {
	const ext = extOf(file);
	if (!systems.supportedExtensions().includes(ext) || ext === 'zip') return false;
	const det = systems.detect(file);
	if (!det.system) return false;
	if (['iso', 'bin', 'img', 'chd'].includes(ext)) return det.sure;
	if (ext === 'md') return false;
	return true;
};

const scan = (dirs) => {
	const index = readIndex();
	const known = new Set(index.flatMap(r => [...(r.sources || []), r.linked].filter(Boolean)));
	// Un jeu déjà importé (même nom de fichier d'origine) n'est plus proposé, même depuis un autre zip.
	const knownNames = new Set(index.map(r => (r.originalName || '').toLowerCase()).filter(Boolean));
	const seen = new Set();
	const found = [];
	for (const dir of [...new Set(dirs.filter(Boolean))]) {
		let names = [];
		try { names = fs.readdirSync(dir); } catch { continue; }
		for (const name of names) {
			const file = path.join(dir, name);
			if (seen.has(file.toLowerCase()) || known.has(file)) continue;
			seen.add(file.toLowerCase());
			const isZip = /\.zip$/i.test(name);
			let st;
			try { st = fs.statSync(file); } catch { continue; }
			if (!st.isFile()) continue;
			const roms = isZip ? romsInZipStat(file, st) : (looksLikeGame(file) ? [name] : []);
			if (roms.length && !roms.every(r => knownNames.has(r.toLowerCase()))) {
				found.push({ path: file, name, size: st.size, mtime: st.mtimeMs, roms, system: isZip ? null : systems.detect(file).system });
			}
		}
	}
	return found.sort((a, b) => b.mtime - a.mtime).slice(0, 60);
};

// Le fichier (jeu ou zip) est-il déjà dans la bibliothèque ?
const alreadyImported = (file) => {
	const index = readIndex();
	if (index.some(r => (r.sources || []).includes(file) || r.linked === file)) return true;
	const names = new Set(index.map(r => (r.originalName || '').toLowerCase()));
	const roms = /\.zip$/i.test(file) ? romsInZip(file) : [path.basename(file)];
	return roms.length > 0 && roms.every(r => names.has(r.toLowerCase()));
};

const isGameFile = file => (/\.zip$/i.test(file) ? romsInZip(file).length > 0 : looksLikeGame(file));

const defaultScanDirs = () => [path.join(os.homedir(), 'Downloads'), path.join(os.homedir(), 'Downloads', 'ROMs N64'), path.join(os.homedir(), 'Desktop')];

module.exports = { list, get, importData, importFile, rename, setSystem, remove, scan, romsInZip, isGameFile, alreadyImported, defaultScanDirs, prettyName, cartInfo };
