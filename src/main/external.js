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
const netplay = require('./netplay');

// Capture d'image demandée par une fenêtre hôte (jeu à distance) : uniquement sa propre fenêtre, et le son du PC.
const allowCapture = () => {
	// La fenêtre de l'émulateur est incrustée : Windows ne la capture pas avec la fenêtre Smash Emu. On capture
	// donc l'écran qui contient la fenêtre, et la page découpe exactement la zone du jeu (ext:captureRect).
	const { session, webContents, desktopCapturer } = require('electron');
	session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
		const wc = request.frame && webContents.fromFrame(request.frame);
		const h = wc && hosts.get(wc.id);
		if (!h || h.win.isDestroyed()) { callback({}); return; }
		const display = screen.getDisplayMatching(h.win.getBounds());
		const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
		const src = sources.find(s => s.display_id === String(display.id)) || sources[0];
		callback({ video: src, audio: 'loopback' });
	});
};

const SRC = path.join(__dirname, '..');
const BAR = 48;
const hosts = new Map(); // id webContents -> hôte
const remoteHosts = new Set(); // jeux lancés pour être hébergés à distance
const markRemoteHost = id => remoteHosts.add(id);
const WIIMOTE_INI = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Dolphin Emulator', 'Config', 'WiimoteNew.ini');

