// Centre de notifications : invitations à une course, demandes d'ami, pièces gagnées, mises à jour… Les 50
// dernières sont gardées dans Documents\Smash Emu\notifications.json et affichées dans le panneau latéral.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');

const FILE = path.join(store.ROOT, 'notifications.json');
const MAX = 50;
const KINDS = ['race', 'race-invite', 'friend', 'coins', 'update', 'info', 'achievement'];

let send = () => {};
const init = (fn) => { send = fn; };

const read = () => { try { const l = JSON.parse(fs.readFileSync(FILE, 'utf8')); return Array.isArray(l) ? l : []; } catch { return []; } };
const write = (list) => {
	fs.mkdirSync(path.dirname(FILE), { recursive: true });
	fs.writeFileSync(FILE, JSON.stringify(list.slice(0, MAX)));
};

const state = () => { const items = read(); return { items, unread: items.filter(n => !n.read).length }; };

// n : { kind, title, text, race? } ; renvoie la notification créée.
const push = (n) => {
	const item = {
		id: crypto.randomBytes(6).toString('hex'),
		at: Date.now(),
		kind: KINDS.includes(n.kind) ? n.kind : 'info',
		title: String(n.title || '').slice(0, 100),
		text: String(n.text || '').slice(0, 200),
		...(n.race ? { race: String(n.race).slice(0, 32) } : {}),
		read: false,
	};
	write([item, ...read()]);
	send('notify:new', item);
	send('notify:update', state());
	return item;
};

const markRead = (id) => {
	write(read().map(n => (!id || n.id === id ? { ...n, read: true } : n)));
	send('notify:update', state());
	return state();
};
const clear = () => { write([]); send('notify:update', state()); return state(); };

module.exports = { init, push, state, markRead, clear, FILE };
