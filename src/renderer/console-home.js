/* global state, api, icon, esc, toast, toastError, render, setMain, PAGES, ACTIONS, fileUrl, SYS_SHORT, sysOf, sysInfo, playTime, ago, isRunning, launchInstance, instanceMenu, romInitials, sortInstances, refreshInstances, consoleUi, modal, go, $, $$ */
// Accueil de l'interface « Console », inspiré des menus de salon : rangée de grandes tuiles (style Switch), grille
// par pages (style Wii U) ou chaînes (style Wii). Création originale, sans élément Nintendo. Le décor de toute
// l'application prend la couleur et le motif de la console du jeu sélectionné et les teintes de sa jaquette ;
// navigation à la souris, au clavier et à la manette.

const CH = { page: 0, sel: 0, palettes: {}, info: {}, pad: { at: 0, held: '' }, loop: false, coverBusy: false };
const GEOM = { row: { cols: 0, per: 0 }, grid: { cols: 5, per: 15 }, wii: { cols: 4, per: 12 } };
const chLayout = () => (GEOM[state.settings.consoleLayout] ? state.settings.consoleLayout : 'row');

// Couleur d'identité et motif de fond de chaque console.
const SYS_LOOK = {
	nes: ['#c8102e', 'grid'], snes: ['#5b4ba8', 'grid'], n64: ['#1fa64a', 'grid'], gc: ['#5a4fcf', 'grid'], wii: ['#34bdf0', 'grid'], wiiu: ['#00a9e0', 'grid'], switch: ['#e60012', 'grid'],
	gb: ['#8bac0f', 'dots'], gbc: ['#7b5cd6', 'dots'], gba: ['#4b3fae', 'dots'], vb: ['#d0021b', 'dots'], nds: ['#8d96a0', 'grid'], '3ds': ['#d12229', 'grid'],
	psx: ['#7d8996', 'shapes'], ps2: ['#1d3c8f', 'shapes'], ps3: ['#3a3f47', 'shapes'], psp: ['#43474f', 'shapes'], ps4: ['#003791', 'shapes'],
	sms: ['#e02020', 'stripes'], md: ['#1f4fbf', 'stripes'], gg: ['#3b3b3b', 'stripes'], segacd: ['#1f4fbf', 'stripes'], '32x': ['#c81e1e', 'stripes'], saturn: ['#26357a', 'stripes'],
	xbox: ['#107c10', 'rings'], x360: ['#5dc21e', 'rings'],
	pce: ['#e8752a', 'stripes'], a2600: ['#b5651d', 'stripes'], a7800: ['#b5651d', 'stripes'], lynx: ['#d4a017', 'dots'], jaguar: ['#c0392b', 'stripes'], '3do': ['#bfa14a', 'stripes'],
};
const chSys = i => (i.type === 'coopdx' ? 'n64' : sysOf(i) || 'n64');
const lookOf = sys => SYS_LOOK[sys] || ['#7a7f8a', 'grid'];
const chHue = name => [...String(name)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 3600, 7) % 360;

// Motif de fond dessiné en SVG, propre à chaque famille de consoles (décor « Console du jeu »).
const chMotif = (kind, color) => {
	const s = `stroke='${color}' fill='none' stroke-opacity='0.16'`;
	const svg = {
		grid: `<svg xmlns='http://www.w3.org/2000/svg' width='46' height='46'><path d='M46 0H0v46' ${s} stroke-width='1'/></svg>`,
		dots: `<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14'><circle cx='7' cy='7' r='1.6' fill='${color}' fill-opacity='0.22'/></svg>`,
		shapes: `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><g ${s} stroke-width='2'><path d='M20 34l12-20 12 20z'/><circle cx='92' cy='26' r='11'/><path d='M14 80l20 20M34 80l-20 20'/><rect x='80' y='78' width='22' height='22'/></g></svg>`,
		stripes: `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28'><path d='M-7 7l14-14M0 28L28 0M21 35l14-14' ${s} stroke-width='3'/></svg>`,
		rings: `<svg xmlns='http://www.w3.org/2000/svg' width='90' height='90'><g ${s} stroke-width='1.5'><circle cx='45' cy='45' r='14'/><circle cx='45' cy='45' r='30'/></g></svg>`,
	}[kind];
	return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};

// Couleur CSS → [r, g, b] (#rrggbb ou hsl(h s% l%)).
const toRgb = (c) => {
	if (c.startsWith('#')) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
	const [h, s, l] = (c.match(/[\d.]+/g) || [0, 0, 50]).map(Number);
	const k = n => (n + h / 30) % 12;
	const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
	return [0, 8, 4].map(n => Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))));
};

