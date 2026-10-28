/* global state, api, icon, esc, toast, toastError, setMain, PAGES, TITLES, ACTIONS, modal, sortInstances, sysInfo, chSys, chArt, ago, launchInstance, renderTopbar, isRunning, $ */
// Pièces Smash et Boutique (accueils, mascotte, cadres, effets, sons, titres), centre de notifications (panneau
// latéral) et courses de speedrun entre amis (défi, invitation, lancement du jeu).

const SHOP = { st: null, kind: 'faith', notif: { items: [], unread: 0 }, races: [], launched: new Set() };
TITLES.shop = () => [{ label: 'Boutique' }];

const loadCoins = async () => { try { SHOP.st = await api('coins:state'); } catch { /* pas encore prêt */ } applyEquipped(); };
const coinsBalance = () => (SHOP.st ? SHOP.st.balance : 0);
const owned = id => !!(SHOP.st && SHOP.st.owned.includes(id));
const equippedId = kind => (SHOP.st && SHOP.st.equipped[kind]) || null;
const itemOf = id => (SHOP.st ? SHOP.st.catalog.find(i => i.id === id) : null);

// Articles équipés appliqués à l'interface : effet de sélection, cadre, sons, titre (classes et variables).
const applyEquipped = () => {
	const root = document.documentElement;
	root.dataset.selectFx = (equippedId('select') || '').replace('select-', '');
	root.dataset.frame = (equippedId('frame') || '').replace('frame-', '');
	root.dataset.soundPack = (equippedId('sound') || '').replace('sound-', '');
	const title = itemOf(equippedId('title'));
	root.dataset.playerTitle = title ? title.text : '';
};

// ---------- Pastille de pièces et cloche (barre du haut) ----------

const coinPill = () => `<button class="ct-coins" data-action="nav" data-to="shop" data-tip="Pièces Smash : Boutique" data-tip-pos="bottom">${icon('circle-dollar-sign')}<b>${coinsBalance()}</b></button>`;
const notifBell = () => `<button class="ct-round" data-action="notif-open" data-tip="Notifications" data-tip-pos="bottom">${icon('bell')}${SHOP.notif.unread ? `<b class="ct-badge">${SHOP.notif.unread}</b>` : ''}</button>`;
const refreshTopbar = () => { if (typeof renderTopbar === 'function') renderTopbar(); };
// Titre acheté, affiché à côté de l'initiale du joueur.
const playerTitle = () => { const t = itemOf(equippedId('title')); return t ? `<span class="ct-ptitle">${esc(t.text)}</span>` : ''; };

// ---------- Boutique ----------

const shopCard = (it) => {
	const has = owned(it.id);
	const on = equippedId(it.kind) === it.id;
	const short = coinsBalance() < it.price;
	return `<div class="shop-card ${on ? 'on' : ''}">
		<div class="shop-look" style="background:${esc(it.look)}">${it.kind === 'title' ? `<span class="shop-title-tag">${esc(it.text)}</span>` : ''}${on ? `<span class="shop-on">${icon('check')}Équipé</span>` : ''}</div>
		<b>${esc(it.name)}</b>
		<small>${esc(it.desc)}</small>
		<div class="shop-foot">
			${has
		? (on ? `<button class="btn sm" data-action="shop-equip" data-kind="${it.kind}" data-id="">Retirer</button>` : `<button class="btn sm primary" data-action="shop-equip" data-kind="${it.kind}" data-id="${esc(it.id)}">Équiper</button>`)
		: `<span class="shop-price">${icon('circle-dollar-sign')}${it.price}</span><button class="btn sm ${short ? '' : 'primary'}" data-action="shop-buy" data-id="${esc(it.id)}" ${short ? 'disabled' : ''}>${short ? `Encore ${it.price - coinsBalance()}` : 'Acheter'}</button>`}
		</div>
	</div>`;
};

