// Jaquettes et médias des jeux.
//
// Fournisseur : libretro-thumbnails (base communautaire utilisée par RetroArch), un dépôt par console avec trois
// types d'images nommées selon les noms No-Intro / Redump : boîte (Named_Boxarts), écran titre (Named_Titles),
// capture (Named_Snaps). La liste d'une console est récupérée une fois (API GitHub) et mise en cache 7 jours ;
// les images ne sont téléchargées que sur choix de l'utilisateur, et gardées avec le jeu (source et date notées).
// Rien n'est choisi en silence : la recherche renvoie des candidats avec un score de confiance.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');

const REPOS = {
	nes: 'Nintendo_-_Nintendo_Entertainment_System', snes: 'Nintendo_-_Super_Nintendo_Entertainment_System', n64: 'Nintendo_-_Nintendo_64',
	gb: 'Nintendo_-_Game_Boy', gbc: 'Nintendo_-_Game_Boy_Color', gba: 'Nintendo_-_Game_Boy_Advance', nds: 'Nintendo_-_Nintendo_DS',
	vb: 'Nintendo_-_Virtual_Boy', gc: 'Nintendo_-_GameCube', wii: 'Nintendo_-_Wii', '3ds': 'Nintendo_-_Nintendo_3DS', wiiu: 'Nintendo_-_Wii_U',
	psx: 'Sony_-_PlayStation', ps2: 'Sony_-_PlayStation_2', psp: 'Sony_-_PlayStation_Portable', ps3: 'Sony_-_PlayStation_3',
	sms: 'Sega_-_Master_System_-_Mark_III', md: 'Sega_-_Mega_Drive_-_Genesis', gg: 'Sega_-_Game_Gear', segacd: 'Sega_-_Mega-CD_-_Sega_CD',
	'32x': 'Sega_-_32X', saturn: 'Sega_-_Saturn', pce: 'NEC_-_PC_Engine_-_TurboGrafx_16', a2600: 'Atari_-_2600', a7800: 'Atari_-_7800',
	lynx: 'Atari_-_Lynx', jaguar: 'Atari_-_Jaguar', '3do': 'The_3DO_Company_-_3DO', xbox: 'Microsoft_-_Xbox', x360: 'Microsoft_-_Xbox_360',
};
const KINDS = { boxart: 'Named_Boxarts', title: 'Named_Titles', snap: 'Named_Snaps' };
const KIND_LABEL = { boxart: 'Boîte', title: 'Écran titre', snap: 'Capture' };
const CACHE_DAYS = 7;
const MAX_IMAGE = 15 * 1024 * 1024;
const HEADERS = { 'User-Agent': 'SmashEmu (jaquettes ; https://github.com/youssefhassani3005-oss/smash-emu)', Accept: 'application/vnd.github+json' };

const cacheFile = repo => path.join(store.CACHE_DIR, 'covers', `${repo}.json`);

// Noms disponibles pour une console : { boxart: [...], title: [...], snap: [...] }.
const listing = async (system) => {
	const repo = REPOS[system];
	if (!repo) throw new Error('Pas de base de jaquettes pour cette console.');
	const file = cacheFile(repo);
	try {
		const c = JSON.parse(fs.readFileSync(file, 'utf8'));
		if (Date.now() - c.fetchedAt < CACHE_DAYS * 86400000) return c;
	} catch { /* pas de cache */ }
	let res;
	try { res = await fetch(`https://api.github.com/repos/libretro-thumbnails/${repo}/git/trees/master?recursive=1`, { headers: HEADERS, signal: AbortSignal.timeout(30000) }); } catch { throw new Error('Base de jaquettes injoignable (connexion Internet ?).'); }
	if (res.status === 403) throw new Error('Trop de recherches en une heure (limite de GitHub) : réessaie un peu plus tard.');
	if (!res.ok) throw new Error(`Base de jaquettes : réponse ${res.status}.`);
	const data = await res.json();
	const out = { repo, fetchedAt: Date.now(), boxart: [], title: [], snap: [] };
	for (const e of data.tree || []) {
		if (e.type !== 'blob' || !e.path.endsWith('.png')) continue;
		const [dir, ...rest] = e.path.split('/');
		const kind = Object.keys(KINDS).find(k => KINDS[k] === dir);
		if (kind && rest.length === 1) out[kind].push(rest[0].slice(0, -4));
	}
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, JSON.stringify(out));
	return out;
};

// ---------- Correspondance ----------

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const base = s => norm(s).replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/^(the)\s+|,\s*the\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const tags = s => (String(s).match(/\(([^)]+)\)/g) || []).map(t => t.slice(1, -1));
const tokens = s => new Set(base(s).split(' ').filter(Boolean));

// Région d'après les étiquettes « (USA) », « (US 1.2) », « (Europe) (En,Fr,De) »…
const REGION_ALIASES = [['usa', /\b(usa|us|ntsc-u)\b/], ['europe', /\b(europe|eur|pal|eu)\b/], ['japan', /\b(japan|jpn|jp|ntsc-j)\b/], ['france', /\b(france|fr)\b/], ['germany', /\b(germany|de)\b/], ['world', /\bworld\b/]];
const regionOf = (s) => {
	for (const t of tags(s).map(norm)) for (const [r, re] of REGION_ALIASES) if (re.test(t)) return r;
	return null;
};

