// Images des thèmes personnalisés : copiées dans Documents\Smash Emu\themes. Les fichiers .smashtheme
// contiennent le thème et ses images (en base64), pour partager un thème complet avec ses amis.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');

const DIR = path.join(store.ROOT, 'themes');
const MAX_IMAGE = 20 * 1024 * 1024;
const MAX_FILE = 60 * 1024 * 1024;
const IMAGE_KEYS = ['image', 'sticker'];
const FIELDS = ['label', 'tagline', 'bg', 'accent', 'accent2', 'font', 'icons', 'particles', 'motifs', 'light', 'imageDim', 'imageBlur'];

// Type réel de l'image d'après ses premiers octets (l'extension ne suffit pas pour un fichier reçu).
const sniff = (buf) => {
	if (buf.subarray(0, 4).toString('hex') === '89504e47') return 'png';
	if (buf.subarray(0, 3).toString('hex') === 'ffd8ff') return 'jpg';
	if (buf.subarray(0, 4).toString('latin1') === 'GIF8') return 'gif';
	if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
	return null;
};

const save = (buf) => {
	const ext = sniff(buf);
	if (!ext) throw new Error('Image non reconnue : utilise un PNG, JPG, WebP ou GIF.');
	if (buf.length > MAX_IMAGE) throw new Error('Image trop lourde (20 Mo au maximum).');
	fs.mkdirSync(DIR, { recursive: true });
	const file = path.join(DIR, `${crypto.randomBytes(6).toString('hex')}.${ext}`);
	fs.writeFileSync(file, buf);
	return file;
};

const inDir = p => typeof p === 'string' && path.resolve(p).toLowerCase().startsWith(DIR.toLowerCase() + path.sep);

const importImage = (src) => {
	if (fs.statSync(src).size > MAX_IMAGE) throw new Error('Image trop lourde (20 Mo au maximum).');
	return save(fs.readFileSync(src));
};

const exportFile = (def, dest) => {
	const theme = Object.fromEntries(FIELDS.filter(k => def[k] !== undefined).map(k => [k, def[k]]));
	const images = {};
	for (const k of IMAGE_KEYS) if (inDir(def[k]) && fs.existsSync(def[k])) images[k] = fs.readFileSync(def[k]).toString('base64');
	fs.writeFileSync(dest, JSON.stringify({ format: 'smash-theme', version: 1, theme, images }));
	return dest;
};

const importFile = (src) => {
	if (fs.statSync(src).size > MAX_FILE) throw new Error('Fichier de thème trop lourd.');
	let data;
	try { data = JSON.parse(fs.readFileSync(src, 'utf8')); } catch { throw new Error('Fichier de thème illisible.'); }
	if (!data || data.format !== 'smash-theme' || !data.theme || typeof data.theme !== 'object') throw new Error('Ce fichier n’est pas un thème Smash Emu.');
	const theme = Object.fromEntries(FIELDS.filter(k => data.theme[k] !== undefined).map(k => [k, data.theme[k]]));
	for (const k of IMAGE_KEYS) if (data.images && typeof data.images[k] === 'string') theme[k] = save(Buffer.from(data.images[k], 'base64'));
	return theme;
};

// Supprime les images qui ne servent plus à aucun thème.
const cleanup = (themes = []) => {
	const used = new Set(themes.flatMap(t => IMAGE_KEYS.map(k => t[k])).filter(Boolean).map(p => path.resolve(p).toLowerCase()));
	let names = [];
	try { names = fs.readdirSync(DIR); } catch { return 0; }
	let removed = 0;
	for (const n of names) {
		const p = path.join(DIR, n);
		if (!used.has(p.toLowerCase())) { fs.rmSync(p, { force: true }); removed++; }
	}
	return removed;
};

module.exports = { DIR, sniff, importImage, exportFile, importFile, cleanup, inDir };
