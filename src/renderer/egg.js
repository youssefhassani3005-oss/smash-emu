// Easter egg : A + L + I pressées en même temps → bruit suspect (synthétisé, aucun fichier).
(() => {
	const down = new Set();
	let last = 0;
	const sus = () => {
		const AC = window.AudioContext || window.webkitAudioContext;
		if (!AC) return;
		const ctx = new AC();
		const t = ctx.currentTime;
		const master = ctx.createGain();
		master.gain.setValueAtTime(0.0001, t);
		master.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
		master.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
		master.connect(ctx.destination);
		// Sirène qui glisse vers le grave, avec tremblement.
		const o = ctx.createOscillator();
		o.type = 'sawtooth';
		o.frequency.setValueAtTime(880, t);
		o.frequency.exponentialRampToValueAtTime(70, t + 2.4);
		const lfo = ctx.createOscillator();
		const lg = ctx.createGain();
		lfo.frequency.value = 9;
		lg.gain.value = 40;
		lfo.connect(lg).connect(o.frequency);
		o.connect(master);
		// Deux « bips » d'alerte sourds.
		for (const at of [0.15, 0.55]) {
			const b = ctx.createOscillator();
			const bg = ctx.createGain();
			b.type = 'square';
			b.frequency.value = 220;
			bg.gain.setValueAtTime(0.0001, t + at);
			bg.gain.exponentialRampToValueAtTime(0.25, t + at + 0.02);
			bg.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.2);
			b.connect(bg).connect(ctx.destination);
			b.start(t + at);
			b.stop(t + at + 0.25);
		}
		o.start(t); lfo.start(t);
		o.stop(t + 2.7); lfo.stop(t + 2.7);
		setTimeout(() => ctx.close().catch(() => {}), 3200);
	};
	window.addEventListener('keydown', (e) => {
		if (!e.key || /^(INPUT|TEXTAREA)$/.test((e.target || {}).tagName)) return;
		down.add(e.key.toLowerCase());
		if (down.has('a') && down.has('l') && down.has('i') && Date.now() - last > 4000) { last = Date.now(); sus(); }
	});
	window.addEventListener('keyup', e => down.delete((e.key || '').toLowerCase()));
	window.addEventListener('blur', () => down.clear());
})();
