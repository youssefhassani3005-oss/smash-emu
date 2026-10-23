// Nintendo Switch : import des clés (prod.keys / title.keys) que l'utilisateur a extraites de sa propre console.
// Smash Emu ne fournit ni clés ni firmware ; il copie les fichiers là où Ryujinx les lit.
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

// Dossier des clés de Citron : « user\keys » à côté de l'exécutable (version portable), sinon %APPDATA%\citron\keys.
const citronKeysDir = () => {
	const exe = emulators.pathFor('citron');
	if (exe && fs.existsSync(path.join(path.dirname(exe), 'user'))) return path.join(path.dirname(exe), 'user', 'keys');
	return path.join(APPDATA, 'citron', 'keys');
};

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

const status = () => {
	const dir = systemDir();
	const has = name => fs.existsSync(path.join(dir, name));
	const cdir = citronKeysDir();
	const both = name => has(name) || fs.existsSync(path.join(cdir, name));
	return { dir, prod: both('prod.keys'), title: both('title.keys'), installed: !!(emulators.pathFor('ryujinx') || emulators.pathFor('citron')) };
};

const importKeys = (files) => {
	if (!files || !files.length) throw new Error('Aucun fichier choisi.');
	const dir = systemDir();
	fs.mkdirSync(dir, { recursive: true });
	const done = [];
	for (const file of files) {
		const stat = fs.statSync(file);
		if (!stat.isFile() || stat.size > 5 * 1024 * 1024) throw new Error(`« ${path.basename(file)} » n’est pas un fichier de clés.`);
		const kind = classify(fs.readFileSync(file, 'utf8'));
		if (!kind) throw new Error(`« ${path.basename(file)} » ne ressemble pas à un fichier prod.keys ou title.keys.`);
		fs.copyFileSync(file, path.join(dir, kind));
		// Les mêmes clés servent à Citron (émulateur Switch fourni avec Smash Emu).
		const cdir = citronKeysDir();
		fs.mkdirSync(cdir, { recursive: true });
		fs.copyFileSync(file, path.join(cdir, kind));
		done.push(kind);
	}
	return { imported: done, ...status() };
};

// Citron : reprend les clés et le firmware déjà installés pour Ryujinx s'ils lui manquent (sans firmware, la
// plupart des jeux restent sur un écran noir). Le firmware de Ryujinx range chaque .nca dans un dossier « x.nca\00 ».
const syncCitron = () => {
	const done = { keys: 0, firmware: 0 };
	const rdir = systemDir();
	const cdir = citronKeysDir();
	for (const k of ['prod.keys', 'title.keys']) {
		if (fs.existsSync(path.join(rdir, k)) && !fs.existsSync(path.join(cdir, k))) {
			fs.mkdirSync(cdir, { recursive: true });
			fs.copyFileSync(path.join(rdir, k), path.join(cdir, k));
			done.keys++;
		}
	}
	const rfw = path.join(path.dirname(rdir), 'bis', 'system', 'Contents', 'registered');
	const cfw = path.join(path.dirname(cdir), 'nand', 'system', 'Contents', 'registered');
	let have = [];
	try { have = fs.readdirSync(cfw); } catch { /* pas encore de firmware */ }
	if (!have.length && fs.existsSync(rfw)) {
		fs.mkdirSync(cfw, { recursive: true });
		for (const name of fs.readdirSync(rfw)) {
			const src = path.join(rfw, name);
			const file = fs.statSync(src).isDirectory() ? path.join(src, '00') : src;
			if (fs.existsSync(file)) { fs.copyFileSync(file, path.join(cfw, name)); done.firmware++; }
		}
	}
	return done;
};

const openFolder = () => { const dir = systemDir(); fs.mkdirSync(dir, { recursive: true }); return shell.openPath(dir); };

// Ouvre Ryujinx normalement (pour installer le firmware : Outils → Installer le firmware).
const openEmulator = () => {
	const exe = emulators.pathFor('ryujinx') || emulators.pathFor('citron');
	if (!exe) throw new Error('Aucun émulateur Switch installé.');
	spawn(exe, [], { cwd: path.dirname(exe), detached: true, stdio: 'ignore' }).unref();
};

module.exports = { status, importKeys, openFolder, openEmulator, classify, syncCitron };
