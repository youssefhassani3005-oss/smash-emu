// Génère src/renderer/assets/icon.png (256 px) et icon.ico à partir du logo pixel art (src/renderer/logo.js).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { crc32 } = require('../src/main/rom');
const logo = require('../src/renderer/logo');

const COLORS = {
	B: [255, 31, 61, 255],
	H: [255, 74, 99, 255],
	D: [158, 19, 38, 255],
	W: [255, 255, 255, 255],
	K: [140, 17, 34, 255],
	'.': [0, 0, 0, 0],
};

const chunk = (type, data) => {
	const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
	return Buffer.concat([len, body, crc]);
};

// PNG RGBA agrandi sans lissage (chaque pixel du logo devient un carré net).
const png = (size, variant = 'classic') => {
	const m = logo.matrix(variant);
	const scale = size / logo.SIZE;
	const raw = Buffer.alloc(size * (size * 4 + 1));
	for (let y = 0; y < size; y++) {
		raw[y * (size * 4 + 1)] = 0;
		for (let x = 0; x < size; x++) {
			const c = COLORS[m[Math.floor(y / scale)][Math.floor(x / scale)]];
			const o = y * (size * 4 + 1) + 1 + x * 4;
			raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = c[3];
		}
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
	return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};

// ICO contenant des images PNG (format accepté par Windows depuis Vista).
const ico = (sizes) => {
	const images = sizes.map(png);
	const header = Buffer.alloc(6);
	header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
	let offset = 6 + 16 * images.length;
	const entries = images.map((img, i) => {
		const e = Buffer.alloc(16);
		e[0] = sizes[i] >= 256 ? 0 : sizes[i]; e[1] = sizes[i] >= 256 ? 0 : sizes[i];
		e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
		e.writeUInt32LE(img.length, 8); e.writeUInt32LE(offset, 12);
		offset += img.length;
		return e;
	});
	return Buffer.concat([header, ...entries, ...images]);
};

const out = path.join(__dirname, '..', 'src', 'renderer', 'assets');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon.png'), png(256));
// Icône de fenêtre pour le second logo (l'exécutable garde l'icône classique).
fs.writeFileSync(path.join(out, 'icon-manette.png'), png(256, 'manette'));
fs.writeFileSync(path.join(out, 'icon.ico'), ico([256, 64, 48, 32, 16]));
console.log('Icône pixel art générée : icon.png, icon.ico');
