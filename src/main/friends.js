// Amis (facultatif, désactivé par défaut). Chaque joueur qui active la fonction reçoit un code ami secret. Son pseudo,
// son statut (en ligne, absent, jeu en cours) et un résumé de ses statistiques sont publiés, chiffrés en AES-256-GCM,
// sur un relais public gratuit (ntfy.sh) : seuls ceux qui ont son code peuvent les lire. Pas de compte ni de serveur
// Smash Emu. Les demandes d'ami arrivent dans une « boîte aux lettres » chiffrée de la même façon.
const crypto = require('crypto');
const { net, powerMonitor } = require('electron');
const store = require('./store');
const systems = require('./systems');
const stats = require('./stats');
const trophies = require('./trophies');

const RELAY = 'https://ntfy.sh';
// ntfy.sh accepte 250 messages par jour et par adresse : le statut est republié toutes les 10 min, et à chaque
// changement (début et fin de partie). Un ami dont le dernier statut date de plus de 21 min est hors ligne.
const HEARTBEAT = 10 * 60000;
const STALE = 21 * 60000;
const DAY = 86400000;

// ---------- Codes amis ----------
// 15 octets secrets écrits en base 32 de Crockford (24 caractères), d'où sont dérivés le canal de statut, la boîte
// aux lettres et la clé de chiffrement.
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const toB32 = (buf) => {
	let out = '', v = 0, bits = 0;
	for (const b of buf) {
		v = (v << 8) | b; bits += 8;
		while (bits >= 5) { out += B32[(v >>> (bits - 5)) & 31]; bits -= 5; }
		v &= (1 << bits) - 1;
	}
	return bits ? out + B32[(v << (5 - bits)) & 31] : out;
};
const fromB32 = (text) => {
	const out = [];
	let v = 0, bits = 0;
	for (const ch of text.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1')) {
		const n = B32.indexOf(ch);
		if (n < 0) return null;
		v = (v << 5) | n; bits += 5;
		if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; v &= (1 << bits) - 1; }
	}
	return Buffer.from(out);
};
const codeOf = secret => `SMASH-AMI-${toB32(secret).match(/.{4}/g).join('-')}`;
// Accepte un code collé avec ou sans tirets, espaces ou texte autour.
const secretOf = (code) => {
	const m = String(code || '').toUpperCase().match(/SMASH[\s-]*AMI[\s-]*([0-9A-Z][0-9A-Z\s-]{23,40})/);
	const raw = m && m[1].replace(/[\s-]/g, '').slice(0, 24);
	const secret = raw && raw.length === 24 ? fromB32(raw) : null;
	return secret && secret.length === 15 ? secret : null;
};
const normalize = (code) => { const s = secretOf(code); return s ? codeOf(s) : null; };

const derive = (secret, label, len) => crypto.createHmac('sha256', secret).update(label).digest().subarray(0, len);
const channels = secret => ({
	topic: `smashemu-${derive(secret, 'presence', 12).toString('hex')}`,
	inbox: `smashemu-${derive(secret, 'inbox', 12).toString('hex')}`,
	key: derive(secret, 'key', 32),
});

const seal = (key, obj) => {
	const iv = crypto.randomBytes(12);
	const c = crypto.createCipheriv('aes-256-gcm', key, iv);
	const data = Buffer.concat([c.update(JSON.stringify(obj)), c.final()]);
	return Buffer.concat([iv, data, c.getAuthTag()]).toString('base64url');
};
const unseal = (key, text) => {
	try {
		const b = Buffer.from(String(text), 'base64url');
		if (b.length < 29) return null;
		const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
		d.setAuthTag(b.subarray(b.length - 16));
		return JSON.parse(Buffer.concat([d.update(b.subarray(12, b.length - 16)), d.final()]).toString('utf8'));
	} catch { return null; }
};

// ---------- Réglages ----------

const cfg = () => ({ on: false, secret: null, list: [], requests: [], showGame: true, shareStats: true, notify: true, ...(store.getSettings().friends || {}) });
const save = patch => store.setSettings({ friends: { ...cfg(), ...patch } });
const mySecret = () => { const s = cfg().secret; return s ? Buffer.from(s, 'base64') : null; };
const myName = () => String(store.getSettings().playerName || '').trim().slice(0, 32) || 'Joueur Smash Emu';

let hooks = { send: () => {}, current: () => null, version: '' };
const emit = () => hooks.send('friends:update', state());
const event = e => hooks.send('friends:event', e);

// ---------- Ce qui est publié ----------

