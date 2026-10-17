// Logique par type de jeu : détection, contenu (mods / packs / patchs) et préparation du lancement.
const fs = require('fs');
const path = require('path');
const os = require('os');
const store = require('./store');
const rom = require('./rom');
const systems = require('./systems');
const emulators = require('./emulators');

const HOME = os.homedir();
const APPDATA = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');

// ---------- Détection des exécutables ----------

const findFile = (roots, fileName, maxDepth) => {
	const target = fileName.toLowerCase();
	const skip = new Set(['node_modules', '.git', 'appdata', '$recycle.bin']);
	const walk = (dir, depth) => {
		let entries;
		try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
		for (const e of entries) if (e.isFile() && e.name.toLowerCase() === target) return path.join(dir, e.name);
		if (depth >= maxDepth) return null;
		for (const e of entries) {
			if (!e.isDirectory() || skip.has(e.name.toLowerCase())) continue;
			const found = walk(path.join(dir, e.name), depth + 1);
			if (found) return found;
		}
		return null;
	};
	for (const r of roots) {
		const found = walk(r, 0);
		if (found) return found;
	}
	return null;
};

const detectCoopdx = () => findFile([path.join(HOME, 'Documents'), path.join(HOME, 'Downloads'), path.join(HOME, 'Desktop')], 'sm64coopdx.exe', 3);

const detectProject64 = () => {
	const pf = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles].filter(Boolean);
	for (const base of pf) {
		let dirs = [];
		try { dirs = fs.readdirSync(base).filter(d => /^project64/i.test(d)); } catch { /* absent */ }
		for (const d of dirs) {
			const exe = path.join(base, d, 'Project64.exe');
			if (fs.existsSync(exe)) return exe;
		}
	}
	return findFile([path.join(HOME, 'Downloads'), path.join(HOME, 'Desktop')], 'Project64.exe', 2);
};

const resolvePaths = () => {
	const s = store.getSettings();
	const coopdx = s.coopdxPath && fs.existsSync(s.coopdxPath) ? s.coopdxPath : detectCoopdx();
	const project64 = s.project64Path && fs.existsSync(s.project64Path) ? s.project64Path : detectProject64();
	return { coopdx, project64 };
};

// ---------- Métadonnées des mods Lua ----------

