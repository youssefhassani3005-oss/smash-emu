const { contextBridge, ipcRenderer } = require('electron');

const call = async (channel, ...args) => {
	const r = await ipcRenderer.invoke(channel, ...args);
	if (!r.ok) throw new Error(r.error);
	return r.value;
};

contextBridge.exposeInMainWorld('smashRemote', {
	config: () => call('remote:config'),
	room: { open: code => call('room:open', code), post: (code, m) => call('room:post', code, m), close: code => call('room:close', code), onMessage: fn => ipcRenderer.on('room:msg', (_e, v) => fn(v)) },
	setName: name => call('remote:setName', name),
	addRecent: entry => call('remote:addRecent', entry),
	window: action => call('remote:window', action),
});
