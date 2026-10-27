/* global smashAssist */
// Panneau « Indices et succès » des fenêtres de jeu (lecteur intégré et émulateurs externes), ouvert à droite avec
// Ctrl+I ou le bouton de la barre. Indices : conversation avec l'assistant (Claude), qui voit l'image du jeu et
// répond au niveau d'aide choisi. Succès : succès RetroAchievements du jeu, un bouton « Indice » par succès, et une
// alerte quand l'un d'eux vient d'être débloqué.
window.SmashAssist = (() => {
	const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
	// Texte de l'assistant : gras **…** et retours à la ligne, le reste échappé.
	const rich = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
	const LEVELS = [[1, 'Coup de pouce'], [2, 'Indice précis'], [3, 'Solution']];
	const QUICK = ['Que dois-je faire maintenant ?', 'Où aller ensuite ?', 'Comment battre cet ennemi ?', 'Je suis bloqué ici.'];
	const POLL_MS = 90000;
	const money = n => (n < 0.01 ? '< 0,01 $' : `${n.toFixed(2).replace('.', ',')} $`);

	const STYLE = `
	#sa { position: fixed; top: 50px; right: 0; bottom: 0; width: 380px; z-index: 60; display: flex; flex-direction: column; background: rgba(12, 12, 16, 0.96); border-left: 2px solid var(--brand, #e60012); color: #e9e9ee; font: 13px/1.45 Inter, system-ui, sans-serif; box-shadow: -18px 0 40px rgba(0, 0, 0, 0.45); transform: translateX(0); transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1); }
	#sa.hidden { transform: translateX(105%); pointer-events: none; }
	#sa button { font: inherit; cursor: pointer; }
	.sa-head { display: flex; align-items: center; gap: 6px; padding: 10px 10px 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
	.sa-tab { border: none; background: transparent; color: #b9b9c0; padding: 7px 11px; border-radius: 9px; font-weight: 700; }
	.sa-tab.on { background: rgba(var(--brand-rgb, 230, 0, 18), 0.22); color: var(--brand, #ff4d5e); }
	.sa-x { margin-left: auto; border: none; background: rgba(255, 255, 255, 0.07); color: #fff; width: 30px; height: 30px; border-radius: 9px; }
	.sa-body { flex: 1; min-height: 0; overflow-y: auto; padding: 12px; }
	.sa-msg { margin-bottom: 10px; padding: 9px 11px; border-radius: 12px; white-space: normal; word-wrap: break-word; }
	.sa-msg.me { margin-left: 34px; background: rgba(var(--brand-rgb, 230, 0, 18), 0.22); }
	.sa-msg.ai { margin-right: 18px; background: rgba(255, 255, 255, 0.06); }
	.sa-msg.err { background: rgba(255, 77, 94, 0.15); color: #ff8a95; }
	.sa-msg small { display: block; margin-top: 6px; color: #8c8c96; font-size: 11px; }
	.sa-lvl { display: inline-block; margin-bottom: 4px; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.75; }
	.sa-dots::after { content: '…'; animation: saBlink 1s infinite; }
	@keyframes saBlink { 50% { opacity: 0.2; } }
	.sa-empty { padding: 18px 6px; color: #a3a3ad; text-align: center; }
	.sa-empty b { color: #fff; }
	.sa-foot { padding: 10px; border-top: 1px solid rgba(255, 255, 255, 0.08); display: flex; flex-direction: column; gap: 8px; }
	.sa-chips { display: flex; flex-wrap: wrap; gap: 5px; }
	.sa-chip { border: 1px solid rgba(255, 255, 255, 0.14); background: transparent; color: #cfcfd6; padding: 4px 9px; border-radius: 999px; font-size: 12px; }
	.sa-chip.on { background: var(--brand, #e60012); border-color: transparent; color: #fff; }
	.sa-row { display: flex; gap: 6px; align-items: flex-end; }
	.sa-in { flex: 1; resize: none; height: 54px; background: rgba(0, 0, 0, 0.4); color: #fff; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 10px; padding: 8px 10px; font: inherit; }
	.sa-in:focus { outline: none; border-color: var(--brand, #e60012); }
	.sa-send { border: none; background: var(--brand, #e60012); color: #fff; height: 54px; padding: 0 14px; border-radius: 10px; font-weight: 700; }
	.sa-send:disabled { opacity: 0.5; cursor: default; }
	.sa-opts { display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; color: #9a9aa4; }
	.sa-opts label { display: flex; gap: 5px; align-items: center; cursor: pointer; }
	.sa-link { border: none; background: none; color: #9a9aa4; text-decoration: underline; padding: 0; }
	.sa-game { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; }
	.sa-game img { width: 48px; height: 48px; border-radius: 10px; }
	.sa-game b { display: block; color: #fff; font-size: 14px; }
	.sa-bar { height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.1); overflow: hidden; margin: 6px 0 4px; }
	.sa-bar i { display: block; height: 100%; background: linear-gradient(90deg, #f4b400, #ffd54a); }
	.sa-note { margin: 8px 0 12px; padding: 8px 10px; border-radius: 10px; background: rgba(244, 180, 0, 0.1); color: #e7c56b; font-size: 12px; }
	.sa-ach { display: flex; gap: 10px; align-items: center; padding: 8px; border-radius: 12px; margin-bottom: 6px; background: rgba(255, 255, 255, 0.04); }
	.sa-ach img { width: 44px; height: 44px; border-radius: 8px; flex-shrink: 0; background: #000; }
	.sa-ach.got { background: rgba(244, 180, 0, 0.1); }
	.sa-ach .t { flex: 1; min-width: 0; }
	.sa-ach .t b { display: block; color: #fff; }
	.sa-ach .t span { display: block; color: #a3a3ad; font-size: 12px; }
	.sa-ach .p { font-weight: 700; color: #f4b400; font-size: 12px; }
	.sa-ach button { border: none; background: rgba(255, 255, 255, 0.08); color: #fff; padding: 5px 9px; border-radius: 8px; font-size: 11.5px; }
	.sa-filter { display: flex; gap: 5px; margin-bottom: 10px; }
	`;

	const create = ({ toast = () => {}, getImage = null, onToggle = () => {} } = {}) => {
		const api = window.smashAssist;
		const s = { open: false, tab: 'hints', info: null, msgs: [], level: 1, withImage: true, busy: false, ra: null, raError: null, filter: 'todo', live: '' };
		const style = document.createElement('style');
		style.textContent = STYLE;
		document.head.appendChild(style);
		const el = document.createElement('aside');
		el.id = 'sa';
		el.className = 'hidden';
		document.body.appendChild(el);

		const hintsBody = () => {
			const i = s.info;
			if (!i.hints.ready) return `<div class="sa-empty">Pour poser des questions à l’assistant, ajoute ta <b>clé API Anthropic</b> dans Smash Emu : page <b>Succès et indices</b> (barre du bas).<br><br>Chaque question coûte environ un centime avec Claude Opus 5.5.</div>`;
			if (!s.msgs.length) return `<div class="sa-empty">Bloqué dans <b>${esc(i.game.name)}</b> ? Pose ta question : l’assistant voit l’image du jeu et cherche dans les soluces si besoin.<br><br>Choisis le niveau d’aide : un simple <b>coup de pouce</b>, un <b>indice précis</b>, ou la <b>solution</b>.</div>`;
			return s.msgs.map(m => `<div class="sa-msg ${m.who}">${m.who === 'me' ? `<span class="sa-lvl">${esc(LEVELS.find(l => l[0] === m.level)[1])}</span><br>` : ''}${m.who === 'ai' && !m.text ? '<span class="sa-dots">Réflexion</span>' : rich(m.text)}${m.sources && m.sources.length ? `<small>Sources : ${m.sources.map(x => esc((x.url.match(/^https?:\/\/([^/]+)/) || [])[1] || x.url)).join(', ')}</small>` : ''}${m.cost != null ? `<small>Coût : ${money(m.cost)}</small>` : ''}</div>`).join('');
		};

		const hintsFoot = () => (!s.info.hints.ready ? '' : `<div class="sa-chips">${LEVELS.map(([v, l]) => `<button class="sa-chip ${s.level === v ? 'on' : ''}" data-level="${v}">${l}</button>`).join('')}</div>
			${s.msgs.length ? '' : `<div class="sa-chips">${QUICK.map(q => `<button class="sa-chip" data-quick="${esc(q)}">${esc(q)}</button>`).join('')}</div>`}
			<div class="sa-row"><textarea class="sa-in" id="sa-in" placeholder="Ta question… (Entrée pour envoyer)" ${s.busy ? 'disabled' : ''}></textarea><button class="sa-send" data-send ${s.busy ? 'disabled' : ''}>Envoyer</button></div>
			<div class="sa-opts"><label><input type="checkbox" data-img ${s.withImage ? 'checked' : ''}>Joindre l’image du jeu</label>${s.msgs.length ? '<button class="sa-link" data-reset>Nouvelle conversation</button>' : ''}</div>`);

		const raBody = () => {
			const i = s.info;
			if (!i.raSupported) return '<div class="sa-empty">Cette console n’a pas de succès RetroAchievements.</div>';
			if (!i.ra.ready) return '<div class="sa-empty">Connecte ton compte <b>RetroAchievements</b> dans Smash Emu : page <b>Succès et indices</b> (barre du bas). Il faut ton nom d’utilisateur et ta clé d’API web (gratuite).</div>';
			if (s.raError) return `<div class="sa-msg err">${esc(s.raError)}</div>`;
			if (!s.ra) return '<div class="sa-empty"><span class="sa-dots">Chargement des succès</span></div>';
			if (s.ra === 'none') return '<div class="sa-empty">Ce jeu n’a pas été reconnu par RetroAchievements. Associe-le au bon jeu dans Smash Emu : page <b>Succès et indices</b>.</div>';
			const r = s.ra;
			const pct = r.total ? Math.round((r.earned / r.total) * 100) : 0;
			const list = r.achievements.filter(a => (s.filter === 'todo' ? !a.earned : s.filter === 'got' ? a.earned : true));
			return `<div class="sa-game">${r.game.icon ? `<img src="${esc(r.game.icon)}" alt="">` : ''}<div><b>${esc(r.game.title)}</b><span>${r.earned} / ${r.total} succès · ${r.myPoints} / ${r.points} points</span></div></div>
				<div class="sa-bar"><i style="width:${pct}%"></i></div>
				${r.total ? '' : '<div class="sa-note">Ce jeu n’a pas encore de succès sur RetroAchievements.</div>'}
				<div class="sa-note">Les succès se débloquent dans un émulateur approuvé par RetroAchievements (${esc(r.unlockers)}), connecté à ton compte. Smash Emu te prévient dès qu’un succès tombe.</div>
				<div class="sa-filter">${[['todo', 'À débloquer'], ['got', 'Débloqués'], ['all', 'Tous']].map(([k, l]) => `<button class="sa-chip ${s.filter === k ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('')}</div>
				${list.map(a => `<div class="sa-ach ${a.earned ? 'got' : ''}"><img src="${esc(a.earned ? a.badge : a.locked)}" alt="" loading="lazy"><div class="t"><b>${esc(a.title)}</b><span>${esc(a.desc)}</span></div>
					<div style="text-align:right"><div class="p">${a.points} pts</div>${a.earned ? '' : `<button data-hint-ach="${a.id}">Indice</button>`}</div></div>`).join('') || '<div class="sa-empty">Rien ici.</div>'}`;
		};

		const render = () => {
			if (!s.info) { el.innerHTML = '<div class="sa-body"><div class="sa-empty"><span class="sa-dots">Chargement</span></div></div>'; return; }
			const body = el.querySelector('.sa-body');
			const scroll = body && s.tab === 'hints' && body.scrollTop + body.clientHeight >= body.scrollHeight - 30;
			const draft = (el.querySelector('#sa-in') || {}).value || '';
			const r = s.ra && s.ra !== 'none' ? ` ${s.ra.earned}/${s.ra.total}` : '';
			el.innerHTML = `<div class="sa-head"><button class="sa-tab ${s.tab === 'hints' ? 'on' : ''}" data-tab="hints">Indices</button><button class="sa-tab ${s.tab === 'ra' ? 'on' : ''}" data-tab="ra">Succès${r}</button><button class="sa-x" data-close title="Fermer (Ctrl+I)">✕</button></div>
				<div class="sa-body">${s.tab === 'hints' ? hintsBody() : raBody()}</div>
				${s.tab === 'hints' ? `<div class="sa-foot">${hintsFoot()}</div>` : ''}`;
			const nb = el.querySelector('.sa-body');
			if (s.tab === 'hints' && (scroll || s.busy)) nb.scrollTop = nb.scrollHeight;
			const input = el.querySelector('#sa-in');
			if (input) { input.value = draft; if (s.open && !s.busy) input.focus(); }
		};

		const loadRa = async (fresh = false) => {
			if (!s.info || !s.info.ra.ready || !s.info.raSupported) return;
			if (fresh) s.ra = null;
			try { s.ra = (await api.progress()) || 'none'; s.raError = null; } catch (error) { s.raError = error.message; }
			if (s.open) render();
		};

		const send = async (text) => {
			const q = String(text || '').trim();
			if (!q || s.busy) return;
			s.busy = true;
			s.msgs.push({ who: 'me', text: q, level: s.level });
			const ai = { who: 'ai', text: '' };
			s.msgs.push(ai);
			s.live = '';
			render();
			try {
				let image = null;
				if (s.withImage && getImage) { try { image = await getImage(); } catch { /* sans image */ } }
				const r = await api.ask({ text: q, level: s.level, image, withImage: s.withImage });
				ai.text = r.text || s.live;
				ai.sources = r.sources;
				ai.cost = r.cost;
			} catch (error) {
				ai.who = 'ai err';
				ai.text = error.message;
			}
			s.busy = false;
			render();
		};

		api.onDelta((d) => {
			const ai = s.msgs[s.msgs.length - 1];
			if (!s.busy || !ai || ai.who !== 'ai') return;
			s.live += d;
			ai.text = s.live;
			const body = el.querySelector('.sa-body');
			const last = body && body.lastElementChild;
			if (last && s.tab === 'hints') { last.innerHTML = rich(ai.text); body.scrollTop = body.scrollHeight; }
		});

		el.addEventListener('click', (e) => {
			const t = e.target;
			const b = t.closest('button, input');
			if (!b) return;
			if (b.dataset.close !== undefined) { toggle(false); return; }
			if (b.dataset.tab) { s.tab = b.dataset.tab; if (s.tab === 'ra' && !s.ra) loadRa(); render(); return; }
			if (b.dataset.level) { s.level = +b.dataset.level; render(); return; }
			if (b.dataset.quick) { send(b.dataset.quick); return; }
			if (b.dataset.send !== undefined) { send((el.querySelector('#sa-in') || {}).value); return; }
			if (b.dataset.img !== undefined) { s.withImage = b.checked; return; }
			if (b.dataset.reset !== undefined) { api.reset().catch(() => {}); s.msgs = []; render(); return; }
			if (b.dataset.filter) { s.filter = b.dataset.filter; render(); return; }
			if (b.dataset.hintAch) {
				const a = s.ra.achievements.find(x => String(x.id) === b.dataset.hintAch);
				if (!a) return;
				s.tab = 'hints';
				send(`Comment débloquer le succès RetroAchievements « ${a.title} » : ${a.desc} ?`);
			}
		});
		// Taper une question n'envoie rien au jeu ; Entrée envoie, Maj+Entrée va à la ligne, Échap ferme.
		el.addEventListener('keydown', (e) => {
			e.stopPropagation();
			if (e.key === 'Escape') { toggle(false); return; }
			if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'sa-in') { e.preventDefault(); send(e.target.value); }
		});
		el.addEventListener('keyup', e => e.stopPropagation());

		// Nouveaux succès : vérifiés toutes les 90 s pendant la partie (débloqués par l'émulateur, vus par l'API).
		let timer = null;
		const startPolling = () => {
			if (timer || !s.info || !s.info.ra.ready || !s.info.raSupported) return;
			api.poll().catch(() => {});
			timer = setInterval(async () => {
				try {
					const fresh = await api.poll();
					for (const a of fresh) toast(`🏆 Succès débloqué : <b>${esc(a.title)}</b> (+${a.points} points, +10 pièces)`);
					if (fresh.length) loadRa(true);
				} catch { /* réseau indisponible : on réessaie au prochain tour */ }
			}, POLL_MS);
		};

		const init = async () => {
			try { s.info = await api.info(); } catch { return; }
			startPolling();
			if (s.open) render();
		};

		const toggle = (open = !s.open) => {
			s.open = open;
			el.classList.toggle('hidden', !open);
			onToggle(open);
			if (open) {
				render();
				api.info().then((i) => { s.info = i; startPolling(); render(); }).catch(() => {});
				if (s.tab === 'ra' && !s.ra) loadRa();
			}
		};

		// Retour dans la fenêtre du jeu (clé ou compte réglé entre-temps dans Smash Emu) : réglages relus.
		window.addEventListener('focus', () => {
			if (!s.open) return;
			api.info().then((i) => { const changed = JSON.stringify(i.hints) !== JSON.stringify(s.info && s.info.hints) || JSON.stringify(i.ra) !== JSON.stringify(s.info && s.info.ra); s.info = i; startPolling(); if (changed) { s.ra = null; render(); if (s.tab === 'ra') loadRa(); } }).catch(() => {});
		});

		// Ctrl+I depuis la fenêtre (le lecteur intégré la reçoit ; les émulateurs externes passent par le raccourci global).
		window.addEventListener('keydown', (e) => {
			if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); e.stopPropagation(); toggle(); }
		}, true);

		init();
		return { toggle, get open() { return s.open; }, el };
	};

	return { create };
})();
