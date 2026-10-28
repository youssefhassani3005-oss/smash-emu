// 42 thèmes de jeux illustrés : couleurs, police, style d'icônes, illustration (motifs dessinés en SVG) et décor
// animé (fées pour Zelda, étoiles pour Galaxy, bulles façon Wii…). Choix automatique du thème selon le jeu lancé.
// Persona 3 Reload et Persona 5 Royal ont en plus un effet plein écran (FX) et leur propre style d'interface.
// Partagé par la fenêtre principale, les fenêtres de jeu (CSS injecté) et le processus principal (choix du thème).
(function (root) {
	// ---------- Motifs (dessins originaux, centrés sur 0,0 dans un carré de 100) ----------
	// p = palette { a: accent, b: accent secondaire, c: clair, d: sombre }
	const star = (p, f = p.b) => `<path d="M0-46L12-14 46-13 19 7 29 41 0 21-29 41-19 7-46-13-12-14Z" fill="${f}" stroke="${p.d}" stroke-width="4" stroke-linejoin="round"/>`;
	const M = {
		star: p => star(p),
		starA: p => star(p, p.a),
		mushroom: p => `<path d="M-42 4C-42-30-20-44 0-44S42-30 42 4Z" fill="${p.a}" stroke="${p.d}" stroke-width="4"/><circle cx="-18" cy="-20" r="9" fill="${p.c}"/><circle cx="14" cy="-26" r="7" fill="${p.c}"/><circle cx="26" cy="-6" r="6" fill="${p.c}"/><path d="M-20 4H20V30Q20 42 0 42T-20 30Z" fill="#f6ead2" stroke="${p.d}" stroke-width="4"/>`,
		coin: p => `<ellipse rx="26" ry="38" fill="${p.b}" stroke="${p.d}" stroke-width="4"/><rect x="-5" y="-20" width="10" height="40" rx="3" fill="${p.c}" opacity=".85"/>`,
		brick: p => `<rect x="-44" y="-30" width="88" height="60" fill="${p.a}" stroke="${p.d}" stroke-width="4"/><path d="M-44 0H44M-14-30V0M18 0V30" stroke="${p.d}" stroke-width="4"/>`,
		pipe: p => `<rect x="-26" y="-20" width="52" height="66" fill="#2fa84a" stroke="${p.d}" stroke-width="4"/><rect x="-34" y="-40" width="68" height="22" rx="3" fill="#3fc85c" stroke="${p.d}" stroke-width="4"/><rect x="-18" y="-16" width="8" height="58" fill="#8ff0a2" opacity=".6"/>`,
		cloud: p => `<path d="M-40 18A16 16 0 0 1-30-10 22 22 0 0 1 8-22 18 18 0 0 1 38-2 14 14 0 0 1 40 18Z" fill="${p.c}" opacity=".9"/>`,
		hill: p => `<path d="M-50 40C-40-10-20-34 0-34S40-10 50 40Z" fill="${p.b}" opacity=".55"/>`,
		castle: p => `<path d="M-40 40V-6H-28V-16H-18V-6H-6V-28L0-44 6-28V-6H18V-16H28V-6H40V40Z" fill="${p.c}" stroke="${p.d}" stroke-width="3"/><path d="M-8 40V14A8 8 0 0 1 8 14V40Z" fill="${p.d}"/><path d="M0-44L-10-26H10Z" fill="${p.a}"/><circle cx="0" cy="-8" r="5" fill="${p.b}"/>`,
		planet: p => `<circle r="28" fill="${p.a}" stroke="${p.d}" stroke-width="3"/><path d="M-26-6Q0 4 26-8" stroke="${p.c}" stroke-width="5" opacity=".35" fill="none"/><ellipse rx="46" ry="12" fill="none" stroke="${p.b}" stroke-width="4" transform="rotate(-18)"/>`,
		moon: p => `<path d="M10-40A40 40 0 1 0 10 40 30 30 0 1 1 10-40Z" fill="${p.b}" stroke="${p.d}" stroke-width="3"/>`,
		hat: p => `<path d="M-44 18Q-40-30 4-34Q40-34 44 6L48 18Z" fill="${p.a}" stroke="${p.d}" stroke-width="4"/><path d="M-50 18H50Q50 30 30 30H-30Q-50 30-50 18Z" fill="${p.a}" stroke="${p.d}" stroke-width="4"/><circle cx="4" cy="-8" r="14" fill="${p.c}" stroke="${p.d}" stroke-width="3"/><g transform="translate(4 -8) scale(.22)">${star(p, p.b)}</g>`,
		flag: p => `<path d="M-30-44V44" stroke="${p.c}" stroke-width="5"/><path d="M-28-42H34V0H-28Z" fill="${p.c}"/><path d="M-28-42H-12V-28H-28ZM4-42H18V-28H4ZM-12-28H4V-14H-12ZM18-28H34V-14H18ZM-28-14H-12V0H-28ZM4-14H18V0H4Z" fill="${p.d}"/>`,
		wheel: p => `<circle r="36" fill="${p.d}"/><circle r="20" fill="${p.b}"/><circle r="7" fill="${p.d}"/>${[0, 72, 144, 216, 288].map(a => `<rect x="-3" y="-20" width="6" height="12" fill="${p.d}" transform="rotate(${a})"/>`).join('')}`,
		burst: p => `<path d="M0-48L10-18 40-30 22-4 48 10 16 14 20 46 0 22-20 46-16 14-48 10-22-4-40-30-10-18Z" fill="${p.a}" stroke="${p.d}" stroke-width="3"/><path d="M-18-6H18M-6-18L6 18" stroke="${p.c}" stroke-width="7" stroke-linecap="round"/>`,
		door: p => `<rect x="-26" y="-44" width="52" height="88" rx="26" fill="${p.a}" stroke="${p.d}" stroke-width="4"/><path d="M-16 44V-20A16 16 0 0 1 16-20V44" fill="${p.d}" opacity=".35"/><circle cx="10" cy="8" r="4" fill="${p.b}"/><g transform="translate(0 -28) scale(.22)">${star(p, p.b)}</g>`,
		ghost: p => `<path d="M-32 40V-6A32 32 0 0 1 32-6V40L20 30 8 40-4 30-16 40-26 30Z" fill="${p.c}" opacity=".92" stroke="${p.d}" stroke-width="3"/><ellipse cx="-11" cy="-4" rx="5" ry="8" fill="${p.d}"/><ellipse cx="11" cy="-4" rx="5" ry="8" fill="${p.d}"/><ellipse cx="0" cy="14" rx="7" ry="5" fill="${p.d}"/>`,
		lantern: p => `<path d="M-6-36H6L22 40H-22Z" fill="${p.b}" opacity=".3"/><rect x="-12" y="-46" width="24" height="16" rx="4" fill="${p.a}" stroke="${p.d}" stroke-width="3"/><circle cy="-30" r="7" fill="${p.c}"/>`,
		fairy: p => `<circle r="26" fill="${p.b}" opacity=".18"/><circle r="14" fill="${p.b}" opacity=".45"/><ellipse cx="-16" cy="-12" rx="16" ry="9" fill="${p.c}" opacity=".7" transform="rotate(-30 -16 -12)"/><ellipse cx="16" cy="-12" rx="16" ry="9" fill="${p.c}" opacity=".7" transform="rotate(30 16 -12)"/><circle r="8" fill="${p.c}"/>`,
		sword: p => `<path d="M-5 20V-44L0-50 5-44V20Z" fill="${p.c}" stroke="${p.d}" stroke-width="3"/><rect x="-22" y="18" width="44" height="8" rx="3" fill="${p.a}" stroke="${p.d}" stroke-width="3"/><rect x="-5" y="26" width="10" height="18" fill="${p.b}" stroke="${p.d}" stroke-width="3"/><circle cy="48" r="5" fill="${p.a}"/>`,
		shield: p => `<path d="M0-44L36-32V0Q36 30 0 46-36 30-36 0V-32Z" fill="${p.b}" stroke="${p.d}" stroke-width="4"/><path d="M0-30L24-22V0Q24 20 0 32-24 20-24 0V-22Z" fill="${p.a}" opacity=".85"/><path d="M0-14L10 6H-10Z" fill="${p.c}"/>`,
		ocarina: p => `<ellipse rx="40" ry="24" fill="${p.b}" stroke="${p.d}" stroke-width="4" transform="rotate(-12)"/><path d="M30-14L46-26" stroke="${p.d}" stroke-width="10" stroke-linecap="round"/>${[[-20, 0], [-6, -4], [8, -6], [-10, 12]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="${p.d}"/>`).join('')}`,
		glider: p => `<path d="M-48 0Q0-34 48 0Q0-12-48 0Z" fill="${p.a}" stroke="${p.d}" stroke-width="3"/><path d="M-30-4L0 30 30-4" stroke="${p.c}" stroke-width="2" fill="none"/><circle cy="32" r="6" fill="${p.b}"/>`,
		mountain: p => `<path d="M-50 40L-14-28 4-4 18-24 50 40Z" fill="${p.d}" opacity=".7"/><path d="M-14-28L-24-10H-4ZM18-24L10-10H26Z" fill="${p.c}"/>`,
		gem: p => `<path d="M0-44L22-22V22L0 44-22 22V-22Z" fill="${p.a}" stroke="${p.d}" stroke-width="4"/><path d="M0-30L12-18V18L0 30-12 18V-18Z" fill="${p.c}" opacity=".35"/>`,
		island: p => `<path d="M-46 10Q0-10 46 10L30 30Q0 46-30 30Z" fill="${p.b}" stroke="${p.d}" stroke-width="3"/><path d="M-46 10Q0-4 46 10" fill="#5fb83b"/><path d="M-10 30L-6 44M8 32L10 46" stroke="${p.d}" stroke-width="3"/>`,
		boat: p => `<path d="M-40 14H40L28 34H-28Z" fill="${p.b}" stroke="${p.d}" stroke-width="4"/><path d="M-4 12V-44" stroke="${p.d}" stroke-width="4"/><path d="M0-40Q30-20 2 8Z" fill="${p.c}" stroke="${p.d}" stroke-width="3"/><path d="M-6-36Q-26-16-6 6Z" fill="${p.a}" stroke="${p.d}" stroke-width="3"/>`,
		wave: p => `<path d="M-50 10Q-37-6-25 10T0 10 25 10 50 10V40H-50Z" fill="${p.b}" opacity=".75"/><path d="M-50 22Q-37 8-25 22T0 22 25 22 50 22" stroke="${p.c}" stroke-width="3" fill="none" opacity=".7"/>`,
		sun: p => `${Array.from({ length: 10 }, (_, k) => `<path d="M-5-46L0-58 5-46Z" fill="${p.a}" transform="rotate(${k * 36})"/>`).join('')}<circle r="32" fill="${p.a}" stroke="${p.d}" stroke-width="3"/><circle cx="-10" cy="-10" r="8" fill="${p.c}" opacity=".5"/>`,
		ball: p => `<circle r="40" fill="${p.c}" stroke="${p.d}" stroke-width="5"/><path d="M-40 0A40 40 0 0 1 40 0Z" fill="${p.a}" stroke="${p.d}" stroke-width="5"/><path d="M-40 0H40" stroke="${p.d}" stroke-width="7"/><circle r="12" fill="${p.c}" stroke="${p.d}" stroke-width="5"/>`,
		bolt: p => `<path d="M8-48L-26 6H-2L-10 48 26-8H2Z" fill="${p.b}" stroke="${p.d}" stroke-width="4" stroke-linejoin="round"/>`,
		ring: p => `<circle r="38" fill="none" stroke="${p.a}" stroke-width="7"/>${Array.from({ length: 8 }, (_, k) => `<circle cx="0" cy="-38" r="5" fill="${p.b}" transform="rotate(${k * 45})"/>`).join('')}`,
		swords: p => `<g transform="rotate(35)">${M.sword(p)}</g><g transform="rotate(-35)">${M.sword(p)}</g>`,
		crown: p => `<path d="M-40 26L-44-24-20 0 0-34 20 0 44-24 40 26Z" fill="${p.a}" stroke="${p.d}" stroke-width="4"/><rect x="-40" y="22" width="80" height="12" fill="${p.b}" stroke="${p.d}" stroke-width="3"/><circle cy="-6" r="6" fill="${p.c}"/>`,
		barrel: p => `<path d="M-30-40H30Q40 0 30 40H-30Q-40 0-30-40Z" fill="#a0652e" stroke="${p.d}" stroke-width="4"/><path d="M-34-20H34M-34 20H34" stroke="${p.d}" stroke-width="5"/><path d="M-12-6L0 10 12-6" stroke="${p.b}" stroke-width="6" fill="none"/>`,
		banana: p => `<path d="M-40-10Q-20 40 34 20Q44 14 40 6Q0 22-30-20Z" fill="${p.b}" stroke="${p.d}" stroke-width="4" stroke-linejoin="round"/><path d="M-30-20L-36-30" stroke="${p.d}" stroke-width="5"/>`,
		palm: p => `<path d="M0 46Q-4 10 4-20" stroke="#8a5a2b" stroke-width="9" fill="none"/>${[-60, -20, 20, 60, 100].map(a => `<path d="M4-20Q24-40 46-30Q20-26 4-20Z" fill="#3fa34d" transform="rotate(${a} 4 -20)"/>`).join('')}`,
		heart: p => `<path d="M0 40L-36 4A20 20 0 0 1 0-26 20 20 0 0 1 36 4Z" fill="${p.a}" stroke="${p.d}" stroke-width="4"/><circle cx="-14" cy="-6" r="6" fill="${p.c}" opacity=".6"/>`,
		visor: p => `<path d="M-36 30V-6A36 36 0 0 1 36-6V30Z" fill="${p.a}" stroke="${p.d}" stroke-width="4"/><path d="M-26-4Q0-24 26-4L20 14H-20Z" fill="${p.b}" stroke="${p.d}" stroke-width="3"/><path d="M-16-2Q0-12 10-6" stroke="${p.c}" stroke-width="3" opacity=".7" fill="none"/>`,
		orb: p => `<circle r="30" fill="${p.b}" opacity=".35"/><circle r="18" fill="${p.b}"/><circle cx="-6" cy="-6" r="6" fill="${p.c}"/>`,
		ship: p => `<path d="M0-44L14 10 44 26 10 22 0 40-10 22-44 26-14 10Z" fill="${p.c}" stroke="${p.d}" stroke-width="3"/><path d="M0-30L6 4H-6Z" fill="${p.a}"/><path d="M-30 22L-44 26M30 22L44 26" stroke="${p.b}" stroke-width="5"/>`,
		leaf: p => `<path d="M-30 30Q-36-30 30-34Q34 30-30 30Z" fill="${p.a}" stroke="${p.d}" stroke-width="3"/><path d="M-26 26Q0 0 26-28" stroke="${p.d}" stroke-width="3" fill="none" opacity=".6"/>`,
		tennis: p => `<ellipse cx="-10" cy="-14" rx="22" ry="28" fill="none" stroke="${p.a}" stroke-width="6"/><path d="M-6 14L4 46" stroke="${p.d}" stroke-width="8" stroke-linecap="round"/><circle cx="28" cy="20" r="14" fill="#d8f24a" stroke="${p.d}" stroke-width="3"/><path d="M16 14Q28 22 40 14" stroke="${p.c}" stroke-width="2" fill="none"/>`,
		pin: p => `<path d="M0-44Q12-44 10-24Q8-12 14 6Q20 30 10 44H-10Q-20 30-14 6Q-8-12-10-24Q-12-44 0-44Z" fill="${p.c}" stroke="${p.d}" stroke-width="3"/><path d="M-11-18H11M-12-12H12" stroke="${p.a}" stroke-width="4"/>`,
		board: p => `<rect x="-46" y="-14" width="92" height="30" rx="14" fill="${p.c}" stroke="${p.d}" stroke-width="3"/><rect x="-36" y="-8" width="30" height="16" rx="6" fill="${p.a}" opacity=".35"/><rect x="6" y="-8" width="30" height="16" rx="6" fill="${p.a}" opacity=".35"/><circle cx="34" cy="-22" r="5" fill="${p.a}"/>`,
		paw: p => `<ellipse cx="0" cy="14" rx="20" ry="16" fill="${p.a}"/>${[[-22, -10], [-8, -22], [8, -22], [22, -10]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="8" ry="10" fill="${p.a}"/>`).join('')}`,
		bone: p => `<path d="M-30-6H30M-30 6H30" stroke="${p.c}" stroke-width="14"/>${[[-34, -8], [-34, 8], [34, -8], [34, 8]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="${p.c}"/>`).join('')}`,
		speech: p => `<path d="M-42-30H42V18H-6L-24 38-20 18H-42Z" fill="${p.c}" stroke="${p.d}" stroke-width="4" stroke-linejoin="round"/><circle cx="-16" cy="-6" r="5" fill="${p.a}"/><circle cx="0" cy="-6" r="5" fill="${p.a}"/><circle cx="16" cy="-6" r="5" fill="${p.a}"/>`,
		house: p => `<path d="M-36 0L0-36 36 0V40H-36Z" fill="${p.c}" stroke="${p.d}" stroke-width="4"/><path d="M-44 4L0-42 44 4" stroke="${p.a}" stroke-width="8" fill="none" stroke-linecap="round"/><rect x="-10" y="14" width="20" height="26" fill="${p.b}"/>`,
		sprout: p => `<path d="M0 44V-10" stroke="#3fa34d" stroke-width="6"/><path d="M0-10Q-24-20-22-40Q0-34 0-10Z" fill="#5fc85a"/><circle cx="0" cy="-40" r="12" fill="${p.c}"/><circle cy="-40" r="5" fill="${p.b}"/><ellipse cx="0" cy="34" rx="14" ry="10" fill="${p.a}"/>`,
		flower: p => `${[0, 72, 144, 216, 288].map(a => `<ellipse cy="-20" rx="12" ry="18" fill="${p.a}" transform="rotate(${a})"/>`).join('')}<circle r="12" fill="${p.b}" stroke="${p.d}" stroke-width="2"/>`,
		present: p => `<rect x="-36" y="-20" width="72" height="56" fill="${p.a}" stroke="${p.d}" stroke-width="4"/><rect x="-42" y="-34" width="84" height="16" fill="${p.a}" stroke="${p.d}" stroke-width="4"/><path d="M0-34V36" stroke="${p.b}" stroke-width="10"/><path d="M0-34Q-20-56-26-38Q-16-30 0-34Q20-56 26-38Q16-30 0-34" fill="${p.b}" stroke="${p.d}" stroke-width="3"/>`,
		egg: p => `<path d="M0-44Q32-44 34 6Q34 42 0 42T-34 6Q-32-44 0-44Z" fill="${p.c}" stroke="${p.d}" stroke-width="4"/><circle cx="-12" cy="-8" r="9" fill="${p.a}"/><circle cx="14" cy="12" r="10" fill="${p.a}"/><circle cx="10" cy="-26" r="6" fill="${p.a}"/>`,
		micro: p => `<rect x="-40" y="-36" width="80" height="72" rx="6" fill="${p.d}" stroke="${p.a}" stroke-width="5"/><rect x="-24" y="-18" width="10" height="10" fill="${p.b}"/><rect x="14" y="-18" width="10" height="10" fill="${p.b}"/><path d="M-22 10H-14V18H14V10H22" fill="none" stroke="${p.b}" stroke-width="6"/>`,
		dice: p => `<rect x="-36" y="-36" width="72" height="72" rx="14" fill="${p.c}" stroke="${p.d}" stroke-width="4"/>${[[-16, -16], [16, -16], [0, 0], [-16, 16], [16, 16]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="${p.a}"/>`).join('')}`,
		tank: p => `<rect x="-40" y="4" width="80" height="22" rx="11" fill="${p.d}"/><rect x="-32" y="-14" width="64" height="22" rx="4" fill="${p.a}" stroke="${p.d}" stroke-width="3"/><rect x="-16" y="-28" width="30" height="18" rx="4" fill="${p.a}" stroke="${p.d}" stroke-width="3"/><path d="M14-20H48" stroke="${p.d}" stroke-width="7"/>${[-26, -10, 6, 22].map(x => `<circle cx="${x}" cy="15" r="6" fill="${p.c}" opacity=".6"/>`).join('')}`,
		spot: p => `<path d="M-6-44H6L40 44H-40Z" fill="${p.b}" opacity=".18"/><rect x="-14" y="-50" width="28" height="12" rx="3" fill="${p.c}"/>`,
		note: p => `<path d="M-8 26V-34L30-42V18" stroke="${p.c}" stroke-width="6" fill="none"/><ellipse cx="-18" cy="28" rx="13" ry="10" fill="${p.c}"/><ellipse cx="20" cy="20" rx="13" ry="10" fill="${p.c}"/>`,
		swordGlow: p => `<path d="M-6 22V-30L0-48 6-30V22Z" fill="${p.a}" opacity=".9"/><path d="M-12-30L0-48 12-30Z" fill="${p.b}" opacity=".4"/><rect x="-22" y="20" width="44" height="8" rx="3" fill="${p.c}"/><rect x="-5" y="28" width="10" height="18" fill="${p.d}"/>`,
		// Nuit bleue et Heure Sombre (thème p3r) : horloge arrêtée à minuit, papillon, lune, tour en étages.
		clock: p => `<circle r="40" fill="${p.d}" stroke="${p.a}" stroke-width="4"/><circle r="33" fill="none" stroke="${p.b}" stroke-width="1.5" opacity=".5"/>${Array.from({ length: 12 }, (_, k) => `<rect x="-1.6" y="-38" width="3.2" height="${k % 3 ? 6 : 10}" fill="${p.c}" transform="rotate(${k * 30})"/>`).join('')}<path d="M0 4V-22" stroke="${p.c}" stroke-width="5" stroke-linecap="round"/><path d="M0 4V-32" stroke="${p.a}" stroke-width="3" stroke-linecap="round" transform="rotate(3)"/><circle r="4" fill="${p.a}"/>`,
		butterfly: p => `<g fill="${p.a}" stroke="${p.c}" stroke-width="2" opacity=".9"><path d="M-2-4C-20-34-46-30-40-8-36 6-16 6-2 0Z"/><path d="M2-4C20-34 46-30 40-8 36 6 16 6 2 0Z"/><path d="M-2 2C-18 8-30 26-18 32-8 36-4 18-2 6Z"/><path d="M2 2C18 8 30 26 18 32 8 36 4 18 2 6Z"/></g><rect x="-2" y="-12" width="4" height="30" rx="2" fill="${p.c}"/>`,
		fullmoon: () => '<circle r="46" fill="#bff7ff" opacity=".12"/><circle r="36" fill="#e4f8ff"/><circle r="36" fill="#7dff9f" opacity=".2"/><circle cx="-10" cy="-8" r="7" fill="#b9d8e6" opacity=".7"/><circle cx="12" cy="10" r="5" fill="#b9d8e6" opacity=".6"/><circle cx="8" cy="-16" r="3" fill="#b9d8e6" opacity=".6"/>',
		tower: p => `<path d="M-30 50L-24-6-14-6-12-30-4-30 0-52 4-30 12-30 14-6 24-6 30 50Z" fill="${p.d}" stroke="${p.a}" stroke-width="2"/>${[-18, -2, 14, 30].map(y => `<path d="M-20 ${y}H20" stroke="${p.a}" stroke-width="1.5" opacity=".5"/>`).join('')}<rect x="-3" y="-24" width="6" height="8" fill="${p.b}" opacity=".8"/>`,
		// Rouge, noir et blanc (thème p5r) : masque, carte de visite, étoile éclatée, chat, rose.
		domino: p => `<path d="M-46-8Q-40-26-16-20Q0-14 16-20Q40-26 46-8Q44 14 22 16Q8 16 0 4Q-8 16-22 16-44 14-46-8Z" fill="${p.c}" stroke="${p.d}" stroke-width="4" stroke-linejoin="round"/><path d="M-30-6Q-20-12-10-4Q-20 4-30-6ZM30-6Q20-12 10-4Q20 4 30-6Z" fill="${p.d}"/>`,
		card: p => `<rect x="-30" y="-42" width="60" height="84" rx="4" fill="${p.a}" stroke="${p.d}" stroke-width="4"/><rect x="-24" y="-36" width="48" height="72" fill="none" stroke="${p.d}" stroke-width="2"/><path d="M0-22L5-6 22-6 8 4 13 20 0 10-13 20-8 4-22-6-5-6Z" fill="${p.d}"/><path d="M-16 28H16" stroke="${p.d}" stroke-width="3"/>`,
		burstStar: p => `<path d="M0-50L9-20 40-34 22-6 50 6 18 14 28 46 2 24-16 50-14 18-48 22-22 0-44-26-12-16Z" fill="${p.a}" stroke="${p.d}" stroke-width="4"/><path d="M0-30L5-12 24-18 12-2 28 6 8 10 14 28 0 14-10 30-8 10-28 12-12 0-26-14-6-8Z" fill="${p.d}"/><path d="M-6-6L6 6M6-6L-6 6" stroke="${p.c}" stroke-width="4"/>`,
		catHead: p => `<path d="M-34 36Q-44 6-34-14L-38-44-14-26Q0-30 14-26L38-44 34-14Q44 6 34 36Z" fill="${p.d}" stroke="${p.c}" stroke-width="3"/><ellipse cx="-14" cy="0" rx="9" ry="11" fill="${p.b}"/><ellipse cx="14" cy="0" rx="9" ry="11" fill="${p.b}"/><circle cx="-12" cy="2" r="4" fill="${p.d}"/><circle cx="16" cy="2" r="4" fill="${p.d}"/>`,
		rose: p => `<path d="M0 46V0" stroke="#2c6b2f" stroke-width="5"/><path d="M0 24Q-20 14-24 26Q-10 32 0 24Z" fill="#2c6b2f"/><circle r="20" fill="${p.a}" stroke="${p.d}" stroke-width="3"/><path d="M-10-4Q0-18 12-4Q2 8-10-4ZM-14 4Q0 20 14 4" stroke="${p.d}" stroke-width="3" fill="none"/>`,
	};

	// ---------- Particules du décor (motif, mouvement, nombre) ----------
	const PARTICLES = {
		fairies: { motion: 'float', count: 9, draw: p => `<circle r="22" fill="${p.b}" opacity=".25"/><circle r="10" fill="${p.c}"/><ellipse cx="-12" cy="-8" rx="12" ry="6" fill="${p.c}" opacity=".6"/><ellipse cx="12" cy="-8" rx="12" ry="6" fill="${p.c}" opacity=".6"/>`, glow: true },
		stars: { motion: 'twinkle', count: 18, draw: p => star(p, p.b) },
		coins: { motion: 'fall', count: 10, draw: p => M.coin(p) },
		leaves: { motion: 'fall', count: 12, draw: p => M.leaf(p) },
		bubbles: { motion: 'rise', count: 14, draw: p => `<circle r="30" fill="${p.c}" opacity=".12" stroke="${p.a}" stroke-opacity=".5" stroke-width="3"/><circle cx="-10" cy="-10" r="7" fill="${p.c}" opacity=".8"/>` },
		sparks: { motion: 'twinkle', count: 16, draw: p => `<path d="M0-40L8-8 40 0 8 8 0 40-8 8-40 0-8-8Z" fill="${p.b}"/>`, glow: true },
		ghosts: { motion: 'float', count: 6, draw: p => M.ghost(p) },
		petals: { motion: 'fall', count: 14, draw: p => `<ellipse rx="14" ry="26" fill="${p.a}" opacity=".85" transform="rotate(30)"/>` },
		embers: { motion: 'rise', count: 16, draw: p => `<circle r="14" fill="${p.a}"/><circle r="26" fill="${p.a}" opacity=".25"/>`, glow: true },
		hearts: { motion: 'rise', count: 10, draw: p => M.heart(p) },
		notes: { motion: 'float', count: 10, draw: p => M.note({ ...p, c: p.a }) },
		rain: { motion: 'rain', count: 26, draw: p => `<rect x="-3" y="-40" width="6" height="80" rx="3" fill="${p.b}" opacity=".6"/>` },
		warp: { motion: 'warp', count: 18, draw: p => `<rect x="-50" y="-3" width="100" height="6" rx="3" fill="${p.b}" opacity=".8"/>` },
		confetti: { motion: 'fall', count: 18, draw: (p, k) => `<rect x="-14" y="-8" width="28" height="16" rx="3" fill="${k % 2 ? p.a : p.b}"/>` },
		moons: { motion: 'twinkle', count: 10, draw: p => M.moon(p) },
		butterflies: { motion: 'float', count: 8, draw: p => M.butterfly({ ...p, a: p.b }), glow: true },
		cards: { motion: 'fall', count: 9, draw: p => M.card(p) },
	};

	// ---------- Effets plein écran propres à un thème (calques animés au-dessus du décor) ----------
	// Créations originales inspirées des interfaces des jeux (voir docs/THEMES-PERSONA.md).
	const rnd = (a, b) => (a + Math.random() * (b - a)).toFixed(1);
	// Lettres découpées façon lettre anonyme : chaque lettre a sa boîte, sa police, sa taille et son angle
	// (même tirage pour un même texte, pour que le titre ne change pas à chaque affichage).
	const ransom = (text) => [...String(text)].map((c, i) => {
		if (c === ' ') return '<em class="rs-gap"> </em>';
		const h = ([...c].reduce((a, x) => a + x.charCodeAt(0), 0) * 7 + i * 13) % 97;
		return `<span class="rs rs${h % 4}" style="--r:${(h % 2 ? 1 : -1) * (2 + (h % 5))}deg;--y:${(h % 7) - 3}px">${c.replace(/[&<>]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]))}</span>`;
	}).join('');
	// Fond d'étoiles emboîtées en noir et blanc (menus de Persona 5), en motif répété.
	const starTile = () => {
		const s = 'M0-42L10-14 40-13 16 6 25 36 0 18-25 36-16 6-40-13-10-14Z';
		const nest = (x, y, r, k) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${k})">${[1, 0.68, 0.36].map(f => `<path d="${s}" transform="scale(${f})"/>`).join('')}</g>`;
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="170" height="170"><rect width="170" height="170" fill="#000"/><g fill="none" stroke="#fff" stroke-width="5">${nest(48, 52, -12, 1.05)}${nest(130, 128, 22, 0.85)}${nest(138, 30, 8, 0.45)}${nest(30, 142, -30, 0.5)}</g></svg>`;
		return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
	};
	const FX = {
		// Persona 3 Reload : eau qui ondule, rayons, bulles, grand cercle, lune qui verdit à « minuit » et grand mot
		// de la page en italique pâle (« MAIL », « TOWNMAP » dans le jeu), rempli par la fenêtre (data-word).
		abyss: (p, full) => `<div class="fx fx-abyss ${full ? 'live' : ''}"><i class="fx-water"></i><i class="fx-rays"></i><i class="fx-ring"></i><i class="fx-moonglow"></i><div class="fx-bigword"></div><i class="fx-tri"></i>${full ? Array.from({ length: 16 }, () => `<b style="left:${rnd(0, 100)}%;--s:${rnd(5, 18)}px;--d:${rnd(9, 20)}s;--w:-${rnd(0, 20)}s"></b>`).join('') : ''}</div>`,
		// Persona 5 Royal : bande d'étoiles noir et blanc en biais, bandes rouges, trame, étoile qui tressaute et mot
		// de la page en lettres découpées.
		phantom: (p, full) => `<div class="fx fx-phantom ${full ? 'live' : ''}"><i class="fx-stars" style="background-image:${starTile()}"></i><i class="fx-slash s1"></i><i class="fx-slash s2"></i><i class="fx-dots"></i><div class="fx-word"></div><svg class="fx-star" viewBox="-55 -55 110 110" aria-hidden="true">${M.burstStar(p)}</svg></div>`,
	};
	// Mot de la page affiché en fond par les effets (titre de la page en cours).
	const fxWord = (root, word) => {
		const w = String(word || '').toUpperCase().slice(0, 18);
		for (const fx of root.querySelectorAll('.fx')) {
			if (fx.dataset.word === w) continue;
			fx.dataset.word = w;
			const big = fx.querySelector('.fx-bigword');
			if (big) big.textContent = w;
			const cut = fx.querySelector('.fx-word');
			if (cut) cut.innerHTML = ransom(w);
		}
	};

	// ---------- Les 40 thèmes ----------
	// id, nom, console et description, fond, accent, accent 2, police, style d'icônes, particules,
	// illustration [motif, x, y, taille, rotation] sur une scène de 200×100, mots-clés du titre, clair
	const RAW = [
		['smb', 'Super Mario Bros.', 'NES · Le classique qui a popularisé Mario.', '#0f1430', '#e52521', '#f8b800', 'Press Start 2P', 'pixel', 'coins',
			[['hill', 30, 88, 1.1], ['hill', 160, 90, 0.8], ['cloud', 40, 22, 0.5], ['cloud', 120, 14, 0.4], ['brick', 92, 40, 0.28], ['brick', 116, 40, 0.28], ['coin', 104, 22, 0.22], ['pipe', 168, 70, 0.55], ['mushroom', 62, 78, 0.32]], 'super mario bros|super mario all.?stars|mario bros'],
		['sm64', 'Super Mario 64', 'Nintendo 64 · Une référence de la plateforme 3D.', '#0f1426', '#e52521', '#ffd23f', 'Luckiest Guy', 'bubble', 'stars',
			[['hill', 100, 98, 2.4], ['castle', 100, 62, 0.75], ['starA', 40, 30, 0.32, -12], ['star', 160, 26, 0.4, 10], ['cloud', 30, 64, 0.4], ['cloud', 172, 60, 0.38]], 'mario 64'],
		['galaxy', 'Super Mario Galaxy', 'Wii · Des aventures dans l’espace.', '#070821', '#ffd23f', '#6fd3ff', 'Fredoka', 'neon', 'stars',
			[['planet', 60, 56, 0.7, 10], ['planet', 150, 34, 0.38, -20], ['star', 120, 72, 0.3, 12], ['star', 24, 20, 0.2], ['moon', 178, 78, 0.3]], 'galaxy'],
		['odyssey', 'Super Mario Odyssey', 'Switch · Exploration et transformations.', '#14090c', '#e60012', '#ffe066', 'Luckiest Guy', 'bubble', 'moons',
			[['hat', 72, 54, 0.75, -8], ['moon', 150, 34, 0.42], ['moon', 30, 26, 0.2], ['cloud', 160, 80, 0.5]], 'odyssey'],
		['mk8', 'Mario Kart 8 Deluxe', 'Switch · Courses et objets chaotiques.', '#0d0d14', '#ff3b30', '#ffd400', 'Bangers', 'tech', 'warp',
			[['flag', 40, 50, 0.7, -8], ['wheel', 110, 62, 0.6], ['wheel', 160, 64, 0.5], ['star', 150, 22, 0.28, 15]], 'mario kart'],
		['smash', 'Super Smash Bros. Ultimate', 'Switch · Combat entre personnages cultes.', '#0c0717', '#ffb21a', '#ff3d3d', 'Bebas Neue', 'tech', 'embers',
			[['burst', 100, 50, 0.85], ['star', 36, 30, 0.3, -15], ['star', 166, 70, 0.3, 20]], 'smash bros'],
		['paper', 'Paper Mario : La Porte Millénaire', 'GameCube / Switch · RPG avec humour et stratégie.', '#f4ecd8', '#d6372b', '#2a7de1', 'Permanent Marker', 'paper', 'confetti',
			[['door', 100, 52, 0.8], ['star', 40, 36, 0.36, -10], ['cloud', 160, 26, 0.46], ['mushroom', 162, 74, 0.34]], 'paper mario|porte mill|thousand.?year', true],
		['luigi3', 'Luigi’s Mansion 3', 'Switch · Exploration d’un hôtel hanté.', '#0c0f14', '#3fbf4f', '#a8e8ff', 'Creepster', 'bubble', 'ghosts',
			[['lantern', 60, 56, 0.9], ['ghost', 140, 46, 0.62, 8], ['ghost', 178, 24, 0.3, -10], ['moon', 30, 24, 0.24]], 'luigi.?s mansion|luigi'],
		['oot', 'Zelda : Ocarina of Time', 'Nintendo 64 · Une aventure légendaire en 3D.', '#081008', '#d9b23b', '#7fd4ff', 'Cinzel', 'ornate', 'fairies',
			[['mountain', 150, 72, 1.1], ['ocarina', 60, 60, 0.6, -10], ['fairy', 120, 30, 0.5], ['fairy', 30, 24, 0.3], ['sword', 176, 44, 0.42, 20]], 'ocarina|majora|zelda'],
		['botw', 'Zelda : Breath of the Wild', 'Switch · Exploration en monde ouvert.', '#0a1418', '#3fe0ff', '#f0c058', 'Cinzel', 'tech', 'fairies',
			[['mountain', 120, 76, 1.4], ['glider', 60, 36, 0.6, -8], ['gem', 160, 34, 0.3], ['cloud', 30, 70, 0.4]], 'breath of the wild'],
		['totk', 'Zelda : Tears of the Kingdom', 'Switch · Construction et exploration créative.', '#0e0d14', '#3cf0b0', '#ffcf4a', 'Cinzel', 'ornate', 'sparks',
			[['island', 70, 40, 0.7], ['island', 160, 26, 0.36], ['glider', 140, 66, 0.4, 10], ['gem', 30, 70, 0.28]], 'tears of the kingdom'],
		['windwaker', 'Zelda : The Wind Waker', 'GameCube · Voyage en mer et style dessin animé.', '#06243a', '#ffd23f', '#2fb8ff', 'Pirata One', 'paper', 'bubbles',
			[['sun', 160, 26, 0.4], ['wave', 100, 86, 2.2], ['boat', 80, 62, 0.6, -4], ['cloud', 40, 24, 0.4]], 'wind waker'],
		['alttp', 'Zelda : A Link to the Past', 'SNES · Un incontournable de l’aventure 2D.', '#0d1408', '#e8c840', '#48a858', 'Silkscreen', 'pixel', 'fairies',
			[['shield', 70, 52, 0.62], ['sword', 116, 50, 0.6, 15], ['gem', 160, 60, 0.3], ['fairy', 30, 26, 0.32]], 'link to the past|zelda iii'],
		['pkmnrb', 'Pokémon Rouge et Bleu', 'Game Boy · Les premiers Pokémon principaux.', '#140a0b', '#ee1515', '#3b4cca', 'Press Start 2P', 'pixel', 'sparks',
			[['ball', 80, 52, 0.75], ['ball', 150, 36, 0.36, 20], ['bolt', 30, 40, 0.34, -10]], 'pokemon (red|blue|rouge|bleu)'],
		['pkmngs', 'Pokémon Or et Argent', 'Game Boy Color · Une génération culte.', '#12100a', '#d9b43a', '#c0c4cc', 'Silkscreen', 'pixel', 'petals',
			[['sun', 60, 40, 0.5], ['moon', 150, 34, 0.42], ['ball', 104, 70, 0.4]], 'pokemon (gold|silver|or|argent|crystal|cristal)'],
		['pkmnem', 'Pokémon Émeraude', 'GBA · Exploration et combats au tour par tour.', '#061510', '#00c46a', '#3fd0ff', 'Lilita One', 'bubble', 'sparks',
			[['gem', 70, 50, 0.7], ['wave', 140, 86, 1.4], ['ball', 154, 42, 0.36, 10]], 'emerald|emeraude'],
		['hgss', 'Pokémon HeartGold et SoulSilver', 'DS · Des remakes très appréciés.', '#0e0b14', '#e0b23a', '#c0c8ff', 'Lilita One', 'bubble', 'petals',
			[['ball', 70, 54, 0.6], ['sun', 140, 34, 0.32], ['moon', 170, 66, 0.32]], 'heartgold|soulsilver|heart gold|soul silver'],
		['arceus', 'Légendes Pokémon : Arceus', 'Switch · Une approche différente de Pokémon.', '#0b0f10', '#e6d39b', '#49a4c8', 'Cinzel', 'ornate', 'leaves',
			[['mountain', 140, 74, 1.3], ['ring', 70, 46, 0.6], ['ball', 70, 46, 0.28]], 'arceus'],
		['fe3h', 'Fire Emblem : Three Houses', 'Switch · RPG tactique et choix narratifs.', '#0a0d18', '#d4a73a', '#a2183a', 'Cinzel', 'ornate', 'petals',
			[['swords', 70, 54, 0.7], ['crown', 146, 46, 0.5], ['shield', 176, 74, 0.26]], 'fire emblem|three houses'],
		['xeno', 'Xenoblade Chronicles', 'Switch · Grande aventure de science-fantasy.', '#0b0f14', '#ff3b3b', '#3fe0ff', 'Orbitron', 'tech', 'sparks',
			[['swordGlow', 70, 50, 0.85, -12], ['planet', 150, 40, 0.5], ['mountain', 160, 86, 0.8]], 'xenoblade'],
		['dkc', 'Donkey Kong Country', 'SNES · Plateforme et niveaux mémorables.', '#120d06', '#ffcc29', '#5aa83a', 'Luckiest Guy', 'bubble', 'leaves',
			[['palm', 40, 56, 0.8], ['barrel', 104, 60, 0.6, -6], ['banana', 160, 40, 0.5, 10], ['banana', 176, 70, 0.3, -20]], 'donkey kong'],
		['kirby', 'Kirby Super Star', 'SNES · Plusieurs aventures dans un jeu.', '#1a0a14', '#ff8fc8', '#ffe066', 'Fredoka', 'bubble', 'stars',
			[['cloud', 60, 66, 0.9], ['starA', 70, 34, 0.42, -12], ['heart', 150, 56, 0.4], ['star', 170, 22, 0.24]], 'kirby'],
		['prime', 'Metroid Prime', 'GameCube · Exploration sci-fi à la première personne.', '#070b10', '#ff7a1f', '#3fff9a', 'Orbitron', 'tech', 'rain',
			[['visor', 80, 56, 0.85], ['orb', 156, 36, 0.4], ['planet', 170, 80, 0.3]], 'metroid prime'],
		['smetroid', 'Super Metroid', 'SNES · Un monument du Metroidvania.', '#0c0716', '#e05a1a', '#9b5cff', 'Silkscreen', 'pixel', 'embers',
			[['planet', 140, 48, 0.62], ['visor', 60, 60, 0.6], ['orb', 176, 18, 0.24]], 'super metroid|metroid'],
		['sf64', 'Star Fox 64', 'Nintendo 64 · Combats spatiaux arcade.', '#070d18', '#4aa8ff', '#ff4a3a', 'Audiowide', 'tech', 'warp',
			[['ship', 80, 50, 0.75, 70], ['planet', 160, 36, 0.4], ['star', 30, 76, 0.2]], 'star ?fox|lylat'],
		['acnh', 'Animal Crossing', 'Switch · Vie paisible et personnalisation d’île.', '#0c140c', '#6ccf5f', '#ffd96b', 'Fredoka', 'bubble', 'leaves',
			[['island', 100, 78, 1.6], ['palm', 76, 52, 0.6], ['house', 136, 56, 0.4], ['sun', 176, 20, 0.24], ['leaf', 30, 28, 0.3, -20]], 'animal crossing|new horizons|city folk|new leaf|wild world'],
		['wiisports', 'Wii Sports', 'Wii · Un phénomène des jeux de salon.', '#eef2f5', '#20a8e8', '#7d8a94', 'Nunito', 'wii', 'bubbles',
			[['tennis', 70, 52, 0.7, -10], ['pin', 140, 52, 0.55], ['pin', 160, 56, 0.48, 6], ['cloud', 30, 22, 0.4]], 'wii sports|wii play|wii party', true],
		['wiifit', 'Wii Fit', 'Wii · Activités interactives avec la balance Wii.', '#f2f6f7', '#8cc63f', '#20a8e8', 'Nunito', 'wii', 'bubbles',
			[['board', 100, 66, 1], ['heart', 46, 30, 0.3], ['star', 156, 26, 0.26]], 'wii fit', true],
		['nintendogs', 'Nintendogs', 'DS · S’occuper de chiots virtuels.', '#fbf4ea', '#e8892b', '#8b5a2b', 'Fredoka', 'bubble', 'hearts',
			[['paw', 70, 52, 0.7], ['bone', 140, 40, 0.5, -15], ['ball', 160, 74, 0.26], ['heart', 30, 26, 0.24]], 'nintendogs', true],
		['tomodachi', 'Tomodachi Life', '3DS · Simulation de vie complètement loufoque.', '#f5f1fa', '#ff7a1a', '#39b54a', 'Fredoka', 'bubble', 'notes',
			[['speech', 70, 44, 0.66], ['house', 140, 60, 0.56], ['heart', 176, 26, 0.24]], 'tomodachi', true],
		['pikmin', 'Pikmin 2', 'GameCube · Stratégie et exploration.', '#0b130b', '#ff4040', '#3fa0ff', 'Fredoka', 'paper', 'leaves',
			[['sprout', 60, 54, 0.8], ['sprout', 100, 62, 0.62], ['flower', 150, 46, 0.5], ['leaf', 176, 80, 0.3]], 'pikmin'],
		['fzero', 'F-Zero GX', 'GameCube · Course futuriste ultra-rapide.', '#07071a', '#ff2bd6', '#3fe0ff', 'Audiowide', 'neon', 'warp',
			[['ship', 100, 54, 0.8, 90], ['flag', 30, 40, 0.4, -10], ['spot', 170, 50, 0.6]], 'f-?zero'],
		['goldensun', 'Golden Sun', 'GBA · RPG culte de la GBA.', '#120e06', '#ffb21a', '#6fd3ff', 'Cinzel', 'ornate', 'sparks',
			[['sun', 80, 50, 0.85], ['gem', 150, 40, 0.4], ['mountain', 160, 86, 0.7]], 'golden sun'],
		['earthbound', 'EarthBound', 'SNES · RPG étrange et plein d’humour.', '#121212', '#ff5aa5', '#58e0a0', 'VT323', 'pixel', 'notes',
			[['present', 70, 56, 0.66], ['planet', 150, 36, 0.4], ['star', 176, 76, 0.22]], 'earthbound|mother'],
		['linksawakening', 'Zelda : Link’s Awakening', 'Game Boy / Switch · Aventure portable classique.', '#0b1610', '#8fd16a', '#ffe46b', 'Fredoka', 'bubble', 'fairies',
			[['egg', 100, 40, 0.5], ['island', 100, 82, 1.4], ['palm', 40, 60, 0.5], ['fairy', 160, 30, 0.32]], 'link.?s awakening'],
		['yoshi', 'Yoshi’s Island', 'SNES · Plateforme au style dessiné.', '#fbf7ec', '#48b84a', '#ff6f61', 'Permanent Marker', 'paper', 'petals',
			[['egg', 70, 56, 0.66, -8], ['flower', 140, 44, 0.5], ['cloud', 170, 76, 0.4], ['hill', 30, 92, 0.8]], 'yoshi', true],
		['warioware', 'WarioWare : Mega Microgame$', 'GBA · Mini-jeux frénétiques.', '#15120a', '#f5d000', '#9b30ff', 'Bangers', 'paper', 'notes',
			[['micro', 70, 50, 0.7, -6], ['bolt', 140, 46, 0.44, 15], ['star', 170, 78, 0.24]], 'warioware|wario'],
		['mp2', 'Mario Party 2', 'Nintendo 64 · Jeu de plateau multijoueur.', '#0b1220', '#2ec4ff', '#ffd23f', 'Lilita One', 'bubble', 'confetti',
			[['dice', 70, 52, 0.62, -12], ['star', 140, 40, 0.42, 10], ['coin', 170, 74, 0.3]], 'mario party'],
		['advancewars', 'Advance Wars', 'GBA · Stratégie au tour par tour.', '#0e1208', '#e8432b', '#3f7fff', 'Russo One', 'tech', 'embers',
			[['tank', 80, 56, 0.8], ['flag', 156, 46, 0.44, 6]], 'advance wars'],
		['stadium', 'Pokémon Stadium', 'Nintendo 64 · Combats Pokémon en 3D.', '#0c0f1a', '#ffb000', '#ee1515', 'Lilita One', 'tech', 'sparks',
			[['spot', 40, 50, 0.9], ['spot', 160, 50, 0.9], ['ball', 100, 56, 0.6]], 'pokemon stadium|stadium'],
		// Deux thèmes « maison » plus poussés : effet plein écran (FX) et style d'interface propre (voir FX_OF).
		['p3r', 'Persona 3 Reload', 'PS2 / PSP / Switch · Bleu roi, eau et minuit.', '#030a3a', '#2f55ff', '#45e6ff', 'Bebas Neue', 'abyss', 'butterflies',
			[['wave', 100, 98, 2.4], ['tower', 56, 70, 1.05], ['fullmoon', 152, 30, 0.6], ['clock', 108, 60, 0.42], ['butterfly', 26, 26, 0.24, -14], ['butterfly', 184, 76, 0.18, 18]], 'persona ?3|p3r|p3p|p3 fes'],
		['p5r', 'Persona 5 Royal', 'PS3 / PS4 / Switch · Rouge, noir et blanc, en biais.', '#0b0000', '#e5191c', '#ffffff', 'Bangers', 'phantom', 'cards',
			[['burstStar', 142, 46, 0.86, 12], ['domino', 70, 52, 0.7, -8], ['card', 178, 76, 0.34, 14], ['catHead', 28, 76, 0.3, -6], ['rose', 28, 24, 0.3, -20]], 'persona ?5|p5r|p5 royal'],
	];

	const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
	const toHex = c => `#${c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
	const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
	const lum = (h) => { const [r, g, b] = hex(h).map(v => v / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

	const FX_OF = { p3r: 'abyss', p5r: 'phantom' };
	const THEMES = RAW.map(([id, label, desc, bg, accent, accent2, font, icons, particles, scene, keywords, light]) => {
		const parts = desc.split(' · ');
		return { id, label, game: label, console: parts.length > 1 ? parts[0] : '', tagline: parts.length > 1 ? parts.slice(1).join(' · ') : desc, bg, accent, accent2, font, icons, particles, scene, keywords, light: !!light, fx: FX_OF[id] || null };
	});
	// Thèmes exclusifs du mode supporter : créations originales (aucun personnage ni logo de jeu).
	const SUPPORTER = [
		['sup-aurora', 'Aurore boréale', 'Supporter · Voiles de lumière sur la toundra.', '#06121d', '#4dffc3', '#b48cff', 'Orbitron', 'neon', 'stars',
			[['mountain', 60, 92, 1.1], ['mountain', 150, 96, 0.8], ['moon', 165, 24, 0.35], ['star', 40, 22, 0.18], ['star', 110, 16, 0.14]]],
		['sup-royal', 'Velours royal', 'Supporter · Or, gemmes et couronne.', '#170a1c', '#ffcc4d', '#c94dff', 'Cinzel', 'ornate', 'sparks',
			[['crown', 100, 50, 0.7], ['gem', 40, 70, 0.35, -10], ['gem', 160, 70, 0.35, 10], ['star', 30, 22, 0.16], ['star', 172, 20, 0.16]]],
		['sup-sakura', 'Sakura de nuit', 'Supporter · Pétales sous la lune.', '#1a0e16', '#ff8fc7', '#ffe1f0', 'Fredoka', 'bubble', 'petals',
			[['moon', 150, 30, 0.45], ['flower', 50, 70, 0.5, -12], ['flower', 95, 82, 0.32, 18], ['heart', 175, 80, 0.25]]],
		['sup-synth', 'Synthwave', 'Supporter · Soleil rétro et grille néon.', '#10041d', '#ff3df2', '#3dd9ff', 'Audiowide', 'neon', 'warp',
			[['sun', 100, 58, 0.8], ['wave', 100, 92, 1.4], ['note', 34, 30, 0.3, -10], ['bolt', 170, 32, 0.3, 12]]],
	].map(([id, label, desc, bg, accent, accent2, font, icons, particles, scene]) => ({ id, label, game: label, console: 'Supporter', tagline: desc.split(' · ')[1], bg, accent, accent2, font, icons, particles, scene, keywords: '', light: false, supporter: true }));
	// Thèmes de la Boutique (achetés avec les pièces Smash) : couleurs et motifs inspirés des écrans d'inventaire et
	// de pause des grandes séries (plateforme, aventure, RPG stylé, monstres de poche, exploration spatiale…).
	// Créations originales : aucun nom, personnage ni logo de jeu.
	const S = (shapes, n) => shapes.map((s, i) => [s, 30 + ((i * 47) % 150), 25 + ((i * 31 + n * 7) % 65), 0.3 + ((i + n) % 4) * 0.12, (i % 2 ? 10 : -10)]);
	const SHOP = [
		// Plateforme
		['shop-pause-champi', 'Pause champignon', 'Rouge vif et or, comme un menu de pause de plateforme.', '#2a0707', '#ff3b30', '#ffd60a', 'Russo One', 'bubble', 'stars', S(['star', 'heart', 'sun'], 1)],
		['shop-etoile', 'Étoile de puissance', 'Jaune brillant sur bleu nuit.', '#0a1033', '#ffd23f', '#4fc3ff', 'Fredoka', 'bubble', 'sparks', S(['star', 'star', 'moon'], 2)],
		['shop-chateau-lave', 'Château de lave', 'Briques sombres et magma.', '#1a0603', '#ff5a1f', '#ffb347', 'Russo One', 'ornate', 'sparks', S(['crown', 'bolt', 'mountain'], 3)],
		['shop-nuage', 'Nuage arc-en-ciel', 'Pastel et ciel clair.', '#eaf6ff', '#ff6fb5', '#5ec8ff', 'Fredoka', 'bubble', 'petals', S(['sun', 'heart', 'flower'], 4), true],
		['shop-circuit', 'Circuit karting', 'Damier, piste et néons de course.', '#0d0d12', '#00e0ff', '#ff2e63', 'Audiowide', 'neon', 'warp', S(['bolt', 'star', 'wave'], 5)],
		['shop-des', 'Fête des dés', 'Plateau festif et confettis.', '#1a0f2e', '#ffcf3a', '#3ddc84', 'Fredoka', 'bubble', 'sparks', S(['star', 'gem', 'heart'], 6)],
		['shop-galaxie', 'Galaxie ronde', 'Planètes miniatures et poussière d’étoiles.', '#06061a', '#8e7dff', '#ffde59', 'Orbitron', 'neon', 'stars', S(['moon', 'star', 'star', 'sun'], 7)],
		['shop-tropical', 'Île tropicale', 'Lagon turquoise et soleil.', '#03262b', '#2ee6c8', '#ffd166', 'Fredoka', 'bubble', 'petals', S(['sun', 'wave', 'flower'], 8)],
		// Aventure héroïque
		['shop-sac-heros', 'Sac du héros', 'Cuir, laiton et cases d’objets.', '#1c140a', '#e3b04b', '#7fbf6a', 'Cinzel', 'ornate', 'sparks', S(['gem', 'crown', 'mountain'], 9)],
		['shop-parchemin', 'Parchemin sépia', 'Carte ancienne et encre brune.', '#f3e6c8', '#8b5a2b', '#3f6e4a', 'Cinzel', 'ornate', 'petals', S(['mountain', 'sun', 'star'], 10), true],
		['shop-ardoise', 'Ardoise runique', 'Tablette sombre et lueurs bleues.', '#0b1418', '#3fd3ff', '#ffb547', 'Orbitron', 'neon', 'stars', S(['gem', 'moon', 'bolt'], 11)],
		['shop-temple-eau', 'Temple de l’eau', 'Bleus profonds et reflets.', '#041a2b', '#4fb3ff', '#9ff3ff', 'Cinzel', 'ornate', 'warp', S(['wave', 'gem', 'moon'], 12)],
		['shop-foret', 'Forêt perdue', 'Mousse, lucioles et brume.', '#07160b', '#7bd96b', '#e9f59d', 'Cinzel', 'ornate', 'petals', S(['flower', 'mountain', 'star'], 13)],
		['shop-desert', 'Désert ocre', 'Sable chaud et turquoise.', '#2b1a0b', '#f0a24a', '#3fd0c9', 'Cinzel', 'ornate', 'sparks', S(['sun', 'mountain', 'gem'], 14)],
		['shop-masque', 'Lune menaçante', 'Ciel violet et lune trop proche.', '#140a1f', '#c86bff', '#ffcf6b', 'Cinzel', 'ornate', 'stars', S(['moon', 'star', 'crown'], 15)],
		['shop-epee', 'Épée de légende', 'Acier, or et violet royal.', '#0f0d1c', '#b9c4ff', '#ffd76b', 'Cinzel', 'ornate', 'sparks', S(['crown', 'bolt', 'star'], 16)],
		// RPG stylé
		['shop-rebelle', 'Rouge rebelle', 'Rouge, noir et blanc, typographie qui claque.', '#0b0000', '#ff1e2d', '#ffffff', 'Russo One', 'neon', 'sparks', S(['bolt', 'star', 'crown'], 17)],
		['shop-minuit', 'Minuit bleu', 'Bleu électrique et horloge de minuit.', '#020a26', '#2f7bff', '#a6f0ff', 'Russo One', 'neon', 'stars', S(['moon', 'note', 'bolt'], 18)],
		['shop-enquete', 'Jaune enquête', 'Jaune vif et brouillard télévisé.', '#141000', '#ffd400', '#ff7a00', 'Russo One', 'neon', 'warp', S(['star', 'bolt', 'sun'], 19)],
		['shop-velours', 'Salle de velours', 'Bleu velours et piano.', '#06102a', '#4d7dff', '#e7c27a', 'Cinzel', 'ornate', 'sparks', S(['note', 'crown', 'moon'], 20)],
		['shop-calendrier', 'Calendrier scolaire', 'Cahier quadrillé et post-it.', '#f6f3ea', '#ff5c5c', '#2e7dff', 'Nunito', 'bubble', 'petals', S(['sun', 'heart', 'star'], 21), true],
		['shop-tarot', 'Arcanes', 'Cartes de tarot, or et nuit.', '#120a18', '#e8c35a', '#7a5cff', 'Cinzel', 'ornate', 'stars', S(['moon', 'sun', 'star', 'gem'], 22)],
		['shop-neon-ville', 'Ville néon', 'Rues de nuit et enseignes.', '#08060f', '#ff2bd6', '#00f0ff', 'Audiowide', 'neon', 'warp', S(['bolt', 'note', 'star'], 23)],
		// Monstres de poche
		['shop-boite-pc', 'Boîte de stockage', 'Grille de boîtes et papier peint.', '#0e2a1e', '#4ee38a', '#ffd84d', 'Silkscreen', 'bubble', 'sparks', S(['gem', 'heart', 'star'], 24)],
		['shop-sac-dresseur', 'Sac de dresseur', 'Poches colorées et fermetures éclair.', '#1d0c0c', '#ff4d4d', '#ffe15a', 'Fredoka', 'bubble', 'sparks', S(['star', 'gem', 'heart'], 25)],
		['shop-badge-feu', 'Badge feu', 'Flammes et volcan.', '#1f0700', '#ff6a00', '#ffd23a', 'Russo One', 'bubble', 'sparks', S(['sun', 'mountain', 'bolt'], 26)],
		['shop-badge-eau', 'Badge eau', 'Vagues et bulles.', '#021a33', '#2aa6ff', '#9fe8ff', 'Fredoka', 'bubble', 'petals', S(['wave', 'moon', 'gem'], 27)],
		['shop-badge-plante', 'Badge plante', 'Feuilles et pollen.', '#081a07', '#5fd35a', '#f2f27a', 'Fredoka', 'bubble', 'petals', S(['flower', 'flower', 'sun'], 28)],
		['shop-badge-foudre', 'Badge foudre', 'Éclairs et jaune électrique.', '#141100', '#ffe11f', '#5ad1ff', 'Russo One', 'neon', 'sparks', S(['bolt', 'bolt', 'star'], 29)],
		['shop-encyclo', 'Encyclopédie rouge', 'Appareil rouge et écran bleu.', '#2a0508', '#ff3346', '#58d7ff', 'Silkscreen', 'neon', 'stars', S(['gem', 'star', 'moon'], 30)],
		['shop-poche-verte', 'Écran de poche', 'Quatre verts, comme une vieille console de poche.', '#0f380f', '#9bbc0f', '#8bac0f', 'Silkscreen', 'bubble', 'stars', S(['heart', 'star', 'sun'], 31)],
		// Exploration spatiale
		['shop-visiere', 'Visière de combat', 'HUD orange et verre teinté.', '#0a0c10', '#ff8a1f', '#43e6ff', 'Orbitron', 'neon', 'warp', S(['bolt', 'gem', 'star'], 32)],
		['shop-carte-orange', 'Carte des cavernes', 'Plan quadrillé orange et bleu.', '#070d1c', '#ff9b38', '#3a7bff', 'Orbitron', 'neon', 'stars', S(['mountain', 'gem', 'star'], 33)],
		['shop-armure', 'Armure variable', 'Rouge, or et vert.', '#120606', '#ff4a2a', '#7cff6b', 'Orbitron', 'neon', 'sparks', S(['crown', 'bolt', 'gem'], 34)],
		['shop-lave-sous', 'Lave souterraine', 'Roche et magma.', '#160502', '#ff3c00', '#ffb000', 'Orbitron', 'ornate', 'sparks', S(['mountain', 'bolt', 'sun'], 35)],
		['shop-cristaux', 'Cristaux bleus', 'Minerai radioactif et brume.', '#030d18', '#36c8ff', '#b06bff', 'Orbitron', 'neon', 'stars', S(['gem', 'gem', 'moon'], 36)],
		['shop-scan', 'Journal de scan', 'Lignes de données vertes.', '#020f08', '#3dff8f', '#c3ff5e', 'Silkscreen', 'neon', 'warp', S(['note', 'bolt', 'star'], 37)],
		// Autres classiques
		['shop-fenetre-bleue', 'Fenêtre bleue', 'Le dégradé bleu des menus de RPG d’antan.', '#000c4a', '#ffffff', '#7fa8ff', 'Silkscreen', 'ornate', 'stars', S(['star', 'crown', 'moon'], 38)],
		['shop-forge', 'Atelier forge', 'Enclume, braises et métal.', '#120c08', '#ff7b2f', '#c9d1d9', 'Cinzel', 'ornate', 'sparks', S(['bolt', 'mountain', 'crown'], 39)],
		['shop-tresor', 'Carte au trésor', 'Bois flotté et or.', '#1a1006', '#ffc93c', '#2ec4b6', 'Cinzel', 'ornate', 'sparks', S(['gem', 'sun', 'wave'], 40)],
		['shop-sablier', 'Sablier du temps', 'Sable doré et bleu nuit.', '#081028', '#f2c14e', '#6fa8ff', 'Cinzel', 'ornate', 'stars', S(['moon', 'star', 'sun'], 41)],
		['shop-grimoire', 'Grimoire', 'Pages violettes et runes.', '#12081c', '#b26bff', '#4dffd2', 'Cinzel', 'ornate', 'petals', S(['moon', 'gem', 'star'], 42)],
		['shop-cuisine', 'Cuisine du village', 'Tons chauds et carreaux.', '#fff4e3', '#e8642c', '#3a9d5d', 'Fredoka', 'bubble', 'petals', S(['sun', 'heart', 'flower'], 43), true],
		['shop-rythme', 'Boîte à rythmes', 'Pads lumineux et basses.', '#0a0612', '#ff3dbb', '#ffe23d', 'Audiowide', 'neon', 'warp', S(['note', 'note', 'bolt'], 44)],
		['shop-givre', 'Royaume de givre', 'Glace et aurore.', '#04131f', '#9fe9ff', '#d1b3ff', 'Cinzel', 'ornate', 'stars', S(['mountain', 'moon', 'star'], 45)],
	].map(([id, label, tagline, bg, accent, accent2, font, icons, particles, scene, light = false]) => ({ id, label, game: label, console: 'Boutique', tagline, bg, accent, accent2, font, icons, particles, scene, keywords: '', light, shop: true }));
	const byId = Object.fromEntries([...THEMES, ...SUPPORTER, ...SHOP].map(t => [t.id, t]));

	// Anciens identifiants (première version à 105 thèmes) → thème le plus proche.
	const ALIASES = {
		plombier: 'smb', champignon: 'smb', galaxie: 'galaxy', bowser: 'sm64', etoile: 'sm64', boo: 'luigi3', luigi: 'luigi3', peach: 'paper', kart: 'mk8', party: 'mp2',
		hyrule: 'oot', triforce: 'oot', majora: 'oot', ocarina: 'oot', crepuscule: 'botw', sheikah: 'botw', gerudo: 'alttp', pokeball: 'pkmnrb', pikachu: 'pkmnrb',
		samus: 'prime', zebes: 'smetroid', dreamland: 'kirby', banane: 'dkc', jungle: 'dkc', arwing: 'sf64', falcon: 'fzero', destination: 'smash',
		ankh: 'earthbound', feuille: 'acnh', nook: 'acnh', emblem: 'fe3h', monado: 'xeno', wii: 'wiisports', wario: 'warioware',
	};
	const resolve = id => (byId[id] ? id : ALIASES[id] || id);

	// Polices des thèmes de base (themes.css).
	const BASE_FONTS = { smash: 'Russo One', modrinth: 'Nunito', neon: 'Audiowide', ocean: 'Fredoka', gameboy: 'Silkscreen', gold: 'Cinzel', light: 'Nunito' };
	const fontStack = f => `'${f}', 'Inter', 'Segoe UI', sans-serif`;

	const palette = t => ({ a: t.accent, b: t.accent2, c: t.light ? '#ffffff' : mix(t.accent2, '#ffffff', 0.75), d: t.light ? '#2a2a33' : mix(t.bg, '#000000', 0.35), bg: t.bg });

	// Variables CSS déduites du fond et des accents (mêmes noms que themes.css).
	const vars = (t) => {
		const rgb = hex(t.accent).join(', ');
		const base = t.light
			? { '--bg': t.bg, '--raised': mix(t.bg, '#ffffff', 0.75), '--raised-2': mix(t.bg, '#000000', 0.035), '--button': mix(t.bg, '#000000', 0.07), '--button-hover': mix(t.bg, '#000000', 0.12), '--divider': mix(t.bg, '#000000', 0.08), '--text': '#3a3a44', '--text-dim': '#6e6e78', '--contrast': '#15151a', 'color-scheme': 'light' }
			: { '--bg': t.bg, '--raised': mix(t.bg, '#ffffff', 0.06), '--raised-2': mix(t.bg, '#ffffff', 0.03), '--button': mix(t.bg, '#ffffff', 0.11), '--button-hover': mix(t.bg, '#ffffff', 0.16), '--divider': mix(t.bg, '#ffffff', 0.08), '--text': mix(t.accent, '#d4d4da', 0.82), '--text-dim': mix(t.accent, '#8a8a92', 0.85), '--contrast': '#ffffff', 'color-scheme': 'dark' };
		return {
			...base,
			'--brand': t.accent,
			'--brand-hover': mix(t.accent, t.light ? '#000000' : '#ffffff', 0.18),
			'--brand-rgb': rgb,
			'--brand-2': t.accent2,
			'--brand-2-rgb': hex(t.accent2).join(', '),
			'--on-brand': lum(t.accent) > 0.55 ? '#111111' : '#ffffff',
			'--danger': '#ff8a3d',
			'--danger-rgb': '255, 138, 61',
			'--glow': `0 0 22px rgba(${rgb}, ${t.light ? 0.25 : 0.35})`,
			'--font-display': fontStack(t.font),
		};
	};

	const baseCss = () => Object.entries(BASE_FONTS).map(([id, f]) => `${id === 'smash' ? ':root, ' : ''}:root[data-theme="${id}"] {--font-display:${fontStack(f)};}`).join('\n');
	const css = () => `${baseCss()}\n${[...THEMES, ...SUPPORTER, ...SHOP].map(t => `:root[data-theme="${t.id}"] {${Object.entries(vars(t)).map(([k, v]) => `${k}:${v};`).join('')}}`).join('\n')}`;

	// ---------- Illustration ----------

	let uid = 0;
	// Chemin d'image → URL affichable (fourni par la fenêtre qui l'affiche ; sans lui, pas d'image).
	let imageUrl = null;
	const setImageUrl = (fn) => { imageUrl = fn; };
	const imgOf = (t, k) => (t[k] && imageUrl ? imageUrl(t[k]) : '');
	// Scène du thème (SVG 200×100 étirable) : ciel dégradé + motifs.
	const scene = (id, { sky = true } = {}) => {
		const t = byId[resolve(id)];
		if (!t) return '';
		const p = palette(t);
		const grad = `g-${t.id}-${++uid}`;
		const items = t.scene.map(([m, x, y, s = 1, r = 0]) => (M[m] ? `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})">${M[m](p)}</g>` : '')).join('');
		// Thème personnalisé : image de fond (assombrie) et image d'illustration à droite.
		const bgImg = sky ? imgOf(t, 'image') : '';
		const back = bgImg ? `<image href="${bgImg}" width="200" height="100" preserveAspectRatio="xMidYMid slice"/><rect width="200" height="100" fill="${t.bg}" opacity="${Math.min(0.6, t.imageDim || 0)}"/>` : '';
		const stickerImg = imgOf(t, 'sticker');
		const sticker = stickerImg ? `<image href="${stickerImg}" x="112" y="6" width="84" height="90" preserveAspectRatio="xMidYMax meet"/>` : '';
		return `<svg class="theme-scene" viewBox="0 0 200 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${sky ? `<defs><linearGradient id="${grad}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(t.bg, t.accent2, t.light ? 0.25 : 0.22)}"/><stop offset="1" stop-color="${t.bg}"/></linearGradient></defs><rect width="200" height="100" fill="url(#${grad})"/>` : ''}${back}${items}${sticker}</svg>`;
	};

	// Petite icône du thème (son motif principal), pour les listes.
	const emblem = (id, size = 28) => {
		const t = byId[resolve(id)];
		if (!t) return '';
		const main = t.scene.find(([k]) => !['hill', 'cloud', 'wave', 'mountain', 'spot'].includes(k)) || t.scene[0];
		return `<svg viewBox="-55 -55 110 110" width="${size}" height="${size}" aria-hidden="true"><g transform="rotate(${main[4] || 0})">${M[main[0]](palette(t))}</g></svg>`;
	};

	// ---------- Décor animé de la fenêtre (illustration + particules) ----------

	const decor = (id, mode = 'full') => {
		const t = byId[resolve(id)];
		if (!t || mode === 'off') return '';
		const p = palette(t);
		const part = t.particles === 'none' ? null : PARTICLES[t.particles];
		let particles = '';
		if (part && mode === 'full') {
			for (let k = 0; k < part.count; k++) {
				const size = 10 + Math.round(Math.random() * 16);
				const style = `left:${Math.round(Math.random() * 100)}%;top:${Math.round(Math.random() * 100)}%;width:${size}px;height:${size}px;animation-delay:-${(Math.random() * 12).toFixed(1)}s;animation-duration:${(8 + Math.random() * 10).toFixed(1)}s`;
				particles += `<svg class="decor-p ${part.motion} ${part.glow ? 'glow' : ''}" style="${style}" viewBox="-55 -55 110 110" aria-hidden="true">${part.draw(p, k)}</svg>`;
			}
		}
		const bgImg = imgOf(t, 'image');
		const back = bgImg ? `<div class="decor-image" style="background-image:url(&quot;${bgImg}&quot;);filter:blur(${t.imageBlur || 0}px)"></div><div class="decor-dim" style="opacity:${t.imageDim}"></div>` : '';
		const fx = t.fx && FX[t.fx] ? FX[t.fx](p, mode === 'full') : '';
		return `${back}${fx}<div class="decor-scene ${bgImg ? 'over-image' : ''}">${scene(t.id, { sky: false })}</div><div class="decor-particles">${particles}</div>`;
	};

	// ---------- Choix du thème d'un jeu ----------

	const SYSTEM_THEME = { wii: 'wiisports' };
	const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
	const compiled = THEMES.filter(t => t.keywords).map(t => ({ id: t.id, re: new RegExp(t.keywords, 'i') }));
	// Le mot-clé trouvé le plus long l'emporte (« mario party » passe avant « mario »).
	const match = (gameName, system) => {
		const name = norm(gameName);
		let best = null;
		for (const c of compiled) {
			const m = name.match(c.re);
			if (m && (!best || m[0].length > best.len)) best = { id: c.id, len: m[0].length };
		}
		return best ? best.id : (SYSTEM_THEME[system] || null);
	};

	// ---------- Thèmes personnalisés (créés dans Paramètres → Apparence) ----------

	const FONTS = ['Inter', 'Russo One', 'Nunito', 'Audiowide', 'Fredoka', 'Silkscreen', 'Cinzel', 'Luckiest Guy', 'Bangers', 'Pirata One', 'Orbitron', 'Creepster', 'VT323', 'Bebas Neue', 'Lilita One', 'Permanent Marker', 'Metal Mania', 'Press Start 2P'];
	const ICON_STYLES = ['default', 'wii', 'ornate', 'pixel', 'neon', 'paper', 'bubble', 'tech'];
	const SPOTS = [[62, 56, 0.72, -6], [142, 40, 0.46, 8], [174, 78, 0.3, 0], [28, 26, 0.3, -12]];
	const CUSTOM = [];
	const HEX = /^#[0-9a-f]{6}$/i;
	const IMG = /\.(png|jpe?g|webp|gif)$/i;
	const clamp = (v, a, b, d) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Math.min(b, Math.max(a, Number(v))) : d);

	// Valide et complète une définition ; les champs inconnus sont ignorés.
	const normalize = (d = {}) => {
		const id = /^custom-[a-z0-9-]{1,40}$/.test(d.id || '') ? d.id : `custom-${Date.now().toString(36)}`;
		const motifs = (Array.isArray(d.motifs) ? d.motifs : []).filter(m => M[m]).slice(0, 4);
		return {
			id,
			label: String(d.label || 'Mon thème').slice(0, 40),
			game: 'Thème personnalisé', console: 'Perso', tagline: String(d.tagline || 'Créé dans Smash Emu').slice(0, 80),
			bg: HEX.test(d.bg) ? d.bg : '#101014',
			accent: HEX.test(d.accent) ? d.accent : '#ff1f3d',
			accent2: HEX.test(d.accent2) ? d.accent2 : '#ffd23f',
			font: FONTS.includes(d.font) ? d.font : 'Inter',
			icons: ICON_STYLES.includes(d.icons) ? d.icons : 'default',
			particles: PARTICLES[d.particles] ? d.particles : (d.particles === 'none' ? 'none' : 'stars'),
			motifs,
			scene: motifs.map((m, k) => [m, ...SPOTS[k]]),
			keywords: '',
			light: !!d.light,
			image: typeof d.image === 'string' && IMG.test(d.image) ? d.image : '',
			sticker: typeof d.sticker === 'string' && IMG.test(d.sticker) ? d.sticker : '',
			imageDim: clamp(d.imageDim, 0, 0.9, 0.55),
			imageBlur: clamp(d.imageBlur, 0, 20, 0),
			custom: true,
		};
	};

	const register = (def) => {
		const t = normalize(def);
		const k = CUSTOM.findIndex(x => x.id === t.id);
		if (k >= 0) CUSTOM[k] = t; else CUSTOM.push(t);
		byId[t.id] = t;
		if (typeof document !== 'undefined') {
			let style = document.getElementById(`theme-${t.id}`);
			if (!style) { style = document.createElement('style'); style.id = `theme-${t.id}`; document.head.appendChild(style); }
			style.textContent = `:root[data-theme="${t.id}"] {${Object.entries(vars(t)).map(([key, v]) => `${key}:${v};`).join('')}}`;
		}
		return t;
	};
	const unregister = (id) => { const k = CUSTOM.findIndex(x => x.id === id); if (k >= 0) CUSTOM.splice(k, 1); delete byId[id]; if (typeof document !== 'undefined') { const s = document.getElementById(`theme-${id}`); if (s) s.remove(); } };

	// Code de partage : « SMASHTHEME- » + JSON en base64 URL (sans les champs calculés).
	const exportCode = (t) => {
		const json = JSON.stringify({ label: t.label, tagline: t.tagline, bg: t.bg, accent: t.accent, accent2: t.accent2, font: t.font, icons: t.icons, particles: t.particles, motifs: t.motifs, light: t.light, imageDim: t.imageDim, imageBlur: t.imageBlur });
		const b64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, 'utf8').toString('base64');
		return `SMASHTHEME-${b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
	};
	const importCode = (code) => {
		const m = String(code || '').trim().match(/^SMASHTHEME-([A-Za-z0-9_-]+)$/);
		if (!m) throw new Error('Code de thème invalide (il commence par SMASHTHEME-).');
		const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
		let data;
		try { data = JSON.parse(typeof atob === 'function' ? decodeURIComponent(escape(atob(b64))) : Buffer.from(b64, 'base64').toString('utf8')); } catch { throw new Error('Code de thème abîmé.'); }
		return normalize({ ...data, id: undefined });
	};

	const api = {
		THEMES, SUPPORTER, SHOP, CUSTOM, FONTS, ICON_STYLES, setImageUrl, PARTICLE_TYPES: Object.keys(PARTICLES), register, unregister, normalize, exportCode, importCode,
		css, match, vars, scene, emblem, decor, resolve, BASE_FONTS, MOTIFS: Object.keys(M),
		get: id => byId[resolve(id)] || null,
		fontOf: id => (byId[resolve(id)] ? byId[resolve(id)].font : BASE_FONTS[id] || 'Inter'),
		iconsOf: id => (byId[resolve(id)] ? byId[resolve(id)].icons : 'default'),
		ransom,
		fxWord,
	};
	root.SmashThemes = api;
	if (typeof module !== 'undefined' && module.exports) module.exports = api;
	if (typeof document !== 'undefined' && !document.getElementById('game-themes')) {
		const style = document.createElement('style');
		style.id = 'game-themes';
		style.textContent = css();
		document.head.appendChild(style);
	}
})(typeof window !== 'undefined' ? window : globalThis);
