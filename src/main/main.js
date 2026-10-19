const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, Menu, session } = require('electron');
const fs = require('fs');
const path = require('path');
const store = require('./store');

// Smash Emu garde toutes ses données dans Documents\Smash Emu (migration de « Launcher 64 » comprise),
// y compris les données internes de Chromium : sauvegardes en jeu de l'émulateur, réglages des touches.
store.ensureDirs();
app.setName('Smash Emu');
app.setPath('userData', store.ELECTRON_DIR);
if (process.platform === 'win32') app.setAppUserModelId('Smash Emu');
// Windows peut croire à tort qu'une fenêtre est recouverte (superpositions, autres applis) : Chromium cesse
// alors de dessiner. On désactive ce calcul pour que l'interface et le jeu restent toujours affichés.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const emu = require('./emu');
const romlib = require('./romlib');
const suggest = require('./suggest');
const systems = require('./systems');
const emulators = require('./emulators');
const external = require('./external');
const soundtrack = require('./soundtrack');
const controls = require('./controls');
const switchkeys = require('./switchkeys');
const updater = require('./updater');
const emuinstall = require('./emuinstall');
const saves = require('./saves');
emu.registerScheme();
Menu.setApplicationMenu(null);
const games = require('./games');
const installer = require('./installer');
const catalog = require('./catalog');
const runner = require('./runner');
const opera = require('./opera');
const rom = require('./rom');

let win = null;
const send = (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); };
runner.setEmitter((type, payload) => send(`run:${type}`, payload));
runner.setEmuOpener(emu.openEmu);
runner.setExternalOpener(external.openExternalHost);

// ---------- Icônes d'instance ----------

const iconFile = id => path.join(store.instanceDir(id), 'icon.png');
const iconData = (id) => {
	try { return 'data:image/png;base64,' + fs.readFileSync(iconFile(id)).toString('base64'); } catch { return null; }
};
const setIcon = (id, source) => {
	if (!source) { fs.rmSync(iconFile(id), { force: true }); return null; }
	const img = nativeImage.createFromPath(source);
	if (img.isEmpty()) throw new Error('Image illisible (PNG, JPG, GIF, WEBP ou ICO).');
	const size = img.getSize();
	const side = Math.min(size.width, size.height);
	const square = img.crop({ x: Math.floor((size.width - side) / 2), y: Math.floor((size.height - side) / 2), width: side, height: side });
	fs.writeFileSync(iconFile(id), square.resize({ width: 256, height: 256, quality: 'best' }).toPNG());
	return iconData(id);
};

const summarize = (inst) => {
	let content = [];
	try { content = games.listContent(inst.id); } catch { /* jeu non configuré */ }
	return {
		...inst,
		iconData: iconData(inst.id),
		running: runner.isRunning(inst.id),
		contentCount: content.filter(c => c.source === 'instance').length,
		enabledCount: content.filter(c => c.enabled && c.kind !== 'pack').length,
	};
};

// ---------- ROM ----------

// Importe le fichier (ROM ou zip) dans la bibliothèque puis l'attache à l'instance.
const pickRomFor = (type, entries) => {
	const ok = entries.filter(r => type !== 'coopdx' || r.info.isSm64Us);
	if (!ok.length) throw new Error(type === 'coopdx' ? 'sm64coopdx demande la ROM Super Mario 64 (US).' : 'Aucun jeu utilisable dans ce fichier.');
	return ok[0];
};

const attachLibraryRom = (instId, romId) => {
	return games.setGame(instId, romlib.get(romId));
};

const setRomFromFile = (instId, file) => {
	const inst = store.getInstance(instId);
	const entry = pickRomFor(inst.type, romlib.importFile(file));
	return attachLibraryRom(instId, entry.id);
};

const romsWithUsage = () => {
	const instances = store.listInstances();
	return romlib.list().map(r => ({ ...r, instances: instances.filter(i => i.rom && (i.rom.libraryId === r.id || i.rom.info.md5 === r.id)).map(i => ({ id: i.id, name: i.name })) }));
};

