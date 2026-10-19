const { contextBridge, ipcRenderer } = require('electron');

const call = async (channel, ...args) => {
	const r = await ipcRenderer.invoke(channel, ...args);
	if (!r.ok) throw new Error(r.error);
	return r.value;
};

contextBridge.exposeInMainWorld('smashEmu', {
	config: () => call('emu:config'),
	listStates: () => call('emu:listStates'),
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
	onVideoSaved: fn => ipcRenderer.on('emu:video-saved', (_e, v) => fn(v)),
});