// Score 0-100 : mots du titre en commun (Jaccard), titre identique, même région ; versions de test pénalisées.
const score = (query, name) => {
	const a = tokens(query);
	const b = tokens(name);
	if (!a.size || !b.size) return 0;
	let common = 0;
	for (const t of a) if (b.has(t)) common++;
	let s = (common / (a.size + b.size - common)) * 80;
	if (common === a.size) s += 6;
	if (base(query) === base(name)) s += 8;
	const qr = regionOf(query);
	if (qr && regionOf(name) === qr) s += 8;
	const nt = tags(name).map(norm);
	if (nt.some(t => /beta|proto|demo|sample|debug|hack|pirate|kiosk/.test(t))) s -= 18;
	if (nt.some(t => /gamecube|virtual console|collector|switch online|wii/.test(t))) s -= 6;
	return Math.max(0, Math.min(100, Math.round(s)));
};

// Explique ce qui diffère entre le titre cherché et un candidat (région, édition…).
const differences = (query, name) => {
	const q = tags(query).map(norm);
	const n = tags(name);
	const qr = regionOf(query);
	const extra = n.filter(t => !q.includes(norm(t)) && !(qr && regionOf(`(${t})`) === qr));
	const diffs = [];
	if (base(query) !== base(name)) diffs.push('titre différent');
	if (extra.length) diffs.push(extra.join(', '));
	return diffs;
};

const urlFor = (repo, kind, name) => `https://raw.githubusercontent.com/libretro-thumbnails/${repo}/master/${KINDS[kind]}/${encodeURIComponent(name)}.png`;

// Plusieurs titres possibles (nom reconnu, titre de la cartouche, nom de l'instance) : le meilleur score compte.
const search = async (system, queries, limit = 12) => {
	const l = await listing(system);
	const list = (Array.isArray(queries) ? queries : [queries]).filter(Boolean).map(String);
	const names = new Set([...l.boxart, ...l.title, ...l.snap]);
	const query = list[0] || '';
	const results = [...names].map(name => ({ name, score: Math.max(...list.map(q => score(q, name))) })).filter(r => r.score >= 20)
		.sort((x, y) => y.score - x.score || x.name.localeCompare(y.name)).slice(0, limit);
	const has = k => new Set(l[k]);
	const sets = { boxart: has('boxart'), title: has('title'), snap: has('snap') };
	return results.map(r => ({
		...r,
		differences: differences(query, r.name),
		media: Object.fromEntries(Object.keys(KINDS).filter(k => sets[k].has(r.name)).map(k => [k, urlFor(l.repo, k, r.name)])),
	}));
};

// ---------- Médias d'une instance ----------

const mediaDir = id => path.join(store.instanceDir(id), 'media');
const metaFile = id => path.join(mediaDir(id), 'media.json');
const readMeta = (id) => { try { return JSON.parse(fs.readFileSync(metaFile(id), 'utf8')) || {}; } catch { return {}; } };
const writeMeta = (id, meta) => { fs.mkdirSync(mediaDir(id), { recursive: true }); fs.writeFileSync(metaFile(id), JSON.stringify(meta, null, 1)); };

const imageType = (buf) => {
	if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return 'png';
	if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
	if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
	return null;
};

// Enregistre une image comme média d'un jeu ; l'ancienne version est gardée pour pouvoir revenir en arrière.
const saveMedia = (id, kind, buf, info) => {
	if (!KINDS[kind]) throw new Error('Type d’image inconnu.');
	const type = imageType(buf);
	if (!type) throw new Error('Ce fichier n’est pas une image PNG, JPEG ou WebP valide.');
	if (buf.length > MAX_IMAGE) throw new Error('Image trop lourde (15 Mo maximum).');
	const dir = mediaDir(id);
	fs.mkdirSync(dir, { recursive: true });
	const meta = readMeta(id);
	const prev = meta[kind];
	if (prev && fs.existsSync(path.join(dir, prev.file))) {
		const prevFile = `${kind}.prev.${prev.file.split('.').pop()}`;
		fs.copyFileSync(path.join(dir, prev.file), path.join(dir, prevFile));
		meta[`${kind}Prev`] = { ...prev, file: prevFile };
		if (prev.file !== `${kind}.${type}`) fs.rmSync(path.join(dir, prev.file), { force: true });
	}
	const file = `${kind}.${type}`;
	fs.writeFileSync(path.join(dir, file), buf);
	meta[kind] = { file, sha1: crypto.createHash('sha1').update(buf).digest('hex'), size: buf.length, at: Date.now(), ...info };
	writeMeta(id, meta);
	if (kind === 'boxart') store.updateInstance(id, { coverFile: path.join(dir, file), coverAt: meta[kind].at });
	return info;
};

