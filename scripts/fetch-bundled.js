// Récupère les émulateurs livrés dans l'installateur de Smash Emu (build\bundled\<id>), depuis leur dépôt
// officiel, à une version figée dont l'empreinte SHA-256 est vérifiée. Lancé avant chaque construction.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

const ROOT = path.join(__dirname, '..');
const BUNDLED = [
	{
		id: 'citron',
		// Citron Neo (émulateur Switch libre, GPL-3.0) : https://github.com/citron-neo/emulator
		url: 'https://github.com/citron-neo/emulator/releases/download/2026-04-27/Citron-windows-nightly-0237a9b88-x64-msvc.zip',
		sha256: '0d2c9bf3dabacfc7a729df38a6f97d5f88417ffab05ffb064cf930135f6d1acb',
		check: 'citron.exe',
	},
];

const main = async () => {
	for (const b of BUNDLED) {
		const dir = path.join(ROOT, 'build', 'bundled', b.id);
		if (fs.existsSync(path.join(dir, b.check))) { console.log(`${b.id} : déjà présent`); continue; }
		const res = await fetch(b.url, { redirect: 'follow' });
		if (!res.ok) throw new Error(`${b.id} : téléchargement impossible (${res.status})`);
		const buf = Buffer.from(await res.arrayBuffer());
		const sum = crypto.createHash('sha256').update(buf).digest('hex');
		if (sum !== b.sha256) throw new Error(`${b.id} : empreinte inattendue (${sum}), fichier refusé`);
		const zip = new AdmZip(buf);
		for (const e of zip.getEntries()) {
			const dest = path.resolve(dir, e.entryName);
			if (dest !== dir && !dest.startsWith(dir + path.sep)) throw new Error(`${b.id} : archive invalide`);
		}
		fs.mkdirSync(dir, { recursive: true });
		zip.extractAllTo(dir, true);
		if (!fs.existsSync(path.join(dir, b.check))) throw new Error(`${b.id} : ${b.check} introuvable dans l'archive`);
		console.log(`${b.id} : prêt (${(buf.length / 1048576).toFixed(1)} Mo)`);
	}
};

main().catch((e) => { console.error(e.message); process.exit(1); });
