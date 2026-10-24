// Générateur aléatoire du randomizer : xoshiro256** (Blackman et Vigna), reproductible sur toutes les machines.
// La graine (texte ou nombre choisi par le joueur) est transformée en état de départ par SHA-256 : la même graine
// donne toujours les mêmes tirages. Le générateur du système n'est jamais utilisé pour randomiser un jeu.
const crypto = require('crypto');

const MASK = (1n << 64n) - 1n;
const rotl = (x, k) => ((x << BigInt(k)) | (x >> BigInt(64 - k))) & MASK;

// Graine lisible : lettres et chiffres sans ambiguïté (pas de 0/O ni de 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
// Seuls les lettres et chiffres comptent (sans accents ni casse) : « Ma graine ! » = « MAGRAINE ».
const normalizeSeed = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 40);
const randomSeed = (len = 8) => Array.from(crypto.randomBytes(len), b => ALPHABET[b % ALPHABET.length]).join('');

// Tirage suivant de xoshiro256** à partir de l'état s (quatre entiers de 64 bits, modifié sur place).
const xoshiro = s => () => {
	const result = (rotl((s[1] * 5n) & MASK, 7) * 9n) & MASK;
	const t = (s[1] << 17n) & MASK;
	s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
	s[2] ^= t;
	s[3] = rotl(s[3], 45);
	return result;
};

// stream : sous-suite indépendante pour chaque usage (couleurs, valeurs…), pour qu'activer un mode ne change pas
// les tirages des autres.
const create = (seed, stream = '') => {
	const h = crypto.createHash('sha256').update(`smash-emu-randomizer\0${normalizeSeed(seed)}\0${stream}`).digest();
	const s = [0, 8, 16, 24].map(o => h.readBigUInt64LE(o));
	if (s.every(v => v === 0n)) s[0] = 1n;
	const next = xoshiro(s);
	// Entier dans [0, n[ sans biais (rejet des tirages au-delà du plus grand multiple de n).
	const int = (n) => {
		if (!(n >= 1)) return 0;
		const N = BigInt(Math.floor(n));
		const limit = MASK - (MASK % N);
		let x;
		do x = next(); while (x >= limit);
		return Number(x % N);
	};
	const float = () => Number(next() >> 11n) / 2 ** 53;
	const range = (min, max) => min + int(max - min + 1);
	const pick = list => list[int(list.length)];
	// Mélange de Fisher-Yates (renvoie une copie).
	const shuffle = (list) => {
		const a = list.slice();
		for (let i = a.length - 1; i > 0; i--) { const j = int(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
		return a;
	};
	const chance = p => float() < p;
	return { next, int, float, range, pick, shuffle, chance };
};

// Code partageable : SMASH-<graine>-<modes><intensité>, ex. SMASH-K7M2QX9A-CV2.
const MODES = { colors: 'C', values: 'V', mods: 'M', palettes: 'P', tables: 'T', tiles: 'G', inputs: 'E' };
const INTENSITY = ['soft', 'medium', 'chaos'];
const shareCode = ({ seed, modes = {}, intensity = 'medium' }) => {
	const flags = Object.entries(MODES).filter(([k]) => modes[k]).map(([, c]) => c).join('');
	return `SMASH-${normalizeSeed(seed) || 'X'}-${flags}${Math.max(0, INTENSITY.indexOf(intensity)) + 1}`;
};
const parseCode = (code) => {
	const m = String(code || '').trim().toUpperCase().match(/^SMASH-([A-Z0-9]{1,40})-([A-Z]*)([123])$/);
	if (!m) throw new Error('Code de randomizer invalide (attendu : SMASH-GRAINE-MODES1, 2 ou 3).');
	const modes = {};
	for (const [k, c] of Object.entries(MODES)) if (m[2].includes(c)) modes[k] = true;
	return { seed: m[1], modes, intensity: INTENSITY[Number(m[3]) - 1] };
};

module.exports = { create, xoshiro, randomSeed, normalizeSeed, shareCode, parseCode, INTENSITY, MODES };
