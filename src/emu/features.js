/* global st, gm, emu, toast, esc, icon, focusGame, setPaused, setSpeed, applySpeed, saveState, loadState, screenshot, reset, openControls, renderSlots, selectSlot, ACTIONS, SPEEDS, TURBO, smashEmu, $ */
// Panneau « Smash » : 66 fonctions d'émulation (vitesse, image, son, sauvegardes, capture, outils, fun).
// Chaque fonction est déclarée dans FEATURES ; le panneau, la recherche et les raccourcis en découlent.

const PREFS_KEY = 'smash-emu-features';
const fx = (() => { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; } })();
const saveFx = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(fx)); } catch { /* stockage indisponible */ } };
const live = { turboLock: false, slow: false, rewinding: false, recorder: null, timer: { running: false, start: 0, acc: 0 }, mash: null, fpsFrame: 0, fps: 0, lastLoad: null };

const canvas = () => document.querySelector('#game canvas');
const inputA = () => (st.cfg && st.cfg.system === 'n64' ? 0 : 8);
const fmtTime = (ms) => { const t = Math.floor(ms / 10); return `${String(Math.floor(t / 6000)).padStart(2, '0')}:${String(Math.floor(t / 100) % 60).padStart(2, '0')}.${String(t % 100).padStart(2, '0')}`; };

// ---------- Image : filtres CSS, transformations et superpositions ----------

const COLOR_MODES = {
	none: '',
	bw: 'grayscale(1) contrast(1.1)',
	sepia: 'sepia(0.85) contrast(1.05)',
	dmg: 'grayscale(1) sepia(1) hue-rotate(50deg) saturate(2.2) brightness(0.9)',
	invert: 'invert(1) hue-rotate(180deg)',
	neon: 'saturate(2.3) contrast(1.25) brightness(1.05)',
	vhs: 'saturate(1.4) contrast(0.9) blur(0.6px) sepia(0.15)',
	night: 'brightness(0.75) sepia(0.4) hue-rotate(-20deg) saturate(1.3)',
	dream: 'saturate(1.6) hue-rotate(25deg) blur(0.4px) brightness(1.1)',
};

const applyImage = () => {
	const c = canvas();
	if (!c) return;
	const f = [COLOR_MODES[fx.color || 'none'] || ''];
	if ((fx.bright ?? 100) !== 100) f.push(`brightness(${fx.bright / 100})`);
	if ((fx.contrast ?? 100) !== 100) f.push(`contrast(${fx.contrast / 100})`);
	if ((fx.sat ?? 100) !== 100) f.push(`saturate(${fx.sat / 100})`);
	if (fx.hue) f.push(`hue-rotate(${fx.hue}deg)`);
	c.style.filter = f.filter(Boolean).join(' ');
	const sx = (fx.stretch ? 4 / 3 : 1) * (fx.mirror ? -1 : 1);
	const sy = fx.flipV ? -1 : 1;
	c.style.transform = `scale(${fx.zoom || 1}) scale(${sx}, ${sy}) rotate(${fx.rotate || 0}deg)`;
	c.style.imageRendering = fx.smooth ? 'auto' : 'pixelated';
	const layer = $('#fx');
	layer.className = ['scanlines', 'vignette', 'lcd', 'curve', 'glow'].filter(k => fx[k]).join(' ');
	document.body.classList.toggle('no-cursor', !!fx.hideCursor);
};

const setShader = (name) => {
	fx.shader = name;
	try { emu().changeSettingOption('shader', name); } catch { toast('Shader indisponible pour ce cœur.', { error: true }); }
};

// ---------- Vitesse ----------

const effectiveSpeed = () => (live.rewinding ? st.speed : live.slow ? 0.25 : (st.turbo || live.turboLock) ? Math.max(TURBO, st.speed) : st.speed);
const refreshSpeed = () => { applySpeed(effectiveSpeed()); $('#turbo').classList.toggle('hidden', !(st.turbo || live.turboLock || live.slow || live.rewinding)); $('#turbo').textContent = live.rewinding ? '◄◄ RETOUR' : live.slow ? 'RALENTI' : 'TURBO'; };

const rewind = (on) => {
	live.rewinding = on;
	try { gm().functions.toggleRewind(on ? 1 : 0); } catch { if (on) toast('Retour arrière indisponible pour ce cœur.', { error: true }); }
	refreshSpeed();
};

const frameAdvance = () => {
	if (!st.paused) { setPaused(true); return; }
	try {
		gm().toggleMainLoop(1);
		requestAnimationFrame(() => requestAnimationFrame(() => gm().toggleMainLoop(0)));
	} catch { /* cœur pas prêt */ }
};

// ---------- Capture ----------

const shotBlob = async () => {
	const png = await Promise.race([gm().screenshot(), new Promise(r => setTimeout(() => r(null), 1500))]);
	return png ? new Blob([png], { type: 'image/png' }) : null;
};

const copyShot = async () => {
	const blob = await shotBlob();
	if (!blob) { toast('Capture impossible pendant la pause.', { error: true }); return; }
	await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
	toast('Capture copiée dans le presse-papiers');
};

const burst = async () => {
	for (let i = 0; i < 5; i++) { await screenshot(); await new Promise(r => setTimeout(r, 250)); }
	toast('Rafale : 5 captures enregistrées');
};

