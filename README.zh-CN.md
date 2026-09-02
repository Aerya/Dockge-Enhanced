<p align="center">
  <img src="https://raw.githubusercontent.com/Aerya/Dockge-Enhanced/main/frontend/public/icon.svg" width="120" alt="Dockge Enhanced logo">
</p>

# Dockge Enhanced
> [!WARNING]
> ## Dockge-Enhanced 自动更新关键修复
>
> **2026 年 8 月 31 日至 2026 年 9 月 2 日** 期间发布的多个 build 在 Dockge-Enhanced 自动更新机制中存在缺陷。
>
> 在某些情况下，sidecar 可能会停止 Dockge-Enhanced 容器，但随后无法创建新版本；在部分 build 中，也可能无法自动恢复之前的版本。
>
> 该机制现已修复并进一步加强。从 build **`0fc2564` / 版本 1.5.4** 开始，自动更新会：
>
> - 在每次更新前始终拉取最新的 `dockge-enhanced-updater:latest`；
> - 显式拉取目标 Dockge-Enhanced 镜像；
> - 在替换前执行强制 Restic 备份；
> - 在确认更新成功前验证新容器；
> - 保留 rollback 机制和恢复 snapshot。
>
> **如果您的安装版本早于 `0fc2564` / 1.5.4，请在启用或重新启用自动更新前，最后手动更新一次：**
>
> ```bash
> docker pull ghcr.io/aerya/dockge-enhanced:latest
> docker compose up -d
> ```
>
> 完成此次更新后，即可启用 **通过受保护 sidecar 自动更新**；之后的更新将由 Dockge-Enhanced 自动处理。
>
> **Dockge-Enhanced 管理的 stacks 及其持久化数据不受此问题影响。**
>
> 对于受到影响的用户，我深表歉意。一个本应让更新更加安全的功能，不应该让 Dockge-Enhanced 自身处于离线状态。感谢所有使用、测试并反馈问题的用户，你们的反馈帮助我们快速定位并修复了这些缺陷。

---

⚠️ **重要 — Dockge-Enhanced 自动更新关键修复**
⚠️ **重要 — Dockge-Enhanced 自动更新关键修复**

**2026 年 8 月 31 日至 2026 年 9 月 2 日** 期间发布的多个 build 在 Dockge-Enhanced 自动更新机制中存在缺陷。

在某些情况下，sidecar 可能会停止 Dockge-Enhanced 容器，但随后无法创建新版本；在部分 build 中，也可能无法自动恢复之前的版本。

该机制现已修复并进一步加强。从 build **`0fc2564` / 版本 1.5.4** 开始，自动更新会：

- 在每次更新前始终拉取最新的 `dockge-enhanced-updater:latest`；
- 显式拉取目标 Dockge-Enhanced 镜像；
- 在替换前执行强制 Restic 备份；
- 在确认更新成功前验证新容器；
- 保留 rollback 机制和恢复 snapshot。

**如果您的安装版本早于 `0fc2564` / 1.5.4，请在启用或重新启用自动更新前，最后手动更新一次：**

```bash
docker pull ghcr.io/aerya/dockge-enhanced:latest
docker compose up -d
```

完成此次更新后，即可启用 **通过受保护 sidecar 自动更新**；之后的更新将由 Dockge-Enhanced 自动处理。

Dockge-Enhanced 管理的 stacks 及其持久化数据不受此问题影响。

**对于受到影响的用户，我深表歉意。** 一个本应让更新更加安全的功能，不应该让 Dockge-Enhanced 自身处于离线状态。感谢所有使用、测试并反馈问题的用户，你们的反馈帮助我们快速定位并修复了这些缺陷。

