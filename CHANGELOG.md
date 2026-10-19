# Changelog

## Unreleased

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
