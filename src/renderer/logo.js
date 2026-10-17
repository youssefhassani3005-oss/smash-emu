// Logo pixel art de Smash Emu (16 × 16) : tuile aux bords en relief et « S » blanc à ombre portée.
// Utilisé par l'interface (SVG) et par scripts/make-icon.js (icône PNG / ICO).
(function (root) {
	const SIZE = 16;
	const GLYPH = [
		'.######.',
		'########',
		'###.....',
		'#######.',
		'.#######',
		'.....###',
		'########',
		'.######.',
	];
	const GX = 3;
	const GY = 4;
	const CORNERS = new Set(['0,0', '1,0', '0,1', '14,0', '15,0', '15,1', '0,14', '0,15', '1,15', '15,14', '14,15', '15,15']);
	const inside = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && !CORNERS.has(`${x},${y}`);
	const glyph = (x, y) => {
		const row = GLYPH[y - GY];
		return !!row && x >= GX && x < GX + row.length && row[x - GX] === '#';
	};

	// Codes : . vide, B couleur, H reflet, D ombre du bord, W lettre, K ombre de la lettre.
	const matrix = () => {
		const m = [];
		for (let y = 0; y < SIZE; y++) {
			let row = '';
			for (let x = 0; x < SIZE; x++) {
				if (!inside(x, y)) row += '.';
				else if (glyph(x, y)) row += 'W';
				else if (glyph(x - 1, y - 1)) row += 'K';
				else if (!inside(x, y - 1) || !inside(x - 1, y)) row += 'H';
				else if (!inside(x, y + 1) || !inside(x + 1, y)) row += 'D';
				else row += 'B';
			}
			m.push(row);
		}
		return m;
	};

	const FILL = {
		B: 'fill:var(--brand)',
		H: 'fill:var(--brand-hover)',
		D: 'fill:var(--brand);filter:brightness(0.62)',
		W: 'fill:#fff',
		K: 'fill:#000;fill-opacity:0.45',
	};

	// SVG : une bande <rect> par suite de pixels identiques.
	const svg = (size = 28) => {
		let rects = '';
		matrix().forEach((row, y) => {
			for (let x = 0; x < SIZE;) {
				const c = row[x];
				let w = 1;
				while (x + w < SIZE && row[x + w] === c) w++;
				if (c !== '.') {
					if (c === 'K' || c === 'D') rects += `<rect x="${x}" y="${y}" width="${w}" height="1" style="fill:var(--brand)"/>`;
					rects += `<rect x="${x}" y="${y}" width="${w}" height="1" style="${c === 'D' ? 'fill:#000;fill-opacity:0.35' : FILL[c]}"/>`;
				}
				x += w;
			}
		});
		return `<svg class="pixel-logo" viewBox="0 0 16 16" width="${size}" height="${size}" shape-rendering="crispEdges" aria-label="Smash Emu">${rects}</svg>`;
	};

	const wordmark = () => '<span class="wordmark"><span class="w1">SMASH</span><span class="w2">EMU</span></span>';

	const api = { SIZE, matrix, svg, wordmark };
	root.SmashLogo = api;
	if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
