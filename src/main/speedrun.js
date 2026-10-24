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
	};
};

const save = (id, data) => {
	const out = clean(data);
	fs.mkdirSync(path.dirname(file(id)), { recursive: true });
	fs.writeFileSync(file(id), JSON.stringify(out));
	return out;
};

module.exports = { get, save, clean };
