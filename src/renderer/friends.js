/* global state, api, icon, esc, toast, toastError, setMain, PAGES, TITLES, ACTIONS, ago, colorFor, menu, confirmModal, renderNav, $, SHOP */
// Page « Amis » : code ami, demandes reçues, liste des amis avec leur statut en direct (en ligne, en jeu, absent,
// hors ligne) et leurs statistiques. Rien n'est partagé tant que le joueur n'a pas activé la fonction.

const FR = { st: null };
const FR_ORDER = { playing: 0, online: 1, away: 2, offline: 3, unknown: 4 };
const frHours = m => (m >= 60 ? `${(m / 60).toFixed(m >= 600 ? 0 : 1).replace('.', ',')} h` : `${m} min`);
const frSince = t => frHours(Math.max(1, Math.round((Date.now() - t) / 60000)));

TITLES.friends = () => [{ label: 'Amis' }];

const frStatus = (f) => {
	if (f.status === 'playing') return `<span class="fr-st playing">En jeu</span>`;
	if (f.status === 'online') return '<span class="fr-st online">En ligne</span>';
	if (f.status === 'away') return '<span class="fr-st away">Absent</span>';
	if (f.status === 'offline') return `<span class="fr-st">${f.seen ? `Vu ${ago(f.seen)}` : 'Hors ligne'}</span>`;
	return '<span class="fr-st">En attente</span>';
};

const frCard = (f) => {
	const s = f.stats;
	const top = s && s.top ? s.top : [];
	const max = Math.max(1, ...top.map(x => x[2]));
	const letter = esc(String(f.name || '?').trim()[0] || '?').toUpperCase();
	// Défi déjà envoyé et sans réponse : on peut l'annuler (la mise revient).
	const sent = typeof SHOP !== 'undefined' ? SHOP.races.find(r => r.role === 'host' && r.state === 'invited' && r.friend.code === f.code) : null;
	return `<div class="fr-card ${f.status}">
		<div class="fr-head">
			<div class="fr-av" style="--c:${colorFor(f.code)}">${letter}<i class="fr-dot ${f.status}"></i></div>
			<div class="grow"><b class="fr-name">${esc(f.name)}</b>${f.title ? `<span class="fr-title">${esc(f.title)}</span>` : ''}${frStatus(f)}</div>
			${sent ? `<button class="btn sm" data-action="race-cancel" data-id="${esc(sent.id)}" data-tip="${sent.bet ? `Ta mise de ${sent.bet} pièces revient` : 'Le défi n’attend plus de réponse'}">${icon('x')}Annuler le défi${sent.bet ? ` (${sent.bet})` : ''}</button>`
		: `<button class="btn sm primary" data-action="race-challenge" data-code="${esc(f.code)}" data-name="${esc(f.name)}" data-tip="Course de speedrun sur un même jeu : le plus rapide gagne des pièces, avec une mise si tu veux">${icon('timer')}Défier</button>`}
			<button class="icon-btn" data-action="fr-menu" data-code="${esc(f.code)}" data-tip="Options">${icon('ellipsis-vertical')}</button>
		</div>
		${f.status === 'playing' && f.game ? `<div class="fr-now">${icon('gamepad-2')}<div><b>${esc(f.game.n)}</b><small>${esc(f.game.s)} · depuis ${frSince(f.game.t)}</small></div></div>` : ''}
		${s ? `<div class="fr-kpis">
			<div><b>${frHours(s.m)}</b><span>au total</span></div>
			<div><b>${frHours(s.w)}</b><span>cette semaine</span></div>
			<div><b>${s.j}</b><span>jeu${s.j > 1 ? 'x' : ''} joué${s.j > 1 ? 's' : ''}</span></div>
			<div><b>${s.tr}</b><span>trophée${s.tr > 1 ? 's' : ''}</span></div>
		</div>
		${top.length ? `<div class="fr-top">${top.map(([n, sys, m]) => `<div class="fr-bar" data-tip="${esc(sys)}"><span>${esc(n)}</span><i><em style="width:${Math.max(4, Math.round((m / max) * 100))}%"></em></i><b>${frHours(m)}</b></div>`).join('')}</div>` : ''}
		${s.rec && s.rec.length ? `<div class="small muted fr-rec">${icon('history', 'sm')}${s.rec.slice(0, 3).map(([n, , at]) => `${esc(n)} <span>(${ago(at)})</span>`).join(' · ')}</div>` : ''}`
		: `<div class="small muted fr-wait">${f.status === 'unknown' ? 'Pas encore de nouvelles : il doit activer les amis dans Smash Emu.' : 'Ses statistiques ne sont pas partagées.'}</div>`}
	</div>`;
};

