// Statistiques de la communauté (facultatif, désactivé par défaut). Chaque copie qui l'accepte envoie, au plus toutes
// les 6 h pendant qu'elle est ouverte, un rapport anonyme (identifiant tiré au hasard, version, temps de jeu, consoles,
// jeux les plus joués, émulateurs installés) chiffré pour l'administrateur seul (X25519 + AES-256-GCM) sur le relais
// public ntfy.sh. Le PC administrateur (clé privée dans Documents\Smash Emu\admin) rassemble les rapports et publie,
// signé, le résumé de la communauté que toutes les copies affichent dans le tableau de bord.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { net } = require('electron');
const store = require('./store');
const systems = require('./systems');
const stats = require('./stats');
const supporter = require('./supporter');

const RELAY = 'https://ntfy.sh';
const REPORTS = 'smashemu-census-v1-reports';
const SUMMARY = 'smashemu-census-v1-summary';
// Clé publique X25519 de l'administrateur : seuls les rapports qu'elle chiffre lui sont lisibles.
const ADMIN_PUBLIC = Buffer.from('kxi9EbFblm95t2n7ICEWLwz700Z7mN2IghjZ4orGhzI=', 'base64');
const ADMIN_FILE = path.join(store.ROOT, 'admin', 'community-private.pem');
const DB_FILE = path.join(store.ROOT, 'admin', 'community-reports.json');
const EVERY = 6 * 3600000;
const DAY = 86400000;

// ---------- Chiffrement pour l'administrateur ----------

const X25519_SPKI = Buffer.from('302a300506032b656e032100', 'hex');
const publicFromRaw = raw => crypto.createPublicKey({ key: Buffer.concat([X25519_SPKI, raw]), format: 'der', type: 'spki' });
const keyFor = (shared, eph) => Buffer.from(crypto.hkdfSync('sha256', shared, eph, 'smash-emu-census', 32));

const sealFor = (raw, obj) => {
	const eph = crypto.generateKeyPairSync('x25519');
	const ephRaw = eph.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
	const key = keyFor(crypto.diffieHellman({ privateKey: eph.privateKey, publicKey: publicFromRaw(raw) }), ephRaw);
	const iv = crypto.randomBytes(12);
	const c = crypto.createCipheriv('aes-256-gcm', key, iv);
	const ct = Buffer.concat([c.update(JSON.stringify(obj)), c.final()]);
	return Buffer.concat([ephRaw, iv, ct, c.getAuthTag()]).toString('base64url');
};

const openWith = (privateKey, text) => {
	try {
		const b = Buffer.from(String(text), 'base64url');
		if (b.length < 61) return null;
		const ephRaw = b.subarray(0, 32);
		const key = keyFor(crypto.diffieHellman({ privateKey, publicKey: publicFromRaw(ephRaw) }), ephRaw);
		const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(32, 44));
		d.setAuthTag(b.subarray(b.length - 16));
		return JSON.parse(Buffer.concat([d.update(b.subarray(44, b.length - 16)), d.final()]).toString('utf8'));
	} catch { return null; }
};

// ---------- Rapport anonyme ----------

const cfg = () => ({ on: false, asked: false, id: null, firstAt: 0, sentAt: 0, ...(store.getSettings().census || {}) });
const save = patch => store.setSettings({ census: { ...cfg(), ...patch } });
let hooks = { version: '', emulators: () => [], send: () => {} };

const minutes = ms => Math.round(ms / 60000);
const report = () => {
	const c = cfg();
	const s = store.getSettings();
	const insts = store.listInstances();
	const sysOf = i => (i.rom && i.rom.system) || i.system || 'n64';
	const now = Date.now();
	const log = stats.readLog();
	const within = span => minutes(log.reduce((a, x) => a + Math.max(0, x.e - Math.max(x.s, now - span)), 0));
	const played = insts.filter(i => i.playTimeMs > 0);
	const perSys = {};
	for (const i of played) perSys[sysOf(i)] = (perSys[sysOf(i)] || 0) + i.playTimeMs;
	return {
		v: 1, id: c.id, ver: hooks.version, os: os.release().split('.').slice(0, 2).join('.'), at: now, first: c.firstAt,
		m: minutes(played.reduce((a, i) => a + i.playTimeMs, 0)), m1: within(DAY), m7: within(7 * DAY), j: played.length, b: insts.length,
		sys: Object.entries(perSys).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, ms]) => [id, minutes(ms)]),
		top: played.sort((a, b) => b.playTimeMs - a.playTimeMs).slice(0, 5).map(i => [String(i.name).slice(0, 40), sysOf(i), minutes(i.playTimeMs)]),
		emu: hooks.emulators(),
		f: { amis: !!(s.friends || {}).on, sup: !!(s.supporter && s.supporter.code), themes: (s.customThemes || []).length, remote: (s.remoteRecent || []).length },
	};
};

