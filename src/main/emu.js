// Émulateur intégré (EmulatorJS + mupen64plus) : protocole smash://, fenêtre de jeu, états sauvegardés sur disque.
const { BrowserWindow, protocol, net, ipcMain, shell, session: electronSession } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const store = require('./store');
const runner = require('./runner');

const APP_ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(APP_ROOT, 'src');
const MODULES = path.join(APP_ROOT, 'node_modules');
const EJS_DATA = path.join(MODULES, '@emulatorjs', 'emulatorjs', 'data');
const CORES_DIR = path.join(MODULES, '@emulatorjs');
const systems = require('./systems');
const SLOTS = 8;

const romTokens = new Map();   // jeton -> chemin de la ROM servie à une fenêtre de jeu
const sessions = new Map();    // id webContents -> { id, token, win, ready }

// À appeler avant app.whenReady() : smash:// doit pouvoir être lu par fetch() (cœur, ROM).
const registerScheme = () => {
	protocol.registerSchemesAsPrivileged([{
		scheme: 'smash',
		privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
	}]);
};

// smash://app/<chemin> : fichiers de l'application ; smash://rom/<jeton>/game.z64 : ROM d'une partie.
// Fichiers de cœur : « <cœur>-wasm.data », « reports/<cœur>.json », « ppsspp-assets.zip »… → paquet @emulatorjs/core-<cœur>.
const coreFile = (rel) => {
	const name = path.posix.basename(rel);
	const core = name.replace(/\.json$/, '').split('-')[0];
	if (!/^[a-z0-9_]+$/.test(core)) return null;
	const base = path.join(CORES_DIR, `core-${core}`);
	const file = path.resolve(base, rel);
	return file.startsWith(base + path.sep) ? file : null;
};

const ROUTES = [
	['ejs/', EJS_DATA],
	['emu/', path.join(SRC, 'emu')],
	['renderer/', path.join(SRC, 'renderer')],
];

const notFound = () => new Response('Introuvable', { status: 404 });

const handleProtocol = () => {
	protocol.handle('smash', async (request) => {
		const url = new URL(request.url);
		const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
		let file = null;
		if (url.hostname === 'rom') {
			file = romTokens.get(rel.split('/')[0]) || null;
		} else if (url.hostname === 'app' && rel.startsWith('ejs/cores/')) {
			file = coreFile(rel.slice('ejs/cores/'.length));
		} else if (url.hostname === 'app') {
			for (const [prefix, base] of ROUTES) {
				if (!rel.startsWith(prefix)) continue;
				const candidate = path.resolve(base, rel.slice(prefix.length));
				if (candidate === base || candidate.startsWith(base + path.sep)) file = candidate;
				break;
			}
		}
		if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return notFound();
		// Isolation d'origine : nécessaire aux cœurs multi-threads (PSP) via SharedArrayBuffer.
		const res = await net.fetch(pathToFileURL(file).toString());
		const headers = new Headers(res.headers);
		headers.set('Cross-Origin-Opener-Policy', 'same-origin');
		headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
		headers.set('Cross-Origin-Resource-Policy', 'same-origin');
		return new Response(res.body, { status: res.status, headers });
	});
};

// ---------- États sauvegardés ----------

const statesDir = id => path.join(store.instanceDir(id), 'states');
const slotFile = (id, slot, ext) => path.join(statesDir(id), `slot-${slot}.${ext}`);

const listStates = (id) => {
	const out = [];
	for (let slot = 1; slot <= SLOTS; slot++) {
		const state = slotFile(id, slot, 'state');
		if (!fs.existsSync(state)) { out.push({ slot, empty: true }); continue; }
		let thumb = null;
		try { thumb = 'data:image/png;base64,' + fs.readFileSync(slotFile(id, slot, 'png')).toString('base64'); } catch { /* pas de miniature */ }
		out.push({ slot, empty: false, savedAt: fs.statSync(state).mtimeMs, thumb });
	}
	return out;
};

const checkSlot = (slot) => {
	slot = +slot;
	if (!Number.isInteger(slot) || slot < 1 || slot > SLOTS) throw new Error('Emplacement invalide.');
	return slot;
};

// ---------- Fenêtre de jeu ----------

