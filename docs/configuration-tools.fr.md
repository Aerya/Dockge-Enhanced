[English](configuration-tools.md) · [Français](configuration-tools.fr.md) · [Deutsch](configuration-tools.de.md) · [Español](configuration-tools.es.md) · [简体中文](configuration-tools.zh-CN.md)

# Outils de configuration

Préparation sur cette branche ; pas encore publiée dans `main`/`latest`.

Dans les actions d’une stack, **Fichiers et historique** donne accès aux versions et au **Compose final enregistré**. Cette vue exécute `docker compose config` sur l’instance propriétaire : elle inclut les overrides et les variables, mais pas les modifications du brouillon. Elle peut contenir des secrets ; son affichage nécessite une confirmation et un compte administrateur.

L’historique conserve les 20 dernières versions distinctes avant une sauvegarde ou un pull Git. Il contient les fichiers Compose, override et `.env` ; pour une stack externe, les fichiers de sa chaîne enregistrée. Les données des applications, les fichiers inclus indirectement et le `global.env` partagé ne sont pas versionnés ici. Chaque fichier est limité à 2 Mio. Une erreur de sauvegarde de l’historique bloque l’écriture pour éviter de perdre la version précédente.

Les versions sont chiffrées dans `stack-file-history/`, sous le dossier de données Enhanced. Sauvegardez ce dossier et `stack-file-history.key` ensemble. La clé est nécessaire à leur lecture ; les fichiers restent sensibles même chiffrés. La liste des versions ne renvoie pas leur contenu. Une restauration sauvegarde les fichiers actuels, restaure aussi l’absence d’un ancien override, et ne redémarre aucun conteneur. **Relisez puis déployez explicitement.** Une liste de fichiers différente ou une opération concurrente bloque la restauration.

Dans l’éditeur `.env` de la stack et dans **Paramètres → Variables d’environnement globales**, **Mode formulaire** propose une ligne par variable. Les valeurs sont masquées par défaut et restent littérales : conservez les guillemets nécessaires. Le mode texte reste disponible pour les commentaires, lignes complexes et valeurs multiligne.

**Paramètres → Diagnostic de l’instance** vérifie Docker, Compose, Git, Buildx et l’écriture/suppression d’un fichier temporaire dans les dossiers de données et de stacks. Choisissez l’instance liée à examiner. Ce diagnostic ne modifie pas sa configuration et ne lance ni déploiement ni nettoyage.

Les deux instances doivent être mises à jour. Un agent plus ancien renvoie une indisponibilité après un délai borné. Les comptes restreints ne peuvent ni consulter les fichiers/résultats ni restaurer une version. Les sauvegardes Restic/Zerobyte restent nécessaires pour les données applicatives.

[ethanpil/dockge-mod](https://github.com/ethanpil/dockge-mod) — inspiration pour l’historique des fichiers, le Compose fusionné, le formulaire `.env` et la page de diagnostic.
