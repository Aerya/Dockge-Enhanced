# Host Updates (Beta)

[English](host-management.md) · [Français](host-management.fr.md) · [Deutsch](host-management.de.md) · [Español](host-management.es.md) · [简体中文](host-management.zh-CN.md)

Optional and disabled by default, under `/watcher/hosts`: Debian/Ubuntu and Arch/Garuda inventory and update detection, Debian/Ubuntu CVE analysis, manual or scheduled APT updates after local installation and authorization. Profiles: all permitted updates, security only, conservative, security and conservative. Configurable detection and operation notifications. Read-only reports and existing federation transport. Arch/Garuda remain monitoring-only; AUR, RPM/APK/Zypper, fleet operations and complete CVE coverage remain unavailable.

The Host Updates tab is always visible; only monitoring is disabled by default.

Updates groups Dockge-Enhanced, Docker Images and Host Updates (Beta) in three visible subtabs. Eight main tabs remain; existing URLs and remote-instance links are preserved.

## Installation and security

Run these commands locally on the intended Linux host after reviewing the shipped scripts. Never install the collector inside Enhanced. Python 3 and systemd are required. No SSH connection is required or implemented. Do not run these instructions on production merely to test the feature. Installation and upgrades are local administrator actions; the hub cannot replace these files.

```sh
sudo useradd --system --no-create-home --shell /usr/sbin/nologin dockge-host
sudo install -d -m 0755 /usr/local/lib/dockge-host
sudo install -m 0644 extra/host-management/collector.py /usr/local/lib/dockge-host/
sudo install -m 0644 extra/host-management/dockge-host-collector.service extra/host-management/dockge-host-collector.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dockge-host-collector.timer
sudo systemctl start dockge-host-collector.service
```

```yaml
services:
  dockge:
    volumes:
      - /var/lib/dockge-host-reports:/host-reports:ro
```

## Limitations and recovery

Monitor supports Debian/Ubuntu and Arch/Garuda. Pacman uses checkupdates when available, otherwise cached pacman -Qu; no pacman -Sy, partial upgrade or AUR operation. APT uses the existing cache and never refreshes repositories implicitly. Unknown reboot status does not mean no reboot is needed. Other operating systems and providers are unsupported. One host belongs to each instance. Collector cadence is configured locally in the timer (6 hours); Enhanced reads every minute. Stale threshold: 12 hours; history: 90 days, configurable. Fingerprints avoid duplicating identical package inventories. Only the latest 100 history entries are displayed. Repository hostnames/names are sanitized; installed kernel package versions are displayed. Official package origin is recognized only for unambiguous Debian/Ubuntu public mirrors; otherwise matches remain indeterminate. Click an inventory date to compare package additions, removals and versions with the previous retained inventory. Advanced fleet filters remain unavailable. A domain-separated hash of machine-id binds reports and operations; the raw machine-id is never reported.

CVE analysis is optional and runs at most hourly when inventory changes, otherwise daily. The same Trivy image reads a synthetic dpkg database and os-release; no host root mount or Docker socket is exposed to the scanner. Only database downloads have network access; scanning is offline. Database age over 72 hours is rejected. Results are partial: third-party origins, ESM and unrecognized advisories are not proven safe. An exact fixed version in the update inventory is reported available; other published fixes have undetermined local availability. No generic SemVer comparison is used. Scans are reevaluated daily and held in memory; after restart status is unknown until a new scan. Trivy retains upstream advisory provenance; databases are downloaded at runtime, not redistributed in Enhanced. See the Trivy database source licenses. Arch CVEs and direct vendor feeds are not implemented.

