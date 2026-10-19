/* global smashEmu, st, emu, gm, toast, log, esc, setPaused, applySpeed */
// Entrées image par image du lecteur intégré : turbo par bouton, macros, films d'entrées (enregistrement et
// relecture), annonces de manettes branchées, et API utilisée par le bot.
//
// Tout passe par deux points d'accroche d'EmulatorJS :
//  - gameManager.simulateInput, enveloppé pour observer les entrées du joueur (clavier et manettes) ;
//  - requestAnimationFrame (qui fait tourner la boucle d'Emscripten), pour passer avant chaque image du cœur
//    et envoyer des entrées à une image précise. Désactivées, ces fonctions ne font rien de plus qu'un test par image.
//
// Déterminisme : à vitesse ×1, une image de boucle = une image du cœur. En avance rapide, le cœur calcule
// plusieurs images par tour de boucle : enregistrement et relecture d'un film forcent donc la vitesse ×1.

(() => {
	const SPECIAL = [16, 17, 18, 19, 20, 21, 22, 23];   // sticks analogiques
	const I = {
		installed: false, raw: null, injecting: false,
		hooks: new Set(),        // fonctions appelées à chaque image : fn(frame)
		observers: new Set(),    // fonctions appelées pour chaque entrée du joueur : fn(p, i, v, frame)
		taps: new Set(),         // toutes les entrées, y compris celles de Smash Emu (enregistrements) : fn(p, i, v, frame)
		turbo: {}, turboHz: 12, held: new Map(), turboOut: new Map(),
		macros: [], macroRec: null, macroSlot: 0, playing: [],
		movie: null,             // { mode: 'rec' | 'play', ... }
	};

	const frame = () => { try { return gm().getFrameNum(); } catch { return -1; } };

	// Entrée envoyée par Smash Emu (macro, film, turbo, bot) : n'est pas vue par les observateurs.
	const send = (p, i, v) => {
		if (!I.raw) return;
		if (I.taps.size) { const f = frame(); for (const t of I.taps) { try { t(p, i, v, f); } catch { /* */ } } }
		I.injecting = true;
		try { I.raw(p, i, v); } finally { I.injecting = false; }
	};

	const install = () => {
		if (I.installed) return true;
		const E = emu();
		const g = gm();
		if (!E || !g) return false;
		// La boucle d'Emscripten avance à chaque requestAnimationFrame : on passe en premier à chaque image affichée,
		// avant le calcul de l'image du cœur, pour envoyer les entrées prévues pour cette image.
		const origRaf = window.requestAnimationFrame.bind(window);
		let lastT = -1;
		window.requestAnimationFrame = cb => origRaf((t) => {
			if (t !== lastT) {
				lastT = t;
				if (I.hooks.size) {
					const f = frame();
					for (const h of [...I.hooks]) { try { h(f); } catch (e) { log('entrées :', e.message); I.hooks.delete(h); } }
				}
			}
			cb(t);
		});
		const raw = g.simulateInput.bind(g);
		I.raw = raw;
		g.simulateInput = (p, i, v) => {
			if (I.taps.size) { const f = frame(); for (const t of I.taps) { try { t(p, i, v, f); } catch { /* */ } } }
			if (!I.injecting) {
				// Un film en relecture : la première action du joueur lui rend la main.
				if (I.movie && I.movie.mode === 'play' && v) stopMovie('Tu as repris la main : relecture arrêtée.');
				const f = frame();
				for (const o of I.observers) { try { o(p, i, v, f); } catch { /* observateur défaillant */ } }
			}
			return raw(p, i, v);
		};
		I.installed = true;
		return true;
	};

	// ---------- Turbo par bouton (réglé dans la page Manettes) ----------

	const turboObserver = (p, i, v) => {
		if (!I.turbo[i] || SPECIAL.includes(i)) return;
		const key = `${p}:${i}`;
		if (v) I.held.set(key, { p, i }); else { I.held.delete(key); I.turboOut.delete(key); }
		syncTurboHook();
	};

	const turboHook = (f) => {
		const half = Math.max(1, Math.round(60 / (2 * I.turboHz)));
		const on = Math.floor(f / half) % 2 === 0 ? 1 : 0;
		for (const [key, { p, i }] of I.held) {
			if (I.turboOut.get(key) === on) continue;
			I.turboOut.set(key, on);
			send(p, i, on);
		}
	};

	const syncTurboHook = () => { if (I.held.size) I.hooks.add(turboHook); else I.hooks.delete(turboHook); };

	const configure = (prof) => {
		I.turbo = Object.fromEntries(Object.entries((prof && prof.turbo) || {}).filter(([, on]) => on).map(([id]) => [+id, true]));
		I.turboHz = (prof && prof.turboHz) || 12;
		I.held.clear();
		syncTurboHook();
		if (Object.keys(I.turbo).length) I.observers.add(turboObserver); else I.observers.delete(turboObserver);
	};

	// ---------- Macros : Ctrl+M enregistre, Ctrl+1 à 4 rejoue ----------

	const releaseAll = (events) => {
		const seen = new Set();
		for (const e of events) {
			const key = `${e.p}:${e.i}`;
			if (seen.has(key)) continue;
			seen.add(key);
			send(e.p, e.i, 0);
		}
	};

	const toggleMacroRecording = async () => {
		if (!install()) return;
		if (I.macroRec) {
			const rec = I.macroRec;
			I.macroRec = null;
			I.taps.delete(rec.observer);
			const length = Math.max(1, frame() - rec.start);
			if (!rec.events.length) { toast('Macro vide : rien n’a été enregistré.', { error: true }); return; }
			// Toutes les touches sont relâchées à la fin de la macro.
			const slot = I.macroSlot;
			I.macros[slot] = { name: `Macro ${slot + 1}`, length, events: rec.events };
			I.macroSlot = (slot + 1) % 4;
			try { I.macros = await smashEmu.setMacros(Array.from({ length: 4 }, (_, k) => I.macros[k] || null)); } catch (e) { toast(esc(e.message), { error: true }); }
			toast(`Macro enregistrée : <b>Ctrl+${slot + 1}</b> (${(length / 60).toFixed(1).replace('.', ',')} s, ${rec.events.length} entrées)`, { ms: 4500 });
			return;
		}
		const rec = { start: frame(), events: [] };
		rec.observer = (p, i, v, f) => rec.events.push({ f: Math.max(0, f - rec.start), p, i, v });
		I.taps.add(rec.observer);
		I.macroRec = rec;
		toast(`● Enregistrement de la macro ${I.macroSlot + 1}… (Ctrl+M pour terminer)`, { ms: 3500 });
	};

	// Rejoue une suite d'entrées à partir de l'image suivante ; renvoie une promesse résolue à la fin.
	// startNow : la première image jouée est l'image en cours (film juste après le chargement de son état) ;
	// onEnd(f) est appelé à l'image de fin, avant que le cœur ne calcule la suivante.
	const playEvents = (events, length, { label = '', startNow = false, onEnd = null } = {}) => new Promise((resolve) => {
		if (!install()) { resolve(false); return; }
		const start = frame() + (startNow ? 0 : 1);
		let k = 0;
		const run = { stop: null };
		const hook = (f) => {
			const rel = f - start;
			while (k < events.length && events[k].f <= rel) { const e = events[k++]; send(e.p, e.i, e.v); }
			if (rel >= length) {
				if (onEnd) { try { onEnd(f); } catch (e) { log('fin de lecture :', e.message); } }
				finish(true);
			}
		};
		const finish = (ok) => {
			I.hooks.delete(hook);
			I.playing = I.playing.filter(x => x !== run);
			releaseAll(events);
			resolve(ok);
		};
		run.stop = () => finish(false);
		I.playing.push(run);
		I.hooks.add(hook);
		if (label) log('lecture :', label);
	});

	const playMacro = async (slot) => {
		const m = I.macros[slot];
		if (!m) { toast(`Aucune macro sur Ctrl+${slot + 1} : enregistre-en une avec Ctrl+M.`, { error: true }); return; }
		toast(`▶ ${esc(m.name)}`, { ms: 1200 });
		await playEvents(m.events, m.length, { label: m.name });
	};

	const clearMacros = async () => {
		I.macros = await smashEmu.setMacros([null, null, null, null]);
		I.macroSlot = 0;
		toast('Macros effacées');
	};

	// ---------- Films d'entrées (TAS) ----------

	// Empreinte d'un état : un octet sur 1024 (16 Ko pour un état N64 de 16 Mo). Les cœurs ne sont pas tous
	// parfaitement déterministes (le cœur N64 diffère de quelques centaines d'octets sur 16 Mo d'une exécution à
	// l'autre) : la comparaison tolère 1 % d'écart. C'est un indicateur, pas une preuve de synchronisation.
	const STEP = 1024;
	const fingerprint = (state) => {
		const out = new Uint8Array(Math.ceil(state.length / STEP));
		for (let k = 0, j = 0; k < state.length; k += STEP, j++) out[j] = state[k];
		let bin = '';
		for (let k = 0; k < out.length; k += 0x8000) bin += String.fromCharCode(...out.subarray(k, k + 0x8000));
		return btoa(bin);
	};
	const similarity = (a, b) => {
		const x = atob(a);
		const y = atob(b);
		if (x.length !== y.length) return 0;
		let same = 0;
		for (let k = 0; k < x.length; k++) if (x.charCodeAt(k) === y.charCodeAt(k)) same++;
		return same / x.length;
	};

	const forceNormalSpeed = () => { try { applySpeed(1); } catch { /* */ } };

	const startMovieRecording = () => {
		if (!install() || I.movie) return;
		forceNormalSpeed();
		const state = gm().getState().slice();
		const m = { mode: 'rec', start: frame(), state, events: [] };
		m.observer = (p, i, v, f) => m.events.push({ f: Math.max(0, f - m.start), p, i, v });
		I.taps.add(m.observer);
		I.movie = m;
		document.body.classList.add('movie-rec');
		toast('● Film d’entrées : enregistrement (vitesse ×1). Recommence l’action pour arrêter.', { ms: 4500 });
	};

	const stopMovieRecording = async () => {
		const m = I.movie;
		if (!m || m.mode !== 'rec') return;
		I.taps.delete(m.observer);
		I.movie = null;
		document.body.classList.remove('movie-rec');
		const frames = frame() - m.start;
		let endPrint = null;
		try { endPrint = fingerprint(gm().getState()); } catch { /* empreinte facultative */ }
		try {
			const name = await smashEmu.saveMovie({ frames, events: m.events, endPrint }, m.state);
			toast(`Film enregistré (${(frames / 60).toFixed(1).replace('.', ',')} s, ${m.events.length} entrées) : <b>${esc(name)}</b>`, { ms: 5000 });
		} catch (e) { toast(`Film non enregistré : ${esc(e.message)}`, { error: true }); }
		applySpeed(st.speed);
	};

	const playMovie = async (name) => {
		if (!install() || I.movie) return;
		const names = name ? [name] : await smashEmu.listMovies();
		if (!names.length) { toast('Aucun film : enregistre-en un d’abord.', { error: true }); return; }
		const { meta, state } = await smashEmu.loadMovie(names[0]);
		if (st.paused) await setPaused(false);
		forceNormalSpeed();
		gm().loadState(new Uint8Array(state));
		const m = { mode: 'play', name: names[0], meta };
		I.movie = m;
		document.body.classList.add('movie-play');
		toast(`▶ Relecture du film ${esc(names[0])} · appuie sur une touche pour reprendre la main`, { ms: 4000 });
		let endState = null;
		m.done = playEvents(meta.events, meta.frames, { label: `film ${names[0]}`, startNow: true, onEnd: () => { endState = gm().getState().slice(); } });
		const ok = await m.done;
		if (I.movie !== m) return;
		I.movie = null;
		document.body.classList.remove('movie-play');
		applySpeed(st.speed);
		if (!ok) return;
		let verdict = 'Film terminé.';
		if (meta.endPrint && endState) {
			const sim = similarity(fingerprint(endState), meta.endPrint);
			const pct = (sim * 100).toFixed(1).replace('.', ',');
			verdict = sim >= 0.99 ? `Film terminé : probablement synchronisé ✓ (état final identique à ${pct} %)` : `Film terminé, mais désynchronisé : l’état final ne correspond qu’à ${pct} %.`;
		}
		toast(verdict, { ms: 5000 });
	};

	const stopMovie = (message) => {
		const m = I.movie;
		if (!m) return;
		if (m.mode === 'rec') { stopMovieRecording(); return; }
		I.movie = null;
		document.body.classList.remove('movie-play');
		for (const run of [...I.playing]) run.stop();
		applySpeed(st.speed);
		if (message) toast(message);
	};

	const toggleMovieRecording = () => (I.movie && I.movie.mode === 'rec' ? stopMovieRecording() : startMovieRecording());

	// ---------- Manettes branchées / débranchées ----------

	const padLabel = (id) => {
		const s = id.toLowerCase();
		const kind = /054c|dualsense|dualshock|playstation/.test(s) ? 'PlayStation' : /xbox|045e|xinput/.test(s) ? 'Xbox' : /057e|nintendo|pro controller|joy-con/.test(s) ? 'Switch' : null;
		const name = id.replace(/\s*\((STANDARD|Vendor).*$/i, '').trim() || 'Manette';
		return kind && !name.toLowerCase().includes(kind.toLowerCase()) ? `${name} (${kind})` : name;
	};
	window.addEventListener('gamepadconnected', (e) => {
		if (!st.started) return;
		toast(`🎮 ${esc(padLabel(e.gamepad.id))} branchée · joueur ${e.gamepad.index + 1}`, { ms: 3500 });
	});
	window.addEventListener('gamepaddisconnected', (e) => {
		if (!st.started) return;
		toast(`Manette débranchée (joueur ${e.gamepad.index + 1}) : partie en pause`, { error: true, ms: 4500 });
		if (!st.paused) setPaused(true);
	});

	// ---------- Raccourcis ----------

	const previous = window.smashKey;
	window.smashKey = (e) => {
		if (e.ctrlKey && !e.altKey) {
			const k = e.key.toLowerCase();
			if (k === 'm' && !e.repeat) { e.preventDefault(); e.stopPropagation(); toggleMacroRecording(); return true; }
			if (/^[1-4]$/.test(e.key) && !e.repeat) { e.preventDefault(); e.stopPropagation(); playMacro(+e.key - 1); return true; }
		}
		return previous ? previous(e) : false;
	};

	window.smashInputs = {
		install, configure, send, frame,
		onFrame: (fn) => { install(); I.hooks.add(fn); return () => I.hooks.delete(fn); },
		observe: (fn) => { install(); I.observers.add(fn); return () => I.observers.delete(fn); },
		tap: (fn) => { install(); I.taps.add(fn); return () => I.taps.delete(fn); },
		playEvents, releaseAll,
		toggleMacroRecording, playMacro, clearMacros,
		toggleMovieRecording, playMovie, stopMovie,
		get recordingMacro() { return !!I.macroRec; },
		get movieMode() { return I.movie ? I.movie.mode : null; },
		start: async () => {
			install();
			try { I.macros = await smashEmu.macros(); } catch { I.macros = []; }
			const free = [0, 1, 2, 3].find(k => !I.macros[k]);
			I.macroSlot = free === undefined ? 0 : free;
			if (st.controls) configure(st.controls);
		},
	};
})();
