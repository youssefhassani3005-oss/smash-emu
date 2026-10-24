/* global state, api, icon, esc, toast, toastError, setMain, PAGES, TITLES, ACTIONS, INPUTS, modal, sanitize, sortInstances, sysInfo, chSys, chArt, lookOf, refreshInstances, compact, bytes, ago, debounce, $, $$ */
// Page « Mods » reliée à GameBanana : choix d'un de tes jeux, jeu GameBanana correspondant (trouvé automatiquement,
// à confirmer), mods en cartes illustrées (populaires, récents, mieux notés, recherche), fiche et installation.

const MOD = { inst: null, games: null, list: null, sort: 'popular', q: '', page: 1, busy: false, token: 0 };
TITLES.mods = () => [{ label: 'Mods' }];

// Nom du jeu nettoyé pour la recherche : sans région, version, crochets ni « — variante ».
const cleanName = n => String(n || '').replace(/\[.*?\]|\(.*?\)/g, ' ').replace(/\.nkit|—.*$| - (Redux|Test|Chaos.*)$/gi, ' ').replace(/\s+/g, ' ').trim();
const modGames = () => sortInstances(state.instances.filter(i => i.type === 'rom' || i.type === 'coopdx'), 'played');

const modsSide = () => `<div class="md-side">${modGames().map(i => `<button class="md-game ${MOD.inst === i.id ? 'on' : ''}" data-action="md-inst" data-id="${esc(i.id)}"><span class="md-game-art">${chArt(i)}</span><span class="grow"><b>${esc(i.name)}</b><small>${esc(i.type === 'coopdx' ? 'SM64 Coop DX' : sysInfo(chSys(i)).label)}${i.gbGame ? ' · lié' : ''}</small></span></button>`).join('')}</div>`;

const modCard = m => `<button class="md-card" data-action="md-open" data-id="${m.id}">
	<div class="md-img">${m.image ? `<img src="${esc(m.image)}" alt="" loading="lazy">` : icon('puzzle')}</div>
	<b>${esc(m.name)}</b>
	<span class="md-meta">${icon('heart', 'sm')}${compact(m.likes)} ${icon('eye', 'sm')}${compact(m.views)}${m.category ? ` · ${esc(m.category)}` : ''}</span>
	<small>${esc(m.author || '')}${m.updated ? ` · ${esc(ago(m.updated))}` : ''}</small>
</button>`;

const modsMain = () => {
	const inst = state.instances.find(i => i.id === MOD.inst);
	if (!inst) return `<div class="empty">${icon('puzzle')}<div>Ajoute un jeu à ta bibliothèque pour chercher ses mods.</div></div>`;
	if (!inst.gbGame) {
		if (!MOD.games) return '<div class="loading"><div class="spinner"></div>Recherche du jeu sur GameBanana…</div>';
		return `<div class="md-pick"><h3>Quel jeu sur GameBanana ?</h3><div class="small muted">Recherche : « ${esc(cleanName(inst.name))} »</div>
			<div class="md-pick-list">${MOD.games.length ? MOD.games.map(g => `<button class="md-pick-item" data-action="md-link" data-id="${g.id}" data-name="${esc(g.name)}" data-icon="${esc(g.icon || '')}">${g.icon ? `<img src="${esc(g.icon)}" alt="">` : icon('gamepad-2')}<b>${esc(g.name)}</b></button>`).join('') : '<div class="small muted">Aucun jeu trouvé.</div>'}</div>
			<div class="row" style="gap:8px;margin-top:12px"><div class="search grow">${icon('search')}<input class="input" id="md-gq" placeholder="Chercher un autre nom de jeu…"></div><button class="btn" data-action="md-gsearch">Chercher</button></div></div>`;
	}
	const head = `<div class="md-head">
		${inst.gbGame.icon ? `<img class="md-gicon" src="${esc(inst.gbGame.icon)}" alt="">` : ''}
		<div class="grow"><h2>${esc(inst.gbGame.name)}</h2><span class="small muted">Mods GameBanana${MOD.list ? ` · ${compact(MOD.list.total)}` : ''} · <a data-action="md-unlink">changer de jeu</a></span></div>
		<div class="search">${icon('search')}<input class="input" data-input="md-q" placeholder="Rechercher un mod" value="${esc(MOD.q)}"></div>
	</div>
	<div class="chips" style="margin-bottom:14px">${[['popular', 'Populaires', 'flame'], ['recent', 'Récents', 'clock'], ['liked', 'Mieux notés', 'heart'], ['updated', 'Mis à jour', 'refresh-cw']].map(([v, l, ic]) => `<button class="chip ${MOD.sort === v && !MOD.q ? 'active' : ''}" data-action="md-sort" data-v="${v}">${icon(ic)}${l}</button>`).join('')}</div>`;
	if (!MOD.list) return `${head}<div class="loading"><div class="spinner"></div>Chargement des mods…</div>`;
	return `${head}${MOD.list.mods.length ? `<div class="md-grid">${MOD.list.mods.map(modCard).join('')}</div>
		<div class="row" style="justify-content:center;gap:10px;margin-top:16px">${MOD.page > 1 ? `<button class="btn" data-action="md-page" data-d="-1">${icon('chevron-left')}Précédents</button>` : ''}${MOD.list.mods.length >= 20 && !MOD.list.last ? `<button class="btn" data-action="md-page" data-d="1">Suivants${icon('chevron-right')}</button>` : ''}</div>`
		: `<div class="empty">${icon('search')}<div>Aucun mod trouvé.</div></div>`}`;
};

