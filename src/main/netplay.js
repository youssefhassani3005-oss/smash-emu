// Multijoueur en ligne Wii / GameCube : NetPlay de Dolphin. Chaque joueur fait tourner le jeu sur son PC, Dolphin
// synchronise les manettes. Smash Emu prépare Dolphin (dossier du jeu dans la liste, pseudo, serveur de
// « traversal » pour obtenir un code d'hôte) puis l'ouvre ; la salle se crée dans Outils → NetPlay.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const store = require('./store');
const emulators = require('./emulators');

// Dossier utilisateur de Dolphin : portable (User\ à côté de l'exe) ou %APPDATA%\Dolphin Emulator.
const userDir = (exe) => {
	const portable = path.join(path.dirname(exe), 'portable.txt');
	if (fs.existsSync(portable)) return path.join(path.dirname(exe), 'User');
	return path.join(process.env.APPDATA || '', 'Dolphin Emulator');
};

// Modifie quelques clés d'un fichier .ini en gardant tout le reste.
const setIni = (file, section, values) => {
	let lines = [];
	try { lines = fs.readFileSync(file, 'utf8').split(/\r?\n/); } catch { /* nouveau fichier */ }
	let start = lines.findIndex(l => l.trim() === `[${section}]`);
	if (start < 0) { lines.push(`[${section}]`); start = lines.length - 1; }
	let end = lines.findIndex((l, i) => i > start && /^\[/.test(l.trim()));
	if (end < 0) end = lines.length;
	while (end > start + 1 && lines[end - 1].trim() === '') end--;
	for (const [k, v] of Object.entries(values)) {
		const i = lines.findIndex((l, j) => j > start && j < end && new RegExp(`^${k}\\s*=`).test(l));
		if (i >= 0) lines[i] = `${k} = ${v}`;
		else { lines.splice(end, 0, `${k} = ${v}`); end++; }
	}
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, lines.join('\n'));
};

const readIni = (file, section) => {
	const out = {};
	let inside = false;
	try {
		for (const l of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
			if (/^\[/.test(l.trim())) inside = l.trim() === `[${section}]`;
			else if (inside) { const m = l.match(/^([^=]+?)\s*=\s*(.*)$/); if (m) out[m[1]] = m[2]; }
		}
	} catch { /* pas de fichier */ }
	return out;
};

const gameFile = (inst) => {
	const f = inst.rom && (inst.rom.linked || (inst.rom.ext && path.join(store.instanceDir(inst.id), 'rom', `base.${inst.rom.ext}`)));
	if (!f || !fs.existsSync(f)) throw new Error('Fichier du jeu introuvable.');
	return f;
};

const prepare = (id) => {
	const inst = store.getInstance(id);
	const exe = emulators.pathFor('dolphin');
	if (!exe) throw new Error('Dolphin n’est pas installé : indique-le dans Paramètres → Émulateurs.');
	const file = gameFile(inst);
	const ini = path.join(userDir(exe), 'Config', 'Dolphin.ini');
	// Le dossier du jeu doit être dans la liste de Dolphin pour apparaître dans NetPlay.
	const general = readIni(ini, 'General');
	const dirs = Object.entries(general).filter(([k]) => /^ISOPath\d+$/.test(k)).map(([, v]) => path.resolve(v).toLowerCase());
	const dir = path.dirname(file);
	if (!dirs.includes(path.resolve(dir).toLowerCase())) {
		const n = Number(general.ISOPaths || dirs.length) || 0;
		setIni(ini, 'General', { [`ISOPath${n}`]: dir.replace(/\\/g, '/'), ISOPaths: n + 1 });
	}
	const nick = (store.getSettings().playerName || 'Joueur').replace(/[\r\n]/g, '').slice(0, 30);
	setIni(ini, 'NetPlay', { Nickname: nick, TraversalChoice: 'traversal' });
	return { exe, version: path.basename(path.dirname(path.dirname(exe))).match(/\d{4}[a-z]?|\d+\.\d+(-\d+)?/i)?.[0] || '', file, name: path.basename(file), nick };
};

const open = (id) => {
	const r = prepare(id);
	const p = spawn(r.exe, [], { cwd: path.dirname(r.exe), detached: true, stdio: 'ignore' });
	p.unref();
	return r;
};

module.exports = { prepare, open, setIni, readIni, userDir };
