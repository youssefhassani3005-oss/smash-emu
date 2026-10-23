/* global state, icon, esc, render, setMain, PAGES, ACTIONS, INPUTS, consoleUi, sortInstances, isRunning, playTime, ago, sysInfo, chSys, chArt, lookOf, SYS_SHORT, $, $$ */
// Menus simplifiés de l'interface Console, sur le modèle des consoles de salon : paramètres en deux colonnes
// (catégories à gauche, une seule ouverte à droite) et bibliothèque en grandes tuiles avec un filtre par console.

// ---------- Paramètres ----------
const SET_GROUPS = [
	['apparence', 'Apparence', 'palette', ['Apparence']],
	['jeu', 'Jeu', 'gamepad-2', ['Émulateur', 'Lancement', 'Sauvegardes de jeu']],
	['emus', 'Émulateurs', 'cpu', ['Émulateurs externes', 'Consoles intégrées']],
	['profil', 'Profil et Discord', 'user', ['Joueur', 'Présence Discord']],
	['fichiers', 'Fichiers', 'folder-open', ['Jeux', 'Opera']],
	['systeme', 'Système', 'info', ['Mises à jour', 'À propos']],
];

const classicSettings = PAGES.settings;
PAGES.settings = (params) => {
	classicSettings(params);
	if (!consoleUi()) return;
	const wrap = $('#page .narrow');
	if (!wrap) return;
	const cards = $$(':scope > .card', wrap);
	const titleOf = c => ((c.querySelector('h3') || {}).textContent || '').trim();
	const groups = SET_GROUPS.map(([id, label, ic, titles]) => ({ id, label, ic, cards: cards.filter(c => titles.includes(titleOf(c))) })).filter(g => g.cards.length);
	const rest = cards.filter(c => !groups.some(g => g.cards.includes(c)));
	if (rest.length) groups.push({ id: 'autres', label: 'Autres', ic: 'settings', cards: rest });
	const cur = groups.some(g => g.id === state.ui.setGroup) ? state.ui.setGroup : groups[0].id;
	const two = document.createElement('div');
	two.className = 'cs-two';
	two.innerHTML = `<nav class="cs-cats">${groups.map(g => `<button class="cs-cat ${g.id === cur ? 'on' : ''}" data-action="set-group" data-g="${g.id}">${icon(g.ic)}<span>${g.label}</span></button>`).join('')}</nav><div class="cs-panel"></div>`;
	const panel = two.querySelector('.cs-panel');
	for (const g of groups) {
		const sec = document.createElement('section');
		sec.className = `cs-group ${g.id === cur ? 'on' : ''}`;
		sec.dataset.g = g.id;
		for (const c of g.cards) sec.appendChild(c);
		panel.appendChild(sec);
	}
	wrap.classList.add('cs-settings');
	wrap.appendChild(two);
};

ACTIONS['set-group'] = (el) => {
	state.ui.setGroup = el.dataset.g;
	$$('.cs-cat').forEach(b => b.classList.toggle('on', b === el));
	$$('.cs-group').forEach(s => s.classList.toggle('on', s.dataset.g === el.dataset.g));
	const page = $('#page');
	if (page) page.scrollTop = 0;
};

// ---------- Bibliothèque ----------
const clList = () => {
	const q = (state.ui.libQuery || '').toLowerCase();
	const sys = state.ui.libSys || 'all';
	return sortInstances(state.instances, state.ui.libSort || 'played')
		.filter(i => (sys === 'all' || chSys(i) === sys) && (!q || `${i.name} ${sysInfo(chSys(i)).label}`.toLowerCase().includes(q)));
};
const clItem = i => `<div class="cl-item ${isRunning(i.id) ? 'running' : ''}" data-action="open-instance" data-id="${esc(i.id)}">
	<div class="ch-tile" style="--sys:${lookOf(chSys(i))[0]}"><div class="ch-art">${chArt(i)}</div><span class="ch-sys">${esc(i.type === 'coopdx' ? 'COOP' : SYS_SHORT[chSys(i)] || chSys(i).toUpperCase())}</span>${isRunning(i.id) ? '<span class="ch-live">EN JEU</span>' : ''}
		<button class="cl-play" data-action="${isRunning(i.id) ? 'stop' : 'play'}" data-id="${esc(i.id)}" data-tip="${isRunning(i.id) ? 'Arrêter' : 'Jouer'}">${icon(isRunning(i.id) ? 'square' : 'play')}</button></div>
	<b>${esc(i.name)}</b><span>${i.playTimeMs ? `${esc(playTime(i.playTimeMs))} · ${esc(ago(i.lastPlayed))}` : 'Jamais lancé'}</span>
</div>`;
const clGrid = () => { const list = clList(); return list.length ? list.map(clItem).join('') : `<div class="empty">${icon('search')}<div>Aucun jeu ne correspond.</div></div>`; };

const classicLibrary = PAGES.library;
PAGES.library = (params) => {
	if (!consoleUi() || !state.instances.length) { classicLibrary(params); return; }
	const counts = {};
	for (const i of state.instances) counts[chSys(i)] = (counts[chSys(i)] || 0) + 1;
	const sys = counts[state.ui.libSys] ? state.ui.libSys : 'all';
	state.ui.libSys = sys;
	setMain(`<div class="cl-head">
			<h1>Bibliothèque <span class="muted">${state.instances.length}</span></h1>
			<div class="search">${icon('search')}<input class="input" data-input="cl-query" placeholder="Rechercher un jeu" value="${esc(state.ui.libQuery || '')}"></div>
			<select class="select" data-input="cl-sort">${[['played', 'Dernière partie'], ['name', 'Nom'], ['time', 'Temps de jeu'], ['created', 'Ajout']].map(([v, l]) => `<option value="${v}" ${(state.ui.libSort || 'played') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
			<button class="btn primary" data-action="new-instance">${icon('plus')}Ajouter</button>
		</div>
		<div class="chips cl-chips"><button class="chip ${sys === 'all' ? 'active' : ''}" data-action="cl-sys" data-v="all">Tout · ${state.instances.length}</button>${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([id, n]) => `<button class="chip ${sys === id ? 'active' : ''}" data-action="cl-sys" data-v="${id}"><i class="cl-dot" style="background:${lookOf(id)[0]}"></i>${esc(id === 'n64' && state.instances.some(i => i.type === 'coopdx') ? 'Nintendo 64 / Coop DX' : sysInfo(id).label)} · ${n}</button>`).join('')}</div>
		<div class="cl-grid" id="cl-grid">${clGrid()}</div>`);
};

ACTIONS['cl-sys'] = (el) => { state.ui.libSys = el.dataset.v; $$('.cl-chips .chip').forEach(c => c.classList.toggle('active', c === el)); $('#cl-grid').innerHTML = clGrid(); };
INPUTS['cl-query'] = (el) => { state.ui.libQuery = el.value; $('#cl-grid').innerHTML = clGrid(); };
INPUTS['cl-sort'] = (el) => { state.ui.libSort = el.value; $('#cl-grid').innerHTML = clGrid(); };
