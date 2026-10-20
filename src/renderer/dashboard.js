/* global state, api, icon, esc, toast, toastError, go, render, setMain, PAGES, TITLES, ACTIONS, playTime, ago, dateFr, instById, instIcon, instGameName, sysOf, SmashThemes, applyTheme, fileUrl, modal, $ */
// Tableau de bord (statistiques, activité, bibliothèque, émulateurs, stockage, supporter et administration),
// recommandations « Pour toi » de l'accueil et lien vers la communauté Discord.

// Serveur Discord de la communauté : lien publié par l'administrateur dans community.json (GitHub), lu au
// démarrage ; le bouton « Rejoindre le Discord » n'apparaît que lorsqu'il existe.
const COMMUNITY = { discord: '' };
api('community:get').then((c) => {
	COMMUNITY.discord = c.discord || '';
	COMMUNITY.published = c.published || {};
	if (COMMUNITY.discord && typeof renderNav === 'function') renderNav();
}).catch(() => {});

const fmtBytes = (b) => {
	if (b < 1024) return `${b} o`;
	const u = ['Ko', 'Mo', 'Go', 'To'];
	let i = -1;
	do { b /= 1024; i++; } while (b >= 1024 && i < u.length - 1);
	return `${b >= 100 ? Math.round(b) : b.toFixed(1).replace('.', ',')} ${u[i]}`;
};
const hoursLabel = ms => (ms >= 3600000 ? `${(ms / 3600000).toFixed(1).replace('.', ',')} h` : `${Math.round(ms / 60000)} min`);
const RANK_COLOR = { bronze: '#cd7f32', silver: '#c0c8d4', gold: '#ffc93c', platinum: '#7fe0ff' };
const WEEK = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// Barres verticales en SVG : [{ value, label, tip }].
const barChart = (items, { h = 140, color = 'var(--brand)', labelEvery = 1 } = {}) => {
	const max = Math.max(1, ...items.map(x => x.value));
	const w = 100 / items.length;
	return `<svg class="dash-bars" viewBox="0 0 100 ${h}" preserveAspectRatio="none" aria-hidden="true">
		${items.map((x, i) => { const bh = Math.max(x.value ? 2 : 0.6, (x.value / max) * (h - 4)); return `<rect x="${i * w + w * 0.14}" y="${h - bh}" width="${w * 0.72}" height="${bh}" rx="0.8" fill="${x.value ? color : 'var(--button)'}"><title>${esc(x.tip)}</title></rect>`; }).join('')}
	</svg><div class="dash-axis">${items.map((x, i) => `<span>${i % labelEvery === 0 ? esc(x.label) : ''}</span>`).join('')}</div>`;
};

// Anneau de répartition : [{ label, value, color }].
const donut = (parts, size = 150) => {
	const total = parts.reduce((a, p) => a + p.value, 0) || 1;
	const r = 52;
	const c = 2 * Math.PI * r;
	let off = 0;
	const arcs = parts.map((p) => {
		const len = (p.value / total) * c;
		const s = `<circle r="${r}" cx="70" cy="70" fill="none" stroke="${p.color}" stroke-width="20" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"><title>${esc(p.label)}</title></circle>`;
		off += len;
		return s;
	}).join('');
	return `<svg viewBox="0 0 140 140" width="${size}" height="${size}" aria-hidden="true"><circle r="${r}" cx="70" cy="70" fill="none" stroke="var(--button)" stroke-width="20"/>${arcs}</svg>`;
};
const PALETTE = ['var(--brand)', 'var(--brand-2)', '#4dd0e1', '#ff8a65', '#9575cd', '#81c784', '#f06292', '#ffd54f', '#90a4ae'];

TITLES.dashboard = () => [{ label: 'Tableau de bord' }];

