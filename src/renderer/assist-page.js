/* global state, api, icon, esc, toast, toastError, setMain, PAGES, TITLES, ACTIONS, chArt, $ */
// Page « Succès et indices » : clé API de l'assistant d'indices (Claude) et choix du modèle, compte
// RetroAchievements, et pour chaque jeu le jeu RetroAchievements associé avec ses succès.

const AP = { cfg: null, profile: null, games: null, id: null, prog: null, cands: null, q: '', busy: false };
TITLES.assist = () => [{ label: 'Succès et indices' }];

const apKeyCard = () => {
	const h = AP.cfg.hints;
	return `<div class="ap-card">
		<div class="ap-card-head">${icon('message-circle')}<h3>Assistant d’indices</h3>${h.ready ? '<span class="sw-pill">prêt</span>' : ''}</div>
		<p class="small muted">En jeu, <b>Ctrl+I</b> ouvre l’assistant : il voit l’image du jeu, cherche dans les soluces si besoin et répond au niveau d’aide que tu choisis (coup de pouce, indice précis ou solution). Il fonctionne avec Claude, avec ta propre clé API.</p>
		${h.ready ? `<div class="ap-line">${icon('key-round')}<span>Clé enregistrée : <b>${esc(h.keyPreview)}</b></span><button class="btn sm" data-action="ap-hints-del">Retirer</button></div>`
			: `<div class="ap-line"><input class="input grow" type="password" id="ap-hints-key" placeholder="sk-ant-…" autocomplete="off"><button class="btn primary" data-action="ap-hints-save">Enregistrer</button></div>
			<div class="small muted">Crée une clé sur <a data-external="https://console.anthropic.com/settings/keys">console.anthropic.com</a> (API Keys). Paiement à l’usage : environ un centime par question avec Claude Opus 5.5.</div>`}
		<div class="ap-sub">Modèle</div>
		<div class="chips">${h.models.map(m => `<button class="chip ${h.model === m.id ? 'active' : ''}" data-action="ap-model" data-m="${m.id}" data-tip="${esc(m.hint)}" data-tip-pos="top">${esc(m.label)}</button>`).join('')}</div>
		<div class="small muted" style="margin-top:6px">${esc((h.models.find(m => m.id === h.model) || {}).hint || '')} · dépensé jusqu’ici : ${h.spent < 0.01 ? 'moins d’un centime' : `${h.spent.toFixed(2).replace('.', ',')} $`}</div>
		<div class="small muted" style="margin-top:6px">La clé est chiffrée par Windows sur ce PC et n’est envoyée qu’à Anthropic. L’image du jeu n’est jointe que si tu laisses la case cochée.</div>
	</div>`;
};

