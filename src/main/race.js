// Course de speedrun entre amis : invitation sur le même jeu, les deux joueurs se disent prêts, compte à rebours,
// chacun chronomètre sur son PC (la durée ne dépend pas du décalage du relais) et envoie son temps à la fin.
// Le plus rapide gagne des pièces. Les messages passent par la boîte aux lettres chiffrée des amis.
// Mise facultative : celui qui défie la choisit, chacun la met de côté en s'engageant (défi envoyé, défi accepté) ;
// le gagnant remporte les deux mises, une égalité ou une course annulée rend la sienne à chacun.
const crypto = require('crypto');
const store = require('./store');
const coins = require('./coins');

const INVITE_TTL = 15 * 60000;
const COUNTDOWN = 4000;

const races = new Map(); // id -> course
let hooks = { send: () => {}, sendTo: async () => {}, notify: () => {}, windows: () => {} };
// Les invitations sans réponse expirent même si personne n'ouvre la liste (la mise revient au bout de 15 min).
const init = (h) => {
	hooks = { ...hooks, ...h };
	setInterval(() => {
		const before = [...races.values()].filter(r => r.state === 'invited' || r.state === 'invite').length;
		sweep();
		const after = [...races.values()].filter(r => r.state === 'invited' || r.state === 'invite').length;
		if (after !== before) hooks.send('race:update', list());
	}, 60000).unref?.();
};

const words = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Jeu de l'ami retrouvé dans la bibliothèque : même console et même nom (sans accents ni ponctuation).
const matchGame = (game) => {
	const sys = i => (i.type === 'coopdx' ? 'n64' : (i.rom && i.rom.system) || i.system || 'n64');
	const list = store.listInstances();
	return list.find(i => words(i.name) === words(game.n) && (!game.s || sys(i) === game.s))
		|| list.find(i => words(i.name) === words(game.n)) || null;
};

const view = r => ({ id: r.id, role: r.role, friend: r.friend, game: r.game, instanceId: r.instanceId, state: r.state, goAt: r.goAt || null, me: r.me, them: r.them, winner: r.winner || null, at: r.at, bet: r.bet || 0 });
const betOf = v => Math.max(0, Math.min(coins.MAX_BET, Math.floor(Number(v) || 0)));
// Rend la mise mise de côté pour cette course (annulation, refus, invitation expirée).
const refund = (r, why) => { if (r.bet) coins.settle(r.id, r.bet, `${why} : mise rendue`); };
// Invitation restée sans réponse : elle expire et la mise revient.
const sweep = () => {
	for (const r of races.values()) {
		if (['invited', 'invite'].includes(r.state) && Date.now() - r.at > INVITE_TTL) { r.state = 'expired'; refund(r, 'Défi sans réponse'); }
	}
};
const list = () => { sweep(); return [...races.values()].filter(r => Date.now() - r.at < 6 * 3600000).map(view); };
const changed = (r) => {
	hooks.send('race:update', list());
	hooks.windows(r.instanceId, view(r));
};
const msg = (r, op, extra = {}) => hooks.sendTo(r.friend.code, { t: 'race', op, id: r.id, ...extra }).catch(() => {});
const blank = () => ({ ready: false, ms: null, forfeit: false });

const get = (id) => {
	const r = races.get(id);
	if (!r) throw new Error('Course introuvable.');
	return r;
};
const forInstance = id => [...races.values()].filter(r => r.instanceId === id && ['accepted', 'countdown', 'running'].includes(r.state)).sort((a, b) => b.at - a.at)[0] || null;

const invite = async (friend, instanceId, bet = 0) => {
	const inst = store.getInstance(instanceId);
	if (!inst) throw new Error('Jeu introuvable.');
	const sys = inst.type === 'coopdx' ? 'n64' : (inst.rom && inst.rom.system) || inst.system || 'n64';
	const r = { id: crypto.randomBytes(8).toString('hex'), role: 'host', friend, game: { n: String(inst.name).slice(0, 60), s: sys }, instanceId, state: 'invited', me: blank(), them: blank(), at: Date.now(), bet: betOf(bet) };
	// Pas assez de pièces : erreur avant tout envoi.
	if (r.bet) coins.stake(r.id, r.bet, `Mise : course contre ${friend.name}`);
	races.set(r.id, r);
	await msg(r, 'invite', { game: r.game, bet: r.bet });
	changed(r);
	return view(r);
};

