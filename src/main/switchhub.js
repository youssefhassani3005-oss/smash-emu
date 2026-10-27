// Centre Switch : tout ce qui concerne un jeu Switch joué avec Citron ou Eden, au même endroit. Sauvegardes (copies de
// secours automatiques, restauration, transfert entre émulateurs, export), réglages propres au jeu (fichier
// config/custom/<id>.ini de l'émulateur), mods, triches, cache de shaders et diagnostic quand un jeu ne démarre pas.
// Rien ne modifie le fichier du jeu ; les copies de secours vont dans Documents\Smash Emu\switch-saves.
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('./store');
const emulators = require('./emulators');
const switchkeys = require('./switchkeys');
const switchgame = require('./switchgame');

const ENGINES = ['citron', 'eden'];
const LABEL = { citron: 'Citron', eden: 'Eden' };
const BACKUP_DIR = path.join(store.ROOT, 'switch-saves');
const CHEATS_DIR = path.join(store.ROOT, 'switch-cheats');
const CHEAT_MOD = 'Smash Emu - Triches';
const OFF = 'load-smash-disabled';
const ZERO = '0'.repeat(32);

const userDir = e => switchkeys.yuzuUserDir(e);
const installed = () => ENGINES.filter(e => emulators.pathFor(e));
const isTid = s => /^0100[0-9A-F]{12}$/i.test(String(s || ''));
const ls = (dir) => { try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; } };

// Taille, nombre de fichiers et dernière modification d'un dossier.
const scan = (dir) => {
	const r = { size: 0, files: 0, at: 0 };
	const walk = (d) => {
		for (const e of ls(d)) {
			const p = path.join(d, e.name);
			if (e.isDirectory()) walk(p);
			else { try { const s = fs.statSync(p); r.size += s.size; r.files++; r.at = Math.max(r.at, s.mtimeMs); } catch { /* fichier disparu */ } }
		}
	};
	walk(dir);
	return r;
};

const copyDir = (from, to) => {
	fs.mkdirSync(to, { recursive: true });
	for (const e of ls(from)) {
		const s = path.join(from, e.name);
		const d = path.join(to, e.name);
		if (e.isDirectory()) copyDir(s, d);
		else fs.copyFileSync(s, d);
	}
};

// ---------- Jeux ----------

const fileOf = (inst) => {
	if (!inst.rom) return null;
	if (inst.rom.linked) return inst.rom.linked;
	return inst.rom.ext ? path.join(store.instanceDir(inst.id), 'rom', `base.${inst.rom.ext}`) : null;
};
const systemOf = inst => (inst.rom && inst.rom.system) || inst.system || 'n64';
const switchGames = () => store.listInstances().filter(i => i.type === 'rom' && systemOf(i) === 'switch');

// Identifiant du titre, build et kit de développement, lus dans le fichier (clés nécessaires), mis en cache.
const infoCache = new Map();
// Le nom du fichier donne parfois l'identifiant d'une mise à jour (…800) : la sauvegarde suit celui du jeu de base.
const tidFromName = (file) => {
	const m = (path.basename(String(file || '')).match(/\[(0100[0-9A-Fa-f]{12})\]/) || [])[1];
	return m ? `${m.slice(0, 13)}000`.toUpperCase() : null;
};
const titleInfo = (file) => {
	const format = path.extname(String(file || '')).slice(1).toUpperCase();
	let stat;
	try { stat = fs.statSync(file); } catch { return { missing: true, tid: tidFromName(file), format }; }
	const key = `${file}|${stat.size}|${stat.mtimeMs}`;
	if (infoCache.has(key)) return infoCache.get(key);
	let info = {};
	try { info = switchgame.prepare(file, { userDir: userDir('eden'), keyFiles: switchkeys.keyFiles(), unpack: false }) || {}; } catch (error) { info = { error: error.message }; }
	const tid = (info.tid || '').toUpperCase() || tidFromName(file);
	const out = { tid, buildId: info.buildId || null, sdk: info.sdk || null, zbic: !!info.zbic, keys: info.reason !== 'keys', size: stat.size, format };
	infoCache.set(key, out);
	return out;
};

// Identifiant retenu dans l'instance : la sauvegarde reste accessible même si le fichier du jeu a été supprimé.
const infoOf = (inst) => {
	const file = fileOf(inst);
	const info = file ? titleInfo(file) : { missing: true, tid: null };
	if (info.tid && inst.switchTid !== info.tid) { try { store.updateInstance(inst.id, { switchTid: info.tid }); } catch { /* instance en lecture seule */ } }
	return { file, info: { ...info, tid: info.tid || inst.switchTid || null } };
};

const engineOf = (inst) => {
	const wanted = (inst.options || {}).engine;
	if (ENGINES.includes(wanted)) return wanted;
	if (wanted) return wanted;
	return installed()[0] || 'citron';
};

