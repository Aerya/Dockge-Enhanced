# Instructions pour les agents (Codex, Claude et autres)

Ces règles s’appliquent à toute modification de Dockge-Enhanced qui touche une fonctionnalité visible, un README, un CHANGELOG ou un guide de `docs/`. Elles complètent les consignes données dans chaque demande.

## Fichiers concernés

| Rôle | Fichiers |
| --- | --- |
| README (présentation, nouveautés, catalogue) | `README.md`, `README.fr.md`, `README.de.md`, `README.es-ES.md`, `README.zh-CN.md` |
| Historique complet | `CHANGELOG.md`, `CHANGELOG.fr.md`, `CHANGELOG.de.md`, `CHANGELOG.es-ES.md`, `CHANGELOG.zh-CN.md` |
| Guides techniques | `docs/*.md` (suffixes `.fr`, `.de`, `.es`, `.zh-CN` pour les traductions) |
| Contrôle automatique | `.github/scripts/check_docs.py` (exécuté par `ci.yml` sur chaque PR) |

## Règles permanentes

1. **Vérifier le code avant toute annonce.** Le code de `main` est la source de vérité, pas les README ni les CHANGELOG existants. Avant de documenter une fonctionnalité, retrouvez son implémentation (backend, frontend, libellés dans `frontend/src/lang/`) et la PR qui l’a fusionnée. N’inventez ni option, ni valeur par défaut, ni libellé d’interface.
2. **Mettre à jour les cinq langues ensemble.** Toute fonctionnalité visible ajoutée, modifiée ou retirée est décrite dans les cinq README et les cinq CHANGELOG, avec le même contenu, les mêmes avertissements et les mêmes liens. Citez les libellés tels qu’ils apparaissent dans l’interface de chaque langue ; si une traduction d’interface manque, citez le libellé affiché (souvent anglais).
3. **Conserver les nouveautés en haut des README.** La section « Latest updates » / « Dernières nouveautés » reste juste après le tableau de synthèse, dans un bloc `<details>`. Ajoutez chaque évolution significative au début du mois en cours (la plus récente en premier), avec une explication compréhensible et les précautions utiles. Ne raccourcissez pas, ne supprimez pas et ne déplacez pas vers le CHANGELOG les descriptions récentes existantes. Les correctifs ayant un effet visible pour l’utilisateur y ont aussi leur place.
4. **Placer chaque fonctionnalité dans la bonne catégorie du catalogue.** Le « Feature catalogue » ne contient que des catégories `###` suivies de listes à puces courtes : aucun paragraphe, aucun élément avant la première catégorie. Catégories actuelles : multi-serveurs et fédération, gestion des stacks, édition Compose, migration et réplication, sauvegarde et restauration, mises à jour et ImageWatcher, sécurité et authentification, supervision, ressources Docker, recherche et fichiers, automatisation et audit, intégrations, apparence et langues, notifications et accès. Les explications longues vont dans un guide de `docs/`, lié depuis la catégorie.
5. **Éviter les doublons.** Avant d’ajouter une puce ou une entrée, cherchez si la fonctionnalité est déjà décrite ; complétez l’existant plutôt que de répéter. Une même fonctionnalité n’apparaît qu’une fois dans le catalogue.
6. **Vérifier les liens.** Liens entre langues, guides, captures (`screens/`), ancres et chemins relatifs doivent pointer vers des fichiers existants. Un guide traduit garde la ligne de navigation entre ses cinq versions.
7. **Synchroniser les CHANGELOG.** Chaque entrée suit le format `**AAAA-MM-JJ — Titre** — description`, du plus récent au plus ancien. La date est celle de la fusion dans `main` (UTC, `gh pr view <n> --json mergedAt`). Les cinq fichiers contiennent les mêmes entrées, dans le même ordre. Le README présente les nouveautés importantes ; le CHANGELOG garde l’historique complet, sans le recopier entièrement dans le README.
8. **Contrôler le statut de publication.** Ne documentez comme disponible que ce qui est fusionné dans `main`. Les modifications applicatives fusionnées sont publiées sous `ghcr.io/aerya/dockge-enhanced:latest` par `build-publish.yml` (les commits purement documentaires ne produisent pas d’image) ; vérifiez l’exécution avec `gh run list --workflow build-publish.yml`. Une PR ouverte ou une image de test (`test-*`) n’est jamais présentée comme publiée, et aucune entrée « Unreleased » / « À paraître » ne reste après la fusion.
9. **Préserver les avertissements de sécurité et de récupération.** Ne supprimez jamais une précaution (rétrogradation, secrets dans les logs, montages à ne pas exposer, clé `two-factor.key`, réinitialisation de dépôt, proxy de confiance, etc.) pour raccourcir un texte : déplacez-la dans un guide si nécessaire, sans la perdre. Ne supprimez ni capture, ni crédit, ni attribution (Dockge, crossly, hamphh, Lorwell, darthrater78 et les autres projets cités).
10. **Vérifier la structure et le rendu avant toute PR.** Exécutez :

    ```bash
    python3 .github/scripts/check_docs.py
    git diff --check
    ```

    Relisez ensuite le diff complet pour repérer les modifications accidentelles, et contrôlez le rendu Markdown (tableaux, blocs `<details>`, titres) dans l’aperçu GitHub ou un équivalent.

## Ce que vérifie `check_docs.py`

- liens relatifs, ancres internes, images et liens entre les cinq langues ;
- équilibre des blocs `<details>`, `<summary>`, `<table>` et des clôtures de code ;
- présence des crédits ;
- position de « Latest updates » et catalogue composé uniquement de catégories et de puces, sans doublon ;
- même nombre de sections, catégories, puces, mois de nouveautés, captures et variables d’environnement dans les cinq README ;
- format, ordre chronologique et absence d’entrée « Unreleased » dans les CHANGELOG, et même nombre d’entrées par date dans les cinq langues.

Le script ne vérifie pas l’exactitude technique ni la qualité des traductions : les règles 1, 2 et 8 restent indispensables.
