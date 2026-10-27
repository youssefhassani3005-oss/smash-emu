const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'smash-assist-test-'));
os.homedir = () => HOME;

const store = require('../src/main/store');
const retro = require('../src/main/retro');
const hints = require('../src/main/hints');

const md5 = b => crypto.createHash('md5').update(b).digest('hex');
const write = (name, buf) => { const f = path.join(HOME, name); fs.writeFileSync(f, buf); return f; };

test('empreintes RetroAchievements : N64 dans les trois ordres d’octets', () => {
	const z64 = Buffer.alloc(64);
	Buffer.from([0x80, 0x37, 0x12, 0x40]).copy(z64);
	for (let i = 4; i < 64; i++) z64[i] = i * 7;
	const v64 = Buffer.from(z64);
	for (let i = 0; i < 64; i += 2) { v64[i] = z64[i + 1]; v64[i + 1] = z64[i]; }
	const n64 = Buffer.from(z64);
	for (let i = 0; i < 64; i += 4) { n64[i] = z64[i + 3]; n64[i + 1] = z64[i + 2]; n64[i + 2] = z64[i + 1]; n64[i + 3] = z64[i]; }
	const want = md5(z64);
	assert.strictEqual(retro.hashFile('n64', write('a.z64', z64)), want);
	assert.strictEqual(retro.hashFile('n64', write('a.v64', v64)), want);
	assert.strictEqual(retro.hashFile('n64', write('a.n64', n64)), want);
});

test('empreintes RetroAchievements : en-têtes ignorés (NES, SNES, Atari 7800, Lynx, PC Engine)', () => {
	const rom = crypto.randomBytes(8192 * 2);
	assert.strictEqual(retro.hashFile('nes', write('a.nes', Buffer.concat([Buffer.from('NES\x1a'), Buffer.alloc(12), rom]))), md5(rom));
	assert.strictEqual(retro.hashFile('nes', write('b.nes', rom)), md5(rom));
	assert.strictEqual(retro.hashFile('snes', write('a.smc', Buffer.concat([Buffer.alloc(512), rom]))), md5(rom));
	assert.strictEqual(retro.hashFile('snes', write('b.sfc', rom)), md5(rom));
	const h78 = Buffer.alloc(128); h78[0] = 1; Buffer.from('ATARI7800').copy(h78, 1);
	assert.strictEqual(retro.hashFile('a7800', write('a.a78', Buffer.concat([h78, rom]))), md5(rom));
	const lynx = Buffer.alloc(64); Buffer.from('LYNX\0').copy(lynx);
	assert.strictEqual(retro.hashFile('lynx', write('a.lnx', Buffer.concat([lynx, rom]))), md5(rom));
	const pce = crypto.randomBytes(131072);
	assert.strictEqual(retro.hashFile('pce', write('a.pce', Buffer.concat([Buffer.alloc(512), pce]))), md5(pce));
	assert.strictEqual(retro.hashFile('gba', write('a.gba', rom)), md5(rom));
	assert.strictEqual(retro.hashFile('psx', write('a.bin', rom)), null, 'disques : pas d’empreinte de fichier');
	assert.strictEqual(retro.hashFile('switch', write('a.nsp', rom)), null);
});

test('empreinte Nintendo DS : en-tête, ARM9, ARM7 et icône', () => {
	const rom = Buffer.alloc(0x8000);
	crypto.randomBytes(0x8000).copy(rom);
	const set = (o, v) => rom.writeUInt32LE(v, o);
	set(0x20, 0x1000); set(0x2c, 0x800); set(0x30, 0x2000); set(0x3c, 0x400); set(0x68, 0x3000);
	const want = md5(Buffer.concat([rom.subarray(0, 0x160), rom.subarray(0x1000, 0x1800), rom.subarray(0x2000, 0x2400), rom.subarray(0x3000, 0x3a00)]));
	assert.strictEqual(retro.hashFile('nds', write('a.nds', rom)), want);
});

