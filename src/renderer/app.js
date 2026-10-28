/* global $, $$, esc, icon, api, fileUrl, ago, playTime, compact, bytes, dateFr, avatar, stars, toast, toastError, menu, modal, confirmModal, debounce, sanitize, SmashLogo */
// Smash Emu — état, navigation et pages.

const state = {
	info: null,
	settings: null,
	instances: [],
	running: [],
	meta: { categories: [], sorts: [] },
	downloads: new Map(),
	opera: { status: null, files: [], fresh: new Set() },
	roms: [],
	romScan: null,
	route: { name: 'home', params: {} },
	back: [],
	forward: [],
	ui: { jumpOpen: true, libQuery: '', libType: 'all', libSort: 'played', libGroup: 'none' },
	cache: { popular: null },
	discover: { q: '', category: null, sort: 'downloads', page: 1, result: null, loading: false, token: 0 },
};

const THEME_INFO = {
	smash: { label: 'Smash', desc: 'Rouge & noir', colors: ['#0a0a0b', '#161618', '#ff1f3d'] },
	modrinth: { label: 'Modrinth', desc: 'Vert émeraude', colors: ['#16181c', '#27292e', '#1bd96a'] },
	neon: { label: 'Néon', desc: 'Violet électrique', colors: ['#0c0a14', '#17132a', '#c04dff'] },
	ocean: { label: 'Océan', desc: 'Bleu profond', colors: ['#0a111c', '#13202f', '#2f9bff'] },
	gameboy: { label: 'Game Boy', desc: 'Vert rétro', colors: ['#0e1a0e', '#18291a', '#9bbc0f'] },
	gold: { label: 'Or', desc: 'Or & noir', colors: ['#0b0a08', '#171510', '#ffc23d'] },
	light: { label: 'Clair', desc: 'Blanc & rouge', colors: ['#f3f3f6', '#ffffff', '#e3002b'] },
};

// Thèmes inspirés des jeux (game-themes.js), ajoutés après les thèmes de base.
for (const t of SmashThemes.THEMES) {
	const v = SmashThemes.vars(t);
	THEME_INFO[t.id] = { label: t.label, desc: t.tagline, console: t.console, colors: [v['--bg'], v['--raised'], t.accent], game: true };
}
for (const id of Object.keys(THEME_INFO)) THEME_INFO[id].font = SmashThemes.fontOf(id);

// Thèmes personnalisés : enregistrés dans les réglages, ajoutés au registre des thèmes.
SmashThemes.setImageUrl(fileUrl);
const syncCustomThemes = () => {
	for (const c of [...SmashThemes.CUSTOM]) if (!(state.settings.customThemes || []).some(x => x.id === c.id)) { SmashThemes.unregister(c.id); delete THEME_INFO[c.id]; }
	for (const def of state.settings.customThemes || []) {
		const t = SmashThemes.register(def);
		THEME_INFO[t.id] = { label: t.label, desc: t.tagline, colors: [t.bg, t.bg, t.accent], game: false, custom: true, font: t.font };
	}
};

// Thème appliqué : couleurs, police, style d'icônes (Wii, ornements, pixel…) et décor animé des thèmes de jeux.
let decorKey = '';
const applyTheme = (theme) => {
	const r = SmashThemes.resolve(theme);
	const id = THEME_INFO[theme] ? theme : (THEME_INFO[r] || SmashThemes.get(r) ? r : 'smash');
	const root = document.documentElement;
	root.dataset.theme = id;
	root.dataset.icons = SmashThemes.iconsOf(id);
	const def = SmashThemes.get(id);
	root.toggleAttribute('data-bgimage', !!(def && def.image));
	const mode = (state.settings && state.settings.decor) || 'full';
	const key = `${id}|${mode}|${def && def.custom ? [def.image, def.sticker, def.imageDim, def.imageBlur, def.particles, def.motifs.join()].join() : ''}`;
	if (key !== decorKey) {
		decorKey = key;
		const el = document.getElementById('decor');
		if (el) el.innerHTML = SmashThemes.decor(id, mode);
		if (typeof themeDress === 'function') themeDress();
	}
};
// Thème affiché : celui du jeu sur sa page (thème automatique), sinon celui choisi.
const currentTheme = () => {
	const s = state.settings || {};
	if (s.autoTheme !== false && state.route && state.route.name === 'instance') {
		const inst = instById(state.route.params.id);
		const t = inst && SmashThemes.match(instGameName(inst), sysOf(inst));
		if (t) return t;
	}
	return s.theme;
};
// Logo choisi : gardé aussi en local pour l'écran de démarrage, affiché avant la lecture des réglages.
const applyLogo = (v) => { SmashLogo.setVariant(v); try { localStorage.setItem('smash-logo', SmashLogo.variant()); } catch { /* */ } };
try { SmashLogo.setVariant(localStorage.getItem('smash-logo') || 'classic'); } catch { /* */ }
// Interface (Console ou classique) connue dès l'écran de démarrage.
try {
	document.documentElement.dataset.ui = localStorage.getItem('smash-ui') || 'console';
	document.documentElement.dataset.uiStyle = localStorage.getItem('smash-ui-style') || 'theme';
} catch { document.documentElement.dataset.ui = 'console'; }

const TYPE_ICON = { coopdx: 'users', rom: 'joystick' };

// Jaquette générée pour une ROM : dégradé propre au jeu et initiales en police pixel (SM64, OOT, MM…).
const romInitials = (name) => {
	const words = name.replace(/\(.*?\)|\[.*?\]/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[\s:—–-]+/).filter(w => /[a-z0-9]/i.test(w));
	const out = words.map(w => (/^\d+$/.test(w) ? w : w.replace(/[^a-z0-9]/gi, '')[0] || '')).join('').toUpperCase();
	return out.slice(0, 5) || '?';
};
const romCover = (r, cls = '') => {
	const hue = [...r.name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 3600, 7) % 360;
	const sys = r.system || 'n64';
	const badge = /lg|xl/.test(cls) ? `<small>${esc(SYS_SHORT[sys] || sys.toUpperCase())}</small>` : '';
	return `<div class="rom-cover ${cls}" style="--h:${hue}" title="${esc(r.info.gameCode || '')}"><span>${esc(romInitials(r.name))}</span>${badge}</div>`;
};
const typeLabel = t => (state.info && state.info.gameTypes[t] ? state.info.gameTypes[t].short : t);
const SYS_SHORT = { nes: 'NES', snes: 'SNES', n64: 'N64', gb: 'GB', gbc: 'GBC', gba: 'GBA', vb: 'VB', nds: 'DS', gc: 'GC', wii: 'WII', '3ds': '3DS', wiiu: 'WII U', switch: 'SWITCH', psx: 'PS1', ps2: 'PS2', psp: 'PSP', ps3: 'PS3', sms: 'SMS', md: 'MD', gg: 'GG', segacd: 'MCD', '32x': '32X', saturn: 'SATURN', pce: 'PCE', a2600: '2600', a7800: '7800', lynx: 'LYNX', jaguar: 'JAG', '3do': '3DO', xbox: 'XBOX', x360: '360' };
const sysOf = i => (i.rom && i.rom.system) || i.system || (i.type === 'rom' ? 'n64' : null);
const sysInfo = id => ((state.info && state.info.systems) || {})[id] || { label: id || '?', engines: [] };
const instKind = i => (i.type === 'coopdx' ? 'SM64 Coop DX' : sysInfo(sysOf(i)).label);
const engineLabel = e => (e === 'smash' ? 'Smash Emu (intégré)' : (((state.info && state.info.externals) || {})[e] || {}).label || e);
// Même règle que le moteur côté processus principal (games.engineFor).
// Nom du jeu d'une instance (celui de la ROM de préférence, plus fiable que le nom donné à l'instance).
const instGameName = i => (i.type === 'coopdx' ? 'Super Mario 64' : (i.rom && i.rom.info && (i.rom.info.known || i.rom.info.title)) || i.name);

const instEngine = (i) => {
	const avail = sysInfo(sysOf(i)).engines || [];
	const wanted = (i.options || {}).engine;
	if (wanted && avail.includes(wanted)) return wanted;
	if (sysOf(i) === 'n64' && avail.includes(state.settings.defaultEngine)) return state.settings.defaultEngine;
	return avail[0];
};
const isRunning = id => state.running.some(r => r.id === id);
const instById = id => state.instances.find(i => i.id === id);
// Icône d'instance : image choisie, sinon jaquette de la ROM, sinon initiale.
const instIcon = (inst, cls = '') => {
	if (inst.coverFile) return avatar(`${fileUrl(inst.coverFile)}?v=${inst.coverAt || 0}`, inst.name, `${cls} cover`);
	if (!inst.iconData && inst.rom && inst.rom.info) {
		const coverCls = { sm: 'sm', lg: 'av-lg', xl: 'av-xl' }[cls] || '';
		return romCover({ name: inst.rom.info.known || inst.rom.info.title, info: inst.rom.info, system: sysOf(inst) }, coverCls);
	}
	return avatar(inst.iconData, inst.name, cls);
};

// ---------- Données ----------

const refreshInstances = async () => { state.instances = await api('instances:list'); };
const refreshAll = async () => {
	[state.info, state.settings, state.meta, state.running] = await Promise.all([api('app:info'), api('settings:get'), api('catalog:meta'), api('run:status')]);
	state.supporter = await api('supporter:status').catch(() => null);
	syncCustomThemes();
	applyTheme(state.settings.theme);
	applyLogo(state.settings.logo);
	await refreshInstances();
	state.roms = await api('roms:list').catch(() => []);
	state.opera.status = await api('opera:status').catch(() => null);
	state.opera.files = await api('opera:recent').catch(() => []);
};

// ---------- Navigation ----------

const PAGES = {};
const TITLES = {
	home: () => [{ label: 'Accueil' }],
	roms: () => [{ label: 'Jeux' }],
	suggest: p => [{ label: 'ROMs', to: ['roms', {}] }, { label: `Mods suggérés · ${(state.roms.find(r => r.id === p.romId) || {}).name || ''}` }],
	library: () => [{ label: 'Bibliothèque' }],
	discover: () => [{ label: 'Découvrir des mods' }],
	project: p => [{ label: 'Découvrir', to: ['discover', {}] }, { label: p.title || 'Mod' }],
	opera: () => [{ label: 'Recherche Opera' }],
	settings: () => [{ label: 'Paramètres' }],
	instance: p => [{ label: 'Bibliothèque', to: ['library', {}] }, { label: (instById(p.id) || {}).name || 'Instance' }],
};

// Transitions entre les menus (interface Console) : la page glisse dans le sens de la barre d'icônes, zoome en
// entrant dans un jeu et recule en revenant ; la barre du haut et la barre d'icônes restent en place.
const DEEP = new Set(['instance', 'project', 'suggest']);
const navDir = (from, to) => {
	if (DEEP.has(to) && !DEEP.has(from)) return 'in';
	if (DEEP.has(from) && !DEEP.has(to)) return 'out';
	const order = (typeof CONSOLE_DOCK !== 'undefined' ? CONSOLE_DOCK : []).map(d => d[0]);
	const a = order.indexOf(from);
	const b = order.indexOf(to);
	return a < 0 || b < 0 || a === b ? 'fade' : b > a ? 'left' : 'right';
};
const transition = (dir, update) => {
	if (!consoleUi() || !document.startViewTransition || state.settings.consoleAnim === false) { update(); return; }
	document.documentElement.dataset.navDir = dir;
	if (typeof chBlip === 'function') chBlip(dir === 'in' ? 640 : dir === 'out' ? 480 : 560, 0.05, 0.025);
	document.startViewTransition(update);
};

const go = (name, params = {}, { push = true } = {}) => {
	const from = state.route.name;
	if (push) { state.back.push(state.route); state.forward = []; }
	state.route = { name, params };
	transition(navDir(from, name), () => {
		render();
		const page = $('#page');
		if (page) page.scrollTop = 0;
	});
};
const goBack = () => { if (!state.back.length) return; const from = state.route.name; state.forward.push(state.route); state.route = state.back.pop(); transition(navDir(from, state.route.name), render); };
const goForward = () => { if (!state.forward.length) return; const from = state.route.name; state.back.push(state.route); state.route = state.forward.pop(); transition(navDir(from, state.route.name), render); };

// ---------- Barre du haut ----------

// Interface « Console » (par défaut) : boutons ronds et pastille d'état en haut, barre d'icônes en bas, cartes
// claires sur un décor au choix ; « Classique » garde le menu latéral.
const consoleUi = () => !state.settings || state.settings.uiStyle !== 'classic';
const clockText = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
setInterval(() => { const c = document.getElementById('ct-clock'); if (c) c.textContent = clockText(); }, 15000);

const renderConsoleTopbar = (crumbs, active, n) => {
	const online = typeof friendsOnline === 'function' ? friendsOnline() : 0;
	const name = state.settings.playerName || 'Joueur';
	const round = (action, ic, tip, extra = '', attrs = '') => `<button class="ct-round" data-action="${action}" ${attrs} data-tip="${tip}" data-tip-pos="bottom">${icon(ic)}${extra}</button>`;
	$('#topbar').innerHTML = `
		<div class="ct-left">
			${round('nav', 'house', 'Accueil', '', 'data-to="home"')}
			${round('back', 'chevron-left', 'Retour', '', state.back.length ? '' : 'disabled')}
			${round('ct-search', 'search', 'Rechercher un jeu (Ctrl+K)')}
			${round('nav', 'users', 'Amis', online ? `<b class="ct-badge">${online}</b>` : '', 'data-to="friends"')}
			${round('downloads', 'download', 'Téléchargements', active ? `<b class="ct-badge">${active}</b>` : '')}
			${typeof notifBell === 'function' ? notifBell() : ''}
		</div>
		<div class="ct-title">${crumbs.map((c, i) => (i ? `<span class="sep">${icon('chevron-right', 'sm')}</span>` : '') + (c.to ? `<a data-action="crumb" data-i="${i}">${esc(c.label)}</a>` : `<span>${esc(c.label)}</span>`)).join('')}</div>
		<div class="ct-right">
			${n ? `<button class="ct-running" data-action="running"><i></i>${n} en cours</button>` : ''}
			${typeof coinPill === 'function' ? coinPill() : ''}
			<div class="ct-status">${icon(navigator.onLine ? 'wifi' : 'wifi-off')}<span id="ct-clock">${clockText()}</span>${typeof playerTitle === 'function' ? playerTitle() : ''}<span class="ct-av" style="--av:${colorFor(name)}" data-action="nav" data-to="friends">${esc((name.trim()[0] || '?').toUpperCase())}</span></div>
			<div class="ct-win">
				<button data-action="win-min">${icon('minus')}</button>
				<button data-action="win-max">${icon('square', 'sm')}</button>
				<button class="close" data-action="win-close">${icon('x')}</button>
			</div>
		</div>`;
};

// Barre d'icônes du bas, présente sur toutes les pages en interface Console.
const CONSOLE_DOCK = [
	['home', 'house', 'Accueil', '#e60012'], ['roms', 'disc-3', 'Jeux', '#ff8a00'], ['library', 'library', 'Bibliothèque', '#21a85a'],
	['friends', 'users', 'Amis', '#e5397a'], ['remote', 'wifi', 'À distance', '#1e88e5'], ['trophies', 'trophy', 'Trophées', '#e6a700'],
	['dashboard', 'gauge', 'Statistiques', '#00a3a3'], ['multiworld', 'shuffle', 'Multiworld', '#8e5be8'], ['controls', 'gamepad-2', 'Manettes', '#5d6672'],
	['mods', 'puzzle', 'Mods', '#16a596'], ['switch', 'gamepad', 'Centre Switch', '#e60012'], ['assist', 'medal', 'Succès et indices', '#f4b400'], ['shop', 'store', 'Boutique', '#f4b400'], ['settings', 'settings', 'Réglages', '#5d6672'],
];
const renderConsoleNav = () => {
	const r = state.route;
	const online = typeof friendsOnline === 'function' ? friendsOnline() : 0;
	const btn = ([to, ic, label, color]) => `<button class="cd-btn ${r.name === to || (to === 'library' && r.name === 'instance') ? 'active' : ''}" data-action="nav" data-to="${to}" data-tip="${label}" data-tip-pos="top" style="--c:${color}">${icon(ic)}${to === 'friends' && online ? `<b class="ct-badge">${online}</b>` : ''}</button>`;
	$('#nav').innerHTML = `<div class="cd-bar">${CONSOLE_DOCK.map(btn).join('')}<span class="cd-sep"></span>
		<button class="cd-btn" data-action="music-dock" data-tip="Musique" data-tip-pos="top" style="--c:#8e5be8">${icon('music')}</button>
		${typeof COMMUNITY !== 'undefined' && COMMUNITY.discord ? `<button class="cd-btn" data-action="join-discord" data-tip="Rejoindre le Discord" data-tip-pos="top" style="--c:#5865f2">${icon('message-circle')}</button>` : ''}
		<button class="cd-btn" data-action="ui-fullscreen" data-tip="Plein écran (F11)" data-tip-pos="top" style="--c:#5d6672">${icon('maximize')}</button></div>`;
};

const renderTopbar = () => {
	const crumbs = (TITLES[state.route.name] || (() => []))(state.route.params);
	const active = state.downloads.size ? [...state.downloads.values()].filter(d => d.state === 'downloading' || d.state === 'installing').length : 0;
	const n = state.running.length;
	if (consoleUi()) { renderConsoleTopbar(crumbs, active, n); return; }
	$('#topbar').innerHTML = `
		<div class="logo" data-action="nav" data-to="home">${SmashLogo.svg(26)}${SmashLogo.wordmark()}</div>
		<button class="circle-btn" data-action="back" ${state.back.length ? '' : 'disabled'} data-tip="Retour" data-tip-pos="bottom">${icon('chevron-left')}</button>
		<button class="circle-btn" data-action="forward" ${state.forward.length ? '' : 'disabled'} data-tip="Suivant" data-tip-pos="bottom">${icon('chevron-right')}</button>
		<div class="breadcrumb">${icon('play', 'sm')}${crumbs.map((c, i) => (i ? `<span class="sep">${icon('chevron-right', 'sm')}</span>` : '') + (c.to ? `<a data-action="crumb" data-i="${i}">${esc(c.label)}</a>` : `<span>${esc(c.label)}</span>`)).join('')}</div>
		<div class="spacer"></div>
		<button class="circle-btn" data-action="music-dock" data-tip="Musique : lecteur et favoris" data-tip-pos="bottom">${icon('music')}</button>
		<button class="circle-btn downloads-btn" data-action="downloads" data-tip="Téléchargements" data-tip-pos="bottom">${icon('download')}${active ? `<span class="badge">${active}</span>` : ''}</button>
		<div class="pill ${n ? 'active' : ''}" data-action="running"><span class="dot"></span>${n ? `${n} instance${n > 1 ? 's' : ''} en cours` : 'Aucune instance en cours'}</div>
		<div class="win-controls">
			<button data-action="win-min">${icon('minus')}</button>
			<button data-action="win-max">${icon('square', 'sm')}</button>
			<button class="close" data-action="win-close">${icon('x')}</button>
		</div>`;
};

// ---------- Navigation latérale ----------

const navCollapsed = () => { try { return localStorage.getItem('smash-nav') === 'collapsed'; } catch { return false; } };

const renderNav = () => {
	if (consoleUi()) { $('#nav').classList.remove('collapsed'); $('#app').classList.remove('nav-collapsed'); renderConsoleNav(); return; }
	const r = state.route;
	const collapsed = navCollapsed();
	$('#app').classList.toggle('nav-collapsed', collapsed);
	const navBtn = (name, ic, tip, badge = 0) => `<button class="nav-btn ${r.name === name ? 'active' : ''}" data-action="nav" data-to="${name}" data-tip="${collapsed ? tip : ''}">${icon(ic)}<span class="nav-label">${tip}</span>${badge ? `<span class="nav-badge">${badge}</span>` : ''}</button>`;
	const recent = [...state.instances].sort((a, b) => (b.lastPlayed || b.createdAt) - (a.lastPlayed || a.createdAt)).slice(0, 8);
	$('#nav').classList.toggle('collapsed', collapsed);
	$('#nav').innerHTML = `
		<div class="nav-group">Jouer</div>
		${navBtn('home', 'play', 'Accueil')}
		${navBtn('roms', 'disc-3', 'Jeux')}
		${navBtn('library', 'library', 'Bibliothèque')}
		${navBtn('controls', 'gamepad-2', 'Manettes')}
		${navBtn('switch', 'gamepad', 'Centre Switch')}
		${navBtn('assist', 'medal', 'Succès et indices')}
		${navBtn('remote', 'wifi', 'À distance')}
		${navBtn('friends', 'users', 'Amis', typeof friendsOnline === 'function' ? friendsOnline() : 0)}
		${navBtn('trophies', 'trophy', 'Trophées')}
		${navBtn('dashboard', 'gauge', 'Tableau de bord')}
		${navBtn('multiworld', 'shuffle', 'Multiworld')}
		${navBtn('shop', 'store', 'Boutique')}
		<div class="nav-group">Mods</div>
		${navBtn('mods', 'puzzle', 'Mods GameBanana')}
		${navBtn('discover', 'compass', 'Découvrir')}
		${navBtn('opera', 'globe', 'Recherche Opera')}
		${recent.length ? '<div class="nav-group">Récents</div>' : '<div class="nav-sep"></div>'}
		${recent.map(i => `<div class="nav-inst ${r.name === 'instance' && r.params.id === i.id ? 'active' : ''} ${isRunning(i.id) ? 'running' : ''}" data-action="open-instance" data-id="${esc(i.id)}" data-tip="${collapsed ? esc(i.name) : ''}"><span class="nav-inst-ic">${instIcon(i, 'sm')}</span><span class="nav-label">${esc(i.name)}</span></div>`).join('')}
		<button class="nav-btn" data-action="new-instance" data-tip="${collapsed ? 'Nouvelle instance' : ''}">${icon('plus')}<span class="nav-label">Nouvelle instance</span></button>
		<div class="grow"></div>
		${typeof COMMUNITY !== 'undefined' && COMMUNITY.discord ? `<button class="nav-btn nav-discord" data-action="join-discord" data-tip="${collapsed ? 'Rejoindre le Discord' : ''}">${icon('message-circle')}<span class="nav-label">Rejoindre le Discord</span></button>` : ''}
		${navBtn('settings', 'settings', 'Paramètres')}
		<button class="nav-btn nav-toggle" data-action="nav-collapse" data-tip="${collapsed ? 'Agrandir le menu' : ''}">${icon(collapsed ? 'chevron-right' : 'chevron-left')}<span class="nav-label">Réduire le menu</span></button>`;
};

const render = () => {
	if (state.settings) {
		applyTheme(currentTheme());
		const root = document.documentElement;
		root.dataset.font = state.settings.fontMode || 'titles';
		root.dataset.ui = consoleUi() ? 'console' : 'classic';
		try { localStorage.setItem('smash-ui', root.dataset.ui); } catch { /* */ }
		root.dataset.decorUi = state.settings.consoleBg || 'bulles';
		// Style de l'interface Console : couleurs du thème choisi (par défaut), clair ou sombre.
		root.dataset.uiStyle = ['light', 'dark'].includes(state.settings.consoleStyle) ? state.settings.consoleStyle : 'theme';
		root.toggleAttribute('data-ui-dark', state.settings.consoleStyle === 'dark');
		if (!consoleUi() && typeof uiTint === 'function') uiTint(null);
		// Fond d'écran du jeu : seulement sur l'accueil (jeu sélectionné) et sur la page du jeu.
		if (typeof uiWall === 'function' && !['home', 'instance'].includes(state.route.name)) uiWall(null);
		if (root.dataset.uiStyle === 'theme') for (const v of ['--brand', '--brand-rgb', '--brand-hover']) root.style.removeProperty(v);
		try { localStorage.setItem('smash-ui-style', root.dataset.uiStyle); } catch { /* */ }
	}
	renderTopbar();
	renderNav();
	state.prevRendered = state.rendered;
	state.rendered = state.route.name;
	if (typeof DANCER !== 'undefined') DANCER.update();
	const page = PAGES[state.route.name] || PAGES.home;
	page(state.route.params);
};

// ---------- Actions communes ----------

