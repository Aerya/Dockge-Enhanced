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

- **↩ Rollback d'images** — Après chaque mise à jour automatique, l'ancienne image est conservée 24 h. Un compte à rebours et un bouton **Rollback** apparaissent directement dans le tableau du watcher. L'ancienne image est supprimée automatiquement à l'expiration.
- **📦 Backup des volumes** — L'onglet Backup Restic permet d'inclure des volumes Docker en plus des compose/env : coche `/app/data` (données Dockge) et/ou ajoute autant de **chemins personnalisés** que tu veux (ex : `/dockers-data`), avec affichage des tailles à la demande.
- **🗑️ Purger les images inutilisées** — Nouveau bouton dans `/resources → Images` pour supprimer toutes les images non utilisées par un conteneur actif (avec ou sans tag), distinct du bouton existant "orphelines seulement".
- **🎨 Interface Watcher** — La section Apprise est maintenant rétractable (état mémorisé par navigateur). Les onglets Surveillance / Sécurité / Backup ont été redessinés pour plus de lisibilité.

---

## ✨ Fonctionnalités ajoutées

**🔄 Image Watcher** — Vérifie automatiquement les mises à jour d'images en comparant les digests locaux et distants (sans pull). Supporte Docker Hub, ghcr.io, les registries privés, et les stacks avec `network_mode: host`, réseaux externes ou ancres YAML. Fréquence configurable (1h → 24h). **Màj automatique par image** : choisis *Immédiat* pour màj dès la détection, *Planifié* pour appliquer à une heure précise (ex : `02:00` — utilise le fuseau `TZ` du conteneur), ou *Ignorer* pour ne jamais vérifier cette image. Un indicateur ⏳ signale les images en attente. **↩ Rollback** : après chaque mise à jour automatique, une fenêtre de 24 h s'ouvre — un compte à rebours et le bouton Rollback apparaissent dans le tableau ; l'ancienne image est purgée automatiquement à l'expiration. Les notifications distinguent ✅ màj auto effectuée, 🕐 planifiée à HH:MM et 🔄 action manuelle requise — par image. Clique sur **Voir le projet →** à côté de chaque image pour la rechercher instantanément.

**🛡️ Trivy Scanner** — Scanne les images des conteneurs en cours d'exécution avec [Trivy](https://trivy.dev/). `aquasec/trivy:latest` est automatiquement pull avant chaque scan et supprimée après — toujours à jour, aucune place occupée entre les scans. Seuil d'alerte et timeout de scan configurables. Résultats visibles dans l'UI avec un bouton de scan manuel par image. Déduplication des CVE (chaque vulnérabilité n'apparaît qu'une seule fois par image). Alertes envoyées sur Discord/Apprise avec retry/backoff en cas de rate limit.

