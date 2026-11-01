[English](README.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [中文](README.zh-CN.md)

# Unraid 上的 Dockge-Enhanced

通过 Unraid Docker 模板安装，与其他系统使用同一个 Enhanced。镜像已包含 Compose：**不需要 Unraid Compose 插件**。模板尚未上架 Community Applications。

## 安装与更新

1. 将 [XML 模板](dockge-enhanced.xml) 复制到 `/boot/config/plugins/dockerMan/templates-user/my-dockge-enhanced.xml`。
2. 在 **Docker → Add Container** 中选择模板。标准镜像是 `ghcr.io/aerya/dockge-enhanced:latest`。尚未发布的 PR 必须使用对应测试镜像；`latest` 不含未发布的更改。
3. 选择空闲端口（默认 **5055**），检查 `/mnt/user/appdata/dockge-enhanced` 下的持久目录：`data` 保存 Enhanced 数据，`stacks` 保存 Compose。
4. 堆栈路径在**主机、容器和 `DOCKGE_STACKS_DIR` 中必须完全相同**。改用存储池路径而非 `/mnt/user` 时，三处一起修改。应用的相对挂载由 Docker 主机解析。
5. 应用设置，打开 WebUI，创建管理员。在 Unraid 中启用 Enhanced 的 **Autostart**；停止 array 后，仅有 `restart: unless-stopped` 不够。根据需要配置 array 自动启动。
6. 通过 **Unraid 的 Docker 页面**更新 Enhanced，保留挂载。也已测试包含 Restic 备份的完整内部 sidecar 更新；它不会修改 Unraid 模板。自动更新只选择一个管理器。应用镜像仍可由 Enhanced 更新。

不要让 Enhanced 和 Compose Manager 同时管理一个堆栈。从 `test/unraid` 迁移时，在模板中保留原目录和端口，无需重命名。先备份，切勿让两个运行中的 Enhanced 共用同一份数据。

## 权限与安全

Enhanced 在容器内以 root 运行，需要 `data`/`stacks` 的写权限。**不支持 `PUID`/`PGID`。** 应用可使用自己的 UID/GID；已测试 `99:100` 应用及 `0750` 目录。

不要全局 `chmod 777`、递归 `chown` 或禁用用户命名空间映射来掩盖错误。先检查所有者、ACL 和父目录权限。映射后的 root 不一定是主机 root。编辑器保留 `0777` 等模式；实际应用还取决于 Compose 和 config/secret 类型。

容器**不是特权模式**，但 Docker socket 可控制**主机全部容器和卷**。独立目录不等于 Docker 隔离。不要将 WebUI 直接暴露到互联网。启用清理前检查设置并备份重要数据。

## 备份与恢复

- **内置 Restic**：使用独立目标。已测试备份、完整性检查及 Compose/`.env` 恢复。
- **Enhanced 安装的 Zerobyte**：源只读、目标独立、恢复位置分离。已测试备份时停止/重启服务。重建 Enhanced 后，验证归属后自动恢复其 Zerobyte 网络连接。
- **Unraid Appdata Backup**：选择 Enhanced 的 `data` 和 `stacks`，复制期间停止容器。避免与 Enhanced 的备份/更新重叠。不要以为插件自动包含 **Docker 命名卷**，尤其是 Zerobyte 内部数据；应单独备份。
- Compose 文件备份不能替代应用数据备份。请实际验证恢复。

Compose 部署时会遵守 `depends_on`/`service_healthy` 和 `network_mode: service:...`。Unraid/Docker 也会单独启动容器；restart 策略不保证 Compose 依赖顺序，应用必须支持重新连接。

## 验证与诊断

实测环境为 **Unraid 7.3.4 / Docker 29.8.2 VM**、XFS array、btrfs Docker vDisk：DockerMan 安装/更新、编辑/部署、非 root 权限、IPv4/IPv6 端口链接、Enhanced/主机重启、array 停止/启动、Restic、Zerobyte 和 Appdata Backup。CI 另有回归测试、AMD64/ARM64 构建和严格 Trivy 扫描。

补充实测：通过 Appdata Backup 完整恢复 `data` 和 `stacks`、macvlan/ipvlan HTTP 访问、Zerobyte 网络中断，以及实验室 SMB/CIFS 挂载的备份/恢复。远程挂载必须先于 Zerobyte 就绪：挂载缺失时会拒绝备份，不会写入下层本地目录。重新挂载后，重新启动 Zerobyte；如果保护机制检测到存储身份变化，需要显式重新验证。

这不是对所有 Unraid 硬件、存储池、插件的认证，也不是 macOS/Windows 原生实测。反馈时向 [Enhanced issues](https://github.com/Aerya/Dockge-Enhanced/issues) 提供 Unraid 版本、镜像/提交、路径、网络驱动、步骤及**无秘密信息**的日志。删除实验环境前核对名称和目录内容；绝不全局清理 Docker。

## 致谢

模板参考 alex3305。以下历史报告用于设计测试，不表示普遍修复所有相关问题。

[alex3305/unraid-docker-templates](https://github.com/alex3305/unraid-docker-templates/blob/main/dockge.xml) · [Dockge 238](https://github.com/louislam/dockge/discussions/238) · [911](https://github.com/louislam/dockge/issues/911) · [906](https://github.com/louislam/dockge/issues/906) · [455](https://github.com/louislam/dockge/issues/455) · [290](https://github.com/louislam/dockge/issues/290)