const modsRender = () => {
	if (state.route.name !== 'mods') return;
	const main = $('#md-main');
	if (main) { main.innerHTML = modsMain(); $('#md-side').innerHTML = modsSide(); return; }
	setMain(`<div class="md-top"><h1>Mods</h1><span class="muted">GameBanana</span><span class="grow"></span>
		<button class="btn" data-action="nav" data-to="discover">${icon('users')}Mods SM64 Coop DX</button></div>
		<div class="md-layout"><aside id="md-side">${modsSide()}</aside><section id="md-main">${modsMain()}</section></div>`);
};

const modsLoad = async () => {
	const inst = state.instances.find(i => i.id === MOD.inst);
	if (!inst) return;
	const token = ++MOD.token;
	try {
		if (!inst.gbGame) {
			if (!MOD.games) { MOD.games = await api('gb:games', inst.type === 'coopdx' ? 'Super Mario 64' : cleanName(inst.name)); }
		} else if (!MOD.list) {
			MOD.list = await api('gb:mods', inst.gbGame.id, { sort: MOD.sort, page: MOD.page, q: MOD.q });
		}
	} catch (error) { toastError(error); MOD.games = MOD.games || []; MOD.list = MOD.list || { total: 0, mods: [] }; }
	if (token === MOD.token) modsRender();
};

PAGES.mods = (params = {}) => {
	const list = modGames();
	if (params.id) MOD.inst = params.id;
	if (!list.some(i => i.id === MOD.inst)) MOD.inst = list[0] ? list[0].id : null;
	MOD.games = null;
	MOD.list = null;
	modsRender();
	modsLoad();
};

const modsReload = () => { MOD.list = null; MOD.games = null; modsRender(); modsLoad(); };

