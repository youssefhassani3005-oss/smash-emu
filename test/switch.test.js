const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'smash-switch-test-'));
os.homedir = () => HOME;

const zbic = require('../src/main/zbic');
const switchgame = require('../src/main/switchgame');
const switchkeys = require('../src/main/switchkeys');

// Le décodeur est vérifié sur des trames produites par zlib (Node 22.15 et plus).
const noZstd = !zlib.zstdCompressSync && 'zstd absent de cette version de Node';
const zstd = (data, level = 3) => zlib.zstdCompressSync(data, { params: { [zlib.constants.ZSTD_c_compressionLevel]: level, [zlib.constants.ZSTD_c_checksumFlag]: 1 } });

test('zstd : décompression identique à zlib, à tous les niveaux', { skip: noZstd }, () => {
	const text = Buffer.from('Smash Emu lance aussi les jeux Switch récents. '.repeat(4000));
	const bin = Buffer.alloc(300000);
	for (let i = 0; i < bin.length; i++) bin[i] = ((i * 2654435761) >>> 24) ^ (i >> 7);
	for (const data of [text, bin, crypto.randomBytes(70000), Buffer.alloc(200000), Buffer.from('a')]) {
		for (const level of [1, 3, 9, 19]) assert.ok(zbic.decompress(zstd(data, level)).equals(data), `niveau ${level}, ${data.length} octets`);
	}
	assert.throws(() => zbic.decompress(Buffer.from('pas du zstd du tout')), /nombre magique/);
});

test('ZBIC : ordre de lecture des effectifs cumulés, reconnaissance', () => {
	assert.deepStrictEqual(zbic.bicSteps(4), [[2, 0, 4], [3, 2, 4], [1, 0, 2], [0, 0, 1]]);
	assert.strictEqual(zbic.bicSteps(64).length, 64);
	assert.deepStrictEqual(zbic.bicSteps(64)[0], [32, 0, 64]);
	assert.ok(zbic.isZbic(Buffer.from('ZBIC\x80\x58', 'latin1')));
	assert.ok(!zbic.isZbic(Buffer.from([0x28, 0xb5, 0x2f, 0xfd])));
});

test('NSO : segments compressés → exécutable non compressé, empreintes vérifiées', { skip: noZstd }, () => {
	const segs = [Buffer.alloc(5000, 1), Buffer.from('lecture seule '.repeat(300)), Buffer.alloc(800, 7)];
	const name = Buffer.from('main\0');
	const packed = segs.map(s => zstd(s));
	const head = Buffer.alloc(0x100);
	head.write('NSO0', 0, 'latin1');
	head.writeUInt32LE(0xbf, 0xc);
	head.writeUInt32LE(0x100, 0x1c);
	head.writeUInt32LE(name.length, 0x2c);
	let off = 0x100 + name.length;
	packed.forEach((p, s) => {
		head.writeUInt32LE(off, 0x10 + s * 0x10);
		head.writeUInt32LE(s * 0x10000, 0x14 + s * 0x10);
		head.writeUInt32LE(segs[s].length, 0x18 + s * 0x10);
		head.writeUInt32LE(p.length, 0x60 + s * 4);
		crypto.createHash('sha256').update(segs[s]).digest().copy(head, 0xa0 + s * 0x20);
		off += p.length;
	});
	const nso = Buffer.concat([head, name, ...packed]);
	const out = switchgame.unpackNso(nso);
	assert.strictEqual(out.readUInt32LE(0xc), 0x38);
	assert.ok(out.subarray(0x100, 0x105).equals(name));
	segs.forEach((s, i) => {
		const at = out.readUInt32LE(0x10 + i * 0x10);
		assert.ok(out.subarray(at, at + s.length).equals(s));
		assert.strictEqual(out.readUInt32LE(0x60 + i * 4), s.length);
	});
	nso[0xa0] ^= 1;
	assert.throws(() => switchgame.unpackNso(nso), /illisible/);
});

test('NCA : AES-XTS refait à partir d’ECB, identique à celui de Node', () => {
	const key = crypto.randomBytes(32);
	for (const sector of [0, 1, 5, 300]) {
		const plain = crypto.randomBytes(0x200);
		const tweak = Buffer.alloc(16);
		tweak.writeBigUInt64BE(BigInt(sector), 8);
		const c = crypto.createCipheriv('aes-128-xts', key, tweak);
		const enc = Buffer.concat([c.update(plain), c.final()]);
		assert.ok(switchgame.xtsDecrypt(key, sector, enc).equals(plain), `secteur ${sector}`);
	}
});

test('Switch : avertissement pour les jeux trop récents', () => {
	assert.match(switchgame.notice({ sdk: '22.2.0', zbic: true }, 'citron', false), /firmware 22.*ZBIC.*Installe Eden/);
	assert.match(switchgame.notice({ sdk: '22.2.0', zbic: true }, 'eden', true), /firmware 22/);
	assert.match(switchgame.notice({ sdk: '21.0.0' }, 'citron', true), /Choisis Eden/);
	assert.strictEqual(switchgame.notice({ sdk: '21.0.0' }, 'eden', true), null);
	assert.strictEqual(switchgame.notice({ sdk: '18.1.0' }, 'citron', false), null);
	assert.deepStrictEqual(switchgame.prepare(path.join(HOME, 'homebrew.nro'), { userDir: HOME, keyFiles: [] }), { zbic: false });
});

