# Restic backups and recovery

[English](restic.md) · [Français](restic.fr.md) · [Español](restic.es.md) · [Deutsch](restic.de.md) · [简体中文](restic.zh-CN.md)

Dockge-Enhanced includes a native [Restic](https://restic.net/) engine in **Backup**. It is independent from the optional [Zerobyte integration](zerobyte.md), which uses its own repositories and retention.

## What is backed up

- The `compose.yaml`, override and `.env` files of every included stack. A stack can be excluded from all backups in **Stacks to back up and consistency**.
- Optional data paths: `/app/data` (Dockge-Enhanced data) and any number of volumes mounted in the Enhanced container, for example `/dockers-data`, selected in **Docker volumes to backup**. Sizes are calculated on demand.
- Built-in exclusions (`*.log`, `__pycache__`, `node_modules`) always apply; custom glob patterns are passed to `restic --exclude`.

Keep the entire `/app/data` directory in your backups, including `two-factor.key`: a database-only restore cannot decrypt TOTP secrets without this key.

## Destinations and schedules

- Destinations: local, SFTP/NAS (SSH key or password), S3/Backblaze B2 and REST Server. Several destinations can be enabled; each run backs up to all of them.
- For a local destination, mount a dedicated host directory, for example `../../backup/dockge:/backup`, and use `/backup` as the destination path.
- Scheduled backups, **Back up now** and backups on Compose save are available. On-save snapshots are tagged `on-save`, use a 60-second cooldown and intentionally skip `restic forget`, so a burst of saves never removes older daily or weekly snapshots.
- The overlap guard, enabled by default, prevents a manual, scheduled or on-save backup from starting while another Restic backup is running.
- A stale Restic lock is removed with `restic unlock --remove-all` before each backup and retention run. Exit code 3 (a source file could not be read) is recorded as a success with warnings.

## Per-stack consistency

Each included stack has its own mode:

- **Live**: no interruption.
- **Stop then restart**: only running services are stopped before the snapshot and the same services are restarted, even after a failure.
- **Application hooks**: pre/post commands run with `docker compose exec` inside the selected service, for example a database dump, without host-shell access.

Stacks are restarted before retention and restore tests to keep downtime short.

## Settings, retention and maintenance

- **Save** stores settings and retention only; it does not run a backup or prune.
- **Back up now** runs an immediate backup, then ordinary retention on success.
- Maintenance tools refresh repository and snapshot status and run `restic check` on each enabled destination.
- Ordinary retention (`keepLast`, daily, weekly, monthly) runs after successful scheduled or manual backups, not after on-save backups.
- Mandatory snapshots taken before protected Dockge-Enhanced self-updates use a dedicated retention: after the new snapshot is created **and verified**, the two latest self-update snapshots of this installation are kept. A stable installation tag prevents this cleanup from touching another instance sharing the repository. If this cleanup fails, the verified backup is kept.
- The snapshot list opens on **All**. A **Backup overdue** badge and one notification per interval appear when the last successful backup is older than twice the configured interval.

## Repository initialization

On the first backup, Restic initializes **only demonstrably missing** repositories. Access, network and password errors block initialization instead of creating a new repository. The interface shows the repository status of each enabled destination.

## Repository and source overlap

Preferably keep local Restic repositories outside the folders selected for backup.

- If a local repository is nested below a selected source, saving the settings shows a warning, and backups automatically exclude the repository, its reset archives and its other Docker mount paths. Resolved symbolic links are checked too, and disabled local destinations remain protected.
- For example, `/app/data` can stay selected with a repository at `/app/data/backups`.
- Selecting a repository itself, or one of its subfolders, as a backup source is refused. Paths are checked again before every backup.
- This check never moves or resets a repository. Existing paths, passwords and retention settings are preserved.

## Safe repository reset (Local, SFTP, S3 and REST)

In **Backup → Maintenance and diagnostics**, choose an enabled destination and preview its repository and snapshot count.

- The reset requires two explicit acknowledgements, the exact confirmation phrase and a short-lived one-use token.
- A local repository is renamed into a retained archive before a fresh repository is created. A remote repository switches to a new SFTP directory, S3 prefix or REST URL; the old repository is not deleted.
- The new active repository has no old snapshots. Recent history entries are removed for that destination only.
- The previous repository remains at its old location for recovery: this is **not** a permanent deletion of backup data.
- Do not reset a repository shared by other clients without coordinating them first.

## Restore and verification

- The snapshot browser lists Compose, `.env` and volume files side by side, with their status compared with the previous snapshot (New / Modified / Unchanged) and with the current disk (OK / Modified / Missing).
- Text files can be previewed and compared with the disk or with the previous snapshot before restoring.
- Restore any selection of files, or a whole stack with **Restore stack**.
- After each scheduled backup, a restore test reads a real file from the new snapshot and records the result in the backup history. Use **Check integrity** for a full `restic check`.
- Protected self-updates and recovery workflows rely on these verified Restic snapshots.
