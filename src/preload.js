const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = async (channel, ...args) => {
	const r = await ipcRenderer.invoke(channel, ...args);
	if (!r.ok) throw new Error(r.error);
	return r.value;
};

const on = (channel, fn) => {
	const listener = (_e, payload) => fn(payload);
	ipcRenderer.on(channel, listener);
	return () => ipcRenderer.removeListener(channel, listener);
};

// Chemin réel d'un fichier glissé-déposé (File.path n'existe plus depuis Electron 32).
const pathForFile = file => webUtils.getPathForFile(file);

contextBridge.exposeInMainWorld('launcher', { call, on, pathForFile });
