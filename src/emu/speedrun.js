// Mode speedrun : chrono en temps réel découpé en segments, comparé au record personnel, avec les meilleurs
// segments (en or) et les derniers essais. Commun au lecteur intégré et aux émulateurs externes : la page donne
// de quoi lire et enregistrer les données, l'élément où afficher le chrono et ses notifications.
window.SmashSpeedrun = (() => {
	const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
	const p2 = n => String(n).padStart(2, '0');
	const fmt = (ms, sign = false) => {
		const t = Math.abs(ms);
		const h = Math.floor(t / 3600000), m = Math.floor(t / 60000) % 60, s = Math.floor(t / 1000) % 60, d = Math.floor(t / 100) % 10;
		const body = h ? `${h}:${p2(m)}:${p2(s)}` : m ? `${m}:${p2(s)}` : `${s}`;
		return `${sign ? (ms < 0 ? '−' : '+') : ''}${body},${d}`;
	};
	const blank = () => ({ on: false, splits: ['Fin'], pb: null, best: [], attempts: 0, runs: [] });
	const seg = (times, i) => times[i] - (i ? times[i - 1] : 0);
	const KEYS = '<b>Ctrl+Espace</b> départ / segment suivant · <b>Ctrl+Retour arrière</b> annuler le segment · <b>Ctrl+Maj+Espace</b> remettre à zéro';

	const create = ({ load, save, el, toast = () => {}, onToggle = () => {} }) => {
		let data = blank();
		const run = { state: 'idle', t0: 0, times: [], last: null };
		let ticker = null;
		const persist = () => Promise.resolve(save(data)).catch(() => {});
		const elapsed = () => (run.state === 'running' ? performance.now() - run.t0 : run.state === 'done' ? run.times[run.times.length - 1] : 0);

		// Écart du dernier segment terminé avec le record : or = meilleur segment jamais fait.
		const deltaOf = (i) => {
			const pb = data.pb && data.pb.times[i];
			if (pb == null) return null;
			const d = run.times[i] - pb;
			const gold = data.best[i] == null || seg(run.times, i) < data.best[i];
			return { d, cls: gold ? 'gold' : d <= 0 ? 'ahead' : 'behind' };
		};

		const render = () => {
			if (!el) return;
			el.classList.toggle('hidden', !data.on);
			if (!data.on) return;
			const i = Math.min(run.times.length, data.splits.length - 1);
			const t = elapsed();
			let delta = '';
			const pbHere = data.pb && data.pb.times[run.times.length];
			if (run.state === 'running' && pbHere != null && t > pbHere) delta = `<i class="behind">${fmt(t - pbHere, true)}</i>`;
			else if (run.last) delta = `<i class="${run.last.cls}">${fmt(run.last.d, true)}</i>`;
			const name = run.state === 'idle' ? 'Prêt' : run.state === 'done' ? 'Terminé' : data.splits[i];
			const state = run.state === 'running' ? (pbHere != null && t > pbHere ? 'behind' : 'run') : run.state;
			el.innerHTML = `<span class="sr-name">${esc(name)}${data.splits.length > 1 && run.state === 'running' ? ` <small>${i + 1}/${data.splits.length}</small>` : ''}</span><b class="sr-time ${state}">${fmt(t)}</b>${delta}`;
			el.dataset.tip = run.state === 'idle' ? 'Speedrun : Ctrl+Espace pour partir' : 'Ctrl+Espace : segment suivant · Ctrl+Maj+Espace : remettre à zéro';
		};
		const tick = (on) => { clearInterval(ticker); ticker = on ? setInterval(render, 100) : null; };

		// Fin d'un essai, terminé ou abandonné : meilleurs segments, record, historique.
		const record = (complete) => {
			run.times.forEach((t, i) => { const s = seg(run.times, i); if (data.best[i] == null || s < data.best[i]) data.best[i] = s; });
			data.runs.unshift({ at: Date.now(), times: run.times.slice(), complete });
			data.runs = data.runs.slice(0, 20);
			const total = run.times[run.times.length - 1];
			const pb = complete && (!data.pb || total < data.pb.times[data.pb.times.length - 1]);
			if (pb) data.pb = { times: run.times.slice(), at: Date.now() };
			persist();
			return pb;
		};

		const api = {
			get on() { return data.on; },
			get state() { return run.state; },
			async init() {
				try { data = { ...blank(), ...((await load()) || {}) }; } catch { data = blank(); }
				render();
				onToggle(data.on);
			},
			split() {
				if (!data.on) return false;
				if (run.state === 'idle') {
					Object.assign(run, { state: 'running', t0: performance.now(), times: [], last: null });
					data.attempts += 1;
					persist();
					tick(true);
					toast(`Speedrun : c’est parti ! (essai ${data.attempts})`);
				} else if (run.state === 'running') {
					run.times.push(performance.now() - run.t0);
					run.last = deltaOf(run.times.length - 1);
					if (run.times.length >= data.splits.length) {
						run.state = 'done';
						tick(false);
						const pb = record(true);
						toast(pb ? `Nouveau record : ${fmt(run.times[run.times.length - 1])} !` : `Terminé en ${fmt(run.times[run.times.length - 1])}`);
					}
				} else {
					Object.assign(run, { state: 'idle', times: [], last: null });
				}
				render();
				return true;
			},
			undo() {
				if (!data.on || run.state !== 'running' || !run.times.length) return false;
				run.times.pop();
				run.last = run.times.length ? deltaOf(run.times.length - 1) : null;
				render();
				toast('Segment annulé');
				return true;
			},
			reset() {
				if (!data.on) return false;
				if (run.state === 'running' && run.times.length) record(false);
				Object.assign(run, { state: 'idle', times: [], last: null });
				tick(false);
				render();
				toast('Chrono remis à zéro');
				return true;
			},
			// Panneau de réglages et de statistiques (onglet ou fonction du menu).
			panelHtml() {
				const pbTotal = data.pb ? data.pb.times[data.pb.times.length - 1] : null;
				const sob = data.best.length === data.splits.length && data.best.every(b => b != null) ? data.best.reduce((a, b) => a + b, 0) : null;
				const done = data.runs.filter(r => r.complete).length;
				const rows = data.splits.map((s, i) => `<tr><td>${esc(s)}</td><td>${data.pb && data.pb.times[i] != null ? fmt(data.pb.times[i]) : '—'}</td><td class="gold">${data.best[i] != null ? fmt(data.best[i]) : '—'}</td></tr>`).join('');
				const runs = data.runs.slice(0, 6).map(r => `<li><span>${new Date(r.at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span><b>${r.complete ? fmt(r.times[r.times.length - 1]) : `abandon · ${esc(data.splits[r.times.length] || '')}`}</b></li>`).join('');
				return `<div class="srp">
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
					</div></div>`;
			},
			// Clic dans le panneau ; renvoie vrai s'il faut le redessiner.
			click(target, root) {
				const b = target.closest('[data-sr]');
				if (!b) return false;
				const act = b.dataset.sr;
				if (act === 'toggle') {
					data.on = !data.on;
					if (!data.on) { Object.assign(run, { state: 'idle', times: [], last: null }); tick(false); }
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
					Object.assign(run, { state: 'idle', times: [], last: null });
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
		return api;
	};

	return { create, fmt };
})();
