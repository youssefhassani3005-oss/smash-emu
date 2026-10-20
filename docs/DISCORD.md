# Discord pour Smash Emu : serveur communautaire et présence « Joue à Smash Emu »

Deux choses différentes, à faire une seule fois par l’administrateur (toi).

## 1. Le serveur communautaire (bouton « Rejoindre le Discord »)

1. Dans Discord : **+** (Ajouter un serveur) → **Créer le mien** → **Pour un club ou une communauté** → nom : `Smash Emu`.
2. Salons conseillés :
   - `📢 annonces` (lecture seule) : nouvelles versions de Smash Emu.
   - `👋 bienvenue` et `📜 règles` : pas de ROM, pas de BIOS, pas de liens pirates.
   - `🆘 aide` : problèmes d’installation, d’émulateurs, de manettes.
   - `🎨 thèmes` : partage des codes `SMASHTHEME-…` et des fichiers `.smashtheme`.
   - `🎮 trouver-des-joueurs` : codes d’invitation du jeu à distance (`SMASH-INV-…`).
   - `🔀 multiworld` : parties Archipelago (adresse, slots).
   - `🏆 trophées` et `📸 captures`.
   - Salons vocaux : `Partie 1`, `Partie 2`.
3. Rôles conseillés : `Supporter`, `VIP`, `Fondateur` (mêmes noms que les codes supporter), `Modérateur`.
4. Crée une **invitation permanente** : clic droit sur `bienvenue` → Inviter des gens → Modifier le lien → Expire : **Jamais**, Utilisations : **Illimitées**. Tu obtiens `https://discord.gg/xxxx`.
5. Mets ce lien dans **`community.json`** (à la racine du dépôt GitHub) :

   ```json
   { "discord": "https://discord.gg/xxxx", "discordAppId": "" }
   ```

   Toutes les copies de Smash Emu affichent alors le bouton **Rejoindre le Discord** (menu de gauche, tableau de bord, recommandations), sans nouvelle version. Sur ton PC, tu peux aussi le coller dans Tableau de bord → Administration.

## 2. La présence « Joue à Smash Emu »

1. Va sur <https://discord.com/developers/applications> → **New Application** → nom : `Smash Emu` (c’est le nom affiché après « Joue à »).
2. Facultatif : dans **Rich Presence → Art Assets**, ajoute l’icône de Smash Emu.
3. Copie l’**Application ID** (page General Information).
4. Mets-le dans `community.json` (`"discordAppId": "123…"`) : la présence marche alors chez tous les joueurs qui l’activent dans Paramètres → Présence Discord, sans rien coller. Chacun peut aussi utiliser son propre ID dans ses paramètres.

L’Application ID n’est pas un secret (il est visible par tous ceux qui voient la présence). Ne mets **jamais** de « token » ni de « client secret » dans ce fichier.
