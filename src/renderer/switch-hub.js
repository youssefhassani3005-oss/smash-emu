/* global state, api, icon, esc, toast, toastError, setMain, go, PAGES, TITLES, ACTIONS, confirmModal, menu, chArt, ago, playTime, $ */
// Centre Switch : un écran par jeu Switch pour ses sauvegardes (copies de secours, transfert Citron ⇄ Eden, export),
// ses réglages propres (résolution, filtre, langue, mode TV…), ses mods, ses triches, son cache de shaders, et un
// diagnostic quand il ne démarre pas.

const SWH = { id: null, list: null, tab: 'saves', game: null, data: null, storage: null, token: 0 };
TITLES.switch = () => [{ label: 'Centre Switch' }];

const SW_TABS = [['saves', 'Sauvegardes', 'save'], ['settings', 'Réglages du jeu', 'sliders-horizontal'], ['mods', 'Mods', 'puzzle'], ['cheats', 'Triches', 'wand-sparkles'], ['shaders', 'Shaders', 'layers'], ['diag', 'Diagnostic', 'stethoscope']];
const SW_LABEL = { citron: 'Citron', eden: 'Eden' };
const SW_REASON = { manual: 'manuelle', auto: 'avant une partie', 'before-restore': 'avant une restauration', 'before-transfer': 'avant un transfert', 'before-import': 'avant un import' };
const swSize = n => (!n ? '0 o' : n < 1024 ? `${n} o` : n < 1048576 ? `${(n / 1024).toFixed(0)} Ko` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} Mo` : `${(n / 1073741824).toFixed(2)} Go`);
const swWhen = t => (t ? `${new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à ${new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : '—');
const swInst = id => state.instances.find(i => i.id === id);

// ---------- Colonne des jeux ----------

const swSide = () => (SWH.list || []).map((g) => {
	const inst = swInst(g.id);
	return `<button class="md-game ${SWH.id === g.id ? 'on' : ''}" data-action="sw-game" data-id="${esc(g.id)}"><span class="md-game-art">${inst ? chArt(inst) : ''}</span>
		<span class="grow"><b>${esc(g.name)}</b><small>${esc(SW_LABEL[g.engine] || g.engine)}${g.missing ? ' · fichier absent' : ''}${g.tid ? '' : ' · non identifié'}</small></span></button>`;
}).join('') || '<div class="small muted" style="padding:10px">Aucun jeu Switch dans ta bibliothèque.</div>';

// ---------- Onglets ----------

const swSaves = (d) => {
	if (!d.tid) return swNoTid();
	const others = e => d.engines.filter(x => x.engine !== e.engine);
	const card = e => `<div class="sw-card">
		<div class="sw-card-head">${icon('hard-drive')}<b>${SW_LABEL[e.engine]}</b>${e.engine === SWH.game.engine ? '<span class="sw-pill">utilisé par ce jeu</span>' : ''}</div>
		<div class="sw-big">${e.exists ? `${e.files} fichier${e.files > 1 ? 's' : ''} · ${swSize(e.size)}` : 'Aucune sauvegarde'}</div>
		<div class="small muted">${e.exists ? `Modifiée ${esc(ago(e.at))}` : e.profile ? 'Pas encore de partie avec cet émulateur.' : `Pas encore de profil : lance un jeu une fois avec ${SW_LABEL[e.engine]}.`}</div>
		<div class="sw-btns">
			<button class="btn sm primary" data-action="sw-backup" data-e="${e.engine}" ${e.exists ? '' : 'disabled'}>${icon('save')}Copie de secours</button>
			${others(e).map(o => `<button class="btn sm" data-action="sw-transfer" data-from="${e.engine}" data-to="${o.engine}" ${e.exists && o.profile ? '' : 'disabled'} data-tip="${o.profile ? `Remplace la sauvegarde de ${SW_LABEL[o.engine]} par celle-ci (l’ancienne est gardée en copie de secours)` : `Lance d’abord un jeu avec ${SW_LABEL[o.engine]}`}" data-tip-pos="top">${icon('arrow-left-right')}Vers ${SW_LABEL[o.engine]}</button>`).join('')}
			<button class="btn sm" data-action="sw-export" data-e="${e.engine}" ${e.exists ? '' : 'disabled'}>${icon('file-archive')}Exporter</button>
			<button class="btn sm" data-action="sw-import" data-e="${e.engine}" ${e.profile ? '' : 'disabled'}>${icon('upload')}Importer</button>
			<button class="btn sm" data-action="sw-save-folder" data-e="${e.engine}" data-tip="Ouvrir le dossier" data-tip-pos="top">${icon('folder-open')}</button>
		</div></div>`;
	return `<div class="sw-grid2">${d.engines.map(card).join('')}</div>
		<div class="row sw-line"><div class="grow"><div class="bold">Copie de secours automatique</div><div class="small muted">Avant chaque partie, si la sauvegarde a changé. Les ${esc(String(state.settings.saveBackups || 10))} plus récentes sont gardées ; les copies manuelles ne sont jamais effacées.</div></div>
			<button class="switch ${d.auto ? 'on' : ''}" data-action="sw-auto"></button></div>
		<div class="sw-sub"><h3>Copies de secours <span class="muted">${d.backups.length}</span></h3><button class="btn sm" data-action="sw-backup-folder">${icon('folder-open')}Dossier</button></div>
		${d.backups.length ? `<div class="sw-list">${d.backups.map(b => `<div class="sw-row">
			<div class="grow"><b>${esc(swWhen(b.at))}</b><small>${esc(SW_LABEL[b.engine] || '?')} · ${esc(SW_REASON[b.reason] || b.reason)} · ${b.files} fichier${b.files > 1 ? 's' : ''} · ${swSize(b.size)}</small></div>
			<button class="btn sm" data-action="sw-restore" data-name="${esc(b.name)}">${icon('rotate-ccw')}Restaurer</button>
			<button class="icon-btn" data-action="sw-backup-del" data-name="${esc(b.name)}" data-tip="Supprimer" data-tip-pos="top">${icon('trash-2')}</button>
		</div>`).join('')}</div>` : '<div class="small muted">Aucune copie pour l’instant. Une copie est faite toute seule avant ta prochaine partie.</div>'}
		<div class="sw-note">${icon('info')}Chaque émulateur garde ses propres sauvegardes. Après un changement d’émulateur, utilise « Vers Eden » ou « Vers Citron » pour reprendre ta partie.</div>`;
};

const swSettings = (d) => {
	if (!d.tid) return swNoTid();
	return `<div class="sw-sub"><h3>Préréglages</h3><span class="small muted">pour ${esc(SW_LABEL[d.engine])}, appliqués au prochain lancement du jeu</span></div>
		<div class="chips">${d.presets.map(p => `<button class="chip" data-action="sw-preset" data-p="${p.id}">${icon('sparkles')}${esc(p.label)}</button>`).join('')}
			<button class="chip" data-action="sw-reset">${icon('rotate-ccw')}Tout en réglage général</button></div>
		<div class="sw-opts">${d.options.map(o => `<div class="sw-opt">
			<div class="bold">${esc(o.label)}</div><div class="small muted">${esc(o.hint)}</div>
			<div class="chips"><button class="chip ${o.value === null ? 'active' : ''}" data-action="sw-opt" data-o="${o.id}" data-v="">Général</button>${o.choices.map(c => `<button class="chip ${o.value === c ? 'active' : ''}" data-action="sw-opt" data-o="${o.id}" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>
		</div>`).join('')}</div>
		<div class="sw-note">${icon('info')}« Général » reprend le réglage de ${esc(SW_LABEL[d.engine])} pour tous les jeux. Ces réglages ne valent que pour ce jeu.</div>`;
};

const swMods = (d) => {
	if (!d.tid) return swNoTid();
	return `<div class="sw-sub"><h3>Mods installés <span class="muted">${d.list.length}</span></h3>
			<button class="btn sm primary" data-action="sw-mod-import" data-k="archive">${icon('upload')}Archive…</button>
			<button class="btn sm" data-action="sw-mod-import" data-k="folder">${icon('folder-open')}Dossier…</button>
			<button class="btn sm" data-action="sw-mods-gb">${icon('globe')}GameBanana</button>
			<button class="btn sm" data-action="sw-mod-folder">${icon('folder-open')}Dossier du jeu</button></div>
		${d.list.length ? `<div class="sw-list">${d.list.map(m => `<div class="sw-row">
			<div class="grow"><b>${esc(m.name)}</b><small>${m.kinds.map(k => ({ romfs: 'fichiers du jeu', exefs: 'code', cheats: 'triches' }[k] || k)).join(', ') || 'contenu inconnu'} · ${swSize(m.size)} · ${Object.keys(m.engines).map(e => SW_LABEL[e]).join(' et ')}</small></div>
			<button class="btn sm" data-action="sw-mod-solo" data-name="${esc(m.name)}" data-tip="Activer seulement ce mod (pour trouver celui qui pose problème)" data-tip-pos="top">Seul</button>
			<button class="switch ${m.on ? 'on' : ''}" data-action="sw-mod-toggle" data-name="${esc(m.name)}" data-on="${m.on ? 1 : 0}"></button>
			<button class="icon-btn" data-action="sw-mod-del" data-name="${esc(m.name)}" data-tip="Supprimer" data-tip-pos="top">${icon('trash-2')}</button>
		</div>`).join('')}
		${d.list.length > 1 ? `<div class="chips" style="margin-top:10px"><button class="chip" data-action="sw-mod-all" data-on="1">Tout activer</button><button class="chip" data-action="sw-mod-all" data-on="0">Tout désactiver</button></div>` : ''}</div>`
		: `<div class="empty">${icon('puzzle')}<div>Aucun mod. Installe-en depuis GameBanana ou depuis une archive.</div></div>`}
		<div class="sw-note">${icon('info')}Un mod désactivé reste sur le disque, rangé à part : Citron et Eden ne le chargent plus. Les mods du randomizer se gèrent dans le menu du jeu.</div>`;
};

const swCheats = (d) => {
	if (!d.tid) return swNoTid();
	return `<div class="sw-sub"><h3>Triches</h3><button class="btn sm primary" data-action="sw-cheat-import">${icon('upload')}Importer un fichier .txt…</button></div>
		${d.builds.length ? d.builds.map(b => `<div class="sw-card" style="margin-bottom:12px">
			<div class="sw-card-head">${icon('wand-sparkles')}<b>Version ${esc(b.bid)}</b>${b.current ? '<span class="sw-pill">ta version du jeu</span>' : '<span class="sw-pill warn">autre version : sans effet</span>'}
				<span class="grow"></span><button class="chip" data-action="sw-cheat-all" data-b="${esc(b.bid)}" data-on="1">Tout cocher</button><button class="chip" data-action="sw-cheat-all" data-b="${esc(b.bid)}" data-on="0">Tout décocher</button>
				<button class="icon-btn" data-action="sw-cheat-del" data-b="${esc(b.bid)}" data-tip="Supprimer ces triches" data-tip-pos="top">${icon('trash-2')}</button></div>
			<div class="sw-list">${b.list.map(c => `<div class="sw-row"><div class="grow"><b>${esc(c.name)}</b><small>${c.master ? 'code maître, toujours actif' : `${c.lines} ligne${c.lines > 1 ? 's' : ''} de code`}</small></div>
				${c.master ? '' : `<button class="switch ${c.on ? 'on' : ''}" data-action="sw-cheat-toggle" data-b="${esc(b.bid)}" data-i="${c.i}" data-on="${c.on ? 1 : 0}"></button>`}</div>`).join('')}</div>
		</div>`).join('') : `<div class="empty">${icon('wand-sparkles')}<div>Aucune triche. Importe un fichier au format Atmosphère (« [Nom] » puis les lignes de code).</div></div>`}
		<div class="sw-note">${icon('info')}Version de ton jeu : <b>${esc(d.current || 'inconnue (importe tes clés)')}</b>. Les triches cochées s’appliquent au prochain lancement, avec Citron et Eden.</div>`;
};

const swShaders = d => (!d.tid ? swNoTid() : `<div class="sw-grid2">${d.engines.map(e => `<div class="sw-card">
		<div class="sw-card-head">${icon('layers')}<b>${SW_LABEL[e.engine]}</b></div>
		<div class="sw-big">${swSize(e.size)}</div><div class="small muted">${e.size ? 'Effets graphiques déjà préparés pour ce jeu.' : 'Rien en cache pour ce jeu.'}</div>
		<div class="sw-btns"><button class="btn sm" data-action="sw-shader-clear" data-e="${e.engine}" ${e.size ? '' : 'disabled'}>${icon('trash-2')}Vider</button></div></div>`).join('')}</div>
	<div class="sw-note">${icon('info')}Le cache évite les saccades : chaque effet n’est préparé qu’une fois. Vide-le seulement si l’image est abîmée (couleurs fausses, objets invisibles) après une mise à jour de l’émulateur ou de ta carte graphique : la prochaine partie saccadera un peu le temps de le refaire.</div>`);

const SW_STATE_ICON = { ok: 'check', warn: 'triangle-alert', bad: 'circle-x' };
const swDiag = d => `<div class="sw-verdict ${d.verdict}">${icon(SW_STATE_ICON[d.verdict])}<b>${d.verdict === 'ok' ? 'Tout est prêt pour ce jeu.' : d.verdict === 'warn' ? 'Ça devrait marcher, avec quelques points à surveiller.' : 'Le jeu ne peut pas démarrer tant que les points en rouge ne sont pas réglés.'}</b></div>
	<div class="sw-list">${d.checks.map(c => `<div class="sw-row sw-check ${c.state}">${icon(SW_STATE_ICON[c.state])}<div class="grow"><b>${esc(c.label)}</b><small>${esc(c.detail)}</small></div></div>`).join('')}</div>
	${d.log.length ? `<div class="sw-sub"><h3>Dernières erreurs ${d.engine === 'eden' ? 'd’Eden' : `de ${esc(SW_LABEL[d.engine] || d.engine)}`}</h3><button class="btn sm" data-action="sw-log">${icon('scroll-text')}Ouvrir le journal</button></div>
		<pre class="sw-log">${d.log.map(esc).join('\n')}</pre>` : ''}
	<div class="chips" style="margin-top:12px"><button class="chip" data-action="sw-diag">${icon('refresh-cw')}Refaire le diagnostic</button></div>`;

const swNoTid = () => `<div class="empty">${icon('key-round')}<div>Smash Emu n’arrive pas à identifier ce jeu. Importe les clés de ta console (Paramètres → Émulateurs), puis reviens ici.</div></div>`;

const SW_BODY = { saves: swSaves, settings: swSettings, mods: swMods, cheats: swCheats, shaders: swShaders, diag: swDiag };
const SW_LOAD = { saves: 'sw:saves', settings: 'sw:settings', mods: 'sw:mods', cheats: 'sw:cheats', shaders: 'sw:shaders', diag: 'sw:diagnose' };

const swMain = () => {
	const g = SWH.game;
	if (!SWH.id) return `<div class="empty">${icon('gamepad-2')}<div>Ajoute un jeu Switch à ta bibliothèque pour le gérer ici.</div></div>`;
	if (!g) return '<div class="loading"><div class="spinner"></div>Lecture du jeu…</div>';
	const inst = swInst(g.id);
	return `<div class="sw-head">
		<div class="sw-art">${inst ? chArt(inst) : ''}</div>
		<div class="grow"><h2>${esc(g.name)}</h2>
			<div class="small muted">${[g.tid && `ID ${g.tid}`, g.buildId && `build ${g.buildId.slice(0, 16)}`, g.format, g.size && swSize(g.size), g.playTimeMs && playTime(g.playTimeMs)].filter(Boolean).map(esc).join(' · ')}${g.missing ? ' · <b class="sw-red">fichier du jeu introuvable</b>' : ''}</div></div>
		<div class="sw-engine"><span class="small muted">Émulateur</span><div class="chips">${g.engines.map(e => `<button class="chip ${g.engine === e.id ? 'active' : ''}" data-action="sw-engine" data-e="${e.id}" ${e.installed || g.engine === e.id ? '' : 'disabled data-tip="Pas installé"'}>${esc(e.label)}</button>`).join('')}</div></div>
		<button class="btn primary" data-action="play" data-id="${esc(g.id)}">${icon('play')}Jouer</button>
	</div>
	<div class="sw-tabs">${SW_TABS.map(([k, l, ic]) => `<button class="sw-tab ${SWH.tab === k ? 'on' : ''}" data-action="sw-tab" data-t="${k}">${icon(ic)}${l}</button>`).join('')}</div>
	<div class="sw-body">${SWH.data ? SW_BODY[SWH.tab](SWH.data) : '<div class="loading"><div class="spinner"></div>Chargement…</div>'}</div>`;
};

const swTop = () => {
	const s = SWH.storage;
	const total = s ? s.engines.reduce((a, e) => a + e.saves + e.shaders + e.mods, 0) + s.backups : 0;
	return `<div class="md-top"><h1>Centre Switch</h1>${s ? `<span class="muted">${s.engines.map(e => `${SW_LABEL[e.engine]} : ${swSize(e.saves + e.shaders + e.mods)}`).join(' · ')} · copies de secours : ${swSize(s.backups)} · total ${swSize(total)}</span>` : ''}
		<span class="grow"></span><button class="btn" data-action="sw-shaders-all">${icon('layers')}Vider tous les shaders</button>
		<button class="btn" data-action="nav" data-to="settings">${icon('key-round')}Clés et émulateurs</button></div>`;
};

const swRender = () => {
	if (state.route.name !== 'switch') return;
	const main = $('#sw-main');
	if (main) { main.innerHTML = swMain(); $('#sw-side').innerHTML = `<div class="md-side">${swSide()}</div>`; $('#sw-top').innerHTML = swTop(); return; }
	setMain(`<div id="sw-top">${swTop()}</div><div class="md-layout"><aside id="sw-side"><div class="md-side">${swSide()}</div></aside><section id="sw-main">${swMain()}</section></div>`);
};

const swLoadTab = async () => {
	const token = ++SWH.token;
	SWH.data = null;
	swRender();
	try {
		const data = await api(SW_LOAD[SWH.tab], SWH.id);
		if (token === SWH.token) { SWH.data = data; swRender(); }
	} catch (error) { toastError(error); }
};

const swOpen = async (id) => {
	SWH.id = id;
	SWH.game = null;
	SWH.data = null;
	swRender();
	if (!id) return;
	try { SWH.game = await api('sw:game', id); } catch (error) { toastError(error); return; }
	await swLoadTab();
};

PAGES.switch = async (params = {}) => {
	SWH.list = null;
	swRender();
	[SWH.list, SWH.storage] = await Promise.all([api('sw:list').catch(() => []), api('sw:storage').catch(() => null)]);
	if (params.id) SWH.id = params.id;
	if (params.tab) SWH.tab = params.tab;
	if (!SWH.list.some(g => g.id === SWH.id)) SWH.id = SWH.list[0] ? SWH.list[0].id : null;
	await swOpen(SWH.id);
};

// Résultat d'une action : nouvelles données de l'onglet, et place prise sur le disque mise à jour.
const swSet = async (data, message) => {
	if (data) SWH.data = data;
	if (message) toast(message);
	swRender();
	api('sw:storage').then((s) => { SWH.storage = s; const t = $('#sw-top'); if (t && state.route.name === 'switch') t.innerHTML = swTop(); }).catch(() => {});
};

Object.assign(ACTIONS, {
	'sw-game': el => swOpen(el.dataset.id),
	'sw-tab': (el) => { SWH.tab = el.dataset.t; swLoadTab(); },
	'sw-engine': async (el) => {
		const to = el.dataset.e;
		if (!SWH.game || SWH.game.engine === to) return;
		SWH.game = await api('sw:engine', SWH.id, to);
		SWH.list = await api('sw:list');
		await swLoadTab();
		// Partie commencée avec l'autre émulateur : proposer de la reprendre.
		const s = await api('sw:saves', SWH.id).catch(() => null);
		const here = s && s.engines.find(e => e.engine === to);
		const other = s && s.engines.find(e => e.engine !== to && e.exists);
		if (other && here && here.profile && (!here.exists || other.at > here.at)) {
			toast(`Jeu lancé avec <b>${SW_LABEL[to]}</b> désormais. Ta sauvegarde ${SW_LABEL[other.engine]} est plus récente : la copier dans ${SW_LABEL[to]} ?`, { type: 'info', timeout: 12000, actions: [{ label: `Copier vers ${SW_LABEL[to]}`, run: () => Promise.resolve(ACTIONS['sw-transfer']({ dataset: { from: other.engine, to } })).catch(toastError) }] });
		} else toast(`Ce jeu se lance maintenant avec <b>${SW_LABEL[to]}</b>.`);
	},
	'sw-backup': async el => swSet(await api('sw:backup', SWH.id, el.dataset.e), 'Copie de secours faite.'),
	'sw-auto': async (el) => { const on = !el.classList.contains('on'); await api('sw:autoBackup', on); state.settings.switchAutoBackup = on; if (SWH.data) SWH.data.auto = on; swRender(); },
	'sw-transfer': async (el) => {
		const { from, to } = el.dataset;
		if (!(await confirmModal('Transférer la sauvegarde', `La sauvegarde de <b>${SW_LABEL[to]}</b> pour ce jeu sera remplacée par celle de <b>${SW_LABEL[from]}</b>. L’actuelle est d’abord gardée en copie de secours.`, { confirm: `Copier vers ${SW_LABEL[to]}` }))) return;
		const data = await api('sw:transfer', SWH.id, from, to);
		if (SWH.tab === 'saves') swSet(data, `Sauvegarde copiée dans ${SW_LABEL[to]}.`);
		else toast(`Sauvegarde copiée dans ${SW_LABEL[to]}.`);
	},
	'sw-restore': (el) => {
		const engines = (SWH.data.engines || []).filter(e => e.profile);
		if (!engines.length) { toast('Lance d’abord le jeu une fois pour créer ton profil de joueur.', { type: 'info' }); return; }
		menu(el, engines.map(e => ({
			icon: 'rotate-ccw',
			label: `Restaurer dans ${SW_LABEL[e.engine]}`,
			run: async () => {
				if (!(await confirmModal('Restaurer la copie', `La sauvegarde actuelle de ${SW_LABEL[e.engine]} est gardée en copie de secours, puis remplacée par celle du ${esc(swWhen((SWH.data.backups.find(b => b.name === el.dataset.name) || {}).at))}.`, { confirm: 'Restaurer' }))) return;
				swSet(await api('sw:restore', SWH.id, el.dataset.name, e.engine), 'Copie restaurée.');
			},
		})));
	},
	'sw-backup-del': async (el) => {
		if (!(await confirmModal('Supprimer la copie', 'Cette copie de secours sera supprimée définitivement.', { confirm: 'Supprimer', danger: true }))) return;
		swSet(await api('sw:backupDelete', SWH.id, el.dataset.name), 'Copie supprimée.');
	},
	'sw-backup-folder': () => api('sw:backupFolder', SWH.id),
	'sw-save-folder': el => api('sw:saveFolder', SWH.id, el.dataset.e),
	'sw-export': async (el) => { const f = await api('sw:export', SWH.id, el.dataset.e); if (f) toast(`Sauvegarde exportée : ${esc(f)}`); },
	'sw-import': (el) => {
		const e = el.dataset.e;
		menu(el, [['archive', 'Depuis une archive (.zip)…', 'file-archive'], ['folder', 'Depuis un dossier…', 'folder-open']].map(([k, label, ic]) => ({
			icon: ic, label,
			run: async () => { const d = await api('sw:import', SWH.id, e, k); if (d) swSet(d, `Sauvegarde importée dans ${SW_LABEL[e]} (l’ancienne est en copie de secours).`); },
		})));
	},
	'sw-opt': async el => swSet(await api('sw:setOption', SWH.id, el.dataset.o, el.dataset.v || null)),
	'sw-preset': async el => swSet(await api('sw:preset', SWH.id, el.dataset.p), `Préréglage « ${esc(el.textContent.trim())} » appliqué : au prochain lancement du jeu.`),
	'sw-reset': async () => swSet(await api('sw:resetOptions', SWH.id), 'Ce jeu reprend les réglages généraux.'),
	'sw-mod-import': async (el) => { const r = await api('sw:modImport', SWH.id, el.dataset.k); if (r) swSet({ tid: SWH.game.tid, list: r.list }, `Mod installé : ${esc(r.names.join(', '))}`); },
	'sw-mod-toggle': async el => swSet(await api('sw:modToggle', SWH.id, el.dataset.name, el.dataset.on !== '1')),
	'sw-mod-solo': async el => swSet(await api('sw:modSolo', SWH.id, el.dataset.name), `Seul « ${esc(el.dataset.name)} » est actif.`),
	'sw-mod-all': async (el) => { let d = SWH.data; for (const m of d.list) d = await api('sw:modToggle', SWH.id, m.name, el.dataset.on === '1'); swSet(d); },
	'sw-mod-del': async (el) => {
		if (!(await confirmModal('Supprimer le mod', `« ${esc(el.dataset.name)} » sera supprimé pour Citron et Eden.`, { confirm: 'Supprimer', danger: true }))) return;
		swSet(await api('sw:modRemove', SWH.id, el.dataset.name), 'Mod supprimé.');
	},
	'sw-mod-folder': () => api('sw:modFolder', SWH.id),
	'sw-mods-gb': () => go('mods', { id: SWH.id }),
	'sw-cheat-import': async () => {
		const r = await api('sw:cheatImport', SWH.id);
		if (r) swSet(r, `${r.count} triche${r.count > 1 ? 's' : ''} importée${r.count > 1 ? 's' : ''}${r.other ? ' (pour une autre version du jeu que la tienne)' : ''} : coche celles que tu veux.`);
	},
	'sw-cheat-toggle': async el => swSet(await api('sw:cheatToggle', SWH.id, el.dataset.b, +el.dataset.i, el.dataset.on !== '1')),
	'sw-cheat-all': async el => swSet(await api('sw:cheatToggle', SWH.id, el.dataset.b, 'all', el.dataset.on === '1')),
	'sw-cheat-del': async (el) => {
		if (!(await confirmModal('Supprimer les triches', `Les triches de la version ${esc(el.dataset.b)} seront supprimées.`, { confirm: 'Supprimer', danger: true }))) return;
		swSet(await api('sw:cheatRemove', SWH.id, el.dataset.b));
	},
	'sw-shader-clear': async el => swSet(await api('sw:shaderClear', SWH.id, el.dataset.e), 'Cache de shaders vidé.'),
	'sw-shaders-all': async () => {
		if (!(await confirmModal('Vider tous les shaders', 'Le cache de shaders de tous les jeux Switch sera vidé. Les prochaines parties saccaderont un peu le temps de le refaire.', { confirm: 'Vider' }))) return;
		SWH.storage = await api('sw:shaderClearAll');
		if (SWH.tab === 'shaders') await swLoadTab(); else swRender();
		toast('Caches de shaders vidés.');
	},
	'sw-diag': () => swLoadTab(),
	'sw-log': () => api('sw:openLog', SWH.id),
});
