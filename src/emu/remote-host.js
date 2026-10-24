/* global SmashRemote, smashEmu, st, emu, toast, log, esc, icon, ACTIONS, focusGame */
// Jeu à distance — côté hôte (fenêtre de jeu Smash Emu, Ctrl+J).
// L'hôte fait tourner le jeu ; jusqu'à 3 amis le reçoivent en vidéo (image du jeu uniquement, jamais le
// bureau) avec le son, et jouent avec leur propre manette ou leur clavier comme joueurs 2 à 4.
// Les commandes reçues passent par smashInputs.send : elles n'interfèrent ni avec le bot ni avec les films.

(() => {
	// Fenêtre d'un émulateur externe (Dolphin…) : la page fournit l'image, le son et l'envoi des commandes.
	const A = window.smashRemoteAdapter || null;
	// Places proposées : joueurs 2 à N selon la console, puis « joueur 1 partagé » (l'ami pilote avec l'hôte),
	// seule place des consoles à un joueur (Game Boy, GBA, DS, PSP…).
	const PLAYERS = { n64: 4, nes: 2, snes: 2, psx: 2, md: 2, sms: 2, pce: 2, a2600: 2, a7800: 2, jaguar: 2, saturn: 2, segacd: 2, '32x': 2, '3do': 1, gb: 1, gbc: 1, gba: 1, nds: 1, vb: 1, gg: 1, lynx: 1, psp: 1 };
	const slotsOf = () => {
		if (A) return A.slots;
		const n = PLAYERS[st.cfg && st.cfg.system] ?? 2;
		return [...Array(Math.max(0, n - 1)).keys()].map(k => k + 1).concat(0);
	};
	const SLOT_LABEL = sl => (sl === 0 ? 'Joueur 1 (partagé)' : `Joueur ${sl + 1}`);
	const R = { guests: [], quality: 'balanced', blockAll: false, micTrack: null, micOn: false, ptt: false, pttDown: false, game: null, panel: null, chat: [], timer: 0, nextId: 1, room: null, roomError: '', friends: null, invited: new Set() };
	// Salons (code court) : API du processus principal, exposée par la fenêtre du lecteur intégré ou de l'émulateur externe.
	const RM = (window.smashEmu && window.smashEmu.room) || (window.smashExt && window.smashExt.room) || null;

	// ---------- Flux du jeu (image du canvas + son d'EmulatorJS) ----------

	const gameTracks = async () => {
		if (R.game) return R.game;
		if (A) { R.game = await A.tracks(); return R.game; }
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
		// Jeu en mouvement : l'encodeur garde la fluidité plutôt que la netteté des images fixes.
		try { R.game.video.contentHint = 'motion'; } catch { /* non pris en charge */ }
		return R.game;
	};

	// ---------- Commandes des invités ----------

	const labelFor = (slot, id) => {
		if (A) return SmashRemote.DEFAULT_PAD[id];
		const E = emu();
		const own = E.controls && E.controls[slot] && E.controls[slot][id];
		if (own && own.value2 !== undefined) return own.value2;
		const p1 = E.controls && E.controls[0] && E.controls[0][id];
		if (p1 && p1.value2 !== undefined) return p1.value2;
		return SmashRemote.DEFAULT_PAD[id];
	};
	const keyFor = (id) => { if (A) return A.keyFor(id); const c = emu().controls && emu().controls[0] && emu().controls[0][id]; return c && typeof c.value === 'number' ? c.value : null; };

	const apply = (g) => {
		const allowed = g.allowed && !R.blockAll && g.state === 'connected';
		for (let id = 0; id < 24; id++) {
			let v = 0;
			if (allowed) {
				v = SmashRemote.valueFor(id, labelFor(g.slot, id), g.pad);
				const code = keyFor(id);
				if (code && g.keys.has(code)) v = Math.max(v, SmashRemote.ANALOG.includes(id) ? 0x7fff : 1);
			}
			if ((g.applied.get(id) || 0) !== v) { g.applied.set(id, v); (A ? A.send : window.smashInputs.send)(g.slot, id, v); }
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
		if (!Number.isInteger(m.s)) return;
		// Manette (état complet) ou touches du clavier tenues (état complet aussi), chacune numérotée à part : un
		// paquet perdu ou arrivé en retard est corrigé par le suivant, sans attendre de renvoi.
		if (m.t === 'pad' && m.s > g.seq) { g.seq = m.s; g.pad = m.st && Number.isInteger(m.st.b) && Array.isArray(m.st.a) ? { b: m.st.b, a: m.st.a.slice(0, 4).map(Number) } : null; }
		else if (m.t === 'keys' && Array.isArray(m.k) && m.s > (g.kseq ?? -1)) { g.kseq = m.s; g.keys = new Set(m.k.filter(Number.isInteger).slice(0, 16)); }
		else return;
		apply(g);
	};

	// ---------- Qualité ----------

	const applyQuality = async (g) => {
		const q = SmashRemote.QUALITY[R.quality];
		const sender = g.videoTx && g.videoTx.sender;
		if (!sender) return;
		if (A) A.maxWidth = q.maxWidth;
		try {
			const p = sender.getParameters();
			if (!p.encodings || !p.encodings.length) p.encodings = [{}];
			p.encodings[0].maxBitrate = q.maxBitrate;
			p.encodings[0].maxFramerate = q.maxFramerate;
			// Image plus petite à encoder = moins de retard (le lecteur intégré peut être en plein écran 4K).
			const w = (sender.track && sender.track.getSettings().width) || 0;
			p.encodings[0].scaleResolutionDownBy = w > q.maxWidth ? w / q.maxWidth : 1;
			p.encodings[0].priority = 'high';
			p.encodings[0].networkPriority = 'high';
			p.degradationPreference = q.degradation;
			await sender.setParameters(p);
		} catch (e) { log('jeu à distance : qualité', e.message); }
	};

	// ---------- Invitations ----------

	const freeSlot = () => slotsOf().find(s => !R.guests.some(g => g.slot === s && !['closed', 'failed'].includes(g.state)));

	const full = () => {
		const live = R.guests.filter(g => !['closed', 'failed'].includes(g.state));
		return live.length >= (A ? A.maxGuests : slotsOf().length);
	};

	// Nouvel invité : connexion WebRTC préparée (image, son, voix, commandes) et offre locale prête.
	// legacy : ancienne méthode, l'offre devient un long code à copier.
	const createGuest = async ({ name = 'Invité', gid = null, legacy = false } = {}) => {
		const slot = freeSlot();
		const pc = new RTCPeerConnection({ iceServers: SmashRemote.ICE });
		const g = { id: R.nextId++, gid, legacy, name, slot, pc, state: legacy ? 'invite' : 'connecting', allowed: true, keys: new Set(), applied: new Map(), seq: -1, pad: null, code: '', stats: null, prev: {}, muted: false, padName: '' };
		R.guests.push(g);
		let tracks;
		try { tracks = await gameTracks(); } catch (e) { R.guests = R.guests.filter(x => x !== g); toast(`Image du jeu indisponible : ${esc(e.message)}`, { error: true }); return null; }
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
		const offer = await pc.createOffer();
		await pc.setLocalDescription({ type: 'offer', sdp: SmashRemote.boostStart(offer.sdp) });
		await SmashRemote.gathered(pc);
		return g;
	};

	// Ancienne méthode (sans relais) : long code d'invitation, puis code de réponse à coller.
	const invite = async () => {
		if (full()) { toast('Plus de place pour un invité dans ce jeu.', { error: true }); return; }
		try {
			const g = await createGuest({ legacy: true });
			if (!g) return;
			g.code = await SmashRemote.encode('offer', { sdp: g.pc.localDescription.sdp, game: st.cfg.name, system: st.cfg.systemLabel, host: hostName(), slot: g.slot + 1, expires: Date.now() + 30 * 60 * 1000 });
		} catch (e) { toast(`Invitation impossible : ${esc(e.message)}`, { error: true }); }
		render();
	};

	// ---------- Salon (code court) ----------
	// L'invité tape le code (ou clique sur l'invitation d'un ami) : il demande à entrer, l'hôte lui envoie l'offre,
	// il répond, la connexion s'établit toute seule. Le code sert de mot de passe.

	const roomPost = msg => RM.post(R.room, msg).catch(e => toast(esc(e.message), { error: true }));
	const onRoom = async ({ code, msg }) => {
		if (!R.room || code !== R.room || !msg) return;
		const gid = typeof msg.gid === 'string' && /^[0-9a-f]{8,32}$/.test(msg.gid) ? msg.gid : null;
		if (!gid) return;
		if (msg.t === 'join') {
			if (R.guests.some(g => g.gid === gid && g.state !== 'closed')) return;
			if (full()) { roomPost({ t: 'full', gid }); return; }
			const g = await createGuest({ name: String(msg.name || 'Invité').slice(0, 24), gid }).catch((e) => { toast(`Connexion impossible : ${esc(e.message)}`, { error: true }); return null; });
			if (!g) return;
			addChat('•', `${g.name} rejoint la partie…`);
			await roomPost({ t: 'offer', gid, sdp: g.pc.localDescription.sdp, game: st.cfg.name, system: st.cfg.systemLabel, host: hostName(), slot: g.slot + 1 });
			setTimeout(() => { if (g.state === 'connecting') { g.state = 'failed'; release(g); render(); toast(`${esc(g.name)} n’a pas pu se connecter (réseau trop strict ?).`, { error: true, ms: 7000 }); } }, 30000);
			render();
		}
		if (msg.t === 'answer') {
			const g = R.guests.find(x => x.gid === gid && x.state === 'connecting');
			if (!g || typeof msg.sdp !== 'string') return;
			g.name = String(msg.name || g.name).slice(0, 24);
			try { await g.pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp }); } catch (e) { toast(`Connexion impossible : ${esc(e.message)}`, { error: true }); }
			render();
		}
	};
	if (RM) RM.onMessage(onRoom);

	const openRoom = async (fresh = false) => {
		if (!RM) return;
		if (R.room && !fresh) return;
		if (R.room) await RM.close(R.room).catch(() => {});
		R.room = null;
		R.roomError = '';
		render();
		try {
			const code = await RM.create();
			R.room = await RM.open(code);
			R.invited.clear();
		} catch (e) { R.roomError = e.message; }
		render();
		RM.friends().then((f) => { R.friends = f; render(); }).catch(() => {});
	};

	const inviteFriend = async (f) => {
		try {
			await RM.inviteFriend(f.code, R.room, st.cfg.name);
			R.invited.add(f.code);
			toast(`Invitation envoyée à ${esc(f.name)} : il n’a qu’à cliquer sur « Rejoindre »`);
		} catch (e) { toast(esc(e.message), { error: true }); }
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
				<select data-rp="slot" data-g="${g.id}">${slotsOf().map(sl => `<option value="${sl}" ${g.slot === sl ? 'selected' : ''}>${SLOT_LABEL(sl)}</option>`).join('')}</select>
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
		const live = R.guests.filter(g => g.state !== 'closed');
		box.innerHTML = live.length ? live.map(guestHtml).join('') : '<div class="rp-empty">Personne pour l’instant : donne le code du salon à ton ami, ou invite-le ci-dessus.</div>';
		if (focused) { const ta = box.querySelector(`.rp-answer[data-g="${focused.g}"]`); if (ta) { ta.value = focused.v; ta.focus(); } }
	};

	const renderChat = () => {
		const box = R.panel && R.panel.querySelector('.rp-chat-log');
		if (!box) return;
		box.innerHTML = R.chat.map(c => `<div><b>${esc(c.from)}</b> ${esc(c.text)}</div>`).join('');
		box.scrollTop = box.scrollHeight;
	};

	// Salon : code en grand, amis en ligne à inviter en un clic.
	const renderRoom = () => {
		const box = R.panel && R.panel.querySelector('.rp-room');
		if (!box) return;
		if (!RM) { box.innerHTML = ''; return; }
		const code = R.room
			? `<div class="rp-code-big" data-rp="copyroom" data-tip="Copier">${esc(R.room)}</div>`
			: `<div class="rp-code-big wait">${R.roomError ? '—' : '···'}</div>`;
		const friends = R.friends === null
			? '<div class="rp-hint">Active les <b>Amis</b> dans Smash Emu pour inviter tes amis en un clic.</div>'
			: !R.friends.length ? '<div class="rp-hint">Aucun ami en ligne pour l’instant.</div>'
				: `<div class="rp-friends">${R.friends.map(f => `<div class="rp-friend"><span class="rp-dot ${esc(f.status)}"></span><b>${esc(f.name)}</b>${f.game ? `<small>${esc(f.game)}</small>` : ''}<span class="grow"></span><button class="pbtn sm ${R.invited.has(f.code) ? '' : 'primary'}" data-rp="friend" data-code="${esc(f.code)}" ${R.room ? '' : 'disabled'}>${R.invited.has(f.code) ? 'Invité ✓' : 'Inviter'}</button></div>`).join('')}</div>`;
		box.innerHTML = `<div class="rp-label">Code du salon</div>
			<div class="rp-room-row">${code}<div class="rp-room-acts"><button class="pbtn sm" data-rp="copyroom" ${R.room ? '' : 'disabled'}>Copier</button><button class="pbtn sm" data-rp="newroom">Nouveau code</button></div></div>
			${R.roomError ? `<div class="rp-advice">${esc(R.roomError)}</div>` : '<div class="rp-hint">Ton ami clique sur <b>Rejoindre un ami</b> dans Smash Emu et tape ce code : la connexion se fait toute seule.</div>'}
			<div class="rp-label">Amis en ligne</div>${friends}`;
	};

	const render = () => {
		if (!R.panel) return;
		renderRoom();
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
				<p class="rp-intro">Tes amis voient <b>uniquement l’image du jeu</b> (jamais ton bureau) et jouent avec leur manette. Connexion directe et chiffrée entre vos PC.</p>
				<div class="rp-room"></div>
				<div class="rp-label">Joueurs</div>
				<div class="rp-guests"></div>
				${A && A.prepareHtml ? A.prepareHtml() : ''}
				${RM ? '<details class="rp-legacy"><summary>Autre méthode : long code à copier (sans relais)</summary>' : ''}
				<button class="pbtn ${RM ? 'sm' : 'primary'} rp-invite" data-rp="invite">${icon('plus')}${RM ? 'Créer un long code d’invitation' : 'Inviter un ami'}</button>
				${RM ? '</details>' : ''}
				<div class="rp-label">Qualité de l’image</div><div class="rp-quality"></div>
				<div class="rp-label">Voix</div>
				<div class="rp-row"><button class="pbtn sm" data-rp="mic">Activer le micro</button><button class="rp-chip" data-rp="ptt">Appuyer pour parler (Alt)</button></div>
				<div class="rp-row"><button class="pbtn sm" data-rp="block">Reprendre la main (bloquer tout)</button></div>
				<div class="rp-label">Chat</div>
				<div class="rp-chat-log"></div>
				<div class="rp-row"><input class="rp-chat-in" maxlength="300" placeholder="Message…"><button class="pbtn sm" data-rp="send">Envoyer</button></div>
				<p class="rp-limits">Le code du salon passe par le relais public ntfy.sh, chiffré : le relais ne voit ni le jeu ni vos adresses. L’image, le son et les manettes vont ensuite directement d’un PC à l’autre (certains réseaux stricts, comme la 4G, bloquent cette connexion directe). Les invités s’entendent avec l’hôte mais pas entre eux. Ce n’est pas du netplay : le jeu tourne seulement chez l’hôte.</p>
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
			case 'copyroom': if (R.room) { await navigator.clipboard.writeText(R.room); toast(`Code ${esc(R.room)} copié : envoie-le à ton ami`); } break;
			case 'newroom': await openRoom(true); toast('Nouveau code : l’ancien ne marche plus pour rejoindre'); break;
			case 'friend': { const f = (R.friends || []).find(x => x.code === b.dataset.code); if (f) await inviteFriend(f); break; }
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
			case 'prepare': if (A && A.prepare) await A.prepare(b.dataset.v); break;
		}
	};

	const toggle = (open) => {
		if (A ? !A.ready() : !st.started) { if (A) toast('Attends que le jeu soit affiché.', { error: true }); return; }
		R.panel = R.panel || build();
		const show = open === undefined ? R.panel.classList.contains('hidden') : open;
		R.panel.classList.toggle('hidden', !show);
		if (A && A.onPanel) A.onPanel(show);
		if (show) {
			render();
			if (!R.timer) R.timer = setInterval(tick, 1000);
			// Le salon s'ouvre avec le panneau ; la liste des amis en ligne est rafraîchie à chaque ouverture.
			if (!R.room) openRoom();
			else if (RM) RM.friends().then((f) => { R.friends = f; render(); }).catch(() => {});
		} else focusGame();
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
