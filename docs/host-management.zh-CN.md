# 主机管理（测试版）

[English](host-management.md) · [Français](host-management.fr.md) · [Deutsch](host-management.de.md) · [Español](host-management.es.md) · [简体中文](host-management.zh-CN.md)

位于 `/watcher/hosts`，可选且默认关闭：本地主机清单、APT/Pacman 更新、通过现有 Trivy 镜像进行 Debian/Ubuntu CVE 分析，以及需要本地授权的受限手动 APT 操作。报告只读挂载。请求使用现有联合通信；旧代理显示不可用。不支持自动更新、AUR、RPM/APK/Zypper 或完整厂商覆盖。

## 安装与安全

检查随附脚本后，在目标 Linux 主机本地执行命令。不要在 Enhanced 容器中安装采集器。需要 Python 3 和 systemd。不需要也未实现 SSH。请勿为测试功能而在生产环境安装。安装和升级由本地管理员执行；中心不能替换这些文件。

```sh
sudo useradd --system --no-create-home --shell /usr/sbin/nologin dockge-host
sudo install -d -m 0755 /usr/local/lib/dockge-host
sudo install -m 0644 extra/host-management/collector.py /usr/local/lib/dockge-host/
sudo install -m 0644 extra/host-management/dockge-host-collector.service extra/host-management/dockge-host-collector.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dockge-host-collector.timer
sudo systemctl start dockge-host-collector.service
```

```yaml
services:
  dockge:
    volumes:
      - /var/lib/dockge-host-reports:/host-reports:ro
```

## 限制与恢复

Monitor 支持 Debian/Ubuntu 和 Arch/Garuda。Pacman 优先使用 checkupdates，否则使用缓存的 pacman -Qu；不会执行 pacman -Sy、部分升级或 AUR 操作。APT 使用现有缓存，不隐式刷新仓库。重启状态未知不代表无需重启。其他系统和提供器不支持。每实例一个主机。采集定时器本地配置为六小时，Enhanced 每分钟读取。过期阈值 12 小时、保留 90 天，可配置。指纹避免重复存储相同清单，仅显示最近 100 条。显示已脱敏仓库名称及已安装内核软件包版本。不提供逐包来源、历史差异和高级主机群筛选。通过带专用前缀的 machine-id 哈希绑定报告和操作，不传输原始 machine-id。

CVE 分析可选，清单变更时最多每小时一次，否则每天一次。同一 Trivy 镜像读取合成的 dpkg/os-release 元数据，不暴露主机根目录或 Docker socket。仅数据库下载允许联网，扫描离线进行。超过 72 小时的数据库被拒绝。第三方来源、ESM 和未识别公告的安全性未知。只有更新清单包含确切修复版本时才标为可用，其他修复本地可用性未知。不使用通用 SemVer 比较。每日重评估，结果存于内存，重启后等待新扫描。数据库运行时下载，不随 Enhanced 分发；参阅 Trivy 数据源许可。尚未实现 Arch CVE 和直接厂商数据源。

[Trivy SBOM](https://trivy.dev/docs/latest/target/sbom/) · [Trivy DB sources and licenses](https://github.com/aquasecurity/trivy-db/blob/main/LICENSE)

```sh
sudo systemctl disable --now dockge-host-collector.timer
sudo rm /etc/systemd/system/dockge-host-collector.timer /etc/systemd/system/dockge-host-collector.service
sudo systemctl daemon-reload
# Reports and history are retained.
```

[PatchMon](https://github.com/PatchMon/PatchMon) — 为系统清单、监控和更新编排提供功能灵感。

[PatchBase](https://github.com/patchbase/patchbase) — 为软件包清单、安全公告关联和漏洞检测提供功能灵感。

## 手动 APT 执行器

Manual 必须本地授权：单独安装执行器，在 root 拥有的策略中配置 UTC 时段和排除包。默认拒绝安装。请求两分钟过期；模拟五分钟过期，安装前重新计算。批准在执行前消耗。不暴露 shell、重启、新依赖、删除或自动计划。保留 APT 原生锁及已有配置；之后本地检查 .dpkg-dist 文件。不要停止正在写入的软件包管理器；禁用定时器可阻止新请求。失败后使用 dpkg --audit 和发行版恢复程序进行本地诊断。没有通用回滚。被攻陷的管理员或中心可请求本地允许的更新；主机 root 被攻陷不在此信任边界内。

请求目录归 Enhanced 进程 UID 所有（调整 1000）。仅此目录可写，操作报告只读。不要挂载 /etc/dockge-host 或执行器状态。使用现有直连/反向代理并在两端检查管理员权限。Hub-only 可读取清单但不执行 Trivy，Agent-only 使用相同 RPC。通知复用 ImageWatcher 渠道，默认关闭，去重且最多每小时一次。不提供主机群计划、仅安全更新选择或单包更新。

```sh
sudo install -m 0644 extra/host-management/executor.py /usr/local/lib/dockge-host/
sudo install -d -m 0700 /etc/dockge-host /var/lib/dockge-host-executor
sudo install -d -m 0755 /var/lib/dockge-host-operations
sudo install -d -m 0700 -o 1000 /var/lib/dockge-host-requests
sudo install -m 0600 extra/host-management/policy.example.json /etc/dockge-host/policy.json
sudo install -m 0644 extra/host-management/dockge-host-executor.service extra/host-management/dockge-host-executor.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dockge-host-executor.timer
```

```json
{
  "mode": "manual",
  "allowInstall": true,
  "utcHours": [2, 3],
  "exclusions": ["example-package"]
}
```

```yaml
services:
  dockge:
    environment:
      DOCKGE_HOST_REQUEST_DIR: /host-requests
      DOCKGE_HOST_OPERATION_REPORT_DIR: /host-operations
    volumes:
      - /var/lib/dockge-host-requests:/host-requests
      - /var/lib/dockge-host-operations:/host-operations:ro
```

```sh
sudo systemctl disable --now dockge-host-executor.timer
# Wait for any running apt/dpkg operation to complete before removing the service.
sudo rm /etc/systemd/system/dockge-host-executor.timer /etc/systemd/system/dockge-host-executor.service
sudo systemctl daemon-reload
```
