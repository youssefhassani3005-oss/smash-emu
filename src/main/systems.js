// Consoles prises en charge : extensions, cœur intégré (EmulatorJS) et émulateurs externes compatibles,
// plus la détection de la console d'un fichier (extension, puis signatures pour les images disque).
const fs = require('fs');
const path = require('path');

// ejs = système EmulatorJS, core = cœur à charger ; external = émulateurs installables, par ordre de préférence.
const SYSTEMS = {
	nes: { label: 'NES', maker: 'Nintendo', year: 1983, ext: ['nes', 'fds', 'unf', 'unif'], ejs: 'nes', core: 'fceumm' },
	snes: { label: 'Super Nintendo', maker: 'Nintendo', year: 1990, ext: ['sfc', 'smc', 'fig', 'swc', 'bs'], ejs: 'snes', core: 'snes9x' },
	n64: { label: 'Nintendo 64', maker: 'Nintendo', year: 1996, ext: ['z64', 'v64', 'n64'], ejs: 'n64', core: 'mupen64plus_next', external: ['project64'] },
	gb: { label: 'Game Boy', maker: 'Nintendo', year: 1989, ext: ['gb'], ejs: 'gb', core: 'gambatte' },
	gbc: { label: 'Game Boy Color', maker: 'Nintendo', year: 1998, ext: ['gbc'], ejs: 'gb', core: 'gambatte' },
	gba: { label: 'Game Boy Advance', maker: 'Nintendo', year: 2001, ext: ['gba'], ejs: 'gba', core: 'mgba' },
	vb: { label: 'Virtual Boy', maker: 'Nintendo', year: 1995, ext: ['vb', 'vboy'], ejs: 'vb', core: 'beetle_vb' },
	nds: { label: 'Nintendo DS', maker: 'Nintendo', year: 2004, ext: ['nds'], ejs: 'nds', core: 'melonds' },
	gc: { label: 'GameCube', maker: 'Nintendo', year: 2001, ext: ['gcm', 'gcz', 'rvz', 'ciso', 'dol'], external: ['dolphin'] },
	wii: { label: 'Wii', maker: 'Nintendo', year: 2006, ext: ['wbfs', 'wad', 'wia'], external: ['dolphin'] },
	'3ds': { label: 'Nintendo 3DS', maker: 'Nintendo', year: 2011, ext: ['3ds', 'cci', 'cia', 'cxi', '3dsx'], external: ['azahar'] },
	wiiu: { label: 'Wii U', maker: 'Nintendo', year: 2012, ext: ['wua', 'wud', 'wux', 'rpx'], external: ['cemu'] },
	switch: { label: 'Nintendo Switch', maker: 'Nintendo', year: 2017, ext: ['nsp', 'xci', 'nca', 'nro'], external: ['ryujinx'] },

	psx: { label: 'PlayStation', maker: 'Sony', year: 1994, ext: ['cue', 'chd', 'pbp', 'ccd', 'm3u', 'ecm'], ejs: 'psx', core: 'pcsx_rearmed', external: ['duckstation'] },
	ps2: { label: 'PlayStation 2', maker: 'Sony', year: 2000, ext: [], external: ['pcsx2'] },
	psp: { label: 'PSP', maker: 'Sony', year: 2004, ext: ['cso'], ejs: 'psp', core: 'ppsspp', threads: true, external: ['ppsspp'] },
	ps3: { label: 'PlayStation 3', maker: 'Sony', year: 2006, ext: ['pkg'], external: ['rpcs3'] },
	ps4: { label: 'PlayStation 4', maker: 'Sony', year: 2013, ext: [], external: ['shadps4'] },

	sms: { label: 'Master System', maker: 'Sega', year: 1986, ext: ['sms'], ejs: 'segaMS', core: 'genesis_plus_gx' },
	md: { label: 'Mega Drive', maker: 'Sega', year: 1988, ext: ['md', 'gen', 'smd', 'sg'], ejs: 'segaMD', core: 'genesis_plus_gx' },
	gg: { label: 'Game Gear', maker: 'Sega', year: 1990, ext: ['gg'], ejs: 'segaGG', core: 'genesis_plus_gx' },
	segacd: { label: 'Mega-CD', maker: 'Sega', year: 1991, ext: [], ejs: 'segaCD', core: 'genesis_plus_gx', bios: true },
	'32x': { label: '32X', maker: 'Sega', year: 1994, ext: ['32x'], ejs: 'sega32x', core: 'picodrive' },
	saturn: { label: 'Saturn', maker: 'Sega', year: 1994, ext: [], ejs: 'segaSaturn', core: 'yabause' },

	pce: { label: 'PC Engine', maker: 'NEC', year: 1987, ext: ['pce', 'sgx'], ejs: 'pce', core: 'mednafen_pce' },
	a2600: { label: 'Atari 2600', maker: 'Atari', year: 1977, ext: ['a26'], ejs: 'atari2600', core: 'stella2014' },
	a7800: { label: 'Atari 7800', maker: 'Atari', year: 1986, ext: ['a78'], ejs: 'atari7800', core: 'prosystem' },
	lynx: { label: 'Atari Lynx', maker: 'Atari', year: 1989, ext: ['lnx'], ejs: 'lynx', core: 'handy' },
	jaguar: { label: 'Atari Jaguar', maker: 'Atari', year: 1993, ext: ['j64', 'jag'], ejs: 'jaguar', core: 'virtualjaguar' },
	'3do': { label: '3DO', maker: 'Panasonic', year: 1993, ext: [], ejs: '3do', core: 'opera', bios: true },

	xbox: { label: 'Xbox', maker: 'Microsoft', year: 2001, ext: ['xiso'], external: ['xemu'] },
	x360: { label: 'Xbox 360', maker: 'Microsoft', year: 2005, ext: ['xex'], external: ['xenia'] },
};