test('titres comparés sans région ni article', () => {
	assert.strictEqual(retro.norm('The Legend of Zelda: Ocarina of Time (Europe) (En,Fr,De)'), retro.norm('Legend of Zelda, The - Ocarina of Time'));
	assert.ok(retro.similarity('Super Mario 64 (USA)', 'Super Mario 64') === 1);
	assert.ok(retro.similarity('Mario Kart 64', 'Super Mario 64') < 1);
});

test('reconnaissance : par empreinte, puis par titre identique, sinon candidats', async () => {
	store.ensureDirs();
	const rom = crypto.randomBytes(4096);
	const gbFile = write('Tetris.gb', rom);
	const a = store.createInstance({ name: 'Tetris', type: 'rom' });
	store.updateInstance(a.id, { rom: { system: 'gb', linked: gbFile } });
	const b = store.createInstance({ name: 'Super Mario Land (World)', type: 'rom' });
	store.updateInstance(b.id, { rom: { system: 'gb', linked: write('sml.gb', crypto.randomBytes(100)) } });
	const c = store.createInstance({ name: 'Jeu inconnu', type: 'rom' });
	store.updateInstance(c.id, { rom: { system: 'gb', linked: write('x.gb', crypto.randomBytes(100)) } });
	await retro.setConfig({ user: 'Joueur', key: 'ABCDEFGHIJKLMNOPQRSTUVWX12345678' });
	const calls = [];
	retro.setFetch(async (url) => {
		calls.push(url);
		const u = new URL(url);
		if (u.pathname.endsWith('API_GetGameList.php')) {
			return { ok: true, status: 200, json: async () => [
				{ ID: 1, Title: 'Tetris', ImageIcon: '/Images/1.png', NumAchievements: 20, Points: 200, Hashes: [md5(rom).toUpperCase()] },
				{ ID: 2, Title: 'Super Mario Land', ImageIcon: '/Images/2.png', NumAchievements: 30, Points: 300, Hashes: ['00'] },
				{ ID: 3, Title: 'Super Mario Land 2: 6 Golden Coins', ImageIcon: '/Images/3.png', NumAchievements: 40, Points: 400, Hashes: [] },
			] };
		}
		if (u.pathname.endsWith('API_GetGameInfoAndUserProgress.php')) {
			assert.strictEqual(u.searchParams.get('u'), 'Joueur');
			return { ok: true, status: 200, json: async () => ({ ID: 1, Title: 'Tetris', ConsoleName: 'Game Boy', ImageIcon: '/Images/1.png', UserCompletion: '50%', Achievements: {
				10: { ID: 10, Title: 'Première ligne', Description: 'Fais une ligne', Points: 5, BadgeName: '111', DisplayOrder: 1, DateEarned: '2026-01-01 10:00:00' },
				11: { ID: 11, Title: 'Tetris !', Description: 'Fais 4 lignes d’un coup', Points: 10, BadgeName: '112', DisplayOrder: 2 },
			} }) };
		}
		return { ok: false, status: 404, json: async () => ({}) };
	});
	const la = await retro.identify(a.id);
	assert.deepStrictEqual([la.id, la.by], [1, 'hash']);
	const lb = await retro.identify(b.id);
	assert.deepStrictEqual([lb.id, lb.by], [2, 'title']);
	assert.strictEqual(await retro.identify(c.id), null);
	const cands = await retro.candidates(store.getInstance(c.id), 'Mario Land');
	assert.deepStrictEqual(cands.slice(0, 2).map(x => x.id).sort(), [2, 3]);
	assert.strictEqual(calls.filter(u => u.includes('GetGameList')).length, 1, 'liste des jeux gardée en cache');
	assert.ok(calls.every(u => u.includes('y=ABCDEFGHIJKLMNOPQRSTUVWX12345678')));

	const p = await retro.progress(a.id);
	assert.deepStrictEqual([p.total, p.earned, p.points, p.myPoints], [2, 1, 15, 5]);
	assert.strictEqual(p.achievements[0].badge, 'https://media.retroachievements.org/Badge/111.png');
	assert.strictEqual(p.achievements[1].locked, 'https://media.retroachievements.org/Badge/112_lock.png');
	// Premier passage : référence ; ensuite seuls les nouveaux succès sont signalés.
	assert.deepStrictEqual(await retro.poll(a.id), []);
	assert.deepStrictEqual(await retro.poll(a.id), []);
	await retro.link(c.id, 3);
	assert.strictEqual(store.getInstance(c.id).raGame.title, 'Super Mario Land 2: 6 Golden Coins');
});

