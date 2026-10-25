<p align="center">
  <img src="https://raw.githubusercontent.com/Aerya/Dockge-Enhanced/main/frontend/public/icon.svg" width="120" alt="Dockge Enhanced logo">
</p>

# Dockge Enhanced

Dockge Enhanced 是 [Dockge](https://github.com/louislam/dockge) 的分支，通过 Web 界面管理一台或多台服务器上的 Docker Compose 环境。它集成了 Stack 与容器管理、全局搜索与文件访问、迁移与复制、Restic 或 Zerobyte 备份、支持回滚的更新，以及监控、安全检查和自动化。丰富的集成与恢复工具帮助您日常跟踪和维护服务。

<p align="center">
  🇨🇳 简体中文 ·
  🇬🇧 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.md">English</a> ·
  🇫🇷 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.fr.md">Français</a> ·
  🇪🇸 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.es-ES.md">Español</a> ·
  🇩🇪 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.de.md">Deutsch</a>
</p>

<p align="center">
  <img src="https://github.com/Aerya/Dockge-Enhanced/actions/workflows/build-publish.yml/badge.svg?branch=main" alt="Build">
  <img src="https://img.shields.io/badge/arch-amd64%20%7C%20arm64-lightgrey" alt="multi-arch">
  <img src="https://img.shields.io/badge/i18n-EN%20%7C%20FR%20%7C%20ES%20%7C%20DE%20%7C%20zh--CN-blue" alt="i18n">
  <img src="https://img.shields.io/badge/based%20on-Dockge-orange?logo=github&logoColor=white" alt="based on Dockge">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT">
</p>

<p align="center">
  <strong>正在使用？觉得不错？</strong>
  <a href="https://github.com/Aerya/Dockge-Enhanced"><strong>⭐ 给项目一个 Star！</strong></a>
</p>

---

## 功能

### Dockge Enhanced 的特色

| 领域 | Dockge Enhanced 提供 |
| --- | --- |
| **多服务器** | Dockge-Enhanced 实例之间的全网格联邦、可从任意关联服务器管理、带节点独立令牌的可选反向连接、持久化代理标签、服务器分组与选择、远程更新状态、事务性 Stack 复制/迁移、可续传传输和计划冷复制 |
| **Stack 管理** | 固定 Stack、紧凑的状态和资源指示、可折叠/可调整的导航、灵活的日志/Compose 工作区、直接可用的操作栏（仅图标或图标加文字）、带说明的 Stack/容器操作、Stack 暂停/恢复、按容器计划、Build + Recreate、备注、Git 工具、主机启动前置条件，以及共享 VPN/网络命名空间服务的自动重建 |
| **Compose 编辑** | Compose、override 和 `.env` 编辑器，默认 Compose 和 `.env` 模板，命名链接，YAML 修复，逐服务健康检查助手，端口冲突和镜像偏差检查，以及可选的按 Stack `TZ` |
| **备份与恢复** | 多目标 Restic 备份、绑定挂载和卷、按 Stack 一致性、选择性恢复、仓库检查、快照校验与差异、安全重置仓库，以及受保护更新使用的恢复流程。可选连接或托管安装 Zerobyte、受保护的应用流程和专用测试恢复 |
| **更新** | 按 Stack 批量策略并保留例外、立即模式每 5 分钟定向检查、任何变更前都遵守镜像忽略设置、手动/顺序批量/自动容器更新并可回滚、共享维护窗口、远程更新标记、全局/按镜像暂停，以及带强制备份、完整性检查和自动恢复的受保护 Dockge-Enhanced 自更新 |
| **迁移与复制** | 实例间事务性 Stack 传输、Compose 和持久数据迁移、可续传任务、显式完成迁移、计划冷副本、恢复快照和故障切换流程 |
| **安全与认证** | 按 Stack 和服务授权的受限本地账户、可选 TOTP 2FA、原生 OIDC 登录、可信代理认证、Cloudflare Turnstile、Trivy 漏洞扫描、CVE 例外和受保护的更新流程 |
| **监控** | 系统、Stack 和容器统计，可选每 5 分钟 CPU/RAM 历史，可配置状态栏，健康卡片，崩溃循环检测，健康检查自动修复，响应式/全屏日志，以及可选的 Kula、Dozzle、PowerWatch 和 PowerWatch Hub 集成 |
| **Docker 资源** | 受保护的统一清理（镜像、卷、网络和构建缓存）、精确补执行、预览、排除项、历史以及破坏性操作保护 |
| **搜索与文件** | 跨实例全局搜索、受限主机文件管理器、卷浏览、分块传输、文本编辑和文件日志查看 |
| **外部 Stack** | 检测并集成现有 Compose 项目、授权访问路径、查看实际容器，无需移动数据 |
| **自动化与审计** | 限权 REST API、按 Stack 的 Webhook、Home Assistant 集成、计划操作，以及记录来源、状态和耗时的集中历史 |
| **集成** | Zerobyte、PowerWatch 和 PowerWatch Hub、PlugNPiN 及用于 Nginx Proxy Manager、Pi-hole 和 AdGuard Home 的逐服务标签助手、Dozzle、Kula 和 Home Assistant |
| **外观** | 日夜配色、内置主题、浏览器偏好及仅图标或图标加文字的 Stack 操作 |
| **通知与访问** | 支持 EN/FR/ES/zh-CN 的 Discord 和 Apprise 通知、多实例识别、远程公告和第三方移动客户端 |

## 最新动态

<details>
<summary>查看最新变化</summary>

本节汇总近期最重要的变化，方便快速了解 Dockge-Enhanced 最近新增了什么。

### 🆕 2026 年 10 月

**原生 OIDC 登录：** 无需反向代理即可通过 Pocket ID、Authentik、Keycloak 或 Google 等 OpenID Connect 提供商登录，并与本地账户和 2FA 共存。通过 `DOCKGE_OIDC_*` 环境变量配置，使用带 PKCE 的授权码流程。新的 OIDC 用户为没有任何访问权限的受限账户，需由管理员授权，除非列在 `DOCKGE_OIDC_ADMIN_USERS` 中或属于 `DOCKGE_OIDC_ADMIN_GROUPS`；设置管理员组后，每次登录时角色都会随组成员关系同步。不存在“第一个用户自动成为管理员”的隐含规则：新安装时请先创建管理员或配置管理员映射。仅在 `DOCKGE_OIDC_LINK_EXISTING=true` 时才会关联已有本地账户。OIDC 登录不要求本地 TOTP 验证码，在 `disabled` 和 `trusted-proxy` 模式下 OIDC 会被忽略。如果设置 `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN=true`，请事先准备好恢复步骤。[指南](docs/oidc.zh-CN.md)。

**遵守镜像忽略设置：** ImageWatcher 会在 Registry 检查之后、下载之前以及重建容器之前再次检查**忽略**设置，包括已选中的计划更新和托管的 Dozzle 容器。手动批量更新中已过时的候选项也会被阻止。已开始的下载可以完成，但不会再进行重建；已经在运行的 Docker 重建不会被中断。

**受限本地账户：** 在**设置 → 安全 → 用户与权限**中创建受限账户，分别为每个本地或关联 Stack 授予查看状态、日志、启动、停止、重启、更新和重建权限。未选择即无权限。现有账户仍为管理员。独立工作区不提供 Compose/.env、终端、文件、删除、备份或设置访问。关联实例两端（包括反向代理）均需更新，旧代理不会绕过权限限制。权限绑定实例与 Stack 名称；复用名称时请重新检查权限。撤销权限会断开会话，但不会中止已开始的 Docker 操作。日志可能包含秘密信息。支持本地认证及可选的服务级权限，覆盖服务的所有副本并在重建后保留。用户可管理自己的密码、TOTP 和恢复码；管理员可重置 2FA 或仅删除账户。会影响网络命名空间依赖服务的操作将被拒绝，委托启动不会自动启动依赖服务。 使用可信代理认证时，每个代理身份都对应同名的本地账户；未知身份会被创建为没有任何授权的受限账户，新安装的第一个用户以及 `DOCKGE_AUTH_PROXY_ADMIN_USERS` 中列出的身份除外。[技术说明](docs/scoped-users.md)。

**Compose 模板与远程代理：** 支持命名的 HTTP/HTTPS 链接、可配置的默认 .env 模板、持久化代理标签与筛选，以及使用独立令牌的可选反向连接。本地账户初始化后，节点会自动连接。反向代理仅属于其中心服务器；服务器间数据传输仍需直接联合连接。 已有本地管理员账户即可，无需创建新账户。 [文档](docs/compose-and-reverse-agents.md).

**端口链接：** 在“设置 → 常规”中选择容器端口链接使用主机名还是 IP 地址。每个关联实例保留自己的选择，默认行为保持不变。 主机名模式优先使用配置的主机名，其次使用浏览器或代理地址。IP 模式使用已知 IP 或指定的可访问 IPv4/IPv6。未知 IP 时，端口徽章仍显示，但不提供链接，并带有提示说明。请分别配置各托管实例，并更新关联双方以支持此设置；旧代理保留原有行为。不修改 Docker 端口绑定、DNS 或已保存的主机名。

**TLS 安全与安全更新：** 针对 eMudhra 事件更新镜像中的证书库和 TLS 组件。测试覆盖受影响的证书链、两个 No CT 案例以及有效的 HTTPS 连接。正在运行的镜像保持不变；请在验证后安排替换。 镜像同时升级到 Node.js 26.12.1，以纳入 2026 年 10 月的 Node.js 安全版本；`follow-redirects` 和内置 Restic 构建也获得了安全修复。 [事件详情](https://emudhra.we-have-a-problem.com/) · [TLS 检查](security/emudhra/README.md)

**Compose 检查与 Home Assistant：** 保存或部署前提示端口冲突，支持解析变量、覆盖文件和端口范围；比较运行中的镜像引用并准备待审核的 YAML 修正。可选 Home Assistant 集成提供状态传感器和受权限限制的启动、停止、重启控制。 [Guide](docs/HOME-ASSISTANT.md).

**Instance / Global：** 首页先显示本地实例统计，下方显示不受 Stack 筛选影响的全局汇总。展开摘要卡片可查看各实例数据并直接打开对应菜单。离线或旧版本实例标记为不可用；备份汇总单独列出已禁用的实例。

**已发现 Stack 的服务状态：** DDEV 等已发现但尚未接管的 Compose 项目在 Stack 根目录中没有对应目录时，不再反复触发 `spawn docker ENOENT` 错误。已接管的外部 Stack 使用已登记的目录、项目名称和 Compose 文件查询服务状态。

**可选 TOTP 双重身份验证：** 在**设置 → 安全 → 双重身份验证设置**中输入当前密码，扫描二维码并输入身份验证应用的验证码以启用。请保存十个一次性恢复码；它们只显示一次。此功能默认关闭，仅保护本地登录，不影响可信代理认证或联合令牌。 启用双重身份验证前，请将关联实例改为使用联合令牌；仅使用密码的连接将不再有效。

请备份整个 `/app/data`，包括 `two-factor.key`。仅恢复数据库而没有此密钥时，无法解密身份验证密钥。如果身份验证应用和所有恢复码均已丢失，有容器访问权限的管理员可在 `/app` 中运行 `./node_modules/.bin/tsx ./extra/reset-two-factor.ts --username ACCOUNT --confirm`，然后重启 Enhanced；密码保持不变。

**按 Compose 服务显示 CPU/RAM 历史：** 在**监控**中启用记录，然后通过堆栈操作中的**资源用量**打开历史。紧凑图表显示 Stack 总量及每个 Compose 服务的历史，包括未托管的 Compose 项目。更新和重建容器后仍归入同一服务历史；同时运行的副本会在计算平均值和峰值之前按每次采样合计。已有测量数据保留，无需重置。支持 24 小时、7 天、1 个月、1 年或全部数据。记录默认关闭，每 5 分钟采样一次，无需保持浏览器打开。CPU 的 100% 表示一个核心；Linux RAM 不包含可回收缓存。采样中断保留为空缺，两次采样之间的峰值可能遗漏。Stack 总量不包含宿主机原生进程或 Compose 之外的容器。Stack 列表仍支持 CPU/RAM 排序。

**Zerobyte 备份**：在 **备份 → Zerobyte** 中连接现有实例或安装独立的 Compose 实例。可与原生 Restic 配合使用，也可接管计划备份，并使用独立仓库。支持配置向导、受保护的应用停止与重启、存储检查、独立测试恢复及只读多服务器状态。网络存储不可用时会阻止备份，不会自动使用本地备用目录。[配置与恢复指南](docs/zerobyte.zh-CN.md)。

**避免 Restic 备份自身仓库**：如果本地仓库位于所选备份目录内，Enhanced 会显示警告并自动排除它。例如，可以继续将 `/app/data` 作为备份来源，将 `/app/data/backups` 作为仓库。不能直接选择仓库本身或其子目录作为来源。现有路径、密码和保留设置保持不变。

**可选的逐服务健康检查助手**：查看现有 Stack 或创建新 Stack 时，点击服务上的 **配置健康检查**。助手会根据 Compose 内部端口建议本地 HTTP URL 或 TCP 端口。写入 YAML 前可以检查或修改目标及完整命令；不会自动替换现有健康检查。检查在镜像内部执行，因此需要 `/bin/sh` 以及 `curl`/`wget` 或 `nc`。部署后请确认健康状态；TCP 端口开放并不代表应用已准备就绪。

在 Compose 编辑模式下，Stack 操作栏中也有 **健康检查**。如果 Stack 包含多个服务，请先选择要配置的服务。

#### 更新与 ImageWatcher

**统一计划任务时区与可选容器 TZ：** 在 **设置 → 常规** 中选择 **计划任务时区**。它控制此实例的 Stack 启停、镜像更新、内部更新时段，以及原生 Restic 和安全扫描的 cron 任务。未明确选择时保留当前进程时区，不会重写已保存的计划时间。关联实例及 Zerobyte 等外部工具保留各自的设置。相对间隔、暂停截止时间和保留策略不变。夏令时遵循所选时区：不存在的本地时间不保证执行，重复的小时可能出现两次；建议使用过渡时段以外的时间，例如 04:00。

在 Stack 编辑操作中，**容器时区** 提供 **默认关闭** 的选项，将 `TZ` 添加到 Compose 草稿及 override。已有或继承的值（包括可能来自 `env_file`/`extends` 的值）需要确认。请检查 YAML，保存后重新创建/部署容器。镜像必须支持 `TZ`。不会修改 `.env`/`env_file` 文件；以后更改全局时区也不会自动重写 Stack 或重建容器。

**镜像更新通知：** Discord 和 Apprise 对同一 Stack、镜像和远程摘要的待更新版本只通知一次，包括等待计划时段的更新。此记录在 Enhanced 重启后仍然保留。检测到新的摘要会再次通知；自动更新结果仍会单独通知。发送失败后会在后续检查中重试，每个 Discord Webhook 和已配置的 Apprise 目标分别记录发送结果。

**已停止的服务保持停止**：如果目标 Compose 服务或所需的网络命名空间配套服务已停止或不存在，自动镜像更新会推迟。ImageWatcher 在下载后、重建前再次检查，并在后续检查中重试。它不会通过 `compose up` 启动已停止的服务。

**检查间隔**：在 **Watcher > Images** 中，完整扫描默认每 **6 小时**检查所有镜像。**立即模式**镜像还会默认每 **5 分钟**接受一次定向检查。定向检查间隔可按分钟或小时设置（5 分钟至 24 小时），也可单独禁用；完整扫描仍会运行。选择立即模式时仍可触发一次定向检查。

**macOS 主机绑定挂载准备**

启动或更新 Stack 前，Enhanced 会让 Docker 直接准备每个目录绑定挂载的源路径。这样也能处理 Docker Desktop 在 macOS 上共享的 `/Users/...` 等路径，而不再假设将 `/` 挂载到辅助容器就能看到 macOS 文件系统。`/etc/localtime` 等文件挂载不会被当作目录创建。如果 Docker 无法访问源路径，操作会停止并显示 Docker 返回的实际错误；请检查该目录是否已与 Docker Desktop 共享。

**自更新磁盘空间与旧版镜像保留**

备份或拉取前，自更新会检查 Docker 守护进程存储文件系统的可用空间。空间不足或无法验证时，自动更新将延期；手动更新会停止并说明原因。任一阶段消失的 updater 都会被检测到；拉取超过 20 分钟仍在运行时会提示检查，而不会误报其已停止。成功更新后，每天检查通过 digest 拉取的旧版未使用 Enhanced 镜像，达到 48 小时后可予以删除。当前、回滚、恢复及明确排除的镜像仍受保护；此机制不会启用一般镜像自动清理。

**ImageWatcher 与 Self-Update 更安全的协调机制**

只读取 Registry 和 DNS 的检查不再延迟 Dockge-Enhanced 自更新。镜像更新、回滚和回滚标签清理等会修改 Docker 的操作，与 Self-Update 共用独占预约：冲突操作会推迟，不会并行执行。`scheduled` 状态不会无故阻止 ImageWatcher；重启后，持久化的更新状态继续保护独立 sidecar。更新面板优先显示正在执行的操作，而不是过期的更新提示。

**应用栈镜像批量自动更新**

现在可以一次性为应用栈内符合条件的镜像设置**关闭**、**立即**或**定时**更新规则。预览会列出变更；可选择**保留已有例外**（默认）或覆盖。通过 `dockge.imageupdates.check=false` 排除的服务始终受保护，共用镜像会去重，关联实例使用相同的服务端校验。新加入的镜像不会自动继承此规则。

**ImageWatcher：更快速、更可靠的即时更新**

对于设为**立即更新**的镜像，ImageWatcher 会在启用时立即执行定向检查，随后每 **5 分钟**检查一次，而无需提高全局扫描频率。当多个 Stack 共用同一个 `:latest` 镜像时，Enhanced 会检查**每个容器实际运行的镜像**，而非仅检查本地标签；仍使用旧版本的服务不会再被错误判定为最新。相同镜像的 Registry 请求会合并；遇到 HTTP 429 限流时会等待，并在日志中汇总每次定向检查。暂停、维护窗口和回滚保护继续生效。

**按服务排除状态与镜像更新**

可视化 Compose 编辑器可添加 `dockge.status.ignore: "true"`，使可选服务在部署后不再影响应用栈整体状态，同时仍显示该服务自身状态。还可添加 `dockge.imageupdates.check: "false"`，将服务排除在 ImageWatcher 检测以及自动或批量镜像更新之外；仍可明确手动更新该服务。现有服务标签及其 YAML 语法会被保留。功能灵感来自 [hamphh/dockge](https://github.com/hamphh/dockge)。

**更新所有可用的 Docker 镜像**

更新页面通过现有的 Compose 更新与回滚流程逐个处理检测到的镜像，显示进度并在首次失败时停止。Dockge-Enhanced 自身更新仍单独进行。

**ImageWatcher 错误诊断与元数据 (#493–#495)**

镜像页面可将错误排在前面；暂时不可访问的目标不会被直接删除，清单超时采用有限次数重试，Registry/认证/Digest 错误提示更明确。仅在更新实际应用并确认后更新 Stack 时间戳。

**Stack 与镜像更新操作界面 (#489–#490)**

Stack 批量自动更新设置移至操作栏中的弹窗，容器各自的设置不变。镜像更新、忽略、暂停和回滚操作改为紧凑按钮，并保留辅助功能标签。

**镜像仓库检查的备用 DNS**

在 **Watcher > Images > 备用 DNS** 中，可启用备用 DNS（默认关闭）、添加/编辑/删除 IPv4 或 IPv6 服务器，并测试 A/AAAA 查询、耗时和诊断信息。始终优先使用系统 DNS；只有 ImageWatcher 对仓库和令牌服务的受支持 HTTP 请求发生 DNS 解析失败时才会使用备用服务器。默认示例为 Quad9（`9.9.9.9`、`2620:fe::fe`）和 Cloudflare（`1.1.1.1`、`2606:4700:4700::1111`），均可修改。已有配置不会被覆盖。不会修改主机或 Docker Engine 的 DNS；Docker Engine 自行执行的拉取与自动更新不受此功能影响。

**通过 Docker Socket Proxy 自更新**

自更新检查和更新 sidecar 会使用 Enhanced 实际采用的 Docker endpoint：Unix 套接字（包括 `DOCKGE_DOCKER_SOCKET`），或位于可信 Docker Socket Proxy 之后的 `DOCKER_HOST=tcp://…`。TCP 模式下不会挂载虚设的套接字；sidecar 会先接入实例的 Docker 网络，然后才处理已签名的更新计划。代理需要允许的权限见下文“Dockge-Enhanced 自动更新流程”。

#### 备份、清理与可靠性

**更快且可抵抗并发竞争的 Docker 镜像清理**

批量清理现在只加载一次 Docker 清单，并在每次 `docker rmi` 前仅重新验证目标镜像。资源页不再为了显示列表而执行包含全部镜像的大型 `docker image inspect`；镜像检查改为有界批次，并允许镜像在并发清理期间消失；过期回滚清理也使用同一个 Docker 清理锁。容器、回滚/恢复以及宽限期保护保持不变。

**清理现在使用 Docker 的真实镜像引用**

未使用镜像清理不再假定 `docker images` 显示的 `Repository:Tag` 一定是实际附加且可删除的引用。系统会使用检查结果中的 `RepoTags` 和 `RepoDigests`，按需移除所有真实引用；必要时再安全回退到 Image ID，并验证物理镜像确实消失。容器占用、排除项、当前 Enhanced、恢复、回滚和宽限期保护保持不变。

**清理报告现与 Docker 实际观察到的状态一致**

当批量检查未返回某个镜像时，清理流程会先直接检查其 Image ID，再决定是否将其标记为不存在。每次删除都会再次验证，并由一次轻量级的最终 Docker 清单确认报告结果。资源页现在分别显示 Docker 使用状态和清理状态：`未使用` 的镜像仍可能是当前 Enhanced 镜像、受恢复或回滚保护、时间过短或已排除。无标签镜像会以中性的 **无标签镜像** 描述，不再笼统称为旧镜像。整个流程仍限制为一次初始清单、定向检查和一次轻量级最终验证。

**可靠清理旧版 Dockge-Enhanced `<none>` 镜像**

旧的 `ghcr.io/aerya/dockge-enhanced:<none>` 镜像现在直接从 Docker 镜像清单中识别，不再依赖重新标记后可能缺失的 `RepoDigests` 元数据。超过 self-update 48 小时安全保护期的旧镜像因此可以可靠清理，同时继续保护当前活动镜像和恢复所需镜像。清理摘要也不再把正常被容器使用的镜像计入“受保护的清理候选”。

**未使用的 `repository:<none>` 镜像现在会被真正清理**

Docker 可能会保留镜像的 repository 名称，但把 tag 变成 `<none>`。此前这类镜像既不属于真正的 dangling（`<none>:<none>`），也不会进入带标签的未使用镜像清理流程，因此按钮和定时清理都可能长期留下它们。现在系统会按 Image ID 将其作为未使用镜像处理，同时继续遵守容器引用、排除项、回滚/恢复保护和宽限期。旧 Dockge-Enhanced 镜像仍额外保留 self-update 的 48 小时安全保护。

**旧版 Dockge-Enhanced 镜像按各自年龄清理**

通过 digest 拉取后留下的旧 `ghcr.io/aerya/dockge-enhanced:<none>` 镜像现在会独立计算清理年龄。新的成功自更新不会再把所有旧 Enhanced 镜像的 48 小时等待时间重新归零；每个旧镜像都按自身创建时间判断，同时继续保护当前正在使用的镜像和恢复快照。如果统一 Docker 清理配置了更长的宽限期，则仍以更长的时间为准。

**统一 Docker 清理与精确补跑**

“Docker 资源”的镜像页、清理预览和清理任务现在共用同一个 Image ID 清单。手动与自动清理使用相同宽限期，同一物理镜像的多个标签只计一次；清理过程中已经消失的镜像不会再造成失败。已停止容器的镜像以及回滚/恢复资源继续受到保护。镜像、网络、卷和构建缓存可独立选择，结果按类别写入历史；系统每 15 分钟检查精确到期时间，并在休眠或重启后只补跑一次。启用统一清理时，旧的镜像自动清理设置会暂停但不会被删除。

**Restic 初始化和界面改善 (#491)**

保存配置、立即备份和维护操作分开呈现；仓库状态和保留策略说明更清晰，并强化初始化保护。

**英文环境下的后端消息 (#477)**

Restic 密码错误、清理审计摘要和自动更新消息不再错误地以法语显示在英文安装中。

**配置 HTTP 代理时的健康检查**

容器内置健康检查会忽略代理变量并直接访问 `127.0.0.1`，因此已配置或不可达的代理不会再把 Enhanced 标记为不健康。其他网络访问仍使用已配置的代理。

#### 监控与集成

**可选的 PowerWatch 功耗监控**

[PowerWatch](https://github.com/Aerya/PowerWatch) 现在支持两种模式：**外部**模式只读取现有的本地容器或 HTTP(S) 地址，绝不会控制它；**托管**模式则由 Dockge-Enhanced 部署为真实的 Compose Stack。托管安装会检测主机的 RAPL、MSR 和 NVIDIA 能力，只启用必要权限，绝不使用 `privileged: true`，并在停止或停用后继续保留持久卷中的历史与设置。

整机当前功率、可信度和 WebUI 直达链接会通过现有联邦通道显示在 Monitoring、系统状态栏和紧凑的关联实例摘要中。系统状态栏和实例卡片仅在电力图标旁显示瓦数；工具提示会标明 PowerWatch 以及 Measured 或 Estimated 可信度。PowerWatch 会根据可用传感器进行测量或估算。

也可以直接通过 Enhanced 安装和管理可选的 **PowerWatch Hub**，或通过现有 Hub 的 WebUI 地址连接。Hub 是独立服务：它在自己的仪表板中聚合既有 PowerWatch 的私有 HTTP API，无需主机硬件权限。Dockge-Enhanced 只提供一个全局 Hub 链接，不会为每个关联实例重复显示。PowerWatch 现已支持**可选的原生身份验证**（默认关闭）以及只读 Bearer API 令牌。**Enhanced 现在支持只读 Bearer 令牌**，可直接读取受保护的 PowerWatch 实例。在 **Monitoring → PowerWatch → 只读 API 令牌** 中输入令牌；保存后令牌保持隐藏，且不会发送给 Hub。Hub 另有可选的管理操作令牌保护。请勿将未受保护的界面暴露到公网。

**可选监控服务：Kula、Dozzle、PowerWatch 和 Hub**

在 **Monitoring** (`/watcher/monitoring`) 页面中，四项第三方服务以独立且统一的卡片呈现，包含说明及 GitHub 链接。PowerWatch 和 Hub 均可连接外部实例或由 Enhanced 管理安装，并支持安装、启动、重启、停止及连接测试。托管 Hub 使用 PowerWatch 镜像中的 `powerwatch-hub` 程序，默认监听 `127.0.0.1:3065`，数据保存在独立 Docker 卷中。

连接**现有 PowerWatch** 时，只需在 PowerWatch 地址中填写其常用 **WebUI 地址**（例如 `http://192.168.0.64:3064`）；Enhanced 会自动访问同一地址下的 `/api/snapshot`。只有特殊反向代理配置才需要在高级选项中填写独立 WebUI 地址。连接**现有 Hub** 也只需填写其 WebUI 地址；Enhanced 会自动访问 `/api/hub/snapshot`。

**可选的主机 CPU/RAM 历史**

Monitoring 可在没有浏览器打开时每 5 分钟记录一次轻量级主机 CPU/RAM 样本。响应式 SVG 图表支持 24 小时、7 天、1 个月和自定义范围；所选显示周期可以保存，并在下次打开时恢复。长时间范围会在服务端聚合，停机时间以空档显示。记录功能默认关闭；明确启用后，即使在低功耗模式下也会继续。

可选的 CPU/RAM 历史会保留真实的采样空档，但使用受 PowerWatch 启发的更紧凑图表，网格线更浅，并带有柔和的填充区域。

#### Stack、界面与易用性

**Stack 操作直接可用**

所有 Stack 操作都直接显示在操作栏中，不再使用子菜单，按视觉分组并根据可用宽度自动换行。“仅图标”和“图标加文字”模式都保留提示；命令、可用条件和确认步骤保持不变。

**德语界面**

界面和更新说明提供德语版本，并新增德语 README 和更新日志。选择德语时，Discord 和 Apprise 通知回退为英语。

**首页容器计数**

首页显示运行中、已停止和已暂停的容器，包括可访问的关联实例。Stack 和容器计数会跟随 Stack 列表的实例筛选。

**更安全的 Stack 启动与即时镜像检查**

在启动、部署或重建前，如果绝对 bind mount 明确指向目录，Enhanced 现在会自动准备缺失的主机目录。这对 Synology NAS 尤其有用，因为 Docker 会拒绝尚不存在的 bind 源。疑似文件的 bind 源不会被自动创建为目录。镜像的 **立即** 自动更新模式在保存后会立刻执行针对该镜像的检查。Stack 重启成功后，Enhanced 还会重新读取真实状态并隐藏已经过期的 Compose 进度输出。

**更整洁的 Compose 卷与日志**

已挂载卷和实际容器使用紧凑行显示，不再是整行宽度的可点击条。日志面板将三个筛选器纵向排列，操作按钮分组，搜索放在最后；辅助技术仍可读取筛选器名称。外观设置可以为当前浏览器默认启用日志时间戳。

**日间与夜间配色**

外观设置现在为浅色和深色模式提供独立配色：四种日间方案和八种夜间方案，包括原有主题。Catppuccin、Nord、Solarized、Dracula、Gruvbox、Tokyo Night 和 Rosé Pine 会为页面、页眉、面板和控件重新着色；所选配色保存在浏览器中，“自动”模式仍跟随系统主题。

**更稳定的关联实例连接**

添加或修改关联实例时，浏览器会话刷新不再断开联邦连接。同步网状网络及重启后，两个实例仍保持在线。

**密码管理器**

创建账户时，用户名和新密码字段现在可由浏览器密码管理器正确识别。

**Stack 操作与 Compose 创建**

暂停／恢复 Stack 不会删除容器卷。Stack 暂停期间自动镜像更新会等待恢复；Restic 备份或还原运行时禁止暂停／恢复，Enhanced 自身及使用停止服务或钩子备份策略的 Stack 不能暂停。常规设置新增仅适用于新 Stack 的默认 Compose 模板。Stack 的 README.md 改由操作按钮打开，容器操作图标提供说明提示。现有的 `tmpfs` 八进制模式保护和 Compose 变量高亮保持不变。

**更清晰的 Stack 操作**

Stack 按钮现在说明实际执行的命令。帮助面板展示所选 Stack 的 Docker Compose 命令，包括项目和 Compose 文件参数，并提供 Docker 官方文档链接。原“停止并置于非活动状态”按钮改为“移除 Stack 容器”：确认后执行 `docker compose down`，删除容器和 Compose 网络，但不会删除命名卷、绑定挂载数据、Compose 文件或镜像。匿名卷可能不会在下一次 `up` 时重新挂载。

**Stack 显示名称**

现在可以在 Stack 页面设置 Web UI 显示名称。技术名称、Compose 项目、备份选择和恢复路径均不改变；技术名称仍显示在别名旁边。

**实际容器视图**

每个 Compose 服务现在会分别列出实际容器，包括副本。打开容器后可查看状态、健康检查、镜像、端口、资源使用和最近的日志，也可仅对该容器执行启动、停止或重启；服务级操作保持不变。此功能受到 [Lorwell/dockge](https://github.com/Lorwell/dockge) 启发。

**可选的主机文件管理器**

启用后，“文件”页面可浏览指定的主机目录、编辑小型 UTF-8 文件、传输文件并查看文件日志，也支持关联的 Enhanced 实例。它与各 Stack 的卷浏览器不同，不能访问授权根目录之外的路径。

仅将需要开放的目录挂载到 Enhanced，并把 `DOCKGE_FILE_MANAGER_ROOT` 设为**容器内路径**。例如在 `volumes:` 下添加 `- /srv/shared:/managed-files`，在 `environment:` 下添加 `DOCKGE_FILE_MANAGER_ROOT: /managed-files`。未配置时此功能保持关闭；**不要挂载 `/` 或范围过大的主机目录**。关闭身份验证时也会拒绝文件操作。可选的 `DOCKGE_FILE_MANAGER_MAX_FILE_SIZE` 限制传输大小（默认 100 MiB），在线文本编辑限制为 1 MiB。每个关联实例都需要单独配置挂载和路径。

**容器终端中的复制与粘贴**

右键现在会打开终端的原生复制/粘贴菜单。在本地 HTTP 地址上也可使用键盘快捷键粘贴，无需依赖浏览器剪贴板 API。

**受管理 Stack 的 README.md**

现在可以在 Stack 页面查看和编辑与 Compose 文件同目录的 Markdown `README.md`。它与简短的 Stack 备注相互独立，并会在复制或迁移到其他 Dockge-Enhanced 实例时一同传输。此功能不会修改外部 Stack。

### 🆕 2026 年 9 月

**更可靠的自动镜像清理**

即使上次清理在计划时间后几秒钟才结束，自动清理也不会跳过下一个计划时段。任何容器（包括已停止的容器）使用的镜像以及回滚镜像都会保留。成功自更新至少 48 小时后，按 digest 拉取的旧版 Dockge-Enhanced 镜像可在下一次清理中删除，同时保留当前镜像和恢复镜像。最近一次清理中的 Docker 错误会显示在“Docker 资源”页面。

**避免夜间刷屏的联邦可用性告警**

断路器可用性通知现在按一次连续离线事件管理：只要关联实例持续离线，每个 Dockge 实例最多发送一次告警；只有对端重新成功认证并恢复在线后，告警才会重新启用。每个远程实例还可以在本机标记为 **间歇性机器 — 不可用时不发送告警**。该模式适用于经常关机或休眠的台式机、笔记本等节点；自动重连、退避和断路器保护仍会继续工作。由于这是本地偏好，需要在每台常开且不希望收到该告警的 Dockge 实例上标记相应的间歇性节点。

**进程级共享联邦传输**

联邦现在由每个 Dockge-Enhanced 进程共享一套出站传输，而不是每个 WebUI socket 各自建立连接。服务器开始监听后会从 SQLite 加载关联实例并自动连接。打开多个 WebUI 不会再成倍创建远程 socket，关闭最后一个浏览器也不会断开关联实例；约 5 分钟后的断路器重试即使在没有 WebUI 打开时也会继续。凭据变更、mesh 修复或删除 peer 会立即重新同步共享传输。

**联邦重连风暴防护**

联邦 socket 现在使用轻量认证路径，不再执行 WebUI 的 Stack/代理初始化。Socket.IO 重连被明确限制，并使用指数退避、随机抖动和 5 分钟断路器。过量入站联邦握手会在认证前被拒绝，同时限制并发入站联邦 socket 数量。如果重连保护触发或检测到 SQLite/Knex 争用，现有 Discord/Apprise 配置会在不查询 SQLite 的情况下发送限频告警。

**网络命名空间安全的定向更新**

定向镜像更新、服务重新创建和镜像回滚现在会在替换容器前解析完整的 Compose 模型。当其他服务通过 `network_mode: service:<service>` 或 `network_mode: container:<container_name>` 共享其网络命名空间时，所有直接和间接消费者都会与提供者一起在一次定向 Compose 操作中强制重新创建。无关服务不会受到影响，VPN、Gluetun 和 sidecar Stack 也不会再保留已删除容器的旧网络命名空间。

**外部 Stack（Beta）**

Enhanced 现在可以检测现有 Docker Compose 项目，并在**不移动 Compose/.env 或数据**的情况下将其接管，之后可从常规 Stack 界面管理。如果源路径尚未对 Enhanced 可见，可通过受保护的一键授权自动更新 Enhanced 自身的 Compose。已接管的 Stack 会显示 **外部** 标记；删除源文件需要额外的明确确认。 扫描器还会将 Enhanced 的 Stack 目录与主机侧 bind 挂载进行对应，因此即使 Docker Compose 标签记录的是主机路径，已经由当前实例管理的 Stack 也会被排除。

选择永久删除源目录时，Enhanced 现在会通过受保护的 helper 从自身 Compose 中移除源 bind 和授权条目，仅重新创建自身容器，然后删除主机目录。这样可避免删除仍作为 Enhanced 挂载点的目录时出现 `EBUSY` 错误。

一个明确支持的场景是 [Gluetun-Companion](https://github.com/Aerya/Gluetun-Companion)：它可以通过 bind 挂载的 `/compose` 路径重新创建已经由 Enhanced 管理的 Gluetun Stack。Enhanced 现在会把这种 Compose 路径别名映射回原生 Stack，不再错误地将其作为外部 Stack 提供接管。

**匿名安装计数**

为了在不运行独立分析服务的情况下大致了解真正活跃的 Dockge-Enhanced 安装数量，Enhanced 每月最多下载一次托管在专用 GitHub Release 中的极小技术文件。计数仅使用 GitHub 为该月 asset 提供的公开 `download_count` 聚合值。

此计数不会生成或发送任何安装标识符。请求中不包含 hostname、实例名称、Stack、容器、Docker 镜像、配置、路径、GitHub 账户、电子邮件、架构或 build 标识。与任何 GitHub asset 下载一样，连接本身由 GitHub 处理；Dockge-Enhanced 不会接收或存储安装实例的 IP 地址。

已计数的月份只保存在本地数据目录中，以确保同一安装每月最多下载一次该 asset。计数默认启用，可通过 `DOCKGE_USAGE_COUNT=false` 禁用。重新创建或删除数据目录可能使同一安装在当月再次被计数，因此该数字有意保持为近似值。

整个机制完全公开：[Enhanced 端代码](./backend/anonymous-install-count.ts)、[创建每月 asset 的 GitHub workflow](./.github/workflows/usage-count-asset.yml)以及[每月聚合计数](https://github.com/Aerya/Dockge-Enhanced/releases/tag/usage-count)。

仓库所有者可以添加名为 `USAGE_COUNT_DISCORD_WEBHOOK` 的 Actions Secret，以便每周一接收当月暂定计数，并在每月第一天接收上个月的最终计数。也可以手动运行 workflow，立即发送当前计数。Webhook 值由 GitHub 加密，绝不会提交到仓库。

**多实例全局搜索 V2（`Ctrl+K`）**

全局搜索现在支持用于小型输入错误的**模糊匹配**，以及 `type:`、`stack:`、`image:`、`port:`、`instance:` 和 `is:update`、`is:stopped`、`is:vulnerable`、`is:critical`、`is:backup-failed` 等辅助筛选。面板会直接显示可点击的操作符提示，无需记忆语法。Compose 和 `.env` 结果会打开对应 Stack，并让 CodeMirror 直接定位到匹配行。最近搜索和固定搜索只保存在当前浏览器中。

用户可显式启用对**最近 Restic 快照**中的历史配置搜索；为保护远程仓库，每个实例最多检查最近 5 个快照和 80 个 Compose/.env 文件。对 **`.env` 值**的搜索同样必须显式开启：值只参与匹配，绝不会返回或显示；启用该敏感模式后，查询也不会保存到最近搜索或收藏中。关联实例优先使用 V2 协议，旧实例的简单搜索仍可回退到 V1。

**编辑 Compose/.env 时保护自动更新**

当 WebUI 中的 compose、override 或 `.env` 存在尚未保存的更改时，所属 Dockge-Enhanced 实例会暂时阻止自身自动更新，即使该编辑来自另一台关联 WebUI。编辑器通过短时 heartbeat lease 保持状态，遗留浏览器会话会自动过期。如果更新在存在未保存内容时准备就绪，用户可在对话框中选择**保存并更新**、**推迟 30 分钟**、**推迟 1 小时**或**继续编辑**。后端还会在准备和启动 updater sidecar 前再次检查阻塞状态，避免在备份或校验期间开始的新编辑被重启中断。

**首页关联实例概览**

首页现有的代理面板现在也作为紧凑的基础设施概览。每个关联的 Dockge-Enhanced 实例都会显示其堆栈总数和状态、主机 CPU/RAM 使用率、运行时间以及固定堆栈数量，同时保留重命名、重新认证、删除和添加代理等现有操作。点击某个实例摘要会将左侧堆栈列表筛选到该服务器，再次点击则恢复所有服务器视图。

**关联实例之间的堆栈 CPU/RAM 统计**

**显示每个堆栈的 CPU / 内存统计** 选项现在归属于各个 Dockge-Enhanced 实例。某服务器启用该选项后，会在本机采集 Docker 统计，并通过现有的关联实例通道提供数据。任何显示该服务器的关联 WebUI 都会为其堆栈和容器显示相同的 CPU/RAM 指标。隐藏服务器会隐藏其统计；在所属实例上关闭该选项则会停止该实例的采集和数据提供。

**关联实例之间持久化的固定堆栈**

固定堆栈现在归属于实际托管它的 Dockge-Enhanced 实例，而不是某个浏览器的 `localStorage`。在 Garuda、DockerLab 或 LincStation 上固定堆栈时，偏好会保存到对应服务器。任何显示该服务器的关联 WebUI 都会看到相同的固定堆栈；隐藏服务器只会隐藏其固定项，不会删除它们。因此固定状态可跨退出/重新登录、更换浏览器和 Dockge-Enhanced 更新保留。旧的浏览器本地固定状态会在所属实例可访问时自动迁移。

**self-update 备份独立保留策略**

Dockge-Enhanced 在受保护的自动更新前创建的强制 Restic 快照现在使用独立保留策略。新快照**创建并验证成功后**，系统会为当前安装保留**最近 2 个 self-update 快照**，并在启动 updater sidecar 前删除更旧的版本。稳定的安装专属标签可避免在多个 Dockge-Enhanced 实例共享同一 Restic 仓库时误删其他实例的快照。普通备份的保留策略（`keepLast`、每日、每周、每月）保持不变。如果独立清理失败，已验证的备份仍会保留，更新可以继续；错误会写入日志，并在后续自动更新时再次尝试清理。

**Docker Compose 项目名称匹配改进**

当受管理 Stack 的目录名包含点号或大写字母时，现在会根据实际的 `ConfigFiles` 路径与 Docker Compose 进行匹配，而不再仅依赖 Docker 规范化后的项目名称。这样可避免同一个 Stack 同时出现“受管理/已停止”和“外部/运行中”的重复条目。

**支持 Compose 长格式端口语法**

容器卡片现在同时支持 Compose 的短格式和长格式端口定义。使用 `published`、`target`、`protocol`、`mode` 或 `host_ip` 的配置不再触发 `split is not a function`，也不会再导致容器卡片消失。IPv6 `host_ip` 也会在生成的链接中正确格式化。

**Compose YAML 修复与格式化**

Stack 编辑器现在为 `compose.yaml` 提供 **修复 / 格式化 YAML** 操作。有效文档会统一为 **2 个空格**缩进；若 YAML 因常见的 Compose 缩进错误而无效，Dockge-Enhanced 会尝试重新对齐服务键与列表（`services`、服务选项、`environment`、`ports`、`volumes`、`healthcheck.test` 等），验证修复结果后再格式化。注释以及带前导零的 `tmpfs.mode` 权限值会被保留。若无法安全修复，则保持原内容不变并显示错误。

**Compose 编辑器保留 tmpfs 权限模式**

可视化 Compose 编辑器在重新生成 YAML 时会保留 `tmpfs.mode: 01777` 这类带前导零的八进制权限值。修改其他字段时不会再静默地将该权限重写为 `1777`。

**加强 Stack 路径遍历防护**

后端操作现在会在解析任何路径之前验证传入的 Stack 名称，包括主动跳过文件系统发现的代码路径。类似 `../outside` 的恶意名称无法再逃离受管理的 Stack 目录，从而访问其他应用的 Compose 或 `.env` 文件。

**受保护的 Dockge-Enhanced 自动更新**

Dockge-Enhanced 现在可以通过受严格限制的 sidecar 自动更新。替换容器前必须完成 Restic 备份和仓库完整性检查，新版本必须通过可用性检查，否则自动恢复之前的镜像。

Updater 同时支持普通 Unix socket（包括 `DOCKGE_DOCKER_SOCKET`）以及使用 `DOCKER_HOST=tcp://proxy:2375` 的受信任 Docker Socket Proxy。TCP 模式不会挂载 socket：sidecar 启动时先接入 Enhanced 的一个 Docker 网络，再连接其余网络；只有全部网络连接完成并收到启动信号后，才会执行已签名的计划。Docker 端点保持不变。代理必须允许容器检查、创建、启动、停止和删除，镜像检查/拉取以及网络连接；只读代理不能执行 self-update。未加密的 TCP 端点只能位于受信任的内部网络。若证书目录已挂载到 Enhanced，会保留 TLS 设置；否则更新会在替换前安全停止。

**远程服务器镜像更新状态**

镜像更新信息分别从每个已连接实例获取，因此远程 Stack 可以显示自己的更新标记。

**清晰的 build 标识与更新进度**

“更新”页面通过 OCI 元数据识别 build，并统一显示更新阶段、Restic 进度和已用时间。

**远程公告**

Dockge-Enhanced 现在可以显示**从此 GitHub 仓库发布的纯文本运维公告**，并且该通道独立于 Docker 镜像更新机制。这个安全通道是在 2026 年 8 月底至 9 月初的自动更新事故之后加入的：如果未来某个构建出现严重问题，受影响的已安装版本可以收到警告，而不必等待同一个更新机制先恢复正常。

公告来自 [`remote-announcements.json`](remote-announcements.json)。公告是可选的，仅通过 HTTPS 获取，经过严格结构校验，并限制大小和数量；还可以按应用版本、Git 修订或 OCI 构建日期定向发布。公告**不能执行命令、注入 HTML 或触发更新**。可点击链接仅允许指向 Dockge-Enhanced 的 GitHub 仓库。如果 GitHub 不可用或公告文档无效，Dockge-Enhanced 只会不显示公告，不影响其他功能。

关闭公告只会在当前浏览器会话中隐藏它。选择**不再显示**会把公告 ID 保存到 Dockge-Enhanced 的持久化数据目录；发布新的公告时使用新的 ID。

**关联实例兼容性**

**复制**、**移动**和**副本**会协商一个独立于构建 SHA 的**传输协议**。只要协议兼容，不同构建仍可继续。协议不兼容时不会开始任何传输。足够新的远程实例可以通过 WebUI 使用正常自更新流程（Restic 备份、Sidecar、健康检查和失败回滚）进行更新，Dockge-Enhanced 最多等待 **2 小时**让它重新连接后再继续。过旧、无法响应握手的版本需要手动更新。持久副本会进入**等待兼容**状态，大约每 10 分钟重试一次，期间不会修改数据。

**永久显示本地实例标识**

Dockge Agents 中配置的**本地实例名称**现在会始终显示在桌面/移动端顶部栏和浏览器标签标题中（`实例名称 · Dockge-Enhanced`）。若未设置名称，则使用主机地址（`IP:端口` 或域名）作为后备标识，无需新增设置。

**未读更新日志**

更新说明弹窗现在会单独跟踪每个 release 条目。如果在未打开 WebUI 的情况下连续安装了多次自动更新，下次访问时会显示**所有累积的更新内容**。仅打开或刷新页面不会将内容标记为已读；只有用户明确关闭弹窗时，当前显示的条目才会被确认。已读状态基于 release ID，不再依赖条目在列表中的位置。旧的 `releaseNewsSeen` 标记会自动迁移，同时避免向现有用户重新显示全部历史记录。

### 2026 年 8 月

**事务式 Stack 迁移与复制**

请**直接在源实例**创建新的复制策略。策略保存在创建它的实例上，不会自动在关联实例之间共享。从其他实例创建的旧策略仍可在那里管理；创建替代策略前，请手动检查并移除重复的旧策略。此更改不会自动删除策略或副本数据。

查看关联的源堆栈时，Enhanced 会只读显示源实例的复制状态，并与当前实例管理的旧策略分开展示。策略配置详情不会发送到关联视图。

Stack 可连同 Compose 配置和持久化数据在实例之间复制或移动，支持恢复、验证和 rollback。

**主机前置条件与自动恢复**

Stack 可以要求主机挂载点或 `systemd` 服务可用后再启动。

**响应式界面与增强监控**

Stack 导航、Logs/Compose、资源指标、健康卡片、主题和移动端显示均得到改进。

➡️ **[查看完整更新日志](CHANGELOG.zh-CN.md)**

</details>

---

## 功能目录

<details>
<summary>查看全部功能</summary>

### 多服务器与联邦
- Dockge-Enhanced 实例之间的全网格联邦，可从任意关联 WebUI 管理
- 为 NAT/CGNAT 后的主机提供可选反向连接：每个节点独立令牌、自动接入和撤销；反向代理只属于其中心服务器（[指南](docs/compose-and-reverse-agents.md)）
- 持久化代理标签和标签筛选，可与实例筛选组合使用
- Stack 列表中的服务器选择、分组和稳定配色
- 首页关联实例概览，包含 Instance / Global 统计、可达性和各 WebUI 直达链接
- 每个实例提供各自的 Stack 状态、镜像更新标记和按 Stack 的 CPU/RAM 统计
- 专用联邦令牌、断开链接修复，刷新浏览器时保持联邦连接
- 进程级联邦传输，带有受限重连、断路器，每次故障只发送一次可用性告警
- 可将经常关机的设备排除在可用性告警之外
- 不同 Dockge-Enhanced 版本之间协商传输协议
- 每个实例可选择端口链接使用主机名还是 IP 地址

### Stack 管理
- 创建、编辑、启动、停止、重启、更新、重建、暂停/恢复和拆除 Compose Stack
- 直接可用的 Stack 操作栏，支持仅图标或图标加文字，并说明实际执行的 Compose 命令
- 按服务和按容器操作，包括实际容器和 Compose 副本
- 通过 `service:` 或 `container:` 共享 VPN/网络命名空间的直接和间接服务会自动重建
- 本地构建镜像的 Build + Recreate
- Stack 和容器的计划启动/停止
- 主机启动前置条件（挂载点和 `systemd` 服务），可选监控与恢复
- 固定 Stack 保存在服务器上，并在关联 WebUI 之间共享
- 可选 WebUI 显示名称，不改变 Compose 项目或 Restic 标识
- Stack 备注、Markdown `README.md` 和 Git 工具
- 按名称、状态、实例、创建日期、最后更新、CPU 或 RAM 排序
- 可折叠、可调整宽度的 Stack 侧栏，带紧凑的状态、CPU 和 RAM 指示，以及灵活的日志/Compose 工作区
- 匹配 Compose 项目名称，目录名包含点或大写字母时不会产生重复 Stack
- 发现并接管外部 Compose Stack，无需移动文件或数据，并提供受保护的路径授权
- 可选彻底删除已接管的外部 Stack，并按标签清理损坏的外部 Stack，均需加强确认
- 可按服务设置在 Stack 整体状态中忽略某个可选服务

### Compose 编辑
- Compose、`compose.override.yaml` 和 `.env` 编辑器，支持变量高亮、折叠、搜索和全屏
- 经过校验的默认 Compose 和 `.env` 模板，仅用于新建 Stack
- Stack 的命名 HTTP/HTTPS 链接
- “修复 / 格式化 YAML”操作，保留带引号的值和 `tmpfs` 八进制模式
- 支持长格式端口语法
- 可选的逐服务健康检查助手，可编辑 HTTP/TCP 建议并预览命令
- 保存或部署前提示端口冲突和与运行中镜像的偏差
- 可选的按 Stack 容器 `TZ`，仅在审核并确认后应用
- 用于 Nginx Proxy Manager、Pi-hole 和 AdGuard Home 的 PlugNPiN 标签助手

### 迁移与复制
- 在实例之间复制或迁移 Stack 及其 Compose 配置
- 传输绑定挂载和命名卷，源 → 目标映射可编辑
- 可续传的直连 HTTP 传输、共享 Restic 仓库或显式 SSH/rsync 配置
- SHA-256 校验、事务性部署和回滚
- 可选传输本地 Docker 镜像和加密的私有 Registry 凭据
- 检测 `container_name` 冲突并显示真实的部署错误
- 显式完成迁移或返回源实例
- 在源实例上配置的计划冷副本，保留快照并支持手动故障切换
- 隔离的灾难恢复测试，以及 PostgreSQL、MariaDB/MySQL、Redis 和 SQLite 应用配置模板

### 备份与恢复
- 原生 Restic 备份 Compose、`.env`、绑定挂载、命名卷和 `/app/data`
- 多个目标：本地、SFTP/NAS、S3/Backblaze B2 和 REST Server
- 计划备份、**立即备份**和保存 Compose 时备份，并防止同时运行
- 按 Stack 的一致性：实时、先停止再启动或应用钩子
- 排除 Stack、内置和自定义排除模式，并自动排除嵌套的本地仓库
- 只初始化确实缺失的仓库，访问、网络和密码错误会阻止初始化
- 普通保留策略和自更新备份专用保留策略
- 安全重置 Local、SFTP、S3 和 REST 仓库，并保留旧仓库用于恢复
- 带预览和差异对比的快照浏览器、选择性恢复和按 Stack 恢复
- 计划备份后的恢复测试、`restic check`、备份历史和逾期告警
- 可选 Zerobyte：连接现有实例或部署专用的托管 Compose 安装，可与原生 Restic 并用，也可承担计划备份，并使用独立仓库
- 引导创建 Zerobyte 源、仓库和任务；新任务在审核前保持停用，现有任务可在确认后迁移
- 受保护的 Zerobyte 停止/重启流程、完整性检查、持久恢复日志和定向手动恢复
- Zerobyte 网络存储检查（不回退到本地）、专用测试恢复和只读联邦状态
- 指南：[Restic 备份与恢复](docs/restic.zh-CN.md) · [Zerobyte 安装与恢复](docs/zerobyte.zh-CN.md)

### 更新与 ImageWatcher
- 通过 digest 检测镜像更新，无需拉取，也适用于远程实例
- 每个镜像可设为关闭、立即或定时，并支持按 Stack 批量设置，默认保留单独例外
- 默认每 6 小时完整扫描，立即模式镜像默认每 5 分钟定向检查，两者可分别配置或关闭
- 检查每个容器实际运行的镜像，共享 Registry 请求，并在 HTTP 429/503 时重试
- 可选的 Registry 检查备用 DNS，不修改主机或 Docker Engine 的 DNS
- 在任何拉取或重建前都会遵守**忽略**和 `dockge.imageupdates.check: "false"`，包括托管的 Dozzle
- 手动、自动和按顺序“全部更新”的镜像更新，并可回滚到旧镜像
- 自动更新不会唤醒已停止或已暂停的 Stack
- 全局和按镜像暂停、跳过版本和自动更新历史
- 每个 Stack、镜像、digest 和通知目标只发送一次待更新通知
- 全局维护窗口：为 Dockge-Enhanced 自动更新设置后，也同样限制镜像自动更新，否则使用各镜像自己的计划；**立即更新**始终立即执行
- 受保护的 Dockge-Enhanced 自更新：强制 Restic 备份、完整性检查、就绪验证和自动恢复
- 通过 Unix 套接字或可信的 Docker Socket Proxy 进行自更新，检查磁盘空间，并在 Compose 或 `.env` 有未保存修改时阻止自动更新
- 持久化的 8 阶段自更新时间线，并显示实时主机负载
- 在使用自定义 Compose `hostname:` 时也能可靠识别当前容器，无法验证时显示降级状态

### 安全与认证
- 本地账户支持可选 TOTP 2FA、加密密钥、一次性恢复码和会话撤销
- 受限本地账户，按实例、Stack 和服务授权，并提供独立工作区（[指南](docs/scoped-users.md)）；降级到旧版 Enhanced 之前请先停用这些账户
- 仅接受明确信任网络的可信代理认证，代理身份对应本地账户
- 原生 OIDC 登录（Pocket ID、Authentik、Keycloak…），使用 PKCE，默认创建受限账户，可按用户或组映射管理员（[指南](docs/oidc.zh-CN.md)）
- 从 Secret 文件非交互式创建首个管理员
- Cloudflare Turnstile 登录保护
- Trivy 漏洞扫描和 CVE 例外
- 集中校验 Stack 名称，防止路径遍历
- 受限的自更新 sidecar 和签名更新计划
- 加密传输私有 Registry 凭据
- 破坏性操作的保护和确认
- eMudhra 事件后的 TLS 证书库检查（[TLS 检查](security/emudhra/README.md)）

### 监控
- 系统、Stack 和容器的 CPU、RAM 和磁盘统计，以及可配置的状态栏
- 主机系统详情、温度和受监控磁盘分区
- 可选的每 5 分钟主机及 Compose 服务 CPU/RAM 历史，并显示数据空档
- 仪表板健康卡片、崩溃循环检测和健康检查自动修复
- 响应式实时日志和全屏日志：服务筛选、搜索、时间范围、**自上次重启以来**、复制最近 50 / 100 / 150 行或全部已加载行、暂停自动滚动、长行处理和可选默认时间戳
- 适用于 NAS 和小型主机的低功耗模式
- 可选 Kula、Dozzle、PowerWatch 和 PowerWatch Hub 集成，关联实例上也显示 PowerWatch 当前功率

### Docker 资源
- 镜像、卷、网络和未管理容器，并支持搜索
- 管理 `bridge`、`macvlan` 和 `ipvlan` 网络
- 统一的手动和自动清理，覆盖镜像、网络、卷和构建缓存，提供预览、排除项和历史
- 精确补执行计划，按 Image ID 分类
- 保护运行中和已停止容器、回滚和恢复镜像以及较新的 Dockge-Enhanced 镜像

### 搜索与文件
- 跨实例全局搜索（`Ctrl+K`），覆盖 Stack、Compose/`.env` 文件、Docker 资源和最近的 Restic 快照
- 可选搜索 `.env` 值，这些值从不返回，也不会保存到历史中
- 紧凑的已挂载卷行及大小显示，每个容器都有卷浏览器/编辑器，即使 Stack 已停止也可使用
- 可选的受限根目录主机文件管理器，支持分块传输、文本编辑和文件日志查看

### 自动化与审计
- 按权限和 Stack 限定范围的 REST API 令牌
- 按 Stack 的 Webhook
- 可选的 Home Assistant 自定义集成和示例
- 集中审计历史，记录来源、状态和耗时
- 指南：[REST API、Webhook 与 Home Assistant](docs/AUTOMATION.zh-CN.md) · [Home Assistant 集成](docs/HOME-ASSISTANT.md)

### 集成
- Zerobyte：托管安装或外部连接
- PowerWatch 和 PowerWatch Hub：外部观察或托管部署
- 用于 Nginx Proxy Manager、Pi-hole 和 AdGuard Home 的 PlugNPiN
- Dozzle
- Kula
- Home Assistant

### 外观与语言
- 独立的日间和夜间配色，包括 Dockge-Enhanced 原有主题
- Catppuccin、Nord、Solarized、Dracula、Gruvbox、Tokyo Night 和 Rosé Pine 选项
- 偏好保存在浏览器中，“自动”模式跟随系统
- Enhanced 功能提供英语、法语、德语、西班牙语和简体中文版本；其他界面语言对这些功能回退为英语

### 通知与访问
- Discord 和 Apprise 通知，支持 EN / FR / ES / zh-CN
- 通知中包含实例名称，并可通过 `DOCKGE_PUBLIC_URL` 添加链接
- 远程运维公告和持久化的未读更新日志
- 可选通过 GitHub Actions Discord Webhook 发送每周和每月匿名安装计数报告
- 第三方移动客户端

</details>

---

## Dockge-Enhanced 自动更新流程

> **与 ImageWatcher 不同：**“立即更新”模式每 5 分钟检查 Stack 映像；以下流程仅适用于 Dockge-Enhanced 自身的受保护更新。

<details>
<summary>查看受保护的更新流程</summary>

Dockge-Enhanced 会自动处理完整流程：强制 Restic 备份、完整性验证、受控替换容器、健康检查和最终确认。Discord/Apprise 通知也可以在无需一直打开 WebUI 的情况下跟踪操作。

在 **更新** 页面为 Dockge-Enhanced 自动更新配置维护时段后，该时段也会成为所有镜像自动更新的全局窗口。窗口之外检测到的镜像更新会排队等待下一个允许时段；手动执行的 **立即更新** 不受此窗口限制。

更新器支持普通 Unix 套接字（包括 `DOCKGE_DOCKER_SOCKET`），也支持通过 `DOCKER_HOST=tcp://proxy:2375` 配置的可信 Docker Socket Proxy。TCP 模式下不会挂载任何套接字：更新器先在实例的某个 Docker 网络上启动，再加入其余网络，并且只有在启动信号确认所有网络都已接入后才执行签名计划。它使用同一个已配置的 Docker endpoint。代理必须允许容器 inspect/create/start/stop/remove、镜像 inspect/pull 和网络连接；只读代理无法完成自更新。未加密的 TCP endpoint 只能放在可信内部网络中。如果证书目录已挂载到 Enhanced 容器中，TLS 设置会被保留；否则更新会在替换容器之前安全停止。

自动自更新开始前，Enhanced 还会确认没有敏感操作正在执行：Restic 备份或恢复、堆栈复制/移动/数据传输或复制同步、Docker 镜像检查/更新、Trivy 扫描以及受保护的外部堆栈集成。如果存在阻塞操作，更新会进入等待状态，WebUI 和 Discord/Apprise 会显示具体原因，随后 watcher 会自动重试。

<table>
<tr>
<td align="center" width="50%"><a href="screens/AutoUpdate-ResticVerification.png"><img src="screens/AutoUpdate-ResticVerification.png" width="100%"/></a><br/><sub><strong>1. Restic 验证</strong> — 替换容器前检查备份。</sub></td>
<td align="center" width="50%"><a href="screens/AutoUpdate-Healthcheck.png"><img src="screens/AutoUpdate-Healthcheck.png" width="100%"/></a><br/><sub><strong>2. 健康检查</strong> — 验证新容器。</sub></td>
</tr>
<tr>
<td align="center" width="50%"><a href="screens/AutoUpdate-Completed.png"><img src="screens/AutoUpdate-Completed.png" width="100%"/></a><br/><sub><strong>3. 更新完成</strong> — 已安装构建版本和最终状态。</sub></td>
<td align="center" width="50%"><a href="screens/AutoUpdate-Notifications.png"><img src="screens/AutoUpdate-Notifications.png" width="100%"/></a><br/><sub><strong>4. 通知</strong> — 更新可用、主要变更和最终确认。</sub></td>
</tr>
</table>

</details>

## 截图

<details>
<summary>查看截图</summary>

<table>
  <tr>
    <td align="center" width="33%">
      <a href="screens/1.png"><img src="screens/1.png" width="100%"/></a>
      <sub>多实例仪表板与全局状态</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/2.png"><img src="screens/2.png" width="100%"/></a>
      <sub>包含 Compose、容器和日志的 Stack 视图</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/3.png"><img src="screens/3.png" width="100%"/></a>
      <sub>详细的 Stack 管理与操作</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/4.png"><img src="screens/4.png" width="100%"/></a>
      <sub>复制/迁移向导 — 选择数据</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/5.png"><img src="screens/5.png" width="100%"/></a>
      <sub>复制/迁移向导 — 准备传输</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/6.png"><img src="screens/6.png" width="100%"/></a>
      <sub>复制/迁移向导 — 卷映射与校验</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/7.png"><img src="screens/7.png" width="100%"/></a>
      <sub>带高级运维工具的 Stack 视图</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/8.png"><img src="screens/8.png" width="100%"/></a>
      <sub>镜像更新监控</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/9.png"><img src="screens/9.png" width="100%"/></a>
      <sub>受监控镜像的详细状态</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/10.png"><img src="screens/10.png" width="100%"/></a>
      <sub>Stack 启动与停止计划</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/11.png"><img src="screens/11.png" width="100%"/></a>
      <sub>安全分析与 Trivy 结果</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/12.png"><img src="screens/12.png" width="100%"/></a>
      <sub>Restic 备份配置</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/13.png"><img src="screens/13.png" width="100%"/></a>
      <sub>包含的卷、排除项与备份一致性</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/14.png"><img src="screens/14.png" width="100%"/></a>
      <sub>Docker 资源管理</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/15.png"><img src="screens/15.png" width="100%"/></a>
      <sub>监控与容器健康状态</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/16.png"><img src="screens/16.png" width="100%"/></a>
      <sub>响应式 / 移动端界面</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/17.png"><img src="screens/17.png" width="100%"/></a>
      <sub>集中审计历史</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/18.png"><img src="screens/18.png" width="100%"/></a>
      <sub>安全与认证设置</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/19.png"><img src="screens/19.png" width="100%"/></a>
      <sub>可选集成</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/20.png"><img src="screens/20.png" width="100%"/></a>
      <sub>自动化、API 与 Webhook</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/21.png"><img src="screens/21.png" width="100%"/></a>
      <sub>“关于”页面与版本信息</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/EnhancedUpdate.png"><img src="screens/EnhancedUpdate.png" width="100%"/></a>
      <sub>应用内更新 Dockge Enhanced</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/DiscordUpdates.png"><img src="screens/DiscordUpdates.png" width="100%"/></a>
      <sub>Discord — 镜像更新告警</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/DiscordTrivy.png"><img src="screens/DiscordTrivy.png" width="100%"/></a>
      <sub>Discord — Trivy 安全告警</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/DiscordBackup.png"><img src="screens/DiscordBackup.png" width="100%"/></a>
      <sub>Discord — 备份通知</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/DiscordEnhancedUpdate.png"><img src="screens/DiscordEnhancedUpdate.png" width="100%"/></a>
      <sub>Discord — Dockge Enhanced 更新告警</sub>
    </td>
  </tr>
</table>

</details>

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
      - TZ=Europe/Paris                      # 可选进程时区；计划任务时区可在 WebUI 配置
```

```bash
docker compose up -d
```

打开 `http://localhost:5001`，创建管理员账户，然后点击导航栏中的**监控**。

> `/backup:/backup` 卷是可选的，但如果使用**本地**作为 Restic 备份目标，建议挂载它，并将目标路径设为 `/backup`，让快照保存在容器之外的独立主机目录中。

> **需要备份多个数据目录？** 可以按需添加多个卷（例如 `../../media:/media-data`），然后在 **备份 → 要备份的 Docker 数据卷**中选择这些已挂载路径；Restic 会在每次备份时包含它们。参见 [Restic 指南](docs/restic.zh-CN.md)。

> **需要监控 `/` 以外的磁盘分区？** 磁盘统计在容器内通过 `df` 读取。如需跟踪 `/mnt/data` 等主机路径，请以只读方式挂载它，并在**监控**页面的*受监控磁盘分区*中添加：
> ```yaml
>       - /mnt/data:/mnt/data:ro
> ```

**PowerWatch 和 PowerWatch Hub 均为可选服务**：两者都无需添加到上面的 Enhanced Compose 中。安装后打开 **Watcher → 监控**（`/watcher/monitoring`），即可连接现有实例，或分别部署托管服务。支持受保护的 PowerWatch 实例：在“监控 → PowerWatch”中填写其只读 Bearer 令牌。未启用认证的实例仍无需令牌。

### 与 Dockge 并行测试 Dockge-Enhanced

Dockge 和 Dockge-Enhanced 可以运行在同一台 Docker 主机上，但不能直接同时使用默认 Compose 配置，因为两者都会发布端口 `5001`。

如需并行测试：

- 从单独的 Compose 目录安装 Dockge-Enhanced；
- 使用另一个主机端口，例如 `5002:5001`；
- 使用独立的 `/app/data` 目录；
- 建议使用独立的 stacks 目录，并只放置专用于测试的 stack。

示例：

```yaml
ports:
  - 5002:5001
volumes:
  - ./enhanced-data:/app/data
  - /opt/dockge-enhanced-test-stacks:/opt/stacks
environment:
  - DOCKGE_STACKS_DIR=/opt/stacks
  - DOCKGE_DATA_DIR=/app/data
```

随后可通过 **http://localhost:5002** 打开 Dockge-Enhanced，同时原有 Dockge 仍可通过端口 `5001` 访问。

两个应用可以访问同一个 stacks 目录，但绝不能**同时**编辑、部署、更新或以其他方式操作同一个 stack。使用独立的 stacks 目录进行测试更安全。

### 从 Dockge 迁移到 Dockge-Enhanced

Dockge-Enhanced 与 Dockge 基于相同的基础，因此迁移很简单：

1. 停止 Dockge。
2. 备份 Dockge 的 Compose 文件、数据目录和 stacks 目录。
3. 在现有 Dockge Compose 文件中，将镜像替换为：

   ```yaml
   image: ghcr.io/aerya/dockge-enhanced:latest
   ```

4. 保留现有的 `/app/data` 和 stacks volume 映射。
5. 拉取镜像并重新启动 Compose 项目：

   ```bash
   docker compose pull
   docker compose up -d
   ```

Dockge-Enhanced 将使用您现有的账号、设置和 stacks 启动。

请保留迁移前创建的备份。如果决定返回 Dockge，请先停止 Dockge-Enhanced，恢复该备份，然后再启动原始 Dockge 镜像。

### 可选 PlugNPiN 集成

<details>
<summary>查看配置说明</summary>

在 **设置 → 集成** 中配置 [PlugNPiN](https://github.com/DeepSpace2/PlugNPiN)。在选择**启用 PlugNPiN**并保存表单之前，该集成完全不会生效。启用后会创建受管理的 `plugnpin-dockge-enhanced` Stack；停用时会执行 Compose down 并删除生成的 Stack 目录。

PlugNPiN 需要 Nginx Proxy Manager 凭据。Pi-hole、AdGuard Home、metrics 和 debug 日志均可单独选择。密码通过 stdin 写入专用的 `dockge_enhanced_plugnpin_secrets` Docker 卷，绝不会返回浏览器，也不会写入生成的 Compose 文件。

如需发布某个服务，请编辑其 Stack，并使用 Compose 编辑器下方的 **PlugNPiN 发布（可选）**。助手会生成所需的 `plugNPiN.ip` 和 `plugNPiN.url` 标签以及所选的 NPM 选项，并可直接应用。现有的映射格式标签和注释会被保留；对于列表格式的标签，Dockge 有意只提供可复制的输出，而不会改写现有结构。

> 停用控制器会停止其容器，但在带标签的应用容器仍在运行时，无法保证立即删除它创建的条目。如果必须先删除这些条目，请在 PlugNPiN 仍运行时移除标签或停止相关应用。

> PlugNPiN `1.0.0` 目前在上游只发布 `amd64` 版本。在不支持的架构上，Dockge 会保持该集成停用并给出明确提示；Dockge Enhanced 的其他部分仍支持多架构。

</details>

---

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DOCKGE_STACKS_DIR` | `/opt/stacks` | Docker Compose Stack 所在目录 |
| `DOCKGE_DATA_DIR` | `/app/data` | Dockge 数据目录；仅在使用自定义持久化挂载时覆盖 |
| `DOCKGE_PUBLIC_URL` | *(无)* | Discord 通知链接使用的公开 URL（例如 `https://dockge.example.com`） |
| `DOCKER_API_VERSION` | *(无)* | 固定 Docker 客户端协商的 API 版本，适用于部分 NAS 系统（例如 Synology DSM 7.x） |
| `TZ` | `UTC` | 容器运行时时区；在**设置 → 常规**中明确配置之前，计划任务默认使用它。WebUI 中的选择对 Enhanced 计划任务优先 |
| `DOCKGE_PORT` | `5001` | Web UI 端口 |
| `DOCKGE_SSL_KEY` / `DOCKGE_SSL_CERT` | — | 启用 HTTPS |
| `DOCKGE_AUTH_MODE` | *(未设置)* | 认证模式：`local`、`disabled` 或 `trusted-proxy`。未设置时保留历史行为和 `disableAuth` 设置 |
| `DOCKGE_AUTH_PROXY_HEADER` | `x-forwarded-user` | `trusted-proxy` 模式下包含已由代理验证身份的 Header |
| `DOCKGE_AUTH_PROXY_TRUSTED_NETWORKS` | *(代理模式必填)* | 允许提供身份 Header 的地址或 CIDR，用逗号分隔 |
| `DOCKGE_BOOTSTRAP_USERNAME` | *(无)* | 首个管理员名称，仅在数据库中没有用户时创建 |
| `DOCKGE_BOOTSTRAP_PASSWORD_FILE` | *(无)* | 包含密码的 Secret 文件；自动初始化时推荐使用 |
| `DOCKGE_BOOTSTRAP_PASSWORD` | *(无)* | 直接提供密码的替代方式，安全性较低，因为它会出现在容器环境中 |
| `DOCKGE_TRANSFER_RSYNC_PROFILES` | `[]` | 本地 SSH/rsync 配置的 JSON 数组（`label`、`host`、`port`、`user`、`path`、`keyPath`，可选 `bandwidthKbps`）。请在两个实例上配置相同的目标身份；密钥路径不会离开其所在实例 |
| `DOCKGE_AUTH_PROXY_ADMIN_USERS` | *(无)* | 用逗号分隔的代理身份，在 `trusted-proxy` 模式下首次登录时创建为管理员；其他新身份为没有任何授权的受限账户 |
| `DOCKGE_REVERSE_HUB_URL` | *(无)* | 可选反向连接的中心服务器 origin（HTTP(S)，不含路径）；参见[反向代理指南](docs/compose-and-reverse-agents.md) |
| `DOCKGE_REVERSE_TOKEN_FILE` / `DOCKGE_REVERSE_TOKEN` | *(无)* | 节点专用的反向连接令牌；文件方式优先，且推荐使用 |
| `DOCKGE_FILE_MANAGER_ROOT` | *(无)* | 可选主机文件管理器开放的容器内路径；未设置时禁用 |
| `DOCKGE_FILE_MANAGER_MAX_FILE_SIZE` | `104857600` | 主机文件管理器的最大传输大小，单位为字节（100 MiB） |
| `DOCKGE_DOCKER_SOCKET` | `/var/run/docker.sock` | Docker 套接字路径，例如用于 rootless Docker 或 Podman |
| `DOCKER_HOST` | *(无)* | Docker endpoint，例如配合可信 Docker Socket Proxy 使用 `tcp://proxy:2375` |
| `DOCKGE_CONTAINER_ID` | *(无)* | 无法从 `HOSTNAME` 识别时，显式指定 Enhanced 容器 ID |
| `DOCKGE_USAGE_COUNT` | *(启用)* | 设为 `false` 可关闭每月匿名安装计数 |
| `DOCKGE_OIDC_ISSUER` | *(无)* | OpenID Connect 签发者 URL；设置后即启用原生 OIDC 登录。所有 `DOCKGE_OIDC_*` 选项见 [OIDC 指南](docs/oidc.zh-CN.md) |

> ℹ️ 未设置 `DOCKGE_DATA_DIR` 时，Dockge-Enhanced 使用持久化卷 `/app/data`。显式配置的路径始终优先。

> ℹ️ `DOCKGE_PUBLIC_URL` 是可选的。未设置时，Discord 通知不包含链接。适用于反向代理和 HTTPS 域名。

> SSH/rsync 配置要求在每个参与的 Dockge 实例中以只读方式挂载私钥和已填写的 `known_hosts` 文件。始终强制使用 `StrictHostKeyChecking=yes`；WebUI 不接受密码或任意远程命令。

### 身份验证与初始化

**现有安装无需任何修改。** 不设置上述变量时，账户、登录页、2FA 和**禁用身份验证**设置的行为与之前完全相同。新安装首次启动时，打开 `/setup` 正常创建管理员。初始化完成后，即使 SPA 地址仍为人所知，服务器也会拒绝之后的所有初始化请求。

如需非交互式初始化，建议挂载 Secret，并只设置以下可选变量：

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

只要已存在用户，初始化变量就会被忽略，因此绝不会修改现有账户或密码。

如需将访问认证交给 [OAuth2 Proxy](https://oauth2-proxy.github.io/oauth2-proxy/configuration/overview/) 或 Traefik ForwardAuth：

```yaml
environment:
  - DOCKGE_AUTH_MODE=trusted-proxy
  - DOCKGE_AUTH_PROXY_HEADER=x-forwarded-user
  - DOCKGE_AUTH_PROXY_TRUSTED_NETWORKS=172.20.0.0/24
```

请将示例 CIDR 替换为代理的确切网络，并配置代理传递所选 Header。Dockge 端口不能被直接访问：只有声明的代理才能提供身份。每个代理身份都使用同名的本地账户：受限账户会限制该代理用户，管理员账户保留完整访问权限。没有对应账户的身份会被创建为没有任何授权的受限账户；新安装的第一个用户以及 `DOCKGE_AUTH_PROXY_ADMIN_USERS` 中列出的身份除外，它们会成为管理员。现有账户保留其角色；角色变更或停用最多可能需要 30 秒才会对代理会话生效。账户管理仅在本地认证模式下可用。绝不要让 `/setup`、`/socket.io` 或 `/api/*` 跳过认证；代理必须转发 WebSocket 并保护整个主机。

### 原生 OIDC 登录（Pocket ID、Authentik、Keycloak…）

无需反向代理，Dockge-Enhanced 可直接通过 OpenID Connect 提供商登录，并与本地账户和 2FA 共存：

```yaml
environment:
  - DOCKGE_OIDC_ISSUER=https://id.example.com
  - DOCKGE_OIDC_CLIENT_ID=dockge
  - DOCKGE_OIDC_CLIENT_SECRET_FILE=/run/secrets/dockge_oidc_secret
  - DOCKGE_OIDC_REDIRECT_URI=https://dockge.example.com/api/auth/oidc/callback
  - DOCKGE_OIDC_ADMIN_GROUPS=dockge-admins
```

新的 OIDC 用户为受限账户，在管理员授权前没有任何访问权限，除非属于 `DOCKGE_OIDC_ADMIN_GROUPS` 或 `DOCKGE_OIDC_ADMIN_USERS`。没有用户会被隐式设为管理员：新安装时，请通过 `/setup` 或 `DOCKGE_BOOTSTRAP_*` 创建第一个管理员，或配置管理员映射，否则第一次 OIDC 登录会被拒绝。未设置 `DOCKGE_OIDC_LINK_EXISTING=true` 时，绝不会关联已有本地账户。OIDC 仅在本地认证模式下工作，且不要求本地 TOTP 验证码。`DOCKGE_OIDC_DISABLE_LOCAL_LOGIN=true` 时仅保留 SSO 按钮；如果提供商不可用，请删除该变量并重启容器。[全部选项、提供商示例与恢复方法](docs/oidc.zh-CN.md)。

---

## 自动更新

该分支通过 GitHub Actions 跟踪上游 Dockge：

- **每天**检查新的稳定版本；
- 检测到上游更新时同步变更并创建 PR；
- PR 合并后重新构建并发布 `amd64` + `arm64` Docker 镜像到 GHCR；
- 发生认证相关冲突时，Enhanced 版本会被保留在同步分支中，并明确列出需要人工比较的文件。

Dockge-Enhanced 自身的应用内自更新是独立功能，可在 **Updates** 页面配置。自动模式要求 Restic 备份与验证通过，并在健康检查失败时回滚。

应用内配置的维护时段是全局时段：启用后，它同时限制 Dockge-Enhanced 自更新和所有镜像自动更新。允许日期和时间之外检测到的镜像会保持排队状态，而手动 **立即更新** 始终立即执行。

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

- [**Apprise**](https://github.com/caronc/apprise-api) — 多平台通知网关
- [**darthrater78/dockge**](https://github.com/darthrater78/dockge) / [**ha-dockge**](https://github.com/darthrater78/ha-dockge) — 端口冲突检测、Compose 差异检查和 Home Assistant 集成的灵感来源。
- [**crossly/Dockge-Enhanced**](https://github.com/crossly/Dockge-Enhanced) — 已整合的重要 UI/UX、主题、国际化和前端架构改进来源
- [**Dockge**](https://github.com/louislam/dockge) by louislam — 原始项目（MIT）
- [**Dozzle**](https://github.com/amir20/dozzle) by Amir Rajan — Docker 实时日志查看器
- [**hamphh/dockge**](https://github.com/hamphh/dockge) by hamphh — 按服务排除整体状态和镜像更新功能的灵感及兼容标签来源
- [**Kula**](https://github.com/c0m4r/kula) by c0m4r — 轻量系统监控
- [**Lorwell/dockge**](https://github.com/Lorwell/dockge) by Lorwell — 为 Enhanced 适配的受限主机文件管理器和实际容器视图提供灵感（MIT）
- [**PlugNPiN**](https://github.com/DeepSpace2/PlugNPiN) by DeepSpace2 — 可选 DNS / Nginx Proxy Manager 自动化
- [**PowerWatch**](https://github.com/Aerya/PowerWatch) — Linux 功耗监控与聚合 Hub，可选集成至 Enhanced
- [**Restic**](https://restic.net/) — 加密备份
- [**Trivy**](https://github.com/aquasecurity/trivy) — 漏洞扫描
- [**Zerobyte**](https://github.com/nicotsx/zerobyte) — 基于 Restic 的备份应用，可选择连接到 Enhanced 或由 Enhanced 部署

---

## 许可证

MIT — 参见 [LICENSE](LICENSE)。
