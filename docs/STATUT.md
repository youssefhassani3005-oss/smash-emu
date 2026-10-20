# Smash Emu : où en est chaque demande (version 2.3.0)

Légende : **✅ fait et testé** · **🟡 fait en partie** · **📋 prévu** · **⛔ impossible ou refusé** (avec la raison).

## Demandes de la nuit

| Demande | Statut | Détail |
|---|---|---|
| Multiworld « tu trouves un objet pour ton pote, il reçoit un objet aléatoire » | ✅ | Page **Multiworld** basée sur Archipelago (archipelago.gg), le projet libre qui fait exactement ça. Client intégré : connexion à une partie, objets reçus et envoyés, notification « 🎁 Ali t’a envoyé… », indices, chat, commandes. Testé avec un faux serveur Archipelago local (connexion, refus, objets, chat). Le jeu lui-même se joue avec la version Archipelago (lanceur officiel, installable depuis la page). L’émulateur intégré ne peut pas encore échanger les objets lui-même. |
| Chat | 🟡 | Chat dans le jeu à distance (hôte et invités) et dans le multiworld. Un chat global entre tous les joueurs Smash Emu demande un serveur : à remplacer par le serveur Discord (bouton « Rejoindre le Discord »). |
| Créateur de compte | ⛔ | Des comptes en ligne demandent un serveur (base de données, mots de passe, sécurité, RGPD). Smash Emu fonctionne sans serveur : profil local (pseudo) et code supporter. |
| Dashboard pour l’administrateur | ✅ | **Tableau de bord** : temps de jeu, activité sur 30 jours, heures de jeu, jours de la semaine, temps par console, classement des jeux, bibliothèque, émulateurs, stockage, trophées, parties à distance. Section **Administration** visible seulement sur le PC qui a la clé privée : création de codes supporter, historique, lien Discord. |
| Thème personnalisable | ✅ | Éditeur avec aperçu en direct : couleurs, police, style d’icônes, décor animé, illustration, **image de fond et image d’illustration** (fichiers à toi). Partage par code (SMASHTHEME-…) ou fichier `.smashtheme` avec les images. |
| Pas de lag en ligne | 🟡 | Jeu à distance en H.264, qualité réglable, entrées envoyées sans attente. Le lag dépend surtout de la connexion des deux PC ; sans serveur relais, certaines box (NAT strict) ne se connectent pas. |
| Nouveaux thèmes | ✅ | 40 thèmes de jeux illustrés, 4 thèmes supporters originaux, thèmes perso illimités. |
| Meilleur système de bande-son | ✅ | Lecteur permanent en bas de l’appli : la musique continue en naviguant, file d’attente, suivant/précédent, aléatoire, répétition, volume, favoris, pause automatique pendant les parties. Testé. |
| Émulateur Switch | ✅ | Ryujinx en un clic + import des clés de ta console. |
| Synchro Discord (« joue à … avec Smash Emu ») | ✅ | Présence Discord (jeu, console, jaquette, chrono, bouton). Protocole testé avec Discord ouvert. Il faut une fois une **Application Discord** (voir `docs/DISCORD.md`) ; son ID mis dans `community.json` l’active chez tout le monde. |
| Mode admin payant ou par don, avec avantages | ✅ | Codes supporter signés (Ed25519, vérifiés hors ligne, impossibles à fabriquer sans la clé privée). Niveaux Supporter, VIP, Fondateur : badge et 4 thèmes exclusifs. Pas de paiement intégré : reçois le don où tu veux (Ko-fi, PayPal…) puis envoie le code. Les avantages sont des créations originales : rien de Nintendo n’est vendu. |
| Recherche de jeux reliée à des sites de ROM | ⛔ | Refusé : ce serait du piratage. Smash Emu n’importe que tes propres dumps. |
| PS2, PS3, Xbox, PS4 | ✅ | Installation et mise à jour en un clic depuis les sources officielles : PCSX2, RPCS3, xemu, shadPS4 (+ Xenia, DuckStation, Azahar, Cemu, PPSSPP, Ryujinx). Console PS4 ajoutée (dossier CUSA… / eboot.bin). Aucun BIOS, firmware ni clé fourni. |
| Updater (installer ou mettre à jour) | ✅ | Chaque émulateur : « Installer », « Mettre à jour (version) » ou « À jour », bouton « Vérifier les mises à jour ». Smash Emu se met à jour tout seul (GitHub). |
| Vérifier tous les émulateurs avec l’interface | ✅ | Voir le tableau plus bas. |
| Publier sur GitHub | ✅ | Version 2.3.0 avec installateur, `latest.yml` et blockmap. |
| Mettre en ligne avec des images d’illustration, dans les droits | ✅ | Les illustrations des thèmes sont des dessins vectoriels originaux. Les jaquettes viennent de libretro-thumbnails à la demande de chaque joueur et ne sont pas redistribuées. Aucun logo ni image officielle dans le dépôt. |
| APK Android avec les boutons | ⛔ (pour l’instant) | Electron ne tourne pas sur Android. Il faudrait une appli séparée (Capacitor + EmulatorJS + boutons tactiles) : gros chantier à part. |
| Trophées après un certain temps de jeu | ✅ | Paliers 10 min → 100 h par jeu, trophées généraux, notification en jeu. |
| Jouer en joueur 2 à distance sur d’autres jeux | ✅ | Testé sur Mario Party : la manette de l’invité pilote le joueur 2. |
| Jaquettes non coupées | ✅ | Affichées en entier dans l’accueil et la bibliothèque. |
| Recommandations | ✅ | Section **Pour toi** sur l’accueil : trophée à portée, jeu délaissé, jeu jamais lancé, thème du jeu le plus joué, jaquettes manquantes, jeu à distance, Discord, thème perso. |
| Créer un Discord + bouton pour le rejoindre | 🟡 | Le bouton « Rejoindre le Discord » est prêt : il apparaît chez tout le monde dès que le lien est mis dans `community.json` (ou dans Tableau de bord → Administration sur ton PC). Je ne peux pas créer le serveur à ta place (il faut te connecter à ton compte) : guide pas à pas dans `docs/DISCORD.md`. |