test('RetroArch : réglages remplacés ou ajoutés, cœur choisi selon la console', () => {
	const emuinstall = require('../src/main/emuinstall');
	const emulators = require('../src/main/emulators');
	const dir = path.join(HOME, 'RetroArch-Win64');
	fs.mkdirSync(dir, { recursive: true });
	const exe = path.join(dir, 'retroarch.exe');
	fs.writeFileSync(exe, '');
	fs.writeFileSync(path.join(dir, 'retroarch.cfg'), 'video_driver = "glcore"\ncheevos_enable = "false"\nmenu_driver = "ozone"\n');
	emuinstall.setRetroArchCfg(exe, { cheevos_enable: 'true', cheevos_username: 'Joueur', video_driver: 'vulkan' });
	const cfg = fs.readFileSync(path.join(dir, 'retroarch.cfg'), 'utf8');
	assert.match(cfg, /^video_driver = "vulkan"$/m);
	assert.match(cfg, /^cheevos_enable = "true"$/m);
	assert.match(cfg, /^cheevos_username = "Joueur"$/m);
	assert.match(cfg, /^menu_driver = "ozone"$/m);
	assert.strictEqual(cfg.match(/^video_driver/gm).length, 1);
	store.setSettings({ emulators: { retroarch: exe } });
	assert.strictEqual(emulators.retroarchCore('n64'), path.join(dir, 'cores', 'mupen64plus_next_libretro.dll'));
	assert.strictEqual(emulators.retroarchCore('switch'), null);
	assert.throws(() => emulators.EXTERNAL.retroarch.args('jeu.z64', { system: 'n64', embed: true }), /Cœur RetroArch manquant/);
	fs.mkdirSync(path.join(dir, 'cores'));
	fs.writeFileSync(path.join(dir, 'cores', 'mupen64plus_next_libretro.dll'), '');
	assert.deepStrictEqual(emulators.EXTERNAL.retroarch.args('jeu.z64', { system: 'n64', embed: true }), ['-L', path.join(dir, 'cores', 'mupen64plus_next_libretro.dll'), 'jeu.z64']);
	assert.ok(require('../src/main/systems').enginesFor('gba').includes('retroarch'));
});

// Faux client : chaque appel à stream() rejoue la réponse suivante de la liste.
const fakeClient = (responses, seen) => ({
	beta: { messages: { stream: (params) => {
		seen.push(JSON.parse(JSON.stringify(params)));
		const r = responses.shift();
		const handlers = {};
		return {
			on(ev, fn) { handlers[ev] = fn; return this; },
			async finalMessage() {
				if (r instanceof Error) throw r;
				for (const b of r.content) if (b.type === 'text') handlers.text && handlers.text(b.text);
				return r;
			},
		};
	} } },
});

