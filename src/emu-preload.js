const { contextBridge, ipcRenderer } = require('electron');

const call = async (channel, ...args) => {
	const r = await ipcRenderer.invoke(channel, ...args);
	if (!r.ok) throw new Error(r.error);
	return r.value;
};

contextBridge.exposeInMainWorld('smashEmu', {
	config: () => call('emu:config'),
	listStates: () => call('emu:listStates'),
	saveState: (slot, state, png) => call('emu:saveState', slot, state, png),
	loadState: slot => call('emu:loadState', slot),
	deleteState: slot => call('emu:deleteState', slot),
	screenshot: png => call('emu:screenshot', png),
	exportSave: data => call('emu:exportSave', data),
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
