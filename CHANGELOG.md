# Changelog

## 3.3.3

- **Jeu à distance plus simple et plus stable**
  - Nouvelle qualité **Auto**, choisie par défaut. Quand la connexion d'un ami souffre (pertes, latence, débit ou
    processeur saturés), l'image baisse toute seule (images par seconde, résolution, débit), puis remonte après 15 s
    calmes. Chaque ami a son propre réglage, et le panneau dit pourquoi l'image est réduite.
  - **Reconnexion automatique** de l'invité : coupure ou connexion qui ne s'établit pas, jusqu'à 3 nouveaux essais
    tout seuls avant le bouton « Réessayer ».
  - Le joueur qui se reconnecte **retrouve sa place** (joueur 2 reste joueur 2). Une connexion perdue ne bloque plus
    une place.
- **Speedrun selon les règles des classements**
  - Chrono au **centième**, rafraîchi à chaque image.
  - La **pause** de Smash Emu arrête le chrono.
  - Jeu accéléré ou ralenti, retour arrière, image par image ou état chargé pendant un essai : l'essai devient
    **« assisté »**. Il est chronométré mais ne compte ni pour le record, ni pour les meilleurs segments. En course
    contre un ami, il vaut un abandon.

## 3.3.2

- **Danseur** : un petit personnage bleu en pixel art danse dans le coin de l'accueil (larmes qui tombent, notes de
  musique, pirouette quand tu cliques dessus). Il se cache dans Interface Console → « Danseur ».

## 3.3.1

- **Succès maison pour les jeux Switch** (RetroAchievements ne prend pas en charge la Switch) : 20 succès par jeu,
  débloqués tout seuls d'après tes parties : premier lancement, première sauvegarde, 1 h, 10 h, 25 h, 10 parties,
  3 et 7 jours de jeu, partie de 2 h, nuit blanche, copie de secours, sauvegarde dans Citron et Eden, mod, triche,
  randomizer, réglages sur mesure, 5 captures, run de speedrun, plus 2 succès pour l'ensemble de tes jeux Switch.
  Leurs points sont gagnés en pièces. Visibles en jeu (Ctrl+I → Succès, alerte en direct) et dans le Centre Switch
  (nouvel onglet Succès).
- **RetroAchievements : reconnaissance corrigée.** Les ROM N64 n'étaient pas lues (rangées autrement que celles
  des autres consoles) : Super Mario 64, Smash Bros., Mario Party, Pokémon Stadium 2… sont maintenant reconnus
  par leur empreinte. Un jeu patché est reconnu sur le fichier réellement lancé et sous son propre nom (ex.
  Chaos Edition) ; un titre court trouve son titre officiel (« Majora's Mask » → « The Legend of Zelda: Majora's
  Mask ») ; « .nkit » et les sous-ensembles ne gênent plus. Avertissement quand ta version du fichier n'est pas
  acceptée par RetroAchievements (les succès s'affichent mais ne se débloqueront pas). SM64 Coop DX n'est plus
  proposé (pas de succès pour ce portage PC).

## 3.3.0 : Indices et succès

Nouvelle page **Succès et indices** (médaille dans la barre) et, en jeu, **Ctrl+I** (ou la bulle de la barre) ouvre
un panneau à droite avec deux onglets.

- **Assistant d'indices** (Claude, avec ta propre clé API Anthropic) : il voit l'image du jeu, connaît le jeu et la
  console, cherche dans les soluces et wikis du web quand il n'est pas sûr, et répond en français au niveau choisi :
  **coup de pouce**, **indice précis** ou **solution**. Suggestions rapides, conversation suivie, sources et coût
  affichés (environ un centime par question avec Claude Opus 5.5 ; Sonnet 5.5 et Haiku 5.5 au choix, moins chers).
  Clé chiffrée par Windows ; l'image n'est jointe que si la case est cochée.
- **RetroAchievements** : connecte ton compte (nom d'utilisateur + clé d'API web). Les jeux à cartouche sont reconnus
  par l'empreinte de leur fichier, calculée comme RetroAchievements (NES, SNES, N64, Game Boy, GBA, DS, Mega Drive,
  Master System, Game Gear, 32X, PC Engine, Atari, Virtual Boy, Jaguar) ; les autres par leur titre, à confirmer.
  Succès avec badges, points et progression, dans la page et en jeu ; bouton **Indice** sur chaque succès pour
  demander à l'assistant comment l'obtenir.
- **Succès débloqués en direct** : pendant la partie, Smash Emu vérifie toutes les 90 s et affiche chaque nouveau
  succès (+10 pièces, notification).
