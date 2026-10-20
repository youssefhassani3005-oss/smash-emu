# Signature gratuite avec SignPath Foundation

But : que Windows (Smart App Control, SmartScreen) laisse installer et lancer Smash Emu chez tout le monde.

## 1. Déposer la demande (toi, 5 minutes)

Formulaire : <https://signpath.org/apply> (connexion avec ton compte GitHub).

Réponses à copier :

- **Project name** : Smash Emu
- **Repository** : https://github.com/youssefhassani3005-oss/smash-emu
- **License** : GPL-3.0-or-later (fichier `LICENSE` à la racine)
- **Description** : Free and open-source emulator frontend and launcher for Windows (Electron). It runs games the user dumped from their own consoles with built-in EmulatorJS cores, installs official external emulators (Dolphin, PCSX2, RPCS3…) from their own GitHub releases, and offers remote play, themes and trophies. Smash Emu ships no games, BIOS, firmware or keys.
- **Release builds** : built on GitHub Actions from the public repository (`.github/workflows/release.yml`), installer produced by electron-builder (NSIS).
- **What to sign** : the Windows installer `Smash-Emu-Setup-<version>.exe`.
- **Team** : youssefhassani3005-oss (author, approver).

## 2. Une fois acceptée

Dans SignPath : crée le projet `smash-emu`, la règle de signature `release-signing`, relie le dépôt GitHub (« trusted build system » GitHub Actions) et crée un jeton d’API.

Dans GitHub, onglet **Settings → Secrets and variables → Actions** :

- secret `SIGNPATH_API_TOKEN` = le jeton
- variables `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG` (`smash-emu`), `SIGNPATH_POLICY_SLUG` (`release-signing`)

Ensuite, chaque tag `vX.Y.Z` poussé construit, fait signer et publie la version automatiquement.

## Politique de signature (exigée par SignPath)

Voir la section « Code signing policy » du README.