const openMod = async (id) => {
	const inst = state.instances.find(i => i.id === MOD.inst);
	await modal({
		title: 'Mod GameBanana',
		width: 820,
		body: '<div id="md-detail"><div class="loading"><div class="spinner"></div>Chargement…</div></div>',
		setup: async (el, close) => {
			let m;
			try { m = await api('gb:mod', id); } catch (error) { el.querySelector('#md-detail').innerHTML = `<div class="empty">${esc(error.message)}</div>`; return; }
			el.querySelector('.modal-head h2').textContent = m.name;
			el.querySelector('#md-detail').innerHTML = `
				<div class="md-gallery">${m.images.length ? `<img id="md-big" src="${esc(m.images[0])}" alt="">` : ''}<div class="md-thumbs">${m.images.map((u, k) => `<img src="${esc(u)}" data-k="${k}" alt="">`).join('')}</div></div>
				<div class="md-stats">${icon('heart', 'sm')}${compact(m.likes)} · ${icon('eye', 'sm')}${compact(m.views)} · ${icon('download', 'sm')}${compact(m.downloads)}${m.author ? ` · par <b>${esc(m.author)}</b>` : ''}${m.category ? ` · ${esc(m.category)}` : ''}</div>
				<div class="md-files">${m.files.map(f => `<div class="md-file"><div class="grow"><b>${esc(f.name)}</b><small>${bytes(f.size)}${f.version ? ` · v${esc(f.version)}` : ''}${f.description ? ` · ${esc(f.description)}` : ''}</small></div><button class="btn primary" data-install="${f.id}">${icon('download')}Installer</button></div>`).join('') || '<div class="small muted">Pas de fichier téléchargeable.</div>'}</div>
				<div class="md-text">${sanitize(m.text)}</div>
				<button class="btn" data-external="${esc(m.url)}">${icon('external-link')}Voir sur GameBanana</button>`;
			el.addEventListener('click', async (e) => {
				const th = e.target.closest('.md-thumbs img');
				if (th) el.querySelector('#md-big').src = m.images[+th.dataset.k];
				const b = e.target.closest('[data-install]');
				if (!b || !inst) return;
				b.disabled = true;
				b.innerHTML = `${icon('download')}Téléchargement…`;
				MOD.progressBtn = b;
				try {
					const r = await api('gb:install', inst.id, m.id, b.dataset.install);
					await refreshInstances();
					close();
					toast(r.where === 'switch' ? `<b>${esc(r.name)}</b> installé : Eden et Citron le chargent au prochain lancement du jeu.`
						: r.where === 'folder' ? `<b>${esc(r.name)}</b> téléchargé dans le dossier du jeu (ouvert) : suis les instructions du mod pour ${esc(r.system)}.`
						: `<b>${esc(r.name)}</b> installé dans « ${esc(inst.name)} ».`, { timeout: 9000 });
				} catch (error) { toastError(error); b.disabled = false; b.innerHTML = `${icon('download')}Installer`; }
			});
		},
	});
};

window.launcher.on('gb:progress', (p) => {
	const b = MOD.progressBtn;
	if (!b || !document.body.contains(b)) return;
	b.innerHTML = p.state === 'installing' ? `${icon('refresh-cw')}Installation…` : `${icon('download')}${p.percent != null ? `${p.percent} %` : 'Téléchargement…'}`;
});

Object.assign(ACTIONS, {
	'md-inst': (el) => { MOD.inst = el.dataset.id; MOD.q = ''; MOD.page = 1; modsReload(); },
	'md-link': async (el) => { await api('gb:link', MOD.inst, { id: el.dataset.id, name: el.dataset.name, icon: el.dataset.icon || null }); await refreshInstances(); modsReload(); },
	'md-unlink': async () => { await api('gb:link', MOD.inst, null); await refreshInstances(); modsReload(); },
	'md-gsearch': async () => { const q = ($('#md-gq') || {}).value || ''; if (!q.trim()) return; MOD.games = null; modsRender(); try { MOD.games = await api('gb:games', q); } catch (error) { toastError(error); MOD.games = []; } modsRender(); },
	'md-sort': (el) => { MOD.sort = el.dataset.v; MOD.q = ''; MOD.page = 1; MOD.list = null; modsRender(); modsLoad(); },
	'md-page': (el) => { MOD.page = Math.max(1, MOD.page + Number(el.dataset.d)); MOD.list = null; modsRender(); modsLoad(); const p = $('#page'); if (p) p.scrollTop = 0; },
	'md-open': el => openMod(el.dataset.id),
});
INPUTS['md-q'] = debounce((el) => { MOD.q = el.value.trim(); MOD.page = 1; MOD.list = null; $('#md-main').innerHTML = modsMain(); const i = $('[data-input="md-q"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } modsLoad(); }, 450);
