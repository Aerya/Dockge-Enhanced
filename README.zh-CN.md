<p align="center">
  <img src="https://raw.githubusercontent.com/Aerya/Dockge-Enhanced/main/frontend/public/icon.svg" width="120" alt="Dockge Enhanced logo">
</p>

# Dockge Enhanced

[Dockge](https://github.com/louislam/dockge) 的增强功能分支 —— 在保留简洁 Compose 管理体验的基础上，加入镜像更新监控、安全扫描、自动备份、崩溃循环检测、多实例管理以及 Docker 资源管理。

> 🇨🇳 简体中文 · 🇬🇧 [English](README.md) · 🇫🇷 [Français](README.fr.md) · 🇪🇸 [Español](README.es-ES.md)

<p align="center">
  <img src="https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white" alt="Docker">
  <img src="https://github.com/Aerya/Dockge-Enhanced/actions/workflows/build-publish.yml/badge.svg?branch=main" alt="Build">
  <img src="https://img.shields.io/badge/arch-amd64%20%7C%20arm64-lightgrey" alt="multi-arch">
  <img src="https://img.shields.io/badge/i18n-EN%20%7C%20FR%20%7C%20ES%20%7C%20zh--CN-blue" alt="i18n">
  <img src="https://img.shields.io/badge/based%20on-Dockge-orange?logo=github&logoColor=white" alt="based on Dockge">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT">
</p>

> **正在使用？觉得不错？[⭐ 给项目一个 Star！](https://github.com/Aerya/Dockge-Enhanced)**

---

⚠️ **重要 — Dockge-Enhanced 自更新修复**

曾有一个自更新问题可能导致 Sidecar 无法完成更新，即使界面显示更新正在进行。

**该问题影响 2026 年 8 月 31 日晚至 2026 年 9 月 1 日上午期间更新的 Dockge-Enhanced 实例。**

问题现已修复。**如果你在修复前启用了 Dockge-Enhanced 自更新，每个实例都需要最后手动更新一次**：

`docker pull ghcr.io/aerya/dockge-enhanced:latest && docker compose up -d`

安装修复版本后，自更新会恢复正常工作。

<p align="center">
  <img src="screens/D-E.vs.Others.EN.09.26.png" alt="Dockge Enhanced comparison" width="100%">
</p>

## 功能

### Dockge Enhanced 的主要增强

| 领域 | Dockge Enhanced 新增内容 |
| --- | --- |
| **多实例** | 添加或移除 Agent 时自动建立全网状联邦；可从任意已连接实例管理；支持多服务器筛选和分组、事务式复制/迁移、可恢复任务以及自动冷复制 |
| **Stack 管理** | Stack 固定、可折叠和可调整宽度的侧栏、紧凑状态/资源指示器、可调整大小的 Logs/Compose 工作区、可靠的原始 YAML 复制、Stack/容器级操作与计划任务、主机启动前置条件、Build + Recreate、备注和 Git 工具 |
| **备份与恢复** | Restic 多目标备份、卷数据、按 Stack 保持一致性、选择性恢复、快照测试与差异比较 |
| **自动化与审计** | 按权限和 Stack 限定的 REST API、每 Stack Webhook、Home Assistant 示例、带来源和执行时间的集中审计历史 |
| **Docker 资源** | 镜像、卷、未管理容器和网络；批量操作、自动清理以及高风险删除保护 |
| **镜像与安全** | 镜像更新监控、带回滚的自动更新、可计划/暂停的 Dockge-Enhanced 自更新、Trivy 扫描和 CVE 忽略规则 |
| **监控** | 可配置的顶部/底部系统状态栏、仪表盘健康卡片、系统/Stack/容器统计、崩溃循环检测、healthcheck 自动修复、响应式/全屏日志、可选 Kula 和受管 Dozzle |
| **集成** | 可选 PlugNPiN，以及面向 Nginx Proxy Manager、Pi-hole 和 AdGuard Home 的服务标签助手 |
| **通知与访问** | Discord 和 Apprise 通知支持 EN/FR/ES/zh-CN，另有 2FA、可信代理、Turnstile 和第三方客户端支持 |

### 最近的重要变化

- **2026-09-01 — 远程 Stack 更新标记**：Stack 列表现在会从每个远程 Dockge-Enhanced 实例读取镜像更新状态，并按 endpoint 隔离，因此远程 Stack 也能正确显示 **更新** 标记。
- **2026-09-01 — 四语言 Enhanced 本地化**：Enhanced 自己新增的用户界面内容、更新弹窗，以及 Discord/Apprise 通知统一维护英语、法语、西班牙语和简体中文。
- **2026-08-31 — 安全自更新**：自更新支持手动或受限 Sidecar 模式；执行前必须完成 Restic 备份和仓库验证，失败时自动回滚。
- **2026-08-30 — 响应式界面和统一主题**：Stack 侧栏可折叠/调整大小，系统状态栏、健康卡片、自动主题以及移动端导航得到增强。
- **2026-08-27 — Stack 启动前置条件**：可要求主机挂载点或 `systemd` 服务可用后再启动、重启或重新创建容器。
- **2026-08-22 — 联邦凭据恢复**：多实例之间使用专用联邦 JWT，修改 WebUI 用户名或密码不会再让已连接实例离线。
- **2026-08-20 — Stack 迁移增强**：支持必要时复制 Docker 镜像、加密迁移私有 Registry 凭据，并在部署前检测 `container_name` 冲突。

完整历史和详细技术说明可参考 [英文 README](README.md)。

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