const frOptIn = () => `<div class="fr-optin">
	<div class="fr-optin-art">${icon('users')}</div>
	<h1>Tes amis dans Smash Emu</h1>
	<p class="muted">Vois qui est en ligne, à quoi ils jouent et leurs statistiques. Sans compte ni inscription.</p>
	<div class="fr-optin-list">
		<div>${icon('key-round')}<span><b>Un code ami secret</b>à partager sur Discord, par SMS…</span></div>
		<div>${icon('radio')}<span><b>Statut en direct</b>en ligne, en jeu, absent</span></div>
		<div>${icon('chart-column')}<span><b>Statistiques</b>temps de jeu, jeux préférés, trophées</span></div>
	</div>
	<div class="small muted fr-privacy">${icon('lock', 'sm')}Une fois activé, ton pseudo, ton statut et (si tu le veux) tes statistiques sont envoyés <b>chiffrés</b> (AES-256) sur le relais public ntfy.sh. Seuls ceux qui ont ton code peuvent les lire. Tu peux tout couper à tout moment.</div>
	<button class="btn primary lg" data-action="fr-enable">${icon('user-plus')}Activer les amis</button>
</div>`;

const frRender = () => {
	const s = FR.st;
	if (!s) return;
	if (!s.on) { setMain(frOptIn()); return; }
	const list = [...s.friends].sort((a, b) => FR_ORDER[a.status] - FR_ORDER[b.status] || (b.seen || 0) - (a.seen || 0));
	const online = list.filter(f => ['playing', 'online', 'away'].includes(f.status)).length;
	const sw = (key, label, hint) => `<div class="row"><div class="grow"><div class="bold">${label}</div><div class="small muted">${hint}</div></div><button class="switch ${s[key] ? 'on' : ''}" data-action="fr-opt" data-key="${key}"></button></div>`;
	setMain(`
		<div class="dash-hero fr-hero">
			<div><div class="dash-hello">${icon('users')} ${online ? `${online} ami${online > 1 ? 's' : ''} en ligne` : 'Personne en ligne pour l’instant'}</div><h1>Amis</h1>
			<div class="muted">${list.length ? `${list.length} ami${list.length > 1 ? 's' : ''}` : 'Ajoute tes amis avec leur code'}</div></div>
			<span class="fr-conn ${s.connected ? 'on' : ''}" data-tip="Relais chiffré ${esc(s.relay)}">${icon(s.connected ? 'wifi' : 'wifi-off', 'sm')}${s.connected ? 'Connecté' : 'Connexion…'}</span>
		</div>
		<div class="fr-top-grid">
			<div class="card fr-me">
				<div class="fr-label">Ton code ami</div>
				<div class="fr-code" data-action="fr-copy" data-tip="Copier">${esc(s.code)}</div>
				<div class="row" style="gap:8px;flex-wrap:wrap">
					<button class="btn primary sm" data-action="fr-copy">${icon('copy')}Copier</button>
					<button class="btn sm" data-action="fr-regen" data-tip="Tes amis actuels ne te verront plus tant qu’ils n’ont pas le nouveau code">${icon('refresh-cw')}Nouveau code</button>
				</div>
				<div class="fr-label" style="margin-top:12px">Ton pseudo</div>
				<input class="input" data-input="player-name" value="${esc(state.settings.playerName || '')}" maxlength="20" placeholder="Pseudo">
			</div>
			<div class="card fr-add">
				<div class="fr-label">Ajouter un ami</div>
				<div class="row" style="gap:8px"><input class="input grow" id="fr-new" placeholder="SMASH-AMI-…" spellcheck="false"><button class="btn primary" data-action="fr-add">${icon('user-plus')}Ajouter</button></div>
				<div class="small muted" style="margin-top:8px">Tu vois son statut tout de suite ; il reçoit une demande pour voir le tien.</div>
				${s.requests.length ? `<div class="fr-label" style="margin-top:14px">Demandes reçues</div>${s.requests.map(r => `<div class="fr-req"><div class="fr-av sm" style="--c:${colorFor(r.code)}">${esc(String(r.name || '?')[0].toUpperCase())}</div><div class="grow"><b>${esc(r.name)}</b><div class="small muted">${ago(r.at)}</div></div><button class="btn primary sm" data-action="fr-accept" data-code="${esc(r.code)}">Accepter</button><button class="btn sm" data-action="fr-decline" data-code="${esc(r.code)}">Refuser</button></div>`).join('')}` : ''}
			</div>
			<div class="card fr-opts">
				${sw('showGame', 'Montrer le jeu en cours', 'Tes amis voient à quoi tu joues')}
				${sw('shareStats', 'Partager mes statistiques', 'Temps de jeu, jeux préférés, trophées')}
				${sw('notify', 'Notifications', 'Quand un ami se connecte ou lance un jeu')}
				<button class="btn sm ghost" data-action="fr-disable">${icon('power')}Désactiver les amis</button>
			</div>
		</div>
		<div class="fr-list">${list.length ? list.map(frCard).join('') : `<div class="empty">${icon('user-plus')}<div>Pas encore d’amis. Copie ton code et envoie-le, ou colle le code d’un ami ci-dessus.</div></div>`}</div>
		<div class="small muted fr-privacy">${icon('lock', 'sm')}Statuts et statistiques chiffrés de bout en bout (AES-256-GCM) via ntfy.sh. Le relais ne voit que des données illisibles ; seuls tes amis ont la clé.</div>`);
};

