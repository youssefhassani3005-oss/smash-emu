// Statistiques du tableau de bord : historique des parties (début, fin) gardé dans Documents\Smash Emu\stats.json,
// puis agrégats (jours, heures, consoles, jeux), état de la bibliothèque, des émulateurs et du stockage.
const fs = require('fs');
const path = require('path');
const store = require('./store');
const systems = require('./systems');
const trophies = require('./trophies');
const supporter = require('./supporter');

const FILE = path.join(store.ROOT, 'stats.json');
const MAX = 5000;
const DAY = 86400000;

const readLog = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')).log || []; } catch { return []; } };

// Fin d'une partie : une ligne { id, s (début), e (fin) } ; les parties de moins de 20 s sont ignorées.
const record = (id, s, e = Date.now()) => {
	if (e - s < 20000) return;
	const log = [...readLog(), { id, s, e }].slice(-MAX);
	fs.writeFileSync(FILE, JSON.stringify({ log }));
};

const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

// Répartit une session sur les jours et les heures qu'elle traverse.
const spread = (s, e, onDay, onHour) => {
	let t = s;
	while (t < e) {
		const next = Math.min(e, new Date(t).setMinutes(60, 0, 0));
		onDay(dayKey(t), next - t);
		onHour(new Date(t).getHours(), new Date(t).getDay(), next - t);
		t = next;
	}
};

// Taille des dossiers de données (mise en cache 10 min : un dossier d'émulateurs peut contenir des milliers de fichiers).
let sizeCache = { at: 0, value: null };
const dirSize = async (dir) => {
	let total = 0;
	let files = 0;
	const walk = async (d) => {
		let entries;
		try { entries = await fs.promises.readdir(d, { withFileTypes: true }); } catch { return; }
		for (const e of entries) {
			const p = path.join(d, e.name);
			if (e.isDirectory()) await walk(p);
			else if (e.isFile()) { try { total += (await fs.promises.stat(p)).size; files++; } catch { /* fichier disparu */ } }
		}
	};
	await walk(dir);
	return { bytes: total, files };
};
const storage = async () => {
	if (sizeCache.value && Date.now() - sizeCache.at < 600000) return sizeCache.value;
	const parts = [['instances', 'Jeux et sauvegardes'], ['roms', 'Bibliothèque de ROM'], ['emulators', 'Émulateurs installés'], ['cache', 'Cache (images, listes)'], ['themes', 'Images des thèmes'], ['app-data', 'Données de l’application']];
	const out = [];
	for (const [dir, label] of parts) out.push({ dir, label, ...(await dirSize(path.join(store.ROOT, dir))) });
	sizeCache = { at: Date.now(), value: out };
	return out;
};

const systemOf = inst => (inst.rom && inst.rom.system) || inst.system || 'n64';

