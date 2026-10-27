const { contextBridge, ipcRenderer } = require('electron');

const call = async (channel, ...args) => {
	const r = await ipcRenderer.invoke(channel, ...args);
	if (!r.ok) throw new Error(r.error);
	return r.value;
};

contextBridge.exposeInMainWorld('smashEmu', {
	config: () => call('emu:config'),
	room: { create: () => call('room:create'), open: code => call('room:open', code), post: (code, m) => call('room:post', code, m), close: code => call('room:close', code), friends: () => call('room:friends'), inviteFriend: (f, code, game) => call('room:inviteFriend', f, code, game), onMessage: fn => ipcRenderer.on('room:msg', (_e, v) => fn(v)) },
	listStates: () => call('emu:listStates'),
	raceGet: () => call('emu:raceGet'),
	raceReady: () => call('emu:raceReady'),
	raceFinish: ms => call('emu:raceFinish', ms),
	raceForfeit: () => call('emu:raceForfeit'),
	onRace: fn => ipcRenderer.on('game:race', (_e, v) => fn(v)),
	speedrunGet: () => call('emu:speedrunGet'),
	speedrunSave: data => call('emu:speedrunSave', data),
	controls: () => call('emu:controls'),
	saveState: (slot, state, png) => call('emu:saveState', slot, state, png),
	loadState: slot => call('emu:loadState', slot),
	deleteState: slot => call('emu:deleteState', slot),
	screenshot: png => call('emu:screenshot', png),
	captureScreen: rect => call('emu:captureScreen', rect),
	writeSave: data => call('emu:writeSave', data),
	startSave: () => call('emu:startSave'),
	metrics: () => call('emu:metrics'),
	buttons: () => call('emu:buttons'),
	botMemory: () => call('emu:botMemory'),
	setBotMemory: mem => call('emu:setBotMemory', mem),
	macros: () => call('emu:macros'),
	setMacros: list => call('emu:setMacros', list),
	saveMovie: (meta, state) => call('emu:saveMovie', meta, state),
	listMovies: () => call('emu:listMovies'),
	loadMovie: name => call('emu:loadMovie', name),
	saveResume: (state, png) => call('emu:saveResume', state, png),
	loadResume: () => call('emu:loadResume'),
	resumeMode: mode => call('emu:resumeMode', mode),
	backupSave: data => call('emu:backupSave', data),
	prefs: patch => call('emu:prefs', patch),
	showPath: file => call('emu:showPath', file),
	window: action => call('emu:window', action),
	readyToClose: () => call('emu:readyToClose'),
	stash: state => call('emu:stash', state),
	takeStash: () => call('emu:takeStash'),
	onBeforeClose: fn => ipcRenderer.on('emu:before-close', () => fn()),
	onFullscreen: fn => ipcRenderer.on('emu:fullscreen', (_e, v) => fn(v)),
	onTrophy: fn => ipcRenderer.on('emu:trophy', (_e, v) => fn(v)),
	onVideoSaved: fn => ipcRenderer.on('emu:video-saved', (_e, v) => fn(v)),
});

// Indices et succès (commun avec les émulateurs externes).
contextBridge.exposeInMainWorld('smashAssist', {
	info: () => call('assist:info'),
	ask: q => call('assist:ask', q),
	reset: () => call('assist:reset'),
	progress: () => call('assist:progress'),
	poll: () => call('assist:poll'),
	onDelta: fn => ipcRenderer.on('assist:delta', (_e, v) => fn(v)),
	onUnlocked: fn => ipcRenderer.on('assist:unlocked', (_e, v) => fn(v)),
});