const download = async (id, system, name, kinds = ['boxart', 'title', 'snap']) => {
	const l = await listing(system);
	const done = [];
	for (const kind of kinds) {
		if (!KINDS[kind] || !l[kind].includes(name)) continue;
		const url = urlFor(l.repo, kind, name);
		const res = await fetch(url, { headers: { 'User-Agent': HEADERS['User-Agent'] }, signal: AbortSignal.timeout(30000) });
		if (!res.ok) continue;
		const buf = Buffer.from(await res.arrayBuffer());
		saveMedia(id, kind, buf, { source: 'libretro-thumbnails', name, url, custom: false });
		done.push(kind);
	}
	if (!done.length) throw new Error('Aucune image téléchargée pour ce jeu.');
	return info(id);
};

const importFile = (id, kind, file) => {
	const st = fs.statSync(file);
	if (!st.isFile() || st.size > MAX_IMAGE) throw new Error('Fichier invalide ou trop lourd (15 Mo maximum).');
	saveMedia(id, kind, fs.readFileSync(file), { source: 'importée', name: path.basename(file), custom: true });
	return info(id);
};

const restore = (id, kind) => {
	const meta = readMeta(id);
	const prev = meta[`${kind}Prev`];
	if (!prev) throw new Error('Pas de version précédente.');
	const buf = fs.readFileSync(path.join(mediaDir(id), prev.file));
	const { file: _f, sha1: _s, size: _z, at: _a, ...rest } = prev;
	saveMedia(id, kind, buf, rest);
	return info(id);
};

const remove = (id, kind) => {
	const meta = readMeta(id);
	if (meta[kind]) fs.rmSync(path.join(mediaDir(id), meta[kind].file), { force: true });
	delete meta[kind];
	writeMeta(id, meta);
	if (kind === 'boxart') store.updateInstance(id, { coverFile: null, coverAt: null });
	return info(id);
};

// ---------- Fond d'écran d'un jeu ----------
// Six images au choix : écrans titres, captures et boîtes des versions du jeu les plus proches (régions, éditions).

const backgrounds = async (system, queries, limit = 6) => {
	const found = await search(system, queries, 8);
	const out = [];
	const seen = new Set();
	for (const kind of ['title', 'snap', 'boxart']) {
		for (const r of found.filter(x => x.score >= 55)) {
			const url = r.media[kind];
			if (!url || seen.has(url)) continue;
			seen.add(url);
			out.push({ url, kind, label: KIND_LABEL[kind], name: r.name });
		}
	}
	// Une image de chaque sorte d'abord, puis le reste.
	const order = [...out.filter((x, i) => out.findIndex(y => y.kind === x.kind) === i), ...out.filter((x, i) => out.findIndex(y => y.kind === x.kind) !== i)];
	return order.slice(0, limit);
};

const setBackground = async (id, url) => {
	if (!/^https:\/\/raw\.githubusercontent\.com\/libretro-thumbnails\//.test(String(url))) throw new Error('Adresse d’image inattendue.');
	const res = await fetch(url, { headers: { 'User-Agent': HEADERS['User-Agent'] }, signal: AbortSignal.timeout(30000) });
	if (!res.ok) throw new Error(`Image indisponible (${res.status}).`);
	return saveBackground(id, Buffer.from(await res.arrayBuffer()));
};

const saveBackground = (id, buf) => {
	const type = imageType(buf);
	if (!type) throw new Error('Ce fichier n’est pas une image PNG, JPEG ou WebP valide.');
	if (buf.length > MAX_IMAGE) throw new Error('Image trop lourde (15 Mo maximum).');
	const dir = mediaDir(id);
	fs.mkdirSync(dir, { recursive: true });
	for (const f of fs.readdirSync(dir)) if (/^background\./.test(f)) fs.rmSync(path.join(dir, f), { force: true });
	const file = path.join(dir, `background.${type}`);
	fs.writeFileSync(file, buf);
	store.updateInstance(id, { bgFile: file, bgAt: Date.now() });
	return { bgFile: file };
};

const importBackground = (id, file) => {
	const st = fs.statSync(file);
	if (!st.isFile() || st.size > MAX_IMAGE) throw new Error('Fichier invalide ou trop lourd (15 Mo maximum).');
	return saveBackground(id, fs.readFileSync(file));
};

const removeBackground = (id) => {
	const inst = store.getInstance(id);
	if (inst && inst.bgFile) fs.rmSync(inst.bgFile, { force: true });
	store.updateInstance(id, { bgFile: null, bgAt: null });
	return { bgFile: null };
};

const info = (id) => {
	const meta = readMeta(id);
	const out = {};
	for (const kind of Object.keys(KINDS)) {
		const m = meta[kind];
		if (m && fs.existsSync(path.join(mediaDir(id), m.file))) out[kind] = { ...m, path: path.join(mediaDir(id), m.file), hasPrev: !!meta[`${kind}Prev`] };
		else if (meta[`${kind}Prev`]) out[kind] = { hasPrev: true };
	}
	return out;
};

module.exports = { REPOS, KINDS, KIND_LABEL, listing, search, score, differences, download, importFile, restore, remove, info, imageType, backgrounds, setBackground, importBackground, removeBackground };