// « Jouer » depuis la bibliothèque : réutilise une instance sans patch de cette ROM, sinon en crée une.
const playRom = (romId) => {
	const lib = romlib.get(romId);
	let inst = store.listInstances().find(i => i.type === 'rom' && i.rom && (i.rom.libraryId === lib.id || i.rom.info.md5 === lib.id)
		&& !games.listContent(i.id).some(c => c.source === 'instance' && c.enabled));
	if (!inst) {
		inst = store.createInstance({ name: lib.name, type: 'rom', group: (systems.SYSTEMS[lib.system] || {}).label || 'ROMs' });
		attachLibraryRom(inst.id, lib.id);
	}
	runner.launch(inst.id);
	return inst.id;
};

// Un téléchargement Opera est une ROM (fichier ou zip de ROM) ou un mod.
const withKind = (f) => {
	const isRom = romlib.isGameFile(f.path);
	const isMod = /^(zip|lua|ips|bps)$/.test(f.ext);
	if (!isRom && !isMod) return null; // ex. un .iso de Windows : ni jeu ni mod
	return { ...f, kind: isRom ? 'rom' : 'mod', imported: isRom && romlib.alreadyImported(f.path) };
};

// ---------- Téléchargements (catalogue) ----------

let downloadSeq = 0;
const installFromCatalog = async ({ instanceId, slug, fileUrl, fileName, title, version, icon }) => {
	const dl = { id: ++downloadSeq, instanceId, title: title || fileName, received: 0, total: 0, state: 'downloading' };
	send('download', dl);
	try {
		const { name, data } = await catalog.download(fileUrl, ({ received, total }) => {
			dl.received = received; dl.total = total;
			send('download', dl);
		});
		dl.state = 'installing'; send('download', dl);
		const installed = installer.installData(instanceId, fileName || name, data, { type: 'catalog', slug, title, version, icon, url: `${catalog.BASE}/mods/${slug}/` });
		dl.state = 'done'; dl.installed = installed; send('download', dl);
		return installed;
	} catch (error) {
		dl.state = 'error'; dl.error = error.message; send('download', dl);
		throw error;
	}
};

// Installation directe d'un mod suggéré : téléchargement, revérification, instance prête à jouer.
const installSuggestion = async ({ romId, archiveId, file, hackName, target = 'new' }) => {
	const dl = { id: ++downloadSeq, title: hackName, received: 0, total: 0, state: 'downloading' };
	send('download', dl);
	try {
		const { name, data, lib } = await suggest.download(romId, archiveId, file, ({ received, total }) => {
			dl.received = received; dl.total = total; send('download', dl);
		});
		dl.state = 'installing'; send('download', dl);
		let instId = target;
		if (target === 'new') {
			const game = lib.name.replace(/\s*\(.*?\)\s*/g, ' ').trim();
			const inst = store.createInstance({ name: `${game} — ${hackName}`.slice(0, 60), type: 'rom', group: 'Hacks' });
			attachLibraryRom(inst.id, lib.id);
			instId = inst.id;
		} else {
			const inst = store.getInstance(target);
			if (!inst.rom || inst.rom.info.md5 !== lib.id) throw new Error('Cette instance n’utilise pas la même ROM.');
			if (games.listContent(target).some(c => c.kind === 'patch' && c.enabled)) {
				throw new Error('Cette instance a déjà un patch actif : les hacks se cumulent rarement. Installe-le dans une nouvelle instance.');
			}
		}
		installer.installData(instId, name, data, { type: 'suggest', title: hackName, url: `https://archive.org/details/${archiveId}`, file });
		dl.state = 'done'; send('download', dl);
		return summarize(store.getInstance(instId));
	} catch (error) {
		dl.state = 'error'; dl.error = error.message; send('download', dl);
		throw error;
	}
};

// ---------- IPC ----------

