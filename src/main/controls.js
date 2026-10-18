// Manettes et clavier : profils de touches par console (appliqués dans l'émulateur intégré) et réglages
// Dolphin (extension de la Wiimote). Les listes de boutons viennent du code d'EmulatorJS, donc toujours exactes.
const fs = require('fs');
const path = require('path');
const os = require('os');
const store = require('./store');
const systems = require('./systems');

const EJS_SRC = path.join(__dirname, '..', '..', 'node_modules', '@emulatorjs', 'emulatorjs', 'data', 'src', 'emulator.js');
const WIIMOTE_INI = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Dolphin Emulator', 'Config', 'WiimoteNew.ini');

// Touches et boutons d'EmulatorJS par défaut (joueur 1) : identifiant de bouton → { clavier, manette }.
const DEFAULTS = {
	0: ['x', 'BUTTON_2'], 1: ['s', 'BUTTON_4'], 2: ['v', 'SELECT'], 3: ['enter', 'START'],
	4: ['up arrow', 'DPAD_UP'], 5: ['down arrow', 'DPAD_DOWN'], 6: ['left arrow', 'DPAD_LEFT'], 7: ['right arrow', 'DPAD_RIGHT'],
	8: ['z', 'BUTTON_1'], 9: ['a', 'BUTTON_3'], 10: ['q', 'LEFT_TOP_SHOULDER'], 11: ['e', 'RIGHT_TOP_SHOULDER'],
	12: ['tab', 'LEFT_BOTTOM_SHOULDER'], 13: ['r', 'RIGHT_BOTTOM_SHOULDER'], 14: ['', 'LEFT_STICK'], 15: ['', 'RIGHT_STICK'],
	16: ['h', 'LEFT_STICK_X:+1'], 17: ['f', 'LEFT_STICK_X:-1'], 18: ['g', 'LEFT_STICK_Y:+1'], 19: ['t', 'LEFT_STICK_Y:-1'],
	20: ['l', 'RIGHT_STICK_X:+1'], 21: ['j', 'RIGHT_STICK_X:-1'], 22: ['k', 'RIGHT_STICK_Y:+1'], 23: ['i', 'RIGHT_STICK_Y:-1'],
};

// Boutons propres à chaque famille de consoles, lus dans le code d'EmulatorJS.
let schemeCache = null;
const schemes = () => {
	if (schemeCache) return schemeCache;
	const src = fs.readFileSync(EJS_SRC, 'utf8');
	const from = src.indexOf('let buttons;');
	const to = src.lastIndexOf('buttons.push(', src.indexOf('QUICK SAVE STATE', from));
	const block = src.slice(from, to);
	const out = {};
	const re = /(?:if|else if)\s*\(\s*(?:\[([^\]]*)\]\.includes\(this\.getControlScheme\(\)\)|"([^"]+)"\s*===\s*this\.getControlScheme\(\))\s*\)\s*\{|\}\s*else\s*\{/g;
	const marks = [...block.matchAll(re)];
	marks.forEach((m, i) => {
		const body = block.slice(m.index + m[0].length, i + 1 < marks.length ? marks[i + 1].index : block.length);
		const buttons = [...body.matchAll(/\{\s*id:\s*(\d+),\s*label:\s*this\.localization\("((?:[^"\\]|\\.)*)"\)/g)]
			.map(b => ({ id: +b[1], label: JSON.parse(`"${b[2]}"`) }));
		const names = m[1] ? [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]) : m[2] ? [m[2]] : ['default'];
		for (const n of names) out[n] = buttons;
	});
	schemeCache = out;
	return out;
};

const EXTRA = [
	{ id: 24, label: 'Sauvegarde rapide' }, { id: 25, label: 'Chargement rapide' }, { id: 26, label: 'Changer d’emplacement' },
	{ id: 27, label: 'Avance rapide' }, { id: 29, label: 'Ralenti' }, { id: 28, label: 'Retour arrière' },
];
const EXTRA_DEFAULTS = { 24: '1', 25: '2', 26: '3' };

const schemeOf = system => { const s = systems.SYSTEMS[system]; return s && s.ejs ? s.ejs : null; };

// Consoles configurables : celles du lecteur intégré, plus GameCube / Wii (Dolphin).
const list = () => Object.entries(systems.SYSTEMS)
	.filter(([id, s]) => s.ejs || ['gc', 'wii'].includes(id))
	.map(([id, s]) => ({ id, label: s.label, dolphin: ['gc', 'wii'].includes(id) }));

const getProfile = system => (store.getSettings().controls || {})[system] || { kb: {}, pad: {}, rumble: true };

const get = (system) => {
	const sc = schemes();
	const scheme = schemeOf(system);
	const buttons = scheme ? (sc[scheme] || sc.default || []) : [];
	return {
		system, label: (systems.SYSTEMS[system] || {}).label || system,
		buttons: [...buttons, ...EXTRA],
		defaults: Object.fromEntries([...Object.entries(DEFAULTS).map(([id, [kb, pad]]) => [id, { kb, pad }]), ...Object.entries(EXTRA_DEFAULTS).map(([id, kb]) => [id, { kb, pad: '' }])]),
		profile: getProfile(system),
		extension: system === 'wii' ? currentExtension() : null,
	};
};

const set = (system, profile) => {
	const clean = { kb: {}, pad: {}, rumble: profile.rumble !== false };
	for (const [id, v] of Object.entries(profile.kb || {})) if (/^\d+$/.test(id) && v && typeof v.code === 'number') clean.kb[id] = { code: v.code, name: String(v.name || '').slice(0, 20) };
	for (const [id, v] of Object.entries(profile.pad || {})) if (/^\d+$/.test(id) && typeof v === 'string' && /^[A-Z0-9_:+\-]{1,32}$/.test(v)) clean.pad[id] = v;
	const all = { ...(store.getSettings().controls || {}), [system]: clean };
	store.setSettings({ controls: all });
	return clean;
};

const reset = (system) => {
	const all = { ...(store.getSettings().controls || {}) };
	delete all[system];
	store.setSettings({ controls: all });
	return getProfile(system);
};

// Ce que le lecteur applique au démarrage de la partie.
const forPlayer = (system) => {
	const p = getProfile(system);
	return { kb: p.kb || {}, pad: p.pad || {} };
};

// ---------- Dolphin : extension de la Wiimote 1 (WiimoteNew.ini, lu au lancement) ----------

const setExtension = (value) => {
	if (!['None', 'Nunchuk', 'Classic'].includes(value)) throw new Error('Extension inconnue.');
	if (!fs.existsSync(WIIMOTE_INI)) return;
	const lines = fs.readFileSync(WIIMOTE_INI, 'utf8').split(/\r?\n/);
	let inside = false;
	let done = false;
	for (let i = 0; i < lines.length; i++) {
		if (/^\[/.test(lines[i])) inside = lines[i].trim() === '[Wiimote1]';
		if (inside && /^Extension\s*=/.test(lines[i])) { lines[i] = `Extension = ${value}`; done = true; }
	}
	if (!done) { const i = lines.findIndex(l => l.trim() === '[Wiimote1]'); if (i >= 0) lines.splice(i + 1, 0, `Extension = ${value}`); }
	fs.writeFileSync(WIIMOTE_INI, lines.join('\n'));
};

const currentExtension = () => {
	try { const m = fs.readFileSync(WIIMOTE_INI, 'utf8').match(/\[Wiimote1\][\s\S]*?^Extension\s*=\s*(\w+)/m); return m ? m[1] : 'None'; } catch { return 'None'; }
};

module.exports = { schemes, list, get, set, reset, forPlayer, setExtension, currentExtension };
