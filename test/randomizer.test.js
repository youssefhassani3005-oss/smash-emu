const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'smash-rando-test-'));
os.homedir = () => HOME;

const rng = require('../src/main/randomizer/rng');
const rs = require('../src/main/randomizer/switch');
const { setQtIni } = require('../src/main/switchkeys');

test('Randomizer : xoshiro256** conforme, même graine = mêmes tirages, code partageable', () => {
	const n = rng.xoshiro([1n, 2n, 3n, 4n]);
	assert.deepStrictEqual([n(), n(), n(), n()], [11520n, 0n, 1509978240n, 1215971899390074240n]);
	const a = rng.create('Ma graine !'), b = rng.create('MAGRAINE');
	assert.deepStrictEqual(Array.from({ length: 20 }, () => a.int(1000)), Array.from({ length: 20 }, () => b.int(1000)));
	assert.notDeepStrictEqual(rng.create('A').shuffle([1, 2, 3, 4, 5, 6, 7, 8]), rng.create('B').shuffle([1, 2, 3, 4, 5, 6, 7, 8]));
	const o = { seed: 'k7m2qx9a', modes: { colors: true, mods: true }, intensity: 'chaos' };
	assert.strictEqual(rng.shareCode(o), 'SMASH-K7M2QX9A-CM3');
	assert.deepStrictEqual(rng.parseCode('smash-K7M2QX9A-CM3'), { seed: 'K7M2QX9A', modes: { colors: true, mods: true }, intensity: 'chaos' });
	assert.throws(() => rng.parseCode('nimporte quoi'));
});

test('Randomizer Switch : codes Atmosphère et profil', () => {
	assert.strictEqual(rs.storeCode({ region: 'main', offset: '0x1A2B3C', width: 4 }, 9999), '04000000 001A2B3C 0000270F');
	assert.strictEqual(rs.storeCode({ region: 'heap', offset: '0x12345678AB', width: 8 }, 1), '08100012 345678AB 00000000 00000001');
	assert.strictEqual(rs.storeCode({ region: 'main', offset: '0x10', width: 1 }, -1), '01000000 00000010 000000FF');
	const profile = rs.validateProfile({ ...JSON.parse(fs.readFileSync(path.join(__dirname, '../src/main/randomizer/profiles/exemple.json'), 'utf8')), example: undefined });
	const soft = rs.cheatFiles(profile, { seed: 'X', intensity: 'soft', modes: { values: true } });
	const chaos = rs.cheatFiles(profile, { seed: 'X', intensity: 'chaos', modes: { values: true } });
	const lines = t => Object.values(t)[0].trim().split('\n').slice(1);
	assert.strictEqual(lines(soft).length, 1);
	assert.strictEqual(lines(chaos).length, 3);
	assert.strictEqual(lines(chaos)[0], lines(soft)[0], 'même graine : même valeur quelle que soit l’intensité');
	assert.deepStrictEqual(Object.keys(soft), ['0123456789ABCDEF.txt']);
	assert.throws(() => rs.validateProfile({ format: 1, titleId: '0100000000010000', builds: { '0123456789ABCDEF': { values: [{ name: 'x', region: 'main', offset: 'abc', width: 4, min: 0, max: 1 }] } } }));
});

test('Randomizer Switch : effet de couleurs ajouté puis retiré sans toucher aux effets du joueur', () => {
	const dir = path.join(HOME, 'eden');
	const ini = path.join(dir, 'config', 'qt-config.ini');
	fs.mkdirSync(path.dirname(ini), { recursive: true });
	fs.writeFileSync(ini, '[Renderer]\npost_shader_chain\\default=false\npost_shader_chain=Bloom.fx|Bloom|\npost_shader_enabled\\default=true\npost_shader_enabled=false\n');
	const opts = { on: true, seed: 'ABC', intensity: 'medium', modes: { colors: true } };
	const p = rs.applyColors(dir, opts, setQtIni);
	assert.deepStrictEqual(p, rs.colorParams('ABC', 'medium'));
	assert.ok(p.Hue >= 45 && p.Hue <= 315);
	let text = fs.readFileSync(ini, 'utf8');
	assert.match(text, /^post_shader_chain="Bloom\.fx\|Bloom\|;SmashRandomizer\.fx\|SmashRandomizer\|Hue=\d+,Saturation=[\d.]+,Swap=0,Invert=0"$/m);
	assert.match(text, /^post_shader_enabled=true$/m);
	assert.strictEqual(fs.readFileSync(path.join(dir, 'post_shaders', rs.FX_FILE), 'utf8'), rs.FX_SOURCE);
	rs.applyColors(dir, { ...opts, on: false }, setQtIni);
	text = fs.readFileSync(ini, 'utf8');
	assert.match(text, /^post_shader_chain="Bloom\.fx\|Bloom\|"$/m);
	assert.match(text, /^post_shader_enabled=false$/m, 'choix du joueur rendu');
});

test('Randomizer Switch : mods rangés quand le randomizer est coupé', () => {
	const dir = path.join(HOME, 'citron');
	const src = path.join(HOME, 'src-mod', 'atmosphere', 'contents', '0100000000010000');
	fs.mkdirSync(path.join(src, 'romfs'), { recursive: true });
	fs.writeFileSync(path.join(src, 'romfs', 'data.bin'), 'x');
	const gb = require('../src/main/gamebanana');
	rs.installMod('0100000000010000', [dir], path.join(HOME, 'src-mod'), 'Seed 42', gb);
	assert.deepStrictEqual(rs.listMods('0100000000010000', [dir]), ['Seed 42']);
	rs.parkMods('0100000000010000', dir, false);
	assert.ok(!fs.existsSync(path.join(dir, 'load', '0100000000010000', `${rs.MOD_PREFIX}Seed 42`)));
	assert.deepStrictEqual(rs.listMods('0100000000010000', [dir]), ['Seed 42']);
	rs.parkMods('0100000000010000', dir, true);
	assert.ok(fs.existsSync(path.join(dir, 'load', '0100000000010000', `${rs.MOD_PREFIX}Seed 42`, 'romfs', 'data.bin')));
	rs.removeMod('0100000000010000', [dir], 'Seed 42');
	assert.deepStrictEqual(rs.listMods('0100000000010000', [dir]), []);
});
