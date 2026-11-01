[English](README.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [中文](README.zh-CN.md)

# Dockge-Enhanced en Unraid

Instalación mediante plantilla Docker de Unraid con el mismo Enhanced que en otros sistemas. Compose está incluido: **no requiere el plugin Compose de Unraid**. La plantilla todavía no figura en Community Applications.

## Instalación y actualizaciones

1. Copiar [la plantilla XML](dockge-enhanced.xml) a `/boot/config/plugins/dockerMan/templates-user/my-dockge-enhanced.xml`.
2. Seleccionarla en **Docker → Add Container**. Imagen estándar: `ghcr.io/aerya/dockge-enhanced:latest`. Una PR aún no publicada requiere su imagen de prueba; `latest` no contiene cambios sin publicar.
3. Elegir un puerto libre (**5055** por defecto). Revisar los directorios persistentes de `/mnt/user/appdata/dockge-enhanced`: `data` para Enhanced y `stacks` para Compose.
4. La ruta de stacks debe ser **idéntica en el host, en el contenedor y en `DOCKGE_STACKS_DIR`**. Si se usa un pool en vez de `/mnt/user`, cambiar las tres a la vez. Los montajes relativos se resuelven en el host Docker.
5. Aplicar, abrir la WebUI y crear el administrador. Activar **Autostart de Unraid** para Enhanced; `restart: unless-stopped` no basta después de detener el array. Configurar también el inicio del array según sea necesario.
6. Actualizar Enhanced desde **Docker en Unraid**, conservando los montajes. También se probó un ciclo completo del sidecar interno con backup Restic; no modifica la plantilla Unraid. Elegir un solo gestor de actualizaciones automáticas. Enhanced puede seguir actualizando las aplicaciones.

No gestionar la misma stack con Enhanced y Compose Manager. Al migrar desde `test/unraid`, conservar las carpetas y el puerto existentes en la plantilla; no hace falta renombrarlos. Hacer backup antes y nunca abrir los mismos datos desde dos instancias Enhanced activas.

## Permisos y seguridad

Enhanced funciona como root dentro del contenedor y necesita escribir en `data`/`stacks`. **No admite `PUID`/`PGID`.** Las aplicaciones pueden usar sus propios IDs: se probó `99:100` con un directorio `0750`.

No aplicar `chmod 777` general, `chown` recursivo ni desactivar el remapeo de usuarios. Revisar propietarios, ACL y acceso a padres. Root remapeado no es necesariamente root del host. El editor conserva modos como `0777`; su aplicación depende también de Compose y del tipo de config/secret.

El contenedor **no es privilegiado**, pero el socket Docker controla **todos los contenedores y volúmenes del host**. Separar carpetas no aísla Docker. No exponer la WebUI directamente a Internet. Revisar la limpieza y respaldar los datos importantes antes de activarla.

## Copias y recuperación

- **Restic integrado**: usar un destino separado. Backup, integridad y restauración de Compose/`.env` probados.
- **Zerobyte instalado por Enhanced**: fuentes de solo lectura, destino distinto y restauración separada. Backup con parada/reinicio de servicios probado. Tras recrear Enhanced, se restablece automáticamente su red Zerobyte después de verificar la propiedad.
- **Appdata Backup de Unraid**: seleccionar `data` y `stacks` de Enhanced y detener el contenedor durante la copia. Evitar solapamientos con backups/updates de Enhanced. No asumir que incluye **volúmenes Docker con nombre**, especialmente los datos internos de Zerobyte: respaldarlos por separado.
- Copiar Compose no sustituye el backup de los datos de las aplicaciones. Probar la recuperación.

`depends_on`/`service_healthy` y `network_mode: service:...` se aplican al desplegar con Compose. Unraid/Docker también inicia contenedores individualmente; restart no garantiza el orden Compose. Las aplicaciones dependientes deben tolerar reconexiones.

## Validación y diagnóstico

Probado en una **VM Unraid 7.3.4 / Docker 29.8.2**, array XFS y vDisk Docker btrfs: instalación/actualización DockerMan, edición/despliegue, permisos no-root, enlaces IPv4/IPv6, reinicio de Enhanced/host, parada/inicio del array, Restic, Zerobyte y Appdata Backup. CI añade regresiones, builds AMD64/ARM64 y Trivy estricto.

Pruebas adicionales: restauración completa de `data` y `stacks` con Appdata Backup, HTTP mediante macvlan e ipvlan, caída de red Zerobyte y backup/restauración en un montaje SMB/CIFS del laboratorio. El montaje remoto debe estar disponible antes de Zerobyte: si falta, se rechaza el backup sin escribir en el directorio local subyacente. Tras remontarlo, revalidar explícitamente el almacenamiento si cambió su identidad.

No certifica cada combinación de hardware/pool/plugin ni incluye pruebas nativas macOS/Windows. Enviar versión de Unraid, imagen/commit, rutas, controlador de red, pasos y logs **sin secretos** a [Enhanced issues](https://github.com/Aerya/Dockge-Enhanced/issues). Al retirar un laboratorio, comprobar nombres y carpetas; nunca ejecutar una limpieza Docker global.

## Créditos

Plantilla adaptada de alex3305. Los informes históricos guiaron los ensayos; no afirman una corrección universal de cada ticket.

[alex3305/unraid-docker-templates](https://github.com/alex3305/unraid-docker-templates/blob/main/dockge.xml) · [Dockge 238](https://github.com/louislam/dockge/discussions/238) · [911](https://github.com/louislam/dockge/issues/911) · [906](https://github.com/louislam/dockge/issues/906) · [455](https://github.com/louislam/dockge/issues/455) · [290](https://github.com/louislam/dockge/issues/290)
