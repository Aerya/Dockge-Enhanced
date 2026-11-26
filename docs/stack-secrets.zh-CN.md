# 每个堆栈的密钥管理器

[English](stack-secrets.md) · [Français](stack-secrets.fr.md) · [Deutsch](stack-secrets.de.md) · [Español](stack-secrets.es.md) · 简体中文

将堆栈连接到 Bitwarden Secrets Manager、1Password、Doppler 或 Infisical，以便在执行 Compose 操作时读取密钥，无需将密钥复制到 `.env` 文件中。
Bitwarden 修复：临时配置使用官方 CLI 要求的 TOML 格式，恢复密钥读取。

**Bitwarden Secrets Manager 功能完整可用。1Password、Doppler 和 Infisical 仍为实验性功能，有待用户测试。**连接测试成功仅表示能够读取密钥，并不保证应用正常运行。

## 配置

1. 在**设置 → 密钥管理器**中选择托管堆栈的实例，使用仅有权读取必要密钥的机器账户添加连接。
2. 对于 Bitwarden，请先阅读链接中的许可证，再点击**安装官方 Bitwarden CLI**。镜像不再分发该 CLI：安装时下载官方 2.1.0 版本，校验 SHA-256，并保存到 `data/secret-tools/bws`。支持 Linux AMD64 和 ARM64，也可手动安装到 `/usr/local/bin/bws`。这里指 **Bitwarden Secrets Manager**，不是个人密码库；不声明兼容 Vaultwarden。
3. 在已保存的堆栈中展开**密钥管理器**，选择连接并填写读取范围。
4. 保存后点击**测试已保存的访问**。测试不会部署容器，也不会显示密钥值。
5. 在 Compose 中引用变量，然后部署或重新创建堆栈。仅保存设置不会修改现有容器。

| 提供商 | 连接 | 堆栈读取范围 |
| --- | --- | --- |
| Bitwarden Secrets Manager | 机器账户令牌和 HTTPS 地址；美国云、欧洲云或官方自托管服务器 | 项目 ID |
| 1Password | 有权读取 Environment 的服务账户令牌 | Environment ID |
| Doppler | 只读服务令牌 | 项目和配置；若令牌已限定范围则可留空 |
| Infisical | HTTPS 地址，以及使用 Universal Auth 的机器身份 Client ID 和 Client Secret | 项目、环境和目录；仅读取所选目录，不包括导入和递归 |

建议使用必填变量：

```yaml
services:
  app:
    image: your-image
    environment:
      DISCORD_TOKEN: ${DISCORD_TOKEN:?required}
```

读取到的值在 Compose 插值中具有优先权。`environment:` 中直接写入的字面值仍为显式值，不会自动替换。也支持 `DISCORD_TOKEN:` 这样的无值变量；在 `compose config` 之后仍未解析的变量会阻止创建、启动、重启和构建操作。可选变量请使用明确的默认值，例如 `${OPTIONAL_VALUE:-}`。

## 执行和限制

- 界面操作、自动任务和回滚都使用堆栈所在实例的连接。关联实例也必须更新。回滚读取提供商当前的密钥，不会恢复旧版本密钥。
- 提供商失败时阻止命令执行，不会静默回退到空环境。同一次操作在内存中复用读取的值，不修改 Dockge 的全局环境。
- 容器状态直接从 Docker 读取，不解析 Compose，也不连接提供商。其他 Compose 命令可能仍需要访问提供商。
- 隐藏受保护的 Compose 命令输出和解析后的配置。拒绝迁移或复制这些堆栈，以避免传输已解析的密钥，或在目标未配置提供商时部署。
- 拒绝可能改变 Docker、Compose 或 Node 执行方式的变量名，包括 `PATH`、`DOCKER_*`、`COMPOSE_*`、`NODE_OPTIONS` 和 `LD_*`，也拒绝重复名称、空响应和无效值。不请求 Doppler 动态密钥。
- 连接令牌使用 `data/stack-secrets.key` 加密，保存在 `data/stack-secrets.json`。保留密钥文件并保护数据卷备份：加密文件和密钥同时存在时可以恢复令牌。密钥丢失会阻止读取，不会自动重新生成。
- 集成不会将读取的值写入 Compose、`.env` 或文件历史。不清理现有文件、历史和备份；请另行删除过去已经保存的密钥。
- **不保证“磁盘上没有密钥”。** Docker 将环境变量保存在容器配置中，Docker 管理员可以访问。应用也可能写入自己的日志或文件。如果应用支持以文件方式挂载密钥，本集成不能替代该机制。

## 来源

[1Password Environments](https://developer.1password.com/docs/sdks/environments/) · [Doppler Service Tokens](https://docs.doppler.com/docs/service-tokens) · [Infisical Universal Auth](https://infisical.com/docs/documentation/platform/identities/universal-auth) · [Bitwarden CLI](https://bitwarden.com/help/secrets-manager-cli/) · [Bitwarden 许可证](https://github.com/bitwarden/sdk-sm/blob/bws-v2.1.0/LICENSE)
