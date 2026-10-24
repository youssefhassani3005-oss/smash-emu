const test = require('node:test');
const assert = require('node:assert');

const rooms = require('../src/main/rooms');
const SmashRemote = require('../src/emu/remote-common.js');

test('Jeu à distance : code de salon court, normalisé et sans caractères ambigus', () => {
	for (let i = 0; i < 50; i++) {
		const c = rooms.newCode();
		assert.match(c, /^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
		assert.ok(![...c.replace('-', '')].some(ch => 'OIL01'.includes(ch)));
		assert.strictEqual(rooms.normalize(c.toLowerCase().replace('-', ' ')), c);
	}
	assert.strictEqual(rooms.normalize('k7m2qx'), 'K7M-2QX');
	assert.strictEqual(rooms.normalize('K7M-2Q'), null);
	assert.strictEqual(rooms.normalize('O0O-111'), null);
	assert.notStrictEqual(rooms.channel('K7M-2QX').topic, rooms.channel('K7M-2QY').topic);
});

test('Jeu à distance : messages du salon chiffrés, compressés et assez courts pour le relais', () => {
	const { key } = rooms.channel('K7M-2QX');
	const sdp = `v=0\r\n${'a=candidate:1 1 udp 2122260223 192.168.1.20 54321 typ host generation 0\r\n'.repeat(20)}${'a=rtpmap:96 VP8/90000\r\na=rtcp-fb:96 nack\r\n'.repeat(30)}`;
	const sealed = rooms.seal(key, { t: 'offer', gid: 'abcdef0123456789', sdp });
	assert.ok(sealed.length < 3900, `message de ${sealed.length} caractères`);
	assert.deepStrictEqual(rooms.unseal(key, sealed), { t: 'offer', gid: 'abcdef0123456789', sdp });
	assert.strictEqual(rooms.unseal(rooms.channel('AAA-BBB').key, sealed), null, 'mauvais code : illisible');
});

test('Jeu à distance : débit de départ ajouté aux codecs vidéo seulement', () => {
	const sdp = 'm=video 9 UDP/TLS/RTP/SAVPF 96 102\r\na=rtpmap:96 VP8/90000\r\na=rtpmap:102 H264/90000\r\na=fmtp:102 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;useinbandfec=1\r\n';
	const out = SmashRemote.boostStart(sdp, 3000);
	assert.match(out, /a=fmtp:96 x-google-start-bitrate=3000;x-google-min-bitrate=800/);
	assert.match(out, /a=fmtp:102 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f;x-google-start-bitrate=3000/);
	assert.match(out, /a=fmtp:111 minptime=10;useinbandfec=1\r\n/);
	assert.strictEqual(SmashRemote.boostStart(out, 3000), out, 'pas ajouté deux fois');
});
