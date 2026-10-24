// Mods GameBanana (API publique, sans compte) : recherche du jeu, liste des mods (populaires, récents, mieux notés,
// recherche), fiche d'un mod et installation en un clic. Switch : le mod va dans le dossier « load » de Citron ou
// d'Eden (chargé automatiquement) ; N64 et Coop DX : installateur de Smash Emu (patchs, mods Lua) ; autres consoles :
// rangé avec le jeu, dossier ouvert.
const fs = require('fs');
const path = require('path');
const { net, shell } = require('electron');
const store = require('./store');
const systems = require('./systems');
const games = require('./games');

const API = 'https://gamebanana.com/apiv11';
const HEADERS = { 'User-Agent': 'SmashEmu (mods ; https://github.com/youssefhassani3005-oss/smash-emu)' };
const SORTS = { popular: 'Generic_MostDownloaded', recent: 'Generic_Newest', liked: 'Generic_MostLiked', updated: 'Generic_LatestUpdated' };
const MAX_FILE = 2 * 1024 ** 3;

const getJson = async (url) => {
	let res;
	try { res = await net.fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(25000) }); } catch { throw new Error('GameBanana est injoignable pour le moment.'); }
	if (!res.ok) throw new Error(`GameBanana a répondu ${res.status}.`);
	return res.json();
};

const image = (media) => {
	const img = media && media._aImages && media._aImages[0];
	return img ? `${img._sBaseUrl}/${img._sFile530 || img._sFile220 || img._sFile}` : null;
};
const images = media => ((media && media._aImages) || []).map(img => `${img._sBaseUrl}/${img._sFile530 || img._sFile}`).slice(0, 8);

// Jeux GameBanana dont le nom ressemble au jeu de l'instance. La recherche du site est stricte (« Lets » ne trouve
// pas « Let's ») : plusieurs variantes du nom sont essayées, puis les jeux sont classés par mots en commun.
const words = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/'/g, '').split(/[^a-z0-9]+/).filter(w => w.length > 1);
const variants = (q) => {
	const base = String(q).replace(/\s+/g, ' ').trim().slice(0, 80);
	const fixed = base.replace(/\b(lets|its|dont|cant|wont)\b/gi, m => `${m.slice(0, -1)}'${m.slice(-1)}`);
	const w = fixed.split(' ');
	return [...new Set([base, fixed, w.slice(0, 3).join(' '), w.slice(1, 4).join(' '), w.slice(0, 2).join(' ')].filter(v => v.length > 2))];
};
const findGames = async (q) => {
	const seen = new Map();
	for (const v of variants(q)) {
		let r;
		try { r = await getJson(`${API}/Util/Search/Results?_sModelName=Game&_sSearchString=${encodeURIComponent(v)}&_nPage=1`); } catch { continue; }
		for (const g of r._aRecords || []) if (!seen.has(g._idRow)) seen.set(g._idRow, { id: g._idRow, name: g._sName, icon: g._sIconUrl || image(g._aPreviewMedia), mods: g._nModCount || null });
		if (seen.size >= 24) break;
	}
	const want = new Set(words(q));
	const score = g => words(g.name).filter(w => want.has(w)).length / Math.max(1, words(g.name).length + 0.5);
	return [...seen.values()].sort((a, b) => score(b) - score(a)).slice(0, 8);
};

const modCard = m => ({
	id: m._idRow, name: m._sName, image: image(m._aPreviewMedia), likes: m._nLikeCount || 0, views: m._nViewCount || 0,
	author: m._aSubmitter && m._aSubmitter._sName, category: m._aRootCategory && m._aRootCategory._sName, updated: (m._tsDateUpdated || m._tsDateAdded || 0) * 1000,
});

const listMods = async (gameId, { sort = 'popular', page = 1, q = '' } = {}) => {
	const id = Number(gameId);
	if (!id) throw new Error('Jeu GameBanana inconnu.');
	const url = q
		? `${API}/Util/Search/Results?_sModelName=Mod&_sSearchString=${encodeURIComponent(q.slice(0, 80))}&_idGameRow=${id}&_nPage=${page}`
		: `${API}/Mod/Index?_nPage=${page}&_nPerpage=24&_aFilters%5BGeneric_Game%5D=${id}&_sSort=${SORTS[sort] || SORTS.popular}`;
	const r = await getJson(url);
	return { total: (r._aMetadata && r._aMetadata._nRecordCount) || 0, last: !!(r._aMetadata && r._aMetadata._bIsComplete), mods: (r._aRecords || []).filter(m => m._sModelName === 'Mod').map(modCard) };
};

const profile = async (modId) => {
	const m = await getJson(`${API}/Mod/${Number(modId)}/ProfilePage`);
	return {
		...modCard(m), images: images(m._aPreviewMedia), text: String(m._sText || '').slice(0, 20000), downloads: m._nDownloadCount || 0,
		url: m._sProfileUrl || `https://gamebanana.com/mods/${Number(modId)}`,
		files: (m._aFiles || []).map(f => ({ id: f._idRow, name: f._sFile, size: f._nFilesize || 0, description: f._sDescription || '', url: f._sDownloadUrl, version: f._sVersion || '' })),
	};
};

// ---------- Installation ----------

const safe = s => String(s || 'mod').replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'mod';