const launchInstance = async (id) => {
	try {
		state.running = await api('run:launch', id);
		toast(`${esc(instById(id).name)} se lance…`, { type: 'info' });
	} catch (error) {
		toastError(error);
		if (/ROM|introuvable/.test(error.message)) go('instance', { id, tab: /ROM/.test(error.message) ? 'options' : 'content' });
	}
	await refreshInstances();
	render();
};

const stopInstance = async (id) => {
	try { state.running = await api('run:stop', id); } catch (error) { toastError(error); }
};

const playButton = (inst, cls = '') => isRunning(inst.id)
	? `<button class="btn stop ${cls}" data-action="stop" data-id="${esc(inst.id)}">${icon('square', 'sm')}Arrêter</button>`
	: `<button class="btn primary ${cls}" data-action="play" data-id="${esc(inst.id)}">${icon('play')}Jouer</button>`;

const instanceMenu = (anchor, inst) => menu(anchor, [
	isRunning(inst.id) ? { icon: 'square', label: 'Arrêter', run: () => stopInstance(inst.id) } : { icon: 'play', label: 'Jouer', run: () => launchInstance(inst.id) },
	{ icon: 'music', label: 'Bande-son', run: () => openSoundtrack(instGameName(inst), sysOf(inst)) },
	...(typeof openBackgrounds === 'function' ? [{ icon: 'image', label: 'Fond d’écran…', run: () => openBackgrounds(inst) }] : []),
	...(['wii', 'gc'].includes(sysOf(inst)) ? [{ icon: 'users', label: 'Multijoueur en ligne (NetPlay)…', run: () => openNetplay(inst) }] : []),
	...(inst.type === 'rom' ? [{ icon: 'image', label: 'Jaquette et images…', run: () => openCovers(inst) }] : []),
	...(inst.type === 'rom' && instEngine(inst) === 'smash' ? [{ icon: 'gamepad-2', label: 'Manettes de ce jeu', run: () => go('controls', { system: sysOf(inst), instance: inst.id }) }] : []),
	{ icon: 'puzzle', label: 'Ajouter du contenu', run: () => openDiscoverFor(inst) },
	{ icon: 'folder-open', label: 'Ouvrir le dossier', run: () => api('instance:openFolder', inst.id) },
	{ icon: 'copy', label: 'Dupliquer', run: () => duplicateInstance(inst.id) },
	'-',
	{ icon: 'trash-2', label: 'Supprimer', danger: true, run: () => deleteInstance(inst) },
]);

const duplicateInstance = async (id) => {
	try {
		const copy = await api('instance:duplicate', id);
		await refreshInstances();
		toast(`Instance dupliquée : ${esc(copy.name)}`);
		go('instance', { id: copy.id });
	} catch (error) { toastError(error); }
};

const deleteInstance = async (inst) => {
	const ok = await confirmModal('Supprimer l\'instance', `L'instance <b>${esc(inst.name)}</b> et tout son contenu (mods, sauvegardes, ROM copiée) seront supprimés définitivement.`, { confirm: 'Supprimer', danger: true });
	if (!ok) return;
	try {
		await api('instance:delete', inst.id);
		await refreshInstances();
		toast(`« ${esc(inst.name)} » supprimée`);
		go('library', {}, { push: false });
	} catch (error) { toastError(error); }
};

const openDiscoverFor = (inst) => {
	const romId = inst.rom && (inst.rom.libraryId || inst.rom.info.md5);
	if (inst.type === 'rom' && sysOf(inst) === 'n64' && romId && state.roms.some(r => r.id === romId)) go('suggest', { romId, instanceId: inst.id });
	else if (inst.type === 'rom') go('opera', { instanceId: inst.id });
	else go('discover', { instanceId: inst.id });
};

// ---------- Fenêtre « Créer une instance » (comme Modrinth) ----------

const romChoices = type => state.roms.filter(r => type !== 'coopdx' || r.info.isSm64Us);

// Importe des ROM (fichiers ou zips) dans la bibliothèque ; renvoie les ROM ajoutées.
const importRomsDialog = async () => {
	const files = await api('dialog:open', { multi: true, filters: [{ name: 'Jeux (toutes consoles) ou archive', extensions: [...state.info.extensions, 'zip', '7z', 'rar'] }] });
	if (!files) return [];
	return importRomFiles(files);
};

const askSystem = r => modal({
	title: 'Quelle console ?',
	body: `<div class="muted">Smash Emu n’a pas pu reconnaître à coup sûr la console de <b>${esc(r.originalName || r.name)}</b>. Choisis-la :</div>
		<div class="chips">${(r.needsSystem || []).map(id => `<button class="chip ${id === r.system ? 'active' : ''}" data-sys="${id}">${esc(sysInfo(id).label)}</button>`).join('')}</div>`,
	setup: (el, close) => el.addEventListener('click', (e) => { const b = e.target.closest('[data-sys]'); if (b) close(b.dataset.sys); }),
});

const importRomFiles = async (files) => {
	const { added, errors } = await api('roms:import', files);
	state.roms = await api('roms:list');
	for (const e of errors) toast(esc(e), { type: 'error' });
	// Image disque sans signature claire (.iso, .bin…) : on demande la console.
	for (const r of added.filter(x => x.needsSystem && !x.duplicate)) {
		const sys = await askSystem(r);
		if (sys) { await api('roms:setSystem', r.id, sys); r.system = sys; }
	}
	if (added.some(x => x.needsSystem)) state.roms = await api('roms:list');
	const fresh = added.filter(r => !r.duplicate);
	if (fresh.length) toast(`${fresh.length} ROM ajoutée${fresh.length > 1 ? 's' : ''} : ${fresh.map(r => `<b>${esc(r.name)}</b>`).join(', ')}`);
	else if (added.length) toast(`Déjà dans ta bibliothèque : ${added.map(r => `<b>${esc(r.name)}</b>`).join(', ')}`, { type: 'info' });
	return added;
};