const apRaCard = () => {
	const r = AP.cfg.ra;
	const p = AP.profile;
	return `<div class="ap-card">
		<div class="ap-card-head">${icon('medal')}<h3>RetroAchievements</h3>${r.ready ? '<span class="sw-pill">connecté</span>' : ''}</div>
		${r.ready && p ? `<div class="ap-profile">${p.pic ? `<img src="${esc(p.pic)}" alt="">` : ''}<div><b>${esc(p.user)}</b><span>${p.points} points hardcore · ${p.softcore} points normaux${p.motto ? ` · « ${esc(p.motto)} »` : ''}</span>${p.presence ? `<small>${esc(p.presence)}</small>` : ''}</div></div>` : ''}
		${r.ready ? `<div class="ap-line">${icon('key-round')}<span><b>${esc(r.user)}</b> · clé ${esc(r.keyPreview)}</span><button class="btn sm" data-action="ap-ra-del">Déconnecter</button></div>`
			: `<p class="small muted">Les succès des jeux rétro (NES, SNES, N64, Game Boy, GBA, DS, Mega Drive, PlayStation…). Crée un compte gratuit sur <a data-external="https://retroachievements.org">retroachievements.org</a>, puis copie ta <b>clé d’API web</b> (<a data-external="https://retroachievements.org/settings">Paramètres → Clés</a>).</p>
			<div class="ap-line"><input class="input" id="ap-ra-user" placeholder="Nom d’utilisateur" autocomplete="off" style="width:170px"><input class="input grow" type="password" id="ap-ra-key" placeholder="Clé d’API web" autocomplete="off"><button class="btn primary" data-action="ap-ra-save">Connecter</button></div>`}
		<div class="sw-note">${icon('info')}<span>Les succès se débloquent dans un émulateur approuvé par RetroAchievements et connecté à ton compte : <b>RetroArch</b> pour les consoles à cartouche (NES, SNES, N64, Game Boy, GBA, DS, Mega Drive…), <b>DuckStation</b> (PS1), <b>PCSX2</b> (PS2), <b>PPSSPP</b> (PSP), <b>Dolphin</b> (GameCube, Wii). L’émulateur intégré de Smash Emu affiche les succès mais ne peut pas les débloquer. Pendant la partie, Smash Emu te prévient de chaque succès (+10 pièces).</span></div>
		<div class="ap-sub">RetroArch</div>
		${AP.cfg.retroarch ? `<div class="ap-line">${icon('check')}<span>Installé. Connecte-toi une fois dans RetroArch : <b>Paramètres → Succès</b>, ton nom et ton mot de passe RetroAchievements.</span><button class="btn sm" data-action="ap-ra-open">Ouvrir RetroArch</button></div>
			<div class="small muted">Pour jouer avec RetroArch : options du jeu → Émulateur → RetroArch.</div>`
			: `<div class="ap-line"><span>Officiel, gratuit, avec un cœur par console (environ 220 Mo).</span><button class="btn sm primary" data-action="ap-ra-install" ${AP.raInstall ? 'disabled' : ''}>${icon('download')}${esc(AP.raInstall || 'Installer RetroArch')}</button></div>`}
	</div>`;
};

const apGames = () => {
	if (!AP.cfg.ra.ready) return '';
	if (!AP.games) return '<div class="loading"><div class="spinner"></div>Chargement…</div>';
	const row = (g) => {
		const inst = state.instances.find(i => i.id === g.id);
		const status = !g.supported ? '<small>Pas de succès pour cette console</small>' : g.link ? `<small>${esc(g.link.title)}${g.link.by === 'hash' ? ' · reconnu par empreinte' : g.link.by === 'title' ? ' · reconnu par le titre' : ''}</small>` : '<small class="ap-warn">À associer</small>';
		return `<button class="md-game ${AP.id === g.id ? 'on' : ''}" data-action="ap-game" data-id="${esc(g.id)}" ${g.supported ? '' : 'disabled'}><span class="md-game-art">${inst ? chArt(inst) : ''}</span><span class="grow"><b>${esc(g.name)}</b>${status}</span></button>`;
	};
	return `<div class="md-top" style="margin-top:22px"><h2 style="margin:0">Tes jeux</h2><span class="grow"></span><button class="btn" data-action="ap-identify-all" ${AP.busy ? 'disabled' : ''}>${icon('search')}${AP.busy ? 'Recherche…' : 'Reconnaître tous mes jeux'}</button></div>
		<div class="md-layout"><aside><div class="md-side">${AP.games.filter(g => g.supported).map(row).join('') || '<div class="small muted" style="padding:10px">Aucun jeu d’une console avec des succès.</div>'}</div></aside>
		<section id="ap-detail">${apDetail()}</section></div>`;
};

