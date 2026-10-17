// Lancement des jeux : suivi des processus, journaux en direct et temps de jeu.
const { spawn } = require('child_process');
const store = require('./store');
const games = require('./games');

const MAX_LOG_LINES = 4000;
const running = new Map(); // id d'instance -> { child | win, startedAt }
const logs = new Map();    // garde les journaux de la dernière session
let emit = () => {};
let openEmu = null;        // ouvre la fenêtre de l'émulateur intégré (fourni par main.js)
let openExternalHost = null; // fenêtre Smash Emu autour d'un émulateur externe

const setEmitter = fn => { emit = fn; };
const setEmuOpener = fn => { openEmu = fn; };
const setExternalOpener = fn => { openExternalHost = fn; };

const pushLog = (id, stream, text) => {
	const buf = logs.get(id) || [];
	for (const line of text.split(/\r?\n/)) {
		if (!line) continue;
		buf.push({ t: Date.now(), stream, line });
	}
	if (buf.length > MAX_LOG_LINES) buf.splice(0, buf.length - MAX_LOG_LINES);
	logs.set(id, buf);
	emit('log', { id, stream, text });
};

const status = () => [...running.entries()].map(([id, r]) => ({ id, startedAt: r.startedAt, pid: r.child ? r.child.pid : null, engine: r.win ? 'smash' : 'process' }));

const finish = (id, startedAt, reason) => {
	running.delete(id);
	const played = Date.now() - startedAt;
	try {
		const inst = store.getInstance(id);
		store.updateInstance(id, { playTimeMs: (inst.playTimeMs || 0) + played });
	} catch { /* instance supprimée pendant la partie */ }
	pushLog(id, 'launcher', `${reason} après ${Math.round(played / 1000)} s.`);
	emit('status', status());
};

const launch = (id) => {
	if (running.has(id)) {
		const r = running.get(id);
		if (r.win && !r.win.isDestroyed()) { r.win.show(); r.win.focus(); return status(); }
		throw new Error('Cette instance est déjà lancée.');
	}
	const plan = games.prepareLaunch(id);
	logs.set(id, []);
	const startedAt = Date.now();

	if (plan.kind === 'emu') {
		if (!openEmu) throw new Error('Émulateur intégré indisponible.');
		pushLog(id, 'launcher', `> Smash Emu : ${plan.rom}`);
		const win = openEmu(id, plan);
		running.set(id, { win, startedAt });
		store.updateInstance(id, { lastPlayed: startedAt });
		win.on('closed', () => finish(id, startedAt, 'Fenêtre de jeu fermée'));
		emit('status', status());
		return status();
	}

	// Émulateur externe incrusté dans une fenêtre Smash Emu.
	if (plan.embed && openExternalHost) {
		pushLog(id, 'launcher', `> ${plan.exe} ${plan.args.map(a => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`);
		const win = openExternalHost(id, plan);
		running.set(id, { win, startedAt });
		store.updateInstance(id, { lastPlayed: startedAt });
		win.on('closed', () => finish(id, startedAt, `${plan.emulator} fermé`));
		emit('status', status());
		return status();
	}

	const { exe, args, cwd } = plan;
	pushLog(id, 'launcher', `> ${exe} ${args.map(a => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`);

	const child = spawn(exe, args, { cwd, windowsHide: false });
	running.set(id, { child, startedAt });
	store.updateInstance(id, { lastPlayed: startedAt });

	child.stdout.on('data', d => pushLog(id, 'stdout', d.toString()));
	child.stderr.on('data', d => pushLog(id, 'stderr', d.toString()));
	child.on('error', (error) => {
		pushLog(id, 'launcher', `Erreur de lancement : ${error.message}`);
	});
	child.on('exit', code => finish(id, startedAt, `Jeu fermé (code ${code ?? '?'})`));
	emit('status', status());
	return status();
};

const stop = (id) => {
	const r = running.get(id);
	if (!r) return status();
	if (r.win) { if (!r.win.isDestroyed()) r.win.close(); return status(); }
	if (process.platform === 'win32') spawn('taskkill', ['/pid', String(r.child.pid), '/t', '/f']);
	else r.child.kill();
	return status();
};

const getLogs = id => logs.get(id) || [];
const isRunning = id => running.has(id);

module.exports = { setEmitter, setEmuOpener, setExternalOpener, pushLog, launch, stop, status, getLogs, isRunning };
