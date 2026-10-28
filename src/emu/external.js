/* global smashExt, ICONS, SmashLogo, SmashSpeedrun */
// Barre et panneau Smash Emu autour d'un émulateur externe (Dolphin…) : raccourcis envoyés à l'émulateur incrusté.

const $ = s => document.querySelector(s);
const icon = n => `<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ICONS.star || ''}</svg>`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const st = { cfg: null, slot: 1, turbo: false, paused: false, panel: false, tab: 'states', sw: null, opts: {}, ext: null, frame: null, slotInfo: {}, immersive: false, top: false };

const toast = (html, error = false, ms = 2600) => {
	const el = document.createElement('div');
	el.className = `toast ${error ? 'error' : ''}`;
	el.innerHTML = `${icon(error ? 'circle-x' : 'check')}<span>${html}</span>`;
	$('#toasts').appendChild(el);
	setTimeout(() => el.remove(), ms);
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
	const pct = st.cfg.speedPct;
	const speedGrp = st.cfg.speeds.length ? `<div class="grp"><div class="lbl">Vitesse du jeu <span>aussi avec le bouton de la barre</span></div>
		<div class="chips">${speedModes().map(m => `<button class="chip ${(st.pendingSpeed || st.speedMode) === m ? 'on' : ''}" data-speedmode="${m}">${esc(speedName(m))}</button>`).join('')}</div></div>
		${st.cfg.speeds.includes('turbo') ? `<div class="row2">
			<div class="grp"><div class="lbl">Vitesse rapide <span>au prochain lancement</span></div><div class="chips">${[150, 200, 300, 400].map(v => `<button class="chip ${pct.turbo === v ? 'on' : ''}" data-swspeed="turbo" data-v="${v}">${v} %</button>`).join('')}</div></div>
			<div class="grp"><div class="lbl">Vitesse lente <span>au prochain lancement</span></div><div class="chips">${[25, 50, 75].map(v => `<button class="chip ${pct.slow === v ? 'on' : ''}" data-swspeed="slow" data-v="${v}">${v} %</button>`).join('')}</div></div>
		</div>` : ''}` : '';
	return `${speedGrp}<div class="grp"><div class="lbl">Clés Nintendo Switch <span>extraites de ta propre console</span></div>
		${k ? `<div class="chips">${tag(k.prod, 'prod.keys')}${tag(k.title, 'title.keys')}</div>` : '<div class="note">Chargement…</div>'}
		<div style="margin-top:12px"><button class="btn primary" data-act="swimport">${icon('upload')}Importer des clés (.keys)</button></div></div>
		<div class="note">Les clés sont copiées pour Citron, Eden et Ryujinx. Le firmware s’installe depuis l’émulateur : menu Outils → Installer le firmware (depuis un fichier ZIP ou un dossier) ; Smash Emu le partage ensuite entre eux. Si le jeu ne démarre pas après l’import, ferme et relance le jeu.</div>`;
};