const handlers = {
	'app:info': () => ({
		version: app.getVersion(), dataDir: store.ROOT, gameTypes: store.GAME_TYPES, engines: store.ENGINES, themes: store.THEMES, paths: games.resolvePaths(),
		systems: Object.fromEntries(systems.ORDER.map(id => [id, { ...systems.SYSTEMS[id], engines: systems.enginesFor(id) }])),
		externals: Object.fromEntries(Object.entries(emulators.EXTERNAL).map(([id, e]) => [id, { label: e.label, systems: e.systems, site: e.site, note: e.note || null }])),
		extensions: systems.supportedExtensions(),
	}),
	'emulators:status': (refresh) => {
		const st = emulators.status(!!refresh);
		for (const id of emuinstall.available()) if (st[id]) st[id].installable = true;
		return st;
	},
	'emulators:install': async (id) => {
		await emuinstall.install(id, p => send('emuinstall', { id, ...p }));
		return emulators.status(true);
	},
	'emulators:set': (id, file) => {
		const s = store.getSettings();
		store.setSettings({ emulators: { ...(s.emulators || {}), [id]: file || '' } });
		return emulators.status();
	},
	'roms:setSystem': (id, system) => romlib.setSystem(id, system),
	'settings:get': () => store.getSettings(),
	'settings:set': (patch) => {
		const s = store.setSettings(patch);
		if ('watchOperaDownloads' in patch) startOperaWatch();
		return s;
	},

	'dialog:open': async (opts = {}) => {
		const r = await dialog.showOpenDialog(win, { properties: opts.multi ? ['openFile', 'multiSelections'] : ['openFile'], filters: opts.filters || [] });
		return r.canceled ? null : opts.multi ? r.filePaths : r.filePaths[0];
	},
	'shell:open': (url) => {
		if (!/^https?:\/\//i.test(url)) throw new Error('Adresse invalide.');
		try { opera.open(url); } catch { shell.openExternal(url); }
	},
	'shell:showPath': (p) => shell.showItemInFolder(p),

	'instances:list': () => store.listInstances().map(summarize),
	'instance:get': (id) => summarize(store.getInstance(id)),
	'instance:create': async ({ name, type, group, iconPath, romPath, romId }) => {
		const inst = store.createInstance({ name, type, group });
		if (iconPath) setIcon(inst.id, iconPath);
		if (romId) attachLibraryRom(inst.id, romId);
		else if (romPath) setRomFromFile(inst.id, romPath);
		else if (type === 'coopdx') games.adoptExistingBaserom(inst.id);
		return summarize(store.getInstance(inst.id));
	},
	'instance:update': (id, patch) => summarize(store.updateInstance(id, patch)),
	'instance:setIcon': (id, source) => { setIcon(id, source); return summarize(store.getInstance(id)); },
	'instance:setRom': (id, file) => summarize(setRomFromFile(id, file)),
	'instance:setLibraryRom': (id, romId) => summarize(attachLibraryRom(id, romId)),
	'instance:romInfo': (file) => rom.romInfo(fs.readFileSync(file)),
	'instance:delete': (id) => { if (runner.isRunning(id)) throw new Error('Arrête le jeu avant de supprimer l\'instance.'); store.deleteInstance(id); },
	'instance:duplicate': (id) => {
		const src = store.getInstance(id);
		const copy = store.createInstance({ name: `${src.name} (copie)`, type: src.type, group: src.group });
		fs.cpSync(store.instanceDir(id), store.instanceDir(copy.id), { recursive: true, force: true });
		return summarize(store.saveInstance({ ...src, id: copy.id, name: copy.name, createdAt: Date.now(), lastPlayed: null, playTimeMs: 0 }));
	},
	'instance:openFolder': (id) => shell.openPath(store.instanceDir(id)),

	'content:list': (id) => games.listContent(id),
	'content:toggle': (id, key, enabled) => games.setEnabled(id, key, enabled),
	'content:remove': (id, key) => games.removeContent(id, key),
	'content:installFiles': (id, files) => files.flatMap(f => installer.installFile(id, f)),
	'content:reorder': (id, order) => summarize(store.updateInstance(id, { patchOrder: order })),

	'run:launch': (id) => {
		const r = runner.launch(id);
		if (store.getSettings().closeOnLaunch && win) win.minimize();
		return r;
	},
	'run:stop': (id) => runner.stop(id),
	'run:status': () => runner.status(),
	'run:logs': (id) => runner.getLogs(id),

	'catalog:meta': () => ({ categories: catalog.CATEGORIES, sorts: Object.keys(catalog.SORTS), base: catalog.BASE }),
	'catalog:list': (opts) => catalog.list(opts),
	'catalog:search': (q, page) => catalog.search(q, page),
	'catalog:details': (slug) => catalog.details(slug),
	'catalog:files': (slug) => catalog.files(slug),
	'catalog:install': (opts) => installFromCatalog(opts),

	'opera:status': () => opera.status(),
	'opera:open': (url) => opera.open(url),
	'opera:search': (site, q) => { const url = opera.searchUrl(site, q); opera.open(url); return url; },
	'opera:recent': () => opera.recentDownloads().map(withKind).filter(Boolean),
	'opera:install': (id, file) => {
		const dir = path.resolve(opera.downloadDir());
		if (!path.resolve(file).startsWith(dir + path.sep)) throw new Error('Ce fichier ne vient pas du dossier de téléchargement d\'Opera.');
		return installer.installFile(id, file, { type: 'opera', file });
	},

	'suggest:list': (romId, opts) => suggest.list(romId, opts),
	'suggest:install': opts => installSuggestion(opts),
	// Sauvegardes en jeu du lecteur intégré (copies de secours, import/export, dossier cloud).
	'saves:info': (id) => {
		const ctx = emu.saveCtx(id);
		const meta = saves.readMeta(ctx.local);
		return { current: meta, backups: saves.listBackups(ctx.local), dir: ctx.local.dir, cloudDir: store.getSettings().savesSyncDir || '', cloudMissing: ctx.cloudMissing, keep: ctx.opts.keep, running: runner.isRunning(id) };
	},
	'saves:export': async (id) => {
		const ctx = emu.saveCtx(id);
		const inst = store.getInstance(id);
		const r = await dialog.showSaveDialog(win, { defaultPath: `${inst.name.replace(/[<>:"/\\|?*]/g, '_')}.srm`, filters: [{ name: 'Sauvegarde de jeu', extensions: ['srm', 'sav', 'eep', 'mpk', 'fla'] }] });
		return r.canceled ? null : saves.exportTo(ctx.local, r.filePath);
	},
	'saves:import': async (id) => {
		if (runner.isRunning(id)) throw new Error('Ferme le jeu avant d’importer une sauvegarde : il l’écraserait.');
		const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Sauvegarde de jeu', extensions: ['srm', 'sav', 'eep', 'mpk', 'fla', 'sra', 'dsv', 'mcr', 'mcd'] }, { name: 'Tous les fichiers', extensions: ['*'] }] });
		if (r.canceled) return null;
		const ctx = emu.saveCtx(id);
		const w = saves.importFile(ctx.local, r.filePaths[0], ctx.opts);
		if (ctx.cloud) saves.sync(ctx.local, ctx.cloud, ctx.opts);
		return w.meta;
	},
	'saves:restore': (id, name) => {
		if (runner.isRunning(id)) throw new Error('Ferme le jeu avant de restaurer une sauvegarde : il l’écraserait.');
		const ctx = emu.saveCtx(id);
		const w = saves.restore(ctx.local, name, ctx.opts);
		if (ctx.cloud) saves.sync(ctx.local, ctx.cloud, ctx.opts);
		return w.meta;
	},
	'saves:sync': (id) => {
		const ctx = emu.saveCtx(id);
		if (!ctx.cloud) throw new Error(ctx.cloudMissing ? 'Le dossier cloud est introuvable.' : 'Aucun dossier cloud choisi (Paramètres → Sauvegardes de jeu).');
		if (runner.isRunning(id)) throw new Error('Ferme le jeu avant de synchroniser.');
		return saves.sync(ctx.local, ctx.cloud, ctx.opts);
	},
	'saves:folder': (id) => { const d = emu.saveCtx(id).local.dir; fs.mkdirSync(d, { recursive: true }); return shell.openPath(d); },
	'saves:pickCloud': async () => {
		const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], title: 'Dossier synchronisé (Dropbox, Google Drive, OneDrive, Syncthing…)' });
		if (r.canceled) return store.getSettings();
		return store.setSettings({ savesSyncDir: r.filePaths[0] });
	},
	'update:get': () => updater.get(),
	'update:check': () => updater.check(),
	'update:download': () => updater.download(),
	'update:install': () => updater.install(),
	'switch:status': () => switchkeys.status(),
	'switch:import': (files) => switchkeys.importKeys(files),
	'switch:folder': () => switchkeys.openFolder(),
	'switch:open': () => switchkeys.openEmulator(),
	'controls:list': () => controls.list(),
	'controls:get': system => controls.get(system),
	'controls:set': (system, profile) => controls.set(system, profile),
	'controls:reset': system => controls.reset(system),
	'controls:extension': (value) => { controls.setExtension(value); return controls.currentExtension(); },
	'soundtrack:search': (name, consoleLabel) => soundtrack.search(name, consoleLabel),
	'roms:list': () => romsWithUsage(),
	'roms:import': (files) => {
		const added = [];
		const errors = [];
		for (const f of files) {
			try { added.push(...romlib.importFile(f)); } catch (error) { errors.push(error.message); }
		}
		return { added, errors };
	},
	'roms:scan': () => romlib.scan([...romlib.defaultScanDirs(), opera.downloadDir()]),
	'roms:rename': (id, name) => romlib.rename(id, name),
	'roms:remove': (id) => romlib.remove(id),
	'roms:play': (id) => playRom(id),
	'roms:show': (id) => shell.showItemInFolder(romlib.get(id).path),

	'window:minimize': () => win.minimize(),
	'window:maximize': () => (win.isMaximized() ? win.unmaximize() : win.maximize()),
	'window:close': () => win.close(),
};

