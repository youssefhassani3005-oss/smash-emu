// Mode supporter : un code signé (Ed25519) débloque des avantages (thèmes originaux exclusifs, badge).
// Les codes sont vérifiés hors ligne avec la clé publique ci-dessous ; seul le PC de l'administrateur possède la
// clé privée (Documents\Smash Emu\admin\supporter-private.pem) et peut en créer. Aucun paiement n'est géré ici :
// l'administrateur offre un code à qui il veut (don, cadeau, concours).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');

const PUBLIC_KEY = crypto.createPublicKey({ key: Buffer.from('MCowBQYDK2VwAyEAtKqPdfsr4T81dyP0PelkZWApbGQOr6DSjadz6sLobro=', 'base64'), format: 'der', type: 'spki' });
const ADMIN_DIR = path.join(store.ROOT, 'admin');
const PRIVATE_FILE = path.join(ADMIN_DIR, 'supporter-private.pem');
const ISSUED_FILE = path.join(ADMIN_DIR, 'codes-crees.json');
const TIERS = { supporter: 'Supporter', vip: 'VIP', fondateur: 'Fondateur' };

const b64u = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

// Code : SMASH-SUP-<données>.<signature>, données = JSON { n: nom, t: niveau, i: date, k: identifiant }.
const verify = (code) => {
	const m = String(code || '').trim().match(/^SMASH-SUP-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
	if (!m) throw new Error('Code invalide : il commence par SMASH-SUP-.');
	const data = unb64u(m[1]);
	if (!crypto.verify(null, data, PUBLIC_KEY, unb64u(m[2]))) throw new Error('Ce code n’a pas été signé par Smash Emu.');
	let info;
	try { info = JSON.parse(data.toString('utf8')); } catch { throw new Error('Code abîmé.'); }
	if (!TIERS[info.t]) throw new Error('Niveau inconnu.');
	return { name: String(info.n || '').slice(0, 40), tier: info.t, tierLabel: TIERS[info.t], issuedAt: info.i, id: info.k };
};

const isAdmin = () => fs.existsSync(PRIVATE_FILE);

const status = () => {
	const s = store.getSettings().supporter;
	let active = null;
	if (s && s.code) { try { active = verify(s.code); } catch { active = null; } }
	return { active, admin: isAdmin(), tiers: TIERS };
};

const activate = (code) => {
	const info = verify(code);
	store.setSettings({ supporter: { code: String(code).trim(), at: Date.now() } });
	return { ...status(), activated: info };
};

const deactivate = () => { store.setSettings({ supporter: null }); return status(); };

const issued = () => { try { return JSON.parse(fs.readFileSync(ISSUED_FILE, 'utf8')); } catch { return []; } };

// Administrateur seulement : crée un code signé et le garde dans l'historique local.
const generate = (name, tier = 'supporter') => {
	if (!isAdmin()) throw new Error('Seul le PC administrateur (avec la clé privée) peut créer des codes.');
	if (!TIERS[tier]) throw new Error('Niveau inconnu.');
	const clean = String(name || '').trim().slice(0, 40);
	if (!clean) throw new Error('Indique le pseudo du supporter.');
	const payload = Buffer.from(JSON.stringify({ n: clean, t: tier, i: Date.now(), k: crypto.randomBytes(4).toString('hex') }), 'utf8');
	const key = crypto.createPrivateKey(fs.readFileSync(PRIVATE_FILE));
	const code = `SMASH-SUP-${b64u(payload)}.${b64u(crypto.sign(null, payload, key))}`;
	const list = [{ code, name: clean, tier, at: Date.now() }, ...issued()].slice(0, 500);
	fs.writeFileSync(ISSUED_FILE, JSON.stringify(list, null, 1));
	return { code, list };
};

// Signature de l'administrateur (résumé de la communauté publié pour toutes les copies).
const sign = (data) => {
	if (!isAdmin()) throw new Error('Clé administrateur absente.');
	return crypto.sign(null, data, crypto.createPrivateKey(fs.readFileSync(PRIVATE_FILE)));
};
const signedByAdmin = (data, sig) => { try { return crypto.verify(null, data, PUBLIC_KEY, sig); } catch { return false; } };

module.exports = { verify, status, activate, deactivate, generate, issued, isAdmin, sign, signedByAdmin, b64u, unb64u, TIERS };