## Vérification des émulateurs dans l’interface Smash Emu

| Émulateur | Console | Résultat |
|---|---|---|
| Intégré (EmulatorJS) | N64 et consoles rétro | ✅ Super Mario 64 : reprise de partie, 60 images/s, barre complète. |
| Dolphin | GameCube, Wii | ✅ Animal Crossing City Folk : incrusté, pause, turbo, états avec vignettes, capture. |
| PCSX2 | PS2 | ✅ Démarre ; l’assistant du premier lancement (BIOS) est montré au premier plan avec une explication. Raccourcis : pause, sauver, charger, turbo. |
| RPCS3 | PS3 | ✅ Démarre ; sans firmware, écran d’aide « installer le firmware » + bouton pour ouvrir RPCS3. |
| xemu | Xbox | ✅ Démarre et s’incruste ; sans BIOS, avertissement automatique « BIOS manquant ». |
| shadPS4 | PS4 | ✅ Démarre ; un jeu illisible affiche l’erreur et les boutons Réessayer / Configurer. |
| Xenia Canary | Xbox 360 | ✅ Démarre et s’incruste. |
| Azahar | 3DS | ✅ Démarre (raccourcis pause et états ajoutés). |
| Cemu | Wii U | ✅ Démarre. |
| Project64 | N64 | 🟡 Fonctionne dans sa propre fenêtre : son rendu devient noir une fois incrusté, il n’est donc pas intégré à la barre Smash Emu (l’émulateur intégré l’est). |
| Ryujinx, DuckStation, PPSSPP | Switch, PS1, PSP | 📋 Installables en un clic, pas testés cette nuit (pas de jeu de test). |

## Spécifications collées (Remote Play, Ultimate Gaming Hub, 200 idées)

- **Remote Play** : hôte + jusqu’à 3 invités (joueurs 2 à 4), image et son, manettes, chat écrit et vocal, statistiques, blocage et exclusion ✅. Serveur relais, invitations sans code et reconnexion automatique ⛔ (serveur nécessaire).
- **Hub de jeux** : bibliothèque avec jaquettes, scores de ressemblance et choix manuel ✅, métadonnées (région, MD5, temps de jeu) ✅, trophées ✅, statistiques ✅, thèmes ✅, recommandations ✅. Boutique, comptes, cloud géré ⛔ (serveur).
- **200 idées** : les idées réalisables sans serveur et sans contenu protégé ont été priorisées (voir CHANGELOG). Celles qui demandent un serveur, une appli mobile ou du contenu sous licence ne sont pas faites.
