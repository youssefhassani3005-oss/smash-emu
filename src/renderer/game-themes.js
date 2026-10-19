// 100 thèmes inspirés des jeux et des consoles, et choix automatique du thème selon le jeu lancé.
// Chaque thème est décrit par sa couleur de fond et sa couleur d'accent ; les autres couleurs de l'interface
// en sont déduites. Partagé par la fenêtre principale, les fenêtres de jeu (CSS injecté) et le processus
// principal (choix du thème d'un jeu).
(function (root) {
	// [id, nom, inspiration, fond, accent, mots-clés du titre (expression régulière), clair]
	const RAW = [
		// Mario
		['plombier', 'Plombier rouge', 'Mario', '#170909', '#e52521', 'super mario|mario 64|mario bros|mario world|new super'],
		['champignon', 'Royaume Champignon', 'Mario', '#0c1a0d', '#43b047', 'mushroom kingdom|toad'],
		['galaxie', 'Galaxie étoilée', 'Super Mario Galaxy', '#0b0a22', '#ffd23f', 'galaxy'],
		['bowser', 'Château de Bowser', 'Mario', '#160a05', '#ff6a13', 'bowser|koopa'],
		['luigi', 'Frère vert', 'Luigi', '#081609', '#2fbf3a', 'luigi'],
		['peach', 'Princesse rose', 'Peach', '#1a0b14', '#ff7eb6', 'peach'],
		['etoile', 'Super étoile', 'Mario', '#14110a', '#ffc400', 'star road|superstar'],
		['boo', 'Manoir hanté', 'Boo', '#111018', '#b9b4e8', 'boo|mansion|luigi.?s mansion'],
		['kart', 'Circuit arc-en-ciel', 'Mario Kart', '#120a1f', '#ff4fd8', 'mario kart|kart'],
		['party', 'Plateau de fête', 'Mario Party', '#0b1220', '#2ec4ff', 'mario party|party'],
		['paper', 'Papier découpé', 'Paper Mario', '#17130c', '#f2a03d', 'paper mario'],
		['yoshi', 'Île de Yoshi', 'Yoshi', '#0b1708', '#7ed957', 'yoshi'],
		['wario', 'Ail doré', 'Wario', '#15120a', '#f5d000', 'wario'],
		// Zelda
		['hyrule', 'Plaines d’Hyrule', 'Zelda', '#0b140b', '#3fa34d', 'zelda|hyrule|link.?s awakening|link to the past'],
		['triforce', 'Triforce', 'Zelda', '#13100a', '#e8b923', 'triforce|wind waker'],
		['majora', 'Lune de Majora', 'Majora’s Mask', '#120a18', '#ff7a2f', 'majora'],
		['ocarina', 'Ocarina du temps', 'Ocarina of Time', '#0a0f1c', '#3d7bff', 'ocarina'],
		['crepuscule', 'Crépuscule', 'Twilight Princess', '#0a1213', '#ff9a3c', 'twilight princess'],
		['sheikah', 'Tablette Sheikah', 'Breath of the Wild', '#071317', '#3ff0ff', 'breath of the wild|tears of the kingdom|sheikah'],
		['gerudo', 'Désert Gerudo', 'Zelda', '#1a1208', '#f29b38', 'gerudo'],
		// Pokémon
		['pokeball', 'Poké Ball', 'Pokémon', '#140a0b', '#ee1515', 'pokemon|pokémon'],
		['pikachu', 'Éclair jaune', 'Pikachu', '#15130a', '#ffd400', 'pikachu|yellow'],
		['bulbizarre', 'Graine', 'Bulbizarre', '#0a1512', '#2fc4a0', 'bulbasaur|bulbizarre'],
		['salameche', 'Flammèche', 'Salamèche', '#180c06', '#ff8a2b', 'charmander|salam'],
		['carapuce', 'Bulles', 'Carapuce', '#08121a', '#4fb3ff', 'squirtle|carapuce'],
		['mewtwo', 'Psy', 'Mewtwo', '#120d18', '#b98cff', 'mewtwo|mew'],
		['ectoplasma', 'Spectre', 'Ectoplasma', '#0f0a16', '#8f4dff', 'gengar|ectoplasma'],
		['stadium', 'Arène', 'Pokémon Stadium', '#0c0f1a', '#ffb000', 'stadium'],
		// Sonic
		['sonic', 'Hérisson bleu', 'Sonic', '#060c1c', '#1f5bff', 'sonic'],
		['emeraude', 'Émeraude du Chaos', 'Sonic', '#061510', '#00d27a', 'emerald|chaos emerald'],
		['tails', 'Deux queues', 'Tails', '#170e05', '#ffa516', 'tails'],
		['shadow', 'Ombre', 'Shadow', '#0b0b0d', '#ff2847', 'shadow the hedgehog'],
		// Nintendo divers
		['samus', 'Armure de Samus', 'Metroid', '#140b06', '#ff6a1f', 'metroid|samus'],
		['zebes', 'Planète Zebes', 'Metroid', '#0e0a17', '#9b5cff', 'zebes|super metroid'],
		['kirby', 'Boule rose', 'Kirby', '#170a12', '#ff8fc8', 'kirby'],
		['dreamland', 'Pays des rêves', 'Kirby', '#09121c', '#7ac4ff', 'dream land|dreamland'],
		['metaknight', 'Chevalier masqué', 'Kirby', '#0a0b17', '#e2b33c', 'meta knight'],
		['banane', 'Réserve de bananes', 'Donkey Kong', '#140f07', '#ffcc29', 'donkey kong|\\bdk\\b|diddy'],
		['jungle', 'Jungle', 'Donkey Kong', '#0b120a', '#8bc34a', 'jungle|country'],
		['arwing', 'Escadrille', 'Star Fox', '#090d16', '#4aa8ff', 'star ?fox|lylat'],
		['falcon', 'Pilote de course', 'F-Zero', '#0a0a1c', '#ff3fa4', 'f-?zero|falcon'],
		['destination', 'Destination finale', 'Smash Bros', '#0c0717', '#9d6bff', 'smash bros|super smash'],
		['pikmin', 'Petits végétaux', 'Pikmin', '#0a1409', '#ff5252', 'pikmin'],
		['ankh', 'Grande ville', 'EarthBound', '#121212', '#ff5aa5', 'earthbound|mother'],
		['banjo', 'Ours et oiseau', 'Banjo-Kazooie', '#140e08', '#e0a030', 'banjo'],
		['goldeneye', 'Agent secret', 'GoldenEye', '#0b0d0b', '#c9a227', 'goldeneye|007|perfect dark'],
		['vague', 'Course sur l’eau', 'Wave Race', '#04121a', '#00c2ff', 'wave race'],
		['splat-orange', 'Encre orange', 'Splatoon', '#120b05', '#ff7a00', 'splatoon'],
		['splat-violet', 'Encre violette', 'Splatoon', '#0e0717', '#b100ff', 'splat'],
		['feuille', 'Village tranquille', 'Animal Crossing', '#0c140c', '#6ccf5f', 'animal crossing|city folk|new leaf'],
		['nook', 'Boutique Nook', 'Animal Crossing', '#13110c', '#5aa7d6', 'nook'],
		['emblem', 'Emblème du feu', 'Fire Emblem', '#0a0d18', '#d4a73a', 'fire emblem'],
		['monado', 'Épée Monado', 'Xenoblade', '#0b0f14', '#ff3b3b', 'xenoblade|monado'],
		['megaman', 'Robot bleu', 'Mega Man', '#06101c', '#2f8cff', 'mega ?man|rockman'],
		['protoman', 'Robot rouge', 'Mega Man', '#140708', '#ff3d3d', 'proto ?man|zero'],
		// Grandes séries
		['cristal', 'Cristal', 'Final Fantasy', '#080f17', '#7fd3ff', 'final fantasy|ff ?[ivx0-9]'],
		['materia', 'Materia', 'Final Fantasy VII', '#071108', '#3ee26e', 'materia|ff ?vii|final fantasy vii'],
		['chocobo', 'Chocobo', 'Final Fantasy', '#151207', '#ffd84a', 'chocobo'],
		['mako', 'Énergie Mako', 'Final Fantasy VII', '#061412', '#2cf5c4', 'mako|midgar'],
		['dracula', 'Château de Dracula', 'Castlevania', '#120507', '#c4002f', 'castlevania|dracula|belmont'],
		['gothique', 'Gothique', 'Castlevania', '#0e0911', '#9c4dcc', 'symphony of the night'],
		['carton', 'Infiltration', 'Metal Gear', '#10120b', '#a4b35c', 'metal gear|snake'],
		['codec', 'Codec', 'Metal Gear', '#050f07', '#3cff6e', 'codec'],
		['crash', 'Bandicoot', 'Crash', '#170b04', '#ff7b00', 'crash'],
		['spyro', 'Petit dragon', 'Spyro', '#0f0717', '#b05cff', 'spyro'],
		['wumpa', 'Fruit Wumpa', 'Crash', '#140a06', '#ff4e2a', 'wumpa'],
		['spartan', 'Spartan', 'Halo', '#0d100a', '#c8a13c', 'halo|master chief'],
		['covenant', 'Covenant', 'Halo', '#0d0817', '#a259ff', 'covenant'],
		['persona5', 'Cœurs volés', 'Persona 5', '#0a0a0a', '#e5192d', 'persona 5|phantom thie'],
		['persona4', 'Brouillard', 'Persona 4', '#141206', '#ffd200', 'persona 4'],
		['persona3', 'Heure sombre', 'Persona 3', '#060c18', '#2f8fff', 'persona 3|persona'],
		['hadoken', 'Boule d’énergie', 'Street Fighter', '#060d1a', '#3fa9ff', 'street fighter|hadou?ken'],
		['shoryuken', 'Uppercut de feu', 'Street Fighter', '#170805', '#ff5a1f', 'shoryuken|\\bryu\\b'],
		['dragon', 'Tournoi', 'Mortal Kombat', '#120b05', '#e6b325', 'mortal kombat|tekken|tournament'],
		['rayman', 'Héros sans bras', 'Rayman', '#120a14', '#c070ff', 'rayman'],
		['ratchet', 'Mécano spatial', 'Ratchet & Clank', '#110d06', '#ff9e1b', 'ratchet|clank'],
		['jak', 'Éco bleu', 'Jak & Daxter', '#071216', '#33d6ff', 'jak|daxter'],
		['creeper', 'Monde en blocs', 'Minecraft', '#0b120a', '#5fb83b', 'minecraft|creeper'],
		['nether', 'Nether', 'Minecraft', '#150606', '#ff4b2b', 'nether'],
		['ender', 'Ender', 'Minecraft', '#0a0710', '#c86bff', '\\bender\\b'],
		['enfer', 'Enfer', 'Doom', '#140806', '#d3361b', 'doom|\\bhell\\b'],
		['quake', 'Rouille', 'Quake', '#120d09', '#b5732a', 'quake'],
		['cyber', 'Néon cyber', 'Cyberpunk', '#06101a', '#00f0ff', 'cyber|deus ex'],
		['chevalier', 'Chevalier pâle', 'Hollow Knight', '#07090e', '#cfe2ff', 'hollow knight|silksong'],
		['montagne', 'Sommet', 'Celeste', '#120a1a', '#ff6fa8', 'celeste'],
		['determination', 'Détermination', 'Undertale', '#0a0a0a', '#ffde00', 'undertale|deltarune'],
		// Arcade et rétro
		['pacman', 'Glouton jaune', 'Pac-Man', '#05051a', '#ffe600', 'pac-?man'],
		['fantome', 'Fantôme rouge', 'Pac-Man', '#0a0518', '#ff2b2b', 'ghost'],
		['envahisseurs', 'Envahisseurs', 'Space Invaders', '#020702', '#39ff14', 'invaders|galaga|asteroids'],
		['tetris', 'Blocs qui tombent', 'Tetris', '#061016', '#00e5ff', 'tetris|puyo|columns'],
		['arcade', 'Salle d’arcade', 'Arcade', '#0b0614', '#ff2bd6', 'arcade|neo ?geo|metal slug'],
		['pong', 'Raquettes', 'Pong', '#000000', '#ffffff', 'pong|breakout'],
		// Consoles
		['nes', 'Cartouche grise', 'NES', '#111111', '#e4000f', ''],
		['snes', 'Manette violette', 'Super Nintendo', '#100d18', '#8b5cf6', 'snes|super nintendo'],
		['n64', 'Quatre couleurs', 'Nintendo 64', '#07101a', '#1f8bff', ''],
		['gamecube', 'Cube indigo', 'GameCube', '#0b0a1a', '#6c5ce7', 'gamecube'],
		['wii', 'Console blanche', 'Wii', '#eef4f8', '#00a2e8', '', true],
		['switch', 'Joy-Con néon', 'Switch', '#0c0d10', '#ff3c28', ''],
		['gbcouleur', 'Game Boy Color', 'Game Boy Color', '#120916', '#d6006f', ''],
		['gba', 'Portable violette', 'Game Boy Advance', '#0d0a1c', '#6a4cff', ''],
		['playstation', 'Console grise', 'PlayStation', '#0e0f12', '#00439c', ''],
		['ps2', 'Monolithe noir', 'PlayStation 2', '#05070f', '#2f6bff', ''],
		['megadrive', 'Seize bits', 'Mega Drive', '#0a0a0a', '#e60012', ''],
		['dreamcast', 'Spirale orange', 'Dreamcast', '#f3f1ee', '#f26522', '', true],
		['bois', 'Façade en bois', 'Atari 2600', '#140d07', '#d67b2a', ''],
	];

	// Police de chaque thème (titres, ou toute l'interface selon le réglage) : familles déclarées dans fonts.css.
	const FONT_GROUPS = {
		'Luckiest Guy': 'plombier bowser etoile crash wumpa banane banjo rayman jungle kart spyro',
		'Lilita One': 'champignon party splat-orange splat-violet pokeball pikachu salameche carapuce bulbizarre destination ratchet jak',
		'Fredoka': 'peach yoshi kirby dreamland feuille nook pikmin montagne luigi',
		'Permanent Marker': 'paper ankh wario',
		'Creepster': 'boo ectoplasma fantome',
		'Cinzel': 'hyrule triforce ocarina crepuscule gerudo emblem cristal chocobo metaknight chevalier',
		'Pirata One': 'dracula gothique majora',
		'Orbitron': 'galaxie sheikah samus zebes arwing spartan covenant monado mako cyber materia mewtwo',
		'Audiowide': 'falcon vague arcade emeraude',
		'Bangers': 'sonic tails shoryuken hadoken stadium',
		'Bebas Neue': 'shadow persona5 persona4 persona3 goldeneye carton dragon',
		'Metal Mania': 'enfer quake nether',
		'Russo One': 'megaman protoman',
		'VT323': 'codec pong determination',
		'Press Start 2P': 'pacman envahisseurs tetris nes',
		'Silkscreen': 'creeper ender snes gbcouleur gba bois megadrive n64 gamecube playstation ps2 switch',
		'Nunito': 'wii dreamcast',
	};
	const FONT = {};
	for (const [family, list] of Object.entries(FONT_GROUPS)) for (const id of list.split(' ')) FONT[id] = family;
	// Polices des thèmes de base (themes.css).
	const BASE_FONTS = { smash: 'Russo One', modrinth: 'Nunito', neon: 'Audiowide', ocean: 'Fredoka', gameboy: 'Silkscreen', gold: 'Cinzel', light: 'Nunito' };
	const fontStack = f => `'${f}', 'Inter', 'Segoe UI', sans-serif`;

	const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
	const toHex = c => `#${c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
	const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
	const lum = (h) => { const [r, g, b] = hex(h).map(v => v / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

	const THEMES = RAW.map(([id, label, game, bg, accent, keywords, light]) => ({ id, label, game, bg, accent, keywords, light: !!light, font: FONT[id] || 'Inter' }));

	// Variables CSS déduites du fond et de l'accent (mêmes noms que themes.css).
	const vars = (t) => {
		const rgb = hex(t.accent).join(', ');
		const base = t.light
			? { '--bg': t.bg, '--raised': mix(t.bg, '#ffffff', 0.7), '--raised-2': mix(t.bg, '#000000', 0.04), '--button': mix(t.bg, '#000000', 0.07), '--button-hover': mix(t.bg, '#000000', 0.12), '--divider': mix(t.bg, '#000000', 0.08), '--text': '#3a3a44', '--text-dim': '#767680', '--contrast': '#111114', 'color-scheme': 'light' }
			: { '--bg': t.bg, '--raised': mix(t.bg, '#ffffff', 0.06), '--raised-2': mix(t.bg, '#ffffff', 0.03), '--button': mix(t.bg, '#ffffff', 0.11), '--button-hover': mix(t.bg, '#ffffff', 0.16), '--divider': mix(t.bg, '#ffffff', 0.08), '--text': mix(t.accent, '#d4d4da', 0.82), '--text-dim': mix(t.accent, '#8a8a92', 0.85), '--contrast': '#ffffff', 'color-scheme': 'dark' };
		return {
			...base,
			'--brand': t.accent,
			'--brand-hover': mix(t.accent, t.light ? '#000000' : '#ffffff', 0.18),
			'--brand-rgb': rgb,
			'--on-brand': lum(t.accent) > 0.55 ? '#111111' : '#ffffff',
			'--danger': '#ff8a3d',
			'--danger-rgb': '255, 138, 61',
			'--glow': `0 0 22px rgba(${rgb}, ${t.light ? 0.25 : 0.35})`,
			'--font-display': fontStack(t.font),
		};
	};

	const baseCss = () => Object.entries(BASE_FONTS).map(([id, f]) => `${id === 'smash' ? ':root, ' : ''}:root[data-theme="${id}"] {--font-display:${fontStack(f)};}`).join('\n');
	const css = () => baseCss() + '\n' + THEMES.map(t => `:root[data-theme="${t.id}"] {${Object.entries(vars(t)).map(([k, v]) => `${k}:${v};`).join('')}}`).join('\n');

	// Thème d'un jeu d'après son titre (et sa console en dernier recours), ou null.
	const SYSTEM_THEME = { nes: 'nes', snes: 'snes', n64: 'n64', gc: 'gamecube', wii: 'wii', switch: 'switch', gbc: 'gbcouleur', gba: 'gba', gb: 'gameboy', psx: 'playstation', ps2: 'ps2', md: 'megadrive', a2600: 'bois', psp: 'ps2' };
	const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
	const compiled = THEMES.filter(t => t.keywords).map(t => ({ id: t.id, re: new RegExp(t.keywords.normalize('NFD').replace(/[̀-ͯ]/g, ''), 'i') }));
	// Le mot-clé trouvé le plus long l'emporte : « ocarina » passe avant « zelda », « mario party » avant « mario ».
	const match = (gameName, system) => {
		const name = norm(gameName);
		let best = null;
		for (const c of compiled) {
			const m = name.match(c.re);
			if (m && (!best || m[0].length > best.len)) best = { id: c.id, len: m[0].length };
		}
		return best ? best.id : (SYSTEM_THEME[system] || null);
	};

	const api = { THEMES, css, match, vars, BASE_FONTS, fontOf: id => FONT[id] || BASE_FONTS[id] || 'Inter' };
	root.SmashThemes = api;
	if (typeof module !== 'undefined' && module.exports) module.exports = api;
	// Dans une page : feuille de style des 100 thèmes ajoutée une fois.
	if (typeof document !== 'undefined' && !document.getElementById('game-themes')) {
		const style = document.createElement('style');
		style.id = 'game-themes';
		style.textContent = css();
		document.head.appendChild(style);
	}
})(typeof window !== 'undefined' ? window : globalThis);
