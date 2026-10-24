# OpenID Connect (OIDC) sign-in

Dockge-Enhanced can sign users in directly with an OpenID Connect provider such as Pocket ID, Authentik, Keycloak, Authelia or Google, without a reverse proxy in front. OIDC works **alongside** local accounts, 2FA and restricted accounts, in the `local` authentication mode (the default). It is ignored when `DOCKGE_AUTH_MODE` is `disabled` or `trusted-proxy`.

Dockge uses the Authorization Code flow with PKCE (S256), `state` and `nonce`. It validates the ID token (signature, issuer, audience, expiry, nonce). After a successful login, Dockge opens the same session as a password login, so the HTTP APIs, revocation, audit log and restricted accounts behave exactly the same way.

## Provider setup

Create an OIDC client (application) at your provider:

- **Redirect URI / callback URL**: `https://dockge.example.com/api/auth/oidc/callback`
- **Client type**: confidential (with a client secret) or public (PKCE only). Both work.
- **Scopes**: `openid profile email`. Add `groups` if you use `DOCKGE_OIDC_ADMIN_GROUPS` and your provider needs it (Pocket ID, Authentik).

## Configuration

| Variable | Default | Description |
|---|---|---|
| `DOCKGE_OIDC_ISSUER` | *(none)* | Issuer URL. Setting it enables OIDC. Discovery uses `<issuer>/.well-known/openid-configuration` |
| `DOCKGE_OIDC_CLIENT_ID` | *(required)* | Client ID |
| `DOCKGE_OIDC_CLIENT_SECRET` | *(none)* | Client secret. Leave empty for a public client |
| `DOCKGE_OIDC_CLIENT_SECRET_FILE` | *(none)* | File containing the secret (recommended, takes precedence) |
| `DOCKGE_OIDC_REDIRECT_URI` | *(required)* | Public callback URL, ending with `/api/auth/oidc/callback` |
| `DOCKGE_OIDC_SCOPES` | `openid profile email` | Requested scopes |
| `DOCKGE_OIDC_USERNAME_CLAIM` | `preferred_username` | Claim used as the Dockge username (`email` is also common) |
| `DOCKGE_OIDC_GROUPS_CLAIM` | `groups` | Claim containing the user's groups |
| `DOCKGE_OIDC_ADMIN_USERS` | *(none)* | Comma-separated usernames that become administrators |
| `DOCKGE_OIDC_ADMIN_GROUPS` | *(none)* | Comma-separated groups whose members are administrators (see below) |
| `DOCKGE_OIDC_LINK_EXISTING` | `false` | Allow the first OIDC login to link an existing local account with the same username |
| `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN` | `false` | Hide the username/password form and refuse password logins |
| `DOCKGE_OIDC_BUTTON_LABEL` | "Sign in with SSO" (translated) | Text of the login button |
| `DOCKGE_OIDC_ALLOW_HTTP` | `false` | Allow `http://` issuer and redirect URLs. **For local tests only** |

Dockge refuses to start when the configuration is incomplete, for example a missing client ID or redirect URI, or `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN` without an issuer. The redirect URI comes only from the configuration, never from request headers. If the provider is unreachable, local login keeps working and the SSO button reports the error.

### Example: Pocket ID

```yaml
services:
  dockge:
    environment:
      - DOCKGE_OIDC_ISSUER=https://id.example.com
      - DOCKGE_OIDC_CLIENT_ID=0f6c...                     # from Pocket ID → OIDC Clients
      - DOCKGE_OIDC_CLIENT_SECRET_FILE=/run/secrets/dockge_oidc_secret
      - DOCKGE_OIDC_REDIRECT_URI=https://dockge.example.com/api/auth/oidc/callback
      - DOCKGE_OIDC_SCOPES=openid profile email groups
      - DOCKGE_OIDC_ADMIN_GROUPS=dockge-admins
      - DOCKGE_OIDC_BUTTON_LABEL=Sign in with Pocket ID
    secrets:
      - dockge_oidc_secret

secrets:
  dockge_oidc_secret:
    file: ./secrets/dockge_oidc_secret
```

For Authentik, the issuer is the application's "OpenID Configuration Issuer", for example `https://auth.example.com/application/o/dockge/`. For Keycloak, it is `https://kc.example.com/realms/<realm>`.

## Accounts and roles

- Each OIDC identity is bound to a Dockge account by the provider's stable identifier (issuer + `sub`). Renaming a user at the provider does not create a new account.
- On first login, a missing account is created as **restricted with no stack grants**: it sees nothing until an administrator grants access in **Settings → Security → Users and permissions**. Linked accounts show an **SSO** badge there.
- **Administrators** come from `DOCKGE_OIDC_ADMIN_USERS` and `DOCKGE_OIDC_ADMIN_GROUPS`:
  - When `DOCKGE_OIDC_ADMIN_GROUPS` is set, group membership is the source of truth at every login: joining the group grants administrator rights, and leaving it turns the account back into a restricted account. The account keeps its stack grants. Open sessions are reconnected with the new role.
  - With only `DOCKGE_OIDC_ADMIN_USERS`, listed users are promoted and nobody is ever demoted.
- **There is no implicit "first user becomes admin" rule.** On a new installation, create the first administrator with the setup page or `DOCKGE_BOOTSTRAP_*`, or configure an admin mapping. Otherwise, the first OIDC login is refused with an explanation, so that a restricted-only installation cannot lock you out.
- **Existing local accounts** are not linked by default: an OIDC user whose username matches a local account is refused. Set `DOCKGE_OIDC_LINK_EXISTING=true` to link them on first login. When the username claim is `email`, linking also requires `email_verified` to be true. This prevents an IdP user who can choose their own username or email from taking over a local administrator.
- Disabling an account in Dockge blocks its OIDC login too.

## 2FA

OIDC logins do not ask for the local TOTP code: multi-factor authentication is the provider's job. Local 2FA still applies to password logins of the same account.

## Disabling local login

With `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN=true`, the login page only shows the SSO button and the server refuses password logins. Existing sessions, federation tokens between instances and the initial setup page keep working.

**Recovery:** if the provider becomes unavailable, remove `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN` and restart the container to sign in with a local administrator account.

## Not included yet

- Mapping groups to per-stack grants (only the administrator role is mapped).
- Signing out at the provider (RP-initiated logout): **Logout** closes the Dockge session only.
- Configuration from the Settings UI: OIDC is configured with environment variables.
