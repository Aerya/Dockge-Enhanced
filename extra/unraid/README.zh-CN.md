[English](README.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [中文](README.zh-CN.md)

# Unraid 上的 Dockge-Enhanced — 测试版

这是实验性安装包，并非经过认证的 Unraid 支持。应用本身没有修改。尚未向 Community Applications 提交应用。

## 安装

1. 等待 `test/unraid` 分支的 **Image de test Unraid** 工作流成功。镜像：`ghcr.io/aerya/dockge-enhanced:test-unraid`。不会修改 `latest`；同时发布不可变标签 `test-unraid-<commit>`。
2. 将该分支的 [XML 模板](dockge-enhanced.xml) 复制到 `/boot/config/plugins/dockerMan/templates-user/my-dockge-enhanced-unraid-test.xml`，在 Docker → Add Container 中选择。这是手动模板，不是 CA 商店安装。
3. 检查所有挂载，选择空闲主机端口（默认 5055）。使用全新的数据和堆栈目录，绝不复用生产目录。默认根目录：`/mnt/user/appdata/dockge-enhanced-unraid-test`。
4. 堆栈的主机路径、容器路径和 `DOCKGE_STACKS_DIR` 必须完全一致。使用存储池路径代替 `/mnt/user` 时，三处一起修改。应用的相对绑定挂载由 Docker 主机解析。
5. 打开 WebUI，创建管理员和可丢弃的测试堆栈。保持 Enhanced 自更新为手动模式，不要启动内部更新。通过 Unraid 使用测试标签更新测试容器。
6. 初次测试不要配置镜像自动更新、清理、主机监控或关联实例。不要导入生产设置。

镜像已包含 Compose，Enhanced 不需要 Unraid Compose 插件。不要让 Compose Manager 和 Enhanced 同时管理同一堆栈。

## 权限与隔离

Enhanced 当前在容器中以 root 运行，需要数据/堆栈目录的写入权限。不支持 `PUID`/`PGID`，添加这些变量不会更改所有者。各应用可能有自己的 UID/GID 设置。

不要全局执行 `chmod 777`、递归 `chown` 或禁用用户命名空间映射。先检查所有者、ACL、父目录访问权限和实际错误。映射容器中的 root 不一定是主机 root。测试 Compose 创建/保存、Enhanced 重启以及登录和数据库持久化。目录不可写或 SQLite 只读意味着测试失败，不能因此削弱主机安全。

模板**不是特权模式**，但 Docker socket 可控制**主机上全部容器和卷**。独立目录不等于 Docker 隔离。优先使用可丢弃的 Unraid 测试服务器；绝不在生产主机执行全局清理。不要将 WebUI 直接暴露到互联网。

## 测试者必须验证

记录 Unraid/Docker 版本、存储池/路径、网络驱动和镜像提交。在主机级测试前独立备份重要数据。

- 安装；创建、编辑、保存、部署可丢弃堆栈；重启 Enhanced，确认持久化。
- 编辑/保存后保留内联配置权限，例如 `mode: 0777`；检查文件和实际应用权限。
- 重启主机及停止/启动 array；确认启动前挂载可用。测试健康的 VPN 依赖和 `network_mode: service:...`。Compose 依赖顺序仅适用于 Compose 操作，不适用于主机任意逐个启动容器。`restart: unless-stopped` 不能保证此顺序。
- 测试备份插件的停止/恢复行为，避免两个管理器同时管理堆栈。
- 测试 bridge、外部网络（适用时 br0）、多网络和端口链接。inspect 中显示网络 ID 本身不代表连接故障。
- 通过 Unraid 更新测试镜像并验证设置/堆栈。内部 sidecar 自更新**尚未在 Unraid 验证**。

此处没有完成真实 Unraid 重启、array、备份插件或自定义网络验证。CI 检查模板、AMD64/ARM64 构建、严格 Trivy 扫描、原生模块和 Linux 上的 HTTP 启动。这不能替代 Unraid 实测。

## 移除与反馈

只删除本次测试创建的堆栈/容器，再删除 Enhanced 测试容器。确认专用目录中无所需数据后才删除。不要运行全局 Docker prune。向 [Enhanced issues](https://github.com/Aerya/Dockge-Enhanced/issues) 提交复现步骤和已移除秘密信息的日志。

## 致谢与背景

模板参考 alex3305。链接中的报告用于构建测试案例，并不表示 Enhanced 重现或修复了所有问题。

[alex3305/unraid-docker-templates](https://github.com/alex3305/unraid-docker-templates/blob/main/dockge.xml) · [Dockge 238](https://github.com/louislam/dockge/discussions/238) · [911](https://github.com/louislam/dockge/issues/911) · [906](https://github.com/louislam/dockge/issues/906) · [455](https://github.com/louislam/dockge/issues/455) · [290](https://github.com/louislam/dockge/issues/290)
