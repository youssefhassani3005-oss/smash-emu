// Pièces Smash : gagnées aux courses de speedrun entre amis et en battant ses records, dépensées dans la Boutique
// en personnalisations de l'interface (accueils, mascotte, cadres, effets, sons). Tout est original : aucune
// marque ni logo de console, seulement des idées de disposition.
const store = require('./store');

const CATALOG = [
	// Accueils complets (disposition, décor, animations).
	{ id: 'home-dash', kind: 'home', name: 'Tableau de bord', price: 300, desc: 'Grande illustration du jeu en fond, rangée de tuiles carrées et cartes larges en dessous.', look: 'linear-gradient(135deg,#1b1b1f 0%,#3a3f47 55%,#8b1e2b 100%)' },
	{ id: 'home-wave', kind: 'home', name: 'Vague', price: 300, desc: 'Fond bleu et vagues lumineuses, la tuile choisie grandit avec son nom à côté.', look: 'linear-gradient(160deg,#0b3a8f 0%,#2f6fd6 60%,#7fb4ff 100%)' },
	{ id: 'home-cosmos', kind: 'home', name: 'Cosmos', price: 400, desc: 'Petites icônes en haut, illustration plein écran, titre géant et rangée « À voir ».', look: 'radial-gradient(circle at 70% 40%,#d23cff 0%,#4b1a8f 45%,#0c0820 100%)' },
	{ id: 'home-manor', kind: 'home', name: 'Manoir', price: 500, desc: 'Liste de jeux en petites capitales sur une image sombre, ambiance survival horror.', look: 'linear-gradient(180deg,#0d0f12 0%,#1f2328 60%,#3b3326 100%)' },
	{ id: 'home-case', kind: 'home', name: 'Mallette', price: 500, desc: 'Tes jeux rangés comme un inventaire dans une mallette, description en bas.', look: 'linear-gradient(180deg,#141414 0%,#2a2a2a 50%,#4a4036 100%)' },
	// Mascotte de l'écran de chargement.
	{ id: 'mascot-gold', kind: 'mascot', name: 'Mascotte dorée', price: 120, desc: 'La petite manette du chargement en or.', look: 'linear-gradient(135deg,#ffe082,#c99700)', color: '#e0b400' },
	{ id: 'mascot-night', kind: 'mascot', name: 'Mascotte nuit', price: 120, desc: 'Bleu nuit avec des reflets violets.', look: 'linear-gradient(135deg,#3949ab,#1a1040)', color: '#4b56c8' },
	{ id: 'mascot-candy', kind: 'mascot', name: 'Mascotte bonbon', price: 120, desc: 'Rose bonbon.', look: 'linear-gradient(135deg,#ff8ad8,#ff4f9a)', color: '#ff5fae' },
	{ id: 'mascot-mint', kind: 'mascot', name: 'Mascotte menthe', price: 120, desc: 'Vert menthe.', look: 'linear-gradient(135deg,#9effd2,#21b47a)', color: '#2ec98a' },
	// Cadre autour de la photo de profil.
	{ id: 'frame-neon', kind: 'frame', name: 'Cadre néon', price: 150, desc: 'Anneau lumineux qui pulse.', look: 'radial-gradient(circle,#0000 55%,#00e5ff 58%,#0000 75%)' },
	{ id: 'frame-gold', kind: 'frame', name: 'Cadre or', price: 250, desc: 'Anneau doré des champions.', look: 'radial-gradient(circle,#0000 55%,#ffd54f 58%,#0000 75%)' },
	{ id: 'frame-rainbow', kind: 'frame', name: 'Cadre arc-en-ciel', price: 200, desc: 'Anneau aux couleurs qui tournent.', look: 'conic-gradient(#ff5252,#ffd740,#69f0ae,#40c4ff,#e040fb,#ff5252)' },
	// Effet sur la tuile choisie.
	{ id: 'select-pulse', kind: 'select', name: 'Halo pulsé', price: 150, desc: 'La tuile choisie respire doucement.', look: 'radial-gradient(circle,#fff8 0%,#0000 70%),#2b2b33' },
	{ id: 'select-shine', kind: 'select', name: 'Reflet', price: 200, desc: 'Un reflet de lumière passe sur la tuile choisie.', look: 'linear-gradient(115deg,#2b2b33 40%,#fff6 50%,#2b2b33 60%)' },
	// Sons des menus (synthétisés, originaux).
	{ id: 'sound-arcade', kind: 'sound', name: 'Sons arcade', price: 150, desc: 'Bips carrés façon borne d’arcade.', look: 'linear-gradient(135deg,#ff3d00,#ffab00)' },
	{ id: 'sound-crystal', kind: 'sound', name: 'Sons cristal', price: 150, desc: 'Notes claires et douces.', look: 'linear-gradient(135deg,#b3e5fc,#7c4dff)' },
	// Titre affiché sous le nom du joueur (et vu par les amis).
	{ id: 'title-runner', kind: 'title', name: 'Titre « Speedrunner »', price: 200, desc: 'Affiché sous ton nom.', look: 'linear-gradient(135deg,#263238,#00bfa5)', text: 'Speedrunner' },
	{ id: 'title-champion', kind: 'title', name: 'Titre « Champion »', price: 400, desc: 'Affiché sous ton nom.', look: 'linear-gradient(135deg,#3e2723,#ffb300)', text: 'Champion' },
	{ id: 'title-legend', kind: 'title', name: 'Titre « Légende »', price: 1000, desc: 'Le plus rare.', look: 'linear-gradient(135deg,#1a0033,#ff00c8,#00e5ff)', text: 'Légende' },
];
// Thèmes de la Boutique (couleurs, police, décor) : définis avec les autres thèmes dans game-themes.js.
for (const t of require('../renderer/game-themes.js').SHOP) {
	CATALOG.push({ id: `theme-${t.id}`, kind: 'theme', name: t.label, price: 200, desc: t.tagline, look: `linear-gradient(135deg, ${t.bg} 0%, ${t.bg} 35%, ${t.accent} 75%, ${t.accent2} 100%)`, theme: t.id });
}
// Styles d'accueil (home-skins.js) : une disposition et une ambiance inspirées d'un accueil de console ou de frontend.
const LAYOUT_LABEL = { row: 'Rangée', grid: 'Grille', cosmos: 'Horizon', dash: 'Tableau', wave: 'Vague', manor: 'Liste', wii: 'Chaînes', case: 'Inventaire', colorful: 'Consoles' };
for (const s of require('../renderer/home-skins.js').LIST) {
	CATALOG.push({ id: `skin-${s.id}`, kind: 'skin', name: s.name, price: 150, desc: `${LAYOUT_LABEL[s.layout] || s.layout} · ${s.credit}`, look: `linear-gradient(135deg, ${s.bg} 0%, ${s.bg2} 45%, ${s.acc} 85%, ${s.acc2} 100%)`, skin: s.id });
}
// Accueils fidèles (home-faithful.js) : mise en page reprise d'un thème communautaire, auteur cité.
for (const f of require('../renderer/home-faithful.js').LIST) {
	CATALOG.push({ id: `faith-${f.id}`, kind: 'faith', name: f.name, price: 300, desc: `D’après « ${f.ref} » (${f.src}, ${f.author}). Image de fond au choix.`, look: `url("previews/faith-${f.id}.jpg") center / cover, linear-gradient(135deg, #222, #444)`, faith: f.id });
}
const KINDS = { faith: 'Accueils fidèles', skin: 'Styles d’accueil', theme: 'Thèmes', home: 'Accueils', mascot: 'Mascotte', frame: 'Cadres', select: 'Effets', sound: 'Sons', title: 'Titres' };