const ctx = (id) => {
	const inst = store.getInstance(id);
	if (systemOf(inst) !== 'switch') throw new Error('Ce jeu n’est pas un jeu Switch.');
	const { file, info } = infoOf(inst);
	return { inst, file, info, tid: info.tid, engine: engineOf(inst) };
};
const needTid = (c) => {
	if (!c.tid) throw new Error('Identifiant du jeu introuvable : importe tes clés Switch (Paramètres → Émulateurs), puis réessaie.');
	return c.tid;
};

// ---------- Sauvegardes ----------

const saveRoot = e => path.join(userDir(e), 'nand', 'user', 'save', '0000000000000000');
// Profils de joueur de l'émulateur (un dossier par profil), le plus récemment utilisé d'abord.
const profiles = e => ls(saveRoot(e)).filter(d => d.isDirectory() && /^[0-9A-F]{32}$/i.test(d.name) && d.name !== ZERO)
	.map(d => ({ name: d.name, at: (() => { try { return fs.statSync(path.join(saveRoot(e), d.name)).mtimeMs; } catch { return 0; } })() }))
	.sort((a, b) => b.at - a.at).map(p => p.name);

// Sauvegarde d'un jeu dans un émulateur : dossier du profil qui la contient (le plus récent), sinon celui du profil
// principal, à créer.
const saveOf = (e, tid) => {
	const list = profiles(e);
	const found = list.map(p => path.join(saveRoot(e), p, tid)).filter(d => fs.existsSync(d))
		.map(dir => ({ dir, ...scan(dir) })).sort((a, b) => b.at - a.at)[0];
	if (found) return { engine: e, exists: true, profile: path.basename(path.dirname(found.dir)), ...found };
	return { engine: e, exists: false, profile: list[0] || null, dir: list[0] ? path.join(saveRoot(e), list[0], tid) : null, size: 0, files: 0, at: 0 };
};

const backupsOf = tid => ls(path.join(BACKUP_DIR, tid)).filter(d => d.isDirectory()).map((d) => {
	const dir = path.join(BACKUP_DIR, tid, d.name);
	const meta = store.readJson(path.join(dir, 'smash-emu.json'), {});
	return { name: d.name, engine: meta.engine || null, at: meta.at || 0, reason: meta.reason || 'manual', size: meta.size || 0, files: meta.files || 0, sig: meta.sig || '' };
}).sort((a, b) => b.at - a.at);

const sigOf = s => `${s.size}:${s.files}:${Math.round(s.at)}`;