// ---------- Randomizer (Citron, Eden) ----------
const RD_INT = [['soft', 'Doux'], ['medium', 'Moyen'], ['chaos', 'Chaos']];
const rdCode = (o) => {
	const flags = [['colors', 'C'], ['values', 'V'], ['mods', 'M']].filter(([k]) => o.modes[k]).map(([, c]) => c).join('');
	return `SMASH-${String(o.seed).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 40) || 'X'}-${flags}${RD_INT.findIndex(([k]) => k === o.intensity) + 1}`;
};
const tabRando = () => {
	const r = st.rando;
	if (!r) return '<div class="note">Chargement…</div>';
	const o = st.rdo;
	const mode = (k, label, desc, extra = '') => `<div class="grp"><div class="lbl"><button class="chip ${o.modes[k] ? 'on' : ''}" data-rd-mode="${k}">${label} : ${o.modes[k] ? 'oui' : 'non'}</button> <span>${desc}</span></div>${extra}</div>`;
	const prof = r.profile
		? `<div class="note">Profil « ${esc(r.profile.title)} » : ${r.profile.values} valeur(s)${r.profile.known ? '' : ' · cette version du jeu n’est pas dans le profil'}.</div>`
		: `<div class="note">Aucun profil pour ce jeu${r.tid ? ` (${esc(r.tid)}${r.buildId ? `, build ${esc(r.buildId.slice(0, 16))}` : ''})` : ''} : sans profil, les valeurs ne changent pas.</div>`;
	const mods = `${r.mods.length ? `<div class="chips">${r.mods.map(m => `<span class="chip on">${esc(m)} <a data-rd-del="${esc(m)}" style="cursor:pointer">✕</a></span>`).join('')}</div>` : '<div class="note">Aucun mod randomizer installé.</div>'}
		<div class="chips" style="margin-top:8px"><button class="btn" data-rd="modzip">${icon('upload')}Installer une archive…</button><button class="btn" data-rd="moddir">${icon('folder-open')}Installer un dossier…</button></div>`;
	return `<div class="grp"><div class="lbl"><button class="chip ${o.on ? 'on' : ''}" data-rd="on">Randomizer : ${o.on ? 'activé' : 'désactivé'}</button> <span>appliqué au lancement, le fichier du jeu n’est jamais modifié</span></div></div>
	<div class="row2">
		<div class="grp"><div class="lbl">Graine</div><div class="chips"><input id="rd-seed" value="${esc(o.seed)}" maxlength="40" style="flex:1;min-width:140px;background:rgba(0,0,0,.35);color:#fff;border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:7px 10px"><button class="btn" data-rd="dice">${icon('dices')}Au hasard</button></div></div>
		<div class="grp"><div class="lbl">Code à partager</div><div class="chips"><b id="rd-code" style="font-family:'Press Start 2P',monospace;font-size:10px;align-self:center">${esc(rdCode(o))}</b><button class="btn" data-rd="copy">${icon('copy')}Copier</button><button class="btn" data-rd="paste">${icon('clipboard')}Coller un code</button></div></div>
	</div>
	<div class="grp"><div class="lbl">Intensité</div>${RD_INT.map(([k, l]) => `<button class="chip ${o.intensity === k ? 'on' : ''}" data-rd-int="${k}">${l}</button>`).join(' ')}</div>
	${mode('colors', 'Couleurs', r.colors ? 'teinte, saturation et canaux de l’image tirés de la graine' : 'avec Eden seulement')}
	${mode('values', 'Valeurs', 'argent, vies, objets… via un profil du jeu (codes de triche)', `${prof}<div class="chips" style="margin-top:8px"><button class="btn" data-rd="profile">${icon('upload')}Importer un profil…</button><button class="btn" data-rd="profiles">${icon('folder-open')}Dossier des profils</button></div>`)}
	${mode('mods', 'Mods randomizer', 'produits par un randomizer communautaire pour ce jeu', mods)}
	<div class="chips" style="margin-top:14px"><button class="btn" data-rd="save">Enregistrer</button><button class="btn primary" data-rd="apply">${icon('refresh-cw')}Appliquer et redémarrer</button></div>`;
};
const loadRando = async () => { st.rando = await smashExt.randoGet(); st.rdo = JSON.parse(JSON.stringify(st.rando.opts)); if (st.panel && st.tab === 'rando') renderPanel(); };
const randoClick = async (t) => {
	const b = t.closest('[data-rd],[data-rd-mode],[data-rd-int],[data-rd-del]');
	if (!b || !st.rdo) return false;
	const o = st.rdo;
	if (b.dataset.rdMode) o.modes[b.dataset.rdMode] = !o.modes[b.dataset.rdMode];
	else if (b.dataset.rdInt) o.intensity = b.dataset.rdInt;
	else if (b.dataset.rdDel) { await smashExt.randoRemoveMod(b.dataset.rdDel); await loadRando(); toast('Mod retiré'); }
	else switch (b.dataset.rd) {
		case 'on': o.on = !o.on; break;
		case 'dice': o.seed = await smashExt.randoSeed(); break;
		case 'copy': await navigator.clipboard.writeText(rdCode(o)); toast('Code copié'); break;
		case 'paste': { const c = prompt('Code du randomizer (SMASH-…)'); if (c) { Object.assign(o, await smashExt.randoParse(c), { on: true }); toast('Code chargé'); } break; }
		case 'profile': { const n = await smashExt.randoImportProfile(); if (n) { toast(`Profil importé : ${esc(n)}`); await loadRando(); } break; }
		case 'profiles': await smashExt.randoProfiles(); break;
		case 'modzip': case 'moddir': { const n = await smashExt.randoInstallMod(b.dataset.rd === 'moddir' ? 'folder' : 'archive'); if (n) { toast(`Mod installé : ${esc(n)}`); await loadRando(); } break; }
		case 'save': st.rando = await smashExt.randoSave(o, false); toast('Enregistré : appliqué au prochain lancement'); break;
		case 'apply':
			if (!confirm('L’émulateur va redémarrer : la partie en cours sera perdue si elle n’est pas sauvegardée dans le jeu. Continuer ?')) break;
			st.panel = false;
			$('#panel').classList.add('hidden');
			await smashExt.randoSave(o, true);
			st.attached = false;
			return true;
		default: return false;
	}
	return true;
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
	<div class="note" style="margin-top:16px">Raccourcis : <b>Ctrl+P</b> panneau · <b>F11</b> plein écran · <b>Ctrl+M</b> immersif · <b>Ctrl+Maj+S</b> capture${st.cfg.keysHint ? ` · ${esc(st.cfg.emulator)} : ${st.cfg.keysHint}` : ''}.</div>
	${st.cfg.requirement ? `<div class="note" style="margin-top:8px">${esc(st.cfg.requirement)}</div>` : ''}
	<div style="margin-top:12px"><button class="btn" data-act="native">${icon('settings')}Ouvrir ${esc(st.cfg.emulator)} seul (réglages, BIOS, manettes)</button></div>`;

const dirty = () => JSON.stringify(st.opts) !== JSON.stringify(st.cfg.opts) || (st.ext && st.ext !== st.cfg.extension);

const renderPanel = () => {
	if (!st.cfg.can.states && st.tab === 'states') st.tab = ['ryujinx', 'citron', 'eden'].includes(st.cfg.emulatorId) ? 'switch' : 'tools';
	const tabs = [...(st.cfg.can.states ? [['states', 'États', 'save']] : []), ...(['ryujinx', 'citron', 'eden'].includes(st.cfg.emulatorId) ? [['switch', 'Switch', 'gauge']] : []), ...(st.cfg.can.tune ? [['image', 'Image', 'eye'], ['game', 'Jeu', 'gamepad-2']] : []), ['tools', 'Outils', 'wrench']];
	tabs.splice(tabs.length - 1, 0, ...(['citron', 'eden'].includes(st.cfg.emulatorId) ? [['rando', 'Randomizer', 'dices']] : []), ['speedrun', 'Speedrun', 'timer']);
	if (st.tab === 'rando' && !st.rando) loadRando().catch(err => toast(err.message, true));
	const body = { states: tabStates, image: tabImage, game: tabGame, tools: tabTools, switch: tabSwitch, speedrun: () => st.sr.panelHtml(), rando: tabRando }[st.tab]();
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
	const seed = $('#rd-seed');
	if (seed) seed.oninput = () => { st.rdo.seed = seed.value; $('#rd-code').textContent = rdCode(st.rdo); };
	const vol = $('#vol');
	if (vol) vol.oninput = () => { st.opts.volume = +vol.value; $('#volv').textContent = `${vol.value}%`; const b = $('[data-act="apply"]'); if (b) b.disabled = !dirty(); };
};

const openPanel = async () => {
	if (['ryujinx', 'citron', 'eden'].includes(st.cfg.emulatorId)) smashExt.switchStatus().then((k) => { st.sw = k; if (st.panel) renderPanel(); }).catch(() => {});
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
	if (st.pendingSpeed) {
		const mode = st.pendingSpeed;
		st.pendingSpeed = null;
		setTimeout(() => setSpeedMode(mode).then(() => toast(`Vitesse : ${speedName(mode)}`)).catch(err => toast(err.message, true)), 300);
	}
};

$('#panel').addEventListener('click', async (e) => {
	const tab = e.target.closest('[data-tab]');
	if (tab) { st.tab = tab.dataset.tab; renderPanel(); return; }
	if (st.sr.click(e.target, $('#panel'))) { renderPanel(); return; }
	if (st.tab === 'rando') {
		try { if (await randoClick(e.target)) { if (st.panel) renderPanel(); return; } } catch (err) { toast(err.message, true); return; }
	}
	// Vitesse choisie dans le panneau : appliquée au retour dans le jeu (l'émulateur doit avoir le clavier).
	const sm = e.target.closest('[data-speedmode]');
	if (sm) { st.pendingSpeed = sm.dataset.speedmode; renderPanel(); return; }
	const sw = e.target.closest('[data-swspeed]');
	if (sw) {
		try { st.cfg.speedPct = await smashExt.switchSpeed(sw.dataset.swspeed, +sw.dataset.v); toast('Enregistré : appliqué au prochain lancement du jeu'); } catch (err) { toast(err.message, true); }
		renderPanel();
		return;
	}
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
			case 'native': await smashExt.openNative(); toast(`${st.cfg.emulator} ouvert dans sa propre fenêtre`); break;
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

// ---------- Vitesse (Citron, Eden) ----------
// Les raccourcis de l'émulateur basculent un mode : pour passer de l'un à l'autre, l'ancien est d'abord coupé.

st.speedMode = 'normal';

// Chrono speedrun (touches globales prises à l'émulateur seulement quand il est activé).
st.sr = SmashSpeedrun.create({
	load: () => smashExt.speedrunGet(),
	save: data => smashExt.speedrunSave(data),
	el: $('#sr'),
	toast: text => toast(text),
	onToggle: on => smashExt.speedrunKeys(on).catch(() => {}),
	onChange: () => { if (st.panel && st.tab === 'speedrun') renderPanel(); },
	// Course contre un ami : les touches du chrono doivent alors arriver même si le chrono n'est pas activé.
	race: {
		get: () => smashExt.raceGet(),
		ready: () => smashExt.raceReady(),
		finish: ms => smashExt.raceFinish(ms),
		forfeit: () => smashExt.raceForfeit(),
		onRace: (fn) => smashExt.onRace((v) => { smashExt.speedrunKeys(st.sr.on || !!(v && ['accepted', 'countdown', 'running'].includes(v.state))).catch(() => {}); fn(v); }),
	},
	frameSig: () => smashExt.frameSig(),
});

const speedModes = () => ['normal', ...['turbo', 'unlimited', 'slow'].filter(m => st.cfg.speeds.includes(m))];
const speedShort = m => ({ normal: '100 %', slow: `${st.cfg.speedPct.slow} %`, turbo: `${st.cfg.speedPct.turbo} %`, unlimited: '∞' }[m]);
const speedName = m => ({ normal: 'normale (100 %)', slow: `lente (${st.cfg.speedPct.slow} %)`, turbo: `rapide (${st.cfg.speedPct.turbo} %)`, unlimited: 'illimitée' }[m]);
const renderSpeedBtn = () => {
	if (!st.cfg || !st.cfg.speeds.length) return;
	const b = $('#btn-turbo');
	b.classList.add('wide');
	b.classList.toggle('on', st.speedMode !== 'normal');
	b.dataset.tip = `Vitesse ${speedName(st.speedMode)} · clic : vitesse suivante`;
	b.innerHTML = `${icon(st.speedMode === 'slow' ? 'rewind' : 'fast-forward')}<span>${speedShort(st.speedMode)}</span>`;
};
const setSpeedMode = async (mode) => {
	if (mode === st.speedMode) return;
	if (st.speedMode !== 'normal') await smashExt.key('speed', st.speedMode);
	st.speedMode = 'normal';
	if (mode !== 'normal') await smashExt.key('speed', mode);
	st.speedMode = mode;
	renderSpeedBtn();
};

// ---------- Barre ----------

const ACTIONS = {
	pause: async () => { await smashExt.key('pause'); st.paused = !st.paused; st.sr.pause(st.paused); $('#btn-pause').classList.toggle('on', st.paused); toast(st.paused ? 'Pause' : 'Reprise'); },
	turbo: async () => {
		// Citron, Eden : le bouton passe d'une vitesse à l'autre (normale, rapide, illimitée, lente).
		if (st.cfg.speeds.length) {
			const modes = speedModes();
			await setSpeedMode(modes[(modes.indexOf(st.speedMode) + 1) % modes.length]);
			if (st.speedMode !== 'normal') st.sr.flag(st.speedMode === 'slow' ? 'Jeu ralenti' : 'Jeu accéléré');
			toast(`Vitesse : ${speedName(st.speedMode)}`);
			return;
		}
		st.turbo = !st.turbo;
		if (st.turbo) st.sr.flag('Jeu accéléré');
		await smashExt.key(st.turbo ? 'turboDown' : 'turboUp');
		$('#btn-turbo').classList.toggle('on', st.turbo);
		toast(st.turbo ? 'Turbo activé' : 'Turbo désactivé');
	},
	save: async () => { st.slotInfo[st.slot] = await smashExt.quickSave(st.slot); toast(`État sauvegardé · emplacement ${st.slot}`); },
	load: async () => { await smashExt.loadSlot(st.slot); st.sr.flag('État chargé'); toast(`État chargé · emplacement ${st.slot}`); },
	undo: async () => { await smashExt.key('undo'); toast('Chargement annulé'); },
	slot: () => { st.slot = (st.slot % st.cfg.slots) + 1; $('#slot').textContent = st.slot; toast(`Emplacement ${st.slot}`); },
	screenshot: async () => {
		const file = await smashExt.screenshot();
		const t = toast('Capture enregistrée · <a style="color:var(--brand);cursor:pointer;text-decoration:underline">afficher</a>');
		t.querySelector('a').onclick = () => smashExt.showPath(file);
	},
	panel: () => (st.panel ? closePanel() : openPanel()),
	// Manettes : réglages de l'émulateur ouverts devant le jeu, en un clic.
	controls: async () => {
		const r = await smashExt.controls();
		toast(r === 'shown'
			? `${st.cfg.emulator} est ouvert : menu <b>Émulation → Configurer → Contrôles</b>. Reviens dans Smash Emu quand c’est fait, sa fenêtre se recache.`
			: `${st.cfg.emulator} est ouvert à part : règle tes manettes (menu Contrôles), ferme-le, puis relance le jeu.`);
	},
	minimize: () => smashExt.window('minimize'),
	fullscreen: () => smashExt.window('fullscreen'),
	close: () => smashExt.window('close'),
};

document.addEventListener('click', async (e) => {
	const el = e.target.closest('.bar [data-action]');
	if (!el) return;
	try { await ACTIONS[el.dataset.action](); } catch (err) { toast(err.message, true); }
	if (!['close', 'minimize', 'panel', 'remote', 'controls', 'assist'].includes(el.dataset.action)) backToGame();
});
smashExt.onControlsDone(() => { toast('Manettes enregistrées'); backToGame(); });

window.addEventListener('keydown', (e) => {
	if (e.key === 'F11') { e.preventDefault(); ACTIONS.fullscreen(); }
	if (e.key === 'Escape' && st.panel) { e.preventDefault(); closePanel(); }
	if (e.ctrlKey && e.key.toLowerCase() === 'p') { e.preventDefault(); ACTIONS.panel(); }
});

// Indices et succès : panneau à droite, le jeu lui laisse la place (comme le jeu à distance).
const ASSIST = window.SmashAssist.create({
	toast: text => toast(text, false, 6000),
	onToggle: (open) => { smashExt.side(open ? RP_SIDE : 0).catch(() => {}); if (!open) backToGame(); },
});
ACTIONS.assist = () => ASSIST.toggle();

smashExt.onHotkey((name) => {
	if (name === 'assist') ASSIST.toggle();
	if (name === 'panel') ACTIONS.panel();
	if (name === 'fullscreen') ACTIONS.fullscreen();
	if (name === 'screenshot' && !st.panel) ACTIONS.screenshot().catch(err => toast(err.message, true));
	if (name === 'remote' && ACTIONS.remote) ACTIONS.remote();
	if (name === 'srSplit') st.sr.split();
	if (name === 'srUndo') st.sr.undo();
	if (name === 'srReset') st.sr.reset();
	if (name === 'immersive') {
		st.immersive = !st.immersive;
		smashExt.immersive(st.immersive);
		document.body.classList.toggle('bar-hidden', st.immersive);
	}
});
// L'émulateur signale un BIOS, un firmware ou des clés manquants alors que sa fenêtre est affichée.
smashExt.onNotice((n) => {
	const t = toast(`<b>${esc(st.cfg.emulator)}</b> : ${esc(n.lines[n.lines.length - 1] || '')}<br>${esc(n.text || '')} <a style="color:var(--brand);cursor:pointer;text-decoration:underline">Ouvrir ${esc(st.cfg.emulator)}</a>`, true, 15000);
	const a = t && t.querySelector('a');
	if (a) a.onclick = () => smashExt.openNative();
});
smashExt.onBar(on => document.body.classList.toggle('bar-hidden', !on && st.immersive));
smashExt.onFullscreen((on) => { $('#btn-fs').innerHTML = icon(on ? 'minimize' : 'maximize'); });

// Aide affichée pendant l'attente : ce qu'il manque à l'émulateur, ses erreurs, et de quoi le régler.
const showHelp = ({ hint, lines, failed, dialog } = {}) => {
	const box = $('#wait-help');
	if (!hint && !dialog && !(lines && lines.length)) { box.classList.add('hidden'); return; }
	box.innerHTML = `${dialog ? `<p><b>${esc(st.cfg.emulator)}</b> affiche une fenêtre « ${esc(dialog)} » : réponds-y, elle est au premier plan.</p>` : ''}
		${hint ? `<p>${esc(hint)}</p>` : ''}
		${lines && lines.length ? `<pre>${esc(lines.join('\n'))}</pre>` : ''}
		<div class="acts">
			${dialog ? '' : `<button class="btn" data-help="native">${icon('settings')}Ouvrir ${esc(st.cfg.emulator)} pour le configurer</button>`}
			${failed ? `<button class="btn primary" data-help="retry">${icon('refresh-cw')}Réessayer</button>` : ''}
			<button class="btn" data-help="close">${icon('x')}Fermer</button>
		</div>`;
	box.classList.remove('hidden');
};
$('#wait-help').addEventListener('click', async (e) => {
	const b = e.target.closest('[data-help]');
	if (!b) return;
	try {
		if (b.dataset.help === 'native') { await smashExt.openNative(); toast(`${st.cfg.emulator} ouvert : règle-le, ferme-le, puis clique sur « Réessayer »`); showHelp({ hint: st.cfg.requirement, failed: true }); }
		if (b.dataset.help === 'retry') { showHelp({}); $('#loading-bar').classList.remove('hidden'); await smashExt.retry(); }
		if (b.dataset.help === 'close') await smashExt.window('close');
	} catch (err) { toast(err.message, true); }
});

// ---------- Écran de chargement ----------
// Mascotte (petite manette en pixel art) qui avance le long de la barre pendant le démarrage, avec des phrases
// et des astuces ; la barre progresse doucement jusqu'à l'affichage du jeu.
const MASCOT = `<svg viewBox="0 0 24 18" shape-rendering="crispEdges" aria-hidden="true">
	<rect x="19" y="0" width="1" height="3" fill="var(--brand)"/><rect x="18" y="1" width="3" height="1" fill="var(--brand)"/>
	<rect x="3" y="4" width="18" height="9" fill="var(--brand)"/><rect x="1" y="6" width="22" height="6" fill="var(--brand)"/>
	<rect x="2" y="12" width="20" height="1" fill="rgba(0,0,0,.25)"/><rect x="3" y="4" width="18" height="1" fill="rgba(255,255,255,.3)"/>
	<g class="eyes"><rect x="7" y="5" width="3" height="4" fill="#fff"/><rect x="14" y="5" width="3" height="4" fill="#fff"/>
	<g class="pupil"><rect x="8" y="6" width="1" height="2" fill="#111"/><rect x="15" y="6" width="1" height="2" fill="#111"/></g></g>
	<rect x="11" y="10" width="2" height="1" fill="#111"/><rect x="6" y="10" width="2" height="1" fill="rgba(255,120,150,.8)"/><rect x="16" y="10" width="2" height="1" fill="rgba(255,120,150,.8)"/>
	<rect x="2" y="8" width="3" height="1" fill="rgba(0,0,0,.45)"/><rect x="3" y="7" width="1" height="3" fill="rgba(0,0,0,.45)"/>
	<rect x="20" y="7" width="1" height="1" fill="#ffd54f"/><rect x="21" y="8" width="1" height="1" fill="#4fc3f7"/><rect x="19" y="8" width="1" height="1" fill="#81c784"/><rect x="20" y="9" width="1" height="1" fill="#fff"/>
	<g class="fa"><rect x="5" y="13" width="3" height="3" fill="#2a2a30"/><rect x="16" y="13" width="3" height="2" fill="#2a2a30"/></g>
	<g class="fb"><rect x="5" y="13" width="3" height="2" fill="#2a2a30"/><rect x="16" y="13" width="3" height="3" fill="#2a2a30"/></g>
</svg>`;
const LD_LINES = ['On y va !', 'Je souffle dans la cartouche…', 'Chargement des pixels…', 'J’allume la console…', 'Je réchauffe les textures…', 'Presque prêt !', 'Encore quelques secondes…', 'Je tiens bon !'];
const LD_TIPS = ['<b>Ctrl+P</b> ouvre le menu Smash Emu pendant le jeu.', '<b>F11</b> passe en plein écran.', '<b>Ctrl+J</b> invite un ami à jouer à distance.', '<b>Ctrl+Maj+S</b> fait une capture d’écran.', 'Le premier lancement d’un jeu est souvent plus long : l’émulateur prépare ses graphismes.', 'Ton temps de jeu compte pour les trophées.'];
const loader = { t: null, start: 0, line: 0, tip: 0, pct: 0, stage: null, stageAt: 0 };
// Étape suivante de chaque étape réelle (Citron, Eden) : la barre avance vers elle sans la dépasser.
const LD_NEXT = { 15: 30, 30: 45, 45: 60, 60: 72, 72: 85, 85: 97 };
const setStage = (s) => {
	const from = Math.max(loader.pct, s.pct);
	loader.stage = { ...s, from, to: Math.min(97, Math.max(LD_NEXT[s.pct] || 97, from + 8)) };
	loader.stageAt = Date.now();
};
const bubble = (text) => { const b = $('#ld-bubble'); if (b.textContent === text) return; b.textContent = text; b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''; };
const loaderStart = () => {
	if (loader.t) return; // déjà en cours (boîte de dialogue, nouvel état) : la barre ne repart pas de zéro
	const pending = loader.pending;
	Object.assign(loader, { start: Date.now(), line: 0, pct: 0, stage: null, pending: null });
	if (pending) setStage(pending);
	$('#ld-mascot').innerHTML = MASCOT;
	if (st.cfg && st.cfg.mascot) $('#ld-mascot').style.setProperty('--brand', st.cfg.mascot);
	$('#ld-scene').classList.remove('hidden');
	bubble(loader.stage ? `${loader.stage.label}…` : LD_LINES[0]);
	const step = () => {
		const now = Date.now();
		const s = (now - loader.start) / 1000;
		let target;
		if (loader.stage) {
			// Si la barre est déjà plus loin que l'étape, elle repart d'où elle est vers l'étape suivante.
			const { from, to } = loader.stage;
			target = from + (to - from) * (1 - Math.exp(-(now - loader.stageAt) / 3500));
		} else target = 97 * (1 - Math.exp(-s / 6)); // sans étapes connues : la moitié en 4 s, 80 % en 10 s
		loader.pct = Math.max(loader.pct, Math.min(97, target));
		$('#loading-progress').style.width = `${Math.max(4, loader.pct)}%`;
		$('#ld-mascot').style.left = `${Math.max(6, loader.pct)}%`;
		$('#ld-pct').textContent = `${Math.round(loader.pct)} %`;
		$('#ld-time').textContent = `${Math.floor(s)} s`;
		if (!loader.stage) {
			const line = Math.min(LD_LINES.length - 1, Math.floor(s / 3));
			if (line !== loader.line) { loader.line = line; bubble(LD_LINES[line]); }
		}
		const tip = Math.floor(s / 5) % LD_TIPS.length;
		if (tip !== loader.tip || !$('#ld-tip').innerHTML) { loader.tip = tip; $('#ld-tip').innerHTML = LD_TIPS[tip]; }
	};
	step();
	loader.t = setInterval(step, 120);
};
const loaderStop = () => { clearInterval(loader.t); loader.t = null; loader.pending = null; $('#ld-scene').classList.add('hidden'); };

smashExt.onStage((s) => {
	if (!loader.t) { loader.pending = s; return; } // arrivée avant l'ouverture de l'écran de chargement
	if (loader.stage && s.pct <= loader.stage.pct) return;
	setStage(s);
	bubble(`${s.label}…`);
	$('#ld-mascot').classList.remove('dash'); void $('#ld-mascot').offsetWidth; $('#ld-mascot').classList.add('dash');
});

smashExt.onState((s) => {
	// « Ça prend du temps » n'arrête pas le chargement : seul l'affichage du jeu ou un échec le termine.
	if (s.slow) { showHelp({ hint: `Ça prend du temps… ${s.hint || ''}` }); return; }
	if (s.waiting) loaderStart();
	else loaderStop();
	$('#ld-bg').classList.toggle('on', !!(s.waiting && st.cfg && st.cfg.cover));
	if (s.waiting) {
		$('#waiting').classList.remove('hidden');
		$('#loading-bar').classList.remove('hidden');
		$('#wait-msg').textContent = `DEMARRAGE DE ${st.cfg.emulator.toUpperCase()}…`;
		$('#wait-msg').style.color = '';
		st.turbo = false; st.paused = false; st.attached = false; st.speedMode = 'normal';
		$('#btn-turbo').classList.remove('on'); $('#btn-pause').classList.remove('on');
		renderSpeedBtn();
		showHelp(s.dialog ? { dialog: s.dialog } : s.notice ? { hint: s.notice } : {});
		return;
	}
	if (s.attached) {
		st.attached = true;
		$('#waiting').classList.add('hidden');
		showHelp({});
		toast(`${st.cfg.emulator} est piloté par Smash Emu`);
		backToGame();
	} else {
		st.attached = false;
		$('#waiting').classList.remove('hidden');
		$('#wait-msg').textContent = s.error || 'Erreur';
		$('#wait-msg').style.color = 'var(--danger)';
		$('#loading-bar').classList.add('hidden');
		showHelp({ hint: s.hint, lines: s.lines, failed: true });
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
	for (const c of st.cfg.customThemes || []) if (window.SmashThemes) SmashThemes.register(c);
	document.documentElement.dataset.font = st.cfg.fontMode || 'titles';
	if (st.cfg.logo && st.cfg.logo !== SmashLogo.variant()) {
		SmashLogo.setVariant(st.cfg.logo);
		$('#logo').innerHTML = SmashLogo.svg(26);
		$('#splash').innerHTML = SmashLogo.svg(80) + SmashLogo.wordmark();
	}
	st.slotInfo = st.cfg.slotInfo || {};
	document.documentElement.dataset.theme = st.cfg.theme || 'smash';
	document.title = `${st.cfg.name} — Smash Emu`;
	$('#game-name').textContent = st.cfg.name;
	$('#game-sub').textContent = `${st.cfg.system} · ${st.cfg.emulator}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
	$('#wait-msg').textContent = `DEMARRAGE DE ${st.cfg.emulator.toUpperCase()}…`;
	if (st.cfg.notice && !st.attached) showHelp({ hint: st.cfg.notice });
	if (!st.attached) {
		if (st.cfg.cover) { $('#ld-bg').style.backgroundImage = `url("${st.cfg.cover}")`; $('#ld-bg').classList.add('on'); }
		loaderStart();
	}
	// Les boutons que l'émulateur ne sait pas gérer sont masqués.
	for (const el of document.querySelectorAll('[data-need]')) if (!st.cfg.can[el.dataset.need]) el.classList.add('hidden');
	renderSpeedBtn();
	st.sr.init().then(() => smashExt.raceGet()).then((v) => { if (v) smashExt.speedrunKeys(true).catch(() => {}); }).catch(() => {});
	setInterval(tick, 1000);
	tick();
})();

