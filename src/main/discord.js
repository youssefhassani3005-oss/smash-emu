// Présence Discord (Rich Presence) : « Joue à Smash Emu » avec le jeu en cours, sa console, sa jaquette et
// le temps de jeu, dans le profil Discord. Connexion locale au client Discord ouvert sur le PC (tube nommé
// discord-ipc-N, protocole RPC officiel), sans module externe ni serveur.
// Il faut l'identifiant d'une application Discord (Application ID, créée sur discord.com/developers) : le nom
// de cette application est celui affiché après « Joue à ».
const net = require('net');
const path = require('path');
const crypto = require('crypto');

const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };
const RETRY_MS = 15000;
const ID_RE = /^\d{17,21}$/;

const pipePath = i => (process.platform === 'win32'
	? `\\\\?\\pipe\\discord-ipc-${i}`
	: path.join(process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || '/tmp', `discord-ipc-${i}`));

let sock = null;
let enabled = false;
let clientId = '';
let wanted = null;
let retry = null;
let state = { status: 'off', error: '', user: '' };
let onChange = () => {};

const setState = (patch) => { state = { ...state, ...patch }; try { onChange(state); } catch { /* fenêtre fermée */ } };

const encode = (op, data) => {
	const json = Buffer.from(JSON.stringify(data), 'utf8');
	const head = Buffer.alloc(8);
	head.writeInt32LE(op, 0);
	head.writeInt32LE(json.length, 4);
	return Buffer.concat([head, json]);
};

// Discord écoute sur le premier tube libre entre discord-ipc-0 et discord-ipc-9.
const openPipe = (i = 0) => new Promise((resolve, reject) => {
	if (i > 9) { reject(new Error('Discord n’est pas ouvert sur ce PC.')); return; }
	const s = net.createConnection(pipePath(i));
	s.once('connect', () => resolve(s));
	s.once('error', () => { s.destroy(); openPipe(i + 1).then(resolve, reject); });
});

const schedule = () => {
	clearTimeout(retry);
	retry = null;
	// Identifiant refusé par Discord : on attend que l'utilisateur le corrige.
	if (enabled && clientId && state.status !== 'invalid') retry = setTimeout(connect, RETRY_MS);
};

const push = () => {
	if (!sock || state.status !== 'connected') return;
	sock.write(encode(OP.FRAME, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: wanted || undefined }, nonce: crypto.randomUUID() }));
};

const handle = (op, msg) => {
	if (op === OP.PING) { if (sock) sock.write(encode(OP.PONG, msg || {})); return; }
	if (op === OP.CLOSE) {
		const invalid = msg && (msg.code === 4000 || /client id/i.test(msg.message || ''));
		setState({ status: invalid ? 'invalid' : 'error', error: invalid ? 'Discord refuse cet Application ID : vérifie-le.' : ((msg && msg.message) || 'Connexion fermée par Discord.') });
		if (sock) sock.destroy();
		return;
	}
	if (op !== OP.FRAME || !msg) return;
	if (msg.cmd === 'DISPATCH' && msg.evt === 'READY') {
		const u = msg.data && msg.data.user;
		setState({ status: 'connected', error: '', user: u ? (u.global_name || u.username || '') : '' });
		push();
	} else if (msg.evt === 'ERROR') setState({ error: (msg.data && msg.data.message) || 'Erreur Discord.' });
};

async function connect() {
	clearTimeout(retry);
	if (!enabled || !clientId || sock) return;
	setState({ status: 'connecting', error: '' });
	let s;
	try { s = await openPipe(); } catch (error) { setState({ status: 'no-discord', error: error.message }); schedule(); return; }
	if (!enabled || sock) { s.destroy(); return; }
	sock = s;
	let buf = Buffer.alloc(0);
	s.on('data', (chunk) => {
		buf = Buffer.concat([buf, chunk]);
		while (buf.length >= 8) {
			const op = buf.readInt32LE(0);
			const len = buf.readInt32LE(4);
			if (buf.length < 8 + len) break;
			let msg = null;
			try { msg = JSON.parse(buf.subarray(8, 8 + len).toString('utf8')); } catch { /* trame illisible */ }
			buf = buf.subarray(8 + len);
			handle(op, msg);
		}
	});
	s.on('error', () => {});
	s.on('close', () => {
		if (sock !== s) return;
		sock = null;
		if (state.status === 'connected' || state.status === 'connecting') setState({ status: enabled ? 'no-discord' : 'off', error: enabled ? 'Discord a été fermé.' : '' });
		schedule();
	});
	s.write(encode(OP.HANDSHAKE, { v: 1, client_id: clientId }));
}

const disconnect = () => {
	clearTimeout(retry);
	retry = null;
	const s = sock;
	sock = null;
	if (s) s.destroy();
};

// Réglages : activé ou non, identifiant de l'application.
const configure = ({ on, appId }) => {
	const id = String(appId || '').trim();
	const nextEnabled = !!on && ID_RE.test(id);
	if (nextEnabled === enabled && id === clientId && (sock || retry)) return;
	disconnect();
	enabled = nextEnabled;
	clientId = id;
	if (!on) setState({ status: 'off', error: '', user: '' });
	else if (!ID_RE.test(id)) setState({ status: 'invalid', error: id ? 'Un Application ID est un nombre de 17 à 21 chiffres.' : 'Colle l’Application ID de ton application Discord.', user: '' });
	else connect();
};

// Activité affichée (null pour l'effacer). Les textes sont coupés aux limites de Discord.
const clip = (v, n = 128) => (v ? String(v).slice(0, n).padEnd(2, ' ') : undefined);
const setActivity = (a) => {
	wanted = a ? {
		...a,
		details: clip(a.details),
		state: clip(a.state),
		assets: a.assets ? Object.fromEntries(Object.entries(a.assets).filter(([, v]) => v).map(([k, v]) => [k, k.endsWith('_text') ? clip(v) : v])) : undefined,
		buttons: a.buttons ? a.buttons.slice(0, 2).map(b => ({ label: String(b.label).slice(0, 32), url: b.url })) : undefined,
	} : null;
	push();
};

const status = () => ({ ...state, activity: wanted });
const onState = (fn) => { onChange = fn; };

module.exports = { configure, setActivity, status, onState, encode, ID_RE };
