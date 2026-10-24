// Randomizer Switch (Citron, Eden), appliqué à chaque lancement du jeu :
// - couleurs (Eden) : effet d'image original au format ReShade FX, déposé dans post_shaders et réglé par la graine ;
//   les effets que le joueur a lui-même choisis dans Eden restent dans la chaîne ;
// - valeurs : codes de triche (format Atmosphère, lus par Citron et Eden) générés depuis un profil du jeu ;
// - mods randomizer : dossiers produits par un randomizer communautaire (romfs/exefs), installés dans « load ».
// Le fichier du jeu n'est jamais modifié.
const fs = require('fs');
const path = require('path');
const store = require('../store');
const rng = require('./rng');

const FX_FILE = 'SmashRandomizer.fx';
const FX_TECHNIQUE = 'SmashRandomizer';
const CHEAT_MOD = 'Smash Emu - Randomizer';
const MOD_PREFIX = 'Randomizer - ';
const STATE_FILE = 'smash-randomizer.json';
const PROFILES_DIR = path.join(store.ROOT, 'randomizer', 'profiles');
const BUNDLED_PROFILES = path.join(__dirname, 'profiles');

const FX_SOURCE = `// Smash Emu - Randomizer : couleurs du jeu changées selon la graine (effet original de Smash Emu).
// Rotation de la teinte, saturation, permutation des canaux et inversion, réglées par Smash Emu au lancement.

texture BackBufferTex : COLOR;
sampler BackBuffer { Texture = BackBufferTex; };

uniform float Hue <
    ui_type = "slider";
    ui_label = "Hue rotation";
    ui_min = 0.0; ui_max = 360.0; ui_step = 1.0;
> = 0.0;

uniform float Saturation <
    ui_type = "slider";
    ui_label = "Saturation";
    ui_min = 0.0; ui_max = 2.0; ui_step = 0.01;
> = 1.0;

uniform float Swap <
    ui_type = "slider";
    ui_label = "Channel swap";
    ui_min = 0.0; ui_max = 5.0; ui_step = 1.0;
> = 0.0;

uniform float Invert <
    ui_type = "slider";
    ui_label = "Invert";
    ui_min = 0.0; ui_max = 1.0; ui_step = 1.0;
> = 0.0;

void VS_PostProcess(in uint id : SV_VertexID, out float4 pos : SV_Position, out float2 uv : TEXCOORD)
{
    uv = float2(float(id & 2), float((id & 1) << 1));
    pos = float4(uv * float2(2.0, -2.0) + float2(-1.0, 1.0), 0.0, 1.0);
}

float3 RotateHue(float3 c, float degrees)
{
    float a = radians(degrees);
    float cs = cos(a);
    float sn = sin(a);
    float3 k = float3(0.57735, 0.57735, 0.57735);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float4 PS_SmashRandomizer(float4 pos : SV_Position, float2 uv : TEXCOORD) : SV_Target
{
    float3 rgb = tex2D(BackBuffer, uv).rgb;
    float s = floor(Swap + 0.5);
    if (s > 4.5) rgb = rgb.bgr;
    else if (s > 3.5) rgb = rgb.brg;
    else if (s > 2.5) rgb = rgb.gbr;
    else if (s > 1.5) rgb = rgb.grb;
    else if (s > 0.5) rgb = rgb.rbg;
    rgb = RotateHue(rgb, Hue);
    float luma = dot(rgb, float3(0.2126, 0.7152, 0.0722));
    rgb = lerp(float3(luma, luma, luma), rgb, Saturation);
    if (Invert > 0.5) rgb = 1.0 - rgb;
    return float4(saturate(rgb), 1.0);
}

technique ${FX_TECHNIQUE} <
    ui_label = "Smash Emu Randomizer";
    ui_tooltip = "Colours chosen by the Smash Emu randomizer seed.";
>
{
    pass
    {
        VertexShader = VS_PostProcess;
        PixelShader = PS_SmashRandomizer;
    }
}
`;

// ---------- Options du jeu ----------

