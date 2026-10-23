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

test('Citron, Eden : réglage Qt écrit avec sa clé « default »', () => {
	const ini = path.join(HOME, 'qt-config.ini');
	fs.writeFileSync(ini, '[Renderer]\r\nbackend=1\r\n[UI]\r\nsingleWindowMode\\default=true\r\nsingleWindowMode=true\r\nfullscreen=false\r\n[WebService]\r\nx=1\r\n');
	switchkeys.setQtIni(ini, 'UI', { singleWindowMode: false, confirmClose: false });
	assert.strictEqual(fs.readFileSync(ini, 'utf8'), '[Renderer]\r\nbackend=1\r\n[UI]\r\nsingleWindowMode\\default=false\r\nsingleWindowMode=false\r\nfullscreen=false\r\nconfirmClose\\default=false\r\nconfirmClose=false\r\n[WebService]\r\nx=1\r\n');
	const fresh = path.join(HOME, 'neuf', 'config', 'qt-config.ini');
	switchkeys.setQtIni(fresh, 'UI', { singleWindowMode: true });
	assert.strictEqual(fs.readFileSync(fresh, 'utf8'), '[UI]\nsingleWindowMode\\default=false\nsingleWindowMode=true');
});
