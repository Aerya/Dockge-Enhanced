# 连接受 SSO 保护的实例

[English](sso-federation.md) · [Français](sso-federation.fr.md) · [Deutsch](sso-federation.de.md) · [Español](sso-federation.es.md) · [简体中文](sso-federation.zh-CN.md)

可选的单向连接允许本地实例管理远程服务器，无需反向连接，也不会传播到网状联邦。使用 Enhanced 联邦令牌；如有需要，通过 HTTPS/WebSocket 提供独立的代理 HTTP Basic 凭据。Authentik 需要已授权的账户（可使用现有账户，建议使用专用账户）、应用密码（不是日常 SSO 密码）以及请求头身份验证；Enhanced 不会配置代理。公开的 SSO 仍保持启用。

## 配置
1. 更新两个 Enhanced 实例。在远程实例通过 SSO 以管理员身份登录，在首页选择 **创建联邦令牌**，并安全复制。
2. 在代理/SSO 管理中使用现有账户或建议使用的专用账户，授权其访问此应用，并为该账户生成应用密码（不是日常 SSO 密码）。在 Authentik 的代理提供程序中启用 **Intercept header authentication**，确保反向代理将 Authorization 请求头转发到 outpost。Enhanced 不会修改代理配置。
3. 在本地实例选择 **添加代理**，输入不带路径的远程 HTTPS 源地址，选择 **联邦令牌** 并粘贴 Enhanced 令牌。
4. 启用 **无需反向连接（SSO / 远程服务器）**，在独立的 HTTP Basic 字段中填写所选账户的 Authentik 用户名和应用密码，然后连接。如果不需要代理身份验证，将两个字段留空。
5. 添加连接后，使用 **共享此连接**，确认发送凭据后将连接复制到所选可信实例。各接收实例必须已更新并能访问远程服务器。到接收实例的 HTTP 连接不加密：仅使用可信网络或 HTTPS。界面分别显示各接收实例的结果。副本相互独立，后续凭据变更和删除需要逐一处理。重试不会覆盖现有连接；请检查失败或超时的接收实例。

## 安全与运行
代理凭据只允许通过代理；trusted-proxy 模式仍需要 Enhanced 令牌。单独的 endpoint 请求头不能验证代理实例身份。浏览器 SSO 不变。HTTPS 证书验证保持启用；代理身份验证使用 WebSocket 且不跟随重定向。代理必须支持 WebSocket 升级。这并非自动兼容所有 SSO 提供程序。

请使用受信任的专用管理员账户：联邦令牌允许管理操作。现有 Enhanced 机制仍适用：停用或删除签发账户使其令牌失效，更改密码不会。没有单个令牌撤销界面。删除本地连接会停止连接；若令牌泄漏，应撤销签发账户。

代理凭据与现有代理实例凭据一样存储在本地 Enhanced 数据库中，请保护数据目录和备份。它们不会返回到代理列表，也不会传播到网状联邦。单向连接在网状同步时会被保留，不能被其覆盖。重新身份验证时填写两个代理字段会替换凭据，两个字段均留空会移除代理身份验证。更改连接方向需要删除并重新添加连接。

单向连接仅属于创建它的本地实例。远程服务器不会获得该实例的管理员权限。现有完整网状连接保持不变。此功能不会创建 VPN 或使私有地址可达；需要直连或反向路由的传输和功能仍须满足网络条件。

[Authentik — Header authentication](https://docs.goauthentik.io/add-secure-apps/providers/proxy/header_authentication/)