const short = s => String(s || '').slice(0, 40);
const sysLabel = id => (systems.SYSTEMS[id] || {}).label || id || '';
const summary = () => {
	const insts = store.listInstances();
	const played = insts.filter(i => i.playTimeMs > 0);
	const since = Date.now() - 7 * DAY;
	const week = stats.readLog().reduce((a, x) => a + Math.max(0, x.e - Math.max(x.s, since)), 0);
	let t = { count: 0, points: 0 };
	try { t = trophies.list([]); } catch { /* trophées indisponibles */ }
	const sys = i => (i.rom && i.rom.system) || i.system || 'n64';
	return {
		m: Math.round(played.reduce((a, i) => a + i.playTimeMs, 0) / 60000),
		w: Math.round(week / 60000),
		j: played.length,
		b: insts.length,
		tr: t.count || 0,
		pt: t.points || 0,
		top: played.sort((a, b) => b.playTimeMs - a.playTimeMs).slice(0, 5).map(i => [short(i.name), sysLabel(sys(i)), Math.round(i.playTimeMs / 60000)]),
		rec: insts.filter(i => i.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 5).map(i => [short(i.name), sysLabel(sys(i)), i.lastPlayed]),
	};
};
const presence = (status) => {
	const c = cfg();
	const game = c.showGame ? hooks.current() : null;
	let st = status;
	if (!st) { try { st = powerMonitor.getSystemIdleTime() > 15 * 60 && !game ? 'away' : 'on'; } catch { st = 'on'; } }
	return { v: 1, n: myName(), st, g: game ? { n: short(game.name), s: short(game.system), t: game.since } : null, s: c.shareStats ? summary() : null, at: Date.now(), app: hooks.version };
};