// Teinte de toute l'application : couleurs de la jaquette (ou de la console) du jeu donné ; la couleur d'accent
// (boutons, sélection) suit aussi le jeu quand « Couleurs du jeu » est activé.
const TINT_VARS = ['--ch-main', '--ch-accent', '--ch-sys', '--ch-motif', '--brand', '--brand-rgb', '--brand-hover'];
const uiTint = (inst) => {
	const root = document.documentElement;
	if (!inst || !consoleUi()) { for (const v of TINT_VARS) root.style.removeProperty(v); return; }
	const sys = chSys(inst);
	const [sysColor, kind] = lookOf(sys);
	const pal = CH.palettes[inst.id];
	const own = state.settings.consoleTint !== false;
	const main = own ? (pal && pal.main) || `hsl(${chHue(inst.name)} 70% 48%)` : sysColor;
	root.style.setProperty('--ch-main', main);
	root.style.setProperty('--ch-accent', own ? (pal && pal.accent) || sysColor : sysColor);
	root.style.setProperty('--ch-sys', sysColor);
	root.style.setProperty('--ch-motif', chMotif(kind, root.hasAttribute('data-ui-dark') ? '#ffffff' : sysColor));
	// Style « Thème » : la couleur d'accent reste celle du thème ; seule la sélection prend la couleur du jeu.
	if (own && ['light', 'dark'].includes(state.settings.consoleStyle)) {
		const rgb = toRgb(main);
		root.style.setProperty('--brand', `rgb(${rgb.join(', ')})`);
		root.style.setProperty('--brand-rgb', rgb.join(', '));
		root.style.setProperty('--brand-hover', `rgb(${rgb.map(v => Math.min(255, v + 28)).join(', ')})`);
	} else for (const v of ['--brand', '--brand-rgb', '--brand-hover']) root.style.removeProperty(v);
};

// Fond d'écran du jeu (choisi parmi 6 images ou importé) : fondu enchaîné entre deux calques.
let wallSrc = '';
const uiWall = (inst) => {
	const box = document.getElementById('ui-wall');
	if (!box) return;
	const src = inst && inst.bgFile ? `${fileUrl(inst.bgFile)}?v=${inst.bgAt || 0}` : '';
	if (src === wallSrc) return;
	wallSrc = src;
	const [a, b] = box.children;
	const next = a.classList.contains('on') ? b : a;
	const cur = next === a ? b : a;
	cur.classList.remove('on');
	box.classList.toggle('has', !!src);
	if (!src) return;
	const img = new Image();
	img.onload = () => { if (wallSrc !== src) return; next.style.backgroundImage = `url("${src}")`; next.classList.add('on'); };
	img.src = src;
};

const openBackgrounds = async (inst) => {
	await modal({
		title: `Fond d’écran · ${inst.name}`,
		width: 780,
		body: `<div class="bg-grid" id="bg-grid">${'<div class="bg-cand skel"></div>'.repeat(6)}</div>
			<div class="row" style="gap:8px;margin-top:14px;flex-wrap:wrap"><button class="btn" data-bg-import>${icon('upload')}Image du PC</button>${inst.bgFile ? `<button class="btn" data-bg-remove>${icon('trash-2')}Retirer le fond</button>` : ''}<span class="grow"></span><span class="small muted">Écrans titres, captures et boîtes (libretro-thumbnails)</span></div>`,
		setup: async (el, close) => {
			const grid = el.querySelector('#bg-grid');
			const done = async (msg) => {
				await refreshInstances();
				const fresh = state.instances.find(i => i.id === inst.id);
				uiWall(fresh);
				toast(msg);
				close();
				render();
			};
			el.addEventListener('click', async (e) => {
				const c = e.target.closest('[data-k]');
				try {
					if (c) { c.classList.add('busy'); await api('bg:set', inst.id, c.dataset.url); await done('Fond d’écran appliqué.'); }
					if (e.target.closest('[data-bg-import]')) { if (await api('bg:import', inst.id)) await done('Fond d’écran importé.'); }
					if (e.target.closest('[data-bg-remove]')) { await api('bg:remove', inst.id); await done('Fond d’écran retiré.'); }
				} catch (error) { toastError(error); if (c) c.classList.remove('busy'); }
			});
			let list = [];
			try { list = await api('bg:candidates', inst.id); } catch (error) { grid.innerHTML = `<div class="empty small">${esc(error.message)}</div>`; return; }
			grid.innerHTML = list.length
				? list.map((c, k) => `<button class="bg-cand" data-k="${k}" data-url="${esc(c.url)}"><img src="${esc(c.url)}" alt="" loading="lazy"><span>${esc(c.label)}</span><small>${esc(c.name)}</small></button>`).join('')
				: '<div class="empty small">Aucune image trouvée pour ce jeu : importe une image de ton PC.</div>';
		},
	});
};
ACTIONS['bg-pick'] = (el) => { const inst = state.instances.find(i => i.id === el.dataset.id); if (inst) openBackgrounds(inst); };