- **RetroArch** en un clic (version stable officielle et un cœur par console) : c'est lui qui débloque les succès des
  consoles à cartouche, l'émulateur intégré ne pouvant pas le faire. Incrusté dans Smash Emu (rendu Vulkan, N64 en
  ParaLLEl), succès activés, Échap ne ferme plus le jeu. Choix dans les options du jeu → Émulateur. Les jeux N64
  peuvent maintenant utiliser n'importe quel émulateur externe, pas seulement Project64.

## 3.2.0 : Centre Switch

Nouvelle page **Centre Switch** (icône manette rouge dans la barre) : tous tes jeux Switch, et pour chacun six onglets.
Toutes les idées, faites et à venir : [docs/IDEES-SWITCH.md](docs/IDEES-SWITCH.md).

- **Sauvegardes** : celle de Citron et celle d'Eden côte à côte. Copie de secours **automatique avant chaque partie**
  (seulement si elle a changé), copies manuelles, restauration, **transfert Citron ⇄ Eden** (proposé quand tu changes
  l'émulateur d'un jeu), export en .zip, import depuis .zip, .7z, .rar ou dossier. L'état actuel est toujours mis de
  côté avant d'être remplacé. La sauvegarde reste accessible même si le fichier du jeu a été supprimé.
- **Réglages du jeu** (pour ce jeu seulement) : résolution ½× à 4×, filtre (FSR, ScaleForce…), anti-crénelage,
  synchronisation verticale, format d'image, filtrage des textures, précision du GPU, shaders en arrière-plan, mode
  TV / portable, **langue** et région de la console, volume. Préréglages PC modeste, Équilibré, Beau, Ultra (4K).
- **Mods** : liste, activer / désactiver sans supprimer, bouton « Seul » pour trouver le mod qui fait planter, import
  d'archive ou de dossier, lien vers GameBanana.
- **Triches** : import de fichiers Atmosphère (.txt), une case par triche, rangées par version du jeu.
- **Shaders** : taille du cache par jeu, vider un jeu ou tous.
- **Diagnostic** : émulateur, fichier, clés, firmware, version du jeu, mémoire, carte graphique, disque, mods actifs
  et dernières erreurs du journal, avec ce qu'il faut faire pour chaque point.

## 3.1.0

- **40 accueils fidèles** dans la Boutique (300 pièces chacun, rubrique « Accueils fidèles ») : chacun reprend vraiment
  la mise en page d'un thème communautaire (Pegasus, ES-DE, thèmes Switch) : placement, tailles, typographie, effets
  et navigation, avec tes jeux et tes jaquettes. Exemples : barre croisée, chaînes, mur de jaquettes, tableur, écran
  rétro à lignes, multicartouche en pixels, vitrine de console, cartes de jeux, relais façon terminal…
