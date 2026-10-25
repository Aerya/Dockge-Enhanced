# Docker rollout

[English](service-rollout.md) · [Français](service-rollout.fr.md) · [Deutsch](service-rollout.de.md) · [Español](service-rollout.es.md) · [简体中文](service-rollout.zh-CN.md)

## 部署

如果现有 Docker 发现与连接摘除满足要求，可使用原生 Traefik。否则，在服务编辑器中输入**内部 TCP 端口**，点击**准备可选中继**。保存和部署前检查草稿：发布端口及 Traefik/PlugNPiN 标签将移至独立中继服务。首次部署可能中断流量。使用主机 IP 和发布端口的代理目标可保持不变；使用应用服务名的目标需要明确改为中继服务名。

中继使用 Nginx stream，不终止 TLS，也不暴露管理 API。HTTP、TLS、WebSocket 可通过 TCP；不支持 UDP/QUIC。不需要 NPM、Caddy 或 HAProxy API 凭据。协议兼容不等于认证每一种产品和版本。目前原生集成面向 Traefik。中继拥有持久配置卷和专用网络/别名，使用期间不要删除。请将此配置与 stack 一同备份。

## 恢复与限制

需要健康检查及额外 CPU/RAM。固定容器名、共享可写卷和命名空间依赖仍不兼容。助手会拒绝不明确的端口变量/范围、profiles 和 extends，不会自行猜测。保留已有 CPU/RAM 限制。应用看到的连接来源为中继 IP；需要原始客户端 IP 的应用须另行检查受信任代理配置。

更新应用时不会重建中继。替代容器健康后才切换新连接；已有连接可在旧容器上完成。约两分钟后仍有连接时，操作会标为未完成：保留容器，并尽可能恢复至健康旧副本。重试前请检查并协调这些副本，不要删除仍服务客户端的容器。中继自身重启、Recreate 和回滚并非零中断。

请更新关联实例两端。受限账户需拥有应用**及其中继**的更新权限。打开编辑器不会修改配置；准备中继仅修改草稿。禁用滚动更新不会拆除中继或还原端口，这一迁移需明确检查。不会自动修改生产代理配置。

[Wowu/docker-rollout](https://github.com/Wowu/docker-rollout) · [Dockge #170](https://github.com/louislam/dockge/pull/170) · [Nginx](https://nginx.org/en/docs/control.html)
