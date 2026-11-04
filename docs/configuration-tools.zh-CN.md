[English](configuration-tools.md) · [Français](configuration-tools.fr.md) · [Deutsch](configuration-tools.de.md) · [Español](configuration-tools.es.md) · [简体中文](configuration-tools.zh-CN.md)

# 配置工具

此分支中准备，尚未发布至 `main`/`latest`。

堆栈操作中的 **文件与历史** 可查看版本和已保存的合并 Compose。它在所属实例执行 `docker compose config`，包含覆盖文件和变量，但不包含未保存草稿。结果可能包含密码或令牌，仅管理员确认后可查看。

在保存或 Git pull 前保留最近 20 个不同版本，包含 Compose、override 和 `.env`；外部堆栈包含登记的文件链。不包含应用数据、间接引入的文件或共享 `global.env`。每个文件最多 2 MiB。历史保存失败会阻止写入，以保护上一版本。

版本加密保存在数据目录的 `stack-file-history/`。请与 `stack-file-history.key` 一起备份；密钥丢失则无法读取版本。版本列表不包含文件内容。恢复前保存当前文件，也会恢复原来不存在的 override 状态。不会重启容器。**检查后明确部署。** 文件列表变化或并发操作会阻止恢复。

堆栈和全局 `.env` 编辑器提供 **表单模式**。值默认隐藏并保持原样，包括引号；复杂或多行值请用文本模式编辑。

**设置 → 实例诊断** 检查 Docker、Compose、Git、Buildx，以及数据和堆栈目录中临时文件的创建与删除。可选择关联实例。不会修改配置、部署容器或清理资源。

关联实例两端均需更新。旧代理会在有限超时后显示不可用。受限账户不能读取文件/结果或恢复版本。应用数据仍需 Restic/Zerobyte 备份。

[ethanpil/dockge-mod](https://github.com/ethanpil/dockge-mod) — 文件历史、合并 Compose、`.env` 表单和诊断功能的灵感来源。
