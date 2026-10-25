// Accueils fidèles : chaque accueil reprend la mise en page d'un thème communautaire de frontend d'émulation
// (placement, tailles, typographie, effets, navigation), recréée en HTML et CSS d'après sa capture. Aucune image
// du thème d'origine n'est reprise : jaquettes et fonds des jeux du joueur, photos libres des consoles, et une image
// de fond que le joueur peut choisir (Accueil → Réglages). Styles : home-faithful.css.
// Chaque entrée : nav (row, list, grid, consoleRow : haut / bas = console, consoleList : gauche / droite = console),
// render(ctx) → HTML de l'accueil, info(jeu, ctx) → HTML de #ch-info, onSelect(jeu, racine, ctx) facultatif.
(function (root) {
	const LIST = [];
	const byId = {};
	const def = (o) => { LIST.push(o); byId[o.id] = o; };

	// Présentation courte de chaque console (accueils « Colorful » et « Workbench »).
	const ABOUT = {
		nes: 'La console 8 bits qui a relancé le jeu vidéo de salon au milieu des années 80, avec sa manette à croix directionnelle.',
		snes: 'La 16 bits des grands jeux de plateforme et de rôle, avec ses effets de rotation et de zoom (mode 7).',
		n64: 'La première console de la marque en 3D, avec son stick analogique et ses quatre ports de manette.',
		gb: 'La console portable monochrome qui a tenu des années sur quatre piles AA.',
		gbc: 'La suite en couleur de la portable monochrome, compatible avec ses cartouches.',
		gba: 'La portable 32 bits à écran large, véritable 16 bits de poche.',
		vb: 'Une console de salon en relief, rouge et noire, qu’on regarde comme une paire de jumelles.',
		nds: 'La portable à deux écrans, dont un tactile, avec micro et Wi-Fi.',
		gc: 'La petite console cubique aux mini-disques et à la manette aux boutons de tailles différentes.',
		wii: 'La console à télécommande à détection de mouvement, qui a fait jouer toute la famille.',
		'3ds': 'La portable à deux écrans dont l’écran du haut affiche la 3D sans lunettes.',
		wiiu: 'La console de salon à manette-tablette, avec un deuxième écran dans les mains.',
		switch: 'La console hybride : sur la télé ou en portable, avec deux manettes détachables.',
		psx: 'La console qui a popularisé le CD-ROM et la 3D sur les consoles de salon.',
		ps2: 'La console de salon la plus vendue de l’histoire, lecteur DVD compris.',
		psp: 'La portable aux disques UMD et au grand écran large.',
		ps3: 'La console haute définition au lecteur Blu-ray et au processeur Cell.',
		ps4: 'La console de salon de la génération 1080p, avec manette à pavé tactile.',
		sms: 'La 8 bits rivale de la NES, très populaire en Europe et au Brésil.',
		md: 'La 16 bits rapide, connue pour ses jeux d’arcade et son hérisson bleu.',
		gg: 'La portable en couleur et rétroéclairée, cousine de la Master System.',
		segacd: 'L’extension CD de la Mega Drive : vidéos, musique CD et jeux plus grands.',
		'32x': 'L’extension 32 bits de la Mega Drive, en forme de champignon.',
		saturn: 'La console 32 bits à deux processeurs, très forte en jeux d’arcade 2D.',
		pce: 'La petite console aux cartes HuCard, reine du shoot’em up.',
		a2600: 'La console qui a mis le jeu vidéo dans les salons, avec son joystick à un bouton.',
		a7800: 'La suite de l’Atari 2600, compatible avec ses jeux.',
		lynx: 'La première portable couleur rétroéclairée, qu’on peut retourner pour les gauchers.',
		jaguar: 'La console présentée comme la première 64 bits, avec sa manette à pavé numérique.',
		'3do': 'Une console multimédia CD conçue pour être fabriquée par plusieurs marques.',
		xbox: 'La première console de salon de Microsoft, avec disque dur intégré.',
		x360: 'La console HD de Microsoft, avec ses succès et le jeu en ligne.',
	};
	const about = s => ABOUT[s] || 'Une console de ta bibliothèque.';
	const clock = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
	const dateTime = () => new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
	const setBg = (rootEl, sel, url) => { const el = rootEl.querySelector(sel); if (el) el.style.backgroundImage = url ? `url("${url}")` : ''; };
	// Fond : image choisie par le joueur, sinon fond (ou jaquette) du jeu sélectionné.
	const bgOf = (c, i) => c.image || c.bg(i);
	const lastPlayed = (c, i) => (i.lastPlayed ? `Dernière partie ${c.ago(i.lastPlayed)}` : 'Jamais lancé');
	const meta = (c, i) => `${c.esc(c.sysLabel(c.sysOf(i)))} · ${i.playTimeMs ? `${c.esc(c.playTime(i.playTimeMs))} de jeu` : 'jamais lancé'}`;
	const pad = (b, label) => `<span class="f-pad"><b>${b}</b>${label}</span>`;
	// Tuile standard (classe f-tile, indice data-i) avec sa jaquette, ou le nom du jeu si elle n'en a pas.
	const coverTile = (c, i, idx, cls = '', text = false) => {
		const url = c.cover(i);
		return `<button class="f-tile ${cls} ${idx === c.sel ? 'sel' : ''}" data-action="ch-tile" data-i="${idx}">${url ? `<img src="${c.esc(url)}" alt="" loading="lazy">` : `<span class="f-noart" style="--h:${c.hue(i.name)}">${c.esc(text ? i.name : c.initials(i.name))}</span>`}</button>`;
	};
	const addTile = (c, cls = '') => `<button class="f-tile f-add ${cls} ${c.list.length === c.sel ? 'sel' : ''}" data-action="ch-tile" data-i="${c.list.length}">${c.icon('plus')}<span>Ajouter des jeux</span></button>`;

	// 1. gameOS : grand bandeau illustré, rangée des consoles, puis « Continuer à jouer » en tuiles larges.
	def({
		id: 'gameos', name: 'Façon gameOS', ref: 'gameOS', author: 'PlayingKarrde', src: 'Pegasus', nav: 'row', lead: 0,
		render: c => `<div class="go-hero"><div class="go-hero-bg"></div><div class="go-hero-shade"></div>
				<b class="go-brand">Smash Emu</b><button class="go-gear" data-action="ch-options">${c.icon('settings')}</button>
				<div class="go-hero-title" id="ch-info"></div>
				<div class="go-dots">${c.list.slice(0, 14).map((_, k) => `<i class="${k === c.sel ? 'on' : ''}"></i>`).join('')}</div></div>
			<div class="go-plats">${c.consoles.map(([s, n]) => `<div class="go-plat"><b>${c.esc(c.sysLabel(s))}</b><small>${n} jeu${n > 1 ? 'x' : ''}</small></div>`).join('')}</div>
			<div class="go-label">Continuer à jouer</div>
			<div class="ch-row-wrap go-wrap"><div class="ch-row" id="ch-row">${c.list.map((i, k) => coverTile(c, i, k, 'go-t')).join('')}${addTile(c, 'go-t')}</div></div>
			<div class="f-hints go-hints">${pad('A', 'Jouer')}${pad('≡', 'Réglages')}</div>`,
		info: (i, c) => `<b>${c.esc(i.name)}</b><span>${meta(c, i)}</span>`,
		onSelect: (i, r, c) => { setBg(r, '.go-hero-bg', i ? bgOf(c, i) : c.image); r.querySelectorAll('.go-dots i').forEach((d, k) => d.classList.toggle('on', k === c.sel)); },
	});

	// 2. Flixnet : texte du jeu en haut à gauche, illustration fondue à droite, une rangée par console.
	def({
		id: 'flixnet', name: 'Façon Flixnet', ref: 'Flixnet', author: 'mmatyas', src: 'Pegasus', nav: 'consoleRow', lead: 0,
		render: (c) => {
			const k = c.consoles.findIndex(([s]) => s === c.console);
			const next = [...c.consoles.slice(k + 1), ...c.consoles.slice(0, k)].slice(0, 2);
			const shelf = ([s]) => `<div class="fx-label">${c.esc(c.sysLabel(s))}</div><div class="fx-static">${c.all.filter(i => c.sysOf(i) === s).slice(0, 8).map(i => `<button class="fx-st" data-action="ch-console" data-sys="${c.esc(s)}">${c.cover(i) ? `<img src="${c.esc(c.cover(i))}" alt="">` : `<span class="f-noart" style="--h:${c.hue(i.name)}">${c.esc(i.name)}</span>`}</button>`).join('')}</div>`;
			return `<div class="fx-art"></div><div class="fx-text" id="ch-info"></div>
				<div class="fx-shelves"><div class="fx-label on">${c.esc(c.sysLabel(c.console))}</div>
				<div class="ch-row-wrap fx-wrap"><div class="ch-row" id="ch-row">${c.list.map((i, n) => coverTile(c, i, n, 'fx-t', true)).join('')}${addTile(c, 'fx-t')}</div></div>
				${next.map(shelf).join('')}</div>`;
		},
		info: (i, c) => `<h1>${c.esc(i.name)}</h1><div class="fx-meta"><span class="fx-stars">${'★'.repeat(Math.min(5, 1 + Math.floor((i.playTimeMs || 0) / 3600000)))}${'☆'.repeat(Math.max(0, 4 - Math.floor((i.playTimeMs || 0) / 3600000)))}</span>${c.esc(c.sysLabel(c.sysOf(i)))}</div>
			<p>${c.esc(about(c.sysOf(i)))} ${i.playTimeMs ? `Tu y as joué ${c.esc(c.playTime(i.playTimeMs))}.` : 'Tu n’y as pas encore joué.'} ${c.esc(lastPlayed(c, i))}.</p>`,
		onSelect: (i, r, c) => setBg(r, '.fx-art', i ? bgOf(c, i) : c.image),
	});

	// 3. Barre croisée : consoles en icônes sur une ligne, jeux en liste verticale sous l'icône choisie.
	def({
		id: 'xmb', name: 'Barre croisée', ref: 'XrossMediaBar', author: 'Lx-Dm', src: 'Pegasus', nav: 'consoleList',
		render: c => `<div class="xm-bg"></div><div class="xm-top"><span>${c.esc(c.sysLabel(c.console))}</span><b>${dateTime()}</b></div>
			<div class="xm-icons">${c.consoles.map(([s]) => `<button class="xm-ic ${s === c.console ? 'on' : ''}" data-action="ch-console" data-sys="${c.esc(s)}"><img src="${c.photo(s)}" alt=""></button>`).join('')}</div>
			<div class="xm-list-wrap"><div class="ch-mlist xm-list" id="ch-mlist">${c.list.map((i, k) => `<button class="f-tile xm-it ${k === c.sel ? 'sel' : ''}" data-action="ch-tile" data-i="${k}"><span class="xm-th">${c.cover(i) ? `<img src="${c.esc(c.cover(i))}" alt="">` : ''}</span><span class="xm-tx"><b>${c.esc(i.name)}</b><small>${c.esc(lastPlayed(c, i))}</small></span></button>`).join('')}<button class="f-tile xm-it ${c.list.length === c.sel ? 'sel' : ''}" data-action="ch-tile" data-i="${c.list.length}"><span class="xm-th">${c.icon('plus')}</span><span class="xm-tx"><b>Ajouter des jeux</b></span></button></div></div>
			<div id="ch-info" hidden></div>`,
		onSelect: (i, r, c) => setBg(r, '.xm-bg', i ? bgOf(c, i) : c.image),
	});

	// 4. skylineOS : accueil sombre façon console hybride, titre bleu au-dessus de la rangée, boutons ronds.
	def({
		id: 'skyline', name: 'Façon skylineOS', ref: 'skylineOS', author: 'RBertoCases', src: 'Pegasus', nav: 'row', lead: 1,
		render: c => `<div class="sl-top"><span class="sl-avatar">${c.esc(String(c.player).slice(0, 1).toUpperCase())}</span><span class="sl-time">${clock()}<i class="sl-bat"></i></span></div>
			<div class="sl-title" id="ch-info"></div>
			<div class="ch-row-wrap sl-wrap"><div class="ch-row" id="ch-row">${c.list.map((i, k) => coverTile(c, i, k, 'sl-t')).join('')}${addTile(c, 'sl-t')}<button class="sl-all" data-action="nav" data-to="library">${c.icon('layout-grid')}</button></div></div>
			<div class="sl-round"><button data-action="ch-options" data-tip="Réglages de l’accueil">${c.icon('moon')}</button><button data-action="nav" data-to="settings" data-tip="Paramètres">${c.icon('sun')}</button></div>
			<div class="sl-foot"><span class="sl-sys">${c.icon('gamepad-2')}</span><span class="sl-hints">${pad('X', 'Détails')}${pad('A', 'OK')}</span></div>`,
		info: i => (i ? `${i.name.replace(/[<>&]/g, '')}` : ''),
	});

	// 5. Revolution Menu : chaînes arrondies sur fond rayé clair, barre grise incurvée et nom de la console.
	def({
		id: 'revolution', name: 'Façon Revolution Menu', ref: 'Revolution Menu', author: 'travrei', src: 'Pegasus', nav: 'grid', grid: { cols: 4, per: 12 },
		render: (c) => {
			const per = 12;
			const pages = Math.max(1, Math.ceil((c.list.length + 1) / per));
			const page = Math.floor(c.sel / per);
			return `<div class="rv-vp ch-viewport"><div class="ch-pages" id="ch-pages" style="transform:translateX(${-page * 100}%)">${Array.from({ length: pages }, (_, p) => `<div class="ch-page"><div class="ch-grid rv-grid">${Array.from({ length: per }, (__, k) => {
				const idx = p * per + k;
				if (idx < c.list.length) return coverTile(c, c.list[idx], idx, 'rv-t', true);
				if (idx === c.list.length) return addTile(c, 'rv-t');
				return '<div class="rv-empty"></div>';
			}).join('')}</div></div>`).join('')}</div></div>
			<div class="rv-bar"><svg viewBox="0 0 1000 120" preserveAspectRatio="none"><path class="fill" d="M0 10 H170 C230 10 240 75 330 75 H670 C760 75 770 10 830 10 H1000 V120 H0 Z" /><path class="line" d="M0 10 H170 C230 10 240 75 330 75 H670 C760 75 770 10 830 10 H1000" /></svg><b class="rv-sys" id="ch-info"></b></div>`;
		},
		info: (i, c) => c.esc(c.sysLabel(c.sysOf(i))).toUpperCase(),
	});

	// 6. Liste minimale : grands noms blancs sur noir, pastille blanche sur l'élément choisi.
	def({
		id: 'analogue', name: 'Liste minimale', ref: 'Analogue OS Menu', author: 'communauté ES-DE', src: 'ES-DE', nav: 'list',
		render: c => `<div class="an-wrap"><div class="ch-mlist an-list" id="ch-mlist">${c.list.map((i, k) => `<button class="f-tile an-it ${k === c.sel ? 'sel' : ''}" data-action="ch-tile" data-i="${k}">${c.esc(i.name)}</button>`).join('')}<button class="f-tile an-it ${c.list.length === c.sel ? 'sel' : ''}" data-action="ch-tile" data-i="${c.list.length}">Ajouter des jeux</button></div></div>
			<div class="an-hints">${pad('≡', 'Menu')}${pad('A', 'Jouer')}${pad('X', 'Détails')}${pad('✚', 'Choisir')}</div><div id="ch-info" hidden></div>`,
	});

	// 7. Art Book : bandes inclinées aux images des jeux, grand nom de la console au centre, aides en bas.
	def({
		id: 'artbook', name: 'Façon Art Book', ref: 'Art Book Next', author: 'anthonycaccese', src: 'ES-DE', nav: 'consoleRow', center: true,
		render: c => `<div class="ch-row-wrap ab-wrap"><div class="ch-row" id="ch-row">${c.list.map((i, k) => `<button class="f-tile ab-s ${k === c.sel ? 'sel' : ''}" data-action="ch-tile" data-i="${k}" style="--h:${c.hue(i.name)}${c.bg(i) ? `;background-image:url('${c.esc(c.bg(i))}')` : ''}"></button>`).join('')}<button class="f-tile ab-s f-add ${c.list.length === c.sel ? 'sel' : ''}" data-action="ch-tile" data-i="${c.list.length}">${c.icon('plus')}</button></div></div>
			<div class="ab-center"><b>${c.esc(c.sysLabel(c.console))}</b><div id="ch-info"></div></div>
			<div class="ab-status">${c.icon('wifi')}<span>${clock()}</span></div>
			<div class="ab-hints">${pad('≡', 'MENU')}${pad('A', 'JOUER')}${pad('X', 'DÉTAILS')}${pad('✚', 'CHOISIR')}</div>`,
		info: (i, c) => c.esc(i.name),
	});

	// 8. Workbench : bureau rétro bleu, fenêtres à barres rayées, carrousel de noms au centre.
	def({
		id: 'workbench', name: 'Façon Workbench', ref: 'Amiga Workbench', author: 'LeeBigelow', src: 'Pegasus', nav: 'consoleRow', center: true,
		render: c => `<div class="wb-bar"><b>Smash Emu - Workbench.</b><span>${c.esc(c.sysLabel(c.console).toLowerCase())} : ${c.list.length} JEUX</span><i></i><i></i></div>
			<div class="wb-win wb-console"><div class="wb-t"><i></i><b>Console</b><s></s><i></i><i></i></div><div class="wb-b"><img src="${c.photo(c.console)}" alt=""></div></div>
			<div class="wb-win wb-cover"><div class="wb-t"><i></i><b>Jaquette</b><s></s><i></i><i></i></div><div class="wb-b" id="wb-cover"></div></div>
			<div class="wb-icons"><button data-action="nav" data-to="library">${c.icon('save')}<span>BIBLIO</span></button><button data-action="nav" data-to="mods">${c.icon('package')}<span>MODS</span></button></div>
			<div class="wb-win wb-sys"><div class="wb-t"><i></i><b>Jeux</b><s></s><i></i><i></i></div><div class="wb-b ch-row-wrap wb-wrap"><div class="ch-row" id="ch-row">${c.list.map((i, k) => `<button class="f-tile wb-n ${k === c.sel ? 'sel' : ''}" data-action="ch-tile" data-i="${k}">${c.esc(i.name)}</button>`).join('')}<button class="f-tile wb-n ${c.list.length === c.sel ? 'sel' : ''}" data-action="ch-tile" data-i="${c.list.length}">+ Ajouter</button></div></div><div class="wb-scroll"></div></div>
			<div class="wb-win wb-info"><div class="wb-t"><i></i><b>Infos</b><s></s><i></i><i></i></div><div class="wb-b" id="ch-info"></div></div>
			<div class="wb-hints">${pad('✚', 'Changer de console')}${pad('A', 'Jouer')}${pad('≡', 'Réglages')}</div>`,
		info: (i, c) => {
			const s = c.sysOf(i);
			const si = c.sysInfo(s) || {};
			return [['Jeu', i.name], ['Console', c.sysLabel(s)], ['Fabricant', si.maker || '—'], ['Sortie', si.year || '—'], ['Temps de jeu', i.playTimeMs ? c.playTime(i.playTimeMs) : '—'], ['Dernière partie', i.lastPlayed ? c.ago(i.lastPlayed) : 'jamais']].map(([k, v]) => `<div><span>${k} :</span> ${c.esc(v)}</div>`).join('');
		},
		onSelect: (i, r, c) => { const box = r.querySelector('#wb-cover'); if (box) box.innerHTML = i && c.cover(i) ? `<img src="${c.esc(c.cover(i))}" alt="">` : ''; },
	});

	// 9. Clean Covers : fond flouté, titre en haut à gauche, carrousel de jaquettes verticales centré.
	def({
		id: 'covers', name: 'Façon Clean Covers', ref: 'Clean Covers', author: 'mlumeau', src: 'Pegasus', nav: 'row', center: true,
		render: c => `<div class="cc-bg"></div><div class="cc-head" id="ch-info"></div><div class="cc-sort">Tous les jeux · Trié par ${c.icon('clock')} dernière partie</div>
			<div class="ch-row-wrap cc-wrap"><div class="ch-row" id="ch-row">${c.list.map((i, k) => coverTile(c, i, k, 'cc-t', true)).join('')}${addTile(c, 'cc-t')}</div></div>
			<div class="cc-bar"><i></i></div>
			<div class="cc-hints">${pad('A', 'Lancer')}${pad('B', 'Retour')}${pad('X', 'Détails')}${pad('Y', 'Options')}${pad('LB / RB', 'Pages')}${pad('✚', 'Naviguer')}</div>`,
		info: (i, c) => `<h1>${c.esc(i.name)}</h1><span>Temps de jeu : ${i.playTimeMs ? c.esc(c.playTime(i.playTimeMs)) : '0 min'} · ${c.esc(lastPlayed(c, i))}</span>`,
		onSelect: (i, r, c) => {
			setBg(r, '.cc-bg', i ? bgOf(c, i) : c.image);
			const bar = r.querySelector('.cc-bar i');
			if (bar) { const n = c.list.length + 1; bar.style.width = `${100 / n}%`; bar.style.left = `${(c.sel / n) * 100}%`; }
		},
	});

	// 10. Colorful : présentation de la console à gauche, sa photo sur un grand aplat coloré à droite.
	def({
		id: 'colorful', name: 'Façon Colorful', ref: 'Colorful', author: 'RobZombie9043', src: 'Pegasus', nav: 'consoleRow', lead: 0,
		render: (c) => {
			const s = c.console;
			const si = c.sysInfo(s) || {};
			const total = c.list.reduce((a, i) => a + (i.playTimeMs || 0), 0);
			return `<div class="co" style="--co:${c.look(s)[0]}">
				<div class="co-left"><div class="co-maker">${c.esc(String(si.maker || '').toUpperCase())}${si.year ? ` • ${si.year}` : ''}</div>
					<h1>${c.esc(c.sysLabel(s))}</h1><p>${c.esc(about(s))}</p>
					<div class="co-stats"><div>${c.icon('gamepad-2')}<b>${c.list.length}</b><span>Jeux</span></div><div>${c.icon('clock')}<b>${total ? c.esc(c.playTime(total)) : '0'}</b><span>Temps de jeu</span></div><button class="co-press" data-action="ch-play">JOUER <i>A</i></button></div>
					<div class="ch-row-wrap co-wrap"><div class="ch-row" id="ch-row">${c.list.map((i, k) => coverTile(c, i, k, 'co-t')).join('')}${addTile(c, 'co-t')}</div></div>
					<div class="co-game" id="ch-info"></div></div>
				<div class="co-right"><img src="${c.photo(s)}" alt=""></div>
				<div class="co-arrows"><button data-action="ch-console-step" data-d="-1">${c.icon('chevron-up')}</button><button data-action="ch-console-step" data-d="1">${c.icon('chevron-down')}</button></div></div>`;
		},
		info: (i, c) => `<b>${c.esc(i.name)}</b> · ${c.esc(lastPlayed(c, i))}`,
	});

	// Grille par pages (navigation « grid » ou « consoleGrid ») : tuile par jeu, puis « Ajouter », puis cases vides.
	const gridPages = (c, per, tile, empty = '<div class="f-empty"></div>', cls = '') => {
		const pages = Math.max(1, Math.ceil((c.list.length + 1) / per));
		const page = Math.floor(c.sel / per);
		return `<div class="ch-pages" id="ch-pages" style="transform:translateX(${-page * 100}%)">${Array.from({ length: pages }, (_, p) => `<div class="ch-page"><div class="ch-grid ${cls}">${Array.from({ length: per }, (__, k) => {
			const idx = p * per + k;
			if (idx < c.list.length) return tile(c.list[idx], idx);
			if (idx === c.list.length) return addTile(c, 'f-gt');
			return empty;
		}).join('')}</div></div>`).join('')}</div>`;
	};
	// Lettres découpées façon demande de rançon (accueil « Rebelle »).
	const ransom = s => [...String(s)].map((ch, k) => (ch === ' ' ? '<i class="rs-sp"></i>' : `<b class="rs-${k % 4}">${ch.replace(/[<>&]/g, '')}</b>`)).join('');

	// 11. Verre : grand panneau de verre dépoli sur ton image, rangée de jeux carrés et boutons ronds colorés.
	def({
		id: 'verre', name: 'Accueil vitré', ref: 'Thème Switch « verre dépoli »', author: 'communauté Themezer', src: 'Switch', nav: 'row', lead: 0,
		render: c => `<div class="vr-bg"></div><div class="vr-panel">
				<div class="vr-head"><span class="vr-chip">${c.icon('user')}</span><div class="vr-logo"><small>SMASH</small><b>EMU</b></div><span class="vr-time">${clock()}</span></div>
				<div class="vr-lbl">${c.icon('layout-grid')} Tous les jeux</div>
				<div class="ch-row-wrap vr-wrap"><div class="ch-row" id="ch-row">${c.list.map((i, k) => coverTile(c, i, k, 'vr-t')).join('')}${addTile(c, 'vr-t')}</div></div>
				<div class="vr-name" id="ch-info"></div>
				<div class="vr-dock">${[['users', 'friends', '#4ec26b'], ['store', 'shop', '#e8453c'], ['puzzle', 'mods', '#f5b51b'], ['image', 'library', '#2fa6f2'], ['trophy', 'trophies', '#9b6cf0'], ['settings', 'settings', '#8a8f99']].map(([ic, to, col]) => `<button data-action="nav" data-to="${to}" style="--b:${col}">${c.icon(ic)}</button>`).join('')}</div>
				<div class="vr-hints">${pad('≡', 'Options')}${pad('A', 'Jouer')}</div></div>`,
		info: (i, c) => c.esc(i.name),
		onSelect: (i, r, c) => setBg(r, '.vr-bg', c.image || (i ? c.bg(i) : '')),
	});

	// 12. Rebelle : rouge et noir à bandes, jaquettes inclinées à bord blanc, titre en lettres découpées.
	def({
		id: 'rebelle', name: 'Rouge rebelle', ref: 'Thème Switch rouge et noir façon RPG stylé', author: 'communauté Themezer', src: 'Switch', nav: 'grid', grid: { cols: 4, per: 12 },
		render: c => `<div class="rb-bg"></div><div class="rb-slash"></div><div class="rb-img"></div>
			<div class="rb-vp ch-viewport">${gridPages(c, 12, (i, k) => coverTile(c, i, k, 'f-gt rb-t', true), '<div class="f-empty rb-e"></div>', 'rb-grid')}</div>
			<div class="rb-title" id="ch-info"></div>
			<div class="rb-hints">${pad('A', 'Jouer')}${pad('X', 'Détails')}${pad('Y', 'Options')}</div>`,
		info: (i, c) => `<div class="rs">${ransom(i.name)}</div><small>${c.esc(c.sysLabel(c.sysOf(i)))}</small>`,
		onSelect: (i, r, c) => setBg(r, '.rb-img', c.image),
	});

	// 13. Cartes de jeu : boîtiers à bandeau rouge sur fond métal brossé, nom en capitales sous la rangée.
	def({
		id: 'cartes', name: 'Boîtiers de jeu', ref: 'Thème Switch « boîtiers »', author: 'communauté Themezer', src: 'Switch', nav: 'row', lead: 0,
		render: c => `<div class="ct-bg"></div><div class="ct-top"><span class="ct-ava">${c.esc(String(c.player).slice(0, 1).toUpperCase())}</span><span class="ct-lbl">${c.icon('layout-grid')} Tout afficher</span><span class="ct-time">${clock()}</span></div>
			<div class="ch-row-wrap ct-wrap"><div class="ch-row" id="ch-row">${c.list.map((i, k) => `<button class="f-tile ct-t ${k === c.sel ? 'sel' : ''}" data-action="ch-tile" data-i="${k}"><span class="ct-band">${c.esc(c.sysLabel(c.sysOf(i)).toUpperCase())}</span><span class="ct-art">${c.cover(i) ? `<img src="${c.esc(c.cover(i))}" alt="">` : `<span class="f-noart" style="--h:${c.hue(i.name)}">${c.esc(i.name)}</span>`}</span></button>`).join('')}${addTile(c, 'ct-t')}</div></div>
			<div class="ct-name" id="ch-info"></div>
			<div class="ct-dock">${['users', 'store', 'puzzle', 'image', 'settings'].map((ic, k) => `<button data-action="nav" data-to="${['friends', 'shop', 'mods', 'library', 'settings'][k]}">${c.icon(ic)}</button>`).join('')}</div>
			<div class="ct-hints">${pad('≡', 'Options')}${pad('A', 'Jouer')}</div>`,
		info: (i, c) => c.esc(i.name.toUpperCase()),
	});

	// 14. Grande carte : la carte choisie en grand avec un halo violet, les suivantes plus petites.
	def({
		id: 'grande', name: 'Grande carte', ref: 'Thème Switch sombre « grande carte »', author: 'communauté Themezer', src: 'Switch', nav: 'row', lead: 0,
		render: c => `<div class="gc-top"><span class="gc-who">${c.icon('user')} ${c.esc(c.player)}</span><span>${clock()} · 100 %</span></div>
			<div class="ch-row-wrap gc-wrap"><div class="ch-row" id="ch-row">${c.list.map((i, k) => `<button class="f-tile gc-t ${k === c.sel ? 'sel' : ''}" data-action="ch-tile" data-i="${k}"><span class="gc-band">${c.esc(c.sysLabel(c.sysOf(i)))}</span><span class="gc-art">${c.cover(i) ? `<img src="${c.esc(c.cover(i))}" alt="">` : `<span class="f-noart" style="--h:${c.hue(i.name)}">${c.esc(i.name)}</span>`}</span><span class="gc-cap">${c.esc(i.name)}</span></button>`).join('')}${addTile(c, 'gc-t')}</div></div>
			<div class="gc-icons">${c.list.slice(0, 12).map(i => `<span style="--h:${c.hue(i.name)}">${c.cover(i) ? `<img src="${c.esc(c.cover(i))}" alt="">` : ''}</span>`).join('')}</div>
			<div class="gc-dock">${['message-circle', 'store', 'image', 'gamepad-2', 'settings', 'power'].map(ic => `<i>${c.icon(ic)}</i>`).join('')}</div>
			<div id="ch-info" hidden></div>`,
	});

	// 15. Nuit étoilée : ciel noir étoilé, rangée d'icônes rondes en haut, nuages d'encre en bas.
	def({
		id: 'etoiles', name: 'Nuit étoilée', ref: 'Thème Switch « ciel d’encre »', author: 'communauté Themezer', src: 'Switch', nav: 'row', lead: 0,
		render: c => `<div class="et-sky"></div><div class="et-img"></div>
			<div class="ch-row-wrap et-wrap"><div class="ch-row" id="ch-row"><span class="et-me">${c.esc(String(c.player).slice(0, 1).toUpperCase())}</span>${c.list.map((i, k) => coverTile(c, i, k, 'et-t')).join('')}${addTile(c, 'et-t')}</div></div>
			<div class="et-name" id="ch-info"></div>
			<svg class="et-clouds" viewBox="0 0 1200 220" preserveAspectRatio="none"><path d="M0 120 C80 60 160 150 240 90 S400 40 470 110 S620 170 700 100 S860 30 940 100 S1100 160 1200 80 V220 H0 Z" /><path class="b" d="M0 170 C100 120 200 190 320 140 S520 110 600 160 S800 200 900 150 S1100 120 1200 160 V220 H0 Z" /></svg>`,
		info: (i, c) => `<b>${c.esc(i.name)}</b><span>${meta(c, i)}</span>`,
		onSelect: (i, r, c) => setBg(r, '.et-img', c.image),
	});

	// 16. Tous les logiciels : illustration à gauche, panneau sombre arrondi avec une grille d'icônes.
	def({
		id: 'logiciels', name: 'Tous les logiciels', ref: 'Thème Switch « montgolfière »', author: 'communauté Themezer', src: 'Switch', nav: 'grid', grid: { cols: 6, per: 24 },
		render: c => `<div class="lg-bg"></div><div class="lg-panel"><div class="lg-head">${pad('L', 'Groupes')}${pad('R', 'Trier / filtrer')}</div>
				<div class="lg-vp ch-viewport">${gridPages(c, 24, (i, k) => coverTile(c, i, k, 'f-gt lg-t'), '<div class="f-empty lg-e"></div>', 'lg-grid')}</div></div>
			<div class="lg-foot"><span>${c.icon('layout-grid')} Tous les jeux</span><span class="lg-name" id="ch-info"></span><span>${pad('≡', 'Options')}${pad('B', 'Retour')}${pad('A', 'Jouer')}</span></div>`,
		info: (i, c) => c.esc(i.name),
		onSelect: (i, r, c) => setBg(r, '.lg-bg', c.image || (i ? c.bg(i) : '')),
	});

	// 17. Vitrine : grand aplat de couleur, fabricant et années, nom de la console, sa photo, barre blanche en bas.
	def({
		id: 'vitrine', name: 'Vitrine de console', ref: 'Retro Mega Next', author: 'plaidman', src: 'Pegasus', nav: 'consoleRow', lead: 0,
		render: (c) => {
			const s = c.console;
			const si = c.sysInfo(s) || {};
			const k = c.consoles.findIndex(([x]) => x === s);
			return `<div class="vt" style="--vt:${c.look(s)[0]}"><div class="vt-sheen"></div>
				<div class="vt-top"><span class="vt-chip">${c.icon('list-filter')} titre</span><span>${clock()}</span><i class="sl-bat"></i></div>
				<div class="vt-text"><small>${c.esc(String(si.maker || '').toUpperCase())}${si.year ? ` • ${si.year}` : ''}</small><h1>${c.esc(c.sysLabel(s))}</h1><span>${c.list.length} jeu${c.list.length > 1 ? 'x' : ''}</span></div>
				<div class="vt-photo"><img src="${c.photo(s)}" alt=""></div>
				<div class="ch-row-wrap vt-wrap"><div class="ch-row" id="ch-row">${c.list.map((i, n) => coverTile(c, i, n, 'vt-t')).join('')}${addTile(c, 'vt-t')}</div></div>
				<div class="vt-game" id="ch-info"></div>
				<div class="vt-dots">${c.consoles.map((_, n) => `<i class="${n === k ? 'on' : ''}"></i>`).join('')}</div>
				<div class="vt-bar">${pad('A', 'Jouer')}${pad('B', 'Menu')}${pad('X', 'Détails')}${pad('↕', 'Console')}<span class="vt-count">${k + 1} sur ${c.consoles.length}</span></div></div>`;
		},
		info: (i, c) => c.esc(i.name),
	});

	// 18. Mur de jaquettes : consoles en colonne à gauche, grandes jaquettes en grille, cadre blanc légendé.
	def({
		id: 'mur', name: 'Mur de jaquettes', ref: 'Nostalgia Grid', author: 'ZagonAb', src: 'Pegasus', nav: 'consoleGrid', grid: { cols: 4, per: 16 },
		render: c => `<div class="mu-side">${c.consoles.map(([s]) => `<button class="${s === c.console ? 'on' : ''}" data-action="ch-console" data-sys="${c.esc(s)}">${c.esc(c.sysLabel(s).toUpperCase())}</button>`).join('')}</div>
			<div class="mu-vp ch-viewport">${gridPages(c, 16, (i, k) => `<button class="f-tile f-gt mu-t ${k === c.sel ? 'sel' : ''}" data-action="ch-tile" data-i="${k}">${c.cover(i) ? `<img src="${c.esc(c.cover(i))}" alt="">` : `<span class="f-noart" style="--h:${c.hue(i.name)}">${c.esc(i.name)}</span>`}<span class="mu-cap">${c.esc(i.name)}</span></button>`, '<div class="f-empty mu-e"></div>', 'mu-grid')}</div>
			<div class="mu-hints">${pad('B', 'Sortir')}${pad('X', 'Détails')}${pad('LB / RB', 'Console')}${pad('A', 'Jouer')}</div><div id="ch-info" hidden></div>`,
	});

	// 19. Tableau : liste en tableur gris clair, filtres en haut, colonnes triées.
	def({
		id: 'tableur', name: 'Tableau', ref: 'Secretary', author: 'mmatyas', src: 'Pegasus', nav: 'list',
		render: c => `<div class="tb-filters"><div><span>▼</span><b>Le nom contient :</b><i>(tous)</i></div>
				<div><span></span><b>Consoles :</b>${c.consoles.map(([s]) => `<em>${c.esc(c.sysLabel(s))}</em>`).join('')}</div>
				<div><span></span><b>Temps de jeu :</b><i>(depuis 0 min)</i><i>(jusqu’à tout)</i></div></div>
			<div class="tb-head"><span>#</span><span>Titre ▲</span><span>Console</span><span>Temps de jeu</span><span>Dernière partie</span><span>Fav.</span></div>
			<div class="tb-wrap"><div class="ch-mlist tb-list" id="ch-mlist">${c.list.map((i, k) => `<button class="f-tile tb-r ${k === c.sel ? 'sel' : ''}" data-action="ch-tile" data-i="${k}"><span>${k + 1}</span><span>${c.esc(i.name)}</span><span>${c.esc(c.sysLabel(c.sysOf(i)))}</span><span>${i.playTimeMs ? c.esc(c.playTime(i.playTimeMs)) : ''}</span><span>${i.lastPlayed ? c.esc(new Date(i.lastPlayed).toLocaleDateString('fr-FR')) : ''}</span><span>${i.playTimeMs > 3600000 ? '★' : '☆'}</span></button>`).join('')}<button class="f-tile tb-r ${c.list.length === c.sel ? 'sel' : ''}" data-action="ch-tile" data-i="${c.list.length}"><span>+</span><span>Ajouter des jeux</span><span></span><span></span><span></span><span></span></button></div></div><div id="ch-info" hidden></div>`,
	});

	// 20. Vapeur : grande illustration en haut, titre et année, rangée de jeux, onglets de consoles soulignés.
	def({
		id: 'vapeur', name: 'Façon Vapour', ref: 'Vapour', author: 'ZagonAb', src: 'Pegasus', nav: 'consoleRow', center: true,
		render: c => `<div class="vp-bg"></div><div class="vp-shade"></div><div class="vp-top">${c.icon('layout-grid')}<span class="vp-me">${c.esc(String(c.player).slice(0, 1).toUpperCase())}</span><span>${clock()}</span></div>
			<div class="vp-title" id="ch-info"></div>
			<div class="ch-row-wrap vp-wrap"><div class="ch-row" id="ch-row">${c.list.map((i, k) => coverTile(c, i, k, 'vp-t', true)).join('')}${addTile(c, 'vp-t')}</div></div>
			<div class="vp-tabs">${c.consoles.map(([s]) => `<button class="${s === c.console ? 'on' : ''}" data-action="ch-console" data-sys="${c.esc(s)}">${c.esc(c.sysLabel(s))}</button>`).join('')}</div>
			<div class="vp-hints">${pad('A', 'Voir le jeu')}${pad('X', 'Détails')}${pad('↕', 'Console')}${pad('Y', 'Options')}${pad('B', 'Retour')}</div>`,
		info: (i, c) => `<h1>${c.esc(i.name)}</h1><div><span>${c.esc(c.sysLabel(c.sysOf(i)))}</span><span>${(c.sysInfo(c.sysOf(i)) || {}).year || ''}</span><span class="vp-stars">${'★'.repeat(Math.min(5, 1 + Math.floor((i.playTimeMs || 0) / 3600000)))}<s>${'★'.repeat(Math.max(0, 4 - Math.floor((i.playTimeMs || 0) / 3600000)))}</s></span></div>`,
		onSelect: (i, r, c) => setBg(r, '.vp-bg', i ? bgOf(c, i) : c.image),
	});

	// Rangée simple de tuiles, réutilisée par plusieurs accueils.
	const row = (c, cls, text = false) => `<div class="ch-row" id="ch-row">${c.list.map((i, k) => coverTile(c, i, k, cls, text)).join('')}${addTile(c, cls)}</div>`;
	const rowWrap = (c, wrap, cls, text = false) => `<div class="ch-row-wrap ${wrap}">${row(c, cls, text)}</div>`;
	const listRows = (c, cls, inner) => `<div class="ch-mlist" id="ch-mlist">${c.list.map((i, k) => `<button class="f-tile ${cls} ${k === c.sel ? 'sel' : ''}" data-action="ch-tile" data-i="${k}">${inner(i, k)}</button>`).join('')}<button class="f-tile ${cls} ${c.list.length === c.sel ? 'sel' : ''}" data-action="ch-tile" data-i="${c.list.length}">${inner(null, c.list.length)}</button></div>`;
	const nameOr = i => (i ? i.name : '+ Ajouter des jeux');
	const fmtDate = t => (t ? new Date(t).toLocaleDateString('fr-FR') : '—');

	// 21. Arcade : tuiles de consoles en haut, « Continuer à jouer » avec cadre orange et pastille, rangées en dessous.
	def({
		id: 'bartop', name: 'Borne d’arcade', ref: 'bartopOS', author: 'r3tro80', src: 'Pegasus', nav: 'row', lead: 0,
		render: c => `<div class="bt-plats">${c.consoles.slice(0, 6).map(([s]) => `<div>${c.esc(c.sysLabel(s))}</div>`).join('')}</div><button class="bt-gear" data-action="ch-options">${c.icon('settings')}</button>
			<div class="bt-lbl">Continuer à jouer</div>${rowWrap(c, 'bt-wrap', 'bt-t', true)}<div class="bt-cap" id="ch-info"></div>
			<div class="bt-lbl bt-l2">Favoris</div><div class="bt-static">${c.all.slice(0, 8).map(i => `<span>${c.cover(i) ? `<img src="${c.esc(c.cover(i))}" alt="">` : `<span class="f-noart" style="--h:${c.hue(i.name)}">${c.esc(i.name)}</span>`}</span>`).join('')}</div>
			<div class="bt-hints">${pad('A', 'Choisir')}${pad('≡', 'Réglages')}</div>`,
		info: (i, c) => c.esc(i.name),
	});

	// 22. Grand écran : barre de recherche, « Jeux récents » avec la première tuile large, rangée « Recommandés ».
	def({
		id: 'bigscreen', name: 'Grand écran', ref: 'BigScreenFE', author: 'ZagonAb', src: 'Pegasus', nav: 'row', lead: 0,
		render: c => `<div class="bs-bg"></div><div class="bs-top"><span>${c.icon('search')} Rechercher un jeu…</span><b>${clock()}</b></div>
			<h2 class="bs-h">Jeux récents</h2>${rowWrap(c, 'bs-wrap', 'bs-t')}<div class="bs-cap" id="ch-info"></div>
			<h2 class="bs-h bs-h2">Recommandés</h2><div class="bs-static">${c.all.slice(-6).map(i => `<span style="--h:${c.hue(i.name)}">${c.bg(i) ? `<img src="${c.esc(c.bg(i))}" alt="">` : ''}</span>`).join('')}</div>
			<div class="bs-foot"><b>SMASH EMU</b>${pad('X', 'FAVORI')}${pad('A', 'CHOISIR')}${pad('B', 'QUITTER')}</div>`,
		info: (i, c) => `<b>${c.esc(i.name)}</b><small>▶ ${i.playTimeMs ? c.esc(c.playTime(i.playTimeMs)) : 'jamais lancé'}</small>`,
		onSelect: (i, r, c) => setBg(r, '.bs-bg', i ? bgOf(c, i) : c.image),
	});

	// 23. Collection : barre latérale des consoles avec nombre de jeux, grille de jaquettes à grands cadres.
	def({
		id: 'collection', name: 'Collection', ref: 'Collection Hub', author: 'ZagonAb', src: 'Pegasus', nav: 'consoleGrid', grid: { cols: 3, per: 9 },
		render: c => `<div class="cl-side"><div class="cl-all">${c.icon('layout-grid')} Tous les jeux <i>(${c.all.length})</i></div><h3>Consoles</h3>
				${c.consoles.map(([s, n]) => `<button class="${s === c.console ? 'on' : ''}" data-action="ch-console" data-sys="${c.esc(s)}">${c.icon('gamepad-2')}<span><b>${c.esc(c.sysLabel(s))}</b><small>(${n} jeu${n > 1 ? 'x' : ''})</small></span></button>`).join('')}</div>
			<div class="cl-bar">${pad('X', 'MENU')}${pad('A', 'DÉTAILS')}${pad('LB', 'CONSOLE')}<span class="cl-ic">${['search', 'trophy', 'list-filter', 'sun', 'plus'].map(n => c.icon(n)).join('')}</span></div>
			<div class="cl-vp ch-viewport">${gridPages(c, 9, (i, k) => `<button class="f-tile f-gt cl-t ${k === c.sel ? 'sel' : ''}" data-action="ch-tile" data-i="${k}" style="--h:${c.hue(i.name)}">${c.cover(i) ? `<img src="${c.esc(c.cover(i))}" alt="">` : `<span class="f-noart" style="--h:${c.hue(i.name)}">${c.esc(i.name)}</span>`}<span class="cl-time">▶ ${i.playTimeMs ? c.esc(c.playTime(i.playTimeMs)) : '0'}</span></button>`, '<div class="f-empty cl-e"></div>', 'cl-grid')}</div><div id="ch-info" hidden></div>`,
	});

	// 24. Lancement facile : barre grise avec la console, grille 4 colonnes de visuels larges, pied gris.
	def({
		id: 'easy', name: 'Lancement facile', ref: 'EasyLaunch', author: 'VGmove', src: 'Pegasus', nav: 'consoleGrid', grid: { cols: 4, per: 12 },
		render: c => `<div class="ez-top"><span class="ez-ic">${c.icon('layers')}</span><b>${c.esc(c.sysLabel(c.console))}</b><i>${c.list.length}</i><span class="ez-r">${c.icon('bookmark') || ''}${c.icon('maximize')}${c.icon('ellipsis-vertical')}<b>${clock()}</b></span></div>
			<div class="ez-vp ch-viewport">${gridPages(c, 12, (i, k) => `<button class="f-tile f-gt ez-t ${k === c.sel ? 'sel' : ''}" data-action="ch-tile" data-i="${k}">${c.bg(i) ? `<img src="${c.esc(c.bg(i))}" alt="">` : `<span class="f-noart" style="--h:${c.hue(i.name)}">${c.esc(i.name)}</span>`}</button>`, '<div class="f-empty ez-e"></div>', 'ez-grid')}</div>
			<div class="ez-foot" id="ch-info"></div>`,
		info: (i, c) => `${c.esc(c.sysLabel(c.sysOf(i)).toUpperCase())} • ${c.list.length} JEUX • ${c.esc(i.name.toUpperCase())}`,
	});

	// 25. Ozone plat : colonne d'icônes à gauche, liste des jeux au centre, image et fiche à droite.
	def({
		id: 'ozone', name: 'Ozone plat', ref: 'Flat Ozone', author: 'ZagonAb', src: 'Pegasus', nav: 'consoleList',
		render: c => `<div class="oz-top"><b>${c.icon('star')} ${c.esc(c.sysLabel(c.console))}</b><span>${dateTime()}</span></div>
			<div class="oz-side">${c.consoles.map(([s]) => `<button class="${s === c.console ? 'on' : ''}" data-action="ch-console" data-sys="${c.esc(s)}"><img src="${c.photo(s)}" alt=""></button>`).join('')}</div>
			<div class="oz-wrap">${listRows(c, 'oz-r', i => `<i>${c.icon(i ? 'disc-3' : 'plus')}</i><span>${c.esc(nameOr(i))}</span>`)}</div>
			<div class="oz-img"></div><div class="oz-info" id="ch-info"></div>
			<div class="oz-foot">${pad('Y', 'Image suivante')}${pad('X', 'Favori')}${pad('A', 'OK')}${pad('B', 'Retour')}</div>`,
		info: (i, c) => `<span>Jeux :</span><b>${c.sel + 1}/${c.list.length}</b><span>Console :</span><b>${c.esc(c.sysLabel(c.sysOf(i)))}</b><span>Temps de jeu :</span><b>${i.playTimeMs ? c.esc(c.playTime(i.playTimeMs)) : '0'}</b><span>Dernière partie :</span><b>${c.esc(fmtDate(i.lastPlayed))}</b>`,
		onSelect: (i, r, c) => setBg(r, '.oz-img', i ? bgOf(c, i) : c.image),
	});

	// 26. Bibliothèque : fond flou bleu nuit, « Jeux récents » avec une grande vignette, « Favoris » en jaquettes.
	def({
		id: 'biblio', name: 'Bibliothèque', ref: 'Library', author: 'Fr75s', src: 'Pegasus', nav: 'row', lead: 0,
		render: c => `<div class="lb-bg"></div><h2 class="lb-h">Jeux récents</h2>${rowWrap(c, 'lb-wrap', 'lb-t')}
			<h2 class="lb-h lb-h2">Favoris</h2><div class="lb-static">${c.all.filter(i => i.playTimeMs).concat(c.all).slice(0, 7).map(i => `<span>${c.cover(i) ? `<img src="${c.esc(c.cover(i))}" alt="">` : `<span class="f-noart" style="--h:${c.hue(i.name)}">${c.esc(i.name)}</span>`}<i>★</i></span>`).join('')}</div><div id="ch-info" hidden></div>`,
		onSelect: (i, r, c) => {
			setBg(r, '.lb-bg', c.image || (i ? c.bg(i) : ''));
			r.querySelectorAll('.lb-t').forEach(t => { const it = c.list[+t.dataset.i]; t.querySelector('.lb-cap')?.remove(); if (+t.dataset.i === c.sel && it) t.insertAdjacentHTML('beforeend', `<span class="lb-cap">${c.esc(it.name)}</span>`); });
		},
	});

	// 27. Hexagones : icônes hexagonales en haut, grand hexagone de la console au centre, barre noire en bas.
	def({
		id: 'hexa', name: 'Hexagones', ref: 'Ludens', author: 'ZagonAb', src: 'Pegasus', nav: 'consoleRow', center: true,
		render: c => `<div class="hx-top">${['gamepad-2', 'gauge', 'cpu', 'refresh-cw', 'moon', 'trophy'].map(n => `<i class="hx">${c.icon(n)}</i>`).join('')}<span class="hx-pw">${c.icon('zap')} Secteur | <b>${clock()}</b><small>${new Date().toLocaleDateString('fr-FR')}</small></span></div>
			<div class="hx-cons">${c.consoles.map(([s]) => `<button class="hx ${s === c.console ? 'on' : ''}" data-action="ch-console" data-sys="${c.esc(s)}"><img src="${c.photo(s)}" alt=""></button>`).join('')}</div>
			<div class="hx-name"><b>${c.esc(c.sysLabel(c.console))}</b><small>${c.list.length} jeu${c.list.length > 1 ? 'x' : ''}</small></div>
			${rowWrap(c, 'hx-wrap', 'hx-t')}<div class="hx-game" id="ch-info"></div>
			<div class="hx-foot">${pad('✚', 'Naviguer')}${pad('≡', 'Couleurs')}<span class="grow"></span>${pad('A', 'OK')}</div>`,
		info: (i, c) => c.esc(i.name),
	});

	// 28. Minimal : boutons gris en haut à droite, titre géant, année · joueurs · étoiles, rangée « Favoris ».
	def({
		id: 'minimis', name: 'Minimal', ref: 'Minimis', author: 'waldnercharles', src: 'Pegasus', nav: 'row', lead: 0,
		render: c => `<div class="mn-bg"></div><div class="mn-top"><span>${c.esc(c.sysLabel(c.console))}</span><span>Tous les jeux</span><span>Par titre</span><button data-action="ch-options">${c.icon('settings')}</button></div>
			<div class="mn-title" id="ch-info"></div><div class="mn-lbl">Favoris</div>${rowWrap(c, 'mn-wrap', 'mn-t')}
			<div class="mn-lbl mn-l2">Jeux au hasard</div><div class="mn-static">${c.all.slice().reverse().slice(0, 9).map(i => `<span style="--h:${c.hue(i.name)}">${c.cover(i) ? `<img src="${c.esc(c.cover(i))}" alt="">` : ''}</span>`).join('')}</div>`,
		info: (i, c) => `<h1>${c.esc(i.name)}</h1><div><b>${(c.sysInfo(c.sysOf(i)) || {}).year || ''}</b> • <span class="mn-chip">1 - 2 joueurs</span> • <b>${(1 + Math.min(4, (i.playTimeMs || 0) / 3600000)).toFixed(1)}</b> <span class="mn-stars">${'★'.repeat(Math.min(5, 1 + Math.floor((i.playTimeMs || 0) / 3600000)))}${'☆'.repeat(Math.max(0, 4 - Math.floor((i.playTimeMs || 0) / 3600000)))}</span></div>`,
		onSelect: (i, r, c) => {
			setBg(r, '.mn-bg', c.image || (i ? c.bg(i) : ''));
			r.querySelectorAll('.mn-t').forEach((t) => { t.querySelector('.mn-cap')?.remove(); const it = c.list[+t.dataset.i]; if (it) t.insertAdjacentHTML('beforeend', `<span class="mn-cap">${c.esc(it.name)}<small>${(c.sysInfo(c.sysOf(it)) || {}).year || ''}</small></span>`); });
		},
	});

	// 29. Boîte : trois panneaux sombres (filtres et consoles, grille, détails) et un lecteur en bas.
	def({
		id: 'boite', name: 'Boîte à jeux', ref: 'Pegasus Box', author: 'ZagonAb', src: 'Pegasus', nav: 'consoleGrid', grid: { cols: 3, per: 6 },
		render: c => `<div class="bx-p bx-l"><h2>${c.icon('box')} SMASH BOX</h2><div class="bx-f"><span>${c.icon('gamepad-2')} Titre ▾</span><span>${c.icon('search')} Rechercher</span></div><div class="bx-f">${c.icon('layout-grid')} Tous les jeux ▾</div><div class="bx-big">${c.icon('library')} BIBLIOTHÈQUE</div>
				<div class="bx-cons">${c.consoles.map(([s, n]) => `<button class="${s === c.console ? 'on' : ''}" data-action="ch-console" data-sys="${c.esc(s)}">${c.icon('gamepad-2')}<span>${c.esc(c.sysLabel(s))}<small>${n} jeu${n > 1 ? 'x' : ''}</small></span></button>`).join('')}</div></div>
			<div class="bx-p bx-c"><h2>${c.esc(c.sysLabel(c.console).toUpperCase())} ${c.icon('layout-grid')}</h2><div class="bx-vp ch-viewport">${gridPages(c, 6, (i, k) => `<button class="f-tile f-gt bx-t ${k === c.sel ? 'sel' : ''}" data-action="ch-tile" data-i="${k}"><span class="bx-art">${c.cover(i) ? `<img src="${c.esc(c.cover(i))}" alt="">` : `<span class="f-noart" style="--h:${c.hue(i.name)}">${c.esc(c.initials(i.name))}</span>`}</span><b>${c.esc(i.name)}</b></button>`, '<div class="f-empty"></div>', 'bx-grid')}</div></div>
			<div class="bx-p bx-r"><h2>DÉTAILS</h2><div class="bx-img"></div><div id="ch-info"></div></div>
			<div class="bx-bar"><span>${c.icon('music')} Bande-son · en pause</span><span class="bx-ctl">${['skip-back', 'play', 'skip-forward'].map(n => `<i>${c.icon(n)}</i>`).join('')}</span><span>${c.icon('volume-2')} 50 %</span><span class="grow"></span><b>${clock()}</b></div>`,
		info: (i, c) => `<h3>${c.esc(i.name)}</h3><div class="bx-cards"><div>${c.icon('calendar')}<span>ANNÉE<b>${(c.sysInfo(c.sysOf(i)) || {}).year || '—'}</b></span></div><div>${c.icon('clock')}<span>TEMPS<b>${i.playTimeMs ? c.esc(c.playTime(i.playTimeMs)) : '0'}</b></span></div><div>${c.icon('gamepad-2')}<span>CONSOLE<b>${c.esc(c.sysLabel(c.sysOf(i)))}</b></span></div></div>`,
		onSelect: (i, r, c) => setBg(r, '.bx-img', i ? bgOf(c, i) : c.image),
	});

	// 30. Écran rétro : liste violette sur écran à lignes, onglets en haut, deux images empilées à droite.
	def({
		id: 'crt', name: 'Écran rétro', ref: 'PegasusBoy Lite', author: 'thomas0465', src: 'Pegasus', nav: 'consoleList',
		render: c => `<div class="cr-tabs"><span>♥ FAV</span>${c.consoles.slice(0, 4).map(([s]) => `<button class="${s === c.console ? 'on' : ''}" data-action="ch-console" data-sys="${c.esc(s)}">${c.esc(c.sysLabel(s).toUpperCase())}</button>`).join('')}</div>
			<div class="cr-wrap">${listRows(c, 'cr-r', i => `${c.esc(nameOr(i))}`)}</div>
			<div class="cr-a"></div><div class="cr-b"></div><div class="cr-foot"><span>${clock()}</span><span id="ch-info"></span></div><div class="cr-scan"></div>`,
		info: (i, c) => `${c.sel + 1}/${c.list.length}`,
		onSelect: (i, r, c) => { setBg(r, '.cr-a', i ? c.cover(i) : ''); setBg(r, '.cr-b', i ? bgOf(c, i) : c.image); },
	});

	// 31. Hub : pastilles de consoles en haut, grille de visuels larges, barre d'infos en bas.
	def({
		id: 'playhub', name: 'Hub de jeux', ref: 'PlayHub', author: 'ZagonAb', src: 'Pegasus', nav: 'consoleGrid', grid: { cols: 4, per: 12 },
		render: c => `<div class="ph-cons"><i>${c.icon('sun')}</i>${c.consoles.map(([s]) => `<button class="${s === c.console ? 'on' : ''}" data-action="ch-console" data-sys="${c.esc(s)}" style="--s:${c.look(s)[0]}">${c.esc(c.sysLabel(s))}</button>`).join('')}</div>
			<div class="ph-vp ch-viewport">${gridPages(c, 12, (i, k) => `<button class="f-tile f-gt ph-t ${k === c.sel ? 'sel' : ''}" data-action="ch-tile" data-i="${k}">${c.bg(i) ? `<img src="${c.esc(c.bg(i))}" alt="">` : `<span class="f-noart" style="--h:${c.hue(i.name)}">${c.esc(i.name)}</span>`}<span class="ph-cap">${c.esc(i.name)}</span></button>`, '<div class="f-empty ph-e"></div>', 'ph-grid')}</div>
			<div class="ph-foot"><span>${dateTime()} | SOMBRE</span><span>${c.esc(c.sysLabel(c.console))}</span><span id="ch-info"></span><span class="grow"></span>${pad('🔍', 'CHERCHER')}${pad('♥', 'FAVORI')}${pad('A', 'OK')}${pad('B', 'RETOUR')}</div>`,
		info: (i, c) => `Jeux : ${c.sel + 1}/${c.list.length}`,
	});

	// 32. Relais : interface façon terminal rouge, onglets en capitales espacées, texte et bouton « JOUER ».
	def({
		id: 'relais', name: 'Relais', ref: 'Relay', author: 'BergGameDev', src: 'Pegasus', nav: 'row', lead: 1,
		render: c => `<div class="ry-bg"></div><div class="ry-shade"></div>
			<div class="ry-head"><b>SMASH / JOUER</b><small>PAR ${c.esc(String(c.player).toUpperCase())}</small></div>
			<div class="ry-tabs"><i>[Q]</i><span>RÉCENTS</span><b>BIBLIOTHÈQUE</b><span>FAVORIS</span><i>[E]</i></div><div class="ry-sub"><span>TOUS</span><b>${c.esc(c.sysLabel(c.console).toUpperCase())}</b></div>
			<div class="ry-info" id="ch-info"></div>
			${rowWrap(c, 'ry-wrap', 'ry-t')}
			<div class="ry-foot"><span><i>[ENTRÉE]</i> CHOISIR</span><span><i>[F]</i> FAVORI</span><span><i>[Q/E]</i> CATÉGORIE</span><span><i>[ÉCHAP]</i> RETOUR</span><span>${c.sel + 1} / ${c.list.length}</span></div>`,
		info: (i, c) => `<h1>${c.esc(i.name)}</h1><div class="ry-meta">${c.esc(c.sysLabel(c.sysOf(i)))} &nbsp; / &nbsp; LOCAL</div><p>${c.esc(about(c.sysOf(i)))} ${i.playTimeMs ? `Joué ${c.esc(c.playTime(i.playTimeMs))}.` : ''}</p><button class="ry-play" data-action="ch-play">&gt; JOUER</button>`,
		onSelect: (i, r, c) => {
			setBg(r, '.ry-bg', i ? bgOf(c, i) : c.image);
			r.querySelectorAll('.ry-t').forEach((t) => { t.querySelector('.ry-cap')?.remove(); const it = c.list[+t.dataset.i]; if (it) t.insertAdjacentHTML('beforeend', `<span class="ry-cap">${c.esc(it.name)}</span>`); });
		},
	});

	// 33. Reprise : onglets en haut, illustration plein écran, logo et durée, boutons « Continuer » et « Détails ».
	def({
		id: 'reprise', name: 'Reprise', ref: 'Reprise', author: 'ilyasturki', src: 'Pegasus', nav: 'row', lead: 0,
		render: c => `<div class="rp-bg"></div><div class="rp-shade"></div><div class="rp-tabs"><b>Accueil</b><span>Bibliothèque</span><span>Favoris</span><i>${c.icon('search')} ${clock()}</i></div>
			<div class="rp-info" id="ch-info"></div>${rowWrap(c, 'rp-wrap', 'rp-t')}
			<div class="rp-foot">${pad('A', 'Continuer')}${pad('X', 'Détails')}${pad('Y', 'Ajouter aux favoris')}${pad('LB RB', 'Onglets')}${pad('✚', 'Naviguer')}</div>`,
		info: (i, c) => `<h1>${c.esc(i.name)}</h1><div class="rp-meta">${c.icon('gamepad-2')} • ${i.playTimeMs ? `${(i.playTimeMs / 3600000).toFixed(1).replace('.', ',')} h` : '0 h'} • ${c.esc(i.lastPlayed ? c.ago(i.lastPlayed) : 'jamais')}</div><div class="rp-btns"><button class="rp-go" data-action="ch-play">▶ Continuer</button><button class="rp-det" data-action="ch-details">${c.icon('info')} Détails</button></div>`,
		onSelect: (i, r, c) => setBg(r, '.rp-bg', i ? bgOf(c, i) : c.image),
	});

	// 34. Héritage : fond uni brique, cartes de consoles aux angles arrondis, la choisie encadrée de blanc.
	def({
		id: 'heritage', name: 'Héritage', ref: 'RGLegacy', author: 'ZagonAb', src: 'Pegasus', nav: 'consoleRow', center: true,
		render: c => `<div class="lg2-top"><b>${clock()}</b><i>${c.icon('zap')}</i></div>
			<div class="ch-row-wrap lg2-wrap"><div class="ch-row">${c.consoles.map(([s, n]) => `<button class="lg2-c ${s === c.console ? 'on' : ''}" data-action="ch-console" data-sys="${c.esc(s)}" style="--s:${c.look(s)[0]}"><span class="lg2-card"><b>${c.esc(c.sysLabel(s))}</b><img src="${c.photo(s)}" alt=""></span><span class="lg2-cap">${c.esc(c.sysLabel(s).toUpperCase())}<small>(${(c.sysInfo(s) || {}).year || '—'})</small></span></button>`).join('')}</div></div>
			<div class="lg2-dots">${c.consoles.map(([s]) => `<i class="${s === c.console ? 'on' : ''}"></i>`).join('')}</div>
			${rowWrap(c, 'lg2-games', 'lg2-t')}<div class="lg2-n" id="ch-info"></div>`,
		info: (i, c) => `${c.list.length} jeu${c.list.length > 1 ? 'x' : ''} · ${c.esc(i.name)}`,
		onSelect: (i, r) => { const on = r.querySelector('.lg2-c.on'); const row2 = r.querySelector('.lg2-wrap .ch-row'); if (on && row2) row2.style.transform = `translateX(${row2.parentElement.clientWidth / 2 - (on.offsetLeft + on.offsetWidth / 2)}px)`; },
	});

	// 35. Néo-rétro : barre d'onglets fine, « Continuer à jouer » avec une grande vignette et une grille 3 × 2.
	def({
		id: 'shinretro', name: 'Néo-rétro', ref: 'shinretro', author: 'TigraTT-Driver', src: 'Pegasus', nav: 'grid', grid: { cols: 4, per: 8 },
		render: c => `<div class="sr2-bg"></div><div class="sr2-top"><span>${c.icon('settings')}</span><span>RÉGLAGES</span><b>ACCUEIL</b><span>COLLECTIONS</span><span>JEUX</span><span>${c.icon('gamepad-2')}</span><em>${c.esc(c.sysLabel(c.console))}</em></div>
			<h2 class="sr2-h">Continuer à jouer</h2>
			<div class="sr2-vp ch-viewport">${gridPages(c, 8, (i, k) => coverTile(c, i, k, 'f-gt sr2-t'), '<div class="f-empty"></div>', 'sr2-grid')}</div>
			<div class="sr2-foot" id="ch-info"></div>`,
		info: (i, c) => `<i></i>JOUER <b>${c.esc(i.name.toUpperCase())}</b>`,
		onSelect: (i, r, c) => setBg(r, '.sr2-bg', c.image || (i ? c.bg(i) : '')),
	});

	// 36. Fiche : page claire du jeu, éditeur et genre, grande capture, description, jaquette et étoiles.
	def({
		id: 'fiche', name: 'Fiche du jeu', ref: 'Sleipnir', author: 'y-muller', src: 'Pegasus', nav: 'row', lead: 0,
		render: c => `<div class="sp-head" id="ch-info"></div>${rowWrap(c, 'sp-wrap', 'sp-t')}
			<div class="sp-foot">${pad('A', 'Jouer')}${pad('B', 'Retour')}${pad('X', 'Favori')}</div>`,
		info: (i, c) => {
			const si = c.sysInfo(c.sysOf(i)) || {};
			return `<div class="sp-bar"><h1>${c.esc(i.name)}</h1><span>♥</span></div><div class="sp-left"><small>${c.esc(si.maker || '')}</small><b>${c.esc(c.sysLabel(c.sysOf(i)))}</b><small>${c.esc(lastPlayed(c, i))}</small><div class="sp-shot" style="${c.bg(i) ? `background-image:url('${c.esc(c.bg(i))}')` : ''}"></div></div>
				<div class="sp-right"><div class="sp-box">${c.cover(i) ? `<img src="${c.esc(c.cover(i))}" alt="">` : ''}</div><p>${c.esc(about(c.sysOf(i)))} ${i.playTimeMs ? `Tu y as joué ${c.esc(c.playTime(i.playTimeMs))}.` : 'Tu n’y as pas encore joué.'}</p></div>
				<div class="sp-side"><span>${'★'.repeat(5)}</span><b>1P</b><b>${si.year || ''}</b></div>`;
		},
	});

	// 37. Vitrine noire : console et titre en haut à gauche, pastilles de chiffres, jaquette en avant sur un mur.
	def({
		id: 'slick', name: 'Mur noir', ref: 'Slick', author: 'buzz', src: 'Pegasus', nav: 'row', lead: 0,
		render: c => `<div class="sk-wall">${c.all.concat(c.all).slice(0, 30).map(i => `<span style="--h:${c.hue(i.name)}">${c.cover(i) ? `<img src="${c.esc(c.cover(i))}" alt="">` : ''}</span>`).join('')}</div>
			<div class="sk-info" id="ch-info"></div>${rowWrap(c, 'sk-wrap', 'sk-t')}<div class="sk-front"></div>`,
		info: (i, c) => {
			const si = c.sysInfo(c.sysOf(i)) || {};
			const box = (v, l) => `<div><b>${c.esc(String(v))}</b><small>${l}</small></div>`;
			return `<small class="sk-sys">${c.esc(c.sysLabel(c.sysOf(i)).toUpperCase())}</small><h1>${c.esc(i.name.toUpperCase())}</h1>
				<div class="sk-boxes">${box(1, 'JOUEURS')}${box(`${Math.min(99, 40 + Math.round((i.playTimeMs || 0) / 360000))}%`, 'NOTE')}${box(si.year || '—', 'SORTIE')}${box(String(si.maker || '—').toUpperCase(), 'FABRICANT')}${box(i.lastPlayed ? c.ago(i.lastPlayed).toUpperCase() : 'JAMAIS', 'DERNIÈRE')}${box(i.playTimeMs ? c.playTime(i.playTimeMs).toUpperCase() : '0 MIN', 'TEMPS')}</div>
				<p>${c.esc(about(c.sysOf(i)))}</p><div class="sk-shot" style="${c.bg(i) ? `background-image:url('${c.esc(c.bg(i))}')` : ''}"></div>`;
		},
		onSelect: (i, r, c) => { const f = r.querySelector('.sk-front'); if (f) f.innerHTML = i && c.cover(i) ? `<img src="${c.esc(c.cover(i))}" alt="">` : i ? `<span class="f-noart" style="--h:${c.hue(i.name)}">${c.esc(i.name)}</span>` : ''; },
	});

	// 38. Multicartouche : liste numérotée en pixels blancs sur ciel bleu, plage en pixel art en bas.
	def({
		id: 'multicart', name: 'Multicartouche', ref: '9999999-in-1', author: 'mmatyas', src: 'Pegasus', nav: 'consoleList',
		render: c => `<div class="mc-sky"></div><div class="mc-sea"></div><div class="mc-sand"></div>
			<div class="mc-title">${c.esc(c.sysLabel(c.console).toUpperCase())}</div>
			<div class="mc-wrap">${listRows(c, 'mc-r', (i, k) => `<em>${i ? '✓' : ''}</em>${String(k + 1).padStart(2, '0')}.${c.esc(nameOr(i).toUpperCase())}`)}</div><div id="ch-info" hidden></div>`,
	});

	// 39. Néon spatial : ciel étoilé, manettes dessinées au trait lumineux, bandeau blanc avec la console.
	def({
		id: 'neon', name: 'Néon spatial', ref: 'Homage', author: 'asdfgasfhsn', src: 'Pegasus', nav: 'consoleRow', center: true,
		render: c => `<div class="nh-sky"></div><div class="ch-row-wrap nh-wrap"><div class="ch-row">${c.consoles.map(([s]) => `<button class="nh-c ${s === c.console ? 'on' : ''}" data-action="ch-console" data-sys="${c.esc(s)}"><img src="${c.photo(s)}" alt=""></button>`).join('')}</div></div>
			<div class="nh-band"><h1>${c.esc(c.sysLabel(c.console).toUpperCase())}</h1><small>≡ ${c.list.length} JEU${c.list.length > 1 ? 'X' : ''} DISPONIBLE${c.list.length > 1 ? 'S' : ''}</small>${rowWrap(c, 'nh-games', 'nh-t')}<span class="nh-n" id="ch-info"></span></div>`,
		info: (i, c) => c.esc(i.name),
		onSelect: (i, r) => { const on = r.querySelector('.nh-c.on'); const row2 = r.querySelector('.nh-wrap .ch-row'); if (on && row2) row2.style.transform = `translateX(${row2.parentElement.clientWidth / 2 - (on.offsetLeft + on.offsetWidth / 2)}px)`; },
	});

	// 40. Ligne ambre : onglets à bord cyan en haut, grille de jaquettes à gauche, fiche détaillée à droite.
	def({
		id: 'ambre', name: 'Ligne cyan', ref: 'Amberline', author: 'ZagonAb', src: 'Pegasus', nav: 'consoleGrid', grid: { cols: 3, per: 9 },
		render: c => `<div class="am-tabs"><i>${c.icon('disc-3')}</i>${c.consoles.map(([s]) => `<button class="${s === c.console ? 'on' : ''}" data-action="ch-console" data-sys="${c.esc(s)}">${c.esc(c.sysLabel(s))}</button>`).join('')}</div>
			<div class="am-vp ch-viewport">${gridPages(c, 9, (i, k) => coverTile(c, i, k, 'f-gt am-t', true), '<div class="f-empty am-e"></div>', 'am-grid')}</div><div class="am-scroll"></div>
			<div class="am-detail" id="ch-info"></div>`,
		info: (i, c) => `<div class="am-dots"><b></b><i></i><i></i><i></i></div><div class="am-shot" style="${c.bg(i) ? `background-image:url('${c.esc(c.bg(i))}')` : ''}"></div><h3>${c.esc(i.name.toUpperCase())}</h3><small>${c.esc((c.sysInfo(c.sysOf(i)) || {}).maker || '')} • ${(c.sysInfo(c.sysOf(i)) || {}).year || ''}</small>
			<div class="am-stats"><span>▶ Parties : ${i.lastPlayed ? 1 : 0}</span><span>${c.icon('clock')} Temps : ${i.playTimeMs ? c.esc(c.playTime(i.playTimeMs)) : '0'}</span></div><p>${c.esc(about(c.sysOf(i)))}</p>`,
	});

	const api = { LIST, get: id => byId[id] || null };
	root.SmashHomeFaithful = api;
	if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
