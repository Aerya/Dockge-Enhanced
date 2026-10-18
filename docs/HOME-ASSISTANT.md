# Home Assistant integration

Optional custom integration, inspired by [darthrater78/dockge](https://github.com/darthrater78/dockge) and [ha-dockge](https://github.com/darthrater78/ha-dockge), adapted to Enhanced's existing scoped REST API. It does not require or reuse your WebUI password or bypass 2FA.

## Installation

Once this integration is published on the repository's default branch, add `https://github.com/Aerya/Dockge-Enhanced` as a **custom repository → Integration** in HACS, download **Dockge Enhanced**, and restart Home Assistant. This is a custom repository, not a claim of inclusion in HACS's default catalogue.

For a local development checkout, copy only `custom_components/dockge_enhanced` to Home Assistant's `/config/custom_components/dockge_enhanced`, then restart Home Assistant. No Enhanced container needs restarting.

1. In Enhanced, open **Settings → Automation** and create an API token with `stack:read`, limited to the stacks you want to expose.
2. In Home Assistant, open **Settings → Devices & services → Add integration → Dockge Enhanced**.
3. Enter the instance URL and token. HTTPS is recommended; TLS verification is never disabled. URLs containing credentials, queries or fragments are rejected. HTTP redirects are not followed with the token.
4. Leave controls disabled for monitoring only. To enable controls, additionally grant `stack:start`, `stack:stop` and `stack:restart` to the token and enable the controls checkbox during setup.

Each instance has a device and each stack a child device, with a state sensor and running binary sensor. Optional start/stop/restart buttons and a start/stop switch use Enhanced's audited API. Running is not an application healthcheck. Stopped, paused, draft, created and unknown states remain distinct in the state sensor.

One shared request every 60 seconds discovers visible stacks; unavailable instances and disappeared stacks become unavailable rather than reporting a stale running state. New stacks are discovered without restarting Home Assistant. API token expiry/revocation prompts reauthentication. Requests are bounded and actions are never automatically retried.

Add each linked Enhanced instance separately with its own scoped token: the current API is instance-local. The integration does not implicitly control linked agents through the primary instance. No purge, delete, backup, image update or self-update command is exposed.

Tokens are stored in Home Assistant's normal integration configuration. Protect Home Assistant's configuration and backups. Removing the integration does not revoke the token: revoke it in Enhanced when no longer needed.

## Compose diagnostics

The **Check Compose** stack action compares configured published ports and running image references on the selected instance. Saving or deploying from the editor performs the same advisory check. Conflicts show the other stack/container, service, port and protocol, including configured ports in stopped managed stacks and actual published ports of unmanaged running containers.

Docker Compose resolves `.env`, `global.env`, overrides and port ranges; Enhanced does not implement a second interpolation engine. An unavailable configuration is explicitly reported, not treated as conflict-free. Host-network processes and non-Docker listeners cannot be exhaustively detected. This is an advisory snapshot, not a reservation: Docker remains authoritative at deployment time.

Image drift compares reference strings (with default Docker Hub/tag normalization), not local/remote digests or available updates. A stopped service has no running reference to compare. Different replicas are displayed together, never arbitrarily selected.

**Prepare correction** changes only an explicit image scalar in the editor, preserving YAML comments and other fields. Review and save through the normal workflow, including existing backup-on-save behavior. It does not pull, recreate or restart anything. Variables, aliases, anchored scalars, external multi-file projects and diverging replicas require manual editing. When an override explicitly defines the image, that override is edited instead of the base file. Existing draft changes are retained.
