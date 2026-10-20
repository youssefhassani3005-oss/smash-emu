// Pilote de l'assistant fenêtres (winhelper.ps1) : un seul processus PowerShell, commandes en file d'attente.
const { spawn } = require('child_process');
const path = require('path');

let proc = null;
let buffer = '';
const queue = []; // { resolve, reject }
let ready = null;

const start = () => {
	if (proc) return ready;
	proc = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'winhelper.ps1')], { windowsHide: true });
	ready = new Promise((resolve) => {
		proc.stdout.on('data', (d) => {
			buffer += d.toString();
			let i;
			while ((i = buffer.indexOf('\n')) >= 0) {
				const line = buffer.slice(0, i).replace(/\r$/, '');
				buffer = buffer.slice(i + 1);
				if (line === 'ready') { resolve(); continue; }
				const q = queue.shift();
				if (!q) continue;
				const [status, ...rest] = line.split('\t');
				if (status === 'ok') q.resolve(rest.join('\t')); else q.reject(new Error(rest.join('\t')));
			}
		});
	});
	proc.on('exit', () => {
		proc = null;
		while (queue.length) queue.shift().reject(new Error('Assistant fenêtres arrêté.'));
	});
	return ready;
};

const send = async (...args) => {
	await start();
	return new Promise((resolve, reject) => {
		queue.push({ resolve, reject });
		proc.stdin.write(`${args.join('\t')}\n`);
	});
};

// Fenêtres visibles d'un processus, la plus grande d'abord.
// Fenêtres d'assistant, d'erreur ou de réglage (premier lancement, BIOS manquant…) : à montrer, pas à incruster.
const DIALOG_TITLE = /assistant|wizard|setup|configuration|erreur|error|warning|avertissement|bios|firmware|mise à jour|update available/i;

const windowsOf = async pid => (await send('find', pid)).split(';;').filter(Boolean).map((s) => {
	const [hwnd, w, h, owned, cls, ...rest] = s.split('|');
	const title = rest.join('|');
	return { hwnd: Number(hwnd), w: Number(w), h: Number(h), owned: owned === '1', cls, title, dialog: owned === '1' || cls === '#32770' || DIALOG_TITLE.test(title) };
});

module.exports = {
	start,
	windowsOf,
	embed: (child, parent, x, y, w, h) => send('embed', child, parent, x, y, w, h),
	move: (child, x, y, w, h) => send('move', child, x, y, w, h),
	hide: h => send('hide', h),
	focus: h => send('focus', h),
	keys: spec => send('keys', spec),
	shot: (h, file, width = 0) => send('shot', h, file, width),
	title: h => send('title', h),
	foreground: async () => Number(await send('foreground')),
	stop: () => { if (proc) proc.kill(); },
};
