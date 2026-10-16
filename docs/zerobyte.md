# Zerobyte (optional)

In **Backups**, turn on **Zerobyte (optional)**. OFF collapses the whole section and preserves its configuration, credentials, containers and backup data. Native Enhanced Restic retains its existing coverage, repositories and retention: **no automatic exclusion or migration** is performed.

## Existing instance

Enter the HTTP(S) origin reachable **from the Enhanced server**, and an API key generated in Zerobyte settings. Credentials, query parameters and paths in the URL are refused. Save, then test the connection. Enhanced does not manage Docker resources of an external instance. The linked-instance summary is read-only; protected stack hooks are available for managed workflows as described below.

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

Managed restore automatically verifies `/restore-test`; external restore requires a **verified dedicated root explicitly approved for that URL and API key**, as described below. Never point this setting at application data or a source/destination directory. Each request creates a random child path, with deletion disabled and overwrite set to `never`. Restores are asynchronous: confirm task completion in Zerobyte before using the restored files. External instances require the operator to verify their staging mount independently.

Keys remain server-side in `zerobyte-settings.json` (mode 0600), are not returned to the browser, and are not placed in URLs or upstream error messages. UI and management endpoints use Enhanced's existing HTTP authentication policy; the narrow pre/post callback endpoints require their per-workflow secret instead. As elsewhere in Enhanced, using authentication-disabled mode removes that protection. Requests have time and response-size limits and refuse redirects.

## Development validation

The integration was developed against Enhanced `a99418187e3bdc17f1aa4674c031aaffc809db98` and Zerobyte tag `v0.43.2` (`cc63558bd3329209687dd546ea4b1ec02cf6ff7c`). Use only isolated fixture directories and repositories when testing backup, retention and restore. Production rollout is not implied by development validation.

UI text is provided in the five reference languages: English, French, German, Spanish and Simplified Chinese. Other WebUI locales use the established `fallbackLocale: "en"` mechanism for these new keys; existing translations are preserved.

Official installation examples: https://github.com/nicotsx/zerobyte/tree/v0.43.2/examples

## Protected workflow assistant

The managed installation now offers **Protected backup assistant**: choose one mounted source, one destination, a name, cron expression and a deadline (1–120 minutes). Review the exact plan, then confirm. It creates or reuses a Directory source, a dedicated Local repository and a disabled job through Zerobyte's actual API. Zerobyte adds its own repository ID beneath the displayed repository parent. Persistent ownership records make retries idempotent; conflicting existing resources are refused and never deleted. Reusing a plan does not silently change its policies. Use a new plan name for different stop policies or deadlines.

Jobs provisioned this way receive official pre/post HTTP webhooks with a per-workflow server-side secret. These apply equally to manual and scheduled runs. The generated Compose allowlist permits only the owning Enhanced callback origin. Preserve its `enhanced-<owner>` DNS alias and shared network when replacing Enhanced; reapplying the installer repairs its callback alias.

Before stopping applications, the pre-hook checks host mount availability and filesystem identity, then performs a bounded write/fsync/delete probe inside the mounted destination. During the backup, a watchdog checks periodically. On lost storage or deadline expiry, Enhanced requests cancellation, restarts only services that were originally running and records a persistent failure. It never substitutes a local directory. A separately configured local backup plan is the explicit alternative; there is no hidden fallback or later automatic transfer.

Interrupted workflows remain paused until explicit acknowledgement verifies the remote task is terminal. A cancellation request alone is not proof that the remote process has stopped: do not trust a snapshot from the interrupted run without checking it. The UI refreshes workflow status while open; failures also use the configured backup Discord/Apprise destinations when available. Notification delivery itself is not guaranteed.

Optional stack stops are limited to managed Compose files under this Enhanced instance's stack directory, with Docker label ownership checks. Enhanced and Zerobyte cannot be stopped by these hooks. The running-service list is journaled before stopping; failed preparation, backup failure, lost post-hooks and Enhanced restarts can recover it. Failed service restarts retain the journal and block native backup/restore rather than silently claiming recovery. Native Restic settings, exclusions and retention remain unchanged; only an in-process gate prevents native operations racing application stops. This does not prevent an operator from changing containers independently, nor guarantee recovery if Docker or the host itself is unavailable.