const toggleRecord = () => {
	if (live.recorder) {
		live.recorder.stop();
		live.recorder = null;
		document.body.classList.remove('recording');
		toast('Enregistrement terminé, sauvegarde de la vidéo…');
		return;
	}
	try {
		live.recorder = emu().screenRecord();
		document.body.classList.add('recording');
		toast('● Enregistrement vidéo en cours (F9 pour arrêter)');
	} catch (e) { toast(`Enregistrement impossible : ${esc(e.message)}`, { error: true }); }
};

smashEmu.onVideoSaved(({ state, file }) => {
	if (state === 'completed') toast('Vidéo enregistrée · <a>afficher</a>', { onClick: () => smashEmu.showPath(file), ms: 6000 });
	else toast('La vidéo n’a pas pu être enregistrée.', { error: true });
});

// ---------- Outils : HUD (FPS, chrono, horloge), triches, tir auto ----------

const renderHud = () => {
	const parts = [];
	if (fx.fps) parts.push(`<span>${live.fps} FPS</span>`);
	if (fx.speedHud) parts.push(`<span>×${String(effectiveSpeed()).replace('.', ',')}</span>`);
	if (fx.timer || live.timer.running) parts.push(`<span class="timer ${live.timer.running ? 'on' : ''}">⏱ ${fmtTime(live.timer.acc + (live.timer.running ? Date.now() - live.timer.start : 0))}</span>`);
	if (fx.clock) parts.push(`<span>${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>`);
	if (fx.session) parts.push(`<span>Session ${fmtTime(Date.now() - (live.sessionStart || Date.now())).slice(0, 5)}</span>`);
	if (fx.inputs) parts.push(`<span class="keys">${[...live.keys].slice(-6).map(k => `<kbd>${esc(k)}</kbd>`).join('') || '—'}</span>`);
	$('#hud').innerHTML = parts.join('');
	$('#hud').classList.toggle('hidden', !parts.length || fx.photo);
};
live.keys = new Set();

const timerToggle = () => {
	const t = live.timer;
	if (t.running) { t.acc += Date.now() - t.start; t.running = false; } else { t.start = Date.now(); t.running = true; }
	renderHud();
};
const timerReset = () => { Object.assign(live.timer, { running: false, acc: 0, start: 0 }); renderHud(); };

const cheatsKey = () => `smash-cheats-${st.cfg.instanceId}`;
const loadCheats = () => { try { return JSON.parse(localStorage.getItem(cheatsKey())) || []; } catch { return []; } };
const applyCheats = () => {
	try {
		gm().resetCheat();
		loadCheats().forEach((c, i) => gm().setCheat(i, c.on ? 1 : 0, c.code));
	} catch { /* triches non prises en charge */ }
};

const nudgeVolume = (d) => {
	st.volume = Math.max(0, Math.min(1, Math.round((st.volume + d) * 10) / 10));
	$('#volume').value = st.volume * 100;
	$('#volume').dispatchEvent(new Event('input'));
	toast(`Volume ${Math.round(st.volume * 100)} %`, { ms: 1200 });
};

const toggleMash = () => {
	if (live.mash) { clearInterval(live.mash); live.mash = null; gm().simulateInput(0, inputA(), 0); toast('Tir auto désactivé'); return; }
	let on = false;
	live.mash = setInterval(() => { on = !on; try { gm().simulateInput(0, inputA(), on ? 1 : 0); } catch { /* */ } }, 60);
	toast('Tir auto : le bouton A est martelé 8 fois par seconde');
};

// ---------- Sauvegardes ----------

const undoLoad = () => {
	if (!st.undoState) { toast('Rien à annuler.', { error: true }); return; }
	gm().loadState(st.undoState);
	st.undoState = null;
	toast('Chargement annulé : retour à l’état précédent');
};

let autoTimer = null;
const setAutosave = (min) => {
	fx.autosave = min;
	clearInterval(autoTimer);
	if (min) autoTimer = setInterval(() => { if (st.started && !st.paused) saveState(8); }, min * 60000);
};

// ---------- Fenêtre ----------

const winAction = async (a) => {
	const r = await smashEmu.window(a);
	if (a === 'top') toast(r.top ? 'Toujours au premier plan' : 'Premier plan désactivé');
	if (a === 'mini') toast(r.mini ? 'Mini-fenêtre (F2 → Mini-fenêtre pour revenir)' : 'Taille normale');
};

// ---------- Amélioration HD : options des cœurs (toutes consoles) ----------
// Seules les options réellement proposées par le cœur du jeu en cours sont affichées.

