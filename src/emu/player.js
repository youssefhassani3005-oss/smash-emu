/* global smashEmu, ICONS, SmashLogo */
// Fenêtre de jeu Smash Emu : pilote EmulatorJS (cœur mupen64plus) et fournit pause, vitesse, sauvegardes d'état, captures.

const $ = sel => document.querySelector(sel);
const icon = name => `<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));

const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 3, 4, 8];
const SLOTS = 8;
const TURBO = 3;

const st = {
	cfg: null,
	started: false,
	paused: false,
	slot: 1,
	speed: 1,
	volume: 0.8,
	muted: false,
	slots: [],
	turbo: false,
	pauseShot: null,
	closing: false,
};

const emu = () => window.EJS_emulator;
const gm = () => (emu() ? emu().gameManager : null);
const focusGame = () => { try { emu().elements.parent.focus(); } catch { /* pas encore prêt */ } };
const log = (...a) => console.log('[smash]', ...a);
const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
const speedLabel = s => `${String(s).replace('.', ',')}×`;
// Temps de jeu lisible : « 45 min », « 2 h 13 ».
const playLabel = (ms) => {
	if (typeof ms !== 'number') return '';
	const m = Math.max(1, Math.round(ms / 60000));
	return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
};
const dateLabel = ts => new Date(ts).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const paintIcons = (root = document) => { for (const el of root.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon); };

// ---------- Notifications et infobulles ----------

const toast = (html, { error = false, ms = 2600, onClick } = {}) => {
	const el = document.createElement('div');
	el.className = `toast ${error ? 'error' : ''}`;
	el.innerHTML = `${icon(error ? 'circle-x' : 'check')}<span>${html}</span>`;
	if (onClick) el.querySelector('a')?.addEventListener('click', onClick);
	$('#toasts').appendChild(el);
	setTimeout(() => el.remove(), ms);
};

document.addEventListener('mouseover', (e) => {
	const t = e.target.closest('[data-tip]');
	const tip = $('#tooltip');
	if (!t) { tip.classList.add('hidden'); return; }
	tip.textContent = t.dataset.tip;
	tip.classList.remove('hidden');
	const r = t.getBoundingClientRect();
	tip.style.left = `${Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, r.left + r.width / 2 - tip.offsetWidth / 2))}px`;
	tip.style.top = `${r.bottom + 8}px`;
});

// ---------- Barre : vitesse, pause, volume ----------

const renderSpeed = () => {
	$('#speed').innerHTML = SPEEDS.map(s => `<button class="${s === st.speed ? 'on' : ''}" data-speed="${s}" data-tip="Vitesse ${speedLabel(s)} (F3)">${speedLabel(s)}</button>`).join('');
};

const applySpeed = (s) => {
	const g = gm();
	if (!g || !st.started) return;
	if (s !== 1 && window.smashSpeedrunFlag) window.smashSpeedrunFlag(s > 1 ? 'Jeu accéléré' : 'Jeu ralenti');
	try {
		if (s > 1) { g.toggleSlowMotion(0); g.setFastForwardRatio(s); g.toggleFastForward(1); }
		else if (s < 1) { g.toggleFastForward(0); g.setSlowMotionRatio(1 / s); g.toggleSlowMotion(1); }
		else { g.toggleFastForward(0); g.toggleSlowMotion(0); }
	} catch (e) { log('vitesse', e.message); }
};

const setSpeed = (s, { silent = false } = {}) => {
	st.speed = s;
	renderSpeed();
	if (!st.turbo) applySpeed(s);
	if (!silent) toast(`Vitesse ${speedLabel(s)}`);
	focusGame();
};

const renderPauseButton = () => {
	$('#btn-pause').innerHTML = icon(st.paused ? 'play' : 'pause');
	$('#btn-pause').dataset.tip = st.paused ? 'Reprendre (Échap / P)' : 'Pause (Échap / P)';
};

const renderVolume = () => {
	$('#volume').value = Math.round(st.volume * 100);
	$('#btn-mute').innerHTML = icon(st.muted || st.volume === 0 ? 'volume-x' : 'volume-2');
};

const applyVolume = () => {
	try { emu().setVolume(st.muted ? 0 : st.volume); } catch { /* pas encore prêt */ }
	renderVolume();
};

const renderSlotLabels = () => {
	$('#save-label').textContent = `Sauver ${st.slot}`;
	$('#load-label').textContent = `Charger ${st.slot}`;
};

// ---------- Pause et emplacements ----------

const renderSlots = () => {
	$('#slots').innerHTML = st.slots.map(s => `
		<div class="slot ${s.slot === st.slot ? 'active' : ''}">
			<div class="thumb" data-action="select-slot" data-slot="${s.slot}">${s.empty ? '<span class="empty">VIDE</span>' : s.thumb ? `<img src="${s.thumb}" alt="">` : '<span class="empty">ETAT</span>'}</div>
			<div class="meta"><b>Emplacement ${s.slot}</b><span>${s.empty ? 'Aucune sauvegarde' : `${dateLabel(s.savedAt)}${s.playTimeMs != null ? ` · <span class="pt">${playLabel(s.playTimeMs)} de jeu</span>` : ''}`}</span></div>
			<div class="acts">
				<button class="pbtn sm primary" data-action="save-slot" data-slot="${s.slot}">Sauver</button>
				<button class="pbtn sm" data-action="load-slot" data-slot="${s.slot}" ${s.empty ? 'disabled style="opacity:.4"' : ''}>Charger</button>
			</div>
		</div>`).join('');
};

const setPaused = async (paused) => {
	if (!st.started || st.paused === paused) return;
	if (paused) {
		// Capture avant la pause : elle sert de miniature si l'on sauvegarde depuis le menu.
		st.pauseShot = await withTimeout(gm().screenshot(), 700);
		emu().pause();
	} else {
		emu().play();
		applySpeed(st.turbo ? Math.max(TURBO, st.speed) : st.speed);
	}
	st.paused = paused;
	if (window.smashSpeedrunPause) window.smashSpeedrunPause(paused);
	renderPauseButton();
	// L'image figée du jeu, floutée, sert de fond au menu pause.
	const overlay = $('#pause');
	if (st.pauseUrl) { URL.revokeObjectURL(st.pauseUrl); st.pauseUrl = null; }
	if (paused && st.pauseShot) {
		st.pauseUrl = URL.createObjectURL(new Blob([st.pauseShot], { type: 'image/png' }));
		overlay.style.setProperty('--frozen', `url("${st.pauseUrl}")`);
	} else overlay.style.removeProperty('--frozen');
	overlay.classList.toggle('hidden', !paused);
	document.body.classList.toggle('immersive', false);
	if (paused) { st.slots = await smashEmu.listStates(); renderSlots(); } else focusGame();
};

const selectSlot = (slot) => {
	st.slot = slot;
	renderSlotLabels();
	renderSlots();
	smashEmu.prefs({ slot }).catch(() => {});
};

const saveState = async (slot = st.slot) => {
	if (!st.started) return;
	try {
		const g = gm();
		const state = g.getState();
		const png = st.paused ? st.pauseShot : await withTimeout(g.screenshot(), 800);
		st.slots = await smashEmu.saveState(slot, state, png);
		selectSlot(slot);
		toast(`État sauvegardé · emplacement ${slot}`);
	} catch (e) {
		toast(`Sauvegarde impossible : ${esc(e.message)}`, { error: true });
	}
	if (!st.paused) focusGame();
};

const loadState = async (slot = st.slot) => {
	if (!st.started) return;
	try {
		const data = await smashEmu.loadState(slot);
		// Garde l'état courant pour pouvoir annuler ce chargement (F8).
		try { st.undoState = gm().getState().slice(); } catch { st.undoState = null; }
		gm().loadState(new Uint8Array(data));
		if (window.smashSpeedrunFlag) window.smashSpeedrunFlag('État chargé');
		selectSlot(slot);
		toast(`État chargé · emplacement ${slot}`);
		if (st.paused) await setPaused(false);
	} catch (e) {
		toast(esc(e.message), { error: true });
	}
	focusGame();
};

// Capture « telle qu'affichée » : l'interface est masquée le temps de deux images, puis la zone du jeu est
// photographiée par Electron (filtres, shaders et effets compris).
const screenCapture = async () => {
	const c = document.querySelector('#game canvas');
	if (!c) throw new Error('Jeu pas encore affiché.');
	const r = c.getBoundingClientRect();
	const stage = $('#stage').getBoundingClientRect();
	const x = Math.max(r.left, stage.left);
	const y = Math.max(r.top, stage.top);
	const rect = { x, y, width: Math.min(r.right, stage.right) - x, height: Math.min(r.bottom, stage.bottom) - y };
	document.body.classList.add('shooting');
	await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
	try { return await smashEmu.captureScreen(rect); } finally { document.body.classList.remove('shooting'); }
};

const screenshot = async () => {
	if (!st.started) return;
	let file;
	if (window.smashShotMode && window.smashShotMode() === 'screen' && !st.paused) {
		try { file = await screenCapture(); } catch (e) { toast(`Capture impossible : ${esc(e.message)}`, { error: true }); return; }
	} else {
		const png = await withTimeout(gm().screenshot(), 1500);
		if (!png) { toast('Capture impossible pendant la pause.', { error: true }); return; }
		file = await smashEmu.screenshot(png);
	}
	toast('Capture enregistrée · <a>afficher</a>', { onClick: () => smashEmu.showPath(file), ms: 4000 });
	focusGame();
};

const reset = () => {
	if (!st.started) return;
	gm().restart();
	toast('Partie réinitialisée');
	if (st.paused) setPaused(false);
	focusGame();
};

const openControls = () => {
	if (!st.started) return;
	$('#pause').classList.add('hidden');
	$('#help').classList.add('hidden');
	try { emu().controlMenu.style.display = ''; } catch { /* menu indisponible */ }
};

const controlsOpen = () => { try { return emu().controlMenu.style.display !== 'none'; } catch { return false; } };

// ---------- Barre masquée pendant le jeu ----------

let idleTimer = null;
const wakeBar = () => {
	document.body.classList.remove('immersive');
	clearTimeout(idleTimer);
	idleTimer = setTimeout(() => {
		if (st.started && !st.paused && !$('#bar').matches(':hover')) document.body.classList.add('immersive');
	}, 2600);
};
document.addEventListener('mousemove', wakeBar);

// ---------- Actions ----------

const ACTIONS = {
	'toggle-pause': () => setPaused(!st.paused),
	'resume-yes': () => closeResume(true),
	'resume-no': () => closeResume(false),
	'quick-save': () => saveState(),
	'quick-load': () => loadState(),
	slots: () => setPaused(true),
	'select-slot': el => selectSlot(+el.dataset.slot),
	'save-slot': el => saveState(+el.dataset.slot),
	'load-slot': el => loadState(+el.dataset.slot),
	screenshot,
	reset,
	controls: openControls,
	help: () => { $('#help').classList.toggle('hidden'); if ($('#help').classList.contains('hidden')) focusGame(); },
	mute: () => { st.muted = !st.muted; applyVolume(); focusGame(); },
	minimize: () => smashEmu.window('minimize'),
	fullscreen: () => smashEmu.window('fullscreen'),
	close: () => smashEmu.window('close'),
};

document.addEventListener('click', (e) => {
	const sp = e.target.closest('[data-speed]');
	if (sp) { setSpeed(+sp.dataset.speed); return; }
	const el = e.target.closest('[data-action]');
	if (!el || el.disabled) return;
	const fn = ACTIONS[el.dataset.action];
	if (fn) Promise.resolve(fn(el)).catch(err => toast(esc(err.message), { error: true }));
});

$('#volume').addEventListener('input', (e) => {
	st.volume = +e.target.value / 100;
	st.muted = false;
	applyVolume();
});
$('#volume').addEventListener('change', () => { smashEmu.prefs({ volume: st.volume }).catch(() => {}); focusGame(); });

// Raccourcis : touches F et Échap/P/Espace, libres dans la configuration N64 par défaut.
window.addEventListener('keydown', (e) => {
	if (!st.started) return;
	if (st.resumeOpen) {
		if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeResume(e.key === 'Enter'); }
		return;
	}
	// Raccourcis du panneau Smash (features.js) en priorité.
	if (window.smashKey && window.smashKey(e)) return;
	const key = e.key;
	if (key === 'Escape') {
		e.preventDefault();
		if (controlsOpen()) { emu().controlMenu.style.display = 'none'; setPaused(true); return; }
		if (!$('#help').classList.contains('hidden')) { ACTIONS.help(); return; }
		setPaused(!st.paused);
	} else if ((key === 'p' || key === 'P') && !controlsOpen()) {
		setPaused(!st.paused);
	} else if (key === 'F1') { e.preventDefault(); ACTIONS.help(); }
	else if (key === 'F3') { e.preventDefault(); setSpeed(SPEEDS[(SPEEDS.indexOf(st.speed) + (e.shiftKey ? SPEEDS.length - 1 : 1)) % SPEEDS.length]); }
	else if (key === 'F5') { e.preventDefault(); saveState(); }
	else if (key === 'F6') { e.preventDefault(); selectSlot((st.slot % SLOTS) + 1); toast(`Emplacement ${st.slot} sélectionné`); }
	else if (key === 'F7') { e.preventDefault(); loadState(); }
	else if (key === 'F11') { e.preventDefault(); ACTIONS.fullscreen(); }
	else if (key === 'F12') { e.preventDefault(); screenshot(); }
	else if (key === ' ' && !e.repeat && !st.paused && !controlsOpen()) {
		e.preventDefault();
		st.turbo = true;
		applySpeed(Math.max(TURBO, st.speed));
		$('#turbo').classList.remove('hidden');
	}
}, true);

window.addEventListener('keyup', (e) => {
	if (window.smashKeyUp && window.smashKeyUp(e)) return;
	if (e.key === ' ' && st.turbo) {
		st.turbo = false;
		applySpeed(st.speed);
		$('#turbo').classList.add('hidden');
	}
}, true);

// Avant de fermer : enregistre la sauvegarde en jeu (IndexedDB + copie dans le dossier de l'instance).
smashEmu.onBeforeClose(async () => {
	if (st.closing) return;
	st.closing = true;
	try {
		if (window.smashBot) await window.smashBot.stopForClose();
		if (window.smashRemoteHost) window.smashRemoteHost.stopAll();
		const g = gm();
		if (g && st.started && st.saveReady) {
			if (st.cfg.resume && st.cfg.resume.mode !== 'off' && !st.resumeOpen) {
				try {
					const state = g.getState();
					const png = st.paused ? st.pauseShot : await withTimeout(g.screenshot(), 600);
					await withTimeout(smashEmu.saveResume(state, png), 2500);
				} catch (e) { log('état de reprise', e.message); }
			}
			g.saveSaveFiles();
			const data = g.getSaveFile(false);
			if (data && data.length) await withTimeout(smashEmu.writeSave(data), 1500);
			const synced = await withTimeout(new Promise(r => g.FS.syncfs(false, err => r(!err))), 1500);
			st.flushed = synced === true;
		}
	} catch (e) { log('sauvegarde à la fermeture', e.message); }
	smashEmu.readyToClose();
});

// Trophée débloqué pendant la partie.
smashEmu.onTrophy((t) => {
	const el = document.createElement('div');
	el.className = `trophy-pop ${t.rank}`;
	el.innerHTML = `<div class="tp-cup">🏆</div><div><b>Trophée débloqué</b><span>${esc(t.name)} · ${esc(t.desc)}</span></div><i>+${t.points}</i>`;
	document.body.appendChild(el);
	setTimeout(() => el.classList.add('out'), 5200);
	setTimeout(() => el.remove(), 6000);
});

smashEmu.onFullscreen((on) => {
	$('#btn-fs').innerHTML = icon(on ? 'minimize' : 'maximize');
	if (on && st.started && !st.paused) document.body.classList.add('immersive');
});

// ---------- Chargement ----------

const LOADING_TEXT = [
	[/Download Game Core/i, 'Chargement du cœur'],
	[/Decompress Game Core/i, 'Décompression du cœur'],
	[/Download Game Data/i, 'Chargement de la ROM'],
	[/Decompress Game Data/i, 'Préparation de la ROM'],
	[/Download Game BIOS|BIOS/i, 'Chargement'],
];

let loadingTimer = null;
let fakeProgress = 8;
const watchLoading = () => {
	loadingTimer = setInterval(() => {
		const text = emu() && emu().textElem ? emu().textElem.innerText : '';
		const pct = parseFloat((text.match(/(\d+(?:\.\d+)?)%/) || [])[1]);
		fakeProgress = Math.min(92, fakeProgress + 1.5);
		let label = 'Démarrage de l\'émulateur…';
		for (const [re, fr] of LOADING_TEXT) if (re.test(text)) label = fr;
		if (/error|failed|outdated/i.test(text)) { showError(text); return; }
		$('#loading-text').textContent = Number.isFinite(pct) ? `${label} ${Math.round(pct)} %` : label;
		$('#loading-progress').style.width = `${Number.isFinite(pct) ? Math.max(fakeProgress, pct * 0.9) : fakeProgress}%`;
	}, 150);
};

const showError = (text) => {
	clearInterval(loadingTimer);
	$('#loading-text').outerHTML = `<div class="loading-error">Le jeu n'a pas pu démarrer : ${esc(text)}<br><br>
		Essaie le moteur Project64 dans les options de l'instance.</div>
		<button class="pbtn primary" data-action="close" style="padding:0 22px">Fermer</button>`;
};

// Disposition clavier par défaut d'EmulatorJS : N64 à part, les autres consoles partagent la même manette virtuelle.
const PAD_HELP = {
	n64: ['Manette N64 (clavier)', [
		'<kbd>T</kbd><kbd>F</kbd><kbd>G</kbd><kbd>H</kbd> Stick',
		'<kbd>X</kbd> A &nbsp; <kbd>S</kbd> B &nbsp; <kbd>Entrée</kbd> Start',
		'<kbd>Tab</kbd> Z &nbsp; <kbd>Q</kbd> L &nbsp; <kbd>E</kbd> R',
		'<kbd>I</kbd><kbd>J</kbd><kbd>K</kbd><kbd>L</kbd> Boutons C',
		'<kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> Croix']],
	default: ['Manette (clavier)', [
		'<kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> Croix',
		'<kbd>X</kbd> B &nbsp; <kbd>Z</kbd> A &nbsp; <kbd>S</kbd> Y &nbsp; <kbd>A</kbd> X',
		'<kbd>Entrée</kbd> Start &nbsp; <kbd>V</kbd> Select',
		'<kbd>Q</kbd> L &nbsp; <kbd>E</kbd> R &nbsp; <kbd>Tab</kbd> L2 &nbsp; <kbd>R</kbd> R2',
		'<kbd>T</kbd><kbd>F</kbd><kbd>G</kbd><kbd>H</kbd> Stick gauche']],
};

const renderPadHelp = (system) => {
	const [title, lines] = PAD_HELP[system] || PAD_HELP.default;
	const box = document.getElementById('pad-help');
	if (box) box.innerHTML = `<h4>${title}</h4>${lines.map(l => `<p>${l}</p>`).join('')}<p class="dim">Les manettes USB / Bluetooth sont reconnues automatiquement. Change les touches avec le bouton clavier.</p>`;
};

const rewindWanted = () => { try { return !!(JSON.parse(localStorage.getItem('smash-emu-features')) || {}).rewind; } catch { return false; } };

// ---------- Sauvegardes en jeu (carte mémoire, EEPROM, SRAM) ----------
// La copie sur disque fait foi (voir src/main/saves.js) : au démarrage, si elle diffère de celle que le jeu a
// chargée, elle la remplace (l'ancienne est gardée en copie de secours) ; ensuite chaque écriture du jeu
// (toutes les 30 s et à la fermeture) est recopiée sur disque.

const sha1Hex = async u8 => [...new Uint8Array(await crypto.subtle.digest('SHA-1', u8))].map(b => b.toString(16).padStart(2, '0')).join('');

// Écrit la sauvegarde dans le stockage d'EmulatorJS (IndexedDB), sans toucher au jeu en cours.
const writeSaveFile = async (data) => {
	const g = gm();
	const file = g.getSaveFilePath();
	let dir = '';
	for (const part of file.split('/').slice(0, -1)) {
		if (!part) continue;
		dir += `/${part}`;
		if (!g.FS.analyzePath(dir).exists) g.FS.mkdir(dir);
	}
	if (g.FS.analyzePath(file).exists) g.FS.unlink(file);
	g.FS.writeFile(file, data);
	await new Promise((resolve, reject) => g.FS.syncfs(false, err => (err ? reject(err) : resolve())));
};

const RELOAD_KEY = 'smash-save-reload';

const syncSaveAtStart = async () => {
	let reloading = false;
	try {
		const g = gm();
		if (!g || !g.getSaveFilePath()) return;
		const disk = await smashEmu.startSave();
		if (disk.cloudError) log('dossier cloud :', disk.cloudError);
		const inGame = g.getSaveFile(false);
		const hasInGame = !!(inGame && inGame.length);
		const notice = sessionStorage.getItem(RELOAD_KEY);
		sessionStorage.removeItem(RELOAD_KEY);
		if (!disk.data) { if (hasInGame) await smashEmu.writeSave(inGame); return; }
		if (hasInGame && await sha1Hex(inGame) === disk.hash) {
			if (notice) toast(notice === 'cloud' ? 'Sauvegarde du jeu récupérée depuis le dossier cloud' : 'Sauvegarde du jeu remise en place', { ms: 3500 });
			return;
		}
		if (notice) { toast('La sauvegarde du jeu n’a pas pu être remise en place : la version du jeu est conservée.', { error: true, ms: 6000 }); return; }
		if (hasInGame) await smashEmu.backupSave(inGame);
		// Les cœurs ne relisent leur sauvegarde qu'au chargement du jeu : elle est écrite dans le stockage
		// d'EmulatorJS puis la fenêtre est rechargée (une seule fois), et le jeu démarre avec la bonne version.
		st.saveReady = false;
		try { clearInterval(emu().saveSaveInterval); g.toggleMainLoop(0); } catch { /* déjà arrêté */ }
		await writeSaveFile(new Uint8Array(disk.data));
		log('sauvegarde en jeu remise en place :', disk.data.byteLength || disk.data.length, 'octets', hasInGame ? '(l’ancienne version du jeu est gardée en copie de secours)' : '(le jeu n’en avait pas)');
		sessionStorage.setItem(RELOAD_KEY, disk.pulled ? 'cloud' : 'disk');
		st.flushed = true;
		reloading = true;
		await smashEmu.window('reload');
	} catch (error) {
		log('sauvegarde en jeu au démarrage :', error.message);
	} finally {
		if (!reloading) st.saveReady = true;
	}
	return reloading;
};

// ---------- Reprise de la dernière partie (état enregistré à la fermeture) ----------

const resumeLast = async () => {
	const data = await smashEmu.loadResume();
	try { st.undoState = gm().getState().slice(); } catch { st.undoState = null; }
	gm().loadState(new Uint8Array(data));
};

const offerResume = async () => {
	const r = st.cfg.resume;
	if (!r || r.mode === 'off' || !r.info) return;
	const when = `${dateLabel(r.info.savedAt)}${r.info.playTimeMs != null ? ` · ${playLabel(r.info.playTimeMs)} de jeu` : ''}`;
	if (r.mode === 'auto') {
		try {
			await resumeLast();
			toast(`Partie reprise (${esc(when)}) · <a>nouvelle partie</a>`, { ms: 6000, onClick: () => reset() });
		} catch (e) { toast(`Reprise impossible : ${esc(e.message)}`, { error: true }); }
		return;
	}
	// Mode « demander » : le jeu attend la réponse.
	try { emu().pause(); } catch { /* pas encore prêt */ }
	st.resumeOpen = true;
	$('#resume-thumb').innerHTML = r.info.thumb ? `<img src="${r.info.thumb}" alt="">` : 'PAS D’APERÇU';
	$('#resume-meta').innerHTML = `Ta dernière partie : <b>${esc(when)}</b>`;
	$('#resume-auto').checked = false;
	$('#resume').classList.remove('hidden');
};

const closeResume = async (resume) => {
	if (!st.resumeOpen) return;
	st.resumeOpen = false;
	$('#resume').classList.add('hidden');
	if ($('#resume-auto').checked) {
		await smashEmu.resumeMode('auto').catch(() => {});
		st.cfg.resume.mode = 'auto';
	}
	try { emu().play(); } catch { /* fenêtre en fermeture */ }
	applySpeed(st.speed);
	if (resume) {
		try { await resumeLast(); toast('Partie reprise'); } catch (e) { toast(`Reprise impossible : ${esc(e.message)}`, { error: true }); }
	}
	focusGame();
};

const watchSaves = () => {
	try {
		// À la fermeture de la page, EmulatorJS réinitialise le jeu puis démonte le dossier des sauvegardes, ce
		// qui efface sa copie interne (IndexedDB). Quand Smash Emu a déjà tout enregistré (fermeture normale),
		// cette étape est sautée : la sauvegarde reste dans le jeu et le prochain lancement n'a rien à remettre.
		const E = emu();
		const callEvent = E.callEvent.bind(E);
		E.callEvent = (event, data) => (event === 'exit' && st.flushed ? 0 : callEvent(event, data));
		emu().on('saveSaveFiles', (data) => {
			if (st.saveReady && !st.botActive && data && data.length) smashEmu.writeSave(data).catch(e => log('copie de la sauvegarde :', e.message));
		});
	} catch (error) { log('suivi des sauvegardes indisponible :', error.message); }
};

// Touches et boutons choisis dans la page « Manettes » : clavier pour le joueur 1, manettes pour tous les joueurs.
const applyControls = async () => {
	try {
		const prof = await smashEmu.controls();
		const E = window.EJS_emulator;
		if (!E || !E.controls) return;
		for (let p = 0; p < 4; p++) {
			if (!E.controls[p]) E.controls[p] = {};
			for (const [id, pad] of Object.entries(prof.pad || {})) E.controls[p][id] = { ...(E.controls[p][id] || {}), value2: pad };
		}
		for (const [id, k] of Object.entries(prof.kb || {})) E.controls[0][id] = { ...(E.controls[0][id] || {}), value: k.code };
		if (E.checkGamepadInputs) E.checkGamepadInputs();
		st.controls = prof;
		if (window.smashInputs) window.smashInputs.configure(prof);
		log('profil de manette appliqué');
	} catch (error) { log('profil de manette ignoré :', error.message); }
};

const onStarted = () => {
	applyControls();
	watchSaves();
	syncSaveAtStart().then((reloading) => { if (!reloading) offerResume(); });
	clearInterval(loadingTimer);
	st.started = true;
	$('#loading-progress').style.width = '100%';
	setTimeout(() => $('#loading').classList.add('hidden'), 250);
	applyVolume();
	if (st.speed !== 1) applySpeed(st.speed);
	focusGame();
	wakeBar();
	log('partie démarrée :', st.cfg.name);
	toast('<b>F2</b> : 66 fonctions · <b>F1</b> : raccourcis · <b>Échap</b> : pause', { ms: 4500 });
	if (window.smashFeaturesStart) window.smashFeaturesStart();
	if (window.smashStats) window.smashStats.start();
	if (window.smashInputs) window.smashInputs.start();
	if (st.cfg.remoteHost && window.smashRemoteHost) setTimeout(() => window.smashRemoteHost.toggle(true), 1200);
};

(async () => {
	paintIcons();
	const logo = SmashLogo.svg(26);
	$('#logo').innerHTML = logo;
	$('#splash-logo').innerHTML = SmashLogo.svg(96) + SmashLogo.wordmark();

	try {
		st.cfg = await smashEmu.config();
	} catch (e) {
		showError(e.message);
		return;
	}
	for (const c of st.cfg.customThemes || []) if (window.SmashThemes) SmashThemes.register(c);
	document.documentElement.dataset.font = st.cfg.fontMode || 'titles';
	if (st.cfg.logo && st.cfg.logo !== SmashLogo.variant()) {
		SmashLogo.setVariant(st.cfg.logo);
		$('#logo').innerHTML = SmashLogo.svg(26);
		$('#splash-logo').innerHTML = SmashLogo.svg(96) + SmashLogo.wordmark();
	}
	const cfg = st.cfg;
	document.documentElement.dataset.theme = cfg.theme || 'smash';
	document.title = `${cfg.name} — Smash Emu`;
	$('#game-name').textContent = cfg.name;
	// Police pixel sans accents : on les retire du sous-titre.
	$('#game-sub').textContent = [cfg.systemLabel, cfg.rom && cfg.rom.region].filter(Boolean).join(' · ').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
	renderPadHelp(cfg.system);
	$('#loading-name').textContent = cfg.name;
	st.volume = cfg.volume;
	st.slot = cfg.activeSlot;
	st.slots = cfg.slots;
	renderSpeed();
	renderPauseButton();
	renderVolume();
	renderSlotLabels();

	const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#ff1f3d';
	Object.assign(window, {
		EJS_player: '#game',
		EJS_core: cfg.ejs,
		EJS_biosUrl: cfg.biosUrl || '',
		EJS_threads: cfg.threads,
		EJS_gameUrl: cfg.romUrl,
		EJS_gameName: cfg.instanceId,
		EJS_pathtodata: 'smash://app/ejs/',
		EJS_startOnLoaded: true,
		EJS_DEBUG_XX: true,
		EJS_disableDatabases: true,
		EJS_language: 'en-US',
		EJS_disableAutoLang: false,
		EJS_color: brand,
		EJS_backgroundColor: '#000000',
		EJS_volume: cfg.volume,
		// Retour arrière coûteux (copie de la mémoire du jeu en continu) : seulement si activé dans le panneau.
		EJS_defaultOptions: { 'save-save-interval': '30', rewindEnabled: rewindWanted() ? 'enabled' : 'disabled', 'rewind-granularity': '10' },
		EJS_Buttons: Object.fromEntries(['playPause', 'play', 'pause', 'restart', 'mute', 'unmute', 'settings', 'fullscreen', 'enterFullscreen', 'exitFullscreen', 'saveState', 'loadState', 'screenRecord', 'gamepad', 'cheat', 'volumeSlider', 'saveSavFiles', 'loadSavFiles', 'quickSave', 'quickLoad', 'screenshot', 'cacheManager', 'exitEmulation', 'netplay', 'diskButton', 'contextMenu'].map(k => [k, false])),
		EJS_onGameStart: onStarted,
	});
	watchLoading();
	const s = document.createElement('script');
	s.src = 'smash://app/ejs/loader.js';
	s.onerror = () => showError('fichiers de l\'émulateur introuvables');
	document.body.appendChild(s);
})();
