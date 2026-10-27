const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'smash-swach-test-'));
os.homedir = () => HOME;
process.env.APPDATA = path.join(HOME, 'AppData', 'Roaming');

const store = require('../src/main/store');
const stats = require('../src/main/stats');
const sa = require('../src/main/switchach');

const TID = '0100ABCD12340000';

test('succès Switch maison : débloqués d’après les parties, une seule fois', () => {
	store.ensureDirs();
	const file = path.join(HOME, `Jeu [${TID}][v0].nsp`);
	fs.writeFileSync(file, 'x');
	fs.utimesSync(file, new Date(Date.now() - 60000), new Date(Date.now() - 60000));
	const inst = store.createInstance({ name: 'Jeu Switch', type: 'rom' });
	store.updateInstance(inst.id, { playTimeMs: 3 * 3600000, rom: { system: 'switch', linked: file }, options: { ...inst.options, engine: 'eden' } });
	// Deux parties sur deux jours, dont une de plus de 2 h.
	const day = 86400000;
	const t0 = new Date(2026, 9, 20, 14).getTime();
	stats.record(inst.id, t0, t0 + 2.5 * 3600000);
	stats.record(inst.id, t0 + day, t0 + day + 1800000);
	const save = path.join(process.env.APPDATA, 'eden', 'nand', 'user', 'save', '0000000000000000', '688C8B4BA28B8C85E567F366AD84B9D6', TID);
	fs.mkdirSync(save, { recursive: true });
	fs.writeFileSync(path.join(save, 'savedata.bin'), 'partie');

	const fresh = sa.evaluate([]);
	const keys = fresh.filter(a => a.gameId === inst.id).map(a => a.key).sort();
	assert.deepStrictEqual(keys, ['boot', 'hour', 'long', 'save']);
	assert.ok(fresh.every(a => a.points > 0 && a.emoji && a.title));
	assert.deepStrictEqual(sa.evaluate([]), [], 'pas de doublon');

	const p = sa.progress(inst.id);
	assert.ok(p.home);
	assert.strictEqual(p.total, sa.GAME.length + sa.GLOBAL.length);
	assert.strictEqual(p.earned, 4);
	assert.strictEqual(p.myPoints, fresh.reduce((n, a) => n + a.points, 0));

	// Partie en cours qui passe la barre des 10 h : débloqué en direct.
	store.updateInstance(inst.id, { playTimeMs: 9.9 * 3600000 });
	const live = sa.evaluate([{ id: inst.id, startedAt: Date.now() - 600000 }], inst.id);
	assert.deepStrictEqual(live.map(a => a.key), ['h10', 'g-10h'], 'succès du jeu et succès global des 10 h');
});