test('Citron, Eden : mode TV et mémoire de 4 Go réglés automatiquement', () => {
	const dir = path.join(HOME, 'AppData', 'Roaming', 'eden', 'config');
	process.env.APPDATA = path.join(HOME, 'AppData', 'Roaming');
	fs.mkdirSync(dir, { recursive: true });
	const ini = path.join(dir, 'qt-config.ini');
	fs.writeFileSync(ini, '[Controls]\nplayer_0_type=0\nplayer_0_button_a="engine:sdl,button:0,port:0"\n[Core]\nmemory_layout_mode\\default=false\nmemory_layout_mode=2\n[System]\nuse_docked_mode\\default=false\nuse_docked_mode=0\n');
	const sk = require('../src/main/switchkeys');
	if (sk.yuzuUserDir('eden') !== path.dirname(dir)) return; // dossier de l'émulateur détecté ailleurs sur ce PC
	assert.strictEqual(sk.yuzuDocked('eden'), true);
	assert.match(fs.readFileSync(ini, 'utf8'), /^use_docked_mode=1$/m);
	assert.strictEqual(sk.yuzuDocked('eden'), false);
	sk.setGpu([{ vendorId: 0x8086 }, { vendorId: 0x10de }]);
	assert.strictEqual(sk.yuzuQuality('eden'), true);
	const r = fs.readFileSync(ini, 'utf8');
	assert.match(r, /^resolution_setup=6$/m);
	assert.match(r, /^scaling_filter=6$/m);
	assert.match(r, /^anti_aliasing=2$/m);
	assert.strictEqual(sk.yuzuQuality('eden'), false, 'réglages déjà choisis : rien n’est changé');
	const msg = sk.yuzuMemory('eden');
	if (require('os').totalmem() < 24 * 1024 ** 3) { assert.match(msg, /4 Go/); assert.match(fs.readFileSync(ini, 'utf8'), /^memory_layout_mode=0$/m); }
});

test('Citron, Eden : réglage Qt écrit avec sa clé « default »', () => {
	const ini = path.join(HOME, 'qt-config.ini');
	fs.writeFileSync(ini, '[Renderer]\r\nbackend=1\r\n[UI]\r\nsingleWindowMode\\default=true\r\nsingleWindowMode=true\r\nfullscreen=false\r\n[WebService]\r\nx=1\r\n');
	switchkeys.setQtIni(ini, 'UI', { singleWindowMode: false, confirmClose: false });
	assert.strictEqual(fs.readFileSync(ini, 'utf8'), '[Renderer]\r\nbackend=1\r\n[UI]\r\nsingleWindowMode\\default=false\r\nsingleWindowMode=false\r\nfullscreen=false\r\nconfirmClose\\default=false\r\nconfirmClose=false\r\n[WebService]\r\nx=1\r\n');
	const fresh = path.join(HOME, 'neuf', 'config', 'qt-config.ini');
	switchkeys.setQtIni(fresh, 'UI', { singleWindowMode: true });
	assert.strictEqual(fs.readFileSync(fresh, 'utf8'), '[UI]\nsingleWindowMode\\default=false\nsingleWindowMode=true');
});

test('Citron, Eden : étapes du démarrage lues dans le journal', () => {
	const log = [
		'[   0.728737] Frontend <Info> yuzu/main_window.cpp:1892:BootGame: Eden starting...',
		'[   1.224607] Core <Info> core/core.cpp:351:Load: Loading Jeu (0100000000010000) ...',
		'[   1.765822] Render.Vulkan <Info> video_core/renderer_vulkan/renderer_vulkan.cpp:265:Report: Device: GPU',
	].join('\n');
	assert.deepStrictEqual(switchkeys.logStage(log), { pct: 45, label: 'Carte graphique prête' });
	const more = `${log}\n[   2.231976] Render.Vulkan <Info> video_core/renderer_vulkan/vk_pipeline_cache.cpp:715:LoadDiskResources: Total Pipeline Count: 602`;
	assert.deepStrictEqual(switchkeys.logStage(more), { pct: 72, label: 'Chargement des graphismes (602 shaders)' });
	assert.strictEqual(switchkeys.logStage('[   0.1] Frontend <Info> rien'), null);
	assert.strictEqual(switchkeys.logStartedAt(log, 10000), 10000 - 1765.822);
	// Ancien journal (lancement précédent) : ignoré.
	const dir = path.join(HOME, 'AppData', 'Roaming', 'eden', 'log');
	process.env.APPDATA = path.join(HOME, 'AppData', 'Roaming');
	if (switchkeys.yuzuUserDir('eden') !== path.dirname(dir)) return;
	fs.mkdirSync(dir, { recursive: true });
	const file = path.join(dir, 'eden_log.txt');
	fs.writeFileSync(file, log);
	const now = Date.now();
	fs.utimesSync(file, new Date(now - 600000), new Date(now - 600000));
	assert.strictEqual(switchkeys.yuzuStage('eden', now - 1000), null);
	fs.utimesSync(file, new Date(now), new Date(now));
	assert.strictEqual(switchkeys.yuzuStage('eden', now - 1000).pct, 45);
	assert.strictEqual(switchkeys.yuzuStage('eden', now + 60000), null);
});
