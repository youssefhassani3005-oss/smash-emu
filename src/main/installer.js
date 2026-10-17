// Installation d'un fichier (zip, lua, patch, ROM) dans une instance.
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const store = require('./store');
const rom = require('./rom');
const games = require('./games');

const INSTALLABLE = /\.(zip|lua|ips|bps|z64|v64|n64)$/i;

const safeName = n => n.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();

// Chemin sûr à l'intérieur d'un dossier (protège contre « ../ » dans les zips).
const inside = (root, rel) => {
	const out = path.resolve(root, rel);
	if (out !== root && !out.startsWith(root + path.sep)) throw new Error(`Chemin dangereux dans l'archive : ${rel}`);
	return out;
};

const isPackFile = n => /\.(bin|tex|lvl|bhv|col)$/i.test(n);

// Analyse les entrées d'un zip et renvoie ce qu'il contient.
const analyzeZip = (entries) => {
	const files = entries.filter(e => !e.isDirectory).map(e => e.entryName.replace(/\\/g, '/'));
	const dirOf = f => f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '';
	const found = { mods: [], packs: [], patches: [], roms: [], loose: [] };

	// Dossiers de mods : ceux qui contiennent main.lua (le plus haut l'emporte).
	const modRoots = [...new Set(files.filter(f => /(^|\/)main\.lua$/i.test(f)).map(dirOf))]
		.filter((d, _, all) => !all.some(o => o !== d && (o === '' ? d !== '' : d.startsWith(o + '/'))));
	const inMod = f => modRoots.some(r => r === '' || f.startsWith(r + '/'));

	for (const r of modRoots) found.mods.push({ type: 'dir', root: r, name: r ? r.split('/').pop() : null });

	// Packs DynOS : dossiers avec fichiers .bin/.tex… sans Lua (racine = parent de actors/ si présent).
	const packRoots = new Set();
	for (const f of files) {
		if (inMod(f) || !isPackFile(f)) continue;
		let d = dirOf(f);
		const m = d.match(/^(.*?)(?:^|\/)(actors|levels|textures|behaviors|collisions)(\/|$)/i);
		if (m) d = m[1];
		if (d && /(^|\/)packs$/i.test(d)) continue;
		packRoots.add(d);
	}
	for (const r of packRoots) found.packs.push({ root: r, name: r ? r.split('/').pop() : null });

	for (const f of files) {
		if (inMod(f) || [...packRoots].some(r => r === '' || f.startsWith(r + '/'))) continue;
		if (/\.lua$/i.test(f)) found.mods.push({ type: 'file', root: f, name: f.split('/').pop() });
		else if (rom.patchKind(f)) found.patches.push(f);
		else if (/\.(z64|v64|n64)$/i.test(f)) found.roms.push(f);
	}
	return found;
};

const extractDir = (zip, root, dest) => {
	fs.rmSync(dest, { recursive: true, force: true });
	fs.mkdirSync(dest, { recursive: true });
	const prefix = root ? root + '/' : '';
	for (const e of zip.getEntries()) {
		const name = e.entryName.replace(/\\/g, '/');
		if (e.isDirectory || !name.startsWith(prefix)) continue;
		const out = inside(dest, name.slice(prefix.length));
		fs.mkdirSync(path.dirname(out), { recursive: true });
		fs.writeFileSync(out, e.getData());
	}
};

const recordOrigin = (id, keys, origin) => {
	if (!origin) return;
	const inst = store.getInstance(id);
	const mods = { ...(inst.mods || {}) };
	for (const k of keys) mods[k] = { ...(mods[k] || {}), enabled: true, origin: { ...origin, installedAt: Date.now() } };
	store.updateInstance(id, { mods });
};

const addPatch = (id, name, data, installed) => {
	const dir = path.join(store.instanceDir(id), 'patches');
	fs.mkdirSync(dir, { recursive: true });
	const file = safeName(name);
	fs.writeFileSync(path.join(dir, file), data);
	const inst = store.getInstance(id);
	store.updateInstance(id, { patchOrder: [...(inst.patchOrder || []).filter(f => f !== file), file] });
	installed.push({ kind: 'patch', name: file, key: `instance:patch:${file}` });
};

