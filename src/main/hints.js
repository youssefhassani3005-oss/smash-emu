// Assistant d'indices pendant le jeu : Claude (clé API du joueur) voit l'écran actuel du jeu, connaît le jeu et la
// console, cherche au besoin dans les soluces et wikis du web, et répond en français avec le niveau d'aide demandé
// (coup de pouce, indice précis, solution). Une conversation par jeu lancé, gardée le temps de la session.
const Anthropic = require('@anthropic-ai/sdk');
const store = require('./store');
const secrets = require('./secrets');

const Client = Anthropic.default || Anthropic;

// Modèles proposés : Claude Opus 5.5 par défaut. Prix en dollars par million de jetons (entrée, sortie).
const MODELS = [
	{ id: 'claude-opus-5-5', label: 'Claude Opus 5.5', hint: 'le plus juste (par défaut)', price: [4, 20] },
	{ id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', hint: 'plus rapide, deux fois moins cher', price: [2, 10] },
	{ id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', hint: 'très rapide, quelques centimes par mois', price: [0.1, 0.5] },
];
const SEARCH_PRICE = 0.01; // 10 $ pour 1 000 recherches web
const LEVELS = {
	1: 'Coup de pouce : oriente sans donner la réponse (où regarder, à quoi penser).',
	2: 'Indice précis : dis quoi faire, sans tout le pas à pas.',
	3: 'Solution complète : explique toutes les étapes.',
};

// Consignes fixes (identiques pour tous les jeux, pour profiter du cache) ; le jeu est donné dans la conversation.
const SYSTEM = `Tu es l'assistant d'indices de Smash Emu, un lanceur de jeux vidéo et d'émulateurs. Le joueur est en pleine partie et te demande de l'aide.

Réponds toujours en français, en tutoyant le joueur, avec des phrases simples. Sois bref : trois à six phrases, sauf quand il demande la solution complète. Pas de titres ni de tableaux ; une courte liste est permise pour des étapes.

Chaque question indique le niveau d'aide voulu. Respecte-le strictement :
- Coup de pouce : oriente sans donner la réponse (où regarder, quel objet ou quelle capacité essayer).
- Indice précis : dis quoi faire, sans détailler chaque étape.
- Solution complète : donne toutes les étapes dans l'ordre.
Ne révèle rien de l'histoire ni des surprises au-delà de ce qu'il faut pour répondre.

Une image de l'écran actuel du jeu accompagne souvent la question : sers-t'en pour savoir où il en est. Si l'image et la question ne suffisent pas, pose une seule question courte.

Quand tu n'es pas sûr d'un détail propre au jeu (emplacement, condition, combinaison), vérifie avec la recherche web dans des soluces ou des wikis, et donne la réponse vérifiée. Si le joueur parle d'un succès RetroAchievements, explique comment le débloquer au niveau d'aide demandé.

N'aide jamais à télécharger des jeux, des BIOS ou des clés, et ne cite pas de sites qui en proposent.`;

const conversations = new Map(); // instance → { messages, cost, game }

const config = () => {
	const s = store.getSettings();
	const key = secrets.unseal(s.hintsKey);
	const model = MODELS.some(m => m.id === s.hintsModel) ? s.hintsModel : MODELS[0].id;
	return { key, model, ready: !!key };
};

const publicConfig = () => {
	const c = config();
	return { ready: c.ready, model: c.model, models: MODELS.map(({ id, label, hint }) => ({ id, label, hint })), keyPreview: secrets.preview(c.key), spent: Number(store.getSettings().hintsSpent) || 0 };
};

const setConfig = ({ key, model } = {}) => {
	const patch = {};
	if (key !== undefined) {
		const k = String(key || '').trim();
		if (k && !/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k)) throw new Error('Ce n’est pas une clé API Anthropic (elle commence par « sk-ant- »).');
		patch.hintsKey = k ? secrets.seal(k) : '';
	}
	if (model !== undefined) {
		if (!MODELS.some(m => m.id === model)) throw new Error('Modèle inconnu.');
		patch.hintsModel = model;
	}
	store.setSettings(patch);
	return publicConfig();
};

// Recherche web : variante avec filtrage dynamique sur Opus et Sonnet, variante de base sur Haiku.
const searchTool = model => (model === 'claude-haiku-5-5'
	? { type: 'web_search_20250305', name: 'web_search', max_uses: 3 }
	: { type: 'web_search_20260209', name: 'web_search', max_uses: 3 });

const costOf = (model, usage) => {
	const [pin, pout] = (MODELS.find(m => m.id === model) || MODELS[0]).price;
	const u = usage || {};
	const searches = (u.server_tool_use && u.server_tool_use.web_search_requests) || 0;
	return ((u.input_tokens || 0) * pin + (u.cache_creation_input_tokens || 0) * pin * 1.25 + (u.cache_read_input_tokens || 0) * pin * 0.1 + (u.output_tokens || 0) * pout) / 1e6 + searches * SEARCH_PRICE;
};

const errorText = (error) => {
	if (error instanceof Client.AuthenticationError) return 'Clé API refusée : vérifie-la dans Smash Emu → Succès et indices.';
	if (error instanceof Client.PermissionDeniedError) return 'Cette clé API n’a pas accès à ce modèle.';
	if (error instanceof Client.RateLimitError) return 'Trop de questions d’un coup : réessaie dans quelques secondes.';
	if (error instanceof Client.BadRequestError) return /credit|balance/i.test(error.message) ? 'Crédit épuisé sur ton compte Anthropic (console.anthropic.com → Billing).' : `Demande refusée par l’API : ${error.message}`;
	if (error instanceof Client.APIConnectionError) return 'Pas de connexion à Internet.';
	if (error instanceof Client.APIError) return `Erreur du service (${error.status || '?'}) : ${error.message}`;
	return error.message || String(error);
};

// Question du joueur. image : JPEG en base64 (sans préfixe) ou null. onDelta reçoit le texte au fil de l'eau.
// Renvoie { text, sources, cost, model }.
const ask = async (id, { text, level = 1, image = null, game = {} }, onDelta = () => {}, deps = {}) => {
	const c = config();
	if (!c.ready) throw new Error('Ajoute d’abord ta clé API Anthropic dans Smash Emu → Succès et indices.');
	const question = String(text || '').trim().slice(0, 2000);
	if (!question) throw new Error('Pose une question.');
	const lvl = LEVELS[level] ? Number(level) : 1;
	let conv = conversations.get(id);
	if (!conv || conv.model !== c.model) {
		conv = { messages: [], cost: 0, model: c.model };
		conversations.set(id, conv);
	}
	const content = [];
	if (image) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } });
	const intro = conv.messages.length ? '' : `Jeu : ${game.name || 'inconnu'}${game.console ? ` (console : ${game.console})` : ''}${game.extra ? `. ${game.extra}` : ''}.\n`;
	content.push({ type: 'text', text: `${intro}[Niveau d'aide demandé : ${LEVELS[lvl]}]\n${question}` });
	conv.messages.push({ role: 'user', content });
	const start = conv.messages.length;

	const client = deps.client || new Client({ apiKey: c.key, maxRetries: 2, timeout: 120000 });
	const params = {
		model: c.model,
		max_tokens: 16000,
		cache_control: { type: 'ephemeral' },
		system: SYSTEM,
		tools: [searchTool(c.model)],
		output_config: { effort: 'medium' },
		messages: conv.messages,
	};
	// Si le modèle décline une question (filtres de sécurité), l'API la confie à un autre modèle au lieu d'échouer.
	if (c.model !== 'claude-haiku-5-5') { params.betas = ['server-side-fallback-2026-07-01']; params.fallbacks = 'default'; }

	let answer = '';
	const sources = new Map();
	let cost = 0;
	try {
		for (let turn = 0; turn < 4; turn++) {
			const stream = client.beta.messages.stream({ ...params, messages: conv.messages });
			stream.on('text', (d) => { answer += d; onDelta(d); });
			const msg = await stream.finalMessage();
			cost += costOf(c.model, msg.usage);
			if (msg.stop_reason === 'refusal') {
				conv.messages.splice(start - 1);
				return { text: 'Je ne peux pas répondre à cette question.', sources: [], cost, model: c.model };
			}
			conv.messages.push({ role: 'assistant', content: msg.content });
			for (const b of msg.content) {
				for (const cit of (b.type === 'text' && b.citations) || []) if (cit.url && !sources.has(cit.url)) sources.set(cit.url, cit.title || cit.url);
			}
			// Recherche web encore en cours côté serveur : on relance sans rien ajouter, l'API reprend où elle en était.
			if (msg.stop_reason !== 'pause_turn') break;
		}
	} catch (error) {
		// La question sans réponse est retirée : la conversation reste valable pour la suivante.
		conv.messages.splice(start - 1);
		throw new Error(errorText(error));
	}
	conv.cost += cost;
	store.setSettings({ hintsSpent: Math.round(((Number(store.getSettings().hintsSpent) || 0) + cost) * 10000) / 10000 });
	return { text: answer.trim(), sources: [...sources].slice(0, 5).map(([url, title]) => ({ url, title })), cost, total: conv.cost, model: c.model };
};

const reset = (id) => { conversations.delete(id); };
const has = id => conversations.has(id) && conversations.get(id).messages.length > 0;

module.exports = { ask, reset, has, config: publicConfig, setConfig, MODELS, SYSTEM, costOf, searchTool };