const createInstanceModal = (preset = {}) => {
	const st = { type: preset.type || 'coopdx', iconPath: null, romId: preset.romId || null };
	if (st.romId) st.type = 'rom';
	const typeCard = (t, ic, title, desc) => `<button class="pick-item ${st.type === t ? 'selected' : ''}" data-type="${t}" style="flex:1"><div class="avatar sm">${icon(ic)}</div><div><div class="bold">${title}</div><div class="small muted">${desc}</div></div></button>`;
	const romList = () => {
		const list = romChoices(st.type);
		if (st.romId && !list.some(r => r.id === st.romId)) st.romId = null;
		const hint = st.type === 'coopdx'
			? 'Facultatif : si sm64coopdx a déjà ta ROM Super Mario 64 (US), elle sera reprise automatiquement.'
			: 'Choisis la ROM du jeu. Les patchs de ROM hack s\'ajoutent ensuite comme des mods.';
		return `<div class="small muted">${hint}</div>
			${list.length ? `<div class="pick-list" style="max-height:200px">${list.map(r => `
				<button class="pick-item ${st.romId === r.id ? 'selected' : ''}" data-rom="${esc(r.id)}">
					${romCover(r, 'sm')}
					<div class="grow"><div class="bold ellipsis">${esc(r.name)}</div><div class="small muted">${esc(sysInfo(r.system).label)}${r.info.region ? ` · ${esc(r.info.region)}` : ''} · ${bytes(r.info.size)}</div></div>
					${st.romId === r.id ? icon('check') : ''}
				</button>`).join('')}</div>`
		: `<div class="rom-box muted small">${st.type === 'coopdx' ? 'Aucune ROM Super Mario 64 (US) dans ta bibliothèque.' : 'Ta bibliothèque de ROM est vide.'}</div>`}`;
	};
	return modal({
		title: 'Créer une instance',
		width: 580,
		body: `
			<div class="icon-picker">
				<div id="ci-icon">${avatar(null, preset.name || '?', 'lg')}</div>
				<div class="btns">
					<button class="btn sm" data-pick-icon>${icon('upload')}Choisir une icône</button>
					<button class="btn sm ghost" data-remove-icon disabled>${icon('trash-2')}Retirer l'icône</button>
				</div>
			</div>
			<div class="field"><label for="ci-name">Nom</label><input class="input" id="ci-name" placeholder="Ex. Star Road entre amis" maxlength="60" value="${esc(preset.name || '')}"></div>
			<div class="field"><span class="label">Jeu</span><div class="row" id="ci-types"></div></div>
			<div class="field"><div class="row"><span class="label grow">ROM</span><button class="btn sm" data-import-rom>${icon('file-plus')}Importer une ROM…</button></div><div id="ci-rom" class="col" style="gap:8px"></div></div>
			<div class="field"><label for="ci-group">Groupe <span class="muted small">(facultatif)</span></label><input class="input" id="ci-group" placeholder="Ex. Hacks, Multijoueur…" list="ci-groups"><datalist id="ci-groups">${[...new Set(state.instances.map(i => i.group).filter(Boolean))].map(g => `<option value="${esc(g)}">`).join('')}</datalist></div>`,
		foot: `<button class="btn" data-cancel>Annuler</button><button class="btn primary" data-create>${icon('plus')}Créer</button>`,
		setup: (el, close) => {
			const paint = () => {
				$('#ci-types', el).innerHTML = typeCard('coopdx', 'users', 'SM64 Coop DX', 'Mods Lua & packs DynOS, multijoueur') + typeCard('rom', 'joystick', 'Jeu', 'De la NES à la Switch');
				$('#ci-rom', el).innerHTML = romList();
			};
			paint();
			el.addEventListener('click', async (e) => {
				const t = e.target.closest('[data-type]');
				if (t) { st.type = t.dataset.type; paint(); return; }
				const r = e.target.closest('[data-rom]');
				if (r) {
					st.romId = st.romId === r.dataset.rom && st.type === 'coopdx' ? null : r.dataset.rom;
					const rom = state.roms.find(x => x.id === st.romId);
					if (rom && !$('#ci-name', el).value) { $('#ci-name', el).value = rom.name; if (!st.iconPath) $('#ci-icon', el).innerHTML = avatar(null, rom.name, 'lg'); }
					paint();
					return;
				}
				if (e.target.closest('[data-import-rom]')) {
					const added = await importRomsDialog();
					const ok = added.filter(x => st.type !== 'coopdx' || x.info.isSm64Us);
					if (ok.length) {
						st.romId = ok[0].id;
						if (!$('#ci-name', el).value) $('#ci-name', el).value = ok[0].name;
					} else if (added.length) toast('Cette ROM ne convient pas à sm64coopdx (il faut Super Mario 64 US).', { type: 'error' });
					paint();
				}
				if (e.target.closest('[data-pick-icon]')) {
					const p = await api('dialog:open', { filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico'] }] });
					if (!p) return;
					st.iconPath = p;
					$('#ci-icon', el).innerHTML = avatar(fileUrl(p), 'x', 'lg');
					$('[data-remove-icon]', el).disabled = false;
				}
				if (e.target.closest('[data-remove-icon]')) {
					st.iconPath = null;
					$('#ci-icon', el).innerHTML = avatar(null, $('#ci-name', el).value || '?', 'lg');
					$('[data-remove-icon]', el).disabled = true;
				}
				if (e.target.closest('[data-cancel]')) close(null);
				if (e.target.closest('[data-create]')) {
					const name = $('#ci-name', el).value.trim();
					if (!name) { $('#ci-name', el).focus(); return; }
					if (st.type === 'rom' && !st.romId) { toast('Choisis ou importe d\'abord une ROM pour cette instance.', { type: 'error' }); return; }
					try {
						const inst = await api('instance:create', { name, type: st.type, group: $('#ci-group', el).value.trim(), iconPath: st.iconPath, romId: st.romId });
						close(inst);
					} catch (error) { toastError(error); }
				}
			});
			$('#ci-name', el).addEventListener('input', (e) => { if (!st.iconPath) $('#ci-icon', el).innerHTML = avatar(null, e.target.value || '?', 'lg'); });
			$('#ci-name', el).addEventListener('keydown', (e) => { if (e.key === 'Enter') $('[data-create]', el).click(); });
		},
	});
};

const newInstance = async (preset) => {
	const inst = await createInstanceModal(preset);
	if (!inst) return null;
	await refreshInstances();
	toast(`Instance « ${esc(inst.name)} » créée`);
	return inst;
};

// ---------- Choisir une instance (installation) ----------

const pickInstance = ({ types = ['coopdx', 'rom'], title = 'Installer dans…', what = '' } = {}) => {
	const list = state.instances.filter(i => types.includes(i.type));
	return modal({
		title,
		body: `${what ? `<div class="muted">${what}</div>` : ''}
			${list.length ? `<div class="pick-list">${list.map(i => `<button class="pick-item" data-id="${esc(i.id)}">${instIcon(i, 'sm')}<div class="grow"><div class="bold ellipsis">${esc(i.name)}</div><div class="small muted">${esc(instKind(i))} · ${i.contentCount} contenu${i.contentCount > 1 ? 's' : ''}</div></div>${icon('chevron-right', 'sm')}</button>`).join('')}</div>`
		: `<div class="empty" style="padding:24px">${icon('square-stack')}<h3>Aucune instance compatible</h3><div>Crée une instance ${types.map(typeLabel).join(' ou ')} pour installer ce contenu.</div></div>`}`,
		foot: `<button class="btn" data-new>${icon('plus')}Nouvelle instance</button>`,
		setup: (el, close) => {
			el.addEventListener('click', async (e) => {
				const b = e.target.closest('[data-id]');
				if (b) close(b.dataset.id);
				if (e.target.closest('[data-new]')) {
					close(null);
					const inst = await newInstance({ type: types[0] });
					if (pendingPick) pendingPick(inst ? inst.id : null);
				}
			});
		},
	});
};
let pendingPick = null;
const chooseInstance = async (opts) => {
	if (opts.instanceId) return opts.instanceId;
	return new Promise((resolve) => {
		pendingPick = (id) => { pendingPick = null; resolve(id); };
		pickInstance(opts).then((id) => { if (id || !pendingPick) { pendingPick = null; resolve(id); } });
	}).then(id => { render(); return id; });
};

// ---------- Installation depuis le catalogue ----------

const installFromCatalog = async (mod, instanceId = null) => {
	try {
		const id = await chooseInstance({ instanceId, types: ['coopdx'], title: 'Installer le mod', what: `Choisis l'instance SM64 Coop DX où installer <b>${esc(mod.title)}</b>.` });
		if (!id) return;
		let files = await api('catalog:files', mod.slug);
		if (!files.length) throw new Error('Aucun fichier téléchargeable pour ce mod.');
		if (files[0].external) {
			const ok = await confirmModal('Téléchargement externe', `<b>${esc(mod.title)}</b> se télécharge sur <b>${esc(files[0].name)}</b>, pas directement sur le site des mods.<br><br>Ouvre-le dans Opera : le fichier que tu y télécharges apparaîtra dans <b>Recherche Opera</b> avec un bouton <b>Installer</b>.`, { confirm: 'Ouvrir dans Opera' });
			if (!ok) return;
			await api('shell:open', files[0].external);
			go('opera', { instanceId: id });
			return;
		}
		if (files.length > 1) {
			files = await modal({
				title: 'Fichiers à installer',
				body: `<div class="muted">Ce mod propose plusieurs fichiers. Coche ceux à installer :</div>
					<div class="pick-list">${files.map((f, i) => `<label class="pick-item ${i === 0 ? 'selected' : ''}"><input type="checkbox" data-i="${i}" ${i === 0 ? 'checked' : ''} style="accent-color:var(--brand)">${icon('file-archive')}<div class="grow"><div class="bold">${esc(f.name)}</div><div class="small muted">${esc(f.size || '')}</div></div></label>`).join('')}</div>`,
				foot: '<button class="btn" data-no>Annuler</button><button class="btn primary" data-ok>Installer</button>',
				setup: (el, close) => {
					el.addEventListener('change', e => e.target.closest('.pick-item').classList.toggle('selected', e.target.checked));
					el.querySelector('[data-no]').onclick = () => close(null);
					el.querySelector('[data-ok]').onclick = () => close($$('input:checked', el).map(c => files[+c.dataset.i]));
				},
			});
			if (!files || !files.length) return;
		}
		for (const f of files) {
			const installed = await api('catalog:install', { instanceId: id, slug: mod.slug, fileUrl: f.url, fileName: f.name, title: mod.title, version: mod.version, icon: mod.icon });
			warnConflicts(installed);
			const inst = instById(id) || { name: id };
			toast(`<b>${esc(mod.title)}</b> installé dans ${esc(inst.name)} (${installed.map(i => esc(i.name)).join(', ')})`, {
				actions: [{ label: 'Jouer', run: () => launchInstance(id) }, { label: 'Voir l\'instance', run: () => go('instance', { id }) }],
			});
		}
		await refreshInstances();
		render();
	} catch (error) { toastError(error); }
};

// ---------- Installation depuis Opera ----------

const typesForFile = (name) => {
	const ext = name.toLowerCase().split('.').pop();
	if (ext === 'lua') return ['coopdx'];
	if (ext === 'ips' || ext === 'bps') return ['rom'];
	return ['coopdx', 'rom'];
};

const installOperaFile = async (file, instanceId = null) => {
	try {
		const id = await chooseInstance({ instanceId, types: typesForFile(file.name), title: 'Installer le téléchargement', what: `<b>${esc(file.name)}</b> (${bytes(file.size)}), téléchargé avec Opera.` });
		if (!id) return;
		const installed = await api('opera:install', id, file.path);
		warnConflicts(installed);
		state.opera.fresh.delete(file.path);
		await refreshInstances();
		toast(`${installed.map(i => `<b>${esc(i.name)}</b>`).join(', ')} installé dans ${esc(instById(id).name)}`, {
			actions: [{ label: 'Jouer', run: () => launchInstance(id) }, { label: 'Voir l\'instance', run: () => go('instance', { id }) }],
		});
		render();
	} catch (error) { toastError(error); }
};

// Signale les mods installés mais laissés désactivés car incompatibles avec un mod actif.
const warnConflicts = (installed) => {
	for (const c of installed.map(i => i.conflict).filter(Boolean)) {
		toast(`<b>${esc(c.name)}</b> est incompatible avec ${c.with.map(w => `<b>${esc(w)}</b>`).join(', ')} (${esc(c.tags.join(', '))}) : installé mais <b>désactivé</b>. Active-le à la place de l’autre si tu préfères.`, { type: 'error', timeout: 9000 });
	}
};

const installLocalFiles = async (id, paths) => {
	if (!paths || !paths.length) return;
	try {
		const installed = await api('content:installFiles', id, paths);
		warnConflicts(installed);
		toast(`${installed.length} élément${installed.length > 1 ? 's' : ''} installé${installed.length > 1 ? 's' : ''} : ${installed.map(i => esc(i.name)).join(', ')}`);
	} catch (error) { toastError(error); }
	await refreshInstances();
	render();
};

// =====================================================================
// Pages
// =====================================================================

const setMain = (html, side = '') => {
	$('#main').innerHTML = `<section class="page" id="page">${html}</section>${side ? `<aside class="side">${side}</aside>` : ''}`;
	themeDress();
};

// Thèmes Persona : grand mot de la page en fond (titre de la page) et, pour Persona 5 Royal, titres en lettres
// découpées. Seul le texte direct du titre est découpé (les compteurs et icônes à l'intérieur restent intacts).
const themeDress = () => {
	const icons = document.documentElement.dataset.icons;
	if (icons !== 'abyss' && icons !== 'phantom') return;
	const h1 = $('#page h1');
	const title = h1 ? [...h1.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').trim() : '';
	const deco = $('#decor');
	let crumb = '';
	try { crumb = TITLES[state.route.name] ? (TITLES[state.route.name](state.route.params || {})[0] || {}).label || '' : ''; } catch { /* titre calculé */ }
	if (deco) SmashThemes.fxWord(deco, title || crumb);
	if (icons !== 'phantom' || !h1 || h1.dataset.ransom) return;
	h1.dataset.ransom = '1';
	for (const n of [...h1.childNodes]) {
		if (n.nodeType !== 3 || !n.textContent.trim()) continue;
		const span = document.createElement('span');
		span.className = 'ransom';
		span.innerHTML = SmashThemes.ransom(n.textContent.trim());
		n.replaceWith(span, document.createTextNode(' '));
	}
};

// ---------- Accueil ----------

const jumpRow = (i) => `
	<div class="jump-row" data-action="open-instance" data-id="${esc(i.id)}">
		${instIcon(i)}
		<div class="grow">
			<div class="title"><span class="ellipsis">${esc(i.name)}</span>${isRunning(i.id) ? '<span class="tag green">En cours</span>' : ''}</div>
			<div class="meta">${icon(TYPE_ICON[i.type], 'sm')}${esc(instKind(i))}<span class="dot"></span>${i.enabledCount} mod${i.enabledCount > 1 ? 's' : ''} actif${i.enabledCount > 1 ? 's' : ''}<span class="dot"></span>${ago(i.lastPlayed)}</div>
		</div>
		${playButton(i)}
		<button class="icon-btn" data-action="inst-menu" data-id="${esc(i.id)}">${icon('ellipsis-vertical')}</button>
	</div>`;

const instCard = i => `
	<div class="inst-card" data-action="open-instance" data-id="${esc(i.id)}">
		<div class="cover ${i.coverFile ? 'boxart' : ''}">${i.coverFile ? `<img src="${fileUrl(i.coverFile)}?v=${i.coverAt || 0}" alt="">` : i.iconData ? `<img src="${i.iconData}" alt="">` : `<span class="letter" style="color:${colorForName(i.name)}">${esc(i.name[0].toUpperCase())}</span>`}</div>
		<button class="play-fab ${isRunning(i.id) ? 'running' : ''}" data-action="${isRunning(i.id) ? 'stop' : 'play'}" data-id="${esc(i.id)}" data-tip="${isRunning(i.id) ? 'Arrêter' : 'Jouer'}">${icon(isRunning(i.id) ? 'square' : 'play')}</button>
		<div class="name ellipsis">${esc(i.name)}</div>
		<div class="sub">${esc(instKind(i))}${i.group ? ` · ${esc(i.group)}` : ''}</div>
	</div>`;
const colorForName = n => (avatar(null, n).match(/color:([^"]+)"/) || [])[1];

const sortInstances = (list, sort) => [...list].sort({
	played: (a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || b.createdAt - a.createdAt,
	name: (a, b) => a.name.localeCompare(b.name),
	created: (a, b) => b.createdAt - a.createdAt,
	time: (a, b) => (b.playTimeMs || 0) - (a.playTimeMs || 0),
}[sort]);

const libraryToolbar = () => `
	<div class="toolbar">
		<div class="search">${icon('search')}<input class="input" data-input="lib-query" placeholder="Rechercher une instance" value="${esc(state.ui.libQuery)}"></div>
		<button class="btn primary" data-action="new-instance">${icon('plus')}Nouvelle instance</button>
	</div>
	<div class="toolbar">
		<div class="chips">${[['all', 'Tout', 'layout-grid'], ['coopdx', 'Coop DX', 'users'], ['rom', 'Jeux', 'joystick']].map(([v, l, ic]) => `<button class="chip ${state.ui.libType === v ? 'active' : ''}" data-action="lib-type" data-v="${v}">${icon(ic)}${l}</button>`).join('')}</div>
		<div class="grow"></div>
		<select class="select" data-input="lib-sort">${[['played', 'Dernière partie'], ['name', 'Nom'], ['created', 'Date de création'], ['time', 'Temps de jeu']].map(([v, l]) => `<option value="${v}" ${state.ui.libSort === v ? 'selected' : ''}>Trier : ${l}</option>`).join('')}</select>
		<select class="select" data-input="lib-group">${[['none', 'Aucun'], ['group', 'Groupe'], ['type', 'Jeu']].map(([v, l]) => `<option value="${v}" ${state.ui.libGroup === v ? 'selected' : ''}>Grouper : ${l}</option>`).join('')}</select>
	</div>`;

const libraryGrid = () => {
	const q = state.ui.libQuery.toLowerCase();
	let list = state.instances.filter(i => (state.ui.libType === 'all' || i.type === state.ui.libType) && (!q || i.name.toLowerCase().includes(q)));
	list = sortInstances(list, state.ui.libSort);
	if (!state.instances.length) {
		return `<div class="empty">${icon('square-stack')}<h3>Aucune instance</h3><div>Une instance, c'est un jeu avec ses propres mods, réglages et sauvegardes.</div><button class="btn primary" data-action="new-instance">${icon('plus')}Créer ma première instance</button></div>`;
	}
	if (!list.length) return '<div class="empty">Aucune instance ne correspond.</div>';
	if (state.ui.libGroup === 'none') return `<div class="grid">${list.map(instCard).join('')}</div>`;
	const groups = new Map();
	for (const i of list) {
		const k = state.ui.libGroup === 'type' ? instKind(i) : (i.group || 'Sans groupe');
		if (!groups.has(k)) groups.set(k, []);
		groups.get(k).push(i);
	}
	return [...groups].map(([k, items]) => `<h3 class="mt" style="margin-bottom:12px">${esc(k)} <span class="muted small">${items.length}</span></h3><div class="grid">${items.map(instCard).join('')}</div>`).join('');
};

const homeSide = () => {
	const fresh = state.opera.files.slice(0, 3);
	const popular = state.cache.popular;
	return `
		<div>
			<h3>Jouer en tant que</h3>
			<div class="card player-card">
				${avatar(null, state.settings.playerName, 'sm round')}
				<input class="input" data-input="player-name" value="${esc(state.settings.playerName)}" maxlength="20" placeholder="Pseudo">
			</div>
			<div class="small muted" style="margin-top:8px">Pseudo utilisé par sm64coopdx (modifiable par instance).</div>
		</div>
		<div>
			<h3>Téléchargés avec Opera</h3>
			${fresh.length ? fresh.map(f => `<div class="mini-mod" data-action="${f.kind === 'rom' ? 'rom-add' : 'opera-install'}" data-path="${esc(f.path)}"><div class="avatar sm">${icon(f.kind === 'rom' ? 'disc-3' : 'file-archive')}</div><div class="grow"><div class="t ellipsis">${esc(f.name)}</div><div class="small muted">${f.kind === 'rom' ? 'ROM' : 'Mod'} · ${ago(f.mtime)}</div></div><span class="tag green">${f.kind === 'rom' ? (f.imported ? 'Ajoutée' : 'Ajouter') : 'Installer'}</span></div>`).join('')
		: `<div class="small muted">Rien pour l'instant. Cherche des mods depuis <a data-action="nav" data-to="opera">Recherche Opera</a> : ce que tu télécharges apparaîtra ici.</div>`}
		</div>
		<div>
			<h3>Mods populaires</h3>
			<div id="popular">${popular ? popular.map(m => `<div class="mini-mod" data-action="open-project" data-slug="${esc(m.slug)}" data-title="${esc(m.title)}">${avatar(m.icon, m.title, 'sm')}<div class="grow"><div class="t ellipsis">${esc(m.title)}</div><div class="small muted">${compact(m.downloads)} téléchargements</div></div></div>`).join('') : '<div class="loading"><div class="spinner"></div></div>'}</div>
		</div>`;
};

const heroCard = (i) => {
	const engine = i.type === 'rom' ? instEngine(i) : null;
	return `
	<div class="hero" data-action="open-instance" data-id="${esc(i.id)}">
		<div class="hero-bg">${i.coverFile ? `<img src="${fileUrl(i.coverFile)}?v=${i.coverAt || 0}" alt="">` : i.iconData ? `<img src="${i.iconData}" alt="">` : ''}</div>
		<div class="hero-body">
			${instIcon(i, 'xl')}
			<div class="grow">
				<div class="hero-kicker">${isRunning(i.id) ? '► EN COURS' : i.lastPlayed ? '► REPRENDRE' : '► NOUVEAU'}</div>
				<div class="hero-title">${esc(i.name)}</div>
				<div class="hero-meta">${icon(TYPE_ICON[i.type], 'sm')}${esc(instKind(i))}${engine ? ` · ${esc(engineLabel(engine))}` : ''} · ${i.enabledCount} mod${i.enabledCount > 1 ? 's' : ''} actif${i.enabledCount > 1 ? 's' : ''} · ${playTime(i.playTimeMs)} de jeu</div>
			</div>
			${isRunning(i.id)
		? `<button class="btn lg stop" data-action="stop" data-id="${esc(i.id)}">${icon('square', 'sm')}Arrêter</button>`
		: `<button class="btn lg primary hero-play" data-action="play" data-id="${esc(i.id)}">${icon('play')}JOUER</button>`}
		</div>
	</div>`;
};

const homeStats = () => {
	const mods = state.instances.reduce((n, i) => n + (i.enabledCount || 0), 0);
	const time = state.instances.reduce((n, i) => n + (i.playTimeMs || 0), 0);
	const tile = (ic, value, label, to) => `<div class="stat-tile" ${to ? `data-action="nav" data-to="${to}"` : ''}>${icon(ic)}<div><b>${value}</b><span>${label}</span></div></div>`;
	return `<div class="stat-row">
		${tile('square-stack', state.instances.length, 'instances', 'library')}
		${tile('disc-3', state.roms.length, 'ROMs', 'roms')}
		${tile('puzzle', mods, 'mods actifs', null)}
		${tile('clock', time < 60000 ? '0 min' : playTime(time), 'de jeu', null)}
	</div>`;
};

// ---------- Présence Discord ----------

const DISCORD_STATE = {
	off: ['', 'Désactivée'],
	connecting: ['orange', 'Connexion à Discord…'],
	connected: ['green', 'Connectée'],
	'no-discord': ['orange', 'Discord n’est pas ouvert : nouvel essai toutes les 15 s'],
	invalid: ['red', 'Application ID à vérifier'],
	error: ['red', 'Erreur'],
};
const drawDiscordState = (st) => {
	const el = document.getElementById('discord-state');
	if (!el || !st) return;
	const [tone, label] = DISCORD_STATE[st.status] || DISCORD_STATE.off;
	const a = st.activity;
	el.innerHTML = `<span class="tag ${tone}">${esc(label)}</span>${st.user ? `<span class="muted">compte ${esc(st.user)}</span>` : ''}${st.error && st.status !== 'connected' ? `<span class="muted">${esc(st.error)}</span>` : ''}${st.status === 'connected' && a ? `<span class="muted">Affiché : ${esc([a.details, a.state].filter(Boolean).join(' · '))}</span>` : ''}`;
};
window.launcher.on('discord:state', () => api('discord:status').then(drawDiscordState).catch(() => {}));

// ---------- Éditeur de thème ----------

const ICON_STYLE_LABEL = { default: 'Classique', wii: 'Icônes Wii', ornate: 'Ornements dorés', pixel: 'Pixel', neon: 'Néon', paper: 'Papier', bubble: 'Bulles', tech: 'Futuriste' };
const PARTICLE_LABEL = { none: 'Aucune', fairies: 'Fées', stars: 'Étoiles', coins: 'Pièces', leaves: 'Feuilles', bubbles: 'Bulles', sparks: 'Étincelles', ghosts: 'Fantômes', petals: 'Pétales', embers: 'Braises', hearts: 'Cœurs', notes: 'Notes', rain: 'Pluie', warp: 'Vitesse lumière', confetti: 'Confettis', moons: 'Lunes' };
const MOTIF_LABEL = { star: 'Étoile', starA: 'Étoile (accent)', mushroom: 'Champignon', coin: 'Pièce', brick: 'Brique', pipe: 'Tuyau', cloud: 'Nuage', hill: 'Colline', castle: 'Château', planet: 'Planète', moon: 'Lune', hat: 'Casquette', flag: 'Drapeau', wheel: 'Roue', burst: 'Explosion', door: 'Porte', ghost: 'Fantôme', lantern: 'Lampe', fairy: 'Fée', sword: 'Épée', shield: 'Bouclier', ocarina: 'Ocarina', glider: 'Paravoile', mountain: 'Montagne', gem: 'Gemme', island: 'Île', boat: 'Bateau', wave: 'Vagues', sun: 'Soleil', ball: 'Balle', bolt: 'Éclair', ring: 'Anneau', swords: 'Épées croisées', crown: 'Couronne', barrel: 'Tonneau', banana: 'Banane', palm: 'Palmier', heart: 'Cœur', visor: 'Casque', orb: 'Orbe', ship: 'Vaisseau', leaf: 'Feuille', tennis: 'Tennis', pin: 'Quille', board: 'Planche', paw: 'Patte', bone: 'Os', speech: 'Bulle', house: 'Maison', sprout: 'Pousse', flower: 'Fleur', present: 'Cadeau', egg: 'Œuf', micro: 'Mini-jeu', dice: 'Dé', tank: 'Tank', spot: 'Projecteur', note: 'Note', swordGlow: 'Épée lumineuse' };

const saveCustomTheme = async (t, use = true) => {
	const list = [...(state.settings.customThemes || [])];
	const def = { id: t.id, label: t.label, tagline: t.tagline, bg: t.bg, accent: t.accent, accent2: t.accent2, font: t.font, icons: t.icons, particles: t.particles, motifs: t.motifs, light: t.light, image: t.image, sticker: t.sticker, imageDim: t.imageDim, imageBlur: t.imageBlur };
	const k = list.findIndex(x => x.id === t.id);
	if (k >= 0) list[k] = def; else list.push(def);
	state.settings = await api('settings:set', { customThemes: list.slice(-30), ...(use ? { theme: t.id } : {}) });
	api('themes:cleanup').catch(() => {});
	syncCustomThemes();
	render();
};

const openThemeEditor = async (existing) => {
	const before = state.settings.theme;
	let t = SmashThemes.normalize(existing || { label: 'Mon thème', bg: '#120f1c', accent: '#ff3d7f', accent2: '#ffd23f', font: 'Fredoka', icons: 'bubble', particles: 'stars', motifs: ['star', 'planet', 'heart'] });
	const preview = () => { SmashThemes.register(t); applyTheme(t.id); const art = document.getElementById('te-art'); if (art) art.innerHTML = SmashThemes.scene(t.id); };
	const saved = await modal({
		title: existing ? 'Modifier le thème' : 'Créer un thème',
		width: 860,
		body: `<div class="te">
			<div class="te-form">
				<div class="field"><label>Nom</label><input class="input" id="te-label" maxlength="40" value="${esc(t.label)}"></div>
				<div class="field"><label>Description</label><input class="input" id="te-tagline" maxlength="80" value="${esc(t.tagline)}"></div>
				<div class="te-colors">
					<label>Fond<input type="color" id="te-bg" value="${t.bg}"></label>
					<label>Accent<input type="color" id="te-accent" value="${t.accent}"></label>
					<label>Accent 2<input type="color" id="te-accent2" value="${t.accent2}"></label>
					<label class="te-check"><input type="checkbox" id="te-light" ${t.light ? 'checked' : ''}> Thème clair</label>
				</div>
				<div class="field"><label>Images</label>
					<div class="te-images">
						<div class="te-img" data-k="image"><div class="te-img-prev" id="te-prev-image"></div><div><b>Fond</b><span>Recouvre toute la fenêtre (paysage, fond d’écran…)</span><div class="row" style="gap:4px"><button class="btn sm" data-img="pick" data-k="image">${icon('image')}Choisir</button><button class="btn sm" data-img="clear" data-k="image">${icon('x')}</button></div></div></div>
						<div class="te-img" data-k="sticker"><div class="te-img-prev" id="te-prev-sticker"></div><div><b>Illustration</b><span>Personnage ou logo, idéalement un PNG transparent</span><div class="row" style="gap:4px"><button class="btn sm" data-img="pick" data-k="sticker">${icon('image')}Choisir</button><button class="btn sm" data-img="clear" data-k="sticker">${icon('x')}</button></div></div></div>
					</div>
					<div class="te-sliders">
						<label>Assombrir le fond <input type="range" id="te-dim" min="0" max="0.9" step="0.05" value="${t.imageDim}"></label>
						<label>Flou du fond <input type="range" id="te-blur" min="0" max="20" step="1" value="${t.imageBlur}"></label>
					</div>
				</div>
				<div class="field"><label>Police</label><select class="input" id="te-font">${SmashThemes.FONTS.map(f => `<option ${t.font === f ? 'selected' : ''} style="font-family:'${f}'">${f}</option>`).join('')}</select></div>
				<div class="field"><label>Style des icônes</label><div class="chips" id="te-icons">${SmashThemes.ICON_STYLES.map(v => `<button class="chip ${t.icons === v ? 'active' : ''}" data-v="${v}">${ICON_STYLE_LABEL[v]}</button>`).join('')}</div></div>
				<div class="field"><label>Décor animé</label><div class="chips" id="te-particles">${['none', ...SmashThemes.PARTICLE_TYPES].map(v => `<button class="chip ${t.particles === v ? 'active' : ''}" data-v="${v}">${PARTICLE_LABEL[v] || v}</button>`).join('')}</div></div>
				<div class="field"><label>Illustration (4 motifs au maximum)</label><div class="chips te-motifs" id="te-motifs">${SmashThemes.MOTIFS.map(m => `<button class="chip ${t.motifs.includes(m) ? 'active' : ''}" data-v="${m}">${MOTIF_LABEL[m] || m}</button>`).join('')}</div></div>
			</div>
			<div class="te-preview"><div class="theme-art" id="te-art" style="height:150px"></div><div class="small muted" style="margin-top:8px">L’application entière montre l’aperçu pendant que tu modifies.</div></div>
		</div>`,
		foot: '<button class="btn" data-no>Annuler</button><button class="btn primary" data-ok>Enregistrer et utiliser</button>',
		setup: (el, close) => {
			const read = () => {
				t = SmashThemes.normalize({ ...t, id: t.id, label: $('#te-label', el).value, tagline: $('#te-tagline', el).value, bg: $('#te-bg', el).value, accent: $('#te-accent', el).value, accent2: $('#te-accent2', el).value, light: $('#te-light', el).checked, font: $('#te-font', el).value, imageDim: $('#te-dim', el).value, imageBlur: $('#te-blur', el).value });
				preview();
			};
			const drawImages = () => {
				for (const k of ['image', 'sticker']) {
					const box = $(`#te-prev-${k}`, el);
					box.innerHTML = t[k] ? `<img src="${fileUrl(t[k])}" alt="">` : icon('image');
					$(`[data-img=clear][data-k=${k}]`, el).hidden = !t[k];
				}
				$('.te-sliders', el).hidden = !t.image;
			};
			el.addEventListener('click', async (e) => {
				const b = e.target.closest('[data-img]');
				if (!b) return;
				const k = b.dataset.k;
				if (b.dataset.img === 'clear') t = SmashThemes.normalize({ ...t, [k]: '' });
				else {
					const p = await api('themes:pickImage').catch(toastError);
					if (!p) return;
					t = SmashThemes.normalize({ ...t, [k]: p });
				}
				drawImages();
				preview();
			});
			drawImages();
			el.addEventListener('input', read);
			el.addEventListener('change', read);
			const chips = (sel, key, multi) => $(sel, el).addEventListener('click', (e) => {
				const b = e.target.closest('[data-v]');
				if (!b) return;
				if (multi) {
					const list = t.motifs.includes(b.dataset.v) ? t.motifs.filter(m => m !== b.dataset.v) : [...t.motifs, b.dataset.v].slice(-4);
					t = SmashThemes.normalize({ ...t, motifs: list });
					for (const c of $(sel, el).querySelectorAll('[data-v]')) c.classList.toggle('active', list.includes(c.dataset.v));
				} else {
					t = SmashThemes.normalize({ ...t, [key]: b.dataset.v });
					for (const c of $(sel, el).querySelectorAll('[data-v]')) c.classList.toggle('active', c === b);
				}
				preview();
			});
			chips('#te-icons', 'icons');
			chips('#te-particles', 'particles');
			chips('#te-motifs', 'motifs', true);
			el.querySelector('[data-no]').onclick = () => close(false);
			el.querySelector('[data-ok]').onclick = () => close(true);
			preview();
		},
	});
	if (saved) await saveCustomTheme(t, true);
	else { if (!existing) SmashThemes.unregister(t.id); syncCustomThemes(); applyTheme(before); }
	decorKey = '';
	render();
};

// ---------- Trophées ----------

TITLES.trophies = () => [{ label: 'Trophées' }];
const RANK_LABEL = { bronze: 'Bronze', silver: 'Argent', gold: 'Or', platinum: 'Platine' };
const cup = (rank, on) => `<svg class="cup ${rank} ${on ? 'on' : ''}" viewBox="0 0 32 32" aria-hidden="true"><path d="M9 4h14v6a7 7 0 0 1-14 0zM9 6H4v2a5 5 0 0 0 5 5M23 6h5v2a5 5 0 0 1-5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M9 4h14v6a7 7 0 0 1-14 0z" fill="currentColor" opacity=".35"/><path d="M16 17v5M11 27h10l-1-5h-8z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;

PAGES.trophies = async () => {
	const t = await api('trophies:list').catch(e => { toastError(e); return null; });
	if (!t || state.route.name !== 'trophies') return;
	const fmt = ms => playTime(ms);
	setMain(`
		<div class="section-title"><h1>Trophées</h1><span class="muted">${t.count} débloqués · ${t.points} points</span></div>
		<div class="card col"><h3>Trophées généraux</h3>
			<div class="trophy-grid">${t.global.map(g => `<div class="trophy ${g.at ? 'on' : ''}">${cup(g.rank, g.at)}<div><b>${esc(g.name)}</b><span>${esc(g.desc)}</span><small>${RANK_LABEL[g.rank]} · ${g.points} pts${g.at ? ` · ${dateFr(g.at)}` : ''}</small></div></div>`).join('')}</div>
		</div>
		<div class="card col" style="margin-top:14px"><h3>Par jeu</h3>
			<div class="small muted">Un trophée par palier de temps de jeu : 10 min, 1 h, 5 h, 10 h, 25 h, 50 h et 100 h. Ils se débloquent même en pleine partie.</div>
			${t.perGame.length ? t.perGame.map((g) => {
		const next = g.tiers.find(x => !x.at);
		const prev = [...g.tiers].reverse().find(x => x.at);
		const from = prev ? prev.ms : 0;
		const pct = next ? Math.min(100, Math.round(((g.ms - from) / (next.ms - from)) * 100)) : 100;
		const inst = instById(g.id);
		return `<div class="trophy-game">
					${inst ? instIcon(inst, 'sm') : ''}
					<div class="grow"><div class="row" style="gap:8px"><b class="ellipsis">${esc(g.name)}</b><span class="small muted">${fmt(g.ms)} de jeu</span></div>
						<div class="trophy-tiers">${g.tiers.map(x => `<span class="tier ${x.at ? 'on' : ''}" data-tip="${esc(x.name)} · ${x.label}${x.at ? ` · débloqué le ${dateFr(x.at)}` : ''}">${cup(x.rank, x.at)}<i>${x.label}</i></span>`).join('')}</div>
						<div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
						<div class="small muted">${next ? `Prochain : <b>${esc(next.name)}</b> à ${next.label} (encore ${fmt(next.ms - g.ms)})` : 'Tous les paliers sont débloqués !'}</div>
					</div></div>`;
	}).join('') : '<div class="empty small">Joue à un jeu pour gagner tes premiers trophées.</div>'}
		</div>`);
};

window.launcher.on('trophy', (t) => {
	toast(`🏆 <b>${esc(t.name)}</b> · ${esc(t.desc)} <span class="muted">(+${t.points} pts)</span>`, { type: 'success', timeout: 7000 });
	if (state.route.name === 'trophies') render();
});

// ---------- Jaquettes et images ----------

const COVER_KINDS = [['boxart', 'Boîte'], ['title', 'Écran titre'], ['snap', 'Capture']];

const openCovers = async (inst) => {
	await modal({
		title: `Jaquette et images · ${inst.name}`,
		width: 920,
		body: '<div id="cov"><div class="loading"><div class="spinner"></div>Recherche…</div></div>',
		setup: async (el) => {
			const box = $('#cov', el);
			let info = await api('covers:info', inst.id).catch(() => ({}));
			const current = () => `<div class="cov-current">${COVER_KINDS.map(([k, label]) => {
				const m = info[k];
				return `<div class="cov-slot"><div class="cov-img">${m && m.path ? `<img src="${fileUrl(m.path)}?v=${m.at}" alt="">` : `<span>${label}</span>`}</div>
					<div class="cov-meta"><b>${label}</b><span>${m && m.path ? (m.custom ? 'Image importée' : `libretro-thumbnails · ${esc(m.name || '')}`) : 'Aucune'}</span></div>
					<div class="cov-acts"><button class="btn sm" data-cov="import" data-k="${k}">${icon('upload')}Importer</button>${m && m.hasPrev ? `<button class="btn sm" data-cov="restore" data-k="${k}">${icon('rotate-ccw')}Précédente</button>` : ''}${m && m.path ? `<button class="btn sm" data-cov="remove" data-k="${k}">${icon('x')}</button>` : ''}</div></div>`;
			}).join('')}</div>`;
			let found = null;
			const draw = () => {
				box.innerHTML = `${current()}
					<div class="cov-head"><h3>Résultats</h3><span class="small muted">libretro-thumbnails (base communautaire utilisée par RetroArch) · ${found ? `recherche : ${esc(found.queries.slice(0, 2).join(' · '))}` : ''}</span></div>
					${found && found.error ? `<div class="empty small">${icon('triangle-alert')}<div>${esc(found.error)}</div></div>` : ''}
					${found && found.results ? (found.results.length ? `<div class="cov-grid">${found.results.map((r, i) => {
		const img = r.media.boxart || r.media.title || r.media.snap;
		const tone = r.score >= 90 ? 'green' : r.score >= 60 ? 'orange' : 'red';
		return `<button class="cov-card" data-cov="pick" data-i="${i}">
							<div class="cov-thumb">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ''}</div>
							<div class="cov-name">${esc(r.name)}</div>
							<div class="cov-line"><span class="tag ${tone}">${r.score} %</span>${Object.keys(r.media).map(k => `<span class="tag">${({ boxart: 'boîte', title: 'titre', snap: 'capture' })[k]}</span>`).join('')}</div>
							${r.differences.length ? `<div class="cov-diff">${esc(r.differences.join(' · '))}</div>` : ''}
						</button>`;
	}).join('')}</div>` : '<div class="empty small">Aucun résultat : importe ta propre image.</div>') : (found ? '' : '<div class="loading"><div class="spinner"></div>Recherche dans la base…</div>')}
					<div class="small muted" style="margin-top:8px">Rien n’est choisi automatiquement : le score indique la ressemblance (titre, région, édition). Les images restent sur ton PC, avec leur source et leur date.</div>`;
			};
			draw();
			try { found = await api('covers:search', inst.id); } catch (error) { found = { error: error.message, queries: [] }; }
			draw();
			box.addEventListener('click', async (e) => {
				const b = e.target.closest('[data-cov]');
				if (!b) return;
				const k = b.dataset.k;
				try {
					if (b.dataset.cov === 'pick') {
						const r = found.results[+b.dataset.i];
						b.classList.add('busy');
						info = await api('covers:pick', inst.id, r.name);
						toast('Images enregistrées');
					}
					if (b.dataset.cov === 'import') { const r = await api('covers:import', inst.id, k); if (r) info = r; }
					if (b.dataset.cov === 'restore') info = await api('covers:restore', inst.id, k);
					if (b.dataset.cov === 'remove') info = await api('covers:remove', inst.id, k);
					await refreshInstances();
					draw();
					renderNav();
				} catch (error) { toastError(error); b.classList.remove('busy'); }
			});
		},
	});
	if (state.route.name === 'instance' || state.route.name === 'library') render();
};

// ---------- Jeu à distance ----------

TITLES.remote = () => [{ label: 'Jeu à distance' }];

PAGES.remote = async () => {
	// Tous les jeux : moteur intégré et émulateurs externes incrustés (Project64 garde sa fenêtre : pas d'image à envoyer).
	const games = state.instances.filter(i => i.type === 'rom' && instEngine(i) !== 'project64');
	const recent = await api('remote:recent').catch(() => []);
	if (!state.roms) state.roms = await api('roms:list').catch(() => []);
	if (state.route.name !== 'remote') return;
	setMain(`
		<div class="section-title"><h1>Jeu à distance</h1><span class="muted">jouer ensemble depuis deux maisons différentes</span></div>
		<div class="remote-grid">
			<div class="card col">
				<h3>${icon('wifi')}Rejoindre un ami</h3>
				<div class="small muted">Colle le code d’invitation qu’il t’a envoyé (ou glisse son fichier .smashinvite dans la fenêtre qui s’ouvre).</div>
				<textarea class="input" id="remote-code" rows="3" placeholder="SMASH-INV-…" style="font-family:Consolas,monospace;font-size:12px"></textarea>
				<div class="row"><button class="btn primary" data-action="remote-join">${icon('play')}Rejoindre</button></div>
			</div>
			<div class="card col">
				<h3>${icon('users')}Héberger une partie</h3>
				<div class="small muted">Le jeu tourne chez toi ; tes amis voient l’image et jouent avec leur manette (joueurs 2 à 4).</div>
				<div class="col" style="gap:6px;max-height:320px;overflow-y:auto">${games.map(i => `<div class="sug-row"><div class="avatar">${instIcon(i, 'sm')}</div><div class="grow"><div class="bold ellipsis">${esc(i.name)}</div><div class="small muted">${esc(sysInfo(sysOf(i)).label)}</div></div><button class="btn sm primary" data-action="remote-host" data-id="${esc(i.id)}">${icon('wifi')}Inviter</button></div>`).join('') || ''}${(state.roms || []).filter(r => !(r.instances || []).length).map(r => `<div class="sug-row"><div class="avatar">${romCover(r, 'sm')}</div><div class="grow"><div class="bold ellipsis">${esc(r.name)}</div><div class="small muted">${esc(sysInfo(r.system || 'n64').label)} · bibliothèque</div></div><button class="btn sm primary" data-action="remote-host-rom" data-id="${esc(r.id)}">${icon('wifi')}Inviter</button></div>`).join('')}${games.length || (state.roms || []).length ? '' : '<div class="small muted">Aucun jeu pour l’instant : importe-en un dans « Jeux ».</div>'}</div>
			</div>
		</div>
		<div class="card col" style="margin-top:14px">
			<h3>Comment ça marche</h3>
			<div class="remote-steps">
				<div><b>1</b><span>L’hôte lance le jeu avec « Inviter » et envoie son <b>code d’invitation</b> (Discord, SMS…).</span></div>
				<div><b>2</b><span>L’ami colle le code ici et renvoie son <b>code de réponse</b>.</span></div>
				<div><b>3</b><span>L’hôte colle la réponse : la partie démarre, l’ami joue avec sa manette.</span></div>
			</div>
			<table class="remote-status">
				<tr><td>Image et son du jeu, 30 à 60 i/s, qualité ajustée au réseau</td><td><span class="tag green">Disponible</span></td></tr>
				<tr><td>Manettes et clavier des amis (joueurs 2 à 4), blocage par l’hôte</td><td><span class="tag green">Disponible</span></td></tr>
				<tr><td>Chat écrit, chat vocal (micro, appuyer pour parler), statistiques réseau</td><td><span class="tag green">Disponible</span></td></tr>
				<tr><td>Connexion directe chiffrée sans serveur (STUN public)</td><td><span class="tag green">Disponible</span></td></tr>
				<tr><td>Serveur relais quand la connexion directe échoue (NAT strict)</td><td><span class="tag">Indisponible</span></td></tr>
				<tr><td>Invitations sans échange de codes (serveur de signalisation, liste d’amis)</td><td><span class="tag">Indisponible</span></td></tr>
				<tr><td>Reconnexion automatique après une coupure</td><td><span class="tag">Indisponible : nouveau code</span></td></tr>
				<tr><td>Jeux des émulateurs externes (Dolphin…) et jeux PC</td><td><span class="tag">Prévu</span></td></tr>
				<tr><td>Netplay synchronisé (chaque PC fait tourner le jeu)</td><td><span class="tag">Indisponible</span></td></tr>
				<tr><td>Vibrations des manettes à distance</td><td><span class="tag">Indisponible (émulateur)</span></td></tr>
			</table>
		</div>
		${recent.length ? `<div class="card col" style="margin-top:14px"><h3>Sessions récentes</h3>${recent.map(r => `<div class="sug-row"><div class="avatar">${icon(r.role === 'hôte' ? 'users' : 'wifi')}</div><div class="grow"><div class="bold">${esc(r.game || 'Jeu')}</div><div class="small muted">${r.role === 'hôte' ? 'Hébergé par toi' : `Chez ${esc(r.host)}`} · ${ago(r.at)}</div></div></div>`).join('')}</div>` : ''}`);
};

PAGES.home = () => {
	const sorted = sortInstances(state.instances, 'played');
	const [first, ...others] = sorted;
	setMain(`
		${first ? `${heroCard(first)}${homeStats()}<div id="for-you"></div>
		${others.length ? `<div class="section-title mt"><h2>Reprendre</h2><button class="toggle" data-action="toggle-jump">${icon(state.ui.jumpOpen ? 'chevron-up' : 'chevron-down')}</button></div>
		<div class="${state.ui.jumpOpen ? '' : 'hidden'}">${others.slice(0, 4).map(jumpRow).join('')}</div>` : ''}` : `
		<div class="welcome">
			<div class="welcome-logo">${SmashLogo.svg(84)}<div>${SmashLogo.wordmark()}<div class="muted" style="margin-top:12px">Émulateur N64 et launcher de mods</div></div></div>
			<div style="max-width:620px;line-height:1.6">Importe les ROM de tes cartouches pour jouer dans l'émulateur intégré (pause, vitesse, sauvegardes d'état), ou crée une instance <b>SM64 Coop DX</b> pour les mods et le multijoueur.</div>
			<div class="row mt"><button class="btn primary lg" data-action="import-roms">${icon('file-plus')}Importer des ROM</button><button class="btn lg" data-action="new-instance">${icon('plus')}Créer une instance</button></div>
		</div>`}
		<div class="section-title mt"><h2>Bibliothèque</h2></div>
		${libraryToolbar()}
		<div id="lib-grid">${libraryGrid()}</div>`, homeSide());
	if (!state.cache.popular) {
		api('catalog:list', { sort: 'downloads' }).then((r) => {
			state.cache.popular = r.items.slice(0, 6);
			if (state.route.name === 'home' && $('#popular')) $('.side').innerHTML = homeSide();
		}).catch(() => { if ($('#popular')) $('#popular').innerHTML = '<div class="small muted">Catalogue hors ligne.</div>'; });
	}
	if (typeof fillForYou === 'function') fillForYou();
};

PAGES.library = () => {
	setMain(`<div class="section-title"><h1>Bibliothèque</h1><span class="muted">${state.instances.length} instance${state.instances.length > 1 ? 's' : ''}</span></div>${libraryToolbar()}<div id="lib-grid">${libraryGrid()}</div>`);
};

// ---------- ROMs ----------

const loadRomScan = async () => {
	state.romScan = 'loading';
	try { state.romScan = await api('roms:scan'); } catch { state.romScan = []; }
	if (state.route.name === 'roms') renderRomScan();
};

const renderRomScan = () => {
	const box = $('#rom-scan');
	if (!box) return;
	const scan = state.romScan;
	if (scan === 'loading' || scan === null) { box.innerHTML = '<div class="loading" style="padding:18px"><div class="spinner"></div>Recherche de ROM dans tes téléchargements…</div>'; return; }
	if (!scan.length) { box.innerHTML = ''; return; }
	box.innerHTML = `
		<div class="section-title" style="margin-top:4px"><h3>Trouvées sur ton PC</h3><span class="muted small">${scan.length} fichier${scan.length > 1 ? 's' : ''} pas encore importé${scan.length > 1 ? 's' : ''}</span><div class="grow"></div>
			<button class="btn sm primary" data-action="rom-add-all">${icon('download')}Tout ajouter</button></div>
		${scan.map(f => `
			<div class="dl-row">
				<div class="avatar">${icon(/\.zip$/i.test(f.name) ? 'file-archive' : 'disc-3')}</div>
				<div class="grow">
					<div class="bold ellipsis">${esc(f.roms.length === 1 ? f.roms[0] : f.name)}</div>
					<div class="small muted ellipsis">${/\.zip$/i.test(f.name) ? `${esc(f.name)} · ` : ''}${bytes(f.size)} · ${ago(f.mtime)} · ${esc(f.path.split(/[\/]/).slice(-2, -1)[0] || '')}</div>
				</div>
				<button class="btn sm primary" data-action="rom-add" data-path="${esc(f.path)}">${icon('plus')}Ajouter</button>
			</div>`).join('')}`;
};

const romCard = (r) => `
	<div class="rom-card">
		${romCover(r, 'lg')}
		<button class="play-fab" data-action="rom-play" data-id="${esc(r.id)}" data-tip="Jouer">${icon('play')}</button>
		<div class="row" style="gap:6px;align-items:flex-start">
			<div class="grow" style="min-width:0">
				<div class="name ellipsis" title="${esc(r.name)}">${esc(r.name)}</div>
				<div class="sub">${esc(sysInfo(r.system).label)}${r.info.region ? ` · ${esc(r.info.region)}` : ''} · ${bytes(r.info.size)}${r.instances.length ? ` · ${r.instances.length} instance${r.instances.length > 1 ? 's' : ''}` : ''}</div>
			</div>
			<button class="icon-btn" data-action="ost-rom" data-id="${esc(r.id)}" data-tip="Bande-son">${icon('music')}</button>
			${(r.system || 'n64') === 'n64' ? `<button class="icon-btn" data-action="rom-suggest" data-id="${esc(r.id)}" data-tip="Mods suggérés">${icon('sparkles')}</button>` : ''}
			<button class="icon-btn" data-action="rom-menu" data-id="${esc(r.id)}">${icon('ellipsis-vertical')}</button>
		</div>
	</div>`;

PAGES.roms = () => {
	const counts = {};
	for (const r of state.roms) counts[r.system || 'n64'] = (counts[r.system || 'n64'] || 0) + 1;
	const filter = state.ui.romSys && counts[state.ui.romSys] ? state.ui.romSys : 'all';
	const roms = filter === 'all' ? state.roms : state.roms.filter(r => (r.system || 'n64') === filter);
	const order = Object.keys((state.info && state.info.systems) || {});
	const chips = Object.keys(counts).length > 1 ? `<div class="chips" style="margin-bottom:16px">
		<button class="chip ${filter === 'all' ? 'active' : ''}" data-action="rom-sys" data-v="all">Toutes · ${state.roms.length}</button>
		${order.filter(id => counts[id]).map(id => `<button class="chip ${filter === id ? 'active' : ''}" data-action="rom-sys" data-v="${id}">${esc(sysInfo(id).label)} · ${counts[id]}</button>`).join('')}</div>` : '';
	setMain(`
		<div class="section-title"><h1>Jeux</h1><span class="muted">${state.roms.length} jeu${state.roms.length > 1 ? 'x' : ''} · ${Object.keys(counts).length} console${Object.keys(counts).length > 1 ? 's' : ''}</span><div class="grow"></div>
			<button class="btn" data-action="scan-roms">${icon('refresh-cw')}Rechercher sur le PC</button>
			<button class="btn primary" data-action="import-roms">${icon('file-plus')}Importer des ROM</button>
		</div>
		<div class="rom-drop" id="rom-drop">${icon('upload')}<div><b>Glisse tes jeux ici</b><div class="small muted">Cartouches (NES, SNES, N64, GB, GBA, DS, Mega Drive…), images disque (PS1, PS2, PSP, GameCube, Wii, Saturn…), 3DS, Wii U, Switch ou .zip : la console est reconnue automatiquement.</div></div></div>
		<div id="rom-scan"></div>
		${chips}
		${roms.length ? `<div class="grid rom-grid">${roms.map(romCard).join('')}</div>`
		: `<div class="empty mt">${icon('disc-3')}<h3>Aucun jeu</h3><div>Importe les jeux de tes propres cartouches et disques pour y jouer.</div><button class="btn primary" data-action="import-roms">${icon('file-plus')}Importer des ROM</button></div>`}`);
	if (state.romScan === null) loadRomScan(); else renderRomScan();
};

const refreshRoms = async () => {
	state.roms = await api('roms:list');
	if (state.route.name === 'roms') { state.romScan = null; render(); }
};

const renameRom = async (r) => {
	const name = await modal({
		title: 'Renommer la ROM',
		body: `<div class="field"><label>Nom affiché</label><input class="input" id="rn-name" value="${esc(r.name)}" maxlength="80"></div>`,
		foot: '<button class="btn" data-no>Annuler</button><button class="btn primary" data-ok>Renommer</button>',
		setup: (el, close) => {
			el.querySelector('[data-no]').onclick = () => close(null);
			el.querySelector('[data-ok]').onclick = () => close($('#rn-name', el).value.trim());
			$('#rn-name', el).addEventListener('keydown', e => { if (e.key === 'Enter') close(e.target.value.trim()); });
		},
	});
	if (!name) return;
	await api('roms:rename', r.id, name);
	await refreshRoms();
	render();
};

// ---------- Mods suggérés (compatibilité vérifiée) ----------

const sug = { romId: null, q: '', page: 1, showIncompatible: false, result: null, loading: false, token: 0, picked: {} };

const STATUS = {
	compatible: { cls: 'green', icon: 'check', label: 'Compatible', tip: 'Vérifié : ce patch a été fait pour ta ROM exacte (CRC identique).' },
	unverified: { cls: 'orange', icon: 'info', label: 'Non vérifiable', tip: 'Patch IPS : pas d’empreinte de ROM. Il sera testé sur ta ROM à l’installation.' },
	incompatible: { cls: 'red', icon: 'circle-x', label: 'Incompatible', tip: 'Fait pour une autre version du jeu : il ne s’appliquerait pas correctement.' },
	error: { cls: '', icon: 'triangle-alert', label: 'Vérification impossible', tip: 'Le serveur n’a pas répondu.' },
};

const loadSuggestions = async () => {
	const token = ++sug.token;
	sug.loading = true;
	renderSuggestions();
	try {
		const r = await api('suggest:list', sug.romId, { q: sug.q, page: sug.page, showIncompatible: sug.showIncompatible });
		if (token !== sug.token) return;
		sug.result = r;
	} catch (error) {
		if (token !== sug.token) return;
		sug.result = { error: error.message };
	}
	sug.loading = false;
	renderSuggestions();
};

const sugRow = (h) => {
	const vi = Math.min(sug.picked[h.key] || 0, h.versions.length - 1);
	const v = h.versions[vi];
	const st = STATUS[v.status] || STATUS.error;
	const can = v.status === 'compatible' || v.status === 'unverified';
	const mark = x => (x.status === 'compatible' ? '✓' : x.status === 'incompatible' ? '✗' : '?');
	return `
		<div class="sug-row ${v.status === 'incompatible' ? 'disabled' : ''}">
			<div class="avatar">${icon(v.kind === 'bps' ? 'file-code' : 'file')}</div>
			<div class="grow">
				<div class="row wrap" style="gap:8px">
					<span class="bold">${esc(h.name)}</span>
					<span class="tag ${st.cls}" data-tip="${esc(st.tip)}" data-tip-pos="bottom">${icon(st.icon)}${st.label}</span>
					${h.downloads ? `<span class="tag">${icon('flame')}${compact(h.downloads)} téléchargements</span>` : ''}
				</div>
				<div class="small muted" style="margin-top:4px">${v.kind.toUpperCase()} · ${bytes(v.size)}${v.sourceCrc && v.status === 'incompatible' ? ` · prévu pour la ROM CRC ${esc(v.sourceCrc)}` : ''}</div>
			</div>
			${h.versions.length > 1 ? `<select class="select" data-input="sug-version" data-key="${esc(h.key)}" style="height:34px;max-width:220px">${h.versions.map((x, i) => `<option value="${i}" ${i === vi ? 'selected' : ''}>${esc(x.variant || `Version ${i + 1}`)} ${mark(x)}</option>`).join('')}</select>` : ''}
			<button class="btn sm" data-action="sug-install" data-key="${esc(h.key)}" ${can ? '' : 'disabled'}>${icon('download')}Installer</button>
			<button class="btn sm primary" data-action="sug-install" data-play="1" data-key="${esc(h.key)}" ${can ? '' : 'disabled'}>${icon('play')}Installer et jouer</button>
		</div>`;
};

const sugPager = (page, pages) => pager(page, pages).replace(/data-action="page"/g, 'data-action="sug-page"');

const renderSuggestions = () => {
	const box = $('#sug-results');
	if (!box) return;
	if (sug.loading) { box.innerHTML = '<div class="loading"><div class="spinner"></div>Recherche des mods et vérification de compatibilité…</div>'; return; }
	const r = sug.result;
	if (!r) return;
	if (r.error) { box.innerHTML = `<div class="empty">${icon('triangle-alert')}<h3>Suggestions indisponibles</h3><div>${esc(r.error)}</div><button class="btn" data-action="sug-retry">${icon('refresh-cw')}Réessayer</button></div>`; return; }
	const info = $('#sug-info');
	if (info) info.innerHTML = `Empreinte de ta ROM : <b>CRC ${esc(r.rom.crc)}</b>${r.archives.length ? ` · source : ${r.archives.map(a => `<a data-action="external" data-url="https://archive.org/details/${esc(a.id)}">${esc(a.title)}</a>`).join(', ')}` : ''}`;
	if (!r.total) {
		box.innerHTML = `<div class="empty">${icon('search')}<h3>Aucun mod trouvé pour ce jeu</h3><div>Aucune archive de hacks connue pour ${esc(r.rom.name)}. Tu peux chercher avec <a data-action="nav" data-to="opera">Opera</a> : les patchs téléchargés pourront être installés ici.</div></div>`;
		return;
	}
	const hidden = r.hidden ? ` · ${r.hidden} incompatible${r.hidden > 1 ? 's' : ''} masqué${r.hidden > 1 ? 's' : ''}` : '';
	box.innerHTML = `
		<div class="row" style="margin-bottom:12px"><div class="grow muted small">${r.total} mod${r.total > 1 ? 's' : ''}${sug.q ? ` pour « ${esc(sug.q)} »` : ''} · page ${r.page}/${r.pages}${hidden}</div>${sugPager(r.page, r.pages)}</div>
		${r.items.length ? `<div class="col" style="gap:8px">${r.items.map(sugRow).join('')}</div>` : '<div class="empty">Tous les mods de cette page sont incompatibles avec ta ROM. Passe à la page suivante ou affiche les incompatibles.</div>'}
		<div style="margin-top:14px">${sugPager(r.page, r.pages)}</div>`;
};

PAGES.suggest = ({ romId, instanceId }) => {
	const r = state.roms.find(x => x.id === romId);
	if (!r) { go('roms', {}, { push: false }); return; }
	if (sug.romId !== romId) Object.assign(sug, { romId, q: '', page: 1, result: null, picked: {} });
	const ctx = instanceId ? instById(instanceId) : null;
	setMain(`
		${ctx ? `<div class="context-banner">${instIcon(ctx, 'sm')}<div class="grow">Installation dans <b>${esc(ctx.name)}</b> (ou dans une nouvelle instance si elle a déjà un patch)</div><button class="btn sm" data-action="open-instance" data-id="${esc(ctx.id)}">${icon('chevron-left', 'sm')}Retour à l’instance</button></div>` : ''}
		<div class="project-header" style="align-items:center">
			${romCover(r, 'av-lg')}
			<div class="grow">
				<h1>Mods suggérés</h1>
				<div class="muted" style="margin-top:6px">${esc(r.name)} · chaque patch est vérifié avant d’être proposé.</div>
				<div class="small muted" id="sug-info" style="margin-top:6px"></div>
			</div>
		</div>
		<div class="toolbar">
			<div class="search">${icon('search')}<input class="input" data-input="sug-q" placeholder="Rechercher un hack…" value="${esc(sug.q)}"></div>
			<button class="chip ${sug.showIncompatible ? 'active' : ''}" data-action="sug-toggle">${icon('eye')}Montrer les incompatibles</button>
		</div>
		<div id="sug-results"></div>`);
	if (!sug.result) loadSuggestions(); else renderSuggestions();
};

// Installe le hack choisi (nouvelle instance, ou l'instance d'origine si elle n'a pas déjà un patch).
const installSuggestion = async (key, play) => {
	const r = sug.result;
	const h = r && r.items.find(x => x.key === key);
	if (!h) return;
	const v = h.versions[Math.min(sug.picked[key] || 0, h.versions.length - 1)];
	const ctx = state.route.params.instanceId;
	const hackName = v.variant ? `${h.name} (${v.variant})` : h.name;
	const req = target => api('suggest:install', { romId: sug.romId, archiveId: h.archiveId, file: v.file, hackName, target });
	try {
		let inst;
		try {
			inst = await req(ctx || 'new');
		} catch (error) {
			if (!ctx || !/patch actif/.test(error.message)) throw error;
			toast(esc(error.message), { type: 'info' });
			inst = await req('new');
		}
		await refreshInstances();
		state.roms = await api('roms:list');
		toast(`<b>${esc(hackName)}</b> installé dans « ${esc(inst.name)} »`, {
			actions: [{ label: 'Jouer', run: () => launchInstance(inst.id) }, { label: 'Voir l’instance', run: () => go('instance', { id: inst.id }) }],
		});
		if (play) await launchInstance(inst.id);
		else render();
	} catch (error) { toastError(error); }
};

// ---------- Multijoueur en ligne Wii / GameCube (NetPlay de Dolphin) ----------

const openNetplay = async (inst) => {
	await modal({
		title: `Multijoueur en ligne · ${inst.name}`,
		width: 760,
		body: `<div class="np">
			<p style="margin-top:0;line-height:1.55">Le <b>NetPlay de Dolphin</b> fait tourner le jeu sur chaque PC et synchronise les manettes : presque pas de lag, image parfaite. Il faut que <b>vous ayez tous le même jeu</b> (même fichier) et <b>la même version de Dolphin</b>.</p>
			<div class="dash-grid">
				<div class="card col"><h3>${icon('users')}Tu héberges</h3>
					<div class="remote-steps">
						<div><b>1</b><span>Clique sur « Préparer et ouvrir Dolphin » ci-dessous.</span></div>
						<div><b>2</b><span>Dans Dolphin : <b>Outils → Démarrer NetPlay…</b> → onglet <b>Héberger</b>, choisis le jeu, puis <b>Héberger</b>.</span></div>
						<div><b>3</b><span>Copie le <b>code d’hôte</b> (en haut de la fenêtre) et envoie-le à ton pote.</span></div>
						<div><b>4</b><span>Quand il est là : vérifie que vous avez le même jeu, règle les manettes (Wiimote 2 pour lui), puis <b>Démarrer</b>.</span></div>
					</div></div>
				<div class="card col"><h3>${icon('wifi')}Tu rejoins</h3>
					<div class="remote-steps">
						<div><b>1</b><span>Ajoute le même jeu dans Smash Emu, puis clique sur « Préparer et ouvrir Dolphin ».</span></div>
						<div><b>2</b><span>Dans Dolphin : <b>Outils → Démarrer NetPlay…</b> → onglet <b>Se connecter</b>, type <b>Code d’hôte</b>.</span></div>
						<div><b>3</b><span>Colle le code reçu, puis <b>Se connecter</b>. L’hôte lance la partie.</span></div>
					</div></div>
			</div>
			<div class="small muted" style="margin-top:10px">Conseils : Wii → réglez chacun sa Wiimote (Manettes dans Dolphin) ; images .nkit : préférez la même image ISO/RVZ chez tous ; si la connexion échoue, passez par Radmin VPN et choisissez « Connexion directe » avec l’IP Radmin de l’hôte.</div>
			<div id="np-status" class="small" style="margin-top:10px"></div>
		</div>`,
		foot: '<button class="btn" data-no>Fermer</button><button class="btn primary" data-go>Préparer et ouvrir Dolphin</button>',
		setup: (el, close) => {
			el.querySelector('[data-no]').onclick = () => close();
			el.querySelector('[data-go]').onclick = async () => {
				try {
					const r = await api('netplay:open', inst.id);
					$('#np-status', el).innerHTML = `<span class="tag green">${icon('check')}Dolphin prêt</span> Jeu : <b>${esc(r.name)}</b> · pseudo NetPlay : <b>${esc(r.nick)}</b>${r.version ? ` · Dolphin <b>${esc(r.version)}</b> (ton pote doit avoir la même)` : ''}. Va dans Outils → Démarrer NetPlay.`;
				} catch (error) { toastError(error); }
			};
		},
	});
};

// ---------- Bande-son des jeux ----------

const ytEmbed = item => (item.type === 'playlist'
	? `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(item.id)}&autoplay=1`
	: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(item.id)}?autoplay=1`);

