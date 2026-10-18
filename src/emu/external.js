/* global smashExt, ICONS, SmashLogo */
// Barre et panneau Smash Emu autour d'un émulateur externe (Dolphin…) : raccourcis envoyés à l'émulateur incrusté.

const $ = s => document.querySelector(s);
const icon = n => `<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ICONS.star || ''}</svg>`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const st = { cfg: null, slot: 1, turbo: false, paused: false, panel: false, tab: 'states', sw: null, opts: {}, ext: null, frame: null, slotInfo: {}, immersive: false, top: false };

const toast = (html, error = false) => {
	const el = document.createElement('div');
	el.className = `toast ${error ? 'error' : ''}`;
	el.innerHTML = `${icon(error ? 'circle-x' : 'check')}<span>${html}</span>`;
	$('#toasts').appendChild(el);
	setTimeout(() => el.remove(), 2600);
	return el;
};

document.addEventListener('mouseover', (e) => {
	const t = e.target.closest('[data-tip]');
	const tip = $('#tooltip');
	if (!t) { tip.classList.add('hidden'); return; }
	tip.textContent = t.dataset.tip;
	tip.classList.remove('hidden');
	const r = t.getBoundingClientRect();
	tip.style.left = `${Math.max(8, Math.min(innerWidth - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2))}px`;
	tip.style.top = `${r.bottom + 8}px`;
});

// Après chaque clic sur la barre, le clavier revient au jeu.
const backToGame = () => { if (!st.panel) setTimeout(() => smashExt.window('focus-game').catch(() => {}), 50); };

// ---------- Panneau ----------

const SPEEDS = [[0.5, '50 %'], [0.75, '75 %'], [1, '100 %'], [1.5, '150 %'], [2, '200 %'], [0, 'Illimité']];
const RES = [[1, 'Natif'], [2, '2× (720p)'], [3, '3× (1080p)'], [4, '4× (1440p)'], [5, '5×'], [6, '6× (4K)']];
const ASPECTS = [[0, 'Auto'], [1, '16:9'], [2, '4:3'], [3, 'Étiré']];
const ANISO = [[0, 'Aucun'], [1, '2×'], [2, '4×'], [3, '8×'], [4, '16×']];
const EXTS = [['None', 'Aucune'], ['Nunchuk', 'Nunchuk'], ['Classic', 'Classic Controller']];
const SHADER_LABELS = { FXAA: 'Anti-crénelage', AutoHDR: 'Auto HDR', PerceptualHDR: 'HDR perceptuel', integer_scaling: 'Pixels nets', sepia: 'Sépia', grayscale: 'Noir & blanc' };

const chips = (key, list, current) => `<div class="chips">${list.map(([v, l]) => `<button class="chip ${String(current) === String(v) ? 'on' : ''}" data-set="${key}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
const toggle = (key, label, on) => `<button class="chip ${on ? 'on' : ''}" data-flag="${key}">${esc(label)} : ${on ? 'oui' : 'non'}</button>`;
const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'à l’instant' : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };

const tabStates = () => `
	<div class="grp"><div class="lbl">Emplacements de sauvegarde <span>la vignette est la dernière image vue avant la sauvegarde</span></div>
	<div class="grid">${Array.from({ length: st.cfg.slots }, (_, i) => {
		const n = i + 1;
		const s = st.slotInfo[n];
		return `<div class="slot ${s ? '' : 'empty'}">
			${s && s.thumb ? `<img src="${s.thumb}" alt="">` : ''}
			<span class="n">${n}</span>
			<div class="meta">${s ? ago(s.at) : 'Vide'}</div>
			<div class="acts"><button class="btn primary" data-act="psave" data-n="${n}">Sauver</button><button class="btn" data-act="pload" data-n="${n}" ${s ? '' : 'disabled'}>Charger</button></div>
		</div>`;
	}).join('')}</div></div>
	<div class="note">Astuce : Charger puis « Annuler » dans la barre revient à l’état d’avant.</div>`;

const tabImage = () => {
	const o = st.opts;
	return `
	<div class="row2">
		<div class="grp"><div class="lbl">Résolution interne</div>${chips('res', RES, o.res || 0)}</div>
		<div class="grp"><div class="lbl">Format d’image</div>${chips('aspect', ASPECTS, o.aspect ?? 0)}</div>
	</div>
	<div class="grp"><div class="lbl">Effet d’image</div>${chips('shader', st.cfg.shaders.map(s => [s, SHADER_LABELS[s] || s]), o.shader)}</div>
	<div class="row2">
		<div class="grp"><div class="lbl">Filtrage anisotrope</div>${chips('aniso', ANISO, o.aniso ?? 0)}</div>
		<div class="grp"><div class="lbl">Options</div><div class="chips">
			${toggle('wide', 'Hack écran large', !!o.wide)}${toggle('hires', 'Textures HD', !!o.hires)}${toggle('vsync', 'V-Sync', !!o.vsync)}${toggle('fps', 'Compteur d’images/s', !!o.fps)}
		</div></div>
	</div>`;
};

