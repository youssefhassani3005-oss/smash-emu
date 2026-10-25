const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const faith = require('../src/renderer/home-faithful.js');

// Contexte minimal, comme celui que donne l'accueil Console.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const games = [
	{ id: 'a', name: 'Jeu <un>', playTimeMs: 7200000, lastPlayed: Date.now() - 3600000 },
	{ id: 'b', name: 'Deuxième jeu', playTimeMs: 0 },
];
const ctx = {
	list: games, sel: 0, cur: games[0], esc, icon: n => `<svg data-i="${n}"></svg>`, cover: () => '', bg: () => '', image: '',
	consoles: [['n64', 2], ['snes', 1]], console: 'n64', sysOf: () => 'n64', sysLabel: s => s.toUpperCase(), sysInfo: () => ({ maker: 'Fabricant', year: 1996 }),
	look: () => ['#1fa64a', 'grid'], photo: s => `assets/consoles/${s}.jpg`, hints: () => '', coverHint: '', playTime: ms => `${Math.round(ms / 60000)} min`, ago: () => 'il y a 1 h',
	player: 'Joueur', initials: n => n.slice(0, 2), hue: () => 120, running: () => false, all: games,
};

test('Accueils fidèles : 40, uniques, avec référence, auteur et aperçu', () => {
	assert.strictEqual(faith.LIST.length, 40);
	assert.strictEqual(new Set(faith.LIST.map(f => f.id)).size, 40);
	const navs = new Set(['row', 'list', 'grid', 'consoleRow', 'consoleList', 'consoleGrid']);
	for (const f of faith.LIST) {
		assert.ok(navs.has(f.nav), `${f.id} : navigation ${f.nav}`);
		assert.ok(f.ref && f.author && f.src, f.id);
		if (f.nav === 'grid' || f.nav === 'consoleGrid') assert.ok(f.grid && f.grid.cols > 0 && f.grid.per > 0, `${f.id} : grille`);
		assert.ok(fs.existsSync(path.join(__dirname, `../src/renderer/previews/faith-${f.id}.jpg`)), `aperçu de ${f.id}`);
	}
});

test('Accueils fidèles : chaque accueil s’affiche, une tuile par jeu, une seule choisie, noms échappés', () => {
	for (const f of faith.LIST) {
		const html = f.render(ctx);
		const tiles = html.match(/data-action="ch-tile" data-i="\d+"/g) || [];
		assert.strictEqual(tiles.length, games.length + 1, `${f.id} : ${tiles.length} tuiles`);
		assert.strictEqual((html.match(/class="f-tile[^"]*\bsel\b/g) || []).length, 1, `${f.id} : sélection`);
		assert.doesNotMatch(html, /<un>/, `${f.id} : nom non échappé`);
		if (f.info) assert.doesNotMatch(f.info(games[0], ctx), /<un>/, `${f.id} : infos non échappées`);
	}
});