const post = async (topic, body) => {
	const res = await net.fetch(`${RELAY}/${topic}`, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' }, signal: AbortSignal.timeout(15000) });
	if (!res.ok) throw new Error(res.status === 429 ? 'Le relais limite les envois pour l’instant : réessaie plus tard.' : `Le relais a répondu ${res.status}.`);
};

let lastSent = 0;
let pending = null;
const publishNow = async (status) => {
	const secret = mySecret();
	if (!cfg().on || !secret) return;
	const ch = channels(secret);
	await post(ch.topic, seal(ch.key, presence(status)));
	lastSent = Date.now();
};
// Changement de statut : envoyé après 3 s de calme (lancer puis fermer un jeu tout de suite n'envoie qu'un message).
const publish = () => {
	clearTimeout(pending);
	pending = setTimeout(() => publishNow().catch(() => {}), 3000);
};

// ---------- Réception ----------

const friendsState = {}; // code -> dernier statut déchiffré
const seenIds = new Set();
let connected = false;
let sub = null;
let lastTime = 0;
let backoff = 5000;

const statusOf = (p) => {
	if (!p) return 'unknown';
	if (p.st === 'off' || Date.now() - p.at > STALE) return 'offline';
	return p.g ? 'playing' : p.st === 'away' ? 'away' : 'online';
};

const onPresence = (friend, p, fresh) => {
	if (!p || typeof p.at !== 'number' || p.at > Date.now() + 120000) return;
	const old = friendsState[friend.code];
	if (old && old.at >= p.at) return;
	const before = statusOf(old);
	friendsState[friend.code] = p;
	const c = cfg();
	// Garde le dernier statut connu : un ami hors ligne depuis plus de 12 h n'a plus de message sur le relais.
	save({ list: c.list.map(f => (f.code === friend.code ? { ...f, name: short(p.n) || f.name, last: p } : f)) });
	const after = statusOf(p);
	if (fresh && c.notify) {
		if (after === 'playing' && (!old || !old.g || old.g.n !== p.g.n)) event({ type: 'playing', name: p.n, game: p.g.n, system: p.g.s });
		else if (after === 'online' && (before === 'offline' || before === 'unknown')) event({ type: 'online', name: p.n });
	}
};

const onInbox = (msg, fresh) => {
	if (!msg || msg.t !== 'req') return;
	const code = normalize(msg.c);
	const c = cfg();
	if (!code || code === myCode()) return;
	if (c.list.some(f => f.code === code)) return;
	if (c.requests.some(r => r.code === code)) return;
	save({ requests: [...c.requests, { code, name: short(msg.n) || 'Joueur', at: msg.at || Date.now() }].slice(-30) });
	if (fresh) event({ type: 'request', name: short(msg.n) || 'Joueur', code });
};

const onLine = (line, routes) => {
	let m;
	try { m = JSON.parse(line); } catch { return; }
	if (m.event !== 'message' || !m.topic || seenIds.has(m.id)) return;
	seenIds.add(m.id);
	if (seenIds.size > 500) seenIds.delete(seenIds.values().next().value);
	lastTime = Math.max(lastTime, m.time || 0);
	const route = routes[m.topic];
	if (!route) return;
	const fresh = Date.now() / 1000 - (m.time || 0) < 120;
	const data = unseal(route.key, m.message);
	if (route.friend) onPresence(route.friend, data, fresh);
	else onInbox(data, fresh);
	emit();
};

// Un seul flux pour tous les canaux : la boîte aux lettres et le statut de chaque ami.
const listen = () => {
	if (sub) sub.abort();
	sub = null;
	connected = false;
	const c = cfg();
	const secret = mySecret();
	if (!c.on || !secret) { emit(); return; }
	const mine = channels(secret);
	const routes = { [mine.inbox]: { key: mine.key } };
	for (const f of c.list) {
		const s = secretOf(f.code);
		if (s) { const ch = channels(s); routes[ch.topic] = { key: ch.key, friend: f }; }
	}
	const ac = new AbortController();
	sub = ac;
	(async () => {
		try {
			const since = lastTime ? String(lastTime) : '12h';
			const res = await net.fetch(`${RELAY}/${Object.keys(routes).join(',')}/json?since=${since}`, { signal: ac.signal });
			if (!res.ok) throw new Error(String(res.status));
			connected = true;
			backoff = 5000;
			emit();
			const reader = res.body.getReader();
			const dec = new TextDecoder();
			let buf = '';
			for (;;) {
				const { value, done } = await reader.read();
				if (done) break;
				buf += dec.decode(value, { stream: true });
				let i;
				while ((i = buf.indexOf('\n')) >= 0) {
					const line = buf.slice(0, i);
					buf = buf.slice(i + 1);
					if (line.trim()) onLine(line, routes);
				}
			}
		} catch { /* relais injoignable : nouvel essai plus tard */ }
		if (ac.signal.aborted) return;
		connected = false;
		emit();
		setTimeout(() => { if (sub === ac) listen(); }, backoff);
		backoff = Math.min(backoff * 2, 300000);
	})();
};

// ---------- Actions ----------

const myCode = () => { const s = mySecret(); return s ? codeOf(s) : null; };

const state = () => {
	const c = cfg();
	return {
		on: !!c.on, code: c.on ? myCode() : null, name: myName(), showGame: c.showGame !== false, shareStats: c.shareStats !== false, notify: c.notify !== false,
		connected, relay: 'ntfy.sh',
		friends: c.list.map((f) => {
			const p = friendsState[f.code] || f.last || null;
			return { code: f.code, name: (p && p.n) || f.name || 'Ami', status: statusOf(p), game: p && p.g ? p.g : null, seen: p ? p.at : null, stats: p ? p.s : null, app: p ? p.app : null, addedAt: f.addedAt };
		}),
		requests: c.requests,
	};
};

const enable = async (on) => {
	const c = cfg();
	if (on && !c.secret) save({ on: true, secret: crypto.randomBytes(15).toString('base64') });
	else save({ on: !!on });
	if (on) { listen(); await publishNow().catch(() => {}); }
	else {
		const secret = mySecret();
		if (secret && c.on) { const ch = channels(secret); post(ch.topic, seal(ch.key, presence('off'))).catch(() => {}); }
		listen();
	}
	return state();
};

const setOptions = (o = {}) => {
	const patch = {};
	for (const k of ['showGame', 'shareStats', 'notify']) if (k in o) patch[k] = !!o[k];
	save(patch);
	publish();
	return state();
};

const add = async (code) => {
	const normal = normalize(code);
	if (!normal) throw new Error('Code ami invalide : il commence par SMASH-AMI- suivi de 24 caractères.');
	if (normal === myCode()) throw new Error('C’est ton propre code : partage-le à tes amis.');
	const c = cfg();
	if (!c.on) throw new Error('Active d’abord les amis.');
	if (c.list.some(f => f.code === normal)) throw new Error('Cet ami est déjà dans ta liste.');
	const request = c.requests.find(r => r.code === normal);
	save({ list: [...c.list, { code: normal, name: request ? request.name : '', addedAt: Date.now() }], requests: c.requests.filter(r => r.code !== normal) });
	listen();
	// Demande d'ami dans sa boîte aux lettres, sauf s'il nous a déjà demandé (il a donc déjà notre code).
	if (!request) {
		const ch = channels(secretOf(normal));
		await post(ch.inbox, seal(ch.key, { t: 'req', c: myCode(), n: myName(), at: Date.now() })).catch(() => {});
	}
	publish();
	return state();
};

const remove = (code) => {
	const c = cfg();
	save({ list: c.list.filter(f => f.code !== code) });
	delete friendsState[code];
	listen();
	return state();
};

const decline = (code) => { save({ requests: cfg().requests.filter(r => r.code !== code) }); return state(); };

// Nouveau code : les anciens amis ne voient plus rien tant qu'ils n'ont pas reçu le nouveau.
const regenerate = async () => {
	const secret = mySecret();
	if (secret) { const ch = channels(secret); await post(ch.topic, seal(ch.key, presence('off'))).catch(() => {}); }
	save({ secret: crypto.randomBytes(15).toString('base64') });
	listen();
	await publishNow().catch(() => {});
	return state();
};

const init = (h) => {
	hooks = { ...hooks, ...h };
	if (cfg().on) { listen(); publishNow().catch(() => {}); }
	setInterval(() => { if (cfg().on && Date.now() - lastSent > HEARTBEAT - 30000) publishNow().catch(() => {}); }, 60000);
};

// À la fermeture de Smash Emu : « hors ligne » (2 s au plus).
const goOffline = async () => {
	if (!cfg().on) return;
	const secret = mySecret();
	if (!secret) return;
	const ch = channels(secret);
	await Promise.race([post(ch.topic, seal(ch.key, presence('off'))), new Promise(r => setTimeout(r, 2000))]).catch(() => {});
};

module.exports = { init, state, enable, setOptions, add, remove, accept: add, decline, regenerate, publish, goOffline, codeOf, secretOf, normalize, channels, seal, unseal, statusOf };
