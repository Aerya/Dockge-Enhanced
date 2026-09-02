<p align="center">
  <img src="https://raw.githubusercontent.com/Aerya/Dockge-Enhanced/main/frontend/public/icon.svg" width="120" alt="Dockge Enhanced logo">
</p>

# Dockge Enhanced
> [!WARNING]
> ## Critical Dockge-Enhanced self-update fix
>
> Several builds published between **August 31, 2026 and September 2, 2026** contained defects in the Dockge-Enhanced self-update mechanism.
>
> Under certain conditions, the sidecar could stop the Dockge-Enhanced container, fail to create the new version and, on some builds, also fail to automatically restore the previous one.
>
> The mechanism has since been fixed and hardened. Starting with build **`0fc2564` / version 1.5.4**, self-update:
>
> - always pulls the latest `dockge-enhanced-updater:latest` before each update;
> - explicitly pulls the target Dockge-Enhanced image;
> - performs a mandatory Restic backup before replacement;
> - verifies the new container before confirming the update;
> - keeps rollback support and a recovery snapshot.
>
> **If your installation is running a build older than `0fc2564` / version 1.5.4, perform one final manual update before enabling or re-enabling automatic updates:**
>
> ```bash
> docker pull ghcr.io/aerya/dockge-enhanced:latest
> docker compose up -d
> ```
>
> Once this update is complete, you can enable **Automatic via protected sidecar**. Subsequent updates are then handled automatically by Dockge-Enhanced.
>
> **Stacks managed by Dockge-Enhanced and their persistent data are not affected by this issue.**
>
> My apologies to everyone affected. A feature specifically designed to make updates safer should obviously never be able to leave Dockge-Enhanced offline. Thank you to everyone using, testing and reporting issues — your feedback helped identify and fix these defects quickly.

---

**My apologies to everyone affected.** A feature specifically designed to make updates safer should obviously never be able to leave Dockge-Enhanced offline. Thank you to everyone using, testing and reporting issues — your feedback helped identify and fix these defects quickly.



