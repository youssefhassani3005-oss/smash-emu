const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Isole les données de test dans un dossier temporaire.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'l64-test-'));
os.homedir = () => HOME;

const AdmZip = require('adm-zip');
const rom = require('../src/main/rom');
const store = require('../src/main/store');
const installer = require('../src/main/installer');
const games = require('../src/main/games');

// Fausse ROM z64 avec un en-tête valide.
const makeRom = (size = 0x1000) => {
	const b = Buffer.alloc(size);
	b.writeUInt32BE(0x80371240, 0);
	b.write('SUPER MARIO 64      ', 0x20, 'ascii');
	b.write('NSME', 0x3b, 'ascii');
	for (let i = 0x40; i < size; i++) b[i] = i & 0xff;
	return b;
};

// Encodeur BPS minimal (TargetRead + SourceRead) pour vérifier le décodeur.
const bpsNumber = (n) => {
	const out = [];
	for (;;) {
		const x = n & 0x7f; n = Math.floor(n / 128);
		if (n === 0) { out.push(0x80 | x); break; }
		out.push(x); n--;
	}
	return out;
};
const makeBps = (source, target) => {
	const bytes = [...Buffer.from('BPS1'), ...bpsNumber(source.length), ...bpsNumber(target.length), ...bpsNumber(0)];
	let i = 0;
	while (i < target.length) {
		let j = i;
		if (i < source.length && source[i] === target[i]) {
			while (j < target.length && j < source.length && source[j] === target[j]) j++;
			bytes.push(...bpsNumber(((j - i - 1) * 4) + 0));
		} else {
			while (j < target.length && !(j < source.length && source[j] === target[j])) j++;
			bytes.push(...bpsNumber(((j - i - 1) * 4) + 1), ...target.subarray(i, j));
		}
		i = j;
	}
	const body = Buffer.from(bytes);
	const footer = Buffer.alloc(12);
	footer.writeUInt32LE(rom.crc32(source), 0);
	footer.writeUInt32LE(rom.crc32(target), 4);
	const withoutPatchCrc = Buffer.concat([body, footer.subarray(0, 8)]);
	footer.writeUInt32LE(rom.crc32(withoutPatchCrc), 8);
	return Buffer.concat([body, footer]);
};

test('ordre des octets : v64 et n64 convertis en z64', () => {
	const z = makeRom(64);
	const v = Buffer.from(z); for (let i = 0; i < v.length; i += 2) [v[i], v[i + 1]] = [v[i + 1], v[i]];
	const n = Buffer.from(z); for (let i = 0; i < n.length; i += 4) [n[i], n[i + 1], n[i + 2], n[i + 3]] = [n[i + 3], n[i + 2], n[i + 1], n[i]];
	assert.strictEqual(rom.detectByteOrder(v), 'v64');
	assert.strictEqual(rom.detectByteOrder(n), 'n64');
	assert.deepStrictEqual(rom.toZ64(v), z);
	assert.deepStrictEqual(rom.toZ64(n), z);
	const info = rom.romInfo(v);
	assert.strictEqual(info.title, 'SUPER MARIO 64');
	assert.strictEqual(info.region, 'US');
});

test('patch IPS : écriture, RLE et agrandissement', () => {
	const src = Buffer.alloc(16, 0);
	const patch = Buffer.concat([
		Buffer.from('PATCH'),
		Buffer.from([0, 0, 2, 0, 3, 0xaa, 0xbb, 0xcc]),       // 3 octets à l'offset 2
		Buffer.from([0, 0, 10, 0, 0, 0, 4, 0x11]),            // RLE : 4 × 0x11 à l'offset 10
		Buffer.from([0, 0, 20, 0, 2, 0xde, 0xad]),            // au-delà de la fin
		Buffer.from('EOF'),
	]);
	const out = rom.applyIps(src, patch);
	assert.strictEqual(out.length, 22);
	assert.deepStrictEqual([...out.subarray(2, 5)], [0xaa, 0xbb, 0xcc]);
	assert.deepStrictEqual([...out.subarray(10, 14)], [0x11, 0x11, 0x11, 0x11]);
	assert.deepStrictEqual([...out.subarray(20, 22)], [0xde, 0xad]);
});