const DEFAULTS = { on: false, seed: '', intensity: 'medium', modes: { colors: true, values: true, mods: true } };
const optionsOf = (inst) => {
	const o = (inst && inst.options && inst.options.randomizer) || {};
	return { ...DEFAULTS, ...o, modes: { ...DEFAULTS.modes, ...(o.modes || {}) } };
};
const cleanOptions = (o) => {
	if (!o || typeof o !== 'object') throw new Error('Réglages du randomizer invalides.');
	const seed = rng.normalizeSeed(o.seed) || rng.randomSeed();
	const intensity = rng.INTENSITY.includes(o.intensity) ? o.intensity : 'medium';
	const modes = { colors: !!(o.modes && o.modes.colors), values: !!(o.modes && o.modes.values), mods: !(o.modes && o.modes.mods === false) };
	return { on: !!o.on, seed, intensity, modes };
};

// ---------- Couleurs ----------

// Réglages de l'effet tirés de la graine : plus l'intensité monte, plus les couleurs s'éloignent de l'original.
const colorParams = (seed, intensity) => {
	const r = rng.create(seed, 'switch-colors');
	if (intensity === 'soft') {
		const shift = r.range(20, 60);
		return { Hue: r.chance(0.5) ? shift : 360 - shift, Saturation: +(0.9 + r.float() * 0.4).toFixed(2), Swap: 0, Invert: 0 };
	}
	if (intensity === 'chaos') return { Hue: r.int(360), Saturation: +(0.6 + r.float() * 1.2).toFixed(2), Swap: r.int(6), Invert: r.chance(0.25) ? 1 : 0 };
	return { Hue: r.range(45, 315), Saturation: +(0.8 + r.float() * 0.7).toFixed(2), Swap: 0, Invert: 0 };
};

const readIni = (file) => { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } };
const iniValue = (text, key) => {
	const m = text.match(new RegExp(`^${key.replace(/\\/g, '\\\\')}=(.*)$`, 'm'));
	if (!m) return null;
	const v = m[1].trim();
	return /^".*"$/.test(v) ? v.slice(1, -1).replace(/\\(.)/g, '$1') : v;
};
// Qt lit une valeur contenant des virgules comme une liste : la chaîne d'effets est donc écrite entre guillemets.
const qtString = v => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

// Chaîne d'effets d'Eden (« Fichier.fx|Technique|réglage=valeur,... » séparés par des « ; ») sans notre effet.
const withoutOurs = chain => String(chain || '').split(';').filter(e => e && !e.startsWith(`${FX_FILE}|`));

const applyColors = (userDir, opts, setQtIni) => {
	const ini = path.join(userDir, 'config', 'qt-config.ini');
	const stateFile = path.join(userDir, STATE_FILE);
	const text = readIni(ini);
	const others = withoutOurs(iniValue(text, 'post_shader_chain'));
	let state = {};
	try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { /* jamais appliqué */ }
	if (opts.on && opts.modes.colors) {
		const fxDir = path.join(userDir, 'post_shaders');
		const fxFile = path.join(fxDir, FX_FILE);
		fs.mkdirSync(fxDir, { recursive: true });
		if (readIni(fxFile) !== FX_SOURCE) fs.writeFileSync(fxFile, FX_SOURCE);
		const p = colorParams(opts.seed, opts.intensity);
		const ours = `${FX_FILE}|${FX_TECHNIQUE}|${Object.entries(p).map(([k, v]) => `${k}=${v}`).join(',')}`;
		// Effets désactivés par le joueur : on note son choix pour le lui rendre quand le randomizer s'arrête.
		if (state.enabledBefore === undefined) state.enabledBefore = iniValue(text, 'post_shader_enabled') !== 'false';
		fs.writeFileSync(stateFile, JSON.stringify(state));
		setQtIni(ini, 'Renderer', { post_shader_chain: qtString([...others, ours].join(';')), post_shader_enabled: true });
		return p;
	}
	if (state.enabledBefore !== undefined || (iniValue(text, 'post_shader_chain') || '').includes(FX_FILE)) {
		setQtIni(ini, 'Renderer', { post_shader_chain: qtString(others.join(';')), ...(state.enabledBefore === false ? { post_shader_enabled: false } : {}) });
		fs.rmSync(stateFile, { force: true });
	}
	return null;
};

// ---------- Valeurs (codes de triche) ----------

const hex = (n, len) => n.toString(16).toUpperCase().padStart(len, '0');
const REGION = { main: 0, heap: 1, alias: 2, aslr: 3 };

