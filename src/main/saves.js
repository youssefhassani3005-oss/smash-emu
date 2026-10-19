// Sauvegardes en jeu (SRAM, EEPROM, carte mémoire…) du lecteur intégré.
// La copie sur disque (instances/<id>/saves/game.srm) fait foi : le lecteur l'écrit toutes les 30 s et à la
// fermeture, la remet dans le jeu si elle diffère, et chaque remplacement garde l'ancienne version en copie
// de secours (rotation). Un dossier cloud (Dropbox, Drive, Syncthing…) peut servir de miroir entre PC.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_SIZE = 32 * 1024 * 1024;
const BACKUP_EVERY = 10 * 60 * 1000;   // pendant une partie : au plus une copie de secours toutes les 10 min
const DEFAULT_KEEP = 10;
const BACKUP_NAME = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(-[a-z0-9]+){0,2}\.srm$/;

const sha1 = buf => crypto.createHash('sha1').update(buf).digest('hex');
const pad = n => String(n).padStart(2, '0');
const stamp = (t) => {
	const d = new Date(t);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
};
const parseStamp = (name) => {
	const m = name.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/);
	return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : 0;
};

// Emplacements d'une sauvegarde : dossier « saves » d'une instance, ou dossier de l'instance dans le cloud.
const layout = dir => ({ dir, file: path.join(dir, 'game.srm'), meta: path.join(dir, 'save.json'), backups: path.join(dir, 'backups') });
const local = instDir => layout(path.join(instDir, 'saves'));
const cloud = (cloudRoot, id) => layout(path.join(cloudRoot, 'Smash Emu', 'saves', id));

const atomicWrite = (file, data) => {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const tmp = `${file}.${process.pid}.tmp`;
	fs.writeFileSync(tmp, data);
	fs.renameSync(tmp, file);
};

const checkData = (data) => {
	const buf = Buffer.isBuffer(data) ? data : Buffer.from(data || []);
	if (!buf.length) throw new Error('Sauvegarde vide.');
	if (buf.length > MAX_SIZE) throw new Error('Fichier trop gros pour une sauvegarde de jeu (32 Mo maximum).');
	return buf;
};

// Métadonnées de la sauvegarde courante ; une ancienne copie sans métadonnées (versions précédentes) est reprise.
const readMeta = (l) => {
	if (!fs.existsSync(l.file)) return null;
	try {
		const m = JSON.parse(fs.readFileSync(l.meta, 'utf8'));
		if (m && typeof m.hash === 'string' && typeof m.savedAt === 'number') return m;
	} catch { /* reconstruite ci-dessous */ }
	const data = fs.readFileSync(l.file);
	return { hash: sha1(data), size: data.length, savedAt: fs.statSync(l.file).mtimeMs, source: 'game' };
};

const listBackups = (l) => {
	let names = [];
	try { names = fs.readdirSync(l.backups).filter(n => BACKUP_NAME.test(n)); } catch { return []; }
	return names.map((name) => {
		const st = fs.statSync(path.join(l.backups, name));
		return { name, savedAt: parseStamp(name) || st.mtimeMs, size: st.size, tag: (name.match(/_\d{2}-\d{2}-\d{2}-([a-z]+)/) || [])[1] || null };
	}).sort((a, b) => b.savedAt - a.savedAt || b.name.localeCompare(a.name));
};

const pruneBackups = (l, keep) => {
	for (const b of listBackups(l).slice(Math.max(0, keep))) fs.rmSync(path.join(l.backups, b.name), { force: true });
};

// Range une copie de secours datée (suffixe facultatif : « jeu », « cloud »…), sans écraser une copie existante.
const addBackup = (l, data, savedAt, tag = '', keep = DEFAULT_KEEP) => {
	if (keep <= 0) return null;
	fs.mkdirSync(l.backups, { recursive: true });
	const base = `${stamp(savedAt)}${tag ? `-${tag}` : ''}`;
	let name = `${base}.srm`;
	for (let i = 2; fs.existsSync(path.join(l.backups, name)); i++) name = `${base}-${i}.srm`;
	fs.writeFileSync(path.join(l.backups, name), data);
	pruneBackups(l, keep);
	return name;
};