PAGES.dashboard = async () => {
	setMain('<div class="loading"><div class="spinner"></div>Calcul des statistiques…</div>');
	let d;
	try { d = await api('dashboard:get'); } catch (error) { toastError(error); return; }
	if (state.route.name !== 'dashboard') return;
	state.supporter = d.supporter;
	const t = d.totals;
	const kpi = (ic, value, label, sub = '') => `<div class="dash-kpi">${icon(ic)}<div><b>${value}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
	const days = d.days.map(x => ({ value: x.ms, label: new Date(x.at).getDate() === 1 || x === d.days[0] ? new Date(x.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : String(new Date(x.at).getDate()), tip: `${new Date(x.at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} : ${x.ms ? hoursLabel(x.ms) : 'pas de jeu'}` }));
	const hours = d.hours.map((ms, h) => ({ value: ms, label: `${h}h`, tip: `${h} h – ${h + 1} h : ${hoursLabel(ms)}` }));
	const week = [1, 2, 3, 4, 5, 6, 0].map((wd, i) => ({ value: d.week[wd], label: WEEK[i], tip: `${WEEK[i]} : ${hoursLabel(d.week[wd])}` }));
	const consoles = d.perConsole.slice(0, 8).map((c, i) => ({ ...c, color: PALETTE[i % PALETTE.length], value: c.ms }));
	const topMax = Math.max(1, ...d.topGames.map(g => g.ms));
	const storageTotal = d.storage.reduce((a, s) => a + s.bytes, 0) || 1;
	const busiestHour = d.hours.indexOf(Math.max(...d.hours));
	const sup = d.supporter;
	const coverPct = d.library.romInstances ? Math.round((d.library.withCover / d.library.romInstances) * 100) : 0;
	const emuInstalled = d.emulators.filter(e => e.installed).length;

	setMain(`
		<div class="dash-hero">
			<div class="dash-hero-left">
				<div class="dash-hello">Salut ${esc(d.player || 'joueur')} ${sup.active ? `<span class="sup-badge ${sup.active.tier}">${icon('crown')}${esc(sup.active.tierLabel)}</span>` : ''}</div>
				<h1>Tableau de bord</h1>
				<div class="muted">${t.played ? `${hoursLabel(t.ms)} de jeu sur ${t.played} jeu${t.played > 1 ? 'x' : ''}${t.streak > 1 ? ` · ${t.streak} jours d’affilée 🔥` : ''}` : 'Lance un jeu pour remplir tes statistiques.'}</div>
			</div>
			<div class="row" style="gap:8px">
				${COMMUNITY.discord ? `<button class="btn" data-action="external" data-url="${esc(COMMUNITY.discord)}">${icon('message-circle')}Rejoindre le Discord</button>` : ''}
				<button class="btn" data-action="dash-refresh">${icon('refresh-cw')}Actualiser</button>
			</div>
		</div>

		<div class="dash-kpis">
			${kpi('clock', hoursLabel(t.ms), 'Temps de jeu total')}
			${kpi('joystick', t.played, 'Jeux joués', `${t.instances} dans la bibliothèque`)}
			${kpi('play', t.sessions, 'Parties enregistrées', t.average ? `${hoursLabel(t.average)} en moyenne` : '')}
			${kpi('flame', t.longest ? hoursLabel(t.longest) : '—', 'Plus longue partie')}
			${kpi('trophy', `${d.trophies.points} pts`, 'Trophées', `${d.trophies.count} / ${d.trophies.total}`)}
			${kpi('gamepad-2', t.consoles, 'Consoles jouées')}
			${kpi('calendar', t.streak, 'Jours d’affilée')}
			${kpi('wifi', d.remote.hosted + d.remote.joined, 'Parties à distance', `${d.remote.hosted} hébergées · ${d.remote.joined} rejointes`)}
		</div>

		<div class="dash-grid">
			<div class="card col dash-wide"><div class="row"><h3 class="grow">${icon('calendar')}Activité des 30 derniers jours</h3><span class="small muted">${t.historySince ? `historique depuis le ${dateFr(t.historySince)}` : 'l’historique commence à ta prochaine partie'}</span></div>
				${barChart(days, { labelEvery: 5 })}</div>

			<div class="card col"><h3>${icon('clock')}Quand tu joues</h3>
				${barChart(hours, { h: 90, color: 'var(--brand-2)', labelEvery: 6 })}
				<div class="small muted">${d.hours.some(Boolean) ? `Ton heure préférée : <b>${busiestHour} h – ${busiestHour + 1} h</b>` : 'Pas encore de données.'}</div>
				<div style="margin-top:10px">${barChart(week, { h: 70, color: 'var(--brand)' })}</div></div>

			<div class="card col"><h3>${icon('gamepad-2')}Temps par console</h3>
				${consoles.length ? `<div class="dash-donut">${donut(consoles)}<div class="dash-legend">${consoles.map(c => `<div><i style="background:${c.color}"></i><span class="grow">${esc(c.label)}</span><b>${hoursLabel(c.ms)}</b></div>`).join('')}</div></div>` : '<div class="empty small">Aucune partie pour l’instant.</div>'}</div>

			<div class="card col dash-wide"><h3>${icon('trophy')}Jeux les plus joués</h3>
				${d.topGames.length ? d.topGames.map((g, i) => { const inst = instById(g.id); return `<div class="dash-top" data-action="nav-inst" data-id="${esc(g.id)}">
					<span class="dash-rank">${i + 1}</span>${inst ? instIcon(inst, 'sm') : ''}
					<div class="grow"><div class="row" style="gap:8px"><b class="ellipsis">${esc(g.name)}</b><span class="small muted">${esc((state.info.systems[g.system] || {}).label || '')}</span><span class="grow"></span><b>${hoursLabel(g.ms)}</b></div>
					<div class="bar-track"><div class="bar-fill" style="width:${Math.round((g.ms / topMax) * 100)}%"></div></div>
					<div class="small muted">${g.sessions ? `${g.sessions} partie${g.sessions > 1 ? 's' : ''} · ` : ''}${g.lastPlayed ? `dernière ${ago(g.lastPlayed)}` : ''}</div></div>
				</div>`; }).join('') : '<div class="empty small">Joue à un jeu pour voir ton classement.</div>'}</div>

			<div class="card col"><h3>${icon('library')}Bibliothèque</h3>
				<div class="dash-lines">
					<div><span>Instances de jeux</span><b>${d.library.romInstances}</b></div>
					<div><span>Instances Coop DX</span><b>${d.library.coopdx}</b></div>
					<div><span>ROM et disques</span><b>${d.library.roms}</b></div>
					<div><span>Jaquettes</span><b>${d.library.withCover} / ${d.library.romInstances} (${coverPct} %)</b></div>
					<div><span>Jamais lancés</span><b>${d.library.neverPlayed.length}</b></div>
					<div><span>Thèmes perso</span><b>${d.customThemes}</b></div>
				</div>
				<div class="chips" style="margin-top:8px">${d.library.romsBySystem.map(s => `<span class="tag">${esc(s.label)} · ${s.n}</span>`).join('')}</div>
				${d.library.missingFiles.length ? `<div class="dash-warn">${icon('triangle-alert')}Fichiers introuvables : ${esc(d.library.missingFiles.join(', '))}</div>` : ''}
				${coverPct < 100 && d.library.romInstances ? `<button class="btn sm" style="margin-top:8px" data-action="nav" data-to="library">${icon('image')}Ajouter des jaquettes</button>` : ''}</div>

			<div class="card col"><h3>${icon('cpu')}Émulateurs</h3>
				<div class="small muted">${emuInstalled} installé${emuInstalled > 1 ? 's' : ''} sur ${d.emulators.length}</div>
				<div class="dash-lines">${d.emulators.map(e => `<div><span>${esc(e.label)} <small class="muted">${esc(e.systems.map(x => (state.info.systems[x] || {}).label || x).join(', '))}</small></span><b>${e.installed ? `<span class="tag green">${esc(e.version || 'installé')}</span>` : '<span class="tag">—</span>'}</b></div>`).join('')}</div>
				<button class="btn sm" style="margin-top:8px" data-action="nav" data-to="settings">${icon('cloud-download')}Installer ou mettre à jour</button></div>

			<div class="card col"><h3>${icon('hard-drive')}Stockage</h3>
				<div class="dash-stack">${d.storage.filter(s => s.bytes).map((s, i) => `<i style="width:${(s.bytes / storageTotal) * 100}%;background:${PALETTE[i % PALETTE.length]}" data-tip="${esc(s.label)} : ${fmtBytes(s.bytes)}"></i>`).join('')}</div>
				<div class="dash-legend">${d.storage.map((s, i) => `<div><i style="background:${PALETTE[i % PALETTE.length]}"></i><span class="grow">${esc(s.label)}</span><b>${fmtBytes(s.bytes)}</b></div>`).join('')}</div>
				<div class="small muted" style="margin-top:6px">Total : <b>${fmtBytes(storageTotal)}</b> dans ${esc(state.info.dataDir)}</div></div>

			<div class="card col"><h3>${icon('trophy')}Derniers trophées</h3>
				${d.trophies.recent.length ? d.trophies.recent.map(x => `<div class="dash-trophy"><span class="dot" style="background:${RANK_COLOR[x.rank]}"></span><div class="grow"><b>${esc(x.name)}</b><span>${esc(x.desc)}</span></div><small>${ago(x.at)}</small></div>`).join('') : '<div class="empty small">Aucun trophée pour l’instant.</div>'}
				<button class="btn sm" style="margin-top:8px" data-action="nav" data-to="trophies">${icon('trophy')}Tous les trophées</button></div>

			<div class="card col dash-wide" id="sup-card">${supporterCard(sup)}</div>
		</div>`);
	if (sup.admin) loadIssued();
};

// ---------- Supporter et administration ----------

const supporterCard = sup => `
	<div class="row"><h3 class="grow">${icon('crown')}Mode supporter</h3>${sup.active ? `<span class="sup-badge ${sup.active.tier}">${icon('crown')}${esc(sup.active.tierLabel)} · ${esc(sup.active.name)}</span>` : ''}</div>
	<div class="small muted">Un code supporter débloque des <b>thèmes exclusifs</b> (Aurore boréale, Velours royal, Sakura de nuit, Synthwave), un badge et la reconnaissance éternelle. Les codes sont offerts par l’administrateur de Smash Emu (don, concours, cadeau) et vérifiés hors ligne.</div>
	<div class="sup-themes">${SmashThemes.SUPPORTER.map(t => `<div class="sup-theme ${sup.active ? '' : 'locked'}" ${sup.active ? `data-action="set-theme" data-v="${t.id}"` : ''} data-tip="${esc(t.tagline)}"><div class="theme-art">${SmashThemes.scene(t.id)}</div><b style="font-family:'${esc(t.font)}', 'Inter', sans-serif">${sup.active ? '' : icon('lock')}${esc(t.label)}</b></div>`).join('')}</div>
	${sup.active
		? '<div class="row" style="gap:8px;margin-top:10px"><span class="small muted grow">Merci pour ton soutien ❤</span><button class="btn sm" data-action="sup-off">Retirer le code</button></div>'
		: '<div class="row" style="gap:8px;margin-top:10px"><input class="input grow" id="sup-code" placeholder="SMASH-SUP-…"><button class="btn primary" data-action="sup-activate">Activer</button></div>'}
	${sup.admin ? `<div class="admin-box">
		<div class="row"><h3 class="grow">${icon('shield-check')}Administration</h3><span class="tag green">PC administrateur</span></div>
		<div class="small muted">Ce PC possède la clé privée (Documents\\Smash Emu\\admin\\supporter-private.pem) : lui seul peut créer des codes. Garde une copie de ce fichier en lieu sûr et ne le partage jamais.</div>
		<div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
			<input class="input grow" id="adm-name" placeholder="Pseudo du supporter" maxlength="40">
			<select class="input" id="adm-tier" style="width:auto">${Object.entries(sup.tiers).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
			<button class="btn primary" data-action="adm-generate">${icon('key-round')}Créer un code</button>
		</div>
		<div id="adm-issued" class="dash-lines" style="margin-top:10px"></div>
		<div class="row" style="gap:8px;margin-top:14px;flex-wrap:wrap">
			<input class="input grow" id="adm-invite" placeholder="Lien d’invitation du serveur Discord (https://discord.gg/…)" value="${esc(COMMUNITY.discord || '')}">
			<button class="btn" data-action="adm-invite">${icon('message-circle')}Enregistrer</button>
		</div>
		<div class="small muted" style="margin-top:6px">Ce lien active le bouton « Rejoindre le Discord » sur ce PC. Pour tous les joueurs, mets-le dans <b>community.json</b> sur GitHub (champ « discord ») ; le champ « discordAppId » y active la présence Discord chez tout le monde.</div>
	</div>` : ''}`;

const loadIssued = async () => {
	const box = document.getElementById('adm-issued');
	if (!box) return;
	const list = await api('supporter:issued').catch(() => []);
	box.innerHTML = list.length ? `<div class="small muted">${list.length} code${list.length > 1 ? 's' : ''} créé${list.length > 1 ? 's' : ''}</div>${list.slice(0, 20).map(c => `<div><span>${esc(c.name)} <small class="muted">${esc(c.tier)} · ${dateFr(c.at)}</small></span><b><button class="btn sm" data-action="adm-copy" data-code="${esc(c.code)}">${icon('copy')}Copier</button></b></div>`).join('')}` : '<div class="small muted">Aucun code créé pour l’instant.</div>';
};

Object.assign(ACTIONS, {
	'dash-refresh': () => PAGES.dashboard(),
	'nav-inst': el => go('instance', { id: el.dataset.id }),
	'sup-activate': async () => {
		const code = (document.getElementById('sup-code') || {}).value || '';
		try {
			const r = await api('supporter:activate', code);
			state.supporter = r;
			toast(`Bienvenue, ${esc(r.activated.name)} ! Mode <b>${esc(r.activated.tierLabel)}</b> activé : les thèmes exclusifs sont débloqués.`, { type: 'success', timeout: 8000 });
			if (state.route.name === 'dashboard') document.getElementById('sup-card').innerHTML = supporterCard(r);
			else render();
		} catch (error) { toastError(error); }
	},
	'sup-off': async () => {
		state.supporter = await api('supporter:deactivate');
		if (String(state.settings.theme || '').startsWith('sup-')) { state.settings = await api('settings:set', { theme: 'smash' }); applyTheme('smash'); }
		if (state.route.name === 'dashboard') document.getElementById('sup-card').innerHTML = supporterCard(state.supporter);
		else render();
	},
	'adm-generate': async () => {
		const name = document.getElementById('adm-name').value;
		const tier = document.getElementById('adm-tier').value;
		const r = await api('supporter:generate', name, tier);
		await navigator.clipboard.writeText(r.code);
		toast(`Code créé pour <b>${esc(name)}</b> et copié : envoie-le lui en message privé.`, { type: 'success', timeout: 8000 });
		document.getElementById('adm-name').value = '';
		loadIssued();
	},
	'adm-copy': async (el) => { await navigator.clipboard.writeText(el.dataset.code); toast('Code copié'); },
	'adm-invite': async () => {
		const c = await api('community:setLocal', document.getElementById('adm-invite').value);
		COMMUNITY.discord = c.discord || '';
		renderNav();
		toast(COMMUNITY.discord ? 'Lien Discord enregistré : le bouton « Rejoindre le Discord » est actif.' : 'Lien Discord retiré.');
	},
	'join-discord': () => { if (COMMUNITY.discord) api('shell:open', COMMUNITY.discord).catch(toastError); },
});

// ---------- Recommandations « Pour toi » (accueil) ----------

const recoCard = r => `<button class="reco" data-action="${r.action}" ${Object.entries(r.data || {}).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')}>
	<div class="reco-art">${r.art || icon(r.icon)}</div>
	<div class="reco-body"><span class="reco-kind">${icon(r.icon)}${esc(r.kind)}</span><b>${esc(r.title)}</b><span>${esc(r.desc)}</span></div>
</button>`;

const buildRecos = async () => {
	const out = [];
	const now = Date.now();
	const games = state.instances.filter(i => i.type === 'rom' || i.type === 'coopdx');
	// Trophée à portée de main.
	try {
		const t = await api('trophies:list');
		const near = t.perGame.map((g) => { const next = g.tiers.find(x => !x.at); return next ? { g, next, left: next.ms - g.ms } : null; }).filter(Boolean).sort((a, b) => a.left - b.left)[0];
		const inst = near && instById(near.g.id);
		if (inst && near.left < 5 * 3600000) out.push({ icon: 'trophy', kind: 'Trophée en vue', title: inst.name, desc: `Encore ${playTime(near.left)} pour « ${near.next.name} »`, action: 'play', data: { id: inst.id }, art: instIcon(inst, 'sm') });
	} catch { /* trophées indisponibles */ }
	// Un jeu aimé mais délaissé.
	const old = games.filter(i => i.lastPlayed && now - i.lastPlayed > 10 * 86400000 && (i.playTimeMs || 0) > 600000).sort((a, b) => (b.playTimeMs || 0) - (a.playTimeMs || 0))[0];
	if (old) out.push({ icon: 'history', kind: 'Ça fait longtemps', title: old.name, desc: `Dernière partie ${ago(old.lastPlayed)} · ${playTime(old.playTimeMs)} au total`, action: 'play', data: { id: old.id }, art: instIcon(old, 'sm') });
	// Jamais lancé.
	const fresh = games.filter(i => !i.lastPlayed && !(i.playTimeMs > 0))[0];
	if (fresh) out.push({ icon: 'sparkles', kind: 'Jamais lancé', title: fresh.name, desc: 'Il t’attend dans ta bibliothèque', action: 'play', data: { id: fresh.id }, art: instIcon(fresh, 'sm') });
	// Thème du jeu le plus joué.
	const top = [...games].sort((a, b) => (b.playTimeMs || 0) - (a.playTimeMs || 0))[0];
	const themeId = top && top.playTimeMs && SmashThemes.match(instGameName(top), sysOf(top));
	if (themeId && state.settings.theme !== themeId) out.push({ icon: 'palette', kind: 'Thème pour toi', title: SmashThemes.get(themeId).label, desc: `Inspiré de ton jeu le plus joué : ${top.name}`, action: 'set-theme', data: { v: themeId }, art: `<div class="reco-theme">${SmashThemes.scene(themeId)}</div>` });
	// Jaquettes manquantes.
	const noCover = games.filter(i => i.type === 'rom' && !i.coverFile).length;
	if (noCover) out.push({ icon: 'image', kind: 'Bibliothèque', title: `${noCover} jeu${noCover > 1 ? 'x' : ''} sans jaquette`, desc: 'Ajoute les boîtes officielles (libretro-thumbnails)', action: 'nav', data: { to: 'library' } });
	// Jouer à plusieurs.
	if (!(state.settings.remoteRecent || []).length) out.push({ icon: 'wifi', kind: 'À plusieurs', title: 'Invite un pote', desc: 'Il joue en joueur 2 depuis chez lui, sans rien installer d’autre', action: 'nav', data: { to: 'remote' } });
	// Discord.
	if (!state.settings.richPresence) out.push({ icon: 'message-circle', kind: 'Discord', title: 'Montre à quoi tu joues', desc: 'Active la présence Discord « Joue à Smash Emu »', action: 'nav', data: { to: 'settings' } });
	if (COMMUNITY.discord) out.push({ icon: 'users', kind: 'Communauté', title: 'Rejoins le Discord Smash Emu', desc: 'Thèmes, entraide, parties à distance', action: 'external', data: { url: COMMUNITY.discord } });
	// Thème perso.
	if (!(state.settings.customThemes || []).length) out.push({ icon: 'palette', kind: 'Personnalise', title: 'Crée ton propre thème', desc: 'Tes couleurs, ta police, tes images', action: 'theme-edit' });
	// Tableau de bord.
	out.push({ icon: 'gauge', kind: 'Statistiques', title: 'Ton tableau de bord', desc: 'Temps de jeu, activité, trophées, stockage', action: 'nav', data: { to: 'dashboard' } });
	return out.slice(0, 6);
};

const fillForYou = async () => {
	const box = document.getElementById('for-you');
	if (!box) return;
	const recos = await buildRecos().catch(() => []);
	if (!document.getElementById('for-you') || !recos.length) return;
	box.innerHTML = `<div class="section-title mt"><h2>Pour toi</h2><span class="muted small">selon ce que tu joues</span></div><div class="reco-grid">${recos.map(recoCard).join('')}</div>`;
};