// Petits sons d'interface synthétisés (désactivables).
let chAudio = null;
const chBlip = (f = 760, d = 0.035, vol = 0.04, delay = 0) => {
	if (state.settings.consoleSounds === false) return;
	try {
		chAudio = chAudio || new AudioContext();
		const t = chAudio.currentTime + delay;
		const o = chAudio.createOscillator();
		const g = chAudio.createGain();
		o.type = 'sine';
		o.frequency.setValueAtTime(f, t);
		g.gain.setValueAtTime(vol, t);
		g.gain.exponentialRampToValueAtTime(0.0001, t + d);
		o.connect(g).connect(chAudio.destination);
		o.start(t);
		o.stop(t + d + 0.02);
	} catch { /* pas de son */ }
};
const chSound = { move: () => chBlip(700, 0.03, 0.03), page: () => chBlip(520, 0.06, 0.035), ok: () => { chBlip(880, 0.05); chBlip(1320, 0.07, 0.04, 0.06); }, back: () => chBlip(420, 0.06, 0.035) };

const chList = () => sortInstances(state.instances, state.settings.consoleSort || 'played');

// Ordre d'apparition des tuiles à l'arrivée sur l'accueil (les tuiles visibles d'abord).
const chDelay = (idx) => {
	const layout = chLayout();
	if (layout === 'row') return Math.max(0, Math.min(8, idx - CH.sel + 1));
	return Math.min(14, idx % GEOM[layout].per);
};

// Lancement façon console : la tuile s'agrandit au centre de l'écran, puis « Démarrage… ».
const chLaunchFx = (inst) => {
	const tile = $('.ch-tile.sel');
	if (!tile || state.settings.consoleAnim === false) return;
	const r = tile.getBoundingClientRect();
	const fx = document.createElement('div');
	fx.className = 'ch-launch';
	fx.innerHTML = `<div class="ch-launch-art" style="left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px">${chArt(inst)}</div>
		<div class="ch-launch-text"><b>${esc(inst.name)}</b><span>Démarrage…</span><i></i></div>`;
	document.body.appendChild(fx);
	requestAnimationFrame(() => requestAnimationFrame(() => fx.classList.add('go')));
	chBlip(523, 0.12, 0.035);
	chBlip(659, 0.12, 0.035, 0.1);
	chBlip(784, 0.22, 0.04, 0.2);
	setTimeout(() => fx.classList.add('out'), 2400);
	setTimeout(() => fx.remove(), 2900);
};

const chArt = (i) => {
	const img = i.coverFile ? `${fileUrl(i.coverFile)}?v=${i.coverAt || 0}` : (i.iconData || null);
	return img
		? `<img class="ch-blur" src="${esc(img)}" alt=""><img class="ch-img" src="${esc(img)}" alt="">`
		: `<div class="ch-gen" style="--h:${chHue(i.name)}"><span>${esc(romInitials(i.name))}</span></div>`;
};
const chTile = (i, idx) => {
	const sys = chSys(i);
	return `<button class="ch-tile ${idx === CH.sel ? 'sel' : ''} ${isRunning(i.id) ? 'running' : ''}" data-action="ch-tile" data-i="${idx}" style="--sys:${lookOf(sys)[0]};--k:${chDelay(idx)}">
		<div class="ch-art">${chArt(i)}</div>
		<span class="ch-sys">${esc(i.type === 'coopdx' ? 'COOP' : SYS_SHORT[sys] || sys.toUpperCase())}</span>
		${isRunning(i.id) ? '<span class="ch-live">EN JEU</span>' : ''}
	</button>`;
};
const chAddTile = idx => `<button class="ch-tile ch-add ${idx === CH.sel ? 'sel' : ''}" data-action="ch-tile" data-i="${idx}" style="--k:${chDelay(idx)}"><div class="ch-art">${icon('plus')}<span>Ajouter des jeux</span></div></button>`;

// Boutons de manette affichés en bas à droite (cliquables aussi).
const chHints = () => `<div class="ch-hints">
	<button data-action="ch-details"><b class="pad-x">X</b>Détails</button>
	<button data-action="ch-menu"><b class="pad-y">Y</b>Options</button>
	<button data-action="ch-play"><b class="pad-a">A</b>Jouer</button>
	<button data-action="ch-options"><b class="pad-plus">≡</b>Accueil</button>
</div>`;