const dashboard = async ({ running = [], emulators = {}, roms = [] } = {}) => {
	const now = Date.now();
	const insts = store.listInstances();
	const byId = Object.fromEntries(insts.map(i => [i.id, i]));
	const live = running.map(r => ({ id: r.id, s: r.startedAt, e: now, live: true }));
	const log = [...readLog(), ...live];

	// Activité des 30 derniers jours, heures de jeu et jours de la semaine.
	const perDayMap = {};
	const hours = Array(24).fill(0);
	const week = Array(7).fill(0);
	for (const x of log) spread(x.s, x.e, (k, ms) => { perDayMap[k] = (perDayMap[k] || 0) + ms; }, (h, wd, ms) => { hours[h] += ms; week[wd] += ms; });
	const today = startOfDay(now);
	const days = [];
	for (let i = 29; i >= 0; i--) { const t = today - i * DAY; days.push({ day: dayKey(t), at: t, ms: perDayMap[dayKey(t)] || 0 }); }
	// Série de jours consécutifs avec au moins une partie (aujourd'hui ou hier compris).
	let streak = 0;
	for (let t = perDayMap[dayKey(today)] ? today : today - DAY; perDayMap[dayKey(t)]; t -= DAY) streak++;

	// Temps par jeu et par console (temps cumulé des instances + partie en cours).
	const liveMs = Object.fromEntries(live.map(x => [x.id, x.e - x.s]));
	const games = insts.map(i => ({
		id: i.id, name: i.name, type: i.type, system: systemOf(i), ms: (i.playTimeMs || 0) + (liveMs[i.id] || 0),
		lastPlayed: i.lastPlayed || null, coverFile: i.coverFile || null, coverAt: i.coverAt || 0,
		sessions: log.filter(x => x.id === i.id).length,
	}));
	const perConsole = {};
	for (const g of games) if (g.ms) perConsole[g.system] = (perConsole[g.system] || 0) + g.ms;
	const sessions = log.filter(x => byId[x.id]);
	const lengths = sessions.map(x => x.e - x.s);

	// Bibliothèque : consoles, jaquettes, fichiers introuvables.
	const romInsts = insts.filter(i => i.type === 'rom');
	const romsBySystem = {};
	for (const r of roms) romsBySystem[r.system || '?'] = (romsBySystem[r.system || '?'] || 0) + 1;
	const missingFiles = roms.filter(r => r.linked && !fs.existsSync(r.linked)).map(r => r.name);

	// Trophées récents.
	const t = trophies.list(running);
	const unlocked = [
		...t.global.filter(x => x.at).map(x => ({ name: x.name, desc: x.desc, rank: x.rank, points: x.points, at: x.at })),
		...t.perGame.flatMap(g => g.tiers.filter(x => x.at).map(x => ({ name: x.name, desc: `${x.label} sur ${g.name}`, rank: x.rank, points: x.points, at: x.at }))),
	].sort((a, b) => b.at - a.at);

	const s = store.getSettings();
	const recent = s.remoteRecent || [];
	return {
		generatedAt: now,
		player: s.playerName || '',
		totals: {
			ms: games.reduce((a, g) => a + g.ms, 0),
			played: games.filter(g => g.ms > 0).length,
			instances: insts.length,
			sessions: sessions.length,
			longest: Math.max(0, ...lengths, (s.trophyStats && s.trophyStats.longest) || 0),
			average: lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : 0,
			streak,
			consoles: Object.keys(perConsole).length,
			historySince: log.length ? Math.min(...log.map(x => x.s)) : null,
		},
		days, hours, week,
		perConsole: Object.entries(perConsole).map(([id, ms]) => ({ id, label: (systems.SYSTEMS[id] || {}).label || id, ms })).sort((a, b) => b.ms - a.ms),
		topGames: games.filter(g => g.ms > 0).sort((a, b) => b.ms - a.ms).slice(0, 10),
		library: {
			romInstances: romInsts.length,
			coopdx: insts.filter(i => i.type === 'coopdx').length,
			withCover: romInsts.filter(i => i.coverFile).length,
			roms: roms.length,
			romsBySystem: Object.entries(romsBySystem).map(([id, n]) => ({ id, label: (systems.SYSTEMS[id] || {}).label || id, n })).sort((a, b) => b.n - a.n),
			missingFiles,
			neverPlayed: games.filter(g => !g.ms).map(g => ({ id: g.id, name: g.name })),
		},
		trophies: { count: t.count, points: t.points, total: t.total, recent: unlocked.slice(0, 8) },
		remote: { hosted: recent.filter(r => r.role === 'hôte').length, joined: recent.filter(r => r.role !== 'hôte').length, recent: recent.slice(0, 5) },
		emulators: Object.values(emulators).map(e => ({ id: e.id, label: e.label, installed: !!e.path, version: ((s.emulatorVersions || {})[e.id] || {}).version || null, systems: e.systems })),
		storage: await storage(),
		supporter: supporter.status(),
		customThemes: (s.customThemes || []).length,
	};
};

module.exports = { record, readLog, dashboard, storage, spread, dayKey };
