/* global state */
// Petit danseur bleu en pixel art (dessin original) dans le coin de l'accueil. Deux poses qui alternent au rythme,
// larmes qui tombent et notes de musique ; un clic le fait tourner. Réglage « Danseur » (Interface Console).

const DANCER = (() => {
	const PX = 5;
	const COLORS = { o: '#1d2b53', b: '#5fa8ff', l: '#bfe0ff', d: '#3a6fd8', e: '#10183a', t: '#d6f1ff' };
	const HEAD = [
		'.....oooooo.....',
		'...oobbbbbboo...',
		'..obbllbbbbbbo..',
		'.obblbbbbbbbbbo.',
		'.obbbbbbbbbbbbo.',
		'obbbeebbbbeebbbo',
		'obbbeebbbbeebbbo',
		'obbbtbbddbbtbbbo',
		'.obbtbbbbbbtbbo.',
		'.oddbbbbbbbbddo.',
		'..ooddddddddoo..',
		'....oooooooo....',
	];
	// Pose A : bras gauche levé, bras droit baissé ; la pose B est son reflet.
	const BODY = [
		'.bo.obbbbbbo....',
		'..ooobbbbbbooo..',
		'.....obbbbbo.bo.',
		'.....oddddo.....',
		'.....ob..bo.....',
		'....oo....oo....',
	];
	const rects = (rows, top) => rows.map((r, y) => [...r].map((c, x) => (COLORS[c] ? `<rect x="${x}" y="${y + top}" width="1.02" height="1.02" fill="${COLORS[c]}"/>` : '')).join('')).join('');
	const mirror = rows => rows.map(r => [...r].reverse().join(''));
	const svg = `<svg viewBox="0 0 16 18" width="${16 * PX}" height="${18 * PX}" shape-rendering="crispEdges" aria-hidden="true">
		<g class="dn-body dn-a">${rects(BODY, 12)}</g>
		<g class="dn-body dn-b">${rects(mirror(BODY), 12)}</g>
		<g class="dn-head">${rects(HEAD, 0)}</g>
		<rect class="dn-tear" x="4" y="9" width="1" height="1" fill="${COLORS.t}"/>
		<rect class="dn-tear dn-tear2" x="11" y="9" width="1" height="1" fill="${COLORS.t}"/>
	</svg>`;

	const css = `
	#dancer { position: fixed; right: 26px; bottom: 26px; z-index: 40; width: ${16 * PX}px; height: ${18 * PX}px; cursor: pointer; filter: drop-shadow(0 6px 6px rgba(0,0,0,.28)); }
	#dancer.hidden { display: none; }
	#dancer .dn-move { animation: dn-bounce .5s ease-in-out infinite alternate; transform-origin: 50% 100%; }
	#dancer .dn-head { animation: dn-bob .5s ease-in-out infinite alternate; }
	#dancer .dn-a { animation: dn-pose 1s steps(1) infinite; }
	#dancer .dn-b { animation: dn-pose 1s steps(1) infinite reverse; }
	#dancer .dn-tear { animation: dn-tear 1s linear infinite; }
	#dancer .dn-tear2 { animation-delay: .5s; }
	#dancer .dn-note { position: absolute; top: -6px; font: 700 18px/1 system-ui, sans-serif; color: #5fa8ff; opacity: 0; animation: dn-note 2s ease-out infinite; pointer-events: none; }
	#dancer .dn-note.n2 { left: 62px; animation-delay: 1s; color: #3a6fd8; }
	#dancer.spin .dn-move { animation: dn-spin .7s ease-in-out; }
	@keyframes dn-bounce { from { transform: translateY(0) rotate(-6deg); } to { transform: translateY(-8px) rotate(6deg); } }
	@keyframes dn-bob { from { transform: translateY(0); } to { transform: translateY(.6px); } }
	@keyframes dn-pose { 0% { opacity: 1; } 50% { opacity: 0; } }
	@keyframes dn-tear { 0% { transform: translateY(0); opacity: 1; } 80% { opacity: 1; } 100% { transform: translateY(8px); opacity: 0; } }
	@keyframes dn-note { 0% { transform: translate(0, 10px); opacity: 0; } 20% { opacity: 1; } 100% { transform: translate(-14px, -34px) rotate(-20deg); opacity: 0; } }
	@keyframes dn-spin { from { transform: rotate(0) scale(1); } 50% { transform: rotate(180deg) scale(1.2) translateY(-10px); } to { transform: rotate(360deg) scale(1); } }
	@media (prefers-reduced-motion: reduce) { #dancer * { animation: none !important; } #dancer .dn-b, #dancer .dn-note { display: none; } }`;

	let el = null;
	const ensure = () => {
		if (el) return el;
		const style = document.createElement('style');
		style.textContent = css;
		document.head.appendChild(style);
		el = document.createElement('div');
		el.id = 'dancer';
		el.className = 'hidden';
		el.title = 'Clique-moi !';
		el.innerHTML = `<div class="dn-move">${svg}</div><span class="dn-note">♪</span><span class="dn-note n2">♫</span>`;
		el.addEventListener('click', () => {
			el.classList.remove('spin');
			void el.offsetWidth; // relance l'animation à chaque clic
			el.classList.add('spin');
		});
		el.addEventListener('animationend', (e) => { if (e.animationName === 'dn-spin') el.classList.remove('spin'); });
		document.body.appendChild(el);
		return el;
	};

	// Visible seulement sur l'accueil, sauf si le joueur l'a désactivé.
	const update = () => {
		const on = !!state.settings && state.settings.dancer !== false && state.route.name === 'home';
		if (!on && !el) return;
		ensure().classList.toggle('hidden', !on);
	};

	return { update };
})();
