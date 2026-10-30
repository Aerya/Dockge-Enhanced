[English](README.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [中文](README.zh-CN.md)

# Dockge-Enhanced sur Unraid — version de test

Ce paquet d’installation est expérimental, pas une certification Unraid. Il utilise Enhanced sans modification du fonctionnement applicatif. Aucune inscription à Community Applications n’a été soumise.

## Installation

1. Attendre la réussite du workflow **Image de test Unraid** sur la branche `test/unraid`. Image : `ghcr.io/aerya/dockge-enhanced:test-unraid`. La publication ne touche jamais `latest` ; un tag immuable `test-unraid-<commit>` est également publié.
2. Télécharger [le template XML](dockge-enhanced.xml) de cette branche. Le copier dans `/boot/config/plugins/dockerMan/templates-user/my-dockge-enhanced-unraid-test.xml`, puis le sélectionner dans Docker → Add Container. Il s’agit d’un template manuel, pas d’une installation depuis CA.
3. Vérifier tous les montages et choisir un port libre (5055 par défaut). Créer de NOUVEAUX dossiers de données et de stacks, jamais ceux de production. Racine proposée : `/mnt/user/appdata/dockge-enhanced-unraid-test`.
4. Le chemin hôte des stacks, leur chemin dans le conteneur et `DOCKGE_STACKS_DIR` doivent être identiques. Pour utiliser un chemin de pool à la place de `/mnt/user`, modifier les trois ensemble. Les montages applicatifs relatifs sont résolus sur l’hôte Docker.
5. Ouvrir la WebUI, créer un administrateur et des stacks jetables. Laisser l’auto-mise à jour d’Enhanced en mode manuel et ne pas lancer de mise à jour interne. Mettre ce conteneur de test à jour depuis Unraid avec son tag de test.
6. Laisser les mises à jour automatiques d’images, le nettoyage, la supervision hôte et les instances liées non configurés pour les premiers tests. Ne pas importer les réglages de production.

Compose est inclus dans l’image : le plugin Compose d’Unraid n’est pas nécessaire pour qu’Enhanced exécute Compose. Ne pas confier la même stack à Compose Manager et à Enhanced.

## Droits et isolation

Enhanced fonctionne actuellement en root dans son conteneur et doit pouvoir écrire dans ses dossiers de données/stacks. Enhanced ne prend pas en charge `PUID`/`PGID` : les ajouter ne change pas les propriétaires. Chaque application peut avoir ses propres réglages UID/GID.

Aucun `chmod 777` généralisé, `chown` récursif ou désactivation du remappage des utilisateurs. Examiner d’abord propriétaires, ACL, traversée des dossiers parents et erreur réelle. Root dans un conteneur remappé n’est pas nécessairement root sur l’hôte. Tester création/enregistrement du Compose, redémarrage d’Enhanced et conservation de la connexion/base. Un dossier non inscriptible ou SQLite en lecture seule est un test échoué, pas une raison d’affaiblir la sécurité.

Le template n’est **pas privilégié**, mais le socket Docker permet de contrôler **tous les conteneurs et volumes de l’hôte**. Des dossiers séparés n’isolent pas Docker. Préférer un serveur Unraid jetable ; ne jamais lancer de nettoyage global sur un hôte de production. Ne pas exposer directement la WebUI sur Internet.

## Vérifications demandées aux testeurs

Indiquer versions Unraid/Docker, pool/chemin, pilote réseau et commit de l’image. Sauvegarder indépendamment les données importantes avant les tests de l’hôte.

- Installer ; créer/modifier/enregistrer/déployer une stack jetable ; redémarrer Enhanced et vérifier la persistance.
- Préserver les permissions de configurations intégrées comme `mode: 0777` après édition/enregistrement ; contrôler le fichier et les droits effectifs.
- Redémarrer l’hôte et arrêter/relancer l’array ; vérifier la disponibilité des montages avant démarrage. Tester une dépendance VPN saine et `network_mode: service:...`. L’ordre des dépendances Compose concerne les opérations Compose, pas les démarrages individuels arbitraires de l’hôte. `restart: unless-stopped` ne garantit pas cet ordre.
- Tester l’arrêt/reprise par le plugin de sauvegarde, sans deux gestionnaires concurrents pour la même stack.
- Tester bridge, réseaux externes (br0 si pertinent), plusieurs réseaux et liens de ports. Un identifiant de réseau dans inspect n’indique pas à lui seul une panne réseau.
- Mettre l’image de test à jour depuis Unraid et vérifier réglages/stacks. La mise à jour interne par sidecar n’est **pas validée sur Unraid**.

Aucun redémarrage Unraid réel, array, plugin de sauvegarde ou réseau personnalisé n’a été validé ici. La CI contrôle le template, construit AMD64/ARM64, applique Trivy strict, teste les modules natifs et le démarrage HTTP sur Linux. Cela ne remplace pas les tests Unraid.

## Retrait et signalement

Retirer uniquement les stacks/conteneurs créés pour ce test, puis Enhanced de test. Effacer ses dossiers dédiés seulement après vérification de leur contenu. Jamais de purge Docker globale. Fournir les étapes de reproduction et des logs sans secrets dans [les issues Enhanced](https://github.com/Aerya/Dockge-Enhanced/issues).

## Crédits et contexte

Template adapté de [alex3305/unraid-docker-templates](https://github.com/alex3305/unraid-docker-templates/blob/main/dockge.xml). Références : [discussion Dockge 238](https://github.com/louislam/dockge/discussions/238), issues [911](https://github.com/louislam/dockge/issues/911), [906](https://github.com/louislam/dockge/issues/906), [455](https://github.com/louislam/dockge/issues/455), [290](https://github.com/louislam/dockge/issues/290). Ce sont des cas de test, pas une affirmation qu’Enhanced reproduit ou corrige tous ces problèmes.
