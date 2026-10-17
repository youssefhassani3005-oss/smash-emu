// Génère les images de l'installateur (bandeau latéral 164×314, en-tête 150×57) en pixel art rouge et noir.
const fs = require('fs');
const path = require('path');
const logo = require('../src/renderer/logo.js');

const OUT = path.join(__dirname, '..', 'build');
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const COL = { B: hex('#ff1f3d'), H: hex('#ff6a7d'), D: hex('#b30f27'), W: [255, 255, 255], K: hex('#6b0716') };

// Police 5×7 pour le mot-symbole.
const FONT = {
	S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
	M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
	A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
	H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
	E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
	U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
};

const canvas = (w, h, fn) => {
	const px = Buffer.alloc(w * h * 3);
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = fn(x, y); px[(y * w + x) * 3] = r; px[(y * w + x) * 3 + 1] = g; px[(y * w + x) * 3 + 2] = b; }
	return { w, h, px };
};
const set = (c, x, y, col) => { if (x >= 0 && y >= 0 && x < c.w && y < c.h) { c.px[(y * c.w + x) * 3] = col[0]; c.px[(y * c.w + x) * 3 + 1] = col[1]; c.px[(y * c.w + x) * 3 + 2] = col[2]; } };
const rect = (c, x, y, w, h, col) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(c, x + i, y + j, col); };
const drawLogo = (c, x0, y0, s) => logo.matrix().forEach((row, y) => [...row].forEach((k, x) => { if (COL[k]) rect(c, x0 + x * s, y0 + y * s, s, s, COL[k]); }));
const drawText = (c, text, x0, y0, s, col) => {
	[...text].forEach((ch, i) => {
		if (!FONT[ch]) return;
		FONT[ch].forEach((row, y) => [...row].forEach((v, x) => { if (v === '#') rect(c, x0 + (i * 6 + x) * s, y0 + y * s, s, s, col); }));
	});
};
const textWidth = (t, s) => (t.length * 6 - 1) * s;

// BMP 24 bits.
const bmp = ({ w, h, px }) => {
	const row = Math.ceil(w * 3 / 4) * 4;
	const buf = Buffer.alloc(54 + row * h);
	buf.write('BM'); buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
	buf.writeInt32LE(w, 18); buf.writeInt32LE(h, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28); buf.writeUInt32LE(row * h, 34);
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
		const s = ((h - 1 - y) * w + x) * 3, d = 54 + y * row + x * 3;
		buf[d] = px[s + 2]; buf[d + 1] = px[s + 1]; buf[d + 2] = px[s];
	}
	return buf;
};

// Bandeau latéral : fond noir, grille discrète, logo, mot-symbole.
const side = canvas(164, 314, (x, y) => {
	const g = (x % 8 === 0 || y % 8 === 0) ? 6 : 0;
	const glow = Math.max(0, 1 - Math.hypot(x - 82, y - 120) / 150);
	return [10 + g + Math.round(glow * 70), 10 + g + Math.round(glow * 6), 11 + g + Math.round(glow * 14)];
});
drawLogo(side, 18, 52, 8);
drawText(side, 'SMASH', 82 - textWidth('SMASH', 4) / 2, 200, 4, [255, 255, 255]);
drawText(side, 'EMU', 82 - textWidth('EMU', 4) / 2, 240, 4, COL.B);
rect(side, 0, 308, 164, 6, COL.B);
fs.writeFileSync(path.join(OUT, 'installerSidebar.bmp'), bmp(side));

const head = canvas(150, 57, (x, y) => [10, 10, 11]);
drawLogo(head, 90, 4, 3);
rect(head, 0, 54, 150, 3, COL.B);
fs.writeFileSync(path.join(OUT, 'installerHeader.bmp'), bmp(head));
console.log('ok');
