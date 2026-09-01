# Experimental external Compose stacks

This branch is experimental and is looking for testers with varied Docker layouts.

It can discover and explicitly register Compose stacks that already live outside `DOCKGE_STACKS_DIR`, for example under `/home/docker`, `/srv/apps`, or `/var/www`. Discovery and import never move, delete, copy, or migrate Compose files, containers, volumes, or data. Once you deliberately manage an imported stack from Dockge-Enhanced, normal stack actions naturally apply to that stack.

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

Open **External stacks** in the WebUI, inspect the detected project, then explicitly add an accessible Compose path. Report bugs at [GitHub issues](https://github.com/Aerya/Dockge-Enhanced/issues) with Docker/Compose versions, relevant labels and sanitized paths. Never include `.env` files, passwords, tokens, or private registry credentials.

## Restic backups

Once registered, an external stack is available in the existing Restic stack settings. Its verified Compose file and optional `.env` are included in global and targeted backups, and its original Compose project name is retained for stop or application-hook consistency policies. Snapshot browsing, file inspection and restore tests also recognize these external configuration files.

Persistent data keeps the same opt-in behavior as regular stacks: select the relevant bind-mounted path or volume in the Restic settings when its contents must also be backed up. Registering an external stack never silently adds all of its data mounts to a backup.
