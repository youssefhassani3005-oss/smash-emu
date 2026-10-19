/* global smashEmu, st, emu, gm, toast */
// Overlay de statistiques (Maj+F2) : images par seconde, graphe du temps par image de l'émulation, vitesse réelle,
// processeur et mémoire de la fenêtre de jeu, latence audio. Désactivé, il ne coûte rien (aucune boucle active).

(() => {
	const KEY = 'smash-emu-stats';
	const HISTORY = 120;
	const s = {
		on: false, raf: 0, timer: 0,
		lastFrame: -1, lastTime: 0, times: [],
		fps: 0, fpsFrame: 0, fpsTime: 0,
		metrics: null,
	};

	const box = document.createElement('div');
	box.className = 'stats hidden';
	box.innerHTML = `
		<div class="stats-head">STATS <span>Maj+F2</span></div>
		<div class="stats-grid" id="stats-grid"></div>
		<canvas class="stats-graph" id="stats-graph" width="240" height="60"></canvas>
		<div class="stats-legend"><span>temps par image</span><span id="stats-ft"></span></div>`;
	document.body.appendChild(box);
	const grid = box.querySelector('#stats-grid');
	const graph = box.querySelector('#stats-graph');
	const ctx = graph.getContext('2d');

	const audioLatency = () => {
		try {
			const a = emu().Module.AL.currentCtx.audioCtx;
			return Math.round(((a.baseLatency || 0) + (a.outputLatency || 0)) * 1000);
		} catch { return null; }
	};

	// Une mesure par image affichée : quand le compteur d'images de l'émulateur avance, on note le temps écoulé.
	const sample = (now) => {
		try {
			const n = gm().getFrameNum();
			if (s.lastFrame >= 0 && n > s.lastFrame) {
				const per = (now - s.lastTime) / (n - s.lastFrame);
				s.times.push(per);
				if (s.times.length > HISTORY) s.times.shift();
			}
			if (n !== s.lastFrame) { s.lastFrame = n; s.lastTime = now; }
			if (!s.fpsTime) { s.fpsTime = now; s.fpsFrame = n; }
			if (now - s.fpsTime >= 500) {
				s.fps = Math.round(((n - s.fpsFrame) * 1000) / (now - s.fpsTime));
				s.fpsTime = now;
				s.fpsFrame = n;
			}
		} catch { /* jeu pas encore prêt */ }
		drawGraph();
		s.raf = requestAnimationFrame(sample);
	};

	const drawGraph = () => {
		const w = graph.width;
		const h = graph.height;
		const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#ff1f3d';
		ctx.clearRect(0, 0, w, h);
		const max = 50; // ms affichés en haut du graphe
		const y = ms => h - Math.min(h, (ms / max) * h);
		ctx.strokeStyle = 'rgba(255,255,255,0.18)';
		ctx.setLineDash([3, 3]);
		for (const ms of [16.7, 33.3]) { ctx.beginPath(); ctx.moveTo(0, y(ms)); ctx.lineTo(w, y(ms)); ctx.stroke(); }
		ctx.setLineDash([]);
		const step = w / HISTORY;
		s.times.forEach((ms, i) => {
			ctx.fillStyle = ms > 34 ? '#ff4d5e' : ms > 18 ? '#ffc93c' : brand;
			const top = y(ms);
			ctx.fillRect(i * step, top, Math.max(1, step - 0.5), h - top);
		});
		const avg = s.times.length ? s.times.reduce((a, b) => a + b, 0) / s.times.length : 0;
		const worst = s.times.length ? Math.max(...s.times) : 0;
		box.querySelector('#stats-ft').textContent = s.times.length ? `moy ${avg.toFixed(1)} ms · pire ${worst.toFixed(0)} ms` : '';
	};

	const row = (label, value, warn = false) => `<span>${label}</span><b class="${warn ? 'warn' : ''}">${value}</b>`;

	const refresh = async () => {
		try { s.metrics = await smashEmu.metrics(); } catch { s.metrics = null; }
		const m = s.metrics || {};
		const c = document.querySelector('#game canvas');
		const lat = audioLatency();
		const target = (st.paused ? 0 : 60) * (st.turbo ? Math.max(3, st.speed) : st.speed);
		grid.innerHTML = [
			row('FPS', st.paused ? 'pause' : `${s.fps}`, !st.paused && target && s.fps < target * 0.9),
			row('Vitesse', st.paused ? '—' : `${Math.round((s.fps / 60) * 100)} %`),
			row('CPU jeu', m.cpu != null ? `${Math.round(m.cpu)} % d’un cœur` : '—', m.cpu > 90),
			row('CPU rendu', m.gpuCpu != null ? `${Math.round(m.gpuCpu)} %` : '—'),
			row('Mémoire', m.mem != null ? `${Math.round(m.mem / 1024)} Mo` : '—'),
			row('Audio', lat != null ? `${lat} ms` : '—'),
			row('Image', c ? `${c.width}×${c.height}` : '—'),
		].join('');
	};

	const set = (on) => {
		s.on = on;
		try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* stockage indisponible */ }
		box.classList.toggle('hidden', !on);
		cancelAnimationFrame(s.raf);
		clearInterval(s.timer);
		if (!on) return;
		Object.assign(s, { lastFrame: -1, times: [], fpsTime: 0 });
		s.raf = requestAnimationFrame(sample);
		refresh();
		s.timer = setInterval(refresh, 1000);
	};

	window.smashStats = {
		get on() { return s.on; },
		toggle: () => { set(!s.on); toast(s.on ? 'Statistiques affichées (Maj+F2)' : 'Statistiques masquées'); },
		start: () => { let saved = false; try { saved = localStorage.getItem(KEY) === '1'; } catch { /* */ } if (saved) set(true); },
	};

	// Raccourci : Maj+F2 (F2 seul ouvre le panneau des fonctions).
	const previous = window.smashKey;
	window.smashKey = (e) => {
		if (e.key === 'F2' && e.shiftKey) { e.preventDefault(); window.smashStats.toggle(); return true; }
		return previous ? previous(e) : false;
	};
})();