const openSoundtrack = async (gameName, systemId) => {
	const consoleLabel = systemId ? sysInfo(systemId).label : '';
	await modal({
		title: `Bande-son · ${gameName}`,
		width: 860,
		body: '<div id="ost"><div class="loading"><div class="spinner"></div>Recherche de la bande-son…</div></div>',
		setup: async (el) => {
			let r;
			try { r = await api('soundtrack:search', gameName, consoleLabel); } catch (error) {
				$('#ost', el).innerHTML = `<div class="empty">${icon('triangle-alert')}<h3>Bande-son introuvable</h3><div>${esc(error.message)}</div></div>`;
				return;
			}
			// Lecture dans le lecteur permanent (en bas de la fenêtre) : la musique continue après la fermeture.
			const items = r.videos.map(v => ({ ...v, game: gameName }));
			const draw = () => {
				$('#ost', el).innerHTML = items.length ? `
				<div class="ost-head">
					<button class="btn primary" data-ost="all">${icon('play')}Tout écouter</button>
					<button class="btn" data-ost="shuffle">${icon('shuffle')}Aléatoire</button>
					<button class="btn" data-ost="favs">${icon('heart')}Mes favoris</button>
					<span class="grow"></span>
					<a data-action="external" data-url="${esc(r.youtubeUrl)}">Plus de résultats sur YouTube</a>
				</div>
				<div class="ost-grid">${items.map((v, i) => `
					<div class="ost-item ${mItem() && mKey(mItem()) === mKey(v) ? 'on' : ''}">
						<button class="ost-main-btn" data-ost="play" data-i="${i}">
							${v.thumb ? `<img src="${esc(v.thumb)}" alt="">` : `<div class="ost-pl">${icon('layers')}</div>`}
							<div class="grow"><div class="t">${esc(v.title)}</div><div class="small muted">${v.type === 'playlist' ? 'Playlist' : esc(v.duration)}${v.channel ? ` · ${esc(v.channel)}` : ''}</div></div>
						</button>
						<div class="ost-acts"><button class="md-btn" data-ost="queue" data-i="${i}" data-tip="Ajouter à la file">${icon('plus')}</button><button class="md-btn ${mIsFav(v) ? 'on' : ''}" data-ost="fav" data-i="${i}" data-tip="Favori">${icon('heart')}</button></div>
					</div>`).join('')}</div>
				${r.albums.length ? `<div class="small muted" style="margin:14px 0 6px">Albums complets (KHInsider, dans Opera)</div>
				<div class="chips">${r.albums.map(a => `<button class="chip" data-action="external" data-url="${esc(a.url)}">${icon('music')}${esc(a.title)}</button>`).join('')}</div>` : ''}
				<div class="small muted" style="margin-top:10px">La musique continue dans le lecteur en bas de la fenêtre, même après avoir fermé cette fenêtre ; elle se met en pause quand un jeu démarre.</div>`
					: `<div class="empty">${icon('music')}<h3>Aucune bande-son trouvée</h3><div><a data-action="external" data-url="${esc(r.youtubeUrl)}">Chercher sur YouTube</a></div></div>`;
			};
			draw();
			el.addEventListener('click', async (e) => {
				const b = e.target.closest('[data-ost]');
				if (!b) return;
				const i = +b.dataset.i;
				if (b.dataset.ost === 'play') musicPlay(items, i);
				if (b.dataset.ost === 'all') { music.shuffle = false; musicPlay(items, 0); }
				if (b.dataset.ost === 'shuffle') { music.shuffle = true; musicPlay(items, Math.floor(Math.random() * items.length)); }
				if (b.dataset.ost === 'queue') musicEnqueue(items[i]);
				if (b.dataset.ost === 'fav') await musicToggleFav(items[i]);
				if (b.dataset.ost === 'favs') musicOpenFavs();
				draw();
			});
		},
	});
};

