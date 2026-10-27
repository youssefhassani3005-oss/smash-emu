const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Dossiers isolés : Documents (Smash Emu) et %APPDATA% (Citron, Eden) dans un dossier temporaire.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'smash-swhub-test-'));
os.homedir = () => HOME;
process.env.APPDATA = path.join(HOME, 'AppData', 'Roaming');

const store = require('../src/main/store');
const hub = require('../src/main/switchhub');

const TID = '0100ABCD12340000';
const PROFILE = { eden: '688C8B4BA28B8C85E567F366AD84B9D6', citron: 'D0E0331E3A1B04AD0B1709AF49950C88' };
const saveDir = e => path.join(process.env.APPDATA, e, 'nand', 'user', 'save', '0000000000000000', PROFILE[e], TID);
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };

// Jeu Switch de la bibliothèque dont le fichier porte l'identifiant (sans clés, c'est lui qui sert).
const makeGame = () => {
	store.ensureDirs();
	const inst = store.createInstance({ name: 'Jeu test', type: 'rom' });
	const file = path.join(HOME, 'Downloads', `Jeu test [${TID}][v0].nsp`);
	write(file, 'pas un vrai jeu');
	fs.utimesSync(file, new Date(Date.now() - 60000), new Date(Date.now() - 60000));
	return store.updateInstance(inst.id, { rom: { system: 'switch', linked: file }, options: { ...inst.options, engine: 'eden' } });
};

test('triches : lecture du format Atmosphère', () => {
	const list = hub.parseCheats('{Master Code}\n04000000 00000000 00000000\n\n[Argent infini]\n04000000 0012AB34 0098967F\n\n[Vide]\n\n[Vies max]\n580F0000 01234567\n780F0000 00000010\n');
	assert.deepStrictEqual(list.map(c => [c.name, c.master, c.code.length]), [['Master Code', true, 1], ['Argent infini', false, 1], ['Vies max', false, 2]]);
});

test('réglages par jeu : valeur propre puis retour au réglage général', () => {
	const file = path.join(HOME, 'custom.ini');
	write(file, '[Renderer]\nresolution_setup\\use_global=true\nanti_aliasing\\use_global=true\n\n[System]\nlanguage_index\\use_global=true\n');
	hub.setGameIni(file, 'Renderer', { resolution_setup: 6 });
	hub.setGameIni(file, 'System', { language_index: 2 });
	hub.setGameIni(file, 'Audio', { volume: 50 });
	let ini = hub.readGameIni(file);
	assert.strictEqual(ini['Renderer/resolution_setup'], '6');
	assert.strictEqual(ini['Renderer/resolution_setup\\use_global'], 'false');
	assert.strictEqual(ini['Renderer/anti_aliasing\\use_global'], 'true');
	assert.strictEqual(ini['System/language_index'], '2');
	assert.strictEqual(ini['Audio/volume'], '50');
	hub.setGameIni(file, 'Renderer', { resolution_setup: null });
	ini = hub.readGameIni(file);
	assert.strictEqual(ini['Renderer/resolution_setup\\use_global'], 'true');
	assert.strictEqual(ini['Renderer/resolution_setup'], undefined);
	// Une seule ligne par clé, même après plusieurs écritures.
	hub.setGameIni(file, 'System', { language_index: 3 });
	assert.strictEqual(fs.readFileSync(file, 'utf8').match(/^language_index=/gm).length, 1);
});

test('options : numéros propres à chaque émulateur', () => {
	const inst = makeGame();
	let s = hub.settings(inst.id);
	assert.strictEqual(s.engine, 'eden');
	assert.ok(s.options.some(o => o.id === 'aspect'), 'Eden a le format d’image');
	hub.setOption(inst.id, 'res', '2×');
	hub.setOption(inst.id, 'filter', 'FSR');
	assert.strictEqual(hub.readGameIni(hub.gameIni('eden', TID))['Renderer/resolution_setup'], '6');
	assert.strictEqual(hub.readGameIni(hub.gameIni('eden', TID))['Renderer/scaling_filter'], '6');
	s = hub.settings(inst.id);
	assert.strictEqual(s.options.find(o => o.id === 'res').value, '2×');
	store.updateInstance(inst.id, { options: { engine: 'citron' } });
	s = hub.settings(inst.id);
	assert.ok(!s.options.some(o => o.id === 'aspect'), 'Citron : réglages incertains masqués');
	hub.applyPreset(inst.id, 'pretty');
	const c = hub.readGameIni(hub.gameIni('citron', TID));
	assert.strictEqual(c['Renderer/resolution_setup'], '5');
	assert.strictEqual(c['Renderer/scaling_filter'], '7');
	assert.strictEqual(c['Renderer/max_anisotropy'], undefined);
	hub.resetOptions(inst.id);
	assert.ok(hub.settings(inst.id).options.every(o => o.value === null));
});