const ORDER = Object.keys(SYSTEMS);
const DISC_EXT = new Set(['iso', 'bin', 'img', 'cue', 'chd']);

const byExt = (ext) => ORDER.filter(id => SYSTEMS[id].ext.includes(ext));

// Lecture de quelques octets à une position donnée (les images disque peuvent faire plusieurs Go).
const readAt = (fd, pos, len) => {
	const buf = Buffer.alloc(len);
	const n = fs.readSync(fd, buf, 0, len, pos);
	return buf.subarray(0, n);
};

const ascii = b => b.toString('latin1');

// Signatures d'images disque. Renvoie { system, sure } ou null.
const sniffDisc = (file) => {
	let fd;
	try { fd = fs.openSync(file, 'r'); } catch { return null; }
	try {
		const size = fs.fstatSync(fd).size;
		const head = readAt(fd, 0, 0x40);
		if (head.length >= 0x20) {
			if (head.readUInt32BE(0x1c) === 0xc2339f3d) return { system: 'gc', sure: true };
			if (head.readUInt32BE(0x18) === 0x5d1c9ea3) return { system: 'wii', sure: true };
			if (ascii(head.subarray(0, 4)) === 'WBFS') return { system: 'wii', sure: true };
			// RVZ / WIA : le type de disque suit l'en-tête (1 = GameCube, 2 = Wii).
			if (/^RVZ|^WIA/.test(ascii(head.subarray(0, 3)))) {
				const type = readAt(fd, 0x48, 4);
				const t = type.length === 4 ? type.readUInt32BE(0) : 0;
				return t === 2 ? { system: 'wii', sure: true } : t === 1 ? { system: 'gc', sure: true } : { system: 'gc', sure: false };
			}
			const h = ascii(head);
			if (h.includes('SEGA SEGASATURN')) return { system: 'saturn', sure: true };
			if (h.includes('SEGADISCSYSTEM')) return { system: 'segacd', sure: true };
			if (head[0] === 0x01 && ascii(head.subarray(1, 6)) === 'ZZZZZ') return { system: '3do', sure: true };
		}
		// Xbox : système de fichiers XDVDFS à 0x10000 (ISO extraite).
		if (ascii(readAt(fd, 0x10000, 20)) === 'MICROSOFT*XBOX*MEDIA') return { system: size > 7.5e9 ? 'x360' : 'xbox', sure: false };
		// ISO 9660 : volume principal au secteur 16 (2048 o) ou en mode brut (2352 o).
		for (const [pvd, sector] of [[0x8000, 2048], [0x9310, 2352]]) {
			const v = readAt(fd, pvd, 0x30);
			if (ascii(v.subarray(1, 6)) !== 'CD001') continue;
			const sysId = ascii(v.subarray(8, 40)).trim();
			if (/PSP GAME/i.test(sysId)) return { system: 'psp', sure: true };
			if (/PLAYSTATION/i.test(sysId)) {
				// CD (≤ 800 Mo, souvent en secteurs bruts) → PS1 ; DVD → PS2.
				return { system: sector === 2352 || size < 850e6 ? 'psx' : 'ps2', sure: true };
			}
			if (/SEGA/i.test(sysId)) return { system: 'saturn', sure: false };
		}
		return null;
	} finally {
		fs.closeSync(fd);
	}
};

