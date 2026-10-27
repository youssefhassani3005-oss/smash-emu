// RetroAchievements : succès des jeux rétro, lus avec l'API web officielle (nom d'utilisateur + clé d'API web du
// joueur). Les jeux à cartouche sont reconnus par l'empreinte de leur fichier, calculée comme RetroAchievements
// (docs.retroachievements.org, « Game Identification ») ; les autres par leur titre, à confirmer.
// Les succès se débloquent dans les émulateurs approuvés par RetroAchievements (RetroArch, DuckStation, PCSX2,
// PPSSPP, Dolphin) : Smash Emu les affiche et signale les nouveaux pendant la partie.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const secrets = require('./secrets');

const API = 'https://retroachievements.org/API';
const MEDIA = 'https://media.retroachievements.org';
const CACHE = path.join(store.CACHE_DIR, 'retroachievements');
const UA = () => `SmashEmu/${(() => { try { return require('../../package.json').version; } catch { return '0'; } })()}`;

// Console Smash Emu → identifiant RetroAchievements, et façon de reconnaître ses jeux.
const CONSOLES = {
	md: { id: 1, hash: 'md5' }, n64: { id: 2, hash: 'n64' }, snes: { id: 3, hash: 'snes' }, gb: { id: 4, hash: 'md5' },
	gba: { id: 5, hash: 'md5' }, gbc: { id: 6, hash: 'md5' }, nes: { id: 7, hash: 'nes' }, pce: { id: 8, hash: 'pce' },
	segacd: { id: 9 }, '32x': { id: 10, hash: 'md5' }, sms: { id: 11, hash: 'md5' }, psx: { id: 12 }, lynx: { id: 13, hash: 'lynx' },
	gg: { id: 15, hash: 'md5' }, gc: { id: 16 }, jaguar: { id: 17, hash: 'md5' }, nds: { id: 18, hash: 'nds' }, wii: { id: 19 },
	ps2: { id: 21 }, a2600: { id: 25, hash: 'md5' }, vb: { id: 28, hash: 'md5' }, saturn: { id: 39 }, psp: { id: 41 },
	'3do': { id: 43 }, a7800: { id: 51, hash: 'a7800' },
};
// Émulateurs capables de débloquer les succès (approuvés par RetroAchievements), par console.
const UNLOCKERS = { psx: 'DuckStation', ps2: 'PCSX2', psp: 'PPSSPP', gc: 'Dolphin', wii: 'Dolphin' };

// ---------- Empreintes ----------

const md5 = (...parts) => { const h = crypto.createHash('md5'); for (const p of parts) h.update(p); return h.digest('hex'); };
const startsWith = (buf, bytes) => bytes.every((b, i) => buf[i] === b);

// N64 : l'empreinte est celle de l'image grand-boutiste (.z64) ; .v64 (octets échangés) et .n64 (petit-boutiste) sont
// remis dans cet ordre avant le calcul.
const toZ64 = (buf) => {
	const out = Buffer.from(buf);
	if (startsWith(buf, [0x37, 0x80, 0x40, 0x12])) for (let i = 0; i + 1 < out.length; i += 2) { out[i] = buf[i + 1]; out[i + 1] = buf[i]; }
	else if (startsWith(buf, [0x40, 0x12, 0x37, 0x80])) for (let i = 0; i + 3 < out.length; i += 4) { out[i] = buf[i + 3]; out[i + 1] = buf[i + 2]; out[i + 2] = buf[i + 1]; out[i + 3] = buf[i]; }
	return out;
};

