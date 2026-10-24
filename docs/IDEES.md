# Idées pour Smash Emu

Toutes les idées en cours, avec les références dont elles s'inspirent. ✅ fait (version 2.7.0), 🛠️ prévu, 💡 idée à
étudier. Tout reste une création originale : aucun logo, son, image ou personnage d'un fabricant de consoles.

## Références étudiées

| Référence | Ce qu'on en retient |
|---|---|
| Accueil Nintendo Switch 2 | Rangée de grandes tuiles carrées, sélection avec un contour lumineux, barre d'icônes colorées en pastille, aides de boutons en bas à droite, fond clair avec formes floues |
| Accueil Switch avec thème (motif à feuilles) | Pastilles d'infos sous le jeu (temps de jeu, dernier succès, succès, temps récent), boutons ronds en haut à gauche, pastille d'état en haut à droite, LB / RB avec des points |
| Menu Wii | Grille de chaînes 4 × 3, emplacements vides grisés, flèche de page, barre du bas avec courbe, date au centre, boutons ronds à gauche et à droite |
| Menu Wii U | Grille par pages, bulle d'info au-dessus de la sélection, avatar en haut à gauche |
| Paramètres de la Switch | Catégories à gauche, une seule ouverte à droite |
| Bibliothèque PS5, Steam Big Picture, Steam Deck | Grandes jaquettes en grille, filtres par collection, bouton Jouer au survol |
| Thèmes dynamiques PS4 / ES-DE (EmulationStation) | Décor qui change selon la console ou le jeu |
| Xbox Series | Épingles, groupes personnels |
| Apple TV (top shelf) | Fond qui montre le jeu sélectionné |

## Interface console

