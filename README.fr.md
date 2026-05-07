<p align="center">
  <img src="https://raw.githubusercontent.com/Aerya/Dockge-Enhanced/main/frontend/public/icon.svg" width="120" alt="Dockge Enhanced logo">
</p>

# Dockge Enhanced

> 💡 **Tu l'utilises ? Tu l'aimes ? [⭐ Mets une étoile !](https://github.com/Aerya/dockge-enhanced/stargazers)** — ça prend deux secondes.

🇬🇧 [English version](README.md)

> 📖 **[Gérer ses conteneurs Docker autrement : le fork Dockge Enhanced](https://upandclear.org/2026/03/28/gerer-ses-conteneurs-docker-autrement-le-fork-dockge-enhanced-surveillance-dimages-scan-cve-backup-automatique-gestion-des-ressources/)** — article de présentation

Un greffon pour [**Dockge**](https://github.com/louislam/dockge) de louislam — ajoute la surveillance d'images, le scan de sécurité, les sauvegardes automatiques et la gestion des ressources Docker, le tout pilotable depuis l'interface web.

---

## 🆕 Nouveautés récentes

- **📋 Historique des mises à jour automatiques** — Un journal horodaté de chaque mise à jour automatique d'image est désormais enregistré et consultable directement dans l'onglet Image Watcher. Chaque entrée indique la date, la stack, le nom de l'image, l'ancien → nouveau digest (tronqué), le mode de mise à jour (Immédiat / Planifié), et le statut succès ou échec. L'historique est persisté entre les redémarrages (`update-history.json`) et peut être effacé en un clic. Les mises à jour échouées sont également enregistrées avec leur message d'erreur.
- **🚫 Patterns d'exclusion restic personnalisés** — Une nouvelle section **Patterns d'exclusion** dans l'onglet Sauvegarde permet d'ajouter des patterns glob passés directement à `restic --exclude` (ex : `*.wal`, `*.tmp`). Les patterns intégrés (`*.log`, `__pycache__`, `node_modules`) sont toujours appliqués. Par ailleurs, le code de sortie 3 de restic ("au moins un fichier source n'a pas pu être lu") est désormais traité comme un **succès avec avertissements** plutôt qu'une erreur — le snapshot est bien créé, et les fichiers qui ont disparu en cours de backup (ex : fichiers WAL de bases de données) sont listés dans la colonne Avertissements au lieu de marquer tout le backup en échec.
- **🔴 Détail des erreurs de backup dans l'UI** — Lorsqu'une entrée d'historique affiche ✗ Erreur, un clic sur le badge déroule un panneau de détail directement sous la ligne — plus besoin d'aller fouiller les logs ou les notifications. Le message d'erreur complet s'affiche dans un bloc formaté. Si plusieurs destinations sont impliquées, chaque destination en échec est listée séparément avec son nom et son erreur.
- **📊 Onglet Monitoring** — Un nouvel onglet **Monitoring** dans le menu Enhanced (`/watcher`) rassemble tout en un écran : **4 cartes de statut** (âge du dernier backup, mises à jour d'images en attente, CVE critiques, prochain scan Trivy), **détection de crash loop** (écoute les événements Docker en temps réel — alerte quand un conteneur redémarre N fois en X minutes, avec cooldown), et les **paramètres d'affichage** (toggle stats par stack et partition disque, déplacés depuis Paramètres → Général).
- **🏷️ Nom d'instance dans les notifications** — Toutes les notifications Discord et Apprise (mises à jour d'images, alertes Trivy, sauvegardes) incluent désormais le nom d'instance configuré dans **Paramètres → Général → Nom d'hôte principal**. Quand il est renseigné, le nom apparaît en préfixe `[mon-serveur]` dans le titre de la notification (Apprise) et dans le footer Discord à côté de l'horodatage. Utile quand tu fais tourner plusieurs instances de Dockge-Enhanced et que tu reçois les notifications dans le même canal.
- **📄 Diff entre deux snapshots** — La modal de prévisualisation des fichiers dispose désormais d'un troisième onglet **Diff vs snapshot préc.** en plus de Preview et Diff vs disque. Il affiche un diff ligne à ligne (LCS) entre le fichier tel qu'il était dans le **snapshot précédent** et son contenu dans le **snapshot courant** — exactement les lignes ajoutées ou supprimées entre deux backups. L'onglet est sélectionné automatiquement à l'ouverture d'un fichier portant le badge *Modified*. Désactivé pour les nouveaux fichiers (pas de version précédente). Utilise le même moteur de diff coloré que le diff vs disque existant.
- **🔍 Restore test après chaque backup** — Après chaque backup planifié, Dockge Enhanced lit automatiquement un fichier depuis le snapshot fraîchement créé pour vérifier que le repo est réellement lisible — pas juste que restic a dit OK. Il trouve le premier `compose.yaml` dans le snapshot, le déchiffre et le lit en mémoire (aucun fichier temporaire sur le disque), et enregistre le résultat comme ✅ Lisible ou ❌ Échec directement dans le tableau de l'historique des backups. Une icône 🔍 apparaît également à côté de chaque destination dans les notifications Discord/Apprise. Les backups on-save sont ignorés (rapidité). La fonctionnalité peut être désactivée dans l'onglet Backup.
- **🚫 Exclure une stack du backup** — Une nouvelle section **Stacks à sauvegarder** apparaît dans l'onglet Backup, listant toutes les stacks détectées dans ton dossier compose. Chaque stack dispose d'un toggle — désactive-le pour exclure cette stack de tous les backups (compose.yaml et .env). Les stacks exclues sont affichées avec un badge gris. L'en-tête de la section indique combien de stacks sont exclues lorsqu'elle est réduite. S'applique aux backups planifiés et aux déclenchements on-save.
- **🚫 Ignorer un CVE spécifique** — Dans le panneau de détails des CVE, chaque ligne de vulnérabilité dispose d'un bouton **⊘**. En cliquant dessus, ce CVE ID est marqué comme ignoré globalement : il disparaît du panneau de détails et est exclu de toutes les notifications Discord/Apprise. Une section **CVEs ignorés** apparaît dans l'onglet de configuration Trivy, listant chaque CVE ignoré avec un bouton **✕** pour reprendre la surveillance individuellement. Les CVEs ignorés sont persistés entre les redémarrages et les scans.
- **💾 Backup à la sauvegarde de compose** — À chaque fois qu'une stack est sauvegardée ou déployée depuis Dockge, un snapshot Restic est créé automatiquement — sans attendre le prochain cycle planifié. Cela couvre le `compose.yaml` **et** le `.env` de toutes tes stacks (Restic est incrémental, seul le fichier modifié ajoute des données). Un cooldown de 60 s évite les snapshots en rafale si tu sauvegardes plusieurs fois d'affilée. Point important : les snapshots on-save sont tagués `on-save` et **ne lancent volontairement pas le pruning** (`restic forget`). Cela signifie que les règles de rétention (`keepLast`, `keepDaily`, `keepWeekly`, …) sont uniquement appliquées par le backup cron planifié — une série de sauvegardes dans la journée ne peut donc jamais effacer silencieusement tes anciens snapshots quotidiens ou hebdomadaires. Un toggle dans l'onglet Sauvegarde permet de désactiver la fonctionnalité si tu n'en as pas besoin.
- **⏭ Ignorer une version spécifique** — Dans la table de statut des images, lorsqu'une mise à jour est disponible, un bouton **Ignorer cette version** apparaît. En cliquant dessus, le digest exact est marqué comme ignoré : plus de notification, plus d'auto-update, l'image affiche "Version ignorée". Un bouton **Reprendre** efface l'ignoré pour que le prochain check reprenne normalement. Permet de passer une release cassée sans désactiver la surveillance de l'image.
- **🔍 Vérification d'intégrité Restic** — Un nouveau bouton **Vérifier l'intégrité** dans l'onglet Sauvegarde exécute `restic check` sur chaque destination activée indépendamment. Les résultats (✅ OK / ❌ Échec) s'affichent directement avec la sortie complète de restic, sans interférer avec les backups planifiés.
- **🗂️ Parcourir les données de volumes dans les snapshots** — Le visualiseur de snapshots liste désormais les **fichiers de données des volumes** sauvegardés aux côtés des compose/env. Chaque fichier affiche le nom du projet (premier segment de chemin dans le volume), son chemin relatif dans le volume, et les deux mêmes indicateurs de statut que les compose : **vs snapshot précédent** (Nouveau / Modifié / Inchangé) et **vs disque actuel** (OK / Modifié / Absent). Sélectionne n'importe quelle combinaison de fichiers compose, env et volume et restaure-les en un seul clic.
- **🔒 Protection de l'image de rollback** — L'image de rollback est désormais taguée `dockge-rollback-<clé>:keep` immédiatement après chaque mise à jour automatique, empêchant `docker image prune` (ou tout autre outil) de la supprimer avant l'expiration de la fenêtre de 24 h. Le tag de protection est nettoyé automatiquement lors du rollback ou à l'expiration.
- **⚠️ Badge de fraîcheur du backup** — Un badge `⚠️ Backup en retard` apparaît dans l'en-tête de la section backup lorsque le dernier backup réussi date de plus du double de l'intervalle configuré. Une notification Discord/Apprise est également envoyée une fois par intervalle (FR/EN).
- **🕐 Date du prochain scan Trivy** — L'en-tête du statut Trivy affiche désormais la date du dernier scan **et** la date du **prochain scan planifié** à côté.
- **↩ Restauration par stack** — Chaque tiroir de stack dans le visualiseur de snapshots dispose d'un bouton **Restaurer la stack** en un clic, qui restaure tous les fichiers de cette stack (compose, env et volumes) sans avoir à les sélectionner individuellement.
- **🔍 Aperçu et diff de snapshot** — Pour les fichiers texte (compose.yaml, .env), un bouton œil ouvre une modale avec deux onglets : **Aperçu** (contenu brut du snapshot) et **Diff vs disque** (diff ligne par ligne LCS montrant exactement ce qu'une restauration changerait — les lignes en rouge disparaîtront, les lignes en vert seront ajoutées).

---

## ✨ Fonctionnalités ajoutées

**🔄 Image Watcher** — Vérifie automatiquement les mises à jour d'images en comparant les digests locaux et distants (sans pull). Supporte Docker Hub, ghcr.io, les registries privés, et les stacks avec `network_mode: host`, réseaux externes ou ancres YAML. Fréquence configurable (1h → 24h). **Màj automatique par image** : choisis *Immédiat* pour màj dès la détection, *Planifié* pour appliquer à une heure précise (ex : `02:00` — utilise le fuseau `TZ` du conteneur), ou *Ignorer* pour ne jamais vérifier cette image. Un indicateur ⏳ signale les images en attente. **↩ Rollback** : après chaque mise à jour automatique, une fenêtre de 24 h s'ouvre — un compte à rebours et le bouton Rollback apparaissent dans le tableau ; l'ancienne image est purgée automatiquement à l'expiration. Les notifications distinguent ✅ màj auto effectuée, 🕐 planifiée à HH:MM et 🔄 action manuelle requise — par image. Clique sur **Voir le projet →** à côté de chaque image pour la rechercher instantanément.

**🛡️ Trivy Scanner** — Scanne les images des conteneurs en cours d'exécution avec [Trivy](https://trivy.dev/). `aquasec/trivy:latest` est automatiquement pull avant chaque scan et supprimée après — toujours à jour, aucune place occupée entre les scans. Seuil d'alerte et timeout de scan configurables. Résultats visibles dans l'UI avec un bouton de scan manuel par image. Déduplication des CVE (chaque vulnérabilité n'apparaît qu'une seule fois par image). Alertes envoyées sur Discord/Apprise avec retry/backoff en cas de rate limit.

**☁️ Backup Restic** — Sauvegarde automatique des `compose.yaml` et `.env` de chaque stack avec [Restic](https://restic.net/). **Plusieurs destinations en parallèle** — ajoutes-en autant que tu veux (ex : local + SFTP) et toutes sont sauvegardées à chaque exécution. 4 types de destination : local, SFTP/NAS (tout port, clé SSH ou mot de passe, `sshpass` intégré), S3/Backblaze B2, REST Server. **Backup des volumes** : inclus optionnellement `/app/data` (données Dockge) et/ou autant de **chemins personnalisés** que tu veux (ex : `/dockers-data`) — les tailles sont calculables et affichées à la demande. Politique de rétention configurable. La date du prochain backup est affichée. **Visualiseur de snapshots** : clique sur un snapshot pour le dérouler et parcourir les fichiers compose/env *et les données de volumes* côte à côte. Les fichiers de volumes affichent le nom du projet et leur chemin relatif dans le volume. Chaque fichier dispose de deux indicateurs : **vs snapshot précédent** (Nouveau / Modifié / Inchangé) et **vs disque actuel** (OK / Modifié / Absent). Sélectionne n'importe quelle combinaison et restaure en un clic.

**📢 Notifications Discord** — Embeds colorés pour les mises à jour d'images, alertes sécurité et résultats de backup. Plusieurs webhooks supportés par fonctionnalité. Définis `DOCKGE_PUBLIC_URL` pour inclure un lien cliquable. Retry automatique avec backoff exponentiel en cas de rate limit (HTTP 429) ou d'erreur serveur.

**🔔 Notifications Apprise** — Envoie les alertes vers 60+ services (Telegram, ntfy, Slack, Gotify, Pushover, Matrix…) via un conteneur [Apprise](https://github.com/caronc/apprise-api). Configuré une fois dans `/watcher` (section rétractable) et s'applique à tous les types d'alertes. Passe les URLs directement (mode stateless) ou laisse Apprise utiliser ses services pré-configurés. Fonctionne en parallèle de Discord.

**🗂️ Ressources Docker** — Liste et suppression des images, volumes et conteneurs non gérés depuis l'UI (`/resources`). L'onglet **Hors Dockge** liste les conteneurs qui tournent en dehors de Dockge — arrête-les et supprime-les directement depuis l'interface. Deux modes de purge d'images : **Orphelines** (`docker image prune`) pour les images sans tag uniquement, et **Inutilisées** (`docker image prune -a`) pour toutes les images non utilisées par un conteneur actif. Met en évidence les images/volumes liés à des stacks arrêtées, avec double confirmation. Le badge MàJ des stacks disparaît automatiquement une fois les images à jour. **Cases à cocher multi-sélection** pour supprimer plusieurs images en un seul clic.

**📊 Stats système & par stack** — CPU, RAM et espace disque affichés dans la barre de navigation (mis à jour toutes les 5 s), avec indicateurs couleur pastel (vert → jaune → rouge). La consommation CPU% et RAM de chaque stack est affichée à côté de son nom dans la liste (mis à jour toutes les 10 s, via un seul appel `docker stats --no-stream`). Activable/désactivable depuis l'onglet **Monitoring**. La partition disque surveillée est configurable depuis ce même onglet.

**🖥️ Monitoring** — Un onglet **Monitoring** dédié (6e onglet dans le menu Enhanced `/watcher`) centralise tout : **cartes de vue d'ensemble** (âge du dernier backup, mises à jour d'images en attente, CVE critiques, prochain scan Trivy), **détection de crash loop** (flux d'événements Docker en temps réel — alerte quand un conteneur redémarre N fois en X minutes, avec cooldown), et les paramètres d'affichage (stats par stack, partition disque).

**🌐 Interface FR/EN** — Les pages `/watcher` et `/resources` disposent d'un bouton 🇫🇷/🇬🇧 pour changer la langue indépendamment du paramètre global de l'application.

**📱 Navigation mobile** — Barre de navigation bas complète sur mobile avec toutes les sections : Accueil, Console, Surveillance, Ressources, Paramètres.

---

## 📸 Captures d'écran

<table>
  <tr>
    <td align="center" width="33%">
      <a href="screens/LandingPage.png"><img src="screens/LandingPage.png" width="100%"/></a>
      <sub>Landing page — vue d’ensemble de Dockge Enhanced</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/Images.png"><img src="screens/Images.png" width="100%"/></a>
      <sub>Gestion des images Docker</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/Sécurité.png"><img src="screens/Sécurité.png" width="100%"/></a>
      <sub>Trivy Scanner — sécurité & vulnérabilités</sub>
    </td>
  </tr>

  <tr>
    <td align="center" width="33%">
      <a href="screens/Sauvegarde.png"><img src="screens/Sauvegarde.png" width="100%"/></a>
      <sub>Backup Restic — sauvegardes & snapshots</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/Ressources.png"><img src="screens/Ressources.png" width="100%"/></a>
      <sub>Ressources Docker — CPU, RAM & stockage</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/Notifications.png"><img src="screens/Notifications.png" width="100%"/></a>
      <sub>Centre de notifications</sub>
    </td>
  </tr>

  <tr>
    <td align="center" width="33%">
      <a href="screens/Monitoring.png"><img src="screens/Monitoring.png" width="100%"/></a>
      <sub>Monitoring temps réel des stacks</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/EnhancedUpdate.png"><img src="screens/EnhancedUpdate.png" width="100%"/></a>
      <sub>Mise à jour in-app de Dockge Enhanced</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/DiscordUpdates.png"><img src="screens/DiscordUpdates.png" width="100%"/></a>
      <sub>Discord — alertes de mises à jour Docker</sub>
    </td>
  </tr>

  <tr>
    <td align="center" width="33%">
      <a href="screens/DiscordTrivy.png"><img src="screens/DiscordTrivy.png" width="100%"/></a>
      <sub>Discord — alertes sécurité Trivy</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/DiscordBackup.png"><img src="screens/DiscordBackup.png" width="100%"/></a>
      <sub>Discord — notifications de sauvegarde</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/DiscordEnhancedUpdate.png"><img src="screens/DiscordEnhancedUpdate.png" width="100%"/></a>
      <sub>Discord — alertes de mise à jour Dockge Enhanced</sub>
    </td>
  </tr>
</table>

---

## 🚀 Installation

```yaml
# compose.yaml
services:
  dockge:
    image: ghcr.io/aerya/dockge-enhanced:latest
    container_name: dockge-enhanced
    restart: unless-stopped
    ports:
      - 5001:5001
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ../../data:/app/data
      - ../../opt/stacks:/opt/stacks
      - ../../backup/dockge:/backup          # optionnel — volume dédié au backup local
      - ../../docker:/dockers-data           # optionnel — données des Dockers pour savuvegarde
    environment:
      - DOCKGE_STACKS_DIR=/opt/stacks
      - DOCKGE_DATA_DIR=/app/data
#      - DOCKER_API_VERSION=x.xx                       # optionnel — pour certains NAS où Docker ne supporte pas d'API récente
      - TZ=Europe/Paris                               # fuseau horaire (affecte les MàJ planifiées)
```

> 💾 Le volume `/backup:/backup` est optionnel mais recommandé si tu utilises **local** comme destination Restic — pointe la destination sur `/backup` pour que les snapshots atterrissent dans un répertoire dédié sur l'hôte, hors du conteneur.

```bash
docker compose up -d
```

Ouvre **http://localhost:5001**, crée ton compte admin, puis clique sur **Surveillance** dans la barre de navigation.

---

## ⚙️ Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `DOCKGE_STACKS_DIR` | `/opt/stacks` | Dossier contenant les stacks Docker Compose |
| `DOCKGE_DATA_DIR` | `/opt/dockge/data` | Dossier de données Dockge (à définir sur `/app/data`) |
| `DOCKGE_PUBLIC_URL` | *(aucun)* | URL publique utilisée dans les liens des notifications Discord (ex : `https://dockge.mondomaine.fr`) |
| `DOCKER_API_VERSION` | *(aucun)* | Fixe la version d'API Docker négociée par le client — utile sur certains NAS comme par exemple avec DSM 7.x sur Synology DS220+ |
| `TZ` | `UTC` | Fuseau horaire du conteneur — **important** pour que les MàJ planifiées se déclenchent à la bonne heure locale (ex : `Europe/Paris`) |
| `DOCKGE_PORT` | `5001` | Port de la WebUI |
| `DOCKGE_SSL_KEY` / `DOCKGE_SSL_CERT` | — | Activer HTTPS |

> ⚠️ Toujours définir `DOCKGE_DATA_DIR=/app/data` pour correspondre au montage de volume, sinon les paramètres ne seront pas persistés après un redémarrage.

> ℹ️ `DOCKGE_PUBLIC_URL` est optionnel. Si absent, les notifications Discord sont envoyées sans lien. Compatible avec les reverse proxies et les domaines HTTPS.

---

## 🔄 Mises à jour automatiques

Ce fork suit les releases stables de Dockge automatiquement via GitHub Actions :
- **Chaque jour** — vérifie si une nouvelle version est sortie
- **Si oui** — merge les changements upstream et crée une PR
- **Au merge** — rebuild et publie les images Docker (`amd64` + `arm64`) sur GHCR

---

## 🙏 Crédits

- [**Dockge**](https://github.com/louislam/dockge) par louislam — le projet d'origine (licence MIT)
- [**Trivy**](https://github.com/aquasecurity/trivy) — scanner de vulnérabilités
- [**Restic**](https://restic.net/) — outil de backup chiffré
- [**Apprise**](https://github.com/caronc/apprise-api) — passerelle de notifications multi-plateformes
