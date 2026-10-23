// Couleurs d'une jaquette, pour habiller l'accueil console aux couleurs du jeu sélectionné : l'image est réduite à
// 32×32, les couleurs regroupées en 18 teintes pondérées par leur vivacité. Renvoie la teinte dominante, une teinte
// d'accent bien distincte et la moyenne (claire ou sombre).
const fs = require('fs');
const { nativeImage } = require('electron');

const memo = new Map();
const hex = rgb => `#${rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

const hsl = (r, g, b) => {
	r /= 255; g /= 255; b /= 255;
	const max = Math.max(r, g, b), min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return [0, 0, l];
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
	return [h * 60, s, l];
};

// Pixels BGRA (format de toBitmap sous Windows) → couleurs.
const analyse = (bmp) => {
	const bins = new Map();
	const sum = [0, 0, 0];
	let n = 0;
	for (let i = 0; i + 3 < bmp.length; i += 4) {
		const b = bmp[i], g = bmp[i + 1], r = bmp[i + 2];
		if (bmp[i + 3] < 128) continue;
		sum[0] += r; sum[1] += g; sum[2] += b; n++;
		const [h, s, l] = hsl(r, g, b);
		if (l < 0.1 || l > 0.93 || s < 0.15) continue;
		const k = Math.round(h / 20) % 18;
		const w = s * (1 - Math.abs(l - 0.5));
		const e = bins.get(k) || { w: 0, r: 0, g: 0, b: 0 };
		e.w += w; e.r += r * w; e.g += g * w; e.b += b * w;
		bins.set(k, e);
	}
	const avg = n ? sum.map(v => v / n) : [40, 40, 48];
	const ranked = [...bins.entries()].sort((a, b) => b[1].w - a[1].w).map(([k, e]) => ({ k, rgb: [e.r / e.w, e.g / e.w, e.b / e.w] }));
	const main = ranked[0] ? ranked[0].rgb : avg;
	const far = x => Math.min(Math.abs(x.k - ranked[0].k), 18 - Math.abs(x.k - ranked[0].k)) >= 3;
	const accent = ranked.length ? (ranked.find(far) || ranked[1] || ranked[0]).rgb : avg;
	const lum = (0.2126 * avg[0] + 0.7152 * avg[1] + 0.0722 * avg[2]) / 255;
	return { main: hex(main), accent: hex(accent), avg: hex(avg), light: lum > 0.6 };
};

const fromFile = (file) => {
	let st;
	try { st = fs.statSync(file); } catch { return null; }
	const key = `${file}|${st.mtimeMs}`;
	if (memo.has(key)) return memo.get(key);
	const img = nativeImage.createFromPath(file);
	if (img.isEmpty()) return null;
	const out = analyse(img.resize({ width: 32, height: 32, quality: 'good' }).toBitmap());
	memo.set(key, out);
	return out;
};

module.exports = { fromFile, analyse, hsl };
