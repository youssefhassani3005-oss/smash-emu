# Profils du randomizer Switch

Un profil dit à Smash Emu quelles valeurs d'un jeu il peut changer (argent de départ, nombre de vies, objet de
départ…). Smash Emu tire ces valeurs avec la graine et les écrit en codes de triche (format Atmosphère), que Citron et
Eden appliquent pendant la partie. Le fichier du jeu n'est jamais modifié.

Sans profil, le mode « Valeurs » ne fait rien pour ce jeu : les adresses mémoire sont propres à chaque jeu et à
chaque version, Smash Emu ne les devine pas.

## Où les mettre

`Documents\Smash Emu\randomizer\profiles\<nom>.json`, ou depuis le jeu : Menu → Randomizer → Importer un profil.

## Format

```json
{
  "format": 1,
  "title": "Nom du jeu",
  "titleId": "0100000000010000",
  "builds": {
    "0123456789ABCDEF0123456789ABCDEF": {
      "version": "1.0.0",
      "values": [
        { "name": "Argent de départ", "region": "main", "offset": "0x1A2B3C", "width": 4, "min": 100, "max": 9999 },
        { "name": "Vies", "region": "heap", "offset": "0x40", "width": 1, "min": 1, "max": 9, "intensity": "medium" },
        { "name": "Objet de départ", "region": "main", "offset": "0x2000", "width": 2, "choices": [3, 7, 12], "intensity": "chaos" }
      ]
    }
  }
}
```

| Champ | Rôle |
|---|---|
| `titleId` | Identifiant du jeu (16 chiffres hexadécimaux, commence par 0100) |
| `builds` | Une entrée par version du jeu, indexée par son build ID (affiché dans Menu → Randomizer) |
| `region` | `main` (exécutable du jeu), `heap` (tas), `alias` ou `aslr`, comme dans les codes Atmosphère |
| `offset` | Décalage dans la région, en hexadécimal (`0x…`, 40 bits au plus) |
| `width` | Taille de la valeur en octets : 1, 2, 4 ou 8 |
| `min`, `max` | Bornes de la valeur tirée (entiers) ; ou `choices` : liste des valeurs possibles |
| `intensity` | `soft` (par défaut), `medium` ou `chaos` : intensité à partir de laquelle la valeur change |

Les valeurs sont écrites en continu pendant la partie (comme un code de triche « bloqué »). La même graine donne
toujours les mêmes valeurs, quelle que soit l'intensité choisie.

Un profil avec `"example": true` est ignoré : [exemple.json](exemple.json) sert seulement de modèle.
