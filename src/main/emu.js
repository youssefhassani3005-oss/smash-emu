// Émulateur intégré (EmulatorJS + mupen64plus) : protocole smash://, fenêtre de jeu, états sauvegardés sur disque.
const { BrowserWindow, protocol, net, ipcMain, shell, session: electronSession } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const store = require('./store');
const runner = require('./runner');
const saves = require('./saves');

const APP_ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(APP_ROOT, 'src');
const MODULES = path.join(APP_ROOT, 'node_modules');
const EJS_DATA = path.join(MODULES, '@emulatorjs', 'emulatorjs', 'data');
const CORES_DIR = path.join(MODULES, '@emulatorjs');
const systems = require('./systems');
const SLOTS = 8;

// Instances à lancer en mode « jeu à distance » (le panneau d'invitation s'ouvre au démarrage).
const remoteHosts = new Set();
const markRemoteHost = id => remoteHosts.add(id);

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

// Informations d'un état : date et temps de jeu total au moment de la sauvegarde (fichier .json voisin).
const stateInfo = (file, json) => {
	let info = {};
	try { info = JSON.parse(fs.readFileSync(json, 'utf8')) || {}; } catch { /* anciens états sans informations */ }
	return { savedAt: info.savedAt || fs.statSync(file).mtimeMs, playTimeMs: typeof info.playTimeMs === 'number' ? info.playTimeMs : null };
};

const thumbOf = (png) => { try { return 'data:image/png;base64,' + fs.readFileSync(png).toString('base64'); } catch { return null; } };

const listStates = (id) => {
	const out = [];
	for (let slot = 1; slot <= SLOTS; slot++) {
		const state = slotFile(id, slot, 'state');
		if (!fs.existsSync(state)) { out.push({ slot, empty: true }); continue; }
		out.push({ slot, empty: false, ...stateInfo(state, slotFile(id, slot, 'json')), thumb: thumbOf(slotFile(id, slot, 'png')) });
	}
	return out;
};

// Temps de jeu total de l'instance, partie en cours comprise.
const playedMs = s => (store.getInstance(s.id).playTimeMs || 0) + (Date.now() - s.startedAt);

// Reprise : état enregistré automatiquement à la fermeture, proposé au lancement suivant.
const resumeFile = (id, ext) => path.join(statesDir(id), `resume.${ext}`);
const resumeInfo = (id) => {
	const file = resumeFile(id, 'state');
	if (!fs.existsSync(file)) return null;
	return { ...stateInfo(file, resumeFile(id, 'json')), thumb: thumbOf(resumeFile(id, 'png')) };
};

// ---------- Captures et vidéos : « <Jeu> 2026-10-19 21-03-05.png » dans le dossier de l'instance ----------