const backup = (tid, engine, reason = 'manual') => {
	const s = saveOf(engine, tid);
	if (!s.exists || !s.files) return null;
	// Copie automatique inutile si la sauvegarde n'a pas changé depuis la dernière copie.
	if (reason === 'auto' && backupsOf(tid).some(b => b.sig === sigOf(s))) return null;
	const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${engine}`;
	const dir = path.join(BACKUP_DIR, tid, name);
	copyDir(s.dir, path.join(dir, 'save'));
	store.writeJson(path.join(dir, 'smash-emu.json'), { engine, at: Date.now(), reason, size: s.size, files: s.files, sig: sigOf(s), profile: s.profile });
	prune(tid);
	return name;
};

// Garde les copies automatiques les plus récentes (réglage « copies de secours ») ; les copies manuelles restent.
const prune = (tid) => {
	const keep = Math.max(3, Number(store.getSettings().saveBackups) || 10);
	backupsOf(tid).filter(b => b.reason !== 'manual').slice(keep).forEach(b => fs.rmSync(path.join(BACKUP_DIR, tid, b.name), { recursive: true, force: true }));
};

// Appelé avant chaque lancement par Citron ou Eden : copie de secours si la sauvegarde a changé.
const autoBackup = (engine, file) => {
	if (store.getSettings().switchAutoBackup === false || !file) return null;
	const { tid } = titleInfo(file);
	if (!tid) return null;
	try { return backup(tid, engine, 'auto'); } catch { return null; }
};

// Remplace la sauvegarde d'un émulateur par un dossier (copie de secours, autre émulateur, import), après avoir mis
// l'actuelle de côté.
const writeSave = (tid, engine, fromDir, reason) => {
	const cur = saveOf(engine, tid);
	if (!cur.dir) throw new Error(`${LABEL[engine]} n’a pas encore de profil de joueur : lance un jeu une fois avec ${LABEL[engine]}, puis réessaie.`);
	if (cur.exists) backup(tid, engine, reason);
	fs.rmSync(cur.dir, { recursive: true, force: true });
	copyDir(fromDir, cur.dir);
	return saveOf(engine, tid);
};

const restore = (tid, name, engine) => {
	if (!name || /[\\/]|\.\./.test(name)) throw new Error('Copie de secours invalide.');
	const src = path.join(BACKUP_DIR, tid, name, 'save');
	if (!fs.existsSync(src)) throw new Error('Copie de secours introuvable.');
	return writeSave(tid, engine, src, 'before-restore');
};

const transfer = (tid, from, to) => {
	if (from === to) throw new Error('Choisis deux émulateurs différents.');
	const s = saveOf(from, tid);
	if (!s.exists) throw new Error(`Pas de sauvegarde de ce jeu dans ${LABEL[from]}.`);
	return writeSave(tid, to, s.dir, 'before-transfer');
};

const removeBackup = (tid, name) => {
	if (!name || /[\\/]|\.\./.test(name)) throw new Error('Copie de secours invalide.');
	fs.rmSync(path.join(BACKUP_DIR, tid, name), { recursive: true, force: true });
};

const exportZip = (tid, engine, target) => {
	const s = saveOf(engine, tid);
	if (!s.exists) throw new Error(`Pas de sauvegarde de ce jeu dans ${LABEL[engine]}.`);
	const AdmZip = require('adm-zip');
	const zip = new AdmZip();
	zip.addLocalFolder(s.dir, tid);
	zip.writeZip(target);
	return target;
};

// Import d'un .zip (exporté par Smash Emu ou un autre outil) ou d'un dossier : le dossier qui contient les fichiers
// de la sauvegarde est celui sous un éventuel dossier unique au nom de l'identifiant du jeu.
const importSave = async (tid, engine, src) => {
	let dir = src;
	let work = null;
	try {
		if (fs.statSync(src).isFile()) {
			work = path.join(store.CACHE_DIR, `swsave-${Date.now()}`);
			fs.mkdirSync(work, { recursive: true });
			await require('./emuinstall').extract(src, work);
			dir = work;
		}
		for (let i = 0; i < 3; i++) {
			const entries = ls(dir);
			if (entries.length === 1 && entries[0].isDirectory()) dir = path.join(dir, entries[0].name);
			else break;
		}
		if (!scan(dir).files) throw new Error('Ce dossier ou cette archive ne contient aucun fichier de sauvegarde.');
		return writeSave(tid, engine, dir, 'before-import');
	} finally { if (work) fs.rmSync(work, { recursive: true, force: true }); }
};

const saves = (id) => {
	const c = ctx(id);
	if (!c.tid) return { tid: null, engines: [], backups: [] };
	return { tid: c.tid, engines: ENGINES.filter(e => emulators.pathFor(e) || fs.existsSync(userDir(e))).map(e => saveOf(e, c.tid)), backups: backupsOf(c.tid), auto: store.getSettings().switchAutoBackup !== false };
};

// ---------- Réglages propres au jeu ----------
// Chaque option : section et clé de l'émulateur, choix [libellé, valeur Eden, valeur Citron] (null : absent de cet
// émulateur). Les numéros viennent des énumérations de chaque émulateur (settings_enums.h), qui diffèrent.
const OPTIONS = [
	{ id: 'res', section: 'Renderer', key: 'resolution_setup', label: 'Résolution', hint: 'plus haut = plus net, demande une meilleure carte graphique',
		choices: [['½×', 1, 1], ['¾×', 2, 2], ['1× (normal)', 3, 3], ['1,5×', 5, 4], ['2×', 6, 5], ['3×', 7, 6], ['4×', 8, 7]] },
	{ id: 'filter', section: 'Renderer', key: 'scaling_filter', label: 'Filtre d’agrandissement', hint: 'FSR garde l’image nette quand elle est agrandie',
		choices: [['Plus proche', 0, 0], ['Bilinéaire', 1, 1], ['Bicubique', 2, 2], ['Gaussien', 3, 3], ['ScaleForce', 5, 4], ['FSR', 6, 7]] },
	{ id: 'aa', section: 'Renderer', key: 'anti_aliasing', label: 'Anti-crénelage', hint: 'lisse les bords en escalier',
		choices: [['Aucun', 0, 0], ['FXAA', 1, 1], ['SMAA', 2, 2]] },
	{ id: 'vsync', section: 'Renderer', key: 'use_vsync', label: 'Synchronisation verticale', hint: 'Mailbox : fluide et réactif ; FIFO : jamais de déchirure',
		choices: [['Désactivée', 0, 0], ['Mailbox', 1, 1], ['FIFO', 2, 2]] },
	{ id: 'aspect', section: 'Renderer', key: 'aspect_ratio', label: 'Format d’image', hint: 'Eden seulement',
		choices: [['16:9', 0, null], ['4:3', 1, null], ['21:9', 2, null], ['16:10', 3, null], ['Étiré', 4, null]] },
	{ id: 'aniso', section: 'Renderer', key: 'max_anisotropy', label: 'Filtrage des textures', hint: 'textures nettes au loin (Eden seulement)',
		choices: [['Auto', 0, null], ['2×', 2, null], ['4×', 3, null], ['8×', 4, null], ['16×', 5, null]] },
	{ id: 'gpu', section: 'Renderer', key: 'gpu_accuracy', label: 'Précision du GPU', hint: 'Rapide : plus d’images par seconde ; Précise : moins de bugs graphiques (Eden seulement)',
		choices: [['Rapide', 0, null], ['Précise', 1, null]] },
	{ id: 'async', section: 'Renderer', key: 'use_asynchronous_shaders', label: 'Shaders en arrière-plan', hint: 'moins de saccades quand un nouvel effet apparaît',
		choices: [['Oui', 'true', 'true'], ['Non', 'false', 'false']] },
	{ id: 'mode', section: 'System', key: 'use_docked_mode', label: 'Mode de la console', hint: 'TV : meilleure image ; portable : plus léger pour le PC',
		choices: [['TV', 1, 1], ['Portable', 0, 0]] },
	{ id: 'lang', section: 'System', key: 'language_index', label: 'Langue de la console', hint: 'langue du jeu, s’il la propose',
		choices: [['Français', 2, 2], ['Français (Canada)', 13, 13], ['Anglais (US)', 1, 1], ['Anglais (UK)', 12, 12], ['Espagnol', 5, 5], ['Allemand', 3, 3], ['Italien', 4, 4], ['Néerlandais', 8, 8], ['Portugais', 9, 9], ['Portugais (Brésil)', 17, 17], ['Russe', 10, 10], ['Japonais', 0, 0], ['Coréen', 7, 7]] },
	{ id: 'region', section: 'System', key: 'region_index', label: 'Région de la console', hint: 'certains jeux changent de contenu selon la région',
		choices: [['Europe', 2, 2], ['États-Unis', 1, 1], ['Japon', 0, 0], ['Australie', 3, 3], ['Corée', 5, 5], ['Chine', 4, 4], ['Taïwan', 6, 6]] },
	{ id: 'volume', section: 'Audio', key: 'volume', label: 'Volume du jeu', hint: 'indépendant du volume de Windows',
		choices: [['Muet', 0, 0], ['25 %', 25, 25], ['50 %', 50, 50], ['75 %', 75, 75], ['100 %', 100, 100], ['150 %', 150, 150], ['200 %', 200, 200]] },
];
const PRESETS = {
	eco: { label: 'PC modeste', values: { res: '¾×', filter: 'FSR', aa: 'Aucun', async: 'Oui', mode: 'Portable', gpu: 'Rapide' } },
	balanced: { label: 'Équilibré', values: { res: '1× (normal)', filter: 'FSR', aa: 'SMAA', async: 'Oui', mode: 'TV' } },
	pretty: { label: 'Beau', values: { res: '2×', filter: 'FSR', aa: 'SMAA', async: 'Oui', mode: 'TV', aniso: '8×' } },
	ultra: { label: 'Ultra (4K)', values: { res: '3×', filter: 'FSR', aa: 'SMAA', async: 'Oui', mode: 'TV', aniso: '16×', gpu: 'Précise' } },
};

const gameIni = (e, tid) => path.join(userDir(e), 'config', 'custom', `${tid.toUpperCase()}.ini`);

// Réglages par jeu (format Qt) : « clé\use_global=false » puis la valeur ; null rend la main au réglage général.
const setGameIni = (file, section, values) => {
	let text = '';
	try { text = fs.readFileSync(file, 'utf8'); } catch { /* fichier créé ci-dessous */ }
	const eol = text.includes('\r\n') ? '\r\n' : '\n';
	const lines = text ? text.split(/\r?\n/) : [];
	let start = lines.findIndex(l => l.trim() === `[${section}]`);
	if (start < 0) {
		if (lines.length && lines[lines.length - 1] !== '') lines.push('');
		lines.push(`[${section}]`);
		start = lines.length - 1;
	}
	const endOf = () => { const e = lines.findIndex((l, i) => i > start && /^\[/.test(l)); return e < 0 ? lines.length : e; };
	for (const [key, value] of Object.entries(values)) {
		for (let i = endOf() - 1; i > start; i--) if ([`${key}=`, `${key}\\default=`, `${key}\\use_global=`].some(p => lines[i].startsWith(p))) lines.splice(i, 1);
		let end = endOf();
		while (end - 1 > start && lines[end - 1] === '') end--;
		const add = value === null ? [`${key}\\use_global=true`] : [`${key}\\use_global=false`, `${key}\\default=false`, `${key}=${value}`];
		lines.splice(end, 0, ...add);
	}
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, lines.join(eol));
};

const readGameIni = (file) => {
	let text = '';
	try { text = fs.readFileSync(file, 'utf8'); } catch { return {}; }
	const out = {};
	let section = '';
	for (const l of text.split(/\r?\n/)) {
		const s = l.match(/^\[(.+)\]$/);
		if (s) { section = s[1]; continue; }
		const m = l.match(/^([^=\\]+)=(.*)$/);
		if (m) out[`${section}/${m[1]}`] = m[2];
		const g = l.match(/^([^=\\]+)\\use_global=(true|false)$/);
		if (g) out[`${section}/${g[1]}\\use_global`] = g[2];
	}
	return out;
};

const col = e => (e === 'eden' ? 1 : 2);
const optionsFor = (e) => OPTIONS.filter(o => o.choices.some(c => c[col(e)] !== null));

const settings = (id) => {
	const c = ctx(id);
	const e = ENGINES.includes(c.engine) ? c.engine : 'eden';
	if (!c.tid) return { tid: null, engine: e, options: [] };
	const ini = readGameIni(gameIni(e, c.tid));
	return {
		tid: c.tid, engine: e, custom: fs.existsSync(gameIni(e, c.tid)),
		presets: Object.entries(PRESETS).map(([k, p]) => ({ id: k, label: p.label })),
		options: optionsFor(e).map((o) => {
			const own = ini[`${o.section}/${o.key}\\use_global`] === 'false';
			const raw = ini[`${o.section}/${o.key}`];
			const choice = own ? o.choices.find(ch => String(ch[col(e)]) === String(raw)) : null;
			return { id: o.id, label: o.label, hint: o.hint, choices: o.choices.filter(ch => ch[col(e)] !== null).map(ch => ch[0]), value: choice ? choice[0] : null };
		}),
	};
};

// Valeur choisie (libellé) pour une option, ou null pour revenir au réglage général de l'émulateur.
const setOption = (id, optId, label) => {
	const c = ctx(id);
	const tid = needTid(c);
	const e = ENGINES.includes(c.engine) ? c.engine : 'eden';
	const o = OPTIONS.find(x => x.id === optId);
	if (!o) throw new Error('Réglage inconnu.');
	if (label === null) { setGameIni(gameIni(e, tid), o.section, { [o.key]: null }); return settings(id); }
	const ch = o.choices.find(x => x[0] === label);
	if (!ch || ch[col(e)] === null) throw new Error(`${LABEL[e]} n’a pas ce réglage.`);
	setGameIni(gameIni(e, tid), o.section, { [o.key]: ch[col(e)] });
	return settings(id);
};

const applyPreset = (id, presetId) => {
	const p = PRESETS[presetId];
	if (!p) throw new Error('Préréglage inconnu.');
	const c = ctx(id);
	const e = ENGINES.includes(c.engine) ? c.engine : 'eden';
	for (const [optId, label] of Object.entries(p.values)) {
		const o = OPTIONS.find(x => x.id === optId);
		const ch = o && o.choices.find(x => x[0] === label);
		if (ch && ch[col(e)] !== null) setOption(id, optId, label);
	}
	return settings(id);
};

const resetOptions = (id) => {
	const c = ctx(id);
	const tid = needTid(c);
	const e = ENGINES.includes(c.engine) ? c.engine : 'eden';
	const bySection = {};
	for (const o of OPTIONS) (bySection[o.section] = bySection[o.section] || {})[o.key] = null;
	if (fs.existsSync(gameIni(e, tid))) for (const [s, v] of Object.entries(bySection)) setGameIni(gameIni(e, tid), s, v);
	return settings(id);
};

// ---------- Mods ----------
// Mods du dossier « load » de chaque émulateur ; un mod désactivé est rangé dans load-smash-disabled. Les mods gérés
// ailleurs (randomizer, triches de Smash Emu, décompression ZBIC) n'apparaissent pas ici.
const HIDDEN = name => name === switchgame.MOD_NAME || name === CHEAT_MOD;
const modBases = (e, tid) => ({ on: path.join(userDir(e), 'load', tid), off: path.join(userDir(e), OFF, tid) });

const mods = (id) => {
	const c = ctx(id);
	if (!c.tid) return { tid: null, list: [] };
	const rs = require('./randomizer/switch');
	const byName = new Map();
	for (const e of ENGINES) {
		const b = modBases(e, c.tid);
		for (const [state, dir] of [['on', b.on], ['off', b.off]]) {
			for (const d of ls(dir).filter(x => x.isDirectory())) {
				if (HIDDEN(d.name) || d.name.startsWith(rs.MOD_PREFIX) || d.name === rs.CHEAT_MOD) continue;
				const m = byName.get(d.name) || { name: d.name, engines: {}, kinds: new Set(), size: 0 };
				m.engines[e] = state;
				for (const k of ls(path.join(dir, d.name))) if (k.isDirectory() && /^(romfs|exefs|cheats)$/i.test(k.name)) m.kinds.add(k.name.toLowerCase());
				if (!m.size) m.size = scan(path.join(dir, d.name)).size;
				byName.set(d.name, m);
			}
		}
	}
	return { tid: c.tid, list: [...byName.values()].map(m => ({ ...m, kinds: [...m.kinds], on: Object.values(m.engines).includes('on') })).sort((a, b) => a.name.localeCompare(b.name)) };
};

const safeName = (name) => {
	if (!name || /[\\/]|\.\./.test(name)) throw new Error('Nom de mod invalide.');
	return name;
};

const toggleMod = (id, name, on) => {
	const tid = needTid(ctx(id));
	safeName(name);
	for (const e of ENGINES) {
		const b = modBases(e, tid);
		const [from, to] = on ? [b.off, b.on] : [b.on, b.off];
		if (!fs.existsSync(path.join(from, name))) continue;
		fs.mkdirSync(to, { recursive: true });
		fs.rmSync(path.join(to, name), { recursive: true, force: true });
		fs.renameSync(path.join(from, name), path.join(to, name));
	}
	return mods(id);
};

// Un seul mod actif : tous les autres sont rangés (pratique pour trouver celui qui fait planter le jeu).
const soloMod = (id, name) => {
	for (const m of mods(id).list) toggleMod(id, m.name, m.name === name);
	return mods(id);
};

const removeMod = (id, name) => {
	const tid = needTid(ctx(id));
	safeName(name);
	for (const e of ENGINES) for (const dir of Object.values(modBases(e, tid))) fs.rmSync(path.join(dir, name), { recursive: true, force: true });
	return mods(id);
};

// Mod depuis un dossier ou une archive : chaque dossier contenant romfs, exefs ou cheats devient un mod, copié pour
// Citron et Eden.
const importMod = async (id, src) => {
	const tid = needTid(ctx(id));
	const gb = require('./gamebanana');
	let work = null;
	try {
		let dir = src;
		if (fs.statSync(src).isFile()) {
			work = path.join(store.CACHE_DIR, `swmod-${Date.now()}`);
			fs.mkdirSync(work, { recursive: true });
			await require('./emuinstall').extract(src, work);
			dir = work;
		}
		const roots = gb.modRoots(dir);
		if (!roots.length) throw new Error('Aucun dossier romfs, exefs ou cheats : ce n’est pas un mod Switch.');
		const base = path.basename(src).replace(/\.(zip|7z|rar)$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ').trim().slice(0, 60) || 'Mod';
		const names = roots.map((r, i) => (roots.length > 1 ? `${base} - ${path.basename(r)}`.slice(0, 80) || `${base} ${i + 1}` : base));
		const targets = ENGINES.filter(e => emulators.pathFor(e) || fs.existsSync(userDir(e)));
		for (const e of targets) roots.forEach((r, i) => copyDir(r, path.join(modBases(e, tid).on, names[i])));
		return { names, list: mods(id).list };
	} finally { if (work) fs.rmSync(work, { recursive: true, force: true }); }
};

// ---------- Triches ----------
// Fichiers de triches au format Atmosphère : « [Nom] » (ou « {Nom} » pour le code maître toujours actif) suivi des
// lignes de code. Smash Emu garde la liste par version du jeu (build) et écrit seulement les triches cochées dans un
// mod « Smash Emu - Triches ».

const parseCheats = (text) => {
	const out = [];
	let cur = null;
	for (const raw of String(text).split(/\r?\n/)) {
		const l = raw.trim();
		const h = l.match(/^\[(.*)\]$/) || l.match(/^\{(.*)\}$/);
		if (h) { cur = { name: h[1].trim() || 'Sans nom', master: l.startsWith('{'), code: [] }; out.push(cur); continue; }
		if (cur && /^[0-9A-Fa-f]{8}( [0-9A-Fa-f]{8})*$/.test(l)) cur.code.push(l.toUpperCase());
	}
	return out.filter(c => c.code.length);
};

const cheatFile = tid => path.join(CHEATS_DIR, `${tid}.json`);
const cheatDb = tid => store.readJson(cheatFile(tid), { builds: {} });

const writeCheats = (tid) => {
	const db = cheatDb(tid);
	for (const e of ENGINES) {
		const dir = path.join(userDir(e), 'load', tid, CHEAT_MOD);
		fs.rmSync(dir, { recursive: true, force: true });
		for (const [bid, list] of Object.entries(db.builds)) {
			const chosen = list.filter(c => c.on);
			if (!chosen.length) continue;
			const text = [...list.filter(c => c.master), ...chosen.filter(c => !c.master)]
				.map(c => `${c.master ? `{${c.name}}` : `[${c.name}]`}\n${c.code.join('\n')}\n`).join('\n');
			fs.mkdirSync(path.join(dir, 'cheats'), { recursive: true });
			fs.writeFileSync(path.join(dir, 'cheats', `${bid}.txt`), text);
		}
	}
};

const cheats = (id) => {
	const c = ctx(id);
	if (!c.tid) return { tid: null, builds: [] };
	const db = cheatDb(c.tid);
	const cur = c.info.buildId ? c.info.buildId.slice(0, 16) : null;
	return {
		tid: c.tid, current: cur,
		builds: Object.entries(db.builds).map(([bid, list]) => ({ bid, current: bid === cur, list: list.map((x, i) => ({ i, name: x.name, master: !!x.master, on: !!x.on, lines: x.code.length })) }))
			.sort((a, b) => Number(b.current) - Number(a.current)),
	};
};

// Fichier .txt de triches : son nom donne la version du jeu (build) ; sinon, celle du jeu choisi.
const importCheats = (id, file) => {
	const c = ctx(id);
	const tid = needTid(c);
	const named = (path.basename(file).match(/^([0-9A-Fa-f]{16})/) || [])[1];
	const bid = (named || (c.info.buildId || '').slice(0, 16)).toUpperCase();
	if (!bid) throw new Error('Version du jeu inconnue : renomme le fichier avec le build du jeu (16 caractères), ou importe tes clés.');
	const found = parseCheats(fs.readFileSync(file, 'utf8'));
	if (!found.length) throw new Error('Aucune triche lisible dans ce fichier (format Atmosphère attendu : [Nom] puis des lignes de code).');
	const db = cheatDb(tid);
	const list = db.builds[bid] || [];
	for (const ch of found) {
		const old = list.find(x => x.name === ch.name);
		if (old) old.code = ch.code;
		else list.push({ ...ch, on: false });
	}
	db.builds[bid] = list;
	store.writeJson(cheatFile(tid), db);
	writeCheats(tid);
	return { count: found.length, bid, other: !!(c.info.buildId && bid !== c.info.buildId.slice(0, 16).toUpperCase()), ...cheats(id) };
};

const toggleCheat = (id, bid, index, on) => {
	const tid = needTid(ctx(id));
	const db = cheatDb(tid);
	const list = db.builds[bid];
	if (!list) throw new Error('Triches introuvables.');
	if (index === 'all') list.forEach((x) => { if (!x.master) x.on = !!on; });
	else if (list[index]) list[index].on = !!on;
	store.writeJson(cheatFile(tid), db);
	writeCheats(tid);
	return cheats(id);
};

const removeCheats = (id, bid) => {
	const tid = needTid(ctx(id));
	const db = cheatDb(tid);
	delete db.builds[bid];
	store.writeJson(cheatFile(tid), db);
	writeCheats(tid);
	return cheats(id);
};

// ---------- Shaders et stockage ----------

const shaderDir = (e, tid) => {
	const base = path.join(userDir(e), 'shader');
	const d = ls(base).find(x => x.isDirectory() && x.name.toLowerCase() === tid.toLowerCase());
	return d ? path.join(base, d.name) : null;
};

const shaders = (id) => {
	const c = ctx(id);
	if (!c.tid) return { tid: null, engines: [] };
	return { tid: c.tid, engines: ENGINES.map((e) => { const d = shaderDir(e, c.tid); return { engine: e, size: d ? scan(d).size : 0 }; }) };
};

const clearShaders = (id, engine) => {
	const tid = needTid(ctx(id));
	for (const e of engine ? [engine] : ENGINES) { const d = shaderDir(e, tid); if (d) fs.rmSync(d, { recursive: true, force: true }); }
	return shaders(id);
};

// Place prise par la Switch sur le disque : sauvegardes, shaders, mods, copies de secours.
const storage = () => {
	const out = ENGINES.map((e) => {
		const u = userDir(e);
		const shaderGames = ls(path.join(u, 'shader')).filter(d => d.isDirectory() && /^[0-9a-f]{16}$/i.test(d.name));
		return {
			engine: e, installed: !!emulators.pathFor(e),
			saves: scan(path.join(u, 'nand', 'user', 'save')).size,
			shaders: shaderGames.reduce((a, d) => a + scan(path.join(u, 'shader', d.name)).size, 0),
			mods: scan(path.join(u, 'load')).size + scan(path.join(u, OFF)).size,
		};
	});
	return { engines: out, backups: scan(BACKUP_DIR).size };
};

const clearAllShaders = () => {
	for (const e of ENGINES) {
		const base = path.join(userDir(e), 'shader');
		for (const d of ls(base)) if (d.isDirectory() && /^[0-9a-f]{16}$/i.test(d.name)) fs.rmSync(path.join(base, d.name), { recursive: true, force: true });
	}
	return storage();
};

// ---------- Diagnostic ----------

const firmwareCount = e => ls(path.join(userDir(e), 'nand', 'system', 'Contents', 'registered')).filter(d => /\.nca$/i.test(d.name)).length;

// Lignes d'erreur du dernier journal de l'émulateur (sans doublons, les plus récentes).
const logErrors = (e) => {
	let txt = '';
	try { txt = fs.readFileSync(path.join(userDir(e), 'log', `${e}_log.txt`), 'utf8'); } catch { return []; }
	const seen = new Set();
	const out = [];
	for (const l of txt.split(/\r?\n/).reverse()) {
		if (!/<(Critical|Error)>/.test(l)) continue;
		const msg = l.replace(/^\[\s*[\d.]+\]\s*/, '').replace(/\s+/g, ' ').slice(0, 220);
		const k = msg.replace(/0x[0-9a-f]+|\d+/gi, '#');
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(msg);
		if (out.length >= 6) break;
	}
	return out;
};

const diagnose = (id, { gpu = null } = {}) => {
	const c = ctx(id);
	const e = c.engine;
	const checks = [];
	const add = (state, label, detail = '') => checks.push({ state, label, detail });
	const yuzu = ENGINES.includes(e);
	const exe = emulators.pathFor(e);
	add(exe ? 'ok' : 'bad', `Émulateur : ${LABEL[e] || e}`, exe ? 'installé' : 'pas installé : Paramètres → Émulateurs, ou choisis l’autre émulateur ci-dessus');
	if (!c.file || c.info.missing) add('bad', 'Fichier du jeu', 'introuvable : il a été déplacé ou supprimé ; choisis-le de nouveau dans les options du jeu');
	else {
		const fresh = Date.now() - fs.statSync(c.file).mtimeMs < 15000;
		add(fresh ? 'warn' : 'ok', 'Fichier du jeu', `${c.info.format} · ${(c.info.size / 1024 ** 3).toFixed(2)} Go${fresh ? ' · encore en cours de copie' : ''}`);
		if (/^(NSZ|XCZ)$/.test(c.info.format)) add('warn', 'Format compressé', `${c.info.format} : décompresse-le en ${c.info.format === 'NSZ' ? 'NSP' : 'XCI'} si le jeu ne se lance pas`);
	}
	const k = switchkeys.status();
	add(k.prod ? 'ok' : 'bad', 'Clés de la console (prod.keys)', k.prod ? 'présentes' : 'manquantes : importe celles de ta console (Paramètres → Émulateurs)');
	if (k.prod && c.file && !c.info.missing) add(c.info.keys ? 'ok' : 'bad', 'Clés assez récentes pour ce jeu', c.info.keys ? 'le jeu se déchiffre' : 'le jeu demande des clés plus récentes : extrais-les de nouveau sur ta console à jour');
	if (yuzu) {
		const fw = firmwareCount(e);
		add(fw ? 'ok' : 'bad', 'Firmware', fw ? `${fw} fichiers installés` : `absent : ouvre ${LABEL[e]}, Outils → Installer le firmware (celui de ta console)`);
	}
	if (c.tid) add('ok', 'Identifiant du jeu', `${c.tid}${c.info.buildId ? ` · build ${c.info.buildId.slice(0, 16)}` : ''}${c.info.sdk ? ` · kit ${c.info.sdk}` : ''}`);
	const n = c.info.sdk ? switchgame.notice(c.info, e, !!emulators.pathFor('eden')) : null;
	if (n) add('warn', 'Jeu récent', n);
	const ram = os.totalmem() / 1024 ** 3;
	add(ram >= 12 ? 'ok' : ram >= 8 ? 'warn' : 'bad', 'Mémoire vive', `${ram.toFixed(0)} Go${ram < 12 ? ' : ferme les autres programmes avant de jouer' : ''}`);
	if (gpu) add(gpu.dedicated ? 'ok' : 'warn', 'Carte graphique', gpu.dedicated ? `${gpu.name || 'dédiée'}` : `${gpu.name || 'intégrée'} : choisis le préréglage « PC modeste » dans Réglages du jeu`);
	try {
		const fsInfo = fs.statfsSync(store.ROOT);
		const free = (fsInfo.bavail * fsInfo.bsize) / 1024 ** 3;
		add(free >= 5 ? 'ok' : 'warn', 'Espace disque libre', `${free.toFixed(1)} Go${free < 5 ? ' : les shaders et sauvegardes ont besoin de place' : ''}`);
	} catch { /* disque non lisible */ }
	if (yuzu && c.tid) {
		const active = mods(id).list.filter(m => m.engines[e] === 'on');
		if (active.length) add('warn', 'Mods actifs', `${active.length} mod(s) : si le jeu plante, coupe-les dans l’onglet Mods (bouton « Seul » pour les tester un par un)`);
		const cfg = readGameIni(gameIni(e, c.tid));
		if (cfg['Renderer/resolution_setup\\use_global'] === 'false' && Number(cfg['Renderer/resolution_setup']) >= (e === 'eden' ? 7 : 6)) add('warn', 'Résolution élevée', 'réglée à 3× ou plus pour ce jeu : baisse-la si le jeu rame');
	}
	return { engine: e, checks, log: yuzu ? logErrors(e) : [], verdict: checks.some(x => x.state === 'bad') ? 'bad' : checks.some(x => x.state === 'warn') ? 'warn' : 'ok' };
};

// ---------- Fiche du jeu ----------

const game = (id) => {
	const c = ctx(id);
	return {
		id: c.inst.id, name: c.inst.name, engine: c.engine, engines: ENGINES.map(e => ({ id: e, label: LABEL[e], installed: !!emulators.pathFor(e) })),
		tid: c.tid, buildId: c.info.buildId, sdk: c.info.sdk, format: c.info.format, size: c.info.size, missing: !!c.info.missing, keys: c.info.keys !== false,
		file: c.file, playTimeMs: c.inst.playTimeMs || 0, lastPlayed: c.inst.lastPlayed || null,
	};
};

const list = () => switchGames().map((i) => {
	const { info } = infoOf(i);
	return { id: i.id, name: i.name, tid: info.tid || null, engine: engineOf(i), missing: !!info.missing, lastPlayed: i.lastPlayed || 0 };
}).sort((a, b) => (b.lastPlayed - a.lastPlayed) || a.name.localeCompare(b.name));

const setEngine = (id, engine) => {
	if (!ENGINES.includes(engine)) throw new Error('Émulateur inconnu.');
	const inst = store.getInstance(id);
	store.updateInstance(id, { options: { ...(inst.options || {}), engine } });
	return game(id);
};

module.exports = {
	ENGINES, LABEL, OPTIONS, PRESETS, BACKUP_DIR, CHEAT_MOD,
	list, game, setEngine, ctx, titleInfo,
	saves, saveOf, backup, autoBackup, restore, transfer, removeBackup, exportZip, importSave, backupsOf,
	settings, setOption, applyPreset, resetOptions, setGameIni, readGameIni, gameIni,
	mods, toggleMod, soloMod, removeMod, importMod,
	cheats, parseCheats, importCheats, toggleCheat, removeCheats,
	shaders, clearShaders, storage, clearAllShaders,
	diagnose, logErrors, modBases, userDir,
};