const apDetail = () => {
	const g = (AP.games || []).find(x => x.id === AP.id);
	if (!g) return `<div class="empty">${icon('medal')}<div>Choisis un jeu pour voir ses succès.</div></div>`;
	if (!g.link || AP.cands) {
		const list = AP.cands;
		return `<div class="ap-card"><h3 style="margin-top:0">Quel jeu sur RetroAchievements ?</h3>
			<div class="small muted">« ${esc(g.name)} » n’a pas été reconnu automatiquement. Choisis le bon jeu (même version et même région que ton fichier, sinon les succès ne se débloqueront pas).</div>
			<div class="ap-line" style="margin-top:10px"><input class="input grow" id="ap-q" placeholder="Chercher un autre titre…" value="${esc(AP.q)}"><button class="btn" data-action="ap-search">Chercher</button>${g.link ? '<button class="btn" data-action="ap-cancel">Annuler</button>' : ''}</div>
			${!list ? '<div class="loading"><div class="spinner"></div>Recherche…</div>' : list.length ? `<div class="md-pick-list">${list.map(c => `<button class="md-pick-item" data-action="ap-link" data-g="${c.id}">${c.icon ? `<img src="${esc(c.icon)}" alt="">` : icon('gamepad-2')}<span><b>${esc(c.title)}</b><small class="muted"> · ${c.num} succès</small></span></button>`).join('')}</div>` : '<div class="small muted" style="margin-top:10px">Aucun jeu trouvé.</div>'}
		</div>`;
	}
	const p = AP.prog;
	if (!p) return '<div class="loading"><div class="spinner"></div>Chargement des succès…</div>';
	const pct = p.total ? Math.round((p.earned / p.total) * 100) : 0;
	return `<div class="ap-card">
		<div class="ap-prog">${p.game.icon ? `<img src="${esc(p.game.icon)}" alt="">` : ''}<div class="grow"><h3 style="margin:0">${esc(p.game.title)}</h3>
			<div class="small muted">${esc(p.game.console)} · ${p.earned} / ${p.total} succès · ${p.myPoints} / ${p.points} points · ${p.game.players} joueurs</div>
			<div class="ap-bar"><i style="width:${pct}%"></i></div></div>
			<div class="ap-btns"><button class="btn sm" data-action="ap-change">Changer de jeu</button><button class="btn sm" data-action="ap-refresh">${icon('refresh-cw')}</button></div></div>
		<div class="small muted" style="margin:6px 0 12px">Ces succès se débloquent avec <b>${esc(p.unlockers)}</b>. En jeu, Ctrl+I → Succès, puis « Indice » sur un succès pour savoir comment l’obtenir.</div>
		${p.total ? `<div class="ap-achs">${p.achievements.map(a => `<div class="ap-ach ${a.earned ? 'got' : ''}" data-tip="${esc(a.desc)}" data-tip-pos="top"><img src="${esc(a.earned ? a.badge : a.locked)}" alt="" loading="lazy"><b>${esc(a.title)}</b><small>${a.points} pts${a.hardcore ? ' · hardcore' : ''}</small></div>`).join('')}</div>`
			: '<div class="small muted">Ce jeu n’a pas encore de succès sur RetroAchievements.</div>'}
	</div>`;
};

const apRender = () => {
	if (state.route.name !== 'assist') return;
	if (!AP.cfg) { setMain('<div class="loading"><div class="spinner"></div>Chargement…</div>'); return; }
	setMain(`<div class="md-top"><h1>Succès et indices</h1></div><div class="ap-grid">${apKeyCard()}${apRaCard()}</div>${apGames()}`);
};
const apDetailRender = () => { const d = $('#ap-detail'); if (d) d.innerHTML = apDetail(); else apRender(); };

const apLoadGame = async () => {
	const g = (AP.games || []).find(x => x.id === AP.id);
	AP.prog = null;
	if (!g) return;
	if (!g.link && !AP.cands) {
		try {
			const found = await api('ra:identify', g.id);
			if (found) { g.link = found; } else { AP.cands = await api('ra:candidates', g.id, ''); }
		} catch (error) { toastError(error); AP.cands = []; }
	}
	apRender();
	if (g.link && !AP.cands) {
		try { AP.prog = await api('ra:progress', g.id, false); } catch (error) { toastError(error); }
		apDetailRender();
	}
};

const apLoad = async () => {
	AP.cfg = await api('assist:config');
	apRender();
	if (AP.cfg.ra.ready) {
		api('ra:profile').then((p) => { AP.profile = p; apRender(); }).catch(() => {});
		AP.games = await api('ra:games');
		if (!AP.games.some(g => g.id === AP.id)) AP.id = (AP.games.find(g => g.supported) || {}).id || null;
		apRender();
		await apLoadGame();
	}
};

PAGES.assist = (params = {}) => {
	if (params.id) AP.id = params.id;
	AP.cands = null;
	AP.prog = null;
	apRender();
	apLoad().catch(toastError);
};

