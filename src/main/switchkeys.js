// Nintendo Switch : import des clés (prod.keys / title.keys) que l'utilisateur a extraites de sa propre console.
// Smash Emu ne fournit ni clés ni firmware ; il copie les fichiers là où Ryujinx, Citron et Eden les lisent.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { shell } = require('electron');
const emulators = require('./emulators');

const APPDATA = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');

// Dossier « system » de Ryujinx : version portable à côté de l'exécutable, sinon %APPDATA%\Ryujinx.
const systemDir = () => {
	const exe = emulators.pathFor('ryujinx');
	if (exe) {
		const portable = path.join(path.dirname(exe), 'portable');
		if (fs.existsSync(portable)) return path.join(portable, 'system');
	}
	return path.join(APPDATA, 'Ryujinx', 'system');
};

// Émulateurs de la famille yuzu (Citron, Eden) : même organisation des clés, du firmware et de la configuration.
// Dossier utilisateur : « user » à côté de l'exécutable (version portable), sinon %APPDATA%\<nom>.
const YUZU = ['citron', 'eden'];
const yuzuUserDir = (id) => {
	const exe = emulators.pathFor(id);
	if (exe && fs.existsSync(path.join(path.dirname(exe), 'user'))) return path.join(path.dirname(exe), 'user');
	return path.join(APPDATA, id);
};
const yuzuKeysDir = id => path.join(yuzuUserDir(id), 'keys');
// Citron est fourni avec Smash Emu : ses dossiers servent même s'il n'a pas encore été lancé.
const yuzuInstalled = () => YUZU.filter(id => id === 'citron' || emulators.pathFor(id));

const KEY_LINE =/^[A-Za-z0-9_]+\s*=\s*[0-9A-Fa-f]{16,}\s*$/;

// Reconnaît le type du fichier d'après son contenu : prod.keys (clés de la console) ou title.keys (clés de jeux).
const classify = (text) => {
	const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
	if (!lines.length || lines.length > 20000) return null;
	if (!lines.every(l => KEY_LINE.test(l))) return null;
	if (lines.some(l => /^master_key_\d+\s*=/.test(l) || /^header_key\s*=/.test(l))) return 'prod.keys';
	if (lines.every(l => /^[0-9A-Fa-f]{32}\s*=\s*[0-9A-Fa-f]{32}$/.test(l))) return 'title.keys';
	return null;
};

// Dossiers de clés connus, Ryujinx d'abord.
const keyDirs = () => [systemDir(), ...YUZU.map(yuzuKeysDir)];
// Fichiers de clés existants (prod.keys puis title.keys), pour lire un jeu.
const keyFiles = () => ['prod.keys', 'title.keys'].map(n => keyDirs().map(d => path.join(d, n)).find(f => fs.existsSync(f))).filter(Boolean);

const status = () => {
	const found = name => keyDirs().some(d => fs.existsSync(path.join(d, name)));
	return { dir: systemDir(), prod: found('prod.keys'), title: found('title.keys'), installed: !!(emulators.pathFor('ryujinx') || YUZU.some(id => emulators.pathFor(id))) };
};

const importKeys = (files) => {
	if (!files || !files.length) throw new Error('Aucun fichier choisi.');
	const dirs = [systemDir(), ...yuzuInstalled().map(yuzuKeysDir)];
	const done = [];
	for (const file of files) {
		const stat = fs.statSync(file);
		if (!stat.isFile() || stat.size > 5 * 1024 * 1024) throw new Error(`« ${path.basename(file)} » n’est pas un fichier de clés.`);
		const kind = classify(fs.readFileSync(file, 'utf8'));
		if (!kind) throw new Error(`« ${path.basename(file)} » ne ressemble pas à un fichier prod.keys ou title.keys.`);
		for (const dir of dirs) {
			fs.mkdirSync(dir, { recursive: true });
			fs.copyFileSync(file, path.join(dir, kind));
		}
		done.push(kind);
	}
	return { imported: done, ...status() };
};

