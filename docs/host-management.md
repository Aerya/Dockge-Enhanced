# Host Management (Beta)

[English](host-management.md) · [Français](host-management.fr.md) · [Deutsch](host-management.de.md) · [Español](host-management.es.md) · [简体中文](host-management.zh-CN.md)

Optional and disabled by default, under `/watcher/hosts`: local host inventory, APT/Pacman updates, Debian/Ubuntu CVE analysis using the existing Trivy image, and restricted manual APT operations with local authorization. Reports are mounted read-only. Existing federation transports requests; old agents remain unavailable. Automatic updates, AUR, RPM/APK/Zypper and complete vendor coverage are unavailable.

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

## Manual APT executor

Manual is locally enabled only: install the executor separately, choose UTC hours and exclusions in the root-owned policy. Default policy refuses installation. Requests expire after two minutes; simulations expire after five minutes and are recalculated before installation. Approval is consumed before execution. No shell command, reboot, dependency addition, removal or automatic schedule is exposed. Native APT locks remain enabled. Existing configuration files are kept; inspect .dpkg-dist files locally afterwards. Do not stop an executing package manager; disabling the timer prevents new requests. An interrupted or failed transaction requires local diagnosis with dpkg --audit and the distribution recovery procedure. No universal rollback. A compromised authorized admin/hub can request locally permitted updates; a compromised host/root is outside this trust boundary.

Use a directory owned by the Enhanced process UID for requests (replace 1000 appropriately). Only this directory is writable; operation reports remain read-only. Never mount /etc/dockge-host or the executor state in Enhanced. Shared transport uses existing direct/reverse agents and checks administrator access on both ends. Hub-only can read inventory but does not run Trivy. Agent-only keeps the same RPCs. Notifications reuse ImageWatcher channels, are off by default, deduplicated and rate-limited to hourly. Fleet scheduling, security-only selection and individual package updates are unavailable.

```sh
sudo install -m 0644 extra/host-management/executor.py /usr/local/lib/dockge-host/
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
