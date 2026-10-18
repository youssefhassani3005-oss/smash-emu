// Émulateurs externes (consoles récentes) : détection sur le PC et ligne de commande de lancement.
// Smash Emu ne les télécharge pas lui-même : il ouvre la page officielle, et retrouve l'exécutable une fois installé.
const fs = require('fs');
const path = require('path');
const os = require('os');
const store = require('./store');

const HOME = os.homedir();

// args(fichier, { embed, shader }) : embed = fenêtre incrustée dans l'interface Smash Emu (pas de plein écran natif).
// hotkeys : raccourcis par défaut de l'émulateur, envoyés par la barre Smash Emu ; render : repère la fenêtre de jeu.
const DOLPHIN_SHADERS = ['FXAA', 'AutoHDR', 'PerceptualHDR', 'integer_scaling', 'sepia', 'grayscale'];

// Réglages Dolphin pilotés depuis la fenêtre Smash Emu (passés au lancement, la config de Dolphin reste intacte).
const bool = v => (v ? 'True' : 'False');
const dolphinOpts = (p = {}) => {
	const a = [];
	const c = (k, v) => a.push('-C', `${k}=${v}`);
	if (p.res) c('Graphics.Settings.InternalResolution', Math.max(1, Math.min(8, +p.res | 0)));
	if (p.aspect !== undefined && p.aspect !== null && p.aspect !== '') c('Graphics.Settings.AspectRatio', +p.aspect | 0);
	if (p.wide !== undefined) c('Graphics.Settings.wideScreenHack', bool(p.wide));
	if (p.fps !== undefined) c('Graphics.Settings.ShowFPS', bool(p.fps));
	if (p.hires !== undefined) c('Graphics.Settings.HiresTextures', bool(p.hires));
	if (p.aniso !== undefined) c('Graphics.Enhancements.MaxAnisotropy', +p.aniso | 0);
	if (p.vsync !== undefined) c('Graphics.Hardware.VSync', bool(p.vsync));
	if (p.speed !== undefined) c('Dolphin.Core.EmulationSpeed', Math.max(0, +p.speed || 0));
	if (p.volume !== undefined) c('Dolphin.DSP.Volume', Math.max(0, Math.min(100, +p.volume | 0)));
	if (p.oc) { c('Dolphin.Core.OverclockEnable', 'True'); c('Dolphin.Core.Overclock', Math.max(0.5, Math.min(4, +p.oc || 1))); }
	return a;
};