for (const [channel, fn] of Object.entries(handlers)) {
	ipcMain.handle(channel, async (_event, ...args) => {
		try {
			return { ok: true, value: await fn(...args) };
		} catch (error) {
			return { ok: false, error: error.message };
		}
	});
}

const startOperaWatch = () => {
	opera.unwatch();
	if (store.getSettings().watchOperaDownloads) opera.watch((file) => { const f = withKind(file); if (f) send('opera:download', f); });
};

const createWindow = () => {
	win = new BrowserWindow({
		width: 1280,
		height: 800,
		minWidth: 960,
		minHeight: 620,
		frame: false,
		backgroundColor: '#0a0a0b',
		title: 'Smash Emu',
		icon: path.join(__dirname, '..', 'renderer', 'assets', 'icon.png'),
		webPreferences: {
			preload: path.join(__dirname, '..', 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});
	win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
	// Remonte les erreurs de l'interface dans la sortie du processus principal.
	win.webContents.on('console-message', (_e, level, message, line, source) => {
		if (level >= 2) console.error(`[interface] ${message} (${path.basename(source || '')}:${line})`);
	});
	win.webContents.on('did-fail-load', (_e, code, desc, url) => console.error(`[interface] chargement impossible ${code} ${desc} ${url}`));
	win.webContents.on('preload-error', (_e, file, error) => console.error(`[interface] preload ${file} : ${error.message}`));
	win.webContents.on('render-process-gone', (_e, details) => console.error(`[interface] rendu arrêté : ${details.reason}`));
	win.on('maximize', () => send('window:state', { maximized: true }));
	win.on('unmaximize', () => send('window:state', { maximized: false }));
	// Les liens externes s'ouvrent dans Opera (ou le navigateur par défaut).
	win.webContents.setWindowOpenHandler(({ url }) => {
		if (/^https?:\/\//i.test(url)) { try { opera.open(url); } catch { shell.openExternal(url); } }
		return { action: 'deny' };
	});
	win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) e.preventDefault(); });
};

// « --play=<instance> » lance directement un jeu (raccourcis bureau par jeu).
const playArg = () => (process.argv.find(a => a.startsWith('--play=')) || '').slice('--play='.length);

// Une seule fenêtre Smash Emu : un second lancement la remet au premier plan (et lance le jeu demandé).
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on('second-instance', (_e, argv) => {
	if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
	const id = (argv.find(a => a.startsWith('--play=')) || '').slice('--play='.length);
	if (id) { try { runner.launch(id); } catch (error) { console.error(error.message); } }
});

app.whenReady().then(() => {
	emu.handleProtocol();
	emu.registerIpc();
	external.registerIpc();
	session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/*'] }, (details, cb) => {
		const headers = { ...details.requestHeaders };
		if (!headers.Referer) headers.Referer = 'https://smash-emu.app/';
		cb({ requestHeaders: headers });
	});
	createWindow();
	updater.init(s => send('update:state', s));
	const id = playArg();
	if (id) win.webContents.once('did-finish-load', () => { try { runner.launch(id); } catch (error) { console.error(error.message); } });
	startOperaWatch();
});

app.on('window-all-closed', () => {
	opera.unwatch();
	app.quit();
});
