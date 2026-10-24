const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'smash-race-test-'));
os.homedir = () => HOME;

const store = require('../src/main/store');
const coins = require('../src/main/coins');
const race = require('../src/main/race');
const speedrun = require('../src/main/speedrun');

const sent = [];
const notes = [];
race.init({ sendTo: async (code, m) => { sent.push(m); }, notify: n => notes.push(n) });
const friend = { code: 'SMASH-AMI-TEST', name: 'Léo' };

test('Course : invitation, prêts, compte à rebours, victoire et pièces', async () => {
	const inst = store.createInstance({ name: 'Super Jeu', type: 'coopdx' });
	const before = coins.state().balance;
	const r = await race.invite(friend, inst.id);
	assert.strictEqual(sent.pop().op, 'invite');
	race.onMessage({ op: 'accept', id: r.id }, friend);
	assert.strictEqual(race.list().find(x => x.id === r.id).state, 'accepted');
	await race.ready(inst.id);
	race.onMessage({ op: 'ready', id: r.id }, friend);
	const live = race.races.get(r.id);
	assert.strictEqual(live.state, 'countdown');
	live.state = 'running';
	await race.finish(inst.id, 61000);
	assert.strictEqual(live.state, 'running', 'on attend le temps de l’ami');
	race.onMessage({ op: 'finish', id: r.id, ms: 65000 }, friend);
	assert.strictEqual(live.state, 'done');
	assert.strictEqual(live.winner, 'me');
	assert.strictEqual(coins.state().balance, before + coins.REWARDS.raceWin);
	assert.match(notes.pop().title, /gagnée/);
});

test('Course : abandon de l’ami pendant la course = victoire ; message d’un autre ami ignoré', async () => {
	const inst = store.createInstance({ name: 'Autre Jeu', type: 'coopdx' });
	const r = await race.invite(friend, inst.id);
	race.onMessage({ op: 'accept', id: r.id }, { code: 'SMASH-AMI-AUTRE', name: 'Intrus' });
	assert.strictEqual(race.races.get(r.id).state, 'invited');
	race.onMessage({ op: 'accept', id: r.id }, friend);
	const live = race.races.get(r.id);
	live.state = 'running';
	race.onMessage({ op: 'forfeit', id: r.id }, friend);
	assert.strictEqual(live.winner, 'me');
});

test('Course : invitation reçue, jeu retrouvé par son nom', () => {
	const inst = store.createInstance({ name: 'Mon Jeu : Édition', type: 'coopdx' });
	race.onMessage({ op: 'invite', id: '0123456789abcdef', at: Date.now(), game: { n: 'mon jeu edition', s: 'n64' } }, friend);
	const r = race.list().find(x => x.id === '0123456789abcdef');
	assert.strictEqual(r.role, 'guest');
	assert.strictEqual(r.instanceId, inst.id);
	assert.strictEqual(notes.pop().kind, 'race-invite');
	race.onMessage({ op: 'invite', id: 'zz', game: { n: 'x' } }, friend);
	assert.ok(!race.races.has('zz'), 'identifiant invalide refusé');
});

test('Pièces : achat, équipement, solde insuffisant', () => {
	coins.earn(400, 'test');
	const bal = coins.state().balance;
	assert.throws(() => coins.buy('title-legend'), /manque/);
	const s = coins.buy('home-dash');
	assert.strictEqual(s.balance, bal - 300);
	assert.strictEqual(s.equipped.home, 'home-dash');
	assert.strictEqual(store.getSettings().consoleLayout, 'dash');
	assert.throws(() => coins.buy('home-dash'), /déjà/);
	assert.throws(() => coins.equip('home', 'home-wave'), /non possédé/);
	coins.equip('home', null);
	assert.strictEqual(store.getSettings().consoleLayout, 'row');
});

test('Speedrun : écran de fin gardé, nouveau record = pièces', () => {
	const inst = store.createInstance({ name: 'Run', type: 'coopdx' });
	const sig = Buffer.alloc(576, 7).toString('base64');
	assert.strictEqual(speedrun.clean({ endSig: sig, endAuto: 1 }).endSig, sig);
	assert.strictEqual(speedrun.clean({ endSig: 'pas<du>base64' }).endSig, null);
	speedrun.save(inst.id, { on: true, splits: ['Fin'], pb: { times: [50000] } });
	const before = coins.state().balance;
	speedrun.save(inst.id, { on: true, splits: ['Fin'], pb: { times: [40000] } });
	assert.strictEqual(coins.state().balance, before + coins.REWARDS.personalBest);
	assert.strictEqual(speedrun.sigDistance(sig, sig), 0);
	assert.ok(speedrun.sigSpread(sig) < 1);
});
