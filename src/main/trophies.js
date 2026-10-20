// Trophées : débloqués par le temps passé sur chaque jeu (paliers) et par quelques étapes générales.
// Tout est calculé à partir des données déjà connues (temps de jeu, consoles, sessions à distance) ; seules les
// dates de déblocage sont enregistrées (réglage « trophies »). Vérification au lancement, à la fin d'une partie
// et chaque minute pendant une partie, pour débloquer « en direct ».
const store = require('./store');

const HOUR = 3600000;
const MIN = 60000;

// Paliers par jeu : durée, nom, rang (couleur) et points.
const TIERS = [
	{ key: 't10m', ms: 10 * MIN, name: 'Premiers pas', rank: 'bronze', points: 5 },
	{ key: 't1h', ms: 1 * HOUR, name: 'Habitué', rank: 'bronze', points: 10 },
	{ key: 't5h', ms: 5 * HOUR, name: 'Passionné', rank: 'silver', points: 20 },
	{ key: 't10h', ms: 10 * HOUR, name: 'Expert', rank: 'silver', points: 30 },
	{ key: 't25h', ms: 25 * HOUR, name: 'Légende', rank: 'gold', points: 50 },
	{ key: 't50h', ms: 50 * HOUR, name: 'Maître', rank: 'gold', points: 80 },
	{ key: 't100h', ms: 100 * HOUR, name: 'Platine', rank: 'platinum', points: 150 },
];

// Trophées généraux : test sur un résumé de la bibliothèque.
const GLOBAL = [
	{ key: 'g-first', name: 'Bienvenue', desc: 'Lancer un premier jeu', rank: 'bronze', points: 5, test: s => s.played >= 1 },
	{ key: 'g-5games', name: 'Collectionneur', desc: 'Jouer à 5 jeux différents', rank: 'silver', points: 20, test: s => s.played >= 5 },
	{ key: 'g-10games', name: 'Ludothèque', desc: 'Jouer à 10 jeux différents', rank: 'gold', points: 40, test: s => s.played >= 10 },
	{ key: 'g-3consoles', name: 'Voyageur', desc: 'Jouer sur 3 consoles différentes', rank: 'silver', points: 20, test: s => s.consoles >= 3 },
	{ key: 'g-10h', name: 'Marathon', desc: '10 h de jeu au total', rank: 'silver', points: 25, test: s => s.total >= 10 * HOUR },
	{ key: 'g-50h', name: 'Vétéran', desc: '50 h de jeu au total', rank: 'gold', points: 60, test: s => s.total >= 50 * HOUR },
	{ key: 'g-100h', name: 'Immortel', desc: '100 h de jeu au total', rank: 'platinum', points: 120, test: s => s.total >= 100 * HOUR },
	{ key: 'g-night', name: 'Oiseau de nuit', desc: 'Jouer entre minuit et 5 h du matin', rank: 'bronze', points: 10, test: s => s.night },
	{ key: 'g-remote', name: 'À plusieurs', desc: 'Héberger ou rejoindre une partie à distance', rank: 'silver', points: 15, test: s => s.remote },
	{ key: 'g-session2h', name: 'Sans pause', desc: 'Une session de 2 h d’affilée', rank: 'silver', points: 15, test: s => s.longest >= 2 * HOUR },
];

const unlocked = () => store.getSettings().trophies || {};

// Résumé : temps de jeu de chaque jeu (partie en cours comprise).
const summary = (running = []) => {
	const live = Object.fromEntries(running.map(r => [r.id, Date.now() - r.startedAt]));
	const insts = store.listInstances();
	const s = store.getSettings();
	const games = insts.map(i => ({ id: i.id, name: i.name, system: (i.rom && i.rom.system) || i.system || (i.type === 'coopdx' ? 'n64' : null), ms: (i.playTimeMs || 0) + (live[i.id] || 0) }));
	const playedGames = games.filter(g => g.ms > 0);
	return {
		games,
		played: playedGames.length,
		consoles: new Set(playedGames.map(g => g.system).filter(Boolean)).size,
		total: games.reduce((a, g) => a + g.ms, 0),
		night: !!(s.trophyStats && s.trophyStats.night),
		longest: Math.max((s.trophyStats && s.trophyStats.longest) || 0, ...Object.values(live), 0),
		remote: (s.remoteRecent || []).length > 0,
	};
};

// Débloque ce qui doit l'être ; renvoie la liste des nouveaux trophées.
const evaluate = (running = []) => {
	const s = summary(running);
	const have = { ...unlocked() };
	const fresh = [];
	for (const g of s.games) {
		for (const t of TIERS) {
			const key = `${g.id}:${t.key}`;
			if (!have[key] && g.ms >= t.ms) { have[key] = Date.now(); fresh.push({ key, name: t.name, rank: t.rank, points: t.points, game: g.name, gameId: g.id, desc: `${durationLabel(t.ms)} sur ${g.name}` }); }
		}
	}
	for (const t of GLOBAL) {
		if (!have[t.key] && t.test(s)) { have[t.key] = Date.now(); fresh.push({ key: t.key, name: t.name, rank: t.rank, points: t.points, desc: t.desc }); }
	}
	if (fresh.length) store.setSettings({ trophies: have });
	return fresh;
};

// Fin d'une session : session la plus longue et sessions de nuit (pour les trophées généraux).
const noteSession = (startedAt, endedAt = Date.now()) => {
	const s = store.getSettings();
	const stats = { ...(s.trophyStats || {}) };
	stats.longest = Math.max(stats.longest || 0, endedAt - startedAt);
	for (let t = startedAt; t <= endedAt; t += 10 * MIN) {
		const h = new Date(t).getHours();
		if (h >= 0 && h < 5) { stats.night = true; break; }
	}
	store.setSettings({ trophyStats: stats });
};

function durationLabel(ms) {
	return ms < HOUR ? `${Math.round(ms / MIN)} min` : `${Math.round(ms / HOUR)} h`;
}

// Liste complète pour la page Trophées.
const list = (running = []) => {
	const s = summary(running);
	const have = unlocked();
	const perGame = s.games.filter(g => g.ms > 0 || TIERS.some(t => have[`${g.id}:${t.key}`])).sort((a, b) => b.ms - a.ms).map(g => ({
		id: g.id, name: g.name, ms: g.ms,
		tiers: TIERS.map(t => ({ key: t.key, name: t.name, rank: t.rank, points: t.points, ms: t.ms, label: durationLabel(t.ms), at: have[`${g.id}:${t.key}`] || null })),
	}));
	const global = GLOBAL.map(t => ({ key: t.key, name: t.name, desc: t.desc, rank: t.rank, points: t.points, at: have[t.key] || null }));
	const all = [...global, ...perGame.flatMap(g => g.tiers)];
	return {
		global, perGame,
		points: all.filter(t => t.at).reduce((a, t) => a + t.points, 0),
		count: all.filter(t => t.at).length,
		total: global.length + s.games.length * TIERS.length,
	};
};

module.exports = { TIERS, GLOBAL, evaluate, noteSession, list, summary, durationLabel };
