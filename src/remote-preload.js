const { contextBridge, ipcRenderer } = require('electron');

const call = async (channel, ...args) => {
	const r = await ipcRenderer.invoke(channel, ...args);
	if (!r.ok) throw new Error(r.error);
	return r.value;
};

contextBridge.exposeInMainWorld('smashRemote', {
	config: () => call('remote:config'),
	setName: name => call('remote:setName', name),
	addRecent: entry => call('remote:addRecent', entry),
	window: action => call('remote:window', action),
});
