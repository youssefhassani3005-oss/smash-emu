// Pose l'icône Smash Emu sur l'exécutable (rcedit) : la signature d'electron-builder est désactivée
// car son outil exige des liens symboliques que Windows réserve aux comptes privilégiés.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

exports.default = async (context) => {
	const cache = path.join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache', 'winCodeSign');
	const rcedit = fs.existsSync(cache) && fs.readdirSync(cache).map(d => path.join(cache, d, 'rcedit-x64.exe')).find(f => fs.existsSync(f));
	if (!rcedit) { console.warn('rcedit introuvable : icône de l’exécutable non modifiée'); return; }
	const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
	const info = context.packager.appInfo;
	execFileSync(rcedit, [exe, '--set-icon', path.join(context.packager.projectDir, 'src', 'renderer', 'assets', 'icon.ico'),
		'--set-version-string', 'ProductName', info.productName, '--set-version-string', 'FileDescription', info.productName,
		'--set-version-string', 'CompanyName', 'Smash Emu', '--set-file-version', info.version, '--set-product-version', info.version]);
};