const setRomFromData = (id, name, data, installed) => {
	const tmp = path.join(store.CACHE_DIR, `rom-${Date.now()}-${safeName(name)}`);
	fs.writeFileSync(tmp, data);
	try { games.setRom(id, tmp); } finally { fs.rmSync(tmp, { force: true }); }
	installed.push({ kind: 'rom', name });
};

/**
 * Installe `data` (Buffer) nommé `fileName` dans l'instance `id`.
 * Renvoie la liste de ce qui a été installé.
 */
const installData = (id, fileName, data, origin = null) => {
	const inst = store.getInstance(id);
	const dir = store.instanceDir(id);
	const ext = fileName.toLowerCase().split('.').pop();
	const installed = [];
	const baseName = safeName(fileName.replace(/\.[^.]+$/, ''));

	if (ext === 'lua') {
		if (inst.type !== 'coopdx') throw new Error('Les mods Lua sont pour les instances SM64 Coop DX.');
		const modsDir = path.join(dir, 'mods');
		fs.mkdirSync(modsDir, { recursive: true });
		fs.writeFileSync(path.join(modsDir, safeName(fileName)), data);
		installed.push({ kind: 'mod', name: fileName, key: `instance:mod:${safeName(fileName)}` });
	} else if (rom.patchKind(fileName)) {
		if (inst.type !== 'rom') throw new Error('Les patchs IPS/BPS sont pour les instances ROM N64.');
		addPatch(id, fileName, data, installed);
	} else if (['z64', 'v64', 'n64'].includes(ext)) {
		setRomFromData(id, fileName, data, installed);
	} else if (ext === 'zip') {
		const zip = new AdmZip(data);
		const found = analyzeZip(zip.getEntries());

		if (inst.type === 'coopdx') {
			const modsDir = path.join(dir, 'mods');
			for (const m of found.mods) {
				if (m.type === 'dir') {
					const name = safeName(m.name || baseName);
					extractDir(zip, m.root, inside(modsDir, name));
					installed.push({ kind: 'mod', name, key: `instance:mod:${name}` });
				} else {
					const name = safeName(m.name);
					fs.mkdirSync(modsDir, { recursive: true });
					fs.writeFileSync(path.join(modsDir, name), zip.getEntry(m.root).getData());
					installed.push({ kind: 'mod', name, key: `instance:mod:${name}` });
				}
			}
			for (const p of found.packs) {
				const name = safeName(p.name || baseName);
				extractDir(zip, p.root, inside(path.join(dir, 'dynos', 'packs'), name));
				installed.push({ kind: 'pack', name, key: `instance:pack:${name}` });
			}
		} else {
			for (const p of found.patches) addPatch(id, p.split('/').pop(), zip.getEntry(p).getData(), installed);
			if (found.roms.length) setRomFromData(id, found.roms[0].split('/').pop(), zip.getEntry(found.roms[0]).getData(), installed);
		}
		if (!installed.length) {
			const what = inst.type === 'coopdx' ? 'aucun mod Lua ni pack DynOS' : 'aucun patch IPS/BPS ni ROM';
			throw new Error(`Cette archive ne contient ${what} utilisable par cette instance.`);
		}
	} else {
		throw new Error(`Type de fichier non pris en charge : .${ext}`);
	}

	recordOrigin(id, installed.filter(i => i.key).map(i => i.key), origin);

	// Un mod en conflit avec un mod déjà actif est installé mais laissé désactivé.
	if (inst.type === 'coopdx') {
		for (const c of games.findConflicts(id, installed.filter(i => i.kind === 'mod').map(i => i.key))) {
			games.setEnabled(id, c.key, false);
			const item = installed.find(i => i.key === c.key);
			if (item) item.conflict = c;
		}
	}
	return installed;
};

const installFile = (id, filePath, origin = null) => installData(id, path.basename(filePath), fs.readFileSync(filePath), origin || { type: 'file', file: filePath });

module.exports = { INSTALLABLE, analyzeZip, installData, installFile };
