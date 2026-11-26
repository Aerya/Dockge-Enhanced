# Per-stack secret managers

English · [Français](stack-secrets.fr.md) · [Deutsch](stack-secrets.de.md) · [Español](stack-secrets.es.md) · [简体中文](stack-secrets.zh-CN.md)

Connect a stack to Bitwarden Secrets Manager, 1Password, Doppler or Infisical to retrieve secrets for Compose operations without copying them into its `.env` file.
Bitwarden fix: the temporary profile uses the TOML format expected by the official CLI, restoring secret retrieval.

**Bitwarden Secrets Manager is fully functional. 1Password, Doppler and Infisical remain experimental, subject to user testing.** A successful connection test confirms retrieval, not application functionality.

## Setup

1. Open **Settings → Secret managers** and select the instance hosting the stack. Add a connection using a machine account restricted to the necessary secrets.
2. For Bitwarden, read the linked license and select **Install official Bitwarden CLI**. The image does not redistribute the CLI: installation downloads official version 2.1.0, verifies SHA-256 and stores it in `data/secret-tools/bws`. Linux AMD64 and ARM64 are supported. Manual installation in `/usr/local/bin/bws` is also possible. This is **Bitwarden Secrets Manager**, not the personal password vault; Vaultwarden compatibility is not claimed.
3. Open **Secret managers** in a saved stack, choose the connection and enter its scope.
4. Save and select **Test saved access**. This does not deploy anything or display secret values.
5. Reference the variables in Compose, then deploy or recreate. Saving the setting alone does not change existing containers.

| Provider | Connection | Stack scope |
| --- | --- | --- |
| Bitwarden Secrets Manager | Machine account token and HTTPS address; US Cloud, EU Cloud or official self-hosted server | Project ID |
| 1Password | Service account token allowed to read the Environment | Environment ID |
| Doppler | Read-only service token | Project and config; optional when already scoped by the token |
| Infisical | HTTPS address, machine identity Client ID and Client Secret using Universal Auth | Project, environment and folder; selected folder only, without imports or recursion |

Prefer required variables:

```yaml
services:
  app:
    image: your-image
    environment:
      DISCORD_TOKEN: ${DISCORD_TOKEN:?required}
```

Retrieved values take precedence for Compose interpolation. Literal `environment:` values remain explicit and are not replaced automatically. Pass-through variables such as `DISCORD_TOKEN:` also work; variables still unresolved after `compose config` block create, start, restart and build operations. Use an explicit default such as `${OPTIONAL_VALUE:-}` for optional variables.

## Execution and limits

- UI actions, automated operations and rollbacks use the stack connection on its own instance. Update linked instances too. Rollback reads current provider secrets; it does not restore their previous versions.
- Provider failure blocks the command, without silently falling back to an empty environment. Values are reused in memory within an operation; Dockge's global environment is never modified.
- Container status is read directly from Docker, without Compose interpolation or provider access. Other Compose commands may require the provider.
- Protected Compose command output and resolved configuration previews are hidden. Migration and replication of these stacks are rejected to avoid transferring resolved secrets or deploying a target without its provider.
- Names that can reconfigure Docker, Compose or Node are rejected, including `PATH`, `DOCKER_*`, `COMPOSE_*`, `NODE_OPTIONS` and `LD_*`. Duplicate names, empty responses and invalid values are also rejected. Doppler dynamic secrets are not requested.
- Connection tokens are encrypted in `data/stack-secrets.json` using `data/stack-secrets.key`. Preserve the key and protect data-volume backups: the encrypted file and key together allow token recovery. Missing keys block access and are not automatically replaced.
- Retrieved values are not written by this integration into Compose files, `.env` or file history. Existing files, history and backups are not cleaned; remove previously stored secrets separately.
- **This is not a “zero secrets on disk” guarantee.** Docker stores environment variables in container configuration, accessible to Docker administrators. Applications can write their own logs or files. This integration does not replace file-mounted secrets where supported by the application.

## Sources

[1Password Environments](https://developer.1password.com/docs/sdks/environments/) · [Doppler Service Tokens](https://docs.doppler.com/docs/service-tokens) · [Infisical Universal Auth](https://infisical.com/docs/documentation/platform/identities/universal-auth) · [Bitwarden CLI](https://bitwarden.com/help/secrets-manager-cli/) · [Bitwarden license](https://github.com/bitwarden/sdk-sm/blob/bws-v2.1.0/LICENSE)
