<p align="center">
  <img src="https://raw.githubusercontent.com/Aerya/Dockge-Enhanced/main/frontend/public/icon.svg" width="120" alt="Dockge Enhanced logo">
</p>

# Dockge Enhanced

> 💡 **Use it? Like it? [⭐ Star it!](https://github.com/Aerya/dockge-enhanced/stargazers)** — it only takes a second.

🇫🇷 [Version française](README.fr.md)

> 📖 **[Gérer ses conteneurs Docker autrement : le fork Dockge Enhanced](https://upandclear.org/2026/03/28/gerer-ses-conteneurs-docker-autrement-le-fork-dockge-enhanced-surveillance-dimages-scan-cve-backup-automatique-gestion-des-ressources/)** — presentation article (in French)

A plugin for [**Dockge**](https://github.com/louislam/dockge) by louislam — adds image monitoring, security scanning, automatic backups and Docker resource management, all controllable from the web UI.

---

## 🆕 Recent changes

- **🚫 Ignore a specific CVE** — In the CVE detail panel, each vulnerability row has a **⊘** button. Clicking it marks that CVE ID as globally ignored: it disappears from the detail panel and is excluded from all Discord/Apprise notifications. A dedicated **Ignored CVEs** section appears in the Trivy settings tab, listing every ignored CVE ID with a **✕** button to resume tracking individually. Ignored CVEs persist across restarts and re-scans.
- **💾 Backup on compose save** — Every time you save or deploy a stack from Dockge, a Restic snapshot is created automatically — no waiting for the next scheduled run. This covers the `compose.yaml` **and** the `.env` of all your stacks (Restic is incremental, so only the changed file adds new data). A 60 s cooldown prevents back-to-back snapshots when you save several times in a row. Important: on-save snapshots are tagged `on-save` and **intentionally skip the pruning step** (`restic forget`). This means your retention rules (`keepLast`, `keepDaily`, `keepWeekly`, …) are only applied by the scheduled cron backup — so a burst of saves during the day can never silently delete your older daily or weekly snapshots. A toggle in the Backup tab lets you disable the feature if you don't need it.
- **⏭ Skip a specific release** — In the image status table, when an update is available, a new **Skip this version** button appears. Clicking it marks that exact digest as ignored: no more notifications, no auto-update, the image shows "Version skipped". A **Resume** button clears the skip so the next check picks it up again. This lets you skip a broken release without disabling watching for the image entirely.
- **🔍 Restic integrity check** — A new **Check integrity** button in the Backup tab runs `restic check` on every enabled destination independently. Results (✅ OK / ❌ Failed) are displayed inline with the full output from restic, without interfering with scheduled backups.
- **🗂️ Snapshot volume browser** — The snapshot viewer now lists backed-up **volume data files** alongside compose/env files. Each file shows its project name (first path segment inside the volume), its relative path within the volume, and the same two status indicators as compose files: **vs previous snapshot** (New / Modified / Unchanged) and **vs current disk** (OK / Modified / Missing). Select any combination of compose, env and volume files and restore them all in one click.
- **🔒 Rollback image protection** — The rollback image is now tagged `dockge-rollback-<key>:keep` immediately after each auto-update, preventing `docker image prune` (or any other tool) from removing it before the 24 h window expires. The protection tag is cleaned up automatically on rollback or expiry.
- **⚠️ Backup staleness badge** — A visible `⚠️ Backup overdue` badge appears on the backup section heading when the last successful backup is more than twice the configured interval old. A Discord/Apprise notification is also sent once per interval (FR/EN).
- **🕐 Next Trivy scan date** — The Trivy status heading now shows both the last scan date and the **next scheduled scan** date alongside it.
- **↩ Restore by stack** — Each stack accordion in the snapshot viewer has a one-click **Restore stack** button that restores all files from that stack (compose, env and volumes) without having to select them individually.
- **🔍 Snapshot file preview & diff** — For text files (compose.yaml, .env), an eye button opens a modal with two tabs: **Preview** (raw snapshot content) and **Diff vs disk** (line-by-line LCS diff showing exactly what a restore would change — lines in red will disappear, lines in green will be added).

---

## ✨ Added features

**🔄 Image Watcher** — Automatically checks for image updates by comparing local and remote digests (no pull required). Supports Docker Hub, ghcr.io, private registries and images using `network_mode: host`, external networks or YAML anchors. Configurable frequency (1h → 24h). **Per-image auto-update**: choose *Immediate* to update on detection, *Scheduled* to apply the update at a specific time of day (e.g. `02:00` for off-peak hours — uses the container's `TZ` timezone), or *Ignore* to skip update checking entirely for that image. A ⏳ indicator shows images waiting for their slot. **↩ Rollback**: after each auto-update a 24 h window is open — a countdown timer and Rollback button appear in the table; the old image is automatically purged on expiry. Notifications distinguish ✅ auto-updated, 🕐 scheduled, and 🔄 manual action required — per image. Click **View project →** next to any image to search for it instantly.

**🛡️ Trivy Scanner** — Scans running container images for known vulnerabilities (CVE) via [Trivy](https://trivy.dev/). `aquasec/trivy:latest` is automatically pulled before each scan and removed afterwards — always up-to-date, zero disk footprint between scans. Configurable severity threshold and scan timeout. Results visible in the UI with a per-image manual scan button. CVE deduplication ensures each vulnerability appears only once per image. Alerts sent to Discord/Apprise with retry/backoff on rate limits.

**☁️ Restic Backup** — Automatic backup of all stack `compose.yaml` and `.env` files with [Restic](https://restic.net/). **Multiple destinations in parallel** — add as many as you want (e.g. local + SFTP) and all are backed up on every run. 4 destination types: local, SFTP/NAS, S3/Backblaze B2, REST Server. SFTP supports both **SSH key** and **password** authentication (any port, `sshpass` is bundled). Configurable retention policy. **Volume backup**: optionally include `/app/data` (Dockge data) and/or any number of **custom volume paths** (e.g. `/dockers-data`) — sizes are calculated and displayed on demand. The next scheduled backup time is displayed in the UI. **Snapshot browser**: click any snapshot to expand it and browse compose/env files *and* volume data files side by side. Volume files show their project name and relative path inside the volume. Every file has two status indicators: **vs previous snapshot** (New / Modified / Unchanged) and **vs current disk** (OK / Modified / Missing). Select any mix of files and restore them in one click.

**📢 Discord Notifications** — Rich embeds for image updates, security alerts, and backup results. Supports multiple webhooks per feature. Set `DOCKGE_PUBLIC_URL` to include a clickable link in notifications. Automatic retry with exponential backoff on rate limits (HTTP 429) and server errors.

**🔔 Apprise Notifications** — Send alerts to 60+ services (Telegram, ntfy, Slack, Gotify, Pushover, Matrix…) via an [Apprise](https://github.com/caronc/apprise-api) container. Configured once in `/watcher` (collapsible section) and applies to all alert types. Pass notification URLs directly (stateless mode) or let Apprise use its pre-configured services. Works alongside Discord.

**🗂️ Docker Resources** — List and delete Docker images, volumes, and unmanaged containers directly from the UI (`/resources`). The **Unmanaged** tab lists containers running outside Dockge — stop and delete them from the UI. Two image purge modes: **Dangling** (`docker image prune`) for untagged images only, and **Unused** (`docker image prune -a`) for all images not used by any active container. Highlights images/volumes linked to stopped Dockge stacks, with double confirmation before any destructive action. The update badge on stacks is automatically cleared once images are up to date. **Multi-select checkboxes** let you bulk-delete multiple images in one click.

**📊 System & Stack Stats** — CPU, RAM and disk usage displayed in the top navbar (refreshed every 5 s), with pastel colour indicators (green → yellow → red). Per-stack CPU% and RAM consumption are shown next to each compose name in the sidebar (refreshed every 10 s, powered by a single `docker stats --no-stream` call). Both can be enabled/disabled in **Settings → General**. The monitored disk partition is configurable.

**🌐 FR/EN interface** — The `/watcher` and `/resources` pages have a 🇫🇷/🇬🇧 toggle to switch languages independently of the global app setting.

**📱 Mobile navigation** — Full bottom navigation bar on mobile with all sections: Home, Console, Surveillance, Resources, Settings.

---

## 📸 Screenshots

<table>
  <tr>
    <td align="center" width="33%">
      <a href="screens/enhanced3.png"><img src="screens/enhanced3.png" width="100%"/></a>
      <sub>Main interface — per-stack CPU/RAM stats</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/enhanced4.png"><img src="screens/enhanced4.png" width="100%"/></a>
      <sub>Image Watcher — update monitoring</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/enhanced5.png"><img src="screens/enhanced5.png" width="100%"/></a>
      <sub>Trivy Scanner — configuration</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/enhanced9.png"><img src="screens/enhanced9.png" width="100%"/></a>
      <sub>Restic Backup — configuration & snapshots</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/enhanced11.png"><img src="screens/enhanced11.png" width="100%"/></a>
      <sub>Docker Resources — bulk image selection</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/enhanced7.png"><img src="screens/enhanced7.png" width="100%"/></a>
      <sub>Discord — Trivy security alerts</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/enhanced10.png"><img src="screens/enhanced10.png" width="100%"/></a>
      <sub>Discord — backup notification</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/enhanced1.png"><img src="screens/enhanced1.png" width="100%"/></a>
      <sub>In-app update banner</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/enhanced2.png"><img src="screens/enhanced2.png" width="100%"/></a>
      <sub>Discord — Dockge Enhanced update alert</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/enhanced12.png"><img src="screens/enhanced12.png" width="100%"/></a>
      <sub>Backup Restic — add an additional volume </sub>
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
      - ../../backup/dockge:/backup          # optional — dedicated local backup volume
      - ../../docker:/dockers-data           # optional — Dockers data to backup
    environment:
      - DOCKGE_STACKS_DIR=/opt/stacks
      - DOCKGE_DATA_DIR=/app/data
#      - DOCKER_API_VERSION=x.xx                       # optional — for some NAS devices where Docker does not support a recent API version
      - TZ=Europe/Paris                               # timezone (affects scheduled updates)
```

> 💾 The `/backup:/backup` volume is optional but recommended if you use **local** as a Restic backup destination — set the destination path to `/backup` so your snapshots land on a dedicated host directory outside the container.

```bash
docker compose up -d
```

Open **http://localhost:5001**, create your admin account, then click **Monitoring** in the navigation bar.

---

## ⚙️ Environment variables

| Variable | Default | Description |
|---|---|---|
| `DOCKGE_STACKS_DIR` | `/opt/stacks` | Directory containing Docker Compose stacks |
| `DOCKGE_DATA_DIR` | `/opt/dockge/data` | Dockge data directory (set to `/app/data`) |
| `DOCKGE_PUBLIC_URL` | *(none)* | Public URL used in Discord notification links (e.g. `https://dockge.example.com`) |
| `DOCKER_API_VERSION` | *(none)* | Fixes the Docker API version negotiated by the client — useful on certain NAS systems, for example with DSM 7.x on Synology DS220+ |
| `TZ` | `UTC` | Container timezone — **important** for scheduled auto-updates to fire at the right local time (e.g. `Europe/Paris`) |
| `DOCKGE_PORT` | `5001` | Web UI port |
| `DOCKGE_SSL_KEY` / `DOCKGE_SSL_CERT` | — | Enable HTTPS |

> ⚠️ Always set `DOCKGE_DATA_DIR=/app/data` to match the volume mount, otherwise settings won't persist after a restart.

> ℹ️ `DOCKGE_PUBLIC_URL` is optional. If not set, Discord notifications are sent without a link. Works with reverse proxies and HTTPS domains.

---

## 🔄 Auto-updates

This fork tracks upstream Dockge releases automatically via GitHub Actions:
- **Daily** — checks for a new stable release
- **If found** — merges upstream changes and opens a PR
- **On merge** — rebuilds and publishes Docker images (`amd64` + `arm64`) to GHCR

---

## 🙏 Credits

- [**Dockge**](https://github.com/louislam/dockge) by louislam — the original project (MIT licence)
- [**Trivy**](https://github.com/aquasecurity/trivy) — vulnerability scanner
- [**Restic**](https://restic.net/) — encrypted backup tool
- [**Apprise**](https://github.com/caronc/apprise-api) — multi-platform notification gateway