// Premier fichier de données cité par un .cue (pour l'analyser et pour l'émulateur intégré).
const cueTracks = (cueFile) => {
	try {
		const dir = path.dirname(cueFile);
		return [...fs.readFileSync(cueFile, 'utf8').matchAll(/FILE\s+"?([^"\r\n]+?)"?\s+(BINARY|MOTOROLA|WAVE)/gi)].map(m => path.join(dir, m[1]));
	} catch { return []; }
};

/**
 * Console d'un fichier : { system, sure, candidates }.
 * sure = false quand il faut demander confirmation (ex. .iso sans signature reconnue).
 */
const detect = (file) => {
	const ext = path.extname(file).slice(1).toLowerCase();
	// Jeux PS3 et PS4 en dossier : on choisit leur eboot.bin (PS3 : …/PS3_GAME/USRDIR/EBOOT.BIN ; PS4 : CUSA…/eboot.bin + sce_sys).
	if (path.basename(file).toLowerCase() === 'eboot.bin') {
		if (/[\\/]USRDIR[\\/]/i.test(file)) return { system: 'ps3', sure: true, candidates: ['ps3'] };
		if (fs.existsSync(path.join(path.dirname(file), 'sce_sys'))) return { system: 'ps4', sure: true, candidates: ['ps4'] };
		return { system: 'ps4', sure: false, candidates: ['ps4', 'ps3'] };
	}
	if (ext === 'cue') {
		const first = cueTracks(file)[0];
		const s = first && sniffDisc(first);
		return s ? { ...s, candidates: [s.system] } : { system: 'psx', sure: false, candidates: ['psx', 'saturn', 'segacd', 'pce', '3do'] };
	}
	if (DISC_EXT.has(ext)) {
		const s = sniffDisc(file);
		if (s) return { ...s, candidates: [s.system] };
		return { system: ext === 'chd' ? 'psx' : null, sure: false, candidates: ['psx', 'ps2', 'psp', 'gc', 'wii', 'saturn', 'segacd', '3do', 'xbox', 'x360'] };
	}
	// Images GameCube / Wii compressées : l'en-tête dit laquelle des deux consoles.
	if (['rvz', 'wia', 'gcm', 'wbfs'].includes(ext)) {
		const s = sniffDisc(file);
		if (s && s.sure) return { ...s, candidates: [s.system] };
	}
	const list = byExt(ext);
	if (list.length) return { system: list[0], sure: list.length === 1, candidates: list };
	return { system: null, sure: false, candidates: [] };
};

const supportedExtensions = () => [...new Set([...ORDER.flatMap(id => SYSTEMS[id].ext), ...DISC_EXT])];

// Moteurs disponibles pour une console : 'smash' (intégré) s'il existe un cœur, puis les émulateurs externes.
const enginesFor = system => [...(SYSTEMS[system] && SYSTEMS[system].ejs ? ['smash'] : []), ...((SYSTEMS[system] && SYSTEMS[system].external) || [])];

module.exports = { SYSTEMS, ORDER, detect, sniffDisc, cueTracks, supportedExtensions, enginesFor };
