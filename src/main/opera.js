// Pont avec le navigateur Opera : ouvrir des recherches de mods et récupérer ce qu'on y télécharge.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const store = require('./store');
const { INSTALLABLE: MOD_FILES } = require('./installer');
const systems = require('./systems');

// Mods et jeux de toutes les consoles.
const GAME_FILES = new RegExp(`\\.(${systems.supportedExtensions().join('|')})$`, 'i');
const INSTALLABLE = { test: n => MOD_FILES.test(n) || GAME_FILES.test(n) };

const HOME = os.homedir();
const APPDATA = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');
const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');

// Sites de mods proposés dans la recherche (la requête remplace {q}).
const SEARCH_SITES = [
	{ id: 'coopdx', label: 'Mods Coop DX', url: 'https://mods.sm64coopdx.com/search/search?keywords={q}&t=resource', hint: 'Mods Lua et packs DynOS pour sm64coopdx' },
	{ id: 'smwc', label: 'SMW Central (SM64)', url: 'https://www.smwcentral.net/?p=section&s=sm64hacks&f%5Bname%5D={q}', hint: 'ROM hacks Super Mario 64 (patchs BPS)' },
	{ id: 'gamebanana', label: 'GameBanana', url: 'https://gamebanana.com/search?_sSearchString={q}', hint: 'Mods de jeux, toutes plateformes' },
	{ id: 'romhacking', label: 'Romhacking.net', url: 'https://www.romhacking.net/?page=hacks&title={q}&platform=31', hint: 'Archive de hacks N64 (patchs IPS/BPS)' },
	{ id: 'google', label: 'Google', url: 'https://www.google.com/search?q={q}+n64+mod', hint: 'Recherche web générale' },
];

const OPERA_CANDIDATES = [
	path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Opera', 'opera.exe'),
	path.join(LOCALAPPDATA, 'Programs', 'Opera', 'opera.exe'),
	path.join(LOCALAPPDATA, 'Programs', 'Opera GX', 'opera.exe'),
	path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Opera GX', 'opera.exe'),
];

const PROFILE_CANDIDATES = [
	path.join(APPDATA, 'Opera Software', 'Opera Stable'),
	path.join(APPDATA, 'Opera Software', 'Opera GX Stable'),
];

const findOpera = () => {
	const s = store.getSettings();
	if (s.operaPath && fs.existsSync(s.operaPath)) return s.operaPath;
	return OPERA_CANDIDATES.find(p => fs.existsSync(p)) || null;
};

// Dossier de téléchargement configuré dans Opera (par défaut : Téléchargements de Windows).
const downloadDir = () => {
	for (const profile of PROFILE_CANDIDATES) {
		try {
			const prefs = JSON.parse(fs.readFileSync(path.join(profile, 'Preferences'), 'utf8'));
			const dir = prefs.download && prefs.download.default_directory;
			if (dir && fs.existsSync(dir)) return dir;
		} catch { /* profil suivant */ }
	}
	return path.join(HOME, 'Downloads');
};

const status = () => ({ exe: findOpera(), downloadDir: downloadDir(), sites: SEARCH_SITES });

const open = (url) => {
	const exe = findOpera();
	if (!exe) throw new Error('Opera est introuvable. Indique son emplacement dans Paramètres.');
	if (!/^https?:\/\//i.test(url)) throw new Error('Adresse invalide.');
	spawn(exe, [url], { detached: true, stdio: 'ignore' }).unref();
};

const searchUrl = (siteId, query) => {
	const site = SEARCH_SITES.find(s => s.id === siteId) || SEARCH_SITES[0];
	return site.url.replace('{q}', encodeURIComponent(query.trim()));
};

// ---------- Téléchargements récupérés depuis Opera ----------

const PARTIAL = /\.(crdownload|opdownload|part|tmp)$/i;
const describe = (file) => {
	const st = fs.statSync(file);
	return { path: file, name: path.basename(file), size: st.size, mtime: st.mtimeMs, ext: path.extname(file).slice(1).toLowerCase() };
};

const recentDownloads = (days = 14) => {
	const dir = downloadDir();
	const since = Date.now() - days * 86400000;
	let names = [];
	try { names = fs.readdirSync(dir); } catch { return []; }
	return names
		.filter(n => INSTALLABLE.test(n) && !PARTIAL.test(n))
		.map(n => { try { return describe(path.join(dir, n)); } catch { return null; } })
		.filter(f => f && f.mtime >= since)
		.sort((a, b) => b.mtime - a.mtime)
		.slice(0, 40);
};

let watcher = null;
const pending = new Map();
const reported = new Map(); // chemin -> date de modification déjà signalée
const FRESH_MS = 2 * 60 * 1000;

// Surveille le dossier de téléchargement et signale chaque nouveau fichier de mod terminé.
const watch = (onFile) => {
	unwatch();
	const dir = downloadDir();
	try {
		watcher = fs.watch(dir, (_, name) => {
			if (!name || PARTIAL.test(name) || !INSTALLABLE.test(name)) return;
			const file = path.join(dir, name);
			clearTimeout(pending.get(file));
			// On attend que la taille soit stable : le fichier est complètement écrit.
			pending.set(file, setTimeout(function check(lastSize = -1) {
				let size;
				try { size = fs.statSync(file).size; } catch { pending.delete(file); return; }
				if (size !== lastSize || size === 0) { pending.set(file, setTimeout(() => check(size), 800)); return; }
				pending.delete(file);
				// Seuls les fichiers réellement nouveaux comptent : lire un zip (détection de ROM) met à jour
				// sa date d'accès, ce que Windows signale aussi comme un changement.
				const st = fs.statSync(file);
				const changedAt = Math.max(st.mtimeMs, st.birthtimeMs);
				if (Date.now() - changedAt > FRESH_MS || reported.get(file) === st.mtimeMs) return;
				reported.set(file, st.mtimeMs);
				onFile(describe(file));
			}, 800));
		});
	} catch (error) {
		console.error('Surveillance des téléchargements impossible :', error.message);
	}
	return dir;
};

const unwatch = () => {
	if (watcher) watcher.close();
	watcher = null;
	for (const t of pending.values()) clearTimeout(t);
	pending.clear();
};

module.exports = { SEARCH_SITES, findOpera, downloadDir, status, open, searchUrl, recentDownloads, watch, unwatch };
