# Copias Restic y recuperación

[English](restic.md) · [Français](restic.fr.md) · [Español](restic.es.md) · [Deutsch](restic.de.md) · [简体中文](restic.zh-CN.md)

Dockge-Enhanced incluye un motor [Restic](https://restic.net/) nativo en **Backup**. Es independiente de la [integración opcional con Zerobyte](zerobyte.es.md), que usa sus propios repositorios y su propia retención. Algunas etiquetas de esta parte de la interfaz aún aparecen en inglés en la versión española; se indican tal como se muestran.

## Qué se respalda

- Los archivos `compose.yaml`, override y `.env` de cada stack incluido. Un stack puede excluirse de todas las copias en **Stacks to back up and consistency**.
- Rutas de datos opcionales: `/app/data` (datos de Dockge-Enhanced) y tantos volúmenes montados en el contenedor de Enhanced como se necesiten, por ejemplo `/dockers-data`, seleccionados en **Docker volumes to backup**. Los tamaños se calculan bajo demanda.
- Las exclusiones integradas (`*.log`, `__pycache__`, `node_modules`) se aplican siempre; los patrones glob personalizados se pasan a `restic --exclude`.

Incluye todo el directorio `/app/data` en tus copias, también `two-factor.key`: restaurar solo la base de datos no permite descifrar los secretos TOTP sin esta clave.

## Destinos y programación

- Destinos: local, SFTP/NAS (clave SSH o contraseña), S3/Backblaze B2 y REST Server. Pueden activarse varios destinos; cada ejecución copia a todos.
- Para un destino local, monta un directorio dedicado del host, por ejemplo `../../backup/dockge:/backup`, y usa `/backup` como ruta de destino.
- Hay copias programadas, **Crear copia ahora** y copias al guardar el Compose. Los snapshots creados al guardar llevan la etiqueta `on-save`, usan una espera de 60 segundos y omiten a propósito `restic forget`, de modo que una ráfaga de guardados nunca elimina snapshots diarios o semanales anteriores.
- La protección contra solapamientos, activada por defecto, impide que una copia manual, programada o al guardar empiece mientras otra copia Restic está en curso.
- Un bloqueo de Restic obsoleto se elimina con `restic unlock --remove-all` antes de cada copia y de cada retención. El código de salida 3 (no se pudo leer un archivo de origen) se registra como éxito con advertencias.

## Coherencia por stack

Cada stack incluido tiene su propio modo:

- **En caliente**: sin interrupción.
- **Detener y reiniciar**: solo se detienen los servicios en ejecución antes del snapshot y después se reinician esos mismos servicios, incluso tras un fallo.
- **Hooks de aplicación**: los comandos previos/posteriores se ejecutan con `docker compose exec` dentro del servicio elegido, por ejemplo un volcado de base de datos, sin acceso al shell del host.

Los stacks se reinician antes de la retención y de las pruebas de restauración para reducir la interrupción.

## Ajustes, retención y mantenimiento

- **Guardar** solo guarda los ajustes y la retención; no lanza ninguna copia ni purga.
- **Crear copia ahora** lanza una copia inmediata y, si termina bien, la retención ordinaria.
- Las herramientas de mantenimiento actualizan el estado de repositorios y snapshots y ejecutan `restic check` en cada destino activo.
- La retención ordinaria (`keepLast`, diaria, semanal, mensual) se aplica tras las copias programadas o manuales correctas, no tras las copias al guardar.
- Los snapshots obligatorios creados antes de una autoactualización protegida de Dockge-Enhanced tienen su propia retención: una vez creado **y verificado** el nuevo snapshot, se conservan los dos últimos snapshots de autoactualización de esta instalación. Una etiqueta de instalación estable evita que esta limpieza afecte a otra instancia que comparta el repositorio. Si la limpieza falla, se conserva la copia verificada.
- La lista de snapshots se abre en **All**. Un indicador **Backup overdue** y una notificación por intervalo aparecen cuando la última copia correcta es más antigua que el doble del intervalo configurado.

## Inicialización de repositorios

En la primera copia, Restic inicializa **solo los repositorios cuya ausencia está demostrada**. Los errores de acceso, red y contraseña bloquean la inicialización en lugar de crear un repositorio nuevo. La interfaz muestra el estado del repositorio de cada destino activo.

## Solapamiento entre repositorio y orígenes

Es preferible mantener los repositorios Restic locales fuera de las carpetas seleccionadas para la copia.

- Si un repositorio local está dentro de un origen seleccionado, al guardar los ajustes se muestra una advertencia y las copias excluyen automáticamente el repositorio, sus archivos de reinicio y sus demás rutas de montaje Docker. También se comprueban los enlaces simbólicos resueltos, y los destinos locales desactivados siguen protegidos.
- Por ejemplo, `/app/data` puede seguir seleccionado con un repositorio en `/app/data/backups`.
- Se rechaza seleccionar como origen un repositorio o una de sus subcarpetas. Las rutas se comprueban de nuevo antes de cada copia.
- Esta comprobación nunca mueve ni reinicia un repositorio. Se conservan las rutas, contraseñas y ajustes de retención existentes.

## Reinicio seguro de un repositorio (Local, SFTP, S3 y REST)

En **Backup → Mantenimiento y diagnóstico**, elige un destino activo y revisa la vista previa de su repositorio y del número de snapshots.

- El reinicio exige dos confirmaciones explícitas, la frase de confirmación exacta y un token de un solo uso de corta duración.
- Un repositorio local se renombra como archivo conservado antes de crear uno nuevo. Un repositorio remoto pasa a un nuevo directorio SFTP, prefijo S3 o URL REST; el repositorio anterior no se elimina.
- El nuevo repositorio activo no contiene snapshots anteriores. Las entradas del historial reciente solo se eliminan para ese destino.
- El repositorio anterior permanece en su ubicación para la recuperación: **no** es un borrado definitivo de los datos respaldados.
- No reinicies un repositorio compartido por otros clientes sin coordinarlos antes.

## Restauración y verificación

- El explorador de snapshots muestra juntos los archivos Compose, `.env` y de volúmenes, con su estado respecto al snapshot anterior (Nuevo / Modificado / Sin cambios) y al disco actual (OK / Modificado / Ausente).
- Los archivos de texto pueden previsualizarse y compararse con el disco o con el snapshot anterior antes de restaurar.
- Restaura cualquier selección de archivos, o un stack completo con **Restore stack**.
- Tras cada copia programada, una prueba de restauración lee un archivo real del nuevo snapshot y registra el resultado en el historial. Usa **Check integrity** para un `restic check` completo.
- Las autoactualizaciones protegidas y los flujos de recuperación se basan en estos snapshots Restic verificados.
