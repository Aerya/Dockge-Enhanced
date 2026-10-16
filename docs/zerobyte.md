# Zerobyte (optional)

In **Backups**, turn on **Zerobyte (optional)**. OFF collapses the whole section and preserves its configuration, credentials, containers and backup data. Native Enhanced Restic retains its existing coverage, repositories and retention: **no automatic exclusion or migration** is performed.

## Existing instance

Enter the HTTP(S) origin reachable **from the Enhanced server**, and an API key generated in Zerobyte settings. Credentials, query parameters and paths in the URL are refused. Save, then test the connection. Enhanced does not manage Docker resources of an external instance. Only the selected instance is shown; federation and stack stop hooks are outside this integration.

## Managed installation

Enhanced generates a regular Compose project under its own stacks directory. Its project name derives from the actual Enhanced data/stacks mount paths, preventing collisions between Enhanced instances. Both directories must be identifiable host bind mounts. Zerobyte uses the official `ghcr.io/nicotsx/zerobyte:v0.43.2` image with the reduced-privilege installation: no Docker socket, SYS_ADMIN or FUSE. Internal database/configuration and restore staging use automatic persistent named volumes; never select these as sources or destinations.

1. Add at least one existing host directory or existing named Docker volume as a **source**. Enhanced shows its `/sources/local-…` path after validation. Sources are read-only.
2. Add at least one distinct existing host directory as a **destination**. It is writable under `/destinations/store-…`. For a host-mounted NFS/SMB/SSHFS/rclone share, select **This directory must be a mounted remote share**. A missing declared share is refused.
3. Confirm separation from Enhanced remote Restic repositories when prompted. Enhanced cannot prove that S3/SFTP/REST storage differs from a host-mounted share. Local repositories, including disabled destinations, are checked automatically in the host namespace.
4. Choose an unused local port with `http://127.0.0.1:<port>`, then confirm installation. The UI is loopback-only: use an SSH tunnel for access from another machine. Enhanced joins this project's network; the connection field uses the instance-specific service alias. It must stay on that network after replacing the Enhanced container.
5. Open Zerobyte, complete its onboarding, save the recovery key securely and generate an API key. Enter the key in Enhanced and save the connection.
6. **Mounts do not create logical volumes, repositories or backup jobs.** In Zerobyte, create Directory sources at the displayed source paths and Local repositories below the destination paths; then create a job. Jobs created through Enhanced start disabled. Configure schedules and retention in Zerobyte.

Paths with symlinks, traversal, system/control roots, shared source/destination ancestry, nested destinations, bind aliases and overlap with Enhanced/internal Zerobyte data or local Enhanced Restic repositories are refused. Host directories are inspected through a temporary read-only, network-disabled verifier with only DAC_READ_SEARCH in addition to dropped capabilities. Each destination's filesystem identity is checked on every Zerobyte start. A disappeared or replaced share prevents startup rather than writing into its local fallback directory. Revalidate mounts when intentionally replacing storage. Docker bind mounts keep the mounted filesystem attached while running; an unavailable share can fail or hang I/O. This is not a network availability guarantee.

Reapplying identical installation settings reuses the project and volumes. To change mounts, first configure the API connection, disable all Zerobyte jobs and wait for active operations to finish. Confirm the explicit mount update; the previous Compose file is reapplied if the replacement fails. Inspect existing logical jobs after changing mounts. No uninstall or volume deletion endpoint is provided. Keep the generated `.env` and `.zerobyte.json` private; they are required for ownership and persistent configuration. A failed first deployment retains its volumes and metadata for retry/diagnosis.

## Operations and restore

Overview exposes allowlisted fields for jobs, repositories, logical sources and active tasks; unknown statistics stay unknown. Backup and retention require explicit confirmation. Retention may delete Zerobyte snapshots under that job's own policy. It never invokes Enhanced Restic maintenance.

Restore is disabled until the operator sets `DOCKGE_ZEROBYTE_RESTORE_ROOT` on the Enhanced server to a **verified dedicated path inside the connected Zerobyte container**, normally `/restore-test` for a managed installation. Never point this setting at application data or a source/destination directory. Each request creates a random child path, with deletion disabled and overwrite set to `never`. Restores are asynchronous: confirm task completion in Zerobyte before using the restored files. External instances require the operator to verify their staging mount independently.

Keys remain server-side in `zerobyte-settings.json` (mode 0600), are not returned to the browser, and are not placed in URLs or upstream error messages. All integration endpoints use Enhanced's existing HTTP authentication policy. As elsewhere in Enhanced, using authentication-disabled mode removes that protection. Requests have time and response-size limits and refuse redirects.

## Development validation

The integration was developed against Enhanced `a99418187e3bdc17f1aa4674c031aaffc809db98` and Zerobyte tag `v0.43.2` (`cc63558bd3329209687dd546ea4b1ec02cf6ff7c`). Use only isolated fixture directories and repositories when testing backup, retention and restore. Production rollout is not implied by development validation.

UI text is provided in the five reference languages: English, French, German, Spanish and Simplified Chinese. Other WebUI locales use the established `fallbackLocale: "en"` mechanism for these new keys; existing translations are preserved.

Official installation examples: https://github.com/nicotsx/zerobyte/tree/v0.43.2/examples
