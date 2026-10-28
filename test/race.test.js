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

// Solde fixé à la main (les tests de mise ne doivent pas changer celui des tests suivants).
const setBalance = n => store.setSettings({ coins: { ...store.getSettings().coins, balance: n } });

test('Mise : de côté à l’envoi, le gagnant prend les deux mises', async () => {
	const keep = coins.state().balance;
	coins.earn(500, 'test mise');
	const inst = store.createInstance({ name: 'Jeu Mise', type: 'coopdx' });
	const start = coins.state().balance;
	const r = await race.invite(friend, inst.id, 100);
	assert.strictEqual(sent.pop().bet, 100, 'la mise part avec l’invitation');
	assert.strictEqual(coins.state().balance, start - 100);
	assert.strictEqual(coins.held(r.id), 100);
	race.onMessage({ op: 'accept', id: r.id }, friend);
	const live = race.races.get(r.id);
	live.state = 'running';
	await race.finish(inst.id, 30000);
	race.onMessage({ op: 'finish', id: r.id, ms: 31000 }, friend);
	assert.strictEqual(live.winner, 'me');
	assert.strictEqual(coins.state().balance, start - 100 + 200 + coins.REWARDS.raceWin);
	assert.strictEqual(coins.held(r.id), null);
	assert.match(notes.pop().text, /\+200 pièces de mise/);
	setBalance(keep);
});

test('Mise : perdue en cas de défaite, rendue si refus, égalité ou abandon avant le départ', async (t) => {
	const inst = store.createInstance({ name: 'Jeu Mise 2', type: 'coopdx' });
	const keep = coins.state().balance;
	t.after(() => setBalance(keep));
	coins.earn(1000, 'test mise');
	let bal = coins.state().balance;
	// Défaite : la mise est perdue (la récompense de course terminée reste).
	const lost = await race.invite(friend, inst.id, 50);
	race.onMessage({ op: 'accept', id: lost.id }, friend);
	race.races.get(lost.id).state = 'running';
	await race.finish(inst.id, 40000);
	race.onMessage({ op: 'finish', id: lost.id, ms: 39000 }, friend);
	assert.strictEqual(coins.state().balance, bal - 50 + coins.REWARDS.raceFinish);
	// Refus : rendue.
	bal = coins.state().balance;
	const no = await race.invite(friend, inst.id, 50);
	race.onMessage({ op: 'decline', id: no.id }, friend);
	assert.strictEqual(coins.state().balance, bal);
	// Égalité : rendue.
	const tie = await race.invite(friend, inst.id, 50);
	race.onMessage({ op: 'accept', id: tie.id }, friend);
	race.races.get(tie.id).state = 'running';
	await race.finish(inst.id, 20000);
	race.onMessage({ op: 'finish', id: tie.id, ms: 20000 }, friend);
	assert.strictEqual(coins.state().balance, bal + coins.REWARDS.raceFinish);
	// Abandon de l'ami avant le départ : course sans gagnant, rendue.
	bal = coins.state().balance;
	const early = await race.invite(friend, inst.id, 50);
	race.onMessage({ op: 'accept', id: early.id }, friend);
	race.onMessage({ op: 'forfeit', id: early.id }, friend);
	assert.strictEqual(race.races.get(early.id).winner, 'none');
	assert.strictEqual(coins.state().balance, bal);
	// Pas assez de pièces : rien n'est envoyé.
	const n = sent.length;
	setBalance(30);
	await assert.rejects(race.invite(friend, inst.id, 50), /manque/);
	assert.strictEqual(sent.length, n);
	assert.strictEqual(coins.state().balance, 30);
});

test('Mise : invitation reçue, mise prise à l’acceptation, expirée sans réponse = rendue', async (t) => {
	const inst = store.createInstance({ name: 'Jeu Mise 3', type: 'coopdx' });
	const keep = coins.state().balance;
	t.after(() => setBalance(keep));
	coins.earn(300, 'test mise');
	const bal = coins.state().balance;
	race.onMessage({ op: 'invite', id: 'aaaaaaaaaaaaaaaa', at: Date.now(), game: { n: 'Jeu Mise 3' }, bet: 5000 }, friend);
	const got = race.list().find(x => x.id === 'aaaaaaaaaaaaaaaa');
	assert.strictEqual(got.bet, coins.MAX_BET, 'mise bornée');
	race.onMessage({ op: 'invite', id: 'bbbbbbbbbbbbbbbb', at: Date.now(), game: { n: 'Jeu Mise 3' }, bet: 40 }, friend);
	await race.accept('bbbbbbbbbbbbbbbb', inst.id);
	assert.strictEqual(coins.state().balance, bal - 40);
	// Défi envoyé resté sans réponse : expiré, mise rendue.
	const r = await race.invite(friend, inst.id, 60);
	race.races.get(r.id).at -= 16 * 60000;
	assert.strictEqual(race.list().find(x => x.id === r.id).state, 'expired');
	assert.strictEqual(coins.state().balance, bal - 40);
	// Acceptation arrivée trop tard : on dit à l'ami d'annuler (il récupère sa mise).
	race.onMessage({ op: 'accept', id: r.id }, friend);
	assert.strictEqual(sent.pop().op, 'cancel');
	// Redémarrage : les mises encore gardées reviennent.
	coins.refundAll('test');
	assert.strictEqual(coins.state().balance, bal);
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