const accept = async (id, instanceId) => {
	const r = get(id);
	sweep();
	if (r.role !== 'guest' || r.state !== 'invite') throw new Error('Cette invitation n’est plus valable.');
	const inst = store.getInstance(instanceId || r.instanceId);
	if (!inst) throw new Error('Choisis ton exemplaire de ce jeu dans ta bibliothèque.');
	if (r.bet) coins.stake(r.id, r.bet, `Mise : course contre ${r.friend.name}`);
	r.instanceId = inst.id;
	r.state = 'accepted';
	await msg(r, 'accept');
	changed(r);
	return view(r);
};

const decline = async (id) => {
	const r = get(id);
	r.state = 'declined';
	await msg(r, 'decline');
	changed(r);
	return view(r);
};

const cancel = async (id) => {
	const r = get(id);
	if (['done', 'declined', 'cancelled', 'expired'].includes(r.state)) return view(r);
	r.state = 'cancelled';
	refund(r, 'Course annulée');
	await msg(r, 'cancel');
	changed(r);
	return view(r);
};

const startCountdown = (r) => {
	if (r.state !== 'accepted' || !r.me.ready || !r.them.ready) return;
	r.state = 'countdown';
	r.goAt = Date.now() + COUNTDOWN;
	setTimeout(() => { if (r.state === 'countdown') { r.state = 'running'; changed(r); } }, COUNTDOWN);
};

// Le joueur est prêt dans la fenêtre du jeu (Ctrl+Espace).
const ready = async (instanceId) => {
	const r = forInstance(instanceId);
	if (!r || r.state !== 'accepted') return null;
	r.me.ready = true;
	await msg(r, 'ready');
	startCountdown(r);
	changed(r);
	return view(r);
};

// Fin de la course pour ce joueur : temps réalisé, ou abandon.
const finish = async (instanceId, ms) => {
	const r = forInstance(instanceId);
	if (!r || r.state !== 'running' || r.me.ms !== null || r.me.forfeit) return null;
	r.me.ms = Math.max(0, Math.round(Number(ms) || 0));
	await msg(r, 'finish', { ms: r.me.ms });
	resolve(r);
	changed(r);
	return view(r);
};
const forfeit = async (instanceId) => {
	const r = forInstance(instanceId);
	if (!r || !['accepted', 'countdown', 'running'].includes(r.state)) return null;
	r.me.forfeit = true;
	await msg(r, 'forfeit');
	resolve(r);
	changed(r);
	return view(r);
};

