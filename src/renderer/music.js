/* global state, api, icon, esc, toast */
// Lecteur de musique permanent : bandes-son YouTube (lecteur intégrable youtube-nocookie piloté par messages),
// file d'attente, aléatoire, répétition, volume, favoris, et pause automatique pendant une partie.

const music = { queue: [], index: -1, playing: false, volume: 70, shuffle: false, repeat: 'off', panel: '', time: 0, duration: 0, pausedForGame: false, listenTimer: null };

const mItem = () => music.queue[music.index] || null;
const mKey = it => `${it.type}:${it.id}`;
const mFavs = () => (state.settings && state.settings.musicFavs) || [];
const mIsFav = it => !!it && mFavs().some(f => mKey(f) === mKey(it));
const mFmt = s => (Number.isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

const mSrc = it => (it.type === 'playlist'
	? `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(it.id)}&autoplay=1&enablejsapi=1&playsinline=1`
	: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(it.id)}?autoplay=1&enablejsapi=1&playsinline=1`);

const mDock = () => {
	let d = document.getElementById('music-dock');
	if (!d) {
		document.body.insertAdjacentHTML('beforeend', '<div id="music-dock" class="music-dock hidden"><div class="md-video" id="md-video"></div><div class="md-bar" id="md-bar"></div><div class="md-panel hidden" id="md-panel"></div></div>');
		d = document.getElementById('music-dock');
	}
	return d;
};

const mFrame = () => document.querySelector('#md-video iframe');
const mCmd = (func, args = []) => { const f = mFrame(); if (f && f.contentWindow) f.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args, id: 'smash', channel: 'widget' }), '*'); };

// Le lecteur YouTube n'envoie son état qu'après un message « listening ».
const mListen = () => {
	clearInterval(music.listenTimer);
	let n = 0;
	music.listenTimer = setInterval(() => {
		const f = mFrame();
		if (f && f.contentWindow) f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'smash', channel: 'widget' }), '*');
		if (++n > 20) clearInterval(music.listenTimer);
	}, 400);
};

window.addEventListener('message', (e) => {
	if (!/youtube(-nocookie)?\.com$/.test(new URL(e.origin || 'http://x').hostname)) return;
	let m;
	try { m = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
	if (!m || !m.event) return;
	if (m.event === 'onReady') { clearInterval(music.listenTimer); mCmd('setVolume', [music.volume]); }
	const info = m.event === 'infoDelivery' ? m.info || {} : m.event === 'onStateChange' ? { playerState: m.info } : {};
	if (info.currentTime !== undefined) music.time = info.currentTime;
	if (info.duration) music.duration = info.duration;
	if (info.playerState !== undefined) {
		clearInterval(music.listenTimer);
		if (info.playerState === 1) music.playing = true;
		if (info.playerState === 2) music.playing = false;
		if (info.playerState === 0) mEnded();
		mRenderBar();
	} else mProgress();
});

const mEnded = () => {
	const it = mItem();
	if (it && it.type === 'playlist') return; // la playlist YouTube enchaîne seule
	if (music.repeat === 'one') { mCmd('seekTo', [0, true]); mCmd('playVideo'); return; }
	mNext(true);
};

const mPlayIndex = (i) => {
	if (!music.queue.length) return;
	music.index = (i + music.queue.length) % music.queue.length;
	music.time = 0;
	music.duration = 0;
	music.playing = true;
	music.pausedForGame = false;
	mDock().classList.remove('hidden');
	document.getElementById('md-video').innerHTML = `<iframe src="${mSrc(mItem())}" allow="autoplay; encrypted-media" title="Lecteur"></iframe>`;
	mFrame().addEventListener('load', mListen);
	mRenderBar();
	if (music.panel) mRenderPanel();
};

const mNext = (auto = false) => {
	const it = mItem();
	if (it && it.type === 'playlist' && !auto) { mCmd('nextVideo'); return; }
	if (music.shuffle && music.queue.length > 1) {
		let j = music.index;
		while (j === music.index) j = Math.floor(Math.random() * music.queue.length);
		mPlayIndex(j);
		return;
	}
	if (music.index + 1 >= music.queue.length && music.repeat === 'off' && auto) { music.playing = false; mRenderBar(); return; }
	mPlayIndex(music.index + 1);
};
const mPrev = () => {
	const it = mItem();
	if (it && it.type === 'playlist') { mCmd('previousVideo'); return; }
	if (music.time > 4) { mCmd('seekTo', [0, true]); return; }
	mPlayIndex(music.index - 1);
};
const mToggle = () => {
	if (!mItem()) return;
	if (music.playing) mCmd('pauseVideo'); else mCmd('playVideo');
	music.playing = !music.playing;
	music.pausedForGame = false;
	mRenderBar();
};

// API pour le reste de l'application : lancer une liste (bande-son d'un jeu), ajouter à la file.
const musicPlay = (items, start = 0, game = '') => {
	music.queue = items.map(it => ({ ...it, game: it.game || game }));
	mPlayIndex(start);
};
const musicEnqueue = (it, game = '') => {
	music.queue.push({ ...it, game: it.game || game });
	if (music.index < 0) mPlayIndex(music.queue.length - 1);
	else { toast(`Ajouté à la file : ${esc(it.title)}`); mRenderBar(); if (music.panel === 'queue') mRenderPanel(); }
};
const musicToggleFav = async (it) => {
	if (!it) return;
	const favs = mFavs();
	const list = mIsFav(it) ? favs.filter(f => mKey(f) !== mKey(it)) : [{ id: it.id, type: it.type, title: it.title, thumb: it.thumb || null, game: it.game || '', duration: it.duration || '' }, ...favs].slice(0, 300);
	state.settings = await api('settings:set', { musicFavs: list });
	toast(mIsFav(it) ? `Ajouté aux favoris : ${esc(it.title)}` : 'Retiré des favoris');
	mRenderBar();
	if (music.panel === 'favs') mRenderPanel();
};
const musicOpenFavs = () => { mDock().classList.remove('hidden'); music.panel = 'favs'; mRenderBar(); mRenderPanel(); };

const mProgress = () => {
	const p = document.getElementById('md-prog');
	if (p) p.style.width = `${music.duration ? Math.min(100, (music.time / music.duration) * 100) : 0}%`;
	const t = document.getElementById('md-time');
	if (t) t.textContent = `${mFmt(music.time)} / ${mFmt(music.duration)}`;
};

const mRenderBar = () => {
	const bar = document.getElementById('md-bar');
	if (!bar) return;
	const it = mItem();
	const btn = (act, ic, tip, on = false) => `<button class="md-btn ${on ? 'on' : ''}" data-md="${act}" data-tip="${tip}">${icon(ic)}</button>`;
	bar.innerHTML = `
		<div class="md-art">${it && it.thumb ? `<img src="${esc(it.thumb)}" alt="">` : icon('music')}</div>
		<div class="md-meta"><b>${esc(it ? it.title : 'Aucune musique')}</b><span>${esc(it ? [it.game, music.pausedForGame ? 'en pause pendant le jeu' : ''].filter(Boolean).join(' · ') : 'Ajoute des favoris depuis la bande-son d’un jeu')}</span>
			<div class="md-track"><div class="md-progress"><i id="md-prog"></i></div><small id="md-time"></small></div></div>
		<div class="md-ctrls">
			${btn('prev', 'skip-back', 'Précédent')}
			<button class="md-btn md-play" data-md="toggle" data-tip="${music.playing ? 'Pause' : 'Lecture'}">${icon(music.playing ? 'pause' : 'play')}</button>
			${btn('next', 'skip-forward', 'Suivant')}
			${btn('shuffle', 'shuffle', 'Aléatoire', music.shuffle)}
			${btn('repeat', 'repeat', music.repeat === 'one' ? 'Répéter ce morceau' : music.repeat === 'all' ? 'Répéter la file' : 'Répétition désactivée', music.repeat !== 'off')}
			${btn('fav', 'heart', mIsFav(it) ? 'Retirer des favoris' : 'Ajouter aux favoris', mIsFav(it))}
			<input type="range" class="md-vol" min="0" max="100" value="${music.volume}" data-tip="Volume">
			${btn('queue', 'list-music', 'File d’attente', music.panel === 'queue')}
			${btn('favs', 'library', 'Mes favoris', music.panel === 'favs')}
			${btn('video', 'monitor', 'Afficher la vidéo', mDock().classList.contains('show-video'))}
			${btn('close', 'x', 'Fermer le lecteur')}
		</div>`;
	const vol = bar.querySelector('.md-vol');
	vol.oninput = () => { music.volume = +vol.value; mCmd('setVolume', [music.volume]); try { localStorage.setItem('smash-music-vol', vol.value); } catch { /* */ } };
	mProgress();
};

const mRenderPanel = () => {
	const p = document.getElementById('md-panel');
	if (!p) return;
	p.classList.toggle('hidden', !music.panel);
	if (!music.panel) return;
	const list = music.panel === 'queue' ? music.queue : mFavs();
	p.innerHTML = `<div class="md-panel-head"><b>${music.panel === 'queue' ? `File d’attente · ${list.length}` : `Mes favoris · ${list.length}`}</b>${music.panel === 'favs' && list.length ? `<button class="btn sm" data-md="play-favs">${icon('play')}Tout lire</button>` : ''}</div>
		<div class="md-list">${list.length ? list.map((it, i) => `<div class="md-row ${music.panel === 'queue' && i === music.index ? 'on' : ''}">
			<button class="md-row-main" data-md="${music.panel === 'queue' ? 'goto' : 'play-fav'}" data-i="${i}">${it.thumb ? `<img src="${esc(it.thumb)}" alt="">` : `<span class="md-pl">${icon('layers')}</span>`}<span class="grow"><b>${esc(it.title)}</b><small>${esc([it.game, it.type === 'playlist' ? 'Playlist' : it.duration].filter(Boolean).join(' · '))}</small></span></button>
			${music.panel === 'queue' ? `<button class="md-btn" data-md="remove" data-i="${i}" data-tip="Retirer">${icon('x')}</button>` : `<button class="md-btn on" data-md="unfav" data-i="${i}" data-tip="Retirer des favoris">${icon('heart')}</button>`}
		</div>`).join('') : `<div class="small muted" style="padding:12px">${music.panel === 'queue' ? 'La file est vide.' : 'Aucun favori : ouvre la bande-son d’un jeu et clique sur le cœur.'}</div>`}</div>`;
};

document.addEventListener('click', (e) => {
	const b = e.target.closest('[data-md]');
	if (!b) return;
	const i = +b.dataset.i;
	switch (b.dataset.md) {
		case 'toggle': mToggle(); break;
		case 'next': mNext(); break;
		case 'prev': mPrev(); break;
		case 'shuffle': music.shuffle = !music.shuffle; mRenderBar(); break;
		case 'repeat': music.repeat = { off: 'all', all: 'one', one: 'off' }[music.repeat]; mRenderBar(); break;
		case 'fav': musicToggleFav(mItem()); break;
		case 'queue': case 'favs': music.panel = music.panel === b.dataset.md ? '' : b.dataset.md; mRenderBar(); mRenderPanel(); break;
		case 'video': mDock().classList.toggle('show-video'); mRenderBar(); break;
		case 'close': mCmd('pauseVideo'); music.playing = false; document.getElementById('md-video').innerHTML = ''; music.queue = []; music.index = -1; music.panel = ''; mRenderPanel(); mDock().classList.add('hidden'); break;
		case 'goto': mPlayIndex(i); break;
		case 'remove': music.queue.splice(i, 1); if (i < music.index) music.index--; else if (i === music.index) mPlayIndex(music.index); mRenderPanel(); mRenderBar(); break;
		case 'play-fav': musicPlay(mFavs(), i); break;
		case 'play-favs': musicPlay(mFavs(), 0); break;
		case 'unfav': musicToggleFav(mFavs()[i]); break;
		default: break;
	}
});

// Pause automatique quand un jeu démarre, reprise quand tous les jeux sont fermés.
window.launcher.on('run:status', (running) => {
	if (!mItem() || (state.settings && state.settings.musicPauseInGame === false)) return;
	if (running.length && music.playing) { mCmd('pauseVideo'); music.playing = false; music.pausedForGame = true; mRenderBar(); }
	else if (!running.length && music.pausedForGame) { mCmd('playVideo'); music.playing = true; music.pausedForGame = false; mRenderBar(); }
});

try { music.volume = +(localStorage.getItem('smash-music-vol') || 70); } catch { /* */ }
mDock();
mRenderBar();

Object.assign(ACTIONS, {
	'music-dock': () => {
		const d = mDock();
		if (!d.classList.contains('hidden') && !mItem()) { d.classList.add('hidden'); music.panel = ''; mRenderPanel(); return; }
		if (mItem()) { d.classList.toggle('hidden'); return; }
		musicOpenFavs();
	},
});
