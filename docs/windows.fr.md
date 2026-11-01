# Windows 11 avec Docker Desktop (WSL2)

[English](windows.md) · [Français](windows.fr.md) · [Deutsch](windows.de.md) · [Español](windows.es.md) · [简体中文](windows.zh-CN.md)

Enhanced fonctionne dans un **conteneur Linux**, pas comme service Windows natif ni comme conteneur Windows. Utilisez Docker Desktop avec son moteur WSL2 et activez l’intégration de votre distribution Linux. Compose est déjà inclus dans Enhanced ; n’installez pas un second moteur Docker dans WSL.

Dans Docker Desktop, activez **Use the WSL 2 based engine**, puis **Resources → WSL Integration** pour votre distribution. Ouvrez le terminal de cette distribution et vérifiez :

```bash
docker version
docker compose version
mkdir -p "$HOME/dockge-enhanced"/{data,stacks,backups}
cd "$HOME/dockge-enhanced"
```

Pour l’installation recommandée, utilisez le système de fichiers Linux de la distribution (par exemple `/home/user/dockge-enhanced`), pas `/mnt/c`. Séparez les montages des données et des stacks. Le dossier des stacks doit conserver le **même chemin absolu dans Enhanced et sur l’hôte Docker**.

Créez `compose.yaml` dans ce dossier :

```yaml
services:
  dockge:
    image: ghcr.io/aerya/dockge-enhanced:latest
    container_name: dockge-enhanced
    restart: unless-stopped
    ports:
      - "5001:5001"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ${HOME}/dockge-enhanced/data:/app/data
      - ${HOME}/dockge-enhanced/stacks:${HOME}/dockge-enhanced/stacks
      - ${HOME}/dockge-enhanced/backups:/backup
    environment:
      DOCKGE_STACKS_DIR: ${HOME}/dockge-enhanced/stacks
      DOCKGE_DATA_DIR: /app/data
```

Lancez ensuite `docker compose up -d`, ouvrez `http://localhost:5001` et créez votre compte administrateur. Gardez le socket Docker privé : il donne le contrôle du moteur Docker Linux. Pour une instance de test, utilisez d’autres dossiers et un autre port.

Restic peut utiliser `/backup` comme destination locale. Zerobyte géré est testé avec des **dossiers source/destination Linux WSL**, séparés des données et stacks d’Enhanced. Ne désactivez pas les protections de chemins ou d’identité du stockage pour utiliser un chemin refusé. Restaurez d’abord dans un emplacement de test dédié. Une sauvegarde dans la même VM/le même disque Windows ne protège pas de la perte de ce disque.

La variante NTFS a aussi été testée pour Compose, `.env`, les chemins relatifs contenant des espaces, les volumes nommés et Restic. Depuis PowerShell, utilisez `C:/...` comme source du bind et `/run/desktop/mnt/host/c/...` comme destination correspondante des stacks/`DOCKGE_STACKS_DIR`. Ce mapping propre à Docker Desktop n’est pas portable sous Linux. Le partage NTFS n’offre pas les mêmes garanties de propriétaires, chmod ou performances qu’un système Linux ; préférez le stockage Linux WSL/les volumes nommés pour les bases de données. Zerobyte géré sur NTFS n’est pas validé ; utilisez la configuration WSL ci-dessus.

- Docker Desktop doit être démarré. Son option de lancement à l’ouverture de session n’est pas un service système Windows autonome ; après redémarrage, connectez-vous et attendez le moteur Linux. `restart: unless-stopped` ne lance pas Docker Desktop.
- CPU/RAM, statistiques disque et contrôle d’espace du self-update voient la VM Linux/les systèmes de fichiers exposés à Docker, pas tout Windows. Vérifiez aussi l’espace libre du disque Windows : la capacité apparente d’un disque virtuel n’est pas un espace réservé sur l’hôte.
- `systemd` de l’hôte, capteurs matériels Linux, réseau hôte, accès USB/GPU et montages réseau NAS ne sont pas équivalents à Linux natif. Ne supposez pas que PowerWatch mesure le matériel Windows à travers cette VM.
- Les instances liées doivent pouvoir joindre leurs adresses respectives. `localhost` désigne l’appelant ; `host.docker.internal` sert aux conteneurs pour joindre cet hôte Windows, pas d’adresse publique pour d’autres serveurs. N’ouvrez le pare-feu Windows qu’aux clients de confiance.

Tests dans une VM Windows 11 Enterprise Evaluation 26H2 isolée, Docker Desktop 4.97 / Engine 29.9, WSL 3.0.3 et Ubuntu 24.04 : Compose et ENV, accès non-root, volumes nommés/relatifs, healthchecks, limites CPU/RAM, restart/recreate, SQLite/node-pty et terminal navigateur, snapshot/restauration Restic, backup/restauration Zerobyte géré avec hooks protégés, deux instances Enhanced liées et permissions limitées. Le sidecar utilise une destination Linux en conservant la source Windows indiquée par Docker. Aucune prise en charge des conteneurs Windows natifs n’est annoncée.

**Après un redémarrage Windows :** sur Docker Desktop 4.97, le démarrage automatique avec des binds WSL a échoué pendant ce test : socket indisponible et dossier temporairement vide dans un conteneur, alors que les vrais fichiers WSL étaient intacts. Ne relancez pas un assistant de première installation sur un dossier apparemment vide. Attendez que `docker version` fonctionne dans votre distribution, vérifiez les fichiers dans vos dossiers `data` et `stacks`, puis relancez `docker compose up -d` depuis le dossier d’installation. Dans Enhanced, démarrez les stacks arrêtées et redémarrez celles dont les montages sont incomplets. Cette reprise, les comptes existants et une nouvelle sauvegarde/restauration Zerobyte ont été vérifiés. La variante NTFS est revenue automatiquement dans ce test. Le démarrage WSL entièrement autonome n’est donc **pas validé** ; ce problème de montages est aussi [signalé à Docker Desktop](https://github.com/docker/desktop-feedback/issues/601).

[Docker Desktop / WSL](https://docs.docker.com/desktop/features/wsl/) · [WSL filesystems](https://learn.microsoft.com/en-us/windows/wsl/filesystems)