const shopHtml = () => {
	const s = SHOP.st;
	if (!s) return '<div class="loading"><div class="spinner"></div>Chargement…</div>';
	const kinds = Object.entries(s.kinds);
	const items = s.catalog.filter(i => i.kind === SHOP.kind);
	return `<div class="shop">
		<div class="shop-wallet">
			<div class="shop-coin">${icon('circle-dollar-sign')}</div>
			<div class="grow"><div class="shop-bal">${s.balance} <span>pièces</span></div>
				<div class="small muted">Gagne des pièces en battant tes amis en course de speedrun (+${s.rewards.raceWin}, +${s.rewards.raceFinish} si tu finis) et en battant tes records (+${s.rewards.personalBest}).</div></div>
			<button class="btn" data-action="nav" data-to="friends">${icon('timer')}Défier un ami</button>
		</div>
		<div class="shop-tabs">${kinds.map(([k, l]) => `<button class="chip ${SHOP.kind === k ? 'on' : ''}" data-action="shop-kind" data-kind="${k}">${esc(l)}</button>`).join('')}</div>
		<div class="shop-grid">${items.map(shopCard).join('')}</div>
		${s.history.length ? `<div class="fr-label" style="margin-top:22px">Derniers mouvements</div><div class="shop-hist">${s.history.slice(0, 12).map(h => `<div><span>${esc(h.reason)}</span><small>${esc(ago(h.at))}</small><b class="${h.amount > 0 ? 'plus' : 'minus'}">${h.amount > 0 ? '+' : ''}${h.amount}</b></div>`).join('')}</div>` : ''}
	</div>`;
};

PAGES.shop = () => {
	setMain(shopHtml());
	if (!SHOP.st) loadCoins().then(() => { if (state.route.name === 'shop') setMain(shopHtml()); });
};

ACTIONS['shop-kind'] = (el) => { SHOP.kind = el.dataset.kind; setMain(shopHtml()); };
ACTIONS['shop-buy'] = async (el) => {
	const it = itemOf(el.dataset.id);
	try {
		SHOP.st = await api('coins:buy', el.dataset.id);
		applyEquipped();
		toast(`${esc(it ? it.name : 'Article')} acheté et équipé !`);
		if (it && ['home', 'theme', 'skin', 'faith'].includes(it.kind)) { state.settings = await api('settings:get'); applyTheme(state.settings.theme); }
	} catch (e) { toastError(e); }
	if (state.route.name === 'shop') setMain(shopHtml());
	refreshTopbar();
};
ACTIONS['shop-equip'] = async (el) => {
	try {
		SHOP.st = await api('coins:equip', el.dataset.kind, el.dataset.id || null);
		applyEquipped();
		if (['home', 'theme', 'skin', 'faith'].includes(el.dataset.kind)) { state.settings = await api('settings:get'); applyTheme(state.settings.theme); }
	} catch (e) { toastError(e); }
	if (state.route.name === 'shop') setMain(shopHtml());
};

window.launcher.on('coins:update', (s) => { SHOP.st = s; applyEquipped(); refreshTopbar(); if (state.route.name === 'shop') setMain(shopHtml()); });
window.launcher.on('coins:earned', (e) => toast(`<b>+${e.amount} pièces</b> · ${esc(e.reason)}`, { type: 'success', timeout: 6000 }));

// ---------- Centre de notifications ----------

const NOTIF_ICON = { race: 'timer', 'race-invite': 'timer', friend: 'user-plus', coins: 'circle-dollar-sign', update: 'download', info: 'info', achievement: 'medal' };
const notifItem = n => `<div class="nt-item ${n.read ? '' : 'unread'}" data-id="${esc(n.id)}">
	<span class="nt-ic k-${esc(n.kind)}">${icon(NOTIF_ICON[n.kind] || 'info')}</span>
	<div class="grow"><b>${esc(n.title)}</b>${n.text ? `<span>${esc(n.text)}</span>` : ''}
		${n.kind === 'race-invite' && raceOpen(n.race) ? `<div class="nt-acts"><button class="btn sm primary" data-action="race-accept" data-id="${esc(n.race)}">Accepter</button><button class="btn sm" data-action="race-decline" data-id="${esc(n.race)}">Refuser</button></div>` : ''}</div>
	<small>${esc(shortAgo(n.at))}</small>
</div>`;
const shortAgo = (t) => {
	const m = Math.round((Date.now() - t) / 60000);
	return m < 1 ? 'maint.' : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : m < 10080 ? `${Math.round(m / 1440)} j` : `${Math.round(m / 10080)} sem`;
};