A feature-focused fork of [Dockge](https://github.com/louislam/dockge) that turns its simple Compose management experience into a broader Docker management platform — with multi-server federation, stack migration and replication, Restic backups, image and self-updates with rollback, security scanning, monitoring, automation, notifications, and Docker resource management, all from the web UI.

<p align="center">
  🇬🇧 English ·
  🇫🇷 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.fr.md">Français</a> ·
  🇪🇸 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.es-ES.md">Español</a> ·
  🇨🇳 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white" alt="Docker">
  <img src="https://github.com/Aerya/Dockge-Enhanced/actions/workflows/build-publish.yml/badge.svg?branch=main" alt="Build">
  <img src="https://img.shields.io/badge/arch-amd64%20%7C%20arm64-lightgrey" alt="multi-arch">
  <img src="https://img.shields.io/badge/i18n-EN%20%7C%20FR%20%7C%20ES%20%7C%20zh--CN-blue" alt="i18n">
  <img src="https://img.shields.io/badge/based%20on-Dockge-orange?logo=github&logoColor=white" alt="based on Dockge">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT">
</p>

<p align="center">
  <strong>Using it? Liking it?</strong>
  <a href="https://github.com/Aerya/Dockge-Enhanced"><strong>⭐ Drop a star!</strong></a>
  — takes two seconds.
</p>

---

<p align="center">
  <img src="screens/D-E.vs.Others.EN.09.26.png" alt="Dockge Enhanced comparison" width="100%">
</p>

## Features

### What sets Dockge Enhanced apart

| Area | Dockge Enhanced adds |
| --- | --- |
| **Multi-server** | Full-mesh federation between Dockge-Enhanced instances, management from any linked server, server grouping and selection, remote update status, transactional stack copy/migration, resumable transfers, and scheduled cold replication |
| **Stack management** | Pinned stacks, compact status and resource indicators, collapsible/resizable navigation, flexible Logs/Compose workspace, raw YAML copy, per-stack and per-container actions and scheduling, Build + Recreate, notes, Git tools, host start prerequisites, and safeguards for shared VPN network namespaces |
| **Backup & recovery** | Multi-destination Restic backups, bind mounts and volumes, per-stack consistency, selective restore, repository checks, snapshot verification and diffs, plus recovery workflows used by protected updates |
| **Updates** | Image update detection, manual or automatic container updates with rollback, remote update badges, global/per-image pause controls, and protected Dockge-Enhanced self-updates with mandatory backup, integrity checks and automatic recovery |
| **Migration & replication** | Transactional stack transfers between instances, Compose and persistent-data migration, resumable jobs, explicit move finalization, scheduled cold replicas, recovery snapshots and failover workflows |
| **Automation & audit** | Permission-scoped REST API, per-stack webhooks, Home Assistant examples, scheduled operations, and centralized history including operation origin, status and duration |
| **Docker resources** | Management of images, volumes, networks and unmanaged containers, bulk operations, auto-prune and safeguards around destructive actions |
| **Security** | Trivy vulnerability scanning, CVE exceptions, protected update workflows, 2FA, trusted-proxy authentication and Cloudflare Turnstile |
| **Monitoring** | System, stack and container statistics, configurable system status bar, dashboard health cards, crash-loop detection, healthcheck auto-heal, responsive/fullscreen logs, and optional Kula and managed Dozzle integrations |
| **Integrations** | PlugNPiN plus per-service label assistance for Nginx Proxy Manager, Pi-hole and AdGuard Home |
| **Notifications & access** | Discord and Apprise notifications localized in EN/FR/ES/zh-CN, multi-instance awareness, 2FA, trusted proxy support, Turnstile and third-party mobile clients |

## Latest updates

Major recent changes remain visible directly in the README so you can quickly see what has changed in Dockge-Enhanced.

### 🆕 September 2026

**Docker Compose project-name reconciliation**

Managed stacks whose directory name contains dots or uppercase characters are now reconciled with Docker Compose using the actual `ConfigFiles` path instead of relying only on Docker's sanitized project name. This prevents duplicate “managed/stopped” and “external/running” entries for the same stack.

**Compose long port syntax support**

Container cards now support both short and long Compose port syntax. Definitions using `published`, `target`, `protocol`, `mode` or `host_ip` no longer trigger `split is not a function` and no longer make the container card disappear. IPv6 `host_ip` values are also formatted correctly in generated links.

**tmpfs permission modes preserved by the Compose editor**

The visual Compose editor now preserves leading-zero octal values such as `tmpfs.mode: 01777` when it regenerates YAML. Editing another field no longer silently rewrites that permission value as `1777`.

**Stack path traversal hardening**

Stack names supplied to backend operations are now validated before any path is resolved, including code paths that intentionally skip filesystem discovery. Crafted names such as `../outside` can no longer escape the managed stacks directory to access another application's Compose or `.env` files.

**Protected Dockge-Enhanced self-updates**

Dockge-Enhanced can now update itself through a deliberately restricted sidecar. Every update requires a Restic backup and repository integrity check before the running container is replaced. The new version must then pass readiness checks or the previous immutable image is automatically restored.

**Remote image update status**

Image update information is retrieved independently from every connected Dockge-Enhanced instance, so remote stacks display their own update badges without mixing servers or identically named stacks.

**Clear build identity and update progress**

The Updates page now identifies installed and available builds using OCI metadata, including build date, Git commit and immutable digest. Update stages, Restic progress, elapsed time and remaining-time estimates are displayed consistently.

### August 2026

**Transactional stack migration and replication**

Stacks can be copied or moved between Dockge-Enhanced instances together with their Compose configuration and persistent data. Transfers are resumable, validated on the destination and protected by rollback mechanisms.

**Host prerequisites and automatic recovery**

A stack can require host mounts or `systemd` services before it starts. Dockge-Enhanced can also monitor these dependencies and safely handle their disappearance and recovery.

**Responsive interface and richer monitoring**

Stack navigation, the Logs/Compose workspace, resource indicators, health cards, themes and mobile display were extensively reworked.

➡️ **[View the complete changelog](CHANGELOG.md)**

---

## Feature catalogue

### Multi-server & federation
- Full-mesh federation between Dockge-Enhanced instances
- Administration from any linked instance
- Server selection and grouping
- Remote stack and image-update status
- Dedicated federation tokens
- Recovery of broken federation links
- Unified multi-instance management

### Stack management
- Create, edit, start, stop and recreate Compose stacks
- Pinned stacks
- Sort by creation date or last update
- Per-stack notes
- Git tools
- Build + Recreate
- Per-service and per-container actions
- Scheduled operations
- Host mount and `systemd` prerequisites
- Safeguards for shared VPN network namespaces
- Collapsible and resizable stack sidebar
- Compact status, CPU and RAM indicators

### Migration & replication
- Copy or move stacks between instances
- Compose configuration transfer
- Bind mount and named-volume transfer
- Resumable jobs
- SHA-256 verification
- Transactional deployment and rollback
- Local Docker image transfer when required
- Secure private-registry credential transfer
- `container_name` conflict detection
- Scheduled cold replication
- Recovery snapshots and workflows

### Backup & recovery
- Restic backups
- Multiple backup destinations
- Stack-consistent backups
- Bind mounts and volumes
- Selective restore
- Repository integrity checks
- Snapshot testing and comparison
- Backup history
- Integration with protected update and recovery workflows

### Updates
- Docker image update monitoring
- Remote update detection
- Manual and automatic image updates
- Rollback to the previous image
- Scheduled updates
- Global and per-image pause
- Protected Dockge-Enhanced self-update
- Mandatory Restic backup and integrity verification
- Readiness validation and automatic recovery

### Security
- Centralized stack-name validation blocks path traversal outside the managed stacks directory
- Trivy vulnerability scanning
- CVE exceptions
- 2FA
- Cloudflare Turnstile
- Trusted proxy
- Restricted self-update sidecar and signed update plan
- Destructive-operation safeguards
- Encrypted private-registry credential transfer

### Monitoring
- System, stack and container statistics
- Configurable system status bar
- Dashboard health cards
- Crash-loop detection
- Healthcheck auto-heal
- Live and fullscreen logs
- Autoscroll pause and long-line handling
- Kula and Dozzle integrations

### Docker resources
- Images, volumes, networks and unmanaged containers
- Bulk actions
- Auto-prune
- Risky-deletion safeguards

### Automation & audit
- Permission- and stack-scoped REST API
- Per-stack webhooks
- Home Assistant examples
- Scheduled operations
- Centralized history with origin, status and duration

### Integrations
- PlugNPiN
- Nginx Proxy Manager, Pi-hole and AdGuard Home label assistants
- Dozzle
- Kula

### Notifications & access
- Discord and Apprise
- Notifications localized in EN / FR / ES / zh-CN
- 2FA, trusted proxy and Cloudflare Turnstile
- Third-party mobile clients

---

---

## Dockge-Enhanced automatic update workflow

Dockge-Enhanced handles the complete workflow automatically: mandatory Restic backup, integrity verification, controlled container replacement, health check and final confirmation. Discord/Apprise notifications also let users follow the operation without keeping the WebUI open.

<table>
<tr>
<td align="center" width="50%"><a href="screens/AutoUpdate-ResticVerification.png"><img src="screens/AutoUpdate-ResticVerification.png" width="100%"/></a><br/><sub><strong>1. Restic verification</strong> — backup validation before replacement.</sub></td>
<td align="center" width="50%"><a href="screens/AutoUpdate-Healthcheck.png"><img src="screens/AutoUpdate-Healthcheck.png" width="100%"/></a><br/><sub><strong>2. Health check</strong> — validation of the new container.</sub></td>
</tr>
<tr>
<td align="center" width="50%"><a href="screens/AutoUpdate-Completed.png"><img src="screens/AutoUpdate-Completed.png" width="100%"/></a><br/><sub><strong>3. Update completed</strong> — installed build and final state.</sub></td>
<td align="center" width="50%"><a href="screens/AutoUpdate-Notifications.png"><img src="screens/AutoUpdate-Notifications.png" width="100%"/></a><br/><sub><strong>4. Notifications</strong> — availability, main changes and final confirmation.</sub></td>
</tr>
</table>

## Screenshots

<table>
  <tr>
    <td align="center" width="33%">
      <a href="screens/1.png"><img src="screens/1.png" width="100%"/></a>
      <sub>Multi-instance dashboard and global status</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/2.png"><img src="screens/2.png" width="100%"/></a>
      <sub>Stack view with Compose, containers and logs</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/3.png"><img src="screens/3.png" width="100%"/></a>
      <sub>Detailed stack management and actions</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/4.png"><img src="screens/4.png" width="100%"/></a>
      <sub>Copy/migration wizard — data selection</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/5.png"><img src="screens/5.png" width="100%"/></a>
      <sub>Copy/migration wizard — transfer preparation</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/6.png"><img src="screens/6.png" width="100%"/></a>
      <sub>Copy/migration wizard — volume mapping and validation</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/7.png"><img src="screens/7.png" width="100%"/></a>
      <sub>Stack view with advanced operations tools</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/8.png"><img src="screens/8.png" width="100%"/></a>
      <sub>Image update monitoring</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/9.png"><img src="screens/9.png" width="100%"/></a>
      <sub>Detailed monitored-image status</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/10.png"><img src="screens/10.png" width="100%"/></a>
      <sub>Stack start and stop scheduling</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/11.png"><img src="screens/11.png" width="100%"/></a>
      <sub>Security analysis and Trivy results</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/12.png"><img src="screens/12.png" width="100%"/></a>
      <sub>Restic backup configuration</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/13.png"><img src="screens/13.png" width="100%"/></a>
      <sub>Included volumes, exclusions and backup consistency</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/14.png"><img src="screens/14.png" width="100%"/></a>
      <sub>Docker resource management</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/15.png"><img src="screens/15.png" width="100%"/></a>
      <sub>Monitoring and container health</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/16.png"><img src="screens/16.png" width="100%"/></a>
      <sub>Responsive / mobile interface</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/17.png"><img src="screens/17.png" width="100%"/></a>
      <sub>Central audit history</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/18.png"><img src="screens/18.png" width="100%"/></a>
      <sub>Security and authentication settings</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/19.png"><img src="screens/19.png" width="100%"/></a>
      <sub>Optional integrations</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/20.png"><img src="screens/20.png" width="100%"/></a>
      <sub>Automation, API and webhooks</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/21.png"><img src="screens/21.png" width="100%"/></a>
      <sub>About page and version information</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/EnhancedUpdate.png"><img src="screens/EnhancedUpdate.png" width="100%"/></a>
      <sub>In-app Dockge Enhanced update</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/DiscordUpdates.png"><img src="screens/DiscordUpdates.png" width="100%"/></a>
      <sub>Discord — image update alerts</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/DiscordTrivy.png"><img src="screens/DiscordTrivy.png" width="100%"/></a>
      <sub>Discord — Trivy security alerts</sub>
    </td>
  </tr>
  <tr>
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

### Optional PlugNPiN integration

Open **Settings → Integrations** to configure [PlugNPiN](https://github.com/DeepSpace2/PlugNPiN). The integration remains fully inactive until **Enable PlugNPiN** is selected and the form is saved. Enabling it creates the managed `plugnpin-dockge-enhanced` stack; disabling it runs Compose down and removes the generated stack directory.

Nginx Proxy Manager credentials are required by PlugNPiN. Pi-hole, AdGuard Home, metrics, and debug logging remain individually optional. Passwords are written through stdin into the dedicated `dockge_enhanced_plugnpin_secrets` Docker volume and are never returned to the browser or included in the generated Compose file.

To publish a service, edit its stack and use **PlugNPiN publication (optional)** below the Compose editor. The assistant generates and can apply the required `plugNPiN.ip` and `plugNPiN.url` labels plus selected NPM options. Existing mapping-form labels and comments are preserved. For list-form labels, Dockge deliberately offers copy-only output instead of rewriting the existing structure.

> Disabling the controller stops its containers but cannot guarantee immediate removal of entries it created while labeled application containers are still running. Remove the labels or stop the affected applications while PlugNPiN is running if those entries must be deleted first.

> PlugNPiN `1.0.0` is currently published upstream for `amd64` only. Dockge keeps the integration disabled with a clear message on unsupported architectures; the rest of Dockge Enhanced remains multi-architecture.

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
| `DOCKGE_TRANSFER_RSYNC_PROFILES` | `[]` | JSON array of local SSH/rsync profiles (`label`, `host`, `port`, `user`, `path`, `keyPath`, optional `bandwidthKbps`). Configure the same destination identity on both instances; key paths never leave their instance |

> ⚠️ Always set `DOCKGE_DATA_DIR=/app/data` to match the volume mount, otherwise settings won't persist after a restart.

> ℹ️ `DOCKGE_PUBLIC_URL` is optional. If not set, Discord notifications are sent without a link. Works with reverse proxies and HTTPS domains.

> SSH/rsync profiles require the private key and a populated `known_hosts` file to be mounted read-only in every participating Dockge instance. `StrictHostKeyChecking=yes` is always enforced; passwords and arbitrary remote commands are not accepted from the WebUI.

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
- [**Dozzle**](https://github.com/amir20/dozzle) by Amir Rajan — real-time Docker log viewer (MIT licence)
- [**PlugNPiN**](https://github.com/DeepSpace2/PlugNPiN) by DeepSpace2 — optional DNS and Nginx Proxy Manager automation (GPLv3)
- [**crossly/Dockge-Enhanced**](https://github.com/crossly/Dockge-Enhanced) — source of significant UI/UX, theming, internationalization and frontend architecture improvements adapted into this project

---

## License

MIT — see [LICENSE](LICENSE).

## Remote announcements

Dockge-Enhanced can display a **text-only operational announcement published from this GitHub repository**, independently of the Docker image update mechanism. This safety channel was added after the self-update incident at the end of August / beginning of September 2026: if a future build has a serious issue, an affected installed version can receive a warning without waiting for that same update mechanism to work.

Announcements come from [`remote-announcements.json`](remote-announcements.json). They are optional, HTTPS-only, schema-validated, limited in size/count, can be targeted by application version, Git revision or OCI build date, and **cannot execute commands, inject HTML or trigger an update**. Links are restricted to the Dockge-Enhanced GitHub repository. If GitHub is unavailable or the document is invalid, Dockge-Enhanced simply shows no announcement.

Closing an announcement only hides it for the current browser session. **Do not show again** stores its ID in the persistent Dockge-Enhanced data directory; publishing a new announcement uses a new ID.

## Linked-instance compatibility

**Copy**, **Move** and **Replicate** negotiate a **transfer protocol** independently from the build SHA. Different builds remain allowed when their protocol is compatible. When protocols are incompatible, no transfer starts. A sufficiently recent remote instance can be updated from the WebUI through the normal self-update path (Restic backup, sidecar, health check and rollback), and Dockge-Enhanced waits up to **2 hours** for it to reconnect before resuming. An instance too old to answer the handshake requires a manual update. Permanent replication switches to **Waiting for compatibility** and retries roughly every 10 minutes without modifying data.

## Unread release-news journal

The release-news popup now tracks each release entry individually. If several automatic updates are installed while the WebUI is not opened, **all accumulated changes** are shown on the next visit. Opening or reloading the page does not mark anything as read: displayed entries are acknowledged only when the user explicitly closes the popup. Tracking uses release IDs and no longer depends on their position in the list. The legacy `releaseNewsSeen` marker is migrated automatically without replaying the full history to existing users.
