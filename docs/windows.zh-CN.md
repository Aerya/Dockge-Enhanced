# 在 Windows 11 上使用 Docker Desktop（WSL2）

[English](windows.md) · [Français](windows.fr.md) · [Deutsch](windows.de.md) · [Español](windows.es.md) · [简体中文](windows.zh-CN.md)

Enhanced 运行在 **Linux 容器**中，不是原生 Windows 服务或 Windows 容器。请使用 Docker Desktop 的 WSL2 引擎并启用 Linux 发行版集成。Enhanced 已包含 Compose；不要在 WSL 中再安装一个 Docker Engine。

在 Docker Desktop 中启用 **Use the WSL 2 based engine**，然后在 **Resources → WSL Integration** 中启用发行版。在该发行版终端检查：

```bash
docker version
docker compose version
mkdir -p "$HOME/dockge-enhanced"/{data,stacks,backups}
cd "$HOME/dockge-enhanced"
```

推荐使用发行版的 Linux 文件系统（例如 `/home/user/dockge-enhanced`），而不是 `/mnt/c`。数据和 stacks 使用独立的 bind 挂载。stacks 目录在 **Enhanced 内和 Docker 主机上必须具有相同的绝对路径**。

在此目录创建 `compose.yaml`：

```yaml
services:
  dockge:
    image: ghcr.io/aerya/dockge-enhanced:latest
    container_name: dockge-enhanced
    restart: unless-stopped
    ports:
      - "5001:5001"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ${HOME}/dockge-enhanced/data:/app/data
      - ${HOME}/dockge-enhanced/stacks:${HOME}/dockge-enhanced/stacks
      - ${HOME}/dockge-enhanced/backups:/backup
    environment:
      DOCKGE_STACKS_DIR: ${HOME}/dockge-enhanced/stacks
      DOCKGE_DATA_DIR: /app/data
```

然后运行 `docker compose up -d`，打开 `http://localhost:5001` 并创建管理员账户。不要公开 Docker socket：它可控制 Linux Docker 引擎。测试实例应使用独立目录及不同端口。

Restic 可使用 `/backup` 作为本地目标。托管 Zerobyte 已在 **Linux WSL 源和目标目录**上测试，目录与 Enhanced 数据和 stacks 分离。不要为了接受被拒绝的路径而削弱路径或存储身份检查。先恢复到独立测试位置。同一 Windows 虚拟机/磁盘内的备份无法防止该磁盘丢失。

NTFS 方案也测试了 Compose、`.env`、包含空格的相对路径、命名卷和 Restic。从 PowerShell 启动时，bind 源使用 `C:/...`，stacks 目标及 `DOCKGE_STACKS_DIR` 使用对应的 `/run/desktop/mnt/host/c/...`。此 Docker Desktop 专用映射不能直接用于 Linux。NTFS 共享不提供与 Linux 相同的所有权、chmod 或性能保证；数据库优先使用 WSL Linux 存储/命名卷。NTFS 上的托管 Zerobyte 未验证；请使用上述 WSL 配置。

- Docker Desktop 必须运行。登录时自动启动不等于无人值守 Windows 系统服务；重启后需登录并等待 Linux 引擎。`restart: unless-stopped` 不会启动 Docker Desktop。
- CPU/RAM、磁盘统计及自更新空间检查只看到 Linux 虚拟机/暴露给 Docker 的文件系统，而不是整个 Windows。还应检查 Windows 磁盘可用空间：虚拟磁盘的显示容量并非主机预留空间。
- 主机 systemd、Linux 硬件传感器、host 网络、USB/GPU 访问及 NAS 网络挂载与原生 Linux 不同。不能假定 PowerWatch 可通过该虚拟机测量 Windows 硬件。
- 关联实例必须能访问各自配置的地址。`localhost` 指调用方；`host.docker.internal` 供容器访问本 Windows 主机，并非其他服务器可用的公共地址。Windows 防火墙仅应允许可信客户端。

在隔离的 Windows 11 Enterprise Evaluation 26H2 虚拟机、Docker Desktop 4.97 / Engine 29.9、WSL 3.0.3 和 Ubuntu 24.04 中测试：Compose/ENV、非 root 权限、命名/相对卷、healthcheck、CPU/RAM 限制、重启/重建、SQLite/node-pty 和浏览器终端、Restic 快照/恢复、托管 Zerobyte 受保护 hooks 与恢复、两个关联实例及受限权限。sidecar 使用 Linux 目标路径，同时保留 Docker 报告的 Windows 源路径。不声明支持原生 Windows 容器。

**Windows 重启后：** 在本次 Docker Desktop 4.97 测试中，WSL 绑定挂载未能自动恢复：Docker socket 不可用，一个容器看到空目录，但 WSL 中的原始文件仍然完整。不要因为目录看起来为空而重新执行首次安装。等待发行版中的 `docker version` 正常工作，检查 `data` 和 `stacks` 目录中的文件，然后在安装目录运行 `docker compose up -d`。在 Enhanced 中启动已停止的堆栈，并重启挂载不完整的堆栈。已验证这一恢复过程、原有账户，以及恢复后新建 Zerobyte 备份和还原。NTFS 方案在本次测试中自动恢复。因此，完全无人值守的 WSL 启动**尚未验证通过**；该挂载问题也已[报告给 Docker Desktop](https://github.com/docker/desktop-feedback/issues/601)。

[Docker Desktop / WSL](https://docs.docker.com/desktop/features/wsl/) · [WSL filesystems](https://learn.microsoft.com/en-us/windows/wsl/filesystems)
