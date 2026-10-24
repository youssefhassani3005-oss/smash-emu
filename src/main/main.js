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
const remote = require('./remote');
const covers = require('./covers');
const trophies = require('./trophies');
const themefiles = require('./themefiles');
const discord = require('./discord');
const stats = require('./stats');
const supporter = require('./supporter');
const archipelago = require('./archipelago');
const community = require('./community');
const netplay = require('./netplay');
const soundtrack = require('./soundtrack');
const controls = require('./controls');
const switchkeys = require('./switchkeys');
const updater = require('./updater');
const emuinstall = require('./emuinstall');
const saves = require('./saves');
const friends = require('./friends');
const census = require('./census');
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
runner.setEmitter((type, payload) => { send(`run:${type}`, payload); if (type === 'status') { updatePresence(); friends.publish(); } });

// Jeu affiché aux amis : le plus récemment lancé.
const currentGame = () => {
	const st = runner.status();
	if (!st.length) return null;
	const r = st.reduce((a, b) => (b.startedAt > a.startedAt ? b : a));
	const inst = store.getInstance(r.id) || { name: 'Jeu' };
	const sys = systems.SYSTEMS[games.systemOf(inst)];
	return { name: inst.name, system: inst.type === 'coopdx' ? 'Coop DX' : (sys && sys.label) || '', since: r.startedAt };
};

// Présence Discord : jeu en cours (le plus récent), console, jaquette libretro et chrono ; « Dans le menu » sinon.
const REPO_URL = 'https://github.com/youssefhassani3005-oss/smash-emu';
const ICON_URL = 'https://raw.githubusercontent.com/youssefhassani3005-oss/smash-emu/main/src/renderer/assets/icon.png';
const APP_START = Date.now();
function updatePresence() {
	const s = store.getSettings();
	// Application ID : réglage du joueur, sinon celui publié par l'administrateur (community.json).
	const cc = s.communityCache || {};
	discord.configure({ on: s.richPresence, appId: s.discordAppId || cc.discordAppId });
	if (!s.richPresence) return;
	const invite = s.communityDiscord || cc.discord;
	const base = { assets: { large_image: ICON_URL, large_text: 'Smash Emu' }, buttons: [{ label: 'Découvrir Smash Emu', url: REPO_URL }, ...(invite ? [{ label: 'Rejoindre le Discord', url: invite }] : [])] };
	const st = runner.status();
	if (!st.length) { discord.setActivity(s.presenceIdle === false ? null : { ...base, details: 'Dans le menu', timestamps: { start: APP_START } }); return; }
	const r = st.reduce((a, b) => (b.startedAt > a.startedAt ? b : a));
	const inst = store.getInstance(r.id) || { name: 'Jeu' };
	const hidden = s.presenceShowGame === false;
	const sys = systems.SYSTEMS[games.systemOf(inst)];
	let cover = null;
	try { cover = hidden ? null : covers.info(r.id).boxart; } catch { /* pas d'images */ }
	const img = cover && !cover.custom && cover.url;
	discord.setActivity({
		...base,
		details: hidden ? 'En jeu' : inst.name,
		state: [inst.type === 'coopdx' ? 'Coop DX' : sys && sys.label, emu.isRemoteHost(r.id) ? 'partie à distance' : '', st.length > 1 ? `${st.length} jeux ouverts` : ''].filter(Boolean).join(' · ') || 'Smash Emu',
		timestamps: { start: r.startedAt },
		assets: img ? { large_image: img, large_text: inst.name, small_image: ICON_URL, small_text: 'Smash Emu' } : { ...base.assets, large_text: hidden ? 'Smash Emu' : inst.name },
	});
}
discord.onState(st => send('discord:state', st));
runner.setEmuOpener(emu.openEmu);

// Trophées : vérifiés à la fin d'une partie et chaque minute pendant une partie ; la notification apparaît
// dans la fenêtre principale et dans la fenêtre du jeu.
const announceTrophies = (fresh) => {
	for (const t of fresh) {
		send('trophy', t);
		const w = t.gameId ? runner.windowOf(t.gameId) : null;
		if (w) w.webContents.send('emu:trophy', t);
	}
};
runner.setFinishHook((id, startedAt) => { try { stats.record(id, startedAt); } catch { /* historique */ } trophies.noteSession(startedAt); announceTrophies(trophies.evaluate(runner.status())); });
setInterval(() => { const st = runner.status(); if (st.length) announceTrophies(trophies.evaluate(st)); }, 60000);
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

const setRomFromFile = async (instId, file) => {
	const inst = store.getInstance(instId);
	const entry = pickRomFor(inst.type, await romlib.importFile(file));
	return attachLibraryRom(instId, entry.id);
};

