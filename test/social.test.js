const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'smash-social-test-'));
os.homedir = () => HOME;

const friends = require('../src/main/friends');
const census = require('../src/main/census');

test('amis : code lisible, tolérant à la saisie, canaux et chiffrement', () => {
	const secret = crypto.randomBytes(15);
	const code = friends.codeOf(secret);
	assert.match(code, /^SMASH-AMI-([0-9A-HJKMNP-TV-Z]{4}-){5}[0-9A-HJKMNP-TV-Z]{4}$/);
	assert.ok(friends.secretOf(code).equals(secret));
	assert.strictEqual(friends.normalize(`  mon code : ${code.toLowerCase().replace(/-/g, ' ')} !`), code);
	assert.strictEqual(friends.normalize('SMASH-AMI-1234'), null);
	const ch = friends.channels(secret);
	assert.match(ch.topic, /^smashemu-[0-9a-f]{24}$/);
	assert.notStrictEqual(ch.topic, ch.inbox);
	const sealed = friends.seal(ch.key, { n: 'Mario', at: 1 });
	assert.deepStrictEqual(friends.unseal(ch.key, sealed), { n: 'Mario', at: 1 });
	assert.strictEqual(friends.unseal(friends.channels(crypto.randomBytes(15)).key, sealed), null);
	assert.strictEqual(friends.statusOf({ st: 'on', at: Date.now(), g: { n: 'MK64' } }), 'playing');
	assert.strictEqual(friends.statusOf({ st: 'on', at: Date.now() - 3600000 }), 'offline');
	assert.strictEqual(friends.statusOf(null), 'unknown');
});

test('communauté : rapport lisible par l’administrateur seul, totaux par jeu et console', () => {
	const admin = crypto.generateKeyPairSync('x25519');
	const raw = admin.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
	const now = Date.now();
	const r1 = { v: 1, id: 'a1b2c3d4e5f60718', ver: '2.7.0', at: now, first: now - 3 * 86400000, m: 600, m1: 60, m7: 200, j: 3, b: 5, sys: [['n64', 400], ['wii', 200]], top: [['Mario Kart 64', 'n64', 300]], emu: ['dolphin'], f: { amis: true } };
	const sealed = census.sealFor(raw, r1);
	assert.deepStrictEqual(census.openWith(admin.privateKey, sealed), r1);
	assert.strictEqual(census.openWith(crypto.generateKeyPairSync('x25519').privateKey, sealed), null);
	const db = {};
	assert.ok(census.ingest(db, r1));
	assert.ok(!census.ingest(db, { ...r1, at: now - 1000 }), 'rapport plus ancien ignoré');
	assert.ok(!census.ingest(db, { ...r1, id: 'pas-un-id' }));
	census.ingest(db, { ...r1, id: 'ffffffffffffffff', at: now - 2 * 86400000, first: now - 30 * 86400000, m: 120, m7: 0, top: [['mario kart 64', 'n64', 100]], sys: [['n64', 120]], emu: ['dolphin', 'pcsx2'], f: {} });
	const s = census.aggregate(db);
	assert.strictEqual(s.players, 2);
	assert.strictEqual(s.active1, 1);
	assert.strictEqual(s.active7, 2);
	assert.strictEqual(s.newWeek, 1);
	assert.strictEqual(s.hours, 12);
	assert.deepStrictEqual([s.games[0].m, s.games[0].p], [400, 2]);
	assert.strictEqual(s.systems[0].id, 'n64');
	assert.deepStrictEqual(s.emulators[0], ['dolphin', 2]);
	assert.strictEqual(s.features.amis, 1);
	assert.strictEqual(s.days.length, 30);
});
