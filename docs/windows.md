# Windows 11 with Docker Desktop (WSL2)

[English](windows.md) · [Français](windows.fr.md) · [Deutsch](windows.de.md) · [Español](windows.es.md) · [简体中文](windows.zh-CN.md)

Enhanced runs as a **Linux container**, not as a native Windows service or a Windows container. Use Docker Desktop with its WSL2 engine and enable integration for your Linux distribution. Compose is already included in Enhanced; do not install a second Docker Engine in WSL.

In Docker Desktop, enable **Use the WSL 2 based engine**, then **Resources → WSL Integration** for your distribution. Open that distribution's terminal and check:

```bash
docker version
docker compose version
mkdir -p "$HOME/dockge-enhanced"/{data,stacks,backups}
cd "$HOME/dockge-enhanced"
```

Use the distribution's Linux filesystem (for example `/home/user/dockge-enhanced`), not `/mnt/c`, for the recommended installation. Keep data and stacks in separate bind mounts. The stacks directory must have the **same absolute path inside Enhanced and on the Docker host**.

Create `compose.yaml` in that directory:

```yaml
services:
  dockge:
    image: ghcr.io/aerya/dockge-enhanced:latest
    container_name: dockge-enhanced
    restart: unless-stopped
    ports:
      - "5001:5001"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ${HOME}/dockge-enhanced/data:/app/data
      - ${HOME}/dockge-enhanced/stacks:${HOME}/dockge-enhanced/stacks
      - ${HOME}/dockge-enhanced/backups:/backup
    environment:
      DOCKGE_STACKS_DIR: ${HOME}/dockge-enhanced/stacks
      DOCKGE_DATA_DIR: /app/data
```

Then run `docker compose up -d`, open `http://localhost:5001` and create your administrator account. Keep the Docker socket private: access to it grants control over the Linux Docker engine. For a test instance, use separate directories and a different port.

Restic can use `/backup` as a local destination. Managed Zerobyte is tested with **Linux WSL source/destination directories**, separate from Enhanced data and stacks. Do not weaken protected-path or storage-identity checks to use a rejected path. Restore into a dedicated test location first. A backup in the same Windows VM/disk is not protection against losing that disk.

The NTFS variant was also tested for Compose, `.env`, relative paths containing spaces, named volumes and Restic. When launched from PowerShell, use `C:/...` as the bind source and `/run/desktop/mnt/host/c/...` as the matching stacks destination/`DOCKGE_STACKS_DIR`. This Docker Desktop-specific mapping is not portable to Linux. NTFS sharing does not provide the same ownership, chmod or performance guarantees as a Linux filesystem; prefer WSL Linux storage/named volumes for databases. Managed Zerobyte on NTFS is not validated; use the WSL setup above.

- Docker Desktop must be running. Its start-at-sign-in setting is not an unattended Windows system service; after a reboot, sign in and wait for the Linux engine. `restart: unless-stopped` does not start Docker Desktop itself.
- CPU/RAM, disk statistics and self-update free-space checks see the Linux VM/filesystems exposed to Docker, not all of Windows. Also check Windows drive free space; a virtual disk's apparent capacity is not reserved host space.
- Host `systemd`, Linux hardware sensors, host networking, USB/GPU access and NAS network mounts are not equivalent to native Linux. Do not assume PowerWatch can measure Windows hardware through this VM.
- Linked instances must reach the addresses configured for one another. `localhost` points to the caller; `host.docker.internal` is for containers reaching this Windows host, not a public address for other servers. Configure Windows firewall access only for trusted clients.

Tests run in an isolated Windows 11 Enterprise Evaluation 26H2 VM, Docker Desktop 4.97 / Engine 29.9, WSL 3.0.3 and Ubuntu 24.04: Compose and ENV, non-root access, named/relative volumes, healthchecks, CPU/RAM limits, restart/recreate, SQLite/node-pty and browser terminal, Restic snapshot/restore, managed Zerobyte backup/restore and protected hooks, two linked Enhanced instances and scoped permissions. The sidecar uses a Linux destination while retaining Docker's Windows source path. No native-Windows-container support is claimed.

**After restarting Windows:** with Docker Desktop 4.97, automatic startup of WSL bind mounts failed in this test: the socket was unavailable and one container saw an empty directory, although the real WSL files were intact. Do not rerun initial setup against an apparently empty directory. Wait until `docker version` works in your distribution, verify the files in your `data` and `stacks` directories, then run `docker compose up -d` from the installation directory. In Enhanced, start stopped stacks and restart those with incomplete mounts. This recovery, existing accounts and a fresh Zerobyte backup/restore were verified. The NTFS variant resumed automatically in this test. Fully unattended WSL startup is therefore **not validated**; this mount problem is also [reported to Docker Desktop](https://github.com/docker/desktop-feedback/issues/601).

[Docker Desktop / WSL](https://docs.docker.com/desktop/features/wsl/) · [WSL filesystems](https://learn.microsoft.com/en-us/windows/wsl/filesystems)