// Résultat : un abandon fait perdre tout de suite ; sinon on attend les deux temps (le second à finir peut avoir
// été plus rapide s'il est parti un peu plus tard). Chaque PC calcule le même résultat et ses propres pièces.
const resolve = (r) => {
	if (r.state === 'done') return;
	const done = p => p.forfeit || p.ms !== null;
	let winner = null;
	// Abandon avant le départ : course sans gagnant (chacun récupère sa mise).
	if (r.me.forfeit && r.them.forfeit) winner = 'none';
	else if (r.me.forfeit) winner = r.state === 'running' || r.them.ms !== null ? 'them' : 'none';
	else if (r.them.forfeit) winner = r.me.ms !== null || r.state === 'running' ? 'me' : 'none';
	else if (done(r.me) && done(r.them)) winner = r.me.ms < r.them.ms ? 'me' : r.me.ms > r.them.ms ? 'them' : 'tie';
	if (!winner) return;
	r.state = 'done';
	r.winner = winner;
	const fmt = ms => `${Math.floor(ms / 60000)} min ${String(Math.floor(ms / 1000) % 60).padStart(2, '0')} s`;
	if (winner === 'me') coins.earn(coins.REWARDS.raceWin, `Victoire contre ${r.friend.name} (${r.game.n})`);
	else if (r.me.ms !== null) coins.earn(coins.REWARDS.raceFinish, `Course terminée contre ${r.friend.name}`);
	// Mise : le gagnant prend les deux, égalité ou course sans gagnant rend la sienne, le perdant la laisse.
	if (r.bet) {
		if (winner === 'me') coins.settle(r.id, r.bet * 2, `Mise gagnée contre ${r.friend.name}`);
		else if (winner === 'them') coins.settle(r.id, 0, '');
		else refund(r, winner === 'tie' ? 'Égalité' : 'Course sans gagnant');
	}
	const betText = !r.bet ? '' : winner === 'me' ? ` · +${r.bet * 2} pièces de mise` : winner === 'them' ? ` · mise de ${r.bet} pièces perdue` : ' · mise rendue';
	hooks.notify({
		kind: 'race',
		title: winner === 'me' ? 'Course gagnée !' : winner === 'them' ? 'Course perdue' : winner === 'tie' ? 'Égalité !' : 'Course annulée',
		text: `${r.game.n} contre ${r.friend.name}${r.me.ms !== null ? ` · toi ${fmt(r.me.ms)}` : ''}${r.them.ms !== null ? ` · ${r.friend.name} ${fmt(r.them.ms)}` : ''}${betText}`,
	});
};

// Message reçu d'un ami (déjà déchiffré et vérifié par le module des amis).
const onMessage = (m, friend) => {
	if (!m || typeof m.id !== 'string' || !/^[0-9a-f]{16}$/.test(m.id)) return;
	if (m.op === 'invite') {
		if (races.has(m.id) || !m.game || Date.now() - (m.at || 0) > INVITE_TTL) return;
		const game = { n: String(m.game.n || '').slice(0, 60), s: String(m.game.s || '').slice(0, 20) };
		const local = matchGame(game);
		const r = { id: m.id, role: 'guest', friend, game, instanceId: local ? local.id : null, state: 'invite', me: blank(), them: blank(), at: Date.now(), bet: betOf(m.bet) };
		races.set(r.id, r);
		hooks.notify({ kind: 'race-invite', title: `${friend.name} te défie !`, text: `Course de speedrun sur ${game.n}${r.bet ? ` · mise : ${r.bet} pièces chacun, le gagnant prend ${r.bet * 2}` : ''}${local ? '' : ' (jeu introuvable dans ta bibliothèque)'}`, race: r.id });
		changed(r);
		return;
	}
	const r = races.get(m.id);
	if (!r || r.friend.code !== friend.code) return;
	// Acceptation arrivée trop tard (défi expiré ou annulé ici) : l'ami doit récupérer sa mise.
	if (m.op === 'accept' && r.role === 'host' && ['expired', 'cancelled'].includes(r.state)) msg(r, 'cancel');
	if (m.op === 'accept' && r.role === 'host' && r.state === 'invited') {
		r.state = 'accepted';
		hooks.notify({ kind: 'race', title: `${friend.name} accepte la course`, text: `${r.game.n} : lance le jeu et appuie sur Ctrl+Espace quand tu es prêt.` });
	}
	if (m.op === 'decline' && r.state === 'invited') { r.state = 'declined'; refund(r, 'Défi refusé'); hooks.notify({ kind: 'race', title: `${friend.name} refuse la course`, text: `${r.game.n}${r.bet ? ' · mise rendue' : ''}` }); }
	if (m.op === 'cancel' && !['done', 'cancelled', 'expired', 'declined'].includes(r.state)) { r.state = 'cancelled'; refund(r, 'Course annulée'); }
	if (m.op === 'ready' && r.state === 'accepted') { r.them.ready = true; startCountdown(r); }
	if (m.op === 'finish' && r.them.ms === null) { r.them.ms = Math.max(0, Math.round(Number(m.ms) || 0)); resolve(r); }
	if (m.op === 'forfeit') { r.them.forfeit = true; resolve(r); }
	changed(r);
};

module.exports = { init, invite, accept, decline, cancel, ready, finish, forfeit, onMessage, list, forInstance, view, matchGame, resolve, races };