const HD_OPTIONS = {
	// Nintendo 64 (GLideN64)
	// (résolution interne, filtrage « 3 points » et 16:9 font tomber la version web à ~0 image/s : exclus)
	'mupen64plus-txEnhancementMode': 'Amélioration des textures (retexturing xBRZ / HQ)',
	'mupen64plus-txFilterMode': 'Lissage des textures',
	// PSP (PPSSPP)
	'ppsspp_texture_scaling_level': 'Agrandissement des textures',
	'ppsspp_texture_scaling_type': 'Méthode d’agrandissement',
	'ppsspp_texture_filtering': 'Filtrage des textures',
	'ppsspp_texture_anisotropic_filtering': 'Filtrage anisotrope',
	// PlayStation
	'pcsx_rearmed_dithering': 'Tramage (dithering)',
	'pcsx_rearmed_gpu_unai_ilace_force': 'Entrelacement',
	// Nintendo DS
	'melonds_screen_layout': 'Disposition des écrans',
	'melonds_screen_gap': 'Espace entre les écrans',
	// Game Boy / Color / Advance
	'gambatte_gb_colorization': 'Colorisation Game Boy',
	'gambatte_gb_internal_palette': 'Palette de colorisation',
	'gambatte_gbc_color_correction': 'Correction des couleurs (GBC)',
	'gambatte_mix_frames': 'Fusion d’images (anti-scintillement)',
	'mgba_color_correction': 'Correction des couleurs',
	'mgba_interframe_blending': 'Fusion d’images (anti-scintillement)',
	'mgba_gb_colors': 'Palette Game Boy',
	'mgba_sgb_borders': 'Bordures Super Game Boy',
	// Super Nintendo
	'snes9x_overclock_superfx': 'SuperFX accéléré (Star Fox plus fluide)',
	'snes9x_reduce_sprite_flicker': 'Moins de clignotement des sprites',
	'snes9x_hires_blend': 'Fusion haute résolution',
	'snes9x_blargg': 'Filtre NTSC',
	// NES
	'fceumm_palette': 'Palette de couleurs',
	'fceumm_nospritelimit': 'Sans limite de sprites (moins de clignotement)',
	'fceumm_ntsc_filter': 'Filtre NTSC',
	'fceumm_overclocking': 'Overclock (moins de ralentissements)',
	// Sega
	'genesis_plus_gx_no_sprite_limit': 'Sans limite de sprites',
	'genesis_plus_gx_blargg_ntsc_filter': 'Filtre NTSC',
	'genesis_plus_gx_lcd_filter': 'Rémanence LCD (Game Gear)',
	'genesis_plus_gx_overclock': 'Overclock du processeur',
	'picodrive_sprlim': 'Sans limite de sprites',
	// PC Engine, Virtual Boy, Saturn
	'pce_nospritelimit': 'Sans limite de sprites',
	'vb_color_mode': 'Couleurs du Virtual Boy',
};

// Préréglages en un clic : valeurs appliquées seulement si le cœur propose l'option.
const HD_PRESETS = {
	original: { label: 'Original', desc: 'Rendu d’origine de la console', shader: 'disabled', reset: true },
	hd: {
		label: 'HD', desc: 'Textures lissées, image nette et anticrénelée', shader: 'smash-superres',
		core: { 'mupen64plus-txFilterMode': 'Smooth filtering 1', 'gambatte_gb_colorization': 'auto', 'mgba_color_correction': 'Auto', 'snes9x_reduce_sprite_flicker': 'enabled', 'fceumm_nospritelimit': 'enabled', 'genesis_plus_gx_no_sprite_limit': 'enabled', 'pce_nospritelimit': 'enabled', 'picodrive_sprlim': 'enabled' },
	},
	ultra: {
		label: 'Ultra (type DLSS)', desc: 'Textures refaites en xBRZ, super-résolution, netteté et HDR', shader: 'smash-ultra',
		core: { 'mupen64plus-txEnhancementMode': '2xBRZ', 'mupen64plus-txFilterMode': 'Smooth filtering 1', 'ppsspp_texture_scaling_level': '2', 'ppsspp_texture_scaling_type': 'xbrz', 'ppsspp_texture_anisotropic_filtering': '16x', 'gambatte_gb_colorization': 'auto', 'gambatte_mix_frames': 'accurate', 'mgba_color_correction': 'Auto', 'mgba_interframe_blending': 'mix_smart', 'snes9x_overclock_superfx': '200%', 'snes9x_reduce_sprite_flicker': 'enabled', 'fceumm_nospritelimit': 'enabled', 'genesis_plus_gx_no_sprite_limit': 'enabled', 'pce_nospritelimit': 'enabled', 'picodrive_sprlim': 'enabled', 'pcsx_rearmed_dithering': 'disabled' },
	},
	retro: { label: 'Rétro authentique', desc: 'Télé cathodique, scanlines et couleurs d’époque', shader: 'crt-lottes', fx: { scanlines: true, vignette: true } },
};

let coreOpts = null; // { clé: { value, choices } }
const appliedOpts = {}; // valeurs réellement envoyées au cœur pendant cette partie

// Dossier des options de chaque cœur dans le système de fichiers de l'émulateur (format RetroArch).
const OPT_DIRS = {
	mupen64plus_next: 'Mupen64Plus-Next', ppsspp: 'PPSSPP', pcsx_rearmed: 'PCSX-ReARMed', melonds: 'melonDS',
	gambatte: 'Gambatte', mgba: 'mGBA', snes9x: 'Snes9x', fceumm: 'FCEUmm', genesis_plus_gx: 'Genesis Plus GX',
	picodrive: 'PicoDrive', mednafen_pce: 'Beetle PCE Fast', beetle_vb: 'Beetle VB', yabause: 'Yabause',
};