const openEmu = (id, plan) => {
	const token = crypto.randomBytes(16).toString('hex');
	romTokens.set(token, plan.rom);
	const biosToken = plan.bios ? crypto.randomBytes(16).toString('hex') : null;
	if (biosToken) romTokens.set(biosToken, plan.bios);
	const win = new BrowserWindow({
		width: 1200,
		height: 828,
		minWidth: 640,
		minHeight: 520,
		frame: false,
		backgroundColor: '#000000',
		title: `${plan.name} — Smash Emu`,
		icon: path.join(SRC, 'renderer', 'assets', 'icon.png'),
		webPreferences: {
			preload: path.join(SRC, 'emu-preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			autoplayPolicy: 'no-user-gesture-required',
			backgroundThrottling: false,
		},
	});
	const session = { id, token, biosToken, win, ready: false, name: plan.name, plan };
	const wcId = win.webContents.id;
	sessions.set(wcId, session);

	// Laisse la page enregistrer les sauvegardes en jeu avant de fermer (2,5 s maximum).
	win.on('close', (e) => {
		if (session.ready) return;
		e.preventDefault();
		if (session.closing) return;
		session.closing = setTimeout(() => { session.ready = true; if (!win.isDestroyed()) win.close(); }, 2500);
		win.webContents.send('emu:before-close');
	});
	win.on('closed', () => { romTokens.delete(token); if (biosToken) romTokens.delete(biosToken); sessions.delete(wcId); });

	win.webContents.on('console-message', (_e, level, message) => {
		if (level >= 2 || message.startsWith('[smash]')) runner.pushLog(id, level >= 3 ? 'stderr' : 'stdout', message);
	});
	win.webContents.on('will-navigate', e => e.preventDefault());
	win.webContents.setWindowOpenHandler(({ url }) => {
		if (/^https?:\/\//i.test(url)) shell.openExternal(url);
		return { action: 'deny' };
	});
	win.on('enter-full-screen', () => win.webContents.send('emu:fullscreen', true));
	win.on('leave-full-screen', () => win.webContents.send('emu:fullscreen', false));
	win.loadURL('smash://app/emu/player.html');
	return win;
};

// ---------- IPC de la fenêtre de jeu (l'instance est déduite de la fenêtre, jamais du message) ----------

const HANDLERS = {
	'emu:config': (s) => {
		const inst = store.getInstance(s.id);
		const settings = store.getSettings();
		return {
			instanceId: s.id,
			name: inst.name,
			rom: inst.rom ? { title: inst.rom.info.known || inst.rom.info.title, region: inst.rom.info.region, md5: inst.rom.info.md5 } : null,
			romUrl: `smash://rom/${s.token}/game${path.extname(s.plan.rom).toLowerCase() || '.z64'}`,
			biosUrl: s.biosToken ? `smash://rom/${s.biosToken}/${path.basename(s.plan.bios)}` : null,
			system: s.plan.system || 'n64',
			systemLabel: (systems.SYSTEMS[s.plan.system || 'n64'] || {}).label || 'N64',
			ejs: s.plan.ejs || 'n64',
			core: s.plan.core || 'mupen64plus_next',
			threads: !!s.plan.threads,
			theme: settings.theme,
			volume: typeof inst.options.emuVolume === 'number' ? inst.options.emuVolume : settings.emuVolume,
			slots: listStates(s.id),
			activeSlot: inst.options.emuSlot || 1,
		};
	},
	'emu:listStates': s => listStates(s.id),
	'emu:saveState': (s, slot, state, png) => {
		slot = checkSlot(slot);
		fs.mkdirSync(statesDir(s.id), { recursive: true });
		fs.writeFileSync(slotFile(s.id, slot, 'state'), Buffer.from(state));
		if (png && png.length) fs.writeFileSync(slotFile(s.id, slot, 'png'), Buffer.from(png));
		return listStates(s.id);
	},
	'emu:loadState': (s, slot) => {
		const file = slotFile(s.id, checkSlot(slot), 'state');
		if (!fs.existsSync(file)) throw new Error('Cet emplacement est vide.');
		return fs.readFileSync(file);
	},
	'emu:deleteState': (s, slot) => {
		slot = checkSlot(slot);
		for (const ext of ['state', 'png']) fs.rmSync(slotFile(s.id, slot, ext), { force: true });
		return listStates(s.id);
	},
	'emu:screenshot': (s, png) => {
		const dir = path.join(store.instanceDir(s.id), 'screenshots');
		fs.mkdirSync(dir, { recursive: true });
		const file = path.join(dir, `capture-${new Date().toISOString().replace(/[:.]/g, '-')}.png`);
		fs.writeFileSync(file, Buffer.from(png));
		return file;
	},
	// Copie de secours des sauvegardes en jeu (carte mémoire / EEPROM) dans le dossier de l'instance.
	'emu:exportSave': (s, data) => {
		if (!data || !data.length) return null;
		const dir = path.join(store.instanceDir(s.id), 'saves');
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, 'game.srm'), Buffer.from(data));
		return true;
	},
	'emu:prefs': (s, patch) => {
		const inst = store.getInstance(s.id);
		const allowed = {};
		if (typeof patch.volume === 'number') allowed.emuVolume = Math.max(0, Math.min(1, patch.volume));
		if (patch.slot) allowed.emuSlot = checkSlot(patch.slot);
		store.updateInstance(s.id, { options: { ...inst.options, ...allowed } });
	},
	'emu:showPath': (s, file) => {
		const root = store.instanceDir(s.id);
		if (path.resolve(file).startsWith(root + path.sep)) shell.showItemInFolder(file);
	},
	'emu:window': (s, action) => {
		const w = s.win;
		if (action === 'minimize') w.minimize();
		if (action === 'maximize') (w.isMaximized() ? w.unmaximize() : w.maximize());
		if (action === 'fullscreen') w.setFullScreen(!w.isFullScreen());
		if (action === 'leave-fullscreen' && w.isFullScreen()) w.setFullScreen(false);
		if (action === 'close') w.close();
		if (action === 'top') w.setAlwaysOnTop(!w.isAlwaysOnTop());
		if (action === 'mini') {
			// Mini-fenêtre : petite, toujours visible, dans le coin de l'écran ; un second appel restaure.
			if (s.miniBounds) { w.setAlwaysOnTop(false); w.setBounds(s.miniBounds); s.miniBounds = null; }
			else {
				s.miniBounds = w.getBounds();
				if (w.isFullScreen()) w.setFullScreen(false);
				const { workArea } = require('electron').screen.getDisplayMatching(s.miniBounds);
				w.setBounds({ width: 480, height: 400, x: workArea.x + workArea.width - 500, y: workArea.y + workArea.height - 420 });
				w.setAlwaysOnTop(true);
			}
		}
		if (action === 'open-folder') shell.openPath(store.instanceDir(s.id));
		return { top: w.isAlwaysOnTop(), mini: !!s.miniBounds, fullscreen: w.isFullScreen() };
	},
	// État mis de côté le temps d'un rechargement de la fenêtre (changement d'options HD).
	'emu:stash': (s, state) => { s.stash = state ? Buffer.from(state) : null; },
	'emu:takeStash': (s) => { const v = s.stash || null; s.stash = null; return v; },
	'emu:readyToClose': (s) => {
		s.ready = true;
		clearTimeout(s.closing);
		if (!s.win.isDestroyed()) s.win.close();
	},
};

// Vidéos enregistrées dans une fenêtre de jeu : rangées dans le dossier de l'instance, sans boîte de dialogue.
const handleDownloads = () => {
	electronSession.defaultSession.on('will-download', (_e, item, wc) => {
		const s = wc && sessions.get(wc.id);
		if (!s) return;
		const dir = path.join(store.instanceDir(s.id), 'videos');
		fs.mkdirSync(dir, { recursive: true });
		const file = path.join(dir, item.getFilename().replace(/[<>:"/\\|?*]/g, '_'));
		item.setSavePath(file);
		item.once('done', (_ev, state) => { if (!wc.isDestroyed()) wc.send('emu:video-saved', { state, file }); });
	});
};

const registerIpc = () => {
	handleDownloads();
	for (const [channel, fn] of Object.entries(HANDLERS)) {
		ipcMain.handle(channel, async (event, ...args) => {
			const s = sessions.get(event.sender.id);
			if (!s) return { ok: false, error: 'Fenêtre de jeu inconnue.' };
			try {
				return { ok: true, value: await fn(s, ...args) };
			} catch (error) {
				return { ok: false, error: error.message };
			}
		});
	}
};

module.exports = { registerScheme, handleProtocol, registerIpc, openEmu, listStates };
