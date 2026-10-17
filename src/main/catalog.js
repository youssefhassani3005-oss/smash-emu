// Catalogue en ligne des mods sm64coopdx (mods.sm64coopdx.com, forum XenForo sans API publique).
// Lecture des pages HTML publiques, sans compte.
const BASE = 'https://mods.sm64coopdx.com';
// Le site renvoie « 406 » aux clients sans en-têtes de navigateur.
const HEADERS = {
	'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Launcher64/1.0',
	Accept: 'text/html,application/xhtml+xml,*/*',
	'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
};

const CATEGORIES = [
	{ id: 'game-modes.5', label: 'Modes de jeu', icon: 'gamepad-2' },
	{ id: 'game-mode-levels.12', label: 'Niveaux de modes', icon: 'map' },
	{ id: 'rom-hacks.9', label: 'ROM hacks', icon: 'star' },
	{ id: 'character-select.14', label: 'Character Select', icon: 'users' },
	{ id: 'custom-characters.4', label: 'Personnages', icon: 'user' },
	{ id: 'with-moveset.15', label: 'Avec moveset', icon: 'footprints' },
	{ id: 'movesets.10', label: 'Movesets', icon: 'zap' },
	{ id: 'game-modifiers.6', label: 'Modificateurs de jeu', icon: 'settings-2' },
	{ id: 'player-modifiers.17', label: 'Modificateurs de joueur', icon: 'user-cog' },
	{ id: 'graphics-ui.7', label: 'Graphismes & UI', icon: 'image' },
	{ id: 'audio-music.3', label: 'Audio & musique', icon: 'music' },
	{ id: 'animations.11', label: 'Animations', icon: 'film' },
	{ id: 'dynos.16', label: 'DynOS', icon: 'box' },
	{ id: 'administrative-utility.2', label: 'Utilitaires', icon: 'wrench' },
	{ id: 'command-legacy.18', label: 'Commandes', icon: 'terminal' },
	{ id: 'widdlepets.20', label: 'Widdle Pets', icon: 'paw-print' },
	{ id: 'resources.19', label: 'Ressources', icon: 'library' },
	{ id: 'joke.8', label: 'Blagues', icon: 'laugh' },
];

const SORTS = {
	updated: 'last_update',
	downloads: 'download_count',
	rating: 'rating_weighted',
	newest: 'resource_date',
	title: 'title',
};

const decode = s => (s || '')
	.replace(/&#0*39;/g, '\'').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
	.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&nbsp;/g, ' ');