Object.assign(ACTIONS, {
	'ap-hints-save': async () => {
		const key = ($('#ap-hints-key') || {}).value || '';
		if (!key.trim()) return;
		AP.cfg.hints = await api('assist:setHints', { key });
		toast('Clé enregistrée : l’assistant d’indices est prêt (Ctrl+I en jeu).');
		apRender();
	},
	'ap-hints-del': async () => { AP.cfg.hints = await api('assist:setHints', { key: '' }); apRender(); },
	'ap-model': async (el) => { AP.cfg.hints = await api('assist:setHints', { model: el.dataset.m }); apRender(); },
	'ap-ra-save': async () => {
		const user = ($('#ap-ra-user') || {}).value || '';
		const key = ($('#ap-ra-key') || {}).value || '';
		if (!user.trim() || !key.trim()) { toast('Remplis le nom d’utilisateur et la clé d’API web.', { type: 'info' }); return; }
		AP.cfg.ra = await api('assist:setRa', { user, key });
		try { AP.profile = await api('ra:profile'); toast(`Connecté à RetroAchievements : <b>${esc(AP.profile.user)}</b>.`); } catch (error) {
			AP.cfg.ra = await api('assist:setRa', { key: '' });
			toastError(error);
		}
		await apLoad();
	},
	'ap-ra-open': () => api('ra:openRetroArch'),
	'ap-ra-install': async () => {
		AP.raInstall = 'Recherche…';
		apRender();
		const off = window.launcher.on('emuinstall', (p) => {
			if (p.id !== 'retroarch') return;
			AP.raInstall = { resolving: 'Recherche…', downloading: p.percent != null ? `Téléchargement ${p.percent} %` : 'Téléchargement…', extracting: 'Installation…', cores: `Cœurs ${p.done + 1} / ${p.total}` }[p.state] || AP.raInstall;
			const b = document.querySelector('[data-action="ap-ra-install"]');
			if (b) b.lastChild.textContent = AP.raInstall;
		});
		try {
			state.emulators = await api('emulators:install', 'retroarch');
			AP.cfg = await api('assist:config');
			toast('RetroArch est installé. Ouvre-le une fois pour te connecter à RetroAchievements (Paramètres → Succès).', { timeout: 10000 });
		} catch (error) { toastError(error); }
		off();
		AP.raInstall = null;
		apRender();
	},
	'ap-ra-del': async () => { AP.cfg.ra = await api('assist:setRa', { user: '', key: '' }); AP.profile = null; AP.games = null; apRender(); },
	'ap-game': async (el) => { AP.id = el.dataset.id; AP.cands = null; AP.q = ''; apRender(); await apLoadGame(); },
	'ap-identify-all': async () => {
		AP.busy = true;
		apRender();
		try {
			const r = await api('ra:identifyAll');
			toast(`${r.found} jeu${r.found > 1 ? 'x' : ''} reconnu${r.found > 1 ? 's' : ''}${r.missing ? `, ${r.missing} à associer à la main` : ''}.`);
			AP.games = await api('ra:games');
		} catch (error) { toastError(error); }
		AP.busy = false;
		apRender();
		await apLoadGame();
	},
	'ap-search': async () => { AP.q = ($('#ap-q') || {}).value || ''; AP.cands = null; apDetailRender(); try { AP.cands = await api('ra:candidates', AP.id, AP.q); } catch (error) { toastError(error); AP.cands = []; } apDetailRender(); },
	'ap-change': async () => { AP.cands = null; AP.q = ''; apDetailRender(); try { AP.cands = await api('ra:candidates', AP.id, ''); } catch (error) { toastError(error); AP.cands = []; } apDetailRender(); },
	'ap-cancel': () => { AP.cands = null; apDetailRender(); },
	'ap-link': async (el) => {
		const link = await api('ra:link', AP.id, Number(el.dataset.g));
		const g = AP.games.find(x => x.id === AP.id);
		if (g) g.link = link;
		AP.cands = null;
		apRender();
		await apLoadGame();
	},
	'ap-refresh': async () => { AP.prog = null; apDetailRender(); try { AP.prog = await api('ra:progress', AP.id, true); } catch (error) { toastError(error); } apDetailRender(); },
});

document.addEventListener('keydown', (e) => {
	if (e.key !== 'Enter' || state.route.name !== 'assist') return;
	const run = { 'ap-q': 'ap-search', 'ap-hints-key': 'ap-hints-save', 'ap-ra-key': 'ap-ra-save' }[e.target.id];
	if (run) Promise.resolve(ACTIONS[run]()).catch(toastError);
});