const tabGame = () => {
	const o = st.opts;
	return `
	<div class="grp"><div class="lbl">Vitesse d’émulation <span>au lancement ; le turbo de la barre reste disponible</span></div>${chips('speed', SPEEDS, o.speed ?? 1)}</div>
	<div class="row2">
		<div class="grp"><div class="lbl">Volume</div><div class="range"><input type="range" min="0" max="100" value="${o.volume ?? 100}" id="vol"><output id="volv">${o.volume ?? 100}%</output></div></div>
		<div class="grp"><div class="lbl">Surcadençage du processeur <span>plus de fluidité dans certains jeux</span></div>${chips('oc', [[0, 'Normal'], [1.5, '150 %'], [2, '200 %'], [3, '300 %']], o.oc || 0)}</div>
	</div>
	${st.cfg.extension ? `<div class="grp"><div class="lbl">Extension de la Wiimote <span>corrige « l’extension branchée n’est pas prise en charge »</span></div>${chips('ext', EXTS, st.ext || st.cfg.extension)}</div>` : ''}`;
};

const tabSwitch = () => {
	const k = st.sw;
	const tag = (ok, l) => `<span class="chip ${ok ? 'on' : ''}">${ok ? '✓ ' : ''}${l}</span>`;
	return `<div class="grp"><div class="lbl">Clés Nintendo Switch <span>extraites de ta propre console</span></div>
		${k ? `<div class="chips">${tag(k.prod, 'prod.keys')}${tag(k.title, 'title.keys')}</div>` : '<div class="note">Chargement…</div>'}
		<div style="margin-top:12px"><button class="btn primary" data-act="swimport">${icon('upload')}Importer des clés (.keys)</button></div></div>
		<div class="note">Les clés sont copiées dans le dossier de Ryujinx. Le firmware s’installe dans Ryujinx : menu Outils → Installer le firmware (depuis un fichier ZIP ou un dossier). Si le jeu ne démarre pas après l’import, ferme et relance le jeu.</div>`;
};

const tabTools = () => `
	<div class="tools">
		<button class="btn" data-act="shot">${icon('camera')}Capture d’écran</button>
		<button class="btn" data-act="folder">${icon('folder-open')}Dossier des captures</button>
		<button class="btn ${st.top ? 'primary' : ''}" data-act="top">${icon('layers')}Toujours au premier plan</button>
		<button class="btn ${st.immersive ? 'primary' : ''}" data-act="immersive">${icon('maximize')}Mode immersif (barre auto-masquée)</button>
		<button class="btn" data-act="mini">${icon('minimize')}Mini-fenêtre</button>
		<button class="btn" data-act="fs">${icon('maximize')}Plein écran (F11)</button>
	</div>
	<div class="note" style="margin-top:16px">Raccourcis : <b>Ctrl+P</b> panneau · <b>F11</b> plein écran · <b>Ctrl+M</b> immersif · <b>Ctrl+Maj+S</b> capture · Dolphin : <b>F10</b> pause, <b>Maj+F1…F8</b> sauver, <b>F1…F8</b> charger, <b>Tab</b> turbo.</div>`;

const dirty = () => JSON.stringify(st.opts) !== JSON.stringify(st.cfg.opts) || (st.ext && st.ext !== st.cfg.extension);

const renderPanel = () => {
	if (!st.cfg.can.states && st.tab === 'states') st.tab = st.cfg.emulatorId === 'ryujinx' ? 'switch' : 'tools';
	const tabs = [...(st.cfg.can.states ? [['states', 'États', 'save']] : []), ...(st.cfg.emulatorId === 'ryujinx' ? [['switch', 'Clés', 'keyboard']] : []), ...(st.cfg.can.tune ? [['image', 'Image', 'eye'], ['game', 'Jeu', 'gamepad-2']] : []), ['tools', 'Outils', 'wrench']];
	const body = { states: tabStates, image: tabImage, game: tabGame, tools: tabTools, switch: tabSwitch }[st.tab]();
	$('#panel').innerHTML = `<div class="pn">
		<div class="pn-head"><span class="ttl">SMASH EMU</span>${tabs.map(([k, l, ic]) => `<button class="pn-tab ${st.tab === k ? 'on' : ''}" data-tab="${k}">${icon(ic)}${l}</button>`).join('')}
			<span class="grow"></span><button class="btn primary" data-act="resume">${icon('play')}Reprendre</button></div>
		<div class="pn-body">${body}</div>
		${st.cfg.can.tune && ['image', 'game'].includes(st.tab) ? `<div class="pn-foot">
			<span class="note grow">${dirty() ? 'Les changements s’appliquent en redémarrant l’émulateur : pense à sauvegarder dans le jeu avant.' : 'Réglages passés au lancement : la configuration de Dolphin n’est pas modifiée.'}</span>
			<button class="btn" data-act="reset" ${st.cfg.opts && Object.keys(st.opts).length ? '' : 'disabled'}>Réinitialiser</button>
			<button class="btn primary" data-act="apply" ${dirty() ? '' : 'disabled'}>${icon('refresh-cw')}Appliquer et redémarrer</button>
		</div>` : ''}
	</div>`;
	const vol = $('#vol');
	if (vol) vol.oninput = () => { st.opts.volume = +vol.value; $('#volv').textContent = `${vol.value}%`; const b = $('[data-act="apply"]'); if (b) b.disabled = !dirty(); };
};