// Gains : une victoire rapporte le plus ; finir une course perdue compte aussi.
const REWARDS = { raceWin: 100, raceFinish: 25, personalBest: 30 };

const cfg = () => {
	const c = store.getSettings().coins || {};
	return { balance: Math.max(0, Math.floor(c.balance || 0)), history: Array.isArray(c.history) ? c.history : [], owned: Array.isArray(c.owned) ? c.owned : [], equipped: c.equipped || {} };
};
const save = c => store.setSettings({ coins: c });

let notify = () => {};
const init = (fn) => { notify = fn; };

const state = () => ({ ...cfg(), catalog: CATALOG, kinds: KINDS, rewards: REWARDS });

const earn = (amount, reason) => {
	const n = Math.floor(amount);
	if (!(n > 0)) return state();
	const c = cfg();
	c.balance += n;
	c.history = [{ at: Date.now(), amount: n, reason: String(reason).slice(0, 80) }, ...c.history].slice(0, 60);
	save(c);
	notify('coins:earned', { amount: n, reason, balance: c.balance });
	notify('coins:update', state());
	return state();
};

const buy = (id) => {
	const item = CATALOG.find(i => i.id === id);
	if (!item) throw new Error('Article inconnu.');
	const c = cfg();
	if (c.owned.includes(id)) throw new Error('Tu l’as déjà.');
	if (c.balance < item.price) throw new Error(`Il te manque ${item.price - c.balance} pièces.`);
	c.balance -= item.price;
	c.owned.push(id);
	c.history = [{ at: Date.now(), amount: -item.price, reason: `Achat : ${item.name}` }, ...c.history].slice(0, 60);
	save(c);
	notify('coins:update', state());
	return equip(item.kind, id);
};

// Équiper (ou retirer avec id = null) un article possédé. Un accueil devient la disposition de l'accueil Console.
const equip = (kind, id) => {
	if (!KINDS[kind]) throw new Error('Catégorie inconnue.');
	const c = cfg();
	if (id && (!c.owned.includes(id) || (CATALOG.find(i => i.id === id) || {}).kind !== kind)) throw new Error('Article non possédé.');
	c.equipped = { ...c.equipped, [kind]: id || null };
	save(c);
	// Un accueil ou un style remplace l'autre : un seul à la fois.
	if (kind === 'home') { store.setSettings({ consoleLayout: id ? id.slice(5) : 'row', consoleSkin: null }); c.equipped = { ...c.equipped, skin: null }; save(c); }
	if (kind === 'faith') { store.setSettings({ consoleFaith: id ? CATALOG.find(i => i.id === id).faith : null, ...(id ? { consoleSkin: null } : {}) }); if (id) { c.equipped = { ...c.equipped, skin: null, home: null }; save(c); } }
	if (kind === 'home' || kind === 'skin') store.setSettings({ consoleFaith: null });
	if (kind === 'skin') { store.setSettings({ consoleSkin: id ? CATALOG.find(i => i.id === id).skin : null }); if (id) { c.equipped = { ...c.equipped, home: null }; save(c); } }
	if (kind === 'theme') store.setSettings({ theme: id ? CATALOG.find(i => i.id === id).theme : 'smash' });
	notify('coins:update', state());
	return state();
};

const equipped = kind => {
	const id = cfg().equipped[kind];
	return id ? CATALOG.find(i => i.id === id) || null : null;
};

module.exports = { init, state, earn, buy, equip, equipped, CATALOG, REWARDS };