// ---------- Page instance ----------

const instState = { content: [], filter: 'all', query: '', logs: [] };

PAGES.instance = async ({ id, tab = 'content' }) => {
	const inst = instById(id);
	if (!inst) { go('library', {}, { push: false }); return; }
	if (instState.id !== id) Object.assign(instState, { id, filter: 'all', query: '', logs: [] });
	const builtin = inst.type === 'rom' && instEngine(inst) === 'smash';
	const tabs = [['content', 'Contenu', 'package'], ...(builtin ? [['saves', 'Sauvegardes', 'save']] : []), ['logs', 'Journaux', 'scroll-text'], ['options', 'Options', 'sliders-horizontal']];
	const gameTheme = SmashThemes.get(SmashThemes.match(instGameName(inst), sysOf(inst)) || '');
	setMain(`
		${gameTheme && state.settings.decor !== 'off' ? `<div class="game-banner">${SmashThemes.scene(gameTheme.id)}<span class="game-banner-tag">${esc(gameTheme.label)}${gameTheme.console ? ` · ${esc(gameTheme.console)}` : ''}</span></div>` : ''}
		<div class="inst-header ${gameTheme && state.settings.decor !== 'off' ? 'on-banner' : ''}">
			${instIcon(inst, 'lg')}
			<div class="info">
				<h1 class="ellipsis">${esc(inst.name)}</h1>
				<div class="stats">
					<span>${icon(TYPE_ICON[inst.type])}${esc(instKind(inst))}</span>
					${inst.type === 'rom' ? `<span>${icon('flame')}${esc(engineLabel(instEngine(inst)))}</span>` : ''}
					<span>${icon('clock')}${playTime(inst.playTimeMs)} de jeu</span>
					<span>${icon('calendar')}${inst.lastPlayed ? `Joué ${ago(inst.lastPlayed)}` : 'Jamais joué'}</span>
					${inst.group ? `<span>${icon('square-stack')}${esc(inst.group)}</span>` : ''}
				</div>
			</div>
			<button class="btn lg" data-action="ost-inst" data-id="${esc(inst.id)}" data-tip="Écouter la bande-son" data-tip-pos="bottom">${icon('music')}Bande-son</button>
			${inst.type === 'rom' && instEngine(inst) !== 'project64' ? `<button class="btn lg" data-action="remote-host" data-id="${esc(inst.id)}" data-tip="Inviter des amis à jouer à distance" data-tip-pos="bottom">${icon('wifi')}À distance</button>` : ''}
			${playButton(inst, 'lg')}
			<button class="btn icon-only lg" data-action="inst-menu" data-id="${esc(inst.id)}">${icon('ellipsis-vertical')}</button>
		</div>
		<div class="tabs">${tabs.map(([t, l, ic]) => `<button class="tab ${tab === t ? 'active' : ''}" data-action="inst-tab" data-tab="${t}">${icon(ic)}${l}</button>`).join('')}</div>
		<div id="inst-body"><div class="loading"><div class="spinner"></div>Chargement…</div></div>`);

	if (tab === 'content') {
		instState.content = await api('content:list', id).catch((e) => { toastError(e); return []; });
		if (state.route.name === 'instance' && state.route.params.id === id) renderContent(inst);
	} else if (tab === 'logs') {
		instState.logs = await api('run:logs', id);
		renderLogs(inst);
	} else if (tab === 'saves' && builtin) {
		await renderSaves(inst);
	} else {
		renderOptions(inst);
	}
};

// ---------- Sauvegardes en jeu d'une instance ----------

const SAVE_SOURCE = { game: 'écrite par le jeu', import: 'importée', restore: 'restaurée', cloud: 'venue du dossier cloud' };
const BACKUP_TAG = { jeu: 'version qui était dans le jeu', cloud: 'ancienne version du cloud' };

const renderSaves = async (inst) => {
	let info;
	try { info = await api('saves:info', inst.id); } catch (error) { toastError(error); return; }
	const box = $('#inst-body');
	if (!box || state.route.params.id !== inst.id) return;
	const cur = info.current;
	const dt = ts => new Date(ts).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
	box.innerHTML = `<div class="col" style="gap:14px">
		${info.running ? `<div class="card flat small">${icon('info')} Le jeu est lancé : sa sauvegarde est recopiée ici toutes les 30 s. Import et restauration sont possibles une fois le jeu fermé.</div>` : ''}
		<div class="card col">
			<div class="row"><h3 class="grow">Sauvegarde du jeu</h3>
				<button class="btn sm" data-action="saves-folder" data-id="${esc(inst.id)}">${icon('folder-open')}Dossier</button>
				<button class="btn sm" data-action="saves-import" data-id="${esc(inst.id)}" ${info.running ? 'disabled' : ''}>${icon('upload')}Importer</button>
				<button class="btn sm primary" data-action="saves-export" data-id="${esc(inst.id)}" ${cur ? '' : 'disabled'}>${icon('download')}Exporter</button></div>
			<div class="small muted">La sauvegarde faite <b>dans le jeu</b> (carte mémoire, pile de la cartouche). Smash Emu en garde une copie sur ton disque et ${info.keep} copies de secours. Les états (F5) sont à part.</div>
			${cur ? `<div class="sug-row"><div class="avatar">${icon('save')}</div><div class="grow"><div class="bold">game.srm · ${bytes(cur.size)}</div><div class="small muted">${dt(cur.savedAt)} · ${esc(SAVE_SOURCE[cur.source] || cur.source)}</div></div></div>`
		: `<div class="empty small">${icon('save')}<h3>Pas encore de sauvegarde</h3><div>Elle apparaîtra dès que tu sauvegarderas dans le jeu.</div></div>`}
		</div>
		<div class="card col">
			<div class="row"><h3 class="grow">Dossier cloud</h3>
				${info.cloudDir ? `<button class="btn sm" data-action="saves-sync" data-id="${esc(inst.id)}" ${info.running || info.cloudMissing ? 'disabled' : ''}>${icon('refresh-cw')}Synchroniser</button>` : ''}
				<button class="btn sm" data-action="saves-cloud">${icon('folder-open')}${info.cloudDir ? 'Changer' : 'Choisir un dossier'}</button></div>
			<div class="small muted">${info.cloudDir
		? `${info.cloudMissing ? `${icon('triangle-alert')} Dossier introuvable : ` : 'Miroir dans '}<b>${esc(info.cloudDir)}</b>. La version la plus récente gagne au lancement du jeu ; l’autre est gardée en copie de secours.`
		: 'Choisis un dossier synchronisé (Dropbox, Google Drive, OneDrive, Syncthing…) pour retrouver tes sauvegardes sur un autre PC.'}</div>
		</div>
		<div class="card col">
			<h3>Copies de secours <span class="small muted">· ${info.backups.length}/${info.keep}</span></h3>
			${info.backups.length ? info.backups.map(b => `<div class="sug-row">
				<div class="avatar">${icon('history')}</div>
				<div class="grow"><div class="bold">${dt(b.savedAt)}</div><div class="small muted">${bytes(b.size)}${b.tag ? ` · ${esc(BACKUP_TAG[b.tag] || b.tag)}` : ''}</div></div>
				<button class="btn sm" data-action="saves-restore" data-id="${esc(inst.id)}" data-name="${esc(b.name)}" ${info.running ? 'disabled' : ''}>${icon('rotate-ccw')}Restaurer</button>
			</div>`).join('') : '<div class="small muted">Aucune pour l’instant : une copie est faite au plus toutes les 10 minutes de jeu, et avant chaque import ou restauration.</div>'}
		</div></div>`;
};

const contentRow = (m, inst) => {
	const o = m.origin || {};
	const kindIcon = { mod: 'puzzle', pack: 'box', patch: 'file-code' }[m.kind];
	const thumb = o.icon || (m.icon ? fileUrl(m.icon) : null);
	const tags = [
		m.kind === 'pack' ? '<span class="tag blue">Pack DynOS</span>' : '',
		m.kind === 'patch' ? `<span class="tag orange">${esc(m.rel.split('.').pop().toUpperCase())}</span>` : '',
		m.source === 'builtin' ? '<span class="tag">Intégré au jeu</span>' : '',
		o.type === 'catalog' ? `<span class="tag green">${icon('compass')}Catalogue${o.version ? ` · ${esc(o.version)}` : ''}</span>` : '',
		o.type === 'opera' ? `<span class="tag red">${icon('globe')}Opera</span>` : '',
		m.incompatible ? `<span class="tag" title="Incompatible avec les autres mods de type : ${esc(m.incompatible)}">${icon('triangle-alert')}${esc(m.incompatible)}</span>` : '',
	].join('');
	const order = inst.type === 'rom' ? `<button class="icon-btn" data-action="patch-up" data-key="${esc(m.key)}" data-tip="Monter">${icon('arrow-up', 'sm')}</button><button class="icon-btn" data-action="patch-down" data-key="${esc(m.key)}" data-tip="Descendre">${icon('arrow-down', 'sm')}</button>` : '';
	const canToggle = !(m.kind === 'pack' && m.source === 'builtin');
	return `
		<div class="content-row ${m.enabled ? '' : 'disabled'}">
			${thumb ? avatar(thumb, m.name) : `<div class="avatar">${icon(kindIcon)}</div>`}
			<div class="grow">
				<div class="row wrap" style="gap:8px"><span class="name">${esc(m.name)}</span>${tags}</div>
				${m.description ? `<div class="desc">${esc(m.description)}</div>` : ''}
			</div>
			${order}
			${o.url ? `<button class="icon-btn" data-action="external" data-url="${esc(o.url)}" data-tip="Page du mod">${icon('external-link', 'sm')}</button>` : ''}
			<button class="icon-btn" data-action="show-path" data-path="${esc(m.path)}" data-tip="Afficher le fichier">${icon('folder-open', 'sm')}</button>
			${m.source === 'instance' ? `<button class="icon-btn danger" data-action="content-remove" data-key="${esc(m.key)}" data-name="${esc(m.name)}" data-tip="Supprimer">${icon('trash-2', 'sm')}</button>` : ''}
			<button class="switch ${m.enabled ? 'on' : ''}" data-action="content-toggle" data-key="${esc(m.key)}" ${canToggle ? '' : 'disabled title="Géré depuis le menu DynOS en jeu"'}></button>
		</div>`;
};

const renderContent = (inst) => {
	const all = instState.content;
	const filters = inst.type === 'coopdx'
		? [['all', 'Tout'], ['mod', 'Mods'], ['pack', 'Packs DynOS'], ['builtin', 'Intégrés au jeu']]
		: [];
	const q = instState.query.toLowerCase();
	const list = all.filter(m => (instState.filter === 'all' || (instState.filter === 'builtin' ? m.source === 'builtin' : m.kind === instState.filter && m.source === 'instance'))
		&& (!q || `${m.name} ${m.description}`.toLowerCase().includes(q)));
	const mine = list.filter(m => m.source === 'instance');
	const builtin = list.filter(m => m.source === 'builtin');
	const rom = inst.rom;
	const romCard = inst.type === 'rom' || rom ? `
		<div class="card flat row" style="margin-bottom:16px">
			<div class="avatar">${icon('hard-drive')}</div>
			<div class="grow">${rom ? `<div class="bold">${esc(rom.info.known || rom.info.title)}</div><div class="small muted">${esc(sysInfo(sysOf(inst)).label)} · ${esc(rom.file)}${rom.info.region ? ` · ${esc(rom.info.region)}` : ''} · ${bytes(rom.info.size)}${rom.info.crc1 ? ` · CRC ${esc(rom.info.crc1)}` : ''}</div>` : '<div class="bold">Aucune ROM de base</div><div class="small muted">Choisis une ROM pour pouvoir jouer.</div>'}</div>
			<button class="btn sm" data-action="pick-rom">${icon('refresh-cw')}${rom ? 'Changer' : 'Choisir'}</button>
		</div>` : '';
	$('#inst-body').innerHTML = `
		${romCard}
		<div class="toolbar">
			<div class="search">${icon('search')}<input class="input" data-input="content-query" placeholder="Rechercher dans ${all.length} élément${all.length > 1 ? 's' : ''}" value="${esc(instState.query)}"></div>
			<button class="btn" data-action="import-files">${icon('upload')}Importer un fichier</button>
			${inst.type === 'rom' ? `<button class="btn" data-action="nav" data-to="opera">${icon('globe')}Opera</button>` : ''}
			<button class="btn primary" data-action="add-content">${icon(inst.type === 'coopdx' ? 'plus' : 'sparkles')}${inst.type === 'coopdx' ? 'Ajouter des mods' : 'Mods suggérés'}</button>
		</div>
		${filters.length ? `<div class="chips" style="margin-bottom:16px">${filters.map(([v, l]) => `<button class="chip ${instState.filter === v ? 'active' : ''}" data-action="content-filter" data-v="${v}">${l}</button>`).join('')}</div>` : ''}
		<div id="drop-zone">
			${!all.filter(m => m.source === 'instance').length && instState.filter !== 'builtin' ? `
				<div class="empty">${icon('package')}<h3>Aucun contenu installé</h3>
					<div>${inst.type === 'coopdx' ? 'Ajoute des mods depuis le catalogue, ou glisse ici un .zip / .lua.' : 'Glisse ici un patch .bps / .ips, ou cherche des ROM hacks avec Opera.'}</div>
					<button class="btn primary" data-action="add-content">${icon(inst.type === 'coopdx' ? 'compass' : 'globe')}${inst.type === 'coopdx' ? 'Parcourir les mods' : 'Recherche Opera'}</button></div>` : ''}
			${mine.length ? `<div class="content-table">${mine.map(m => contentRow(m, inst)).join('')}</div>` : ''}
			${builtin.length ? `<h3 class="mt" style="margin-bottom:10px">Intégrés à sm64coopdx <span class="muted small">${builtin.length}</span></h3><div class="content-table">${builtin.map(m => contentRow(m, inst)).join('')}</div>` : ''}
		</div>
		${inst.type === 'rom' && mine.length > 1 ? '<div class="small muted mt">Les patchs sont appliqués de haut en bas sur la ROM de base au lancement.</div>' : ''}`;
};

const renderLogs = (inst) => {
	const line = l => `<div class="${l.stream}">${esc(l.line)}</div>`;
	$('#inst-body').innerHTML = `
		<div class="toolbar">
			<div class="grow muted">${isRunning(inst.id) ? `<span class="tag green">${icon('play')}En cours</span> Journal en direct` : instState.logs.length ? 'Journal de la dernière session' : 'Lance le jeu pour voir son journal ici.'}</div>
			<button class="btn sm" data-action="copy-logs">${icon('copy')}Copier</button>
			<button class="btn sm" data-action="open-folder" data-id="${esc(inst.id)}">${icon('folder-open')}Dossier de l'instance</button>
		</div>
		<div class="logs" id="logs">${instState.logs.map(line).join('') || '<span class="muted">Aucun journal pour le moment.</span>'}</div>`;
	const box = $('#logs');
	box.scrollTop = box.scrollHeight;
};

const renderOptions = (inst) => {
	const o = inst.options || {};
	const coop = inst.type === 'coopdx';
	const chip = (name, value, label, ic) => `<button class="chip ${(o[name] || '') === value ? 'active' : ''}" data-action="opt-chip" data-name="${name}" data-v="${value}">${ic ? icon(ic) : ''}${label}</button>`;
	const defaultEngine = state.info.engines[state.settings.defaultEngine] || 'Smash Emu';
	$('#inst-body').innerHTML = `
		<div class="options-grid">
			<div class="card col full">
				<h3>Général</h3>
				<div class="icon-picker">
					${instIcon(inst, 'lg')}
					<div class="btns">
						<button class="btn sm" data-action="set-icon">${icon('upload')}Changer l'icône</button>
						${inst.iconData ? `<button class="btn sm ghost" data-action="remove-icon">${icon('trash-2')}Retirer l'icône</button>` : ''}
					</div>
				</div>
				<div class="row wrap">
					<div class="field grow"><label>Nom</label><input class="input" data-opt="name" value="${esc(inst.name)}" maxlength="60"></div>
					<div class="field grow"><label>Groupe</label><input class="input" data-opt="group" value="${esc(inst.group || '')}" placeholder="Aucun"></div>
				</div>
			</div>
			${coop ? `
			<div class="card col">
				<h3>Joueur & fenêtre</h3>
				<div class="field"><label>Pseudo</label><input class="input" data-opt="options.playerName" value="${esc(o.playerName || '')}" placeholder="${esc(state.settings.playerName)} (par défaut)" maxlength="20"></div>
				<div class="field"><span class="label">Affichage</span><div class="chips">${chip('windowMode', 'windowed', 'Fenêtré', 'monitor')}${chip('windowMode', 'fullscreen', 'Plein écran', 'maximize-2')}</div></div>
				<div class="row ${o.windowMode === 'fullscreen' ? 'hidden' : ''}">
					<div class="field grow"><label>Largeur</label><input class="input" type="number" min="320" data-opt="options.width" value="${o.width || 1280}"></div>
					<div class="field grow"><label>Hauteur</label><input class="input" type="number" min="240" data-opt="options.height" value="${o.height || 720}"></div>
				</div>
			</div>
			<div class="card col">
				<h3>Multijoueur</h3>
				<div class="chips">${chip('network', 'solo', 'Solo', 'user')}${chip('network', 'host', 'Héberger', 'server')}${chip('network', 'join', 'Rejoindre', 'wifi')}</div>
				${o.network === 'join' ? `<div class="field"><label>Adresse du serveur</label><input class="input" data-opt="options.host" value="${esc(o.host || '')}" placeholder="ex. 192.168.1.20"></div>` : ''}
				${o.network !== 'solo' && o.network ? `<div class="field"><label>Port</label><input class="input" type="number" data-opt="options.port" value="${o.port || 7777}"></div>` : ''}
				<div class="small muted">${{ solo: 'Le jeu démarre normalement, tu peux héberger depuis le menu.', host: 'Le jeu crée directement un serveur sur ce port.', join: 'Le jeu rejoint directement ce serveur au démarrage.' }[o.network || 'solo']}</div>
			</div>` : ''}
			${coop ? '' : `
			<div class="card col">
				<h3>Moteur</h3>
				<div class="chips">${chip('engine', '', `Par défaut (${esc(engineLabel(instEngine({ ...inst, options: { ...o, engine: '' } })))})`, 'settings')}${(sysInfo(sysOf(inst)).engines || []).map(e => chip('engine', e, engineLabel(e).replace(' (intégré)', ''), e === 'smash' ? 'flame' : 'cpu')).join('')}</div>
				<div class="small muted">${instEngine(inst) === 'smash'
		? 'Le jeu s’ouvre dans la fenêtre Smash Emu : pause, vitesse ×0,5 à ×4, turbo, 4 sauvegardes d’état, captures.'
		: `Le jeu s’ouvre dans ${esc(engineLabel(instEngine(inst)))}, piloté par la barre Smash Emu.`}</div>
				${instEngine(inst) === 'dolphin' ? `<div class="field"><span class="label">Effet d’image Dolphin</span><div class="chips">${['FXAA', 'AutoHDR', 'PerceptualHDR', 'integer_scaling', 'sepia', 'grayscale'].map(v => chip('externalShader', v, v)).join('')}</div><span class="hint">Remplace l’effet réglé dans Dolphin (sans toucher à sa configuration).</span></div>` : ''}
			</div>`}
			<div class="card col">
				<h3>ROM de base</h3>
				${inst.rom ? `<div class="row">${inst.rom.info ? romCover({ id: inst.rom.info.md5, name: inst.rom.info.known || inst.rom.info.title, info: inst.rom.info }, 'sm') : ''}<div class="grow"><div class="bold">${esc(inst.rom.info.known || inst.rom.info.title)}</div><div class="small muted">${esc(inst.rom.file)} · ${esc(inst.rom.info.region)} · MD5 ${esc(inst.rom.info.md5.slice(0, 12))}…</div></div></div>` : `<div class="rom-box muted small">${coop ? 'Aucune ROM copiée : celle de sm64coopdx sera reprise au lancement si elle existe.' : 'Aucune ROM.'}</div>`}
				<div class="row"><button class="btn sm" data-action="pick-library-rom">${icon('disc-3')}Depuis la bibliothèque</button><button class="btn sm" data-action="pick-rom">${icon('file-plus')}Importer…</button></div>
			</div>
			<div class="card col ${coop ? '' : 'full'}">
				<h3>Avancé</h3>
				<div class="field"><label>Arguments supplémentaires</label><input class="input" data-opt="options.extraArgs" value="${esc(o.extraArgs || '')}" placeholder="${coop ? 'ex. --console --hide-loading-screen' : 'ex. --fullscreen'}"><span class="hint">${coop ? 'Ajoutés à la fin de la ligne de commande.' : 'Utilisés seulement avec le moteur Project64.'}</span></div>
				<div class="row"><button class="btn sm" data-action="open-folder" data-id="${esc(inst.id)}">${icon('folder-open')}Ouvrir le dossier</button><button class="btn sm" data-action="duplicate" data-id="${esc(inst.id)}">${icon('copy')}Dupliquer</button></div>
			</div>
			<div class="card col full" style="border:1.5px solid var(--red-dim)">
				<h3 style="color:var(--red)">Zone dangereuse</h3>
				<div class="row"><div class="grow small">Supprime l'instance, ses mods, ses sauvegardes et sa ROM copiée. Le jeu installé n'est pas touché.</div><button class="btn danger" data-action="delete-instance" data-id="${esc(inst.id)}">${icon('trash-2')}Supprimer l'instance</button></div>
			</div>
		</div>`;
};

const saveOption = debounce(async (id, path, value) => {
	const inst = instById(id);
	if (!inst) return;
	const patch = {};
	if (path.startsWith('options.')) {
		const key = path.slice(8);
		patch.options = { ...(inst.options || {}), [key]: ['width', 'height', 'port'].includes(key) ? +value || null : value };
	} else {
		patch[path] = value;
	}
	try {
		const updated = await api('instance:update', id, patch);
		state.instances = state.instances.map(i => (i.id === id ? updated : i));
		renderTopbar();
		renderNav();
		const h1 = $('.inst-header h1');
		if (h1) h1.textContent = updated.name;
	} catch (error) { toastError(error); }
}, 400);

// ---------- Découvrir ----------

const installedSlugs = new Set();
const projectCard = (m, ctx) => `
	<div class="project-card" data-action="open-project" data-slug="${esc(m.slug)}" data-title="${esc(m.title)}">
		${avatar(m.icon, m.title, 'lg')}
		<div style="min-width:0">
			<div class="row wrap" style="gap:8px"><span class="title">${esc(m.title)}</span>${m.version ? `<span class="tag">${esc(m.version)}</span>` : ''}<span class="by">par ${esc(m.author || '?')}</span></div>
			<div class="tagline">${esc(m.tagline)}</div>
			<div class="row wrap" style="gap:6px">${m.category ? `<span class="tag">${icon((state.meta.categories.find(c => c.id === m.category.id) || {}).icon || 'puzzle')}${esc((state.meta.categories.find(c => c.id === m.category.id) || {}).label || m.category.label)}</span>` : ''}</div>
		</div>
		<div class="stats">
			<div class="col" style="gap:6px;align-items:flex-end">
				${m.downloads != null ? `<div class="stat">${icon('download')}<b>${compact(m.downloads)}</b> téléchargements</div>` : ''}
				${m.ratings ? `<div class="stat">${stars(m.rating)}<span class="muted small">(${m.ratings})</span></div>` : ''}
				${m.updated ? `<div class="stat muted small">${icon('refresh-cw')}Mis à jour ${ago(m.updated)}</div>` : ''}
			</div>
			${ctx && installedSlugs.has(m.slug)
		? `<span class="tag green">${icon('check')}Installé</span>`
		: `<button class="btn primary sm" data-action="install-mod" data-slug="${esc(m.slug)}">${icon('download')}${ctx ? 'Installer' : 'Installer…'}</button>`}
		</div>
	</div>`;

const pager = (page, pages) => {
	if (pages <= 1) return '';
	const nums = new Set([1, pages, page - 1, page, page + 1].filter(n => n >= 1 && n <= pages));
	const sorted = [...nums].sort((a, b) => a - b);
	let html = `<button class="btn sm" data-action="page" data-p="${page - 1}" ${page <= 1 ? 'disabled' : ''}>${icon('chevron-left', 'sm')}</button>`;
	sorted.forEach((n, i) => {
		if (i && n - sorted[i - 1] > 1) html += '<span class="muted">…</span>';
		html += `<button class="btn sm ${n === page ? 'current' : ''}" data-action="page" data-p="${n}">${n}</button>`;
	});
	return `<div class="pager">${html}<button class="btn sm" data-action="page" data-p="${page + 1}" ${page >= pages ? 'disabled' : ''}>${icon('chevron-right', 'sm')}</button></div>`;
};

const loadDiscover = async () => {
	const d = state.discover;
	const token = ++d.token;
	d.loading = true;
	renderResults();
	try {
		const r = d.q.trim() ? await api('catalog:search', d.q.trim(), d.page) : await api('catalog:list', { page: d.page, sort: d.sort, category: d.category });
		if (token !== d.token) return;
		d.result = r;
	} catch (error) {
		if (token !== d.token) return;
		d.result = { items: [], page: 1, pages: 1, error: error.message };
	}
	d.loading = false;
	renderResults();
};

const renderResults = () => {
	const box = $('#results');
	if (!box) return;
	const d = state.discover;
	const ctx = state.route.params.instanceId;
	if (d.loading) { box.innerHTML = '<div class="loading"><div class="spinner"></div>Chargement du catalogue…</div>'; return; }
	const r = d.result;
	if (!r) return;
	if (r.error) { box.innerHTML = `<div class="empty">${icon('triangle-alert')}<h3>Catalogue indisponible</h3><div>${esc(r.error)}</div><button class="btn" data-action="retry">${icon('refresh-cw')}Réessayer</button></div>`; return; }
	if (!r.items.length) { box.innerHTML = `<div class="empty">${icon('search')}<h3>Aucun résultat</h3><div>Essaie d'autres mots, ou cherche plus large avec <a data-action="opera-search-q">Opera</a>.</div></div>`; return; }
	box.innerHTML = `<div class="row" style="margin-bottom:12px"><div class="grow muted small">${d.q ? `Résultats pour « ${esc(d.q)} »` : `Page ${r.page} sur ${r.pages}`}</div>${pager(r.page, r.pages)}</div>
		${r.items.map(m => projectCard(m, ctx)).join('')}
		<div style="margin-top:14px">${pager(r.page, r.pages)}</div>`;
};

