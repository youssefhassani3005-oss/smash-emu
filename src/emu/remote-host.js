/* global SmashRemote, smashEmu, st, emu, toast, log, esc, icon, ACTIONS, focusGame */
// Jeu à distance — côté hôte (fenêtre de jeu Smash Emu, Ctrl+J).
// L'hôte fait tourner le jeu ; jusqu'à 3 amis le reçoivent en vidéo (image du jeu uniquement, jamais le
// bureau) avec le son, et jouent avec leur propre manette ou leur clavier comme joueurs 2 à 4.
// Les commandes reçues passent par smashInputs.send : elles n'interfèrent ni avec le bot ni avec les films.

(() => {
	const MAX_GUESTS = 3;
	const R = { guests: [], quality: 'balanced', blockAll: false, micTrack: null, micOn: false, ptt: false, pttDown: false, game: null, panel: null, chat: [], timer: 0, nextId: 1 };

	// ---------- Flux du jeu (image du canvas + son d'EmulatorJS) ----------

	const gameTracks = () => {
		if (R.game) return R.game;
		const canvas = emu().canvas;
		const video = canvas.captureStream(60).getVideoTracks()[0];
		let audio = null;
		try {
			const al = emu().Module.AL.currentCtx;
			const dest = al.audioCtx.createMediaStreamDestination();
			for (const k in al.sources) al.sources[k].gain.connect(dest);
			audio = dest.stream.getAudioTracks()[0] || null;
		} catch (e) { log('jeu à distance : son du jeu indisponible', e.message); }
		R.game = { video, audio };
		return R.game;
	};

	// ---------- Commandes des invités ----------

	const labelFor = (slot, id) => {
		const E = emu();
		const own = E.controls && E.controls[slot] && E.controls[slot][id];
		if (own && own.value2 !== undefined) return own.value2;
		const p1 = E.controls && E.controls[0] && E.controls[0][id];
		if (p1 && p1.value2 !== undefined) return p1.value2;
		return SmashRemote.DEFAULT_PAD[id];
	};
	const keyFor = (id) => { const c = emu().controls && emu().controls[0] && emu().controls[0][id]; return c && typeof c.value === 'number' ? c.value : null; };

	const apply = (g) => {
		const allowed = g.allowed && !R.blockAll && g.state === 'connected';
		for (let id = 0; id < 24; id++) {
			let v = 0;
			if (allowed) {
				v = SmashRemote.valueFor(id, labelFor(g.slot, id), g.pad);
				const code = keyFor(id);
				if (code && g.keys.has(code)) v = Math.max(v, SmashRemote.ANALOG.includes(id) ? 0x7fff : 1);
			}
			if ((g.applied.get(id) || 0) !== v) { g.applied.set(id, v); window.smashInputs.send(g.slot, id, v); }
		}
	};
	const release = (g) => { g.pad = null; g.keys.clear(); apply({ ...g, allowed: false, state: 'off', applied: g.applied }); };

	// ---------- Messages ----------

	const sendCtl = (g, msg) => { try { if (g.ctl && g.ctl.readyState === 'open') g.ctl.send(JSON.stringify(msg)); } catch { /* canal fermé */ } };
	const broadcast = (msg, except = null) => { for (const g of R.guests) if (g !== except) sendCtl(g, msg); };
	const hostName = () => (st.cfg && st.cfg.playerName) || 'Hôte';

	const addChat = (from, text) => {
		R.chat.push({ from, text: String(text).slice(0, 300), at: Date.now() });
		if (R.chat.length > 80) R.chat.shift();
		renderChat();
	};

	const onCtl = (g, raw) => {
		let m;
		try { m = JSON.parse(raw); } catch { return; }
		if (m.t === 'hello') { g.name = String(m.name || 'Invité').slice(0, 24); render(); addChat('•', `${g.name} a rejoint la partie (joueur ${g.slot + 1})`); sendCtl(g, { t: 'welcome', slot: g.slot + 1, game: st.cfg.name, host: hostName() }); broadcast({ t: 'chat', from: '•', text: `${g.name} a rejoint la partie` }, g); }
		else if (m.t === 'key' && Number.isInteger(m.c)) { if (m.d) g.keys.add(m.c); else g.keys.delete(m.c); apply(g); }
		else if (m.t === 'chat' && m.text) { addChat(g.name, m.text); broadcast({ t: 'chat', from: g.name, text: String(m.text).slice(0, 300) }, g); }
		else if (m.t === 'ping') sendCtl(g, { t: 'pong', ts: m.ts });
		else if (m.t === 'pads') { g.padName = String(m.name || '').slice(0, 60); render(); }
	};

	const onInput = (g, raw) => {
		let m;
		try { m = JSON.parse(raw); } catch { return; }
		if (m.t !== 'pad' || !Number.isInteger(m.s) || m.s <= g.seq) return;
		g.seq = m.s;
		g.pad = m.st && Number.isInteger(m.st.b) && Array.isArray(m.st.a) ? { b: m.st.b, a: m.st.a.slice(0, 4).map(Number) } : null;
		apply(g);
	};

	// ---------- Qualité ----------

	const applyQuality = async (g) => {
		const q = SmashRemote.QUALITY[R.quality];
		const sender = g.videoTx && g.videoTx.sender;
		if (!sender) return;
		try {
			const p = sender.getParameters();
			if (!p.encodings || !p.encodings.length) p.encodings = [{}];
			p.encodings[0].maxBitrate = q.maxBitrate;
			p.encodings[0].maxFramerate = q.maxFramerate;
			p.degradationPreference = q.degradation;
			await sender.setParameters(p);
		} catch (e) { log('jeu à distance : qualité', e.message); }
	};

	// ---------- Invitations ----------

	const freeSlot = () => [1, 2, 3].find(s => !R.guests.some(g => g.slot === s && g.state !== 'closed'));

	const invite = async () => {
		const live = R.guests.filter(g => g.state !== 'closed');
		if (live.length >= MAX_GUESTS) { toast('3 invités au maximum (joueurs 2 à 4).', { error: true }); return; }
		const slot = freeSlot();
		const pc = new RTCPeerConnection({ iceServers: SmashRemote.ICE });
		const g = { id: R.nextId++, name: 'Invité', slot, pc, state: 'invite', allowed: true, keys: new Set(), applied: new Map(), seq: -1, pad: null, code: '', stats: null, prev: {}, muted: false, padName: '' };
		R.guests.push(g);
		const tracks = gameTracks();
		g.videoTx = pc.addTransceiver(tracks.video, { direction: 'sendonly' });
		SmashRemote.preferCodecs(g.videoTx);
		SmashRemote.preferCodecs(pc.addTransceiver(tracks.audio || 'audio', { direction: 'sendonly' }), 'audio');
		g.voiceTx = pc.addTransceiver('audio', { direction: 'sendrecv' });
		SmashRemote.preferCodecs(g.voiceTx, 'audio');
		if (R.micTrack) g.voiceTx.sender.replaceTrack(R.micTrack);
		g.input = pc.createDataChannel('input', { ordered: false, maxRetransmits: 0 });
		g.ctl = pc.createDataChannel('ctl');
		g.input.onmessage = e => onInput(g, e.data);
		g.ctl.onmessage = e => onCtl(g, e.data);
		g.ctl.onopen = () => { applyQuality(g); };
		pc.ontrack = (e) => {
			if (e.transceiver !== g.voiceTx) return;
			const a = new Audio();
			a.srcObject = new MediaStream([e.track]);
			a.muted = g.muted;
			a.play().catch(() => {});
			g.voiceEl = a;
		};
		pc.onconnectionstatechange = () => {
			const s = pc.connectionState;
			if (s === 'connected') { g.state = 'connected'; toast(`🎮 ${esc(g.name)} est connecté (joueur ${g.slot + 1})`); }
			else if (s === 'failed') { g.state = 'failed'; release(g); toast(`Connexion avec ${esc(g.name)} impossible ou perdue. Derrière certains réseaux stricts, la connexion directe échoue : réessaie avec un nouveau code, ou sur une autre connexion.`, { error: true, ms: 8000 }); }
			else if (s === 'disconnected') { g.state = 'lost'; release(g); }
			else if (s === 'closed') { g.state = 'closed'; release(g); }
			render();
		};
		render();
		try {
			await pc.setLocalDescription(await pc.createOffer());
			await SmashRemote.gathered(pc);
			g.code = await SmashRemote.encode('offer', { sdp: pc.localDescription.sdp, game: st.cfg.name, system: st.cfg.systemLabel, host: hostName(), slot: slot + 1, expires: Date.now() + 30 * 60 * 1000 });
		} catch (e) { g.state = 'failed'; toast(`Invitation impossible : ${esc(e.message)}`, { error: true }); }
		render();
	};

	const accept = async (g, text) => {
		try {
			const data = await SmashRemote.decode(text, 'answer');
			g.name = String(data.name || 'Invité').slice(0, 24);
			g.state = 'connecting';
			await g.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
			render();
			setTimeout(() => { if (g.state === 'connecting') { g.state = 'failed'; render(); toast('Pas de connexion après 20 s : réseau trop strict ou code expiré. Essaie avec un nouveau code.', { error: true, ms: 7000 }); } }, 20000);
		} catch (e) { toast(esc(e.message), { error: true, ms: 5000 }); }
	};

	const kick = (g) => {
		sendCtl(g, { t: 'bye', reason: 'L’hôte t’a retiré de la partie.' });
		release(g);
		setTimeout(() => { try { g.pc.close(); } catch { /* */ } g.state = 'closed'; R.guests = R.guests.filter(x => x !== g); render(); }, 200);
	};

	// ---------- Micro (chat vocal) ----------

	const setMic = async (on) => {
		if (on && !R.micTrack) {
			try {
				const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
				R.micTrack = s.getAudioTracks()[0];
			} catch (e) { toast(`Micro indisponible : ${esc(e.message)}`, { error: true }); return; }
		}
		R.micOn = on;
		if (R.micTrack) R.micTrack.enabled = on && (!R.ptt || R.pttDown);
		for (const g of R.guests) if (g.voiceTx) g.voiceTx.sender.replaceTrack(on ? R.micTrack : null).catch(() => {});
		render();
	};

	window.addEventListener('keydown', (e) => { if (R.ptt && R.micOn && e.key === 'Alt' && !R.pttDown) { R.pttDown = true; if (R.micTrack) R.micTrack.enabled = true; e.preventDefault(); } }, true);
	window.addEventListener('keyup', (e) => { if (R.ptt && e.key === 'Alt') { R.pttDown = false; if (R.micTrack) R.micTrack.enabled = false; } }, true);

	// ---------- Statistiques ----------

	const tick = async () => {
		for (const g of R.guests) {
			if (g.state !== 'connected') continue;
			const s = await SmashRemote.stats(g.pc, g.prev);
			g.prev = { bytes: s.bytes, t: s.t };
			g.stats = s;
		}
		if (R.panel && !R.panel.classList.contains('hidden')) renderGuests();
		updateBadge();
	};

	const updateBadge = () => {
		const n = R.guests.filter(g => g.state === 'connected').length;
		const b = document.getElementById('remote-badge');
		if (b) { b.textContent = n ? String(n) : ''; b.classList.toggle('hidden', !n); }
	};

	// ---------- Panneau ----------

	const STATE = { invite: 'Invitation prête', connecting: 'Connexion…', connected: 'Connecté', lost: 'Connexion coupée', failed: 'Échec', closed: 'Parti' };

	const guestHtml = (g) => {
		const s = g.stats || {};
		const pending = g.state === 'invite';
		return `<div class="rp-guest ${g.state}" data-g="${g.id}">
			<div class="rp-guest-head">
				<span class="rp-dot"></span><b>${esc(g.name)}</b><span class="rp-state">${STATE[g.state] || g.state}</span><span class="grow"></span>
				<select data-rp="slot" data-g="${g.id}">${[1, 2, 3].map(sl => `<option value="${sl}" ${g.slot === sl ? 'selected' : ''}>Joueur ${sl + 1}</option>`).join('')}</select>
			</div>
			${pending ? `
				<div class="rp-step"><b>1.</b> Envoie ce code d’invitation à ton ami (ou le fichier) :</div>
				<textarea class="rp-code" readonly>${esc(g.code || 'Préparation du code…')}</textarea>
				<div class="rp-row"><button class="pbtn sm" data-rp="copy" data-g="${g.id}" ${g.code ? '' : 'disabled'}>Copier</button><button class="pbtn sm" data-rp="file" data-g="${g.id}" ${g.code ? '' : 'disabled'}>Enregistrer .smashinvite</button><span class="rp-hint">Valable 30 min</span></div>
				<div class="rp-step"><b>2.</b> Colle ici le code de réponse qu’il te renvoie :</div>
				<textarea class="rp-answer" data-g="${g.id}" placeholder="SMASH-REP-…"></textarea>
				<div class="rp-row"><button class="pbtn sm primary" data-rp="accept" data-g="${g.id}">Accepter et connecter</button><button class="pbtn sm" data-rp="kick" data-g="${g.id}">Annuler</button></div>`
		: `
				<div class="rp-stats">
					<span>Ping</span><b>${s.rtt != null ? `${s.rtt} ms` : '—'}</b>
					<span>Liaison</span><b>${esc(s.path || '—')}</b>
					<span>Image</span><b>${s.width ? `${s.width}×${s.height} · ${Math.round(s.fps || 0)} i/s` : '—'}</b>
					<span>Débit envoyé</span><b>${s.kbps != null ? `${(s.kbps / 1000).toFixed(1).replace('.', ',')} Mb/s` : '—'}</b>
					<span>Codec</span><b>${esc(s.codec || '—')}${s.encoder ? ` · ${esc(s.encoder)}` : ''}</b>
					<span>Limité par</span><b>${esc({ cpu: 'processeur', bandwidth: 'débit', none: 'rien', other: 'autre' }[s.limit] || '—')}</b>
					<span>Gigue / pertes</span><b>${s.jitter != null ? `${s.jitter} ms` : '—'} / ${s.lost ?? '—'}</b>
				</div>
				${g.padName ? `<div class="rp-hint">🎮 ${esc(g.padName)}</div>` : ''}
				${SmashRemote.advice(s) ? `<div class="rp-advice">${esc(SmashRemote.advice(s))}</div>` : ''}
				<div class="rp-row">
					<button class="pbtn sm ${g.allowed ? '' : 'primary'}" data-rp="allow" data-g="${g.id}">${g.allowed ? 'Bloquer ses commandes' : 'Autoriser ses commandes'}</button>
					<button class="pbtn sm" data-rp="mute" data-g="${g.id}">${g.muted ? 'Réactiver sa voix' : 'Couper sa voix'}</button>
					<button class="pbtn sm" data-rp="kick" data-g="${g.id}">Retirer</button>
				</div>`}
		</div>`;
	};

	const renderGuests = () => {
		const box = R.panel && R.panel.querySelector('.rp-guests');
		if (!box) return;
		const focused = document.activeElement && document.activeElement.classList.contains('rp-answer') ? { g: document.activeElement.dataset.g, v: document.activeElement.value } : null;
		box.innerHTML = R.guests.length ? R.guests.map(guestHtml).join('') : '<div class="rp-empty">Personne pour l’instant. Clique sur « Inviter un ami ».</div>';
		if (focused) { const ta = box.querySelector(`.rp-answer[data-g="${focused.g}"]`); if (ta) { ta.value = focused.v; ta.focus(); } }
	};

	const renderChat = () => {
		const box = R.panel && R.panel.querySelector('.rp-chat-log');
		if (!box) return;
		box.innerHTML = R.chat.map(c => `<div><b>${esc(c.from)}</b> ${esc(c.text)}</div>`).join('');
		box.scrollTop = box.scrollHeight;
	};

	const render = () => {
		if (!R.panel) return;
		R.panel.querySelector('.rp-quality').innerHTML = Object.entries(SmashRemote.QUALITY).map(([k, q]) => `<button class="rp-chip ${R.quality === k ? 'on' : ''}" data-rp="quality" data-v="${k}">${q.label}</button>`).join('');
		R.panel.querySelector('[data-rp="mic"]').textContent = R.micOn ? 'Micro activé' : 'Activer le micro';
		R.panel.querySelector('[data-rp="mic"]').classList.toggle('primary', R.micOn);
		R.panel.querySelector('[data-rp="ptt"]').classList.toggle('on', R.ptt);
		R.panel.querySelector('[data-rp="block"]').classList.toggle('primary', R.blockAll);
		R.panel.querySelector('[data-rp="block"]').textContent = R.blockAll ? 'Commandes à distance bloquées' : 'Reprendre la main (bloquer tout)';
		renderGuests();
		renderChat();
		updateBadge();
	};

	const build = () => {
		const el = document.createElement('aside');
		el.className = 'panel rp hidden';
		el.innerHTML = `
			<div class="panel-head"><div class="panel-title">À DISTANCE</div><button class="wc" data-rp="close"><span>✕</span></button></div>
			<div class="rp-body">
				<p class="rp-intro">Tes amis voient <b>uniquement l’image du jeu</b> (jamais ton bureau) et jouent avec leur manette comme joueurs 2 à 4. Connexion directe et chiffrée entre vos PC, sans serveur.</p>
				<button class="pbtn primary rp-invite" data-rp="invite">${icon('plus')}Inviter un ami</button>
				<div class="rp-guests"></div>
				<div class="rp-label">Qualité de l’image</div><div class="rp-quality"></div>
				<div class="rp-label">Voix</div>
				<div class="rp-row"><button class="pbtn sm" data-rp="mic">Activer le micro</button><button class="rp-chip" data-rp="ptt">Appuyer pour parler (Alt)</button></div>
				<div class="rp-row"><button class="pbtn sm" data-rp="block">Reprendre la main (bloquer tout)</button></div>
				<div class="rp-label">Chat</div>
				<div class="rp-chat-log"></div>
				<div class="rp-row"><input class="rp-chat-in" maxlength="300" placeholder="Message…"><button class="pbtn sm" data-rp="send">Envoyer</button></div>
				<p class="rp-limits">Limites : pas de serveur relais (certains réseaux stricts bloquent la connexion directe) ; les invités s’entendent avec l’hôte mais pas entre eux ; une coupure demande un nouveau code. Ce n’est pas du netplay : le jeu tourne seulement chez l’hôte.</p>
			</div>`;
		el.addEventListener('click', onClick);
		el.addEventListener('change', (e) => {
			const t = e.target;
			if (t.dataset.rp === 'slot') {
				const g = R.guests.find(x => x.id === +t.dataset.g);
				const slot = +t.value;
				if (!g) return;
				if (R.guests.some(x => x !== g && x.slot === slot && x.state !== 'closed')) { toast('Cette place est déjà prise.', { error: true }); t.value = g.slot; return; }
				release(g);
				g.slot = slot;
				sendCtl(g, { t: 'welcome', slot: slot + 1, game: st.cfg.name, host: hostName() });
				render();
			}
		});
		el.addEventListener('keydown', (e) => {
			e.stopPropagation();
			if (e.key === 'Enter' && e.target.classList.contains('rp-chat-in')) sendChat();
			if (e.key === 'Escape') toggle(false);
		});
		document.body.appendChild(el);
		return el;
	};

	const sendChat = () => {
		const input = R.panel.querySelector('.rp-chat-in');
		const text = input.value.trim();
		if (!text) return;
		input.value = '';
		addChat(hostName(), text);
		broadcast({ t: 'chat', from: hostName(), text });
	};

	const onClick = async (e) => {
		const b = e.target.closest('[data-rp]');
		if (!b || b.tagName === 'SELECT') return;
		const g = R.guests.find(x => x.id === +b.dataset.g);
		switch (b.dataset.rp) {
			case 'close': toggle(false); break;
			case 'invite': await invite(); break;
			case 'copy': await navigator.clipboard.writeText(g.code); toast('Code copié : envoie-le à ton ami'); break;
			case 'file': {
				const a = document.createElement('a');
				a.href = URL.createObjectURL(new Blob([g.code], { type: 'text/plain' }));
				a.download = `invitation-${(st.cfg.name || 'jeu').replace(/[^\w-]+/g, '-').slice(0, 30)}.smashinvite`;
				a.click();
				setTimeout(() => URL.revokeObjectURL(a.href), 2000);
				break;
			}
			case 'accept': await accept(g, R.panel.querySelector(`.rp-answer[data-g="${g.id}"]`).value); break;
			case 'kick': kick(g); break;
			case 'allow': g.allowed = !g.allowed; apply(g); render(); break;
			case 'mute': g.muted = !g.muted; if (g.voiceEl) g.voiceEl.muted = g.muted; render(); break;
			case 'quality': R.quality = b.dataset.v; for (const x of R.guests) applyQuality(x); render(); break;
			case 'mic': await setMic(!R.micOn); break;
			case 'ptt': R.ptt = !R.ptt; if (R.micTrack) R.micTrack.enabled = R.micOn && !R.ptt; render(); break;
			case 'block': R.blockAll = !R.blockAll; for (const x of R.guests) apply(x); render(); toast(R.blockAll ? 'Commandes à distance bloquées : tu as la main' : 'Commandes à distance réactivées'); break;
			case 'send': sendChat(); break;
		}
	};

	const toggle = (open) => {
		if (!st.started) return;
		R.panel = R.panel || build();
		const show = open === undefined ? R.panel.classList.contains('hidden') : open;
		R.panel.classList.toggle('hidden', !show);
		if (show) { render(); if (!R.timer) R.timer = setInterval(tick, 1000); } else focusGame();
	};

	ACTIONS.remote = () => toggle();
	window.smashRemoteHost = {
		toggle,
		stopAll: () => { for (const g of [...R.guests]) kick(g); },
		get guests() { return R.guests.filter(g => g.state === 'connected').length; },
	};

	const previous = window.smashKey;
	window.smashKey = (e) => {
		if (e.ctrlKey && !e.altKey && (e.key === 'j' || e.key === 'J') && !e.repeat) { e.preventDefault(); e.stopPropagation(); toggle(); return true; }
		return previous ? previous(e) : false;
	};
})();
