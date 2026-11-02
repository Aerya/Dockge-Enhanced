# Récupérer une auto-mise à jour bloquée

[en](self-update-recovery.md) · [fr](self-update-recovery.fr.md) · [de](self-update-recovery.de.md) · [es](self-update-recovery.es.md) · [zh-CN](self-update-recovery.zh-CN.md)

Ce guide concerne uniquement l’erreur « Duplicate mount point » au lancement du sidecar. Le correctif #607 est publié dans l’image officielle `:latest`. L’ancienne version ne peut pas l’installer elle-même. Je vous présente mes excuses pour cette régression.

## Avant toute commande

Travaillez depuis le terminal de l’hôte Docker, pas depuis le terminal d’un conteneur Enhanced. Conservez une sauvegarde récente des données. Ne lancez ni `down -v`, ni purge, ni suppression des données. Seul Enhanced sera brièvement interrompu ; ne recréez pas les autres services.

## Identifier votre installation

Remplacez `ENHANCED_CONTAINER` par le nom réel du conteneur. Ces commandes lisent uniquement ses métadonnées Compose :

```bash
docker inspect ENHANCED_CONTAINER --format '{{index .Config.Labels "com.docker.compose.project"}}'
docker inspect ENHANCED_CONTAINER --format '{{index .Config.Labels "com.docker.compose.service"}}'
docker inspect ENHANCED_CONTAINER --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'
docker inspect ENHANCED_CONTAINER --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}'
```

Conservez le nom du projet, le service, le dossier de travail et TOUS les fichiers Compose/overrides indiqués, dans leur ordre. Gardez aussi vos options `--env-file` et profils habituels. Ne publiez pas votre configuration ni vos secrets.

## Mettre à jour une installation Compose

Dans le dossier de travail identifié, créez un fichier durable `recovery-image.yaml` avec le contenu suivant. Remplacez `SERVICE` par le nom du service Enhanced, pas le nom du conteneur :

```yaml
services:
  SERVICE:
    image: ghcr.io/aerya/dockge-enhanced:latest
```

Dans CHAQUE commande ci-dessous, remplacez `PROJECT`, `BASE_COMPOSE` et `SERVICE`. Entre le fichier de base et `recovery-image.yaml`, ajoutez un `-f` pour CHAQUE override déjà utilisé, dans son ordre d’origine. Le fichier de récupération doit être le dernier : il remplace seulement l’image, même si un ancien override fixe un digest. Ne continuez pas si un fichier manque ou si vous ne savez pas lequel utiliser.

```bash
docker compose -p PROJECT -f BASE_COMPOSE -f recovery-image.yaml config --images
```

Vérifiez que la liste des images contient `ghcr.io/aerya/dockge-enhanced:latest`. Puis :

```bash
docker compose -p PROJECT -f BASE_COMPOSE -f recovery-image.yaml pull SERVICE
docker compose -p PROJECT -f BASE_COMPOSE -f recovery-image.yaml up -d --no-deps SERVICE
```

N’effacez pas `recovery-image.yaml` après le démarrage : Docker enregistre son chemin dans les métadonnées Compose et une opération future peut le relire. Conservez les anciens overrides ; n’en supprimez pas aveuglément. Après vérification de l’interface et de l’état de santé, le mécanisme corrigé sera utilisé pour les prochaines mises à jour.

## Autres installations et assistance

Sans métadonnées Compose (par exemple template Unraid ou installation gérée par un autre outil), utilisez la fonction de mise à jour de l’outil d’origine, avec l’image officielle `:latest`, en conservant tous les paramètres, ports, réseaux et montages. N’appliquez pas ces commandes Compose à une installation qui n’en utilise pas. Si nécessaire, ouvrez une issue avec l’erreur et le mode d’installation, sans secrets. Une image personnalisée doit intégrer #607 ; elle n’est pas automatiquement couverte par le ciblage de cette alerte.

