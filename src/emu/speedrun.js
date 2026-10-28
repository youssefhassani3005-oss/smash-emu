// Mode speedrun : chrono en temps réel découpé en segments, comparé au record personnel, avec les meilleurs
// segments (en or) et les derniers essais. Commun au lecteur intégré et aux émulateurs externes : la page donne
// de quoi lire et enregistrer les données, l'élément où afficher le chrono et ses notifications.
// En plus : course contre un ami (prêt, compte à rebours, temps envoyé à la fin) et fin automatique quand le jeu
// affiche l'écran de fin enregistré (signature 32×18 de l'image comparée toutes les 2 s).
// Règles des classements : la pause de Smash Emu arrête le chrono ; vitesse modifiée, retour arrière ou état chargé
// rendent l'essai « assisté » : il est chronométré mais ne compte ni pour le record ni pour une course.
window.SmashSpeedrun = (() => {
	const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
	const p2 = n => String(n).padStart(2, '0');
	const fmt = (ms, sign = false) => {
		const t = Math.abs(ms);
		const h = Math.floor(t / 3600000), m = Math.floor(t / 60000) % 60, s = Math.floor(t / 1000) % 60, c = Math.floor(t / 10) % 100;
		const body = h ? `${h}:${p2(m)}:${p2(s)}` : m ? `${m}:${p2(s)}` : `${s}`;
		return `${sign ? (ms < 0 ? '−' : '+') : ''}${body},${p2(c)}`;
	};
	const blank = () => ({ on: false, splits: ['Fin'], pb: null, best: [], attempts: 0, runs: [], endSig: null, endAuto: false });
	const seg = (times, i) => times[i] - (i ? times[i - 1] : 0);
	const KEYS = '<b>Ctrl+Espace</b> départ / segment suivant · <b>Ctrl+Retour arrière</b> annuler le segment · <b>Ctrl+Maj+Espace</b> remettre à zéro<br>La pause de Smash Emu arrête le chrono. Vitesse modifiée, retour arrière ou état chargé : essai « assisté », hors record et hors course.';
	const SAMPLE_MS = 2000;
	const MATCH = 10;
	const MIN_SPREAD = 12;

	// Distance moyenne entre deux signatures (0 = identiques, 255 = opposées).
	const sigDistance = (a, b) => {
		const x = atob(a);
		const y = atob(b);
		if (x.length !== y.length || !x.length) return 255;
		let d = 0;
		for (let i = 0; i < x.length; i++) d += Math.abs(x.charCodeAt(i) - y.charCodeAt(i));
		return d / x.length;
	};

	const create = ({ load, save, el, toast = () => {}, onToggle = () => {}, onChange = () => {}, race = null, frameSig = null }) => {
		let data = blank();
		const run = { state: 'idle', t0: 0, times: [], last: null, pausedAt: 0, assist: null };
		let ticker = null;
		let watcher = null;
		let raceView = null;
		let countdown = null;
		const persist = () => Promise.resolve(save(data)).catch(() => {});
		// Temps de l'essai, sans les pauses de Smash Emu.
		const now = () => (run.pausedAt || performance.now()) - run.t0;
		const elapsed = () => (run.state === 'running' ? now() : run.state === 'done' ? run.times[run.times.length - 1] : 0);
		const clearRun = () => Object.assign(run, { state: 'idle', times: [], last: null, pausedAt: 0, assist: null });
		const racing = () => !!(raceView && ['accepted', 'countdown', 'running'].includes(raceView.state));
		const visible = () => data.on || racing() || (raceView && raceView.state === 'done');

		const deltaOf = (i) => {
			const pb = data.pb && data.pb.times[i];
			if (pb == null) return null;
			const d = run.times[i] - pb;
			const s = seg(run.times, i);
			const gold = !run.assist && s > 0 && (data.best[i] == null || s < data.best[i]);
			return { d, cls: gold ? 'gold' : d <= 0 ? 'ahead' : 'behind' };
		};

		const raceLabel = () => {
			const r = raceView;
			if (!r) return '';
			if (r.state === 'accepted') return r.me.ready ? `En attente de ${r.friend.name}…` : `Course contre ${r.friend.name} · Ctrl+Espace : prêt`;
			if (r.state === 'countdown') return `Course contre ${r.friend.name}`;
			if (r.state === 'running') return r.them.ms != null ? `${r.friend.name} a fini en ${fmt(r.them.ms)} !` : `contre ${r.friend.name}`;
			if (r.state === 'done') return r.winner === 'me' ? 'Victoire !' : r.winner === 'them' ? `${r.friend.name} gagne` : r.winner === 'tie' ? 'Égalité' : 'Course terminée';
			return '';
		};

		const render = () => {
			if (!el) return;
			el.classList.toggle('hidden', !visible());
			el.classList.toggle('race', racing());
			if (!visible()) return;
			if (countdown !== null) {
				el.innerHTML = `<span class="sr-name">${esc(raceLabel())}</span><b class="sr-time sr-count">${countdown || 'GO !'}</b>`;
				return;
			}
			const i = Math.min(run.times.length, data.splits.length - 1);
			const t = elapsed();
			let delta = '';
			const pbHere = data.pb && data.pb.times[run.times.length];
			if (run.state === 'running' && pbHere != null && t > pbHere) delta = `<i class="behind">${fmt(t - pbHere, true)}</i>`;
			else if (run.last) delta = `<i class="${run.last.cls}">${fmt(run.last.d, true)}</i>`;
			const label = raceLabel();
			const name = label && run.state !== 'running' ? label : run.state === 'idle' ? 'Prêt' : run.state === 'done' ? 'Terminé' : data.splits[i];
			const state = run.state === 'running' ? (pbHere != null && t > pbHere ? 'behind' : 'run') : run.state;
			const flags = `${run.pausedAt && run.state === 'running' ? '<i class="sr-flag">⏸ pause</i>' : ''}${run.assist && run.state !== 'idle' ? `<i class="sr-flag assist" title="${esc(run.assist)}">assisté</i>` : ''}`;
			el.innerHTML = `${racing() && run.state === 'running' ? `<span class="sr-vs">${esc(label)}</span>` : ''}<span class="sr-name">${esc(name)}${data.splits.length > 1 && run.state === 'running' ? ` <small>${i + 1}/${data.splits.length}</small>` : ''}</span><b class="sr-time ${state}">${fmt(t)}</b>${delta}${flags}`;
			el.dataset.tip = run.state === 'idle' ? 'Speedrun : Ctrl+Espace pour partir' : 'Ctrl+Espace : segment suivant · Ctrl+Maj+Espace : remettre à zéro';
		};
		// Centièmes : affichage rafraîchi à chaque image de l'écran (toutes les 30 ms sans requestAnimationFrame).
		const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : fn => setTimeout(fn, 30);
		const caf = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
		const tick = (on) => {
			if (ticker) caf(ticker);
			ticker = null;
			if (!on) return;
			const loop = () => { render(); ticker = raf(loop); };
			ticker = raf(loop);
		};

		// Fin automatique : l'image du jeu ressemble à l'écran de fin enregistré deux fois de suite.
		const watch = (on) => {
			clearInterval(watcher);
			watcher = null;
			if (!on || !frameSig || !data.endAuto || !data.endSig) return;
			let hits = 0;
			watcher = setInterval(async () => {
				if (run.state !== 'running') return;
				let cur = null;
				try { cur = await frameSig(); } catch { return; }
				if (!cur || !cur.sig) return;
				hits = sigDistance(cur.sig, data.endSig) < MATCH ? hits + 1 : 0;
				if (hits >= 2 && run.state === 'running') { toast('Écran de fin reconnu : chrono arrêté'); api.finish(); }
			}, SAMPLE_MS);
		};

		// Fin d'un essai, terminé ou abandonné : meilleurs segments (les segments vides ne comptent pas), record,
		// historique, et temps envoyé à l'ami pendant une course.
		const record = (complete) => {
			if (!run.assist) run.times.forEach((t, i) => { const s = seg(run.times, i); if (s > 0 && (data.best[i] == null || s < data.best[i])) data.best[i] = s; });
			data.runs.unshift({ at: Date.now(), times: run.times.slice(), complete, ...(run.assist ? { assist: run.assist } : {}) });
			data.runs = data.runs.slice(0, 20);
			const total = run.times[run.times.length - 1];
			const pb = complete && !run.assist && (!data.pb || total < data.pb.times[data.pb.times.length - 1]);
			if (pb) data.pb = { times: run.times.slice(), at: Date.now() };
			persist();
			if (complete && race && raceView && raceView.state === 'running') {
				// Course : un essai assisté vaut un abandon.
				if (run.assist) race.forfeit().then(v => v && api.setRace(v)).catch(() => {});
				else race.finish(Math.round(total)).catch(() => {});
			}
			return pb;
		};

		const begin = (t0 = performance.now()) => {
			Object.assign(run, { state: 'running', t0, times: [], last: null, pausedAt: 0, assist: null });
			data.attempts += 1;
			persist();
			tick(true);
			watch(true);
		};
		const end = () => {
			run.state = 'done';
			tick(false);
			watch(false);
			const pb = record(true);
			const total = fmt(run.times[run.times.length - 1]);
			toast(pb ? `Nouveau record : ${total} !` : run.assist ? `Terminé en ${total} (essai assisté : ${run.assist}, hors record)` : `Terminé en ${total}`);
		};

		const api = {
			get on() { return data.on; },
			get state() { return run.state; },
			get data() { return data; },
			async init() {
				try { data = { ...blank(), ...((await load()) || {}) }; } catch { data = blank(); }
				render();
				onToggle(data.on);
				if (race) { try { api.setRace(await race.get()); } catch { /* pas de course */ } }
			},
			// Départ forcé (course) même si le chrono n'est pas activé pour ce jeu.
			start(t0) {
				if (run.state === 'running') return false;
				begin(t0);
				render();
				return true;
			},
			split() {
				// Course acceptée : Ctrl+Espace veut dire « prêt ».
				if (racing() && raceView.state === 'accepted') {
					if (!raceView.me.ready) { race.ready().then(v => v && api.setRace(v)).catch(e => toast(e.message)); toast('Prêt ! Le départ est donné quand ton ami l’est aussi.'); }
					return true;
				}
				if (racing() && raceView.state === 'countdown') return true;
				if (!data.on && !racing()) return false;
				if (run.state === 'idle') {
					if (racing()) return true; // le départ d'une course est donné par le compte à rebours
					begin();
					toast(`Speedrun : c’est parti ! (essai ${data.attempts})`);
				} else if (run.state === 'running') {
					run.times.push(now());
					run.last = deltaOf(run.times.length - 1);
					if (run.times.length >= data.splits.length) end();
				} else {
					clearRun();
				}
				render();
				return true;
			},
			// Pause de Smash Emu (menu pause, bouton de la barre) : le chrono s'arrête avec le jeu.
			pause(on) {
				if (run.state !== 'running') return;
				if (on && !run.pausedAt) run.pausedAt = performance.now();
				else if (!on && run.pausedAt) { run.t0 += performance.now() - run.pausedAt; run.pausedAt = 0; }
				render();
			},
			// Aide qui fausse le temps (vitesse, retour arrière, état chargé) : l'essai continue mais ne compte plus.
			flag(reason) {
				if (run.state !== 'running' || run.assist) return;
				run.assist = String(reason);
				toast(racing() ? `${reason} : essai assisté, la course sera perdue à l’arrivée` : `${reason} : essai assisté, il ne comptera pas pour le record`);
				render();
			},
			// Fin immédiate (écran de fin reconnu) : les segments restants prennent le temps actuel.
			finish() {
				if (run.state !== 'running') return false;
				const t = now();
				while (run.times.length < data.splits.length) run.times.push(t);
				run.last = deltaOf(run.times.length - 1);
				end();
				render();
				return true;
			},
			undo() {
				if (run.state !== 'running' || !run.times.length) return false;
				run.times.pop();
				run.last = run.times.length ? deltaOf(run.times.length - 1) : null;
				render();
				toast('Segment annulé');
				return true;
			},
			reset() {
				if (racing()) { api.forfeit(); return true; }
				if (!data.on) return false;
				if (run.state === 'running' && run.times.length) record(false);
				clearRun();
				tick(false);
				watch(false);
				render();
				toast('Chrono remis à zéro');
				return true;
			},
			forfeit() {
				if (!racing()) return false;
				if (!confirm('Abandonner la course ? Ton ami gagne.')) return false;
				race.forfeit().then(v => v && api.setRace(v)).catch(e => toast(e.message));
				if (run.state === 'running') { if (run.times.length) record(false); clearRun(); tick(false); watch(false); }
				render();
				return true;
			},
			// État de la course envoyé par Smash Emu (invitation acceptée, ami prêt, compte à rebours, résultat).
			setRace(view) {
				const before = raceView;
				raceView = view || null;
				if (raceView && raceView.state === 'countdown' && raceView.goAt && !(before && before.state === 'countdown')) {
					const step = () => {
						const left = raceView && raceView.goAt ? raceView.goAt - Date.now() : 0;
						if (!raceView || !['countdown', 'running'].includes(raceView.state)) { countdown = null; render(); return; }
						if (left > 0) { countdown = Math.ceil(left / 1000); render(); setTimeout(step, Math.min(250, left)); return; }
						countdown = 0;
						render();
						api.start(performance.now() + left);
						setTimeout(() => { countdown = null; render(); }, 700);
					};
					step();
				}
				// Fenêtre ouverte en pleine course : le chrono reprend au départ réel.
				if (raceView && raceView.state === 'running' && run.state === 'idle' && raceView.goAt && raceView.me.ms == null && !raceView.me.forfeit) api.start(performance.now() - (Date.now() - raceView.goAt));
				if (raceView && raceView.state === 'done' && (!before || before.state !== 'done')) {
					toast(raceView.winner === 'me' ? 'Course gagnée : +100 pièces !' : raceView.winner === 'them' ? `${raceView.friend.name} gagne la course` : raceView.winner === 'tie' ? 'Égalité !' : 'Course terminée');
				}
				render();
				onChange();
			},
			// Panneau de réglages et de statistiques (onglet ou fonction du menu).
			panelHtml() {
				const pbTotal = data.pb ? data.pb.times[data.pb.times.length - 1] : null;
				const sob = data.best.length === data.splits.length && data.best.every(b => b != null) ? data.best.reduce((a, b) => a + b, 0) : null;
				const done = data.runs.filter(r => r.complete).length;
				const rows = data.splits.map((s, i) => `<tr><td>${esc(s)}</td><td>${data.pb && data.pb.times[i] != null ? fmt(data.pb.times[i]) : '—'}</td><td class="gold">${data.best[i] != null ? fmt(data.best[i]) : '—'}</td></tr>`).join('');
				const runs = data.runs.slice(0, 6).map(r => `<li><span>${new Date(r.at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span><b>${r.complete ? fmt(r.times[r.times.length - 1]) : `abandon · ${esc(data.splits[r.times.length] || '')}`}${r.assist ? ` <small title="${esc(r.assist)}">assisté</small>` : ''}</b></li>`).join('');
				const raceBox = racing() || (raceView && raceView.state === 'done')
					? `<div class="srp-race"><b>${esc(raceLabel())}</b><span>${esc(raceView.game.n)}</span>${racing() ? '<button class="btn" data-sr="forfeit">Abandonner</button>' : ''}</div>` : '';
				const endBox = frameSig ? `<div class="srp-end"><div class="srp-lbl">Fin automatique <small>le chrono s’arrête tout seul quand le jeu affiche l’écran de fin enregistré</small></div>
					<div class="srp-acts"><button class="btn ${data.endSig ? '' : 'primary'}" data-sr="endcap">${data.endSig ? 'Remplacer par l’image actuelle' : 'Utiliser l’image actuelle comme écran de fin'}</button>
					${data.endSig ? `<button class="chip ${data.endAuto ? 'on' : ''}" data-sr="endauto">Fin automatique : ${data.endAuto ? 'oui' : 'non'}</button><button class="btn" data-sr="endclear">Oublier l’écran de fin</button>` : ''}</div>
					<div class="srp-keys">Atteins la fin du jeu une fois (générique, écran « Fin »…), ouvre ce menu et enregistre l’image. Évite un écran noir ou un fondu : trop d’autres moments lui ressemblent.</div></div>` : '';
				return `<div class="srp">${raceBox}
					<div class="srp-head"><button class="chip ${data.on ? 'on' : ''}" data-sr="toggle">Chrono speedrun : ${data.on ? 'activé' : 'désactivé'}</button>
						<span class="srp-keys">${KEYS}</span></div>
					<div class="srp-stats">
						<div><span>Record perso</span><b>${pbTotal != null ? fmt(pbTotal) : '—'}</b></div>
						<div><span>Somme des meilleurs</span><b class="gold">${sob != null ? fmt(sob) : '—'}</b></div>
						<div><span>Essais</span><b>${data.attempts}</b></div>
						<div><span>Terminés</span><b>${done}</b></div>
					</div>
					<div class="srp-cols">
						<div><div class="srp-lbl">Segments <small>un par ligne (ex. Monde 1, Boss, Fin)</small></div>
							<textarea id="sr-splits" rows="7" spellcheck="false">${esc(data.splits.join('\n'))}</textarea>
							<div class="srp-acts"><button class="btn primary" data-sr="splits">Enregistrer les segments</button><button class="btn" data-sr="clearpb" ${data.pb || data.best.length ? '' : 'disabled'}>Effacer le record</button></div></div>
						<div><table class="srp-table"><thead><tr><th>Segment</th><th>Record</th><th>Meilleur</th></tr></thead><tbody>${rows}</tbody></table>
							${runs ? `<div class="srp-lbl">Derniers essais</div><ul class="srp-runs">${runs}</ul>` : ''}</div>
					</div>${endBox}</div>`;
			},
			// Clic dans le panneau ; renvoie vrai s'il faut le redessiner.
			click(target, root) {
				const b = target.closest('[data-sr]');
				if (!b) return false;
				const act = b.dataset.sr;
				if (act === 'forfeit') return api.forfeit();
				if (act === 'endcap') {
					Promise.resolve(frameSig && frameSig()).then((cur) => {
						if (!cur || !cur.sig) { toast('Image du jeu indisponible : affiche le jeu puis réessaie.'); return; }
						if (cur.spread < MIN_SPREAD) { toast('Image trop unie (écran noir ou fondu) : choisis un écran plus reconnaissable.'); return; }
						data.endSig = cur.sig;
						data.endAuto = true;
						persist();
						toast('Écran de fin enregistré : le chrono s’arrêtera tout seul');
						onChange();
					}).catch(e => toast(e.message));
					return false;
				}
				if (act === 'endauto') data.endAuto = !data.endAuto;
				if (act === 'endclear') { data.endSig = null; data.endAuto = false; }
				if (act === 'toggle') {
					data.on = !data.on;
					if (!data.on && !racing()) { clearRun(); tick(false); watch(false); }
					onToggle(data.on);
					toast(data.on ? 'Chrono speedrun activé : Ctrl+Espace pour partir' : 'Chrono speedrun désactivé');
				}
				if (act === 'splits') {
					const list = root.querySelector('#sr-splits').value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 100);
					const next = list.length ? list : ['Fin'];
					// Nombre de segments changé : les temps ne se comparent plus, record et meilleurs segments repartent.
					if (next.length !== data.splits.length && (data.pb || data.best.length)) {
						if (!confirm('Le nombre de segments change : le record et les meilleurs segments seront effacés. Continuer ?')) return false;
						data.pb = null; data.best = [];
					}
					data.splits = next;
					clearRun();
					tick(false);
					toast('Segments enregistrés');
				}
				if (act === 'clearpb') {
					if (!confirm('Effacer le record et les meilleurs segments de ce jeu ?')) return false;
					data.pb = null; data.best = [];
				}
				persist();
				render();
				return true;
			},
		};
		if (race && race.onRace) race.onRace(v => api.setRace(v));
		return api;
	};

	return { create, fmt, sigDistance };
})();
