# Recover a blocked self-update

[en](self-update-recovery.md) · [fr](self-update-recovery.fr.md) · [de](self-update-recovery.de.md) · [es](self-update-recovery.es.md) · [zh-CN](self-update-recovery.zh-CN.md)

This guide only covers “Duplicate mount point” when launching the sidecar. Fix #607 is published in the official `:latest` image. The old version cannot install it itself. I apologise for this regression.

## Before running commands

Use the Docker host terminal, not a terminal inside Enhanced. Keep a recent data backup. Do not run `down -v`, pruning or data deletion. Only Enhanced will be briefly interrupted; do not recreate other services.

## Identify your installation

Replace `ENHANCED_CONTAINER` with the actual container name. These commands only read Compose metadata:

```bash
docker inspect ENHANCED_CONTAINER --format '{{index .Config.Labels "com.docker.compose.project"}}'
docker inspect ENHANCED_CONTAINER --format '{{index .Config.Labels "com.docker.compose.service"}}'
docker inspect ENHANCED_CONTAINER --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'
docker inspect ENHANCED_CONTAINER --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}'
```

Preserve the project name, service, working directory and ALL listed Compose/override files, in order. Keep your usual `--env-file` options and profiles too. Do not publish configuration or secrets.

## Update a Compose installation

In the identified working directory, create a durable `recovery-image.yaml` containing the following. Replace `SERVICE` with the Enhanced service name, not its container name:

```yaml
services:
  SERVICE:
    image: ghcr.io/aerya/dockge-enhanced:latest
```

In EVERY command below, replace `PROJECT`, `BASE_COMPOSE` and `SERVICE`. Between the base file and `recovery-image.yaml`, add a `-f` for EVERY existing override, in its original order. The recovery file must be last: it overrides only the image, even if an old override pins a digest. Stop if a file is missing or you cannot identify the correct files.

```bash
docker compose -p PROJECT -f BASE_COMPOSE -f recovery-image.yaml config --images
```

Check that the image list contains `ghcr.io/aerya/dockge-enhanced:latest`. Then:

```bash
docker compose -p PROJECT -f BASE_COMPOSE -f recovery-image.yaml pull SERVICE
docker compose -p PROJECT -f BASE_COMPOSE -f recovery-image.yaml up -d --no-deps SERVICE
```

Do not delete `recovery-image.yaml` afterwards: Docker records its path in Compose metadata and future operations may read it. Preserve existing overrides; never remove them blindly. After checking the interface and health, future updates will use the corrected mechanism.

## Other installations and support

Without Compose metadata (for example an Unraid template or another management tool), update through the original tool using the official `:latest` image, retaining all settings, ports, networks and mounts. Do not apply these Compose commands to a non-Compose installation. If needed, open an issue with the error and installation method, without secrets. Custom images must include #607; they are not automatically covered by this alert’s targeting.

