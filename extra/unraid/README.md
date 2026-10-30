[English](README.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [中文](README.zh-CN.md)

# Dockge-Enhanced on Unraid — test edition

This is an experimental installation package, not certified Unraid support. It uses the normal Enhanced application without runtime modifications. No Community Applications listing has been submitted.

## Install

1. Wait for the **Image de test Unraid** workflow on branch `test/unraid` to succeed. The image is `ghcr.io/aerya/dockge-enhanced:test-unraid`; publication never changes `latest`. An immutable `test-unraid-<commit>` tag is also published.
2. Download [the XML template](dockge-enhanced.xml) from that branch. Copy it into `/boot/config/plugins/dockerMan/templates-user/my-dockge-enhanced-unraid-test.xml`, then select it through Docker → Add Container. This manual template is not a CA store installation.
3. Review every mount and choose a free host port (default 5055). Use NEW data and stacks directories, never existing production directories. The default root is `/mnt/user/appdata/dockge-enhanced-unraid-test`.
4. Keep the stacks host path, container path and `DOCKGE_STACKS_DIR` identical. If using a specific pool path instead of `/mnt/user`, change all three together. Relative application bind mounts resolve on the Docker host.
5. Open the WebUI, create an administrator, and use disposable test stacks. Keep Enhanced self-updates in manual mode; do not launch an internal self-update. Update this test container through Unraid using its test tag.
6. Leave automatic image updates, cleanup, host monitoring and linked instances unconfigured during initial tests. Do not import production settings.

Docker Compose is included in the image: the Unraid Compose plugin is not required for Enhanced to execute Compose. Do not let Compose Manager and Enhanced manage the same stack.

## Permissions and isolation

Enhanced currently runs as root inside its container and needs writable data/stacks directories. `PUID`/`PGID` are not supported by Enhanced; do not add them expecting an ownership change. Individual applications may support their own UID/GID settings.

Do not use blanket `chmod 777`, recursive `chown`, or disable user namespace remapping. Inspect ownership, ACLs, parent-directory traversal and actual error messages first. Root inside a remapped container is not necessarily host root. Test creating/saving a Compose, restarting Enhanced and preserving the login/database. An unwritable directory or read-only SQLite error is a failed test, not a reason to relax host security.

The template is **not privileged**, but its Docker socket gives control over **all host containers and volumes**. Separate folders do not provide Docker isolation. Prefer a disposable Unraid server; never run host-wide cleanup on a production host. Do not expose the WebUI directly to the Internet.

## Required tester checks

Record Unraid version, Docker version, storage pool/path, network driver and image commit. Back up important data independently before host-level tests.

- Install; create/edit/save/deploy a disposable stack; restart Enhanced and verify settings persist.
- Preserve inline configuration permissions such as `mode: 0777` across edit/save; inspect the resulting file and actual application permissions.
- Reboot and stop/start the array; verify mounts are ready before startup. Test a healthy VPN dependency and `network_mode: service:...`. Compose dependency ordering applies to Compose operations, not arbitrary individual container starts by the host. Do not assume `restart: unless-stopped` solves dependency ordering.
- Check backup-plugin stop/start behaviour without two managers racing over a stack.
- Test bridge and external networks (including br0 where appropriate), multiple networks and published links. A network ID in inspect is not by itself a connectivity failure.
- Update the test image through Unraid, then verify settings and stacks. Internal sidecar self-update is **not validated on Unraid**.

No real Unraid reboot, array, backup-plugin or custom-network validation has been performed here. The CI checks template consistency, builds AMD64/ARM64, scans with strict Trivy, tests native modules and HTTP startup on Linux runners. That does not replace these Unraid checks.

## Remove and report

Remove only the test stacks/containers created for this evaluation, then the test Enhanced container. Delete its dedicated directories only after confirming they contain no wanted data. Never use a global Docker prune. Share logs with secrets removed and exact reproduction steps in [Enhanced issues](https://github.com/Aerya/Dockge-Enhanced/issues).

## Credits and background

Template adapted from [alex3305/unraid-docker-templates](https://github.com/alex3305/unraid-docker-templates/blob/main/dockge.xml). Background: [Dockge discussion 238](https://github.com/louislam/dockge/discussions/238), issues [911](https://github.com/louislam/dockge/issues/911), [906](https://github.com/louislam/dockge/issues/906), [455](https://github.com/louislam/dockge/issues/455), [290](https://github.com/louislam/dockge/issues/290). These reports are test cases, not claims that Enhanced reproduces or fixes all of them.
