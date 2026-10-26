<p align="center">
  <img src="https://raw.githubusercontent.com/Aerya/Dockge-Enhanced/main/frontend/public/icon.svg" width="120" alt="Dockge Enhanced logo">
</p>

# Dockge Enhanced

Dockge Enhanced is a fork of [Dockge](https://github.com/louislam/dockge) for managing your Docker Compose environments from a web interface, on one or more servers. It brings together stack and container management, global search and file access, migration and replication, backups with Restic or Zerobyte, updates with rollback, monitoring, security checks and automation. Its integrations and recovery tools help you monitor and maintain your services every day.

<p align="center">
  🇬🇧 English ·
  🇫🇷 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.fr.md">Français</a> ·
  🇪🇸 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.es-ES.md">Español</a> ·
  🇨🇳 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.zh-CN.md">简体中文</a> ·
  🇩🇪 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.de.md">Deutsch</a>
</p>

<p align="center">
  <img src="https://github.com/Aerya/Dockge-Enhanced/actions/workflows/build-publish.yml/badge.svg?branch=main" alt="Build">
  <img src="https://img.shields.io/badge/arch-amd64%20%7C%20arm64-lightgrey" alt="multi-arch">
  <img src="https://img.shields.io/badge/i18n-EN%20%7C%20FR%20%7C%20ES%20%7C%20DE%20%7C%20zh--CN-blue" alt="i18n">
  <img src="https://img.shields.io/badge/based%20on-Dockge-orange?logo=github&logoColor=white" alt="based on Dockge">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT">
</p>

<p align="center">
  <strong>Using it? Liking it?</strong>
  <a href="https://github.com/Aerya/Dockge-Enhanced"><strong>⭐ Drop a star!</strong></a>
  — takes two seconds.
</p>

---

## Features

### What sets Dockge Enhanced apart

| Area | Dockge Enhanced adds |
| --- | --- |
| **Multi-server** | Full-mesh federation between Dockge-Enhanced instances, management from any linked server, optional reverse agent connections with per-node tokens, persistent agent tags, server grouping and selection, remote update status, transactional stack copy/migration, resumable transfers and scheduled cold replication |
| **Stack management** | Pinned stacks, compact status and resource indicators, collapsible/resizable navigation, flexible Logs/Compose workspace, a directly accessible action bar with icons-only or icons-and-text modes, explained stack/container actions, stack pause/resume, per-container scheduling, Build + Recreate, notes, Git tools, host start prerequisites and automatic recreation of services sharing VPN/network namespaces |
| **Compose editing** | Compose, override and `.env` editors, default Compose and `.env` templates, named links, YAML repair, a per-service healthcheck assistant, port-conflict and image-drift checks and an optional per-stack `TZ`; optional per-service CPU/RAM limits |
| **Backup & recovery** | Multi-destination Restic backups, bind mounts and volumes, per-stack consistency, selective restore, repository checks, snapshot verification and diffs, safe repository reset, plus recovery workflows used by protected updates. Optional Zerobyte connection or managed installation, protected application workflows and dedicated test restores |
| **Updates** | Stack-wide bulk policies with exception preservation, 5-minute targeted Immediate image checks, ignored images respected before any change, manual, sequential bulk or automatic container updates with rollback, a shared maintenance window, remote update badges, global/per-image pause controls, and protected Dockge-Enhanced self-updates with mandatory backup, integrity checks and automatic recovery |
| **Migration & replication** | Transactional stack transfers between instances, Compose and persistent-data migration, resumable jobs, explicit move finalization, scheduled cold replicas, recovery snapshots and failover workflows |
| **Security & authentication** | Restricted local accounts with per-stack and per-service permissions, optional TOTP 2FA, native OIDC sign-in, trusted-proxy authentication, Cloudflare Turnstile, Trivy vulnerability scanning, CVE exceptions and protected update workflows |
| **Monitoring** | System, stack and container statistics, optional 5-minute CPU/RAM history, configurable status bar, health cards, crash-loop detection, healthcheck auto-heal, responsive/fullscreen logs, and optional Kula, Dozzle, PowerWatch and PowerWatch Hub integrations |
| **Docker resources** | Protected unified cleanup for images, volumes, networks and build cache, exact catch-up scheduling, previews, exclusions, history and safeguards around destructive actions |
| **Search & files** | Global multi-instance search, restricted host file manager, volume browsing, chunked transfers, text editing and file log viewing |
| **External stacks** | Discover and integrate existing Compose projects, authorize their paths and inspect actual containers without moving their data |
| **Automation & audit** | Permission-scoped REST API, per-stack webhooks, Home Assistant integration, scheduled operations, and centralized history including operation origin, status and duration |
| **Integrations** | Zerobyte, PowerWatch and PowerWatch Hub, PlugNPiN plus per-service label assistance for Nginx Proxy Manager, Pi-hole and AdGuard Home, Dozzle, Kula and Home Assistant |
| **Appearance** | Day/night palettes, built-in themes, browser preferences and stack actions with icons or icons and text |
| **Notifications & access** | Discord and Apprise notifications localized in EN/FR/ES/zh-CN, multi-instance awareness, remote announcements and third-party mobile clients |

## Latest updates

<details>
<summary>Show the latest changes</summary>

The most important recent changes are grouped here so you can quickly see what has changed in Dockge-Enhanced.

### 🆕 October 2026

**Updates without service interruption :** Enhanced starts and checks the new container before switching traffic and retiring the old one. Optional, disabled by default; requires an application that can safely run two copies temporarily, spare CPU/RAM, and Traefik or the proposed TCP relay. Initial setup, restarts, Recreate and rollback can interrupt access. [Setup and precautions](docs/service-rollout.md) · [Wowu/docker-rollout](https://github.com/Wowu/docker-rollout).

**Native OIDC sign-in:** Sign in with an OpenID Connect provider such as Pocket ID, Authentik, Keycloak or Google, without a reverse proxy and alongside local accounts and 2FA. Configuration uses `DOCKGE_OIDC_*` environment variables and the Authorization Code flow with PKCE. New OIDC users are restricted accounts with no access until an administrator grants it, unless they are listed in `DOCKGE_OIDC_ADMIN_USERS` or belong to `DOCKGE_OIDC_ADMIN_GROUPS`; with admin groups, the role follows group membership at every login. There is no implicit “first user becomes admin” rule: on a new installation, create the first administrator first or configure an admin mapping. Existing local accounts are linked only with `DOCKGE_OIDC_LINK_EXISTING=true`. OIDC logins do not ask for the local TOTP code, and OIDC is ignored in `disabled` and `trusted-proxy` modes. If you set `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN=true`, keep the recovery procedure at hand. [Guide](docs/oidc.md).

**Default Compose filename :** COMPOSE_FILENAME selects compose.yaml (default), compose.yml, docker-compose.yaml or docker-compose.yml for new stacks only. Existing and adopted stacks keep their filenames. Other names and paths are rejected.

**Socket.IO default ports :** Browser origins using the implicit HTTP/HTTPS port now match an explicit :80/:443 Host header, including IPv6. Different hosts and non-default ports remain rejected; forwarded headers do not override this check.

**CPU/RAM limits per service :** Optional CPU/RAM limits per service in the administrator Compose editor. Existing aliases stay consistent; other resource settings and restricted-account permissions are preserved. Apply to the draft, then save and deploy explicitly. Inspired by Isurupro7 (Dockge #1006). A low RAM limit can cause an out-of-memory stop. CPU is throttled. Removing a limit does not reserve resources. Existing expressions are preserved until edited. Other resource settings stay unchanged. Overrides, extends or included files may still supply limits: review the final Compose. A prominent RAM warning requires acknowledgement before applying a new or changed memory limit.

**Ignored images are respected:** ImageWatcher rechecks **Ignore** after the registry check, before downloading and again just before recreating containers, including scheduled updates that were already selected and the managed Dozzle container. Stale manual-batch candidates are blocked too. A download already started may finish, but no recreation follows; a Docker recreation already running is not interrupted.

**Restricted local accounts:** In **Settings → Security → Users and permissions**, create restricted accounts and choose view, logs, start, stop, restart, update and recreate permissions separately for each local or linked stack. No selection means no access. Existing accounts remain administrators. The dedicated workspace exposes no Compose/.env, terminal, files, deletion, backups or settings. Update both ends of linked instances, including reverse agents; older agents have no bypass. Grants use the instance/stack-name pair: review them when reusing a name. Revocation disconnects sessions but does not cancel Docker operations already underway. Logs may contain secrets. Local authentication, with optional per-service grants covering all replicas across recreations. Restricted users manage their own password, TOTP and recovery codes; administrators can reset 2FA or delete only the account. Service actions that would affect network-namespace dependants are refused; delegated starts do not start dependencies. With trusted-proxy authentication, each proxy identity uses the local account with the same name; an unknown identity is created as a restricted account without grants, except the first user of a fresh installation and identities listed in `DOCKGE_AUTH_PROXY_ADMIN_USERS`. [Technical details](docs/scoped-users.md).

**Compose defaults and remote agents:** Named HTTP/HTTPS links, a configurable default .env template, persistent agent tags and tag filtering, plus optional reverse agent connections with per-node tokens and automatic attachment after local account setup. Reverse agents belong to their hub; inter-server data transfers still require direct federation. An existing local administrator account is sufficient; no new account is needed. [Documentation](docs/compose-and-reverse-agents.md).

**Port links:** Choose Hostname or IP address for container port links in Settings → General. Each linked instance keeps its own choice; the existing default is preserved. Hostname mode prioritizes Primary Hostname, falling back to the browser/agent address. IP mode supports automatic IP selection or an explicit reachable IPv4/IPv6. If no IP is known, the badge remains visible without a link, with an explanatory tooltip. Configure each hosting instance separately and update both sides to use this preference through federation; older agents retain their previous behavior. Docker port bindings, DNS and stored hostnames are unchanged.

**TLS security and security updates:** Update image trust stores and TLS components following the eMudhra incident. Checks cover the compromised chains, including both No CT cases, and a valid HTTPS connection. Running images remain unchanged: schedule their replacement after validation. The image also moves to Node.js 26.12.1 for the October 2026 Node.js security releases, and `follow-redirects` and the bundled Restic build receive dependency security fixes. [Incident details](https://emudhra.we-have-a-problem.com/) · [TLS checks](security/emudhra/README.md)

**Compose checks and Home Assistant:** Advisory port-conflict checks before saving/deploying, including resolved variables, overrides and ranges; running-image reference comparison with a reviewable YAML correction. Optional Home Assistant custom integration with state sensors and permission-scoped start/stop/restart controls. [Guide](docs/HOME-ASSISTANT.md).

**Instance / Global:** Home: local statistics first, then global totals independent of stack filters. Expand each summary card for per-instance values and direct menu links. Offline or older instances are marked unavailable; backup coverage distinguishes disabled instances.

**Service status for discovered stacks:** Discovered but unadopted Compose projects such as DDEV no longer trigger repeated `spawn docker ENOENT` errors when their directory is absent from the stacks root. Adopted external stacks use their registered directory, project name and Compose files for service status.

**Optional TOTP two-factor authentication:** Enable **Settings → Security → 2FA Settings** with your current password, scan the QR code and confirm an authenticator code. Save the ten single-use recovery codes; they are shown only once. Activation is off by default and applies to local sign-in, not trusted-proxy authentication or federation tokens. Linked instances must use federation tokens before enabling 2FA; password-only connections will no longer work.

Keep the entire `/app/data` directory in backups, including `two-factor.key`. A database-only restore cannot decrypt the authenticator secret without this key. If both the authenticator and recovery codes are lost, an administrator with container access can run `./node_modules/.bin/tsx ./extra/reset-two-factor.ts --username ACCOUNT --confirm` from `/app`, then restart Enhanced; the password remains unchanged.

**CPU/RAM history by Compose service:** Enable recording in **Monitoring**, then open **Resource usage** in a stack's actions. The compact charts show the stack total and one history per Compose service, including unmanaged Compose projects. Updates and container recreations remain in the same service history; simultaneous replicas are summed at each sample before averages and maxima are calculated. Existing measurements are preserved without a reset. Ranges: 24 hours, 7 days, 1 month, 1 year or all recorded data. Recording is disabled by default and samples every 5 minutes without an open browser. CPU: 100% = one core; Linux RAM excludes reclaimable cache. Gaps remain visible and peaks between samples can be missed. Stack totals exclude native host processes and containers outside Compose. CPU/RAM sorting remains available in the stack list.

**Zerobyte backups:** connect an existing instance or install a dedicated Compose instance from **Backups → Zerobyte**. Use it alongside native Restic backups or for your scheduled backups, with separate repositories. Guided setup, protected application stop/restart workflows, storage checks, dedicated test restores and read-only multi-server status are available. If network storage is unavailable, backups stop without a local fallback. [Setup and recovery guide](docs/zerobyte.md).

**Prevent Restic from backing up its own repository:** when a local repository is inside a selected backup folder, Enhanced warns you and excludes it automatically. For example, `/app/data` can remain selected with a repository at `/app/data/backups`. Selecting the repository itself or one of its subfolders as a source is refused. Existing paths, passwords and retention settings are preserved.

**Optional per-service healthcheck assistant:** Click **Configure healthcheck** on a service when viewing an existing stack or creating a new one. The assistant proposes a local HTTP URL or TCP-port check based on its internal Compose ports. Review or change the target and exact command before adding it to the YAML; existing healthchecks are never replaced automatically. Docker runs the check inside the image, which must provide `/bin/sh` and `curl`/`wget` or `nc`. Verify the health status after deployment; a successful TCP connection does not prove application readiness.

In Compose edit mode, **Healthchecks** is also available in the stack action bar. Choose a service if the stack has several.

#### Updates and ImageWatcher

**Scheduling timezone and optional container TZ:** Choose the **Scheduling timezone** in **Settings → General**. It controls this instance’s stack start/stop schedules, image-update times, self-update windows, native Restic and security-scan crons. Without an explicit choice, the existing runtime timezone is preserved; saved clock times are not rewritten. Linked instances and external backup tools such as Zerobyte keep their own settings. Relative intervals, pause deadlines and retention are unchanged. DST follows the selected zone: a missing local hour is not guaranteed to execute, and a repeated hour may occur twice; prefer a time outside the transition, such as 04:00.

In a stack’s edit actions, **Container timezone** offers an option **off by default** to add `TZ` to the Compose draft and override. Existing values (including inherited values or `env_file`/`extends`) require confirmation. Review the YAML, save and recreate/deploy to apply it. Images must support `TZ`; source `.env`/`env_file` files are not changed, and future global timezone changes do not automatically rewrite or recreate stacks.

**Image update notifications:** Discord and Apprise announce a pending image update only once per stack, image and remote digest, including updates waiting for a scheduled window. This tracking survives Enhanced restarts. A new digest is announced again; automatic update results still generate their own notification. Failed deliveries are retried on subsequent checks independently for each Discord webhook and the configured Apprise destination.

**Stopped services stay stopped:** automatic image updates are deferred when any targeted Compose service (including a required network-namespace companion) is stopped or absent. ImageWatcher checks again after pulling, before recreation, and retries on a later check. It does not use `compose up` to wake a stopped service.

**Image check intervals:** In **Watcher > Images**, the full scan covers all images every **6 hours by default**. Immediate-mode images also receive separate targeted checks every **5 minutes by default**. You can set that targeted interval in minutes or hours (5 minutes to 24 hours), or disable only those periodic targeted checks; the full scan remains active. The selected Immediate policy can still trigger a one-off targeted check.

**Host bind preparation on macOS**

Before starting or updating a stack, Enhanced asks Docker to prepare each directory bind source directly. This also works with paths shared by Docker Desktop on macOS, such as `/Users/...`, without assuming that the helper can see the macOS filesystem through a bind mount of `/`. File binds such as `/etc/localtime` are not created as directories. If Docker cannot access a source path, the update stops with Docker's actual error; check that the directory is shared with Docker Desktop.

**Self-update disk space and old image retention**

Before backup or pull, self-update checks free space on the Docker daemon's storage filesystem. Automatic updates are deferred if the check fails or space is insufficient; manual updates stop with an explanation. A vanished updater is detected at any stage, while a target-image pull still running after 20 minutes is flagged for inspection without pretending it has stopped. After a successful update, unused Enhanced images pulled by digest are checked daily and may be removed once they are at least 48 hours old. Active, rollback, recovery and explicitly excluded images remain protected; this does not enable general image auto-prune.

**Safer coordination between ImageWatcher and Self-Update**

Read-only registry and DNS checks no longer delay Dockge-Enhanced self-updates. Image updates, rollbacks and rollback-tag cleanup that change Docker now share an exclusive reservation with Self-Update, so conflicting operations are deferred instead of overlapping. A scheduled self-update does not block image updates unnecessarily; persisted self-update state continues protecting the detached updater after restart. The Updates panel prioritizes an active self-update over a stale availability check.

**Bulk automatic image policies for a stack**

A stack page now supports applying **Off**, **Immediate**, or **Scheduled** policies to all eligible images at once. A preview lists changes; users choose to **preserve individual exceptions** (the default) or replace them. Services excluded through `dockge.imageupdates.check=false` remain protected, shared images are deduplicated, and linked instances use the same server-side validation. Future images are not automatically affected.

**ImageWatcher: faster and more reliable immediate updates**

For images set to **Immediate**, ImageWatcher performs a targeted check when the setting is enabled and then every **5 minutes**, without increasing the global scan frequency. When several stacks share the same `:latest` image, Enhanced checks the image **actually running in each container**, rather than just the local tag: a service still running an older version is no longer incorrectly marked up to date. Registry requests for identical images are shared, HTTP 429 rate limits trigger a cooldown, and targeted checks are summarized in the logs. Pauses, maintenance windows, and rollback safeguards still apply.

**Per-service status and image-update exclusions**

The visual Compose editor can add `dockge.status.ignore: "true"` so an optional service no longer degrades the overall stack status after deployment, while its own state remains visible. It can also add `dockge.imageupdates.check: "false"` to exclude a service from ImageWatcher checks and automatic or batch image updates. An explicit service update remains available. Existing service labels and YAML label syntax are preserved. Inspired by [hamphh/dockge](https://github.com/hamphh/dockge).

**Update all available container images**

The Updates page can update detected images one at a time using the existing Compose update and rollback path. It shows progress, stops on the first failure and leaves Dockge-Enhanced self-update separate.

**ImageWatcher diagnostics and metadata (#493–#495)**

The Images view can sort errors first. Transiently unreachable targets are preserved, manifest timeouts use bounded retries, registry/authentication/digest errors are clearer, and stack timestamps change only after a confirmed applied update.

**Stack update controls and image action buttons (#489–#490)**

The stack-wide automatic update policy now opens from the stack action bar in a modal; individual container controls remain unchanged. Image update, ignore, pause and rollback actions use compact buttons with accessible labels.

**Optional DNS fallback for registry checks**

Under **Watcher > Images > Fallback DNS**, you can enable application-scoped DNS fallback (disabled by default), add/edit/remove IPv4 or IPv6 resolvers, and test A and AAAA queries with response times and diagnostics. System DNS is always tried first; fallback is used only for DNS resolution failures in supported ImageWatcher HTTP registry/token requests. The initial examples are Quad9 (`9.9.9.9`, `2620:fe::fe`) and Cloudflare (`1.1.1.1`, `2606:4700:4700::1111`), and are fully customizable. Existing saved settings are preserved. No host or Docker Engine DNS setting is changed; Docker Engine pulls and self-updates are outside this fallback.

**Self-update through Docker Socket Proxy**

The self-update checker and updater sidecar follow the Docker endpoint actually used by Enhanced: a Unix socket (including `DOCKGE_DOCKER_SOCKET`) or `DOCKER_HOST=tcp://…` behind a trusted Docker Socket Proxy. In TCP mode no placeholder socket is mounted; the sidecar is attached to the instance's Docker networks before it consumes the signed plan. See [the protected update workflow](#dockge-enhanced-automatic-update-workflow) for the permissions the proxy must allow.

#### Backups, cleanup and reliability

**Faster, race-safe Docker image cleanup**

Bulk image cleanup now scans the Docker inventory once, then revalidates only the target image immediately before each `docker rmi`. The Resources page no longer runs a giant `docker image inspect` just to display the image list, image inspection is bounded in batches and tolerates an image disappearing during a concurrent cleanup, and expired rollback cleanup uses the same Docker-cleanup lock. Existing container, rollback/recovery and grace-period protections remain in place.

**Cleanup now uses Docker's real image references**

Unused-image cleanup no longer assumes that the `Repository:Tag` shown by `docker images` is an attached, removable reference. It uses the inspected `RepoTags` and `RepoDigests`, removes every required reference, then safely falls back to the Image ID when necessary and verifies that the physical image disappeared. Container use, exclusions, active Enhanced, recovery, rollback and grace-period protections remain enforced.

**Prune reports now match Docker's observed state**

When a batch inspection does not return an image, cleanup now checks that Image ID directly before calling it absent. Every deletion is checked again, then a final lightweight Docker inventory verifies the reported result. Resources now shows Docker usage separately from prune state: an `unused` image may still be active Enhanced, protected for recovery or rollback, too recent, or excluded. Untagged images are described neutrally as **Untagged image**, not as old images. The workflow remains bounded to one initial inventory, targeted checks, and one final light verification.

**Reliable cleanup of old Dockge-Enhanced `<none>` images**

Old `ghcr.io/aerya/dockge-enhanced:<none>` images are now selected from Docker's image inventory instead of depending on `RepoDigests` metadata that may be missing after retagging. Images older than the 48-hour self-update safety floor can therefore be pruned reliably, while the active image and recovery-protected images remain untouched. Unused-image summaries also stop counting ordinary container-used images as protected cleanup candidates.

**Unused `repository:<none>` images are now actually pruned**

Docker may keep an image repository name while its tag becomes `<none>`. Those images previously fell between the dangling (`<none>:<none>`) and tagged-unused cleanup paths, so buttons and scheduled cleanup could leave them behind indefinitely. They are now handled as unused images by Image ID, while container use, exclusions, rollback/recovery protection and cleanup grace periods are still enforced. Old Dockge-Enhanced images keep their additional 48-hour self-update safety floor.

**Per-image cleanup age for old Dockge-Enhanced builds**

Old `ghcr.io/aerya/dockge-enhanced:<none>` images pulled by digest now age out independently. A new successful self-update no longer resets the 48-hour cleanup clock for every older Enhanced image: each stale image is evaluated from its own creation time, while the active image and recovery snapshots remain protected. If unified Docker cleanup uses a longer grace period, that larger value still takes precedence.

**Unified Docker cleanup and exact catch-up scheduling**

Docker Resources shares one Image-ID inventory between the Images page, cleanup preview and pruning. The same grace period applies to manual and automatic cleanup, multiple tags for one physical image count only once, and images that disappear concurrently are treated as already absent rather than as cleanup failures. Stopped-container images and rollback/recovery assets remain protected. Images, networks, volumes and build cache can be selected independently, results are recorded per category, and due jobs are checked every 15 minutes with one catch-up after sleep or restart. Enabling unified cleanup suspends the legacy image schedules without erasing them.

**Restic setup feedback and safer initialization (#491)**

Backup settings, run-now and maintenance actions are separated; repository state and retention help are clearer, and initialization uses safer safeguards.

**English backend messages (#477)**

Restic password errors, prune audit summaries and automatic update messages are no longer incorrectly displayed in French in an English installation.

**Healthcheck with an HTTP proxy configured**

The built-in container healthcheck ignores proxy variables and queries `127.0.0.1` directly, so a configured or unreachable proxy no longer marks Enhanced unhealthy. Other network access keeps using the configured proxy.

#### Monitoring and integrations

**Optional PowerWatch electrical monitoring**

[PowerWatch](https://github.com/Aerya/PowerWatch) can now be connected in **External** mode, which only reads an existing local container or HTTP(S) endpoint and never controls it, or deployed in **Managed** mode as a real Compose stack. Managed installation detects the host's RAPL, MSR and NVIDIA capabilities, enables only the required access, never uses `privileged: true`, and keeps history and settings in a persistent volume when stopped or disabled.

Current whole-machine power, confidence and a direct WebUI link appear in Monitoring, the system status bar and compact linked-instance summaries through the existing federation channel. The status bar and instance cards display only the watts next to the electrical icon; the tooltip identifies PowerWatch and its measured or estimated confidence. PowerWatch measures or estimates consumption according to the available sensors.

**Optional monitoring services: Kula, Dozzle, PowerWatch and Hub**

In **Monitoring** (`/watcher/monitoring`), the four optional third-party services appear in separate, consistent cards, with brief descriptions and links to their GitHub repositories. PowerWatch and its Hub each offer independent external/managed modes, installation, start, restart, stop and connectivity test. Managed Hub uses the PowerWatch image's `powerwatch-hub` binary, defaults to `127.0.0.1:3065`, and stores its data in a dedicated persistent Docker volume.

A Hub can run without a locally managed PowerWatch. Instances reachable only through an individual host's `127.0.0.1` are **not automatically accessible from the Hub's Docker container**; configure a reachable, protected endpoint for federation. PowerWatch now offers optional native authentication, **disabled by default**, with read-only Bearer API tokens. **Enhanced now supports these read-only Bearer API tokens** for querying protected PowerWatch instances. Enter the token in **Monitoring → PowerWatch → Read-only API token**. The saved token stays masked and is never forwarded to the Hub. The Hub separately supports an optional token for administrative operations. Never expose an unprotected interface publicly.

To connect an **existing PowerWatch**, enter the usual **WebUI address** (for example `http://192.168.0.64:3064`) in the PowerWatch URL field: Enhanced automatically requests `/api/snapshot` on the same origin. A separate WebUI address is only needed for unusual reverse-proxy setups and remains available in advanced settings. An **existing Hub** likewise needs only its WebUI address; Enhanced calls `/api/hub/snapshot` automatically.

**Optional host CPU/RAM history**

Monitoring can record one lightweight host CPU/RAM sample every 5 minutes, independently of browser sessions. The responsive SVG graph offers 24-hour, 7-day, monthly and custom ranges; the selected display range can be saved and restored on the next visit. Long ranges are downsampled server-side and downtime remains visible as gaps. Recording is disabled by default and low-power mode does not stop it when explicitly enabled.

The optional CPU/RAM history keeps its real sampling gaps but uses a more compact PowerWatch-inspired chart with lighter grid lines and subtle filled areas.

#### Stacks, interface and usability

**Directly accessible stack actions**

Every stack action is available directly in the action bar, without submenus, in visually separated groups that wrap to the available width. Icons-only and icons-and-text modes keep their tooltips; commands, availability conditions and confirmations are unchanged.

**German interface**

The interface and release news are available in German, with German README and changelog. Discord and Apprise notifications fall back to English when German is selected.

**Container counters on the home page**

The home page shows running, stopped and paused containers, including reachable linked instances. Stack and container counters follow the instance filter of the stack list.

**Safer stack starts and immediate image checks**

Enhanced prepares missing absolute host bind directories before start/deploy/recreate operations when the mount is clearly directory-like. This is especially useful on NAS hosts such as Synology where Docker refuses a bind source that does not exist yet. File-like bind sources are never auto-created as directories. Per-image **Immediate** auto-update now starts a targeted image check as soon as the policy is saved. Successful stack restarts also refresh the real stack state and hide stale Compose progress output.

**Cleaner Compose volumes and logs**

Mounted volumes and actual containers use compact rows instead of full-width clickable bars. The Logs panel stacks its three filters, groups its actions and places search last; filter names remain available to assistive technology. Appearance settings can enable log timestamps by default for this browser.

**Day and night color palettes**

Appearance settings now offer separate palettes for light and dark mode: four day choices and eight night choices, including the original themes. Catppuccin, Nord, Solarized, Dracula, Gruvbox, Tokyo Night and Rosé Pine recolor the page, header, panels and controls; the selected palettes are remembered in the browser, and Auto still follows the system theme.

**Reliable linked-instance connections**

Adding or changing a linked instance now refreshes browser sessions without disconnecting federation sockets. Both instances remain connected after mesh synchronization and after a restart.

**Password managers**

Account setup now labels the username and new-password fields for browser password managers.

**Stack controls and Compose creation**

Stack pause/resume freezes containers without removing volumes. Automatic image updates wait while a stack is paused; pause/resume is blocked during Restic backup or restore, and pause is unavailable for Enhanced's own stack or stacks using stop/hook backup policies. General settings now provide a validated default Compose template for new stacks only. The stack README.md opens from an action button instead of a full-width bar, and container action icons have explanatory tooltips. Existing tmpfs octal-value protection and Compose variable highlighting remain unchanged.

**Clearer stack actions**

Stack buttons now explain what they run. A help panel shows the actual Docker Compose commands for the selected stack, including its project and Compose-file options, with links to Docker's documentation. The former “Stop & Inactive” button is now “Take down stack”: it runs `docker compose down` after confirmation, removing containers and Compose networks but not named volumes, bind-mounted data, Compose files or images. Anonymous volumes may not be reattached on the next `up`.

**Display names for stacks**

Give a stack a WebUI display name from its stack page. Its technical name, Compose project, backup selection and restore path remain unchanged; the technical name stays visible beside the alias.

**Real container view**

Each Compose service now lists its actual containers separately, including replicas. Open one to see its state, health, image, ports, resource usage and recent logs, or start, stop and restart that exact container. Service-wide actions remain unchanged. Inspired by [Lorwell/dockge](https://github.com/Lorwell/dockge).

**Optional host file manager**

An opt-in Files page can browse a dedicated host directory, edit small UTF-8 files, transfer files and follow file-based logs, locally or through a linked Enhanced instance. It is separate from the per-stack volume browser and cannot access paths outside its configured root.

Mount only the directory you intend to expose at the same path inside Enhanced and set `DOCKGE_FILE_MANAGER_ROOT` to that container path. For example, add `- /srv/shared:/managed-files` under `volumes:` and `DOCKGE_FILE_MANAGER_ROOT: /managed-files` under `environment:`. Without this setting, the manager stays disabled; **do not mount `/` or a broad host directory**. It also refuses operations when authentication is disabled. The optional `DOCKGE_FILE_MANAGER_MAX_FILE_SIZE` limits transfers (default: 100 MiB); online text editing is limited to 1 MiB. Each linked instance needs its own explicit mount and setting.

**Copy and paste in container terminals**

Right-click now opens the terminal’s native Copy/Paste menu. Pasting also works with keyboard shortcuts on local HTTP addresses, without requiring access to the browser Clipboard API.

**README.md for managed stacks**

The stack page can display and edit a Markdown `README.md` stored beside its Compose file. This file is distinct from the short stack note and follows a stack copied or moved to another Dockge-Enhanced instance. External stacks are not edited by this feature.

### 🆕 September 2026

**Reliable automatic image cleanup**

Automatic cleanup no longer skips the next scheduled slot when a previous run finished a few seconds late. Tagged images referenced by any container, including stopped containers, and rollback images are preserved. Old Dockge-Enhanced images pulled by digest become eligible at the next cleanup at least 48 hours after a successful self-update; the active image and recovery images are kept. Docker errors from the most recent cleanup are shown in Docker Resources.

**Federation availability alerts without overnight spam**

Circuit-breaker availability notifications are now tied to a continuous outage episode: each linked instance sends at most one alert while a peer remains offline, and the alert is re-armed only after that peer successfully authenticates online again. Each remote instance can also be marked locally as **Intermittent machine — do not alert when unavailable**. This is intended for desktops, laptops and other peers that are routinely powered off or suspended; automatic reconnects, backoff and circuit-breaker protection remain active. Because the preference is local, mark the intermittent peer on every always-on Dockge instance from which you do not want availability alerts.

**Process-wide federation transport**

Federation now uses one shared outbound transport per Dockge-Enhanced process instead of one connection set per WebUI socket. Linked instances are loaded from SQLite and connected automatically when the server starts listening. Opening several WebUIs no longer multiplies remote sockets, closing the last browser no longer disconnects linked instances, and the circuit-breaker retry continues after about 5 minutes even with no WebUI open. Credential changes, mesh repair and peer removal immediately resynchronize the shared transport.

**Federation reconnect-storm hardening**

Federated sockets now use a lightweight authentication path and no longer execute the WebUI stack/agent bootstrap. Socket.IO reconnects are explicitly bounded with exponential backoff, jitter and a 5-minute circuit breaker. Excessive inbound federation handshakes are rejected before authentication and simultaneous inbound federation sockets are capped. If a reconnect guard trips or SQLite/Knex contention is detected, the existing Discord/Apprise configuration emits a rate-limited alert without querying SQLite.

**Network namespace-safe targeted updates**

Targeted image updates, service recreations and image rollbacks now resolve the complete Compose model before replacing a container. When other services share its network namespace through `network_mode: service:<service>` or `network_mode: container:<container_name>`, every direct and transitive consumer is force-recreated with the provider in one targeted Compose operation. Unrelated services are left untouched, while VPN, Gluetun and sidecar stacks no longer retain a removed container's stale network namespace.

**External stacks (Beta)**

Enhanced can detect existing Docker Compose projects, adopt them **without moving their Compose/.env or data**, and then manage them from the normal stack UI. If a source path is not yet available inside Enhanced, protected one-click authorization patches Enhanced's own Compose automatically. Adopted stacks keep their project name without a redundant `external-` prefix and are marked **External**; source-file deletion requires an additional explicit confirmation. The scanner also maps Enhanced's stacks directory to its host-side bind mount, so stacks already managed by the instance are excluded even when Docker Compose labels contain host paths.

When permanent source deletion is selected, Enhanced now removes the source bind and allowlist entry from its own Compose through the protected helper, recreates only its own container, and then deletes the host folder. This avoids `EBUSY` failures caused by trying to remove a directory that is still one of Enhanced's mount points.

A supported example is [Gluetun-Companion](https://github.com/Aerya/Gluetun-Companion): it may recreate an Enhanced-managed Gluetun stack from a bind-mounted `/compose` path. Enhanced now resolves this kind of Compose path alias back to the managed stack and does not offer it for external adoption.

**Anonymous installation count**

To get an approximate number of active Dockge-Enhanced installations without running a separate analytics service, Enhanced downloads a tiny technical asset from a dedicated GitHub release at most once per month. GitHub's public `download_count` for that monthly asset is the only aggregate used for the count.

No installation identifier is generated or sent for this count. The request contains no hostname, instance name, stack, container, Docker image, configuration, path, GitHub account, email, architecture or build identifier. As with any GitHub asset download, the connection itself is handled by GitHub; Dockge-Enhanced does not receive or store installation IP addresses.

The already-counted month is stored only in the local data directory so the same installation downloads the asset at most once per month. Counting is enabled by default and can be disabled with `DOCKGE_USAGE_COUNT=false`. Recreating or deleting the data directory can make the same installation count again for the current month, so the figure is intentionally approximate.

The mechanism is fully public: [Enhanced-side code](./backend/anonymous-install-count.ts), [GitHub workflow that creates the monthly assets](./.github/workflows/usage-count-asset.yml), and [aggregate monthly counters](https://github.com/Aerya/Dockge-Enhanced/releases/tag/usage-count).

Repository owners can add an Actions secret named `USAGE_COUNT_DISCORD_WEBHOOK` to receive a provisional count every Monday and the final count for the previous month on the first day of each month. The workflow can also be run manually to send the current count immediately. The webhook value remains encrypted by GitHub and is never committed to the repository.

**Global multi-instance search V2 (`Ctrl+K`)**

The global palette now supports **fuzzy matching** for small typing mistakes and assisted operators such as `type:`, `stack:`, `image:`, `port:`, `instance:` and operational filters including `is:update`, `is:stopped`, `is:vulnerable`, `is:critical` and `is:backup-failed`. Operator chips are displayed directly in the palette so the syntax does not need to be memorized. Compose and `.env` results open the matching stack and scroll CodeMirror directly to the matching line. Recent searches and pinned searches are stored locally in the browser.

Historical configuration search in **recent Restic snapshots** can be enabled explicitly from the palette; it is bounded to 5 recent snapshots and 80 Compose/.env files per instance to protect remote repositories. Searching inside `.env` **values** is also an explicit opt-in: values are used only for matching, are never returned/displayed, and while this sensitive mode is active the query is never stored in recent or pinned searches. Linked instances use the V2 agent protocol when available, with a V1 fallback for simple searches on older linked instances.

**Automatic self-update protection while editing Compose/.env**

When a compose, override or `.env` file has unsaved changes in the WebUI, the owning Dockge-Enhanced instance temporarily blocks its automatic self-update — including edits opened from another linked WebUI. The editor keeps a short-lived heartbeat lease so stale browser sessions expire automatically. If an update becomes ready while unsaved work is present, the user gets a dialog to **save and update**, **defer for 30 minutes**, **defer for 1 hour**, or **keep working**. The backend re-checks blockers again before preparing and launching the updater sidecar so an edit started during backup/verification cannot be interrupted by the restart.

**Linked-instance overview on the home page**

The existing agent panel on the home page now doubles as a compact infrastructure overview. Each linked Dockge-Enhanced instance shows its stack totals and states, host CPU/RAM usage, uptime and pinned-stack count while keeping the existing rename, reauthentication, removal and add-agent controls. Clicking an instance summary filters the stack list on the left to that server; clicking it again restores the all-servers view.

**Per-stack CPU/RAM stats across linked instances**

The **Show CPU / RAM statistics per stack** option is now owned by each Dockge-Enhanced instance. When enabled on a server, that server collects its own Docker statistics and exposes them through the existing linked-instance channel. Every linked WebUI displaying that server shows the same CPU/RAM badges for its stacks and containers. Hiding the server hides its statistics; disabling the option on the owning instance stops collection and exposure for that instance.

**Server-persisted pinned stacks across linked instances**

Pinned stacks are now owned by the Dockge-Enhanced instance that hosts them instead of by one browser's `localStorage`. Pinning a stack on Garuda, DockerLab or LincStation stores that preference on the corresponding server. Any linked WebUI that displays that server sees the same pinned stack; hiding that server hides its pins without deleting them. Pins therefore survive logout/login, browser changes and Dockge-Enhanced updates. Existing browser-local pins are migrated automatically when their owning instances are reachable.

**Dedicated self-update backup retention**

Mandatory Restic snapshots created before protected Dockge-Enhanced self-updates now use a dedicated retention policy. After the new snapshot has been created **and verified**, Dockge-Enhanced keeps the **2 latest self-update snapshots for this installation** and prunes older generations before launching the updater sidecar. A stable installation-specific tag prevents cleanup from touching another Dockge-Enhanced instance sharing the same Restic repository. Normal backup retention (`keepLast`, daily, weekly, monthly) is unchanged. If this dedicated pruning fails, the verified backup is kept and the update may continue; the cleanup error is logged and a later self-update will try again.

**Docker Compose project-name reconciliation**

Managed stacks whose directory name contains dots or uppercase characters are now reconciled with Docker Compose using the actual `ConfigFiles` path instead of relying only on Docker's sanitized project name. This prevents duplicate “managed/stopped” and “external/running” entries for the same stack.

**Compose long port syntax support**

Container cards now support both short and long Compose port syntax. Definitions using `published`, `target`, `protocol`, `mode` or `host_ip` no longer trigger `split is not a function` and no longer make the container card disappear. IPv6 `host_ip` values are also formatted correctly in generated links.

**Compose YAML repair and formatter**

The stack editor includes a **Fix / format YAML** action for `compose.yaml`. Valid documents are normalized to **2-space** indentation. When YAML is invalid because of common Compose indentation mistakes, Dockge-Enhanced attempts to realign service keys and lists (`services`, service options, `environment`, `ports`, `volumes`, `healthcheck.test`, etc.), validates the repaired document, then formats it. Comments and leading-zero `tmpfs.mode` permissions are preserved. If a safe repair cannot be produced, the original content is left untouched and the error is shown.

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

**Remote announcements**

Dockge-Enhanced can display a **text-only operational announcement published from this GitHub repository**, independently of the Docker image update mechanism. This safety channel was added after the self-update incident at the end of August / beginning of September 2026: if a future build has a serious issue, an affected installed version can receive a warning without waiting for that same update mechanism to work.

Announcements come from [`remote-announcements.json`](remote-announcements.json). They are optional, HTTPS-only, schema-validated, limited in size/count, can be targeted by application version, Git revision or OCI build date, and **cannot execute commands, inject HTML or trigger an update**. Links are restricted to the Dockge-Enhanced GitHub repository. If GitHub is unavailable or the document is invalid, Dockge-Enhanced simply shows no announcement.

Closing an announcement only hides it for the current browser session. **Do not show again** stores its ID in the persistent Dockge-Enhanced data directory; publishing a new announcement uses a new ID.

**Linked-instance compatibility**

**Copy**, **Move** and **Replicate** negotiate a **transfer protocol** independently from the build SHA. Different builds remain allowed when their protocol is compatible. When protocols are incompatible, no transfer starts. A sufficiently recent remote instance can be updated from the WebUI through the normal self-update path (Restic backup, sidecar, health check and rollback), and Dockge-Enhanced waits up to **2 hours** for it to reconnect before resuming. An instance too old to answer the handshake requires a manual update. Permanent replication switches to **Waiting for compatibility** and retries roughly every 10 minutes without modifying data.

**Persistent local instance identification**

The **local instance name** configured in Dockge Agents is permanently visible in the desktop/mobile header and in the browser tab title (`InstanceName · Dockge-Enhanced`). If no name is configured, the host (`IP:port` or domain) is used as a fallback. No additional setting is required.

**Unread release-news journal**

The release-news popup now tracks each release entry individually. If several automatic updates are installed while the WebUI is not opened, **all accumulated changes** are shown on the next visit. Opening or reloading the page does not mark anything as read: displayed entries are acknowledged only when the user explicitly closes the popup. Tracking uses release IDs and no longer depends on their position in the list. The legacy `releaseNewsSeen` marker is migrated automatically without replaying the full history to existing users.

### August 2026

**Transactional stack migration and replication**

Create new replication policies from the **source instance directly**. Policies are stored on the instance where they are created, not automatically shared between linked instances. Existing policies created from another instance remain there and can still be managed there; review and remove any duplicate old policy manually before creating a replacement. Enhanced does not delete policies or replica data during this change.

When viewing a linked source stack, Enhanced displays the source instance's replication status in read-only form, separately from any legacy policy managed by the current instance. Configuration details are not sent to linked views.

Stacks can be copied or moved between Dockge-Enhanced instances together with their Compose configuration and persistent data. Transfers are resumable, validated on the destination and protected by rollback mechanisms.

**Host prerequisites and automatic recovery**

A stack can require host mounts or `systemd` services before it starts. Dockge-Enhanced can also monitor these dependencies and safely handle their disappearance and recovery.

**Responsive interface and richer monitoring**

Stack navigation, the Logs/Compose workspace, resource indicators, health cards, themes and mobile display were extensively reworked.

➡️ **[View the complete changelog](CHANGELOG.md)**

</details>

---

## Feature catalogue

<details>
<summary>Show all features</summary>

### Multi-server & federation
- Full-mesh federation between Dockge-Enhanced instances, managed from any linked WebUI
- Optional reverse agent connections for hosts behind NAT/CGNAT, with one token per node, automatic attachment and revocation; reverse agents belong to their hub ([guide](docs/compose-and-reverse-agents.md))
- Persistent agent tags and tag filtering, combined with the instance filter
- Server selection, grouping and stable colours in the stack list
- Linked-instance overview on the home page, with Instance / Global statistics, reachability and direct WebUI links
- Remote stack status, image-update badges and per-stack CPU/RAM statistics from each instance
- Dedicated federation tokens, broken-link recovery and connections preserved during browser refreshes
- Process-wide federation transport with bounded reconnects, a circuit breaker and one availability alert per outage
- Intermittent machines that can be excluded from availability alerts
- Version-aware transfer protocol negotiation between mixed Dockge-Enhanced releases
- Per-instance choice of Hostname or IP address for container port links

### Stack management
- Create, edit, start, stop, restart, update, recreate, pause/resume and take down Compose stacks
- Directly accessible stack action bar, with icons-only or icons-and-text modes and explained Compose commands
- Per-service and per-container actions, including actual containers and Compose replicas
- Automatic recreation of direct and transitive services sharing a VPN/network namespace through `service:` or `container:`
- Build + Recreate for locally built images
- Scheduled stack and container start/stop
- Host mount and `systemd` start prerequisites, with optional monitoring and recovery
- Server-persisted pinned stacks shared across linked WebUIs
- Optional WebUI display names, without changing the Compose project or Restic identity
- Per-stack notes, Markdown `README.md` and Git tools
- Sorting by name, status, instance, creation date, last update, CPU or RAM
- Collapsible, resizable stack sidebar with compact status, CPU and RAM indicators, and a flexible Logs/Compose workspace
- Compose project-name reconciliation, so dotted or uppercase directory names do not create duplicate stacks
- External Compose stack discovery and adoption without moving files or data, with protected path authorization
- Optional complete removal of adopted external stacks and label-based cleanup of broken external stacks, with reinforced confirmations
- Per-service option to ignore an optional service in the overall stack status

### Compose editing

- **Default Compose filename** — COMPOSE_FILENAME selects compose.yaml (default), compose.yml, docker-compose.yaml or docker-compose.yml for new stacks only. Existing and adopted stacks keep their filenames. Other names and paths are rejected.
- optional per-service CPU/RAM limits — Only edits the draft. Save, then explicitly deploy/recreate to apply to containers; running containers are not changed here.
- Compose, `compose.override.yaml` and `.env` editors with variable highlighting, folding, search and fullscreen mode
- Validated default Compose and `.env` templates for new stacks only
- Named HTTP/HTTPS links for stacks
- Fix / format YAML action, preserved quoted scalars and `tmpfs` octal modes
- Long port syntax support
- Optional per-service healthcheck assistant with an editable HTTP/TCP proposal and command preview
- Advisory port-conflict and running-image drift checks before saving or deploying
- Optional per-stack container `TZ`, applied only after review and confirmation
- PlugNPiN label assistant for Nginx Proxy Manager, Pi-hole and AdGuard Home

### Migration & replication
- Copy or move stacks between instances with their Compose configuration
- Bind mount and named-volume transfer, with editable source → target mappings
- Direct resumable HTTP transfers, shared Restic repositories or explicit SSH/rsync profiles
- SHA-256 verification, transactional deployment and rollback
- Optional transfer of local Docker images and encrypted private-registry credentials
- `container_name` conflict detection and real deployment errors
- Explicit move finalization or return to source
- Scheduled cold replicas configured on the source instance, with retained snapshots and manual failover
- Isolated disaster-recovery tests and application profiles for PostgreSQL, MariaDB/MySQL, Redis and SQLite

### Backup & recovery
- Native Restic backups of Compose, `.env`, bind mounts, named volumes and `/app/data`
- Multiple destinations: local, SFTP/NAS, S3/Backblaze B2 and REST Server
- Scheduled backups, **Back up now** and backups on Compose save, with an overlap guard
- Per-stack consistency: live, stop then restart, or application hooks
- Stack exclusions, built-in and custom exclude patterns, and automatic exclusion of nested local repositories
- Initialization of missing repositories only, with blocking access, network and password errors
- Ordinary retention and a dedicated self-update retention
- Safe repository reset for Local, SFTP, S3 and REST destinations, keeping the previous repository for recovery
- Snapshot browser with previews and diffs, selective restore and per-stack restore
- Restore tests after scheduled backups, `restic check`, backup history and overdue alerts
- Optional Zerobyte connection or dedicated managed Compose installation, alongside native Restic or for scheduled backups with separate repositories
- Guided Zerobyte source, repository and job creation; new jobs stay disabled until reviewed, and existing jobs can be migrated after confirmation
- Protected Zerobyte stop/restart workflows, integrity checks, a persistent recovery journal and targeted manual recovery
- Zerobyte network-storage checks without local fallback, dedicated test restores and read-only federated status
- Guides: [Restic backups and recovery](docs/restic.md) · [Zerobyte setup and recovery](docs/zerobyte.md)

### Updates & ImageWatcher

- **Updates without service interruption** — `dockge.rollout.enabled: "true"`. Check compatibility before enabling this option. The application container count temporarily doubles: allow enough CPU/RAM. Fixed container names and shared writable volumes are refused. The relay adds a container and a configuration volume. Its initial installation moves the access port and may cause an outage. Afterwards, use Update; Recreate, restarts and rollback do not guarantee that connections stay open. TCP only, not UDP/QUIC; no universal zero-downtime guarantee. [Deployment](docs/service-rollout.md).
- Image update detection by digest, without pulling, including remote instances
- Off, Immediate and Scheduled policies per image, plus stack-wide bulk policies that preserve individual exceptions by default
- Full scan every 6 hours by default and targeted Immediate checks every 5 minutes by default, configurable or disabled separately
- Checks against the images actually running in each container, shared registry requests and HTTP 429/503 retries
- Optional DNS fallback for registry checks, without changing host or Docker Engine DNS
- **Ignore** and `dockge.imageupdates.check: "false"` exclusions respected before any pull or recreation, including managed Dozzle
- Manual, automatic and sequential “update all” image updates with rollback to the previous image
- Stopped and paused stacks are not woken up by automatic updates
- Global and per-image pause, skipped releases and auto-update history
- One pending-update notification per stack, image, digest and destination
- A global maintenance window: when automatic Dockge-Enhanced updates use one, it also gates automatic image updates, otherwise per-image schedules apply; **Update now** stays immediate
- Protected Dockge-Enhanced self-update with mandatory Restic backup, integrity check, readiness validation and automatic recovery
- Self-update through a Unix socket or a trusted Docker Socket Proxy, with disk-space checks and protection while Compose or `.env` edits are unsaved
- Persisted 8-stage self-update timeline with live host load
- Reliable current-container discovery with custom Compose `hostname:` values, and a visible degraded state when verification is unavailable

### Security & authentication
- Local accounts with optional TOTP 2FA, encrypted secrets, single-use recovery codes and session revocation
- Restricted local accounts with per-instance, per-stack and per-service permissions and a dedicated workspace ([guide](docs/scoped-users.md)); disable them before downgrading to an older Enhanced version
- Trusted-proxy authentication with explicitly trusted networks and proxy identities mapped to local accounts
- Native OIDC sign-in (Pocket ID, Authentik, Keycloak…) with PKCE, restricted accounts by default and optional admin mapping by user or group ([guide](docs/oidc.md))
- Non-interactive administrator bootstrap from a secret file
- Cloudflare Turnstile login protection
- Trivy vulnerability scanning with CVE exceptions
- Centralized stack-name validation against path traversal
- Restricted self-update sidecar with a signed update plan
- Encrypted private-registry credential transfer
- Safeguards and confirmations around destructive operations
- TLS trust-store checks after the eMudhra incident ([TLS checks](security/emudhra/README.md))

### Monitoring
- System, stack and container CPU, RAM and disk statistics, with a configurable status bar
- Host system details, temperatures and monitored disk partitions
- Optional 5-minute CPU/RAM history for the host and per Compose service, with visible gaps
- Dashboard health cards, crash-loop detection and healthcheck auto-heal
- Responsive live and fullscreen logs with service filter, search, time ranges, **since last restart**, copy of the latest 50 / 100 / 150 or all loaded lines, autoscroll pause, long-line handling and optional default timestamps
- Low-power mode for NAS and small hosts
- Optional Kula, Dozzle, PowerWatch and PowerWatch Hub integrations, with current PowerWatch power shown across linked instances

### Docker resources
- Images, volumes, networks and unmanaged containers, with search
- `bridge`, `macvlan` and `ipvlan` network management
- Unified manual and automatic cleanup for images, networks, volumes and build cache, with previews, exclusions and history
- Exact catch-up scheduling and Image-ID based classification
- Protection of running and stopped containers, rollback and recovery images, and recent Dockge-Enhanced images

### Search & files
- Global multi-instance search (`Ctrl+K`) across stacks, Compose/`.env` files, Docker resources and recent Restic snapshots
- Opt-in search in `.env` values, which are never returned or stored in history
- Compact mounted-volume rows with sizes and a volume browser/editor for each container, even when the stack is stopped
- Optional root-restricted host file manager with chunked transfers, text editing and a file-log viewer

### Automation & audit
- Permission- and stack-scoped REST API tokens
- Per-stack webhooks
- Optional Home Assistant custom integration and examples
- Centralized audit history with origin, status and duration
- Guides: [REST API, webhooks and Home Assistant](docs/AUTOMATION.md) · [Home Assistant integration](docs/HOME-ASSISTANT.md)

### Integrations
- Zerobyte: managed installation or external connection
- PowerWatch and PowerWatch Hub: external observation or managed deployment
- PlugNPiN for Nginx Proxy Manager, Pi-hole and AdGuard Home
- Dozzle
- Kula
- Home Assistant

### Appearance & languages
- Separate day and night palettes, including the original Dockge-Enhanced themes
- Catppuccin, Nord, Solarized, Dracula, Gruvbox, Tokyo Night and Rosé Pine options
- Browser-persisted preferences with a system-aware Auto mode
- Enhanced features translated in English, French, German, Spanish and Simplified Chinese; other interface languages fall back to English for them

### Notifications & access
- Discord and Apprise notifications, localized in EN / FR / ES / zh-CN
- Instance name in notifications and `DOCKGE_PUBLIC_URL` links
- Remote operational announcements and a persistent unread release-news journal
- Optional weekly and monthly anonymous installation-count reports via a GitHub Actions Discord webhook
- Third-party mobile clients

</details>

---

## Dockge-Enhanced automatic update workflow

> **Separate from ImageWatcher:** Immediate mode checks stack images every 5 minutes. The workflow below applies only to protected updates of Dockge-Enhanced itself.

<details>
<summary>Show the protected update workflow</summary>

Dockge-Enhanced handles the complete workflow automatically: mandatory Restic backup, integrity verification, controlled container replacement, health check and final confirmation. Discord/Apprise notifications also let users follow the operation without keeping the WebUI open.

The updater supports the normal Unix socket (including `DOCKGE_DOCKER_SOCKET`) and a trusted Docker Socket Proxy configured with `DOCKER_HOST=tcp://proxy:2375`. In TCP mode it never mounts a socket: the updater starts on one of the instance’s Docker networks, joins any additional networks, and only executes its signed plan after a start signal confirms all attachments. It uses the same configured Docker endpoint. The proxy must allow container inspection/create/start/stop/remove, image inspection/pull and network connection; a read-only proxy cannot perform a self-update. Keep an unencrypted TCP endpoint on a trusted internal network only. TLS settings are retained when the certificate directory is mounted in the Enhanced container; otherwise the update stops safely before replacement.

Before an automatic self-update starts, Enhanced also checks that no sensitive operation is running: Restic backup or restore, stack copy/move/data transfer or replication, Docker image checks/updates, Trivy scans and protected external-stack integration. When an operation blocks the update, it enters a waiting state, the reason is shown in the WebUI and sent through Discord/Apprise, and the watcher retries automatically.

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

</details>

## Screenshots

<details>
<summary>Show screenshots</summary>

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

</details>

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
      - TZ=Europe/Paris                      # optional runtime timezone; schedules configurable in WebUI
```

```bash
docker compose up -d
```

Open **http://localhost:5001**, create your admin account, then click **Monitoring** in the navigation bar.

> The `/backup:/backup` volume is optional but recommended if you use **local** as a Restic backup destination — set the destination path to `/backup` so your snapshots land on a dedicated host directory outside the container.

> **Backing up multiple data directories?** Add as many volumes as you need (e.g. `../../media:/media-data`), then select the mounted paths in **Backup → Docker volumes to backup**; Restic includes them in every backup run. See the [Restic guide](docs/restic.md).

> **Monitoring a disk partition other than `/`?** Disk stats are read from inside the container with `df`. If you want to track a host path like `/mnt/data`, mount it read-only and add it in the **Monitoring** tab under *Monitored disk partitions*:
> ```yaml
>       - /mnt/data:/mnt/data:ro
> ```

**PowerWatch and PowerWatch Hub are optional**: neither needs to be added to the Enhanced Compose above. After installation, open **Watcher → Monitoring** (`/watcher/monitoring`) to connect existing instances or deploy the managed services independently. Protected PowerWatch instances are supported: enter their read-only Bearer token in Monitoring → PowerWatch. Instances without authentication still require no token.

### Testing Dockge-Enhanced alongside Dockge

Dockge and Dockge-Enhanced can run on the same Docker host, but their default Compose configurations cannot be used unchanged because both publish port `5001`.

To test them side by side:

- install Dockge-Enhanced from a separate Compose directory;
- use another host port, for example `5002:5001`;
- use a separate `/app/data` directory;
- preferably use a separate stacks directory with a dedicated test stack.

Example:

```yaml
ports:
  - 5002:5001
volumes:
  - ./enhanced-data:/app/data
  - /opt/dockge-enhanced-test-stacks:/opt/stacks
environment:
  - DOCKGE_STACKS_DIR=/opt/stacks
  - DOCKGE_DATA_DIR=/app/data
```

You can then open Dockge-Enhanced at **http://localhost:5002** while your existing Dockge installation remains available on port `5001`.

Both applications may access the same stacks directory, but they should never edit, deploy, update or otherwise operate on the same stack **simultaneously**. Using a separate stacks directory for testing is safer.

### Migrating from Dockge to Dockge-Enhanced

Migration is straightforward because Dockge-Enhanced shares the same foundation as Dockge:

1. Stop Dockge.
2. Back up your Dockge Compose file, data directory and stacks directory.
3. In your existing Dockge Compose file, replace the image with:

   ```yaml
   image: ghcr.io/aerya/dockge-enhanced:latest
   ```

4. Keep your existing `/app/data` and stacks volume mappings.
5. Pull the image and restart the Compose project:

   ```bash
   docker compose pull
   docker compose up -d
   ```

Dockge-Enhanced will start with your existing account, settings and stacks.

Keep the backup created before migration. If you decide to return to Dockge, stop Dockge-Enhanced and restore that backup before restarting the original Dockge image.

### Optional PlugNPiN integration

<details>
<summary>Show setup details</summary>

Open **Settings → Integrations** to configure [PlugNPiN](https://github.com/DeepSpace2/PlugNPiN). The integration remains fully inactive until **Enable PlugNPiN** is selected and the form is saved. Enabling it creates the managed `plugnpin-dockge-enhanced` stack; disabling it runs Compose down and removes the generated stack directory.

Nginx Proxy Manager credentials are required by PlugNPiN. Pi-hole, AdGuard Home, metrics, and debug logging remain individually optional. Passwords are written through stdin into the dedicated `dockge_enhanced_plugnpin_secrets` Docker volume and are never returned to the browser or included in the generated Compose file.

To publish a service, edit its stack and use **PlugNPiN publication (optional)** below the Compose editor. The assistant generates and can apply the required `plugNPiN.ip` and `plugNPiN.url` labels plus selected NPM options. Existing mapping-form labels and comments are preserved. For list-form labels, Dockge deliberately offers copy-only output instead of rewriting the existing structure.

> Disabling the controller stops its containers but cannot guarantee immediate removal of entries it created while labeled application containers are still running. Remove the labels or stop the affected applications while PlugNPiN is running if those entries must be deleted first.

> PlugNPiN `1.0.0` is currently published upstream for `amd64` only. Dockge keeps the integration disabled with a clear message on unsupported architectures; the rest of Dockge Enhanced remains multi-architecture.

</details>

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `DOCKGE_STACKS_DIR` | `/opt/stacks` | Directory containing Docker Compose stacks |
| `COMPOSE_FILENAME` | `compose.yaml` | COMPOSE_FILENAME selects compose.yaml (default), compose.yml, docker-compose.yaml or docker-compose.yml for new stacks only. Existing and adopted stacks keep their filenames. Other names and paths are rejected. |
| `DOCKGE_DATA_DIR` | `/app/data` | Dockge data directory; override only for a custom persistent mount |
| `DOCKGE_PUBLIC_URL` | *(none)* | Public URL used in Discord notification links (e.g. `https://dockge.example.com`) |
| `DOCKER_API_VERSION` | *(none)* | Fixes the Docker API version negotiated by the client — useful on certain NAS systems (e.g. Synology DSM 7.x) |
| `TZ` | `UTC` | Container runtime timezone; scheduling defaults to it until explicitly configured in **Settings → General**. The WebUI choice takes precedence for Enhanced schedules. |
| `DOCKGE_PORT` | `5001` | Web UI port |
| `DOCKGE_SSL_KEY` / `DOCKGE_SSL_CERT` | — | Enable HTTPS |
| `DOCKGE_AUTH_MODE` | *(unset)* | Authentication mode: `local`, `disabled`, or `trusted-proxy`. When unset, the historical behavior and `disableAuth` setting are preserved |
| `DOCKGE_AUTH_PROXY_HEADER` | `x-forwarded-user` | Header containing the proxy-validated identity in `trusted-proxy` mode |
| `DOCKGE_AUTH_PROXY_TRUSTED_NETWORKS` | *(required in proxy mode)* | Comma-separated addresses or CIDRs allowed to provide the identity header |
| `DOCKGE_BOOTSTRAP_USERNAME` | *(none)* | First administrator name, created only when the database contains no users |
| `DOCKGE_BOOTSTRAP_PASSWORD_FILE` | *(none)* | Secret file containing the password; recommended for automated bootstrap |
| `DOCKGE_BOOTSTRAP_PASSWORD` | *(none)* | Direct password alternative, less secure because it is visible in the container environment |
| `DOCKGE_TRANSFER_RSYNC_PROFILES` | `[]` | JSON array of local SSH/rsync profiles (`label`, `host`, `port`, `user`, `path`, `keyPath`, optional `bandwidthKbps`). Configure the same destination identity on both instances; key paths never leave their instance |
| `DOCKGE_AUTH_PROXY_ADMIN_USERS` | *(none)* | Comma-separated proxy identities created as administrators on first sign-in in `trusted-proxy` mode; other new identities are restricted without grants |
| `DOCKGE_REVERSE_HUB_URL` | *(none)* | Hub origin for an optional reverse agent connection (HTTP(S), no path); see the [reverse agent guide](docs/compose-and-reverse-agents.md) |
| `DOCKGE_REVERSE_TOKEN_FILE` / `DOCKGE_REVERSE_TOKEN` | *(none)* | Per-node reverse agent token; the file takes precedence and is recommended |
| `DOCKGE_FILE_MANAGER_ROOT` | *(none)* | Container path exposed by the optional host file manager; disabled when unset |
| `DOCKGE_FILE_MANAGER_MAX_FILE_SIZE` | `104857600` | Maximum transfer size of the host file manager, in bytes (100 MiB) |
| `DOCKGE_DOCKER_SOCKET` | `/var/run/docker.sock` | Docker socket path, for example for rootless Docker or Podman |
| `DOCKER_HOST` | *(none)* | Docker endpoint, for example `tcp://proxy:2375` with a trusted Docker Socket Proxy |
| `DOCKGE_CONTAINER_ID` | *(none)* | Explicit Enhanced container ID when it cannot be resolved from `HOSTNAME` |
| `DOCKGE_USAGE_COUNT` | *(enabled)* | Set to `false` to disable the anonymous monthly installation count |
| `DOCKGE_OIDC_ISSUER` | *(none)* | OpenID Connect issuer URL; setting it enables native OIDC sign-in. Every `DOCKGE_OIDC_*` option is described in the [OIDC guide](docs/oidc.md) |

> ℹ️ Without `DOCKGE_DATA_DIR`, Dockge-Enhanced uses its persistent `/app/data` volume. Explicitly configured paths always take precedence.

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

Replace the example CIDR with the proxy’s exact network and configure it to pass the selected header. The Dockge port must not be directly reachable: only declared proxies may provide an identity. Each proxy identity uses the local account with the same username: a restricted account limits that proxy user, and an administrator account keeps full access. An identity without an account is created as a restricted account with no grants, except the first user of a fresh installation and the identities listed in `DOCKGE_AUTH_PROXY_ADMIN_USERS`, which become administrators. Existing accounts keep their role, and role or disable changes can take up to 30 seconds to apply to proxy sessions. Account management remains available in local authentication mode only. Never exempt `/setup`, `/socket.io`, or `/api/*` from authentication; the proxy must forward WebSockets and protect the entire host.

### Native OIDC sign-in (Pocket ID, Authentik, Keycloak…)

Without a reverse proxy, Dockge-Enhanced can sign users in directly with an OpenID Connect provider, alongside local accounts and 2FA:

```yaml
environment:
  - DOCKGE_OIDC_ISSUER=https://id.example.com
  - DOCKGE_OIDC_CLIENT_ID=dockge
  - DOCKGE_OIDC_CLIENT_SECRET_FILE=/run/secrets/dockge_oidc_secret
  - DOCKGE_OIDC_REDIRECT_URI=https://dockge.example.com/api/auth/oidc/callback
  - DOCKGE_OIDC_ADMIN_GROUPS=dockge-admins
```

New OIDC users are restricted accounts with no access until an administrator grants it, unless they belong to `DOCKGE_OIDC_ADMIN_GROUPS` or `DOCKGE_OIDC_ADMIN_USERS`. No user becomes an administrator implicitly: on a new installation, create the first administrator with `/setup` or `DOCKGE_BOOTSTRAP_*`, or configure an admin mapping, otherwise the first OIDC login is refused. Existing local accounts are never linked unless `DOCKGE_OIDC_LINK_EXISTING=true`. OIDC works only in local authentication mode and does not ask for the local TOTP code. `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN=true` leaves only the SSO button; to recover when the provider is unavailable, remove it and restart the container. [All options, provider examples and recovery](docs/oidc.md).

---

## Auto-updates

This fork tracks upstream Dockge releases automatically via GitHub Actions:
- **Daily** — checks for a new stable release
- **If found** — merges upstream changes and opens a PR
- **On merge** — rebuilds and publishes Docker images (`amd64` + `arm64`) to GHCR
- **On authentication conflicts** — temporarily keeps the Enhanced version in the sync branch and explicitly lists files that require comparison before merging

The in-app maintenance window configured on the **Updates** tab is global: when enabled for automatic Dockge-Enhanced updates, it also gates all automatic image updates. Images detected outside the allowed days and hours remain queued. Manual **Update now** actions are never delayed by this window.

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

- [**Apprise**](https://github.com/caronc/apprise-api) — multi-platform notification gateway
- [**darthrater78/dockge**](https://github.com/darthrater78/dockge) / [**ha-dockge**](https://github.com/darthrater78/ha-dockge) — inspiration for port-conflict detection, Compose drift checks and the Home Assistant companion integration.
- [**crossly/Dockge-Enhanced**](https://github.com/crossly/Dockge-Enhanced) — source of significant UI/UX, theming, internationalization and frontend architecture improvements adapted into this project
- [**Dockge**](https://github.com/louislam/dockge) by louislam — the original project (MIT licence)
- [**Dozzle**](https://github.com/amir20/dozzle) by Amir Rajan — real-time Docker log viewer (MIT licence)
- [**hamphh/dockge**](https://github.com/hamphh/dockge) by hamphh — inspiration and compatible labels for per-service stack-status and image-update exclusions
- [**Isurupro7**](https://github.com/Isurupro7) / [**Dockge #1006**](https://github.com/louislam/dockge/pull/1006) — inspiration for optional per-service CPU/RAM limits, adapted without changing restricted-account permissions
- [**RichyHBM**](https://github.com/RichyHBM) / [**Dockge #84**](https://github.com/louislam/dockge/pull/84) — Default Compose filename.
- [**Wowu/docker-rollout**](https://github.com/Wowu/docker-rollout) — Updates without service interruption.
- [**Kula**](https://github.com/c0m4r/kula) by c0m4r — lightweight system monitor (AGPLv3)
- [**Lorwell/dockge**](https://github.com/Lorwell/dockge) by Lorwell — inspiration for the restricted host file manager and real-container view adapted for Enhanced (MIT licence)
- [**PlugNPiN**](https://github.com/DeepSpace2/PlugNPiN) by DeepSpace2 — optional DNS and Nginx Proxy Manager automation (GPLv3)
- [**PowerWatch**](https://github.com/Aerya/PowerWatch) — Linux power monitoring and aggregation Hub, optionally integrated with Enhanced
- [**Restic**](https://restic.net/) — encrypted backup tool
- [**Trivy**](https://github.com/aquasecurity/trivy) — vulnerability scanner
- [**Zerobyte**](https://github.com/nicotsx/zerobyte) — backup application based on Restic, optionally connected to or deployed by Enhanced

---

## License

MIT — see [LICENSE](LICENSE).