test('patch BPS : reconstruit la cible et refuse une mauvaise ROM', () => {
	const source = makeRom(0x800);
	const target = Buffer.from(source);
	target.write('LINK IN MARIO 64', 0x20, 'ascii');
	for (let i = 0x400; i < 0x420; i++) target[i] = 0x42;
	const grown = Buffer.concat([target, Buffer.from('FIN DU HACK')]);
	const patch = makeBps(source, grown);
	assert.deepStrictEqual(rom.applyBps(source, patch), grown);
	const other = Buffer.from(source); other[0x500] ^= 0xff;
	assert.throws(() => rom.applyBps(other, patch), /ne correspond pas/);
});

test('analyse de zip : mods, packs DynOS, fichiers isolés', () => {
	const zip = new AdmZip();
	zip.addFile('MonMod/main.lua', Buffer.from('-- name: Mon Mod\n'));
	zip.addFile('MonMod/a/b.lua', Buffer.from(''));
	zip.addFile('extra.lua', Buffer.from('-- name: Extra\n'));
	zip.addFile('dynos/packs/Luigi HD/actors/luigi.bin', Buffer.from('x'));
	zip.addFile('readme.txt', Buffer.from('lisez-moi'));
	const found = installer.analyzeZip(new AdmZip(zip.toBuffer()).getEntries());
	assert.deepStrictEqual(found.mods.map(m => m.name).sort(), ['MonMod', 'extra.lua']);
	assert.deepStrictEqual(found.packs.map(p => p.name), ['Luigi HD']);
});

test('installation dans une instance Coop DX puis activation', () => {
	const inst = store.createInstance({ name: 'Test Coop', type: 'coopdx' });
	const zip = new AdmZip();
	zip.addFile('Flood/main.lua', Buffer.from('-- name: Flood\n-- description: L\'eau \\#ff0000\\monte\\n vite\n'));
	zip.addFile('Pack/actors/x.bin', Buffer.from('x'));
	const installed = installer.installData(inst.id, 'flood.zip', zip.toBuffer(), { type: 'test' });
	assert.deepStrictEqual(installed.map(i => i.kind).sort(), ['mod', 'pack']);

	const content = games.listContent(inst.id).filter(c => c.source === 'instance');
	const flood = content.find(c => c.rel === 'Flood');
	assert.strictEqual(flood.name, 'Flood');
	assert.strictEqual(flood.description, 'L\'eau monte\n vite');
	assert.strictEqual(flood.enabled, true);

	games.setEnabled(inst.id, flood.key, false);
	assert.strictEqual(games.listContent(inst.id).find(c => c.key === flood.key).enabled, false);

	const pack = content.find(c => c.kind === 'pack');
	games.setEnabled(inst.id, pack.key, false);
	assert.ok(fs.existsSync(path.join(store.instanceDir(inst.id), 'dynos', 'packs-disabled', 'Pack')));

	assert.throws(() => installer.installData(inst.id, 'hack.bps', Buffer.from('BPS1')), /instances ROM/);
});

test('instance ROM : patchs appliqués dans l\'ordre au lancement', () => {
	const inst = store.createInstance({ name: 'Hack', type: 'rom' });
	const base = makeRom(0x800);
	const romPath = path.join(HOME, 'base.v64');
	const v = Buffer.from(base); for (let i = 0; i < v.length; i += 2) [v[i], v[i + 1]] = [v[i + 1], v[i]];
	fs.writeFileSync(romPath, v);
	games.setRom(inst.id, romPath);

	const target = Buffer.from(base); target.write('HACKED', 0x100, 'ascii');
	installer.installData(inst.id, 'hack.bps', makeBps(base, target));
	installer.installData(inst.id, 'fix.ips', Buffer.concat([Buffer.from('PATCH'), Buffer.from([0, 1, 0, 0, 1, 0x21]), Buffer.from('EOF')]));

	// Moteur intégré par défaut : la ROM construite est servie à la fenêtre de jeu.
	const emuPlan = games.prepareLaunch(inst.id);
	assert.strictEqual(emuPlan.kind, 'emu');
	assert.strictEqual(fs.readFileSync(emuPlan.rom).toString('ascii', 0x100, 0x106), '!ACKED'); // BPS puis IPS

	// Moteur Project64 : même ROM, passée en argument à l'exécutable.
	store.setSettings({ project64Path: process.execPath }); // n'importe quel exe existant
	store.updateInstance(inst.id, { options: { ...store.getInstance(inst.id).options, engine: 'project64' } });
	const plan = games.prepareLaunch(inst.id);
	assert.strictEqual(plan.kind, 'process');
	assert.strictEqual(fs.readFileSync(plan.args[0]).toString('ascii', 0x100, 0x106), '!ACKED');
});