const renderNotifPanel = () => {
	const p = $('#nt-panel');
	if (!p) return;
	const items = SHOP.notif.items;
	p.innerHTML = `<div class="nt-head"><b>Notifications</b><button class="icon-btn" data-action="notif-clear" data-tip="Tout effacer" data-tip-pos="bottom">${icon('trash-2')}</button><button class="icon-btn" data-action="notif-close">${icon('x')}</button></div>
		<div class="nt-list">${items.length ? items.map(notifItem).join('') : `<div class="nt-empty">${icon('bell')}<span>Rien de neuf pour l’instant.</span></div>`}</div>`;
};

ACTIONS['notif-open'] = async () => {
	let layer = $('#nt-layer');
	if (layer) { ACTIONS['notif-close'](); return; }
	layer = document.createElement('div');
	layer.id = 'nt-layer';
	layer.innerHTML = '<div class="nt-panel" id="nt-panel"></div>';
	layer.addEventListener('mousedown', (e) => { if (e.target === layer) ACTIONS['notif-close'](); });
	document.body.appendChild(layer);
	try { SHOP.races = await api('race:list'); } catch { /* pas de course */ }
	renderNotifPanel();
	requestAnimationFrame(() => layer.classList.add('open'));
	// Ouvrir le panneau marque tout comme lu (le surlignage reste jusqu'à la fermeture).
	if (SHOP.notif.unread) api('notifications:read', null).catch(() => {});
};
ACTIONS['notif-close'] = () => {
	const layer = $('#nt-layer');
	if (!layer) return;
	layer.classList.remove('open');
	setTimeout(() => layer.remove(), 250);
	SHOP.notif.items = SHOP.notif.items.map(n => ({ ...n, read: true }));
};
ACTIONS['notif-clear'] = async () => { try { SHOP.notif = await api('notifications:clear'); } catch (e) { toastError(e); } renderNotifPanel(); refreshTopbar(); };

window.launcher.on('notify:update', (s) => {
	const keep = $('#nt-layer') ? SHOP.notif.items : null;
	SHOP.notif = { ...s, items: keep ? s.items.map(n => ({ ...n, read: (keep.find(k => k.id === n.id) || n).read })) : s.items };
	renderNotifPanel();
	refreshTopbar();
});
// Nouvelle notification : bulle à l'écran (avec Accepter / Refuser pour une invitation à une course).
window.launcher.on('notify:new', (n) => {
	if (n.kind === 'coins') return; // déjà annoncé par « coins:earned »
	const actions = n.kind === 'race-invite' && n.race
		? [{ label: 'Accepter', run: () => ACTIONS['race-accept']({ dataset: { id: n.race } }) }, { label: 'Refuser', run: () => ACTIONS['race-decline']({ dataset: { id: n.race } }) }]
		: [];
	toast(`<b>${esc(n.title)}</b>${n.text ? `<br>${esc(n.text)}` : ''}`, { type: 'info', actions, timeout: n.kind === 'race-invite' ? 30000 : 6000 });
});

// ---------- Courses de speedrun ----------

const raceOpen = id => SHOP.races.some(r => r.id === id && r.state === 'invite');
const raceGames = () => sortInstances(state.instances.filter(i => i.type === 'rom' || i.type === 'coopdx'), 'played');
const pickGame = (title, hint, preferSystem) => modal({
	title,
	width: 560,
	body: `<div class="small muted" style="margin-bottom:10px">${hint}</div>
		<div class="race-pick">${raceGames().filter(i => !preferSystem || chSys(i) === preferSystem).concat(preferSystem ? raceGames().filter(i => chSys(i) !== preferSystem) : []).map(i => `<button class="race-game" data-id="${esc(i.id)}"><span class="md-game-art">${chArt(i)}</span><span class="grow"><b>${esc(i.name)}</b><small>${esc(i.type === 'coopdx' ? 'SM64 Coop DX' : sysInfo(chSys(i)).label)}</small></span></button>`).join('') || '<div class="small muted">Aucun jeu dans ta bibliothèque.</div>'}</div>`,
	setup: (el, close) => el.addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) close(b.dataset.id); }),
});