const romsWithUsage = () => {
	const instances = store.listInstances();
	return romlib.list().map(r => ({ ...r, instances: instances.filter(i => i.rom && (i.rom.libraryId === r.id || i.rom.info.md5 === r.id)).map(i => ({ id: i.id, name: i.name })) }));
};

// « Jouer » depuis la bibliothèque : réutilise une instance sans patch de cette ROM, sinon en crée une.
const playRom = (romId, { remote = false } = {}) => {
	const lib = romlib.get(romId);
	let inst = store.listInstances().find(i => i.type === 'rom' && i.rom && (i.rom.libraryId === lib.id || i.rom.info.md5 === lib.id)
		&& !games.listContent(i.id).some(c => c.source === 'instance' && c.enabled));
	if (!inst) {
		inst = store.createInstance({ name: lib.name, type: 'rom', group: (systems.SYSTEMS[lib.system] || {}).label || 'ROMs' });
		attachLibraryRom(inst.id, lib.id);
	}
	// Héberger à distance : le panneau d'invitation s'ouvre au démarrage du jeu.
	if (remote) {
		if (games.engineFor(store.getInstance(inst.id)) === 'smash') emu.markRemoteHost(inst.id);
		else external.markRemoteHost(inst.id);
		remote.noteHosted(inst.name);
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
		for (const id of emuinstall.available()) if (st[id]) { st[id].installable = true; st[id].managed = emuinstall.installed(id); }
		return st;
	},
	'emulators:checkUpdates': force => emuinstall.checkUpdates(!!force),
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
		if ('logo' in patch && win && !win.isDestroyed()) win.setIcon(store.windowIcon());
		if ('watchOperaDownloads' in patch) startOperaWatch();
		if (['richPresence', 'discordAppId', 'presenceShowGame', 'presenceIdle'].some(k => k in patch)) updatePresence();
		if ('playerName' in patch) friends.publish();
		return s;
	},
	// Mods GameBanana : jeu lié à chaque instance, liste, fiche, installation.
	'gb:games': q => require('./gamebanana').findGames(q),
	'gb:link': (id, game) => summarize(store.updateInstance(id, { gbGame: game ? { id: Number(game.id), name: String(game.name || '').slice(0, 120), icon: game.icon || null } : null })),
	'gb:mods': (gameId, opts) => require('./gamebanana').listMods(gameId, opts),
	'gb:mod': id => require('./gamebanana').profile(id),
	'gb:install': (instanceId, modId, fileId) => require('./gamebanana').install(instanceId, modId, fileId, p => send('gb:progress', { modId, ...p })),
	'friends:state': () => friends.state(),
	'friends:enable': on => friends.enable(on),
	'friends:options': o => friends.setOptions(o),
	'friends:add': code => friends.add(code),
	'friends:accept': code => friends.accept(code),
	'friends:decline': code => friends.decline(code),
	'friends:remove': code => friends.remove(code),
	'friends:regenerate': () => friends.regenerate(),
	'census:state': () => census.publicState(),
	'census:set': on => census.setEnabled(on),
	'census:summary': () => census.fetchSummary(),
	'census:admin': () => { if (!census.publicState().admin) throw new Error('Réservé au PC administrateur.'); return census.adminState(); },
	'census:publish': () => census.publishSummary(),

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
		else if (romPath) await setRomFromFile(inst.id, romPath);
		else if (type === 'coopdx') games.adoptExistingBaserom(inst.id);
		return summarize(store.getInstance(inst.id));
	},
	'instance:update': (id, patch) => summarize(store.updateInstance(id, patch)),
	'instance:setIcon': (id, source) => { setIcon(id, source); return summarize(store.getInstance(id)); },
	'instance:setRom': async (id, file) => summarize(await setRomFromFile(id, file)),
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
	// Jeu à distance : héberger (le panneau d'invitation s'ouvre au démarrage du jeu) ou rejoindre.
	'remote:host': (id) => {
		const inst = store.getInstance(id);
		if (!inst) throw new Error('Jeu introuvable.');
		// Le panneau d'invitation s'ouvre tout seul au démarrage : moteur intégré ou émulateur externe.
		if (games.engineFor(inst) === 'smash') emu.markRemoteHost(id);
		else external.markRemoteHost(id);
		remote.noteHosted(inst.name);
		const r = runner.launch(id);
		if (store.getSettings().closeOnLaunch && win) win.minimize();
		return r;
	},
	'remote:join': (code) => { remote.openGuest(typeof code === 'string' ? code.trim() : ''); return true; },
	'remote:recent': () => remote.recent(),
	// Images des thèmes personnalisés et fichiers .smashtheme.
	'themes:pickImage': async () => {
		const r = await dialog.showOpenDialog(win, { title: 'Choisir une image', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }] });
		return r.canceled ? null : themefiles.importImage(r.filePaths[0]);
	},
	'themes:exportFile': async (def) => {
		const name = String((def && def.label) || 'Mon thème').replace(/[<>:"/\\|?*]+/g, '').trim() || 'Mon thème';
		const r = await dialog.showSaveDialog(win, { title: 'Exporter le thème', defaultPath: path.join(app.getPath('desktop'), `${name}.smashtheme`), filters: [{ name: 'Thème Smash Emu', extensions: ['smashtheme'] }] });
		return r.canceled ? null : themefiles.exportFile(def, r.filePath);
	},
	'themes:importFile': async () => {
		const r = await dialog.showOpenDialog(win, { title: 'Importer un thème', properties: ['openFile'], filters: [{ name: 'Thème Smash Emu', extensions: ['smashtheme'] }] });
		return r.canceled ? null : themefiles.importFile(r.filePaths[0]);
	},
	'themes:cleanup': () => themefiles.cleanup(store.getSettings().customThemes || []),
	'discord:status': () => discord.status(),
	// Tableau de bord et mode supporter.
	'dashboard:get': () => stats.dashboard({ running: runner.status(), emulators: emulators.status(), roms: romlib.list() }),
	'supporter:status': () => supporter.status(),
	// Multiworld Archipelago : lanceur officiel.
	'netplay:open': id => netplay.open(id),
	'community:get': () => community.get(),
	'community:setLocal': invite => community.setLocal(invite),
	'archipelago:status': () => archipelago.status(),
	'archipelago:install': () => archipelago.install(p => send('archipelago:progress', p)),
	'archipelago:open': () => archipelago.openLauncher(),
	'supporter:activate': code => supporter.activate(code),
	'supporter:deactivate': () => supporter.deactivate(),
	'supporter:generate': (name, tier) => supporter.generate(name, tier),
	'supporter:issued': () => (supporter.isAdmin() ? supporter.issued() : []),
	'trophies:list': () => { trophies.evaluate(runner.status()); return trophies.list(runner.status()); },
	// Jaquettes et images (libretro-thumbnails ou fichiers de l'utilisateur).
	'covers:search': async (id) => {
		const inst = store.getInstance(id);
		if (!inst) throw new Error('Jeu introuvable.');
		const info = (inst.rom && inst.rom.info) || {};
		const queries = [info.known, info.title, inst.rom && inst.rom.file && inst.rom.file.replace(/\.[a-z0-9]+$/i, ''), inst.name].filter(Boolean);
		return { system: games.systemOf(inst), queries, results: await covers.search(games.systemOf(inst), queries) };
	},
	'covers:info': id => covers.info(id),
	// Fond d'écran d'un jeu : 6 images proposées (écrans titres, captures, boîtes), ou une image du PC.
	'bg:candidates': async (id) => {
		const inst = store.getInstance(id);
		if (!inst) throw new Error('Jeu introuvable.');
		const info = (inst.rom && inst.rom.info) || {};
		const queries = inst.type === 'coopdx' ? ['Super Mario 64 (USA)'] : [info.known, info.title, inst.rom && inst.rom.file && inst.rom.file.replace(/\.[a-z0-9]+$/i, ''), inst.name].filter(Boolean);
		return covers.backgrounds(inst.type === 'coopdx' ? 'n64' : games.systemOf(inst), queries);
	},
	'bg:set': (id, url) => covers.setBackground(id, url),
	'bg:import': async (id) => {
		const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
		return r.canceled ? null : covers.importBackground(id, r.filePaths[0]);
	},
	'bg:remove': id => covers.removeBackground(id),
	// Pastilles de l'accueil console : temps de jeu, 2 dernières semaines, trophées du jeu.
	'console:gameInfo': (id) => {
		const inst = store.getInstance(id);
		if (!inst) return null;
		const since = Date.now() - 14 * 86400000;
		const log = stats.readLog().filter(x => x.id === id);
		const twoWeeks = log.reduce((a, x) => a + Math.max(0, x.e - Math.max(x.s, since)), 0);
		const g = trophies.list(runner.status()).perGame.find(x => x.id === id);
		const got = g ? g.tiers.filter(t => t.at).sort((a, b) => b.at - a.at) : [];
		return { ms: inst.playTimeMs || 0, last: inst.lastPlayed || null, twoWeeks, sessions: log.length, trophies: { count: got.length, total: trophies.TIERS.length, latest: got[0] ? { name: got[0].name, at: got[0].at } : null } };
	},
	'window:fullscreen': () => { win.setFullScreen(!win.isFullScreen()); return win.isFullScreen(); },
	// Couleurs des jaquettes (accueil console) : { id: { main, accent, avg, light } }.
	'covers:palettes': ids => Object.fromEntries((ids || []).map((id) => {
		const inst = store.getInstance(id);
		let p = null;
		try { p = inst && inst.coverFile ? require('./palette').fromFile(inst.coverFile) : null; } catch { /* image illisible */ }
		return [id, p];
	})),
	'covers:pick': (id, name) => covers.download(id, games.systemOf(store.getInstance(id)), String(name)),
	// Jaquettes manquantes, à la demande du joueur : seule la boîte d'une correspondance très sûre (score ≥ 80) est
	// téléchargée ; les autres jeux restent à choisir à la main.
	'covers:autoMissing': async () => {
		const todo = store.listInstances().filter(i => !i.coverFile && (i.type === 'rom' || i.type === 'coopdx'));
		const found = [];
		const unsure = [];
		for (const [n, inst] of todo.entries()) {
			send('covers:auto', { done: n, total: todo.length, name: inst.name });
			const sys = inst.type === 'coopdx' ? 'n64' : games.systemOf(inst);
			const info = (inst.rom && inst.rom.info) || {};
			const queries = inst.type === 'coopdx' ? ['Super Mario 64 (USA)'] : [info.known, info.title, inst.rom && inst.rom.file && inst.rom.file.replace(/\.[a-z0-9]+$/i, ''), inst.name].filter(Boolean);
			try {
				const best = (await covers.search(sys, queries, 3)).find(r => r.media.boxart);
				if (best && best.score >= 80) { await covers.download(inst.id, sys, best.name, ['boxart']); found.push(inst.name); } else unsure.push(inst.name);
			} catch { unsure.push(inst.name); }
		}
		send('covers:auto', { done: todo.length, total: todo.length });
		return { found, unsure };
	},
	'covers:import': async (id, kind) => {
		const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
		return r.canceled ? null : covers.importFile(id, kind, r.filePaths[0]);
	},
	'covers:restore': (id, kind) => covers.restore(id, kind),
	'covers:remove': (id, kind) => covers.remove(id, kind),
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
	'controls:get': (system, instanceId) => controls.get(system, instanceId || null),
	'controls:set': (system, profile, instanceId) => controls.set(system, profile, instanceId || null),
	'controls:reset': (system, instanceId) => controls.reset(system, instanceId || null),
	'controls:extension': (value) => { controls.setExtension(value); return controls.currentExtension(); },
	'soundtrack:search': (name, consoleLabel) => soundtrack.search(name, consoleLabel),
	'roms:list': () => romsWithUsage(),
	'roms:import': async (files) => {
		const added = [];
		const errors = [];
		for (const f of files) {
			try { added.push(...(await romlib.importFile(f))); } catch (error) { errors.push(error.message); }
		}
		return { added, errors };
	},
	'roms:scan': () => romlib.scan([...romlib.defaultScanDirs(), opera.downloadDir()]),
	'roms:rename': (id, name) => romlib.rename(id, name),
	'roms:remove': (id) => romlib.remove(id),
	'roms:play': (id) => playRom(id),
	'remote:hostRom': (id) => playRom(id, { remote: true }),
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
		icon: store.windowIcon(),
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
	remote.registerIpc();
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
	updatePresence();
	community.get().then(() => updatePresence()).catch(() => {});
	friends.init({ send, current: currentGame, version: app.getVersion() });
	// Carte graphique dédiée (NVIDIA, AMD) : les jeux Switch sont affichés en 2×.
	app.getGPUInfo('basic').then(i => switchkeys.setGpu(i.gpuDevice)).catch(() => {});
	census.init({ send, version: app.getVersion(), emulators: () => Object.values(emulators.status()).filter(e => e.path).map(e => e.id) });
	// Switch installée d'office : sans émulateur Switch (Citron est normalement fourni), Eden s'installe en
	// arrière-plan ; en cas d'échec (serveur injoignable), nouvel essai au démarrage suivant, au plus toutes les 6 h.
	setTimeout(async () => {
		const s = store.getSettings();
		if (s.autoInstallSwitch === false || ['ryujinx', 'citron', 'eden'].some(e => emulators.pathFor(e))) return;
		if (s.switchInstallTry && Date.now() - s.switchInstallTry < 6 * 3600000) return;
		store.setSettings({ switchInstallTry: Date.now() });
		try {
			await emuinstall.install('eden', p => send('emuinstall', { id: 'eden', auto: true, ...p }));
			send('switch:auto', { ok: true });
		} catch (error) { send('switch:auto', { ok: false, error: error.message }); }
	}, 15000);
});

app.on('window-all-closed', () => {
	opera.unwatch();
	app.quit();
});

// Amis : « hors ligne » envoyé avant de quitter (2 s au plus).
let leaving = false;
app.on('before-quit', (e) => {
	if (leaving || !(store.getSettings().friends || {}).on) return;
	e.preventDefault();
	leaving = true;
	friends.goOffline().finally(() => app.quit());
});
