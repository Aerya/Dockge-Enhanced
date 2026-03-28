<p align="center">
  <img src="https://raw.githubusercontent.com/Aerya/Dockge-Enhanced/main/frontend/public/icon.svg" width="120" alt="Dockge Enhanced logo">
</p>

# Dockge Enhanced

> 💡 **Tu l'utilises ? Tu l'aimes ? [⭐ Mets une étoile !](https://github.com/Aerya/dockge-enhanced/stargazers)** — ça prend deux secondes.

🇬🇧 [English version](README.md)

Fork de [**Dockge**](https://github.com/louislam/dockge) par louislam — ajoute la surveillance d'images, le scan de sécurité, les sauvegardes automatiques et la gestion des ressources Docker, le tout pilotable depuis l'interface web.

---

## ✨ Fonctionnalités ajoutées

**🔄 Image Watcher** — Vérifie automatiquement les mises à jour d'images en comparant les digests locaux et distants (sans pull). Supporte Docker Hub, ghcr.io et les registries privés. Fréquence configurable (1h → 24h). Clique sur **Voir le projet →** à côté de chaque image pour la rechercher instantanément.

**🛡️ Trivy Scanner** — Scanne les images des conteneurs en cours d'exécution avec [Trivy](https://trivy.dev/). `aquasec/trivy:latest` est automatiquement pull avant chaque scan et supprimée après — toujours à jour, aucune place occupée entre les scans. Seuil d'alerte configurable, résultats visibles dans l'UI et envoyés sur Discord.

**☁️ Backup Restic** — Sauvegarde automatique des `compose.yaml` et `.env` de chaque stack avec [Restic](https://restic.net/). 4 destinations : local, SFTP/NAS, S3/Backblaze B2, REST Server. Politique de rétention configurable, gestion des snapshots depuis l'UI.

**📢 Notifications Discord** — Embeds colorés pour les mises à jour d'images, alertes sécurité et résultats de backup. Plusieurs webhooks supportés par fonctionnalité. Définis `DOCKGE_PUBLIC_URL` pour inclure un lien cliquable dans les notifications.

**🗂️ Ressources Docker** — Liste et suppression des images et volumes Docker depuis l'UI (`/resources`). Met en évidence les images/volumes liés à des stacks Dockge arrêtées, avec double confirmation avant toute suppression destructive.

**🌐 Interface FR/EN** — Les pages `/watcher` et `/resources` disposent d'un bouton 🇫🇷/🇬🇧 pour changer la langue indépendamment du paramètre global de l'application.

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
    environment:
      - DOCKGE_STACKS_DIR=/opt/stacks
      - DOCKGE_DATA_DIR=/app/data
      - DOCKGE_PUBLIC_URL=http://192.168.1.100:5001   # IP de ta machine ou domaine
```

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
