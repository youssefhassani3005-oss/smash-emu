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