- **Image de fond au choix** pour chaque accueil fidèle (Accueil → Réglages → « Choisir l'image de fond ») ; sans
  image, l'accueil prend le fond ou la jaquette du jeu choisi. Aucun personnage ni logo des thèmes d'origine.
- Comparaison référence / Smash Emu : docs/accueils-fideles.html.

## 3.0.0

- **153 styles d'accueil** dans la Boutique (150 pièces chacun) : chacun est inspiré d'un vrai accueil de console ou
  de frontend d'émulation (thèmes Switch personnalisés, Pegasus, ES-DE, RetroArch, Batocera, Playnite…). Couleurs
  extraites de la capture de la référence, disposition reprise (rangée, grille, liste, carrousel, vague, inventaire…),
  police, forme des tuiles, effet de sélection et motif de fond. Créations originales : aucune image, logo ni
  personnage repris. Galerie des références : docs/references-accueils.html.
- **Sélecteur « Consoles »** (style Colorful) : choisis d'abord la console, avec sa photo, puis ses jeux.
  Haut / bas ou LB / RB pour changer de console. Disponible gratuitement dans les réglages de l'accueil. Photos
  libres de Wikimedia Commons (principalement d'Evan-Amos), crédits dans assets/consoles/CREDITS.md.

## 2.9.1

- **45 thèmes dans la Boutique** (200 pièces chacun), inspirés des écrans d'inventaire et de pause des grandes séries : plateforme, aventure héroïque, RPG stylé, monstres de poche, exploration spatiale et autres classiques. Couleurs, police et décor originaux, sans nom ni logo de jeu.

## 2.9.0

- **Jeu à distance bien plus simple** : un **code de salon** court (ex. K7M-2QX) dans le panneau À distance (Ctrl+J).
  Ton ami clique sur « Rejoindre un ami », tape le code, et la connexion se fait toute seule : plus de long code à
  copier dans les deux sens. Encore plus simple : bouton **Inviter** à côté de chaque ami en ligne, il clique sur
  « Rejoindre » dans la notification.
- **Moins de lag à distance** : image encodée à 1280 px au plus en « Équilibré », image nette dès le départ,
  affichage immédiat chez l'invité, clavier de l'invité sur le canal rapide, image Switch envoyée dès qu'elle est
  dessinée.
- **Courses de speedrun entre amis** : bouton **Défier** sur la page Amis, même jeu chez les deux, Ctrl+Espace quand
  tu es prêt, 3-2-1, et le plus rapide gagne des **pièces**.
- **Fin détectée toute seule** : dans le panneau Speedrun, « Utiliser l'image actuelle » sur l'écran de fin ; le chrono
  s'arrête quand le jeu le réaffiche.
- **Pièces et Boutique** : +100 par victoire, +25 si tu finis la course, +30 par record battu. La Boutique propose 5
  accueils (Tableau de bord, Vague, Cosmos, Manoir, Mallette), des mascottes, cadres, effets, sons et titres.
- **Centre de notifications** (cloche) : invitations, courses, pièces gagnées.

## 2.8.1

- **Un seul fichier, installateur ou mise à jour** : si Smash Emu est déjà installé, Smash-Emu-Setup propose une mise à jour rapide (sans pages, même dossier, jeux et réglages gardés) puis relance Smash Emu ; sinon, installation complète.

## 2.8.0

- **Randomizer Switch** (Citron, Eden), dans Menu → Randomizer pendant le jeu : graine (ou au hasard), code à partager
  `SMASH-GRAINE-MODES`, intensité Doux / Moyen / Chaos. Appliqué à chaque lancement, le fichier du jeu n'est jamais
  modifié.
  - **Couleurs** (Eden) : teinte, saturation et canaux de l'image tirés de la graine (effet d'image original).
  - **Valeurs** : argent, vies, objets… écrits en codes de triche à partir d'un profil du jeu (format documenté,
    importable).
  - **Mods randomizer** : installe en un clic le mod produit par un randomizer communautaire (dossier ou archive) ;
    rangé automatiquement quand le randomizer est coupé.
- **Vitesse sur Switch** : le bouton de la barre passe de 100 % à rapide, illimité et lent (Eden), et l'onglet Switch
  du menu règle les pourcentages.
- **Mode speedrun** (tous les jeux) : chrono avec segments dans la barre, comparaison au record (en avance, en retard,
  meilleur segment en or), somme des meilleurs, essais et historique. Ctrl+Espace départ / segment suivant,
  Ctrl+Retour arrière annuler, Ctrl+Maj+Espace remise à zéro (F10 aussi dans le lecteur intégré).
- **Mises à jour automatiques** : plus besoin de l'installateur. La nouvelle version se télécharge en arrière-plan
  (vérification toutes les 30 min) et s'installe en silence à la fermeture, ou tout de suite avec « Redémarrer
  maintenant ».

## 2.7.6

- **Moins de gels sur Switch** : Citron et Eden préparent les graphismes (shaders) en arrière-plan, au lieu de bloquer
  le jeu quelques instants à chaque nouvel effet. Réglage gardé si tu l'as déjà changé dans l'émulateur.

## 2.7.5

- **Écran de chargement corrigé** : il ne se fige plus au bout de 25 secondes (le message « Ça prend du temps »
  arrêtait l'animation) et ne repart plus de zéro quand une fenêtre de l'émulateur s'ouvre.
- **Vraies étapes avec Citron et Eden** : la barre suit le démarrage réel (lecture du jeu, carte graphique,
  démarrage, chargement des shaders), avec l'étape dans la bulle de la mascotte. Tant que le démarrage avance,
  Smash Emu attend sans afficher d'alerte.
- **Plus rapide** : barre fluide, pourcentage et secondes écoulées, mascotte qui court avec des traits de vitesse.

## 2.7.4

- **Jeux Switch plus nets** : tant que tu n'as pas changé ces réglages, Citron et Eden affichent les jeux avec
  l'agrandissement FSR et l'anti-crénelage SMAA (au lieu du plus proche voisin, très pixelisé), et en résolution 2×
  avec une carte graphique NVIDIA ou AMD.

## 2.7.3

- **Manettes Switch** : bouton **Manettes** dans la barre du jeu ; il ouvre les réglages des commandes de Citron ou
  d'Eden devant le jeu, et leur fenêtre se recache au retour dans Smash Emu.
- Manette réglée en joueur 1 : Citron et Eden passent en **mode TV** (en mode portable, beaucoup de jeux ignorent la
  manette).
- L'accueil ne lit plus la manette pendant une partie : une DualSense ne se reconnecte plus en boucle dans le jeu.

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