// Mise de la course : chacun met la même somme, le gagnant prend tout. 0 = course sans mise.
const BETS = [0, 25, 50, 100, 250, 500, 1000];
const pickBet = name => modal({
	title: `Mise contre ${name}`,
	width: 460,
	body: `<div class="small muted" style="margin-bottom:10px">Chacun met la même somme de côté. Le gagnant remporte les deux mises en plus de la récompense de victoire ; égalité, refus ou course annulée : chacun récupère la sienne. Tu as <b>${coinsBalance()} pièces</b>.</div>
		<div class="chips">${BETS.map(b => `<button class="chip" data-bet="${b}" ${b > coinsBalance() ? 'disabled data-tip="Pas assez de pièces"' : ''}>${b ? `${b} pièces` : 'Sans mise'}</button>`).join('')}</div>`,
	setup: (el, close) => el.addEventListener('click', (e) => { const b = e.target.closest('[data-bet]'); if (b && !b.disabled) close(Number(b.dataset.bet)); }),
});

ACTIONS['race-challenge'] = async (el) => {
	const id = await pickGame(`Défier ${el.dataset.name}`, 'Choisis le jeu de la course : ton ami doit l’avoir aussi. Chacun lance son chrono au même moment, le plus rapide gagne des pièces.');
	if (!id) return;
	if (!SHOP.st) await loadCoins();
	const bet = await pickBet(el.dataset.name);
	if (bet == null) return;
	try {
		await api('race:invite', el.dataset.code, id, bet);
		toast(`Défi envoyé à ${esc(el.dataset.name)}${bet ? ` (mise : ${bet} pièces, mises de côté)` : ''} : le jeu se lancera quand il acceptera.`, { type: 'info' });
	} catch (e) { toastError(e); }
};
ACTIONS['race-accept'] = async (el) => {
	try {
		SHOP.races = await api('race:list');
		const r = SHOP.races.find(x => x.id === el.dataset.id);
		if (!r || r.state !== 'invite') throw new Error('Cette invitation n’est plus valable.');
		if (r.bet) {
			if (!SHOP.st) await loadCoins();
			if (coinsBalance() < r.bet) throw new Error(`Cette course a une mise de ${r.bet} pièces : il t’en manque ${r.bet - coinsBalance()}.`);
			if (!confirm(`Accepter la mise de ${r.bet} pièces ? Le gagnant prend ${r.bet * 2} pièces.`)) return;
		}
		let inst = r.instanceId;
		if (!inst) inst = await pickGame(`Course sur ${r.game.n}`, `Ce jeu n’a pas été trouvé tel quel dans ta bibliothèque : choisis ton exemplaire de « ${esc(r.game.n)} ».`, r.game.s);
		if (!inst) return;
		await api('race:accept', r.id, inst);
		SHOP.launched.add(r.id);
		launchInstance(inst);
		toast('Course acceptée : quand le jeu est prêt, appuie sur <b>Ctrl+Espace</b>.', { type: 'info', timeout: 9000 });
	} catch (e) { toastError(e); }
	renderNotifPanel();
};
ACTIONS['race-decline'] = async (el) => { try { await api('race:decline', el.dataset.id); } catch (e) { toastError(e); } renderNotifPanel(); };
ACTIONS['race-cancel'] = async (el) => {
	try {
		const r = await api('race:cancel', el.dataset.id);
		toast(r.bet ? `Défi annulé : ta mise de ${r.bet} pièces est rendue.` : 'Défi annulé.', { type: 'info' });
	} catch (e) { toastError(e); }
};

// L'ami a accepté : le jeu se lance aussi chez celui qui a défié.
window.launcher.on('race:update', (list) => {
	SHOP.races = list;
	for (const r of list) {
		if (r.role === 'host' && r.state === 'accepted' && !SHOP.launched.has(r.id)) {
			SHOP.launched.add(r.id);
			if (!(typeof isRunning === 'function' && isRunning(r.instanceId))) launchInstance(r.instanceId);
		}
	}
	renderNotifPanel();
	// Page Amis : bouton « Défier » ou « Annuler le défi ».
	if (state.route.name === 'friends' && typeof frRender === 'function') frRender();
});
api('race:list').then((l) => { SHOP.races = l; }).catch(() => {});

// ---------- Démarrage ----------

loadCoins().then(refreshTopbar);
api('notifications:state').then((s) => { SHOP.notif = s; refreshTopbar(); }).catch(() => {});
