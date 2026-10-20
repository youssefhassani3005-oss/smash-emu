// Multiworld Archipelago (archipelago.gg) : installation du lanceur officiel et détection. La connexion à une
// partie (protocole WebSocket d'Archipelago) se fait dans la page Multiworld (src/renderer/multiworld.js).
const fs = require('fs');
const path = require('path');
const { net, shell } = require('electron');
const store = require('./store');

const REPO = 'ArchipelagoMW/Archipelago';

// Emplacements habituels du lanceur (installateur officiel : C:\ProgramData\Archipelago).
const candidates = () => [
	path.join(process.env.ProgramData || 'C:\\ProgramData', 'Archipelago', 'ArchipelagoLauncher.exe'),
	path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Archipelago', 'ArchipelagoLauncher.exe'),
	path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Archipelago', 'ArchipelagoLauncher.exe'),
	(store.getSettings().archipelagoPath || ''),
].filter(Boolean);

const findLauncher = () => candidates().find(p => { try { return fs.existsSync(p); } catch { return false; } }) || null;

const status = () => ({ launcher: findLauncher() });

// Dernière version officielle (GitHub) : installateur Windows « Setup.Archipelago.x.y.z.exe ».
const latest = async () => {
	const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Smash-Emu' }, signal: AbortSignal.timeout(20000) });
	if (!res.ok) throw new Error(res.status === 403 ? 'GitHub limite les demandes pour l’instant : réessaie dans un moment.' : `GitHub a répondu ${res.status}.`);
	const rel = await res.json();
	const asset = (rel.assets || []).find(a => /^Setup\.Archipelago\.[\d.]+\.exe$/i.test(a.name));
	if (!asset) throw new Error('Pas d’installateur Windows dans la dernière version.');
	return { version: rel.tag_name, name: asset.name, url: asset.browser_download_url, size: asset.size };
};

// Télécharge l'installateur officiel puis l'ouvre : c'est le joueur qui valide l'installation (Windows).
const install = async (progress) => {
	const rel = await latest();
	if (!/^https:\/\/github\.com\//.test(rel.url)) throw new Error('Adresse de téléchargement inattendue.');
	fs.mkdirSync(store.CACHE_DIR, { recursive: true });
	const file = path.join(store.CACHE_DIR, rel.name);
	const res = await net.fetch(rel.url, { redirect: 'follow' });
	if (!res.ok || !res.body) throw new Error(`Téléchargement impossible (${res.status}).`);
	const total = Number(res.headers.get('content-length')) || rel.size || 0;
	const out = fs.createWriteStream(file);
	let done = 0;
	const reader = res.body.getReader();
	for (;;) {
		const { value, done: end } = await reader.read();
		if (end) break;
		done += value.length;
		if (!out.write(Buffer.from(value))) await new Promise(r => out.once('drain', r));
		progress({ percent: total ? Math.round((done * 100) / total) : null });
	}
	await new Promise((resolve, reject) => { out.end(); out.on('finish', resolve); out.on('error', reject); });
	const err = await shell.openPath(file);
	if (err) throw new Error(err);
	return { version: rel.version, file };
};

const openLauncher = async () => {
	const exe = findLauncher();
	if (!exe) throw new Error('Lanceur Archipelago introuvable : installe-le d’abord.');
	const err = await shell.openPath(exe);
	if (err) throw new Error(err);
};

module.exports = { status, latest, install, openLauncher, findLauncher };
