// Jeu à distance — briques communes à l'hôte (fenêtre de jeu) et à l'invité (fenêtre « Rejoindre »).
//
// Fonctionnement réel (pas de serveur Smash Emu) :
//  - connexion WebRTC directe entre les deux PC, chiffrée (DTLS-SRTP) ; les adresses publiques sont trouvées
//    grâce à des serveurs STUN publics. Aucun relais (TURN) : derrière certains NAT stricts (4G, réseaux
//    d'entreprise), la connexion directe peut échouer, et c'est dit clairement ;
//  - pas de serveur de signalisation : l'hôte envoie un code d'invitation (ou un fichier .smashinvite),
//    l'invité renvoie un code de réponse ; coller la réponse vaut acceptation par l'hôte.
(function (root) {
	const VERSION = 1;
	const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }];

	// ---------- Codes d'invitation : JSON compressé (deflate) en base64 URL ----------

	const toB64 = (u8) => { let s = ''; for (let k = 0; k < u8.length; k += 0x8000) s += String.fromCharCode(...u8.subarray(k, k + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
	const fromB64 = (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')); const u = new Uint8Array(b.length); for (let k = 0; k < b.length; k++) u[k] = b.charCodeAt(k); return u; };
	const pipe = async (data, stream) => new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(stream)).arrayBuffer());

	const encode = async (kind, payload) => {
		const json = new TextEncoder().encode(JSON.stringify({ v: VERSION, ...payload }));
		return `SMASH-${kind === 'offer' ? 'INV' : 'REP'}-${toB64(await pipe(json, new CompressionStream('deflate-raw')))}`;
	};

	const decode = async (text, kind) => {
		const m = String(text || '').trim().match(/SMASH-(INV|REP)-([A-Za-z0-9_-]+)/);
		if (!m) throw new Error('Code invalide : il doit commencer par SMASH-INV- (invitation) ou SMASH-REP- (réponse).');
		if ((kind === 'offer') !== (m[1] === 'INV')) throw new Error(kind === 'offer' ? 'C’est un code de réponse : colle le code d’invitation de l’hôte.' : 'C’est un code d’invitation : colle la réponse de ton ami.');
		let data;
		try { data = JSON.parse(new TextDecoder().decode(await pipe(fromB64(m[2]), new DecompressionStream('deflate-raw')))); } catch { throw new Error('Code incomplet ou abîmé : recopie-le en entier.'); }
		if (data.v !== VERSION) throw new Error('Code d’une autre version de Smash Emu : mettez-vous tous les deux à jour.');
		if (!data.sdp || typeof data.sdp !== 'string' || data.sdp.length > 20000) throw new Error('Code invalide.');
		if (data.expires && Date.now() > data.expires) throw new Error('Invitation expirée : demande un nouveau code à l’hôte.');
		return data;
	};

	// Attend la fin de la collecte des adresses (ou 4 s) pour tout mettre dans le code.
	const gathered = pc => new Promise((resolve) => {
		if (pc.iceGatheringState === 'complete') { resolve(); return; }
		const done = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', done); resolve(); } };
		pc.addEventListener('icegatheringstatechange', done);
		setTimeout(resolve, 4000);
	});

	// ---------- Manettes : boutons standard du navigateur → libellés EmulatorJS ----------

	const PAD_LABELS = ['BUTTON_1', 'BUTTON_2', 'BUTTON_3', 'BUTTON_4', 'LEFT_TOP_SHOULDER', 'RIGHT_TOP_SHOULDER', 'LEFT_BOTTOM_SHOULDER', 'RIGHT_BOTTOM_SHOULDER', 'SELECT', 'START', 'LEFT_STICK', 'RIGHT_STICK', 'DPAD_UP', 'DPAD_DOWN', 'DPAD_LEFT', 'DPAD_RIGHT'];
	const AXES = ['LEFT_STICK_X', 'LEFT_STICK_Y', 'RIGHT_STICK_X', 'RIGHT_STICK_Y'];
	// Assignation EmulatorJS par défaut (bouton → libellé), utilisée quand le joueur n'a pas de profil.
	const DEFAULT_PAD = { 0: 'BUTTON_2', 1: 'BUTTON_4', 2: 'SELECT', 3: 'START', 4: 'DPAD_UP', 5: 'DPAD_DOWN', 6: 'DPAD_LEFT', 7: 'DPAD_RIGHT', 8: 'BUTTON_1', 9: 'BUTTON_3', 10: 'LEFT_TOP_SHOULDER', 11: 'RIGHT_TOP_SHOULDER', 12: 'LEFT_BOTTOM_SHOULDER', 13: 'RIGHT_BOTTOM_SHOULDER', 14: 'LEFT_STICK', 15: 'RIGHT_STICK', 16: 'LEFT_STICK_X:+1', 17: 'LEFT_STICK_X:-1', 18: 'LEFT_STICK_Y:+1', 19: 'LEFT_STICK_Y:-1', 20: 'RIGHT_STICK_X:+1', 21: 'RIGHT_STICK_X:-1', 22: 'RIGHT_STICK_Y:+1', 23: 'RIGHT_STICK_Y:-1' };
	const ANALOG = [16, 17, 18, 19, 20, 21, 22, 23];

	// État compact d'une manette : boutons (masque de 16 bits) + 4 axes arrondis au centième.
	const padState = (gp) => {
		let b = 0;
		gp.buttons.slice(0, 16).forEach((btn, k) => { if (btn.pressed || btn.value > 0.5) b |= 1 << k; });
		const a = [0, 1, 2, 3].map(k => Math.round((gp.axes[k] || 0) * 100) / 100);
		return { b, a };
	};

	// Valeur d'un bouton EmulatorJS d'après l'état de manette reçu (0, 1, ou ±32767 pour les sticks).
	const valueFor = (id, label, st) => {
		if (!label || !st) return 0;
		const k = PAD_LABELS.indexOf(label);
		if (k >= 0) return (st.b >> k) & 1 ? 1 : 0;
		const m = label.match(/^(LEFT|RIGHT)_STICK_([XY]):([+-])1$/);
		if (!m) return 0;
		const v = st.a[AXES.indexOf(`${m[1]}_STICK_${m[2]}`)] || 0;
		const along = m[3] === '+' ? v : -v;
		if (along < 0.15) return 0;
		return ANALOG.includes(id) ? Math.round(0x7fff * Math.min(1, along)) : (along > 0.5 ? 1 : 0);
	};

	// ---------- Statistiques WebRTC ----------

	const stats = async (pc, prev = {}) => {
		const out = { t: Date.now() };
		let report;
		try { report = await pc.getStats(); } catch { return out; }
		const byId = new Map();
		report.forEach(r => byId.set(r.id, r));
		report.forEach((r) => {
			if (r.type === 'candidate-pair' && (r.nominated || r.selected) && r.state === 'succeeded') {
				out.rtt = r.currentRoundTripTime != null ? Math.round(r.currentRoundTripTime * 1000) : out.rtt;
				const local = byId.get(r.localCandidateId);
				const remote = byId.get(r.remoteCandidateId);
				const types = [local && local.candidateType, remote && remote.candidateType];
				out.path = types.includes('relay') ? 'relais' : (types.every(t => t === 'host') ? 'réseau local' : 'directe');
				out.protocol = local && local.protocol;
			}
			if (r.type === 'outbound-rtp' && r.kind === 'video') {
				out.fps = r.framesPerSecond; out.width = r.frameWidth; out.height = r.frameHeight; out.sent = r.bytesSent;
				out.limit = r.qualityLimitationReason; out.encoder = r.encoderImplementation;
				const codec = byId.get(r.codecId); out.codec = codec && codec.mimeType ? codec.mimeType.split('/')[1] : out.codec;
			}
			if (r.type === 'remote-inbound-rtp' && r.kind === 'video') { out.lost = r.packetsLost; out.jitter = r.jitter != null ? Math.round(r.jitter * 1000) : out.jitter; }
			if (r.type === 'inbound-rtp' && r.kind === 'video') {
				out.fps = r.framesPerSecond; out.width = r.frameWidth; out.height = r.frameHeight; out.received = r.bytesReceived;
				out.dropped = r.framesDropped; out.lost = r.packetsLost; out.jitter = r.jitter != null ? Math.round(r.jitter * 1000) : out.jitter;
				out.decoder = r.decoderImplementation;
				out.buffer = r.jitterBufferEmittedCount ? Math.round((r.jitterBufferDelay / r.jitterBufferEmittedCount) * 1000) : out.buffer;
				const codec = byId.get(r.codecId); out.codec = codec && codec.mimeType ? codec.mimeType.split('/')[1] : out.codec;
			}
		});
		const bytes = out.sent ?? out.received;
		if (bytes != null && prev.bytes != null && out.t > prev.t) out.kbps = Math.round(((bytes - prev.bytes) * 8) / (out.t - prev.t));
		out.bytes = bytes;
		return out;
	};

	// Conseil automatique selon les mesures.
	const advice = (s) => {
		if (!s || s.rtt == null) return '';
		if (s.path === 'relais') return '';
		if (s.rtt > 150) return 'Latence élevée : préférez le câble Ethernet et le mode « Réactivité ».';
		if (s.lost > 50 && s.kbps > 6000) return 'Pertes de paquets : baisse la qualité ou ferme les téléchargements en cours.';
		if (s.limit === 'cpu') return 'Le processeur de l’hôte limite l’image : mode « Réactivité » conseillé.';
		if (s.limit === 'bandwidth') return 'Connexion de l’hôte saturée : qualité réduite automatiquement.';
		return '';
	};

	// maxWidth : largeur encodée au plus. Un jeu rétro n'a pas besoin de plus de 960 à 1280 pixels, et une image
	// plus petite s'encode et se transmet plus vite (moins de retard).
	const QUALITY = {
		reactive: { label: 'Réactivité', maxBitrate: 5000000, maxFramerate: 60, maxWidth: 960, degradation: 'maintain-framerate' },
		balanced: { label: 'Équilibré', maxBitrate: 8000000, maxFramerate: 60, maxWidth: 1280, degradation: 'maintain-framerate' },
		quality: { label: 'Qualité', maxBitrate: 14000000, maxFramerate: 60, maxWidth: 1920, degradation: 'balanced' },
		saver: { label: 'Économie', maxBitrate: 2000000, maxFramerate: 30, maxWidth: 854, degradation: 'maintain-framerate' },
	};

	// Débit de départ plus haut : sans lui, WebRTC part de 300 kb/s et l'image reste floue plusieurs secondes.
	const boostStart = (sdp, kbps = 3000) => {
		const pts = [...sdp.matchAll(/^a=rtpmap:(\d+) (?:H264|VP8|VP9|AV1)\/90000/gm)].map(m => m[1]);
		let out = sdp;
		for (const pt of pts) {
			const extra = `x-google-start-bitrate=${kbps};x-google-min-bitrate=800`;
			const fmtp = new RegExp(`^a=fmtp:${pt} (.*)$`, 'm');
			if (fmtp.test(out)) out = out.replace(fmtp, (line, params) => (params.includes('x-google-start-bitrate') ? line : `a=fmtp:${pt} ${params};${extra}`));
			else out = out.replace(new RegExp(`^(a=rtpmap:${pt} .*)$`, 'm'), `$1\r\na=fmtp:${pt} ${extra}`);
		}
		return out;
	};

	// Réception : affichage dès qu'une image arrive, sans tampon de lissage.
	const lowLatency = (receiver) => {
		try { receiver.playoutDelayHint = 0; } catch { /* non pris en charge */ }
		try { receiver.jitterBufferTarget = 0; } catch { /* non pris en charge */ }
	};

	// Codecs proposés : H.264 (souvent encodé par la carte graphique) puis VP8 pour la vidéo, Opus pour le son.
	// Moins de codecs = un code d'invitation plus court (il doit tenir dans un message Discord).
	const preferCodecs = (transceiver, kind = 'video') => {
		try {
			const caps = RTCRtpReceiver.getCapabilities(kind);
			if (!caps || !transceiver.setCodecPreferences) return;
			let list;
			if (kind === 'video') {
				const h264 = caps.codecs.filter(c => c.mimeType === 'video/H264' && /packetization-mode=1/.test(c.sdpFmtpLine || '') && /profile-level-id=42e01f/.test(c.sdpFmtpLine || '')).slice(0, 1);
				const vp8 = caps.codecs.filter(c => c.mimeType === 'video/VP8');
				const rtx = caps.codecs.filter(c => c.mimeType === 'video/rtx').slice(0, 1);
				list = [...h264, ...vp8, ...rtx];
			} else {
				list = caps.codecs.filter(c => c.mimeType === 'audio/opus');
			}
			if (list.length) transceiver.setCodecPreferences(list);
		} catch (e) { console.warn('[smash] codecs', e.message); }
	};

	root.SmashRemote = { ICE, encode, decode, gathered, PAD_LABELS, DEFAULT_PAD, ANALOG, padState, valueFor, stats, advice, QUALITY, preferCodecs, boostStart, lowLatency };
	if (typeof module !== 'undefined' && module.exports) module.exports = root.SmashRemote;
})(typeof window !== 'undefined' ? window : globalThis);
