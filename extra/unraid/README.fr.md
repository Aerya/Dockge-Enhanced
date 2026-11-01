[English](README.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [中文](README.zh-CN.md)

# Dockge-Enhanced sur Unraid

Installation par template Docker Unraid, avec le même Enhanced que sur les autres systèmes. Compose est inclus : **aucun plugin Compose Unraid nécessaire**. Le template n'est pas encore référencé dans Community Applications.

## Installation et mise à jour

1. Télécharger [le template XML](dockge-enhanced.xml) et le copier dans `/boot/config/plugins/dockerMan/templates-user/my-dockge-enhanced.xml`.
2. Dans **Docker → Ajouter Conteneur**, sélectionner le template. L'image standard est `ghcr.io/aerya/dockge-enhanced:latest`. Un essai de PR exige son image de test : `latest` ne contient pas les modifications non publiées.
3. Choisir un port libre (**5055** par défaut), puis vérifier les dossiers persistants sous `/mnt/user/appdata/dockge-enhanced` : `data` pour Enhanced, `stacks` pour les Compose.
4. Le chemin des stacks doit être **identique sur l'hôte, dans le conteneur et dans `DOCKGE_STACKS_DIR`**. Pour utiliser un pool spécifique au lieu de `/mnt/user`, modifier les trois ensemble. Les chemins relatifs des applications sont résolus sur l'hôte Docker.
5. Appliquer, ouvrir la WebUI et créer l'administrateur. Activer **Démarrage automatique** pour Enhanced dans Unraid ; `restart: unless-stopped` seul ne suffit pas après un arrêt de l'array. Configurer également le démarrage de l'array selon vos besoins.
6. Mettre Enhanced à jour depuis l'onglet **Docker d'Unraid**, en conservant les montages. Un cycle complet du sidecar interne avec sauvegarde Restic a aussi été testé ; il ne modifie pas le template Unraid. Choisir un seul gestionnaire pour les mises à jour automatiques. Les mises à jour des applications restent gérées par Enhanced.

Ne pas gérer simultanément une même stack avec Enhanced et Compose Manager. Lors d'un passage depuis la branche `test/unraid`, conserver les anciens dossiers et le port dans le template : les renommer n'est pas nécessaire. Sauvegarder avant migration et ne jamais ouvrir les mêmes données depuis deux Enhanced actifs.

## Droits et sécurité

Enhanced s'exécute en root dans son conteneur et doit pouvoir écrire dans `data` et `stacks`. Il **ne prend pas en charge `PUID`/`PGID`**. Les applications peuvent utiliser leurs propres UID/GID : une application `99:100` avec son dossier en `0750` a été testée.

Ne pas appliquer de `chmod 777`, de `chown` récursif global ou désactiver le remappage des utilisateurs pour masquer une erreur. Vérifier les propriétaires, ACL et droits de traversée des parents. Root remappé n'est pas forcément root sur l'hôte. Les modes Compose comme `0777` sont conservés par l'éditeur ; leur application dépend aussi de Compose et du type de config/secret.

Le conteneur n'est **pas privilégié**, mais le socket Docker permet de contrôler **tous les conteneurs et volumes de l'hôte**. Des dossiers séparés ne sont pas une isolation Docker. Ne pas exposer directement la WebUI à Internet. Examiner les réglages de nettoyage et sauvegarder les données importantes avant de les activer.

## Sauvegardes et reprise

- **Restic intégré** : utiliser une destination séparée. Sauvegarde, contrôle d'intégrité et restauration des Compose et `.env` ont été testés.
- **Zerobyte installé par Enhanced** : sources en lecture seule, destination distincte et restauration dans un emplacement séparé. Sauvegarde avec arrêt/reprise des services testée. Après recréation d'Enhanced, sa connexion au réseau Zerobyte est rétablie automatiquement, après vérification du propriétaire.
- **Appdata Backup d'Unraid** : sélectionner les dossiers `data` et `stacks` d'Enhanced, avec arrêt du conteneur pendant leur copie. Éviter les chevauchements avec les sauvegardes/updates Enhanced. Ne pas supposer que le plugin inclut les **volumes Docker nommés**, notamment les données internes de Zerobyte : prévoir leur sauvegarde séparée.
- Une sauvegarde des Compose ne remplace pas celle des données des applications. Tester une restauration avant de compter sur elle.

Les dépendances `depends_on`/`service_healthy` et `network_mode: service:...` sont respectées pendant un déploiement Compose. Unraid/Docker redémarre aussi des conteneurs individuellement : leur politique `restart` ne garantit pas l'ordre Compose. Les applications dépendantes doivent supporter les reconnexions.

## Validation et diagnostic

Validation réalisée dans une **VM Unraid 7.3.4 / Docker 29.8.2**, avec array XFS et vDisk Docker btrfs : installation par DockerMan, mises à jour, édition/déploiement, droits non-root, ports IPv4/IPv6, redémarrage d'Enhanced et de l'hôte, arrêt/reprise de l'array, Restic, Zerobyte et Appdata Backup. La CI complète les essais par les tests de non-régression, builds AMD64/ARM64 et Trivy strict.

Essais complémentaires : restauration complète de `data` et `stacks` avec Appdata Backup, accès HTTP en macvlan et ipvlan, coupure réseau Zerobyte et sauvegarde/restauration sur un montage SMB/CIFS du laboratoire. Un montage distant doit être disponible avant Zerobyte : s'il manque, la sauvegarde est refusée sans écrire dans le dossier local situé dessous. Après remontage, redémarrer Zerobyte ; si sa protection signale un changement d’identité du stockage, utiliser la revalidation explicite.

Ce n'est pas une certification de tout matériel, pool ou plugin Unraid, ni un test natif macOS/Windows. Pour un incident, fournir version d'Unraid, image/commit, chemins, pilote réseau, étapes et logs **sans secrets** dans [les issues Enhanced](https://github.com/Aerya/Dockge-Enhanced/issues). Pour retirer un laboratoire, vérifier les noms et le contenu des dossiers avant suppression ; jamais de purge Docker globale.

## Crédits

Template adapté d'alex3305. Les références historiques ci-dessous ont guidé les essais ; elles ne constituent pas une affirmation de correction universelle de chaque ticket.

[alex3305/unraid-docker-templates](https://github.com/alex3305/unraid-docker-templates/blob/main/dockge.xml) · [Dockge 238](https://github.com/louislam/dockge/discussions/238) · [911](https://github.com/louislam/dockge/issues/911) · [906](https://github.com/louislam/dockge/issues/906) · [455](https://github.com/louislam/dockge/issues/455) · [290](https://github.com/louislam/dockge/issues/290)
