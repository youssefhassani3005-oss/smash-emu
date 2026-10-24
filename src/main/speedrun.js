// Mode speedrun : segments, record personnel, meilleurs segments et derniers essais de chaque jeu
// (speedrun.json dans le dossier du jeu). Commun au lecteur intégré et aux émulateurs externes.
const fs = require('fs');
const path = require('path');
const store = require('./store');

const MAX_SPLITS = 100;
const MAX_RUNS = 20;

const file = id => path.join(store.instanceDir(id), 'speedrun.json');

const get = (id) => { try { return JSON.parse(fs.readFileSync(file(id), 'utf8')); } catch { return null; } };

const ms = v => (Number.isFinite(v) && v >= 0 && v < 1e9 ? Math.round(v) : null);
const times = list => (Array.isArray(list) ? list.slice(0, MAX_SPLITS).map(ms) : []);

// Données venues de la page : seuls les champs attendus, bornés, sont gardés.
const clean = (d) => {
	if (!d || typeof d !== 'object') throw new Error('Données de speedrun invalides.');
	const splits = (Array.isArray(d.splits) ? d.splits : []).map(s => String(s).trim().slice(0, 60)).filter(Boolean).slice(0, MAX_SPLITS);
	const pb = d.pb && Array.isArray(d.pb.times) ? { times: times(d.pb.times), at: ms(d.pb.at) || 0 } : null;
	return {
		on: !!d.on,
		splits: splits.length ? splits : ['Fin'],
		pb: pb && pb.times.length && pb.times.every(t => t !== null) ? pb : null,
		best: times(d.best),
		attempts: Math.max(0, Math.min(1e6, Math.floor(Number(d.attempts) || 0))),
		runs: (Array.isArray(d.runs) ? d.runs : []).slice(0, MAX_RUNS).map(r => ({ at: ms(r && r.at) || 0, times: times(r && r.times), complete: !!(r && r.complete) })),
		// Écran de fin : signature 32×18 en niveaux de gris (base64), pour arrêter le chrono tout seul.
		endSig: typeof d.endSig === 'string' && /^[A-Za-z0-9+/=]{1,1024}$/.test(d.endSig) ? d.endSig : null,
		endAuto: !!d.endAuto,
	};
};

const total = d => (d && d.pb ? d.pb.times[d.pb.times.length - 1] : null);

// Nouveau record personnel (meilleur que le précédent) : quelques pièces Smash.
const save = (id, data) => {
	const before = total(get(id));
	const out = clean(data);
	fs.mkdirSync(path.dirname(file(id)), { recursive: true });
	fs.writeFileSync(file(id), JSON.stringify(out));
	const after = total(out);
	if (before !== null && after !== null && after < before) {
		const coins = require('./coins');
		const inst = store.getInstance(id);
		coins.earn(coins.REWARDS.personalBest, `Nouveau record sur ${inst ? inst.name : 'un jeu'}`);
	}
	return out;
};

// Signature d'une image : 32×18 pixels en niveaux de gris. bgra : pixels BGRA (nativeImage.toBitmap()).
const SIG_W = 32;
const SIG_H = 18;
const sigFromBgra = (bgra) => {
	const out = Buffer.alloc(SIG_W * SIG_H);
	for (let i = 0; i < out.length; i++) out[i] = Math.round(0.114 * bgra[i * 4] + 0.587 * bgra[i * 4 + 1] + 0.299 * bgra[i * 4 + 2]);
	return out.toString('base64');
};
// Image trop unie (écran noir, fondu) : elle ressemblerait à trop d'autres moments du jeu.
const sigSpread = (b64) => {
	const v = Buffer.from(b64, 'base64');
	const mean = v.reduce((a, x) => a + x, 0) / v.length;
	return Math.sqrt(v.reduce((a, x) => a + (x - mean) ** 2, 0) / v.length);
};
const sigDistance = (a, b) => {
	const x = Buffer.from(a, 'base64');
	const y = Buffer.from(b, 'base64');
	if (x.length !== y.length || !x.length) return 255;
	let d = 0;
	for (let i = 0; i < x.length; i++) d += Math.abs(x[i] - y[i]);
	return d / x.length;
};

module.exports = { get, save, clean, sigFromBgra, sigSpread, sigDistance, SIG_W, SIG_H };