const download = async (url, file, progress) => {
	if (!/^https:\/\/(gamebanana\.com|files\.gamebanana\.com)\//.test(String(url))) throw new Error('Adresse de téléchargement inattendue : installation annulée par sécurité.');
	const res = await net.fetch(url, { headers: HEADERS, redirect: 'follow' });
	if (!res.ok || !res.body) throw new Error(`Téléchargement impossible (${res.status}).`);
	const host = new URL(res.url || url).hostname;
	if (!/(^|\.)gamebanana\.com$/.test(host)) throw new Error(`Adresse de téléchargement inattendue (${host}) : installation annulée par sécurité.`);
	const total = Number(res.headers.get('content-length')) || 0;
	if (total > MAX_FILE) throw new Error('Fichier trop lourd (2 Go maximum).');
	const out = fs.createWriteStream(file);
	const reader = res.body.getReader();
	let done = 0;
	for (;;) {
		const { value, done: end } = await reader.read();
		if (end) break;
		done += value.length;
		if (done > MAX_FILE) { out.destroy(); throw new Error('Fichier trop lourd (2 Go maximum).'); }
		if (!out.write(Buffer.from(value))) await new Promise(r => out.once('drain', r));
		progress({ percent: total ? Math.round((done * 100) / total) : null });
	}
	await new Promise((resolve, reject) => { out.end(); out.on('finish', resolve); out.on('error', reject); });
};

// Dossier d'un mod Switch dans l'archive : celui qui contient romfs, exefs ou cheats (sinon la racine).
const modRoots = (dir) => {
	const found = [];
	const walk = (d, depth) => {
		let entries;
		try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
		if (entries.some(e => e.isDirectory() && /^(romfs|exefs|cheats)$/i.test(e.name))) { found.push(d); return; }
		if (depth > 0) for (const e of entries) if (e.isDirectory()) walk(path.join(d, e.name), depth - 1);
	};
	walk(dir, 4);
	return found;
};

const copyDir = (from, to) => {
	fs.mkdirSync(to, { recursive: true });
	for (const e of fs.readdirSync(from, { withFileTypes: true })) {
		const s = path.join(from, e.name);
		const d = path.join(to, e.name);
		if (e.isDirectory()) copyDir(s, d);
		else fs.copyFileSync(s, d);
	}
};

const install = async (instanceId, modId, fileId, progress = () => {}) => {
	const inst = store.getInstance(instanceId);
	if (!inst) throw new Error('Jeu introuvable.');
	const mod = await profile(modId);
	const file = mod.files.find(f => String(f.id) === String(fileId)) || mod.files[0];
	if (!file) throw new Error('Ce mod n’a pas de fichier à télécharger.');
	fs.mkdirSync(store.CACHE_DIR, { recursive: true });
	const tmp = path.join(store.CACHE_DIR, `gb-${Date.now()}-${safe(file.name)}`);
	const work = `${tmp}-x`;
	progress({ state: 'downloading', percent: 0 });
	try {
		await download(file.url, tmp, p => progress({ state: 'downloading', ...p }));
		progress({ state: 'installing' });
		const system = inst.type === 'coopdx' ? 'n64' : games.systemOf(inst);
		const origin = { source: 'gamebanana', id: mod.id, name: mod.name, url: mod.url, file: file.name };
		// N64 et Coop DX : installateur habituel (patchs IPS/BPS, mods Lua, archives).
		if (inst.type === 'coopdx' || system === 'n64') {
			const installed = require('./installer').installData(instanceId, file.name, fs.readFileSync(tmp), origin);
			return { where: 'instance', installed, name: mod.name };
		}
		fs.mkdirSync(work, { recursive: true });
		if (/\.(zip|7z|rar)$/i.test(file.name)) await require('./emuinstall').extract(tmp, work);
		else fs.copyFileSync(tmp, path.join(work, safe(file.name)));
		if (system === 'switch') {
			const switchkeys = require('./switchkeys');
			const switchgame = require('./switchgame');
			const romFile = inst.rom && inst.rom.linked;
			const tid = (String(romFile || '').match(/\[(0100[0-9A-Fa-f]{12})\]/) || [])[1] || (romFile && (switchgame.prepare(romFile, { keyFiles: switchkeys.keyFiles(), unpack: false }) || {}).tid);
			if (!tid) throw new Error('Identifiant du jeu Switch introuvable (clés manquantes ?).');
			const roots = modRoots(work);
			const targets = [];
			for (const emu of ['eden', 'citron']) {
				const base = path.join(switchkeys.yuzuUserDir(emu), 'load', tid.toUpperCase());
				(roots.length ? roots : [work]).forEach((r, i) => {
					const name = safe(roots.length > 1 ? `${mod.name} - ${path.basename(r)}` : mod.name);
					copyDir(r, path.join(base, name));
					if (i === 0) targets.push(base);
				});
			}
			return { where: 'switch', folder: targets[0], name: mod.name, tid };
		}
		// Autres consoles : rangé avec le jeu ; le joueur suit les instructions du mod.
		const dest = path.join(store.instanceDir(instanceId), 'gamebanana', safe(mod.name));
		copyDir(work, dest);
		shell.openPath(dest);
		return { where: 'folder', folder: dest, name: mod.name, system: (systems.SYSTEMS[system] || {}).label || system };
	} finally {
		fs.rmSync(tmp, { force: true });
		fs.rmSync(work, { recursive: true, force: true });
	}
};

module.exports = { findGames, listMods, profile, install, modRoots, copyDir, SORTS };
