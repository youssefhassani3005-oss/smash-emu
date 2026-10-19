// Stockage : réglages de Smash Emu, instances et bibliothèque de ROM, dans Documents\Smash Emu.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const DOCS = path.join(os.homedir(), 'Documents');
const LEGACY_ROOT = path.join(DOCS, 'Launcher 64');
const ROOT = path.join(DOCS, 'Smash Emu');
const INSTANCES_DIR = path.join(ROOT, 'instances');
const ROMS_DIR = path.join(ROOT, 'roms');
const CACHE_DIR = path.join(ROOT, 'cache');
// Données internes de l'interface (sauvegardes en jeu de l'émulateur intégré, réglages des touches…).
const ELECTRON_DIR = path.join(ROOT, 'app-data');
const SETTINGS_FILE = path.join(ROOT, 'smash-emu.json');

const GAME_TYPES = {
	coopdx: { label: 'SM64 Coop DX', short: 'Coop DX' },
	rom: { label: 'ROM N64', short: 'ROM N64' },
};

const ENGINES = {
	smash: 'Smash Emu (intégré)',
	project64: 'Project64',
};

const THEMES = ['smash', 'crimson', 'modrinth', 'neon', 'ocean', 'gameboy', 'light'];

const DEFAULT_SETTINGS = {
	playerName: 'Mario',
	coopdxPath: '',
	project64Path: '',
	operaPath: '',
	watchOperaDownloads: true,
	skipIntro: true,
	discord: true,
	closeOnLaunch: false,
	theme: 'smash',
	defaultEngine: 'smash',
	emuVolume: 0.8,
	externalUi: 'smash',
	emuShowFps: false,
	saveBackups: 10,      // copies de secours gardées par jeu pour les sauvegardes en jeu
	savesSyncDir: '',     // dossier cloud (Dropbox, Drive, Syncthing…) servant de miroir, vide = désactivé
	resumeMode: 'ask',
	logo: 'classic',      // logo de l'application : 'classic' (S) ou 'manette'    // reprise de la dernière partie au lancement : 'ask' | 'auto' | 'off'
};

// Reprend les données de l'ancien nom (Launcher 64) au premier démarrage de Smash Emu.
const migrateLegacy = () => {
	if (fs.existsSync(ROOT) || !fs.existsSync(LEGACY_ROOT)) return;
	fs.renameSync(LEGACY_ROOT, ROOT);
	const oldSettings = path.join(ROOT, 'launcher.json');
	if (fs.existsSync(oldSettings) && !fs.existsSync(SETTINGS_FILE)) fs.renameSync(oldSettings, SETTINGS_FILE);
};

const ensureDirs = () => {
	migrateLegacy();
	for (const d of [ROOT, INSTANCES_DIR, ROMS_DIR, CACHE_DIR]) fs.mkdirSync(d, { recursive: true });
};

const readJson = (file, fallback) => {
	try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
};

const writeJson = (file, data) => {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const tmp = `${file}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(data, null, '\t'));
	fs.renameSync(tmp, file);
};

// Icône des fenêtres selon le logo choisi (l'exécutable installé garde l'icône classique).
const windowIcon = () => path.join(__dirname, '..', 'renderer', 'assets', getSettings().logo === 'manette' ? 'icon-manette.png' : 'icon.png');

const getSettings = () => ({ ...DEFAULT_SETTINGS, ...readJson(SETTINGS_FILE, {}) });
const setSettings = (patch) => {
	const next = { ...getSettings(), ...patch };
	writeJson(SETTINGS_FILE, next);
	return next;
};

const instanceDir = id => path.join(INSTANCES_DIR, id);
const instanceFile = id => path.join(instanceDir(id), 'instance.json');

const slugify = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'instance';

const listInstances = () => {
	ensureDirs();
	return fs.readdirSync(INSTANCES_DIR, { withFileTypes: true })
		.filter(e => e.isDirectory())
		.map(e => readJson(instanceFile(e.name), null))
		.filter(Boolean);
};

const getInstance = id => {
	const inst = readJson(instanceFile(id), null);
	if (!inst) throw new Error(`Instance introuvable : ${id}`);
	return inst;
};

const saveInstance = inst => { writeJson(instanceFile(inst.id), inst); return inst; };

const updateInstance = (id, patch) => saveInstance({ ...getInstance(id), ...patch, id });

const createInstance = ({ name, type, group = '' }) => {
	ensureDirs();
	if (!GAME_TYPES[type]) throw new Error(`Type de jeu inconnu : ${type}`);
	let id = slugify(name);
	while (fs.existsSync(instanceDir(id))) id = `${slugify(name)}-${crypto.randomBytes(2).toString('hex')}`;
	fs.mkdirSync(instanceDir(id), { recursive: true });
	return saveInstance({
		id,
		name: name.trim() || 'Nouvelle instance',
		type,
		group,
		icon: null,
		createdAt: Date.now(),
		lastPlayed: null,
		playTimeMs: 0,
		mods: {},          // nom de mod -> { enabled, source? }
		options: { playerName: '', windowMode: 'windowed', width: 1280, height: 720, network: 'solo', host: '', port: 7777, extraArgs: '', engine: '' },
		rom: null,         // instances ROM : { file, info, libraryId? }
	});
};

const deleteInstance = id => fs.rmSync(instanceDir(id), { recursive: true, force: true });

module.exports = {
	ROOT, INSTANCES_DIR, ROMS_DIR, CACHE_DIR, ELECTRON_DIR, GAME_TYPES, ENGINES, THEMES,
	ensureDirs, readJson, writeJson, getSettings, setSettings, windowIcon,
	instanceDir, listInstances, getInstance, saveInstance, updateInstance, createInstance, deleteInstance,
};
