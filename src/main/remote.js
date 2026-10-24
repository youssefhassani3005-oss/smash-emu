// Jeu à distance — processus principal : fenêtre « Rejoindre une partie » (invité) et historique des sessions.
// La connexion elle-même (WebRTC) se fait dans les pages : src/emu/remote-host.js et src/emu/remote-guest.js.
const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const store = require('./store');

const SRC = path.join(__dirname, '..');
const guests = new Map(); // id webContents -> { win, code }

const openGuest = (code = '') => {
	const win = new BrowserWindow({
		width: 1280, height: 800, minWidth: 640, minHeight: 480, frame: false, backgroundColor: '#000000',
		title: 'Rejoindre une partie — Smash Emu',
		icon: store.windowIcon(),
		webPreferences: { preload: path.join(SRC, 'remote-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false },
	});
	const wcId = win.webContents.id;
	// Code de salon court (K7M-2QX) ou ancien long code d'invitation.
	const room = require('./rooms').normalize(code);
	guests.set(wcId, { win, code: room || (/^SMASH-INV-[A-Za-z0-9_-]+$/.test(code) ? code : '') });
	win.on('closed', () => guests.delete(wcId));
	win.webContents.on('will-navigate', e => e.preventDefault());
	win.loadURL('smash://app/emu/remote.html');
	return win;
};

const RECENT_MAX = 15;
const recent = () => (store.getSettings().remoteRecent || []).slice(0, RECENT_MAX);

const HANDLERS = {
	'remote:config': (g) => {
		const s = store.getSettings();
		const themes = require('../renderer/game-themes.js');
		return { theme: themes.resolve(s.theme), logo: s.logo || 'classic', playerName: s.playerName || '', code: g.code, customThemes: s.customThemes || [] };
	},
	'remote:setName': (g, name) => { if (typeof name === 'string' && name.trim()) store.setSettings({ playerName: name.trim().slice(0, 24) }); },
	'remote:addRecent': (g, entry) => {
		const item = { game: String((entry && entry.game) || '').slice(0, 80), host: String((entry && entry.host) || '').slice(0, 40), role: 'invité', at: Date.now() };
		store.setSettings({ remoteRecent: [item, ...recent()].slice(0, RECENT_MAX) });
	},
	'remote:window': (g, action) => {
		const w = g.win;
		if (action === 'minimize') w.minimize();
		if (action === 'fullscreen') w.setFullScreen(!w.isFullScreen());
		if (action === 'close') w.close();
	},
};

const registerIpc = () => {
	for (const [channel, fn] of Object.entries(HANDLERS)) {
		ipcMain.handle(channel, async (event, ...args) => {
			const g = guests.get(event.sender.id);
			if (!g) return { ok: false, error: 'Fenêtre inconnue.' };
			try { return { ok: true, value: await fn(g, ...args) }; } catch (error) { return { ok: false, error: error.message }; }
		});
	}
};

// Session hébergée : notée dans l'historique au lancement.
const noteHosted = (game) => {
	const item = { game: String(game || '').slice(0, 80), host: 'toi', role: 'hôte', at: Date.now() };
	store.setSettings({ remoteRecent: [item, ...recent()].slice(0, RECENT_MAX) });
};

module.exports = { openGuest, registerIpc, recent, noteHosted };
