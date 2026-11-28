# 主机更新（测试版）

[English](host-management.md) · [Français](host-management.fr.md) · [Deutsch](host-management.de.md) · [Español](host-management.es.md) · [简体中文](host-management.zh-CN.md)

位于 `/watcher/hosts`，可选且默认关闭：Debian/Ubuntu 和 Arch/Garuda 清单与更新检测、Debian/Ubuntu CVE 分析，以及需要本地安装和授权的手动或计划 APT 更新。提供全部已授权更新、仅安全、审慎、安全且审慎四种策略，可配置检测和操作通知。报告只读，使用现有联合通信。Arch/Garuda 仅支持监控；不支持 AUR、RPM/APK/Zypper、主机群操作或完整 CVE 覆盖。

主机更新标签页始终可见；默认仅禁用监控功能。

更新分为 Dockge-Enhanced、Docker 镜像和主机更新（测试版）三个可见子标签页。保留八个主标签页，现有 URL 和远程实例链接保持有效。

## 安装主机组件

直接在 Dockge 中安装主机组件：明确状态、安装/修复及权限选择，立即启动首次清单采集。用户无需执行命令或修改 Compose。

Dockge 安装所需组件并立即生成首份清单，无需命令、修改 Compose 或 SSH 连接。监控支持 Debian/Ubuntu 和 Arch/Garuda；执行更新仅支持固定版本 Debian/Ubuntu。

允许的 UTC 小时，以逗号分隔. 审慎策略允许的软件包，以逗号分隔（留空：无）. 这些选项将替换主机执行器权限，并保留现有排除项。可计划模式不会自动启用计划，请随后配置。

管理员在界面中确认模式。临时容器使用与实例完全相同的镜像，进入主机系统命名空间，安装内置文件、缺少的 Python 依赖及 systemd 服务。不接受浏览器提供的命令、路径或镜像。长期运行的传输组件没有系统特权、网络、Docker 套接字或主机根目录挂载；报告只读，仅请求目录可写。无需重建 Dockge 或修改其 stack。现有手动安装保持兼容。此安装器不支持 rootless Docker、用户重映射、Docker Desktop 或无 systemd 的主机。中枢必须选择兼容代理。安装中断后可以重试；切勿终止正在写入的软件包管理器。

请求两分钟、模拟五分钟后过期；执行前重新计算计划并消耗批准。更新操作不提供 shell、新增依赖、删除或自动重启。保留 APT 锁和配置，之后检查 `.dpkg-dist`。中断事务需要本地 `dpkg --audit` 和发行版恢复流程，没有通用回滚。禁用计划和定时器可阻止新任务，不会中断当前写入。被攻陷的 Enhanced 管理员能够授权提供的安装功能；主机 root 被攻陷不在此信任边界内。

## 限制与恢复

Monitor 支持 Debian/Ubuntu 和 Arch/Garuda。Pacman 优先使用 checkupdates，否则使用缓存的 pacman -Qu；不会执行 pacman -Sy、部分升级或 AUR 操作。APT 使用现有缓存，不隐式刷新仓库。重启状态未知不代表无需重启。其他系统和提供器不支持。每实例一个主机。采集定时器本地配置为六小时，Enhanced 每分钟读取。过期阈值 12 小时、保留 90 天，可配置。指纹避免重复存储相同清单，仅显示最近 100 条。显示已脱敏仓库名称及已安装内核软件包版本。仅在明确的 Debian/Ubuntu 官方公共镜像中确认软件包来源，否则匹配保持未确定。点击清单日期可与之前保留的清单比较新增、删除和版本变更。不提供高级主机群筛选。通过带专用前缀的 machine-id 哈希绑定报告和操作，不传输原始 machine-id。

CVE 分析可选，清单变更时最多每小时一次，否则每天一次。同一 Trivy 镜像读取合成的 dpkg/os-release 元数据，不暴露主机根目录或 Docker socket。仅数据库下载允许联网，扫描离线进行。超过 72 小时的数据库被拒绝。第三方来源、ESM 和未识别公告的安全性未知。只有更新清单包含确切修复版本时才标为可用，其他修复本地可用性未知。不使用通用 SemVer 比较。每日重评估，结果存于内存，重启后等待新扫描。数据库运行时下载，不随 Enhanced 分发；参阅 Trivy 数据源许可。尚未实现 Arch CVE 和直接厂商数据源。

[Trivy SBOM](https://trivy.dev/docs/latest/target/sbom/) · [Trivy DB sources and licenses](https://github.com/aquasecurity/trivy-db/blob/main/LICENSE)

[PatchMon](https://github.com/PatchMon/PatchMon) — 为系统清单、监控和更新编排提供功能灵感。

[PatchBase](https://github.com/patchbase/patchbase) — 为软件包清单、安全公告关联和漏洞检测提供功能灵感。

## 策略、计划与通知

任何更新都无法保证完全没有破坏性风险。**仅安全**使用 APT 原生版本比较，从受信任的 Debian/Ubuntu 官方安全仓库选择版本，不依赖 Trivy CVE 检测，不含 ESM 或第三方仓库。**审慎**要求本地 `conservativePackages` 允许列表，排除 essential/important 软件包和关键类别（内核、引导、网络、驱动、Docker、数据库）。空列表不会更新任何软件包。**安全且审慎**同时应用两种限制。拒绝选定范围外的依赖、新增软件包、删除和锁定软件包；额外依赖可能阻止整个操作。`all` 也必须在 `allowedScopes` 中明确授权，它不是审慎策略。

Arch/Garuda 等滚动发行版可能发生依赖、驱动或应用损坏，需要手动处理。请阅读发行版公告、备份，并按发行版流程进行完整更新（例如 `garuda-update`）。此测试版不提供滚动发行版的部分更新、仅安全更新或自动更新。

在配置中选择星期、UTC 时间和策略并保存。每次执行时，本地执行器重新计算计划并检查策略。每个时段仅执行一次，延迟五分钟后跳过，不补执行，失败也不自动重试。中枢断开时计划仍会运行。关闭监控前先禁用并保存计划。撤销本地授权或禁用定时器会阻止新任务；切勿中断正在写入的 APT/dpkg。不自动重启、不升级发行版版本，也无通用回滚。

通知使用“通知”中配置的 Discord/Apprise 渠道，独立启用且默认关闭。可选择更新、达到严重性阈值的漏洞、可用修复、需要重启、采集器或安全数据过期/不可用、安装开始/成功/失败以及计划变更。安装通知包含手动/自动模式、策略和软件包数量。检测通知去重，每类每小时最多一次；操作通知不受此限制。无需打开页面即可监控和发送。发送失败时，在事件保留期内且通知启用时重试；至少一个渠道成功即视为送达。执行器保留最近 100 个事件用于重连恢复；Enhanced 按保留设置存储历史，默认 90 天。此缓冲区并非无限日志。