PAGES.discover = (params) => {
	const d = state.discover;
	const ctx = params.instanceId ? instById(params.instanceId) : null;
	setMain(`
		${ctx ? `<div class="context-banner">${instIcon(ctx, 'sm')}<div class="grow">Installation dans <b>${esc(ctx.name)}</b></div><button class="btn sm" data-action="open-instance" data-id="${esc(ctx.id)}">${icon('chevron-left', 'sm')}Retour à l'instance</button></div>` : ''}
		<div class="discover">
			<div class="filters">
				<h3>Catégories</h3>
				<button class="filter-item ${!d.category ? 'active' : ''}" data-action="category" data-v="">${icon('layout-grid')}Toutes</button>
				${state.meta.categories.map(c => `<button class="filter-item ${d.category === c.id ? 'active' : ''}" data-action="category" data-v="${c.id}">${icon(c.icon)}${esc(c.label)}</button>`).join('')}
				<div class="small muted" style="margin:14px 8px 0">Source : <a data-action="external" data-url="https://mods.sm64coopdx.com/mods/">mods.sm64coopdx.com</a></div>
			</div>
			<div>
				<div class="toolbar">
					<div class="search">${icon('search')}<input class="input" data-input="discover-q" placeholder="Rechercher des mods Coop DX…" value="${esc(d.q)}"></div>
					<select class="select" data-input="discover-sort" ${d.q ? 'disabled' : ''}>${[['downloads', 'Téléchargements'], ['updated', 'Mis à jour'], ['rating', 'Note'], ['newest', 'Nouveautés'], ['title', 'Titre']].map(([v, l]) => `<option value="${v}" ${d.sort === v ? 'selected' : ''}>Trier : ${l}</option>`).join('')}</select>
				</div>
				<div id="results"></div>
			</div>
		</div>`);
	installedSlugs.clear();
	if (ctx) {
		api('content:list', ctx.id).then((content) => {
			for (const c of content) if (c.origin && c.origin.slug) installedSlugs.add(c.origin.slug);
			renderResults();
		}).catch(() => {});
	}
	if (!d.result || d.stale) { d.stale = false; loadDiscover(); } else renderResults();
};

// ---------- Fiche d'un mod ----------

PAGES.project = async ({ slug, instanceId }) => {
	setMain('<div class="loading"><div class="spinner"></div>Chargement du mod…</div>');
	let p;
	try {
		p = await api('catalog:details', slug);
	} catch (error) {
		setMain(`<div class="empty">${icon('triangle-alert')}<h3>Impossible de charger ce mod</h3><div>${esc(error.message)}</div></div>`);
		return;
	}
	if (state.route.name !== 'project' || state.route.params.slug !== slug) return;
	state.route.params.title = p.title;
	renderTopbar();
	const listed = (state.discover.result && state.discover.result.items.find(m => m.slug === slug)) || {};
	const mod = { ...listed, ...p, icon: p.icon || listed.icon };
	state.currentProject = mod;
	const info = p.info || {};
	setMain(`
		<div class="project-header">
			${avatar(mod.icon, mod.title, 'xl')}
			<div class="grow">
				<h1>${esc(mod.title)} ${mod.version ? `<span class="tag" style="vertical-align:middle">${esc(mod.version)}</span>` : ''}</h1>
				<div class="muted" style="margin:6px 0 12px">par <b>${esc(mod.author)}</b>${listed.category ? ` · ${esc(listed.category.label)}` : ''}</div>
				<div style="max-width:720px;line-height:1.5">${esc((p.summary || '').split('\n')[0])}</div>
				<div class="row mt">
					<button class="btn primary lg" data-action="install-mod" data-slug="${esc(slug)}">${icon('download')}Installer${instanceId ? ` dans ${esc((instById(instanceId) || {}).name || '')}` : ''}</button>
					<button class="btn lg" data-action="external" data-url="${esc(p.url)}">${icon('globe')}Ouvrir dans Opera</button>
				</div>
			</div>
		</div>
		<div class="project-body">
			<div class="description" id="desc">${sanitize(p.descriptionHtml) || '<span class="muted">Pas de description.</span>'}</div>
			<div class="col">
				<div class="card">
					<h3 style="margin-bottom:12px">Informations</h3>
					<div class="info-list">
						${listed.downloads != null ? `<div class="item"><span>Téléchargements</span><b>${listed.downloads.toLocaleString('fr')}</b></div>` : info.Downloads ? `<div class="item"><span>Téléchargements</span><b>${esc(info.Downloads)}</b></div>` : ''}
						${listed.ratings ? `<div class="item"><span>Note</span><b>${stars(listed.rating)} ${listed.rating.toFixed(1)}</b></div>` : ''}
						${info.Views ? `<div class="item"><span>Vues</span><b>${esc(info.Views)}</b></div>` : ''}
						${info['First release'] ? `<div class="item"><span>Première version</span><b>${esc(info['First release'])}</b></div>` : ''}
						${info['Last update'] ? `<div class="item"><span>Mise à jour</span><b>${esc(info['Last update'])}</b></div>` : ''}
					</div>
				</div>
				<div class="card small muted">Les mods sont publiés par leurs auteurs sur mods.sm64coopdx.com. Smash Emu télécharge le fichier et l'installe dans le dossier de mods de ton instance.</div>
			</div>
		</div>`);
};

// ---------- Recherche Opera ----------

const operaRow = f => `
	<div class="dl-row ${state.opera.fresh.has(f.path) ? 'new' : ''}">
		<div class="avatar">${icon({ zip: 'file-archive', lua: 'file-code', ips: 'file-code', bps: 'file-code' }[f.ext] || 'hard-drive')}</div>
		<div class="grow">
			<div class="row" style="gap:8px"><span class="bold ellipsis">${esc(f.name)}</span>${state.opera.fresh.has(f.path) ? '<span class="tag green">Nouveau</span>' : ''}</div>
			<div class="small muted">${esc(f.ext.toUpperCase())} · ${bytes(f.size)} · téléchargé ${ago(f.mtime)} · ${f.kind === 'rom' ? 'Jeu' : typesForFile(f.name).map(typeLabel).join(' / ')}</div>
		</div>
		<button class="icon-btn" data-action="show-path" data-path="${esc(f.path)}" data-tip="Afficher dans l'explorateur">${icon('folder-open', 'sm')}</button>
		${f.kind === 'rom' && f.imported
		? `<span class="tag green">${icon('check')}Dans ta bibliothèque</span>`
		: f.kind === 'rom'
		? `<button class="btn primary sm" data-action="rom-add" data-path="${esc(f.path)}">${icon('disc-3')}Ajouter aux ROM</button>`
		: `<button class="btn primary sm" data-action="opera-install" data-path="${esc(f.path)}">${icon('download')}Installer</button>`}
	</div>`;

PAGES.opera = (params) => {
	const st = state.opera.status || {};
	const ctx = params.instanceId ? instById(params.instanceId) : null;
	const sites = st.sites || [];
	const selected = state.opera.site || (ctx && ctx.type === 'rom' ? 'smwc' : 'coopdx');
	setMain(`
		${ctx ? `<div class="context-banner">${instIcon(ctx, 'sm')}<div class="grow">Ce que tu télécharges sera proposé pour <b>${esc(ctx.name)}</b></div><button class="btn sm" data-action="open-instance" data-id="${esc(ctx.id)}">${icon('chevron-left', 'sm')}Retour à l'instance</button></div>` : ''}
		<div class="opera-hero">
			<div class="brand">
				<div class="opera-o"></div>
				<div class="grow"><h1>Recherche Opera</h1><div class="muted">Cherche des mods de jeux dans Opera : ce que tu y télécharges arrive ici, prêt à installer.</div></div>
				<span class="tag ${st.exe ? 'green' : 'red'}">${icon(st.exe ? 'check' : 'triangle-alert')}${st.exe ? 'Opera connecté' : 'Opera introuvable'}</span>
			</div>
			<div class="opera-search">
				<div class="search">${icon('search')}<input class="input" id="opera-q" placeholder="Ex. Star Road, Luigi, Kaizo Mario 64…" value="${esc(state.opera.q || '')}"></div>
				<button class="btn primary lg" data-action="opera-go" ${st.exe ? '' : 'disabled'}>${icon('globe')}Chercher dans Opera</button>
			</div>
			<div class="chips" style="margin-top:14px">${sites.map(s => `<button class="chip ${selected === s.id ? 'active' : ''}" data-action="opera-site" data-v="${s.id}" data-tip="${esc(s.hint)}" data-tip-pos="bottom">${esc(s.label)}</button>`).join('')}</div>
			${selected === 'coopdx' ? `<div class="small muted" style="margin-top:12px">${icon('sparkles', 'sm')} Astuce : les mods Coop DX s'installent aussi en un clic depuis <a data-action="nav" data-to="discover">Découvrir</a>, sans passer par le navigateur.</div>` : ''}
		</div>
		<div class="section-title"><h2>Téléchargements Opera</h2><span class="muted small">${esc(st.downloadDir || '')}</span><div class="grow"></div>
			<span class="tag ${state.settings.watchOperaDownloads ? 'green' : ''}">${icon(state.settings.watchOperaDownloads ? 'eye' : 'circle-x')}${state.settings.watchOperaDownloads ? 'Surveillance active' : 'Surveillance désactivée'}</span>
			<button class="btn sm" data-action="opera-refresh">${icon('refresh-cw')}Actualiser</button>
			<button class="btn sm" data-action="opera-import">${icon('upload')}Autre fichier…</button>
		</div>
		<div id="opera-files">${state.opera.files.length ? state.opera.files.map(operaRow).join('')
		: `<div class="empty">${icon('cloud-download')}<h3>Aucun mod téléchargé récemment</h3><div>Les fichiers .zip, .lua, .bps, .ips et ROM téléchargés avec Opera ces 14 derniers jours apparaîtront ici.</div></div>`}</div>`);
};

// ---------- Paramètres ----------

PAGES.settings = () => {
	if (!state.emulators) api('emulators:status').then((st) => { state.emulators = st; const box = $('#emu-list'); if (box) box.innerHTML = renderEmuList(); });
	api('switch:status').then((k) => { state.switchKeys = k; const box = $('#emu-list'); if (box) box.innerHTML = renderEmuList(); }).catch(() => {});
	api('discord:status').then(drawDiscordState).catch(() => {});
	const s = state.settings;
	const p = state.info.paths;
	const st = state.opera.status || {};
	const pathField = (key, label, detected, ext) => `
		<div class="field">
			<label>${label}</label>
			<div class="row">
				<input class="input grow" data-setting="${key}" value="${esc(s[key] || '')}" placeholder="${detected ? `Détecté : ${esc(detected)}` : 'Non trouvé — choisis l\'exécutable'}">
				<button class="btn" data-action="browse-setting" data-key="${key}" data-ext="${ext}">${icon('folder-open')}Parcourir</button>
			</div>
			<span class="hint">${detected ? `${icon('check', 'sm')} Utilisé : ${esc(detected)}` : `${icon('triangle-alert', 'sm')} Introuvable automatiquement.`}</span>
		</div>`;
	const toggle = (key, label, hint) => `<div class="row"><div class="grow"><div class="bold">${label}</div><div class="small muted">${hint}</div></div><button class="switch ${s[key] ? 'on' : ''}" data-action="toggle-setting" data-key="${key}"></button></div>`;
	setMain(`
		<div class="narrow col" style="gap:18px">
			<h1>Paramètres</h1>
			<div class="card col"><h3>Apparence</h3>
				<div class="field"><span class="label">Interface</span>
					<div class="chips">${[['console', 'Console', 'layout-dashboard'], ['classic', 'Classique', 'layout-grid']].map(([v, l, ic]) => `<button class="chip ${(consoleUi() ? 'console' : 'classic') === v ? 'active' : ''}" data-action="set-ui" data-v="${v}">${icon(ic)}${l}</button>`).join('')}
						${consoleUi() ? `<button class="chip" data-action="ch-options">${icon('palette')}Accueil, décor, couleurs…</button>` : ''}</div>
					<span class="hint">Console : accueil en tuiles (rangée, grille ou chaînes), barre d’icônes en bas, transitions entre les menus, manette. Classique : menu latéral.</span>
				</div>
				${consoleUi() ? `<div class="row" style="gap:12px"><div class="grow"><div class="bold">Animations et transitions</div><div class="small muted">Glissements entre les menus, apparition des tuiles, lancement des jeux</div></div><button class="switch ${s.consoleAnim !== false ? 'on' : ''}" data-action="toggle-anim"></button></div>` : ''}
				<div class="field"><span class="label">Logo</span>
					<div class="logo-pick">${[['classic', 'Classique'], ['manette', 'Manette']].map(([v, l]) => `<button class="logo-card ${(s.logo || 'classic') === v ? 'active' : ''}" data-action="set-logo" data-v="${v}">${SmashLogo.svg(56, v)}<span>${l}</span></button>`).join('')}</div>
					<span class="hint">Le logo change dans toute l’application et sur l’icône des fenêtres (l’icône du raccourci reste la classique).</span>
				</div>
				<div class="row wrap" style="gap:10px;align-items:center">
					<button class="chip ${s.autoTheme !== false ? 'active' : ''}" data-action="set-autotheme">${icon('sparkles')}Thème automatique selon le jeu</button>
					<input class="input grow" id="theme-search" placeholder="Chercher parmi ${Object.keys(THEME_INFO).length} thèmes (Zelda, Pokémon, Sonic, néon…)" value="" style="min-width:220px">
				</div>
				<div class="row wrap" style="gap:8px;align-items:center"><span class="label" style="margin:0">Police du thème</span>
					${[['titles', 'Titres'], ['all', 'Partout'], ['off', 'Désactivée']].map(([v, l]) => `<button class="chip ${(s.fontMode || 'titles') === v ? 'active' : ''}" data-action="set-fontmode" data-v="${v}">${l}</button>`).join('')}</div>
				<span class="hint">${s.autoTheme !== false ? 'La fenêtre de jeu et la page d’un jeu prennent les couleurs de ce jeu quand il est reconnu ; sinon ton thème ci-dessous.' : 'Le thème ci-dessous est utilisé partout.'}</span>
				<div class="row wrap" style="gap:8px;align-items:center"><span class="label" style="margin:0">Décor des thèmes de jeux</span>
					${[['full', 'Illustration et animations'], ['calm', 'Illustration seule'], ['off', 'Aucun']].map(([v, l]) => `<button class="chip ${(s.decor || 'full') === v ? 'active' : ''}" data-action="set-decor" data-v="${v}">${l}</button>`).join('')}</div>
				<div id="theme-grid">
					<div class="theme-group">Thèmes Smash Emu</div>
					<div class="theme-grid">${Object.entries(THEME_INFO).filter(([, t]) => !t.game && !t.custom).map(([id, t]) => `
						<button class="theme-card ${SmashThemes.resolve(s.theme || 'smash') === id ? 'active' : ''}" data-action="set-theme" data-v="${id}">
							<div class="theme-preview" style="background:${t.colors[0]}"><span style="background:${t.colors[1]}"></span><span style="background:${t.colors[2]}"></span><i style="background:${t.colors[2]}"></i></div>
							<div class="bold" style="font-family:'${esc(t.font)}', 'Inter', sans-serif">${esc(t.label)}</div><div class="small muted">${esc(t.desc)} · ${esc(t.font)}</div>
						</button>`).join('')}</div>
					<div class="theme-group">Mes thèmes · ${SmashThemes.CUSTOM.length}</div>
					<div class="theme-grid games">
						<button class="theme-card game theme-new" data-action="theme-edit">${icon('plus')}<b>Créer un thème</b><span class="theme-meta">Couleurs, police, icônes, décor et illustration</span></button>
						<button class="theme-card game theme-new" data-action="theme-import">${icon('upload')}<b>Importer un thème</b><span class="theme-meta">Un code SMASHTHEME ou un fichier .smashtheme (avec ses images)</span></button>
						${SmashThemes.CUSTOM.map(t => `
						<div class="theme-card game ${(s.theme || 'smash') === t.id ? 'active' : ''}" style="--card-bg:${t.bg};--card-accent:${t.accent}">
							<div class="theme-art" data-action="set-theme" data-v="${t.id}">${SmashThemes.scene(t.id)}<span class="theme-console">Perso</span></div>
							<div class="bold" style="font-family:'${esc(t.font)}', 'Inter', sans-serif">${esc(t.label)}</div>
							<div class="theme-meta">${esc(t.tagline)}</div>
							<div class="row" style="gap:4px;margin-top:6px;flex-wrap:wrap"><button class="btn sm" data-action="set-theme" data-v="${t.id}">Utiliser</button><button class="btn sm" data-action="theme-edit" data-id="${t.id}">Modifier</button><button class="btn sm" data-action="theme-share" data-id="${t.id}" data-tip="${t.image || t.sticker ? 'Code à partager (sans les images)' : 'Copier le code à partager'}">${icon('copy')}</button><button class="btn sm" data-action="theme-export" data-id="${t.id}" data-tip="Exporter en fichier .smashtheme, images comprises">${icon('download')}</button><button class="icon-btn" data-action="theme-delete" data-id="${t.id}">${icon('trash-2')}</button></div>
						</div>`).join('')}
					</div>
					<div class="theme-group">${icon('crown')}Thèmes supporters · ${SmashThemes.SUPPORTER.length}${state.supporter && state.supporter.active ? '' : ' · <a data-action="nav" data-to="dashboard">débloquer avec un code</a>'}</div>
					<div class="theme-grid games">${SmashThemes.SUPPORTER.map(t => `
						<div class="theme-card game ${(s.theme || 'smash') === t.id ? 'active' : ''} ${state.supporter && state.supporter.active ? '' : 'locked'}" style="--card-bg:${t.bg};--card-accent:${t.accent}" data-action="set-theme" data-v="${t.id}">
							<div class="theme-art">${SmashThemes.scene(t.id)}<span class="theme-console">${state.supporter && state.supporter.active ? 'Supporter' : `${icon('lock')}Supporter`}</span></div>
							<div class="bold" style="font-family:'${esc(t.font)}', 'Inter', sans-serif">${esc(t.label)}</div>
							<div class="theme-meta">${esc(t.tagline)}</div>
						</div>`).join('')}</div>
					<div class="theme-group">Thèmes des jeux · ${SmashThemes.THEMES.length}</div>
					<div class="theme-grid games">${SmashThemes.THEMES.map(t => `
						<button class="theme-card game ${SmashThemes.resolve(s.theme || 'smash') === t.id ? 'active' : ''}" data-action="set-theme" data-v="${t.id}" style="--card-bg:${t.bg};--card-accent:${t.accent}">
							<div class="theme-art">${SmashThemes.scene(t.id)}<span class="theme-console">${esc(t.console)}</span></div>
							<div class="bold" style="font-family:'${esc(t.font)}', 'Inter', sans-serif">${esc(t.label)}</div>
							<div class="theme-meta">${esc(t.tagline)}</div>
							<div class="theme-tags"><span>${esc(t.font)}</span><span>${{ wii: 'Icônes Wii', ornate: 'Ornements', pixel: 'Pixel', neon: 'Néon', paper: 'Papier', bubble: 'Bulles', tech: 'Futuriste' }[t.icons] || 'Classique'}</span><span>${{ fairies: 'Fées', stars: 'Étoiles', coins: 'Pièces', leaves: 'Feuilles', bubbles: 'Bulles', sparks: 'Étincelles', ghosts: 'Fantômes', petals: 'Pétales', embers: 'Braises', hearts: 'Cœurs', notes: 'Notes', rain: 'Pluie', warp: 'Vitesse lumière', confetti: 'Confettis', moons: 'Lunes' }[t.particles] || ''}</span></div>
						</button>`).join('')}</div>
				</div>
			</div>
			<div class="card col"><h3>Émulateur</h3>
				<div class="field"><span class="label">Moteur par défaut (Nintendo 64)</span>
					<div class="chips">${Object.entries(state.info.engines).map(([id, label]) => `<button class="chip ${s.defaultEngine === id ? 'active' : ''}" data-action="set-engine" data-v="${id}">${icon(id === 'smash' ? 'flame' : 'cpu')}${esc(label)}</button>`).join('')}</div>
					<span class="hint">Smash Emu : fenêtre intégrée avec pause, vitesse ×0,25 à ×8, turbo (Espace), 8 sauvegardes d’état et captures. Chaque instance peut choisir son moteur.</span>
				</div>
				<div class="field"><span class="label">Reprendre la dernière partie au lancement</span>
					<div class="chips">${[['ask', 'Demander'], ['auto', 'Toujours'], ['off', 'Jamais']].map(([v, l]) => `<button class="chip ${(s.resumeMode || 'ask') === v ? 'active' : ''}" data-action="set-resume" data-v="${v}">${l}</button>`).join('')}</div>
					<span class="hint">À la fermeture d’un jeu, Smash Emu enregistre l’endroit exact où tu en es ; au lancement suivant, tu reprends pile là.</span>
				</div>
				<div class="field"><label>Volume par défaut</label><div class="row"><input type="range" min="0" max="100" value="${Math.round((s.emuVolume ?? 0.8) * 100)}" data-setting-range="emuVolume" style="flex:1;accent-color:var(--brand)"><b id="vol-label" style="width:46px;text-align:right">${Math.round((s.emuVolume ?? 0.8) * 100)} %</b></div></div>
			</div>
			<div class="card col"><h3>Sauvegardes de jeu</h3>
				<div class="small muted">Sauvegardes faites dans le jeu (carte mémoire, pile de cartouche) des consoles intégrées. Chaque jeu a son onglet « Sauvegardes » pour exporter, importer ou restaurer.</div>
				<div class="field"><span class="label">Copies de secours gardées par jeu</span>
					<div class="chips">${[0, 5, 10, 20, 50].map(n => `<button class="chip ${(s.saveBackups ?? 10) === n ? 'active' : ''}" data-action="saves-keep" data-v="${n}">${n || 'Aucune'}</button>`).join('')}</div></div>
				<div class="field"><span class="label">Dossier cloud (facultatif)</span>
					<div class="row"><input class="input grow" readonly value="${esc(s.savesSyncDir || '')}" placeholder="Désactivé : choisis un dossier Dropbox, Google Drive, OneDrive ou Syncthing">
						<button class="btn" data-action="saves-cloud">${icon('folder-open')}Parcourir</button>
						${s.savesSyncDir ? `<button class="btn" data-action="saves-cloud-off">${icon('x')}Désactiver</button>` : ''}</div>
					<span class="hint">Smash Emu y range un miroir de chaque sauvegarde ; au lancement d’un jeu, la version la plus récente gagne et l’autre est gardée en copie de secours.</span></div>
			</div>
			<div class="card col"><div class="row"><h3 class="grow">Émulateurs externes</h3><button class="btn sm" data-action="emu-check-updates">${icon('cloud-download')}Vérifier les mises à jour</button><button class="btn sm" data-action="emu-refresh">${icon('refresh-cw')}Rechercher à nouveau</button></div>
				<div class="small muted">Pour les consoles sans cœur intégré (GameCube, Wii, PS2, PS3, PS4, 3DS, Wii U, Switch, Xbox, Xbox 360), Smash Emu lance l’émulateur installé sur ton PC. « Installer » et « Mettre à jour » téléchargent la dernière version officielle (site ou GitHub du projet) dans le dossier de Smash Emu, en gardant tes réglages. Les BIOS, clés et firmwares viennent de tes propres consoles : Smash Emu n’en fournit jamais.</div>
				<div class="field"><span class="label">Interface pendant le jeu</span>
					<div class="chips">
						<button class="chip ${(s.externalUi || 'smash') === 'smash' ? 'active' : ''}" data-action="set-extui" data-v="smash">${icon('flame')}Smash Emu</button>
						<button class="chip ${s.externalUi === 'native' ? 'active' : ''}" data-action="set-extui" data-v="native">${icon('monitor')}Celle de l’émulateur (plein écran)</button>
					</div>
					<span class="hint">Smash Emu : le jeu s’affiche dans une fenêtre Smash Emu, avec sa barre (pause, états, turbo, capture, plein écran).</span>
				</div>
				<div class="col" id="emu-list" style="gap:8px">${renderEmuList()}</div>
			</div>
			<div class="card col"><h3>Consoles intégrées</h3>
				<div class="small muted">Ces consoles se lancent directement dans la fenêtre Smash Emu, sans rien installer :</div>
				<div class="chips">${Object.values(state.info.systems).filter(x => x.ejs).map(x => `<span class="tag">${esc(x.label)}</span>`).join('')}</div>
			</div>
			<div class="card col"><h3>Joueur</h3>
				<div class="field"><label>Pseudo par défaut</label><input class="input" data-setting="playerName" value="${esc(s.playerName)}" maxlength="20"></div>
			</div>
			<div class="card col"><h3>Jeux</h3>
				${pathField('coopdxPath', 'sm64coopdx.exe', p.coopdx, 'exe')}
				${pathField('project64Path', 'Project64.exe', p.project64, 'exe')}
			</div>
			<div class="card col"><h3>Opera</h3>
				${pathField('operaPath', 'opera.exe', st.exe, 'exe')}
				${toggle('watchOperaDownloads', 'Surveiller les téléchargements d\'Opera', `Propose d'installer chaque mod téléchargé dans ${esc(st.downloadDir || 'Téléchargements')}.`)}
			</div>
			<div class="card col"><h3>Lancement</h3>
				${toggle('skipIntro', 'Passer l\'intro', 'Ajoute --skip-intro au lancement de sm64coopdx.')}
				${toggle('discord', 'Intégration Discord', 'Affiche ton activité de jeu sur Discord (sm64coopdx).')}
				${toggle('closeOnLaunch', 'Réduire Smash Emu au lancement d’un jeu', 'La fenêtre principale se réduit quand un jeu démarre.')}
				${toggle('musicPauseInGame', 'Mettre la musique en pause pendant les parties', 'Le lecteur de bandes-son reprend quand le jeu est fermé.')}
			</div>
			<div class="card col"><h3>${icon('message-circle')}Présence Discord</h3>
				${toggle('richPresence', 'Afficher « Joue à Smash Emu » sur Discord', 'Ton profil Discord montre le jeu en cours, sa console, sa jaquette et depuis combien de temps tu joues. Discord doit être ouvert sur ce PC.')}
				<div class="field"><label>Application ID Discord</label><input class="input" data-setting="discordAppId" value="${esc(s.discordAppId || '')}" placeholder="Ex. 1234567890123456789" inputmode="numeric" maxlength="21"></div>
				<details class="small muted"><summary>Où trouver l’Application ID ?</summary>
					<ol style="margin:6px 0 0;padding-left:18px;line-height:1.6">
						<li>Ouvre le portail des développeurs Discord (bouton ci-dessous) et connecte-toi.</li>
						<li>« New Application », nomme-la <b>Smash Emu</b> : c’est le nom affiché après « Joue à ».</li>
						<li>Copie l’<b>Application ID</b> (page General Information) et colle-le ici.</li>
					</ol>
					<button class="btn sm" style="margin-top:6px" data-action="external" data-url="https://discord.com/developers/applications">${icon('external-link')}Portail des développeurs Discord</button>
				</details>
				${toggle('presenceShowGame', 'Montrer le nom du jeu', 'Sinon, Discord affiche seulement « En jeu ».')}
				${toggle('presenceIdle', 'Afficher aussi quand tu es dans les menus', '« Dans le menu » quand aucun jeu n’est lancé.')}
				<div class="row small" id="discord-state" style="flex-wrap:wrap;gap:8px"></div>
			</div>
			<div class="card col"><h3>Mises à jour</h3><div id="upd-box">${renderUpdate()}</div></div>
			<div class="card col"><h3>À propos</h3>
				<div class="row">${SmashLogo.svg(40)}<div class="grow small"><div style="margin-bottom:6px">${SmashLogo.wordmark()}</div>v${esc(state.info.version)} — données dans <b>${esc(state.info.dataDir)}</b></div><button class="btn sm" data-action="show-path" data-path="${esc(state.info.dataDir)}">${icon('folder-open')}Ouvrir</button></div>
				<div class="small muted">Émulation N64 : EmulatorJS et mupen64plus (GPL-3.0). Interface inspirée de Modrinth App. Mods Coop DX : mods.sm64coopdx.com. Icônes Lucide (ISC), polices Inter et Press Start 2P (OFL). Smash Emu ne fournit aucun jeu : utilise les ROM de tes propres cartouches.</div>
			</div>
		</div>`);
};

// ---------- Mises à jour ----------

const renderUpdate = () => {
	const u = state.update || { state: 'idle', current: state.info.version };
	const line = {
		idle: `Version <b>${esc(u.current)}</b>. Smash Emu vérifie les nouvelles versions au démarrage.`,
		dev: `Version <b>${esc(u.current)}</b> (lancée depuis le code source : pas de mise à jour automatique).`,
		checking: 'Recherche d’une nouvelle version…',
		none: `Tu as la dernière version (<b>${esc(u.current)}</b>).`,
		available: `Nouvelle version <b>${esc(u.version)}</b> disponible (tu as la ${esc(u.current)}).${u.notes ? `<div class="small muted" style="margin-top:6px;white-space:pre-line">${esc(u.notes)}</div>` : ''}`,
		downloading: `Téléchargement de la version ${esc(u.version || '')}… <b>${u.percent || 0} %</b><div class="bar-track"><div class="bar-fill" style="width:${u.percent || 0}%"></div></div>`,
		ready: `La version <b>${esc(u.version)}</b> est prête : Smash Emu va se fermer, s’installer puis se relancer.`,
		error: `Mise à jour impossible : ${esc(u.error || 'erreur inconnue')}`,
	}[u.state] || '';
	const btn = {
		available: `<button class="btn primary" data-action="update-download">${icon('download')}Télécharger la mise à jour</button>`,
		ready: `<button class="btn primary" data-action="update-install">${icon('refresh-cw')}Redémarrer et installer</button>`,
		downloading: '',
		checking: '',
		dev: '',
	}[u.state];
	return `<div class="row" style="gap:14px;align-items:flex-start"><div class="grow small">${line}</div>${btn === undefined ? `<button class="btn sm" data-action="update-check">${icon('refresh-cw')}Rechercher</button>` : btn}</div>`;
};

const installBtn = (id) => {
	const p = (state.emuInstall || {})[id];
	if (p && ['resolving', 'downloading', 'extracting', 'cores'].includes(p.state)) {
		const label = { resolving: 'Recherche…', downloading: p.percent != null ? `Téléchargement ${p.percent} %` : 'Téléchargement…', extracting: 'Installation…', cores: `Cœurs ${p.done + 1} / ${p.total}` }[p.state] || '…';
		return `<button class="btn sm primary" disabled>${icon('download')}${label}</button>`;
	}
	return `<button class="btn sm primary" data-action="emu-install" data-id="${id}">${icon('download')}Installer</button>`;
};
// Émulateur installé : « Mettre à jour » si une version plus récente existe, sinon « À jour » / « Vérifier ».
const updateBtn = (id) => {
	const p = (state.emuInstall || {})[id];
	if (p && ['resolving', 'downloading', 'extracting', 'cores'].includes(p.state)) return installBtn(id);
	const u = (state.emuUpdates || {})[id];
	if (u && u.update) return `<button class="btn sm primary" data-action="emu-install" data-id="${id}" data-update="1" data-tip="Version installée : ${esc(u.installed || '?')}">${icon('download')}Mettre à jour (${esc(u.latest)})</button>`;
	if (u && !u.error) return `<span class="tag green" data-tip="Dernière version officielle">${icon('check')}À jour</span><button class="btn sm" data-action="emu-install" data-id="${id}" data-update="1" data-tip="Réinstaller la dernière version">${icon('refresh-cw')}</button>`;
	return `<button class="btn sm" data-action="emu-install" data-id="${id}" data-update="1" data-tip="Télécharger la dernière version officielle (réglages gardés)">${icon('refresh-cw')}Mettre à jour</button>`;
};

const renderSwitchKeys = () => {
	const k = state.switchKeys;
	if (!k) return '';
	const tag = (ok, label) => `<span class="tag ${ok ? 'green' : ''}">${ok ? icon('check') : ''}${label}</span>`;
	return `<div class="sug-row sw-keys">
		<div class="avatar">${icon('keyboard')}</div>
		<div class="grow">
			<div class="row wrap" style="gap:8px"><span class="bold">Clés Nintendo Switch</span>${tag(k.prod, 'prod.keys')}${tag(k.title, 'title.keys')}</div>
			<div class="small muted">Importe les clés extraites de <b>ta propre</b> console (Lockpick_RCM). Smash Emu les copie pour Citron, Eden et Ryujinx, et partage entre eux le firmware déjà installé. Pour installer le firmware : ouvre l’émulateur, puis Outils → Installer le firmware.</div>
		</div>
		<button class="btn sm primary" data-action="switch-import">${icon('upload')}Importer les clés</button>
		<button class="btn sm" data-action="switch-folder">${icon('folder-open')}Dossier</button>
		${k.installed ? `<button class="btn sm" data-action="switch-open">${icon('cpu')}Ouvrir l’émulateur Switch</button>` : ''}
	</div>`;
};

const renderEmuList = () => {
	const st = state.emulators || {};
	return Object.entries(state.info.externals).map(([id, e]) => {
		const cur = st[id] || {};
		return `<div class="sug-row">
			<div class="avatar">${icon('cpu')}</div>
			<div class="grow">
				<div class="row wrap" style="gap:8px"><span class="bold">${esc(e.label)}</span><span class="small muted">${e.systems.map(x => esc(sysInfo(x).label)).join(', ')}</span>
					${cur.path ? `<span class="tag green">${icon('check')}Installé${cur.managed && cur.managed.version ? ` · ${esc(cur.managed.version)}` : ''}</span>` : '<span class="tag">Non trouvé</span>'}</div>
				<div class="small muted ellipsis">${cur.path ? esc(cur.path) : esc(e.note || 'Installe-le puis clique sur « Rechercher à nouveau », ou indique son emplacement.')}</div>
			</div>
			<button class="btn sm" data-action="emu-browse" data-id="${id}">${icon('folder-open')}Parcourir</button>
			${cur.installable ? (cur.path ? updateBtn(id) : installBtn(id)) : ''}
			${cur.path ? '' : `<button class="btn sm ${cur.installable ? '' : 'primary'}" data-action="external" data-url="${esc(e.site)}">${icon(cur.installable ? 'globe' : 'download')}${cur.installable ? 'Site' : 'Télécharger'}</button>`}
		</div>${id === 'citron' ? renderSwitchKeys() : ''}`;
	}).join('');
};

const saveSetting = debounce(async (key, value) => {
	try {
		state.settings = await api('settings:set', { [key]: value });
		if (key.endsWith('Path')) {
			state.info = await api('app:info');
			state.opera.status = await api('opera:status');
		}
	} catch (error) { toastError(error); }
}, 400);

// =====================================================================
// Événements
// =====================================================================

const ACTIONS = {
	'nav-collapse': () => { try { localStorage.setItem('smash-nav', navCollapsed() ? 'open' : 'collapsed'); } catch { /* ignoré */ } renderNav(); },
	back: goBack,
	forward: goForward,
	crumb: (el) => { const c = TITLES[state.route.name](state.route.params)[+el.dataset.i]; if (c && c.to) go(...c.to); },
	nav: (el) => go(el.dataset.to),
	'win-min': () => api('window:minimize'),
	'win-max': () => api('window:maximize'),
	'win-close': () => api('window:close'),
	'new-instance': async () => { const inst = await newInstance(); if (inst) go('instance', { id: inst.id }); },
	'open-instance': (el) => go('instance', { id: el.dataset.id }),
	'inst-menu': (el) => instanceMenu(el, instById(el.dataset.id)),
	play: (el) => launchInstance(el.dataset.id),
	stop: (el) => stopInstance(el.dataset.id),
	'toggle-jump': () => { state.ui.jumpOpen = !state.ui.jumpOpen; render(); },
	'lib-type': (el) => { state.ui.libType = el.dataset.v; render(); },
	running: (el) => {
		if (!state.running.length) return;
		menu(el, state.running.flatMap((r) => {
			const i = instById(r.id) || { name: r.id };
			return [{ icon: 'play', label: `${i.name} — ${playTime(Date.now() - r.startedAt)}`, run: () => go('instance', { id: r.id, tab: 'logs' }) }, { icon: 'square', label: `Arrêter ${i.name}`, danger: true, run: () => stopInstance(r.id) }];
		}));
	},
	downloads: (el) => {
		const list = [...state.downloads.values()].reverse();
		const r = el.getBoundingClientRect();
		const pop = document.createElement('div');
		pop.className = 'popover';
		pop.style.left = `${Math.min(r.left - 150, window.innerWidth - 360)}px`;
		pop.innerHTML = `<h3 style="margin-bottom:10px">Téléchargements</h3>${list.length ? list.map(d => `<div style="margin-bottom:12px"><div class="row"><span class="grow ellipsis bold small">${esc(d.title)}</span><span class="small ${d.state === 'error' ? '' : 'muted'}" style="${d.state === 'error' ? 'color:var(--red)' : ''}">${{ downloading: d.total ? `${Math.round(d.received / d.total * 100)} %` : bytes(d.received), installing: 'Installation…', done: 'Installé', error: 'Erreur' }[d.state]}</span></div>${d.state === 'downloading' || d.state === 'installing' ? `<div class="progress"><div style="width:${d.total ? d.received / d.total * 100 : 30}%"></div></div>` : ''}${d.error ? `<div class="small" style="color:var(--red)">${esc(d.error)}</div>` : ''}</div>`).join('') : '<div class="small muted">Aucun téléchargement pendant cette session.</div>'}`;
		document.body.appendChild(pop);
		setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', off); } }), 0);
	},

	// Instance
	'inst-tab': (el) => go('instance', { ...state.route.params, tab: el.dataset.tab }, { push: false }),
	'content-filter': (el) => { instState.filter = el.dataset.v; renderContent(instById(state.route.params.id)); },
	'content-toggle': async (el) => {
		const id = state.route.params.id;
		const m = instState.content.find(c => c.key === el.dataset.key);
		try {
			await api('content:toggle', id, m.key, !m.enabled);
			instState.content = await api('content:list', id);
			renderContent(instById(id));
			refreshInstances();
		} catch (error) { toastError(error); }
	},
	'content-remove': async (el) => {
		const id = state.route.params.id;
		if (!await confirmModal('Supprimer le contenu', `Supprimer <b>${esc(el.dataset.name)}</b> de cette instance ?`, { confirm: 'Supprimer', danger: true })) return;
		try {
			await api('content:remove', id, el.dataset.key);
			instState.content = await api('content:list', id);
			await refreshInstances();
			renderContent(instById(id));
			toast(`« ${esc(el.dataset.name)} » supprimé`);
		} catch (error) { toastError(error); }
	},
	'patch-up': el => movePatch(el.dataset.key, -1),
	'patch-down': el => movePatch(el.dataset.key, 1),
	'import-files': async () => {
		const inst = instById(state.route.params.id);
		const exts = inst.type === 'coopdx' ? ['zip', 'lua'] : ['ips', 'bps', 'zip'];
		const files = await api('dialog:open', { multi: true, filters: [{ name: inst.type === 'coopdx' ? 'Mods Coop DX' : 'Patchs de ROM', extensions: exts }] });
		await installLocalFiles(inst.id, files);
	},
	'add-content': () => openDiscoverFor(instById(state.route.params.id)),
	'pick-library-rom': async () => {
		const id = state.route.params.id;
		const inst = instById(id);
		const list = romChoices(inst.type);
		const romId = await modal({
			title: 'Choisir une ROM',
			body: list.length ? `<div class="pick-list">${list.map(r => `<button class="pick-item" data-rom="${esc(r.id)}">${romCover(r, 'sm')}<div class="grow"><div class="bold ellipsis">${esc(r.name)}</div><div class="small muted">${esc(r.info.region)} · ${bytes(r.info.size)}</div></div>${icon('chevron-right', 'sm')}</button>`).join('')}</div>`
				: `<div class="empty" style="padding:24px">${icon('disc-3')}<h3>Aucune ROM compatible</h3><div>Importe d'abord une ROM depuis la page ROMs.</div></div>`,
			setup: (el, close) => el.addEventListener('click', (e) => { const b = e.target.closest('[data-rom]'); if (b) close(b.dataset.rom); }),
		});
		if (!romId) return;
		try {
			const updated = await api('instance:setLibraryRom', id, romId);
			state.instances = state.instances.map(i => (i.id === id ? updated : i));
			toast(`ROM définie : ${esc(updated.rom.info.known || updated.rom.info.title)}`);
			render();
		} catch (error) { toastError(error); }
	},
	'pick-rom': async () => {
		const id = state.route.params.id;
		const p = await api('dialog:open', { filters: [{ name: 'Jeu ou archive', extensions: [...state.info.extensions, 'zip', '7z', 'rar'] }] });
		if (!p) return;
		try {
			const updated = await api('instance:setRom', id, p);
			state.roms = await api('roms:list');
			state.instances = state.instances.map(i => (i.id === id ? updated : i));
			toast(`ROM définie : ${esc(updated.rom.info.known || updated.rom.info.title)}`);
			render();
		} catch (error) { toastError(error); }
	},
	'set-icon': async () => {
		const id = state.route.params.id;
		const p = await api('dialog:open', { filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico'] }] });
		if (!p) return;
		try { await api('instance:setIcon', id, p); await refreshInstances(); render(); } catch (error) { toastError(error); }
	},
	'remove-icon': async () => { await api('instance:setIcon', state.route.params.id, null); await refreshInstances(); render(); },
	'opt-chip': (el) => {
		const inst = instById(state.route.params.id);
		inst.options = { ...(inst.options || {}), [el.dataset.name]: el.dataset.v };
		renderOptions(inst);
		saveOption(inst.id, `options.${el.dataset.name}`, el.dataset.v);
	},
	'open-folder': (el) => api('instance:openFolder', el.dataset.id),
	duplicate: (el) => duplicateInstance(el.dataset.id),
	'delete-instance': (el) => deleteInstance(instById(el.dataset.id)),
	'copy-logs': () => { navigator.clipboard.writeText(instState.logs.map(l => l.line).join('\n')); toast('Journal copié'); },

	// ROMs
	'import-roms': async () => {
		const added = await importRomsDialog();
		if (added.length) { state.romScan = null; if (state.route.name === 'roms') render(); else go('roms'); }
	},
	'scan-roms': () => { state.romScan = null; render(); },
	'rom-add': async (el) => { await importRomFiles([el.dataset.path]); state.romScan = null; render(); },
	'rom-add-all': async () => {
		const files = (state.romScan || []).map(f => f.path);
		if (files.length) await importRomFiles(files);
		state.romScan = null;
		render();
	},
	'ost-inst': (el) => { const i = instById(el.dataset.id); openSoundtrack(instGameName(i), sysOf(i)); },
	'ost-rom': (el) => { const r = state.roms.find(x => x.id === el.dataset.id); if (r) openSoundtrack(r.name, r.system || 'n64'); },
	'rom-sys': (el) => { state.ui.romSys = el.dataset.v; render(); },
	'rom-play': async (el) => {
		try {
			const id = await api('roms:play', el.dataset.id);
			await refreshInstances();
			state.running = await api('run:status');
			toast(`${esc((instById(id) || {}).name || 'Le jeu')} se lance dans Smash Emu…`, { type: 'info' });
			state.roms = await api('roms:list');
			render();
		} catch (error) { toastError(error); }
	},
	'rom-menu': (el) => {
		const r = state.roms.find(x => x.id === el.dataset.id);
		if (!r) return;
		menu(el, [
			{ icon: 'play', label: 'Jouer', run: () => ACTIONS['rom-play'](el) },
			{ icon: 'music', label: 'Bande-son', run: () => openSoundtrack(r.name, r.system || 'n64') },
			...((r.system || 'n64') === 'n64' ? [{ icon: 'sparkles', label: 'Mods suggérés (compatibles)', run: () => go('suggest', { romId: r.id }) }] : []),
			{ icon: 'joystick', label: `Console : ${sysInfo(r.system).label} (changer)`, run: async () => {
				const sys = await askSystem({ ...r, needsSystem: Object.keys(state.info.systems) });
				if (sys) { await api('roms:setSystem', r.id, sys); await refreshRoms(); render(); }
			} },
			{ icon: 'plus', label: 'Créer une instance (mods, patchs)', run: async () => { const inst = await newInstance({ type: 'rom', romId: r.id, name: r.name }); if (inst) go('instance', { id: inst.id }); } },
			...r.instances.map(i => ({ icon: 'square-stack', label: `Ouvrir « ${i.name} »`, run: () => go('instance', { id: i.id }) })),
			{ icon: 'pencil', label: 'Renommer', run: () => renameRom(r) },
			{ icon: 'folder-open', label: 'Afficher le fichier', run: () => api('roms:show', r.id) },
			'-',
			{ icon: 'trash-2', label: 'Retirer de la bibliothèque', danger: true, run: async () => {
				if (!await confirmModal('Retirer la ROM', `Retirer <b>${esc(r.name)}</b> de la bibliothèque ? Les instances qui l'utilisent gardent leur copie.`, { confirm: 'Retirer', danger: true })) return;
				await api('roms:remove', r.id);
				await refreshRoms();
				render();
			} },
		]);
	},

	// Mods suggérés
	'sug-page': (el) => { sug.page = +el.dataset.p; loadSuggestions(); $('#page').scrollTop = 0; },
	'sug-toggle': () => { sug.showIncompatible = !sug.showIncompatible; sug.page = 1; render(); loadSuggestions(); },
	'sug-retry': () => loadSuggestions(),
	'sug-install': el => installSuggestion(el.dataset.key, !!el.dataset.play),
	'rom-suggest': el => go('suggest', { romId: el.dataset.id }),

	// Découvrir
	category: (el) => { Object.assign(state.discover, { category: el.dataset.v || null, page: 1, q: '' }); render(); loadDiscover(); },
	page: (el) => { state.discover.page = +el.dataset.p; loadDiscover(); $('#page').scrollTop = 0; },
	retry: () => loadDiscover(),
	'open-project': (el) => go('project', { slug: el.dataset.slug, title: el.dataset.title, instanceId: state.route.params.instanceId }),
	'install-mod': (el) => {
		const slug = el.dataset.slug;
		const mod = (state.discover.result && state.discover.result.items.find(m => m.slug === slug))
			|| (state.cache.popular || []).find(m => m.slug === slug)
			|| (state.currentProject && state.currentProject.slug === slug ? state.currentProject : { slug, title: slug });
		installFromCatalog(mod, state.route.params.instanceId || null);
	},
	external: (el) => api('shell:open', el.dataset.url),
	'show-path': (el) => api('shell:showPath', el.dataset.path),

	// Opera
	'opera-site': (el) => { state.opera.site = el.dataset.v; state.opera.q = $('#opera-q').value; render(); },
	'opera-go': async () => {
		const q = $('#opera-q').value.trim();
		if (!q) { $('#opera-q').focus(); return; }
		state.opera.q = q;
		const site = state.opera.site || ((instById(state.route.params.instanceId) || {}).type === 'rom' ? 'smwc' : 'coopdx');
		try { await api('opera:search', site, q); toast('Recherche ouverte dans Opera. Télécharge un mod : il apparaîtra ici avec un bouton Installer.', { type: 'info' }); } catch (error) { toastError(error); }
	},
	'opera-search-q': () => { state.opera.q = state.discover.q; go('opera', {}); },
	'opera-refresh': async () => { state.opera.files = await api('opera:recent'); render(); },
	'opera-import': async () => {
		const p = await api('dialog:open', { filters: [{ name: 'Mods', extensions: ['zip', 'lua', 'ips', 'bps', 'z64', 'v64', 'n64'] }] });
		if (!p) return;
		const types = typesForFile(p);
		const id = await chooseInstance({ instanceId: state.route.params.instanceId, types, title: 'Installer le fichier' });
		if (id) installLocalFiles(id, [p]);
	},
	'opera-install': (el) => {
		const f = state.opera.files.find(x => x.path === el.dataset.path);
		if (f) installOperaFile(f, state.route.params.instanceId || null);
	},

	// Paramètres
	'emu-refresh': async () => {
		$('#emu-list').innerHTML = '<div class="loading" style="padding:14px"><div class="spinner"></div>Recherche des émulateurs…</div>';
		state.emulators = await api('emulators:status', true);
		$('#emu-list').innerHTML = renderEmuList();
	},
	'update-check': async () => { try { await api('update:check'); } catch (error) { toastError(error); } },
	'update-download': () => api('update:download').catch(toastError),
	'update-install': () => api('update:install').catch(toastError),
	'emu-install': async (el) => {
		const id = el.dataset.id;
		state.emuInstall = { ...(state.emuInstall || {}), [id]: { state: 'resolving' } };
		$('#emu-list').innerHTML = renderEmuList();
		try {
			state.emulators = await api('emulators:install', id);
			const v = state.emulators[id] && state.emulators[id].managed && state.emulators[id].managed.version;
			if (state.emuUpdates && state.emuUpdates[id]) state.emuUpdates[id] = { installed: v, latest: v, update: false };
			toast(`${esc(state.info.externals[id].label)} ${el.dataset.update ? 'mis à jour' : 'installé'}${v ? ` (${esc(v)})` : ''}${id === 'ryujinx' && !el.dataset.update ? ' : tu peux importer tes clés ci-dessous' : ''}`);
		} catch (error) { toastError(error); }
		state.emuInstall[id] = { state: 'idle' };
		const box = $('#emu-list');
		if (box) box.innerHTML = renderEmuList();
		state.switchKeys = await api('switch:status').catch(() => state.switchKeys);
		if (box) box.innerHTML = renderEmuList();
	},
	'emu-check-updates': async (el) => {
		el.disabled = true;
		try {
			state.emuUpdates = await api('emulators:checkUpdates', true);
			const n = Object.values(state.emuUpdates).filter(u => u.update).length;
			const checked = Object.keys(state.emuUpdates).length;
			toast(!checked ? 'Aucun émulateur installé par Smash Emu à vérifier.' : n ? `${n} mise${n > 1 ? 's' : ''} à jour disponible${n > 1 ? 's' : ''}` : 'Tous tes émulateurs sont à jour');
		} catch (error) { toastError(error); }
		el.disabled = false;
		const box = $('#emu-list');
		if (box) box.innerHTML = renderEmuList();
	},
	'saves-folder': el => api('saves:folder', el.dataset.id),
	'saves-export': async (el) => { try { const f = await api('saves:export', el.dataset.id); if (f) toast('Sauvegarde exportée'); } catch (error) { toastError(error); } },
	'saves-import': async (el) => {
		try {
			const meta = await api('saves:import', el.dataset.id);
			if (!meta) return;
			toast('Sauvegarde importée : elle sera chargée au prochain lancement du jeu');
			renderSaves(instById(el.dataset.id));
		} catch (error) { toastError(error); }
	},
	'saves-restore': async (el) => {
		const ok = await confirmModal('Restaurer cette copie ?', 'La sauvegarde actuelle sera gardée en copie de secours, puis remplacée. Elle sera chargée au prochain lancement du jeu.', { confirm: 'Restaurer' });
		if (!ok) return;
		try { await api('saves:restore', el.dataset.id, el.dataset.name); toast('Copie restaurée'); renderSaves(instById(el.dataset.id)); } catch (error) { toastError(error); }
	},
	'saves-sync': async (el) => {
		try {
			const r = await api('saves:sync', el.dataset.id);
			toast({ pulled: 'Version plus récente récupérée depuis le cloud', pushed: 'Sauvegarde envoyée dans le dossier cloud', same: 'Déjà à jour', none: 'Rien à synchroniser' }[r.action] || esc(r.error || r.action), { type: r.action === 'error' || r.action === 'skipped' ? 'error' : 'success' });
			renderSaves(instById(el.dataset.id));
		} catch (error) { toastError(error); }
	},
	'saves-cloud': async () => {
		state.settings = await api('saves:pickCloud');
		if (state.route.name === 'instance') renderSaves(instById(state.route.params.id)); else render();
	},
	'saves-cloud-off': async () => { state.settings = await api('settings:set', { savesSyncDir: '' }); render(); },
	'saves-keep': async (el) => { state.settings = await api('settings:set', { saveBackups: +el.dataset.v }); render(); },
	'switch-import': async () => {
		const files = await api('dialog:open', { multi: true, filters: [{ name: 'Clés Switch', extensions: ['keys'] }] });
		if (!files) return;
		try {
			const r = await api('switch:import', files);
			state.switchKeys = r;
			$('#emu-list').innerHTML = renderEmuList();
			toast(`Clés importées : ${r.imported.join(', ')}`);
		} catch (error) { toastError(error); }
	},
	'switch-folder': () => api('switch:folder'),
	'switch-open': () => api('switch:open').catch(toastError),
	'emu-browse': async (el) => {
		const p = await api('dialog:open', { filters: [{ name: 'Programme', extensions: ['exe'] }] });
		if (!p) return;
		state.emulators = await api('emulators:set', el.dataset.id, p);
		$('#emu-list').innerHTML = renderEmuList();
	},
	'set-theme': async (el) => {
		if (String(el.dataset.v).startsWith('sup-') && !(state.supporter && state.supporter.active)) { toast('Thème réservé aux supporters : active un code dans le Tableau de bord.', { type: 'error' }); return; }
		state.settings = await api('settings:set', { theme: el.dataset.v });
		applyTheme(state.settings.theme);
		render();
	},
	'remote-host': async (el) => {
		try { await api('remote:host', el.dataset.id); toast('Le jeu démarre : le panneau d’invitation s’ouvre dans sa fenêtre (Ctrl+J)'); } catch (error) { toastError(error); }
	},
	'remote-host-rom': async (el) => {
		try { await api('remote:hostRom', el.dataset.id); await refreshInstances(); toast('Le jeu démarre : le panneau d’invitation s’ouvre dans sa fenêtre (Ctrl+J)'); } catch (error) { toastError(error); }
	},
	'remote-join': async () => {
		const code = ($('#remote-code') || {}).value || '';
		await api('remote:join', code);
	},
	'theme-edit': el => openThemeEditor(el.dataset.id ? SmashThemes.get(el.dataset.id) : null),
	'theme-share': async (el) => {
		const t = SmashThemes.get(el.dataset.id);
		await navigator.clipboard.writeText(SmashThemes.exportCode(t));
		toast(t.image || t.sticker ? 'Code copié. Les images ne tiennent pas dans un code : pour les partager, exporte le thème en fichier.' : 'Code du thème copié : envoie-le à tes amis', { timeout: 6000 });
	},
	'theme-export': async (el) => {
		const p = await api('themes:exportFile', SmashThemes.get(el.dataset.id)).catch(toastError);
		if (p) toast(`Thème exporté : <b>${esc(p.split(/[\\/]/).pop())}</b>`);
	},
	'theme-import': async () => {
		const code = await modal({
			title: 'Importer un thème',
			body: `<div class="field"><label>Code du thème</label><textarea class="input" id="ti-code" rows="4" placeholder="SMASHTHEME-…"></textarea></div>
				<div class="row" style="gap:10px"><button class="btn" data-file>${icon('file-plus')}Ouvrir un fichier .smashtheme</button><span class="small muted">Le fichier contient aussi les images du thème.</span></div>`,
			foot: '<button class="btn" data-no>Annuler</button><button class="btn primary" data-ok>Importer le code</button>',
			setup: (el, close) => {
				el.querySelector('[data-no]').onclick = () => close(null);
				el.querySelector('[data-ok]').onclick = () => close($('#ti-code', el).value);
				el.querySelector('[data-file]').onclick = () => close({ file: true });
			},
		});
		if (!code) return;
		try {
			let t;
			if (code.file) {
				const def = await api('themes:importFile');
				if (!def) return;
				t = SmashThemes.normalize({ ...def, id: undefined });
			} else t = SmashThemes.importCode(code);
			await saveCustomTheme(t, true);
			toast(`Thème « ${esc(t.label)} » importé`);
		} catch (error) { toastError(error); }
	},
	'theme-delete': async (el) => {
		if (!await confirmModal('Supprimer ce thème ?', 'Il disparaîtra de tes thèmes.', { confirm: 'Supprimer', danger: true })) return;
		const list = (state.settings.customThemes || []).filter(t => t.id !== el.dataset.id);
		const patch = { customThemes: list };
		if (state.settings.theme === el.dataset.id) patch.theme = 'smash';
		state.settings = await api('settings:set', patch);
		api('themes:cleanup').catch(() => {});
		syncCustomThemes();
		render();
	},
	'set-decor': async (el) => { state.settings = await api('settings:set', { decor: el.dataset.v }); render(); },
	'set-fontmode': async (el) => { state.settings = await api('settings:set', { fontMode: el.dataset.v }); render(); },
	'set-autotheme': async () => { state.settings = await api('settings:set', { autoTheme: state.settings.autoTheme === false }); render(); },
	'set-ui': async (el) => { state.settings = await api('settings:set', { uiStyle: el.dataset.v }); render(); },
	'toggle-anim': async () => { state.settings = await api('settings:set', { consoleAnim: state.settings.consoleAnim === false }); render(); },
	'set-logo': async (el) => {
		state.settings = await api('settings:set', { logo: el.dataset.v });
		applyLogo(state.settings.logo);
		render();
	},
	'set-resume': async (el) => { state.settings = await api('settings:set', { resumeMode: el.dataset.v }); render(); },
	'set-extui': async (el) => { state.settings = await api('settings:set', { externalUi: el.dataset.v }); render(); },
	'set-engine': async (el) => {
		state.settings = await api('settings:set', { defaultEngine: el.dataset.v });
		render();
	},
	'toggle-setting': async (el) => {
		const key = el.dataset.key;
		state.settings = await api('settings:set', { [key]: !state.settings[key] });
		render();
	},
	'browse-setting': async (el) => {
		const p = await api('dialog:open', { filters: [{ name: 'Programme', extensions: [el.dataset.ext] }] });
		if (!p) return;
		state.settings = await api('settings:set', { [el.dataset.key]: p });
		state.info = await api('app:info');
		state.opera.status = await api('opera:status');
		render();
	},
};

const movePatch = async (key, dir) => {
	const id = state.route.params.id;
	const patches = instState.content.filter(m => m.kind === 'patch').map(m => m.rel);
	const rel = key.split(':')[2];
	const i = patches.indexOf(rel);
	const j = i + dir;
	if (i < 0 || j < 0 || j >= patches.length) return;
	[patches[i], patches[j]] = [patches[j], patches[i]];
	await api('content:reorder', id, patches);
	instState.content = await api('content:list', id);
	await refreshInstances();
	renderContent(instById(id));
};

document.addEventListener('click', (e) => {
	const ext = e.target.closest('[data-external]');
	if (ext) { e.preventDefault(); api('shell:open', ext.dataset.external); return; }
	const el = e.target.closest('[data-action]');
	if (!el || el.disabled) return;
	// Un bouton dans une carte cliquable ne déclenche pas aussi la carte.
	e.stopPropagation();
	const fn = ACTIONS[el.dataset.action];
	if (fn) Promise.resolve(fn(el, e)).catch(toastError);
});

const INPUTS = {
	'lib-query': (el) => { state.ui.libQuery = el.value; $('#lib-grid').innerHTML = libraryGrid(); },
	'lib-sort': (el) => { state.ui.libSort = el.value; $('#lib-grid').innerHTML = libraryGrid(); },
	'lib-group': (el) => { state.ui.libGroup = el.value; $('#lib-grid').innerHTML = libraryGrid(); },
	'player-name': debounce(async (el) => { state.settings = await api('settings:set', { playerName: el.value.trim() || 'Mario' }); }, 400),
	'content-query': (el) => {
		instState.query = el.value;
		const pos = el.selectionStart;
		renderContent(instById(state.route.params.id));
		const input = $('[data-input="content-query"]');
		input.focus();
		input.setSelectionRange(pos, pos);
	},
	'discover-q': debounce((el) => {
		state.discover.q = el.value;
		state.discover.page = 1;
		$('[data-input="discover-sort"]').disabled = !!el.value.trim();
		loadDiscover();
	}, 450),
	'sug-q': debounce((el) => { sug.q = el.value; sug.page = 1; loadSuggestions(); }, 450),
	'sug-version': (el) => { sug.picked[el.dataset.key] = +el.value; renderSuggestions(); },
	'discover-sort': (el) => { state.discover.sort = el.value; state.discover.page = 1; loadDiscover(); },
};

document.addEventListener('input', (e) => {
	const el = e.target;
	if (el.id === 'theme-search') {
		// Filtre la grille sans la redessiner (le champ garde le focus).
		const q = el.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
		for (const card of document.querySelectorAll('#theme-grid .theme-card')) card.classList.toggle('hidden', !!q && !card.textContent.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
		return;
	}
	if (el.dataset.input && INPUTS[el.dataset.input]) INPUTS[el.dataset.input](el);
	if (el.dataset.opt) saveOption(state.route.params.id, el.dataset.opt, el.value);
	if (el.dataset.setting) saveSetting(el.dataset.setting, el.value.trim());
	if (el.dataset.settingRange) {
		const v = +el.value / 100;
		const label = $('#vol-label');
		if (label) label.textContent = `${el.value} %`;
		saveSetting(el.dataset.settingRange, v);
	}
});

document.addEventListener('keydown', (e) => {
	if (e.key === 'Enter' && e.target.id === 'opera-q') ACTIONS['opera-go']();
	if (e.altKey && e.key === 'ArrowLeft') goBack();
	if (e.altKey && e.key === 'ArrowRight') goForward();
});

document.addEventListener('mouseup', (e) => {
	if (e.button === 3) goBack();
	if (e.button === 4) goForward();
});

// Glisser-déposer de fichiers sur une instance.
const dropZone = () => $(state.route.name === 'roms' ? '#rom-drop' : '#drop-zone');
document.addEventListener('dragover', (e) => {
	if (!['instance', 'roms', 'home'].includes(state.route.name)) return;
	e.preventDefault();
	const z = dropZone();
	if (z) z.classList.add('drop-hint');
});
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) { const z = dropZone(); if (z) z.classList.remove('drop-hint'); } });
document.addEventListener('drop', async (e) => {
	e.preventDefault();
	const z = dropZone();
	if (z) z.classList.remove('drop-hint');
	const paths = [...e.dataTransfer.files].map(f => window.launcher.pathForFile(f)).filter(Boolean);
	if (!paths.length) return;
	// Sur l'accueil et la page ROMs, on importe des jeux ; sur une instance, du contenu (mods, patchs, ROM).
	if (state.route.name === 'roms' || state.route.name === 'home') {
		const added = await importRomFiles(paths).catch((err) => { toastError(err); return []; });
		if (added.length) { state.romScan = null; if (state.route.name === 'roms') render(); else go('roms'); }
	} else if (state.route.name === 'instance') {
		installLocalFiles(state.route.params.id, paths);
	}
});

