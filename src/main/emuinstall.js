// Installation en un clic d'émulateurs externes depuis leur source officielle : Ryujinx (update.ryujinx.app) et
// les versions publiées par les projets eux-mêmes sur GitHub (PCSX2, RPCS3, xemu, shadPS4, Xenia Canary,
// DuckStation, Azahar, Cemu, PPSSPP). Les fichiers vont dans Documents\Smash Emu\emulators\<id> ; rien n'est
// installé ailleurs sur le PC. Aucun BIOS, firmware, clé ni jeu n'est téléchargé.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { net } = require('electron');
const AdmZip = require('adm-zip');
const store = require('./store');
const emulators = require('./emulators');

const DIR = id => path.join(store.ROOT, 'emulators', id);

// github : dépôt officiel ; asset : fichier Windows x64 de la dernière version ; portable : fichier ou dossier
// créé à côté de l'exécutable pour que l'émulateur garde ses réglages dans son dossier.
const SOURCES = {
	// Le site officiel renvoie l'adresse de la dernière version stable pour Windows.
	ryujinx: { query: 'https://update.ryujinx.app/download/query?os=win&arch=x64&rc=stable', hosts: ['ryujinx.app', 'git.ryujinx.app', 'update.ryujinx.app'], portable: { dir: 'portable' } },
	pcsx2: { github: 'PCSX2/pcsx2', asset: /windows-x64-Qt\.7z$/i, portable: { file: 'portable.ini' } },
	rpcs3: { github: 'RPCS3/rpcs3-binaries-win', asset: /_win64[^/]*\.7z$/i, versionFromAsset: true },
	xemu: { github: 'xemu-project/xemu', asset: /^xemu-win-x86_64-release\.zip$/i },
	shadps4: { github: 'shadps4-emu/shadPS4', asset: /win64[^/]*\.zip$/i },
	xenia: { github: 'xenia-canary/xenia-canary-releases', asset: /windows[^/]*\.zip$/i },
	duckstation: { github: 'stenzek/duckstation', asset: /^duckstation-windows-x64-release\.zip$/i, portable: { file: 'portable.txt' } },
	azahar: { github: 'azahar-emu/azahar', asset: /^azahar-windows-msvc-[\d.]+\.zip$/i },
	cemu: { github: 'cemu-project/Cemu', asset: /windows-x64\.zip$/i, portable: { dir: 'portable' } },
	ppsspp: { github: 'hrydgard/ppsspp', asset: /Windows-x64\.zip$/i },
};

const TRUSTED = /(^|\.)(github\.com|githubusercontent\.com)$/;

// Trouve l'adresse d'un fichier .zip dans la réponse (JSON de n'importe quelle forme, ou texte brut).
const findUrl = (value) => {
	if (typeof value === 'string') return /^https:\/\/\S+\.(zip)(\?\S*)?$/i.test(value.trim()) ? value.trim() : null;
	if (Array.isArray(value)) { for (const v of value) { const u = findUrl(v); if (u) return u; } return null; }
	if (value && typeof value === 'object') { for (const v of Object.values(value)) { const u = findUrl(v); if (u) return u; } }
	return null;
};

const resolveQuery = async (src) => {
	let res;
	try { res = await net.fetch(src.query, { signal: AbortSignal.timeout(20000), redirect: 'follow' }); } catch { throw new Error('Le serveur officiel est injoignable pour le moment. Réessaie plus tard ou télécharge-le depuis le site.'); }
	if (!res.ok) throw new Error(`Le serveur officiel a répondu ${res.status}.`);
	const finalUrl = res.url || '';
	if (/\.zip(\?|$)/i.test(finalUrl)) return { url: finalUrl, name: 'archive.zip', version: (decodeURIComponent(finalUrl).match(/(\d+\.\d+\.\d+(?:\.\d+)?)/) || [])[1] || '' };
	const text = await res.text();
	let url = null;
	try { url = findUrl(JSON.parse(text)); } catch { url = findUrl(text); }
	if (!url) throw new Error('Impossible de trouver le fichier de téléchargement dans la réponse du serveur officiel.');
	const host = new URL(url).hostname;
	if (!src.hosts.some(h => host === h || host.endsWith(`.${h}`)) && !TRUSTED.test(host)) throw new Error(`Adresse de téléchargement inattendue (${host}) : installation annulée par sécurité.`);
	return { url, name: 'archive.zip', version: (decodeURIComponent(url).match(/(\d+\.\d+\.\d+(?:\.\d+)?)/) || [])[1] || '' };
};

