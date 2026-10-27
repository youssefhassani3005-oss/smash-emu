# Idées Switch pour Smash Emu

✅ = dans la version 3.2.0 (Centre Switch) · ☐ = idée pour la suite · ⛔ = pas possible ou pas autorisé (dit pourquoi)

Déjà là avant la 3.2.0 : clés partagées entre Citron, Eden et Ryujinx, firmware recopié d'un émulateur à l'autre,
décompression ZBIC des jeux récents, qualité d'image automatique (FSR, SMAA, 2× avec une carte dédiée), mémoire 4 Go
sur les petits PC, mode TV avec manette, shaders en arrière-plan, écran de chargement avec les vraies étapes, vitesse
rapide / lente, randomizer, mods GameBanana, mode speedrun, jeu à distance.

## 1. Sauvegardes

1. ✅ Voir la sauvegarde de chaque jeu dans Citron et dans Eden (fichiers, taille, date)
2. ✅ Copie de secours automatique avant chaque partie, seulement si la sauvegarde a changé
3. ✅ Copie de secours manuelle, jamais effacée automatiquement
4. ✅ Restaurer n'importe quelle copie, dans Citron ou dans Eden
5. ✅ L'état actuel est toujours mis de côté avant une restauration, un transfert ou un import
6. ✅ Transférer la sauvegarde Citron → Eden ou Eden → Citron (profils de joueur différents gérés)
7. ✅ Proposition de transfert quand on change l'émulateur d'un jeu
8. ✅ Exporter la sauvegarde en .zip
9. ✅ Importer une sauvegarde depuis un .zip, .7z, .rar ou un dossier
10. ✅ Ouvrir le dossier de la sauvegarde et celui des copies de secours
11. ✅ Interrupteur pour couper la copie automatique
12. ✅ Sauvegarde toujours accessible quand le fichier du jeu a été supprimé
13. ✅ Interdiction de remplacer une sauvegarde pendant que le jeu tourne
14. ☐ Synchronisation des sauvegardes Switch dans le dossier cloud (comme pour les autres consoles)
15. ☐ Comparer deux copies (date, taille, fichiers changés)
16. ☐ Nommer une copie (« avant le boss final »)
17. ☐ Épingler une copie pour qu'elle ne soit jamais effacée
18. ☐ Copie de secours aussi à la fermeture du jeu
19. ☐ Copie de secours de toutes les sauvegardes Switch en un clic
20. ☐ Sauvegardes Ryujinx (format différent, avec index)
21. ☐ Partager une sauvegarde avec un ami (via la page Amis)
22. ☐ Alerte si la sauvegarde n'a pas bougé après une longue partie (jeu qui n'enregistre pas)

## 2. Réglages propres à chaque jeu

23. ✅ Résolution de ½× à 4×
24. ✅ Filtre d'agrandissement (plus proche, bilinéaire, bicubique, gaussien, ScaleForce, FSR)
25. ✅ Anti-crénelage (aucun, FXAA, SMAA)
26. ✅ Synchronisation verticale (désactivée, Mailbox, FIFO)
27. ✅ Format d'image 16:9, 4:3, 21:9, 16:10, étiré (Eden)
28. ✅ Filtrage des textures jusqu'à 16× (Eden)
29. ✅ Précision du GPU rapide ou précise (Eden)
30. ✅ Shaders en arrière-plan oui / non
31. ✅ Mode TV ou portable
32. ✅ Langue de la console (français, français canadien, anglais, espagnol, allemand, italien, japonais…)
33. ✅ Région de la console (Europe, États-Unis, Japon…)
34. ✅ Volume du jeu (muet à 200 %)
35. ✅ Préréglages : PC modeste, Équilibré, Beau, Ultra (4K)
36. ✅ Retour au réglage général, option par option ou tout d'un coup
37. ✅ Valeurs exactes de chaque émulateur (les numéros diffèrent entre Citron et Eden ; ceux qui ne sont pas sûrs
    pour Citron sont masqués)
38. ☐ Préréglage choisi automatiquement selon la carte graphique
39. ☐ Réglages conseillés par jeu, partagés par la communauté
40. ☐ Limite d'images par seconde et déblocage du 60 i/s (mods)
41. ☐ Précision du processeur
42. ☐ Fuseau horaire et date de la console (événements de jeux)
43. ☐ Choix du moteur audio et de la sortie
44. ☐ Réglages de la manette par jeu
45. ☐ Copier les réglages d'un jeu vers un autre

## 3. Mods