// ---------- Événements du processus principal ----------

window.launcher.on('run:status', async (running) => {
	state.running = running;
	await refreshInstances();
	renderTopbar();
	renderNav();
	if (['home', 'library'].includes(state.route.name)) render();
	if (state.route.name === 'instance') {
		const btn = $('.inst-header [data-action="play"], .inst-header [data-action="stop"]');
		const inst = instById(state.route.params.id);
		if (btn && inst) btn.outerHTML = playButton(inst, 'lg');
	}
});

window.launcher.on('run:log', ({ id, stream, text }) => {
	if (state.route.name !== 'instance' || state.route.params.id !== id) return;
	for (const line of text.split(/\r?\n/).filter(Boolean)) instState.logs.push({ stream, line });
	const box = $('#logs');
	if (!box) return;
	const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
	if (box.querySelector('.muted')) box.innerHTML = '';
	for (const line of text.split(/\r?\n/).filter(Boolean)) {
		const d = document.createElement('div');
		d.className = stream;
		d.textContent = line;
		box.appendChild(d);
	}
	if (atBottom) box.scrollTop = box.scrollHeight;
});

window.launcher.on('download', (d) => {
	state.downloads.set(d.id, d);
	renderTopbar();
});

window.launcher.on('opera:download', (file) => {
	state.opera.files = [file, ...state.opera.files.filter(f => f.path !== file.path)];
	state.opera.fresh.add(file.path);
	toast(`Opera a téléchargé <b>${esc(file.name)}</b>`, {
		type: 'info',
		actions: [file.kind === 'rom'
			? { label: 'Ajouter aux ROM', run: async () => { await importRomFiles([file.path]); state.romScan = null; go('roms'); } }
			: { label: 'Installer', run: () => installOperaFile(file, state.route.name === 'opera' ? state.route.params.instanceId : null) }],
	});
	if (state.route.name === 'opera' || state.route.name === 'home') render();
});

