[English](README.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [中文](README.zh-CN.md)

# Dockge-Enhanced on Unraid

Install through an Unraid Docker template, using the same Enhanced application as other systems. Compose is included: **no Unraid Compose plugin required**. The template is not yet listed in Community Applications.

## Installation and updates

1. Download [the XML template](dockge-enhanced.xml) to `/boot/config/plugins/dockerMan/templates-user/my-dockge-enhanced.xml`.
2. Select it under **Docker → Add Container**. The standard image is `ghcr.io/aerya/dockge-enhanced:latest`. Testing an unpublished PR requires its test image; `latest` does not include unpublished changes.
3. Choose a free port (**5055** by default). Check the persistent directories under `/mnt/user/appdata/dockge-enhanced`: `data` for Enhanced and `stacks` for Compose projects.
4. The stacks path must be **identical on the host, inside the container and in `DOCKGE_STACKS_DIR`**. When selecting a pool path instead of `/mnt/user`, change all three together. Relative application mounts resolve on the Docker host.
5. Apply, open the WebUI and create the administrator. Enable Enhanced **Autostart in Unraid**; `restart: unless-stopped` alone is insufficient after stopping the array. Configure array startup as required.
6. Update Enhanced through **Unraid's Docker tab**, retaining the mounts. A complete internal sidecar update with Restic backup was also tested; it does not modify the Unraid template. Choose only one automatic update manager. Enhanced can still manage application image updates.

Do not manage the same stack with both Enhanced and Compose Manager. Migrating from `test/unraid` does not require renaming existing folders: retain those paths and the port in the template. Back up first; never open the same data from two running Enhanced instances.

## Permissions and security

Enhanced runs as root inside its container and requires writable `data` and `stacks`. It **does not support `PUID`/`PGID`**. Applications may support their own IDs: an application running as `99:100` with a `0750` directory was tested.

Do not apply blanket `chmod 777`, recursive ownership changes or disable user namespace remapping to hide errors. Inspect ownership, ACLs and parent directory access. Remapped root is not necessarily host root. The editor preserves Compose modes such as `0777`; actual enforcement also depends on Compose and the config/secret type.

The container is **not privileged**, but the Docker socket controls **all host containers and volumes**. Separate directories do not isolate Docker. Do not expose the WebUI directly to the Internet. Review cleanup settings and back up important data before enabling them.

## Backups and recovery

- **Built-in Restic**: use a separate destination. Backup, integrity checking and Compose/`.env` restoration were tested.
- **Enhanced-managed Zerobyte**: read-only sources, a distinct destination and staged restore. Backup with service stop/restart was tested. After Enhanced is recreated, its owned Zerobyte network connection is restored automatically after ownership checks.
- **Unraid Appdata Backup**: select Enhanced's `data` and `stacks` folders and stop the container during copying. Avoid overlapping Enhanced backups/updates. Do not assume the plugin includes **Docker named volumes**, especially Zerobyte's internal data: back them up separately.
- Backing up Compose files does not replace application data backups. Test recovery before relying on it.

`depends_on`/`service_healthy` and `network_mode: service:...` work during Compose deployment. Unraid/Docker also starts containers individually; restart policies do not guarantee Compose dependency order. Dependent applications must handle reconnection.

## Validation and troubleshooting

Validated in an **Unraid 7.3.4 / Docker 29.8.2 VM**, with an XFS array and btrfs Docker vDisk: DockerMan installation/updates, editing/deployment, non-root permissions, IPv4/IPv6 port links, Enhanced/host reboot, array stop/start, Restic, Zerobyte and Appdata Backup. CI adds regression tests, AMD64/ARM64 builds and strict Trivy scans.

Additional tests: full `data` and `stacks` restoration with Appdata Backup, HTTP access over macvlan and ipvlan, Zerobyte network outage, and backup/restore on a lab SMB/CIFS mount. Remote mounts must be available before Zerobyte: a missing mount blocks backups without writing into the underlying local directory. After remounting, explicitly revalidate storage if its identity changed.

This is not certification of every Unraid hardware/pool/plugin combination or native macOS/Windows testing. Report the Unraid version, image/commit, paths, network driver, steps and logs **without secrets** in [Enhanced issues](https://github.com/Aerya/Dockge-Enhanced/issues). When removing a lab, verify container names and directory contents; never run global Docker cleanup.

## Credits

Template adapted from alex3305. These historical reports guided the tests; they are not a claim to universally fix every ticket.

[alex3305/unraid-docker-templates](https://github.com/alex3305/unraid-docker-templates/blob/main/dockge.xml) · [Dockge 238](https://github.com/louislam/dockge/discussions/238) · [911](https://github.com/louislam/dockge/issues/911) · [906](https://github.com/louislam/dockge/issues/906) · [455](https://github.com/louislam/dockge/issues/455) · [290](https://github.com/louislam/dockge/issues/290)