test('bibliothèque de ROM : zip, conversion, doublons, nom lisible', () => {
	const romlib = require('../src/main/romlib');
	const base = makeRom(0x800);
	const v = Buffer.from(base); for (let i = 0; i < v.length; i += 2) [v[i], v[i + 1]] = [v[i + 1], v[i]];
	const zip = new AdmZip();
	zip.addFile('Legend of Zelda, The - Test (U) (V1.2) [!].v64', v);
	zip.addFile('lisez-moi.txt', Buffer.from('rien'));
	const zipPath = path.join(HOME, 'roms.zip');
	fs.writeFileSync(zipPath, zip.toBuffer());

	const [entry] = romlib.importFile(zipPath);
	assert.strictEqual(entry.name, 'The Legend of Zelda - Test (V1.2)');
	assert.strictEqual(entry.info.byteOrder, 'v64');
	assert.deepStrictEqual(fs.readFileSync(romlib.get(entry.id).path), base); // stockée en .z64
	assert.strictEqual(romlib.importData('copie.z64', base)[0].duplicate, true);
	assert.strictEqual(romlib.list().length, 1);
	assert.deepStrictEqual(romlib.romsInZip(zipPath), ['Legend of Zelda, The - Test (U) (V1.2) [!].v64']);
	assert.throws(() => romlib.importData('pas-une-rom.z64', Buffer.from('bonjour')), /pas un jeu reconnu/);

	// Le zip déjà importé n'est plus proposé par la détection des téléchargements.
	assert.strictEqual(romlib.scan([HOME]).some(f => f.path === zipPath), false);
	romlib.remove(entry.id);
	assert.strictEqual(romlib.list().length, 0);
});

test('mods Coop DX en conflit : le second est installé désactivé', () => {
	const inst = store.createInstance({ name: 'Conflits', type: 'coopdx' });
	const mod = (name, tags) => {
		const zip = new AdmZip();
		zip.addFile(`${name}/main.lua`, Buffer.from(`-- name: ${name}\n-- incompatible: ${tags}\n`));
		return zip.toBuffer();
	};
	installer.installData(inst.id, 'star-road.zip', mod('StarRoad', 'romhack'));
	const second = installer.installData(inst.id, 'sm74.zip', mod('SM74', 'romhack'));
	assert.strictEqual(second[0].conflict.with[0], 'StarRoad');
	const third = installer.installData(inst.id, 'cheats.zip', mod('Cheats', 'cheats'));
	assert.strictEqual(third[0].conflict, undefined);
	const enabled = games.listContent(inst.id).filter(c => c.source === 'instance' && c.enabled).map(c => c.rel).sort();
	assert.deepStrictEqual(enabled, ['Cheats', 'StarRoad']);
});

test('consoles : détection des images disque par signature', () => {
	const systems = require('../src/main/systems');
	const write = (name, size, fill) => { const b = Buffer.alloc(size); fill(b); const f = path.join(HOME, name); fs.writeFileSync(f, b); return f; };
	const gc = write('jeu-gc.iso', 0x100, b => b.writeUInt32BE(0xc2339f3d, 0x1c));
	const wii = write('jeu-wii.iso', 0x100, b => b.writeUInt32BE(0x5d1c9ea3, 0x18));
	const psp = write('jeu-psp.iso', 0x9000, (b) => { b.write('\x01CD001', 0x8000, 'latin1'); b.write('PSP GAME', 0x8008, 'latin1'); });
	const ps1 = write('jeu-ps1.bin', 0x9400, (b) => { b.write('\x01CD001', 0x9310, 'latin1'); b.write('PLAYSTATION', 0x9318, 'latin1'); });
	const inconnu = write('windows.iso', 0x9000, () => {});
	assert.strictEqual(systems.detect(gc).system, 'gc');
	assert.strictEqual(systems.detect(wii).system, 'wii');
	assert.strictEqual(systems.detect(psp).system, 'psp');
	assert.strictEqual(systems.detect(ps1).system, 'psx');
	assert.strictEqual(systems.detect(inconnu).sure, false);
	fs.writeFileSync(path.join(HOME, 'jeu.cue'), 'FILE "jeu-ps1.bin" BINARY\n  TRACK 01 MODE2/2352\n');
	assert.strictEqual(systems.detect(path.join(HOME, 'jeu.cue')).system, 'psx');
	assert.deepStrictEqual(systems.enginesFor('psx'), ['smash', 'duckstation']);
	assert.deepStrictEqual(systems.enginesFor('switch'), ['ryujinx']);
});

