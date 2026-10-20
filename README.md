# Smash Emu

N64 emulator and mod launcher with a red-and-black pixel-art interface (layout inspired by Modrinth App).

## Launching

The **Smash Emu** shortcut on the desktop starts the app. From this folder:

```bash
npm install
npm run prepare-assets
npm start
```

`npm run prepare-assets` regenerates the icons (Lucide), copies the fonts (Inter, Press Start 2P) and draws the app icon from the pixel logo (`src/renderer/logo.js`). Backend tests: `npm test`.

`--play=<instance-id>` launches a game directly (for per-game shortcuts).

## Features

| Area | What Smash Emu does |
|---|---|
| **Consoles** | Built in (Smash Emu window): NES, Super Nintendo, Nintendo 64, Game Boy / Color / Advance, Virtual Boy, DS, PlayStation, PSP, Master System, Mega Drive, Game Gear, Mega-CD, 32X, Saturn, PC Engine, Atari 2600 / 7800 / Lynx / Jaguar, 3DO. Through an external emulator detected on the PC: GameCube and Wii (Dolphin), 3DS (Azahar), Wii U (Cemu), Switch (Ryujinx), PS1 (DuckStation, optional), PS2 (PCSX2), PSP (PPSSPP, optional), PS3 (RPCS3), Xbox (xemu), Xbox 360 (Xenia) |
| **ROMs** | Library of games: import of `.z64/.v64/.n64` files and zips (auto-extracted), drag-and-drop, detection in Downloads and Opera downloads, identification (title, region, MD5), conversion to `.z64`, duplicate detection, generated cover, one-click "Jouer" |
| **Built-in emulator** | Game window based on EmulatorJS cores: pause menu, speed ×0.25 to ×8, turbo (hold Space), 8 save-state slots with thumbnails, screenshots, video recording, reset, volume, fullscreen, keyboard/gamepad remapping per console (Manettes page) |
| **In-game saves** | The copy on disk (`instances\<id>\saves\game.srm`) is the reference: written every 30 s and on close, put back into the game when it differs, rotating backups (10 by default), import/export, restore, optional mirror in a cloud folder (Dropbox, Drive, OneDrive, Syncthing) where the most recent version wins |
| **Instances** | Modrinth-style creation (icon, name, game, ROM from the library, group); ROM engine **Smash Emu** or **Project64**; play time, logs |
| **SM64 Coop DX** | One save folder per instance (`--savepath`), Lua mods, DynOS packs, player name, host/join |
| **ROM hacks** | IPS/BPS patches you can toggle and reorder, applied to the ROM at launch |
| **Discover** | mods.sm64coopdx.com catalogue (categories, sorting, search, mod page, Install button, GitHub-hosted mods) |
| **Opera search** | Search in Opera; mods and ROMs downloaded there get **Installer** or **Ajouter aux ROM** buttons |
| **Themes** | 7 base themes, 40 illustrated game themes (automatic per game), 4 supporter themes, and a custom theme editor (colours, font, icons, animated decor, your own background and illustration images, shareable as a code or a `.smashtheme` file) |
| **External emulators** | One-click install and update from the official sources (PCSX2, RPCS3, xemu, shadPS4, Xenia Canary, DuckStation, Azahar, Cemu, PPSSPP, Ryujinx); the emulator window is embedded under the Smash Emu bar (pause, states, turbo, screenshots) with help when a BIOS or firmware is missing |
| **Remote play** | Host a game and let up to 3 friends join as players 2–4 over WebRTC (video, audio, controllers, text and voice chat), with copy-paste invitation codes |
| **Multiworld** | Archipelago client: follow a multiworld game (items sent and received, notifications, hints, chat) and install the official Archipelago launcher |
| **Dashboard** | Play time, 30-day activity, favourite hours, time per console, top games, library, emulators, storage, trophies; supporter codes and admin tools |
| **Trophies** | Per-game play-time tiers (10 min to 100 h) and global trophies, unlocked live |
| **Music** | Game soundtracks in a persistent player (queue, shuffle, repeat, favourites), paused automatically while playing |
| **Discord** | Rich Presence ("Playing Smash Emu" with the game, console, cover and timer) and a "Join the Discord" button driven by `community.json` (see `docs/DISCORD.md`) |

### Game window shortcuts

| Key | Action |
|---|---|
| `Échap` / `P` | Pause menu |
| `F5` / `F7` | Save / load the active state |
| `F6` | Next slot |
| `F3` (`Shift+F3`) | Next (previous) speed |
| `Space` held | Turbo ×3 |
| `F11` / `F12` | Fullscreen / screenshot |
| `F1` | Shortcuts and N64 controller layout |
| `Shift+F2` | Statistics overlay (FPS, frame time graph, CPU, memory, audio latency) |
| `Ctrl+M` / `Ctrl+1`…`4` | Record a macro / replay macro 1–4 |
| `Ctrl+B` | Learning bot (explores the game on its own) |

## Where the data lives

`Documents\Smash Emu\` (data from `Documents\Launcher 64` is migrated automatically):

- `smash-emu.json`: settings
- `roms\`: ROM library (`index.json` + `.z64` files)
- `bios\<console>\`: optional BIOS files from your own consoles (Mega-CD, 3DO…), used by the built-in emulator
- `instances\<id>\`: mods, patches, ROM, `states\` (save states), `saves\` (in-game save `game.srm`, `save.json`, `backups\`), `screenshots\`, `videos\`
- `<cloud folder>\Smash Emu\saves\<id>\`: mirror of the in-game saves when a cloud folder is chosen
- `app-data\`: the emulator's internal data (working copy of in-game saves, key mappings)

Smash Emu ships no games: use ROMs dumped from your own cartridges.

## Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org) (once the application is approved).

- Committers and reviewers: [youssefhassani3005-oss](https://github.com/youssefhassani3005-oss)
- Approvers: [youssefhassani3005-oss](https://github.com/youssefhassani3005-oss)
- Only installers built by GitHub Actions from this public repository (`.github/workflows/release.yml`) are signed.

**Privacy policy:** at startup Smash Emu only reads public files from this GitHub repository (update check, `community.json`). It sends no personal data. Other network features (cover art, emulator downloads, remote play, Archipelago, Discord presence) only run when the user turns them on or uses them.

## License

GPL-3.0-or-later (see `LICENSE`).

## Known limits

- The built-in emulator runs in the browser engine (WebAssembly): very demanding games may be smoother with Project64 (selectable per instance).
- The mod catalogue reads the public pages of mods.sm64coopdx.com (there is no official API).
- xdelta patches are not supported (IPS and BPS only).
