# Recuperar una actualización interna bloqueada

[en](self-update-recovery.md) · [fr](self-update-recovery.fr.md) · [de](self-update-recovery.de.md) · [es](self-update-recovery.es.md) · [zh-CN](self-update-recovery.zh-CN.md)

Esta guía solo cubre «Duplicate mount point» al iniciar el sidecar. La corrección #607 está publicada en la imagen oficial `:latest`. La versión anterior no puede instalarla por sí misma. Pido disculpas por esta regresión.

## Antes de ejecutar comandos

Use el terminal del host Docker, no uno dentro de Enhanced. Conserve una copia de seguridad reciente. No ejecute `down -v`, limpiezas ni borrados de datos. Solo Enhanced se interrumpirá brevemente; no recree otros servicios.

## Identificar la instalación

Sustituya `ENHANCED_CONTAINER` por el nombre real del contenedor. Estos comandos solo leen metadatos Compose:

```bash
docker inspect ENHANCED_CONTAINER --format '{{index .Config.Labels "com.docker.compose.project"}}'
docker inspect ENHANCED_CONTAINER --format '{{index .Config.Labels "com.docker.compose.service"}}'
docker inspect ENHANCED_CONTAINER --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'
docker inspect ENHANCED_CONTAINER --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}'
```

Conserve el proyecto, servicio, directorio de trabajo y TODOS los archivos Compose/override indicados, en su orden. Mantenga sus opciones habituales `--env-file` y perfiles. No publique configuración ni secretos.

## Actualizar una instalación Compose

En el directorio de trabajo identificado, cree el archivo permanente `recovery-image.yaml` con este contenido. Sustituya `SERVICE` por el servicio de Enhanced, no por el nombre del contenedor:

```yaml
services:
  SERVICE:
    image: ghcr.io/aerya/dockge-enhanced:latest
```

En CADA comando, sustituya `PROJECT`, `BASE_COMPOSE` y `SERVICE`. Entre el archivo base y `recovery-image.yaml`, añada un `-f` por CADA override existente, en su orden original. El archivo de recuperación debe ir al final: solo cambia la imagen, incluso si un override anterior fija un digest. No continúe si falta un archivo o no sabe cuál usar.

```bash
docker compose -p PROJECT -f BASE_COMPOSE -f recovery-image.yaml config --images
```

Compruebe que la lista incluye `ghcr.io/aerya/dockge-enhanced:latest`. Después:

```bash
docker compose -p PROJECT -f BASE_COMPOSE -f recovery-image.yaml pull SERVICE
docker compose -p PROJECT -f BASE_COMPOSE -f recovery-image.yaml up -d --no-deps SERVICE
```

No elimine `recovery-image.yaml`: Docker registra su ruta en los metadatos Compose y futuras operaciones pueden leerlo. Conserve los overrides existentes; no los borre a ciegas. Tras comprobar la interfaz y el estado de salud, las próximas actualizaciones usarán el mecanismo corregido.

## Otras instalaciones y ayuda

Sin metadatos Compose (por ejemplo una plantilla Unraid u otra herramienta), actualice desde la herramienta original con la imagen oficial `:latest`, conservando ajustes, puertos, redes y montajes. No aplique estos comandos Compose a instalaciones que no lo usan. Si necesita ayuda, abra una issue con el error y método de instalación, sin secretos. Las imágenes personalizadas deben incluir #607; el filtro de esta alerta no las cubre automáticamente.