// ---------- Jeu à distance (même système que l'émulateur intégré) ----------
// L'image envoyée à l'ami est celle de la fenêtre (sans la barre ni le panneau), le son celui du PC ; ses
// commandes deviennent des touches lues par la manette 2 de Dolphin (préparée une fois depuis le panneau).
const log = (...a) => console.log(...a);
const focusGame = () => backToGame();
const RP_SIDE = 400;
// Touches du clavier de l'ami (réglages par défaut d'EmulatorJS) → bouton.
const RP_GUEST_KEYS = { 0: 88, 1: 83, 2: 86, 3: 13, 4: 38, 5: 40, 6: 37, 7: 39, 8: 90, 9: 65, 10: 81, 11: 69, 16: 72, 17: 70, 18: 71, 19: 84, 20: 76, 21: 74, 22: 75, 23: 73 };
// Réglage guidé de la manette 2 dans les émulateurs autres que Dolphin : bouton de l'ami → touche du PC hôte.
const RP_GUIDE = [
	['A (bas)', 'NUMPAD0', '0 du pavé'], ['B (droite)', 'NUMPAD1', '1 du pavé'], ['X (gauche)', 'NUMPAD2', '2 du pavé'], ['Y (haut)', 'NUMPAD3', '3 du pavé'],
	['Start', 'NUMPAD4', '4 du pavé'], ['Select / Back', 'NUMPAD5', '5 du pavé'], ['LB', 'NUMPAD6', '6 du pavé'], ['RB', 'NUMPAD7', '7 du pavé'],
	['LT', 'NUMPAD8', '8 du pavé'], ['RT', 'NUMPAD9', '9 du pavé'], ['Clic stick droit', 'MULTIPLY', '* du pavé'],
	['Croix ↑', 'Y', 'Y'], ['Croix ↓', 'U', 'U'], ['Croix ←', 'O', 'O'], ['Croix →', 'P', 'P'],
	['Stick gauche ↑', 'V', 'V'], ['Stick gauche ↓', 'B', 'B'], ['Stick gauche ←', 'N', 'N'], ['Stick gauche →', 'M', 'M'],
	['Stick droit ↑', 'ADD', '+ du pavé'], ['Stick droit ↓', 'SUBTRACT', '− du pavé'], ['Stick droit ←', 'DECIMAL', '. du pavé'], ['Stick droit →', 'R', 'R'],
];
const rpManualHtml = () => `<div class="rp-guest rp-prepare-box">
	<div class="rp-step"><b>Manette de ton ami (à régler une fois)</b> : dans ${esc(st.cfg.emulator)}, règle la manette du <b>joueur 2</b> (ou une 2<sup>e</sup> touche du joueur 1 pour les jeux à un joueur) sur ces touches du clavier. Pas de pavé numérique ? Clique sur le bouton à régler dans l’émulateur, puis sur « Appuyer » ici : Smash Emu appuie à ta place 3 s plus tard.</div>
	<div class="rp-row"><button class="pbtn sm" data-rp="prepare" data-v="native">Ouvrir ${esc(st.cfg.emulator)} (réglages)</button></div>
	<div class="rp-keys">${RP_GUIDE.map(([pad, key, label]) => `<div><span>${esc(pad)}</span><b>${esc(label)}</b><button class="rp-chip" data-rp="prepare" data-v="key:${key}">Appuyer</button></div>`).join('')}</div>
	<div class="rp-hint">Garde la fenêtre du jeu au premier plan et visible pendant la partie : c’est elle qui est filmée et qui reçoit les touches.</div>
</div>`;
// Bouton (numérotation EmulatorJS) → touche lue par la manette 2 de Dolphin.
const RP_P2 = { 8: 'NUMPAD0', 0: 'NUMPAD1', 9: 'NUMPAD2', 1: 'NUMPAD3', 3: 'NUMPAD4', 2: 'NUMPAD5', 10: 'NUMPAD6', 11: 'NUMPAD7', 12: 'NUMPAD8', 13: 'NUMPAD9', 15: 'MULTIPLY', 4: 'Y', 5: 'U', 6: 'O', 7: 'P', 19: 'V', 18: 'B', 17: 'N', 16: 'M', 23: 'ADD', 22: 'SUBTRACT', 21: 'DECIMAL', 20: 'R' };
const rpHeld = new Set();
// Fenêtre du jeu au premier plan ? Sinon les touches de l'ami iraient dans une autre application.
let rpFront = true;
smashExt.onFront((v) => {
	rpFront = v;
	if (!v) for (const k of [...rpHeld]) { rpHeld.delete(k); smashExt.padKey(k, false).catch(() => {}); }
});
let rpPrepared = null;
smashExt.remoteInfo().then((r) => { rpPrepared = r.prepared; }).catch(() => {});

