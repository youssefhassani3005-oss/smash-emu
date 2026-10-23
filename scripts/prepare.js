// Copie les polices (Inter, Press Start 2P) et génère src/renderer/icons.js à partir de lucide-static (icônes utilisées seulement).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'src', 'renderer');
const ICONS = [
	'play', 'square', 'compass', 'globe', 'library', 'plus', 'settings', 'download', 'chevron-left', 'chevron-right',
	'chevron-down', 'chevron-up', 'minus', 'x', 'ellipsis-vertical', 'search', 'folder-open', 'copy', 'trash-2', 'image',
	'upload', 'refresh-cw', 'check', 'star', 'users', 'user', 'gamepad-2', 'map', 'zap', 'settings-2', 'user-cog', 'music',
	'film', 'box', 'wrench', 'terminal', 'paw-print', 'laugh', 'footprints', 'external-link', 'file-archive', 'file-code',
	'file', 'package', 'puzzle', 'clock', 'calendar', 'hard-drive', 'arrow-up', 'arrow-down', 'circle-x', 'triangle-alert',
	'info', 'scroll-text', 'sliders-horizontal', 'layout-grid', 'heart', 'wifi', 'server', 'link', 'sparkles', 'monitor',
	'maximize-2', 'square-stack', 'cpu', 'list-filter', 'house', 'cloud-download', 'eye', 'rocket', 'save', 'pencil', 'swords',
	'pause', 'camera', 'rotate-ccw', 'keyboard', 'volume-2', 'volume-x', 'maximize', 'minimize', 'layers', 'history', 'log-out',
	'palette', 'gauge', 'disc-3', 'joystick', 'fast-forward', 'file-plus', 'flame', 'trophy', 'zap-off',
	'message-circle', 'shield-check', 'crown', 'key-round', 'shuffle', 'gift', 'radio', 'list-music', 'skip-forward', 'skip-back', 'repeat', 'badge-check', 'chart-column', 'lock',
	'user-plus', 'user-minus', 'wifi-off', 'power', 'bell', 'mail', 'sun', 'moon', 'tv', 'smartphone', 'arrow-left', 'arrow-right',
	'dices', 'party-popper', 'pin', 'wand-sparkles', 'droplet', 'layout-dashboard', 'circle-dot', 'globe-lock', 'tag', 'filter',
];

const icons = {};
const missing = [];
for (const name of ICONS) {
	const file = path.join(ROOT, 'node_modules', 'lucide-static', 'icons', `${name}.svg`);
	if (!fs.existsSync(file)) { missing.push(name); continue; }
	const svg = fs.readFileSync(file, 'utf8');
	icons[name] = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>')).replace(/\s+/g, ' ').trim();
}
if (missing.length) console.warn('Icônes absentes de lucide-static :', missing.join(', '));

fs.writeFileSync(path.join(OUT, 'icons.js'), `// Généré par scripts/prepare.js à partir de lucide-static (licence ISC).\nwindow.ICONS = ${JSON.stringify(icons, null, '\t')};\n`);

const fontDir = path.join(OUT, 'assets', 'fonts');
fs.mkdirSync(fontDir, { recursive: true });
fs.copyFileSync(
	path.join(ROOT, 'node_modules', '@fontsource-variable', 'inter', 'files', 'inter-latin-wght-normal.woff2'),
	path.join(fontDir, 'inter-latin-wght-normal.woff2'),
);
fs.copyFileSync(
	path.join(ROOT, 'node_modules', '@fontsource', 'press-start-2p', 'files', 'press-start-2p-latin-400-normal.woff2'),
	path.join(fontDir, 'press-start-2p-latin-400-normal.woff2'),
);
// Polices des thèmes (une par style de jeu), toutes sous licence SIL OFL.
const THEME_FONTS = [
	['luckiest-guy', [400]],
	['bangers', [400]],
	['fredoka', [400, 600]],
	['cinzel', [400, 600]],
	['pirata-one', [400]],
	['orbitron', [400, 600]],
	['audiowide', [400]],
	['creepster', [400]],
	['vt323', [400]],
	['bebas-neue', [400]],
	['lilita-one', [400]],
	['silkscreen', [400, 700]],
	['russo-one', [400]],
	['permanent-marker', [400]],
	['nunito', [400, 600]],
	['metal-mania', [400]],
];
for (const [pkg, weights] of THEME_FONTS) {
	for (const w of weights) {
		const file = `${pkg}-latin-${w}-normal.woff2`;
		fs.copyFileSync(path.join(ROOT, 'node_modules', '@fontsource', pkg, 'files', file), path.join(fontDir, file));
	}
}
console.log(`${Object.keys(icons).length} icônes générées, polices Inter, Press Start 2P et ${THEME_FONTS.length} polices de thèmes copiées.`);
