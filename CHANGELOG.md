# Changelog

## 2.7.2

- **Mods GameBanana** : nouvelle page Mods (barre d'icônes). Choisis un de tes jeux, Smash Emu trouve le jeu sur
  GameBanana (à confirmer) et affiche ses mods en cartes illustrées : populaires, récents, mieux notés, mis à jour,
  recherche. Fiche avec images, description et fichiers ; **Installer** en un clic : Switch dans le dossier « load »
  d'Eden et de Citron (chargé automatiquement), N64 et Coop DX par l'installateur de Smash Emu, autres consoles dans
  le dossier du jeu. Remplace la recherche Opera dans la barre.
- Un jeu dont le fichier est encore en cours de copie ou d'extraction n'est plus lancé (message clair).

## 2.7.1

- **Écran de chargement** pendant le démarrage d'un jeu : mascotte en pixel art qui avance le long de la barre,
  phrases et astuces, jaquette floutée en fond.
- **Switch** : la mémoire émulée revient à 4 Go (comme une vraie Switch) sur les PC de moins de 24 Go ; le réglage
  8 Go faisait échouer la réservation de mémoire et planter les jeux.

## 2.7.0

Toutes les idées et leurs références : [docs/IDEES.md](docs/IDEES.md).

### Nouvelle interface « Console »

- Interface par défaut, comme une console de salon : boutons ronds et pastille d'état (réseau, heure, profil) en
  haut, barre d'icônes colorées en bas sur toutes les pages, transitions entre les menus, écran de démarrage.
- Accueil en trois dispositions : **Rangée** (grandes tuiles, pastilles d'infos, aides de boutons A / X / Y),
  **Grille** (5 × 3 par pages) et **Chaînes** (4 × 3 avec barre du bas et date). Navigation à la manette et au clavier,
  lancement animé, recherche rapide (Ctrl+K).
- Styles **Mon thème** (les thèmes, y compris les thèmes perso avec image, s'appliquent), **Clair** et **Sombre** ;
  décors Bulles, Feuilles, Rayures, Console du jeu. La sélection prend les couleurs de la jaquette ; chaque console a sa
  couleur et son motif.
- Paramètres en deux colonnes, bibliothèque en grandes tuiles avec filtre par console.
- Jaquettes manquantes trouvées en un clic (correspondances sûres seulement).
- L'interface classique reste disponible (Paramètres → Apparence).

### Amis et communauté

- **Amis** (désactivé par défaut) : code ami, statut en direct, jeu en cours, statistiques et demandes d'ami, chiffrés
  de bout en bout (AES-256-GCM) via le relais public ntfy.sh.
- **Chiffres de la communauté** (avec accord) : rapport anonyme chiffré pour l'administrateur, résumé signé (joueurs,
  heures, jeux et consoles populaires) dans le tableau de bord de chacun.

### Nintendo Switch

- Jeux récents (firmware 22+) : leur exécutable compressé en ZBIC est décompressé pour Citron, qui ne lit pas encore
  ce format.
- **Eden** installable en un clic (version de la nuit officielle) et utilisé en priorité une fois installé.
- Citron et Eden s'ouvrent cachés : seule l'image du jeu apparaît, dans la fenêtre Smash Emu.
- Clés et firmware partagés entre Citron, Eden et Ryujinx ; message clair quand un jeu est trop récent pour les
  émulateurs actuels.

## 2.3.0

Le détail demande par demande est dans [docs/STATUT.md](docs/STATUT.md).

### Nouveautés

- **Multiworld (Archipelago)** : nouvelle page. Les objets de vos jeux sont mélangés entre amis ; Smash Emu se
  connecte à la partie (protocole officiel, client « texte ») et affiche le fil des objets envoyés et reçus, avec
  une notification quand un ami t’envoie un objet, les indices et le chat. Installation du lanceur officiel en un
  clic, liste de tes jeux compatibles.
- **Tableau de bord** : temps de jeu, activité des 30 derniers jours, heures et jours préférés, temps par console,
  classement des jeux, bibliothèque, émulateurs, stockage, trophées, jeu à distance.
- **Mode supporter et administration** : codes signés (Ed25519) vérifiés hors ligne, niveaux Supporter, VIP et
  Fondateur, badge et 4 thèmes exclusifs originaux (Aurore boréale, Velours royal, Sakura de nuit, Synthwave). Le PC
  administrateur (qui a la clé privée) crée les codes depuis le tableau de bord.
- **Recommandations « Pour toi »** sur l’accueil.
- **Thèmes personnalisés** : éditeur avec aperçu en direct (couleurs, police, icônes, décor, illustration), image de
  fond et image d’illustration, partage par code ou par fichier `.smashtheme` (images comprises).
- **Lecteur de musique** : les bandes-son se jouent dans un lecteur permanent (file, suivant, aléatoire, répétition,
  volume, favoris) qui continue pendant la navigation et se met en pause pendant les parties.
- **Présence Discord** : « Joue à Smash Emu » avec le jeu, la console, la jaquette et le chrono. Bouton
  **Rejoindre le Discord** piloté par `community.json` (voir [docs/DISCORD.md](docs/DISCORD.md)).
- **Émulateurs** : installation et mise à jour en un clic depuis les sources officielles (PCSX2, RPCS3, xemu,
  shadPS4, Xenia Canary, DuckStation, Azahar, Cemu, PPSSPP, Ryujinx), vérification des versions, console PS4.
- **Trophées** : paliers de temps de jeu par jeu (10 min à 100 h) et trophées généraux, notification en jeu.
- **Jaquettes** : recherche dans libretro-thumbnails avec score de ressemblance, choix manuel, import, version
  précédente ; affichées en entier.

### Émulateurs externes mieux intégrés

- Les fenêtres de dialogue des émulateurs (assistant de premier lancement, BIOS manquant, erreurs) restent visibles
  au premier plan au lieu d’être masquées.
- Si l’émulateur se ferme ou n’affiche rien, Smash Emu explique ce qu’il lui manque (BIOS, firmware, clés), montre
  ses dernières erreurs et propose « Ouvrir l’émulateur pour le configurer » et « Réessayer ».
- Raccourcis de la barre (pause, états, turbo) pour PCSX2, DuckStation, Azahar et RPCS3, et aide adaptée à chaque
  émulateur.
- Les captures d’écran visent la bonne zone sur les écrans mis à l’échelle (125 %, 150 %…).

### Jalon 1 : confort

- **Sauvegardes en jeu (8)** : la copie sur disque de chaque jeu fait foi. Elle est écrite toutes les 30 s et à la
  fermeture, et remise dans le jeu au lancement quand elle diffère (rechargement unique de la fenêtre, l'ancienne
  version étant gardée en copie de secours). Copies de secours en rotation (10 par défaut, réglable), onglet
  « Sauvegardes » par jeu (exporter, importer, restaurer), dossier cloud facultatif (la version la plus récente gagne).
- **Correctif** : toutes les ROM étaient servies au lecteur sous le nom `game.*`, si bien que les jeux d'une même
  console partageaient une seule sauvegarde en jeu (par ex. Super Mario 64 et Mario Party). Chaque instance a
  désormais la sienne.
- **Correctif** : EmulatorJS effaçait sa copie interne des sauvegardes à la fermeture de la fenêtre ; cette étape est
  sautée quand Smash Emu a déjà tout enregistré.
- **Reprise de la dernière partie (5)** : à la fermeture, l'endroit exact est enregistré ; au lancement suivant,
  Smash Emu propose de reprendre (réglage : demander, toujours, jamais).
- **Emplacements d'état (1)** : date et temps de jeu total affichés sous chaque vignette.
- **Statistiques (18)** : Maj+F2 affiche FPS, vitesse réelle, graphe du temps par image, processeur, mémoire et
  latence audio. Masqué, l'overlay ne coûte rien.
- **Captures (16)** : nommées « Jeu AAAA-MM-JJ HH-MM-SS », mode « telle qu'affichée » (filtres et shaders compris),
  vidéos nommées de la même façon.

### Jalon 3 : entrées

- **Profils par jeu (23)** : chaque jeu peut remplacer certains boutons du profil de sa console (page Manettes,
  ou menu ⋮ d'une instance → « Manettes de ce jeu »).
- **Manettes branchées / débranchées (24)** : annonce du modèle et du joueur ; une manette débranchée met la partie
  en pause. La vibration en jeu n'est pas possible (EmulatorJS ne la transmet pas) ; le test reste dans la page Manettes.
- **Turbo par bouton (25)** : à activer bouton par bouton, de 6 à 30 appuis par seconde.
- **Macros (26)** : Ctrl+M enregistre, Ctrl+1 à 4 rejouent, image par image.
- **Films d'entrées (28)** : état de départ + entrées image par image, relecture à vitesse ×1, une touche rend la
  main. La vérification de synchronisation est approximative : le cœur N64 n'est pas parfaitement déterministe
  (environ 0,5 % de l'état diffère d'une exécution à l'autre, même sans entrée).

### En plus

- **Logo « Manette »** au choix dans Paramètres → Apparence (icône de fenêtre assortie).
- **Bot apprenti (Ctrl+B)** : joue tout seul et apprend quelles actions lui font découvrir de nouveaux écrans
  (exploration par curiosité, mémoire des actions par jeu). Il ne recopie pas les sauvegardes en jeu et remet la
  partie où elle était à l'arrêt.

## 2.1.0

- Page Manettes, menu latéral repensé, clés Switch pour Ryujinx, installation de Ryujinx en un clic, mises à jour
  automatiques.

## 2.0.0

- Première version installable.
