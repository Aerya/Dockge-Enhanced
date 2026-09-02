# Dockge Enhanced 更新日志

项目详细更新历史。

---

**2026-09-02 — 支持 Compose 长格式端口语法** — `parseDockerPort()` 现在既支持现有字符串端口语法，也支持包含 `published`、`target`、`protocol`、`mode` 和 `host_ip` 的 Compose 长格式端口对象。现有字符串格式行为由回归测试覆盖并保持不变。长格式定义不再触发 `split is not a function`，也不会再导致容器卡片消失，对应 louislam/dockge#998。测试覆盖 IPv4/IPv6、TCP、UDP、数字或字符串 published 端口以及缺少 published 的情况。自动更新、sidecar、Restic 和 rollback 代码均未修改。


**2026-09-02 — Compose 编辑器保留 tmpfs 八进制模式** — 结构化 Compose 编辑器在可视化修改后重新生成 YAML 时，现在会保留 `01777` 这类带前导零的 `tmpfs.mode` 八进制值。此前该值进入编辑器的 JavaScript 对象后会被重新输出为 `1777`，从而静默改变 louislam/dockge#990 所描述的权限语义。回归测试覆盖单个和多个 tmpfs mode 以及结构变化。自动更新、sidecar、Restic 和 rollback 代码均未修改。


**2026-09-02 — 加强 Stack 路径遍历安全防护** — 现在每次 `Stack.getStack()` 解析路径前都会验证 Stack 名称，包括使用 `skipFSOperations=true` 的调用。这关闭了剩余的绕过路径，恶意构造的 traversal 名称无法再逃离受管理的 Stack 目录。该修复与 louislam/dockge#994 中报告的安全问题以及 louislam/dockge#997 提出的修复方向保持一致，并增加了针对跳过文件系统操作路径的回归测试。Dockge-Enhanced 的自动更新、sidecar、Restic 备份和 rollback 逻辑均未修改。


### 最近的重要变化

- **2026-09-01 — 自更新构建标识与清晰进度**：**更新** 标签页现在通过 OCI 元数据识别已安装和可用的 GHCR 构建，显示构建日期与 Git 提交 SHA，并保留不可变镜像 digest 作为技术依据。当前状态采用明确的优先级，不再把上一次任务结果与当前更新可用状态混在一起；上一次完成的操作会作为历史保留，同时显示四个执行阶段、Restic 字节/百分比进度、已用时间，以及仅在数据足够时计算的 Restic 剩余时间估算。旧镜像没有 OCI 标签时会安全回退到 digest。
- **2026-09-01 — 远程 Stack 更新标记**：Stack 列表现在会从每个远程 Dockge-Enhanced 实例读取镜像更新状态，并按 endpoint 隔离，因此远程 Stack 也能正确显示 **更新** 标记。
- **2026-09-01 — 四语言 Enhanced 本地化**：Enhanced 自己新增的用户界面内容、更新弹窗，以及 Discord/Apprise 通知统一维护英语、法语、西班牙语和简体中文。
- **2026-08-31 — 安全自更新**：自更新支持手动或受限 Sidecar 模式；执行前必须完成 Restic 备份和仓库验证，失败时自动回滚。
- **2026-08-30 — 响应式界面和统一主题**：Stack 侧栏可折叠/调整大小，系统状态栏、健康卡片、自动主题以及移动端导航得到增强。
- **2026-08-27 — Stack 启动前置条件**：可要求主机挂载点或 `systemd` 服务可用后再启动、重启或重新创建容器。
- **2026-08-22 — 联邦凭据恢复**：多实例之间使用专用联邦 JWT，修改 WebUI 用户名或密码不会再让已连接实例离线。
- **2026-08-20 — Stack 迁移增强**：支持必要时复制 Docker 镜像、加密迁移私有 Registry 凭据，并在部署前检测 `container_name` 冲突。

完整历史和详细技术说明可参考 [英文 README](README.md)。

