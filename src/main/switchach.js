// Succès maison des jeux Switch : RetroAchievements ne prend pas en charge la Switch, Smash Emu propose donc ses
// propres succès, calculés à partir de ce qu'il sait de tes parties (sessions, jours joués, sauvegardes, mods,
// triches, randomizer, speedrun, captures, réglages). Seules les dates de déblocage sont enregistrées (réglage
// « switchAch »). Chaque succès rapporte ses points en pièces Smash.
const fs = require('fs');
const path = require('path');
const store = require('./store');
const stats = require('./stats');

const HOUR = 3600000;
const DAY = 86400000;

// test(c) : c = contexte du jeu (voir context). emoji : badge affiché à la place d'une image.
const GAME = [
	{ key: 'boot', emoji: '🎮', title: 'Allumage', desc: 'Lancer le jeu une première fois', points: 5, test: c => c.sessions >= 1 || c.ms > 0 },
	{ key: 'save', emoji: '💾', title: 'Première sauvegarde', desc: 'Avoir une sauvegarde du jeu dans Citron ou Eden', points: 10, test: c => c.saved },
	{ key: 'hour', emoji: '⏱️', title: 'Bien installé', desc: 'Jouer une heure au total', points: 10, test: c => c.ms >= HOUR },
	{ key: 'sessions10', emoji: '🔁', title: 'Fidèle', desc: 'Faire 10 parties', points: 15, test: c => c.sessions >= 10 },
	{ key: 'days3', emoji: '📅', title: 'On remet ça', desc: 'Jouer 3 jours différents', points: 10, test: c => c.days >= 3 },
	{ key: 'days7', emoji: '🗓️', title: 'Une semaine ensemble', desc: 'Jouer 7 jours différents', points: 25, test: c => c.days >= 7 },
	{ key: 'long', emoji: '🏃', title: 'Marathon', desc: 'Une partie de 2 h d’affilée', points: 20, test: c => c.longest >= 2 * HOUR },
	{ key: 'night', emoji: '🌙', title: 'Oiseau de nuit', desc: 'Jouer entre minuit et 5 h du matin', points: 10, test: c => c.night },
	{ key: 'h10', emoji: '🥈', title: 'Grand voyage', desc: 'Jouer 10 h au total', points: 30, test: c => c.ms >= 10 * HOUR },
	{ key: 'h25', emoji: '🥇', title: 'Légende', desc: 'Jouer 25 h au total', points: 60, test: c => c.ms >= 25 * HOUR },
	{ key: 'backup', emoji: '🛟', title: 'Prudent', desc: 'Faire une copie de secours manuelle (Centre Switch)', points: 10, test: c => c.manualBackup },
	{ key: 'both', emoji: '🔀', title: 'Deux émulateurs', desc: 'Avoir une sauvegarde dans Citron et dans Eden', points: 15, test: c => c.bothSaves },
	{ key: 'mod', emoji: '🧩', title: 'Moddeur', desc: 'Activer un mod', points: 10, test: c => c.mods > 0 },
	{ key: 'cheat', emoji: '🪄', title: 'Petit tricheur', desc: 'Cocher une triche', points: 5, test: c => c.cheats > 0 },
	{ key: 'rando', emoji: '🎲', title: 'Chaos contrôlé', desc: 'Jouer avec le randomizer activé', points: 15, test: c => c.rando },
	{ key: 'tune', emoji: '🎛️', title: 'Sur mesure', desc: 'Régler la résolution ou un préréglage pour ce jeu', points: 5, test: c => c.tuned },
	{ key: 'shots', emoji: '📸', title: 'Photographe', desc: 'Faire 5 captures d’écran', points: 10, test: c => c.shots >= 5 },
	{ key: 'speedrun', emoji: '🏁', title: 'Chronométré', desc: 'Terminer une run en mode speedrun', points: 20, test: c => c.runs > 0 },
];
const GLOBAL = [
	{ key: 'g-3games', emoji: '📚', title: 'Collection Switch', desc: 'Jouer à 3 jeux Switch différents', points: 20, test: s => s.played >= 3 },
	{ key: 'g-10h', emoji: '🔥', title: 'Switch à fond', desc: '10 h sur des jeux Switch au total', points: 40, test: s => s.ms >= 10 * HOUR },
];

const state = () => store.getSettings().switchAch || {};
const switchGames = () => store.listInstances().filter(i => i.type === 'rom' && ((i.rom && i.rom.system) || i.system) === 'switch');

const nightOf = (x) => { for (let t = x.s; t <= x.e; t += 10 * 60000) { const h = new Date(t).getHours(); if (h < 5) return true; } return false; };
const countFiles = (dir) => { try { return fs.readdirSync(dir).filter(f => /\.(png|jpe?g)$/i.test(f)).length; } catch { return 0; } };

