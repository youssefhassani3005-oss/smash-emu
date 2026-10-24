const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'smash-speedrun-test-'));
os.homedir = () => HOME;

global.window = global;
require('../src/emu/speedrun.js');
const speedrun = require('../src/main/speedrun');

// Horloge contrôlée : performance.now() avance de ce qu'on lui dit.
let now = 0;
const realNow = performance.now.bind(performance);
const withClock = async (fn) => { performance.now = () => now; try { await fn(); } finally { performance.now = realNow; } };

test('Speedrun : segments, record, meilleurs segments, annulation et abandon', () => withClock(async () => {
	let saved = { on: true, splits: ['Monde 1', 'Monde 2', 'Fin'] };
	const sr = window.SmashSpeedrun.create({ load: () => saved, save: (d) => { saved = JSON.parse(JSON.stringify(d)); } });
	await sr.init();
	now = 1000; sr.split(); // départ
	now = 11000; sr.split();
	now = 15000; sr.undo(); // segment annulé : on reste dans « Monde 2 »
	now = 31000; sr.split();
	now = 41000; sr.split();
	assert.strictEqual(sr.state, 'running');
	now = 51000; sr.split();
	assert.strictEqual(sr.state, 'done');
	assert.deepStrictEqual(saved.pb.times, [30000, 40000, 50000]);
	assert.deepStrictEqual(saved.best, [30000, 10000, 10000]);
	assert.strictEqual(saved.attempts, 1);
	// Deuxième essai plus lent puis abandonné : record gardé, meilleur segment mis à jour.
	sr.split(); // retour à « Prêt »
	now = 100000; sr.split();
	now = 120000; sr.split(); // Monde 1 en 20 s : meilleur segment
	now = 125000; sr.reset();
	assert.strictEqual(saved.attempts, 2);
	assert.deepStrictEqual(saved.pb.times, [30000, 40000, 50000]);
	assert.deepStrictEqual(saved.best, [20000, 10000, 10000]);
	assert.strictEqual(saved.runs[0].complete, false);
	assert.strictEqual(saved.runs[1].complete, true);
}));

test('Speedrun : chrono désactivé, rien ne se passe', () => withClock(async () => {
	const sr = window.SmashSpeedrun.create({ load: () => ({ on: false }), save: () => assert.fail('rien à enregistrer') });
	await sr.init();
	assert.strictEqual(sr.split(), false);
	assert.strictEqual(sr.reset(), false);
}));

test('Speedrun : données nettoyées avant d’être écrites', () => {
	const out = speedrun.clean({ on: 1, splits: ['  A ', '', 'x'.repeat(200)], pb: { times: [1, -5] }, best: [5, 'a'], attempts: -3, runs: [{ at: 5, times: [1, 2], complete: 1, extra: 'non' }], evil: true });
	assert.deepStrictEqual(out.splits, ['A', 'x'.repeat(60)]);
	assert.strictEqual(out.pb, null, 'temps négatif : record refusé');
	assert.deepStrictEqual(out.best, [5, null]);
	assert.strictEqual(out.attempts, 0);
	assert.deepStrictEqual(out.runs, [{ at: 5, times: [1, 2], complete: true }]);
	assert.strictEqual(out.evil, undefined);
	assert.strictEqual(window.SmashSpeedrun.fmt(3723456), '1:02:03,4');
	assert.strictEqual(window.SmashSpeedrun.fmt(-1500, true), '−1,5');
});
