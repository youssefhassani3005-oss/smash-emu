// Mods suggérés pour une ROM : archives de hacks par jeu (archive.org), compatibilité vérifiée par CRC.
// Un patch BPS se termine par le CRC32 de la ROM source attendue : 12 octets lus en requête partielle
// suffisent pour savoir s'il s'applique exactement à la ROM de l'utilisateur.
const fs = require('fs');
const path = require('path');
const store = require('./store');
const romlib = require('./romlib');
const rom = require('./rom');

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SmashEmu/2.0' };
const CACHE = () => path.join(store.CACHE_DIR, 'suggest');
const DAY = 86400000;
const PAGE = 20;

const readCache = (name, maxAge) => {
	try {
		const file = path.join(CACHE(), name);
		if (maxAge && Date.now() - fs.statSync(file).mtimeMs > maxAge) return null;
		return JSON.parse(fs.readFileSync(file, 'utf8'));
	} catch { return null; }
};
const writeCache = (name, data) => {
	fs.mkdirSync(CACHE(), { recursive: true });
	fs.writeFileSync(path.join(CACHE(), name), JSON.stringify(data));
};

const getJson = async (url) => {
	const res = await fetch(url, { headers: UA });
	if (!res.ok) throw new Error(`${res.status} ${url}`);
	return res.json();
};

const downloadUrl = (archiveId, file) => `https://archive.org/download/${archiveId}/${file.split('/').map(encodeURIComponent).join('/')}`;

// ---------- Archives de hacks pour un jeu ----------

// Mots significatifs d'un titre (les nombres comptent : « Stadium 2 » ≠ « Stadium »).
const titleWords = name => (name.replace(/\(.*?\)|\[.*?\]/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z]{3,}|\d+/g) || []).filter(w => w !== '64');
// Clé de comparaison complète d'un nom de hack (pour la popularité).
const nameKey = name => (name.replace(/\(.*?\)|\[.*?\]/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z0-9]+/g) || []).join(' ');

// Archive « <code jeu>-n64 », sinon recherche par titre parmi les « Hack Archive ».
const archivesFor = async (lib) => {
	const key = `archives-${lib.id}.json`;
	const cached = readCache(key, 7 * DAY);
	if (cached) return cached;
	const found = [];
	const code = (lib.info.gameCode || '').toLowerCase();
	if (/^[a-z0-9]{4}$/.test(code)) {
		const meta = await getJson(`https://archive.org/metadata/${code}-n64`).catch(() => ({}));
		if (meta.files) found.push({ id: `${code}-n64`, title: meta.metadata.title });
	}
	if (!found.length) {
		const words = titleWords(lib.name).filter(w => !['the', 'and'].includes(w)).slice(0, 4);
		if (words.length) {
			const q = `title:("Hack Archive") AND ${words.map(w => `title:(${w})`).join(' AND ')}`;
			const r = await getJson(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier&fl[]=title&rows=5&output=json`).catch(() => null);
			// Le titre de l'archive doit contenir tous les mots du jeu, et pas d'autre numéro (Stadium ≠ Stadium 2).
			for (const d of (r && r.response.docs) || []) {
				const t = titleWords(d.title.replace(/hack archive/i, ''));
				if (/-n64$/.test(d.identifier) && words.every(w => t.includes(w)) && t.filter(w => /^\d+$/.test(w)).every(n => words.includes(n))) found.push({ id: d.identifier, title: d.title });
			}
		}
	}
	writeCache(key, found);
	return found;
};

// Regroupe les fichiers de patch par hack (plusieurs versions d'un même hack = une entrée).
const hackName = (file) => {
	const base = path.posix.basename(file).replace(/\.(bps|ips)$/i, '');
	let rest = base.replace(/^[A-Z0-9]{4} - /, '').trim();
	const tags = [];
	let m;
	// Étiquettes finales : « (V1.0.2) [EN] » → version et langue.
	while ((m = rest.match(/\s*[([]([^)\]]*)[)\]]\s*$/))) { tags.unshift(m[1].trim()); rest = rest.slice(0, m.index).trim(); }
	return { name: rest || base, variant: tags.join(' · ') };
};

const patchesFor = async (lib) => {
	const key = `patches-${lib.id}.json`;
	const cached = readCache(key, DAY);
	if (cached) return cached;
	const groups = new Map();
	for (const a of await archivesFor(lib)) {
		const meta = await getJson(`https://archive.org/metadata/${a.id}`);
		for (const f of meta.files || []) {
			const kind = (f.name.match(/\.(bps|ips)$/i) || [])[1];
			if (!kind) continue;
			const { name, variant } = hackName(f.name);
			const gkey = `${a.id}:${name.toLowerCase()}`;
			if (!groups.has(gkey)) groups.set(gkey, { key: gkey, name, archiveId: a.id, archiveTitle: a.title, versions: [] });
			groups.get(gkey).versions.push({ file: f.name, variant, kind: kind.toLowerCase(), size: +f.size || 0 });
		}
	}
	const list = [...groups.values()].map(g => ({ ...g, versions: g.versions.sort((x, y) => y.variant.localeCompare(x.variant, undefined, { numeric: true })) }));
	writeCache(key, list);
	return list;
};

// Popularité (Super Mario 64 uniquement) : classement par téléchargements de SMW Central.
const popularity = async (lib) => {
	if (lib.info.gameCode !== 'NSME') return {};
	const cached = readCache('popular-nsme.json', 7 * DAY);
	if (cached) return cached;
	const out = {};
	for (let page = 1; page <= 3; page++) {
		const r = await getJson(`https://www.smwcentral.net/ajax.php?a=getsectionlist&s=sm64hacks&n=${page}&o=downloads&d=desc`).catch(() => null);
		for (const h of (r && r.data) || []) {
			const k = nameKey(h.name);
			if (k && !(k in out)) out[k] = h.downloads;
		}
	}
	writeCache('popular-nsme.json', out);
	return out;
};

// ---------- Vérification ----------

const romCrc = new Map();
const crcOf = (lib) => {
	if (!romCrc.has(lib.id)) romCrc.set(lib.id, rom.crc32(fs.readFileSync(lib.path)));
	return romCrc.get(lib.id);
};

const verifyCache = () => readCache('verify.json') || {};

// BPS : CRC de la ROM source dans les 12 derniers octets. IPS : aucun contrôle possible.
const verifyOne = async (lib, archiveId, v, cache) => {
	const ck = `${archiveId}/${v.file}`;
	if (v.kind !== 'bps') return { status: 'unverified' };
	let source = cache[ck];
	if (source === undefined) {
		const res = await fetch(downloadUrl(archiveId, v.file), { headers: { ...UA, Range: 'bytes=-12' } });
		if (!res.ok) return { status: 'error' };
		const tail = Buffer.from(await res.arrayBuffer());
		if (tail.length < 12) return { status: 'error' };
		source = tail.readUInt32LE(tail.length - 12);
		cache[ck] = source;
	}
	return { status: source === crcOf(lib) ? 'compatible' : 'incompatible', sourceCrc: source.toString(16).padStart(8, '0') };
};

const pool = async (items, n, fn) => {
	let i = 0;
	await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
		while (i < items.length) { const k = i++; await fn(items[k], k); }
	}));
};

