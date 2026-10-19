// Fenêtre Smash Emu autour d'un émulateur externe : la fenêtre de jeu de l'émulateur est incrustée sous la
// barre Smash Emu, qui la pilote (pause, états avec vignettes, turbo, capture, réglages, plein écran).
const { BrowserWindow, ipcMain, screen, shell, globalShortcut, dialog } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const store = require('./store');
const runner = require('./runner');
const emulators = require('./emulators');
const winhelper = require('./winhelper');
const systems = require('./systems');
const games = require('./games');
const switchkeys = require('./switchkeys');

const SRC = path.join(__dirname, '..');
const BAR = 48;
const hosts = new Map(); // id webContents -> hôte
const WIIMOTE_INI = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Dolphin Emulator', 'Config', 'WiimoteNew.ini');

const hwndOf = win => Number(win.getNativeWindowHandle().readBigUInt64LE(0));
const send = (h, channel, value) => { if (!h.closed && !h.win.isDestroyed()) h.win.webContents.send(channel, value); };
const dataUrl = (file, mime) => { try { return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`; } catch { return null; } };

const layout = (h) => {
	if (!h.child || h.win.isDestroyed() || h.panel) return;
	const b = h.win.getContentBounds();
	const sf = screen.getDisplayMatching(h.win.getBounds()).scaleFactor;
	const top = h.win.isFullScreen() || (h.immersive && !h.reveal) ? 0 : BAR;
	winhelper.move(h.child, 0, Math.round(top * sf), Math.round(b.width * sf), Math.round((b.height - top) * sf)).catch(() => {});
};

// Extension branchée à la Wiimote 1 (Dolphin lit WiimoteNew.ini au lancement).
const setExtension = (value) => {
	if (!fs.existsSync(WIIMOTE_INI)) return;
	const txt = fs.readFileSync(WIIMOTE_INI, 'utf8');
	const lines = txt.split(/\r?\n/);
	let inside = false;
	let done = false;
	for (let i = 0; i < lines.length; i++) {
		if (/^\[/.test(lines[i])) inside = lines[i].trim() === '[Wiimote1]';
		if (inside && /^Extension\s*=/.test(lines[i])) { lines[i] = `Extension = ${value}`; done = true; }
	}
	if (!done) { const i = lines.findIndex(l => l.trim() === '[Wiimote1]'); if (i >= 0) lines.splice(i + 1, 0, `Extension = ${value}`); }
	fs.writeFileSync(WIIMOTE_INI, lines.join('\n'));
};

const currentExtension = () => {
	try { const m = fs.readFileSync(WIIMOTE_INI, 'utf8').match(/\[Wiimote1\][\s\S]*?^Extension\s*=\s*(\w+)/m); return m ? m[1] : 'None'; } catch { return 'None'; }
};

// Cherche la fenêtre de jeu de l'émulateur puis l'incruste ; les autres fenêtres du processus sont masquées.
const attach = async (h) => {
	const gen = ++h.gen;
	const ext = emulators.EXTERNAL[h.plan.emulator] || {};
	const deadline = Date.now() + 90000;
	while (Date.now() < deadline && !h.closed && gen === h.gen) {
		const wins = h.proc ? await winhelper.windowsOf(h.proc.pid).catch(() => []) : [];
		const target = wins.find(w => (ext.render ? ext.render(w) : true) && w.w > 200 && w.h > 150);
		if (target) {
			await winhelper.embed(target.hwnd, hwndOf(h.win), 0, BAR, 640, 480);
			h.child = target.hwnd;
			for (const w of wins) if (w.hwnd !== target.hwnd) winhelper.hide(w.hwnd).catch(() => {});
			layout(h);
			send(h, 'ext:state', { attached: true, title: target.title });
			// Les fenêtres secondaires qui réapparaissent (liste de jeux…) sont masquées pendant quelques secondes.
			for (let i = 0; i < 10 && !h.closed && gen === h.gen; i++) {
				await new Promise(r => setTimeout(r, 1000));
				for (const w of await winhelper.windowsOf(h.proc.pid).catch(() => [])) if (w.hwnd !== h.child) winhelper.hide(w.hwnd).catch(() => {});
			}
			return;
		}
		await new Promise(r => setTimeout(r, 700));
	}
	if (!h.closed && gen === h.gen) send(h, 'ext:state', { attached: false, error: 'La fenêtre de jeu de l’émulateur n’est pas apparue.' });
};

const spawnEmu = (h) => {
	const { id, plan } = h;
	const proc = spawn(plan.exe, plan.args, { cwd: plan.cwd, windowsHide: false });
	h.proc = proc;
	proc.stdout.on('data', d => runner.pushLog(id, 'stdout', d.toString()));
	proc.stderr.on('data', d => runner.pushLog(id, 'stderr', d.toString()));
	proc.on('error', e => runner.pushLog(id, 'launcher', `Erreur de lancement : ${e.message}`));
	proc.on('exit', () => { if (h.proc === proc && !h.closed && !h.win.isDestroyed()) h.win.close(); });
};

const killProc = (proc) => { if (proc && proc.exitCode === null) spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f']); };

const openExternalHost = (id, plan) => {
	const win = new BrowserWindow({
		width: 1280, height: 808, minWidth: 640, minHeight: 480, frame: false, backgroundColor: '#000000',
		title: `${plan.name} — Smash Emu`,
		icon: store.windowIcon(),
		webPreferences: { preload: path.join(SRC, 'ext-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
	});
	const wcId = win.webContents.id;
	const h = { id, win, wcId, proc: null, plan, child: null, closed: false, immersive: false, reveal: false, panel: false, paused: false, pausedByPanel: false, gen: 0, frame: null, startedAt: Date.now() };
	hosts.set(wcId, h);
	spawnEmu(h);

	// Raccourcis de l'hôte actifs seulement quand la fenêtre Smash Emu (ou le jeu incrusté) a le focus.
	const hotkeys = { 'CommandOrControl+P': 'panel', F11: 'fullscreen', 'CommandOrControl+M': 'immersive', 'CommandOrControl+Shift+S': 'screenshot' };
	const bind = () => { for (const [k, name] of Object.entries(hotkeys)) { try { globalShortcut.register(k, () => send(h, 'ext:hotkey', name)); } catch { /* raccourci pris */ } } };
	const unbind = () => { for (const k of Object.keys(hotkeys)) { try { globalShortcut.unregister(k); } catch { /* ignoré */ } } };
	win.on('focus', bind);
	win.on('blur', unbind);
	bind();

	// Barre qui réapparaît quand le curseur touche le haut de la fenêtre en mode immersif.
	const poll = setInterval(() => {
		if (h.closed || win.isDestroyed() || !h.immersive || h.panel || win.isMinimized()) return;
		const p = screen.getCursorScreenPoint();
		const b = win.getBounds();
		const inside = p.x >= b.x && p.x <= b.x + b.width;
		const want = inside && p.y >= b.y && p.y <= b.y + (h.reveal ? BAR + 40 : 6);
		if (want !== h.reveal) { h.reveal = want; send(h, 'ext:bar', want); layout(h); }
	}, 150);

	win.on('closed', () => {
		h.closed = true;
		clearInterval(poll);
		unbind();
		hosts.delete(wcId);
		killProc(h.proc);
	});
	for (const ev of ['resize', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'restore']) win.on(ev, () => layout(h));
	win.on('enter-full-screen', () => send(h, 'ext:fullscreen', true));
	win.on('leave-full-screen', () => send(h, 'ext:fullscreen', false));
	win.webContents.on('will-navigate', e => e.preventDefault());
	win.loadURL('smash://app/emu/external.html');
	win.webContents.once('did-finish-load', () => attach(h));
	return win;
};

// ---------- Actions de la barre ----------

const hk = h => (emulators.EXTERNAL[h.plan.emulator] || {}).hotkeys || {};
const slotsDir = h => path.join(store.instanceDir(h.id), 'ext-slots');
const slotsIndex = (h) => { try { return JSON.parse(fs.readFileSync(path.join(slotsDir(h), 'index.json'), 'utf8')); } catch { return {}; } };
const options = h => (store.getInstance(h.id).options || {});

const press = async (h, name, arg) => {
	const k = hk(h);
	const spec = { pause: k.pause, turboDown: k.turboDown, turboUp: k.turboUp, undo: k.undoLoad, save: k.save && k.save(arg || 1), load: k.load && k.load(arg || 1) }[name];
	if (!spec) throw new Error('Action non prise en charge par cet émulateur.');
	await winhelper.keys(spec);
	if (name === 'pause') h.paused = !h.paused;
};

const shotTo = async (h, file, width = 0) => {
	if (!h.child) throw new Error('Jeu pas encore affiché.');
	fs.mkdirSync(path.dirname(file), { recursive: true });
	await winhelper.shot(h.child, file, width);
	return file;
};

const saveSlot = async (h, n, thumbFile) => {
	await press(h, 'save', n);
	fs.mkdirSync(slotsDir(h), { recursive: true });
	const dest = path.join(slotsDir(h), `slot-${n}.jpg`);
	if (thumbFile && fs.existsSync(thumbFile)) fs.copyFileSync(thumbFile, dest);
	else if (!h.panel) await shotTo(h, dest, 320);
	const idx = slotsIndex(h);
	idx[n] = { at: Date.now() };
	fs.writeFileSync(path.join(slotsDir(h), 'index.json'), JSON.stringify(idx));
};

const relaunch = async (h) => {
	h.gen++;
	h.child = null;
	h.paused = false;
	h.pausedByPanel = false;
	h.panel = false;
	const old = h.proc;
	h.proc = null;
	killProc(old);
	await new Promise(r => setTimeout(r, 900));
	h.plan = games.prepareLaunch(h.id);
	send(h, 'ext:state', { waiting: true });
	spawnEmu(h);
	attach(h);
};

const ACTIONS = {
	config: (h) => {
		const ext = emulators.EXTERNAL[h.plan.emulator] || {};
		const k = ext.hotkeys || {};
		const o = options(h);
		const idx = slotsIndex(h);
		return {
			name: h.plan.name, emulator: ext.label || h.plan.emulator, emulatorId: h.plan.emulator, system: (systems.SYSTEMS[h.plan.system] || {}).label || '',
			systemId: h.plan.system, theme: store.themeFor(store.getInstance(h.id), h.plan.system), logo: store.getSettings().logo || 'classic', fontMode: store.getSettings().fontMode || 'titles',
			can: { pause: !!k.pause, states: !!k.save, turbo: !!k.turboDown, undo: !!k.undoLoad, tune: !!ext.tunable },
			slots: k.slots || 1,
			shaders: ext.shaders || [],
			opts: { ...(o.dolphin || {}), shader: (o.dolphin || {}).shader || o.externalShader || 'FXAA' },
			extension: ext.tunable && h.plan.system === 'wii' ? currentExtension() : null,
			startedAt: h.startedAt,
			slotInfo: Object.fromEntries(Object.entries(idx).map(([n, v]) => [n, { at: v.at, thumb: dataUrl(path.join(slotsDir(h), `slot-${n}.jpg`), 'image/jpeg') }])),
		};
	},
	key: (h, name, arg) => press(h, name, arg),
	screenshot: async (h) => shotTo(h, path.join(store.instanceDir(h.id), 'screenshots', `capture-${new Date().toISOString().replace(/[:.]/g, '-')}.png`)),
	quickSave: async (h, n) => { await saveSlot(h, n); return ACTIONS.config(h).slotInfo[n]; },
	loadSlot: (h, n) => press(h, 'load', n),
	// Panneau : image figée du jeu en fond, fenêtre du jeu masquée, jeu en pause.
	panelOpen: async (h) => {
		if (h.panel) return null;
		let frame = null;
		if (h.child) {
			h.frame = path.join(os.tmpdir(), `smash-ext-${h.id}.jpg`);
			try { await shotTo(h, h.frame, 1100); frame = dataUrl(h.frame, 'image/jpeg'); } catch { h.frame = null; }
			winhelper.hide(h.child).catch(() => {});
		}
		h.panel = true;
		if (!h.paused && hk(h).pause) { await press(h, 'pause'); h.pausedByPanel = true; }
		return { frame, paused: h.paused, slotInfo: ACTIONS.config(h).slotInfo };
	},
	panelClose: async (h) => {
		if (!h.panel) return;
		h.panel = false;
		layout(h);
		await winhelper.focus(h.child).catch(() => {});
		if (h.pausedByPanel) { h.pausedByPanel = false; await press(h, 'pause'); }
	},
	panelSave: async (h, n) => { await saveSlot(h, n, h.frame); return ACTIONS.config(h).slotInfo[n]; },
	// Réglages Dolphin : enregistrés dans l'instance puis appliqués en relançant l'émulateur.
	apply: async (h, opts, extension) => {
		const inst = store.getInstance(h.id);
		const clean = {};
		for (const k of ['res', 'aspect', 'wide', 'fps', 'hires', 'aniso', 'vsync', 'speed', 'volume', 'oc', 'shader']) if (opts && opts[k] !== undefined && opts[k] !== null) clean[k] = opts[k];
		store.updateInstance(h.id, { options: { ...(inst.options || {}), dolphin: clean } });
		if (extension) { if (!['None', 'Nunchuk', 'Classic'].includes(extension)) throw new Error('Extension inconnue.'); setExtension(extension); }
		await relaunch(h);
	},
	// Clés Switch (Ryujinx) : état et import depuis le panneau.
	switchStatus: () => switchkeys.status(),
	switchImport: async (h) => {
		const r = await dialog.showOpenDialog(h.win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Clés Switch', extensions: ['keys'] }] });
		return r.canceled ? null : switchkeys.importKeys(r.filePaths);
	},
	showPath: (h, file) => { if (path.resolve(file).startsWith(store.instanceDir(h.id))) shell.showItemInFolder(file); },
	openFolder: (h) => { const d = path.join(store.instanceDir(h.id), 'screenshots'); fs.mkdirSync(d, { recursive: true }); return shell.openPath(d); },
	immersive: (h, on) => { h.immersive = !!on; h.reveal = false; layout(h); },
	top: (h, on) => { h.win.setAlwaysOnTop(!!on, 'floating'); return !!on; },
	window: (h, action) => {
		const w = h.win;
		if (action === 'minimize') w.minimize();
		if (action === 'maximize') (w.isMaximized() ? w.unmaximize() : w.maximize());
		if (action === 'fullscreen') w.setFullScreen(!w.isFullScreen());
		if (action === 'mini') { w.unmaximize(); w.setFullScreen(false); w.setSize(640, 428); }
		if (action === 'close') w.close();
		if (action === 'focus-game' && h.child && !h.panel) winhelper.focus(h.child).catch(() => {});
	},
};

const registerIpc = () => {
	for (const [name, fn] of Object.entries(ACTIONS)) {
		ipcMain.handle(`ext:${name}`, async (event, ...args) => {
			const h = hosts.get(event.sender.id);
			if (!h) return { ok: false, error: 'Fenêtre inconnue.' };
			try { return { ok: true, value: await fn(h, ...args) }; } catch (error) { return { ok: false, error: error.message }; }
		});
	}
};

module.exports = { openExternalHost, registerIpc };