// Nintendo DS : en-tête (0x160 octets), code ARM9, code ARM7, puis bloc icône et titre (0xA00 octets).
const ndsHash = (file) => {
	const fd = fs.openSync(file, 'r');
	const read = (pos, len) => { const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, pos); return b; };
	try {
		let off = 0;
		let head = read(0, 0x200);
		// En-tête de linker SuperCard devant la cartouche.
		if (startsWith(head, [0x2e, 0x00, 0x00, 0xea]) && head[0xb0] === 0x44 && head[0xb1] === 0x46 && head[0xb2] === 0x96 && head[0xb3] === 0) { off = 0x200; head = read(off, 0x200); }
		const u32 = o => head.readUInt32LE(o);
		const [arm9, arm9Size, arm7, arm7Size, icon] = [u32(0x20), u32(0x2c), u32(0x30), u32(0x3c), u32(0x68)];
		if (arm9Size + arm7Size > 16 * 1024 * 1024) return null;
		return md5(head.subarray(0, 0x160), read(off + arm9, arm9Size), read(off + arm7, arm7Size), read(off + icon, 0xa00));
	} finally { fs.closeSync(fd); }
};

const hashFile = (system, file) => {
	const c = CONSOLES[system];
	if (!c || !c.hash || !file || !fs.existsSync(file)) return null;
	if (c.hash === 'nds') return ndsHash(file);
	const buf = fs.readFileSync(file);
	switch (c.hash) {
		case 'n64': return md5(toZ64(buf));
		// NES : en-tête iNES (« NES\x1a ») ou FDS (« FDS\x1a ») de 16 octets ignoré.
		case 'nes': return md5(startsWith(buf, [0x4e, 0x45, 0x53, 0x1a]) || startsWith(buf, [0x46, 0x44, 0x53, 0x1a]) ? buf.subarray(16) : buf);
		// SNES : en-tête de copieur de 512 octets quand la taille dépasse un multiple de 8 Ko de 512 octets.
		case 'snes': return md5(buf.length % 8192 === 512 ? buf.subarray(512) : buf);
		case 'pce': return md5(buf.length % 131072 === 512 ? buf.subarray(512) : buf);
		case 'a7800': return md5(startsWith(buf, [0x01, ...Buffer.from('ATARI7800')]) ? buf.subarray(128) : buf);
		case 'lynx': return md5(startsWith(buf, [...Buffer.from('LYNX'), 0]) ? buf.subarray(64) : buf);
		default: return md5(buf);
	}
};

// ---------- API ----------

const config = () => {
	const s = store.getSettings();
	return { user: s.raUser || '', key: secrets.unseal(s.raKey) };
};
const ready = () => { const c = config(); return !!(c.user && c.key); };

let fetchImpl = (...a) => fetch(...a);
const setFetch = (fn) => { fetchImpl = fn; };

const api = async (endpoint, params = {}) => {
	const c = config();
	if (!c.key) throw new Error('Ajoute ton nom d’utilisateur et ta clé d’API web RetroAchievements (Succès et indices).');
	const q = new URLSearchParams({ ...params, y: c.key });
	const r = await fetchImpl(`${API}/${endpoint}.php?${q}`, { headers: { 'User-Agent': UA() } });
	if (r.status === 401 || r.status === 403) throw new Error('RetroAchievements refuse la clé : vérifie ton nom d’utilisateur et ta clé d’API web.');
	if (!r.ok) throw new Error(`RetroAchievements ne répond pas (${r.status}).`);
	return r.json();
};

const media = p => (!p ? null : /^https?:/.test(p) ? p : `${MEDIA}${p.startsWith('/') ? '' : '/'}${p}`);
const badge = (name, locked) => (name ? `${MEDIA}/Badge/${name}${locked ? '_lock' : ''}.png` : null);