// Remplace la sauvegarde courante. Pendant une partie (source « game »), l'ancienne version n'est gardée que
// si elle vient d'une session précédente ou si la dernière copie de secours date de plus de 10 minutes ;
// un import, une restauration ou une version venue du cloud gardent toujours l'ancienne.
const write = (l, data, { keep = DEFAULT_KEEP, now = Date.now(), sessionStart = 0, source = 'game', savedAt = now } = {}) => {
	const buf = checkData(data);
	const hash = sha1(buf);
	const cur = readMeta(l);
	if (cur && cur.hash === hash) return { changed: false, meta: cur };
	if (cur && keep > 0) {
		const last = listBackups(l)[0];
		const due = source !== 'game' || cur.savedAt < sessionStart || !last || now - last.savedAt >= BACKUP_EVERY;
		if (due) addBackup(l, fs.readFileSync(l.file), cur.savedAt, '', keep);
	}
	atomicWrite(l.file, buf);
	const meta = { hash, size: buf.length, savedAt, source };
	atomicWrite(l.meta, JSON.stringify(meta));
	return { changed: true, meta };
};

const current = (l) => {
	const meta = readMeta(l);
	return meta ? { meta, data: fs.readFileSync(l.file) } : null;
};

const restore = (l, name, opts = {}) => {
	if (!BACKUP_NAME.test(name)) throw new Error('Copie de secours invalide.');
	const file = path.join(l.backups, name);
	if (!fs.existsSync(file)) throw new Error('Cette copie de secours n’existe plus.');
	return write(l, fs.readFileSync(file), { ...opts, source: 'restore' });
};

const importFile = (l, file, opts = {}) => {
	const st = fs.statSync(file);
	if (!st.isFile()) throw new Error('Ce n’est pas un fichier.');
	if (st.size > MAX_SIZE) throw new Error('Fichier trop gros pour une sauvegarde de jeu (32 Mo maximum).');
	return write(l, fs.readFileSync(file), { ...opts, source: 'import' });
};

const exportTo = (l, dest) => {
	if (!fs.existsSync(l.file)) throw new Error('Aucune sauvegarde en jeu pour l’instant : joue et sauvegarde dans le jeu d’abord.');
	fs.copyFileSync(l.file, dest);
	return dest;
};

// Synchronisation avec le dossier cloud : la version la plus récente gagne ; celle qui perd est gardée en
// copie de secours locale (suffixe « cloud » si elle venait du cloud).
const sync = (l, c, opts = {}) => {
	if (!c) return { action: 'none' };
	try {
		const mine = readMeta(l);
		const theirs = readMeta(c);
		if (theirs && (!mine || (theirs.hash !== mine.hash && theirs.savedAt > mine.savedAt))) {
			const data = fs.readFileSync(c.file);
			if (sha1(data) !== theirs.hash) return { action: 'skipped', error: 'Copie du cloud incomplète (synchronisation en cours ?).' };
			write(l, data, { ...opts, source: 'cloud', savedAt: theirs.savedAt });
			return { action: 'pulled', meta: theirs };
		}
		if (mine && (!theirs || theirs.hash !== mine.hash)) {
			if (theirs) addBackup(l, fs.readFileSync(c.file), theirs.savedAt, 'cloud', opts.keep ?? DEFAULT_KEEP);
			atomicWrite(c.file, fs.readFileSync(l.file));
			atomicWrite(c.meta, JSON.stringify(mine));
			return { action: 'pushed', meta: mine };
		}
		return { action: mine ? 'same' : 'none' };
	} catch (error) {
		return { action: 'error', error: error.message };
	}
};

module.exports = { local, cloud, write, current, restore, importFile, exportTo, sync, addBackup, listBackups, readMeta, sha1, stamp, DEFAULT_KEEP, BACKUP_EVERY };
