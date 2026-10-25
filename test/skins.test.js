const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const skins = require('../src/renderer/home-skins.js');

test('Styles d’accueil : au moins 147, uniques, complets et sans marque dans le nom', () => {
	const L = skins.LIST;
	assert.ok(L.length >= 147, `${L.length} styles`);
	assert.strictEqual(new Set(L.map(s => s.id)).size, L.length);
	assert.strictEqual(new Set(L.map(s => s.name)).size, L.length, 'noms uniques');
	const layouts = new Set(['row', 'grid', 'cosmos', 'dash', 'wave', 'manor', 'wii', 'case', 'colorful']);
	for (const s of L) {
		assert.ok(layouts.has(s.layout), s.id);
		for (const k of ['bg', 'bg2', 'acc', 'acc2', 'text']) assert.match(s[k], /^#[0-9a-f]{6}$/i, `${s.id}.${k}`);
		assert.doesNotMatch(s.name, /xbox|playstation|ps5|nintendo|zelda|mario|persona|steam|sega/i);
		assert.ok(s.credit.startsWith('Inspiré'));
	}
	assert.ok(L.some(s => s.layout === 'colorful'));
});

test('Sélecteur « Consoles » : une photo libre pour chaque console', () => {
	const systems = Object.keys(require('../src/main/systems').SYSTEMS);
	const dir = path.join(__dirname, '../src/renderer/assets/consoles');
	for (const s of systems) assert.ok(fs.existsSync(path.join(dir, `${s}.jpg`)), `photo manquante : ${s}`);
	assert.ok(fs.readFileSync(path.join(dir, 'CREDITS.md'), 'utf8').includes('Evan-Amos'));
});