// Code Atmosphère de type 0 (« écrire une valeur fixe ») : 0TMR00AA AAAAAAAA VVVVVVVV (VVVVVVVV).
const storeCode = ({ region = 'main', offset, width = 4 }, value) => {
	const addr = BigInt(offset);
	const head = `0${width}${REGION[region]}000${hex(Number(addr >> 32n) & 0xff, 2)}`;
	const low = hex(Number(addr & 0xffffffffn), 8);
	const v = BigInt.asUintN(width * 8, BigInt(value));
	const val = width === 8 ? `${hex(Number(v >> 32n), 8)} ${hex(Number(v & 0xffffffffn), 8)}` : hex(Number(v), 8);
	return `${head} ${low} ${val}`;
};

const RANK = { soft: 0, medium: 1, chaos: 2 };
const OFFSET = /^0x[0-9a-f]{1,10}$/i;

// Profil d'un jeu : { format: 1, title, titleId, builds: { "<BUILD ID>": { version, values: [...] } } }.
// Chaque valeur : name, region (main/heap), offset (« 0x… »), width (1, 2, 4, 8), min et max ou choices,
// et l'intensité à partir de laquelle elle change (soft, medium, chaos).
const validateProfile = (p) => {
	if (!p || p.format !== 1 || !/^0100[0-9A-F]{12}$/i.test(p.titleId || '') || !p.builds || typeof p.builds !== 'object') throw new Error('Profil invalide : il faut format 1, titleId (0100…) et builds.');
	for (const [bid, b] of Object.entries(p.builds)) {
		if (!/^[0-9A-F]{16,64}$/i.test(bid)) throw new Error(`Build ID invalide : ${bid}`);
		if (!b || !Array.isArray(b.values) || !b.values.length) throw new Error(`Aucune valeur pour la version ${bid}.`);
		for (const v of b.values) {
			if (!v.name || !OFFSET.test(String(v.offset)) || !(v.region in REGION) || ![1, 2, 4, 8].includes(v.width)) throw new Error(`Valeur « ${v.name || '?'} » : region, offset (0x…) ou width (1, 2, 4, 8) invalide.`);
			const ok = Array.isArray(v.choices) ? v.choices.length > 0 && v.choices.every(Number.isInteger) : Number.isInteger(v.min) && Number.isInteger(v.max) && v.min <= v.max;
			if (!ok) throw new Error(`Valeur « ${v.name} » : il faut min et max entiers, ou une liste choices.`);
			if (v.intensity && !(v.intensity in RANK)) throw new Error(`Valeur « ${v.name} » : intensité inconnue.`);
		}
	}
	return p;
};

const readProfiles = (dir) => {
	let names = [];
	try { names = fs.readdirSync(dir).filter(n => /\.json$/i.test(n)); } catch { return []; }
	return names.map((n) => {
		try {
			const p = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
			return p.example ? null : { ...validateProfile(p), file: path.join(dir, n) };
		} catch { return null; }
	}).filter(Boolean);
};
const profileFor = tid => [...readProfiles(PROFILES_DIR), ...readProfiles(BUNDLED_PROFILES)].find(p => p.titleId.toUpperCase() === String(tid || '').toUpperCase()) || null;

// Fichiers de triche de chaque version connue du profil ({ "<16 premiers chiffres du build ID>.txt": texte }).
const cheatFiles = (profile, opts) => {
	const out = {};
	const code = rng.shareCode(opts);
	for (const [bid, build] of Object.entries(profile.builds)) {
		const r = rng.create(opts.seed, `switch-values-${profile.titleId}`);
		const lines = [];
		for (const v of build.values) {
			const value = Array.isArray(v.choices) ? r.pick(v.choices) : r.range(v.min, v.max);
			if (RANK[v.intensity || 'soft'] > RANK[opts.intensity]) continue;
			lines.push(storeCode(v, value));
		}
		if (lines.length) out[`${bid.slice(0, 16).toUpperCase()}.txt`] = `[Smash Emu Randomizer ${code}]\n${lines.join('\n')}\n`;
	}
	return out;
};

const applyValues = (userDir, tid, opts) => {
	if (!tid) return null;
	const dir = path.join(userDir, 'load', tid.toUpperCase(), CHEAT_MOD);
	fs.rmSync(dir, { recursive: true, force: true });
	if (!opts.on || !opts.modes.values) return null;
	const profile = profileFor(tid);
	if (!profile) return { profile: null };
	const files = cheatFiles(profile, opts);
	fs.mkdirSync(path.join(dir, 'cheats'), { recursive: true });
	for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, 'cheats', name), text);
	return { profile: profile.title || profile.titleId, files: Object.keys(files).length };
};