// Liste des jeux d'une console, avec leurs empreintes : gardée une semaine sur le disque (réponse volumineuse).
const gameList = async (consoleId) => {
	const file = path.join(CACHE, `games-${consoleId}.json`);
	try {
		const st = fs.statSync(file);
		if (Date.now() - st.mtimeMs < 7 * 86400000) return JSON.parse(fs.readFileSync(file, 'utf8'));
	} catch { /* pas encore en cache */ }
	const list = (await api('API_GetGameList', { i: consoleId, h: 1, f: 1 })).map(g => ({ id: g.ID, title: g.Title, icon: g.ImageIcon, num: g.NumAchievements, points: g.Points, hashes: (g.Hashes || []).map(h => String(h).toLowerCase()) }));
	fs.mkdirSync(CACHE, { recursive: true });
	fs.writeFileSync(file, JSON.stringify(list));
	return list;
};

// ---------- Reconnaissance des jeux ----------

const systemOf = inst => (inst.type === 'coopdx' ? 'n64' : (inst.rom && inst.rom.system) || inst.system || 'n64');
const romFile = (inst) => {
	if (!inst.rom) return null;
	if (inst.rom.linked) return inst.rom.linked;
	return inst.rom.ext ? path.join(store.instanceDir(inst.id), 'rom', `base.${inst.rom.ext}`) : null;
};