// Dernière version publiée sur GitHub par le projet officiel.
const resolveGithub = async (src) => {
	let res;
	try {
		res = await net.fetch(`https://api.github.com/repos/${src.github}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Smash-Emu' }, signal: AbortSignal.timeout(20000) });
	} catch { throw new Error('GitHub est injoignable pour le moment. Réessaie plus tard.'); }
	if (res.status === 403 || res.status === 429) throw new Error('GitHub limite les demandes pour l’instant (60 par heure) : réessaie dans un moment.');
	if (!res.ok) throw new Error(`GitHub a répondu ${res.status}.`);
	const rel = await res.json();
	const asset = (rel.assets || []).find(a => src.asset.test(a.name));
	if (!asset) throw new Error('La dernière version ne contient pas de fichier pour Windows 64 bits.');
	const url = asset.browser_download_url;
	if (!TRUSTED.test(new URL(url).hostname)) throw new Error('Adresse de téléchargement inattendue : installation annulée par sécurité.');
	// RPCS3 publie sous un tag de commit : le numéro lisible est dans le nom du fichier.
	const version = src.versionFromAsset ? ((asset.name.match(/v(\d+\.\d+\.\d+(?:-\d+)?)/) || [])[1] || rel.tag_name) : (rel.tag_name || rel.name || '');
	return { url, name: asset.name, version, size: asset.size };
};

const download = async (url, file, progress) => {
	const res = await net.fetch(url, { redirect: 'follow' });
	if (!res.ok || !res.body) throw new Error(`Téléchargement impossible (${res.status}).`);
	const total = Number(res.headers.get('content-length')) || 0;
	const out = fs.createWriteStream(file);
	let done = 0;
	const reader = res.body.getReader();
	for (;;) {
		const { value, done: end } = await reader.read();
		if (end) break;
		done += value.length;
		if (!out.write(Buffer.from(value))) await new Promise(r => out.once('drain', r));
		progress({ state: 'downloading', percent: total ? Math.round(done * 100 / total) : null, bytes: done });
	}
	await new Promise((resolve, reject) => { out.end(); out.on('finish', resolve); out.on('error', reject); });
};

const safeEntry = (target, name) => {
	const dest = path.resolve(target, name);
	if (dest !== target && !dest.startsWith(target + path.sep)) throw new Error('Archive invalide (chemin suspect).');
};

const run = (exe, args) => new Promise((resolve, reject) => {
	execFile(exe, args, { maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => (error ? reject(new Error(stderr || error.message)) : resolve(stdout)));
});

// .zip : lu directement ; .7z : ouvert par tar.exe, fourni avec Windows 10 et 11 (libarchive).
const extract = async (archive, target) => {
	if (/\.7z$/i.test(archive)) {
		const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
		if (!fs.existsSync(tar)) throw new Error('Windows ne sait pas ouvrir les archives .7z sur ce PC : installe l’émulateur depuis son site.');
		const list = (await run(tar, ['-tf', archive])).split(/\r?\n/).filter(Boolean);
		for (const name of list) safeEntry(target, name);
		await run(tar, ['-xf', archive, '-C', target]);
		return;
	}
	const zip = new AdmZip(archive);
	for (const entry of zip.getEntries()) safeEntry(target, entry.entryName);
	zip.extractAllTo(target, true);
};

let busy = false;

const install = async (id, progress) => {
	const src = SOURCES[id];
	if (!src) throw new Error('Installation automatique indisponible pour cet émulateur.');
	if (busy) throw new Error('Une installation est déjà en cours.');
	busy = true;
	let tmp = null;
	try {
		progress({ state: 'resolving' });
		const rel = src.github ? await resolveGithub(src) : await resolveQuery(src);
		fs.mkdirSync(store.CACHE_DIR, { recursive: true });
		tmp = path.join(store.CACHE_DIR, `${id}-download${/\.7z$/i.test(rel.name) ? '.7z' : '.zip'}`);
		await download(rel.url, tmp, progress);
		progress({ state: 'extracting' });
		const target = DIR(id);
		// Une mise à jour garde les réglages : seuls les fichiers de l'archive sont remplacés.
		fs.mkdirSync(target, { recursive: true });
		await extract(tmp, target);
		const exe = findExe(id, target);
		if (!exe) throw new Error('Archive téléchargée mais l’exécutable est introuvable.');
		if (src.portable && src.portable.dir) fs.mkdirSync(path.join(path.dirname(exe), src.portable.dir), { recursive: true });
		if (src.portable && src.portable.file) { const f = path.join(path.dirname(exe), src.portable.file); if (!fs.existsSync(f)) fs.writeFileSync(f, ''); }
		const s = store.getSettings();
		store.setSettings({ emulators: { ...(s.emulators || {}), [id]: exe }, emulatorVersions: { ...(s.emulatorVersions || {}), [id]: { version: rel.version, at: Date.now() } } });
		progress({ state: 'done', path: exe, version: rel.version });
		return exe;
	} finally {
		busy = false;
		if (tmp) fs.rmSync(tmp, { force: true });
	}
};

const findExe = (id, dir) => {
	const names = emulators.EXTERNAL[id].exe.map(n => n.toLowerCase());
	const walk = (d, depth) => {
		let entries;
		try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return null; }
		for (const n of names) { const e = entries.find(x => x.isFile() && x.name.toLowerCase() === n); if (e) return path.join(d, e.name); }
		if (depth > 0) for (const e of entries) if (e.isDirectory()) { const r = walk(path.join(d, e.name), depth - 1); if (r) return r; }
		return null;
	};
	return walk(dir, 3);
};

const available = () => Object.keys(SOURCES).filter(id => emulators.EXTERNAL[id]);

// Version installée par Smash Emu (null si l'émulateur a été installé autrement).
const installed = id => (store.getSettings().emulatorVersions || {})[id] || null;

// Comparaison souple de numéros de version (« v2.8.2 », « 2126.2 », « build-58317c9… »).
const normVersion = v => String(v || '').replace(/^(v|version|build-)\.?/i, '').trim();
const newer = (latest, current) => {
	const a = normVersion(latest);
	const b = normVersion(current);
	if (!a || a === b) return false;
	// Version désignée par un commit (Xenia Canary) : toute nouvelle publication est une mise à jour.
	if (/^[0-9a-f]{7,40}$/i.test(a) || /^[0-9a-f]{7,40}$/i.test(b)) return true;
	const na = a.match(/\d+/g);
	const nb = b.match(/\d+/g);
	if (!na || !nb || !/^\d/.test(a) || !/^\d/.test(b)) return true;
	for (let i = 0; i < Math.max(na.length, nb.length); i++) {
		const d = (+na[i] || 0) - (+nb[i] || 0);
		if (d) return d > 0;
	}
	return false;
};

// Dernières versions officielles des émulateurs installés par Smash Emu (gardées 1 h en mémoire).
let checked = { at: 0, result: {} };
const checkUpdates = async (force = false) => {
	if (!force && Date.now() - checked.at < 3600000) return checked.result;
	const result = {};
	for (const id of available()) {
		const cur = installed(id);
		if (!cur) continue;
		try {
			const src = SOURCES[id];
			const rel = src.github ? await resolveGithub(src) : await resolveQuery(src);
			result[id] = { installed: cur.version, latest: rel.version, update: newer(rel.version, cur.version) };
		} catch (error) { result[id] = { installed: cur.version, error: error.message }; }
	}
	checked = { at: Date.now(), result };
	return result;
};

module.exports = { install, available, installed, checkUpdates, newer, DIR, SOURCES };