window.smashRemoteAdapter = {
	maxGuests: 1,
	slots: [1],
	ready: () => !!(st.attached && st.cfg && st.cfg.can.remote),
	keyFor: id => RP_GUEST_KEYS[id] || null,
	send: (slot, id, v) => {
		const key = slot === 1 && RP_P2[id];
		if (!key || !rpFront) return;
		const down = window.SmashRemote.ANALOG.includes(id) ? v > 0x3fff : v > 0;
		if (down === rpHeld.has(key)) return;
		if (down) rpHeld.add(key); else rpHeld.delete(key);
		smashExt.padKey(key, down).catch(() => {});
	},
	tracks: async () => {
		const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 60 }, audio: true });
		const video = document.createElement('video');
		video.srcObject = new MediaStream(s.getVideoTracks());
		video.muted = true;
		await video.play();
		// On ne garde que la zone du jeu (l'écran entier est capturé) : ni la barre du haut, ni le panneau à droite.
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d', { alpha: false });
		let rect = await smashExt.captureRect();
		// Dès que la fenêtre perd le premier plan, plus rien n'est filmé (l'écran pourrait montrer autre chose).
		let front = rect.front;
		smashExt.onFront((v) => { front = v; if (v) smashExt.captureRect().then((r) => { rect = r; }).catch(() => {}); });
		setInterval(() => { smashExt.captureRect().then((r) => { rect = r; if (!r.front) front = false; }).catch(() => {}); }, 300);
		const draw = () => {
			const scale = video.videoWidth / rect.dw;
			const top = document.body.classList.contains('bar-hidden') || document.fullscreenElement ? 0 : 48;
			const side = window.smashRemoteAdapter.side ? RP_SIDE : 0;
			const sx = Math.round(rect.x * scale);
			const sy = Math.round((rect.y + top) * scale);
			const w = Math.max(2, Math.round((rect.w - side) * scale));
			const h = Math.max(2, Math.round((rect.h - top) * scale));
			// Image réduite à la largeur de la qualité choisie (1280 px en « Équilibré ») : moins à copier et à encoder.
			const k = Math.min(1, (window.smashRemoteAdapter.maxWidth || 1280) / w);
			const cw = Math.max(2, Math.round(w * k) & ~1);
			const ch = Math.max(2, Math.round(h * k) & ~1);
			if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
			if (!front || !rect.front) {
				ctx.fillStyle = '#000';
				ctx.fillRect(0, 0, cw, ch);
				ctx.fillStyle = '#fff';
				ctx.font = `bold ${Math.round(ch / 22)}px sans-serif`;
				ctx.textAlign = 'center';
				ctx.fillText('L’hôte a quitté la fenêtre du jeu : image en pause', cw / 2, ch / 2);
			} else ctx.drawImage(video, sx, sy, w, h, 0, 0, cw, ch);
			// Image envoyée dès qu'elle est dessinée (et non au prochain tour d'une horloge à 60 i/s).
			track.requestFrame();
			video.requestVideoFrameCallback(draw);
		};
		const track = canvas.captureStream(0).getVideoTracks()[0];
		video.requestVideoFrameCallback(draw);
		return { video: track, audio: s.getAudioTracks()[0] || null };
	},
	onPanel: (open) => {
		window.smashRemoteAdapter.side = open;
		smashExt.side(open ? RP_SIDE : 0).catch(() => {});
		const box = document.querySelector('.rp-prepare-box');
		if (open && box) box.outerHTML = window.smashRemoteAdapter.prepareHtml();
	},
	prepareHtml: () => (st.cfg.emulatorId !== 'dolphin' ? rpManualHtml() : `<div class="rp-guest rp-prepare-box">
		<div class="rp-step"><b>Manette de ton ami</b> : ${rpPrepared ? `prête (joueur 2${st.cfg.systemId === 'wii' ? `, Wiimote + ${rpPrepared === 'Classic' ? 'Classic Controller' : rpPrepared === 'None' ? 'rien' : 'Nunchuk'}` : ''}).` : 'à préparer une fois (Dolphin redémarre : sauvegarde dans le jeu avant).'}</div>
		<div class="rp-row">${st.cfg.systemId === 'wii'
		? '<button class="pbtn sm" data-rp="prepare" data-v="Nunchuk">Wiimote + Nunchuk</button><button class="pbtn sm" data-rp="prepare" data-v="Classic">Classic Controller</button><button class="pbtn sm" data-rp="prepare" data-v="None">Wiimote seule</button>'
		: '<button class="pbtn sm" data-rp="prepare" data-v="Nunchuk">Préparer la manette GameCube 2</button>'}</div>
		<div class="rp-hint">Ton ami joue avec sa manette ou son clavier. Garde la fenêtre du jeu au premier plan et visible : c’est elle qui est filmée. Les jeux où l’on vise l’écran avec la Wiimote ne marchent pas à distance.</div>
	</div>`),
	prepare: async (kind) => {
		// Réglage guidé (autres émulateurs) : ouvrir l'émulateur, ou « appuyer » sur une touche à la place de l'hôte.
		if (kind === 'native') { await smashExt.openNative(); toast(`${esc(st.cfg.emulator)} est ouvert : règle la manette du joueur 2 sur les touches du tableau.`); return; }
		if (String(kind).startsWith('key:')) {
			const key = kind.slice(4);
			toast(`Clique sur le bouton à régler dans ${esc(st.cfg.emulator)} : j’appuie sur la touche dans 3 s`);
			setTimeout(async () => { await smashExt.padKey(key, true).catch(() => {}); setTimeout(() => smashExt.padKey(key, false).catch(() => {}), 150); }, 3000);
			return;
		}
		if (!confirm('Dolphin va redémarrer avec la manette du joueur 2 prête. Sauvegarde dans le jeu avant. Continuer ?')) return;
		window.smashRemoteHost.toggle(false);
		await smashExt.remotePrepare(kind);
		rpPrepared = kind;
		toast('Manette du joueur 2 prête : relance « Inviter un ami » une fois le jeu affiché.');
	},
};
