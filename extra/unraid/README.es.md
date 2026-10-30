[English](README.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [中文](README.zh-CN.md)

# Dockge-Enhanced en Unraid — versión de prueba

Paquete experimental, no compatibilidad certificada con Unraid. Utiliza Enhanced sin cambios en la aplicación. No se ha enviado ninguna solicitud a Community Applications.

## Instalación

1. Esperar a que termine correctamente **Image de test Unraid** en la rama `test/unraid`. Imagen: `ghcr.io/aerya/dockge-enhanced:test-unraid`. No modifica `latest`; también publica la etiqueta inmutable `test-unraid-<commit>`.
2. Copiar [la plantilla XML](dockge-enhanced.xml) de esa rama a `/boot/config/plugins/dockerMan/templates-user/my-dockge-enhanced-unraid-test.xml` y seleccionarla en Docker → Add Container. Es una plantilla manual, no una instalación desde CA.
3. Revisar los montajes y elegir un puerto libre (5055 por defecto). Usar directorios NUEVOS de datos/stacks, nunca los de producción. Raíz propuesta: `/mnt/user/appdata/dockge-enhanced-unraid-test`.
4. La ruta del host, la del contenedor para stacks y `DOCKGE_STACKS_DIR` deben coincidir exactamente. Si se usa una ruta de pool en lugar de `/mnt/user`, cambiar las tres. Los montajes relativos de las aplicaciones se resuelven en el host Docker.
5. Abrir la WebUI, crear un administrador y stacks desechables. Mantener la actualización de Enhanced en modo manual y no iniciar actualizaciones internas. Actualizar este contenedor desde Unraid con su etiqueta de prueba.
6. No configurar inicialmente actualizaciones automáticas de imágenes, limpieza, monitorización del host ni instancias vinculadas. No importar ajustes de producción.

Compose está incluido en la imagen: Enhanced no necesita el plugin Compose de Unraid. No gestionar la misma stack simultáneamente con Compose Manager y Enhanced.

## Permisos y aislamiento

Enhanced se ejecuta actualmente como root dentro del contenedor y necesita escribir en datos/stacks. No admite `PUID`/`PGID`: añadirlos no cambia propietarios. Las aplicaciones pueden tener sus propios ajustes UID/GID.

No aplicar `chmod 777` general, `chown` recursivo ni desactivar el remapeo de usuarios. Revisar propietarios, ACL, acceso a directorios padre y el error real. Root dentro de un contenedor remapeado no equivale necesariamente a root del host. Probar creación/guardado de Compose, reinicio de Enhanced y persistencia del acceso/base de datos. Un error de escritura o SQLite de solo lectura es una prueba fallida, no una razón para debilitar la seguridad.

La plantilla **no es privilegiada**, pero el socket Docker controla **todos los contenedores y volúmenes del host**. Separar carpetas no aísla Docker. Preferir un servidor Unraid desechable; nunca ejecutar limpieza global en producción. No exponer directamente la WebUI a Internet.

## Pruebas necesarias

Indicar versiones Unraid/Docker, pool/ruta, controlador de red y commit de imagen. Respaldar independientemente los datos importantes antes de probar operaciones del host.

- Instalar; crear/editar/guardar/desplegar una stack desechable; reiniciar Enhanced y comprobar persistencia.
- Conservar permisos de configuraciones integradas como `mode: 0777` tras editar/guardar; comprobar archivo y permisos efectivos.
- Reiniciar el host y detener/iniciar el array; comprobar montajes disponibles antes del arranque. Probar dependencia VPN saludable y `network_mode: service:...`. El orden Compose se aplica a operaciones Compose, no a arranques individuales arbitrarios del host. `restart: unless-stopped` no garantiza ese orden.
- Probar parada/reanudación por plugins de backup sin dos gestores compitiendo por la misma stack.
- Probar bridge, redes externas (br0 cuando proceda), múltiples redes y enlaces de puertos. Un ID de red en inspect no significa por sí solo un fallo.
- Actualizar la imagen desde Unraid y verificar ajustes/stacks. La actualización interna mediante sidecar **no está validada en Unraid**.

No se han validado aquí reinicios reales de Unraid, array, plugins de backup ni redes personalizadas. CI comprueba plantilla, builds AMD64/ARM64, Trivy estricto, módulos nativos y arranque HTTP en Linux. No sustituye estas pruebas Unraid.

## Retirada e informes

Eliminar únicamente las stacks/contenedores creados para estas pruebas y después Enhanced de prueba. Borrar sus directorios solo tras revisar el contenido. Nunca usar una purga Docker global. Enviar pasos de reproducción y logs sin secretos a [Enhanced issues](https://github.com/Aerya/Dockge-Enhanced/issues).

## Créditos y referencias

Plantilla adaptada de alex3305. Los informes enlazados son casos de prueba, no afirmaciones de que Enhanced reproduce o corrige todos esos problemas.

[alex3305/unraid-docker-templates](https://github.com/alex3305/unraid-docker-templates/blob/main/dockge.xml) · [Dockge 238](https://github.com/louislam/dockge/discussions/238) · [911](https://github.com/louislam/dockge/issues/911) · [906](https://github.com/louislam/dockge/issues/906) · [455](https://github.com/louislam/dockge/issues/455) · [290](https://github.com/louislam/dockge/issues/290)
