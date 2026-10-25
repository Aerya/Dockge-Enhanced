# Updates without service interruption

[English](service-rollout.md) · [Français](service-rollout.fr.md) · [Deutsch](service-rollout.de.md) · [Español](service-rollout.es.md) · [简体中文](service-rollout.zh-CN.md)

## Deployment

Choose native Traefik when the existing Docker discovery and draining prerequisites are met. Otherwise, in the service editor, enter its **internal TCP port** and choose **Prepare an optional relay**. Review the draft before saving and deploying: the published port and Traefik/PlugNPiN labels move to a separate relay service. Initial deployment can interrupt traffic. Keep the existing proxy destination when it uses that host IP and published port; if it uses the application service name, explicitly change it to the relay service name.

The relay uses Nginx stream without TLS termination or an administration API. HTTP, TLS and WebSocket can pass over TCP; UDP/QUIC is unsupported. It does not require NPM, Caddy or HAProxy API credentials. This is protocol compatibility, not certification of every product/version. Native integration currently targets Traefik. The relay gets a persistent configuration volume and a dedicated network/alias; never manually remove these while it is used. Back up this configuration with the stack.

## Recovery and limits

Healthchecks and additional CPU/RAM capacity are required. Fixed container names, shared writable volumes and namespace consumers remain incompatible. The draft assistant refuses ambiguous port variables/ranges, profiles and extends rather than guessing. Existing CPU/RAM limits remain unchanged. Connections see the relay IP; applications requiring the original client IP need a separately reviewed trusted-proxy configuration.

During application updates the relay is not recreated. New traffic switches only to healthy replacements. Connections lasting beyond the foreground waiting period remain open, and old containers are retired automatically once the old worker generations finish. New traffic does not switch back merely because a connection is long-lived. Restarting the relay itself, Recreate and explicit rollback remain disruptive.

Update both ends of linked instances. A restricted account needs update permissions for the application **and its relay**. Opening the editor changes nothing; preparing a relay changes only the draft. Disabling updates without service interruption does not dismantle the relay or move ports back: review that migration explicitly. No production proxy configuration is modified automatically.

Update without service interruptions add no auxiliary Compose file or temporary label; a later unchanged Deploy preserves the container. The operation journal is saved atomically before Docker mutations. After interruption, a pre-commit transaction is cancelled; a committed transaction resumes retirement of the recorded old IDs only. Identity and health are rechecked before removal; a failed replacement can return traffic to the recorded healthy previous generation. Pending stack mutations are blocked, while idle draining releases the global update reservation. Intentionally drained old replicas do not trigger auto-healing. The journal belongs in Enhanced persistent data and backups; do not delete it to clear a pending operation. Changed identities or unhealthy surviving replicas suspend destructive recovery and show an attention state. The update history records that retirement was deferred at the time of application; the current state is shown on the service. At relay startup an invalid persisted route is replaced by its validated Compose bootstrap; valid routes are preserved.

[Wowu/docker-rollout](https://github.com/Wowu/docker-rollout) · [Dockge #170](https://github.com/louislam/dockge/pull/170) · [Nginx](https://nginx.org/en/docs/control.html)