// Retire les codes couleur de sm64coopdx (\#rrggbb\, parfois écrits \\#rrggbb\\) et décode les \n.
const cleanText = s => s.replace(/\\{1,2}#[0-9a-fA-F]{3,8}\\{1,2}/g, '').replace(/\\n/g, '\n').replace(/\\\\/g, '\\').trim();

const readLuaHeader = (file) => {
	const meta = {};
	let text = '';
	try { text = fs.readFileSync(file, 'utf8').slice(0, 6000); } catch { return meta; }
	for (const line of text.split(/\r?\n/).slice(0, 40)) {
		const m = line.match(/^--\s*(name|description|incompatible|category|pausable)\s*:\s*(.*)$/i);
		if (m) meta[m[1].toLowerCase()] = cleanText(m[2]);
	}
	return meta;
};

const isDynosPack = (dir) => {
	try {
		const names = fs.readdirSync(dir).map(n => n.toLowerCase());
		if (names.some(n => n.endsWith('.lua'))) return false;
		return names.some(n => /\.(bin|tex|lvl|bhv|col)$/.test(n) || n === 'actors' || n === 'levels' || n === 'textures');
	} catch { return false; }
};

const listModsIn = (modsDir, source) => {
	let entries = [];
	try { entries = fs.readdirSync(modsDir, { withFileTypes: true }); } catch { return []; }
	const mods = [];
	for (const e of entries) {
		const full = path.join(modsDir, e.name);
		if (e.isFile() && e.name.toLowerCase().endsWith('.lua')) {
			const meta = readLuaHeader(full);
			mods.push({ rel: e.name, kind: 'mod', source, path: full, name: meta.name || e.name.replace(/\.lua$/i, ''), description: meta.description || '', incompatible: meta.incompatible || '' });
		} else if (e.isDirectory()) {
			const main = path.join(full, 'main.lua');
			const meta = fs.existsSync(main) ? readLuaHeader(main) : {};
			const iconFile = ['icon.png', 'icon.jpg'].map(f => path.join(full, f)).find(f => fs.existsSync(f));
			mods.push({ rel: e.name, kind: 'mod', source, path: full, name: meta.name || e.name, description: meta.description || '', incompatible: meta.incompatible || '', icon: iconFile || null });
		}
	}
	return mods;
};

const listPacksIn = (packsDir, source, enabled) => {
	let entries = [];
	try { entries = fs.readdirSync(packsDir, { withFileTypes: true }); } catch { return []; }
	return entries.filter(e => e.isDirectory()).map(e => ({ rel: e.name, kind: 'pack', source, path: path.join(packsDir, e.name), name: e.name, description: 'Pack DynOS (modèles / textures)', enabled }));
};

// ---------- Contenu d'une instance ----------

const modKey = m => `${m.source}:${m.kind}:${m.rel}`;

const listContent = (id) => {
	const inst = store.getInstance(id);
	const dir = store.instanceDir(id);
	const state = inst.mods || {};
	let items = [];

	if (inst.type === 'coopdx') {
		const { coopdx } = resolvePaths();
		const gameDir = coopdx ? path.dirname(coopdx) : null;
		items = [
			...listModsIn(path.join(dir, 'mods'), 'instance'),
			...(gameDir ? listModsIn(path.join(gameDir, 'mods'), 'builtin') : []),
		].map(m => ({ ...m, enabled: state[modKey(m)] ? !!state[modKey(m)].enabled : m.source === 'instance' }));
		items.push(...listPacksIn(path.join(dir, 'dynos', 'packs'), 'instance', true));
		items.push(...listPacksIn(path.join(dir, 'dynos', 'packs-disabled'), 'instance', false));
		if (gameDir) items.push(...listPacksIn(path.join(gameDir, 'dynos', 'packs'), 'builtin', true));
	} else {
		const patchDir = path.join(dir, 'patches');
		let files = [];
		try { files = fs.readdirSync(patchDir).filter(f => rom.patchKind(f)); } catch { /* aucun */ }
		const order = inst.patchOrder || [];
		files.sort((a, b) => (order.indexOf(a) + 1 || 1e9) - (order.indexOf(b) + 1 || 1e9) || a.localeCompare(b));
		items = files.map(f => {
			const m = { rel: f, kind: 'patch', source: 'instance', path: path.join(patchDir, f), name: f.replace(/\.(ips|bps)$/i, ''), description: `Patch ${rom.patchKind(f).toUpperCase()}` };
			return { ...m, enabled: state[modKey(m)] ? !!state[modKey(m)].enabled : true };
		});
	}

	return items.map(m => ({ ...m, key: modKey(m), origin: (state[modKey(m)] || {}).origin || null }));
};

const setEnabled = (id, key, enabled) => {
	const inst = store.getInstance(id);
	const [source, kind, rel] = key.split(':');
	if (kind === 'pack') {
		if (source !== 'instance') throw new Error('Les packs intégrés au jeu se gèrent depuis le menu DynOS en jeu.');
		const dir = store.instanceDir(id);
		const from = path.join(dir, 'dynos', enabled ? 'packs-disabled' : 'packs', rel);
		const to = path.join(dir, 'dynos', enabled ? 'packs' : 'packs-disabled', rel);
		fs.mkdirSync(path.dirname(to), { recursive: true });
		if (fs.existsSync(from)) fs.renameSync(from, to);
		return;
	}
	const mods = { ...(inst.mods || {}) };
	mods[key] = { ...(mods[key] || {}), enabled };
	store.updateInstance(id, { mods });
};

const removeContent = (id, key) => {
	const [source, kind, rel] = key.split(':');
	if (source !== 'instance') throw new Error('Les mods intégrés au jeu ne peuvent pas être supprimés depuis le launcher.');
	const item = listContent(id).find(m => m.key === key);
	if (!item) throw new Error('Contenu introuvable.');
	fs.rmSync(item.path, { recursive: true, force: true });
	const inst = store.getInstance(id);
	const mods = { ...(inst.mods || {}) };
	delete mods[key];
	store.updateInstance(id, { mods, patchOrder: (inst.patchOrder || []).filter(f => !(kind === 'patch' && f === rel)) });
};

// ---------- ROM de base ----------

const setRom = (id, filePath, extra = {}) => {
	const inst = store.getInstance(id);
	const raw = fs.readFileSync(filePath);
	const info = rom.romInfo(raw);
	if (!info) throw new Error('Ce fichier n\'est pas une ROM N64 (.z64, .v64 ou .n64).');
	if (inst.type === 'coopdx' && !info.isSm64Us) {
		throw new Error(`sm64coopdx demande la ROM Super Mario 64 (US). Cette ROM est : ${info.known || info.title}.`);
	}
	const z = rom.toZ64(raw);
	const dest = inst.type === 'coopdx' ? path.join(store.instanceDir(id), 'baserom.us.z64') : path.join(store.instanceDir(id), 'rom', 'base.z64');
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.writeFileSync(dest, z);
	return store.updateInstance(id, { rom: { file: extra.displayName || path.basename(filePath), info, libraryId: extra.libraryId || null } });
};

const systemOf = inst => (inst.rom && inst.rom.system) || inst.system || 'n64';

// Associe un jeu de la bibliothèque à une instance (toutes consoles). N64 : comportement historique.
const setGame = (id, lib) => {
	if ((lib.system || 'n64') === 'n64') return setRom(id, lib.path, { libraryId: lib.id, displayName: lib.originalName || lib.name });
	const inst = store.getInstance(id);
	if (inst.type === 'coopdx') throw new Error('sm64coopdx demande la ROM Super Mario 64 (US).');
	const romDir = path.join(store.instanceDir(id), 'rom');
	fs.rmSync(romDir, { recursive: true, force: true });
	let linked = null;
	if (lib.linked) linked = lib.linked;
	else {
		fs.mkdirSync(romDir, { recursive: true });
		fs.copyFileSync(lib.path, path.join(romDir, `base${path.extname(lib.path)}`));
	}
	return store.updateInstance(id, {
		system: lib.system,
		rom: { file: lib.originalName || lib.name, info: { ...lib.info, known: lib.name, title: lib.name }, libraryId: lib.id, system: lib.system, linked, ext: path.extname(lib.path).slice(1).toLowerCase() },
	});
};

// Pour Coop DX : reprend la baserom déjà fournie à sm64coopdx si elle existe.
const adoptExistingBaserom = (id) => {
	const candidates = [path.join(APPDATA, 'sm64coopdx', 'baserom.us.z64'), path.join(APPDATA, 'sm64ex-coop', 'baserom.us.z64')];
	const { coopdx } = resolvePaths();
	if (coopdx) candidates.push(path.join(path.dirname(coopdx), 'baserom.us.z64'));
	for (const c of candidates) {
		try {
			const info = rom.romInfo(fs.readFileSync(c));
			if (info && info.isSm64Us) { setRom(id, c); return true; }
		} catch { /* suivant */ }
	}
	return false;
};

// ---------- Préparation du lancement ----------

const writeCoopConfig = (dir, enabledRels) => {
	const file = path.join(dir, 'sm64config.txt');
	let lines = [];
	try { lines = fs.readFileSync(file, 'utf8').split(/\r?\n/); } catch { /* nouveau */ }
	lines = lines.filter(l => l && !l.startsWith('enable-mod:'));
	for (const rel of enabledRels) lines.push(`enable-mod: ${rel}`);
	fs.writeFileSync(file, lines.join('\n') + '\n');
};

// Moteur des instances ROM : choix de l'instance, sinon réglage par défaut (Smash Emu intégré).
// Moteur d'une instance : son choix s'il est valable pour sa console, sinon le réglage par défaut (N64),
// sinon le premier moteur disponible pour la console (intégré en priorité).
const engineFor = (inst, settings = store.getSettings()) => {
	const available = systems.enginesFor(systemOf(inst));
	const wanted = (inst.options || {}).engine;
	if (wanted && available.includes(wanted)) return wanted;
	if (systemOf(inst) === 'n64' && available.includes(settings.defaultEngine)) return settings.defaultEngine;
	return available[0] || 'smash';
};

const splitArgs = s => (s.match(/"[^"]*"|\S+/g) || []).map(a => a.replace(/^"|"$/g, ''));

const prepareLaunch = (id) => {
	const inst = store.getInstance(id);
	const settings = store.getSettings();
	const dir = store.instanceDir(id);
	const o = inst.options || {};
	const paths = resolvePaths();

	if (inst.type === 'coopdx') {
		if (!paths.coopdx) throw new Error('sm64coopdx.exe introuvable. Indique son emplacement dans Paramètres.');
		if (!fs.existsSync(path.join(dir, 'baserom.us.z64')) && !adoptExistingBaserom(id)) {
			throw new Error('ROM de base manquante : choisis ta ROM Super Mario 64 (US) dans les options de l\'instance.');
		}
		const enabled = listContent(id).filter(m => m.kind === 'mod' && m.enabled).map(m => m.rel);
		writeCoopConfig(dir, enabled);

		const args = ['--savepath', dir, '--playername', o.playerName || settings.playerName];
		if (settings.skipIntro) args.push('--skip-intro');
		if (!settings.discord) args.push('--no-discord');
		if (o.windowMode === 'fullscreen') args.push('--fullscreen');
		else args.push('--windowed', '--width', String(o.width || 1280), '--height', String(o.height || 720));
		if (o.network === 'host') args.push('--server', String(o.port || 7777));
		if (o.network === 'join' && o.host) args.push('--client', o.host, String(o.port || 7777));
		for (const rel of enabled) args.push('--enable-mod', rel);
		args.push(...splitArgs(o.extraArgs || ''));
		return { kind: 'process', exe: paths.coopdx, args, cwd: path.dirname(paths.coopdx) };
	}

	const engine = engineFor(inst, settings);
	const system = systemOf(inst);
	if (system !== 'n64') return prepareGame(inst, engine, system);
	if (engine === 'project64' && !paths.project64) throw new Error('Project64.exe introuvable. Indique son emplacement dans Paramètres, ou choisis le moteur Smash Emu.');
	const base = path.join(dir, 'rom', 'base.z64');
	if (!fs.existsSync(base)) throw new Error('Aucune ROM : choisis une ROM dans les options de l\'instance.');
	let data = fs.readFileSync(base);
	const patches = listContent(id).filter(m => m.kind === 'patch' && m.enabled);
	for (const p of patches) {
		try {
			data = rom.applyPatch(data, fs.readFileSync(p.path), p.rel);
		} catch (error) {
			throw new Error(`Patch « ${p.name} » : ${error.message}`);
		}
	}
	const out = path.join(dir, 'rom', patches.length ? 'build.z64' : 'base.z64');
	if (patches.length) fs.writeFileSync(out, data);
	if (engine === 'smash') return { kind: 'emu', rom: out, name: inst.name };
	return { kind: 'process', exe: paths.project64, args: [out, ...splitArgs(o.extraArgs || '')], cwd: path.dirname(paths.project64) };
};

// Lancement d'un jeu non N64 : cœur intégré ou émulateur externe.
const prepareGame = (inst, engine, system) => {
	const dir = store.instanceDir(inst.id);
	const sys = systems.SYSTEMS[system];
	let file;
	if (inst.rom && inst.rom.linked) {
		file = inst.rom.linked;
		if (!fs.existsSync(file)) throw new Error(`Image du jeu introuvable : ${file}`);
	} else {
		const base = inst.rom && inst.rom.ext ? path.join(dir, 'rom', `base.${inst.rom.ext}`) : null;
		if (!base || !fs.existsSync(base)) throw new Error('Aucun jeu : choisis-en un dans les options de l’instance.');
		file = base;
		const patches = listContent(inst.id).filter(m => m.kind === 'patch' && m.enabled);
		if (patches.length) {
			let data = fs.readFileSync(base);
			for (const p of patches) {
				try { data = rom.applyPatch(data, fs.readFileSync(p.path), p.rel); } catch (error) { throw new Error(`Patch « ${p.name} » : ${error.message}`); }
			}
			file = path.join(dir, 'rom', `build.${inst.rom.ext}`);
			fs.writeFileSync(file, data);
		}
	}
	if (engine === 'smash') {
		if (!sys.ejs) throw new Error(`${sys.label} n’a pas de cœur intégré : installe un émulateur externe.`);
		// Un .cue renvoie vers des pistes : l'émulateur intégré reçoit directement la première.
		if (/\.cue$/i.test(file)) file = systems.cueTracks(file)[0] || file;
		const bios = biosFor(system);
		return { kind: 'emu', rom: file, name: inst.name, system, ejs: sys.ejs, core: sys.core, threads: !!sys.threads, bios };
	}
	const ext = emulators.EXTERNAL[engine];
	if (!ext) throw new Error(`Émulateur inconnu : ${engine}`);
	const exe = emulators.pathFor(engine);
	if (!exe) throw new Error(`${ext.label} n’est pas installé. Installe-le depuis Paramètres → Émulateurs, ou indique où il se trouve.`);
	// Interface Smash Emu autour de l'émulateur externe (réglage), sinon son interface d'origine en plein écran.
	const embed = (inst.options || {}).externalUi !== 'native' && store.getSettings().externalUi !== 'native';
	const args = [...ext.args(file, { embed, shader: (inst.options || {}).externalShader, opts: (inst.options || {}).dolphin }), ...splitArgs((inst.options || {}).extraArgs || '')];
	return { kind: 'process', exe, args, cwd: path.dirname(exe), embed, emulator: engine, name: inst.name, system };
};

// BIOS facultatif fourni par l'utilisateur : Documents\Smash Emu\bios\<console>\<fichier>.
const biosFor = (system) => {
	const dir = path.join(store.ROOT, 'bios', system);
	try {
		const f = fs.readdirSync(dir).find(n => fs.statSync(path.join(dir, n)).isFile());
		return f ? path.join(dir, f) : null;
	} catch { return null; }
};

// Mods Coop DX incompatibles : leurs étiquettes « -- incompatible: » se recoupent (ex. deux « romhack »).
const tagsOf = m => (m.incompatible || '').toLowerCase().split(/[\s,]+/).filter(Boolean);
const findConflicts = (id, keys) => {
	const content = listContent(id).filter(m => m.kind === 'mod');
	const out = [];
	for (const key of keys) {
		const mod = content.find(m => m.key === key);
		if (!mod) continue;
		const tags = tagsOf(mod);
		const clash = content.filter(o => o.key !== key && o.enabled && !keys.includes(o.key) && tagsOf(o).some(t => tags.includes(t)));
		if (clash.length) out.push({ key, name: mod.name, with: clash.map(c => c.name), tags: tags.filter(t => clash.some(c => tagsOf(c).includes(t))) });
	}
	return out;
};

module.exports = { setGame, systemOf, findConflicts, engineFor, resolvePaths, detectCoopdx, detectProject64, listContent, setEnabled, removeContent, setRom, adoptExistingBaserom, prepareLaunch, readLuaHeader, isDynosPack };