test('consoles : cartouches validées, jeu NES lancé dans l’émulateur intégré', () => {
	const romlib = require('../src/main/romlib');
	const nes = Buffer.concat([Buffer.from('NES\x1a\x01\x01\x00\x00', 'latin1'), Buffer.alloc(8), Buffer.alloc(16384 + 8192, 0xea)]);
	const [entry] = romlib.importData('Mon Jeu (USA).nes', nes);
	assert.strictEqual(entry.system, 'nes');
	assert.strictEqual(entry.name, 'Mon Jeu');
	assert.throws(() => romlib.importData('README.md', Buffer.from('# Lisez-moi')), /pas un jeu reconnu/);
	assert.throws(() => romlib.importData('faux.gba', Buffer.alloc(0x200)), /pas un jeu reconnu/);

	const inst = store.createInstance({ name: 'NES', type: 'rom' });
	games.setGame(inst.id, romlib.get(entry.id));
	const plan = games.prepareLaunch(inst.id);
	assert.strictEqual(plan.kind, 'emu');
	assert.strictEqual(plan.ejs, 'nes');
	assert.strictEqual(plan.core, 'fceumm');
	assert.ok(plan.rom.endsWith('.nes'));

	// Console sans cœur intégré : il faut l'émulateur externe.
	const wiiFile = path.join(HOME, 'jeu-wii.iso');
	const [wiiGame] = romlib.importFile(wiiFile);
	assert.strictEqual(wiiGame.system, 'wii');
	assert.strictEqual(wiiGame.linked, wiiFile); // l'image n'est pas copiée
	const wiiInst = store.createInstance({ name: 'Wii', type: 'rom' });
	games.setGame(wiiInst.id, romlib.get(wiiGame.id));
	assert.strictEqual(games.engineFor(store.getInstance(wiiInst.id)), 'dolphin');
});

test('clés Switch : reconnaissance du type de fichier', () => {
	const M = require('module');
	const load = M._load;
	M._load = function (request, ...rest) { return request === 'electron' ? { shell: {} } : load.call(this, request, ...rest); };
	let classify;
	try { ({ classify } = require('../src/main/switchkeys')); } finally { M._load = load; }
	const hex = n => 'ab'.repeat(n / 2);
	assert.equal(classify(`header_key = ${hex(64)}\nmaster_key_00 = ${hex(32)}\n`), 'prod.keys');
	assert.equal(classify(`${hex(32)} = ${hex(32)}\n${'cd'.repeat(16)} = ${hex(32)}\n`), 'title.keys');
	assert.equal(classify('ceci n’est pas un fichier de clés'), null);
	assert.equal(classify(''), null);
});

test('manettes : boutons par console lus dans EmulatorJS', () => {
	const M = require('module');
	const load = M._load;
	M._load = function (request, ...rest) { return /store$/.test(request) ? { getSettings: () => ({}), setSettings() {} } : load.call(this, request, ...rest); };
	let controls;
	try { controls = require('../src/main/controls'); } finally { M._load = load; }
	const n64 = controls.get('n64').buttons.map(b => b.label);
	assert.ok(n64.includes('Z') && n64.includes('C-PAD UP'));
	assert.ok(controls.get('psx').buttons.some(b => b.label === 'L2'));
	assert.ok(controls.list().some(s => s.id === 'wii' && s.dolphin));
});

