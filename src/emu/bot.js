/* global smashEmu, st, emu, gm, toast, log, esc, applySpeed, icon */
// Bot apprenti (Ctrl+B) : joue tout seul et apprend quelles actions lui font découvrir de nouveaux écrans.
//
// Principe (exploration par curiosité, façon « Go-Explore ») :
//  - le bot « voit » l'écran en miniature (8×6 niveaux de gris) quelques fois par seconde ; chaque miniature
//    jamais vue est un nouvel « endroit », gardé avec un état de sauvegarde pour pouvoir y revenir ;
//  - il joue par essais : il repart d'un endroit peu visité, enchaîne des actions (direction + bouton) et
//    note celles qui l'ont mené à du nouveau ; il les choisit ensuite plus souvent (apprentissage par
//    renforcement simple, valeur moyenne par action) ;
//  - ce qu'il a appris (la valeur des actions) est gardé par jeu et repris à la session suivante.
// Il apprend à explorer, pas à finir un jeu. Pendant qu'il joue, les sauvegardes en jeu ne sont pas recopiées
// sur le disque, et à l'arrêt la partie revient où tu étais (sauf si tu choisis de rester où il est arrivé).

(() => {
	const SAMPLE_EVERY = 12;          // images entre deux regards sur l'écran
	const EPISODE = [240, 600];       // durée d'un essai (images)
	const HOLD = [6, 24];             // durée d'une action (images)
	const BUDGET = 192 * 1024 * 1024; // mémoire maximale pour les états gardés
	const B = {
		on: false, buttons: [], actions: [], q: {}, memory: null,
		cells: new Map(), episodes: 0, frames: 0, newCells: 0, recent: [],
		cur: null, holdLeft: 0, episodeLeft: 0, lastSample: -1, pending: false, lastFrame: -1,
		stateBytes: 0, preState: null, offs: [], speed: 3, stuck: 0, lastKey: null, panel: null,
	};

	const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
	const DIR_IDS = [4, 5, 6, 7, 16, 17, 18, 19];
	const ANALOG = [16, 17, 18, 19, 20, 21, 22, 23];
	const press = (id, on) => window.smashInputs.send(0, id, on ? (ANALOG.includes(id) ? 0x7fff : 1) : 0);

	// Actions : une direction et/ou un bouton (Select exclu ; Start gardé pour passer les menus).
	const buildActions = (buttons) => {
		const ids = buttons.map(b => b.id);
		const label = Object.fromEntries(buttons.map(b => [b.id, b.label]));
		const dirs = ids.filter(id => DIR_IDS.includes(id));
		const acts = ids.filter(id => !DIR_IDS.includes(id) && id !== 2);
		const out = [];
		for (const d of [null, ...dirs]) for (const a of [null, ...acts]) {
			if (d === null && a === null) continue;
			const keys = [d, a].filter(x => x !== null);
			out.push({ key: keys.join(','), ids: keys, label: keys.map(k => label[k] || k).join(' + ') });
		}
		return out;
	};

	// Choix : surtout la meilleure action connue, avec une part de hasard pour continuer à essayer.
	const pick = () => {
		if (B.cur && Math.random() < 0.55) return B.cur;
		if (Math.random() < 0.15) return B.actions[Math.floor(Math.random() * B.actions.length)];
		const temp = 0.35;
		const w = B.actions.map(a => Math.exp((B.q[a.key] || 0) / temp));
		let r = Math.random() * w.reduce((x, y) => x + y, 0);
		for (let k = 0; k < w.length; k++) { r -= w[k]; if (r <= 0) return B.actions[k]; }
		return B.actions[B.actions.length - 1];
	};

	const learn = (action, reward) => {
		if (!action) return;
		const old = B.q[action.key] || 0;
		B.q[action.key] = old + 0.2 * (reward - old);
	};

	const setAction = (next) => {
		const prev = B.cur ? B.cur.ids : [];
		for (const id of prev) if (!next.ids.includes(id)) press(id, false);
		for (const id of next.ids) if (!prev.includes(id)) press(id, true);
		B.cur = next;
		B.holdLeft = rand(HOLD[0], HOLD[1]);
	};

	const releaseAll = () => { if (B.cur) for (const id of B.cur.ids) press(id, false); B.cur = null; };

	// Miniature 8×6 en 8 niveaux de gris : la « vision » du bot.
	const thumbCanvas = new OffscreenCanvas(8, 6);
	const thumbCtx = thumbCanvas.getContext('2d', { willReadFrequently: true });
	const look = async () => {
		const png = await gm().screenshot();
		if (!png) return null;
		const blob = new Blob([png], { type: 'image/png' });
		const bmp = await createImageBitmap(blob);
		thumbCtx.drawImage(bmp, 0, 0, 8, 6);
		bmp.close();
		const d = thumbCtx.getImageData(0, 0, 8, 6).data;
		let key = '';
		for (let k = 0; k < d.length; k += 4) key += ((d[k] * 3 + d[k + 1] * 6 + d[k + 2]) / 10 / 32 | 0);
		return { key, blob };
	};

	const evictIfNeeded = () => {
		while (B.stateBytes > BUDGET) {
			let worst = null;
			for (const c of B.cells.values()) if (c.state && (!worst || c.visits > worst.visits)) worst = c;
			if (!worst) break;
			B.stateBytes -= worst.state.length;
			worst.state = null;
		}
	};

	const onSample = async () => {
		B.pending = true;
		try {
			const seen = await look();
			if (!B.on || !seen) return;
			const cell = B.cells.get(seen.key);
			if (!cell) {
				const state = gm().getState().slice();
				B.cells.set(seen.key, { key: seen.key, state, visits: 0, found: B.frames });
				B.stateBytes += state.length;
				evictIfNeeded();
				B.newCells++;
				B.stuck = 0;
				learn(B.cur, 1);
				B.recent.unshift(URL.createObjectURL(seen.blob));
				while (B.recent.length > 4) URL.revokeObjectURL(B.recent.pop());
			} else {
				cell.visits++;
				learn(B.cur, -0.05);
				B.stuck = seen.key === B.lastKey ? B.stuck + 1 : 0;
			}
			B.lastKey = seen.key;
			render();
		} catch (error) {
			log('bot : regard impossible', error.message);
		} finally {
			B.pending = false;
		}
	};

	// Nouvel essai : repart d'un endroit peu visité (les endroits les plus récents sont un peu favorisés).
	const newEpisode = () => {
		releaseAll();
		B.episodes++;
		B.episodeLeft = rand(EPISODE[0], EPISODE[1]);
		B.stuck = 0;
		const options = [...B.cells.values()].filter(c => c.state);
		if (!options.length) return;
		const w = options.map(c => 1 / Math.sqrt(1 + c.visits) + c.found / Math.max(1, B.frames) * 0.5);
		let r = Math.random() * w.reduce((a, b) => a + b, 0);
		let chosen = options[options.length - 1];
		for (let k = 0; k < w.length; k++) { r -= w[k]; if (r <= 0) { chosen = options[k]; break; } }
		chosen.visits++;
		gm().loadState(chosen.state);
	};

	const onFrame = (f) => {
		if (!B.on) return;
		const step = B.lastFrame < 0 ? 1 : Math.max(0, f - B.lastFrame);
		B.lastFrame = f;
		if (!step) return;
		B.frames += step;
		B.holdLeft -= step;
		B.episodeLeft -= step;
		if (B.episodeLeft <= 0 || B.stuck >= 6) { newEpisode(); return; }
		if (B.holdLeft <= 0 || !B.cur) setAction(pick());
		if (!B.pending && f - B.lastSample >= SAMPLE_EVERY) { B.lastSample = f; onSample(); }
	};

	// ---------- Panneau du bot ----------

	const render = () => {
		if (!B.panel) return;
		const top = [...B.actions].sort((a, b) => (B.q[b.key] || 0) - (B.q[a.key] || 0)).slice(0, 3);
		const stored = [...B.cells.values()].filter(c => c.state).length;
		B.panel.querySelector('.bot-stats').innerHTML = `
			<span>Écrans découverts</span><b>${B.cells.size}</b>
			<span>Essais</span><b>${B.episodes}</b>
			<span>Temps de jeu du bot</span><b>${Math.round(B.frames / 60)} s</b>
			<span>Points de reprise</span><b>${stored}</b>`;
		B.panel.querySelector('.bot-top').innerHTML = top.map(a => `<span class="bot-act">${esc(a.label)} <i>${(B.q[a.key] || 0).toFixed(2)}</i></span>`).join('') || '<span class="bot-muted">rien appris pour l’instant</span>';
		B.panel.querySelector('.bot-shots').innerHTML = B.recent.map(u => `<img src="${u}" alt="">`).join('');
	};

	const buildPanel = () => {
		const el = document.createElement('div');
		el.className = 'bot hidden';
		el.innerHTML = `
			<div class="bot-head"><span class="bot-title">🤖 BOT APPRENTI</span><span class="bot-key">Ctrl+B</span></div>
			<div class="bot-stats"></div>
			<div class="bot-label">Actions qui marchent le mieux</div>
			<div class="bot-top"></div>
			<div class="bot-label">Derniers écrans découverts</div>
			<div class="bot-shots"></div>
			<div class="bot-actions">
				<button class="pbtn sm" data-bot="speed">Vitesse ×<span class="bot-speed">3</span></button>
				<button class="pbtn sm" data-bot="stay">Arrêter ici</button>
				<button class="pbtn sm primary" data-bot="stop">Arrêter</button>
			</div>
			<div class="bot-muted">Il apprend à explorer, pas à finir le jeu. Touche une touche pour reprendre la main.</div>`;
		el.addEventListener('click', (e) => {
			const b = e.target.closest('[data-bot]');
			if (!b) return;
			if (b.dataset.bot === 'stop') stop({ stay: false });
			if (b.dataset.bot === 'stay') stop({ stay: true });
			if (b.dataset.bot === 'speed') { B.speed = B.speed === 3 ? 1 : 3; el.querySelector('.bot-speed').textContent = B.speed; applySpeed(B.speed); }
		});
		document.body.appendChild(el);
		return el;
	};

	// ---------- Marche / arrêt ----------

	const start = async () => {
		if (B.on || !st.started) return;
		if (!window.smashInputs || !window.smashInputs.install()) { toast('Bot indisponible pour ce jeu.', { error: true }); return; }
		if (st.paused) { toast('Reprends la partie avant de lancer le bot.', { error: true }); return; }
		if (window.smashInputs.movieMode) { toast('Termine le film d’entrées en cours d’abord.', { error: true }); return; }
		try { B.buttons = await smashEmu.buttons(); } catch { B.buttons = []; }
		if (!B.buttons.length) { toast('Boutons de la console inconnus : bot indisponible.', { error: true }); return; }
		B.actions = buildActions(B.buttons);
		try { B.memory = await smashEmu.botMemory(); } catch { B.memory = null; }
		B.q = (B.memory && B.memory.q) || {};
		Object.assign(B, { cells: new Map(), episodes: 0, frames: 0, newCells: 0, stateBytes: 0, cur: null, holdLeft: 0, lastSample: -1, lastFrame: -1, stuck: 0, lastKey: null });
		B.preState = gm().getState().slice();
		// Point de départ : l'endroit actuel.
		B.cells.set('départ', { key: 'départ', state: B.preState, visits: 0, found: 0 });
		B.stateBytes = B.preState.length;
		B.episodeLeft = rand(EPISODE[0], EPISODE[1]);
		st.botActive = true;
		B.on = true;
		B.panel = B.panel || buildPanel();
		B.panel.classList.remove('hidden');
		B.panel.querySelector('.bot-speed').textContent = B.speed;
		applySpeed(B.speed);
		B.offs = [
			window.smashInputs.onFrame(onFrame),
			// La première touche du joueur arrête le bot et lui rend la main.
			window.smashInputs.observe((p, i, v) => { if (v && B.on) stop({ stay: false, reason: 'Tu as repris la main : bot arrêté.' }); }),
		];
		const known = Object.keys(B.q).length;
		toast(`🤖 Bot apprenti lancé${known ? ` (il se souvient de ${known} actions)` : ''} · Ctrl+B pour l’arrêter`, { ms: 4500 });
		render();
	};

	const stop = async ({ stay = false, reason = '' } = {}) => {
		if (!B.on) return;
		B.on = false;
		for (const off of B.offs) off();
		B.offs = [];
		releaseAll();
		const last = stay ? null : gm().getState().slice();
		if (!stay && B.preState) gm().loadState(B.preState);
		st.botActive = false;
		applySpeed(st.speed);
		if (B.panel) B.panel.classList.add('hidden');
		const mem = B.memory || {};
		smashEmu.setBotMemory({ q: B.q, cells: (mem.cells || 0) + B.cells.size, frames: (mem.frames || 0) + B.frames, sessions: (mem.sessions || 0) + 1 }).catch(() => {});
		const summary = `${B.cells.size} écrans découverts en ${Math.round(B.frames / 60)} s de jeu`;
		if (stay) toast(`Bot arrêté là où il est arrivé (${summary}).`, { ms: 5000 });
		else {
			toast(`${reason || 'Bot arrêté'} Retour où tu étais (${summary}) · <a>aller où il est arrivé</a>`, { ms: 7000, onClick: () => { if (last) gm().loadState(last); } });
		}
		B.cells = new Map();
		B.preState = null;
		B.stateBytes = 0;
	};

	window.smashBot = {
		get on() { return B.on; },
		toggle: () => (B.on ? stop({ stay: false }) : start()),
		stopForClose: () => (B.on ? stop({ stay: false }) : null),
	};

	const previous = window.smashKey;
	window.smashKey = (e) => {
		if (e.ctrlKey && !e.altKey && (e.key === 'b' || e.key === 'B') && !e.repeat) { e.preventDefault(); e.stopPropagation(); window.smashBot.toggle(); return true; }
		return previous ? previous(e) : false;
	};
})();