**☁️ Backup Restic** — Sauvegarde automatique des `compose.yaml` et `.env` de chaque stack avec [Restic](https://restic.net/). **Plusieurs destinations en parallèle** — ajoutes-en autant que tu veux (ex : local + SFTP) et toutes sont sauvegardées à chaque exécution. 4 types de destination : local, SFTP/NAS (tout port, clé SSH ou mot de passe, `sshpass` intégré), S3/Backblaze B2, REST Server. **Backup des volumes** : inclus optionnellement `/app/data` (données Dockge) et/ou autant de **chemins personnalisés** que tu veux (ex : `/dockers-data`) — les tailles sont calculables et affichées à la demande. Politique de rétention configurable. La date du prochain backup est affichée. Clique sur un snapshot pour le dérouler et voir chaque fichier avec deux indicateurs : **vs snapshot précédent** (Nouveau / Modifié / Inchangé) et **vs disque actuel** (OK / Modifié / Absent). Sélectionne des fichiers individuellement et restaure-les en un clic.

**📢 Notifications Discord** — Embeds colorés pour les mises à jour d'images, alertes sécurité et résultats de backup. Plusieurs webhooks supportés par fonctionnalité. Définis `DOCKGE_PUBLIC_URL` pour inclure un lien cliquable. Retry automatique avec backoff exponentiel en cas de rate limit (HTTP 429) ou d'erreur serveur.

**🔔 Notifications Apprise** — Envoie les alertes vers 60+ services (Telegram, ntfy, Slack, Gotify, Pushover, Matrix…) via un conteneur [Apprise](https://github.com/caronc/apprise-api). Configuré une fois dans `/watcher` (section rétractable) et s'applique à tous les types d'alertes. Passe les URLs directement (mode stateless) ou laisse Apprise utiliser ses services pré-configurés. Fonctionne en parallèle de Discord.

**🗂️ Ressources Docker** — Liste et suppression des images, volumes et conteneurs non gérés depuis l'UI (`/resources`). L'onglet **Hors Dockge** liste les conteneurs qui tournent en dehors de Dockge — arrête-les et supprime-les directement depuis l'interface. Deux modes de purge d'images : **Orphelines** (`docker image prune`) pour les images sans tag uniquement, et **Inutilisées** (`docker image prune -a`) pour toutes les images non utilisées par un conteneur actif. Met en évidence les images/volumes liés à des stacks arrêtées, avec double confirmation. Le badge MàJ des stacks disparaît automatiquement une fois les images à jour. **Cases à cocher multi-sélection** pour supprimer plusieurs images en un seul clic.

**📊 Stats système & par stack** — CPU, RAM et espace disque affichés dans la barre de navigation (mis à jour toutes les 5 s), avec indicateurs couleur pastel (vert → jaune → rouge). La consommation CPU% et RAM de chaque stack est affichée à côté de son nom dans la liste (mis à jour toutes les 10 s, via un seul appel `docker stats --no-stream`). Activable/désactivable dans **Paramètres → Général**. La partition disque surveillée est configurable.

**🌐 Interface FR/EN** — Les pages `/watcher` et `/resources` disposent d'un bouton 🇫🇷/🇬🇧 pour changer la langue indépendamment du paramètre global de l'application.

**📱 Navigation mobile** — Barre de navigation bas complète sur mobile avec toutes les sections : Accueil, Console, Surveillance, Ressources, Paramètres.

---

## 📸 Captures d'écran

<table>
  <tr>
    <td align="center" width="33%">
      <a href="screens/enhanced3.png"><img src="screens/enhanced3.png" width="100%"/></a>
      <sub>Interface principale — stats CPU/RAM par stack</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/enhanced4.png"><img src="screens/enhanced4.png" width="100%"/></a>
      <sub>Image Watcher — surveillance des mises à jour</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/enhanced5.png"><img src="screens/enhanced5.png" width="100%"/></a>
      <sub>Trivy Scanner — configuration</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/enhanced9.png"><img src="screens/enhanced9.png" width="100%"/></a>
      <sub>Backup Restic — configuration & snapshots</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/enhanced11.png"><img src="screens/enhanced11.png" width="100%"/></a>
      <sub>Ressources Docker — sélection multiple d'images</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/enhanced7.png"><img src="screens/enhanced7.png" width="100%"/></a>
      <sub>Discord — alertes sécurité Trivy</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/enhanced10.png"><img src="screens/enhanced10.png" width="100%"/></a>
      <sub>Discord — notification backup</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/enhanced1.png"><img src="screens/enhanced1.png" width="100%"/></a>
      <sub>Bandeau de mise à jour in-app</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/enhanced2.png"><img src="screens/enhanced2.png" width="100%"/></a>
      <sub>Discord — alerte mise à jour Dockge Enhanced</sub>
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
      - ./data:/app/data
      - /opt/stacks:/opt/stacks
      - /backup:/backup          # optionnel — volume dédié au backup local
    environment:
      - DOCKGE_STACKS_DIR=/opt/stacks
      - DOCKGE_DATA_DIR=/app/data
      - DOCKGE_PUBLIC_URL=http://192.168.1.100:5001   # IP de ta machine ou domaine
      - TZ=Europe/Paris                                # ton fuseau horaire (affecte les MàJ planifiées)
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