// Liste paginée ; les versions affichées sont vérifiées (8 requêtes en parallèle).
const list = async (romId, { q = '', page = 1, showIncompatible = false } = {}) => {
	const lib = romlib.get(romId);
	const [all, pop] = await Promise.all([patchesFor(lib), popularity(lib)]);
	const needle = q.trim().toLowerCase();
	let items = all.filter(h => !needle || h.name.toLowerCase().includes(needle));
	for (const h of items) h.downloads = pop[nameKey(h.name)] || 0;
	items.sort((a, b) => b.downloads - a.downloads || a.name.localeCompare(b.name));

	const total = items.length;
	const pages = Math.max(1, Math.ceil(total / PAGE));
	const slice = items.slice((page - 1) * PAGE, page * PAGE).map(h => ({ ...h, versions: h.versions.map(v => ({ ...v })) }));
	const cache = verifyCache();
	const checks = slice.flatMap(h => h.versions.slice(0, 6).map(v => ({ h, v })));
	await pool(checks, 8, async ({ h, v }) => {
		Object.assign(v, await verifyOne(lib, h.archiveId, v, cache).catch(() => ({ status: 'error' })));
	});
	writeCache('verify.json', cache);

	for (const h of slice) {
		const order = { compatible: 0, unverified: 1, error: 2, incompatible: 3 };
		h.versions.sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4));
		h.status = h.versions[0] ? h.versions[0].status : 'error';
	}
	const visible = showIncompatible ? slice : slice.filter(h => h.status !== 'incompatible');
	return {
		rom: { id: lib.id, name: lib.name, crc: crcOf(lib).toString(16).padStart(8, '0'), gameCode: lib.info.gameCode },
		archives: await archivesFor(lib),
		items: visible,
		hidden: slice.length - visible.length,
		total,
		page,
		pages,
	};
};

// Télécharge le patch et revérifie sur le fichier complet avant l'installation.
const download = async (romId, archiveId, file, onProgress) => {
	const lib = romlib.get(romId);
	const res = await fetch(downloadUrl(archiveId, file), { headers: UA });
	if (!res.ok) throw new Error(`Téléchargement impossible (${res.status}).`);
	const total = +res.headers.get('content-length') || 0;
	const parts = [];
	let received = 0;
	for await (const chunk of res.body) {
		parts.push(Buffer.from(chunk));
		received += chunk.length;
		if (onProgress) onProgress({ received, total });
	}
	const data = Buffer.concat(parts);
	const name = path.posix.basename(file);
	if (/\.bps$/i.test(name)) {
		if (data.toString('ascii', 0, 4) !== 'BPS1') throw new Error('Fichier de patch invalide.');
		if (data.readUInt32LE(data.length - 12) !== crcOf(lib)) throw new Error('Ce patch ne correspond pas à ta ROM (CRC différent).');
	} else {
		// IPS : pas de somme de contrôle, on vérifie au moins qu'il s'applique sans erreur à la ROM.
		rom.applyIps(fs.readFileSync(lib.path), data);
	}
	return { name, data, lib };
};

module.exports = { list, download, crcOf };