const consoleHome = () => {
	const list = chList();
	const layout = chLayout();
	const g = GEOM[layout];
	CH.sel = Math.max(0, Math.min(CH.sel, list.length));
	const missing = list.filter(i => !i.coverFile && (i.type === 'rom' || i.type === 'coopdx')).length;
	const coverHint = CH.coverBusy
		? `<span class="ch-hint busy" id="ch-cover-progress">${icon('refresh-cw')}Recherche des jaquettes…</span>`
		: missing ? `<button class="ch-hint" data-action="ch-covers">${icon('image')}${missing} jeu${missing > 1 ? 'x' : ''} sans jaquette · <b>Les trouver</b></button>` : '';
	let body;
	if (layout === 'row') {
		const groups = Math.max(1, Math.ceil((list.length + 1) / 6));
		const slots = Math.max(0, 6 - ((list.length + 1) % 6 || 6)) + 2;
		body = `<div class="ch-row-wrap"><div class="ch-row" id="ch-row">${list.map(chTile).join('')}${chAddTile(list.length)}${'<div class="ch-slot"></div>'.repeat(slots)}</div></div>
			<div class="ch-info" id="ch-info"></div>
			<footer class="ch-foot">
				<div class="ch-lbrb"><b>LB</b>${Array.from({ length: groups }, (_, p) => `<i class="${p === Math.floor(CH.sel / 6) ? 'on' : ''}"></i>`).join('')}<b>RB</b>${coverHint}</div>
				${chHints()}
			</footer>`;
	} else {
		const pages = Math.max(1, Math.ceil((list.length + 1) / g.per));
		CH.page = Math.max(0, Math.min(Math.floor(CH.sel / g.per), pages - 1));
		const pagesHtml = Array.from({ length: pages }, (_, p) => `<div class="ch-page"><div class="ch-grid">${Array.from({ length: g.per }, (__, k) => {
			const idx = p * g.per + k;
			if (idx < list.length) return chTile(list[idx], idx);
			if (idx === list.length) return chAddTile(idx);
			return `<div class="ch-slot">${layout === 'wii' ? '<span>SMASH</span>' : ''}</div>`;
		}).join('')}</div></div>`).join('');
		const d = new Date();
		body = `${layout === 'grid' ? '<div class="ch-balloon" id="ch-info"></div>' : ''}
			<div class="ch-stage">
				<button class="ch-arrow" data-action="ch-page" data-d="-1" ${CH.page ? '' : 'disabled'}>${icon('chevron-left')}</button>
				<div class="ch-viewport"><div class="ch-pages" id="ch-pages" style="transform:translateX(${-CH.page * 100}%)">${pagesHtml}</div></div>
				<button class="ch-arrow" data-action="ch-page" data-d="1" ${CH.page < pages - 1 ? '' : 'disabled'}>${icon('chevron-right')}</button>
			</div>
			${layout === 'wii' ? `<div class="ch-dots">${coverHint}</div><div class="ch-wiibar">
				<svg class="ch-wiicurve" viewBox="0 0 1000 118" preserveAspectRatio="none"><path class="fill" d="M0 40 H300 C350 40 360 14 410 14 H590 C640 14 650 40 700 40 H1000 V118 H0 Z" /><path class="line" d="M0 40 H300 C350 40 360 14 410 14 H590 C640 14 650 40 700 40 H1000" /></svg>
				<div class="ch-wiilabel">Menu Smash Emu</div>
				<button class="ch-wiiround" data-action="ch-options" data-tip="Réglages de l’accueil" data-tip-pos="top">${icon('gamepad-2')}</button>
				<div class="ch-wiidate"><span id="ch-wii-info"></span><b>${esc(d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' }))}</b></div>
				<button class="ch-wiiround" data-action="nav" data-to="friends" data-tip="Amis" data-tip-pos="top">${icon('mail')}</button>
			</div>` : `<div class="ch-dots">${Array.from({ length: pages }, (_, p) => `<button class="${p === CH.page ? 'on' : ''}" data-action="ch-goto" data-p="${p}"></button>`).join('')}${coverHint}</div>`}
`;
	}
	setMain(`<div class="ch ch-l-${layout} ${state.prevRendered !== 'home' ? 'ch-intro' : ''}" id="ch">${body}</div>`);
	$('#page').classList.add('page-console');
	chSelect(CH.sel, { silent: true });
	chLoadPalettes(list);
	chStartPad();
};

// Couleurs des jaquettes calculées par le processus principal (une seule fois par image).
const chLoadPalettes = async (list) => {
	const missing = list.filter(i => i.coverFile && !(i.id in CH.palettes)).map(i => i.id);
	if (!missing.length) return;
	try { Object.assign(CH.palettes, await api('covers:palettes', missing)); } catch { return; }
	if ($('#ch')) chSelect(CH.sel, { silent: true });
};

// Pastilles d'informations sur le jeu sélectionné (temps de jeu, trophées, deux dernières semaines).
const chPills = (inst, info) => {
	const sys = chSys(inst);
	const sysLabel = inst.type === 'coopdx' ? 'Super Mario 64 Coop DX' : sysInfo(sys).label;
	const pill = (ic, html, cls = '') => `<span class="ch-pill ${cls}">${icon(ic)}<span>${html}</span></span>`;
	const out = [];
	if (isRunning(inst.id)) out.push(pill('play', '<b>En cours</b>', 'live'));
	out.push(pill('clock', inst.playTimeMs ? `<b>${esc(playTime(inst.playTimeMs))} de jeu</b>${inst.lastPlayed ? ` dernière partie ${esc(ago(inst.lastPlayed))}` : ''}` : '<b>Jamais lancé</b>'));
	if (info && info.trophies.latest) out.push(pill('trophy', `<b>${esc(info.trophies.latest.name)}</b> obtenu ! ${esc(ago(info.trophies.latest.at))}`));
	if (info) out.push(pill('badge-check', `<b>${info.trophies.count}</b> trophée${info.trophies.count > 1 ? 's' : ''} sur ${info.trophies.total}`));
	if (info && info.twoWeeks > 60000) out.push(pill('calendar', `<b>${esc(playTime(info.twoWeeks))}</b> ces 2 semaines`));
	out.push(pill('gamepad-2', esc(sysLabel)));
	return out.join('');
};

// Sélection : tuile mise en avant, informations, décor aux couleurs du jeu et de sa console.
const chSelect = (idx, { silent = false } = {}) => {
	const list = chList();
	const root = $('#ch');
	if (!root) return;
	const layout = chLayout();
	CH.sel = Math.max(0, Math.min(idx, list.length));
	for (const t of $$('.ch-tile', root)) t.classList.toggle('sel', +t.dataset.i === CH.sel);
	if (layout === 'row') {
		const row = $('#ch-row');
		const tile = $('.ch-tile.sel', root);
		if (row && tile) {
			// La tuile choisie reste près du bord gauche, comme dans les menus de console.
			const step = tile.offsetWidth + parseFloat(getComputedStyle(row).columnGap || 24);
			const max = Math.max(0, row.scrollWidth - row.parentElement.clientWidth);
			row.style.transform = `translateX(${-Math.min(max, Math.max(0, (CH.sel - 1) * step))}px)`;
		}
		$$('.ch-lbrb i', root).forEach((d, p) => d.classList.toggle('on', p === Math.floor(CH.sel / 6)));
	} else {
		const page = Math.floor(CH.sel / GEOM[layout].per);
		if (page !== CH.page) chGoto(page, { silent: true });
	}
	const inst = list[CH.sel];
	const info = $('#ch-info');
	const wiiInfo = $('#ch-wii-info');
	uiTint(inst || null);
	uiWall(inst || null);
	if (!inst) {
		if (info) info.innerHTML = '<b class="ch-name">Ajouter des jeux</b><div class="ch-pills"><span class="ch-pill">Importe les jeux de tes cartouches et disques</span></div>';
		if (wiiInfo) wiiInfo.textContent = 'Ajouter des jeux';
		return;
	}
	if (wiiInfo) wiiInfo.textContent = inst.name;
	if (info) {
		const head = `<b class="ch-name">${esc(inst.name)}</b>`;
		info.innerHTML = layout === 'grid'
			? `${head}<span class="ch-sub">${esc(inst.type === 'coopdx' ? 'Coop DX' : sysInfo(chSys(inst)).label)} · ${inst.playTimeMs ? `${esc(playTime(inst.playTimeMs))} de jeu` : 'jamais lancé'}${inst.lastPlayed ? ` · ${esc(ago(inst.lastPlayed))}` : ''}</span>`
			: `${head}<div class="ch-pills">${chPills(inst, CH.info[inst.id])}</div>`;
		if (layout === 'row' && !CH.info[inst.id]) {
			api('console:gameInfo', inst.id).then((x) => {
				CH.info[inst.id] = x;
				const cur = chList()[CH.sel];
				if (cur && cur.id === inst.id && $('#ch-info')) $('#ch-info').innerHTML = `${head}<div class="ch-pills">${chPills(inst, x)}</div>`;
			}).catch(() => {});
		}
	}
	if (!silent) chSound.move();
};

const chGoto = (p, { silent = false } = {}) => {
	const pages = $$('.ch-page').length;
	if (!pages) return;
	CH.page = Math.max(0, Math.min(p, pages - 1));
	const strip = $('#ch-pages');
	if (strip) strip.style.transform = `translateX(${-CH.page * 100}%)`;
	$$('.ch-dots button').forEach((b, i) => b.classList.toggle('on', i === CH.page));
	const [prev, next] = $$('.ch-arrow');
	if (prev) prev.disabled = CH.page === 0;
	if (next) next.disabled = CH.page >= pages - 1;
	if (!silent) chSound.page();
};

const chMove = (dx, dy) => {
	const count = chList().length + 1;
	const layout = chLayout();
	let i = CH.sel;
	if (layout === 'row') {
		if (!dx) return;
		i += dx;
	} else {
		const { cols, per } = GEOM[layout];
		const k = i % per;
		const col = k % cols;
		const row = Math.floor(k / cols);
		if (dx > 0 && col === cols - 1) i = (Math.floor(i / per) + 1) * per + row * cols;
		else if (dx < 0 && col === 0) i = (Math.floor(i / per) - 1) * per + row * cols + cols - 1;
		else i += dx;
		if (dy) i += dy * cols;
	}
	if (i >= count && dx > 0) i = count - 1;
	if (i < 0 || i >= count || i === CH.sel) return;
	chSelect(i);
};

// LB / RB : saut d'une page (6 jeux dans la rangée).
const chJump = (d) => {
	const layout = chLayout();
	const per = layout === 'row' ? 6 : GEOM[layout].per;
	const count = chList().length + 1;
	const next = Math.max(0, Math.min(count - 1, (Math.floor(CH.sel / per) + d) * per));
	if (next !== CH.sel) { chSelect(next, { silent: true }); chSound.page(); }
};

const chCurrent = () => chList()[CH.sel];
const chLaunch = () => {
	const inst = chCurrent();
	chSound.ok();
	if (!inst) { ACTIONS['import-roms'](); return; }
	if (isRunning(inst.id)) ACTIONS.stop({ dataset: { id: inst.id } });
	else { chLaunchFx(inst); launchInstance(inst.id); }
};

const uiFullscreen = () => api('window:fullscreen').catch(() => {});

// ---------- Manette (API Gamepad) ----------
// Croix ou stick : déplacer ; A : jouer ; B : retour ; X : détails ; Y : options du jeu ; LB / RB : page ;
// Start : réglages de l'accueil ; Select : plein écran.
const chStartPad = () => {
	if (CH.loop) return;
	CH.loop = true;
	const prev = {};
	const step = () => {
		if (!$('#ch')) { CH.loop = false; return; }
		const pad = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(Boolean);
		if (pad && document.hasFocus() && !document.querySelector('.modal-layer, .menu')) {
			const b = n => !!(pad.buttons[n] && pad.buttons[n].pressed);
			const ax = pad.axes[0] || 0;
			const ay = pad.axes[1] || 0;
			const dir = b(14) || ax < -0.55 ? 'l' : b(15) || ax > 0.55 ? 'r' : b(12) || ay < -0.55 ? 'u' : b(13) || ay > 0.55 ? 'd' : '';
			const now = performance.now();
			if (dir && (dir !== CH.pad.held || now - CH.pad.at > (CH.pad.repeat ? 120 : 380))) {
				CH.pad.repeat = dir === CH.pad.held;
				CH.pad.held = dir;
				CH.pad.at = now;
				chMove(dir === 'l' ? -1 : dir === 'r' ? 1 : 0, dir === 'u' ? -1 : dir === 'd' ? 1 : 0);
			}
			if (!dir) { CH.pad.held = ''; CH.pad.repeat = false; }
			const press = n => b(n) && !prev[n];
			if (press(0)) chLaunch();
			if (press(1)) chSound.back();
			if (press(2)) ACTIONS['ch-details']();
			if (press(3)) ACTIONS['ch-menu']();
			if (press(4)) chJump(-1);
			if (press(5)) chJump(1);
			if (press(9)) chOptions();
			if (press(8)) uiFullscreen();
			for (let n = 0; n < pad.buttons.length; n++) prev[n] = b(n);
		}
		requestAnimationFrame(step);
	};
	requestAnimationFrame(step);
};

document.addEventListener('keydown', (e) => {
	if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && consoleUi()) { e.preventDefault(); ACTIONS['ct-search'](); return; }
	if (e.key === 'F11' && consoleUi()) { e.preventDefault(); uiFullscreen(); return; }
	if (!$('#ch') || document.querySelector('.modal-layer') || /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
	const k = e.key;
	if (k === 'ArrowLeft') chMove(-1, 0);
	else if (k === 'ArrowRight') chMove(1, 0);
	else if (k === 'ArrowUp') chMove(0, -1);
	else if (k === 'ArrowDown') chMove(0, 1);
	else if (k === 'Enter') chLaunch();
	else if (k === 'PageUp') chJump(-1);
	else if (k === 'PageDown') chJump(1);
	else return;
	e.preventDefault();
});

document.addEventListener('wheel', (e) => {
	if (!e.target.closest || !e.target.closest('.ch') || Math.abs(e.deltaY) + Math.abs(e.deltaX) < 30) return;
	const now = performance.now();
	if (now - (CH.wheelAt || 0) < (chLayout() === 'row' ? 110 : 450)) return;
	CH.wheelAt = now;
	const d = (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX) > 0 ? 1 : -1;
	if (chLayout() === 'row') chMove(d, 0);
	else chGoto(CH.page + d);
}, { passive: true });

// Clic droit sur une tuile : menu du jeu.
document.addEventListener('contextmenu', (e) => {
	const t = e.target.closest && e.target.closest('.ch-tile');
	if (!t) return;
	const inst = chList()[+t.dataset.i];
	if (!inst) return;
	e.preventDefault();
	chSelect(+t.dataset.i, { silent: true });
	instanceMenu(t, inst);
});

// ---------- Réglages de l'interface Console ----------

const LAYOUTS = [['row', 'Rangée', 'Grandes tuiles sur une ligne'], ['grid', 'Grille', '5 × 3 tuiles par page'], ['wii', 'Chaînes', '4 × 3 chaînes et barre du bas']];
const STYLES = [['theme', 'Mon thème', 'Couleurs et décor du thème choisi'], ['light', 'Clair', 'Blanc, comme les consoles récentes'], ['dark', 'Sombre', 'Fond sombre, décor au choix']];
const DECORS = [['bulles', 'Bulles', 'Clair et doux'], ['feuilles', 'Feuilles', 'Vert à fleurs'], ['rayures', 'Rayures', 'Gris rayé'], ['auto', 'Console du jeu', 'Motif et couleur de la console'], ['uni', 'Uni', 'Sans motif']];

const chOptions = async () => {
	const s = state.settings;
	const sw = (key, label, hint, on) => `<div class="row" style="gap:12px;padding:6px 0"><div class="grow"><div class="bold">${label}</div><div class="small muted">${hint}</div></div><button class="switch ${on ? 'on' : ''}" data-ch-opt="${key}"></button></div>`;
	const pick = (key, list, cur) => `<div class="ch-pick">${list.map(([v, l, h]) => `<button class="ch-pick-item ${cur === v ? 'on' : ''}" data-ch-pick="${key}" data-v="${v}"><i class="ch-prev ${key}-${v}"></i><b>${l}</b><span>${h}</span></button>`).join('')}</div>`;
	await modal({
		title: 'Interface Console',
		width: 640,
		body: `<div class="fr-label">Disposition de l’accueil</div>${pick('consoleLayout', LAYOUTS, chLayout())}
			<div class="fr-label" style="margin-top:14px">Style</div>${pick('consoleStyle', STYLES, ['light', 'dark'].includes(s.consoleStyle) ? s.consoleStyle : 'theme')}
			<div class="fr-label" style="margin-top:14px">Décor <span class="muted" style="text-transform:none;letter-spacing:0">(styles Clair et Sombre ; « Mon thème » garde le décor du thème)</span></div>${pick('consoleBg', DECORS, s.consoleBg || 'bulles')}
			<div style="margin-top:10px">
			${sw('consoleTint', 'Couleurs du jeu', 'Toute l’interface prend les teintes de la jaquette sélectionnée', s.consoleTint !== false)}
			${sw('consoleSounds', 'Sons de l’interface', 'Petits sons au déplacement et au lancement', s.consoleSounds !== false)}
			<div class="row" style="gap:12px;padding:6px 0"><div class="grow"><div class="bold">Ordre des jeux</div></div><select class="select" data-ch-sort>${[['played', 'Dernière partie'], ['name', 'Nom'], ['time', 'Temps de jeu'], ['created', 'Ajout']].map(([v, l]) => `<option value="${v}" ${(s.consoleSort || 'played') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
			</div>
			<button class="btn" style="margin-top:10px" data-ch-classic>${icon('layout-grid')}Revenir à l’interface classique</button>`,
		setup: (el, close) => {
			el.addEventListener('click', async (e) => {
				const p = e.target.closest('[data-ch-pick]');
				if (p) {
					state.settings = await api('settings:set', { [p.dataset.chPick]: p.dataset.v });
					$$(`[data-ch-pick="${p.dataset.chPick}"]`, el).forEach(x => x.classList.toggle('on', x === p));
					CH.page = 0;
					render();
				}
				const t = e.target.closest('[data-ch-opt]');
				if (t) {
					const k = t.dataset.chOpt;
					const patch = k === 'consoleDark' ? { consoleStyle: state.settings.consoleStyle === 'dark' ? 'light' : 'dark' } : { [k]: state.settings[k] === false };
					state.settings = await api('settings:set', patch);
					t.classList.toggle('on');
					render();
				}
				if (e.target.closest('[data-ch-classic]')) { state.settings = await api('settings:set', { uiStyle: 'classic' }); close(); render(); }
			});
			el.querySelector('[data-ch-sort]').addEventListener('change', async (e) => { state.settings = await api('settings:set', { consoleSort: e.target.value }); CH.sel = 0; render(); });
		},
	});
};

// Recherche rapide (Ctrl+K) : jeux de la bibliothèque, Entrée pour jouer.
const chSearch = () => modal({
	title: 'Rechercher un jeu',
	body: '<input class="input" id="cs-q" placeholder="Nom du jeu, console…" autocomplete="off"><div class="cs-list" id="cs-list"></div>',
	setup: (el, close) => {
		const q = el.querySelector('#cs-q');
		const box = el.querySelector('#cs-list');
		let hits = [];
		let sel = 0;
		const draw = () => {
			const t = q.value.trim().toLowerCase();
			hits = state.instances.filter(i => !t || `${i.name} ${sysInfo(chSys(i)).label}`.toLowerCase().includes(t)).slice(0, 8);
			sel = Math.min(sel, Math.max(0, hits.length - 1));
			box.innerHTML = hits.map((i, k) => `<button class="cs-item ${k === sel ? 'on' : ''}" data-k="${k}"><span class="cs-art">${chArt(i)}</span><span class="grow"><b>${esc(i.name)}</b><small>${esc(sysInfo(chSys(i)).label)}${i.playTimeMs ? ` · ${esc(playTime(i.playTimeMs))}` : ''}</small></span>${isRunning(i.id) ? '<span class="tag green">En cours</span>' : ''}<span class="cs-play">${icon('play')}</span></button>`).join('') || '<div class="small muted" style="padding:10px">Aucun jeu ne correspond.</div>';
		};
		const play = (k) => { const i = hits[k]; if (!i) return; close(); launchInstance(i.id); };
		q.addEventListener('input', () => { sel = 0; draw(); });
		q.addEventListener('keydown', (e) => {
			if (e.key === 'ArrowDown') { sel = Math.min(hits.length - 1, sel + 1); draw(); e.preventDefault(); }
			if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
			if (e.key === 'Enter') play(sel);
		});
		box.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) play(+b.dataset.k); });
		draw();
	},
});

Object.assign(ACTIONS, {
	'ch-tile': (el) => {
		const i = +el.dataset.i;
		if (i === CH.sel) chLaunch();
		else chSelect(i);
	},
	'ch-play': () => chLaunch(),
	'ch-details': () => { const i = chCurrent(); if (i) go('instance', { id: i.id }); else ACTIONS['import-roms'](); },
	'ch-menu': () => { const i = chCurrent(); const t = $('.ch-tile.sel'); if (i && t) instanceMenu(t, i); },
	'ch-page': el => chGoto(CH.page + Number(el.dataset.d)),
	'ch-goto': el => chGoto(Number(el.dataset.p)),
	'ch-options': () => chOptions(),
	'ct-search': () => chSearch(),
	'ui-fullscreen': () => uiFullscreen(),
	'ui-console': async () => { state.settings = await api('settings:set', { uiStyle: 'console' }); render(); },
	'ch-covers': async () => {
		CH.coverBusy = true;
		render();
		try {
			const r = await api('covers:autoMissing');
			await refreshInstances();
			CH.palettes = {};
			toast(`${r.found.length} jaquette${r.found.length > 1 ? 's' : ''} trouvée${r.found.length > 1 ? 's' : ''}.${r.unsure.length ? ` Pas de correspondance sûre pour : ${esc(r.unsure.join(', '))} (à choisir depuis le menu du jeu → Jaquette et images).` : ''}`, { type: r.found.length ? 'success' : 'info', timeout: 9000 });
		} catch (error) { toastError(error); }
		CH.coverBusy = false;
		render();
	},
});

window.launcher.on('covers:auto', (p) => {
	const el = $('#ch-cover-progress');
	if (el && p.total) el.innerHTML = `${icon('refresh-cw')}Jaquettes : ${p.done} / ${p.total}${p.name ? ` · ${esc(p.name)}` : ''}`;
});

// Interface Console : l'accueil devient l'accueil console (dès qu'il y a un jeu), et les pages d'un jeu prennent
// ses couleurs. Interface classique : accueil d'origine, avec un bouton pour essayer l'interface Console.
const classicHome = PAGES.home;
PAGES.home = (params) => {
	if (!consoleUi() || !state.instances.length) {
		classicHome(params);
		if (!consoleUi() && state.instances.length && $('#page')) $('#page').insertAdjacentHTML('afterbegin', `<button class="btn ch-switch" data-action="ui-console">${icon('layout-dashboard')}Interface Console</button>`);
		return;
	}
	consoleHome(params);
};
const classicInstance = PAGES.instance;
PAGES.instance = (params) => {
	classicInstance(params);
	const inst = state.instances.find(i => i.id === params.id);
	uiWall(inst || null);
	if (inst && (inst.type === 'rom' || inst.type === 'coopdx')) {
		const ost = $('[data-action="ost-inst"]');
		if (ost && !$('[data-action="bg-pick"]')) ost.insertAdjacentHTML('beforebegin', `<button class="btn lg" data-action="bg-pick" data-id="${esc(inst.id)}" data-tip="Choisir un fond d’écran pour ce jeu" data-tip-pos="bottom">${icon('image')}Fond d’écran</button>`);
	}
	if (!consoleUi() || !inst) return;
	if (inst.coverFile && !(inst.id in CH.palettes)) api('covers:palettes', [inst.id]).then((p) => { Object.assign(CH.palettes, p); if (state.route.name === 'instance' && state.route.params.id === inst.id) uiTint(inst); }).catch(() => {});
	uiTint(inst);
};
