# 应用目录（测试版）

[English](application-catalog.md) · [Français](application-catalog.fr.md) · [Deutsch](application-catalog.de.md) · [Español](application-catalog.es.md) · [简体中文](application-catalog.zh-CN.md)

## 浏览与选择

所有仓库默认启用，打开应用页面时逐步加载。可在管理仓库中禁用不需要的仓库。分类提供独立搜索和限高滚动列表，与应用搜索分开。设置按账户保存在此实例中。

相同应用名称提供来源选择；不同来源的模板并不等价。来源提供时才显示网站和图标。手动刷新目录不会改变现有 stack。

## 部署前检查

仅管理员可访问。导入生成可编辑的 Compose/.env 草稿；在编辑器选择目标实例，检查后明确部署。无需 Portainer 账户或安装。Swarm、Windows 和不支持的 Portainer 执行选项会被拒绝，而非悄悄忽略。

Umbrel、Runtipi、RoqueOS、Yundera 原生模板可能依赖平台变量、代理服务、路径、凭据、网络和附加文件。Enhanced 不执行仓库钩子、不安装平台服务、不下载附加文件。草稿需要适配，导入成功不保证运行成功。TrueNAS 模板依赖其渲染引擎，仅供浏览。

检查镜像架构、端口、挂载、特权、凭据及默认值。部署前备份重要数据。目录请求仅访问公开 GitHub，限制大小和时间，不跟随重定向。浏览器从原始托管服务器加载图标但不发送来源页面；链接单独打开。元数据可能不完整或保留原语言。

## 来源与维护

各来源仓库维护自己的应用和模板。Enhanced 提供浏览/导入适配器，而非上游维护或兼容性认证。目录仍为测试版。

- [Lissy93](https://github.com/Lissy93/portainer-templates)
- [Portainer](https://github.com/portainer/templates)
- [Pi-Hosted](https://github.com/pi-hosted/pi-hosted)
- [LinuxServer / Technorabilia](https://github.com/technorabilia/portainer-templates)
- [TrueNAS](https://github.com/truenas/apps)
- [Umbrel](https://github.com/getumbrel/umbrel-apps)
- [Runtipi](https://github.com/runtipi/runtipi-appstore)
- [RoqueOS](https://github.com/roqueribeiro/roqueos-containers-list)
- [Yundera](https://github.com/Yundera/AppStore)

