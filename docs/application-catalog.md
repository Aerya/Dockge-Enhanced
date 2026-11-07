# Application catalog (BETA)

[English](application-catalog.md) · [Français](application-catalog.fr.md) · [Deutsch](application-catalog.de.md) · [Español](application-catalog.es.md) · [简体中文](application-catalog.zh-CN.md)

## Browse and choose

All repositories are enabled by default and load progressively when Applications opens. Disable individual repositories from Manage repositories. Search categories in a height-limited scrolling list, separately from application search. Choices are stored per account on this instance.

Matching application names offer a source selector; templates from different sources are not interchangeable. Website links and logos appear when upstream metadata supplies them. Refresh explicitly to update a catalog; existing stacks are never changed.

## Review before deployment

Only administrators can access the catalog. Import creates an editable Compose/.env draft; choose the destination instance in the editor, review and deploy explicitly. No account or Portainer installation is required. Swarm, Windows and unsupported Portainer execution options are refused rather than silently discarded.

Native platform templates (Umbrel, Runtipi, RoqueOS, Yundera) may refer to platform variables, proxy services, paths, secrets, networks and additional files. Enhanced does not execute repository hooks, install platform services or download companion files. These drafts require adaptation; successful import is not proof the application will run. TrueNAS templates use its own rendering system and are browse-only.

Check image architecture, ports, mounts, privileges and secrets, including suggested defaults. Back up important data before deploying. Catalog requests go only to public GitHub endpoints, with bounded size/time and no redirects. Logos load from upstream hosts in your browser without a referrer; links open separately. Metadata can be incomplete or in its original language.

## Sources and maintenance

Each upstream repository maintains its applications and templates. Enhanced supplies the browsing/import adapters, not upstream maintenance or a compatibility certification. The catalog is a BETA.

- [Lissy93](https://github.com/Lissy93/portainer-templates)
- [Portainer](https://github.com/portainer/templates)
- [Pi-Hosted](https://github.com/pi-hosted/pi-hosted)
- [LinuxServer / Technorabilia](https://github.com/technorabilia/portainer-templates)
- [TrueNAS](https://github.com/truenas/apps)
- [Umbrel](https://github.com/getumbrel/umbrel-apps)
- [Runtipi](https://github.com/runtipi/runtipi-appstore)
- [RoqueOS](https://github.com/roqueribeiro/roqueos-containers-list)
- [Yundera](https://github.com/Yundera/AppStore)