46. ✅ Liste des mods installés pour le jeu, avec leur contenu (fichiers du jeu, code, triches) et leur taille
47. ✅ Activer / désactiver un mod sans le supprimer
48. ✅ Bouton « Seul » : un seul mod actif, pour trouver celui qui fait planter le jeu
49. ✅ Tout activer / tout désactiver
50. ✅ Supprimer un mod (Citron et Eden)
51. ✅ Installer un mod depuis une archive ou un dossier
52. ✅ Accès direct aux mods GameBanana du jeu
53. ☐ Ordre de chargement des mods
54. ☐ Détection des mods qui modifient les mêmes fichiers (conflits)
55. ☐ Mise à jour d'un mod GameBanana quand une nouvelle version sort
56. ☐ Profils de mods (« partie normale », « partie moddée »)
57. ☐ Image et description du mod dans la liste

## 4. Triches

58. ✅ Import de fichiers de triches au format Atmosphère (.txt)
59. ✅ Une case par triche, tout cocher / tout décocher
60. ✅ Code maître toujours actif
61. ✅ Triches rangées par version du jeu ; la tienne est repérée
62. ✅ Avertissement si les triches sont pour une autre version
63. ✅ Seules les triches cochées sont écrites (mod « Smash Emu - Triches » pour Citron et Eden)
64. ☐ Activer une triche pendant la partie depuis le menu du jeu
65. ☐ Éditeur de triches (nom, lignes de code)
66. ☐ Raccourcis clavier pour les triches

## 5. Shaders et place sur le disque

67. ✅ Taille du cache de shaders par jeu et par émulateur
68. ✅ Vider le cache d'un jeu (image abîmée après une mise à jour)
69. ✅ Vider le cache de tous les jeux
70. ✅ Place prise par la Switch : sauvegardes, shaders, mods, copies de secours
71. ☐ Nettoyage des données des jeux supprimés de la bibliothèque
72. ☐ Préchauffage des shaders (partager le cache entre deux PC du joueur)

## 6. Diagnostic « pourquoi mon jeu ne démarre pas ? »

73. ✅ Émulateur installé ou non
74. ✅ Fichier du jeu présent, complet, et pas en cours de copie
75. ✅ Format compressé NSZ / XCZ signalé
76. ✅ Clés de la console présentes
77. ✅ Clés assez récentes pour déchiffrer ce jeu
78. ✅ Firmware installé
79. ✅ Identifiant, build et kit de développement du jeu
80. ✅ Avertissement pour les jeux trop récents (firmware 22+)
81. ✅ Mémoire vive, carte graphique dédiée ou intégrée, espace disque libre
82. ✅ Mods actifs signalés, résolution trop haute signalée
83. ✅ Dernières erreurs du journal de l'émulateur, sans doublons
84. ✅ Ouvrir le journal complet
85. ☐ Version du firmware installé (lue dans le firmware)
86. ☐ Correctifs en un clic (baisser la résolution, couper les mods…)
87. ☐ Diagnostic lancé tout seul quand un jeu se ferme au démarrage
88. ☐ Rapport à copier pour demander de l'aide sur le Discord

## 7. Bibliothèque Switch

89. ✅ Centre Switch dans la barre d'icônes, liste de tous les jeux Switch
90. ✅ Changer l'émulateur d'un jeu en un clic
91. ✅ Fiche du jeu : identifiant, build, format, taille, temps de jeu
92. ☐ Mises à jour et DLC détectés à côté du jeu, installés automatiquement
93. ☐ Version du jeu installée et mise à jour disponible
94. ☐ Icône et nom officiels lus dans le jeu (au lieu du nom du fichier)
95. ☐ Taille réelle et format conseillé (NSP / XCI)
96. ☐ Regrouper les doublons (même jeu ajouté deux fois)
97. ☐ Temps de jeu repris de Citron et d'Eden

## 8. En jeu

98. ☐ Onglet « Centre Switch » dans le menu du jeu (réglages et triches sans quitter)
99. ☐ Capture d'écran et vidéo des 30 dernières secondes
100. ☐ Amiibo depuis tes propres fichiers
101. ☐ Mode portable / TV pendant la partie
102. ☐ Compteur d'images par seconde dans la barre
103. ☐ Profils de joueur (nom, couleur) partagés entre Citron et Eden

## 9. Multijoueur

104. ☐ Salons LDN (jeu local en ligne) d'Eden depuis la page Amis
105. ☐ Inviter un ami dans une partie Switch à distance (existe déjà en jeu à distance)
106. ☐ Courses de speedrun Switch entre amis avec fin détectée

## Pas possible ou pas autorisé

- ⛔ Télécharger des jeux, des clés, des firmwares ou des BIOS : ils doivent venir de ta propre console.
- ⛔ Lancer en ligne sur les serveurs Nintendo : réservé aux vraies consoles.
- ⛔ Jeux firmware 22+ sur Citron : Citron n'a pas encore tout ce qu'il faut (Smash Emu décompresse déjà leur
  exécutable ; Eden va plus loin).
- ⛔ Thèmes avec personnages ou logos Nintendo dans la Boutique : seulement des créations originales.
