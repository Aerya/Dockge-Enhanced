# REST API、Webhooks 与自动化

[English](AUTOMATION.md) · [Français](AUTOMATION.fr.md) · [Español](AUTOMATION.es.md) · [Deutsch](AUTOMATION.de.md) · [简体中文](AUTOMATION.zh-CN.md)

本页所有功能均为可选项。只有管理员在 **设置 → 自动化** 中主动请求后，才会创建令牌或 Webhook。

## 安全模型

- 密钥只显示一次。Dockge Enhanced 仅保存其 SHA-256 哈希。
- 每个令牌独立限制权限、允许的 Stack 以及可选的有效期。
- 每个 Webhook 仅针对一个 Stack 和固定的操作列表，可随时禁用或轮换。
- API 令牌每分钟最多 60 次请求；Webhook 的限制可配置为每分钟 1 至 60 次。
- Stack API 响应不包含 `compose.yaml`、`.env` 或备注。
- 每次操作都会写入审计日志，包含来源、操作者、耗时及有长度限制的输出。

请将令牌和 Webhook URL 保存在密钥管理器中。使用 HTTPS 保护 `/api/*`，切勿在仓库、日志或截图中泄露密钥。

## REST API

令牌支持 `Authorization: Bearer <TOKEN>` 或 `X-API-Key: <TOKEN>`。

```bash
export DOCKGE_URL="https://dockge.example.com"
export DOCKGE_TOKEN="dge_..."

curl -fsS \
  -H "Authorization: Bearer ${DOCKGE_TOKEN}" \
  "${DOCKGE_URL}/api/v1/stacks"
```

| 方法 | 端点 | 权限 |
| --- | --- | --- |
| `GET` | `/api/v1/stacks` | `stack:read` |
| `GET` | `/api/v1/stacks/:name` | `stack:read` |
| `POST` | `/api/v1/stacks/:name/actions/:action` | `stack:<action>` |
| `GET` | `/api/v1/history?stack=:name&limit=100&offset=0` | `history:read` |

可用操作：`start`、`stop`、`restart`、`update`、`recreate`、`pull-recreate`、`build-recreate` 和 `backup`。

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer ${DOCKGE_TOKEN}" \
  "${DOCKGE_URL}/api/v1/stacks/immich/actions/restart"
```

`build-recreate` 会拒绝没有 Compose `build` 指令的 Stack。`backup` 使用 Dockge Enhanced 中已配置的目标，对该 Stack 的 Compose、`.env` 及元数据文件进行备份。

## Webhooks

创建或轮换后，界面会显示完整 URL：

```text
POST https://dockge.example.com/api/webhooks/dwh_<id>_<secret>/<action>
```

URL 中的密钥用于验证请求，不需要额外的请求头。

```bash
curl -fsS -X POST \
  "https://dockge.example.com/api/webhooks/dwh_1_SECRET/restart"
```

轮换 URL 会立即使旧 URL 失效。禁用、过期、超过请求频率或操作未获授权的 Webhook 会返回对应的认证、限流或授权错误。

## Home Assistant

以下示例为 `immich` Stack 使用仅允许 `start`、`stop` 和 `restart` 的 Webhook：

```yaml
rest_command:
  dockge_immich_restart:
    url: !secret dockge_immich_restart_webhook
    method: POST
    timeout: 120
```

在 `secrets.yaml` 中：

```yaml
dockge_immich_restart_webhook: "https://dockge.example.com/api/webhooks/dwh_1_SECRET/restart"
```

按钮示例：

```yaml
button:
  - platform: template
    name: Restart Immich
    press:
      - action: rest_command.dockge_immich_restart
```

## 其他工具

- 只有至少一个服务包含 `build` 指令时才会显示 **Build + Recreate**。它先对这些服务执行 `docker compose build --pull`，再执行 `docker compose up -d --remove-orphans`。
- **Stack 备注**保存在 `.dockge-meta.json` 中，最多 10,000 个字符，并包含在备份中。请勿在其中存放密钥。
- **Git** 面板仅支持手动操作，默认折叠，且只适用于本地 Stack。它拒绝 URL 内嵌凭据，排除敏感文件，使用技术身份 `Dockge Enhanced <dockge-enhanced@localhost>` 创建提交，强制 `pull --ff-only`，恢复前要求工作树干净，恢复后验证 Compose。
- **Docker 网络**支持 `bridge`、`macvlan` 和 `ipvlan`。删除与连接操作需要确认；`bridge`、`host` 和 `none` 受到保护。不支持 Docker Swarm 和 `overlay`。
- Dockge Enhanced 版本检查仅提供信息：此 API 绝不会触发应用自动更新。
