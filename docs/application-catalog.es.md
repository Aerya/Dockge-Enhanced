# Catálogo de aplicaciones (BETA)

[English](application-catalog.md) · [Français](application-catalog.fr.md) · [Deutsch](application-catalog.de.md) · [Español](application-catalog.es.md) · [简体中文](application-catalog.zh-CN.md)

## Explorar y elegir

Todos los repositorios están activados por defecto y se cargan progresivamente al abrir Aplicaciones. Desactive los que desee en Gestionar repositorios. Las categorías tienen búsqueda propia y una lista de altura limitada con desplazamiento, separada de la búsqueda de aplicaciones. Preferencias guardadas por cuenta en esta instancia.

Nombres de aplicación iguales ofrecen un selector de fuente; las plantillas no son intercambiables. Sitios web y logos aparecen cuando la fuente los proporciona. Actualice explícitamente el catálogo; nunca modifica stacks existentes.

## Revisar antes de desplegar

Solo administradores. La importación crea un borrador Compose/.env editable; elija la instancia de destino en el editor, revise y despliegue explícitamente. No requiere cuenta ni instalación Portainer. Se rechazan Swarm, Windows y opciones de ejecución Portainer no compatibles en vez de ignorarlas.

Las plantillas nativas de Umbrel, Runtipi, RoqueOS y Yundera pueden depender de variables, proxies, rutas, secretos, redes y archivos de su plataforma. Enhanced no ejecuta hooks, instala servicios de plataforma ni descarga archivos adicionales. Los borradores requieren adaptación; importarlos no garantiza su funcionamiento. TrueNAS necesita su propio motor y es solo de consulta.

Revise arquitectura de imagen, puertos, montajes, privilegios y secretos, incluidos los valores predeterminados. Respalde los datos importantes antes de desplegar. Las solicitudes solo contactan GitHub público, con límites de tamaño/tiempo y sin redirecciones. El navegador carga logos desde sus servidores sin referente; los enlaces abren por separado. Los metadatos pueden ser incompletos o estar en su idioma original.

## Fuentes y mantenimiento

Cada repositorio mantiene sus aplicaciones y plantillas. Enhanced proporciona adaptadores de consulta/importación, no mantenimiento externo ni certificación de compatibilidad. El catálogo está en BETA.

- [Lissy93](https://github.com/Lissy93/portainer-templates)
- [Portainer](https://github.com/portainer/templates)
- [Pi-Hosted](https://github.com/pi-hosted/pi-hosted)
- [LinuxServer / Technorabilia](https://github.com/technorabilia/portainer-templates)
- [TrueNAS](https://github.com/truenas/apps)
- [Umbrel](https://github.com/getumbrel/umbrel-apps)
- [Runtipi](https://github.com/runtipi/runtipi-appstore)
- [RoqueOS](https://github.com/roqueribeiro/roqueos-containers-list)
- [Yundera](https://github.com/Yundera/AppStore)

