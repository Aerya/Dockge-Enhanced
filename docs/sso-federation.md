# SSO-protected linked instances

[English](sso-federation.md) · [Français](sso-federation.fr.md) · [Deutsch](sso-federation.de.md) · [Español](sso-federation.es.md) · [简体中文](sso-federation.zh-CN.md)

Optional one-way connections let a local instance manage a remote server without a return connection or mesh propagation. Use an Enhanced federation token and, when required, separate proxy HTTP Basic credentials over HTTPS/WebSocket. Authentik requires an authorized service account, an app password and header authentication; Enhanced does not configure the proxy. The public SSO stays enabled. Configure the connection separately on each local instance.

## Setup
1. Update both Enhanced instances. On the remote instance, sign in through SSO as an administrator. In Home, select **Create federation token** and copy it privately.
2. In the proxy/SSO administration, create a dedicated service account, authorize it for this application and issue an app password. For Authentik, enable **Intercept header authentication** on the proxy provider and ensure the reverse proxy forwards the Authorization header to the outpost. This is an administrator operation: Enhanced does not change your proxy.
3. On the local Enhanced instance, choose **Add Agent**, enter the remote HTTPS origin (no path), select **Federation token** and paste the Enhanced token.
4. Enable **Connect from this instance only**. Enter the proxy service-account name and app password in the separate HTTP Basic fields, then connect. Leave those fields empty if no proxy authentication is required.
5. Repeat on each local instance that must manage this server. No return connection from the remote server to your private LAN is required.

## Security and operation
The proxy credentials only open the proxy gate; the Enhanced token is still mandatory in trusted-proxy mode. An endpoint header alone never authenticates an agent. Browser SSO is unchanged. HTTPS certificate verification stays enabled; proxy authentication uses WebSocket and does not follow redirects. Ensure your proxy supports WebSocket upgrades. This is not automatic support for every SSO provider.

Use dedicated trusted administrator accounts: a federation token allows administrative actions. Tokens use the existing Enhanced mechanism: disabling/deleting their issuing account invalidates them; changing its password does not. There is no individual per-token revocation interface. Remove a link on the local instance to stop its connection, and revoke the issuing account if its token leaked.

Proxy credentials are persisted in the local Enhanced database like existing agent credentials; protect its data directory and backups. They are neither returned in the agent list nor copied into the mesh. One-way entries survive mesh synchronization and cannot be overwritten by it. **Reauthenticate** replaces credentials; for a one-way connection, filling both proxy fields replaces them, leaving both empty removes proxy authentication. Changing direction requires removing and adding the link.

A one-way connection is attached only to the local instance that created it. The remote server does not gain administrative access to the local instance. Existing full-mesh connections are unchanged. This does not create a VPN or make private addresses routable; transfers and features needing a reverse/direct route retain their network requirements.

[Authentik — Header authentication](https://docs.goauthentik.io/add-secure-apps/providers/proxy/header_authentication/)