const readCoreOptions = () => {
	coreOpts = {};
	try {
		for (const line of String(gm().getCoreOptions()).split('\n')) {
			const cut = line.indexOf('|');
			const key = line.slice(0, cut).trim();
			const rest = line.slice(cut + 1);
			if (cut < 0 || !HD_OPTIONS[key]) continue;
			const [def, list] = rest.split('; ');
			coreOpts[key] = { def, choices: (list || '').split('|'), value: def, applied: key in appliedOpts ? appliedOpts[key] : def };
		}
	} catch { /* cœur sans options */ }
	const saved = (fx.core || {})[st.cfg.core] || {};
	// Les options retirées de la liste (car trop lourdes) sont oubliées.
	if (fx.core && fx.core[st.cfg.core]) for (const k of Object.keys(fx.core[st.cfg.core])) if (!HD_OPTIONS[k]) delete fx.core[st.cfg.core][k];
	for (const [k, v] of Object.entries(saved)) if (coreOpts[k] && coreOpts[k].choices.includes(v)) coreOpts[k].value = v;
	return coreOpts;
};

// Applique les options HD en direct (toutes celles de la liste ont été choisies pour ne pas ralentir le jeu).
const applyCoreOptions = () => {
	for (const [k, o] of Object.entries(coreOpts || {})) {
		if (o.value === o.applied) continue;
		try { gm().setVariable(k, o.value); o.applied = o.value; appliedOpts[k] = o.value; } catch { /* */ }
	}
};

const setCoreOption = (key, value, restart = true) => {
	if (!coreOpts || !coreOpts[key]) return;
	coreOpts[key].value = value;
	fx.core = fx.core || {};
	fx.core[st.cfg.core] = { ...(fx.core[st.cfg.core] || {}), [key]: value };
	saveFx();
	if (restart) applyCoreOptions();
};

const applyPreset = (id) => {
	const p = HD_PRESETS[id];
	readCoreOptions();
	if (p.reset) {
		for (const [k, o] of Object.entries(coreOpts)) o.value = o.def;
		if (fx.core) delete fx.core[st.cfg.core];
		for (const k of ['scanlines', 'vignette', 'lcd', 'curve', 'glow']) delete fx[k];
	}
	for (const [k, v] of Object.entries(p.core || {})) if (coreOpts[k] && coreOpts[k].choices.includes(v)) {
		coreOpts[k].value = v;
		fx.core = fx.core || {};
		fx.core[st.cfg.core] = { ...(fx.core[st.cfg.core] || {}), [k]: v };
	}
	Object.assign(fx, p.fx || {});
	setShader(p.shader);
	fx.preset = id;
	saveFx();
	applyImage();
	toast(`Préréglage <b>${p.label}</b>`);
	if (Object.keys(coreOpts).length) applyCoreOptions();
};

const SMASH_SHADERS = [
	['smash-superres', 'Super Résolution (type FSR)', 'Agrandit ×2 sans escaliers puis affine les détails'],
	['smash-ultra', 'Ultra', 'Super-résolution + netteté + HDR en 3 passes'],
	['smash-sharp', 'Netteté adaptative (CAS)', 'Détails plus nets sans halos'],
	['smash-fxaa', 'Anticrénelage FXAA', 'Bords des polygones lissés'],
	['smash-hdr', 'HDR', 'Contraste local, tons riches et couleurs éclatantes'],
	['smash-bloom', 'Bloom', 'Les lumières débordent doucement'],
	['smash-vivid', 'Couleurs vives', 'Saturation intelligente et contraste'],
	['smash-cinema', 'Cinéma', 'Étalonnage de film, grain et vignette'],
	['smash-toon', 'Cartoon', 'Aplats de couleurs et contours noirs'],
	['smash-dream', 'Rêve', 'Halo doux et teintes pastel'],
	['smash-pixel', 'Pixel net HD', 'Gros pixels parfaitement réguliers (jeux 2D)'],
];

// ---------- Les fonctions ----------
// type : action (bouton), toggle (interrupteur), choice (options), slider (curseur)

const T = (key, label, desc, extra = {}) => ({ type: 'toggle', key, label, desc, ...extra });
const A = (label, desc, run, extra = {}) => ({ type: 'action', label, desc, run, ...extra });

