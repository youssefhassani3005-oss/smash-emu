/* global PAGES, TITLES, ACTIONS, state, api, esc, icon, setMain, toast, render, $ */
// Page « Manettes » : association des touches et boutons par console, détection PS5 / Xbox / Switch,
// test de vibration et extension de la Wiimote (Dolphin).

const CTL_PAD_LABELS = {
	ps: { BUTTON_1: '✕', BUTTON_2: '○', BUTTON_3: '□', BUTTON_4: '△', LEFT_TOP_SHOULDER: 'L1', RIGHT_TOP_SHOULDER: 'R1', LEFT_BOTTOM_SHOULDER: 'L2', RIGHT_BOTTOM_SHOULDER: 'R2', SELECT: 'Create', START: 'Options', LEFT_STICK: 'L3', RIGHT_STICK: 'R3' },
	xbox: { BUTTON_1: 'A', BUTTON_2: 'B', BUTTON_3: 'X', BUTTON_4: 'Y', LEFT_TOP_SHOULDER: 'LB', RIGHT_TOP_SHOULDER: 'RB', LEFT_BOTTOM_SHOULDER: 'LT', RIGHT_BOTTOM_SHOULDER: 'RT', SELECT: 'View', START: 'Menu', LEFT_STICK: 'LS', RIGHT_STICK: 'RS' },
	switch: { BUTTON_1: 'B', BUTTON_2: 'A', BUTTON_3: 'Y', BUTTON_4: 'X', LEFT_TOP_SHOULDER: 'L', RIGHT_TOP_SHOULDER: 'R', LEFT_BOTTOM_SHOULDER: 'ZL', RIGHT_BOTTOM_SHOULDER: 'ZR', SELECT: '−', START: '+', LEFT_STICK: 'L3', RIGHT_STICK: 'R3' },
	generic: {},
};
const CTL_PAD_INDEX = ['BUTTON_1', 'BUTTON_2', 'BUTTON_3', 'BUTTON_4', 'LEFT_TOP_SHOULDER', 'RIGHT_TOP_SHOULDER', 'LEFT_BOTTOM_SHOULDER', 'RIGHT_BOTTOM_SHOULDER', 'SELECT', 'START', 'LEFT_STICK', 'RIGHT_STICK', 'DPAD_UP', 'DPAD_DOWN', 'DPAD_LEFT', 'DPAD_RIGHT'];
const CTL_AXES = ['LEFT_STICK_X', 'LEFT_STICK_Y', 'RIGHT_STICK_X', 'RIGHT_STICK_Y'];
const CTL_TYPES = { ps: 'PlayStation', xbox: 'Xbox', switch: 'Nintendo Switch', generic: 'Manette' };
const CTL_DIRS = { DPAD_UP: '↑', DPAD_DOWN: '↓', DPAD_LEFT: '←', DPAD_RIGHT: '→' };

const ctl = { systems: null, sel: null, data: null, listening: null, raf: 0, last: {}, saveTimer: 0, msg: '' };

const padType = (id = '') => {
	const s = id.toLowerCase();
	if (/054c|dualsense|dualshock|playstation|wireless controller/.test(s)) return 'ps';
	if (/xbox|045e|xinput/.test(s)) return 'xbox';
	if (/057e|nintendo|pro controller|joy-con/.test(s)) return 'switch';
	return 'generic';
};

