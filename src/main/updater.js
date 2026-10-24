// Mises à jour de Smash Emu : cherche une nouvelle version dans les Releases GitHub, la télécharge (en ne
// récupérant que les blocs modifiés quand c'est possible) puis relance l'application installée.
const { app } = require('electron');

let autoUpdater = null;
let send = () => {};
let state = { state: 'idle', current: app.getVersion() };
let timer = null;

const set = (patch) => {
	state = { ...state, ...patch, current: app.getVersion() };
	send(state);
	return state;
};

const init = (emit) => {
	send = emit;
	if (!app.isPackaged) { set({ state: 'dev' }); return; }
	try { ({ autoUpdater } = require('electron-updater')); } catch (error) { set({ state: 'error', error: error.message }); return; }
	// Mise à jour sans installateur : téléchargée en arrière-plan dès qu'elle paraît, installée en silence au
	// redémarrage demandé ou à la fermeture de Smash Emu.
	autoUpdater.autoDownload = true;
	autoUpdater.autoInstallOnAppQuit = true;
	autoUpdater.allowPrerelease = false;
	autoUpdater.logger = null;
	autoUpdater.on('checking-for-update', () => set({ state: 'checking', error: null }));
	autoUpdater.on('update-available', info => set({ state: 'available', version: info.version, notes: typeof info.releaseNotes === 'string' ? info.releaseNotes.replace(/<[^>]+>/g, '').slice(0, 600) : '' }));
	autoUpdater.on('update-not-available', () => set({ state: 'none', checkedAt: Date.now() }));
	autoUpdater.on('download-progress', p => set({ state: 'downloading', percent: Math.round(p.percent), speed: p.bytesPerSecond }));
	autoUpdater.on('update-downloaded', info => set({ state: 'ready', version: info.version, percent: 100 }));
	autoUpdater.on('error', error => set({ state: 'error', error: (error && error.message ? error.message : String(error)).split('\n')[0].slice(0, 200) }));
	// Vérification discrète au démarrage, puis toutes les six heures.
	setTimeout(() => check().catch(() => {}), 8000);
	timer = setInterval(() => { if (!['downloading', 'ready'].includes(state.state)) check().catch(() => {}); }, 30 * 60 * 1000);
};

const check = async () => {
	if (!autoUpdater) return state;
	if (['downloading', 'ready'].includes(state.state)) return state;
	await autoUpdater.checkForUpdates();
	return state;
};

const download = async () => {
	if (!autoUpdater || !['available', 'error'].includes(state.state)) return state;
	set({ state: 'downloading', percent: 0 });
	await autoUpdater.downloadUpdate();
	return state;
};

// Ferme Smash Emu, installe la mise à jour en silence puis relance l'application.
const install = () => {
	if (!autoUpdater || state.state !== 'ready') return state;
	if (timer) clearInterval(timer);
	autoUpdater.quitAndInstall(true, true);
	return state;
};

module.exports = { init, check, download, install, get: () => state };
