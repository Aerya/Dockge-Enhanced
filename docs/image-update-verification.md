# Verified image updates

[English](image-update-verification.md) · [Français](image-update-verification.fr.md) · [Deutsch](image-update-verification.de.md) · [Español](image-update-verification.es.md) · [简体中文](image-update-verification.zh-CN.md)

> Proposed change in this branch; not yet published.

ImageWatcher recovers images whose local tag disappeared, verifies every targeted replica after Compose and reports mismatches as failures. Unverifiable updates do not advance the date. Downloaded images remain protected from cleanup for 24 hours after an interrupted or unverified attempt.

The expected immutable image ID is captured after pulling, before recreation. Each ordinary targeted service must retain its replica count; every replica must be running, not unhealthy, and use that ID. Services sharing a network namespace are included. Rolling services retain their own health and draining checks; pending retirement remains explicitly unverified and does not advance the date.

A missing local tag is resolved through the image of the running container. Registry or inspection errors remain unknown, never up to date. A confirmed mismatch is a failure; an unavailable verification is shown as unverified. Neither outcome is counted as a successful update or advances lastUpdated.

Cleanup and image updates exclude one another. Before pulling, Enhanced persists a protection for the target reference, then records its downloaded image ID. An interrupted or unverified update keeps this protection for 24 hours, including after restart. Verified completion releases only that update’s protection. The grace period starts at the attempt/download time, not the image build date; normal unused-image cleanup can apply after expiry.

The stack date is labelled “Last operation” with an explanatory tooltip. It describes an operation affecting the stack, possibly a single service, and is not a guarantee that all services are current. Per-image results remain available in Watcher history. Pauses, ignored images, maintenance windows and rollback remain respected.

## Compose file selection

For native stacks, Docker Compose discovers its standard files and overrides itself, including `COMPOSE_FILE` set in the process or `.env`. An explicit list replaces discovery: files are merged in their declared order and no default override is appended. Shared `global.env` is loaded before the local `.env`; external projects retain their registered environment files without inheriting it. Rolling updates preserve this chain before appending their temporary file and refuse to continue if the resolved model differs. Apply the update on each linked instance that executes these operations.

[Docker Compose: merge](https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/) · [Docker Compose: environment](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)