const openPanel = async () => {
	if (st.cfg.emulatorId === 'ryujinx') smashExt.switchStatus().then((k) => { st.sw = k; if (st.panel) renderPanel(); }).catch(() => {});
	if (st.panel || !st.attached) return;
	st.panel = true;
	st.opts = { ...st.cfg.opts };
	st.ext = null;
	const r = await smashExt.panelOpen();
	st.frame = r && r.frame;
	if (r && r.slotInfo) st.slotInfo = r.slotInfo;
	$('#panel').style.backgroundImage = st.frame ? `url(${st.frame})` : '';
	$('#panel').classList.remove('hidden');
	renderPanel();
};

const closePanel = async () => {
	if (!st.panel) return;
	st.panel = false;
	$('#panel').classList.add('hidden');
	await smashExt.panelClose();
	backToGame();
};

$('#panel').addEventListener('click', async (e) => {
	const tab = e.target.closest('[data-tab]');
	if (tab) { st.tab = tab.dataset.tab; renderPanel(); return; }
	const set = e.target.closest('[data-set]');
	if (set) {
		const v = set.dataset.v;
		if (set.dataset.set === 'ext') st.ext = v;
		else st.opts[set.dataset.set] = set.dataset.set === 'shader' ? v : +v;
		if (set.dataset.set === 'oc' && +v === 0) delete st.opts.oc;
		if (set.dataset.set === 'res' && +v === 0) delete st.opts.res;
		renderPanel();
		return;
	}
	const flag = e.target.closest('[data-flag]');
	if (flag) { st.opts[flag.dataset.flag] = !st.opts[flag.dataset.flag]; renderPanel(); return; }
	const b = e.target.closest('[data-act]');
	if (!b) return;
	const n = +b.dataset.n;
	try {
		switch (b.dataset.act) {
			case 'resume': await closePanel(); break;
			case 'swimport': { const r = await smashExt.switchImport(); if (r) { st.sw = r; renderPanel(); toast(`Clés importées : ${r.imported.join(', ')}`); } break; }
			case 'psave': st.slotInfo[n] = await smashExt.panelSave(n); st.slot = n; $('#slot').textContent = n; renderPanel(); toast(`État sauvegardé · emplacement ${n}`); break;
			case 'pload': await smashExt.loadSlot(n); st.slot = n; $('#slot').textContent = n; toast(`État chargé · emplacement ${n}`); await closePanel(); break;
			case 'shot': { const file = await smashExt.screenshot().catch(() => null); toast(file ? 'Capture enregistrée' : 'Capture impossible pendant le menu', !file); break; }
			case 'folder': await smashExt.openFolder(); break;
			case 'top': st.top = await smashExt.top(!st.top); renderPanel(); break;
			case 'immersive': st.immersive = !st.immersive; await smashExt.immersive(st.immersive); document.body.classList.toggle('bar-hidden', st.immersive); renderPanel(); break;
			case 'mini': await smashExt.window('mini'); break;
			case 'fs': await smashExt.window('fullscreen'); break;
			case 'reset': st.opts = {}; st.ext = null; renderPanel(); break;
			case 'apply': {
				if (!confirm('L’émulateur va redémarrer : la partie en cours sera perdue si elle n’est pas sauvegardée dans le jeu. Continuer ?')) break;
				st.panel = false;
				$('#panel').classList.add('hidden');
				$('#waiting').classList.remove('hidden');
				$('#wait-msg').textContent = 'REDEMARRAGE…';
				await smashExt.apply(st.opts, st.ext);
				st.cfg.opts = { ...st.opts };
				if (st.ext) st.cfg.extension = st.ext;
				st.attached = false;
				break;
			}
		}
	} catch (err) { toast(err.message, true); }
});

// ---------- Barre ----------