test('sauvegardes : copie automatique sans doublon, restauration, transfert', () => {
	const inst = makeGame();
	fs.mkdirSync(path.join(process.env.APPDATA, 'citron', 'nand', 'user', 'save', '0000000000000000', PROFILE.citron), { recursive: true });
	write(path.join(saveDir('eden'), 'savedata.bin'), 'partie 1');
	const file = inst.rom.linked;
	assert.ok(hub.autoBackup('eden', file), 'première copie');
	assert.strictEqual(hub.autoBackup('eden', file), null, 'sauvegarde inchangée : pas de doublon');
	const first = hub.backupsOf(TID)[0];
	write(path.join(saveDir('eden'), 'savedata.bin'), 'partie 2, plus loin');
	// Restauration : la partie 2 est gardée en copie, la partie 1 revient.
	hub.restore(TID, first.name, 'eden');
	assert.strictEqual(fs.readFileSync(path.join(saveDir('eden'), 'savedata.bin'), 'utf8'), 'partie 1');
	assert.ok(hub.backupsOf(TID).some(b => b.reason === 'before-restore'));
	// Transfert vers Citron, dans le profil de Citron.
	hub.transfer(TID, 'eden', 'citron');
	assert.strictEqual(fs.readFileSync(path.join(saveDir('citron'), 'savedata.bin'), 'utf8'), 'partie 1');
	const s = hub.saves(inst.id);
	assert.deepStrictEqual(s.engines.map(e => [e.engine, e.exists]), [['citron', true], ['eden', true]]);
	assert.throws(() => hub.restore(TID, '../x', 'eden'), /invalide/);
	// Le fichier du jeu disparaît : la sauvegarde reste accessible grâce à l'identifiant retenu.
	fs.rmSync(file);
	assert.strictEqual(hub.saves(inst.id).tid, TID);
});

test('mods : désactivation, mode « seul », suppression ; triches écrites dans un mod', () => {
	const inst = makeGame();
	for (const e of ['eden', 'citron']) {
		write(path.join(process.env.APPDATA, e, 'load', TID, 'Mod A', 'romfs', 'a.bin'), 'a');
		write(path.join(process.env.APPDATA, e, 'load', TID, 'Mod B', 'exefs', 'b.ips'), 'b');
	}
	let m = hub.mods(inst.id);
	assert.deepStrictEqual(m.list.map(x => [x.name, x.on, x.kinds]), [['Mod A', true, ['romfs']], ['Mod B', true, ['exefs']]]);
	m = hub.toggleMod(inst.id, 'Mod A', false);
	assert.ok(!fs.existsSync(path.join(process.env.APPDATA, 'eden', 'load', TID, 'Mod A')));
	assert.ok(fs.existsSync(path.join(process.env.APPDATA, 'eden', 'load-smash-disabled', TID, 'Mod A', 'romfs', 'a.bin')));
	m = hub.soloMod(inst.id, 'Mod A');
	assert.deepStrictEqual(m.list.map(x => [x.name, x.on]), [['Mod A', true], ['Mod B', false]]);
	m = hub.removeMod(inst.id, 'Mod B');
	assert.deepStrictEqual(m.list.map(x => x.name), ['Mod A']);
	assert.throws(() => hub.toggleMod(inst.id, '..\\x', true), /invalide/);

	const txt = path.join(HOME, '0123456789ABCDEF.txt');
	write(txt, '{Master}\n04000000 00000000 00000001\n[Argent]\n04000000 0012AB34 0098967F\n[Vies]\n04000000 0012AB38 00000063\n');
	const r = hub.importCheats(inst.id, txt);
	assert.strictEqual(r.count, 3);
	assert.strictEqual(r.bid, '0123456789ABCDEF');
	const out = path.join(process.env.APPDATA, 'eden', 'load', TID, hub.CHEAT_MOD, 'cheats', '0123456789ABCDEF.txt');
	assert.ok(!fs.existsSync(out), 'rien d’écrit tant qu’aucune triche n’est cochée');
	hub.toggleCheat(inst.id, '0123456789ABCDEF', 1, true);
	const text = fs.readFileSync(out, 'utf8');
	assert.match(text, /\{Master\}/);
	assert.match(text, /\[Argent\]/);
	assert.doesNotMatch(text, /\[Vies\]/);
	assert.ok(!hub.mods(inst.id).list.some(x => x.name === hub.CHEAT_MOD), 'le mod des triches n’apparaît pas dans la liste des mods');
	hub.removeCheats(inst.id, '0123456789ABCDEF');
	assert.ok(!fs.existsSync(out));
});