[Dockge](https://github.com/louislam/dockge) 的功能增强分支，在保留简洁 Docker Compose 管理体验的基础上，将其扩展为更完整的 Docker 管理平台 —— 提供多服务器联邦、Stack 迁移与复制、Restic 备份、镜像与 Dockge-Enhanced 自更新及回滚、安全扫描、监控、自动化、通知和 Docker 资源管理，并全部集成于 Web UI。

<p align="center">
  🇨🇳 简体中文 ·
  🇬🇧 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.md">English</a> ·
  🇫🇷 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.fr.md">Français</a> ·
  🇪🇸 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.es-ES.md">Español</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white" alt="Docker">
  <img src="https://github.com/Aerya/Dockge-Enhanced/actions/workflows/build-publish.yml/badge.svg?branch=main" alt="Build">
  <img src="https://img.shields.io/badge/arch-amd64%20%7C%20arm64-lightgrey" alt="multi-arch">
  <img src="https://img.shields.io/badge/i18n-EN%20%7C%20FR%20%7C%20ES%20%7C%20zh--CN-blue" alt="i18n">
  <img src="https://img.shields.io/badge/based%20on-Dockge-orange?logo=github&logoColor=white" alt="based on Dockge">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT">
</p>

<p align="center">
  <strong>正在使用？觉得不错？</strong>
  <a href="https://github.com/Aerya/Dockge-Enhanced"><strong>⭐ 给项目一个 Star！</strong></a>
</p>

---

<p align="center">
  <img src="screens/D-E.vs.Others.EN.09.26.png" alt="Dockge Enhanced comparison" width="100%">
</p>

## 功能

## 最新动态

README 会直接保留近期最重要的变化，方便快速了解 Dockge-Enhanced 最近新增了什么。

### 🆕 2026 年 9 月

**Docker Compose 项目名称匹配改进**

当受管理 Stack 的目录名包含点号或大写字母时，现在会根据实际的 `ConfigFiles` 路径与 Docker Compose 进行匹配，而不再仅依赖 Docker 规范化后的项目名称。这样可避免同一个 Stack 同时出现“受管理/已停止”和“外部/运行中”的重复条目。

**支持 Compose 长格式端口语法**

容器卡片现在同时支持 Compose 的短格式和长格式端口定义。使用 `published`、`target`、`protocol`、`mode` 或 `host_ip` 的配置不再触发 `split is not a function`，也不会再导致容器卡片消失。IPv6 `host_ip` 也会在生成的链接中正确格式化。

**Compose 编辑器保留 tmpfs 权限模式**

可视化 Compose 编辑器在重新生成 YAML 时会保留 `tmpfs.mode: 01777` 这类带前导零的八进制权限值。修改其他字段时不会再静默地将该权限重写为 `1777`。

**加强 Stack 路径遍历防护**

后端操作现在会在解析任何路径之前验证传入的 Stack 名称，包括主动跳过文件系统发现的代码路径。类似 `../outside` 的恶意名称无法再逃离受管理的 Stack 目录，从而访问其他应用的 Compose 或 `.env` 文件。

**受保护的 Dockge-Enhanced 自动更新**

Dockge-Enhanced 现在可以通过受严格限制的 sidecar 自动更新。替换容器前必须完成 Restic 备份和仓库完整性检查，新版本必须通过可用性检查，否则自动恢复之前的镜像。

**远程服务器镜像更新状态**

镜像更新信息分别从每个已连接实例获取，因此远程 Stack 可以显示自己的更新标记。

**清晰的 build 标识与更新进度**

“更新”页面通过 OCI 元数据识别 build，并统一显示更新阶段、Restic 进度和已用时间。

### 2026 年 8 月

**事务式 Stack 迁移与复制**

Stack 可连同 Compose 配置和持久化数据在实例之间复制或移动，支持恢复、验证和 rollback。

**主机前置条件与自动恢复**

Stack 可以要求主机挂载点或 `systemd` 服务可用后再启动。

**响应式界面与增强监控**

Stack 导航、Logs/Compose、资源指标、健康卡片、主题和移动端显示均得到改进。

➡️ **[查看完整更新日志](CHANGELOG.zh-CN.md)**

---

## 功能目录

### 多服务器与联邦
- 全网状联邦
- 从任意已连接实例管理
- 服务器选择与分组
- 远程 Stack 与更新状态
- 专用联邦 Token 与连接恢复

### Stack 管理
- 创建、编辑、启动、停止和重新创建 Compose Stack
- 固定与排序
- 备注和 Git 工具
- Build + Recreate
- 服务/容器级操作和计划任务
- 主机前置条件与 VPN namespace 保护
- 可折叠/调整大小的侧栏与资源指标

### 迁移与复制
- 实例间复制或移动
- Compose、bind mount 与卷传输
- 可恢复任务和 SHA-256 校验
- 事务式部署与 rollback
- 本地镜像和私有 Registry 凭据传输
- `container_name` 冲突检测
- 计划冷复制

### 备份与恢复
- Restic 多目标备份
- Bind mount 与卷
- 选择性恢复
- 仓库与 Snapshot 检查
- 历史记录与恢复流程集成

### 更新
- 镜像更新监控与远程检测
- 手动和自动更新
- Rollback、计划与暂停
- Dockge-Enhanced 受保护自动更新
- 强制 Restic 备份、完整性和可用性检查
- 失败时自动恢复

### 安全
- 集中验证 Stack 名称，阻止路径遍历逃离受管理的 Stack 目录
- Trivy 与 CVE 例外
- 2FA、Turnstile、trusted proxy
- 受限制 sidecar 与签名计划
- Docker 破坏性操作保护
- 私有 Registry 凭据加密传输

### 监控
- 系统、Stack 和容器统计
- 状态栏与健康卡片
- Crash loop 与 healthcheck 自动修复
- 实时/全屏日志
- Kula 与 Dozzle

### Docker 资源
- 镜像、卷、网络和未管理容器
- 批量操作与自动清理
- 高风险删除保护

### 自动化与审计
- REST API
- 每 Stack Webhook
- Home Assistant 示例
- 计划操作
- 集中历史记录

### 集成
- PlugNPiN
- Nginx Proxy Manager
- Pi-hole
- AdGuard Home
- Dozzle 与 Kula

### 通知与访问
- Discord 与 Apprise
- EN / FR / ES / zh-CN
- 2FA、trusted proxy、Turnstile
- 第三方移动客户端

---
---

## 截图

项目截图位于 [`screens/`](screens/) 目录。主 README 中展示了界面、更新、备份、Trivy、Discord 通知和多实例功能的最新截图。

---

## 安装

```yaml
# compose.yaml
services:
  dockge:
    image: ghcr.io/aerya/dockge-enhanced:latest
    container_name: dockge-enhanced
    restart: unless-stopped
    ports:
      - 5001:5001
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ../../data:/app/data
      - ../../opt/stacks:/opt/stacks
      - ../../backup/dockge:/backup          # 可选：独立本地备份目录
      - ../../docker:/dockers-data           # 可选：额外需要备份的数据
    environment:
      - DOCKGE_STACKS_DIR=/opt/stacks
      - DOCKGE_DATA_DIR=/app/data
#      - DOCKER_API_VERSION=x.xx             # 可选：旧版 Docker API 的 NAS
      - TZ=Europe/Paris                      # 时区，会影响计划任务
```

启动：

```bash
docker compose up -d
```

打开 **http://localhost:5001**，创建管理员账号，然后即可使用 Dockge Enhanced。

> `/backup:/backup` 不是必需的，但如果使用 Restic 的本地目标，建议挂载一个独立主机目录并把备份目标设为 `/backup`。

> 如果要备份多个数据目录，可以添加多个 volume，然后在 **Backup** 页面中的 **Additional paths** 注册对应的容器路径。

> 如果要监控 `/` 之外的主机磁盘分区，请把目标路径只读挂载到容器，并在 **Monitoring** 页面中加入该路径。

### 可选 PlugNPiN 集成

在 **Settings → Integrations** 中配置 [PlugNPiN](https://github.com/DeepSpace2/PlugNPiN)。只有明确启用并保存后，Dockge Enhanced 才会创建受管的 `plugnpin-dockge-enhanced` Stack。

Nginx Proxy Manager 凭据是必需的；Pi-hole、AdGuard Home、metrics 和 debug 日志均可单独选择。密码通过 stdin 写入专用 Docker volume，不会返回浏览器，也不会写入生成的 Compose 文件。

---

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DOCKGE_STACKS_DIR` | `/opt/stacks` | Docker Compose Stack 所在目录 |
| `DOCKGE_DATA_DIR` | `/opt/dockge/data` | Dockge 数据目录；推荐与 volume 对应设置为 `/app/data` |
| `DOCKGE_PUBLIC_URL` | 无 | Discord 通知中使用的公网 URL，例如 `https://dockge.example.com` |
| `DOCKER_API_VERSION` | 无 | 固定 Docker Client 协商的 API 版本，适合部分 NAS |
| `TZ` | `UTC` | 容器时区；计划自动更新依赖此值 |
| `DOCKGE_PORT` | `5001` | Web UI 端口 |
| `DOCKGE_SSL_KEY` / `DOCKGE_SSL_CERT` | — | 启用 HTTPS |
| `DOCKGE_AUTH_MODE` | 未设置 | `local`、`disabled` 或 `trusted-proxy` |
| `DOCKGE_AUTH_PROXY_HEADER` | `x-forwarded-user` | trusted-proxy 模式下包含已验证身份的 Header |
| `DOCKGE_AUTH_PROXY_TRUSTED_NETWORKS` | 必填（代理模式） | 允许提供身份 Header 的地址/CIDR |
| `DOCKGE_BOOTSTRAP_USERNAME` | 无 | 数据库没有用户时创建的首个管理员名称 |
| `DOCKGE_BOOTSTRAP_PASSWORD_FILE` | 无 | 管理员密码 Secret 文件；自动部署时推荐 |
| `DOCKGE_BOOTSTRAP_PASSWORD` | 无 | 直接密码方式；由于会暴露在容器环境中，安全性较低 |
| `DOCKGE_TRANSFER_RSYNC_PROFILES` | `[]` | 本地 SSH/rsync 传输配置 JSON |

> ⚠️ 如果 volume 使用 `/app/data`，请始终设置 `DOCKGE_DATA_DIR=/app/data`，否则重启后设置可能无法持久化。

### 身份验证与初始化

现有安装无需修改。没有额外环境变量时，账号、登录页、2FA 和“禁用身份验证”功能与之前保持一致。

自动初始化管理员时，推荐使用 Secret：

```yaml
services:
  dockge:
    environment:
      - DOCKGE_BOOTSTRAP_USERNAME=admin
      - DOCKGE_BOOTSTRAP_PASSWORD_FILE=/run/secrets/dockge_admin_password
    secrets:
      - dockge_admin_password

secrets:
  dockge_admin_password:
    file: ./secrets/dockge_admin_password
```

可信代理示例：

```yaml
environment:
  - DOCKGE_AUTH_MODE=trusted-proxy
  - DOCKGE_AUTH_PROXY_HEADER=x-forwarded-user
  - DOCKGE_AUTH_PROXY_TRUSTED_NETWORKS=172.20.0.0/24
```

请把示例 CIDR 替换为代理的真实网络。Dockge 端口不应直接暴露；只有声明的可信代理可以提供用户身份。

---

## 自动更新

该分支通过 GitHub Actions 跟踪上游 Dockge：

- **每天**检查新的稳定版本；
- 检测到上游更新时同步变更并创建 PR；
- PR 合并后重新构建并发布 `amd64` + `arm64` Docker 镜像到 GHCR；
- 发生认证相关冲突时，Enhanced 版本会被保留在同步分支中，并明确列出需要人工比较的文件。

Dockge-Enhanced 自身的应用内自更新是独立功能，可在 **Updates** 页面配置。自动模式要求 Restic 备份与验证通过，并在健康检查失败时回滚。

---

## 移动应用 / 第三方客户端

Dockge-Enhanced 是免费且开源的。

本项目当前没有官方维护的 iOS 或 Android 应用。第三方客户端可能存在，但除非在此项目中明确列出，否则均独立于 Dockge-Enhanced。

---

## 署名

如果你的应用、服务、文章或集成使用 Dockge-Enhanced 的功能、API、截图、文档或品牌，请注明本项目并链接到本仓库。

MIT 许可证允许商业第三方客户端，但未经许可不得暗示其与 Dockge-Enhanced 存在官方关联。

---

## 致谢

- [**Dockge**](https://github.com/louislam/dockge) by louislam — 原始项目（MIT）
- [**Trivy**](https://github.com/aquasecurity/trivy) — 漏洞扫描
- [**Restic**](https://restic.net/) — 加密备份
- [**Apprise**](https://github.com/caronc/apprise-api) — 多平台通知网关
- [**Kula**](https://github.com/c0m4r/kula) by c0m4r — 轻量系统监控
- [**Dozzle**](https://github.com/amir20/dozzle) by Amir Rajan — Docker 实时日志查看器
- [**PlugNPiN**](https://github.com/DeepSpace2/PlugNPiN) by DeepSpace2 — 可选 DNS / Nginx Proxy Manager 自动化
- [**crossly/Dockge-Enhanced**](https://github.com/crossly/Dockge-Enhanced) — 已整合的重要 UI/UX、主题、国际化和前端架构改进来源

---

## 许可证

MIT — 参见 [LICENSE](LICENSE)。

## 远程公告

Dockge-Enhanced 现在可以显示**从此 GitHub 仓库发布的纯文本运维公告**，并且该通道独立于 Docker 镜像更新机制。这个安全通道是在 2026 年 8 月底至 9 月初的自动更新事故之后加入的：如果未来某个构建出现严重问题，受影响的已安装版本可以收到警告，而不必等待同一个更新机制先恢复正常。

公告来自 [`remote-announcements.json`](remote-announcements.json)。公告是可选的，仅通过 HTTPS 获取，经过严格结构校验，并限制大小和数量；还可以按应用版本、Git 修订或 OCI 构建日期定向发布。公告**不能执行命令、注入 HTML 或触发更新**。可点击链接仅允许指向 Dockge-Enhanced 的 GitHub 仓库。如果 GitHub 不可用或公告文档无效，Dockge-Enhanced 只会不显示公告，不影响其他功能。

关闭公告只会在当前浏览器会话中隐藏它。选择**不再显示**会把公告 ID 保存到 Dockge-Enhanced 的持久化数据目录；发布新的公告时使用新的 ID。
