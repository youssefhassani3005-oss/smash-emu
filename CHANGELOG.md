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

## 2.1.0

- Page Manettes, menu latéral repensé, clés Switch pour Ryujinx, installation de Ryujinx en un clic, mises à jour
  automatiques.

## 2.0.0

- Première version installable.
