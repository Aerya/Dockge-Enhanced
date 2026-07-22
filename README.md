<p align="center">
  <img src="https://raw.githubusercontent.com/Aerya/Dockge-Enhanced/main/frontend/public/icon.svg" width="120" alt="Dockge Enhanced logo">
</p>

# Dockge Enhanced

A feature fork of [Dockge](https://github.com/louislam/dockge) — adds image monitoring, security scanning, automatic backups, crash-loop detection and Docker resource management, all from the web UI.

> 🇫🇷 [Version française](README.fr.md) · [Presentation article (in French)](https://upandclear.org/2026/03/28/gerer-ses-conteneurs-docker-autrement-le-fork-dockge-enhanced-surveillance-dimages-scan-cve-backup-automatique-gestion-des-ressources/)

<p align="center">
  <img src="https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white" alt="Docker">
  <img src="https://github.com/Aerya/Dockge-Enhanced/actions/workflows/build-publish.yml/badge.svg?branch=main" alt="Build">
  <img src="https://img.shields.io/badge/arch-amd64%20%7C%20arm64-lightgrey" alt="multi-arch">
  <img src="https://img.shields.io/badge/i18n-FR%20%7C%20EN-blue" alt="i18n">
  <img src="https://img.shields.io/badge/based%20on-Dockge-orange?logo=github&logoColor=white" alt="based on Dockge">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT">
</p>

> **Using it? Liking it? [⭐ Drop a star!](https://github.com/Aerya/Dockge-Enhanced)** — takes two seconds.

---

## Features

### What sets Dockge Enhanced apart

| Area | Dockge Enhanced adds |
| --- | --- |
| **Multi-instance** | Instance names, per-instance stack filtering and sorting, copy, migration, and cold replication with failover |
| **Backup & recovery** | Multi-destination Restic, volumes, per-stack consistency, selective restore, snapshot tests and diffs |
| **Images & security** | Update monitoring, auto-update with rollback, Trivy scans, and CVE exceptions |
| **Monitoring** | System, stack, and container stats, crash loops, healthcheck auto-heal, enhanced logs, and optional Kula integration |
| **Docker management** | Images, volumes, unmanaged containers, per-container Compose actions, bulk actions, and safeguards for risky deletions |
| **Notifications & access** | Discord, Apprise, 2FA, trusted proxy, Turnstile, and mobile clients |

The main differences remain visible above; the detailed catalogue is preserved below to document the exact differences from Dockge and other forks without overwhelming the initial read.

<details>
<summary><strong>Show the complete feature catalogue</strong></summary>

**2026-07-22 — Isolated disaster-recovery tests and application profiles** — Cold replicas can periodically restore their complete encrypted Restic archive into a temporary Compose project and temporary bind mounts or named volumes. The test checks restored file counts and sizes, can optionally start and health-check the isolated stack, disables published ports and unavailable external configs or secrets, then removes its containers, files and volumes. Its report is persisted and the stack page warns when the latest test is missing or too old. The transfer wizard also proposes PostgreSQL, MariaDB/MySQL, Redis and SQLite profiles: preparation and cleanup commands remain visible and editable before activation and only run inside the selected Compose service.

**2026-07-22 — Safe move finalization** — After a validated migration, Dockge-Enhanced now keeps a persistent “awaiting finalization” state on the source. **Return to source** stops the target containers, preserves their files and data, then restarts only the services that were previously running on the source. **Finalize move** explicitly removes the source stack files without ever deleting persistent data outside its stack folder automatically.

**2026-07-22 — Unified migration transports** — The transfer engine now uses a single `prepare/upload/restore/cleanup` interface. Restic REST repositories provide HTTP transport, SFTP repositories provide SSH transport, and S3 or local repositories use the exact same workflow. Every mode is encrypted, checksum-verified, incremental and safely retryable without carrying bulk data through Socket.IO. The WebUI never exposes an arbitrary SSH shell.

**2026-07-17 — Filter stacks by instance** — The stack list can show every instance or one selected Dockge instance. The total, active, stopped and inactive counters update for the selected instance; the browser remembers this filter independently from sorting.

**2026-07-17 — Optional action labels** — A switch on the Compose page selects compact icons or icons with their function displayed underneath in small text. The browser remembers the choice, and tooltips remain available in both modes.

**2026-07-17 — Per-container Compose actions with VPN safeguards** — Every container in a stack exposes **Start**, **Stop**, **Restart**, **Update**, **Recreate**, and **Pull + recreate** without applying the operation to the whole stack. The last four actions have distinct behavior and icons: restart keeps the container, update pulls then performs a normal `up`, recreate forces replacement, and pull + recreate combines both operations. When a service provides its network namespace to other containers through `network_mode: service:<service>` — the typical VPN/Gluetun setup — Dockge Enhanced automatically includes the affected services in operations that require it. During a normal update, they are recreated only when the VPN container was actually replaced.

**2026-07-17 — Per-container resource statistics** — When stack statistics are enabled under **Monitoring**, every container card also displays its own CPU and memory consumption. These figures use the same shared Docker collector as stack statistics and respect low-power mode.

**2026-07-17 — Scheduling activation and indicators** — Scheduling remains hidden and disabled by default for each stack. A **Scheduling** action alongside **Edit**, **Restart**, **Update**, and the other stack actions shows or hides its panel. Stacks with an active rule are marked in the list, and a **Scheduled** counter joins the Stacks, Active, Stopped, and Inactive counters for quick filtering.

**2026-07-15 — Scheduled cold replicas and manual failover** — Any managed stack can maintain a one-way standby replica on another Dockge instance every 15 minutes, 1 hour, 6 hours or 24 hours. Dockge-Enhanced automatically refreshes the Compose files, selected bind mounts and named volumes through the shared Restic repository while keeping the target containers stopped. The stack page reports the target, current state, last successful synchronization, duration, retained snapshot, next run and any error. A manual **Fail over** action deploys the standby and validates its services and healthchecks before marking it active. The last successful snapshot is retained until its replacement is fully restored; a failed refresh restores the previous configuration and data. Replication has its own scheduler and metadata and does not alter the existing Restic backup scheduler, retention or `prune` behavior.

**2026-07-15 — Complete cross-instance stack copy and migration** — A stack wizard copies or moves configuration and, optionally, bind-mount and named-volume data to another instance. Source → target mappings are discovered automatically and remain editable. Data bypasses Socket.IO and streams through a shared local, SFTP, S3 or REST Restic repository configured identically on both instances. Copies honor the selected consistency mode: live, stop/start or application hooks. Migrations first create an incremental snapshot while the source stays online, prepare the target, then stop only the active source services for a final delta, restore and deploy the target, and verify container states and healthchecks. On failure the target is removed and the source returns to its exact previous service state; after success the source remains stopped while its files are kept. The existing scheduled Restic backup engine remains independent: temporary transfer snapshots are identified and forgotten separately without `prune`. The Compose page also exposes every action as a visible icon with a tooltip, plus an optional mode that adds a label beneath each icon.

**2026-07-15 — Instance names, filtering and per-agent sorting** — Both the local instance and remote Dockge agents can have a free-form display name, editable at any time from the home page (for example `Main NAS` or `Backup server`). A **Local** badge clearly identifies the instance hosting the current interface; remote agents keep their technical endpoint visible underneath for unchanged routing. The custom name is also used on stack pages and in the stack list. Two selectors limit the list to one instance and sort stacks by status or instance, with both choices saved in the browser.

**2026-07-15 — Per-stack backup consistency** — Every stack included in Restic backups gets its own mode: **Live** (no interruption), **Stop then restart** (Dockge remembers only running services, stops them before the snapshot and restarts the same services even after a failure), or **Application hooks**. Pre/post hooks run through `docker compose exec` inside the selected service, allowing database dumps, cache flushes or application locks without host-shell access. Stacks are restored before Restic retention and restore testing to minimize downtime. This feature takes inspiration from [Repliqate](https://github.com/lminlone/repliqate)'s backup-consistency approach while remaining integrated with Dockge Enhanced's Restic engine, destinations and restore workflow.

**2026-07-09 — Clickable stack status summary** — The stack list header now shows total, active, stopped and inactive stack counts. Each counter filters the list directly, while the stopped and inactive counters include short tooltips explaining the difference.

**2026-07-08 — Mounted volume sizes inside container cards** — Each stack page now shows mounted volumes directly inside each container card, with mount point, on-demand size calculation and direct access to the existing **Files** browser for each mount.

**2026-07-08 — Stack logs with range and search** — The compose-page log terminal can load the latest lines or a `24 h`, `3 days`, `7 days` or `14 days` window through `docker compose logs --since`, while keeping the service filter and timestamp toggle. Built-in search lets you jump between matches in the displayed scrollback.

**2026-07-08 — Host system details in Monitoring** — The **Monitoring** tab now shows CPU model, core count, per-core usage, 1/5/15 min load averages, process count, system uptime, and friendly CPU/disk temperatures when the environment exposes the needed tools (`/proc`, `/sys`, `sensors`, `smartctl` or Synology disk helpers).

**2026-07-06 — Local authentication, bootstrap, and trusted proxy mode** — The historical behavior remains unchanged by default, with no new variable or Compose update required. Automated deployments can create the first administrator from a secret, while the optional `trusted-proxy` mode accepts an identity supplied by OAuth2 Proxy, Traefik ForwardAuth, or another proxy only when the connection originates from an explicitly trusted network. REST APIs and Socket.IO share the same policy, `/setup` is permanently locked after initialization, and no technical path needs to be exposed publicly.

**2026-07-06 — Complete image discovery in the watcher** — The **Images** tab in `/watcher` now lists images declared by every local stack, even when a stack is stopped and its containers or local images have been removed. Discovery follows all four Compose filenames accepted by Dockge (`compose.yaml`, `compose.yml`, `docker-compose.yaml`, and `docker-compose.yml`) and uses Docker Compose’s resolved model to support variables, anchors, `extends`, and `include`, with no prior pull required.

**2026-07-06 — Docker resource search** — The **Docker Resources** page, including when opened from `/watcher`, now provides one search field across the Images, Volumes, and Unmanaged tabs. Resources can be filtered by name, image, tag, ID, stack, service, or linked container.

**2026-06-30 — Automatic stack scheduling** — Each local stack can now be started and stopped using two independent rules, directly from its stack page or from the new **Scheduling** tab under `/watcher`. Presets cover **daily**, **weekly**, **every 2 weeks** with a first-run anchor date, and **monthly** schedules; a **Custom** mode also accepts a standard 5-field Unix cron expression (`minute hour day-of-month month day-of-week`). The next run, server timezone and latest execution result are persisted. Starting runs `docker compose up -d --remove-orphans`, while stopping runs `docker compose stop`. Rules are disabled by default and apply to local stacks, not remote agents.

**2026-06-27 — Volume file browser and editor** — On each stack page, every container gets a **Files** button that opens a browser of its mounted volumes (binds and named volumes) right in the WebUI. Navigate the tree, open a text file (JSON, conf, yaml, html, php, scripts, logs…) in an embedded editor, and save it — no need to spin up a separate console. You can also **create files and folders, rename, delete and upload**. Access goes through an ephemeral busybox helper container that mounts the volume via the Docker socket: it works **even when the stack is stopped**, and even with shell-less images (distroless/scratch), without the host path being mounted into the Dockge container. Writes happen in place (`cat >`) to preserve owner and permissions. Restricted to the container's mount points, text files up to 5 MiB, binary files refused for editing, and every operation is recorded in the audit log.

**2026-06-27 — Image source link** — On a stack page, each image shows a small clickable icon next to its name that opens the source page: GitHub repo for `ghcr.io/owner/repo`, Docker Hub page for official/community images, Quay/GitLab repos, etc.

**2026-06-27 — Image search in the watcher** — The **Images** tab of `/watcher` now has a search field that instantly filters the table by image or stack name — handy to quickly find an image and change its update schedule when you have many.

**2026-06-27 — Larger progress terminal** — The stack operation progress pane (deploy/restart/update) is taller and scrollable, showing more containers before Docker Compose truncates the output into `... N more`.

**2026-06-19 — Compose override editor** — Each stack page in edit mode now has a dedicated `compose.override.yaml` editor, alongside the main compose file and the `.env`. Docker Compose automatically merges this override on top of the main file at deploy time (automatic discovery, no explicit `-f`): handy for keeping a shared base separate from machine- or environment-specific overrides. The override is YAML-validated on save, written to the stack folder, and automatically removed if left empty.

**2026-06-19 — Cloudflare Turnstile login protection** — An optional [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) captcha can be added to the login page (useful when the instance is exposed, even behind a reverse proxy). Enable it under **Settings → Security** with a site key and a secret key: the widget then appears under the login form and the token is verified server-side via the `siteverify` API before any authentication attempt. The secret key stays on the server; only the public site key is sent to the browser. 2FA and JWT token re-login are unaffected.

**2026-06-19 — Variable highlighting in the YAML editor** — Variable references (`${VAR}`, `${VAR:-default}`, `$VAR`) are now highlighted in the compose, override and `.env` editors. **Defined** variables (present in `.env`) appear in blue, while **undefined** variables are underlined in red — so a typo or a forgotten variable jumps out immediately.

**2026-06-19 — Fullscreen YAML editor + CodeMirror comfort** — A fullscreen button on each editor (compose, override, `.env`) expands editing to the whole screen, ideal for large stacks. The editor also gains **code folding**, **search** (Ctrl+F), **bracket auto-closing** and selection-match highlighting.

**2026-06-19 — Conditional / force stack deletion** — The delete dialog offers two options. *Delete stack files from disk* (checked by default): when unchecked, containers are stopped and removed but the compose/`.env` files are kept and the stack stays editable. *Force delete even if shutdown fails*: keeps deleting the folder even if `docker compose down` returns an error, to clean up a stubborn stack.

**2026-06-19 — Healthcheck auto-heal** — The **Monitoring** tab can now listen to Docker `health_status` events for containers that already define a Docker/Compose healthcheck. Four modes are available: notify only, restart the unhealthy container, restart the Compose service, or smart stack-aware healing. Smart mode restarts the service by default but recreates the full stack when the unhealthy service is used as another service's network namespace with `network_mode: service:<service>` (typical VPN/Gluetun pattern). Events are logged in the UI, notifications reuse the Monitoring Discord/Apprise channels, and a cooldown prevents restart storms. Dockge Enhanced does not inject generic healthchecks automatically because valid checks are image-specific.

**2026-06-19 — Per-container update badges** — When the Image Watcher detects an available image update for a stack, the compose page now also marks the exact container image that needs attention. The stack-level badge remains for quick navigation, while the container list shows a compact **Update** badge next to the affected image name.

**2026-06-19 — Recreate stack actions** — Compose stack pages now include two confirmed advanced actions in the stack toolbar: **Recreate** runs `docker compose up -d --force-recreate --remove-orphans` with the current compose configuration, while **Pull + recreate** first runs `docker compose pull` and then force-recreates the containers. Both stream through the existing progress terminal, refresh stack metadata/status, and keep the normal **Update** action available for the less disruptive pull + up workflow.

**2026-06-19 — Admin audit log** — A new **Audit** tab in `/watcher` records sensitive admin actions with the user, date, action, target, status and details: stack deploy/save/delete/start/stop/restart/recreate/update/down, Docker image/volume/container deletions, image/volume prune runs, auto-prune changes, image rollback/update controls, backup restore/snapshot deletion/checks and Kula start/stop. Retention is configurable from 30 days to **Unlimited**, and the table supports broad search (for example `gluetun`), action/category/status filters, and single-date or date-range filtering.

**2026-06-02 — Synology / low-power mode** — A toggle in **Monitoring → Display settings** drastically cuts background activity for NAS and small setups. When enabled, system stats refresh every **30 s** (instead of 5 s) and per-container/per-stack stats every **60 s** (instead of 10 s). More importantly, all collection is now **on-demand**: the heavy `docker stats` / `docker inspect` commands run *only* when a client is actually watching — polling **pauses automatically** when no browser tab is open and when the current tab is hidden (`document.hidden`). A single global backend collector caches every Docker result so all connected clients read from one shared cache instead of each triggering its own queries. The mode applies live (no restart) and is remembered across sessions.

**2026-05-30 — Stack metadata on compose pages** — Each compose stack page now displays two timestamps below the stack name: **Updated** (time since the `docker-compose.yml` was last saved or deployed, shown as a relative duration with a full date on hover) and **Restarted** (time since the most recently started container in the stack, derived from `docker inspect`). Both refresh every 5 seconds alongside the service status.

**2026-05-30 — Log timestamps toggle** — A **Timestamps** button in the log terminal toolbar toggles ISO 8601 timestamps on each log line (`docker compose logs --timestamps`). The button highlights in blue when active. Toggling seamlessly switches to a new terminal session without losing the current service filter selection.

**2026-05-19 — Scheduled image auto-prune** — A new **Auto-prune** panel in the Images tab of Docker Resources offers two independent scheduled cleanup modes. **Dangling** (untagged) images are purged via `docker image prune -f` on a 24h, 48h, or 7-day schedule — no exclusion needed since dangling images have no meaningful name. **Unused** (tagged but container-less) images are cleaned up on their own schedule with a per-image exclusion list: each unused image in the table has an **Exclude** button that adds its `repo:tag` to a persistent blocklist, preventing it from ever being auto-deleted. A **Run** button per mode triggers an immediate prune. Last run result and next scheduled run are displayed for each mode. All settings persist across restarts.

**2026-05-17 — Crash alert exclusions** — Each container in the crash events table now has an **Ignore** button with a duration picker (1h, 6h, 24h, 72h, or permanent). Excluded containers are silenced from both alerts and the events list. Active exclusions appear below the table with their expiry date and can be removed individually or all at once. A **Clear list** button empties all crash events from memory. Exclusions persist across restarts (stored in SQLite).

**2026-05-21 — Per-channel Apprise notifications** — Apprise notifications are now split into three independent channels: **Image monitoring**, **Security (Trivy)** and **Backups**. Each channel has its own list of Apprise URLs (e.g. two different Telegram chats and one email address), while the Apprise server URL remains shared. Configure them separately in the Notifications tab of `/watcher`.

**2026-05-17 — Navigation menu active-state fix** — The Enhanced page (`/watcher`) no longer incorrectly highlights **Home** in the navigation menu when browsing the crash-loop / resource watcher section.

**2026-05-13 — Per-service stack logs** — On each compose page, the terminal header now has a `Service` selector. `All` keeps the grouped stack logs, while selecting a service starts a dedicated filtered stream for that service, so you can launch, inspect, stop, edit and relaunch a compose without leaving the page.

**2026-05-13 — Rollback keeps Docker Compose project names stable** — Image rollback and auto-update now run `docker compose` from the stack directory instead of using only an absolute compose file path. This prevents Compose from deriving a wrong project name and recreating containers with unexpected prefixes before their names.

**2026-05-13 — ARM64 / Podman digest comparison fix** — Image checks now compare remote digests against all local `RepoDigests`, including the platform-specific manifest digest and the multi-arch index digest, while avoiding false positives when Docker or Podman only exposes a local image ID/non-registry digest. The self-update banner uses the same safer logic, and `DOCKGE_DOCKER_SOCKET` can point it at a custom rootless/Podman socket.

**2026-05-07 — Auto-update history** — A timestamped log of every automatic image update is now recorded and viewable directly in the Image Watcher tab. Each entry shows the date, stack, image name, old → new digest (truncated), update mode (Immediate / Scheduled), and success or failure status. History persists across restarts (stored in `update-history.json`) and can be cleared with one click. Failed updates are also recorded with their error message.

**2026-05-08 — Kula system monitor integration** — A new **Kula** section in the Monitoring tab lets you enable [kula](https://github.com/c0m4r/kula), a lightweight Go-based server monitor (CPU, RAM, network, disk I/O, containers). When enabled, Dockge Enhanced automatically pulls and starts the `c0m4r/kula:latest` container on startup. Configure the port (default 27960), network mode (`bridge` with `-p port:27960`, or `host` with `--network host`), and an optional custom URL for reverse-proxy setups. When running, a **Kula** link appears in the top navbar alongside the CPU/RAM/disk stats, and a direct link is shown in the Monitoring tab. The container restarts automatically with Docker (`--restart unless-stopped`). Kula is optional and completely independent from Dockge — it can be stopped or disabled at any time.

> ℹ️ **Why does a `kula-dockge-enhanced` stack appear in the stacks list as inactive?** When Kula is enabled, Dockge Enhanced writes a minimal `compose.yaml` into the stacks directory solely so the **Image Watcher** can track updates to `c0m4r/kula:latest` alongside your other images. The container itself is managed via `docker run` (not `docker compose up`) — this is intentional: Docker Compose v2 injects an AppArmor profile into the OCI spec that certain hardened kernels (notably Synology DSM) cannot apply, causing the container to fail to start. The inactive stack entry is harmless and disappears when Kula is disabled.

**2026-05-07 — Live backup progress** — When you click **Run backup now**, a pulsing blue banner appears below the buttons showing each destination currently running and the elapsed time (e.g. `Local (2m 34s)`). It updates every second and disappears automatically when the backup finishes. The container logs also now show timestamped lines: `▶ "Local" started…` at start and `✓ "Local" done in 23m 41s` at end — useful to confirm a long backup is still running.

**2026-05-07 — Restic lock auto-unlock** — A stale restic lock (exit code 11) would previously block both the backup and the `forget --prune` step entirely. Dockge Enhanced now runs `restic unlock --remove-all` automatically before each operation (backup start and forget/prune). Using `--remove-all` is required when the lock was created by a different container (e.g. after a Docker image rebuild changes the container ID) — plain `unlock` only removes locks from the same host.

**2026-05-08 — SFTP backup fix** — SFTP backups using password authentication were failing with `parse error on line 1: bare " in non-quoted-field`. Restic uses Go's CSV parser to read the `-o sftp.command=` option value, and shell-quoted arguments (e.g. `"/tmp/file"`) caused parse errors. Fixed by passing raw values without shell quotes inside `sftp.command` and `sftp.args` — restic splits the value by space itself to build its argv.

**2026-05-08 — Restore test fix on large snapshots** — On repositories with 1M+ files (including volume data), `restic ls` would exceed the output buffer and mark the restore test as failed. Fixed by scoping the `ls` command to the stacks directory only (`restic ls <id> /opt/stacks`), reducing output from ~200 MB to a few KB.

**2026-05-06 — Custom restic exclude patterns** — A new **Exclude patterns** section in the Backup tab lets you add glob patterns passed directly to `restic --exclude` (e.g. `*.wal`, `*.tmp`). Built-in patterns (`*.log`, `__pycache__`, `node_modules`) are always applied. Additionally, restic exit code 3 ("at least one source file could not be read") is now treated as a **success with warnings** rather than an error — the snapshot is still created and files that disappeared mid-backup (e.g. database WAL files) are listed in the Warnings column instead of marking the whole backup as failed. The backup timeout is set to **2 hours** to safely handle large repositories.

**2026-05-06 — Backup error details in the UI** — When a backup entry shows ✗ Error in the history table, clicking the badge now expands an inline detail panel directly below the row — no need to check logs or notifications. The full error message is displayed in a formatted block. If multiple destinations were involved, each failing destination is listed separately with its label and error.

**2026-05-06 — Monitoring tab** — A new **Monitoring** tab in the Enhanced menu (`/watcher`) provides a unified health overview: 4 summary cards (last backup age/status, pending image updates, critical CVEs, next Trivy scan), **crash loop detection** (alerts when a container restarts N times in X minutes via Docker events, with cooldown and Discord/Apprise notifications), **healthcheck auto-heal** (optional actions for Docker `unhealthy` events), and **display settings** (stack stats toggle and monitored disk partition, moved from Settings → General).

**2026-05-06 — Instance name in notifications** — All Discord and Apprise notifications (image updates, Trivy security alerts, backups) now include the instance name configured in **Settings → General → Primary hostname**. When set, the name appears as `[my-server]` prefix in the notification title (Apprise) and in the Discord footer alongside the timestamp. Useful when running multiple Dockge-Enhanced instances and receiving notifications in the same channel.

**2026-05-06 — Snapshot-to-snapshot diff** — The file preview modal now has a third tab **Diff vs prev snapshot** alongside Preview and Diff vs disk. It shows a line-by-line LCS diff between the file as it was in the **previous snapshot** and its content in the **current snapshot** — the exact lines added or removed between two backups. The tab is auto-selected when you open a file with a *Modified* badge. Disabled for new files (no previous version). Uses the same colour-coded diff engine as the existing disk diff.

**2026-05-06 — Restore test after each backup** — After every scheduled backup, Dockge Enhanced automatically reads one file from the freshly created snapshot to verify the repo is truly readable — not just that restic reported success. It finds the first `compose.yaml` in the snapshot, decrypts and reads it in memory (no temp files on disk), and records the result as ✅ Readable or ❌ Failed directly in the backup history table. A 🔍 icon also appears next to each destination in Discord/Apprise notifications. On-save backups are skipped (speed). The feature can be toggled off in the Backup tab.

**2026-05-06 — Exclude a stack from backup** — A new **Stacks to back up** section appears in the Backup tab, listing every stack detected in your compose directory. Each stack has an on/off toggle — turn it off to exclude that stack from all backups (compose.yaml and .env). Excluded stacks are shown with a grey badge. The section header shows how many stacks are excluded when collapsed. Applies to both scheduled backups and on-save triggers.

**2026-05-06 — Ignore a specific CVE** — In the CVE detail panel, each vulnerability row has a **⊘** button. Clicking it marks that CVE ID as globally ignored: it disappears from the detail panel and is excluded from all Discord/Apprise notifications. A dedicated **Ignored CVEs** section appears in the Trivy settings tab, listing every ignored CVE ID with a **✕** button to resume tracking individually. Ignored CVEs persist across restarts and re-scans.

**2026-05-06 — Backup on compose save** — Every time you save or deploy a stack from Dockge, a Restic snapshot is created automatically — no waiting for the next scheduled run. This covers the `compose.yaml` **and** the `.env` of all your stacks (Restic is incremental, so only the changed file adds new data). A 60 s cooldown prevents back-to-back snapshots when you save several times in a row. Important: on-save snapshots are tagged `on-save` and **intentionally skip the pruning step** (`restic forget`). This means your retention rules (`keepLast`, `keepDaily`, `keepWeekly`, …) are only applied by the scheduled cron backup — so a burst of saves during the day can never silently delete your older daily or weekly snapshots. A toggle in the Backup tab lets you disable the feature if you don't need it.

**2026-05-06 — Skip a specific release** — In the image status table, when an update is available, a new **Skip this version** button appears. Clicking it marks that exact digest as ignored: no more notifications, no auto-update, the image shows "Version skipped". A **Resume** button clears the skip so the next check picks it up again. This lets you skip a broken release without disabling watching for the image entirely.

**2026-05-06 — Restic integrity check** — A new **Check integrity** button in the Backup tab runs `restic check` on every enabled destination independently. Results (✅ OK / ❌ Failed) are displayed inline with the full output from restic, without interfering with scheduled backups.

**2026-05-05 — Snapshot volume browser** — The snapshot viewer now lists backed-up **volume data files** alongside compose/env files. Each file shows its project name (first path segment inside the volume), its relative path within the volume, and the same two status indicators as compose files: **vs previous snapshot** (New / Modified / Unchanged) and **vs current disk** (OK / Modified / Missing). Select any combination of compose, env and volume files and restore them all in one click.

**2026-05-05 — Rollback image protection** — The rollback image is now tagged `dockge-rollback-<key>:keep` immediately after each auto-update, preventing `docker image prune` (or any other tool) from removing it before the 24 h window expires. The protection tag is cleaned up automatically on rollback or expiry.

**2026-05-05 — Backup staleness badge** — A visible `⚠️ Backup overdue` badge appears on the backup section heading when the last successful backup is more than twice the configured interval old. A Discord/Apprise notification is also sent once per interval (FR/EN).

**2026-05-05 — Next Trivy scan date** — The Trivy status heading now shows both the last scan date and the **next scheduled scan** date alongside it.

**2026-05-05 — Restore by stack** — Each stack accordion in the snapshot viewer has a one-click **Restore stack** button that restores all files from that stack (compose, env and volumes) without having to select them individually.

**2026-05-05 — Snapshot file preview & diff** — For text files (compose.yaml, .env), an eye button opens a modal with two tabs: **Preview** (raw snapshot content) and **Diff vs disk** (line-by-line LCS diff showing exactly what a restore would change — lines in red will disappear, lines in green will be added).

**2026-03-27 — Image Watcher** — Automatically checks for image updates by comparing local and remote digests (no pull required). Supports Docker Hub, ghcr.io, private registries and images using `network_mode: host`, external networks or YAML anchors. Configurable frequency (1h → 24h). **Per-image auto-update**: choose *Immediate* to update on detection, *Scheduled* to apply the update at a specific time of day (e.g. `02:00` for off-peak hours — uses the container's `TZ` timezone), or *Ignore* to skip update checking entirely for that image. A ⏳ indicator shows images waiting for their slot. **Rollback**: after each auto-update a 24 h window is open — a countdown timer and Rollback button appear in the table; the old image is automatically purged on expiry. Notifications distinguish ✅ auto-updated, 🕐 scheduled, and 🔄 manual action required — per image. Click **View project →** next to any image to search for it instantly.

**2026-03-27 — Trivy Scanner** — Scans running container images for known vulnerabilities (CVE) via [Trivy](https://trivy.dev/). `aquasec/trivy:latest` is automatically pulled before each scan and removed afterwards — always up-to-date, zero disk footprint between scans. Configurable severity threshold and scan timeout. Results visible in the UI with a per-image manual scan button. CVE deduplication ensures each vulnerability appears only once per image. Alerts sent to Discord/Apprise with retry/backoff on rate limits.

**2026-03-27 — Restic Backup** — Automatic backup of every stack's `compose.yaml`, `.env` and volumes with [Restic](https://restic.net/), with an individual consistency mode: live, stop/restart or application hooks. **Multiple destinations in parallel** — add as many as you want (e.g. local + SFTP) and all are backed up on every run. 4 destination types: local, SFTP/NAS, S3/Backblaze B2, REST Server. SFTP supports both **SSH key** and **password** authentication (any port, `sshpass` is bundled). Configurable retention policy. **Volume backup**: optionally include `/app/data` (Dockge data) and/or any number of **custom volume paths** (e.g. `/dockers-data`) — sizes are calculated and displayed on demand. The next scheduled backup time is displayed in the UI. **Snapshot browser**: click any snapshot to expand it and browse compose/env files *and* volume data files side by side. Volume files show their project name and relative path inside the volume. Every file has two status indicators: **vs previous snapshot** (New / Modified / Unchanged) and **vs current disk** (OK / Modified / Missing). Select any mix of files and restore them in one click.

**2026-03-27 — Discord Notifications** — Rich embeds for image updates, security alerts, and backup results. Supports multiple webhooks per feature. Set `DOCKGE_PUBLIC_URL` to include a clickable link in notifications. Automatic retry with exponential backoff on rate limits (HTTP 429) and server errors.

**2026-04-13 — Apprise Notifications** — Send alerts to 60+ services (Telegram, ntfy, Slack, Gotify, Pushover, Matrix…) via an [Apprise](https://github.com/caronc/apprise-api) container. Configured once in `/watcher` (collapsible section) and applies to all alert types. Pass notification URLs directly (stateless mode) or let Apprise use its pre-configured services. Works alongside Discord.

**2026-03-27 — Docker Resources** — List and delete Docker images, volumes, and unmanaged containers directly from the UI (`/resources`). The **Unmanaged** tab lists containers running outside Dockge — stop and delete them from the UI. Two image purge modes: **Dangling** (`docker image prune`) for untagged images only, and **Unused** (`docker image prune -a`) for all images not used by any active container. Highlights images/volumes linked to stopped Dockge stacks, with double confirmation before any destructive action. The update badge on stacks is automatically cleared once images are up to date. **Multi-select checkboxes** let you bulk-delete multiple images in one click.

**2026-04-06 — System & Stack Stats** — CPU, RAM and disk usage displayed in the top navbar (refreshed every 5 s), with pastel colour indicators (green → yellow → red). Per-stack CPU% and RAM consumption are shown next to each compose name in the sidebar (refreshed every 10 s, powered by a single `docker stats --no-stream` call). Both can be enabled/disabled from the **Monitoring** tab. The monitored disk partition is configurable there as well.

**2026-05-06 — Monitoring** — A dedicated **Monitoring** tab in the Enhanced `/watcher` menu aggregates everything in one view: **Overview cards** (last backup age, pending image updates, critical CVEs, next Trivy scan), **Crash loop detection** (streams Docker events in real time — alerts when a container restarts N times in X minutes, with cooldown), **Healthcheck auto-heal** (notify, restart container, restart service, or smart stack-aware healing), and display settings (stack stats toggle, disk partition).

**2026-03-27 — FR/EN interface** — The `/watcher` and `/resources` pages have a 🇫🇷/🇬🇧 toggle to switch languages independently of the global app setting.

**2026-03-28 — Mobile navigation** — Full bottom navigation bar on mobile with all sections: Home, Console, Surveillance, Resources, Settings.

</details>

---

## Screenshots

<table>
  <tr>
    <td align="center" width="33%">
      <a href="screens/LandingPage.png"><img src="screens/LandingPage.png" width="100%"/></a>
      <sub>Landing page — overview</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/Images.png"><img src="screens/Images.png" width="100%"/></a>
      <sub>Docker image management</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/Sécurité.png"><img src="screens/Sécurité.png" width="100%"/></a>
      <sub>Trivy Scanner — CVE & security</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/Sauvegarde.png"><img src="screens/Sauvegarde.png" width="100%"/></a>
      <sub>Restic Backup — snapshots</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/Ressources.png"><img src="screens/Ressources.png" width="100%"/></a>
      <sub>Docker Resources — CPU, RAM & disk</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/Notifications.png"><img src="screens/Notifications.png" width="100%"/></a>
      <sub>Notification centre</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/Monitoring.png"><img src="screens/Monitoring.png" width="100%"/></a>
      <sub>Real-time stack monitoring</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/EnhancedUpdate.png"><img src="screens/EnhancedUpdate.png" width="100%"/></a>
      <sub>In-app self-update</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/DiscordUpdates.png"><img src="screens/DiscordUpdates.png" width="100%"/></a>
      <sub>Discord — image update alerts</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/DiscordTrivy.png"><img src="screens/DiscordTrivy.png" width="100%"/></a>
      <sub>Discord — Trivy security alerts</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/DiscordBackup.png"><img src="screens/DiscordBackup.png" width="100%"/></a>
      <sub>Discord — backup notifications</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/DiscordEnhancedUpdate.png"><img src="screens/DiscordEnhancedUpdate.png" width="100%"/></a>
      <sub>Discord — Dockge Enhanced update alerts</sub>
    </td>
  </tr>
</table>

---

## Installation

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
      - ../../docker:/dockers-data           # optional — extra data to back up
    environment:
      - DOCKGE_STACKS_DIR=/opt/stacks
      - DOCKGE_DATA_DIR=/app/data
#      - DOCKER_API_VERSION=x.xx             # optional — for NAS devices with older Docker API
      - TZ=Europe/Paris                      # timezone (affects scheduled updates)
```

```bash
docker compose up -d
```

Open **http://localhost:5001**, create your admin account, then click **Monitoring** in the navigation bar.

> The `/backup:/backup` volume is optional but recommended if you use **local** as a Restic backup destination — set the destination path to `/backup` so your snapshots land on a dedicated host directory outside the container.

> **Backing up multiple data directories?** Add as many volumes as you need (e.g. `../../media:/media-data`), then register each container path in the Backup tab under **Additional paths** — Restic will include them all in every backup run.

> **Monitoring a disk partition other than `/`?** Disk stats are read from inside the container with `df`. If you want to track a host path like `/mnt/data`, mount it read-only and add it in the **Monitoring** tab under *Monitored disk partitions*:
> ```yaml
>       - /mnt/data:/mnt/data:ro
> ```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `DOCKGE_STACKS_DIR` | `/opt/stacks` | Directory containing Docker Compose stacks |
| `DOCKGE_DATA_DIR` | `/opt/dockge/data` | Dockge data directory (set to `/app/data`) |
| `DOCKGE_PUBLIC_URL` | *(none)* | Public URL used in Discord notification links (e.g. `https://dockge.example.com`) |
| `DOCKER_API_VERSION` | *(none)* | Fixes the Docker API version negotiated by the client — useful on certain NAS systems (e.g. Synology DSM 7.x) |
| `TZ` | `UTC` | Container timezone — **important** for scheduled auto-updates to fire at the right local time (e.g. `Europe/Paris`) |
| `DOCKGE_PORT` | `5001` | Web UI port |
| `DOCKGE_SSL_KEY` / `DOCKGE_SSL_CERT` | — | Enable HTTPS |
| `DOCKGE_AUTH_MODE` | *(unset)* | Authentication mode: `local`, `disabled`, or `trusted-proxy`. When unset, the historical behavior and `disableAuth` setting are preserved |
| `DOCKGE_AUTH_PROXY_HEADER` | `x-forwarded-user` | Header containing the proxy-validated identity in `trusted-proxy` mode |
| `DOCKGE_AUTH_PROXY_TRUSTED_NETWORKS` | *(required in proxy mode)* | Comma-separated addresses or CIDRs allowed to provide the identity header |
| `DOCKGE_BOOTSTRAP_USERNAME` | *(none)* | First administrator name, created only when the database contains no users |
| `DOCKGE_BOOTSTRAP_PASSWORD_FILE` | *(none)* | Secret file containing the password; recommended for automated bootstrap |
| `DOCKGE_BOOTSTRAP_PASSWORD` | *(none)* | Direct password alternative, less secure because it is visible in the container environment |

> ⚠️ Always set `DOCKGE_DATA_DIR=/app/data` to match the volume mount, otherwise settings won't persist after a restart.

> ℹ️ `DOCKGE_PUBLIC_URL` is optional. If not set, Discord notifications are sent without a link. Works with reverse proxies and HTTPS domains.

### Authentication and initial setup

**Existing installations require no changes.** Without the variables above, accounts, the login page, 2FA, and the **Disable authentication** setting work exactly as before. On the first start of a new installation, open `/setup` and create the administrator normally. Once initialized, the server rejects every further setup attempt even if the SPA URL remains known.

For a non-interactive bootstrap, preferably mount a secret and set only these optional variables:

```yaml
services:
  dockge:
    environment:
      - DOCKGE_BOOTSTRAP_USERNAME=admin
      - DOCKGE_BOOTSTRAP_PASSWORD_FILE=/run/secrets/dockge_admin_password
    secrets:
      - dockge_admin_password

secrets:
  dockge_admin_password:
    file: ./secrets/dockge_admin_password
```

Bootstrap is ignored as soon as a user exists, so it never changes an existing account or password.

To delegate access to [OAuth2 Proxy](https://oauth2-proxy.github.io/oauth2-proxy/configuration/overview/) or Traefik ForwardAuth:

```yaml
environment:
  - DOCKGE_AUTH_MODE=trusted-proxy
  - DOCKGE_AUTH_PROXY_HEADER=x-forwarded-user
  - DOCKGE_AUTH_PROXY_TRUSTED_NETWORKS=172.20.0.0/24
```

Replace the example CIDR with the proxy’s exact network and configure it to pass the selected header. The Dockge port must not be directly reachable: only declared proxies may provide an identity. Every user authorized by the proxy receives administrator rights because Dockge Enhanced does not currently provide separate roles. Never exempt `/setup`, `/socket.io`, or `/api/*` from authentication; the proxy must forward WebSockets and protect the entire host.

---

## Auto-updates

This fork tracks upstream Dockge releases automatically via GitHub Actions:
- **Daily** — checks for a new stable release
- **If found** — merges upstream changes and opens a PR
- **On merge** — rebuilds and publishes Docker images (`amd64` + `arm64`) to GHCR
- **On authentication conflicts** — temporarily keeps the Enhanced version in the sync branch and explicitly lists files that require comparison before merging

---

## Mobile apps / third-party clients

Dockge-Enhanced is free and open-source.

There is currently no official iOS or Android app maintained by this project.

Third-party clients may exist, but they are independent from Dockge-Enhanced unless explicitly listed here.

---

## Attribution

If your app, service, article or integration uses Dockge-Enhanced features, API endpoints, screenshots, documentation or branding, please credit the project and link to this repository.

Commercial third-party clients are allowed by the license, but must not imply official affiliation without permission.

---

## Credits

- [**Dockge**](https://github.com/louislam/dockge) by louislam — the original project (MIT licence)
- [**Trivy**](https://github.com/aquasecurity/trivy) — vulnerability scanner
- [**Restic**](https://restic.net/) — encrypted backup tool
- [**Apprise**](https://github.com/caronc/apprise-api) — multi-platform notification gateway
- [**Kula**](https://github.com/c0m4r/kula) by c0m4r — lightweight system monitor (AGPLv3)

---

## License

MIT — see [LICENSE](LICENSE).