// Titre simplifié pour comparer : sans région, version, article, ponctuation ni accents.
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
	.replace(/\[.*?\]|\(.*?\)|~.*?~/g, ' ').replace(/\b(the|a|an|le|la|les)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const similarity = (a, b) => {
	const x = new Set(norm(a).split(' ').filter(Boolean));
	const y = new Set(norm(b).split(' ').filter(Boolean));
	if (!x.size || !y.size) return 0;
	const inter = [...x].filter(w => y.has(w)).length;
	return norm(a) === norm(b) ? 1 : inter / Math.max(x.size, y.size);
};

const titleOf = (inst) => {
	const info = (inst.rom && inst.rom.info) || {};
	return inst.type === 'coopdx' ? 'Super Mario 64' : info.known || info.title || inst.name;
};

const candidates = async (inst, q = '') => {
	const sys = CONSOLES[systemOf(inst)];
	if (!sys) return [];
	const list = await gameList(sys.id);
	const title = q || titleOf(inst);
	return list.map(g => ({ g, s: similarity(title, g.title) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 8)
		.map(({ g, s }) => ({ id: g.id, title: g.title, icon: media(g.icon), num: g.num, score: Math.round(s * 100) }));
};

const linkOf = inst => inst.raGame || null;

// Jeu RetroAchievements d'une instance : déjà lié, sinon trouvé par empreinte (lié tout seul), sinon par un titre
// identique ; sinon null (au joueur de choisir parmi les candidats).
const identify = async (id) => {
	const inst = store.getInstance(id);
	if (inst.raGame) return inst.raGame;
	const system = systemOf(inst);
	const sys = CONSOLES[system];
	if (!sys) return null;
	const list = await gameList(sys.id);
	let found = null;
	let by = null;
	if (sys.hash) {
		let hash = null;
		try { hash = hashFile(system, romFile(inst)); } catch { /* fichier illisible */ }
		if (hash) { found = list.find(g => g.hashes.includes(hash)); by = 'hash'; }
	}
	if (!found) {
		const exact = list.filter(g => norm(g.title) === norm(titleOf(inst)));
		if (exact.length === 1) { found = exact[0]; by = 'title'; }
	}
	if (!found) return null;
	const link = { id: found.id, title: found.title, icon: media(found.icon), by };
	store.updateInstance(id, { raGame: link });
	return link;
};

const link = async (id, gameId) => {
	if (!gameId) { store.updateInstance(id, { raGame: null }); return null; }
	const inst = store.getInstance(id);
	const sys = CONSOLES[systemOf(inst)];
	const g = sys && (await gameList(sys.id)).find(x => x.id === Number(gameId));
	const out = { id: Number(gameId), title: g ? g.title : `Jeu ${gameId}`, icon: g ? media(g.icon) : null, by: 'manual' };
	store.updateInstance(id, { raGame: out });
	return out;
};

// ---------- Succès et progression ----------

const progressCache = new Map();
const progress = async (id, { fresh = false } = {}) => {
	const inst = store.getInstance(id);
	const g = inst.raGame || await identify(id);
	if (!g) return null;
	const hit = progressCache.get(g.id);
	if (!fresh && hit && Date.now() - hit.at < 30000) return hit.value;
	const r = await api('API_GetGameInfoAndUserProgress', { g: g.id, u: config().user });
	const list = Object.values(r.Achievements || {}).map(a => ({
		id: a.ID, title: a.Title, desc: a.Description, points: a.Points, type: a.type || null,
		earned: a.DateEarned || null, hardcore: a.DateEarnedHardcore || null, order: a.DisplayOrder || 0,
		badge: badge(a.BadgeName), locked: badge(a.BadgeName, true), players: a.NumAwarded || 0,
	})).sort((a, b) => a.order - b.order || a.id - b.id);
	const value = {
		game: { id: r.ID || g.id, title: r.Title || g.title, icon: media(r.ImageIcon) || g.icon, console: r.ConsoleName || '', players: r.NumDistinctPlayers || 0, by: g.by },
		total: list.length, earned: list.filter(a => a.earned).length,
		points: list.reduce((s, a) => s + (a.points || 0), 0), myPoints: list.filter(a => a.earned).reduce((s, a) => s + (a.points || 0), 0),
		completion: r.UserCompletion || '0%', achievements: list,
		unlockers: UNLOCKERS[systemOf(inst)] || 'RetroArch',
	};
	progressCache.set(g.id, { at: Date.now(), value });
	return value;
};

// Succès débloqués depuis la dernière vérification (pendant une partie dans un émulateur approuvé).
const seen = new Map();
const poll = async (id) => {
	const p = await progress(id, { fresh: true });
	if (!p) return [];
	const now = new Set(p.achievements.filter(a => a.earned).map(a => a.id));
	const before = seen.get(id);
	seen.set(id, now);
	if (!before) return [];
	return p.achievements.filter(a => now.has(a.id) && !before.has(a.id));
};

const profile = async () => {
	const c = config();
	const r = await api('API_GetUserProfile', { u: c.user });
	return { user: r.User || c.user, pic: media(r.UserPic), points: r.TotalPoints || 0, softcore: r.TotalSoftcorePoints || 0, truePoints: r.TotalTruePoints || 0, motto: r.Motto || '', presence: r.RichPresenceMsg || '', since: r.MemberSince || '' };
};

const setConfig = async ({ user, key } = {}) => {
	const patch = {};
	if (user !== undefined) patch.raUser = String(user || '').trim().slice(0, 40);
	if (key !== undefined) {
		const k = String(key || '').trim();
		if (k && !/^[A-Za-z0-9]{16,64}$/.test(k)) throw new Error('Clé d’API web invalide : copie-la depuis retroachievements.org → Paramètres → Clés.');
		patch.raKey = k ? secrets.seal(k) : '';
	}
	store.setSettings(patch);
	progressCache.clear();
	// RetroArch reprend le même nom d'utilisateur (le mot de passe se tape une fois dans RetroArch).
	if (patch.raUser) {
		try {
			const exe = require('./emulators').pathFor('retroarch');
			if (exe) require('./emuinstall').setRetroArchCfg(exe, { cheevos_enable: 'true', cheevos_username: patch.raUser });
		} catch { /* RetroArch absent ou réglages illisibles */ }
	}
	return publicConfig();
};

const publicConfig = () => { const c = config(); return { user: c.user, keyPreview: secrets.preview(c.key), ready: !!(c.user && c.key) }; };

const supported = system => !!CONSOLES[system];

module.exports = {
	CONSOLES, UNLOCKERS, hashFile, toZ64, ndsHash, norm, similarity, gameList, identify, candidates, link, linkOf,
	progress, poll, profile, setConfig, config: publicConfig, ready, supported, systemOf, setFetch, badge, media,
};
