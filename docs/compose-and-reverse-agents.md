# Compose templates, links and agents

[English](compose-and-reverse-agents.md) · [Français](compose-and-reverse-agents.fr.md)

## Named links

The URL editor accepts an optional label. Existing plain links remain valid and can be mixed with objects:

```yaml
x-dockge:
  urls:
    - https://example.org
    - url: https://example.org/admin
      label: Administration
```

Compose variables are resolved as before. Only valid HTTP/HTTPS links are rendered as clickable. An empty label shows the address; extra fields of an object are preserved by the editor.

## .env template

In **Settings → General**, configure the **Default Compose template** and the **Default .env template**. They are copied into new stacks only. An empty `.env` is allowed. Imports and fields already edited are not replaced if the settings arrive after you started typing. The values are not applied to existing stacks and do not replace `global.env`.

Example of shared values: `TZ=Europe/Paris`, `PUID=1000`, `PGID=1000`. Avoid reusable secrets in this general template.

## Agent tags

In the linked-instance list, open **Agent tags**. Enter up to 20 tags of 40 characters, separated by commas. They are normalized to lowercase, deduplicated and saved on the instance where you edit them, as a local organization of the dashboard. The tag filter of the stack list combines with the instance filter. It never triggers a bulk deployment.

## Reverse connection and automatic attachment

This mode is for hosts behind NAT/CGNAT that can reach a central server but cannot receive an incoming connection from it. It is optional. The direct mesh remains available and keeps working the same way.

1. On the central server (hub), open **Add a reverse agent** and create a node token. Optionally give it a name; otherwise the hostname sent by the node is used.
2. Copy the token while it is displayed: it is shown only once. The server keeps only its SHA-256 fingerprint and the ID of the issuing account.
3. On the node, use your existing local Enhanced administrator account: no new account is needed. On a fresh installation only, create that account first. This mode uses local authentication; a node configured exclusively in trusted-proxy mode is not supported. 2FA can stay enabled: the internal bridge uses a federation identity without disabling the protection of interactive sign-ins.
4. Add the following variables to the existing Enhanced service in Dockge, then recreate that service:

```yaml
environment:
  DOCKGE_REVERSE_HUB_URL: https://dockge.example.org
  DOCKGE_REVERSE_TOKEN_FILE: /run/secrets/dockge_reverse_token
secrets:
  - dockge_reverse_token
```

At the root level of the Compose file:

```yaml
secrets:
  dockge_reverse_token:
    file: ./reverse-agent-token.txt
```

The file contains only the token. Protect it on the host. `DOCKGE_REVERSE_TOKEN` is also accepted; the file takes precedence when both are set. The URL must be an HTTP(S) origin without path, query parameters or credentials. Use HTTPS over the Internet. The internal bridge connects to the configured local listener; if that listener uses TLS, its certificate must be valid for that local address.

The node attaches automatically at startup. After a disconnection, it retries every 30 to 45 seconds. Closing a WebUI does not stop the transport. The hub can view the node's stacks, logs and statistics, edit Compose files and send the usual management commands through this channel. The node does not get an administrator session on the hub: its token only allows it to publish its events and receive the commands addressed to it.

**Revocation:** deleting the agent on the hub closes the connection and invalidates its token. To replace a lost token, delete the old entry and create a new one. Disabling or deleting the issuing account also revokes its tokens, and active connections are revalidated every 30 seconds. A token is meant for a single node; do not share it between machines.

**Scope:** reverse agents belong to the hub that registered them; they are not propagated in the full mesh. They do not expose a direct link to their WebUI. Copies, migrations and data replicas between servers still require directly reachable federation. Automatic attachment does not create the node's initial account and does not provision Docker or the machine.
