// Liens de la communauté, lus dans community.json sur GitHub : l'administrateur y met le lien d'invitation du
// serveur Discord et l'Application ID Discord (présence « Joue à Smash Emu »), et toutes les copies installées
// en profitent sans nouvelle version. Un réglage local peut remplacer chaque valeur.
const { net } = require('electron');
const store = require('./store');

const URL_JSON = 'https://raw.githubusercontent.com/youssefhassani3005-oss/smash-emu/main/community.json';
const INVITE = /^https:\/\/(discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]{2,40}$/;
const APP_ID = /^\d{17,21}$/;

let memo = { at: 0, value: null };

const clean = (d = {}) => ({
	discord: INVITE.test(String(d.discord || '')) ? d.discord : '',
	discordAppId: APP_ID.test(String(d.discordAppId || '')) ? String(d.discordAppId) : '',
});

// Valeurs publiées (mises en cache 1 h, et gardées pour le mode hors ligne).
const remote = async () => {
	if (memo.value && Date.now() - memo.at < 3600000) return memo.value;
	try {
		const res = await net.fetch(`${URL_JSON}?t=${Math.floor(Date.now() / 3600000)}`, { signal: AbortSignal.timeout(10000) });
		if (res.ok) {
			const value = clean(await res.json());
			memo = { at: Date.now(), value };
			store.setSettings({ communityCache: value });
			return value;
		}
	} catch { /* hors ligne */ }
	return clean(store.getSettings().communityCache || {});
};

const get = async () => {
	const r = await remote();
	const s = store.getSettings();
	return {
		discord: INVITE.test(s.communityDiscord || '') ? s.communityDiscord : r.discord,
		discordAppId: r.discordAppId,
		published: r,
	};
};

const setLocal = (invite) => {
	const v = String(invite || '').trim();
	if (v && !INVITE.test(v)) throw new Error('Lien d’invitation invalide (ex. https://discord.gg/abcd).');
	store.setSettings({ communityDiscord: v });
	return get();
};

module.exports = { get, setLocal, clean, INVITE, APP_ID };