const FEATURES = [
	// HD
	...Object.entries(HD_PRESETS).map(([id, p]) => A(`Préréglage ${p.label}`, p.desc, () => applyPreset(id), { cat: 'HD', icon: id === 'ultra' ? 'sparkles' : id === 'retro' ? 'monitor' : 'image', active: () => fx.preset === id })),
	{ type: 'coreopts', label: 'Réglages du cœur', desc: 'Options d’amélioration propres à cette console', cat: 'HD', icon: 'cpu' },
	...SMASH_SHADERS.map(([id, label, desc]) => A(label, desc, () => setShader(id), { cat: 'HD', icon: 'flame', active: () => fx.shader === id })),

	// Vitesse
	...SPEEDS.map(s => A(`Vitesse ×${String(s).replace('.', ',')}`, s < 1 ? 'Ralenti pour les passages difficiles' : s > 1 ? 'Accélère le jeu (cinématiques, grind…)' : 'Vitesse normale', () => setSpeed(s), { cat: 'Vitesse', icon: 'gauge', active: () => st.speed === s })),
	A('Turbo maintenu', 'Garde Espace enfoncé pour aller ×3', () => toast('Maintiens <kbd>Espace</kbd>'), { cat: 'Vitesse', icon: 'fast-forward', keyHint: 'Espace' }),
	T('turboLock', 'Turbo verrouillé', 'Turbo permanent sans tenir de touche', { cat: 'Vitesse', icon: 'zap', keyHint: 'F4', live: true, onChange: v => { live.turboLock = v; refreshSpeed(); } }),
	A('Ralenti maintenu', 'Garde N enfoncé pour jouer à ×0,25', () => toast('Maintiens <kbd>N</kbd>'), { cat: 'Vitesse', icon: 'clock', keyHint: 'N' }),
	T('rewind', 'Retour arrière', 'Maintiens ⌫ pour remonter le temps. Gourmand : à activer seulement si besoin (s’applique au prochain lancement)', { cat: 'Vitesse', icon: 'history', keyHint: '⌫', onChange: v => toast(v ? 'Retour arrière activé : relance le jeu pour l’utiliser' : 'Retour arrière désactivé au prochain lancement') }),
	A('Image par image', 'En pause : avance d’une seule image', frameAdvance, { cat: 'Vitesse', icon: 'chevron-right', keyHint: ';' }),
	T('pauseOnBlur', 'Pause auto', 'Met en pause quand tu changes de fenêtre', { cat: 'Vitesse', icon: 'pause' }),

	// Image
	...[['disabled', 'Aucun shader'], ['crt-geom.glslp', 'CRT courbé'], ['crt-lottes', 'CRT Lottes'], ['crt-aperture.glslp', 'CRT grille'], ['sabr', 'Lissage SABR'], ['2xScaleHQ.glslp', 'HQ ×2'], ['4xScaleHQ.glslp', 'HQ ×4']]
		.map(([id, label]) => A(label, id === 'disabled' ? 'Image d’origine' : 'Shader GPU appliqué par le cœur', () => setShader(id), { cat: 'Image', icon: 'monitor', active: () => (fx.shader || 'disabled') === id })),
	{ type: 'choice', key: 'color', label: 'Palette', desc: 'Filtres de couleur', cat: 'Image', icon: 'palette', options: [['none', 'Normale'], ['bw', 'Noir & blanc'], ['sepia', 'Sépia'], ['dmg', 'Game Boy'], ['invert', 'Inversée'], ['neon', 'Néon'], ['vhs', 'VHS'], ['night', 'Nuit'], ['dream', 'Rêve']] },
	{ type: 'slider', key: 'bright', label: 'Luminosité', cat: 'Image', icon: 'sparkles', min: 40, max: 180, def: 100, unit: '%' },
	{ type: 'slider', key: 'contrast', label: 'Contraste', cat: 'Image', icon: 'sliders-horizontal', min: 40, max: 180, def: 100, unit: '%' },
	{ type: 'slider', key: 'sat', label: 'Saturation', cat: 'Image', icon: 'palette', min: 0, max: 250, def: 100, unit: '%' },
	{ type: 'slider', key: 'hue', label: 'Teinte', cat: 'Image', icon: 'rotate-ccw', min: -180, max: 180, def: 0, unit: '°' },
	T('scanlines', 'Scanlines', 'Lignes de balayage façon télé cathodique', { cat: 'Image', icon: 'layers' }),
	T('vignette', 'Vignette', 'Bords assombris', { cat: 'Image', icon: 'eye' }),
	T('lcd', 'Grille LCD', 'Effet pixels d’écran portable', { cat: 'Image', icon: 'layout-grid' }),
	T('curve', 'Écran bombé', 'Coins arrondis et reflet de vieux téléviseur', { cat: 'Image', icon: 'monitor' }),
	T('glow', 'Halo lumineux', 'Lueur aux couleurs du thème autour du jeu', { cat: 'Image', icon: 'flame' }),
	T('smooth', 'Lissage', 'Pixels adoucis au lieu de nets', { cat: 'Image', icon: 'image' }),
	T('stretch', 'Étirer en 16:9', 'Remplit les écrans larges', { cat: 'Image', icon: 'maximize-2' }),
	{ type: 'choice', key: 'zoom', label: 'Zoom', desc: 'Agrandit l’image', cat: 'Image', icon: 'search', options: [[1, '×1'], [1.15, '×1,15'], [1.3, '×1,3'], [1.5, '×1,5']] },
	T('mirror', 'Miroir', 'Image retournée horizontalement (mode miroir)', { cat: 'Fun', icon: 'copy' }),
	T('flipV', 'Tête en bas', 'Image retournée verticalement', { cat: 'Fun', icon: 'arrow-down' }),
	{ type: 'choice', key: 'rotate', label: 'Rotation', desc: 'Pour les jeux en mode portrait', cat: 'Image', icon: 'rotate-ccw', options: [[0, '0°'], [90, '90°'], [180, '180°'], [270, '270°']] },

	// Son
	A('Couper / remettre le son', 'Coupe tout le son du jeu', () => ACTIONS.mute(), { cat: 'Son', icon: 'volume-x', keyHint: 'M' }),
	T('muteTurbo', 'Silence en turbo', 'Coupe le son pendant l’accélération', { cat: 'Son', icon: 'volume-x' }),
	T('muteBlur', 'Silence en arrière-plan', 'Coupe le son quand la fenêtre n’est pas active', { cat: 'Son', icon: 'volume-2' }),
	A('Volume + / −', 'Touches + et − pendant le jeu (par pas de 10 %)', () => toast('Touches <kbd>+</kbd> et <kbd>−</kbd>'), { cat: 'Son', icon: 'volume-2', keyHint: '+ / −' }),

	// Sauvegardes
	A('Sauvegarde rapide', 'Dans l’emplacement actif', () => saveState(), { cat: 'Sauvegardes', icon: 'save', keyHint: 'F5' }),
	A('Chargement rapide', 'Depuis l’emplacement actif', () => loadState(), { cat: 'Sauvegardes', icon: 'history', keyHint: 'F7' }),
	A('Emplacement suivant', '8 emplacements avec miniature', () => { selectSlot((st.slot % 8) + 1); toast(`Emplacement ${st.slot}`); }, { cat: 'Sauvegardes', icon: 'layers', keyHint: 'F6' }),
	A('Annuler le chargement', 'Revient à l’état d’avant le dernier chargement', undoLoad, { cat: 'Sauvegardes', icon: 'rotate-ccw', keyHint: 'F8' }),
	{ type: 'choice', key: 'autosave', label: 'Sauvegarde auto', desc: 'Dans l’emplacement 8', cat: 'Sauvegardes', icon: 'clock', options: [[0, 'Non'], [2, '2 min'], [5, '5 min'], [10, '10 min']], onChange: setAutosave },
	A('Dossier des sauvegardes', 'États, captures, vidéos et sauvegardes en jeu', () => smashEmu.window('open-folder'), { cat: 'Sauvegardes', icon: 'folder-open' }),

	// Capture
	A('Capture d’écran', 'Enregistrée dans le dossier de l’instance', () => screenshot(), { cat: 'Capture', icon: 'camera', keyHint: 'F12' }),
	A('Copier l’image', 'Capture directement dans le presse-papiers', copyShot, { cat: 'Capture', icon: 'copy', keyHint: 'Ctrl+C' }),
	A('Rafale ×5', 'Cinq captures à la suite', burst, { cat: 'Capture', icon: 'image' }),
	A('Enregistrer une vidéo', 'Image et son, jusqu’à ce que tu arrêtes', toggleRecord, { cat: 'Capture', icon: 'film', keyHint: 'F9', active: () => !!live.recorder }),
	T('photo', 'Mode photo', 'Cache toute l’interface pour des captures propres', { cat: 'Capture', icon: 'eye', keyHint: 'Origine' }),

	// Outils
	T('fps', 'Compteur FPS', 'Images par seconde réelles de l’émulation', { cat: 'Outils', icon: 'gauge' }),
	A('Statistiques détaillées', 'FPS, temps par image (graphe), processeur, mémoire, latence audio', () => window.smashStats && window.smashStats.toggle(), { cat: 'Outils', icon: 'gauge', keyHint: 'Maj+F2', active: () => !!(window.smashStats && window.smashStats.on) }),
	T('speedHud', 'Vitesse à l’écran', 'Affiche la vitesse actuelle', { cat: 'Outils', icon: 'fast-forward' }),
	T('timer', 'Chrono speedrun', 'F10 démarre / arrête, Maj+F10 remet à zéro', { cat: 'Outils', icon: 'clock', keyHint: 'F10' }),
	T('clock', 'Horloge', 'L’heure, pour ne pas jouer jusqu’à 4 h', { cat: 'Outils', icon: 'clock' }),
	T('inputs', 'Touches à l’écran', 'Montre les touches appuyées (tutos, vidéos)', { cat: 'Outils', icon: 'keyboard' }),
	{ type: 'cheats', label: 'Codes de triche', desc: 'GameShark / Action Replay / Game Genie', cat: 'Outils', icon: 'wrench' },
	A('Touches et manettes', 'Change l’assignation clavier ou manette', () => openControls(), { cat: 'Outils', icon: 'keyboard' }),
	A('Réinitialiser', 'Redémarre le jeu', () => reset(), { cat: 'Outils', icon: 'rotate-ccw' }),
	T('hideCursor', 'Masquer le curseur', 'Plus de souris au milieu de l’écran', { cat: 'Outils', icon: 'eye' }),
	A('Toujours au premier plan', 'La fenêtre reste au-dessus des autres', () => winAction('top'), { cat: 'Outils', icon: 'layers' }),
	A('Mini-fenêtre', 'Petit format dans le coin, toujours visible', () => winAction('mini'), { cat: 'Outils', icon: 'minimize' }),

	// Fun
	A('Tir auto (bouton A)', 'Martèle A tout seul, 8 fois par seconde', toggleMash, { cat: 'Fun', icon: 'zap', keyHint: 'F11+Maj', active: () => !!live.mash }),
	A('Mode disco', 'Teinte qui tourne en boucle', () => { fx.disco = !fx.disco; toast(fx.disco ? 'Disco !' : 'Fin du disco'); }, { cat: 'Fun', icon: 'music', active: () => !!fx.disco }),
	A('Tremblement', 'Secoue l’écran pendant 3 s', () => { canvas().classList.add('shake'); setTimeout(() => canvas().classList.remove('shake'), 3000); }, { cat: 'Fun', icon: 'zap' }),
];