// ---------- Mods randomizer ----------

const safe = s => String(s || 'mod').replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'mod';
// Dossiers « load » du jeu dans chaque émulateur, et ceux où sont rangés les mods quand le randomizer est coupé.
const loadDirs = (tid, userDirs) => userDirs.flatMap(d => ['load', 'load-smash-off'].map(l => path.join(d, l, tid.toUpperCase())));

const listMods = (tid, userDirs) => {
	const names = new Set();
	for (const base of loadDirs(tid, userDirs)) {
		try { for (const e of fs.readdirSync(base, { withFileTypes: true })) if (e.isDirectory() && e.name.startsWith(MOD_PREFIX)) names.add(e.name.slice(MOD_PREFIX.length)); } catch { /* aucun mod */ }
	}
	return [...names].sort();
};

// Mod produit par un randomizer (dossier ou archive déjà extraite) : chaque dossier contenant romfs, exefs ou
// cheats est copié dans « load » de Citron et d'Eden ; les mods désactivés y restent mais hors du chargement.
const installMod = (tid, userDirs, sourceDir, name, { modRoots, copyDir }) => {
	const roots = modRoots(sourceDir);
	if (!roots.length) throw new Error('Aucun dossier romfs, exefs ou cheats dans ce mod : ce n’est pas un mod Switch.');
	const label = safe(name);
	for (const base of userDirs.map(d => path.join(d, 'load', tid.toUpperCase()))) {
		roots.forEach((r, i) => copyDir(r, path.join(base, `${MOD_PREFIX}${label}${roots.length > 1 ? ` ${i + 1}` : ''}`)));
	}
	return label;
};

const removeMod = (tid, userDirs, name) => {
	if (!name || /[\\/]|\.\./.test(name)) throw new Error('Nom de mod invalide.');
	for (const base of loadDirs(tid, userDirs)) {
		try {
			for (const e of fs.readdirSync(base)) if (e === `${MOD_PREFIX}${name}` || e.startsWith(`${MOD_PREFIX}${name} `)) fs.rmSync(path.join(base, e), { recursive: true, force: true });
		} catch { /* rien à retirer */ }
	}
};

// Mods randomizer désactivés : mis de côté dans le dossier du jeu chez Smash Emu, remis au prochain lancement activé.
const parkMods = (tid, userDir, on) => {
	const base = path.join(userDir, 'load', tid.toUpperCase());
	const park = path.join(userDir, 'load-smash-off', tid.toUpperCase());
	const [from, to] = on ? [park, base] : [base, park];
	let moved = 0;
	try {
		for (const e of fs.readdirSync(from, { withFileTypes: true })) {
			if (!e.isDirectory() || !e.name.startsWith(MOD_PREFIX)) continue;
			fs.mkdirSync(to, { recursive: true });
			fs.rmSync(path.join(to, e.name), { recursive: true, force: true });
			fs.renameSync(path.join(from, e.name), path.join(to, e.name));
			moved++;
		}
	} catch { /* rien à déplacer */ }
	return moved;
};

// ---------- Lancement ----------

// Appelé avant chaque lancement par Citron ou Eden. Renvoie une courte phrase pour l'écran de chargement.
const apply = ({ engine, userDir, tid, inst, setQtIni }) => {
	const opts = optionsOf(inst);
	const notes = [];
	if (engine === 'eden') {
		const p = applyColors(userDir, opts, setQtIni);
		if (p) notes.push('couleurs');
	}
	if (tid) {
		const v = applyValues(userDir, tid, opts);
		if (v && v.profile) notes.push(`${v.files ? 'valeurs' : 'aucune valeur à cette intensité'}`);
		parkMods(tid, userDir, opts.on && opts.modes.mods);
		if (opts.on && opts.modes.mods && listMods(tid, [userDir]).length) notes.push('mods');
	}
	return opts.on ? `Randomizer ${rng.shareCode(opts)} : ${notes.length ? notes.join(', ') : 'rien à changer pour ce jeu'}.` : null;
};

module.exports = {
	apply, optionsOf, cleanOptions, colorParams, applyColors, storeCode, validateProfile, profileFor, cheatFiles, applyValues,
	listMods, installMod, removeMod, parkMods, PROFILES_DIR, FX_FILE, FX_SOURCE, CHEAT_MOD, MOD_PREFIX,
};