const post = async (topic, body) => {
	const res = await net.fetch(`${RELAY}/${topic}`, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' }, signal: AbortSignal.timeout(15000) });
	if (!res.ok) throw new Error(`Le relais a répondu ${res.status}.`);
};

const sendReport = async (force = false) => {
	const c = cfg();
	if (!c.on || !c.id || (!force && Date.now() - c.sentAt < EVERY)) return false;
	await post(REPORTS, sealFor(ADMIN_PUBLIC, report()));
	save({ sentAt: Date.now() });
	return true;
};

// Choix du joueur (une seule question, modifiable dans Paramètres).
const setEnabled = async (on) => {
	const c = cfg();
	save({ on: !!on, asked: true, id: c.id || crypto.randomBytes(8).toString('hex'), firstAt: c.firstAt || Date.now() });
	if (on) await sendReport(true).catch(() => {});
	return publicState();
};

// ---------- Résumé de la communauté (signé par l'administrateur) ----------

let summaryMemo = { at: 0 };
const fetchSummary = async () => {
	if (Date.now() - summaryMemo.at < 30 * 60000) return store.getSettings().communitySummary || null;
	summaryMemo = { at: Date.now() };
	try {
		const res = await net.fetch(`${RELAY}/${SUMMARY}/json?poll=1&since=12h`, { signal: AbortSignal.timeout(15000) });
		if (res.ok) {
			let best = store.getSettings().communitySummary || null;
			for (const line of (await res.text()).split('\n')) {
				let m;
				try { m = JSON.parse(line); } catch { continue; }
				if (m.event !== 'message') continue;
				const [d, sig] = String(m.message).split('.');
				if (!d || !sig) continue;
				const data = supporter.unb64u(d);
				if (!supporter.signedByAdmin(data, supporter.unb64u(sig))) continue;
				let value;
				try { value = JSON.parse(data.toString('utf8')); } catch { continue; }
				if (value && value.at && (!best || value.at > best.at)) best = value;
			}
			if (best) store.setSettings({ communitySummary: best });
			return best;
		}
	} catch { /* hors ligne : dernier résumé connu */ }
	return store.getSettings().communitySummary || null;
};

// ---------- Administration ----------

const isAdmin = () => fs.existsSync(ADMIN_FILE) && supporter.isAdmin();
const readDb = () => { try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { return {}; } };
const writeDb = db => fs.writeFileSync(DB_FILE, JSON.stringify(db));

const dayKey = stats.dayKey;
// Un rapport valide remplace le précédent du même joueur ; les jours d'activité sont gardés 60 jours.
const ingest = (db, r) => {
	if (!r || r.v !== 1 || !/^[0-9a-f]{16}$/.test(String(r.id)) || !/^\d+\.\d+\.\d+/.test(String(r.ver)) || typeof r.at !== 'number' || r.at > Date.now() + 3600000) return false;
	const old = db[r.id];
	if (old && old.at >= r.at) return false;
	const days = new Set([...(old ? old.days : []), dayKey(r.at)]);
	db[r.id] = { ...r, seen: old ? old.seen : Date.now(), days: [...days].sort().slice(-60) };
	return true;
};

const sum = (list, f) => list.reduce((a, x) => a + (Number(f(x)) || 0), 0);
const label = id => (systems.SYSTEMS[id] || {}).label || id;
const aggregate = (db = readDb()) => {
	const now = Date.now();
	const all = Object.values(db);
	const count = (pick) => {
		const out = {};
		for (const r of all) for (const k of pick(r)) out[k] = (out[k] || 0) + 1;
		return Object.entries(out).sort((a, b) => b[1] - a[1]);
	};
	const games = {};
	for (const r of all) for (const [n, sys, m] of r.top || []) {
		const k = `${String(n).toLowerCase()}|${sys}`;
		games[k] = games[k] || { n, sys: label(sys), m: 0, p: 0 };
		games[k].m += m; games[k].p++;
	}
	const sysAll = {};
	for (const r of all) for (const [id, m] of r.sys || []) { sysAll[id] = sysAll[id] || { id, label: label(id), m: 0, p: 0 }; sysAll[id].m += m; sysAll[id].p++; }
	const days = [];
	for (let i = 29; i >= 0; i--) { const k = dayKey(now - i * DAY); days.push([k, all.filter(r => (r.days || []).includes(k)).length]); }
	return {
		at: now,
		players: all.length,
		active1: all.filter(r => now - r.at < DAY).length,
		active7: all.filter(r => now - r.at < 7 * DAY).length,
		newWeek: all.filter(r => now - (r.first || r.seen) < 7 * DAY).length,
		hours: Math.round(sum(all, r => r.m) / 60),
		weekHours: Math.round(sum(all, r => r.m7) / 60),
		games: Object.values(games).sort((a, b) => b.m - a.m).slice(0, 10),
		systems: Object.values(sysAll).sort((a, b) => b.m - a.m).slice(0, 10),
		versions: count(r => [r.ver || '?']).slice(0, 8),
		emulators: count(r => r.emu || []).slice(0, 12),
		features: { amis: all.filter(r => r.f && r.f.amis).length, supporters: all.filter(r => r.f && r.f.sup).length, themes: all.filter(r => r.f && r.f.themes).length, remote: all.filter(r => r.f && r.f.remote).length },
		days,
	};
};

let lastPublished = 0;
const publishSummary = async () => {
	if (!isAdmin()) throw new Error('Réservé au PC administrateur.');
	const data = Buffer.from(JSON.stringify(aggregate()), 'utf8');
	await post(SUMMARY, `${supporter.b64u(data)}.${supporter.b64u(supporter.sign(data))}`);
	lastPublished = Date.now();
	summaryMemo = { at: 0 };
	return true;
};

// PC administrateur : écoute en continu les rapports (et récupère ceux des 12 dernières heures au démarrage).
let collecting = null;
let lastTime = 0;
const collect = () => {
	if (!isAdmin() || collecting) return;
	const key = crypto.createPrivateKey(fs.readFileSync(ADMIN_FILE));
	const ac = new AbortController();
	collecting = ac;
	(async () => {
		try {
			const res = await net.fetch(`${RELAY}/${REPORTS}/json?since=${lastTime || '12h'}`, { signal: ac.signal });
			if (!res.ok) throw new Error(String(res.status));
			const reader = res.body.getReader();
			const dec = new TextDecoder();
			let buf = '';
			for (;;) {
				const { value, done } = await reader.read();
				if (done) break;
				buf += dec.decode(value, { stream: true });
				let i;
				let changed = false;
				const db = readDb();
				while ((i = buf.indexOf('\n')) >= 0) {
					const line = buf.slice(0, i);
					buf = buf.slice(i + 1);
					let m;
					try { m = JSON.parse(line); } catch { continue; }
					if (m.event !== 'message') continue;
					lastTime = Math.max(lastTime, m.time || 0);
					if (ingest(db, openWith(key, m.message))) changed = true;
				}
				if (changed) { writeDb(db); hooks.send('census:update', adminState()); }
			}
		} catch { /* relais injoignable */ }
		collecting = null;
		if (!ac.signal.aborted) setTimeout(collect, 60000);
	})();
};

const adminState = () => {
	const db = readDb();
	return {
		summary: aggregate(db),
		players: Object.values(db).sort((a, b) => b.at - a.at).slice(0, 200).map(r => ({ id: r.id.slice(0, 6), ver: r.ver, at: r.at, m: r.m, m7: r.m7, j: r.j, top: (r.top || [])[0] || null, emu: (r.emu || []).length })),
		lastPublished,
	};
};

const publicState = () => {
	const c = cfg();
	return { on: c.on, asked: c.asked, admin: isAdmin() };
};

const init = (h) => {
	hooks = { ...hooks, ...h };
	setTimeout(() => sendReport().catch(() => {}), 30000);
	setInterval(() => sendReport().catch(() => {}), 30 * 60000);
	if (isAdmin()) {
		collect();
		// Résumé republié toutes les 6 h (le relais garde les messages 12 h).
		setTimeout(() => publishSummary().catch(() => {}), 90000);
		setInterval(() => publishSummary().catch(() => {}), EVERY);
	}
};

module.exports = { init, setEnabled, publicState, fetchSummary, adminState, publishSummary, report, sealFor, openWith, ingest, aggregate };
