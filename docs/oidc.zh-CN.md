# OpenID Connect（OIDC）登录

[English](oidc.md) · [Français](oidc.fr.md) · [Español](oidc.es.md) · [Deutsch](oidc.de.md) · [简体中文](oidc.zh-CN.md)

Dockge-Enhanced 可以直接通过 Pocket ID、Authentik、Keycloak、Authelia 或 Google 等 OpenID Connect 提供商登录用户，前面无需反向代理。OIDC 在 `local` 认证模式（默认模式）下与本地账户、2FA 和受限账户**并存**。当 `DOCKGE_AUTH_MODE` 为 `disabled` 或 `trusted-proxy` 时，OIDC 会被忽略。

Dockge 使用带 PKCE（S256）、`state` 和 `nonce` 的授权码流程，并校验 ID 令牌（签名、签发者、受众、过期时间、nonce）。登录成功后，Dockge 会打开与密码登录相同的会话，因此 HTTP API、撤销、审计日志和受限账户的行为完全一致。

## 提供商设置

在提供商处创建一个 OIDC 客户端（应用）：

- **重定向 URI / 回调 URL**：`https://dockge.example.com/api/auth/oidc/callback`
- **客户端类型**：机密客户端（带客户端密钥）或公共客户端（仅 PKCE），两者都可以。
- **Scopes**：`openid profile email`。如果使用 `DOCKGE_OIDC_ADMIN_GROUPS` 且提供商需要（Pocket ID、Authentik），请添加 `groups`。

## 配置

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DOCKGE_OIDC_ISSUER` | *(无)* | 签发者 URL。设置后即启用 OIDC。发现地址为 `<issuer>/.well-known/openid-configuration` |
| `DOCKGE_OIDC_CLIENT_ID` | *(必填)* | 客户端 ID |
| `DOCKGE_OIDC_CLIENT_SECRET` | *(无)* | 客户端密钥。公共客户端请留空 |
| `DOCKGE_OIDC_CLIENT_SECRET_FILE` | *(无)* | 包含密钥的文件（推荐，优先使用） |
| `DOCKGE_OIDC_REDIRECT_URI` | *(必填)* | 公开回调 URL，必须以 `/api/auth/oidc/callback` 结尾 |
| `DOCKGE_OIDC_SCOPES` | `openid profile email` | 请求的 scopes |
| `DOCKGE_OIDC_USERNAME_CLAIM` | `preferred_username` | 用作 Dockge 用户名的 claim（也常用 `email`） |
| `DOCKGE_OIDC_GROUPS_CLAIM` | `groups` | 包含用户所属组的 claim |
| `DOCKGE_OIDC_ADMIN_USERS` | *(无)* | 成为管理员的用户名，用逗号分隔 |
| `DOCKGE_OIDC_ADMIN_GROUPS` | *(无)* | 其成员为管理员的组，用逗号分隔（见下文） |
| `DOCKGE_OIDC_LINK_EXISTING` | `false` | 允许首次 OIDC 登录关联同名的现有本地账户 |
| `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN` | `false` | 隐藏用户名/密码表单并拒绝密码登录 |
| `DOCKGE_OIDC_BUTTON_LABEL` | “使用 SSO 登录”（已翻译） | 登录按钮文字 |
| `DOCKGE_OIDC_ALLOW_HTTP` | `false` | 允许签发者和重定向使用 `http://` URL。**仅用于本地测试** |

配置不完整时 Dockge 会拒绝启动，例如缺少客户端 ID 或重定向 URI，或在没有签发者的情况下设置了 `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN`。重定向 URI 只来自配置，绝不来自请求头。如果提供商不可达，本地登录仍可使用，SSO 按钮会显示错误。

### 示例：Pocket ID

```yaml
services:
  dockge:
    environment:
      - DOCKGE_OIDC_ISSUER=https://id.example.com
      - DOCKGE_OIDC_CLIENT_ID=0f6c...                     # 来自 Pocket ID → OIDC Clients
      - DOCKGE_OIDC_CLIENT_SECRET_FILE=/run/secrets/dockge_oidc_secret
      - DOCKGE_OIDC_REDIRECT_URI=https://dockge.example.com/api/auth/oidc/callback
      - DOCKGE_OIDC_SCOPES=openid profile email groups
      - DOCKGE_OIDC_ADMIN_GROUPS=dockge-admins
      - DOCKGE_OIDC_BUTTON_LABEL=使用 Pocket ID 登录
    secrets:
      - dockge_oidc_secret

secrets:
  dockge_oidc_secret:
    file: ./secrets/dockge_oidc_secret
```

对于 Authentik，签发者是应用的“OpenID Configuration Issuer”，例如 `https://auth.example.com/application/o/dockge/`。对于 Keycloak，则为 `https://kc.example.com/realms/<realm>`。

## 账户与角色

- 每个 OIDC 身份通过提供商的稳定标识（签发者 + `sub`）绑定到一个 Dockge 账户。在提供商处重命名用户不会创建新账户。
- 首次登录时，不存在的账户会被创建为**没有任何 Stack 授权的受限账户**：在管理员于**设置 → 安全 → 用户与权限**中授予访问权限之前，它什么也看不到。已关联的账户在该页面显示 **SSO** 标记。
- **管理员**来自 `DOCKGE_OIDC_ADMIN_USERS` 和 `DOCKGE_OIDC_ADMIN_GROUPS`：
  - 设置 `DOCKGE_OIDC_ADMIN_GROUPS` 后，每次登录都以组成员关系为准：加入该组即获得管理员权限，离开该组则账户变回受限账户。账户保留其 Stack 授权。已打开的会话会以新角色重新连接。
  - 只设置 `DOCKGE_OIDC_ADMIN_USERS` 时，列出的用户会被提升为管理员，且不会有人被降级。
- **不存在“第一个用户自动成为管理员”的隐含规则。** 新安装时，请通过初始设置页面或 `DOCKGE_BOOTSTRAP_*` 创建第一个管理员，或配置管理员映射。否则首次 OIDC 登录会被拒绝并给出说明，避免安装中只有受限账户而把您锁在外面。
- **现有本地账户**默认不会被关联：用户名与本地账户相同的 OIDC 用户会被拒绝。设置 `DOCKGE_OIDC_LINK_EXISTING=true` 可在首次登录时关联它们。当用户名 claim 为 `email` 时，关联还要求 `email_verified` 为 true。这样可以防止能够自行选择用户名或邮箱的提供商用户接管本地管理员。
- 在 Dockge 中停用账户也会阻止其 OIDC 登录。

## 2FA

OIDC 登录不会要求本地 TOTP 验证码：多因素认证由提供商负责。同一账户的密码登录仍会使用本地 2FA。

## 禁用本地登录

设置 `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN=true` 后，登录页只显示 SSO 按钮，服务器会拒绝密码登录。现有会话、实例之间的联邦令牌和初始设置页面仍可正常使用。

**恢复：** 如果提供商不可用，请删除 `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN` 并重启容器，然后使用本地管理员账户登录。

## 尚未包含

- 将组映射为按 Stack 的授权（目前只映射管理员角色）。
- 在提供商处注销（RP-initiated logout）：**注销**只会关闭 Dockge 会话。
- 通过设置界面配置：OIDC 通过环境变量配置。