// ---------- Panneau ----------

const panel = { open: false, cat: 'Tout', q: '' };
const CATS = ['Tout', 'HD', 'Vitesse', 'Image', 'Son', 'Sauvegardes', 'Capture', 'Outils', 'Fun'];

const control = (f, i) => {
	if (f.type === 'toggle') return `<button class="sw ${(f.live ? live : fx)[f.key] ? 'on' : ''}" data-f="${i}"></button>`;
	if (f.type === 'action') return `<button class="pbtn sm ${f.active && f.active() ? 'primary' : ''}" data-f="${i}">${f.active && f.active() ? 'Actif' : 'Lancer'}</button>`;
	if (f.type === 'choice') return `<div class="opts">${f.options.map(([v, l]) => `<button class="${String(fx[f.key] ?? f.options[0][0]) === String(v) ? 'on' : ''}" data-f="${i}" data-v="${v}">${l}</button>`).join('')}</div>`;
	if (f.type === 'slider') return `<div class="slide"><input type="range" min="${f.min}" max="${f.max}" value="${fx[f.key] ?? f.def}" data-f="${i}"><b>${fx[f.key] ?? f.def}${f.unit}</b></div>`;
	if (f.type === 'coreopts') {
		const opts = Object.entries(coreOpts || readCoreOptions());
		if (!opts.length) return '<div class="dim" style="margin-top:8px;font-size:12px;color:#8a8a92">Ce cœur n’a pas d’option d’amélioration : utilise les préréglages et les shaders.</div>';
		return `<div class="coreopts">${opts.map(([k, o]) => `<label><span>${esc(HD_OPTIONS[k])}</span><select data-core="${esc(k)}">${o.choices.map(c => `<option ${c === o.value ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>`).join('')}</div>`;
	}
	if (f.type === 'cheats') {
		const list = loadCheats();
		return `<div class="cheats">${list.map((c, k) => `<div class="cheat"><button class="sw ${c.on ? 'on' : ''}" data-cheat="${k}"></button><span>${esc(c.name || c.code)}</span><button class="x" data-cheat-del="${k}">✕</button></div>`).join('')}
			<div class="cheat-add"><input id="cheat-name" placeholder="Nom (ex. Vies infinies)"><input id="cheat-code" placeholder="Code (ex. 8033B21E 0064)"><button class="pbtn sm primary" data-cheat-add>Ajouter</button></div></div>`;
	}
	return '';
};

const renderPanel = () => {
	const q = panel.q.toLowerCase();
	const items = FEATURES.map((f, i) => [f, i]).filter(([f]) => (panel.cat === 'Tout' || f.cat === panel.cat) && (!q || `${f.label} ${f.desc || ''}`.toLowerCase().includes(q)));
	const wide = f => ['choice', 'slider', 'cheats', 'coreopts'].includes(f.type);
	$('#panel').innerHTML = `
		<div class="panel-head"><div class="panel-title">${FEATURES.length} FONCTIONS</div><button class="wc" data-close-panel>${icon('x')}</button></div>
		<input class="panel-search" id="panel-q" placeholder="Rechercher une fonction…" value="${esc(panel.q)}">
		<div class="panel-cats">${CATS.map(c => `<button class="${panel.cat === c ? 'on' : ''}" data-cat="${c}">${c}</button>`).join('')}</div>
		<div class="panel-list">${items.map(([f, i]) => `
			<div class="feat ${wide(f) ? 'wide' : ''}">
				<div class="feat-top">${icon(f.icon || 'sparkles')}<div class="feat-txt"><b>${esc(f.label)}</b>${f.desc ? `<span>${esc(f.desc)}</span>` : ''}</div>${f.keyHint ? `<kbd>${esc(f.keyHint)}</kbd>` : ''}${wide(f) ? '' : control(f, i)}</div>
				${wide(f) ? control(f, i) : ''}
			</div>`).join('') || '<div class="dim" style="padding:20px">Aucune fonction.</div>'}</div>`;
};

const togglePanel = (open = !panel.open) => {
	panel.open = open;
	$('#panel').classList.toggle('hidden', !open);
	if (open) { renderPanel(); $('#panel-q').focus(); } else focusGame();
};

const runFeature = (f, value) => {
	if (f.type === 'action') f.run();
	if (f.type === 'toggle') {
		const store = f.live ? live : fx;
		const v = !store[f.key];
		store[f.key] = v;
		if (f.onChange) f.onChange(v);
	}
	if (f.type === 'choice') {
		fx[f.key] = isNaN(+value) ? value : +value;
		if (f.onChange) f.onChange(fx[f.key]);
	}
	if (f.type === 'slider') fx[f.key] = +value;
	if (f.key !== 'turboLock') saveFx();
	applyImage();
	renderHud();
	if (panel.open) renderPanel();
};

$('#panel').addEventListener('click', (e) => {
	const t = e.target;
	if (t.closest('[data-close-panel]')) return togglePanel(false);
	const cat = t.closest('[data-cat]');
	if (cat) { panel.cat = cat.dataset.cat; return renderPanel(); }
	const ch = t.closest('[data-cheat]');
	if (ch) { const l = loadCheats(); l[+ch.dataset.cheat].on = !l[+ch.dataset.cheat].on; localStorage.setItem(cheatsKey(), JSON.stringify(l)); applyCheats(); return renderPanel(); }
	const del = t.closest('[data-cheat-del]');
	if (del) { const l = loadCheats(); l.splice(+del.dataset.cheatDel, 1); localStorage.setItem(cheatsKey(), JSON.stringify(l)); applyCheats(); return renderPanel(); }
	if (t.closest('[data-cheat-add]')) {
		const code = $('#cheat-code').value.trim();
		if (!code) return;
		const l = loadCheats();
		l.push({ name: $('#cheat-name').value.trim(), code, on: true });
		localStorage.setItem(cheatsKey(), JSON.stringify(l));
		applyCheats();
		toast('Triche activée');
		return renderPanel();
	}
	const b = t.closest('[data-f]');
	if (b && b.tagName === 'BUTTON') runFeature(FEATURES[+b.dataset.f], b.dataset.v);
});

$('#panel').addEventListener('input', (e) => {
	if (e.target.id === 'panel-q') { panel.q = e.target.value; const pos = e.target.selectionStart; renderPanel(); const q = $('#panel-q'); q.focus(); q.setSelectionRange(pos, pos); return; }
	if (e.target.type === 'range') {
		const f = FEATURES[+e.target.dataset.f];
		fx[f.key] = +e.target.value;
		e.target.nextElementSibling.textContent = `${e.target.value}${f.unit}`;
		applyImage();
	}
});
$('#panel').addEventListener('change', (e) => {
	if (e.target.type === 'range') saveFx();
	if (e.target.dataset.core) { fx.preset = null; setCoreOption(e.target.dataset.core, e.target.value); }
});

ACTIONS.features = () => togglePanel();

// ---------- Raccourcis ----------

// Appelé par player.js avant ses propres raccourcis ; true = touche gérée.
window.smashKey = (e) => {
	if (panel.open && e.target.closest && e.target.closest('#panel') && e.key !== 'Escape' && e.key !== 'F2') return true;
	if (fx.inputs && !e.repeat) { live.keys.add(e.key.length === 1 ? e.key.toUpperCase() : e.key); renderHud(); }
	const k = e.key;
	if (k === 'F2') { e.preventDefault(); togglePanel(); return true; }
	if (k === 'Escape' && panel.open) { togglePanel(false); return true; }
	if (k === 'F4') { e.preventDefault(); runFeature(FEATURES.find(f => f.key === 'turboLock')); toast(live.turboLock ? 'Turbo verrouillé' : 'Turbo déverrouillé'); return true; }
	if (k === 'F8') { e.preventDefault(); undoLoad(); return true; }
	if (k === 'F9') { e.preventDefault(); toggleRecord(); return true; }
	if (k === 'F10') { e.preventDefault(); if (e.shiftKey) timerReset(); else timerToggle(); return true; }
	if (k === 'F11' && e.shiftKey) { e.preventDefault(); toggleMash(); return true; }
	if ((k === 'c' || k === 'C') && e.ctrlKey) { e.preventDefault(); copyShot(); return true; }
	if (k === 'Home') { runFeature(FEATURES.find(f => f.key === 'photo')); return true; }
	if (k === 'm' || k === 'M') { ACTIONS.mute(); return true; }
	if (k === '+' || k === '=') { nudgeVolume(0.1); return true; }
	if (k === '-') { nudgeVolume(-0.1); return true; }
	if (k === ';' || k === '.') { frameAdvance(); return true; }
	if ((k === 'n' || k === 'N') && !e.repeat && !st.paused) { live.slow = true; refreshSpeed(); return true; }
	if (k === 'Backspace' && !e.repeat && !st.paused) {
		e.preventDefault();
		if (!emu().rewindEnabled) toast('Active « Retour arrière » dans le panneau (F2), puis relance le jeu.', { error: true });
		else rewind(true);
		return true;
	}
	if (k === ' ' && fx.muteTurbo) setTimeout(() => { try { emu().setVolume(0); } catch { /* */ } }, 0);
	return false;
};

window.smashKeyUp = (e) => {
	if (fx.inputs) { live.keys.delete(e.key.length === 1 ? e.key.toUpperCase() : e.key); renderHud(); }
	if (e.key === 'n' || e.key === 'N') { live.slow = false; refreshSpeed(); return true; }
	if (e.key === 'Backspace') { if (live.rewinding) rewind(false); return true; }
	if (e.key === ' ' && live.turboLock) setTimeout(refreshSpeed, 0);
	if (e.key === ' ' && fx.muteTurbo) setTimeout(() => { try { emu().setVolume(st.muted ? 0 : st.volume); } catch { /* */ } }, 0);
	return false;
};

window.addEventListener('blur', () => {
	if (!st.started) return;
	if (fx.pauseOnBlur && !st.paused) setPaused(true);
	if (fx.muteBlur) try { emu().setVolume(0); } catch { /* */ }
});
window.addEventListener('focus', () => { if (fx.muteBlur && st.started) try { emu().setVolume(st.muted ? 0 : st.volume); } catch { /* */ } });

// ---------- Démarrage (appelé quand le jeu a démarré) ----------

window.smashFeaturesStart = () => {
	live.sessionStart = Date.now();
	applyImage();
	if (fx.shader && fx.shader !== 'disabled') setShader(fx.shader);
	readCoreOptions();
	applyCoreOptions();
	if (fx.autosave) setAutosave(fx.autosave);
	applyCheats();
	let hue = 0;
	setInterval(() => {
		try { const n = gm().getFrameNum(); live.fps = Math.max(0, n - live.fpsFrame); live.fpsFrame = n; } catch { /* */ }
		renderHud();
	}, 1000);
	setInterval(() => { if (live.timer.running) renderHud(); }, 50);
	setInterval(() => { if (fx.disco && canvas()) { hue = (hue + 12) % 360; canvas().style.filter = `hue-rotate(${hue}deg) saturate(1.6)`; } }, 60);
	document.body.classList.toggle('photo', !!fx.photo);
};

// Le mode photo masque l'interface (barre, notifications, HUD).
const photoObserver = () => document.body.classList.toggle('photo', !!fx.photo);
setInterval(photoObserver, 300);