Jobs created directly in Zerobyte or with the advanced job form have no Enhanced workflow hooks unless explicitly provisioned through this assistant. They are labelled accordingly. Their native scheduling and network behavior remain Zerobyte's responsibility. The protected assistant creates jobs without automatic retention; manual retention still requires confirmation. If an operator later adds a retention policy directly in Zerobyte, Zerobyte's native automatic maintenance applies; Enhanced does not intercept third-party configuration changes.

## External connections and federation

External configuration now has an explicit warning and acknowledgement tied to the URL **and API key**. Changing either revokes it. Read-only status/connection tests remain available; mutations require acknowledgement when the connection is not the verified owned managed API origin. External restore is disabled until a dedicated root is explicitly saved; the former global environment variable does not enable it. Known logical sources and local repository paths are checked for lexical overlap at restore time, but Enhanced cannot prove the external filesystem layout, symlink resolution or physical separation. Managed restore instead verifies its dedicated owned writable Docker volume automatically and refuses volume aliases with other mounts.

The linked-instance view aggregates read-only allowlisted counts using the existing authenticated federation transport. It never transfers Zerobyte keys and distinguishes disabled integration, unreachable Zerobyte and offline/incompatible peers. Remote operations stay on their owning instances. No live production peer is used for development validation.

### Diagnostics and existing-job migration

External diagnostics only read the API: configuration, inventory, known-path separation and repositories shared across jobs. Physical mounts, symlinks, remote identity, actual permissions and an independent restore drill remain explicit operator checks. Passing API checks never certifies those properties.

Disable an existing job in Zerobyte, wait for tasks to finish, then select stacks and deadline in the wizard. Preview and confirm its migration. Only hooks and automatic retry count change; source, repository, snapshots, schedule, filters and retention remain, and the job stays disabled. Existing custom hooks and repositories shared across jobs are refused. After an uncertain API response, keep the job disabled and retry the same plan to verify migration.

Application recovery is shown separately from backup outcome. If Docker cannot restart services, the journal remains and recovery retries. Check Docker and the named stacks; recovered applications do not imply a successful backup. The journal is synced to disk before each stop.

### Failure drills

Use dedicated fictitious shares and stacks. First verify backup and restore contents. Inject TCP loss, a stopped server, revoked permissions, a read-only share and exhausted space separately; verify admission refusal and persistent alerts. Also disconnect storage during an execution and check cancellation, actual task termination and recovery of originally running services only.

Use a Docker socket relay dedicated to the test instance for Docker outages, rather than stopping a production-shared daemon. Abruptly restarting test containers exercises persistent recovery but is not a physical host power-loss test. Exercise federation using isolated instances, authentication rejection and an older version.

Storage checks use stable probe names and a local per-destination lock to bound probes blocked in hard NFS syscalls. An Enhanced timeout cannot forcibly interrupt an uninterruptible kernel operation; restoring the server may still be necessary. Repeated workflow alerts notify at most once every five minutes. After federation authentication rejection, explicitly reauthenticate the agent; reactivating the remote account alone does not restart the transport stopped for security.

### Job integrity and manual application recovery

Enhanced checks registered jobs before its manual launch and inside the pre-hook, plus roughly every minute while no application backup is active. Callback URLs/authentication, source, repository and retries must match the workflow. Missing, changed or unverifiable protection blocks launch from Enhanced; an immediate verification action is available after correction. Hooks are never silently replaced. Removing all hooks and launching directly in Zerobyte bypasses interception; keep monitoring and hooks enabled.

Failed recovery lists journaled stacks and services. Manual retry only restarts those services after remote task termination; it never starts another backup or marks an interrupted backup successful.

### Explicit storage revalidation

Disable all jobs, finish tasks and physically verify the server, share and repository separation. Preview fingerprint changes, attest the check and confirm. Consent is bound to the exact plan revision; changes require another preview.

When the filesystem guard stops Zerobyte (31), Enhanced can read its verified dedicated Docker data volume database without writes. All jobs must remain disabled and tasks terminal. After stopping the process, Enhanced rechecks inventory and mounts before replacing the guard. Previous Compose/metadata files remain in private `.pre-revalidation` copies. Only Zerobyte is redeployed; a declared remote destination cannot become a local fallback.

Federation distinguishes known authentication rejection, disconnected peers, incompatible responses and timeouts. A timeout alone does not establish an old version: check connectivity and compatibility. See [repeatable laboratory drills](../extra/zerobyte-lab/README.md).