const stripTags = s => decode((s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const abs = u => !u ? null : u.startsWith('http') ? u : BASE + (u.startsWith('/') ? u : '/' + u);

const get = async (url) => {
	const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
	if (!res.ok) throw new Error(`Le site des mods a répondu ${res.status} pour ${url}`);
	return res;
};
const getHtml = async url => (await get(url)).text();

const idFromSlug = slug => +(slug.match(/\.(\d+)$/) || [])[1] || null;
// Icône conventionnelle de XenForo, si l'auteur en a mis une (sinon l'interface affiche un repli).
const guessIcon = slug => { const id = idFromSlug(slug); return id ? `${BASE}/data/resource_icons/${Math.floor(id / 1000)}/${id}.jpg` : null; };

const parseListItem = (chunk) => {
	const slug = (chunk.match(/href="\/mods\/([^/"]+\.\d+)\/"/) || [])[1];
	if (!slug) return null;
	const title = decode((chunk.match(/data-tp-primary="on">([^<]*)<\/a>/) || [])[1]);
	const version = decode((chunk.match(/data-tp-primary="on">[^<]*<\/a>\s*<span class="u-muted">([^<]*)<\/span>/) || [])[1]);
	const icon = (chunk.match(/<img src="(\/data\/resource_icons\/[^"]+)"/) || [])[1];
	const categoryMatch = chunk.match(/href="\/mods\/categories\/([^/"]+)\/">([^<]*)<\/a>/);
	const rating = parseFloat((chunk.match(/title="([\d.]+) star\(s\)"/) || [])[1]) || 0;
	const ratings = parseInt(((chunk.match(/ratingStarsRow-text">\s*([\d,]+)/) || [])[1] || '0').replace(/,/g, ''), 10);
	const downloads = parseInt(((chunk.match(/<dt>Downloads<\/dt>\s*<dd>([\d,]+)<\/dd>/) || [])[1] || '0').replace(/,/g, ''), 10);
	const updated = +((chunk.match(/metaItem--lastUpdate[\s\S]*?data-timestamp="(\d+)"/) || [])[1] || 0) * 1000;
	return {
		slug,
		id: idFromSlug(slug),
		title,
		version,
		author: decode((chunk.match(/data-author="([^"]*)"/) || [])[1]),
		icon: icon ? abs(icon) : null,
		category: categoryMatch ? { id: categoryMatch[1], label: decode(categoryMatch[2]) } : null,
		tagline: stripTags((chunk.match(/structItem-resourceTagLine">([\s\S]*?)<\/div>/) || [])[1]),
		rating, ratings, downloads, updated,
		url: `${BASE}/mods/${slug}/`,
	};
};

const parsePageCount = html => Math.max(1, ...[...html.matchAll(/(?:[?&;]page=|\/page-)(\d+)/g)].map(m => +m[1]));

const list = async ({ page = 1, sort = 'updated', category = null } = {}) => {
	const base = category ? `${BASE}/mods/categories/${category}/` : `${BASE}/mods/`;
	const params = new URLSearchParams({ order: SORTS[sort] || SORTS.updated, direction: sort === 'title' ? 'asc' : 'desc' });
	if (page > 1) params.set('page', String(page));
	const html = await getHtml(`${base}?${params}`);
	const chunks = html.split('class="structItem structItem--resource').slice(1);
	return { items: chunks.map(parseListItem).filter(Boolean), page, pages: parsePageCount(html) };
};

const search = async (query, page = 1) => {
	const params = new URLSearchParams({ keywords: query, t: 'resource', o: 'relevance' });
	if (page > 1) params.set('page', String(page));
	const html = await getHtml(`${BASE}/search/search?${params}`);
	const rows = html.split('class="contentRow-title"').slice(1);
	const seen = new Set();
	const items = [];
	for (const row of rows) {
		const slug = (row.match(/href="\/mods\/([^/"]+\.\d+)\//) || [])[1];
		if (!slug || seen.has(slug)) continue;
		seen.add(slug);
		const title = stripTags((row.match(/^[^>]*>([\s\S]*?)<\/h3>/) || [])[1]).replace(/^(Mod|Update|Mise à jour)\s*/i, '').replace(/\s+-\s+.*$/, '');
		const snippet = stripTags((row.match(/contentRow-snippet">([\s\S]*?)<\/div>/) || [])[1]);
		const author = decode((row.match(/data-username="([^"]*)"|class="username[^"]*"[^>]*>([^<]*)</) || []).slice(1).find(Boolean));
		const updated = +((row.match(/data-timestamp="(\d+)"/) || [])[1] || 0) * 1000;
		items.push({ slug, id: idFromSlug(slug), title, version: '', author, icon: guessIcon(slug), category: null, tagline: snippet, rating: 0, ratings: 0, downloads: null, updated, url: `${BASE}/mods/${slug}/` });
	}
	return { items, page, pages: parsePageCount(html) };
};

// Extrait le contenu d'un <div class="bbWrapper"> en respectant l'imbrication des div.
const extractDiv = (html, marker) => {
	const start = html.indexOf(marker);
	if (start < 0) return '';
	const open = html.lastIndexOf('<div', start);
	let depth = 0;
	const re = /<\/?div\b[^>]*>/g;
	re.lastIndex = open;
	let m;
	while ((m = re.exec(html))) {
		depth += m[0][1] === '/' ? -1 : 1;
		if (depth === 0) return html.slice(html.indexOf('>', open) + 1, m.index);
	}
	return '';
};

const details = async (slug) => {
	const html = await getHtml(`${BASE}/mods/${slug}/`);
	const meta = name => decode((html.match(new RegExp(`<meta property="og:${name}" content="([^"]*)"`)) || [])[1]);
	const descriptionHtml = extractDiv(html, 'class="bbWrapper"')
		.replace(/(src|href|data-src)="\/(?!\/)/g, `$1="${BASE}/`);
	const info = {};
	for (const m of html.matchAll(/<dl class="pairs pairs--justified[^"]*">\s*<dt>([^<]+)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)) info[stripTags(m[1])] = stripTags(m[2]);
	return {
		slug,
		id: idFromSlug(slug),
		title: stripTags((html.match(/<h1 class="p-title-value">([\s\S]*?)(?:<span class="u-muted">|<\/h1>)/) || [])[1]) || meta('title'),
		version: stripTags((html.match(/<h1 class="p-title-value">[\s\S]*?<span class="u-muted">([^<]*)<\/span>/) || [])[1]),
		icon: abs((html.match(/<img src="(\/data\/resource_icons\/[^"]+)"/) || [])[1]) || null,
		image: meta('image') || null,
		author: decode((html.match(/data-author="([^"]*)"/) || [])[1]) || info.Author || '',
		summary: meta('description'),
		descriptionHtml,
		info,
		url: `${BASE}/mods/${slug}/`,
	};
};

const filenameFrom = (res, fallback) => {
	const cd = res.headers.get('content-disposition') || '';
	const m = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i);
	return m ? decodeURIComponent(m[1]) : fallback;
};

const INSTALLABLE_ASSET = /\.(zip|lua)$/i;

// Mod hébergé sur GitHub : fichiers de la dernière release (API publique, sans compte).
const githubFiles = async (url) => {
	const m = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/#?]+)/);
	if (!m) return null;
	const res = await fetch(`https://api.github.com/repos/${m[1]}/${m[2]}/releases/latest`, { headers: { 'User-Agent': HEADERS['User-Agent'], Accept: 'application/vnd.github+json' } });
	if (!res.ok) return null;
	const rel = await res.json();
	const assets = (rel.assets || []).filter(a => INSTALLABLE_ASSET.test(a.name))
		.map(a => ({ name: a.name, size: `${(a.size / 1048576).toFixed(1)} MB`, url: a.browser_download_url }));
	if (assets.length) return assets;
	return rel.zipball_url ? [{ name: `${m[2]}-${rel.tag_name || 'source'}.zip`, size: 'code source de la release', url: rel.zipball_url }] : null;
};

// Liste les fichiers téléchargeables d'un mod (un seul fichier = téléchargement direct).
// Un mod hébergé ailleurs renvoie { external: url } : il s'ouvre alors dans Opera.
const files = async (slug) => {
	const res = await get(`${BASE}/mods/${slug}/download`);
	if (!res.url.startsWith(BASE)) {
		await res.body?.cancel();
		const fromGithub = await githubFiles(res.url).catch(() => null);
		return fromGithub || [{ name: new URL(res.url).hostname, external: res.url }];
	}
	const type = res.headers.get('content-type') || '';
	if (!type.includes('text/html')) {
		await res.body?.cancel();
		return [{ name: filenameFrom(res, `${slug}.zip`), url: `${BASE}/mods/${slug}/download` }];
	}
	const html = await res.text();
	const out = [];
	for (const row of html.split('class="contentRow"').slice(1)) {
		const href = (row.match(/href="([^"]*\/download\?file=\d+)"/) || [])[1];
		if (!href) continue;
		const name = stripTags((row.match(/contentRow-title">([\s\S]*?)<\/h3>/) || row.match(/<h3[^>]*>([\s\S]*?)<\/h3>/) || [])[1]) || href.split('file=')[1];
		const size = stripTags((row.match(/contentRow-minor[^>]*>([\s\S]*?)<\/div>/) || [])[1]);
		out.push({ name, size, url: abs(decode(href)) });
	}
	return out;
};

const download = async (url, onProgress) => {
	const res = await get(url);
	const name = filenameFrom(res, url.split('/').pop().split('?')[0] || 'mod.zip');
	const total = +res.headers.get('content-length') || 0;
	const parts = [];
	let received = 0;
	for await (const chunk of res.body) {
		parts.push(Buffer.from(chunk));
		received += chunk.length;
		if (onProgress) onProgress({ received, total });
	}
	return { name, data: Buffer.concat(parts) };
};

module.exports = { BASE, CATEGORIES, SORTS, list, search, details, files, download };
