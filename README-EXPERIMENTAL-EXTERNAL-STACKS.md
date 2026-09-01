# Experimental external Compose stacks

This branch is experimental and is looking for testers with varied Docker layouts.

It can discover and explicitly register Compose stacks that already live outside `DOCKGE_STACKS_DIR`, for example under `/home/docker`, `/srv/apps`, or `/var/www`. Discovery and import never move, delete, copy, or migrate Compose files, containers, volumes, or data. Once you deliberately manage an imported stack from Dockge-Enhanced, normal stack actions naturally apply to that stack.

Discovery and integration are local to the Docker host running the current Dockge-Enhanced instance. This page does not scan linked agents: open the WebUI of each agent to integrate stacks located on that host.

Back up important configuration before testing.

## Host discovery and allowlist

Run the read-only helper **on the Docker host** (it requires `docker` and `jq`):

```bash
bash extra/discover-external-stacks.sh
```

It proposes a small set of useful parent roots, leaves media/download paths unchecked by default, and prints the Compose changes to make afterwards. It never selects `/` and never changes Docker.

Mount only the roots you selected into Dockge-Enhanced and set the same canonical paths in `DOCKGE_EXTERNAL_STACKS_ALLOWED_PATHS`:

```yaml
services:
  dockge:
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /home/docker:/home/docker
    environment:
      DOCKGE_EXTERNAL_STACKS_ALLOWED_PATHS: /home/docker
```

The backend resolves each path with `realpath` and refuses traversal, symlinks escaping an allowed root, relative paths, and every path outside this allowlist.

## Experimental image

Build this branch yourself:

```bash
docker build -t ghcr.io/aerya/dockge-enhanced:experimental-external-stacks .
```

Or pull the branch image after its GitHub workflow has published it:

```bash
docker pull ghcr.io/aerya/dockge-enhanced:experimental-external-stacks
```

Open **External stacks** in the WebUI and select **Scan**. The counters distinguish Compose files that are accessible, visible but not authorized, or not visible from the Dockge-Enhanced container. Each stack that cannot yet be integrated shows the bind mount and/or allowed path to add. Once the Compose file is accessible and authorized, select **Integrate**. Report bugs at [GitHub issues](https://github.com/Aerya/Dockge-Enhanced/issues) with Docker/Compose versions, relevant labels and sanitized paths. Never include `.env` files, passwords, tokens, or private registry credentials.

For a stack whose path is unavailable, **Add automatically** can update the active Dockge-Enhanced Compose configuration. A one-shot helper accepts only a short-lived signed plan for the current Dockge-Enhanced container: it backs up the Compose files, adds the exact host bind and allowlist entry, validates `docker compose config`, recreates only the Dockge-Enhanced service, and waits for application readiness. If validation or readiness fails, it restores the exact backup and recreates the previous service. The helper has no port or general container-management API, a read-only root filesystem, only the two filesystem capabilities needed to preserve ownership while replacing the Compose file, and refuses another container, project, expired plan, filesystem root, or interpolated allowlist. In these unsupported cases, edit the Compose configuration manually.

## Restic backups

Once registered, an external stack is available in the existing Restic stack settings. Its verified Compose file and optional `.env` are included in global and targeted backups, and its original Compose project name is retained for stop or application-hook consistency policies. Snapshot browsing, file inspection and restore tests also recognize these external configuration files.

Integrated external stacks are also included in ImageWatcher checks and image update policies. Pull, recreate and rollback operations retain the original Compose project name so that Dockge-Enhanced updates the existing project instead of creating a second one.

Persistent data keeps the same opt-in behavior as regular stacks: select the relevant bind-mounted path or volume in the Restic settings when its contents must also be backed up. Registering an external stack never silently adds all of its data mounts to a backup.
