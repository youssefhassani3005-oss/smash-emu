// Clés personnelles du joueur (API Claude, RetroAchievements) : chiffrées par Windows (safeStorage, lié à la session
// de l'utilisateur) avant d'être écrites dans les réglages. Jamais renvoyées telles quelles à l'interface.
const seal = (text) => {
	if (!text) return '';
	try {
		const { safeStorage } = require('electron');
		if (safeStorage && safeStorage.isEncryptionAvailable()) return `enc:${safeStorage.encryptString(String(text)).toString('base64')}`;
	} catch { /* hors d'Electron (tests) */ }
	return `raw:${Buffer.from(String(text)).toString('base64')}`;
};

const unseal = (value) => {
	if (!value) return '';
	try {
		if (value.startsWith('enc:')) return require('electron').safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'));
		if (value.startsWith('raw:')) return Buffer.from(value.slice(4), 'base64').toString();
	} catch { /* clé illisible : à saisir de nouveau */ }
	return '';
};

// Aperçu affichable : « sk-ant-…a1B2 ».
const preview = (text) => (text ? `${String(text).slice(0, 7)}…${String(text).slice(-4)}` : '');

module.exports = { seal, unseal, preview };
