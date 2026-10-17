const { contextBridge, ipcRenderer } = require('electron');

const call = async (channel, ...args) => {
	const r = await ipcRenderer.invoke(channel, ...args);
	if (!r.ok) throw new Error(r.error);
	return r.value;
};

contextBridge.exposeInMainWorld('smashExt', {
	config: () => call('ext:config'),
	key: (name, arg) => call('ext:key', name, arg),
	screenshot: () => call('ext:screenshot'),
	quickSave: n => call('ext:quickSave', n),
	loadSlot: n => call('ext:loadSlot', n),
	panelOpen: () => call('ext:panelOpen'),
	panelClose: () => call('ext:panelClose'),
	panelSave: n => call('ext:panelSave', n),
	apply: (opts, extension) => call('ext:apply', opts, extension),
	showPath: file => call('ext:showPath', file),
	openFolder: () => call('ext:openFolder'),
	immersive: on => call('ext:immersive', on),
	top: on => call('ext:top', on),
	window: action => call('ext:window', action),
	onState: fn => ipcRenderer.on('ext:state', (_e, v) => fn(v)),
	onFullscreen: fn => ipcRenderer.on('ext:fullscreen', (_e, v) => fn(v)),
	onHotkey: fn => ipcRenderer.on('ext:hotkey', (_e, v) => fn(v)),
	onBar: fn => ipcRenderer.on('ext:bar', (_e, v) => fn(v)),
});
