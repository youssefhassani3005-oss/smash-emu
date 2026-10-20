/* global state, api, icon, esc, toast, toastError, setMain, PAGES, TITLES, ACTIONS, instById, instIcon, ago */
// Multiworld (Archipelago, archipelago.gg) : chaque objet trouvé dans ton jeu peut appartenir au jeu d'un ami, et
// inversement. Smash Emu se connecte à la partie comme client « texte » (protocole WebSocket officiel) : fil des
// objets envoyés et reçus, notifications, indices et chat. Le jeu lui-même tourne avec la version compatible
// Archipelago (lanceur officiel, BizHawk, port PC…).

const AP_VERSION = { major: 0, minor: 6, build: 8, class: 'Version' };
const FLAG = { PROGRESSION: 1, USEFUL: 2, TRAP: 4 };
const AP_ERRORS = {
	InvalidSlot: 'Nom de joueur (slot) inconnu dans cette partie.',
	InvalidGame: 'Jeu incompatible avec ce slot.',
	IncompatibleVersion: 'Version d’Archipelago incompatible avec ce serveur.',
	InvalidPassword: 'Mot de passe incorrect.',
	InvalidItemsHandling: 'Réglage du client refusé par le serveur.',
};

// Jeux de la bibliothèque jouables en multiworld, et comment.
const AP_GAMES = [
	[/super mario 64|sm64/i, 'Super Mario 64', 'Port PC « sm64ex » pour Archipelago, construit à partir de ta ROM US (voir le guide du jeu sur archipelago.gg).'],
	[/ocarina of time/i, 'Ocarina of Time', 'ROM 1.0 patchée par le lanceur Archipelago, jouée dans BizHawk avec le connecteur Lua.'],
	[/link to the past|zelda.*(3|iii)\b/i, 'A Link to the Past', 'Patch ouvert par le lanceur Archipelago, joué avec SNI (BizHawk, snes9x-rr ou console).'],
	[/super metroid/i, 'Super Metroid', 'Patch + SNI, comme A Link to the Past.'],
	[/super mario world/i, 'Super Mario World', 'Patch + SNI.'],
	[/donkey kong country 3/i, 'Donkey Kong Country 3', 'Patch + SNI.'],
	[/pok[eé]mon (red|blue|rouge|bleu)/i, 'Pokémon Rouge et Bleu', 'Patch + BizHawk.'],
	[/pok[eé]mon (emerald|émeraude)/i, 'Pokémon Émeraude', 'Patch + BizHawk.'],
	[/link'?s awakening/i, 'Link’s Awakening DX', 'Patch + BizHawk ou BGB.'],
	[/kirby'?s dream land 3/i, 'Kirby’s Dream Land 3', 'Patch + SNI.'],
	[/super mario land 2/i, 'Super Mario Land 2', 'Patch + BizHawk.'],
	[/mega ?man 2/i, 'Mega Man 2', 'Patch + BizHawk.'],
	[/yoshi'?s island/i, 'Yoshi’s Island', 'Patch + SNI.'],
	[/superstar saga/i, 'Mario & Luigi : Superstar Saga', 'Patch + BizHawk.'],
];

const ap = {
	ws: null, status: 'off', error: '', server: '', name: '', slot: null, team: 0,
	players: [], slotInfo: {}, games: [], names: {}, feed: [], connectedAt: 0,
};

const apPlayer = (slot) => {
	const p = ap.players.find(x => x.slot === +slot && x.team === ap.team);
	return p ? (p.alias || p.name) : `Joueur ${slot}`;
};
const apGameOf = slot => (ap.slotInfo[slot] || {}).game || '';
const apItemName = (id, slot) => ((ap.names[apGameOf(slot)] || {}).items || {})[id] || `Objet ${id}`;
const apLocName = (id, slot) => ((ap.names[apGameOf(slot)] || {}).locations || {})[id] || `Lieu ${id}`;
const itemClass = flags => (flags & FLAG.PROGRESSION ? 'prog' : flags & FLAG.TRAP ? 'trap' : flags & FLAG.USEFUL ? 'useful' : 'filler');

// Message Archipelago (liste de morceaux typés) → HTML.
const apParts = parts => parts.map((p) => {
	const t = p.text || '';
	switch (p.type) {
		case 'player_id': return `<span class="ap-player ${+t === ap.slot ? 'me' : ''}">${esc(apPlayer(t))}</span>`;
		case 'player_name': return `<span class="ap-player ${t === ap.name ? 'me' : ''}">${esc(t)}</span>`;
		case 'item_id': return `<span class="ap-item ${itemClass(p.flags || 0)}">${esc(apItemName(t, p.player))}</span>`;
		case 'item_name': return `<span class="ap-item ${itemClass(p.flags || 0)}">${esc(t)}</span>`;
		case 'location_id': return `<span class="ap-loc">${esc(apLocName(t, p.player))}</span>`;
		case 'location_name': case 'entrance_name': return `<span class="ap-loc">${esc(t)}</span>`;
		case 'hint_status': return `<span class="ap-hint">${esc(t)}</span>`;
		default: return esc(t);
	}
}).join('');

const apPush = (html, kind = '') => {
	ap.feed.push({ html, kind, at: Date.now() });
	if (ap.feed.length > 400) ap.feed.splice(0, ap.feed.length - 400);
	const box = document.getElementById('ap-feed');
	if (box) {
		const stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
		box.insertAdjacentHTML('beforeend', `<div class="ap-line ${kind}">${html}</div>`);
		if (stick) box.scrollTop = box.scrollHeight;
	}
};

const apSend = (packets) => { if (ap.ws && ap.ws.readyState === 1) ap.ws.send(JSON.stringify(packets)); };

const apHandle = (pkt) => {
	switch (pkt.cmd) {
		case 'RoomInfo': {
			ap.games = pkt.games || [];
			apPush(`Serveur Archipelago ${esc(`${pkt.version.major}.${pkt.version.minor}.${pkt.version.build}`)} · ${ap.games.length} jeu${ap.games.length > 1 ? 'x' : ''} dans la partie`, 'sys');
			apSend([{ cmd: 'GetDataPackage', games: ap.games }]);
			let uuid = '';
			try { uuid = localStorage.getItem('smash-ap-uuid') || ''; if (!uuid) { uuid = crypto.randomUUID(); localStorage.setItem('smash-ap-uuid', uuid); } } catch { uuid = crypto.randomUUID(); }
			apSend([{ cmd: 'Connect', password: ap.password || '', game: '', name: ap.name, uuid, version: AP_VERSION, items_handling: 0, tags: ['TextOnly'], slot_data: false }]);
			break;
		}
		case 'DataPackage': {
			for (const [game, d] of Object.entries((pkt.data && pkt.data.games) || {})) {
				ap.names[game] = {
					items: Object.fromEntries(Object.entries(d.item_name_to_id || {}).map(([n, id]) => [id, n])),
					locations: Object.fromEntries(Object.entries(d.location_name_to_id || {}).map(([n, id]) => [id, n])),
				};
			}
			break;
		}
		case 'Connected':
			ap.status = 'on';
			ap.slot = pkt.slot;
			ap.team = pkt.team;
			ap.players = pkt.players || [];
			ap.slotInfo = pkt.slot_info || {};
			ap.connectedAt = Date.now();
			apPush(`Connecté en tant que <span class="ap-player me">${esc(apPlayer(pkt.slot))}</span> (${esc(apGameOf(pkt.slot))}) · ${(pkt.checked_locations || []).length} lieux visités, ${(pkt.missing_locations || []).length} restants`, 'sys');
			apSaveRecent();
			apRenderSide();
			break;
		case 'ConnectionRefused':
			ap.status = 'error';
			ap.error = (pkt.errors || []).map(e => AP_ERRORS[e] || e).join(' ') || 'Connexion refusée.';
			apPush(esc(ap.error), 'err');
			ap.ws.close();
			apRenderSide();
			break;
		case 'PrintJSON': {
			const html = apParts(pkt.data || []);
			let kind = (pkt.type || '').toLowerCase();
			if (pkt.type === 'ItemSend' && pkt.item) {
				const toMe = pkt.receiving === ap.slot && pkt.item.player !== ap.slot;
				const fromMe = pkt.item.player === ap.slot && pkt.receiving !== ap.slot;
				if (toMe) {
					kind += ' to-me';
					toast(`🎁 <b>${esc(apPlayer(pkt.item.player))}</b> t’a envoyé <b>${esc(apItemName(pkt.item.item, ap.slot))}</b>`, { type: 'success', timeout: 7000 });
				} else if (fromMe) kind += ' from-me';
			}
			if (pkt.type === 'Goal') toast(`🏁 ${html}`, { type: 'info', timeout: 8000 });
			apPush(html, kind);
			break;
		}
		default: break;
	}
};

const apConnect = (server, name, password) => {
	if (ap.ws) { try { ap.ws.close(); } catch { /* déjà fermé */ } }
	const clean = String(server || '').trim().replace(/\/+$/, '');
	if (!clean || !name) { toast('Indique l’adresse du serveur et ton nom de joueur.', { type: 'error' }); return; }
	Object.assign(ap, { server: clean, name: String(name).trim(), password, status: 'connecting', error: '', players: [], slotInfo: {}, slot: null });
	const urls = /^wss?:\/\//i.test(clean) ? [clean] : [`wss://${clean}`, `ws://${clean}`];
	const tryUrl = (i) => {
		let opened = false;
		const ws = new WebSocket(urls[i]);
		ap.ws = ws;
		ws.onopen = () => { opened = true; apPush(`Connexion à ${esc(urls[i])}…`, 'sys'); };
		ws.onmessage = (e) => { let list = []; try { list = JSON.parse(e.data); } catch { return; } for (const p of list) apHandle(p); };
		ws.onerror = () => {};
		ws.onclose = () => {
			if (ap.ws !== ws) return;
			if (!opened && i + 1 < urls.length) { tryUrl(i + 1); return; }
			if (ap.status !== 'error') { ap.status = opened ? 'off' : 'error'; ap.error = opened ? '' : 'Serveur injoignable : vérifie l’adresse et le port (ex. archipelago.gg:38281).'; }
			apPush(opened ? 'Déconnecté.' : esc(ap.error), opened ? 'sys' : 'err');
			apRenderSide();
		};
	};
	tryUrl(0);
	apRenderSide();
};

const apSaveRecent = async () => {
	const item = { server: ap.server, name: ap.name, at: Date.now() };
	const list = [item, ...(state.settings.apRecent || []).filter(r => r.server !== item.server || r.name !== item.name)].slice(0, 8);
	state.settings = await api('settings:set', { apRecent: list }).catch(() => state.settings);
};

const apRenderSide = () => {
	const box = document.getElementById('ap-side');
	if (!box) return;
	const label = { off: ['', 'Déconnecté'], connecting: ['orange', 'Connexion…'], on: ['green', 'Connecté'], error: ['red', 'Erreur'] }[ap.status];
	box.innerHTML = `
		<div class="row"><h3 class="grow">${icon('radio')}Partie</h3><span class="tag ${label[0]}">${label[1]}</span></div>
		${ap.status === 'on' ? `
			<div class="small muted">${esc(ap.server)} · connecté ${ago(ap.connectedAt)}</div>
			<div class="ap-players">${ap.players.filter(p => p.team === ap.team).map(p => `<div class="ap-prow ${p.slot === ap.slot ? 'me' : ''}"><b>${esc(p.alias || p.name)}</b><span>${esc(apGameOf(p.slot))}</span>${p.slot === ap.slot ? '<i>toi</i>' : ''}</div>`).join('')}</div>
			<button class="btn" data-action="ap-disconnect">${icon('x')}Se déconnecter</button>` : `
			<div class="field"><label>Serveur</label><input class="input" id="ap-server" value="${esc(ap.server || 'archipelago.gg:')}" placeholder="archipelago.gg:38281"></div>
			<div class="field"><label>Nom de joueur (slot)</label><input class="input" id="ap-name" value="${esc(ap.name || state.settings.playerName || '')}" maxlength="16"></div>
			<div class="field"><label>Mot de passe (si la partie en a un)</label><input class="input" id="ap-pass" type="password"></div>
			${ap.error ? `<div class="dash-warn">${icon('triangle-alert')}${esc(ap.error)}</div>` : ''}
			<button class="btn primary" data-action="ap-connect" ${ap.status === 'connecting' ? 'disabled' : ''}>${icon('link')}Se connecter</button>
			${(state.settings.apRecent || []).length ? `<div class="small muted" style="margin-top:8px">Récentes</div>${state.settings.apRecent.map(r => `<button class="ap-recent" data-action="ap-recent" data-server="${esc(r.server)}" data-name="${esc(r.name)}">${icon('history')}<span class="grow">${esc(r.name)} · ${esc(r.server)}</span><small>${ago(r.at)}</small></button>`).join('')}` : ''}`}`;
};

TITLES.multiworld = () => [{ label: 'Multiworld' }];

PAGES.multiworld = async () => {
	const st = await api('archipelago:status').catch(() => ({}));
	const compat = state.instances.map(i => ({ inst: i, g: AP_GAMES.find(([re]) => re.test(i.name)) })).filter(x => x.g);
	setMain(`
		<div class="dash-hero">
			<div class="dash-hero-left"><div class="dash-hello">${icon('shuffle')}Archipelago</div><h1>Multiworld</h1>
				<div class="muted">Les objets de vos jeux sont mélangés entre vous : un coffre ouvert dans ton jeu peut donner l’épée de ton pote dans le sien, et ses découvertes t’envoient tes objets. Vous avancez ensemble, chacun sur son jeu.</div></div>
			<div class="row" style="gap:8px;flex-wrap:wrap">
				${st.launcher ? `<button class="btn primary" data-action="ap-launcher">${icon('rocket')}Ouvrir le lanceur Archipelago</button>` : `<button class="btn primary" data-action="ap-install" id="ap-install">${icon('download')}Installer Archipelago (officiel)</button>`}
				<button class="btn" data-action="external" data-url="https://archipelago.gg/">${icon('globe')}archipelago.gg</button>
			</div>
		</div>
		<div class="ap-layout">
			<div class="card col" id="ap-side"></div>
			<div class="card col ap-main">
				<div class="row"><h3 class="grow">${icon('scroll-text')}Fil de la partie</h3><span class="small muted"><span class="ap-item prog">progression</span> · <span class="ap-item useful">utile</span> · <span class="ap-item trap">piège</span></span></div>
				<div class="ap-feed" id="ap-feed">${ap.feed.length ? ap.feed.map(l => `<div class="ap-line ${l.kind}">${l.html}</div>`).join('') : '<div class="ap-line sys">Connecte-toi à une partie pour voir passer les objets, les indices et le chat.</div>'}</div>
				<div class="row" style="gap:8px;margin-top:8px">
					<input class="input grow" id="ap-say" placeholder="Message ou commande (!hint objet, !remaining…)" maxlength="300">
					<button class="btn primary" data-action="ap-say">${icon('message-circle')}Envoyer</button>
				</div>
				<div class="chips" style="margin-top:8px">${[['!hint', 'Mes indices'], ['!remaining', 'Objets restants'], ['!missing', 'Lieux manquants'], ['!countdown 5', 'Compte à rebours'], ['!help', 'Aide']].map(([c, l]) => `<button class="chip" data-action="ap-cmd" data-cmd="${c}">${esc(l)}</button>`).join('')}</div>
			</div>
		</div>
		<div class="dash-grid" style="margin-top:14px">
			<div class="card col"><h3>${icon('list-filter')}Comment lancer une partie</h3>
				<div class="remote-steps">
					<div><b>1</b><span>Chacun choisit son jeu et ses options sur <a data-action="external" data-url="https://archipelago.gg/games">archipelago.gg/games</a> (« Options Page ») et télécharge son fichier <b>.yaml</b>.</span></div>
					<div><b>2</b><span>L’hôte envoie tous les .yaml sur <a data-action="external" data-url="https://archipelago.gg/generate">archipelago.gg/generate</a>, puis crée une salle : il obtient l’adresse (ex. <b>archipelago.gg:38281</b>).</span></div>
					<div><b>3</b><span>Chacun ouvre son jeu avec la version Archipelago (patch via le lanceur officiel) et se connecte à l’adresse avec son nom de joueur.</span></div>
					<div><b>4</b><span>Dans Smash Emu, connecte-toi ici pour suivre la partie : notifications quand un ami t’envoie un objet, indices et chat.</span></div>
				</div></div>
			<div class="card col"><h3>${icon('gamepad-2')}Tes jeux compatibles</h3>
				${compat.length ? compat.map(({ inst, g }) => `<div class="sug-row">${instIcon(inst, 'sm')}<div class="grow"><div class="bold">${esc(inst.name)}</div><div class="small muted">${esc(g[2])}</div></div></div>`).join('') : '<div class="empty small">Aucun jeu de ta bibliothèque n’est dans la liste connue. Il y en a plus de 100 : regarde la liste sur archipelago.gg/games.</div>'}
				<div class="small muted" style="margin-top:8px">Le multiworld demande la version spéciale du jeu (patch Archipelago) : l’émulateur intégré de Smash Emu ne peut pas encore échanger les objets lui-même.</div></div>
		</div>`);
	apRenderSide();
	const feed = document.getElementById('ap-feed');
	if (feed) feed.scrollTop = feed.scrollHeight;
	const say = document.getElementById('ap-say');
	if (say) say.addEventListener('keydown', (e) => { if (e.key === 'Enter') ACTIONS['ap-say'](); });
};

Object.assign(ACTIONS, {
	'ap-connect': () => apConnect(document.getElementById('ap-server').value, document.getElementById('ap-name').value, document.getElementById('ap-pass').value),
	'ap-recent': (el) => { ap.server = el.dataset.server; ap.name = el.dataset.name; apRenderSide(); },
	'ap-disconnect': () => { const ws = ap.ws; ap.ws = null; ap.status = 'off'; if (ws) ws.close(); apPush('Déconnecté.', 'sys'); apRenderSide(); },
	'ap-say': () => {
		const el = document.getElementById('ap-say');
		const text = el && el.value.trim();
		if (!text) return;
		if (ap.status !== 'on') { toast('Connecte-toi d’abord à une partie.', { type: 'error' }); return; }
		apSend([{ cmd: 'Say', text }]);
		el.value = '';
	},
	'ap-cmd': (el) => {
		if (ap.status !== 'on') { toast('Connecte-toi d’abord à une partie.', { type: 'error' }); return; }
		apSend([{ cmd: 'Say', text: el.dataset.cmd }]);
	},
	'ap-install': async (el) => {
		el.disabled = true;
		try {
			const r = await api('archipelago:install');
			toast(`Installateur Archipelago ${esc(r.version)} ouvert : suis ses étapes, puis reviens ici.`, { type: 'success', timeout: 9000 });
		} catch (error) { toastError(error); }
		el.disabled = false;
	},
	'ap-launcher': () => api('archipelago:open').catch(toastError),
});

window.launcher.on('archipelago:progress', (p) => {
	const b = document.getElementById('ap-install');
	if (b) b.innerHTML = `${icon('download')}Téléchargement ${p.percent != null ? `${p.percent} %` : '…'}`;
});
