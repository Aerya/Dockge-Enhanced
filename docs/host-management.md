# Host Updates (Beta)

[English](host-management.md) · [Français](host-management.fr.md) · [Deutsch](host-management.de.md) · [Español](host-management.es.md) · [简体中文](host-management.zh-CN.md)

Optional and disabled by default, under `/watcher/hosts`: Debian/Ubuntu and Arch/Garuda inventory and update detection, Debian/Ubuntu CVE analysis, manual or scheduled APT updates after local installation and authorization. Profiles: all permitted updates, security only, conservative, security and conservative. Configurable detection and operation notifications. Read-only reports and existing federation transport. Arch/Garuda remain monitoring-only; AUR, RPM/APK/Zypper, fleet operations and complete CVE coverage remain unavailable.

The Host Updates tab is always visible; only monitoring is disabled by default.

Updates groups Dockge-Enhanced, Docker Images and Host Updates (Beta) in three visible subtabs. Eight main tabs remain; existing URLs and remote-instance links are preserved.

## Host component installation

Install host components from Dockge: explicit status, installation/repair and permission choices in the UI, with the first inventory started immediately. No user commands or Compose changes required.

Dockge installs the required components and starts the first inventory. No commands, Compose edits or SSH connection are required. Monitoring: Debian/Ubuntu and Arch/Garuda; update execution: fixed-release Debian/Ubuntu.

Allowed UTC hours, comma-separated. Packages allowed for the conservative profile, comma-separated (empty: none). These choices replace the host executor permissions. Existing exclusions are preserved. Schedulable mode does not enable a schedule; configure it afterwards.

An administrator confirms the selected mode in the UI. A temporary container based on the exact instance image enters the host system namespaces to install bundled files, missing Python dependencies and systemd services. No browser-supplied command, path or image is accepted. The permanent transport has no system privileges, network, Docker socket or host root mount; reports are read-only and only the request directory is writable. Dockge does not need recreation or stack changes. Existing manual installations remain compatible. Rootless Docker, user remapping, Docker Desktop and hosts without systemd are unsupported by this installer. A hub must select a compatible agent. Interrupted setup can be retried; never kill an actively writing package manager.

Requests expire after two minutes, simulations after five; plans are recalculated and approval consumed before execution. Update operations expose no shell, new dependencies, removals or automatic reboot. APT locks remain enabled and configurations are preserved; inspect `.dpkg-dist` afterwards. Interrupted transactions require local `dpkg --audit` and distribution recovery; there is no universal rollback. Disabling schedules and the timer prevents new work without interrupting current writes. A compromised Enhanced administrator can authorize the offered installations; host root compromise is outside this trust boundary.

## Limitations and recovery

Monitor supports Debian/Ubuntu and Arch/Garuda. Pacman uses checkupdates when available, otherwise cached pacman -Qu; no pacman -Sy, partial upgrade or AUR operation. APT uses the existing cache and never refreshes repositories implicitly. Unknown reboot status does not mean no reboot is needed. Other operating systems and providers are unsupported. One host belongs to each instance. Collector cadence is configured locally in the timer (6 hours); Enhanced reads every minute. Stale threshold: 12 hours; history: 90 days, configurable. Fingerprints avoid duplicating identical package inventories. Only the latest 100 history entries are displayed. Repository hostnames/names are sanitized; installed kernel package versions are displayed. Official package origin is recognized only for unambiguous Debian/Ubuntu public mirrors; otherwise matches remain indeterminate. Click an inventory date to compare package additions, removals and versions with the previous retained inventory. Advanced fleet filters remain unavailable. A domain-separated hash of machine-id binds reports and operations; the raw machine-id is never reported.

CVE analysis is optional and runs at most hourly when inventory changes, otherwise daily. The same Trivy image reads a synthetic dpkg database and os-release; no host root mount or Docker socket is exposed to the scanner. Only database downloads have network access; scanning is offline. Database age over 72 hours is rejected. Results are partial: third-party origins, ESM and unrecognized advisories are not proven safe. An exact fixed version in the update inventory is reported available; other published fixes have undetermined local availability. No generic SemVer comparison is used. Scans are reevaluated daily and held in memory; after restart status is unknown until a new scan. Trivy retains upstream advisory provenance; databases are downloaded at runtime, not redistributed in Enhanced. See the Trivy database source licenses. Arch CVEs and direct vendor feeds are not implemented.

[Trivy SBOM](https://trivy.dev/docs/latest/target/sbom/) · [Trivy DB sources and licenses](https://github.com/aquasecurity/trivy-db/blob/main/LICENSE)

[PatchMon](https://github.com/PatchMon/PatchMon) — System inventory, monitoring and update orchestration inspiration.

[PatchBase](https://github.com/patchbase/patchbase) — Package inventory, security advisory correlation and vulnerability detection inspiration.

## Profiles, schedules and notifications

No update is guaranteed free of breaking changes. **Security only** selects versions from trusted official Debian/Ubuntu security repositories using native APT comparisons. It does not depend on Trivy CVE detection and excludes ESM and third-party repositories. **Conservative** requires a local `conservativePackages` allowlist and excludes essential/important packages and major critical families (kernel, boot, networking, drivers, Docker, databases). An empty list updates nothing. **Security and conservative** combines both restrictions. Dependencies outside the selection, new packages, removals and held packages are rejected; an additional dependency can block the entire operation. The `all` profile also requires explicit `allowedScopes` authorization and is not conservative.

Arch/Garuda and rolling-release distributions may encounter dependency, driver or application breakage requiring manual intervention. Read distribution announcements, back up and prefer a full upgrade using the distribution procedure (for example `garuda-update`). Partial, security-only and automatic rolling-release upgrades are not offered in this beta.

In Configuration, choose weekdays, UTC time and profile, then save. The local executor recalculates each plan and rechecks policy. Each slot runs once; a delay of five minutes skips it, without catch-up or automatic retries after failure. Scheduling continues while the hub is disconnected. Disable and save the schedule before disabling monitoring. Revoke local policy or disable the timer to prevent new jobs; never interrupt active APT/dpkg writes. No automatic reboot, distribution release upgrade or universal rollback.

Notifications use Discord/Apprise channels configured in Notifications and are separately disabled by default. Select events: updates, vulnerabilities with severity threshold, available fixes, reboot required, stale/unavailable collector or security data, start, success, failure and schedule changes. Installation events include manual/automatic mode, profile and package count. Detection alerts are deduplicated with an hourly interval per kind; operation events have no hourly suppression. Monitoring and delivery run without an open page. Failed deliveries are retried while retained and enabled; success on at least one channel counts as delivered. The executor retains the last 100 events for reconnection recovery; Enhanced retains history according to its configured retention (default 90 days). This buffer is not an unlimited journal.