const padName = (id) => id.replace(/\s*\(.*?(vendor|STANDARD).*?\)\s*/i, '').replace(/\s*\(Vendor:.*$/i, '').trim() || 'Manette';

const padLabel = (value, type) => {
	if (!value) return '—';
	if (CTL_DIRS[value]) return `Croix ${CTL_DIRS[value]}`;
	const m = value.match(/^(LEFT|RIGHT)_STICK_([XY]):([+-])1$/);
	if (m) return `Stick ${m[1] === 'LEFT' ? 'G' : 'D'} ${m[2] === 'X' ? (m[3] === '+' ? '→' : '←') : (m[3] === '+' ? '↓' : '↑')}`;
	const named = (CTL_PAD_LABELS[type] || {})[value];
	if (named) return named;
	const n = value.match(/^(?:GAMEPAD|BUTTON)_(\d+)$/);
	if (n) return `Bouton ${n[1]}`;
	return { SELECT: 'Select', START: 'Start', LEFT_TOP_SHOULDER: 'L1', RIGHT_TOP_SHOULDER: 'R1', LEFT_BOTTOM_SHOULDER: 'L2', RIGHT_BOTTOM_SHOULDER: 'R2', LEFT_STICK: 'L3', RIGHT_STICK: 'R3' }[value] || value.replace(/_/g, ' ');
};

const keyName = (e) => {
	const map = { ' ': 'Espace', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'Entrée', Shift: 'Maj', Control: 'Ctrl', Tab: 'Tab', Backspace: '⌫', Escape: 'Échap' };
	return map[e.key] || (e.key.length === 1 ? e.key.toUpperCase() : e.key);
};

// Nom de la touche d'un profil enregistré (ou par défaut).
const defaultKeyName = (n) => ({ 'up arrow': '↑', 'down arrow': '↓', 'left arrow': '←', 'right arrow': '→', enter: 'Entrée', tab: 'Tab', space: 'Espace' }[n] || (n || '').toUpperCase());

const livePads = () => Array.from(navigator.getGamepads ? navigator.getGamepads() : []).filter(Boolean);
const mainPad = () => livePads()[0] || null;
const curType = () => { const p = mainPad(); return p ? padType(p.id) : 'generic'; };

const ctlLoad = async (id) => {
	ctl.sel = id;
	state.ui.ctlSystem = id;
	ctl.data = await api('controls:get', id);
	ctl.listening = null;
	ctlRender();
};

const ctlSave = () => {
	clearTimeout(ctl.saveTimer);
	ctl.saveTimer = setTimeout(() => api('controls:set', ctl.sel, ctl.data.profile).catch(e => toast(e.message, { type: 'error' })), 250);
};

const rowValues = (b) => {
	const d = ctl.data;
	const kb = d.profile.kb[b.id];
	const pad = d.profile.pad[b.id];
	const def = d.defaults[b.id] || {};
	return {
		kb: kb ? kb.name : defaultKeyName(def.kb), kbCustom: !!kb,
		pad: pad !== undefined ? pad : (def.pad || ''), padCustom: pad !== undefined,
	};
};

const ctlRender = () => {
	const d = ctl.data;
	if (!d) return;
	const type = curType();
	const rows = d.buttons.map((b) => {
		const v = rowValues(b);
		const listenKb = ctl.listening && ctl.listening.id === b.id && ctl.listening.kind === 'kb';
		const listenPad = ctl.listening && ctl.listening.id === b.id && ctl.listening.kind === 'pad';
		return `<div class="ctl-row" data-btn="${b.id}" data-pad="${esc(v.pad)}">
			<div class="ctl-name">${esc(b.label)}</div>
			<button class="ctl-key ${v.kbCustom ? 'custom' : ''} ${listenKb ? 'listening' : ''}" data-action="ctl-listen" data-kind="kb" data-id="${b.id}">${icon('keyboard')}<span>${listenKb ? 'Appuie sur une touche…' : esc(v.kb || '—')}</span></button>
			<button class="ctl-key ${v.padCustom ? 'custom' : ''} ${listenPad ? 'listening' : ''}" data-action="ctl-listen" data-kind="pad" data-id="${b.id}">${icon('gamepad-2')}<span>${listenPad ? 'Appuie sur la manette…' : esc(padLabel(v.pad, type))}</span></button>
			<button class="icon-btn" data-action="ctl-clear-one" data-id="${b.id}" data-tip="Remettre par défaut">${icon('rotate-ccw')}</button>
		</div>`;
	}).join('');
	const list = ctl.systems.map(s => `<button class="ctl-sys ${ctl.sel === s.id ? 'active' : ''}" data-action="ctl-sys" data-id="${s.id}">${esc(s.label)}</button>`).join('');
	const dolphin = d.system === 'wii' ? `<div class="card ctl-card"><h3>${icon('joystick')}Wiimote (Dolphin)</h3>
		<p class="small muted">Si le jeu affiche « l’extension branchée à la Wiimote n’est pas prise en charge », choisis <b>Aucune</b> ou <b>Nunchuk</b>. Appliqué au prochain lancement de Dolphin.</p>
		<div class="chips">${[['None', 'Aucune'], ['Nunchuk', 'Nunchuk'], ['Classic', 'Classic Controller']].map(([v, l]) => `<button class="chip ${d.extension === v ? 'active' : ''}" data-action="ctl-ext" data-v="${v}">${l}</button>`).join('')}</div></div>` : '';
	const dolphinOnly = d.system === 'gc' || d.system === 'wii';
	setMain(`
		<div class="section-title"><h1>Manettes</h1><span class="muted">profil par console · enregistré automatiquement</span><div class="grow"></div>
			<button class="btn" data-action="ctl-reset">${icon('rotate-ccw')}Tout remettre par défaut</button></div>
		<div class="ctl-layout">
			<aside class="ctl-side"><div class="ctl-side-title">Consoles</div>${list}</aside>
			<div class="ctl-main">
				<div class="card ctl-card" id="ctl-pads"></div>
				${dolphin}
				${dolphinOnly ? `<div class="card ctl-card"><p class="small muted">GameCube et Wii utilisent Dolphin : les boutons de la manette se règlent dans Dolphin (Contrôleurs). Ici tu règles l’extension de la Wiimote et tu testes la manette et la vibration.</p></div>` : `
				<div class="card ctl-card">
					<div class="ctl-head"><h3>${icon('sliders-horizontal')}Boutons · ${esc(d.label)}</h3>
						<div class="chips"><button class="chip" data-action="ctl-preset" data-v="nintendo">Style Nintendo (A↔B, X↔Y)</button><button class="chip" data-action="ctl-preset" data-v="default">Par défaut</button></div></div>
					<p class="small muted">Clique sur une case puis appuie sur la touche ou le bouton voulu. <b>Retour arrière</b> efface, <b>Échap</b> annule. Les manettes se règlent aussi par joueur : le clavier est pour le joueur 1.</p>
					<div class="ctl-table"><div class="ctl-row ctl-header"><div>Action</div><div>Clavier</div><div>Manette</div><div></div></div>${rows}</div>
				</div>`}
			</div>
		</div>`);
	ctlRenderPads();
};

const ctlRenderPads = () => {
	const box = $('#ctl-pads');
	if (!box) return;
	const pads = livePads();
	box.innerHTML = `<div class="ctl-head"><h3>${icon('gamepad-2')}Manettes détectées</h3></div>` + (pads.length ? pads.map((p) => {
		const t = padType(p.id);
		return `<div class="ctl-pad" data-pad-index="${p.index}">
			<div class="ctl-pad-ic ${t}">${icon('gamepad-2')}</div>
			<div class="grow"><b>${esc(padName(p.id))}</b><div class="small muted">${CTL_TYPES[t]} · joueur ${p.index + 1} · ${p.buttons.length} boutons</div>
				<div class="ctl-live" data-live="${p.index}"></div></div>
			<div class="ctl-rumble">
				<div class="chips"><button class="chip" data-action="ctl-rumble" data-i="${p.index}" data-mode="soft">${icon('zap')}Léger</button><button class="chip" data-action="ctl-rumble" data-i="${p.index}" data-mode="strong">Fort</button><button class="chip" data-action="ctl-rumble" data-i="${p.index}" data-mode="pulse">Pulsé</button></div>
			</div></div>`;
	}).join('') : `<div class="empty small">${icon('gamepad-2')}<h3>Aucune manette détectée</h3><div>Branche une manette (USB ou Bluetooth) puis appuie sur un de ses boutons. Le clavier fonctionne toujours.</div></div>`);
};

// Boucle de lecture : met en évidence les boutons pressés et capture le prochain appui pendant une association.
const ctlLoop = () => {
	if (state.route.name !== 'controls') { ctl.raf = 0; return; }
	const pads = livePads();
	const sig = pads.map(p => `${p.index}:${p.id}`).join('|');
	if (sig !== ctl.sig) { ctl.sig = sig; ctlRenderPads(); if (ctl.data && ctl.data.system !== 'wii') ctlRenderRowsOnly(); }
	for (const p of pads) {
		const pressed = [];
		p.buttons.forEach((b, i) => { if (b.pressed || b.value > 0.5) pressed.push(CTL_PAD_INDEX[i] || `GAMEPAD_${i}`); });
		p.axes.forEach((a, i) => { if (Math.abs(a) > 0.5 && CTL_AXES[i]) pressed.push(`${CTL_AXES[i]}:${a > 0 ? '+' : '-'}1`); });
		const live = document.querySelector(`[data-live="${p.index}"]`);
		if (live) live.innerHTML = pressed.length ? pressed.map(v => `<span class="ctl-dot">${esc(padLabel(v, padType(p.id)))}</span>`).join('') : '<span class="small muted">Appuie sur un bouton pour le voir ici</span>';
		if (p.index === 0) {
			for (const row of document.querySelectorAll('.ctl-row[data-pad]')) row.classList.toggle('hit', pressed.includes(row.dataset.pad));
			if (ctl.listening && ctl.listening.kind === 'pad') {
				const fresh = pressed.find(v => !(ctl.last[v]));
				if (fresh) { ctlSetPad(ctl.listening.id, fresh); }
			}
		}
		ctl.last = Object.fromEntries(pressed.map(v => [v, true]));
	}
	ctl.raf = requestAnimationFrame(ctlLoop);
};

const ctlRenderRowsOnly = () => { if (ctl.data) ctlRender(); };

const ctlSetPad = (id, value) => {
	ctl.data.profile.pad[id] = value;
	ctl.listening = null;
	ctlSave();
	ctlRender();
};

window.addEventListener('keydown', (e) => {
	if (!ctl.listening || ctl.listening.kind !== 'kb' || state.route.name !== 'controls') return;
	e.preventDefault();
	e.stopPropagation();
	const id = ctl.listening.id;
	if (e.key === 'Escape') { ctl.listening = null; ctlRender(); return; }
	if (e.key === 'Backspace') { ctl.data.profile.kb[id] = { code: 0, name: '' }; }
	else ctl.data.profile.kb[id] = { code: e.keyCode, name: keyName(e) };
	ctl.listening = null;
	ctlSave();
	ctlRender();
}, true);

const ctlRumble = async (index, mode) => {
	const p = livePads().find(x => x.index === index);
	const act = p && (p.vibrationActuator || (p.hapticActuators && p.hapticActuators[0]));
	if (!act) { toast('Cette manette ne signale pas la vibration (essaie en USB, ou avec un pilote Xbox / DualSense).', { type: 'error' }); return; }
	const fx = { soft: [{ duration: 400, strongMagnitude: 0.0, weakMagnitude: 0.6 }], strong: [{ duration: 700, strongMagnitude: 1, weakMagnitude: 1 }], pulse: [0, 1, 2].map(() => ({ duration: 150, strongMagnitude: 0.9, weakMagnitude: 0.5 })) }[mode];
	try {
		for (let i = 0; i < fx.length; i++) {
			if (act.playEffect) await act.playEffect('dual-rumble', fx[i]); else if (act.pulse) await act.pulse(fx[i].strongMagnitude, fx[i].duration);
			if (mode === 'pulse') await new Promise(r => setTimeout(r, 120));
		}
	} catch (error) { toast(`Vibration impossible : ${error.message}`, { type: 'error' }); }
};

const NINTENDO_SWAP = { BUTTON_1: 'BUTTON_2', BUTTON_2: 'BUTTON_1', BUTTON_3: 'BUTTON_4', BUTTON_4: 'BUTTON_3' };

Object.assign(ACTIONS, {
	'ctl-sys': el => ctlLoad(el.dataset.id),
	'ctl-listen': (el) => { ctl.listening = { id: +el.dataset.id, kind: el.dataset.kind }; ctl.last = {}; ctlRender(); },
	'ctl-clear-one': (el) => {
		const id = el.dataset.id;
		delete ctl.data.profile.kb[id];
		delete ctl.data.profile.pad[id];
		ctlSave();
		ctlRender();
	},
	'ctl-reset': async () => { ctl.data.profile = await api('controls:reset', ctl.sel); ctlRender(); toast('Profil remis par défaut'); },
	'ctl-preset': (el) => {
		const prof = ctl.data.profile;
		prof.pad = {};
		if (el.dataset.v === 'nintendo') {
			for (const [id, def] of Object.entries(ctl.data.defaults)) if (NINTENDO_SWAP[def.pad]) prof.pad[id] = NINTENDO_SWAP[def.pad];
		}
		ctlSave();
		ctlRender();
		toast(el.dataset.v === 'nintendo' ? 'Style Nintendo appliqué' : 'Manette remise par défaut');
	},
	'ctl-rumble': el => ctlRumble(+el.dataset.i, el.dataset.mode),
	'ctl-ext': async (el) => { ctl.data.extension = await api('controls:extension', el.dataset.v); ctlRender(); toast('Extension de la Wiimote : appliquée au prochain lancement'); },
});

TITLES.controls = () => [{ label: 'Manettes' }];

PAGES.controls = async () => {
	if (!ctl.systems) ctl.systems = await api('controls:list');
	const want = state.ui.ctlSystem && ctl.systems.some(s => s.id === state.ui.ctlSystem) ? state.ui.ctlSystem : 'n64';
	setMain('<div class="loading"><div class="spinner"></div></div>');
	await ctlLoad(want);
	if (!ctl.raf) ctl.raf = requestAnimationFrame(ctlLoop);
};
