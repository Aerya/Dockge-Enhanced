# 恢复受阻的自动更新

[en](self-update-recovery.md) · [fr](self-update-recovery.fr.md) · [de](self-update-recovery.de.md) · [es](self-update-recovery.es.md) · [zh-CN](self-update-recovery.zh-CN.md)

本指南仅适用于启动 sidecar 时出现的“Duplicate mount point”错误。修复 #607 已发布到官方 `:latest` 镜像。旧版本无法自行安装修复。对于此回归问题，我深表歉意。

## 执行命令前

请使用 Docker 主机终端，而非 Enhanced 容器内部终端。保留近期数据备份。不要执行 `down -v`、清理或删除数据。仅 Enhanced 会短暂中断，不要重新创建其他服务。

## 识别安装配置

将 `ENHANCED_CONTAINER` 替换为实际容器名称。这些命令仅读取 Compose 元数据：

```bash
docker inspect ENHANCED_CONTAINER --format '{{index .Config.Labels "com.docker.compose.project"}}'
docker inspect ENHANCED_CONTAINER --format '{{index .Config.Labels "com.docker.compose.service"}}'
docker inspect ENHANCED_CONTAINER --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'
docker inspect ENHANCED_CONTAINER --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}'
```

保留项目名、服务名、工作目录以及所有列出的 Compose/override 文件及其顺序。同时保留现有 `--env-file` 选项和 profiles。请勿公开配置或机密。

## 更新 Compose 安装

在已确认的工作目录中创建长期保留的 `recovery-image.yaml`，内容如下。将 `SERVICE` 替换为 Enhanced 的服务名，而非容器名：

```yaml
services:
  SERVICE:
    image: ghcr.io/aerya/dockge-enhanced:latest
```

在每条命令中替换 `PROJECT`、`BASE_COMPOSE` 和 `SERVICE`。在基础文件与 `recovery-image.yaml` 之间，按原始顺序为每个现有 override 添加一个 `-f`。恢复文件必须放在最后：它仅覆盖镜像，即使旧 override 固定了摘要。如果文件缺失或不确定应使用哪个文件，请停止操作。

```bash
docker compose -p PROJECT -f BASE_COMPOSE -f recovery-image.yaml config --images
```

确认镜像列表包含 `ghcr.io/aerya/dockge-enhanced:latest`，然后执行：

```bash
docker compose -p PROJECT -f BASE_COMPOSE -f recovery-image.yaml pull SERVICE
docker compose -p PROJECT -f BASE_COMPOSE -f recovery-image.yaml up -d --no-deps SERVICE
```

完成后不要删除 `recovery-image.yaml`：Docker 会在 Compose 元数据中记录其路径，后续操作可能需要读取。保留现有 override，不要盲目删除。检查界面和健康状态后，后续更新将使用修复后的机制。

## 其他安装方式与支持

没有 Compose 元数据时（例如 Unraid 模板或其他管理工具），请使用原安装工具更新到官方 `:latest` 镜像，保留全部设置、端口、网络和挂载。不要对非 Compose 安装执行这些命令。如需帮助，请提交包含错误和安装方式的 issue，但不要提供机密。自定义镜像必须包含 #607；本通知的目标筛选不会自动涵盖它们。