test('sauvegardes en jeu : copie, copies de secours en rotation, restauration', () => {
	const saves = require('../src/main/saves');
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saves-'));
	const l = saves.local(dir);
	const t0 = new Date(2026, 9, 19, 20, 0, 0).getTime();
	const v = n => Buffer.alloc(512, n);

	assert.equal(saves.write(l, v(1), { now: t0, sessionStart: t0 }).changed, true);
	assert.equal(saves.write(l, v(1), { now: t0 + 1000, sessionStart: t0 }).changed, false, 'même contenu : rien à faire');
	// Première écriture d'une session : l'ancienne version est gardée ; ensuite au plus une copie par 10 min.
	saves.write(l, v(2), { now: t0 + 2000, sessionStart: t0 });
	assert.equal(saves.listBackups(l).length, 1);
	saves.write(l, v(3), { now: t0 + 60000, sessionStart: t0 });
	assert.equal(saves.listBackups(l).length, 1, 'pas de nouvelle copie avant 10 minutes');
	saves.write(l, v(4), { now: t0 + 11 * 60000, sessionStart: t0 });
	assert.equal(saves.listBackups(l).length, 2);
	// Rotation.
	for (let i = 0; i < 6; i++) saves.write(l, v(10 + i), { now: t0 + (20 + i) * 60000, source: 'import', keep: 3 });
	assert.equal(saves.listBackups(l).length, 3);
	// Restauration : la version courante devient une copie de secours.
	const oldest = saves.listBackups(l).at(-1);
	const before = saves.current(l).meta.hash;
	saves.restore(l, oldest.name, { keep: 5, now: t0 + 40 * 60000 });
	assert.notEqual(saves.current(l).meta.hash, before);
	assert.equal(saves.current(l).meta.source, 'restore');
	assert.throws(() => saves.restore(l, '../../evil.srm'), /invalide/);
	assert.throws(() => saves.write(l, Buffer.alloc(0)), /vide/);
});