const mediaFile = (s, kind, ext) => {
	const inst = store.getInstance(s.id);
	const info = inst.rom && inst.rom.info;
	const game = ((info && (info.known || info.title)) || inst.name || 'Jeu').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Jeu';
	const d = new Date();
	const p2 = n => String(n).padStart(2, '0');
	const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}-${p2(d.getMinutes())}-${p2(d.getSeconds())}`;
	const dir = path.join(store.instanceDir(s.id), kind);
	fs.mkdirSync(dir, { recursive: true });
	let file = path.join(dir, `${game} ${stamp}.${ext}`);
	for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, `${game} ${stamp} (${i}).${ext}`);
	return file;
};

// ---------- Macros et films d'entrées (voir src/emu/inputs.js) ----------

const MAX_EVENTS = 200000;
// Une entrée : image (relative), joueur 0-3, bouton 0-29, valeur (0/1, ou ±32767 pour les sticks).
const cleanEvents = (events) => {
	if (!Array.isArray(events) || events.length > MAX_EVENTS) throw new Error('Séquence d’entrées invalide.');
	return events.map((e) => {
		const ev = { f: Math.trunc(+e.f), p: Math.trunc(+e.p), i: Math.trunc(+e.i), v: Math.trunc(+e.v) };
		if (!(ev.f >= 0 && ev.p >= 0 && ev.p <= 3 && ev.i >= 0 && ev.i <= 29 && Math.abs(ev.v) <= 0x7fff)) throw new Error('Entrée invalide dans la séquence.');
		return ev;
	});
};
const macrosFile = id => path.join(store.instanceDir(id), 'macros.json');
const moviesDir = id => path.join(store.instanceDir(id), 'movies');
const MOVIE_NAME = /^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}-[0-9]{2}-[0-9]{2}$/;

// ---------- Sauvegardes en jeu (voir saves.js) ----------

// Contexte d'une sauvegarde : dossier local, miroir cloud éventuel, nombre de copies de secours.
const saveCtx = (id, sessionStart = 0) => {
	const s = store.getSettings();
	const dir = (s.savesSyncDir || '').trim();
	const keep = Number.isInteger(s.saveBackups) ? Math.max(0, Math.min(100, s.saveBackups)) : saves.DEFAULT_KEEP;
	return {
		local: saves.local(store.instanceDir(id)),
		cloud: dir && fs.existsSync(dir) ? saves.cloud(dir, id) : null,
		cloudMissing: !!dir && !fs.existsSync(dir),
		opts: { keep, sessionStart },
	};
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
		icon: store.windowIcon(),
		webPreferences: {
			preload: path.join(SRC, 'emu-preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			autoplayPolicy: 'no-user-gesture-required',
			backgroundThrottling: false,
		},
	});
	const session = { id, token, biosToken, win, ready: false, name: plan.name, plan, startedAt: Date.now(), remoteHost: remoteHosts.delete(id) };
	const wcId = win.webContents.id;
	sessions.set(wcId, session);

	// Laisse la page enregistrer les sauvegardes en jeu avant de fermer (2,5 s maximum).
	win.on('close', (e) => {
		if (session.ready) return;
		e.preventDefault();
		if (session.closing) return;
		session.closing = setTimeout(() => { session.ready = true; if (!win.isDestroyed()) win.close(); }, 5000);
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
			// Le nom du fichier sert de nom à la sauvegarde en jeu dans EmulatorJS : un nom par instance, sinon
			// tous les jeux d'une même console partageraient la même sauvegarde.
			romUrl: `smash://rom/${s.token}/${s.id.replace(/[^a-z0-9-]/gi, '-') || 'game'}${path.extname(s.plan.rom).toLowerCase() || '.z64'}`,
			biosUrl: s.biosToken ? `smash://rom/${s.biosToken}/${path.basename(s.plan.bios)}` : null,
			system: s.plan.system || 'n64',
			systemLabel: (systems.SYSTEMS[s.plan.system || 'n64'] || {}).label || 'N64',
			ejs: s.plan.ejs || 'n64',
			core: s.plan.core || 'mupen64plus_next',
			threads: !!s.plan.threads,
			theme: store.themeFor(inst, s.plan.system || 'n64'),
			logo: settings.logo || 'classic',
			fontMode: settings.fontMode || 'titles',
			playerName: settings.playerName || 'Hôte',
			remoteHost: !!s.remoteHost,
			volume: typeof inst.options.emuVolume === 'number' ? inst.options.emuVolume : settings.emuVolume,
			slots: listStates(s.id),
			activeSlot: inst.options.emuSlot || 1,
			resume: { mode: ['ask', 'auto', 'off'].includes(settings.resumeMode) ? settings.resumeMode : 'ask', info: resumeInfo(s.id) },
		};
	},
	'emu:listStates': s => listStates(s.id),
	'emu:controls': s => require('./controls').forPlayer(s.plan.system || 'n64', s.id),
	// Boutons de la console (pour le bot) et mémoire du bot entre deux sessions.
	'emu:buttons': s => require('./controls').get(s.plan.system || 'n64').buttons.filter(b => b.id < 24),
	'emu:botMemory': (s) => { try { return JSON.parse(fs.readFileSync(path.join(store.instanceDir(s.id), 'bot.json'), 'utf8')); } catch { return null; } },
	'emu:setBotMemory': (s, mem) => {
		const q = mem && typeof mem.q === 'object' ? mem.q : {};
		const clean = {};
		for (const [k, v] of Object.entries(q).slice(0, 2000)) if (/^[0-9,-]{1,20}$/.test(k) && Number.isFinite(v)) clean[k] = Math.max(-10, Math.min(10, v));
		const out = { q: clean, cells: Math.max(0, Math.trunc(+mem.cells || 0)), frames: Math.max(0, Math.trunc(+mem.frames || 0)), sessions: Math.max(0, Math.trunc(+mem.sessions || 0)) };
		fs.writeFileSync(path.join(store.instanceDir(s.id), 'bot.json'), JSON.stringify(out));
		return true;
	},
	'emu:saveState': (s, slot, state, png) => {
		slot = checkSlot(slot);
		fs.mkdirSync(statesDir(s.id), { recursive: true });
		fs.writeFileSync(slotFile(s.id, slot, 'state'), Buffer.from(state));
		if (png && png.length) fs.writeFileSync(slotFile(s.id, slot, 'png'), Buffer.from(png));
		fs.writeFileSync(slotFile(s.id, slot, 'json'), JSON.stringify({ savedAt: Date.now(), playTimeMs: playedMs(s) }));
		return listStates(s.id);
	},
	'emu:loadState': (s, slot) => {
		const file = slotFile(s.id, checkSlot(slot), 'state');
		if (!fs.existsSync(file)) throw new Error('Cet emplacement est vide.');
		return fs.readFileSync(file);
	},
	// Charge de la fenêtre de jeu (processus de rendu) et du processus graphique, pour l'overlay de statistiques.
	'emu:metrics': (s) => {
		const { app } = require('electron');
		const pid = s.win.webContents.getOSProcessId();
		const all = app.getAppMetrics();
		const me = all.find(m => m.pid === pid);
		const gpu = all.find(m => m.type === 'GPU');
		// Temps processeur cumulé (secondes) → pourcentage d'un cœur depuis la mesure précédente.
		const now = Date.now();
		const prev = s.cpuSample || {};
		const pct = (m, key) => {
			const cum = m && m.cpu && m.cpu.cumulativeCPUUsage;
			if (typeof cum !== 'number') return m ? m.cpu.percentCPUUsage : null;
			const last = prev[key];
			return last && now > last.t ? ((cum - last.cum) / ((now - last.t) / 1000)) * 100 : null;
		};
		const out = { cpu: pct(me, 'me'), mem: me ? me.memory.workingSetSize : null, gpuCpu: pct(gpu, 'gpu') };
		s.cpuSample = { me: me && { cum: me.cpu.cumulativeCPUUsage, t: now }, gpu: gpu && { cum: gpu.cpu.cumulativeCPUUsage, t: now } };
		return out;
	},
	'emu:macros': (s) => { try { const m = JSON.parse(fs.readFileSync(macrosFile(s.id), 'utf8')); return Array.isArray(m) ? m : []; } catch { return []; } },
	'emu:setMacros': (s, list) => {
		if (!Array.isArray(list) || list.length > 4) throw new Error('4 macros au maximum.');
		const clean = list.map(m => (m ? { name: String(m.name || '').slice(0, 40), length: Math.max(0, Math.trunc(+m.length || 0)), events: cleanEvents(m.events) } : null));
		fs.writeFileSync(macrosFile(s.id), JSON.stringify(clean));
		return clean;
	},
	// Film d'entrées : état de départ + toutes les entrées image par image + empreinte de l'état final.
	'emu:saveMovie': (s, meta, state) => {
		if (!state || !state.length) throw new Error('État de départ manquant.');
		const d = new Date();
		const p2 = n => String(n).padStart(2, '0');
		const name = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}-${p2(d.getMinutes())}-${p2(d.getSeconds())}`;
		const dir = moviesDir(s.id);
		fs.mkdirSync(dir, { recursive: true });
		const clean = { version: 1, core: s.plan.core || null, frames: Math.max(0, Math.trunc(+meta.frames || 0)), endPrint: typeof meta.endPrint === 'string' && meta.endPrint.length < 200000 ? meta.endPrint : null, events: cleanEvents(meta.events), savedAt: Date.now() };
		fs.writeFileSync(path.join(dir, `${name}.state`), Buffer.from(state));
		fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(clean));
		return name;
	},
	'emu:listMovies': (s) => {
		try { return fs.readdirSync(moviesDir(s.id)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).filter(n => MOVIE_NAME.test(n)).sort().reverse(); } catch { return []; }
	},
	'emu:loadMovie': (s, name) => {
		if (!MOVIE_NAME.test(name || '')) throw new Error('Film introuvable.');
		const dir = moviesDir(s.id);
		return { meta: JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8')), state: fs.readFileSync(path.join(dir, `${name}.state`)) };
	},
	'emu:saveResume': (s, state, png) => {
		if (!state || !state.length) return null;
		fs.mkdirSync(statesDir(s.id), { recursive: true });
		fs.writeFileSync(resumeFile(s.id, 'state'), Buffer.from(state));
		if (png && png.length) fs.writeFileSync(resumeFile(s.id, 'png'), Buffer.from(png));
		else fs.rmSync(resumeFile(s.id, 'png'), { force: true });
		fs.writeFileSync(resumeFile(s.id, 'json'), JSON.stringify({ savedAt: Date.now(), playTimeMs: playedMs(s) }));
		return true;
	},
	'emu:loadResume': (s) => {
		const file = resumeFile(s.id, 'state');
		if (!fs.existsSync(file)) throw new Error('Aucune partie à reprendre.');
		return fs.readFileSync(file);
	},
	'emu:resumeMode': (s, mode) => {
		if (!['ask', 'auto', 'off'].includes(mode)) throw new Error('Mode inconnu.');
		store.setSettings({ resumeMode: mode });
		return mode;
	},
	'emu:deleteState': (s, slot) => {
		slot = checkSlot(slot);
		for (const ext of ['state', 'png', 'json']) fs.rmSync(slotFile(s.id, slot, ext), { force: true });
		return listStates(s.id);
	},
	'emu:screenshot': (s, png) => {
		const file = mediaFile(s, 'screenshots', 'png');
		fs.writeFileSync(file, Buffer.from(png));
		return file;
	},
	// Capture « telle qu'affichée » : la zone du jeu à l'écran, avec filtres, shaders et effets.
	'emu:captureScreen': async (s, rect) => {
		const r = rect && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(rect[k])) ? rect : null;
		if (!r || r.width < 8 || r.height < 8) throw new Error('Zone de capture invalide.');
		const img = await s.win.webContents.capturePage({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });
		if (img.isEmpty()) throw new Error('Capture vide.');
		const file = mediaFile(s, 'screenshots', 'png');
		fs.writeFileSync(file, img.toPNG());
		return file;
	},
	// Sauvegarde en jeu (carte mémoire / EEPROM / SRAM) écrite par le jeu : copie sur disque + miroir cloud.
	'emu:writeSave': (s, data) => {
		if (!data || !data.length) return { changed: false };
		const ctx = saveCtx(s.id, s.startedAt);
		const r = saves.write(ctx.local, data, ctx.opts);
		if (r.changed && ctx.cloud) {
			const sy = saves.sync(ctx.local, ctx.cloud, ctx.opts);
			if (sy.action === 'error') runner.pushLog(s.id, 'stderr', `Synchronisation cloud : ${sy.error}`);
		}
		return { changed: r.changed };
	},
	// Au démarrage : synchronise avec le cloud puis renvoie la sauvegarde qui fait foi.
	'emu:startSave': (s) => {
		const ctx = saveCtx(s.id, s.startedAt);
		const sy = ctx.cloud ? saves.sync(ctx.local, ctx.cloud, ctx.opts) : { action: 'none' };
		const cur = saves.current(ctx.local);
		return {
			data: cur ? cur.data : null,
			hash: cur ? cur.meta.hash : null,
			savedAt: cur ? cur.meta.savedAt : null,
			pulled: sy.action === 'pulled',
			cloudError: sy.action === 'error' || sy.action === 'skipped' ? sy.error : (ctx.cloudMissing ? 'Dossier cloud introuvable' : null),
		};
	},
	// La version présente dans le jeu va être remplacée : elle est gardée en copie de secours.
	'emu:backupSave': (s, data) => {
		if (!data || !data.length) return null;
		const ctx = saveCtx(s.id, s.startedAt);
		return saves.addBackup(ctx.local, Buffer.from(data), Date.now(), 'jeu', Math.max(1, ctx.opts.keep));
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
		// Rechargement de la page de jeu (sauvegarde en jeu remise en place avant le démarrage du cœur).
		if (action === 'reload') { w.webContents.reload(); return null; }
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
		// Fichiers d'invitation : boîte de dialogue « Enregistrer sous » habituelle.
		if (!s || /\.smashinvite$/i.test(item.getFilename())) return;
		const ext = (path.extname(item.getFilename()).slice(1) || 'webm').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'webm';
		const file = mediaFile(s, 'videos', ext);
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

module.exports = { registerScheme, handleProtocol, registerIpc, openEmu, listStates, saveCtx, markRemoteHost };
