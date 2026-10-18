// Installation en un clic d'émulateurs externes depuis leur source officielle (Ryujinx : update.ryujinx.app).
// Les fichiers vont dans Documents\Smash Emu\emulators\<id> ; rien n'est installé ailleurs sur le PC.
const fs = require('fs');
const path = require('path');
const { net } = require('electron');
const AdmZip = require('adm-zip');
const store = require('./store');
const emulators = require('./emulators');

const DIR = id => path.join(store.ROOT, 'emulators', id);

const SOURCES = {
	// Le site officiel renvoie l'adresse de la dernière version stable pour Windows.
	ryujinx: { query: 'https://update.ryujinx.app/download/query?os=win&arch=x64&rc=stable', hosts: ['ryujinx.app', 'git.ryujinx.app', 'update.ryujinx.app'], portable: true },
};

// Trouve l'adresse d'un fichier .zip dans la réponse (JSON de n'importe quelle forme, ou texte brut).
const findUrl = (value) => {
	if (typeof value === 'string') return /^https:\/\/\S+\.(zip)(\?\S*)?$/i.test(value.trim()) ? value.trim() : null;
	if (Array.isArray(value)) { for (const v of value) { const u = findUrl(v); if (u) return u; } return null; }
	if (value && typeof value === 'object') { for (const v of Object.values(value)) { const u = findUrl(v); if (u) return u; } }
	return null;
};

const resolveUrl = async (src) => {
	let res;
	try { res = await net.fetch(src.query, { signal: AbortSignal.timeout(20000), redirect: 'follow' }); } catch { throw new Error('Le serveur officiel est injoignable pour le moment. Réessaie plus tard ou télécharge-le depuis le site.'); }
	if (!res.ok) throw new Error(`Le serveur officiel a répondu ${res.status}.`);
	const finalUrl = res.url || '';
	if (/\.zip(\?|$)/i.test(finalUrl)) return finalUrl;
	const text = await res.text();
	let url = null;
	try { url = findUrl(JSON.parse(text)); } catch { url = findUrl(text); }
	if (!url) throw new Error('Impossible de trouver le fichier de téléchargement dans la réponse du serveur officiel.');
	const host = new URL(url).hostname;
	if (!src.hosts.some(h => host === h || host.endsWith(`.${h}`)) && !/(^|\.)(github\.com|githubusercontent\.com)$/.test(host)) throw new Error(`Adresse de téléchargement inattendue (${host}) : installation annulée par sécurité.`);
	return url;
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

let busy = false;

const install = async (id, progress) => {
	const src = SOURCES[id];
	if (!src) throw new Error('Installation automatique indisponible pour cet émulateur.');
	if (busy) throw new Error('Une installation est déjà en cours.');
	busy = true;
	const tmp = path.join(store.CACHE_DIR, `${id}-download.zip`);
	try {
		progress({ state: 'resolving' });
		const url = await resolveUrl(src);
		fs.mkdirSync(store.CACHE_DIR, { recursive: true });
		await download(url, tmp, progress);
		progress({ state: 'extracting' });
		const target = DIR(id);
		fs.rmSync(target, { recursive: true, force: true });
		fs.mkdirSync(target, { recursive: true });
		const zip = new AdmZip(tmp);
		for (const entry of zip.getEntries()) {
			const dest = path.resolve(target, entry.entryName);
			if (dest !== target && !dest.startsWith(target + path.sep)) throw new Error('Archive invalide (chemin suspect).');
		}
		zip.extractAllTo(target, true);
		if (src.portable) {
			// Mode portable : clés, jeux et réglages restent dans le dossier de l'émulateur.
			const exe = findExe(id, target);
			if (exe) fs.mkdirSync(path.join(path.dirname(exe), 'portable'), { recursive: true });
		}
		const exe = findExe(id, target);
		if (!exe) throw new Error('Archive téléchargée mais l’exécutable est introuvable.');
		const s = store.getSettings();
		store.setSettings({ emulators: { ...(s.emulators || {}), [id]: exe } });
		progress({ state: 'done', path: exe });
		return exe;
	} finally {
		busy = false;
		fs.rmSync(tmp, { force: true });
	}
};

const findExe = (id, dir) => {
	const names = emulators.EXTERNAL[id].exe.map(n => n.toLowerCase());
	const walk = (d, depth) => {
		let entries;
		try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return null; }
		for (const e of entries) if (e.isFile() && names.includes(e.name.toLowerCase())) return path.join(d, e.name);
		if (depth > 0) for (const e of entries) if (e.isDirectory()) { const r = walk(path.join(d, e.name), depth - 1); if (r) return r; }
		return null;
	};
	return walk(dir, 3);
};

const available = () => Object.keys(SOURCES);

module.exports = { install, available, DIR };