test('sauvegardes en jeu : synchronisation avec un dossier cloud', () => {
	const saves = require('../src/main/saves');
	const a = saves.local(fs.mkdtempSync(path.join(os.tmpdir(), 'pc-a-')));
	const b = saves.local(fs.mkdtempSync(path.join(os.tmpdir(), 'pc-b-')));
	const c = saves.cloud(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-')), 'zelda');
	const t0 = Date.now();

	assert.equal(saves.sync(a, c).action, 'none');
	saves.write(a, Buffer.from('partie du PC A'), { now: t0 });
	assert.equal(saves.sync(a, c).action, 'pushed');
	assert.equal(saves.sync(b, c).action, 'pulled', 'le PC B récupère la sauvegarde');
	assert.equal(saves.current(b).data.toString(), 'partie du PC A');
	assert.equal(saves.sync(b, c).action, 'same');
	// Le PC B joue plus tard : sa version gagne, et A la récupère en gardant la sienne en copie de secours.
	saves.write(b, Buffer.from('partie du PC B'), { now: t0 + 5000 });
	assert.equal(saves.sync(b, c).action, 'pushed');
	saves.write(a, Buffer.from('vieille partie A'), { now: t0 + 1000 });
	assert.equal(saves.sync(a, c).action, 'pulled');
	assert.equal(saves.current(a).data.toString(), 'partie du PC B');
	assert.ok(saves.listBackups(a).length >= 1);
	// Copie du cloud abîmée (synchronisation en cours) : ignorée.
	fs.writeFileSync(c.meta, JSON.stringify({ hash: 'x'.repeat(40), size: 3, savedAt: t0 + 99999, source: 'game' }));
	assert.equal(saves.sync(a, c).action, 'skipped');
});

test('manettes : profil par jeu fusionné avec celui de la console', () => {
	const M = require('module');
	const load = M._load;
	const settings = {};
	M._load = function (request, ...rest) {
		return /store$/.test(request) ? { getSettings: () => settings, setSettings: p => Object.assign(settings, p), getInstance: id => (id === 'zelda' ? { id } : null) } : load.call(this, request, ...rest);
	};
	let controls;
	try { delete require.cache[require.resolve('../src/main/controls')]; controls = require('../src/main/controls'); } finally { M._load = load; }
	controls.set('n64', { kb: { 0: { code: 88, name: 'X' } }, pad: { 0: 'BUTTON_2' }, turbo: { 0: true }, turboHz: 15 });
	controls.set('n64', { pad: { 0: 'BUTTON_1', 8: '' }, turbo: { 0: false } }, 'zelda');
	const p = controls.forPlayer('n64', 'zelda');
	assert.equal(p.kb[0].code, 88, 'le clavier de la console est repris');
	assert.equal(p.pad[0], 'BUTTON_1', 'le jeu remplace le bouton');
	assert.equal(p.pad[8], '', 'un bouton peut être désassigné pour ce jeu');
	assert.equal(p.turbo[0], false);
	assert.equal(p.turboHz, 15);
	assert.equal(controls.forPlayer('n64').pad[0], 'BUTTON_2', 'les autres jeux gardent le profil de la console');
	assert.throws(() => controls.set('n64', {}, 'inconnu'), /introuvable/);
	assert.equal(controls.cleanProfile({ turboHz: 999, pad: { 1: '<script>' } }).turboHz, 30);
	assert.equal(controls.cleanProfile({ pad: { 1: '<script>' } }).pad[1], undefined);
});

test('jeu à distance : codes d’invitation et commandes de manette', async () => {
	const R = require('../src/emu/remote-common');
	const sdp = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n'.repeat(40);
	const code = await R.encode('offer', { sdp, game: 'Super Mario 64', host: 'Youssef', slot: 2, expires: Date.now() + 60000 });
	assert.match(code, /^SMASH-INV-[A-Za-z0-9_-]+$/);
	assert.ok(code.length < sdp.length, 'le code est compressé');
	const back = await R.decode(`  ${code}\n`, 'offer');
	assert.equal(back.sdp, sdp);
	assert.equal(back.game, 'Super Mario 64');
	await assert.rejects(R.decode(code, 'answer'), /invitation/);
	await assert.rejects(R.decode('bonjour', 'offer'), /invalide/);
	await assert.rejects(R.decode(code.slice(0, 40), 'offer'), /incomplet|invalide/);
	const old = await R.encode('offer', { sdp, expires: Date.now() - 1 });
	await assert.rejects(R.decode(old, 'offer'), /expirée/);
	// Manette : A (bouton 0) pressé, stick gauche à droite.
	const st = { b: 1, a: [0.8, 0, 0, 0] };
	assert.equal(R.valueFor(8, 'BUTTON_1', st), 1);
	assert.equal(R.valueFor(0, 'BUTTON_2', st), 0);
	assert.equal(R.valueFor(16, 'LEFT_STICK_X:+1', st), Math.round(0x7fff * 0.8));
	assert.equal(R.valueFor(17, 'LEFT_STICK_X:-1', st), 0);
	assert.equal(R.valueFor(7, 'LEFT_STICK_X:+1', st), 1, 'un stick peut piloter un bouton de direction');
});

test('trophées : paliers de temps de jeu et trophées généraux', () => {
	const M = require('module');
	const load = M._load;
	const settings = {};
	const insts = [
		{ id: 'a', name: 'Jeu A', type: 'rom', rom: { system: 'n64' }, playTimeMs: 65 * 60000 },
		{ id: 'b', name: 'Jeu B', type: 'rom', rom: { system: 'snes' }, playTimeMs: 0 },
	];
	M._load = function (request, ...rest) {
		return /store$/.test(request) ? { getSettings: () => settings, setSettings: p => Object.assign(settings, p), listInstances: () => insts } : load.call(this, request, ...rest);
	};
	let t;
	try { delete require.cache[require.resolve('../src/main/trophies')]; t = require('../src/main/trophies'); } finally { M._load = load; }
	const fresh = t.evaluate();
	const keys = fresh.map(f => f.key);
	assert.ok(keys.includes('a:t10m') && keys.includes('a:t1h'), 'paliers 10 min et 1 h du jeu A');
	assert.ok(!keys.includes('a:t5h'));
	assert.ok(keys.includes('g-first'));
	assert.equal(t.evaluate().length, 0, 'rien de nouveau au second passage');
	// Partie en cours : le jeu B passe 10 min en direct.
	const live = t.evaluate([{ id: 'b', startedAt: Date.now() - 11 * 60000 }]);
	assert.deepEqual(live.map(f => f.key), ['b:t10m']);
	t.noteSession(new Date(2026, 0, 1, 23, 50).getTime(), new Date(2026, 0, 2, 0, 30).getTime());
	assert.ok(t.evaluate().some(f => f.key === 'g-night'), 'oiseau de nuit');
	assert.ok(t.list().points > 0);
});
