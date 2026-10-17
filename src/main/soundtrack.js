// Bandes-son des jeux : vidéos et playlists YouTube (lues dans Smash Emu via le lecteur intégrable)
// et albums de KHInsider (ouverts dans Opera, le site bloque les accès automatisés à ses pages d'album).
const HEADERS = {
	'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
	'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
};

const cache = new Map();

// Nom propre pour la recherche : sans région, version, extension ni « — Nom du hack ».
const cleanTitle = name => name
	.replace(/\.[a-z0-9]{2,4}$/i, '')
	.replace(/\(.*?\)|\[.*?\]/g, ' ')
	.replace(/\s+[—–]\s+.*$/, '')
	.replace(/\s{2,}/g, ' ')
	.trim();

const youtube = async (query) => {
	const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, { headers: HEADERS });
	if (!res.ok) throw new Error(`YouTube a répondu ${res.status}`);
	const html = await res.text();
	const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
	if (!m) return [];
	const out = [];
	const seen = new Set();
	const walk = (o) => {
		if (!o || typeof o !== 'object' || out.length >= 12) return;
		if (o.videoRenderer && !seen.has(o.videoRenderer.videoId)) {
			const v = o.videoRenderer;
			seen.add(v.videoId);
			out.push({
				type: 'video',
				id: v.videoId,
				title: (v.title.runs || []).map(r => r.text).join(''),
				duration: v.lengthText ? v.lengthText.simpleText : '',
				channel: v.ownerText && v.ownerText.runs ? v.ownerText.runs[0].text : '',
				thumb: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
			});
		}
		if (o.lockupViewModel && o.lockupViewModel.contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST' && !seen.has(o.lockupViewModel.contentId)) {
			const l = o.lockupViewModel;
			seen.add(l.contentId);
			const meta = l.metadata && l.metadata.lockupMetadataViewModel;
			out.push({ type: 'playlist', id: l.contentId, title: meta ? meta.title.content : 'Playlist', duration: 'Playlist', channel: '', thumb: null });
		}
		for (const k in o) walk(o[k]);
	};
	walk(JSON.parse(m[1]));
	return out;
};

const khinsider = async (query) => {
	const res = await fetch(`https://downloads.khinsider.com/search?search=${encodeURIComponent(query)}`, { headers: HEADERS });
	if (!res.ok) return [];
	const html = await res.text();
	const seen = new Set();
	return [...html.matchAll(/<a href="(\/game-soundtracks\/album\/[^"]+)">([^<]+)<\/a>/g)]
		.filter(m => !seen.has(m[1]) && seen.add(m[1]))
		.slice(0, 8)
		.map(m => ({ title: m[2].replace(/&amp;/g, '&').replace(/&#0?39;/g, '\''), url: `https://downloads.khinsider.com${m[1]}` }));
};

const search = async (gameName, console = '') => {
	const title = cleanTitle(gameName);
	const key = `${title}|${console}`;
	if (cache.has(key)) return cache.get(key);
	const [videos, albums] = await Promise.all([
		youtube(`${title} ${console} OST soundtrack`.replace(/\s+/g, ' ')).catch(() => []),
		khinsider(title).catch(() => []),
	]);
	const result = { title, videos, albums, youtubeUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} OST`)}` };
	cache.set(key, result);
	return result;
};

module.exports = { search, cleanTitle };