// Citron, Eden : reprend les clés et le firmware déjà installés pour un autre émulateur Switch s'ils lui manquent
// (sans firmware, la plupart des jeux restent sur un écran noir). Le firmware de Ryujinx range chaque .nca dans
// un dossier « x.nca\00 » ; Citron et Eden les rangent à plat.
const syncYuzu = (id) => {
	const done = { keys: 0, firmware: 0 };
	const kdir = yuzuKeysDir(id);
	for (const k of ['prod.keys', 'title.keys']) {
		if (fs.existsSync(path.join(kdir, k))) continue;
		const src = keyDirs().map(d => path.join(d, k)).find(f => f !== path.join(kdir, k) && fs.existsSync(f));
		if (src) {
			fs.mkdirSync(kdir, { recursive: true });
			fs.copyFileSync(src, path.join(kdir, k));
			done.keys++;
		}
	}
	const registered = dir => path.join(dir, 'nand', 'system', 'Contents', 'registered');
	const target = registered(yuzuUserDir(id));
	const list = (dir) => { try { return fs.readdirSync(dir); } catch { return []; } };
	if (list(target).length) return done;
	const sources = [path.join(path.dirname(systemDir()), 'bis', 'system', 'Contents', 'registered'), ...YUZU.filter(o => o !== id).map(o => registered(yuzuUserDir(o)))];
	const from = sources.find(d => list(d).length);
	if (!from) return done;
	fs.mkdirSync(target, { recursive: true });
	for (const name of list(from)) {
		const src = path.join(from, name);
		const file = fs.statSync(src).isDirectory() ? path.join(src, '00') : src;
		if (fs.existsSync(file)) { fs.copyFileSync(file, path.join(target, name)); done.firmware++; }
	}
	return done;
};
const syncCitron = () => syncYuzu('citron');

// Réglages Qt (qt-config.ini) : chaque clé a une jumelle « clé\default », vraie quand la valeur par défaut s'applique.
const setQtIni = (file, section, values) => {
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
	let end = lines.findIndex((l, i) => i > start && /^\[/.test(l));
	if (end < 0) end = lines.length;
	for (const [key, value] of Object.entries(values)) {
		for (const [k, v] of [[`${key}\\default`, 'false'], [key, String(value)]]) {
			const i = lines.findIndex((l, j) => j > start && j < end && l.startsWith(`${k}=`));
			if (i >= 0) lines[i] = `${k}=${v}`;
			else { lines.splice(end, 0, `${k}=${v}`); end++; }
		}
	}
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, lines.join(eol));
};

// Incrusté dans Smash Emu : rendu dans une fenêtre séparée, la seule que Smash Emu montre (la fenêtre principale,
// avec ses menus et la liste de jeux, reste cachée). Interface d'origine : fenêtre unique, comme à l'installation.
const yuzuWindowMode = (id, embed) => setQtIni(path.join(yuzuUserDir(id), 'config', 'qt-config.ini'), 'UI', { singleWindowMode: !embed });

// Mémoire émulée : une Switch a 4 Go. Les réglages 6 à 12 Go (pour les jeux moddés) réservent d'un coup toute cette
// mémoire sur le PC ; sans assez de RAM la réservation échoue et le jeu plante après quelques secondes. Sur un PC de
// moins de 24 Go, Smash Emu revient à 4 Go. Renvoie un message si le réglage a été changé.
const yuzuMemory = (id) => {
	const file = path.join(yuzuUserDir(id), 'config', 'qt-config.ini');
	let mode = 0;
	try { mode = Number((fs.readFileSync(file, 'utf8').match(/^memory_layout_mode=(\d+)/m) || [])[1] || 0); } catch { return null; }
	if (!mode || os.totalmem() >= 24 * 1024 ** 3) return null;
	setQtIni(file, 'Core', { memory_layout_mode: 0 });
	return `Mémoire émulée remise à 4 Go (comme une vraie Switch) : le réglage de ${[4, 6, 8, 10, 12][mode] || 8} Go demande trop de RAM sur ce PC et faisait planter les jeux.`;
};

const openFolder = () => { const dir = systemDir(); fs.mkdirSync(dir, { recursive: true }); return shell.openPath(dir); };

// Ouvre un émulateur Switch normalement (pour installer le firmware : Outils → Installer le firmware).
const openEmulator = () => {
	const exe = emulators.pathFor('ryujinx') || emulators.pathFor('eden') || emulators.pathFor('citron');
	if (!exe) throw new Error('Aucun émulateur Switch installé.');
	spawn(exe, [], { cwd: path.dirname(exe), detached: true, stdio: 'ignore' }).unref();
};

module.exports = { status, importKeys, openFolder, openEmulator, classify, syncCitron, syncYuzu, yuzuUserDir, yuzuWindowMode, yuzuMemory, keyFiles, setQtIni };