[Trivy SBOM](https://trivy.dev/docs/latest/target/sbom/) · [Trivy DB sources and licenses](https://github.com/aquasecurity/trivy-db/blob/main/LICENSE)

```sh
sudo systemctl disable --now dockge-host-collector.timer
sudo rm /etc/systemd/system/dockge-host-collector.timer /etc/systemd/system/dockge-host-collector.service
sudo systemctl daemon-reload
# Reports and history are retained.
```

[PatchMon](https://github.com/PatchMon/PatchMon) — System inventory, monitoring and update orchestration inspiration.

[PatchBase](https://github.com/patchbase/patchbase) — Package inventory, security advisory correlation and vulnerability detection inspiration.

## Local APT executor

Manual is locally enabled only: install the executor separately, choose UTC hours and exclusions in the root-owned policy. Default policy refuses installation. Requests expire after two minutes; simulations expire after five minutes and are recalculated before installation. Approval is consumed before execution. No shell command, reboot, dependency addition or removal is exposed. Native APT locks remain enabled. Existing configuration files are kept; inspect .dpkg-dist files locally afterwards. Do not stop an executing package manager; disabling the timer prevents new requests. An interrupted or failed transaction requires local diagnosis with dpkg --audit and the distribution recovery procedure. No universal rollback. A compromised authorized admin/hub can request locally permitted updates; a compromised host/root is outside this trust boundary.

Use a directory owned by the Enhanced process UID for requests (replace 1000 appropriately). Only this directory is writable; operation reports remain read-only. Never mount /etc/dockge-host or the executor state in Enhanced. Shared transport uses existing direct/reverse agents and checks administrator access on both ends. Hub-only can read inventory but does not run Trivy. Agent-only keeps the same RPCs. Notifications and per-host scheduling are detailed below. Fleet operations and individual package selection remain unavailable.

```sh
sudo install -m 0644 extra/host-management/executor.py extra/host-management/apt_provider.py /usr/local/lib/dockge-host/
sudo install -d -m 0700 /etc/dockge-host /var/lib/dockge-host-executor
sudo install -d -m 0755 /var/lib/dockge-host-operations
sudo install -d -m 0700 -o 1000 /var/lib/dockge-host-requests
sudo install -m 0600 extra/host-management/policy.example.json /etc/dockge-host/policy.json
sudo install -m 0644 extra/host-management/dockge-host-executor.service extra/host-management/dockge-host-executor.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dockge-host-executor.timer
```

```json
{
  "mode": "manual",
  "allowInstall": true,
  "allowAutomatic": false,
  "allowedScopes": ["security", "conservative", "security-conservative"],
  "conservativePackages": [],
  "refreshMetadata": false,
  "utcHours": [2, 3],
  "exclusions": ["example-package"]
}
```

```yaml
services:
  dockge:
    environment:
      DOCKGE_HOST_REQUEST_DIR: /host-requests
      DOCKGE_HOST_OPERATION_REPORT_DIR: /host-operations
    volumes:
      - /var/lib/dockge-host-requests:/host-requests
      - /var/lib/dockge-host-operations:/host-operations:ro
```

```sh
sudo systemctl disable --now dockge-host-executor.timer
# Wait for any running apt/dpkg operation to complete before removing the service.
sudo rm /etc/systemd/system/dockge-host-executor.timer /etc/systemd/system/dockge-host-executor.service
sudo systemctl daemon-reload
```

## Profiles, schedules and notifications

No update is guaranteed free of breaking changes. **Security only** selects versions from trusted official Debian/Ubuntu security repositories using native APT comparisons. It does not depend on Trivy CVE detection and excludes ESM and third-party repositories. **Conservative** requires a local `conservativePackages` allowlist and excludes essential/important packages and major critical families (kernel, boot, networking, drivers, Docker, databases). An empty list updates nothing. **Security and conservative** combines both restrictions. Dependencies outside the selection, new packages, removals and held packages are rejected; an additional dependency can block the entire operation. The `all` profile also requires explicit `allowedScopes` authorization and is not conservative.

Arch/Garuda and rolling-release distributions may encounter dependency, driver or application breakage requiring manual intervention. Read distribution announcements, back up and prefer a full upgrade using the distribution procedure (for example `garuda-update`). Partial, security-only and automatic rolling-release upgrades are not offered in this beta.

Also install `apt_provider.py` and the system `python3-apt` package for targeted profiles. The executor uses `/usr/bin/python3`. `mode: manual` enables simulation followed by manual approval. Scheduling on fixed-release Debian/Ubuntu requires the local administrator to set `mode: automatic`, `allowInstall: true`, `allowAutomatic: true`, permitted `allowedScopes` and `utcHours`. Policy remains local and inaccessible to the hub. `refreshMetadata: true` explicitly permits APT metadata refresh before simulations and scheduled jobs; failure prevents installation. Otherwise existing indexes are used.

In Configuration, choose weekdays, UTC time and profile, then save. The local executor recalculates each plan and rechecks policy. Each slot runs once; a delay of five minutes skips it, without catch-up or automatic retries after failure. Scheduling continues while the hub is disconnected. Disable and save the schedule before disabling monitoring. Revoke local policy or disable the timer to prevent new jobs; never interrupt active APT/dpkg writes. No automatic reboot, distribution release upgrade or universal rollback.

Notifications use Discord/Apprise channels configured in Notifications and are separately disabled by default. Select events: updates, vulnerabilities with severity threshold, available fixes, reboot required, stale/unavailable collector or security data, start, success, failure and schedule changes. Installation events include manual/automatic mode, profile and package count. Detection alerts are deduplicated with an hourly interval per kind; operation events have no hourly suppression. Monitoring and delivery run without an open page. Failed deliveries are retried while retained and enabled; success on at least one channel counts as delivered. The executor retains the last 100 events for reconnection recovery; Enhanced retains history according to its configured retention (default 90 days). This buffer is not an unlimited journal.
