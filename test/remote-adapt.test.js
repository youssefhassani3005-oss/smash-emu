const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SmashRemote = require('../src/emu/remote-common');

test('qualité Auto : descend après deux secondes mauvaises, remonte après 15 s calmes', () => {
	let cur = {};
	let lost = 0;
	const step = (s) => { cur = SmashRemote.adapt(cur, s, lost); lost = s.lost ?? lost; return cur; };
	// Démarrage : « limité par le débit » sans image envoyée, ignoré.
	for (let i = 0; i < 6; i++) step({ rtt: 30, lost: 0, limit: 'bandwidth', kbps: 0, fps: 0 });
	assert.strictEqual(cur.level, 0);
	step({ rtt: 30, lost: 0, limit: 'bandwidth', kbps: 0, fps: 0 });
	step({ rtt: 30, lost: 0, limit: 'bandwidth', kbps: 0, fps: 0 });
	assert.strictEqual(cur.level, 0, 'pas d’image envoyée : le débit ne compte pas');
	step({ rtt: 30, lost: 40 });
	assert.strictEqual(cur.level, 0, 'une seule seconde mauvaise ne suffit pas');
	step({ rtt: 30, lost: 80 });
	assert.strictEqual(cur.level, 1);
	assert.match(cur.why, /pertes/);
	step({ rtt: 200, lost: 80 });
	step({ rtt: 200, lost: 80, limit: 'bandwidth', kbps: 4000, fps: 60 });
	assert.strictEqual(cur.level, 2);
	for (let i = 0; i < 14; i++) step({ rtt: 30, lost: 80 });
	assert.strictEqual(cur.level, 2);
	step({ rtt: 30, lost: 80 });
	assert.strictEqual(cur.level, 1);
	// Jamais en dessous de la dernière marche.
	for (let i = 0; i < 30; i++) step({ rtt: 500, lost: 0, limit: 'cpu' });
	assert.strictEqual(cur.level, SmashRemote.LADDER.length - 1);
	assert.ok(SmashRemote.LADDER.every((l, i) => !i || l.maxBitrate < SmashRemote.LADDER[i - 1].maxBitrate));
});

// Chrono de la page (speedrun.js) chargé dans un bac à sable avec une horloge pilotée.
const loadSpeedrun = () => {
	let t = 0;
	const sandbox = {
		window: {},
		performance: { now: () => t },
		requestAnimationFrame: () => 1,
		cancelAnimationFrame: () => {},
		setInterval: () => 1,
		clearInterval: () => {},
		atob: s => Buffer.from(s, 'base64').toString('latin1'),
		confirm: () => true,
		Date,
	};
	vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/emu/speedrun.js'), 'utf8'), sandbox);
	return { SR: sandbox.window.SmashSpeedrun, advance: (ms) => { t += ms; } };
};

test('chrono : centièmes, pause exclue, essai assisté hors record', async () => {
	const { SR, advance } = loadSpeedrun();
	assert.strictEqual(SR.fmt(61234), '1:01,23');
	assert.strictEqual(SR.fmt(5007), '5,00');
	let saved = null;
	const toasts = [];
	const sr = SR.create({ load: () => ({ on: true, splits: ['Fin'] }), save: (d) => { saved = JSON.parse(JSON.stringify(d)); }, toast: m => toasts.push(m) });
	await sr.init();

	sr.split(); // départ
	advance(10000);
	sr.pause(true);
	advance(60000); // une minute de pause : ne compte pas
	sr.pause(false);
	advance(5000);
	sr.split(); // fin
	assert.strictEqual(saved.pb.times[0], 15000);

	// Deuxième essai plus rapide mais accéléré : chronométré, pas de record.
	sr.split(); // remise à zéro après la fin
	sr.split(); // départ
	advance(3000);
	sr.flag('Jeu accéléré');
	advance(1000);
	sr.split();
	assert.strictEqual(saved.pb.times[0], 15000, 'le record reste celui de l’essai honnête');
	assert.strictEqual(saved.runs[0].assist, 'Jeu accéléré');
	assert.strictEqual(saved.runs[0].times[0], 4000);
	assert.ok(toasts.some(m => /hors record/.test(m)));
});