// Tout ce que Smash Emu sait du jeu ; chaque source est lue à part, une erreur ne bloque pas les autres.
const context = (inst, log = stats.readLog(), running = []) => {
	const hub = require('./switchhub');
	const mine = log.filter(x => x.id === inst.id);
	const live = running.find(r => r.id === inst.id);
	const c = {
		ms: (inst.playTimeMs || 0) + (live ? Date.now() - live.startedAt : 0),
		sessions: mine.length + (live ? 1 : 0),
		days: new Set(mine.map(x => new Date(x.s).toDateString())).size,
		longest: Math.max(0, ...mine.map(x => x.e - x.s), live ? Date.now() - live.startedAt : 0),
		night: mine.some(nightOf) || (live && nightOf({ s: live.startedAt, e: Date.now() })),
		saved: false, bothSaves: false, manualBackup: false, mods: 0, cheats: 0, tuned: false,
		rando: !!(((inst.options || {}).randomizer || {}).on),
		shots: countFiles(path.join(store.instanceDir(inst.id), 'screenshots')),
		runs: 0,
	};
	try {
		const tid = hub.ctx(inst.id).tid;
		if (tid) {
			const saves = hub.ENGINES.map(e => hub.saveOf(e, tid)).filter(s => s.exists && s.files);
			c.saved = saves.length > 0;
			c.bothSaves = saves.length >= 2;
			c.manualBackup = hub.backupsOf(tid).some(b => b.reason === 'manual');
		}
	} catch { /* jeu non identifié */ }
	try { c.mods = hub.mods(inst.id).list.filter(m => m.on).length; } catch { /* pas de mods */ }
	try { c.cheats = hub.cheats(inst.id).builds.reduce((n, b) => n + b.list.filter(x => x.on && !x.master).length, 0); } catch { /* pas de triches */ }
	try { c.tuned = hub.settings(inst.id).options.some(o => o.value !== null); } catch { /* réglages illisibles */ }
	try { const sr = JSON.parse(fs.readFileSync(path.join(store.instanceDir(inst.id), 'speedrun.json'), 'utf8')); c.runs = (sr.runs || []).filter(r => r.complete).length; } catch { /* pas de speedrun */ }
	return c;
};

// Débloque ce qui doit l'être ; renvoie les nouveaux succès ({ key, title, desc, points, emoji, gameId, game }).
const evaluate = (running = [], only = null) => {
	const have = { ...state() };
	const fresh = [];
	const log = stats.readLog();
	const games = switchGames();
	let played = 0;
	let total = 0;
	for (const inst of games) {
		const needed = GAME.filter(a => !have[`${inst.id}:${a.key}`]);
		const c = (!only || only === inst.id) && needed.length ? context(inst, log, running) : null;
		const ms = c ? c.ms : (inst.playTimeMs || 0);
		if (ms > 0) played++;
		total += ms;
		if (!c) continue;
		for (const a of needed) {
			if (a.test(c)) { have[`${inst.id}:${a.key}`] = Date.now(); fresh.push({ key: a.key, title: a.title, desc: a.desc, points: a.points, emoji: a.emoji, gameId: inst.id, game: inst.name }); }
		}
	}
	for (const a of GLOBAL) {
		if (!have[a.key] && a.test({ played, ms: total })) { have[a.key] = Date.now(); fresh.push({ key: a.key, title: a.title, desc: a.desc, points: a.points, emoji: a.emoji }); }
	}
	if (fresh.length) store.setSettings({ switchAch: have });
	return fresh;
};

// Liste d'un jeu, au même format que les succès RetroAchievements (panneau en jeu, Centre Switch).
const progress = (id) => {
	const inst = store.getInstance(id);
	const have = state();
	const list = [...GAME.map(a => ({ id: a.key, title: a.title, desc: a.desc, points: a.points, emoji: a.emoji, earned: have[`${id}:${a.key}`] || null })),
		...GLOBAL.map(a => ({ id: a.key, title: a.title, desc: `${a.desc} (tous jeux)`, points: a.points, emoji: a.emoji, earned: have[a.key] || null }))];
	return {
		home: true, game: { id, title: inst.name, icon: null, console: 'Nintendo Switch' },
		total: list.length, earned: list.filter(a => a.earned).length,
		points: list.reduce((s, a) => s + a.points, 0), myPoints: list.filter(a => a.earned).reduce((s, a) => s + a.points, 0),
		achievements: list,
	};
};

// Nouveaux succès : pièces et notification.
const reward = (fresh) => {
	if (!fresh.length) return fresh;
	const coins = require('./coins');
	const notifications = require('./notifications');
	for (const a of fresh) {
		try { coins.earn(a.points, `Succès Switch : ${a.title}`); } catch { /* pièces indisponibles */ }
		try { notifications.push({ kind: 'achievement', title: `${a.emoji} Succès Switch : ${a.title}`, text: `${a.game ? `${a.game} · ` : ''}${a.desc} (+${a.points} pièces)` }); } catch { /* centre indisponible */ }
	}
	return fresh;
};

module.exports = { GAME, GLOBAL, context, evaluate, progress, reward };
