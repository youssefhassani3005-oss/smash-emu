// Après signature, l'installateur change : on recalcule son empreinte (sha512) et sa taille dans latest.yml,
// sinon la mise à jour automatique refuserait le fichier. Le blockmap (téléchargement partiel) ne correspond
// plus : il est supprimé, electron-updater télécharge alors l'installateur entier.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dir = process.argv[2] || 'dist';
const yml = path.join(dir, 'latest.yml');
let text = fs.readFileSync(yml, 'utf8');
const exe = text.match(/^path:\s*(.+)$/m)[1].trim();
const buf = fs.readFileSync(path.join(dir, exe));
const sha = crypto.createHash('sha512').update(buf).digest('base64');
text = text.replace(/sha512: .+/g, `sha512: ${sha}`).replace(/size: \d+/g, `size: ${buf.length}`);
fs.writeFileSync(yml, text);
for (const f of fs.readdirSync(dir)) if (f.endsWith('.blockmap')) fs.rmSync(path.join(dir, f));
console.log(`latest.yml mis à jour pour ${exe} (${buf.length} octets)`);