const hwndOf = win => Number(win.getNativeWindowHandle().readBigUInt64LE(0));
const send = (h, channel, value) => { if (!h.closed && !h.win.isDestroyed()) h.win.webContents.send(channel, value); };
const dataUrl = (file, mime) => { try { return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`; } catch { return null; } };

const layout = (h) => {
	if (!h.child || h.win.isDestroyed() || h.panel) return;
	const b = h.win.getContentBounds();
	const sf = screen.getDisplayMatching(h.win.getBounds()).scaleFactor;
	const top = h.win.isFullScreen() || (h.immersive && !h.reveal) ? 0 : BAR;
	// Panneau « À distance » ouvert à droite : le jeu lui laisse la place.
	const side = Math.min(h.side || 0, b.width - 320);
	winhelper.move(h.child, 0, Math.round(top * sf), Math.round((b.width - Math.max(0, side)) * sf), Math.round((b.height - top) * sf)).catch(() => {});
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
		// Les boîtes de dialogue (BIOS manquant, erreur, assistant) ne sont jamais incrustées ni masquées :
		// elles passent au premier plan pour que le joueur puisse y répondre.
		const dialogs = wins.filter(w => w.dialog);
		const target = wins.find(w => !w.dialog && (ext.render ? ext.render(w) : true) && w.w > 200 && w.h > 150);
		if (target) {
			await winhelper.embed(target.hwnd, hwndOf(h.win), 0, BAR, 640, 480);
			h.child = target.hwnd;
			for (const w of wins) if (w.hwnd !== target.hwnd && !w.dialog) winhelper.hide(w.hwnd).catch(() => {});
			layout(h);
			send(h, 'ext:state', { attached: true, title: target.title });
			// Lancé depuis « Héberger une partie » : le panneau d'invitation s'ouvre une fois le jeu affiché.
			if (remoteHosts.delete(h.id)) setTimeout(() => send(h, 'ext:hotkey', 'remote'), 1500);
			// Affiché mais bloqué (écran noir faute de BIOS ou de firmware) : on prévient le joueur.
			setTimeout(() => {
				if (h.closed || gen !== h.gen) return;
				const lines = lastLines(h).filter(l => /bios|firmware|keys?\b|prod\.keys/i.test(l));
				if (lines.length) send(h, 'ext:notice', { text: requirement(h), lines });
			}, 8000);
			// Les fenêtres secondaires qui réapparaissent (liste de jeux…) sont masquées pendant quelques secondes.
			for (let i = 0; i < 10 && !h.closed && gen === h.gen; i++) {
				await new Promise(r => setTimeout(r, 1000));
				for (const w of await winhelper.windowsOf(h.proc.pid).catch(() => [])) {
					if (w.hwnd === h.child) continue;
					if (w.dialog) winhelper.focus(w.hwnd).catch(() => {});
					else winhelper.hide(w.hwnd).catch(() => {});
				}
			}
			return;
		}
		if (dialogs.length && !h.dialogShown) {
			h.dialogShown = true;
			winhelper.focus(dialogs[0].hwnd).catch(() => {});
			send(h, 'ext:state', { waiting: true, dialog: dialogs[0].title || 'Fenêtre de l’émulateur' });
		}
		if (!dialogs.length) h.dialogShown = false;
		// Rien après 25 s : l'émulateur attend sans doute un réglage (BIOS, firmware…).
		if (!h.slowSent && Date.now() - h.spawnedAt > 25000) { h.slowSent = true; send(h, 'ext:state', { slow: true, hint: requirement(h) }); }
		await new Promise(r => setTimeout(r, 700));
	}
	if (!h.closed && gen === h.gen) send(h, 'ext:state', { attached: false, failed: true, error: 'La fenêtre de jeu de l’émulateur n’est pas apparue.', hint: requirement(h), lines: lastLines(h) });
};

// Ce qu'il faut à l'émulateur pour démarrer un jeu (affiché quand il ne s'ouvre pas).
const REQUIREMENTS = {
	pcsx2: 'PCSX2 a besoin du BIOS de ta PlayStation 2 : ouvre PCSX2, puis Paramètres → BIOS, et choisis le dossier qui le contient.',
	rpcs3: 'RPCS3 a besoin du firmware PS3 officiel (PS3UPDAT.PUP, gratuit sur le site de Sony) : ouvre RPCS3, puis Fichier → Installer le firmware. Le jeu doit être un dossier PS3_GAME ou un .pkg/.iso valide.',
	xemu: 'xemu a besoin du BIOS, du MCPX boot ROM et du disque dur de ta Xbox : ouvre xemu, puis Machine → Paramètres → Système.',
	shadps4: 'shadPS4 lance les jeux PS4 copiés depuis ta console (dossier CUSA… avec eboot.bin et sce_sys). Beaucoup de jeux ne marchent pas encore.',
	xenia: 'Xenia lance les jeux Xbox 360 (.iso, .xex, dossiers GOD/STFS). Vérifie que le fichier vient bien de ton disque.',
	ryujinx: 'Ryujinx a besoin des clés (prod.keys) et du firmware de ta Switch : importe les clés dans Paramètres, puis installe le firmware dans Ryujinx (Outils).',
	azahar: 'Azahar lance les jeux 3DS décryptés (.3ds, .cci, .cxi, .3dsx).',
	cemu: 'Cemu lance les jeux Wii U (.wua, .wud, .wux, .rpx) ; certains jeux demandent les clés de ta console (keys.txt).',
	dolphin: 'Vérifie que le fichier est bien un jeu GameCube ou Wii (.iso, .rvz, .wbfs…).',
	duckstation: 'DuckStation a besoin du BIOS de ta PlayStation : ouvre DuckStation, puis Paramètres → BIOS.',
	ppsspp: 'Vérifie que le fichier est bien un jeu PSP (.iso, .cso).',
};
const requirement = h => [h.plan.notice, REQUIREMENTS[h.plan.emulator] || (emulators.EXTERNAL[h.plan.emulator] || {}).note || ''].filter(Boolean).join(' ');

// Dernières lignes utiles du journal (erreurs de l'émulateur), pour expliquer un échec.
const lastLines = (h, n = 4) => {
	let logs = [];
	try { logs = runner.getLogs(h.id) || []; } catch { /* pas de journal */ }
	return logs.filter(l => l.stream !== 'launcher' && /error|erreur|fail|échec|missing|not found|invalid|not valid|corrupt|critical|bios|firmware|key/i.test(l.line) && !/warning|\bwarn\b|<info>|\[info\]/i.test(l.line)).slice(-n).map(l => l.line.trim().slice(0, 220));
};

const spawnEmu = (h) => {
	const { id, plan } = h;
	// Émulateur qui affiche le jeu dans une fenêtre à part : lancé caché, sa fenêtre principale ne se montre jamais.
	const hide = !!(emulators.EXTERNAL[plan.emulator] || {}).hideMain && plan.embed !== false;
	const proc = spawn(plan.exe, plan.args, { cwd: plan.cwd, windowsHide: hide });
	h.proc = proc;
	h.spawnedAt = Date.now();
	h.slowSent = false;
	h.failed = false;
	proc.stdout.on('data', d => runner.pushLog(id, 'stdout', d.toString()));
	proc.stderr.on('data', d => runner.pushLog(id, 'stderr', d.toString()));
	proc.on('error', e => runner.pushLog(id, 'launcher', `Erreur de lancement : ${e.message}`));
	proc.on('exit', (code) => {
		if (h.proc !== proc || h.closed || h.win.isDestroyed()) return;
		// Fermé avant d'afficher le jeu, ou juste après (jeu illisible, BIOS absent) : la fenêtre reste ouverte
		// pour expliquer pourquoi.
		if (!h.child || Date.now() - h.spawnedAt < 20000) {
			h.failed = true;
			h.child = null;
			h.gen++;
			send(h, 'ext:state', { attached: false, failed: true, error: `${(emulators.EXTERNAL[plan.emulator] || {}).label || plan.emulator} s’est fermé sans lancer le jeu${code && code < 256 ? ` (code ${code})` : ''}.`, hint: requirement(h), lines: lastLines(h) });
			return;
		}
		h.win.close();
	});
};

// Ouvre l'émulateur seul (sans jeu, avec sa propre interface) pour régler BIOS, firmware, manettes…
const openNative = (h) => {
	const p = spawn(h.plan.exe, [], { cwd: h.plan.cwd, detached: true, stdio: 'ignore', windowsHide: false });
	p.unref();
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
	const hotkeys = { 'CommandOrControl+J': 'remote', 'CommandOrControl+P': 'panel', F11: 'fullscreen', 'CommandOrControl+M': 'immersive', 'CommandOrControl+Shift+S': 'screenshot' };
	const bind = () => { for (const [k, name] of Object.entries(hotkeys)) { try { globalShortcut.register(k, () => send(h, 'ext:hotkey', name)); } catch { /* raccourci pris */ } } };
	const unbind = () => { for (const k of Object.keys(hotkeys)) { try { globalShortcut.unregister(k); } catch { /* ignoré */ } } };
	win.on('focus', () => {
		bind();
		send(h, 'ext:front', true);
		// Retour à Smash Emu après les réglages des manettes : la fenêtre de l'émulateur se recache.
		if (h.mainShown) { winhelper.hide(h.mainShown).catch(() => {}); h.mainShown = null; send(h, 'ext:controlsDone', true); }
	});
	win.on('blur', () => { unbind(); send(h, 'ext:front', false); });
	win.on('minimize', () => send(h, 'ext:front', false));
	bind();
	h.bind = bind;
	h.unbind = unbind;

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

// ---------- Manette du joueur 2 dans Dolphin (jeu à distance) ----------
// Les commandes de l'ami arrivent comme des touches du pavé numérique et de lettres libres ; la manette 2 de
// Dolphin (GameCube et Wiimote) est réglée sur ces touches. Dolphin lit le clavier même sans le focus.

const P2 = {
	a: 'NUMPAD0', b: 'NUMPAD1', x: 'NUMPAD2', y: 'NUMPAD3', start: 'NUMPAD4', select: 'NUMPAD5', l: 'NUMPAD6', r: 'NUMPAD7', l2: 'NUMPAD8', r2: 'NUMPAD9', home: 'MULTIPLY',
	up: 'Y', down: 'U', left: 'O', right: 'P', lsU: 'V', lsD: 'B', lsL: 'N', lsR: 'M', rsU: 'ADD', rsD: 'SUBTRACT', rsL: 'DECIMAL', rsR: 'R',
};
const P2_KEY_NAMES = new Set(Object.values(P2));
const MARK = 'SmashEmuRemote';

const dolphinCfg = () => {
	const exe = emulators.pathFor('dolphin');
	if (!exe) throw new Error('Dolphin introuvable.');
	return path.join(netplay.userDir(exe), 'Config');
};

const dolphinP2State = () => {
	try { return netplay.readIni(path.join(dolphinCfg(), 'WiimoteNew.ini'), 'Wiimote2')['Smash'] === MARK ? (netplay.readIni(path.join(dolphinCfg(), 'WiimoteNew.ini'), 'Wiimote2').Extension || 'Nunchuk') : null; } catch { return null; }
};

const dolphinP2 = (kind = 'Nunchuk') => {
	const dir = dolphinCfg();
	const ext = ['Nunchuk', 'Classic', 'None'].includes(kind) ? kind : 'Nunchuk';
	const kb = 'DInput/0/Keyboard Mouse';
	netplay.setIni(path.join(dir, 'GCPadNew.ini'), 'GCPad2', {
		Device: kb, 'Buttons/A': P2.a, 'Buttons/B': P2.b, 'Buttons/X': P2.x, 'Buttons/Y': P2.y, 'Buttons/Z': P2.r, 'Buttons/Start': P2.start,
		'Main Stick/Up': P2.lsU, 'Main Stick/Down': P2.lsD, 'Main Stick/Left': P2.lsL, 'Main Stick/Right': P2.lsR,
		'C-Stick/Up': P2.rsU, 'C-Stick/Down': P2.rsD, 'C-Stick/Left': P2.rsL, 'C-Stick/Right': P2.rsR,
		'Triggers/L': P2.l2, 'Triggers/R': P2.r2, 'D-Pad/Up': P2.up, 'D-Pad/Down': P2.down, 'D-Pad/Left': P2.left, 'D-Pad/Right': P2.right,
	});
	netplay.setIni(path.join(dir, 'WiimoteNew.ini'), 'Wiimote2', {
		Smash: MARK, Device: kb, Source: 1, Extension: ext,
		'Buttons/A': P2.a, 'Buttons/B': P2.b, 'Buttons/1': P2.x, 'Buttons/2': P2.y, 'Buttons/+': P2.start, 'Buttons/-': P2.select, 'Buttons/Home': P2.home,
		'D-Pad/Up': P2.up, 'D-Pad/Down': P2.down, 'D-Pad/Left': P2.left, 'D-Pad/Right': P2.right,
		'Shake/X': P2.r, 'Shake/Y': P2.r, 'Shake/Z': P2.r,
		'Nunchuk/Buttons/C': P2.l, 'Nunchuk/Buttons/Z': P2.l2,
		'Nunchuk/Stick/Up': P2.lsU, 'Nunchuk/Stick/Down': P2.lsD, 'Nunchuk/Stick/Left': P2.lsL, 'Nunchuk/Stick/Right': P2.lsR,
		'Classic/Buttons/A': P2.a, 'Classic/Buttons/B': P2.b, 'Classic/Buttons/X': P2.x, 'Classic/Buttons/Y': P2.y,
		'Classic/Buttons/ZL': P2.l2, 'Classic/Buttons/ZR': P2.r2, 'Classic/Buttons/-': P2.select, 'Classic/Buttons/+': P2.start, 'Classic/Buttons/Home': P2.home,
		'Classic/Triggers/L': P2.l, 'Classic/Triggers/R': P2.r,
		'Classic/D-Pad/Up': P2.up, 'Classic/D-Pad/Down': P2.down, 'Classic/D-Pad/Left': P2.left, 'Classic/D-Pad/Right': P2.right,
		'Classic/Left Stick/Up': P2.lsU, 'Classic/Left Stick/Down': P2.lsD, 'Classic/Left Stick/Left': P2.lsL, 'Classic/Left Stick/Right': P2.lsR,
		'Classic/Right Stick/Up': P2.rsU, 'Classic/Right Stick/Down': P2.rsD, 'Classic/Right Stick/Left': P2.rsL, 'Classic/Right Stick/Right': P2.rsR,
	});
	// Port manette 2 de la GameCube : manette standard.
	const ini = path.join(dir, 'Dolphin.ini');
	if ((netplay.readIni(ini, 'Core').SIDevice1 || '0') === '0') netplay.setIni(ini, 'Core', { SIDevice1: 6 });
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
	// Raccourci de l'émulateur identique à un raccourci Smash Emu (Ctrl+P pour RPCS3) : libéré le temps de l'envoi.
	const clash = /^CTRL\+(P|M)$/i.test(spec);
	if (clash && h.unbind) h.unbind();
	try { await winhelper.keys(spec); } finally { if (clash && h.bind && h.win.isFocused()) h.bind(); }
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
	send(h, 'ext:state', { waiting: true, notice: h.plan.notice });
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
			systemId: h.plan.system, theme: store.themeFor(store.getInstance(h.id), h.plan.system), logo: store.getSettings().logo || 'classic', fontMode: store.getSettings().fontMode || 'titles', customThemes: store.getSettings().customThemes || [],
			can: { pause: !!k.pause, states: !!k.save, turbo: !!k.turboDown, undo: !!k.undoLoad, tune: !!ext.tunable, remote: true },
			slots: k.slots || 1,
			keysHint: ext.keysHint || '',
			remote: true,
			playerName: store.getSettings().playerName || 'Hôte',
			systemLabel: (systems.SYSTEMS[h.plan.system] || {}).label || '',
			requirement: requirement(h),
			// Jeu connu pour être trop récent pour l'émulateur : affiché dès l'écran d'attente.
			notice: h.plan.notice || null,
			// Écran de chargement : jaquette (ou fond d'écran choisi) du jeu en fond.
			cover: (() => { const i = store.getInstance(h.id) || {}; const f = i.bgFile || i.coverFile; return f ? dataUrl(f, /\.png$/i.test(f) ? 'image/png' : /\.webp$/i.test(f) ? 'image/webp' : 'image/jpeg') : null; })(),
			shaders: ext.shaders || [],
			opts: { ...(o.dolphin || {}), shader: (o.dolphin || {}).shader || o.externalShader || 'FXAA' },
			extension: ext.tunable && h.plan.system === 'wii' ? currentExtension() : null,
			startedAt: h.startedAt,
			slotInfo: Object.fromEntries(Object.entries(idx).map(([n, v]) => [n, { at: v.at, thumb: dataUrl(path.join(slotsDir(h), `slot-${n}.jpg`), 'image/jpeg') }])),
		};
	},
	key: (h, name, arg) => press(h, name, arg),
	openNative: (h) => openNative(h),
	// Manettes : réglages de l'émulateur ouverts devant le jeu (Citron et Eden : leur fenêtre principale, cachée
	// pendant la partie, réapparaît) ; elle se recache quand on revient à la fenêtre Smash Emu.
	controls: async (h) => {
		if (!(emulators.EXTERNAL[h.plan.emulator] || {}).hideMain || !h.proc) { openNative(h); return 'native'; }
		const hwnd = await winhelper.showMain(h.proc.pid, h.child);
		if (!hwnd) throw new Error('Fenêtre de réglages introuvable.');
		h.mainShown = hwnd;
		return 'shown';
	},
	// Jeu à distance : place du panneau, touches du joueur 2, préparation de sa manette dans Dolphin.
	side: (h, px) => { h.side = Math.max(0, Math.min(600, Number(px) || 0)); layout(h); },
	padKey: (h, key, down) => {
		if (!P2_KEY_NAMES.has(key)) throw new Error('Touche inconnue.');
		return winhelper.keys(`${key}:${down ? 'down' : 'up'}`);
	},
	remotePrepare: async (h, kind) => {
		if (h.plan.emulator !== 'dolphin') throw new Error('Réservé à Dolphin.');
		dolphinP2(kind);
		await relaunch(h);
		return true;
	},
	remoteInfo: () => ({ prepared: dolphinP2State() }),
	// Zone de la fenêtre sur son écran (en pixels logiques), pour découper l'image envoyée à l'ami.
	// « front » : la fenêtre du jeu est au premier plan. Sinon, rien n'est envoyé (l'écran pourrait montrer autre chose).
	captureRect: async (h) => {
		const b = h.win.getContentBounds();
		const d = screen.getDisplayMatching(h.win.getBounds());
		const fg = Number(await winhelper.foreground().catch(() => 0));
		return { x: b.x - d.bounds.x, y: b.y - d.bounds.y, w: b.width, h: b.height, dw: d.bounds.width, front: !h.win.isMinimized() && fg === hwndOf(h.win) };
	},
	retry: (h) => relaunch(h),
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
	// Clés Switch : état et import depuis le panneau.
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
	allowCapture();
	for (const [name, fn] of Object.entries(ACTIONS)) {
		ipcMain.handle(`ext:${name}`, async (event, ...args) => {
			const h = hosts.get(event.sender.id);
			if (!h) return { ok: false, error: 'Fenêtre inconnue.' };
			try { return { ok: true, value: await fn(h, ...args) }; } catch (error) { return { ok: false, error: error.message }; }
		});
	}
};

module.exports = { openExternalHost, registerIpc, markRemoteHost };
