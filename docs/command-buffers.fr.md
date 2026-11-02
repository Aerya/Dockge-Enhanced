# Buffers de commandes configurables

[en](command-buffers.md) · [fr](command-buffers.fr.md) · [de](command-buffers.de.md) · [es](command-buffers.es.md) · [zh-CN](command-buffers.zh-CN.md)

Les limites de sortie capturée sont ajustables par des variables d’environnement bornées. Les dépassements indiquent la famille de commande, l’emplacement dans le code et la limite, sans arguments ni sortie capturée. Les valeurs par défaut et les commandes en streaming sont préservées.

## Configuration

Définir ces variables sur chaque instance Enhanced qui exécute les commandes. Les helpers héritent des valeurs validées. Une valeur invalide utilise la valeur par défaut avec un avertissement, sans afficher la valeur fournie. Redémarrer/recréer Enhanced après modification de son environnement. Ces réglages ne changent ni les délais, ni les limites des journaux métier, ni les transferts en streaming.

| Variable | Défaut | Description |
| --- | --- | --- |
| `DOCKGE_COMMAND_BUFFER_MULTIPLIER` | `1` | Multiplicateur des plafonds existants (entier 1–16) ; augmenter avec prudence : la mémoire consommée augmente par commande simultanée. |
| `DOCKGE_COMMAND_BUFFER_MAX_MIB` | `256` | Plafond absolu par commande, en Mio (entier 1–256). |

Valeurs par défaut : multiplicateur 1 et plafond 256 Mio. Limite effective = min(limite existante × multiplicateur, plafond). Les commandes natives partent généralement de 1 Mio ; promisify-child-process de 200 Kio pour les sorties capturées ; l’inspection des volumes utilise 4 Mio et conserve ses petits lots de champs utiles. Node applique sa limite à chaque flux ; promisify-child-process cumule stdout et stderr.

```yaml
environment:
  DOCKGE_COMMAND_BUFFER_MULTIPLIER: "2"
  DOCKGE_COMMAND_BUFFER_MAX_MIB: "256"
```

## Diagnostics

Un dépassement maxBuffer ou ENOBUFS produit un journal [commandBuffer] avec fichier/ligne, famille de commande sûre, plafond initial et effectif en octets. Ce diagnostic n’ajoute ni arguments, ni valeurs d’environnement, ni chemins absolus, ni sortie capturée. L’erreur initiale reste propagée ; les autres erreurs ne sont pas requalifiées. Augmenter les plafonds consomme davantage de mémoire et ne remplace pas les requêtes bornées.
