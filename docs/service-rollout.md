# Docker rollout

[English](service-rollout.md) · [Français](service-rollout.fr.md) · [Deutsch](service-rollout.de.md) · [Español](service-rollout.es.md) · [简体中文](service-rollout.zh-CN.md)

## Deployment

Choose native Traefik when the existing Docker discovery and draining prerequisites are met. Otherwise, in the service editor, enter its **internal TCP port** and choose **Prepare an optional relay**. Review the draft before saving and deploying: the published port and Traefik/PlugNPiN labels move to a separate relay service. Initial deployment can interrupt traffic. Keep the existing proxy destination when it uses that host IP and published port; if it uses the application service name, explicitly change it to the relay service name.

The relay uses Nginx stream without TLS termination or an administration API. HTTP, TLS and WebSocket can pass over TCP; UDP/QUIC is unsupported. It does not require NPM, Caddy or HAProxy API credentials. This is protocol compatibility, not certification of every product/version. Native integration currently targets Traefik. The relay gets a persistent configuration volume and a dedicated network/alias; never manually remove these while it is used. Back up this configuration with the stack.

## Recovery and limits

Healthchecks and additional CPU/RAM capacity are required. Fixed container names, shared writable volumes and namespace consumers remain incompatible. The draft assistant refuses ambiguous port variables/ranges, profiles and extends rather than guessing. Existing CPU/RAM limits remain unchanged. Connections see the relay IP; applications requiring the original client IP need a separately reviewed trusted-proxy configuration.

During application updates, the relay is not recreated. New connections switch only after healthy replacements are ready. Existing connections can finish on the previous generation. After approximately two minutes of draining, persistent connections produce an incomplete operation: containers are retained, and routing is restored to the old healthy replicas when possible. Inspect and reconcile those replicas before retrying; do not remove a container still serving clients. Restarting the relay itself, Recreate and rollback are not zero-downtime operations.

Update both ends of linked instances. A restricted account needs update permissions for the application **and its relay**. Opening the editor changes nothing; preparing a relay changes only the draft. Disabling rolling updates does not dismantle the relay or move ports back: review that migration explicitly. No production proxy configuration is modified automatically.

Rolling updates no longer add an auxiliary Compose file or a temporary label: an unchanged later Deploy preserves the container. At relay startup, if the persisted configuration is invalid (for example after down/up removed the old container names), the validated Compose bootstrap configuration replaces it. A still-valid configuration is preserved. This fixes the restart loop caused by a vanished name, but is not yet complete automatic reconciliation of an interrupted operation. Concurrent Enhanced actions on the same stack directory are rejected during the operation; intentionally drained old replicas do not trigger auto-healing during that drain.

[Wowu/docker-rollout](https://github.com/Wowu/docker-rollout) · [Dockge #170](https://github.com/louislam/dockge/pull/170) · [Nginx](https://nginx.org/en/docs/control.html)
