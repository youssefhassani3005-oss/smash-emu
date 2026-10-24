// Jeu à distance — salons : un code court (ex. K7M-2QX) remplace l'échange de longs codes. L'hôte et l'invité
// s'échangent l'offre et la réponse WebRTC par le relais public ntfy.sh, chiffrées (AES-256-GCM) avec une clé
// tirée du code : le relais ne voit ni les adresses ni le jeu. Le code sert de mot de passe du salon.
const crypto = require('crypto');
const zlib = require('zlib');
const { ipcMain, net } = require('electron');

const RELAY = 'https://ntfy.sh';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MAX_BODY = 3900; // au-delà, le relais transformerait le message en pièce jointe

const newCode = () => {
	const c = Array.from(crypto.randomBytes(6), b => ALPHABET[b % ALPHABET.length]).join('');
	return `${c.slice(0, 3)}-${c.slice(3)}`;
};
// Accepte « k7m 2qx », « K7M-2QX »… (sans O, I, L, 0 ni 1, qui se confondent).
const normalize = (code) => {
	const raw = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
	if (raw.length !== 6 || [...raw].some(ch => !ALPHABET.includes(ch))) return null;
	return `${raw.slice(0, 3)}-${raw.slice(3)}`;
};

const derive = (code, label, len) => crypto.createHmac('sha256', `smash-room:${code}`).update(label).digest().subarray(0, len);
const channel = code => ({ topic: `smashroom-${derive(code, 'topic', 12).toString('hex')}`, key: derive(code, 'key', 32) });

const seal = (key, obj) => {
	const iv = crypto.randomBytes(12);
	const c = crypto.createCipheriv('aes-256-gcm', key, iv);
	const data = Buffer.concat([c.update(zlib.deflateRawSync(Buffer.from(JSON.stringify(obj)))), c.final()]);
	return Buffer.concat([iv, data, c.getAuthTag()]).toString('base64url');
};
const unseal = (key, text) => {
	try {
		const b = Buffer.from(String(text), 'base64url');
		if (b.length < 29) return null;
		const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
		d.setAuthTag(b.subarray(b.length - 16));
		return JSON.parse(zlib.inflateRawSync(Buffer.concat([d.update(b.subarray(12, b.length - 16)), d.final()])).toString('utf8'));
	} catch { return null; }
};

const post = async (code, obj) => {
	const { topic, key } = channel(code);
	const body = seal(key, obj);
	if (body.length > MAX_BODY) throw new Error('Message trop long pour le relais.');
	const res = await net.fetch(`${RELAY}/${topic}`, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' }, signal: AbortSignal.timeout(15000) });
	if (!res.ok) throw new Error(res.status === 429 ? 'Le relais limite les envois pour l’instant : réessaie dans quelques minutes.' : `Le relais a répondu ${res.status}.`);
};

// Écoute d'un salon pour une fenêtre : chaque message déchiffré lui est envoyé (« room:msg »). Résout une fois
// l'écoute établie, pour que l'invité ne poste sa demande qu'après.
const subs = new Map(); // `${id webContents}|${code}` -> AbortController
const listen = (wc, code) => new Promise((resolve, reject) => {
	const id = `${wc.id}|${code}`;
	if (subs.has(id)) { resolve(); return; }
	const { topic, key } = channel(code);
	const ac = new AbortController();
	subs.set(id, ac);
	const seen = new Set();
	let since = Math.floor(Date.now() / 1000) - 2;
	let first = true;
	const run = async () => {
		while (!ac.signal.aborted && !wc.isDestroyed()) {
			try {
				const res = await net.fetch(`${RELAY}/${topic}/json?since=${since}`, { signal: ac.signal });
				if (!res.ok) throw new Error(`Relais : ${res.status}`);
				if (first) { first = false; resolve(); }
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
						let m;
						try { m = JSON.parse(line); } catch { continue; }
						if (m.event !== 'message' || seen.has(m.id)) continue;
						seen.add(m.id);
						since = Math.max(since, m.time || 0);
						const msg = unseal(key, m.message);
						if (msg && !wc.isDestroyed()) wc.send('room:msg', { code, msg });
					}
				}
			} catch (error) {
				if (ac.signal.aborted) return;
				if (first) { first = false; subs.delete(id); reject(new Error('Relais injoignable : vérifie ta connexion à Internet.')); return; }
			}
			await new Promise(r => setTimeout(r, 2000));
		}
	};
	run();
	wc.once('destroyed', () => stop(wc, code));
});
const stop = (wc, code) => {
	for (const [id, ac] of subs) if (id.startsWith(`${wc.id}|`) && (!code || id.endsWith(`|${code}`))) { ac.abort(); subs.delete(id); }
};

const HANDLERS = {
	'room:create': () => newCode(),
	'room:open': (e, code) => { const c = normalize(code); if (!c) throw new Error('Code de salon invalide : 6 lettres ou chiffres, par exemple K7M-2QX.'); return listen(e.sender, c).then(() => c); },
	'room:post': (e, code, obj) => { const c = normalize(code); if (!c || !obj || typeof obj !== 'object') throw new Error('Message invalide.'); return post(c, obj); },
	'room:close': (e, code) => stop(e.sender, normalize(code)),
	// Amis en ligne, pour les inviter en un clic (le code du salon part dans leur boîte aux lettres chiffrée).
	'room:friends': () => {
		const st = require('./friends').state();
		return st.on ? st.friends.filter(f => f.status !== 'offline').map(f => ({ code: f.code, name: f.name, status: f.status, game: f.game ? f.game.n : null })) : null;
	},
	'room:inviteFriend': (e, friendCode, code, game) => {
		const c = normalize(code);
		if (!c) throw new Error('Code de salon invalide.');
		return require('./friends').sendTo(friendCode, { t: 'play', room: c, game: String(game || '').slice(0, 60) });
	},
};

const registerIpc = () => {
	for (const [name, fn] of Object.entries(HANDLERS)) {
		ipcMain.handle(name, async (event, ...args) => {
			try { return { ok: true, value: await fn(event, ...args) }; } catch (error) { return { ok: false, error: error.message }; }
		});
	}
};

module.exports = { registerIpc, newCode, normalize, channel, seal, unseal, post, ALPHABET };