test('assistant d’indices : reprise après pause, sources, coût, conversation suivie', async () => {
	assert.throws(() => hints.setConfig({ key: 'pas-une-cle' }), /sk-ant-/);
	hints.setConfig({ key: `sk-ant-api03-${'x'.repeat(40)}` });
	assert.strictEqual(hints.config().model, 'claude-opus-5-5');
	const seen = [];
	const usage = { input_tokens: 1000, output_tokens: 200, server_tool_use: { web_search_requests: 1 } };
	const client = fakeClient([
		{ stop_reason: 'pause_turn', usage, content: [{ type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'zelda temple' } }] },
		{ stop_reason: 'end_turn', usage: { input_tokens: 500, output_tokens: 100 }, content: [{ type: 'text', text: 'Regarde derrière la cascade.', citations: [{ type: 'web_search_result_location', url: 'https://zelda.fandom.com/wiki/Temple', title: 'Temple' }] }] },
	], seen);
	const deltas = [];
	const r = await hints.ask('jeu-1', { text: 'Où est la clé ?', level: 2, image: 'AAAA', game: { name: 'Zelda', console: 'Nintendo 64' } }, d => deltas.push(d), { client });
	assert.strictEqual(r.text, 'Regarde derrière la cascade.');
	assert.deepStrictEqual(r.sources, [{ url: 'https://zelda.fandom.com/wiki/Temple', title: 'Temple' }]);
	assert.ok(r.cost > 0.01 && r.cost < 0.05, `coût ${r.cost}`);
	assert.deepStrictEqual(deltas, ['Regarde derrière la cascade.']);
	const first = seen[0];
	assert.strictEqual(first.model, 'claude-opus-5-5');
	assert.deepStrictEqual(first.tools, [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }]);
	assert.strictEqual(first.fallbacks, 'default');
	assert.deepStrictEqual(first.betas, ['server-side-fallback-2026-07-01']);
	assert.strictEqual(first.thinking, undefined, 'Opus 5.5 : réflexion adaptative par défaut');
	assert.strictEqual(first.messages[0].content[0].type, 'image');
	assert.match(first.messages[0].content[1].text, /Jeu : Zelda \(console : Nintendo 64\)/);
	assert.match(first.messages[0].content[1].text, /Indice précis/);
	// Reprise : le tour en pause est renvoyé tel quel, sans message « continue ».
	assert.strictEqual(seen[1].messages.length, 2);
	assert.strictEqual(seen[1].messages[1].role, 'assistant');
	assert.ok(hints.has('jeu-1'));

	// Deuxième question : l'historique est repris, sans répéter le nom du jeu.
	const client2 = fakeClient([{ stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'Oui.' }] }], seen);
	await hints.ask('jeu-1', { text: 'Et ensuite ?', level: 1 }, () => {}, { client: client2 });
	const third = seen[2];
	assert.strictEqual(third.messages.length, 4);
	assert.doesNotMatch(third.messages[3].content[0].text, /^Jeu :/);

	// Erreur : la question sans réponse est retirée, la conversation reste valable.
	const err = Object.assign(new Error('boom'), {});
	await assert.rejects(hints.ask('jeu-1', { text: 'Encore ?' }, () => {}, { client: fakeClient([err], seen) }), /boom/);
	assert.strictEqual(seen.length, 4);
	const client3 = fakeClient([{ stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'Ok.' }] }], seen);
	await hints.ask('jeu-1', { text: 'Encore ?' }, () => {}, { client: client3 });
	assert.strictEqual(seen[4].messages.length, 6, 'pas de question orpheline dans l’historique');

	// Refus : réponse polie, historique intact.
	const r4 = await hints.ask('jeu-1', { text: 'X' }, () => {}, { client: fakeClient([{ stop_reason: 'refusal', usage, content: [] }], seen) });
	assert.match(r4.text, /ne peux pas/);
	hints.reset('jeu-1');
	assert.ok(!hints.has('jeu-1'));

	// Haiku : recherche web de base, sans repli serveur.
	hints.setConfig({ model: 'claude-haiku-5-5' });
	await hints.ask('jeu-2', { text: 'Salut' }, () => {}, { client: fakeClient([{ stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'Salut !' }] }], seen) });
	const last = seen[seen.length - 1];
	assert.strictEqual(last.tools[0].type, 'web_search_20250305');
	assert.strictEqual(last.fallbacks, undefined);
	assert.ok(store.getSettings().hintsSpent > 0);
});
