/* global SmashRemote, smashRemote, ICONS, SmashLogo */
// Jeu à distance — côté invité : reçoit l'image et le son du jeu de l'hôte, envoie sa manette et son clavier.

const $ = s => document.querySelector(s);
const icon = n => `<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));

const G = { pc: null, input: null, ctl: null, invite: null, slot: null, seq: 0, last: '', lastSent: 0, mic: null, micOn: false, ptt: false, pttDown: false, stats: {}, prev: {}, appRtt: null, voice: null, game: null, chat: [], name: '' };

const toast = (html, error = false, ms = 3000) => {
	const el = document.createElement('div');
	el.className = `toast ${error ? 'error' : ''}`;
	el.innerHTML = `${icon(error ? 'circle-x' : 'check')}<span>${html}</span>`;
	$('#toasts').appendChild(el);
	setTimeout(() => el.remove(), ms);
};
const message = (html) => { const m = $('#msg'); m.innerHTML = html; m.classList.toggle('hidden', !html); };

// ---------- Rejoindre ----------

const join = async () => {
	$('#err1').textContent = '';
	try {
		const offer = await SmashRemote.decode($('#offer').value, 'offer');
		G.invite = offer;
		G.name = ($('#name').value.trim() || 'Invité').slice(0, 24);
		smashRemote.setName(G.name).catch(() => {});
		const pc = new RTCPeerConnection({ iceServers: SmashRemote.ICE });
		G.pc = pc;
		pc.ontrack = (e) => {
			const [video, gameAudio, voice] = pc.getTransceivers();
			if (e.transceiver === video) {
				$('#video').srcObject = new MediaStream([e.track]);
				try { e.receiver.playoutDelayHint = 0; } catch { /* non pris en charge */ }
			} else if (e.transceiver === gameAudio) {
				G.game = new Audio(); G.game.srcObject = new MediaStream([e.track]); G.game.play().catch(() => {});
				try { e.receiver.playoutDelayHint = 0; } catch { /* */ }
			} else if (e.transceiver === voice) {
				G.voice = new Audio(); G.voice.srcObject = new MediaStream([e.track]); G.voice.play().catch(() => {});
			}
		};
		pc.ondatachannel = (e) => {
			if (e.channel.label === 'input') G.input = e.channel;
			if (e.channel.label === 'ctl') {
				G.ctl = e.channel;
				G.ctl.onopen = () => { sendCtl({ t: 'hello', name: G.name }); announcePad(); };
				G.ctl.onmessage = ev => onCtl(ev.data);
			}
		};
		pc.onconnectionstatechange = () => {
			const s = pc.connectionState;
			if (s === 'connected') { document.body.classList.add('playing'); message(''); $('#conn').classList.remove('hidden'); smashRemote.addRecent({ game: offer.game, host: offer.host }).catch(() => {}); }
			if (s === 'failed') message('<b>Connexion impossible ou perdue.</b><br>La connexion directe a échoué : réseau trop strict (4G, réseau d’entreprise…) ou coupure. Demande un nouveau code à l’hôte, ou essayez une autre connexion.');
			if (s === 'disconnected') message('Connexion instable… reconnexion en cours.');
		};
		await pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
		// Voix dans les deux sens : le micro pourra être branché plus tard sans renégocier.
		const voiceTx = pc.getTransceivers()[2];
		if (voiceTx) voiceTx.direction = 'sendrecv';
		await pc.setLocalDescription(await pc.createAnswer());
		await SmashRemote.gathered(pc);
		const code = await SmashRemote.encode('answer', { sdp: pc.localDescription.sdp, name: G.name });
		$('#answer').value = code;
		$('#invite-info').innerHTML = `<b>${esc(offer.host)}</b> t’invite à jouer à <b>${esc(offer.game)}</b>${offer.system ? ` (${esc(offer.system)})` : ''} · place proposée : joueur ${esc(offer.slot)}`;
		$('#game-name').textContent = offer.game;
		$('#game-sub').textContent = `CHEZ ${String(offer.host).toUpperCase()}`;
		$('#step1').classList.add('hidden');
		$('#step2').classList.remove('hidden');
		setTimeout(() => { if (G.pc && G.pc.connectionState !== 'connected') $('#wait').textContent = 'Toujours en attente… vérifie que l’hôte a bien collé ta réponse.'; }, 60000);
	} catch (e) {
		$('#err1').textContent = e.message;
	}
};

// ---------- Messages de l'hôte ----------

const sendCtl = (m) => { try { if (G.ctl && G.ctl.readyState === 'open') G.ctl.send(JSON.stringify(m)); } catch { /* */ } };

const onCtl = (raw) => {
	let m;
	try { m = JSON.parse(raw); } catch { return; }
	if (m.t === 'welcome') { G.slot = m.slot; toast(`Tu es le joueur ${esc(m.slot)} dans ${esc(m.game)}`); }
	if (m.t === 'pong') G.appRtt = Math.round(performance.now() - m.ts);
	if (m.t === 'chat') addChat(m.from, m.text);
	if (m.t === 'bye') { message(`<b>Partie terminée.</b><br>${esc(m.reason || 'L’hôte a fermé la session.')}`); try { G.pc.close(); } catch { /* */ } }
};

const addChat = (from, text) => {
	G.chat.push({ from, text });
	if (G.chat.length > 80) G.chat.shift();
	$('#chat-log').innerHTML = G.chat.map(c => `<div><b>${esc(c.from)}</b> ${esc(c.text)}</div>`).join('');
	$('#chat-log').scrollTop = 1e9;
	if ($('#chat').classList.contains('hidden')) toast(`<b>${esc(from)}</b> ${esc(text)}`, false, 4000);
};

// ---------- Manette et clavier → hôte ----------

const pickPad = () => Array.from(navigator.getGamepads ? navigator.getGamepads() : []).find(Boolean) || null;
const announcePad = () => { const p = pickPad(); sendCtl({ t: 'pads', name: p ? p.id.replace(/\s*\(.*$/, '') : 'Clavier' }); };
window.addEventListener('gamepadconnected', () => { announcePad(); toast('Manette détectée'); });

const padLoop = () => {
	const p = pickPad();
	if (p && G.input && G.input.readyState === 'open') {
		const state = SmashRemote.padState(p);
		const key = `${state.b}|${state.a.join(',')}`;
		const now = performance.now();
		// Envoi à chaque changement, et toutes les 150 ms (le canal ne renvoie pas les paquets perdus).
		if (key !== G.last || now - G.lastSent > 150) {
			G.last = key;
			G.lastSent = now;
			G.input.send(JSON.stringify({ t: 'pad', s: ++G.seq, st: state }));
		}
	}
	requestAnimationFrame(padLoop);
};
requestAnimationFrame(padLoop);

const typing = () => document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
const held = new Set();
window.addEventListener('keydown', (e) => {
	if (e.key === 'F11') { e.preventDefault(); smashRemote.window('fullscreen'); return; }
	if (!document.body.classList.contains('playing')) return;
	if (e.key === 'F3') { e.preventDefault(); $('#stats').classList.toggle('hidden'); return; }
	if (e.key === 'Enter' && !typing()) { e.preventDefault(); $('#chat').classList.remove('hidden'); $('#chat-in').focus(); return; }
	if (e.key === 'Alt' && G.ptt && G.micOn) { e.preventDefault(); G.pttDown = true; if (G.mic) G.mic.enabled = true; return; }
	if (typing() || e.repeat) return;
	e.preventDefault();
	held.add(e.keyCode);
	sendCtl({ t: 'key', c: e.keyCode, d: 1 });
});
window.addEventListener('keyup', (e) => {
	if (e.key === 'Alt' && G.ptt) { G.pttDown = false; if (G.mic) G.mic.enabled = false; return; }
	if (!held.has(e.keyCode)) return;
	held.delete(e.keyCode);
	sendCtl({ t: 'key', c: e.keyCode, d: 0 });
});
// Fenêtre quittée : toutes les touches sont relâchées chez l'hôte.
window.addEventListener('blur', () => { for (const c of held) sendCtl({ t: 'key', c, d: 0 }); held.clear(); });

$('#chat-in').addEventListener('keydown', (e) => {
	e.stopPropagation();
	if (e.key === 'Escape') { $('#chat').classList.add('hidden'); e.target.blur(); }
	if (e.key === 'Enter') {
		const text = e.target.value.trim();
		if (text) { sendCtl({ t: 'chat', text }); addChat(G.name, text); }
		e.target.value = '';
		$('#chat').classList.add('hidden');
		e.target.blur();
	}
});

// ---------- Micro ----------

const setMic = async (on) => {
	if (on && !G.mic) {
		try { G.mic = (await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })).getAudioTracks()[0]; } catch (e) { toast(`Micro indisponible : ${esc(e.message)}`, true); return; }
	}
	G.micOn = on;
	if (G.mic) G.mic.enabled = on && !G.ptt;
	const voice = G.pc && G.pc.getTransceivers()[2];
	if (voice) voice.sender.replaceTrack(on ? G.mic : null).catch(() => {});
	$('#btn-mic').innerHTML = icon(on ? 'volume-2' : 'volume-x');
	toast(on ? 'Micro activé (maintiens Alt pour parler si « appuyer pour parler » est choisi)' : 'Micro coupé');
};

// ---------- Statistiques ----------

setInterval(async () => {
	if (!G.pc || G.pc.connectionState !== 'connected') return;
	sendCtl({ t: 'ping', ts: performance.now() });
	const s = await SmashRemote.stats(G.pc, G.prev);
	G.prev = { bytes: s.bytes, t: s.t };
	const rtt = s.rtt ?? G.appRtt;
	const badge = $('#conn');
	badge.textContent = `${s.path === 'réseau local' ? 'LOCAL' : 'DIRECT'} · ${rtt != null ? `${rtt} MS` : '—'}`;
	badge.className = `badge ${rtt > 120 ? 'bad' : rtt > 60 ? 'warn' : ''}`;
	$('#stats-grid').innerHTML = [
		['Joueur', G.slot ? `n° ${G.slot}` : '—'],
		['Ping', rtt != null ? `${rtt} ms` : '—'],
		['Aller-retour des commandes', G.appRtt != null ? `${G.appRtt} ms` : '—'],
		['Liaison', s.path || '—'],
		['Image', s.width ? `${s.width}×${s.height}` : '—'],
		['Images/s reçues', s.fps != null ? Math.round(s.fps) : '—'],
		['Débit reçu', s.kbps != null ? `${(s.kbps / 1000).toFixed(1).replace('.', ',')} Mb/s` : '—'],
		['Images perdues', s.dropped ?? '—'],
		['Paquets perdus', s.lost ?? '—'],
		['Gigue', s.jitter != null ? `${s.jitter} ms` : '—'],
		['Tampon vidéo', s.buffer != null ? `${s.buffer} ms` : '—'],
		['Codec', `${s.codec || '—'}${s.decoder ? ` · ${s.decoder}` : ''}`],
	].map(([k, v]) => `<span>${esc(k)}</span><b>${esc(v)}</b>`).join('') + (SmashRemote.advice(s) ? `<span style="grid-column:1/3;color:#ffe08a">${esc(SmashRemote.advice(s))}</span>` : '');
}, 1000);

// ---------- Interface ----------

const ACTIONS = {
	join,
	copy: async () => { await navigator.clipboard.writeText($('#answer').value); toast('Réponse copiée : envoie-la à l’hôte'); },
	save: () => {
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([$('#answer').value], { type: 'text/plain' }));
		a.download = 'reponse.smashinvite';
		a.click();
	},
	mic: () => setMic(!G.micOn),
	ptt: (el) => { G.ptt = !G.ptt; el.classList.toggle('on', G.ptt); if (G.mic) G.mic.enabled = G.micOn && !G.ptt; toast(G.ptt ? 'Appuyer pour parler : maintiens Alt' : 'Micro ouvert en continu'); },
	stats: () => $('#stats').classList.toggle('hidden'),
	chat: () => { $('#chat').classList.toggle('hidden'); if (!$('#chat').classList.contains('hidden')) $('#chat-in').focus(); },
	minimize: () => smashRemote.window('minimize'),
	fullscreen: () => smashRemote.window('fullscreen'),
	close: () => { sendCtl({ t: 'chat', text: '(a quitté la partie)' }); smashRemote.window('close'); },
};

document.addEventListener('click', (e) => {
	const el = e.target.closest('[data-action]');
	if (el && ACTIONS[el.dataset.action]) ACTIONS[el.dataset.action](el);
});

$('#vol-game').addEventListener('input', (e) => { if (G.game) G.game.volume = e.target.value / 100; });
$('#vol-voice').addEventListener('input', (e) => { if (G.voice) G.voice.volume = e.target.value / 100; });

// Fichier .smashinvite glissé sur la fenêtre.
const offerBox = $('#offer');
document.addEventListener('dragover', (e) => { e.preventDefault(); offerBox.classList.add('drop'); });
document.addEventListener('dragleave', () => offerBox.classList.remove('drop'));
document.addEventListener('drop', async (e) => {
	e.preventDefault();
	offerBox.classList.remove('drop');
	const f = e.dataTransfer.files[0];
	if (f && f.size < 100000) offerBox.value = (await f.text()).trim();
});

// Barre visible quand la souris bouge pendant la partie.
let barTimer = 0;
document.addEventListener('mousemove', () => { document.body.classList.add('show-bar'); clearTimeout(barTimer); barTimer = setTimeout(() => document.body.classList.remove('show-bar'), 2500); });

document.addEventListener('mouseover', (e) => {
	const t = e.target.closest('[data-tip]');
	const tip = $('#tooltip');
	if (!t) { tip.classList.add('hidden'); return; }
	tip.textContent = t.dataset.tip;
	tip.classList.remove('hidden');
	const r = t.getBoundingClientRect();
	tip.style.left = `${Math.max(8, Math.min(innerWidth - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2))}px`;
	tip.style.top = `${r.bottom + 8}px`;
});

(async () => {
	for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon);
	const cfg = await smashRemote.config().catch(() => ({}));
	document.documentElement.dataset.theme = cfg.theme || 'smash';
	if (cfg.logo && SmashLogo.setVariant) SmashLogo.setVariant(cfg.logo);
	$('#logo').innerHTML = SmashLogo.svg(26);
	$('#name').value = cfg.playerName || '';
	if (cfg.code) $('#offer').value = cfg.code;
	G.ptt = false;
})();