PAGES.friends = async () => {
	if (!FR.st) setMain('<div class="loading"><div class="spinner"></div>Chargement…</div>');
	try { FR.st = await api('friends:state'); } catch (error) { toastError(error); return; }
	if (state.route.name === 'friends') frRender();
};

// Mise à jour en direct (statut d'un ami, connexion au relais) : la page se redessine sans perdre la saisie.
window.launcher.on('friends:update', (st) => {
	FR.st = st;
	if (typeof renderNav === 'function') renderNav();
	if (state.route.name !== 'friends') return;
	const typed = $('#fr-new') ? $('#fr-new').value : '';
	const focused = document.activeElement && document.activeElement.id;
	frRender();
	if ($('#fr-new')) { $('#fr-new').value = typed; if (focused === 'fr-new') $('#fr-new').focus(); }
});

window.launcher.on('friends:event', (e) => {
	if (e.type === 'request') toast(`👋 <b>${esc(e.name)}</b> veut devenir ton ami.`, { type: 'info', timeout: 12000, actions: [{ label: 'Accepter', run: () => ACTIONS['fr-accept']({ dataset: { code: e.code } }) }, { label: 'Voir', run: () => ACTIONS.nav({ dataset: { to: 'friends' } }) }] });
	if (e.type === 'online') toast(`🟢 <b>${esc(e.name)}</b> est en ligne.`, { type: 'info' });
	// Invitation à jouer à distance : un clic ouvre la partie de l'ami, sans code à recopier.
	if (e.type === 'play') toast(`🎮 <b>${esc(e.name)}</b> t’invite à jouer${e.game ? ` à <b>${esc(e.game)}</b>` : ''} !`, { type: 'info', timeout: 60000, actions: [{ label: 'Rejoindre', run: () => api('remote:join', e.room).catch(toastError) }] });
	if (e.type === 'playing') toast(`🎮 <b>${esc(e.name)}</b> joue à <b>${esc(e.game)}</b>${e.system ? ` (${esc(e.system)})` : ''}.`, { type: 'info', timeout: 7000 });
});

// Nombre d'amis en ligne, affiché à côté de « Amis » dans le menu.
const friendsOnline = () => (FR.st && FR.st.on ? FR.st.friends.filter(f => ['playing', 'online', 'away'].includes(f.status)).length : 0);
api('friends:state').then((st) => { FR.st = st; if (typeof renderNav === 'function') renderNav(); }).catch(() => {});

const frUpdate = (st) => { FR.st = st; if (state.route.name === 'friends') frRender(); };

Object.assign(ACTIONS, {
	'fr-enable': async () => { try { frUpdate(await api('friends:enable', true)); toast('Amis activés : copie ton code et envoie-le à tes amis.'); } catch (error) { toastError(error); } },
	'fr-disable': async () => {
		if (await confirmModal('Désactiver les amis ?', 'Tes amis te verront « hors ligne » et Smash Emu cessera de publier ton statut. Ta liste d’amis et ton code sont gardés.', { confirm: 'Désactiver' })) frUpdate(await api('friends:enable', false));
	},
	'fr-copy': async () => { await navigator.clipboard.writeText(FR.st.code); toast('Code ami copié : colle-le à tes amis.'); },
	'fr-regen': async () => {
		if (!await confirmModal('Nouveau code ami ?', 'Ton code actuel cesse de marcher : tes amis ne verront plus ton statut tant que tu ne leur as pas envoyé le nouveau code.', { confirm: 'Changer de code' })) return;
		try { frUpdate(await api('friends:regenerate')); toast('Nouveau code créé.'); } catch (error) { toastError(error); }
	},
	'fr-add': async () => {
		const input = $('#fr-new');
		try { frUpdate(await api('friends:add', input.value)); toast('Ami ajouté : une demande lui a été envoyée.'); } catch (error) { toastError(error); }
	},
	'fr-accept': async (el) => { try { frUpdate(await api('friends:accept', el.dataset.code)); toast('Demande acceptée : vous voyez maintenant vos statuts.'); } catch (error) { toastError(error); } },
	'fr-decline': async (el) => frUpdate(await api('friends:decline', el.dataset.code)),
	'fr-opt': async (el) => frUpdate(await api('friends:options', { [el.dataset.key]: !FR.st[el.dataset.key] })),
	'fr-menu': (el) => {
		const f = FR.st.friends.find(x => x.code === el.dataset.code);
		if (!f) return;
		menu(el, [
			{ icon: 'copy', label: 'Copier son code', run: async () => { await navigator.clipboard.writeText(f.code); toast('Code copié'); } },
			'-',
			{ icon: 'user-minus', label: 'Retirer de mes amis', danger: true, run: async () => frUpdate(await api('friends:remove', f.code)) },
		]);
	},
});