window.launcher.on('window:state', () => {});

// Switch installée d'office (Eden en arrière-plan au démarrage s'il n'y a aucun émulateur Switch).
window.launcher.on('switch:auto', async (r) => {
	if (r.ok) {
		state.emulators = await api('emulators:status').catch(() => state.emulators);
		toast('🎮 <b>Switch prête</b> : Eden est installé. Importe les clés de ta console dans Paramètres → Émulateurs pour jouer.', { type: 'success', timeout: 10000 });
	} else toast(`Switch : Eden n’a pas pu s’installer pour l’instant (${esc(r.error)}). Smash Emu réessaiera au prochain démarrage.`, { type: 'info', timeout: 9000 });
});

window.launcher.on('emuinstall', (p) => {
	state.emuInstall = { ...(state.emuInstall || {}), [p.id]: p };
	const box = $('#emu-list');
	if (box && p.state !== 'done') box.innerHTML = renderEmuList();
});

let updToastVersion = null;
window.launcher.on('update:state', (u) => {
	state.update = u;
	const box = $('#upd-box');
	if (box) box.innerHTML = renderUpdate();
	if (u.state === 'available' && updToastVersion !== u.version) {
		updToastVersion = u.version;
		toast(`Smash Emu <b>${esc(u.version)}</b> est disponible : téléchargement en arrière-plan…`, { type: 'info', timeout: 8000 });
	}
	if (u.state === 'ready') toast(`Mise à jour ${esc(u.version || '')} prête : elle s’installe toute seule à la fermeture de Smash Emu`, { type: 'success', timeout: 20000, actions: [{ label: 'Redémarrer maintenant', run: () => api('update:install') }] });
});
api('update:get').then((u) => { state.update = u; }).catch(() => {});

// ---------- Démarrage ----------

(async () => {
	$('#splash-logo').innerHTML = SmashLogo.svg(88) + SmashLogo.wordmark();
	const shown = Date.now();
	try {
		await refreshAll();
		render();
	} catch (error) {
		document.body.innerHTML = `<div class="empty" style="margin:40px">${icon('triangle-alert')}<h3>Smash Emu n’a pas pu démarrer</h3><div>${esc(error.message)}</div></div>`;
		return;
	}
	// L'écran de démarrage reste au moins 0,9 s, puis s'efface.
	setTimeout(() => {
		const splash = $('#splash');
		splash.classList.add('done');
		setTimeout(() => splash.remove(), 450);
	}, Math.max(0, 900 - (Date.now() - shown)));
})();
