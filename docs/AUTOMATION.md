# REST API, webhooks and automation

Everything on this page is optional. No token or webhook is created until an administrator requests one under **Settings → Automation**.

## Security model

- A secret is displayed only once. Dockge Enhanced stores only its SHA-256 hash.
- Each token independently limits permissions, allowed stacks and, optionally, its expiry.
- Each webhook targets one stack and a closed action list. It can be disabled or rotated at any time.
- API tokens are limited to 60 requests per minute; webhook limits are configurable from 1 to 60.
- Stack API responses contain no `compose.yaml`, `.env` or note.
- Every action is written to the audit log with its origin, actor, duration and bounded output.

Keep tokens and webhook URLs in a secret manager. Protect `/api/*` with HTTPS and never put a secret in a repository, log or screenshot.

## REST API

Tokens support either `Authorization: Bearer <TOKEN>` or `X-API-Key: <TOKEN>`.

```bash
export DOCKGE_URL="https://dockge.example.com"
export DOCKGE_TOKEN="dge_..."

curl -fsS \
  -H "Authorization: Bearer ${DOCKGE_TOKEN}" \
  "${DOCKGE_URL}/api/v1/stacks"
```

| Method | Endpoint | Permission |
| --- | --- | --- |
| `GET` | `/api/v1/stacks` | `stack:read` |
| `GET` | `/api/v1/stacks/:name` | `stack:read` |
| `POST` | `/api/v1/stacks/:name/actions/:action` | `stack:<action>` |
| `GET` | `/api/v1/history?stack=:name&limit=100&offset=0` | `history:read` |

Available actions: `start`, `stop`, `restart`, `update`, `recreate`, `pull-recreate`, `build-recreate` and `backup`.

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer ${DOCKGE_TOKEN}" \
  "${DOCKGE_URL}/api/v1/stacks/immich/actions/restart"
```

`build-recreate` rejects stacks without a Compose `build` directive. `backup` creates a stack-scoped backup of Compose, `.env` and metadata files through the destinations already configured in Dockge Enhanced.

## Webhooks

The UI shows the complete URL after creation or rotation:

```text
POST https://dockge.example.com/api/webhooks/dwh_<id>_<secret>/<action>
```

The URL secret authenticates the call; no additional header is required.

```bash
curl -fsS -X POST \
  "https://dockge.example.com/api/webhooks/dwh_1_SECRET/restart"
```

Rotating a URL immediately invalidates the old one. A disabled, expired, rate-limited or unauthorized-action webhook returns the corresponding authentication, rate-limit or authorization error.

## Home Assistant

Example using a webhook limited to `start`, `stop` and `restart` for the `immich` stack:

```yaml
rest_command:
  dockge_immich_restart:
    url: !secret dockge_immich_restart_webhook
    method: POST
    timeout: 120
```

In `secrets.yaml`:

```yaml
dockge_immich_restart_webhook: "https://dockge.example.com/api/webhooks/dwh_1_SECRET/restart"
```

Example button:

```yaml
button:
  - platform: template
    name: Restart Immich
    press:
      - action: rest_command.dockge_immich_restart
```

## Additional tools

- **Build + Recreate** appears only when at least one service has a `build` directive. It runs `docker compose build --pull` for those services, then `docker compose up -d --remove-orphans`.
- **Stack notes** live in `.dockge-meta.json`, are limited to 10,000 characters and are included in backups. Do not store secrets in them.
- The **Git** panel is manual, collapsed by default and local-stack only. It rejects credentials embedded in URLs, excludes sensitive files, creates commits as the technical identity `Dockge Enhanced <dockge-enhanced@localhost>`, enforces `pull --ff-only`, requires a clean tree before restore and validates Compose afterwards.
- **Docker networks** support `bridge`, `macvlan` and `ipvlan`. Delete and connection operations require confirmation; `bridge`, `host` and `none` are protected. Docker Swarm and `overlay` are deliberately excluded.
- Dockge Enhanced version checking remains informational: this API never triggers an automatic application update.