- ✅ Interface « Console » par défaut : boutons ronds, pastille d'état (réseau, heure, profil), barre d'icônes en bas sur toutes les pages
- ✅ Accueil en trois dispositions : Rangée (Switch), Grille (Wii U), Chaînes (Wii)
- ✅ Pastilles d'infos du jeu : temps de jeu, dernière partie, dernier trophée, trophées, temps des 2 dernières semaines
- ✅ Aides de boutons (X Détails, Y Options, A Jouer, ≡ Accueil) cliquables
- ✅ Navigation à la manette (croix, stick, A, B, X, Y, LB, RB, Start, Select) et au clavier (flèches, Entrée, Page préc./suiv., Ctrl+K, F11)
- ✅ Transitions entre les menus (glissement dans le sens de la barre d'icônes, zoom en entrant dans un jeu)
- ✅ Apparition des tuiles en cascade, lancement d'un jeu en grand au centre de l'écran, fenêtres qui s'ouvrent en zoom
- ✅ Écran de démarrage façon console
- ✅ Petits sons d'interface synthétisés (désactivables)
- ✅ Recherche rapide de jeux (Ctrl+K)
- ✅ Paramètres en deux colonnes, bibliothèque en grandes tuiles avec filtre par console
- 🛠️ Ranger les tuiles soi-même (glisser-déposer, bouton « Ranger »), groupes de jeux comme des dossiers
- 🛠️ Navigation à la manette dans tous les menus (pas seulement l'accueil)
- 🛠️ Menu rapide pendant le jeu (bouton Accueil de la manette) : reprendre, sauvegarder, capture, quitter
- 💡 Petits personnages originaux qui se promènent en bas de l'accueil
- 💡 Éditeur d'avatar original (forme, couleurs, accessoires) pour le profil et les amis
- 💡 Écran de veille après quelques minutes : jaquettes qui défilent
- 💡 Démarrer directement en plein écran console (mode salon)

## Thèmes selon la console et la jaquette

- ✅ Les thèmes (y compris les thèmes perso avec image) s'appliquent à l'interface Console
- ✅ Styles Mon thème, Clair et Sombre ; décors Bulles, Feuilles, Rayures, Console du jeu, Uni
- ✅ Couleurs de la jaquette du jeu sélectionné (teinte dominante et accent calculés sur l'image)
- ✅ Couleur et motif propres à chaque console (quadrillage Nintendo, symboles PlayStation, rayures Sega, anneaux Xbox, points Game Boy)
- ✅ Page d'un jeu aux couleurs de sa jaquette
- ✅ Jaquettes manquantes trouvées en un clic (correspondances sûres seulement)
- 🛠️ Aperçu animé au survol (écran titre et capture du jeu, comme les chaînes Wii)
- 💡 Musique de menu originale par famille de consoles
- 💡 Thèmes saisonniers (hiver, été, Halloween) en option

## Amis et communauté

- ✅ Liste d'amis par code ami, statut en direct (en ligne, en jeu, absent, hors ligne), jeu en cours, statistiques, demandes d'ami, notifications ; tout chiffré de bout en bout, désactivé par défaut
- ✅ Statistiques de la communauté (anonymes, avec accord) : joueurs, actifs du jour et de la semaine, heures jouées, jeux et consoles les plus joués ; vue détaillée sur le PC administrateur, résumé signé visible par tous
- 🛠️ Inviter un ami en ligne à une partie à distance en un clic (le code d'invitation passe par la boîte aux lettres chiffrée)
- 🛠️ Classements entre amis (temps de jeu de la semaine, trophées)
- 💡 Messages rapides entre amis (« Tu joues ? », « GG »)
- 💡 Statut « Prêt à jouer » visible par les amis

## Nintendo Switch

- ✅ Décompression ZBIC (firmware 22+) pour Citron, vérifiée par les empreintes SHA-256 du jeu
- ✅ Eden installable en un clic (version de la nuit officielle), choisi en priorité quand il est installé
- ✅ Citron et Eden lancés cachés : seule l'image du jeu apparaît dans Smash Emu
- ✅ Clés et firmware partagés entre Citron, Eden et Ryujinx
- ✅ Message clair quand un jeu est plus récent que ce que les émulateurs savent lancer
- 🛠️ Mise à jour automatique d'Eden avec la version de la nuit
- 💡 Fiche de compatibilité par jeu (testé, démarre, jouable)

## Jeux et bibliothèque

- 🛠️ Collections et favoris
- 🛠️ Masquer un jeu de l'accueil
- 💡 Succès RetroAchievements (avec le compte de l'utilisateur)
- 💡 Temps de jeu par jour dans la fiche du jeu

## Qualité

- ✅ Décodeur zstd / ZBIC testé contre zlib et contre les empreintes du jeu
- ✅ Tests des amis (codes, chiffrement) et de la communauté (chiffrement pour l'administrateur, totaux)
- 🛠️ Tests d'interface automatiques (navigation, transitions)

## Boutique : autres articles à acheter avec les pièces de speedrun

Idées de disposition seulement (noms et dessins originaux, aucun logo ni nom de console) :

- **Ruban** : catégories en ligne horizontale, jeux en colonne verticale sous la catégorie choisie, vague animée en fond.
- **Lames** : pages en panneaux qui glissent les uns sur les autres, comme des onglets épais.
- **Cube** : animation de démarrage avec un cube qui roule et assemble le logo Smash Emu, menu en plateau tournant.
- **Spirale** : écran de démarrage tourbillonnant, menu en quatre grands boutons ronds.
- **Grand écran** : interface pensée pour la télé et la manette, très grandes tuiles, texte lisible à 3 mètres.
- **Double écran** : jaquette et infos en haut, liste des jeux tactile en bas.
- **Comic** : menus penchés aux couleurs vives, textes découpés façon bande dessinée, transitions qui claquent.
- **Fenêtres bleues** : cadres bleus dégradés à bord blanc, curseur en main pointée, menus de jeu de rôle classiques.
- **Boîtes** : bibliothèque rangée en boîtes de 30 cases à faire défiler, comme une réserve de créatures.
- Autres articles : écrans de démarrage animés, curseurs, traînées de sélection, fonds d'écran animés, packs de sons,
  chapeaux pour la mascotte, cadres de profil animés, titres rares (récompenses de courses seulement).