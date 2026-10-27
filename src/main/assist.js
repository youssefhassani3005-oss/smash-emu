// « Indices et succès » dans les fenêtres de jeu (lecteur intégré et émulateurs externes) : chaque fenêtre retrouve
// son jeu, pose ses questions à l'assistant d'indices (réponse envoyée au fil de l'eau) et suit ses succès
// RetroAchievements. Un succès débloqué rapporte des pièces Smash et une notification.
const { ipcMain, nativeImage } = require('electron');
const store = require('./store');
const systems = require('./systems');
const hints = require('./hints');
const retro = require('./retro');

const COINS_PER_ACHIEVEMENT = 10;

// Jeu de la fenêtre qui appelle : lecteur intégré ou émulateur externe.
const gameOf = (senderId) => {
	const s = require('./emu').sessionOf(senderId);
	const h = !s && require('./external').hostOf(senderId);
	const x = s || h;
	if (!x) throw new Error('Fenêtre de jeu inconnue.');
	return { id: x.id, kind: s ? 'emu' : 'ext', system: (x.plan && x.plan.system) || 'n64', emulator: x.plan && x.plan.emulator };
};

// Image envoyée à l'assistant : JPEG de 1024 px de large au plus.
const toJpeg = (buf) => {
	if (!buf || !buf.length) return null;
	let img = nativeImage.createFromBuffer(Buffer.from(buf));
	if (img.isEmpty()) return null;
	if (img.getSize().width > 1024) img = img.resize({ width: 1024, quality: 'good' });
	return img.toJPEG(80).toString('base64');
};

const HANDLERS = {
	'assist:info': (e) => {
		const g = gameOf(e.sender.id);
		const inst = store.getInstance(g.id);
		return {
			hints: hints.config(), ra: retro.config(), raSupported: retro.supported(retro.systemOf(inst)),
			game: { name: inst.name, console: (systems.SYSTEMS[g.system] || {}).label || '' }, talking: hints.has(g.id),
		};
	},
	// image : octets PNG fournis par le lecteur intégré ; pour un émulateur externe, Smash Emu capture lui-même.
	'assist:ask': async (e, { text, level, image, withImage = true } = {}) => {
		const g = gameOf(e.sender.id);
		const inst = store.getInstance(g.id);
		let jpeg = null;
		if (withImage) {
			try { jpeg = toJpeg(g.kind === 'ext' ? await require('./external').grabFrame(e.sender.id) : image); } catch { /* question posée sans image */ }
		}
		const info = (inst.rom && inst.rom.info) || {};
		const extra = [inst.raGame && `Jeu RetroAchievements : ${inst.raGame.title}`, info.known && info.known !== inst.name && `Titre exact : ${info.known}`].filter(Boolean).join('. ');
		const sender = e.sender;
		return hints.ask(g.id, {
			text, level, image: jpeg,
			game: { name: inst.type === 'coopdx' ? 'Super Mario 64 (sm64coopdx, version PC multijoueur)' : inst.name, console: (systems.SYSTEMS[g.system] || {}).label || '', extra },
		}, (d) => { if (!sender.isDestroyed()) sender.send('assist:delta', d); });
	},
	'assist:reset': (e) => { hints.reset(gameOf(e.sender.id).id); return true; },
	'assist:progress': async (e) => retro.progress(gameOf(e.sender.id).id),
	'assist:poll': async (e) => {
		const g = gameOf(e.sender.id);
		const fresh = await retro.poll(g.id);
		if (fresh.length) {
			const coins = require('./coins');
			const notifications = require('./notifications');
			for (const a of fresh) {
				try { coins.earn(COINS_PER_ACHIEVEMENT, `Succès RetroAchievements : ${a.title}`); } catch { /* pièces indisponibles */ }
				try { notifications.push({ kind: 'achievement', title: `Succès débloqué : ${a.title}`, text: `${a.desc} (${a.points} points)` }); } catch { /* centre de notifications indisponible */ }
			}
		}
		return fresh;
	},
};

const registerIpc = () => {
	for (const [channel, fn] of Object.entries(HANDLERS)) {
		ipcMain.handle(channel, async (event, ...args) => {
			try { return { ok: true, value: await fn(event, ...args) }; } catch (error) { return { ok: false, error: error.message }; }
		});
	}
};

module.exports = { registerIpc, toJpeg, COINS_PER_ACHIEVEMENT };
