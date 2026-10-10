# Instructions permanentes pour les agents

## Documentation obligatoire pour chaque pull request

Pour chaque pull request, avant de la finaliser :

Vérifier systématiquement les quatre README (`README.md`, `README.fr.md`, `README.es-ES.md`, `README.zh-CN.md`) et leur section du mois en cours, les quatre CHANGELOG, la popup « Nouveautés » et toute documentation concernée. Les changements visibles et significatifs doivent être documentés ; une petite correction technique doit apparaître dans le changelog, sans nécessairement créer de popup. Regrouper les entrées liées et ne jamais faire d’audit historique.

## Internationalisation de la WebUI

Utiliser exclusivement `frontend/src/lang/` et `frontend/src/i18n.ts`. `en` et `fr` sont obligatoires ; mettre à jour `es` et `zh-CN` pour les ajouts Enhanced selon `frontend/src/lang/README.md`, ainsi que `zh-TW` lorsqu’il est concerné. Préserver les autres langues et le fallback anglais. Aucun texte utilisateur codé en dur ni système parallèle ; vérifier clés, paramètres, texte rendu, erreurs, notifications backend, popup et messages Discord/Apprise concernés.

## Checklist de finalisation

Avant de finaliser, vérifier explicitement :

1. Le code et les tests concernés.
2. Les traductions WebUI et les messages visibles.
3. Les README du mois en cours.
4. Les CHANGELOG.
5. La nécessité d’une popup « Nouveautés ».
6. La cohérence des traductions documentaires.
7. L’absence de régression ou d’incohérence.

Si une mise à jour n’est pas nécessaire, l’indiquer explicitement dans le compte rendu. En cas d’ambiguïté, demander confirmation avant la finalisation ; ne jamais omettre silencieusement une vérification documentaire ou linguistique.