const EXTERNAL = {
	project64: { label: 'Project64', systems: ['n64'], exe: ['Project64.exe'], args: f => [f], site: 'https://www.pj64-emu.com/download/project64-latest',
		hotkeys: { pause: 'F2', save: () => 'F5', load: () => 'F7', turboDown: 'F4', turboUp: 'F4', reset: 'F1' } },
	dolphin: {
		label: 'Dolphin', systems: ['gc', 'wii'], exe: ['Dolphin.exe'], site: 'https://dolphin-emu.org/download/',
		// Réglages passés au lancement uniquement (la config de Dolphin n'est pas modifiée) : pas de shader
		// défaillant, pas de fenêtre d'avertissement NKit, clavier actif même quand la barre Smash Emu a le focus.
		args: (f, o = {}) => [
			'-b',
			'-C', `Graphics.Enhancements.PostProcessingShader=${DOLPHIN_SHADERS.includes((o.opts || {}).shader || o.shader) ? ((o.opts || {}).shader || o.shader) : 'FXAA'}`,
			...dolphinOpts(o.opts),
			'-C', 'Dolphin.Interface.SkipNKitWarning=True',
			'-C', 'Dolphin.Interface.ConfirmStop=False',
			'-C', `Dolphin.Display.Fullscreen=${o.embed ? 'False' : 'True'}`,
			...(o.embed ? ['-C', 'Dolphin.Display.RenderToMain=False', '-C', 'Dolphin.Input.BackgroundInput=True', '-C', 'Dolphin.General.HotkeysRequireFocus=False', '-C', 'Dolphin.Interface.HideCursor=True'] : []),
			'-e', f,
		],
		render: w => w.title.includes('|'),
		hotkeys: { pause: 'F10', save: n => `SHIFT+F${n}`, load: n => `F${n}`, turboDown: 'TAB:down', turboUp: 'TAB:up', undoLoad: 'F12', slots: 8 },
		tunable: true,
		shaders: DOLPHIN_SHADERS,
	},
	azahar: { label: 'Azahar', systems: ['3ds'], exe: ['azahar.exe', 'lime3ds.exe', 'citra-qt.exe'], args: (f, o = {}) => [...(o.embed ? [] : ['-f']), f], site: 'https://azahar-emu.org/pages/download/' },
	cemu: { label: 'Cemu', systems: ['wiiu'], exe: ['Cemu.exe'], args: (f, o = {}) => [...(o.embed ? [] : ['-f']), '-g', f], site: 'https://cemu.info/' },
	ryujinx: { label: 'Ryujinx', systems: ['switch'], exe: ['Ryujinx.exe', 'Ryujinx.Ava.exe', 'Ryubing.exe'], keys: true, args: (f, o = {}) => [...(o.embed ? [] : ['--fullscreen']), f], site: 'https://ryujinx.app/download', note: 'Nécessite les clés (prod.keys) et le firmware de ta propre Switch : importe-les ci-dessous.' },
	duckstation: { label: 'DuckStation', systems: ['psx'], exe: ['duckstation-qt-x64-ReleaseLTCG.exe', 'duckstation-qt.exe'], args: (f, o = {}) => ['-batch', ...(o.embed ? [] : ['-fullscreen']), '--', f], site: 'https://www.duckstation.org/', note: 'Nécessite le BIOS de ta PlayStation.' },
	pcsx2: { label: 'PCSX2', systems: ['ps2'], exe: ['pcsx2-qt.exe', 'pcsx2.exe'], args: (f, o = {}) => ['-batch', ...(o.embed ? [] : ['-fullscreen']), '--', f], site: 'https://pcsx2.net/downloads/', note: 'Nécessite le BIOS de ta PlayStation 2.' },
	ppsspp: { label: 'PPSSPP', systems: ['psp'], exe: ['PPSSPPWindows64.exe', 'PPSSPPWindows.exe'], args: (f, o = {}) => [...(o.embed ? [] : ['--fullscreen']), f], site: 'https://www.ppsspp.org/download/' },
	rpcs3: { label: 'RPCS3', systems: ['ps3'], exe: ['rpcs3.exe'], args: f => ['--no-gui', f], site: 'https://rpcs3.net/download', note: 'Nécessite le firmware PS3 officiel (téléchargeable chez Sony).' },
	xemu: { label: 'xemu', systems: ['xbox'], exe: ['xemu.exe'], args: (f, o = {}) => [...(o.embed ? [] : ['-full-screen']), '-dvd_path', f], site: 'https://xemu.app/', note: 'Nécessite le BIOS et le disque dur de ta Xbox.' },
	xenia: { label: 'Xenia', systems: ['x360'], exe: ['xenia_canary.exe', 'xenia.exe'], args: (f, o = {}) => [...(o.embed ? [] : ['--fullscreen=true']), f], site: 'https://xenia.jp/download/' },
};

const roots = () => [
	process.env.ProgramFiles, process.env['ProgramFiles(x86)'],
	path.join(process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local'), 'Programs'),
	path.join(HOME, 'Downloads'), path.join(HOME, 'Desktop'), path.join(HOME, 'Documents'),
	'C:\\Emulators', 'C:\\Emulateurs', 'D:\\Emulators',
].filter(Boolean);

// Recherche des exécutables connus, 3 niveaux de dossiers au plus.
const scan = () => {
	const wanted = new Map();
	for (const [id, e] of Object.entries(EXTERNAL)) for (const exe of e.exe) wanted.set(exe.toLowerCase(), id);
	const found = {};
	const skip = new Set(['node_modules', '.git', 'windows', 'windowsapps', 'common files', '$recycle.bin', 'microsoft', 'steamapps']);
	const walk = (dir, depth) => {
		let entries;
		try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
		for (const e of entries) {
			if (e.isFile()) {
				const id = wanted.get(e.name.toLowerCase());
				if (id && !found[id]) found[id] = path.join(dir, e.name);
			}
		}
		if (depth <= 0) return;
		for (const e of entries) if (e.isDirectory() && !skip.has(e.name.toLowerCase())) walk(path.join(dir, e.name), depth - 1);
	};
	for (const r of roots()) walk(r, 3);
	return found;
};

let detected = null;
const detectAll = (refresh = false) => {
	if (!detected || refresh) detected = scan();
	return detected;
};

// Chemin utilisé : réglage manuel s'il existe, sinon détection automatique.
const pathFor = (id) => {
	const manual = (store.getSettings().emulators || {})[id];
	if (manual && fs.existsSync(manual)) return manual;
	const auto = detectAll()[id];
	return auto && fs.existsSync(auto) ? auto : null;
};

const status = (refresh = false) => {
	detectAll(refresh);
	return Object.fromEntries(Object.entries(EXTERNAL).map(([id, e]) => [id, { id, label: e.label, systems: e.systems, site: e.site, note: e.note || null, keys: !!e.keys, path: pathFor(id) }]));
};

module.exports = { EXTERNAL, pathFor, status, detectAll };