const ACTIONS = {
	pause: async () => { await smashExt.key('pause'); st.paused = !st.paused; $('#btn-pause').classList.toggle('on', st.paused); toast(st.paused ? 'Pause' : 'Reprise'); },
	turbo: async () => {
		st.turbo = !st.turbo;
		await smashExt.key(st.turbo ? 'turboDown' : 'turboUp');
		$('#btn-turbo').classList.toggle('on', st.turbo);
		toast(st.turbo ? 'Turbo activé' : 'Turbo désactivé');
	},
	save: async () => { st.slotInfo[st.slot] = await smashExt.quickSave(st.slot); toast(`État sauvegardé · emplacement ${st.slot}`); },
	load: async () => { await smashExt.loadSlot(st.slot); toast(`État chargé · emplacement ${st.slot}`); },
	undo: async () => { await smashExt.key('undo'); toast('Chargement annulé'); },
	slot: () => { st.slot = (st.slot % st.cfg.slots) + 1; $('#slot').textContent = st.slot; toast(`Emplacement ${st.slot}`); },
	screenshot: async () => {
		const file = await smashExt.screenshot();
		const t = toast('Capture enregistrée · <a style="color:var(--brand);cursor:pointer;text-decoration:underline">afficher</a>');
		t.querySelector('a').onclick = () => smashExt.showPath(file);
	},
	panel: () => (st.panel ? closePanel() : openPanel()),
	minimize: () => smashExt.window('minimize'),
	fullscreen: () => smashExt.window('fullscreen'),
	close: () => smashExt.window('close'),
};

document.addEventListener('click', async (e) => {
	const el = e.target.closest('.bar [data-action]');
	if (!el) return;
	try { await ACTIONS[el.dataset.action](); } catch (err) { toast(err.message, true); }
	if (!['close', 'minimize', 'panel'].includes(el.dataset.action)) backToGame();
});

window.addEventListener('keydown', (e) => {
	if (e.key === 'F11') { e.preventDefault(); ACTIONS.fullscreen(); }
	if (e.key === 'Escape' && st.panel) { e.preventDefault(); closePanel(); }
	if (e.ctrlKey && e.key.toLowerCase() === 'p') { e.preventDefault(); ACTIONS.panel(); }
});

smashExt.onHotkey((name) => {
	if (name === 'panel') ACTIONS.panel();
	if (name === 'fullscreen') ACTIONS.fullscreen();
	if (name === 'screenshot' && !st.panel) ACTIONS.screenshot().catch(err => toast(err.message, true));
	if (name === 'immersive') {
		st.immersive = !st.immersive;
		smashExt.immersive(st.immersive);
		document.body.classList.toggle('bar-hidden', st.immersive);
	}
});
smashExt.onBar(on => document.body.classList.toggle('bar-hidden', !on && st.immersive));
smashExt.onFullscreen((on) => { $('#btn-fs').innerHTML = icon(on ? 'minimize' : 'maximize'); });

smashExt.onState((s) => {
	if (s.waiting) { $('#waiting').classList.remove('hidden'); $('#wait-msg').textContent = `DEMARRAGE DE ${st.cfg.emulator.toUpperCase()}…`; $('#wait-msg').style.color = ''; st.turbo = false; st.paused = false; $('#btn-turbo').classList.remove('on'); $('#btn-pause').classList.remove('on'); return; }
	if (s.attached) {
		st.attached = true;
		$('#waiting').classList.add('hidden');
		toast(`${st.cfg.emulator} est piloté par Smash Emu`);
		backToGame();
	} else {
		$('#wait-msg').textContent = s.error || 'Erreur';
		$('#wait-msg').style.color = 'var(--danger)';
	}
});

const tick = () => {
	const s = Math.floor((Date.now() - st.cfg.startedAt) / 1000);
	const p = n => String(n).padStart(2, '0');
	$('#clock').textContent = s >= 3600 ? `${Math.floor(s / 3600)}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}` : `${p(Math.floor(s / 60))}:${p(s % 60)}`;
};

(async () => {
	for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon);
	$('#logo').innerHTML = SmashLogo.svg(26);
	$('#splash').innerHTML = SmashLogo.svg(80) + SmashLogo.wordmark();
	st.cfg = await smashExt.config();
	st.slotInfo = st.cfg.slotInfo || {};
	document.documentElement.dataset.theme = st.cfg.theme || 'smash';
	document.title = `${st.cfg.name} — Smash Emu`;
	$('#game-name').textContent = st.cfg.name;
	$('#game-sub').textContent = `${st.cfg.system} · ${st.cfg.emulator}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
	$('#wait-msg').textContent = `DEMARRAGE DE ${st.cfg.emulator.toUpperCase()}…`;
	// Les boutons que l'émulateur ne sait pas gérer sont masqués.
	for (const el of document.querySelectorAll('[data-need]')) if (!st.cfg.can[el.dataset.need]) el.classList.add('hidden');
	setInterval(tick, 1000);
	tick();
})();
