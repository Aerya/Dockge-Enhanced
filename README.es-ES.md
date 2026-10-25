<p align="center">
  <img src="https://raw.githubusercontent.com/Aerya/Dockge-Enhanced/main/frontend/public/icon.svg" width="120" alt="Dockge Enhanced logo">
</p>

# Dockge Enhanced

Dockge Enhanced es un fork de [Dockge](https://github.com/louislam/dockge) para administrar tus entornos Docker Compose desde una interfaz web, en uno o varios servidores. Reúne la gestión de stacks y contenedores, la búsqueda global y el acceso a archivos, la migración y replicación, las copias con Restic o Zerobyte, las actualizaciones con rollback, la supervisión, los controles de seguridad y la automatización. Sus integraciones y herramientas de recuperación facilitan el seguimiento y mantenimiento diario de tus servicios.

<p align="center">
  🇪🇸 Español ·
  🇬🇧 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.md">English</a> ·
  🇫🇷 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.fr.md">Français</a> ·
  🇨🇳 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.zh-CN.md">简体中文</a> ·
  🇩🇪 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.de.md">Deutsch</a>
</p>

<p align="center">
  <img src="https://github.com/Aerya/Dockge-Enhanced/actions/workflows/build-publish.yml/badge.svg?branch=main" alt="Build">
  <img src="https://img.shields.io/badge/arch-amd64%20%7C%20arm64-lightgrey" alt="multi-arch">
  <img src="https://img.shields.io/badge/i18n-EN%20%7C%20FR%20%7C%20ES%20%7C%20DE%20%7C%20zh--CN-blue" alt="i18n">
  <img src="https://img.shields.io/badge/based%20on-Dockge-orange?logo=github&logoColor=white" alt="based on Dockge">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT">
</p>

<p align="center">
  <strong>¿Lo usas? ¿Te gusta?</strong>
  <a href="https://github.com/Aerya/Dockge-Enhanced"><strong>⭐ ¡Dale una estrella!</strong></a>
  — solo toma dos segundos.
</p>

---

## Funcionalidades

### Lo que distingue a Dockge Enhanced

| Área | Lo que agrega Dockge Enhanced |
| --- | --- |
| **Multiservidor** | Federación en malla completa entre instancias Dockge-Enhanced, administración desde cualquier servidor vinculado, conexiones inversas opcionales con token por nodo, etiquetas de agente persistentes, selección y agrupación de servidores, estado de actualizaciones remotas, copia/migración transaccional de stacks, transferencias reanudables y replicación en frío programada |
| **Gestión de stacks** | Stacks fijados, indicadores compactos de estado y recursos, navegación plegable/redimensionable, espacio Logs/Compose flexible, barra de acciones accesible directamente con iconos solos o con texto, acciones de stack/contenedor explicadas, pausa/reanudación de stacks, programación por contenedor, Build + Recreate, notas, herramientas Git, requisitos de inicio del host y recreación automática de servicios que comparten namespaces de red VPN |
| **Edición de Compose** | Editores de Compose, override y `.env`, plantillas Compose y `.env` por defecto, enlaces con nombre, reparación de YAML, asistente de healthcheck por servicio, comprobaciones de conflictos de puertos y diferencias de imagen, y `TZ` opcional por stack; límites opcionales de CPU/RAM por servicio (Preparado en esta PR; todavía no publicado.) |
| **Copias de seguridad y recuperación** | Copias Restic multidestino de bind mounts y volúmenes, consistencia por stack, restauración selectiva, comprobación de repositorios, verificación y diferencias de snapshots, reinicio seguro de repositorios, además de los mecanismos de recuperación usados por las actualizaciones protegidas. Conexión opcional a Zerobyte o instalación gestionada, flujos de aplicaciones protegidos y restauraciones de prueba dedicadas |
| **Actualizaciones** | Configuración agrupada por stack con conservación de excepciones, comprobación dirigida cada 5 minutos en modo Inmediato, respeto de las imágenes ignoradas antes de cualquier cambio, actualizaciones manuales, masivas secuenciales o automáticas de contenedores con rollback, ventana de mantenimiento compartida, indicadores remotos, pausas globales/por imagen y autoactualización protegida de Dockge-Enhanced con copia obligatoria, controles de integridad y recuperación automática |
| **Migración y replicación** | Transferencias transaccionales entre instancias, migración de Compose y datos persistentes, trabajos reanudables, finalización explícita de movimientos, réplicas en frío programadas, snapshots de recuperación y flujos de recuperación |
| **Seguridad y autenticación** | Cuentas locales con acceso limitado y permisos por stack y por servicio, 2FA TOTP opcional, autenticación por trusted proxy, Cloudflare Turnstile, escaneo de vulnerabilidades con Trivy, excepciones CVE y flujos de actualización protegidos |
| **Monitorización** | Estadísticas del sistema, stacks y contenedores, historial CPU/RAM opcional cada 5 minutos, barra de estado, tarjetas de salud, crash loops, auto-heal, logs adaptables e integraciones opcionales Kula, Dozzle, PowerWatch y PowerWatch Hub |
| **Recursos Docker** | Limpieza unificada protegida de imágenes, volúmenes, redes y caché de build, recuperación exacta, vista previa, exclusiones, historial y protecciones ante acciones destructivas |
| **Búsqueda y archivos** | Búsqueda global multiinstancia, gestor de archivos del host restringido, navegación por volúmenes, transferencias por fragmentos, edición de texto y archivos de registro |
| **Stacks externos** | Detección e integración de proyectos Compose existentes, autorización de rutas e inspección de contenedores reales sin mover datos |
| **Automatización y auditoría** | API REST limitada por permisos, webhooks por stack, integración con Home Assistant, operaciones programadas e historial centralizado con origen, estado y duración |
| **Integraciones** | Zerobyte, PowerWatch y PowerWatch Hub, PlugNPiN y asistente de etiquetas por servicio para Nginx Proxy Manager, Pi-hole y AdGuard Home, Dozzle, Kula y Home Assistant |
| **Apariencia** | Paletas diurnas/nocturnas, temas integrados, preferencias por navegador y acciones con iconos solos o con texto |
| **Notificaciones y acceso** | Notificaciones Discord y Apprise localizadas en EN/FR/ES/zh-CN, soporte multiinstancia, anuncios remotos y clientes móviles de terceros |

## Últimas novedades

<details>
<summary>Mostrar las últimas novedades</summary>

Los cambios recientes más importantes se agrupan aquí para entender rápidamente qué ha cambiado en Dockge-Enhanced.

### 🆕 Octubre de 2026

**Límites de CPU/RAM por servicio :** Preparado en esta PR; todavía no publicado. Límites opcionales de CPU/RAM por servicio en el editor Compose del administrador. Los alias existentes siguen siendo coherentes; los demás ajustes y los permisos restringidos se conservan. Aplique al borrador, guarde y despliegue explícitamente. Inspirado en Isurupro7 (Dockge #1006). Un límite de RAM demasiado bajo puede detener el contenedor por falta de memoria. La CPU se limita. Eliminar un límite no reserva recursos. Las expresiones existentes se conservan hasta editarlas. Los demás ajustes no cambian. Los overrides, extends o archivos incluidos pueden seguir imponiendo límites: revise el Compose final. Una advertencia visible sobre la RAM exige confirmación antes de aplicar un límite de memoria nuevo o modificado.

**Se respetan las imágenes ignoradas:** ImageWatcher vuelve a comprobar **Ignore** tras la consulta al registro, antes de la descarga y de nuevo justo antes de recrear los contenedores, incluidas las actualizaciones programadas ya seleccionadas y el contenedor Dozzle gestionado. También se bloquean los candidatos obsoletos de los lotes manuales. Una descarga ya iniciada puede terminar, pero no le sigue ninguna recreación; una recreación de Docker ya en curso no se interrumpe.

**Cuentas locales con acceso limitado:** En **Ajustes → Seguridad → Usuarios y permisos**, cree cuentas limitadas y seleccione por stack local o vinculada los permisos de consulta, registros, iniciar, detener, reiniciar, actualizar y recrear. Sin selección no hay acceso. Las cuentas existentes siguen siendo administradoras. El espacio dedicado no permite acceder a Compose/.env, terminal, archivos, eliminación, copias de seguridad ni ajustes. Actualice ambos extremos de las instancias vinculadas, incluidos los agentes inversos; no se omiten las protecciones para agentes antiguos. Los permisos identifican instancia y nombre de stack: revíselos al reutilizar un nombre. Revocar desconecta las sesiones, pero no cancela operaciones Docker ya iniciadas. Los registros pueden contener secretos. Autenticación local con permisos opcionales por servicio para todas sus réplicas, incluso tras recrearlas. Cada usuario gestiona contraseña, TOTP y códigos de recuperación; el administrador puede restablecer 2FA o eliminar solo la cuenta. Se rechazan acciones que afecten a dependientes del espacio de red; el inicio delegado no inicia dependencias. Con la autenticación por trusted proxy, cada identidad del proxy usa la cuenta local con el mismo nombre; una identidad desconocida se crea como cuenta limitada sin permisos, salvo el primer usuario de una instalación nueva y las identidades indicadas en `DOCKGE_AUTH_PROXY_ADMIN_USERS`. [Detalles técnicos](docs/scoped-users.md).

**Plantillas Compose y agentes remotos:** Enlaces HTTP/HTTPS con nombre, plantilla .env predeterminada configurable, etiquetas persistentes de agentes y filtrado, además de conexiones inversas opcionales con tokens individuales y registro automático tras configurar la cuenta local. Los agentes inversos pertenecen a su servidor central; las transferencias de datos entre servidores siguen requiriendo federación directa. Basta con una cuenta de administrador local existente; no hay que crear otra. [Documentación](docs/compose-and-reverse-agents.md).

**Enlaces de puertos:** Elija Nombre de host o Dirección IP para los enlaces de puertos en Ajustes → General. Cada instancia vinculada conserva su elección; se mantiene el comportamiento predeterminado. El modo Nombre de host prioriza el nombre principal y después la dirección del navegador/agente. El modo IP usa una IP conocida o una IPv4/IPv6 explícita accesible. Sin IP conocida, el puerto sigue visible sin enlace y con una explicación emergente. Configure cada instancia anfitriona por separado y actualice ambos extremos para transmitir esta preferencia; los agentes antiguos conservan su comportamiento. No cambia los puertos Docker, DNS ni los nombres guardados.

**Seguridad TLS y actualizaciones de seguridad:** Se actualizan los almacenes de certificados y los componentes TLS de las imágenes tras el incidente de eMudhra. Las pruebas incluyen las cadenas afectadas, los dos casos No CT y una conexión HTTPS válida. Las imágenes en ejecución no cambian; su sustitución debe planificarse después de la validación. La imagen pasa además a Node.js 26.12.1 para las versiones de seguridad de Node.js de octubre de 2026, y `follow-redirects` y la compilación de Restic incluida reciben correcciones de seguridad. [Detalles del incidente](https://emudhra.we-have-a-problem.com/) · [Comprobaciones TLS](security/emudhra/README.md)

**Comprobaciones Compose y Home Assistant:** Avisos de conflictos de puertos antes de guardar/desplegar, con variables, overrides y rangos resueltos; comparación de referencias de imágenes ejecutadas y corrección del YAML para revisar. Integración opcional de Home Assistant con sensores y controles de inicio/parada/reinicio limitados por permisos. [Guide](docs/HOME-ASSISTANT.md).

**Instance / Global:** Inicio: estadísticas locales primero y totales globales independientes de los filtros de stacks debajo. Cada tarjeta de resumen ofrece detalles por instancia y enlaces directos a sus menús. Las instancias desconectadas o antiguas aparecen como no disponibles; el resumen de copias distingue las instancias desactivadas.

**Estado de servicios de stacks detectadas:** Los proyectos Compose detectados pero no adoptados, como DDEV, ya no generan errores repetidos `spawn docker ENOENT` cuando su directorio no existe en la raíz de stacks. Las stacks externas adoptadas usan su directorio, nombre de proyecto y archivos Compose registrados para consultar el estado.

**Autenticación TOTP de dos factores opcional:** Actívela en **Ajustes → Seguridad → Ajustes 2FA** con su contraseña actual, escanee el código QR y confirme un código de su aplicación de autenticación. Guarde los diez códigos de recuperación de un solo uso; solo se muestran una vez. Está desactivada de forma predeterminada y protege el inicio de sesión local, no la autenticación por proxy ni los tokens de federación. Antes de activar la 2FA, utilice tokens de federación para las instancias vinculadas; las conexiones solo con contraseña dejarán de funcionar.

Guarde todo `/app/data`, incluido `two-factor.key`. Restaurar solo la base de datos no permite descifrar el secreto sin esta clave. Si pierde la aplicación y todos los códigos de recuperación, un administrador del contenedor puede ejecutar `./node_modules/.bin/tsx ./extra/reset-two-factor.ts --username ACCOUNT --confirm` desde `/app` y reiniciar Enhanced; la contraseña no cambia.

**Historial CPU/RAM por servicio Compose:** Active la grabación en **Monitorización** y abra **Consumo de recursos** en las acciones del stack. Los gráficos compactos muestran el total del stack y un historial por servicio Compose, incluidos los proyectos Compose no gestionados. Las actualizaciones y recreaciones conservan el mismo historial; las réplicas simultáneas se suman antes de calcular promedios y máximos. Las mediciones existentes se conservan sin reinicio. Períodos: 24 horas, 7 días, 1 mes, 1 año o todos los datos registrados. La grabación está desactivada por defecto y recoge muestras cada 5 minutos sin navegador abierto. CPU: 100 % equivale a un núcleo; la RAM en Linux excluye la caché recuperable. Se conservan los huecos y pueden perderse picos entre muestras. Los totales excluyen procesos nativos del host y contenedores fuera de Compose. Se mantiene la ordenación CPU/RAM en la lista de stacks.

**Copias con Zerobyte:** conecta una instancia existente o instala una instancia Compose dedicada desde **Copias de seguridad → Zerobyte**. Úsala junto con Restic nativo o para tus copias programadas, con repositorios separados. Incluye asistente de configuración, parada y reinicio protegidos de aplicaciones, comprobaciones del almacenamiento, restauraciones de prueba dedicadas y supervisión multiservidor de solo lectura. Si el almacenamiento de red no está disponible, la copia se bloquea sin recurrir al almacenamiento local. [Guía de configuración y recuperación](docs/zerobyte.es.md).

**Evitar que Restic guarde su propio repositorio:** si un repositorio local está dentro de una carpeta seleccionada, Enhanced le avisa y lo excluye automáticamente. Por ejemplo, puede mantener `/app/data` como origen y `/app/data/backups` como repositorio. No se permite seleccionar el propio repositorio ni sus subcarpetas como origen. Se conservan las rutas, contraseñas y opciones de retención existentes.

**Asistente opcional de comprobación de salud por servicio:** pulse **Configurar comprobación de salud** en un servicio de una stack existente o al crear una nueva. El asistente propone una URL HTTP local o un puerto TCP según los puertos internos de Compose. Revise o cambie el destino y el comando exacto antes de añadirlo al YAML; las comprobaciones existentes nunca se reemplazan automáticamente. La prueba se ejecuta dentro de la imagen, que debe incluir `/bin/sh` y `curl`/`wget` o `nc`. Compruebe el estado tras el despliegue; un puerto TCP abierto no garantiza que la aplicación esté lista.

En el modo de edición de Compose, **Comprobaciones de salud** también aparece en la barra de acciones de la stack. Elija el servicio si hay varios.

#### Actualizaciones e ImageWatcher

**Zona horaria de programaciones y TZ opcional por stack:** Seleccione la **Zona horaria de las programaciones** en **Ajustes → General**. Controla el inicio/parada de stacks, las actualizaciones de imágenes, las franjas de autoactualización y los crons nativos de Restic y seguridad de esta instancia. Sin elección explícita se conserva la zona actual del proceso; no se reescriben las horas guardadas. Las instancias vinculadas y herramientas externas como Zerobyte conservan sus propios ajustes. Los intervalos relativos, vencimientos de pausas y retenciones no cambian. Se aplica el horario de verano de la zona elegida: una hora inexistente no garantiza ejecución y una hora repetida puede ocurrir dos veces. Es preferible elegir una hora fuera de la transición, como las 04:00.

En las acciones de edición del stack, **Zona horaria de los contenedores** ofrece una opción **desactivada por defecto** para añadir `TZ` al borrador Compose y su override. Los valores existentes o heredados, incluidos los posibles valores de `env_file`/`extends`, requieren confirmación. Revise el YAML, guarde y recree/despliegue los contenedores. Las imágenes deben admitir `TZ`. No se modifican archivos `.env`/`env_file`; futuros cambios globales no reescriben ni recrean los stacks automáticamente.

**Notificaciones de actualizaciones de imágenes:** Discord y Apprise anuncian una actualización pendiente una sola vez por stack, imagen y digest remoto, incluso si espera una franja programada. Este registro se conserva tras reiniciar Enhanced. Un nuevo digest se vuelve a anunciar; los resultados de las actualizaciones automáticas mantienen su propia notificación. Los envíos fallidos se reintentan en las comprobaciones siguientes, por separado para cada webhook de Discord y el destino Apprise configurado.

**Los servicios detenidos permanecen detenidos:** una actualización automática de imagen se aplaza si un servicio Compose seleccionado, incluido un compañero necesario del espacio de nombres de red, está detenido o ausente. ImageWatcher vuelve a comprobarlo después de la descarga y antes de recrearlo, y reintenta más adelante. No utiliza `compose up` para iniciar un servicio detenido.

**Intervalos de comprobación:** en **Watcher > Imágenes**, el análisis general cubre todas las imágenes cada **6 horas por defecto**. Las imágenes en modo **Inmediato** también reciben comprobaciones específicas cada **5 minutos por defecto**. Este intervalo se puede ajustar en minutos u horas (entre 5 minutos y 24 horas), o desactivar solo las comprobaciones periódicas específicas; el análisis general sigue activo. Al seleccionar el modo Inmediato, todavía se puede iniciar una comprobación específica puntual.

**Preparación de montajes del host en macOS**

Antes de iniciar o actualizar una pila, Enhanced pide a Docker que prepare directamente cada directorio de origen de un montaje bind. Esto también cubre las rutas compartidas por Docker Desktop en macOS, como `/Users/...`, sin suponer que montar `/` permite acceder al sistema de archivos de macOS. Los montajes de archivos como `/etc/localtime` no se crean como directorios. Si Docker no puede acceder a una ruta de origen, la operación se detiene con el error real de Docker; compruebe que el directorio esté compartido con Docker Desktop.

**Espacio de Docker y conservación de imágenes antiguas de Enhanced**

Antes de la copia de seguridad o la descarga, la autoactualización comprueba el espacio libre del almacenamiento del daemon Docker. Se aplaza si falta espacio o no puede comprobarse; una actualización manual se detiene con una explicación. Un updater desaparecido se detecta en cualquier etapa; una descarga todavía activa después de 20 minutos se señala sin declararla detenida. Después de una actualización correcta, las imágenes antiguas de Enhanced sin uso obtenidas por digest se revisan cada día y pueden eliminarse tras 48 horas. Las imágenes activas, de reversión, recuperación o explícitamente excluidas siguen protegidas; esto no activa la limpieza general de imágenes.

**Coordinación más segura entre ImageWatcher y Self-Update**

Las consultas de registros y DNS ya no retrasan la actualización de Dockge-Enhanced. Las actualizaciones de imágenes, reversiones y limpiezas de etiquetas de rollback que modifican Docker comparten una reserva exclusiva con Self-Update: las operaciones incompatibles se aplazan en lugar de ejecutarse a la vez. El estado `scheduled` no bloquea innecesariamente ImageWatcher; el estado persistente protege al sidecar después de un reinicio. El panel de Actualizaciones prioriza la operación activa frente a una comprobación antigua de disponibilidad.

**Actualizaciones de imágenes agrupadas por stack**

La página de un stack permite aplicar los modos **Desactivado**, **Inmediato** o **Programado** a todas las imágenes elegibles. La vista previa muestra los cambios y se puede **conservar las excepciones individuales** (opción predeterminada) o reemplazarlas. Los servicios con `dockge.imageupdates.check=false` permanecen protegidos, las imágenes compartidas se cuentan una sola vez y las instancias vinculadas usan la misma validación. Las imágenes futuras no heredan esta configuración.

**ImageWatcher: actualizaciones inmediatas más rápidas y fiables**

Para las imágenes configuradas como **Inmediato**, ImageWatcher realiza una comprobación dirigida al activar la opción y después cada **5 minutos**, sin aumentar la frecuencia del análisis global. Cuando varias stacks comparten la misma imagen `:latest`, Enhanced comprueba la imagen **realmente ejecutada por cada contenedor**, no solo la etiqueta local: un servicio que sigue utilizando una versión antigua ya no aparece incorrectamente como actualizado. Las peticiones idénticas a los registros se comparten, los límites HTTP 429 activan una espera y cada comprobación se resume en los logs. Se respetan las pausas, las ventanas de mantenimiento y las protecciones de rollback.

**Exclusiones de estado y actualizaciones por servicio**

El editor visual de Compose puede añadir `dockge.status.ignore: "true"` para que un servicio opcional no degrade el estado global del stack tras desplegarlo, aunque su propio estado siga visible. También puede añadir `dockge.imageupdates.check: "false"` para excluir un servicio de las comprobaciones de ImageWatcher y de las actualizaciones automáticas o por lotes. La actualización explícita del servicio sigue disponible. Se conservan las etiquetas existentes y su sintaxis YAML. Funciones inspiradas en [hamphh/dockge](https://github.com/hamphh/dockge).

**Actualizar todas las imágenes Docker disponibles**

La página Actualizaciones procesa las imágenes detectadas una por una mediante el flujo Compose y de reversión existente. Muestra el progreso, se detiene ante el primer error y mantiene separada la autoactualización de Enhanced.

**Diagnósticos y metadatos de ImageWatcher (#493–#495)**

La vista Imágenes permite ordenar primero los errores. Se conservan los objetivos temporalmente inaccesibles, los tiempos de espera de manifiestos tienen reintentos limitados, los errores de registro/autenticación/digest son más claros y la fecha del stack solo cambia tras una actualización aplicada y confirmada.

**Controles de actualización de stacks e imágenes (#489–#490)**

La política automática de todo un stack se abre desde la barra de acciones en un diálogo, sin cambiar los ajustes individuales de contenedores. Los botones de actualizar, ignorar, pausar y revertir imágenes son más compactos y mantienen etiquetas accesibles.

**DNS de respaldo para comprobaciones de registries**

En **Watcher > Imágenes > DNS de respaldo**, se puede activar el respaldo DNS (desactivado por defecto), añadir, editar o eliminar servidores IPv4/IPv6 y probar consultas A y AAAA con tiempos y diagnósticos. El DNS del sistema tiene prioridad: el respaldo solo se usa ante fallos de resolución DNS en las solicitudes HTTP compatibles de ImageWatcher a registries y servicios de tokens. Quad9 (`9.9.9.9`, `2620:fe::fe`) y Cloudflare (`1.1.1.1`, `2606:4700:4700::1111`) son ejemplos modificables. Se conservan los ajustes guardados. No cambia el DNS del host ni de Docker Engine; las descargas y autoactualizaciones realizadas por Docker Engine no están cubiertas.

**Autoactualización mediante Docker Socket Proxy**

La comprobación de autoactualización y el sidecar de actualización siguen el endpoint Docker que Enhanced usa realmente: un socket Unix (incluido `DOCKGE_DOCKER_SOCKET`) o `DOCKER_HOST=tcp://…` detrás de un Docker Socket Proxy de confianza. En modo TCP no se monta ningún socket ficticio; el sidecar se conecta a las redes Docker de la instancia antes de consumir el plan firmado. Los permisos que debe permitir el proxy se describen más abajo, en la sección del flujo de actualización automática.

#### Copias de seguridad, limpieza y fiabilidad

**Limpieza de imágenes Docker más rápida y resistente a carreras**

La limpieza por lotes ahora carga el inventario Docker una sola vez y después revalida únicamente la imagen objetivo justo antes de cada `docker rmi`. La página Recursos ya no ejecuta un enorme `docker image inspect` solo para mostrar la lista, la inspección se limita por lotes y tolera que una imagen desaparezca durante una limpieza concurrente, y la expiración de rollbacks utiliza el mismo bloqueo de limpieza Docker. Se mantienen las protecciones de contenedores, rollback/recuperación y periodos de gracia.

**La limpieza usa ahora las referencias Docker reales**

La limpieza de imágenes sin uso ya no supone que el `Repository:Tag` mostrado por `docker images` sea una referencia realmente asociada y eliminable. Utiliza los `RepoTags` y `RepoDigests` inspeccionados, retira todas las referencias necesarias y, si hace falta, aplica un fallback seguro por Image ID antes de verificar que la imagen física desapareció. Se mantienen las protecciones de contenedores, exclusiones, Enhanced activa, recuperación, rollback y periodos de gracia.

**Los informes de limpieza ahora coinciden con el estado observado de Docker**

Cuando una inspección por lotes no devuelve una imagen, la limpieza comprueba ahora directamente su Image ID antes de declararla ausente. Cada eliminación se verifica de nuevo y un inventario final ligero de Docker confirma el resultado informado. Recursos muestra por separado el uso Docker y el estado de limpieza: una imagen `sin uso` todavía puede ser Enhanced activa, estar protegida para recuperación o rollback, ser demasiado reciente o estar excluida. Las imágenes sin etiqueta se describen de forma neutral como **Imagen sin etiqueta**, no como imágenes antiguas. El flujo sigue limitado a un inventario inicial, controles dirigidos y una verificación final ligera.

**Limpieza fiable de imágenes antiguas Dockge-Enhanced `<none>`**

Las imágenes antiguas `ghcr.io/aerya/dockge-enhanced:<none>` ahora se seleccionan desde el inventario Docker en lugar de depender de metadatos `RepoDigests` que pueden desaparecer tras un retag. Las imágenes que superan la protección de 48 h del self-update pueden limpiarse de forma fiable, mientras la imagen activa y las imágenes protegidas por recuperación permanecen intactas. El resumen de limpieza tampoco cuenta ya las imágenes normales realmente usadas como candidatas protegidas.

**Las imágenes sin uso `repository:<none>` ahora se eliminan realmente**

Docker puede conservar el nombre del repositorio de una imagen aunque su etiqueta pase a `<none>`. Hasta ahora esas imágenes quedaban entre la limpieza de huérfanas (`<none>:<none>`) y la de imágenes sin uso con etiqueta, por lo que los botones y la limpieza programada podían dejarlas acumulándose. Ahora se tratan como imágenes sin uso por Image ID, respetando contenedores, exclusiones, protecciones de rollback/recuperación y periodos de gracia. Las imágenes antiguas de Dockge-Enhanced mantienen además su protección especial de 48 h para self-update.

**Edad de limpieza por imagen para versiones antiguas de Dockge-Enhanced**

Las imágenes antiguas `ghcr.io/aerya/dockge-enhanced:<none>` obtenidas por digest ahora caducan de forma independiente. Una nueva autoactualización correcta ya no reinicia el plazo de 48 h de todas las imágenes Enhanced anteriores: cada imagen obsoleta se evalúa según su propia fecha de creación, mientras la imagen activa y los snapshots de recuperación siguen protegidos. Si la limpieza Docker unificada usa un periodo de gracia mayor, ese valor más alto sigue teniendo prioridad.

**Limpieza Docker unificada y recuperación exacta**

Recursos Docker comparte un único inventario por Image ID entre la página Imágenes, la vista previa de Limpieza y las purgas. El mismo periodo de gracia se aplica ahora a la limpieza manual y automática, las distintas etiquetas de una misma imagen física cuentan una sola vez y una imagen que desaparece durante la limpieza se considera ya ausente en lugar de un error. Las imágenes de contenedores detenidos y los recursos de rollback/recuperación siguen protegidos. Imágenes, redes, volúmenes y caché de build se seleccionan por separado, los resultados se guardan por categoría y los vencimientos se comprueban cada 15 minutos con una sola recuperación tras una suspensión o reinicio. Al activar la limpieza unificada se suspenden los ajustes antiguos sin borrarlos.

**Inicialización y usabilidad de Restic (#491)**

Guardar ajustes, ejecutar copias y mantener repositorios son acciones separadas; el estado del repositorio y la ayuda de retención son más claros y se refuerza la inicialización.

**Mensajes backend en inglés (#477)**

Los errores de contraseña de Restic, los informes de limpieza y los mensajes de autoactualización dejan de mostrarse en francés en instalaciones inglesas.

**Healthcheck con un proxy HTTP configurado**

El healthcheck integrado del contenedor ignora las variables de proxy y consulta directamente `127.0.0.1`, de modo que un proxy configurado o inaccesible ya no marca Enhanced como «unhealthy». Los demás accesos de red siguen usando el proxy configurado.

#### Supervisión e integraciones

**Monitorización eléctrica opcional con PowerWatch**

[PowerWatch](https://github.com/Aerya/PowerWatch) puede conectarse en modo **Externo**, que solo lee un contenedor local o una URL HTTP(S) existente sin controlarlo nunca, o desplegarse en modo **Gestionado** como una stack Compose real. La instalación gestionada detecta las capacidades RAPL, MSR y NVIDIA del host, activa únicamente los accesos necesarios, nunca utiliza `privileged: true` y conserva el historial y los ajustes en un volumen persistente al detenerse o desactivarse.

La potencia instantánea global, su nivel de confianza y un enlace directo a la WebUI aparecen en Monitoring, la barra del sistema y los resúmenes compactos de instancias vinculadas mediante la federación existente. La barra del sistema y las tarjetas de instancia muestran solo los vatios junto al icono eléctrico; el tooltip identifica PowerWatch y su confianza Measured o Estimated. PowerWatch mide o estima el consumo según los sensores disponibles.

También puede instalarse y gestionarse un **PowerWatch Hub** desde Enhanced, o conectarse uno existente mediante su URL WebUI. Sigue siendo un servicio independiente: agrupa las API HTTP privadas de instancias PowerWatch existentes en su propio panel y no necesita privilegios de hardware del host. Dockge-Enhanced solo abre este enlace global del Hub; no lo duplica para cada instancia vinculada. PowerWatch dispone ahora de autenticación nativa opcional, **desactivada por defecto**, con tokens API Bearer de solo lectura. **Enhanced ya admite los tokens Bearer de solo lectura** para consultar directamente instancias PowerWatch protegidas. Introduce el token en **Monitorización → PowerWatch → Token API de solo lectura**. El token guardado permanece oculto y nunca se envía al Hub. El Hub también ofrece un token opcional para proteger su administración. Nunca expongas una interfaz sin protección a Internet.

**Servicios opcionales: Kula, Dozzle, PowerWatch y Hub**

En **Monitoring** (`/watcher/monitoring`), los cuatro servicios de terceros tienen tarjetas independientes con descripción y enlace a GitHub. PowerWatch y Hub incluyen modos externo y gestionado, instalación, inicio, reinicio, parada y prueba de conexión. El Hub gestionado utiliza el binario `powerwatch-hub` de la imagen PowerWatch, escucha de forma predeterminada en `127.0.0.1:3065` y conserva los datos en su propio volumen Docker.

El Hub funciona sin un PowerWatch local. Un servicio accesible únicamente en `127.0.0.1` del host **no puede ser alcanzado directamente desde el contenedor Hub**: se necesita una dirección privada accesible y protegida. No exponga interfaces sin protección a Internet: la autenticación nativa de PowerWatch es opcional.

Para conectar un **PowerWatch existente**, indique únicamente la dirección de su **WebUI** (por ejemplo, `http://192.168.0.64:3064`) en el campo URL de PowerWatch: Enhanced consultará automáticamente `/api/snapshot` en esa dirección. Una URL de WebUI distinta solo es necesaria en configuraciones especiales con proxy inverso y permanece en las opciones avanzadas. Para un **Hub existente**, basta con su dirección WebUI; Enhanced utiliza `/api/hub/snapshot` automáticamente.

**Historial opcional de CPU/RAM del host**

Monitoring puede guardar una muestra ligera de CPU y RAM cada 5 minutos sin navegador abierto. El gráfico SVG adaptable ofrece 24 horas, 7 días, 1 mes o un rango personalizado; el periodo mostrado puede guardarse y restaurarse en la siguiente visita. Los periodos largos se agregan en el servidor y los apagados quedan visibles como huecos. El registro está desactivado por defecto y continúa en modo de bajo consumo si se activa expresamente.

El historial opcional de CPU/RAM conserva sus interrupciones reales de muestreo, pero usa un gráfico más compacto inspirado en PowerWatch, con líneas de cuadrícula más ligeras y áreas rellenas sutiles.

#### Stacks, interfaz y usabilidad

**Acciones de stack accesibles directamente**

Todas las acciones del stack están disponibles directamente en la barra de acciones, sin submenús, en grupos separados visualmente que pasan a la línea siguiente según el ancho disponible. Los modos solo iconos e iconos con texto conservan sus tooltips; los comandos, las condiciones de disponibilidad y las confirmaciones no cambian.

**Interfaz en alemán**

La interfaz y las novedades están disponibles en alemán, con README y changelog en alemán. Las notificaciones de Discord y Apprise usan el inglés cuando se selecciona el alemán.

**Contadores de contenedores en la página de inicio**

La página de inicio muestra los contenedores en ejecución, detenidos y en pausa, incluidos los de las instancias vinculadas accesibles. Los contadores de stacks y contenedores siguen el filtro de instancia de la lista de stacks.

**Arranques de stacks más seguros y comprobaciones de imágenes inmediatas**

Antes de las operaciones de inicio, despliegue o recreación, Enhanced prepara los directorios de bind absolutos que faltan cuando el montaje es claramente un directorio. Es especialmente útil en NAS como Synology, donde Docker rechaza un origen de bind que aún no existe. Los orígenes que parecen archivos nunca se crean como directorios. Elegir la actualización automática **Inmediato** para una imagen lanza ahora una comprobación dirigida en cuanto se guarda la política. Los reinicios correctos de un stack también actualizan su estado real y ocultan la salida de progreso de Compose ya obsoleta.

**Volúmenes y registros más claros en las stacks**

Los volúmenes montados y los contenedores reales usan filas compactas en lugar de botones de ancho completo. En los registros, los tres filtros aparecen uno debajo de otro, las acciones se agrupan y la búsqueda queda al final; los nombres de los filtros siguen disponibles para las tecnologías de asistencia. Los ajustes de apariencia permiten activar las marcas de tiempo por defecto en este navegador.

**Paletas de colores para el día y la noche**

Los ajustes de apariencia ofrecen ahora paletas distintas para los modos claro y oscuro: cuatro opciones de día y ocho de noche, incluidos los temas originales. Catppuccin, Nord, Solarized, Dracula, Gruvbox, Tokyo Night y Rosé Pine cambian los colores de la página, la cabecera, los paneles y los controles. Las preferencias se guardan en el navegador y el modo Auto sigue el tema del sistema.

**Conexiones fiables entre instancias vinculadas**

Añadir o modificar una instancia vinculada ahora actualiza las sesiones del navegador sin desconectar las conexiones de federación. Ambas instancias permanecen conectadas tras sincronizar la malla y después de un reinicio.

**Gestores de contraseñas**

La creación de la cuenta identifica ahora los campos de usuario y nueva contraseña para los gestores de contraseñas del navegador.

**Controles de stacks y creación Compose**

La pausa/reanudación congela los contenedores sin eliminar volúmenes. Las actualizaciones automáticas de imágenes esperan hasta reanudar; la acción se bloquea durante copias o restauraciones Restic y la pausa no está disponible para la propia stack de Enhanced ni para stacks con políticas de copia que detienen servicios o usan hooks. Los ajustes generales incluyen una plantilla Compose predeterminada validada solo para nuevas stacks. El README.md de cada stack se abre desde un botón en lugar de una barra de ancho completo; los iconos de acciones de contenedor muestran ayuda contextual. La protección ya existente para modos octales `tmpfs` y el resaltado de variables Compose no cambian.

**Acciones de stack más claras**

Los botones explican ahora qué ejecutan. Un panel de ayuda muestra los comandos Docker Compose reales de la stack seleccionada, incluidas sus opciones de proyecto y archivos Compose, con enlaces a la documentación Docker. El antiguo botón « Detener y desactivar » se llama ahora « Desmontar la stack »: ejecuta `docker compose down` tras una confirmación y elimina contenedores y redes Compose, pero no volúmenes con nombre, datos bind, archivos Compose ni imágenes. Los volúmenes anónimos pueden no volver a montarse con el siguiente `up`.

**Nombre visible de las stacks**

Puede definir un nombre visible desde la página de cada stack. Su nombre técnico, proyecto Compose, selección de copias de seguridad y ruta de restauración no cambian; el nombre técnico sigue visible junto al alias.

**Vista por contenedor real**

Cada servicio Compose muestra sus contenedores por separado, incluidas las réplicas. Puede abrir uno para ver su estado, salud, imagen, puertos, recursos y registros recientes, o iniciar, detener y reiniciar solo ese contenedor. Las acciones sobre el servicio completo no cambian. Función inspirada en [Lorwell/dockge](https://github.com/Lorwell/dockge).

**Gestor de archivos del host opcional**

La página Archivos, activada expresamente, permite explorar un directorio dedicado del host, editar pequeños archivos UTF-8, transferir archivos y seguir registros escritos en archivos, tanto localmente como en una instancia Enhanced vinculada. Es independiente del navegador de volúmenes por pila y no permite acceder a rutas fuera de la raíz autorizada.

Monte únicamente el directorio que quiera exponer en Enhanced y configure `DOCKGE_FILE_MANAGER_ROOT` con su ruta **dentro del contenedor**. Por ejemplo, añada `- /srv/compartido:/managed-files` a `volumes:` y `DOCKGE_FILE_MANAGER_ROOT: /managed-files` a `environment:`. Sin esta configuración, el gestor permanece desactivado; **no monte `/` ni un directorio amplio del host**. También rechaza operaciones si la autenticación está desactivada. `DOCKGE_FILE_MANAGER_MAX_FILE_SIZE` limita opcionalmente las transferencias (100 MiB por defecto); la edición de texto en línea se limita a 1 MiB. Cada instancia vinculada necesita su propio montaje y ajuste.

**Copiar y pegar en los terminales de contenedores**

El clic derecho abre el menú nativo Copiar/Pegar del terminal. El pegado con teclado también funciona en direcciones HTTP locales sin depender de la API del portapapeles del navegador.

**README.md para las pilas gestionadas**

La página de una pila permite mostrar y editar un `README.md` en Markdown, guardado junto al archivo Compose. Es distinto de la nota breve y se transfiere al copiarla o moverla a otra instancia Dockge-Enhanced. Esta función no modifica las pilas externas.

### 🆕 Septiembre de 2026

**Limpieza automática de imágenes más fiable**

La limpieza ya no salta la siguiente ejecución programada si la anterior terminó unos segundos después de la hora prevista. Se conservan las imágenes usadas por cualquier contenedor, incluso detenido, y las imágenes de rollback. Las imágenes antiguas de Dockge-Enhanced descargadas por digest pueden eliminarse en la siguiente limpieza al menos 48 horas después de una autoactualización correcta; se conservan la imagen activa y las de recuperación. Los errores Docker de la última limpieza aparecen en Recursos Docker.

**Alertas de disponibilidad de federación sin spam nocturno**

Las notificaciones del disyuntor ahora están ligadas a un episodio continuo de indisponibilidad: cada instancia vinculada envía como máximo una alerta mientras el peer siga fuera de línea y la alerta solo se rearma después de que el peer vuelva a autenticarse correctamente. Cada instancia remota también puede marcarse localmente como **Máquina intermitente — no alertar si no está disponible**. Este modo está pensado para PC, portátiles y otros peers que se apagan o suspenden habitualmente; las reconexiones automáticas, el backoff y la protección del disyuntor siguen activos. Como la preferencia es local, hay que marcar el peer intermitente en cada instancia Dockge siempre encendida desde la que no se quieran recibir alertas.

**Transporte de federación compartido a nivel de proceso**

La federación utiliza ahora un único transporte saliente compartido por proceso Dockge-Enhanced, en lugar de un conjunto de conexiones por socket WebUI. Las instancias vinculadas se cargan desde SQLite y se conectan automáticamente cuando el servidor empieza a escuchar. Abrir varias WebUI ya no multiplica los sockets remotos, cerrar el último navegador no desconecta las instancias vinculadas y el reintento del disyuntor continúa tras unos 5 minutos incluso sin ninguna WebUI abierta. Los cambios de credenciales, la reparación del mesh y la eliminación de un peer resincronizan inmediatamente el transporte compartido.

**Protección contra tormentas de reconexión de federación**

Los sockets federados usan ahora una ruta de autenticación ligera y ya no ejecutan la inicialización WebUI de stacks/agentes. Las reconexiones Socket.IO están explícitamente limitadas mediante backoff exponencial, jitter y un disyuntor de 5 minutos. Los handshakes de federación entrantes excesivos se rechazan antes de autenticar y se limita el número de sockets federados entrantes simultáneos. Si se activa una protección de reconexión o se detecta contención SQLite/Knex, la configuración Discord/Apprise existente envía una alerta limitada sin consultar SQLite.

**Actualizaciones dirigidas seguras para namespaces de red**

Las actualizaciones dirigidas de imágenes, las recreaciones de servicios y los rollbacks de imágenes resuelven ahora el modelo Compose completo antes de sustituir un contenedor. Cuando otros servicios comparten su namespace de red mediante `network_mode: service:<servicio>` o `network_mode: container:<container_name>`, todos los consumidores directos y transitivos se recrean de forma forzada junto con el proveedor en una única operación Compose dirigida. Los servicios no relacionados no se modifican y las stacks VPN, Gluetun y los sidecars ya no conservan el namespace obsoleto de un contenedor eliminado.

**Stacks externas (Beta)**

Enhanced puede detectar proyectos Docker Compose existentes, adoptarlos **sin mover su Compose/.env ni sus datos** y gestionarlos después desde la interfaz normal de stacks. Si una ruta de origen aún no es accesible desde Enhanced, una autorización protegida en un clic adapta automáticamente el Compose de Enhanced. Las stacks adoptadas conservan el nombre del proyecto sin el prefijo redundante `external-` y muestran la insignia **Externa**; borrar los archivos de origen requiere una confirmación explícita adicional. El escáner también relaciona el directorio de stacks de Enhanced con su bind del host, por lo que las stacks ya gestionadas por la instancia se excluyen incluso cuando las etiquetas de Docker Compose contienen rutas del host.

Cuando se selecciona la eliminación permanente del origen, Enhanced retira ahora el bind de origen y su entrada de autorización de su propio Compose mediante el helper protegido, recrea únicamente su contenedor y después elimina la carpeta del host. Así se evitan los errores `EBUSY` causados al intentar borrar un directorio que todavía es un punto de montaje de Enhanced.

Un caso admitido explícitamente es [Gluetun-Companion](https://github.com/Aerya/Gluetun-Companion): puede recrear una stack Gluetun ya gestionada por Enhanced desde una ruta `/compose` montada mediante bind. Enhanced ahora relaciona este tipo de alias de ruta Compose con la stack nativa y deja de proponerla erróneamente como externa.

**Conteo anónimo de instalaciones**

Para conocer de forma aproximada cuántas instalaciones de Dockge-Enhanced están realmente activas sin operar un servicio de analítica separado, Enhanced descarga como máximo una vez al mes un pequeño archivo técnico alojado en una release de GitHub dedicada. El `download_count` público de GitHub de ese asset mensual es el único agregado utilizado para el conteo.

No se genera ni se transmite ningún identificador de instalación. La solicitud no contiene hostname, nombre de instancia, stack, contenedor, imagen Docker, configuración, ruta, cuenta de GitHub, correo electrónico, arquitectura ni identificador de build. Como con cualquier descarga de un asset de GitHub, la conexión es procesada por GitHub; Dockge-Enhanced no recibe ni almacena las direcciones IP de las instalaciones.

El mes ya contabilizado se guarda únicamente en el directorio de datos local para que una misma instalación descargue el asset como máximo una vez al mes. El conteo está activado por defecto y puede desactivarse con `DOCKGE_USAGE_COUNT=false`. Recrear o borrar el directorio de datos puede hacer que una instalación vuelva a contarse durante el mismo mes, por lo que la cifra es deliberadamente aproximada.

El mecanismo es completamente público: [código en Enhanced](./backend/anonymous-install-count.ts), [workflow de GitHub que crea los assets mensuales](./.github/workflows/usage-count-asset.yml) y [contadores mensuales agregados](https://github.com/Aerya/Dockge-Enhanced/releases/tag/usage-count).

Los propietarios del repositorio pueden añadir un secreto de Actions llamado `USAGE_COUNT_DISCORD_WEBHOOK` para recibir un conteo provisional cada lunes y el total definitivo del mes anterior el primer día de cada mes. El workflow también puede ejecutarse manualmente para enviar el conteo actual de inmediato. El valor del webhook permanece cifrado por GitHub y nunca se guarda en el repositorio.

**Búsqueda global multi-instancia V2 (`Ctrl+K`)**

La paleta global admite ahora **búsqueda difusa** para pequeños errores de escritura y operadores asistidos como `type:`, `stack:`, `image:`, `port:`, `instance:` y filtros operativos `is:update`, `is:stopped`, `is:vulnerable`, `is:critical` e `is:backup-failed`. Los operadores aparecen como botones dentro de la propia paleta, por lo que no hace falta memorizar la sintaxis. Los resultados Compose y `.env` abren la stack correspondiente y llevan CodeMirror directamente a la línea encontrada. Las búsquedas recientes y fijadas se guardan localmente en el navegador.

La búsqueda histórica en **snapshots Restic recientes** se activa de forma explícita y está limitada a 5 snapshots y 80 archivos Compose/.env por instancia para proteger repositorios remotos. La búsqueda dentro de **valores `.env`** también es opcional: el valor solo se usa para detectar coincidencias, nunca se devuelve ni se muestra y, mientras este modo sensible está activo, la consulta no se guarda en recientes ni favoritos. Las instancias vinculadas usan el protocolo V2 cuando está disponible y conservan un fallback V1 para búsquedas simples en instancias antiguas.

**Protección de la actualización automática durante la edición de Compose/.env**

Cuando un compose, su override o su `.env` contiene cambios no guardados en la WebUI, la instancia Dockge-Enhanced propietaria bloquea temporalmente su actualización automática, incluso si la edición se abrió desde otra WebUI vinculada. El editor mantiene un lease corto mediante heartbeat para que las sesiones abandonadas caduquen automáticamente. Si una actualización queda lista mientras hay trabajo sin guardar, un diálogo permite **guardar y actualizar**, **aplazar 30 minutos**, **aplazar 1 hora** o **seguir trabajando**. El backend vuelve a comprobar los bloqueos antes de preparar y lanzar el sidecar para evitar que una edición iniciada durante el backup o la verificación sea interrumpida por el reinicio.

**Resumen de las instancias vinculadas en la página de inicio**

El panel de agentes existente en la página de inicio funciona ahora también como resumen compacto de la infraestructura. Cada instancia Dockge-Enhanced vinculada muestra el número y estado de sus stacks, el uso de CPU/RAM del host, el uptime y el número de stacks fijados, conservando las acciones existentes para renombrar, reautenticar, eliminar y añadir agentes. Un clic en una instancia filtra la lista de stacks de la izquierda a ese servidor; un segundo clic restaura la vista de todos los servidores.

**Estadísticas CPU/RAM por stack entre instancias vinculadas**

La opción **Mostrar estadísticas CPU / RAM por stack** pertenece ahora a cada instancia Dockge-Enhanced. Cuando se activa en un servidor, ese servidor recopila sus propias estadísticas Docker y las expone mediante el canal existente de instancias vinculadas. Cualquier WebUI vinculada que muestre ese servidor presenta los mismos indicadores CPU/RAM para sus stacks y contenedores. Ocultar el servidor oculta sus estadísticas; desactivar la opción en la instancia propietaria detiene su recopilación y exposición.

**Stacks fijados persistentes entre instancias vinculadas**

Los stacks fijados pertenecen ahora a la instancia Dockge-Enhanced que los aloja, y ya no al `localStorage` de un navegador. Fijar un stack de Garuda, DockerLab o LincStation guarda la preferencia en el servidor correspondiente. Cualquier WebUI vinculada que muestre ese servidor ve el mismo stack fijado; ocultar el servidor oculta sus pins sin borrarlos. Los pins sobreviven así a cierres e inicios de sesión, cambios de navegador y actualizaciones de Dockge-Enhanced. Los pins locales anteriores se migran automáticamente cuando sus instancias propietarias están disponibles.

**Retención dedicada de las copias de self-update**

Los snapshots Restic obligatorios creados antes de una autoactualización protegida de Dockge-Enhanced usan ahora una política de retención dedicada. Una vez que el nuevo snapshot se ha **creado y verificado**, Dockge-Enhanced conserva los **2 últimos snapshots de self-update de esta instalación** y elimina las generaciones anteriores antes de iniciar el sidecar. Una etiqueta estable específica de la instalación evita limpiar snapshots de otra instancia Dockge-Enhanced que comparta el mismo repositorio Restic. La retención normal (`keepLast`, diaria, semanal y mensual) no cambia. Si esta limpieza dedicada falla, se conserva la copia verificada y la actualización puede continuar; el error queda registrado y una autoactualización posterior volverá a intentar la limpieza.

**Correspondencia de nombres de proyecto Docker Compose**

Las stacks gestionadas cuyo directorio contiene puntos o mayúsculas se relacionan ahora con Docker Compose mediante la ruta real `ConfigFiles`, en lugar de depender únicamente del nombre de proyecto normalizado por Docker. Esto evita entradas duplicadas “gestionada/detenida” y “externa/en ejecución” para la misma stack.

**Compatibilidad con la sintaxis larga de puertos Compose**

Las tarjetas de contenedores admiten ahora tanto la sintaxis corta como la larga de puertos Compose. Las definiciones con `published`, `target`, `protocol`, `mode` o `host_ip` ya no provocan `split is not a function` ni hacen desaparecer la tarjeta del contenedor. Los valores IPv6 de `host_ip` también se formatean correctamente en los enlaces generados.

**Corrección y formato YAML de Compose**

El editor de la stack incluye una acción **Corregir / formatear YAML** para `compose.yaml`. Si el documento ya es válido, la sangría se normaliza a **2 espacios**. Si es inválido por errores comunes de sangría de Compose, Dockge-Enhanced intenta realinear claves y listas (`services`, opciones de servicio, `environment`, `ports`, `volumes`, `healthcheck.test`, etc.), valida el resultado y después lo formatea. Se conservan los comentarios y los permisos `tmpfs.mode` con cero inicial. Si no puede producirse una corrección segura, el contenido original no se modifica y se muestra el error.

**Conservación de permisos tmpfs en el editor Compose**

El editor visual de Compose conserva ahora los valores octales con cero inicial, como `tmpfs.mode: 01777`, cuando regenera el YAML. Modificar otro campo ya no reescribe silenciosamente ese permiso como `1777`.

**Protección reforzada contra path traversal en stacks**

Los nombres de stacks enviados a las operaciones backend se validan ahora antes de resolver cualquier ruta, incluidos los caminos de código que omiten intencionadamente el descubrimiento del sistema de archivos. Un nombre manipulado como `../outside` ya no puede salir del directorio de stacks gestionadas para acceder a archivos Compose o `.env` de otra aplicación.

**Autoactualización protegida de Dockge-Enhanced**

Dockge-Enhanced puede actualizarse mediante un sidecar deliberadamente restringido. Cada actualización exige una copia Restic y una comprobación de integridad del repositorio antes de reemplazar el contenedor. La nueva versión debe superar las comprobaciones de disponibilidad o se restaura automáticamente la imagen anterior.

**Estado de actualizaciones en servidores remotos**

La información de actualización de imágenes se obtiene independientemente de cada instancia conectada, por lo que las stacks remotas muestran sus propios indicadores sin mezclar servidores.

**Identificación clara de builds y progreso**

La página de Actualizaciones identifica los builds mediante metadatos OCI y muestra de forma coherente las etapas, el progreso Restic y el tiempo transcurrido.

**Anuncios remotos**

Dockge-Enhanced puede mostrar un **anuncio operativo de solo texto publicado desde este repositorio de GitHub**, de forma independiente al mecanismo de actualización de la imagen Docker. Este canal de seguridad se añadió tras el incidente de autoactualización de finales de agosto / principios de septiembre de 2026: si una futura compilación presenta un problema importante, una versión instalada afectada podrá recibir una advertencia sin tener que esperar a que funcione ese mismo mecanismo de actualización.

Los anuncios proceden de [`remote-announcements.json`](remote-announcements.json). Son opcionales, se obtienen únicamente mediante HTTPS, se validan con un esquema estricto, tienen límites de tamaño y cantidad y pueden dirigirse por versión de la aplicación, revisión Git o fecha de compilación OCI. **No pueden ejecutar comandos, inyectar HTML ni iniciar una actualización**. Los enlaces se limitan al repositorio GitHub de Dockge-Enhanced. Si GitHub no está disponible o el documento no es válido, no se muestra ningún anuncio.

Cerrar un anuncio solo lo oculta durante la sesión del navegador. **No volver a mostrar** guarda su identificador en los datos persistentes de Dockge-Enhanced; un nuevo anuncio utiliza un identificador nuevo.

**Compatibilidad entre instancias vinculadas**

**Copiar**, **Mover** y **Replicar** negocian un **protocolo de transferencia** independiente del SHA del build. Se permiten builds diferentes cuando su protocolo es compatible. Si los protocolos son incompatibles, no comienza ninguna transferencia. Una instancia remota suficientemente reciente puede actualizarse desde la WebUI mediante el self-update normal (copia Restic, sidecar, healthcheck y rollback), y Dockge-Enhanced espera hasta **2 horas** a que vuelva a conectarse antes de continuar. Una versión demasiado antigua para responder al handshake requiere actualización manual. La réplica permanente pasa a **Esperando compatibilidad** y reintenta aproximadamente cada 10 minutos sin modificar datos.

**Identificación permanente de la instancia local**

El **nombre de la instancia local** configurado en Dockge Agents se muestra permanentemente en la cabecera de escritorio/móvil y en el título de la pestaña (`NombreInstancia · Dockge-Enhanced`). Si no hay nombre, se utiliza el host (`IP:puerto` o dominio). No se necesita ningún ajuste adicional.

**Registro de novedades no leídas**

La ventana de novedades conserva ahora cada entrada de release individualmente. Si se instalan varias actualizaciones automáticas sin abrir la WebUI, **todas las novedades acumuladas** se muestran en la siguiente visita. Abrir o recargar la página no marca nada como leído: las entradas mostradas solo se confirman cuando el usuario cierra explícitamente la ventana. El seguimiento usa los IDs de las releases y ya no depende de su posición en la lista. El antiguo marcador `releaseNewsSeen` se migra automáticamente sin volver a mostrar todo el historial a los usuarios existentes.

### Agosto de 2026

**Migración transaccional y replicación de stacks**

Cree las nuevas políticas de replicación **directamente en la instancia de origen**. Cada política se guarda en la instancia donde se creó y no se comparte automáticamente entre instancias vinculadas. Las políticas anteriores creadas desde otra instancia siguen gestionándose allí; revise y elimine manualmente cualquier política duplicada antes de crear otra. Este cambio no elimina políticas ni datos de réplicas.

Al ver una stack de origen vinculada, Enhanced muestra el estado de replicación de la instancia de origen en modo de solo lectura, separado de cualquier política anterior gestionada por la instancia actual. La configuración de la política no se envía a la vista vinculada.

Las stacks pueden copiarse o moverse entre instancias junto con su configuración Compose y sus datos persistentes, con transferencias reanudables y rollback.

**Requisitos del host y recuperación automática**

Una stack puede requerir montajes del host o servicios `systemd` antes de arrancar y Dockge-Enhanced puede supervisar su disponibilidad.

**Interfaz responsive y monitorización mejorada**

La navegación, Logs/Compose, indicadores de recursos, tarjetas de salud, temas y vista móvil fueron ampliamente renovados.

➡️ **[Consultar el changelog completo](CHANGELOG.es-ES.md)**

</details>

---

## Catálogo de funcionalidades

<details>
<summary>Mostrar todas las funcionalidades</summary>

### Multiservidor y federación
- Federación en malla completa entre instancias Dockge-Enhanced, administrables desde cualquier WebUI vinculada
- Conexiones inversas opcionales para hosts detrás de NAT/CGNAT, con un token por nodo, conexión automática y revocación; los agentes inversos pertenecen a su servidor central ([guía](docs/compose-and-reverse-agents.md))
- Etiquetas de agente persistentes y filtrado por etiqueta, combinados con el filtro por instancia
- Selección, agrupación y colores estables de los servidores en la lista de stacks
- Resumen de instancias vinculadas en la página de inicio, con estadísticas Instance / Global, accesibilidad y enlaces directos a cada WebUI
- Estado de los stacks, insignias de actualización de imágenes y estadísticas CPU/RAM por stack desde cada instancia
- Tokens de federación dedicados, reparación de enlaces rotos y conexiones conservadas al refrescar el navegador
- Transporte de federación compartido por el proceso, reconexiones limitadas, circuit breaker y una sola alerta de disponibilidad por caída
- Máquinas intermitentes que pueden excluirse de las alertas de disponibilidad
- Negociación del protocolo de transferencia entre versiones distintas de Dockge-Enhanced
- Elección por instancia de nombre de host o dirección IP para los enlaces de puertos de los contenedores

### Gestión de stacks
- Crear, editar, iniciar, detener, reiniciar, actualizar, recrear, pausar/reanudar y desmontar stacks Compose
- Barra de acciones del stack accesible directamente, en modo solo iconos o iconos con texto, con los comandos Compose explicados
- Acciones por servicio y por contenedor, incluidos los contenedores reales y las réplicas Compose
- Recreación automática de los servicios directos y transitivos que comparten un namespace de red VPN mediante `service:` o `container:`
- Build + Recreate para imágenes construidas localmente
- Inicio/parada programados de stacks y contenedores
- Requisitos de arranque del host (montajes y servicios `systemd`), con supervisión y recuperación opcionales
- Stacks fijados guardados en el servidor y compartidos entre WebUI vinculadas
- Nombre visible opcional en la WebUI, sin cambiar el proyecto Compose ni la identidad Restic
- Notas por stack, `README.md` en Markdown y herramientas Git
- Ordenación por nombre, estado, instancia, fecha de creación, última actualización, CPU o RAM
- Barra lateral plegable y redimensionable con indicadores compactos de estado, CPU y RAM, y espacio Logs/Compose flexible
- Correspondencia de nombres de proyectos Compose: los directorios con puntos o mayúsculas no crean stacks duplicados
- Detección y adopción de stacks Compose externos sin mover archivos ni datos, con autorización protegida de rutas
- Eliminación completa opcional de los stacks externos adoptados y limpieza por etiquetas de stacks externos rotos, con confirmaciones reforzadas
- Opción por servicio para ignorar un servicio opcional en el estado global del stack

### Edición de Compose
- límites opcionales de CPU/RAM por servicio — Preparado en esta PR; todavía no publicado. Solo modifica el borrador. Guarde y despliegue/recree explícitamente para aplicarlo a los contenedores; los contenedores activos no se modifican aquí.
- Editores de Compose, `compose.override.yaml` y `.env` con resaltado de variables, plegado, búsqueda y pantalla completa
- Plantillas Compose y `.env` por defecto validadas, aplicadas solo a los stacks nuevos
- Enlaces HTTP/HTTPS con nombre para los stacks
- Acción Corregir / formatear YAML, conservación de valores entre comillas y de los modos octales de `tmpfs`
- Compatibilidad con la sintaxis larga de puertos
- Asistente opcional de healthcheck por servicio, con propuesta HTTP/TCP editable y vista previa del comando
- Comprobaciones orientativas de conflictos de puertos y diferencias con la imagen en ejecución antes de guardar o desplegar
- `TZ` opcional por stack, aplicada solo tras revisión y confirmación
- Asistente de etiquetas PlugNPiN para Nginx Proxy Manager, Pi-hole y AdGuard Home

### Migración y replicación
- Copiar o mover stacks entre instancias con su configuración Compose
- Transferencia de bind mounts y volúmenes con nombre, con correspondencias origen → destino editables
- Transferencias HTTP directas reanudables, repositorios Restic compartidos o perfiles SSH/rsync explícitos
- Verificación SHA-256, despliegue transaccional y rollback
- Transferencia opcional de imágenes Docker locales y de credenciales cifradas de registros privados
- Detección de conflictos de `container_name` y errores de despliegue reales
- Finalización explícita de un traslado o vuelta al origen
- Réplicas en frío programadas, configuradas en la instancia de origen, con snapshots conservados y conmutación manual
- Pruebas aisladas de recuperación ante desastres y perfiles de aplicación para PostgreSQL, MariaDB/MySQL, Redis y SQLite

### Copias y recuperación
- Copias Restic nativas de Compose, `.env`, bind mounts, volúmenes con nombre y `/app/data`
- Varios destinos: local, SFTP/NAS, S3/Backblaze B2 y REST Server
- Copias programadas, **Crear copia ahora** y copias al guardar el Compose, con protección contra ejecuciones simultáneas
- Coherencia por stack: en caliente, detener y reiniciar, o hooks de aplicación
- Exclusión de stacks, patrones de exclusión integrados y personalizados, y exclusión automática de repositorios locales anidados
- Inicialización solo de los repositorios ausentes, con bloqueo ante errores de acceso, red o contraseña
- Retención ordinaria y retención dedicada a las copias de autoactualización
- Reinicio seguro de repositorios Local, SFTP, S3 y REST, conservando el repositorio anterior para la recuperación
- Explorador de snapshots con vistas previas y diferencias, restauración selectiva y restauración por stack
- Pruebas de restauración tras las copias programadas, `restic check`, historial y alertas de copias atrasadas
- Zerobyte opcional: conexión a una instancia existente o instalación Compose gestionada dedicada, junto a Restic o para las copias programadas, con repositorios separados
- Creación guiada de orígenes, repositorios y trabajos de Zerobyte; los trabajos nuevos permanecen desactivados hasta su revisión, y los existentes pueden migrarse tras confirmación
- Flujos protegidos de parada/reinicio de Zerobyte, comprobaciones de integridad, diario de recuperación persistente y recuperación manual dirigida
- Comprobaciones del almacenamiento de red de Zerobyte sin respaldo local, restauraciones de prueba dedicadas y estado federado de solo lectura
- Guías: [Copias Restic y recuperación](docs/restic.es.md) · [Instalación y recuperación de Zerobyte](docs/zerobyte.es.md)

### Actualizaciones e ImageWatcher
- Detección de actualizaciones de imágenes por digest, sin pull, también en instancias remotas
- Políticas Desactivado, Inmediato y Programado por imagen, y políticas agrupadas por stack que conservan por defecto las excepciones individuales
- Análisis completo cada 6 horas por defecto y comprobaciones dirigidas en modo Inmediato cada 5 minutos por defecto, configurables o desactivables por separado
- Comprobación de las imágenes que usa realmente cada contenedor, peticiones de registro compartidas y reintentos ante HTTP 429/503
- DNS de respaldo opcional para las comprobaciones de registros, sin cambiar el DNS del host ni de Docker Engine
- **Ignore** y `dockge.imageupdates.check: "false"` se respetan antes de cualquier pull o recreación, incluido el Dozzle gestionado
- Actualizaciones de imágenes manuales, automáticas y «actualizar todo» secuenciales, con rollback a la imagen anterior
- Los stacks detenidos o en pausa no se despiertan con las actualizaciones automáticas
- Pausa global y por imagen, versiones omitidas e historial de actualizaciones automáticas
- Una sola notificación de actualización pendiente por stack, imagen, digest y destino
- Ventana de mantenimiento global: si las actualizaciones automáticas de Dockge-Enhanced usan una, también se aplica a las actualizaciones automáticas de imágenes; si no, se aplican los horarios por imagen; **Actualizar ahora** sigue siendo inmediato
- Autoactualización protegida de Dockge-Enhanced con copia Restic obligatoria, comprobación de integridad, validación de disponibilidad y recuperación automática
- Autoactualización mediante socket Unix o un Docker Socket Proxy de confianza, con control del espacio en disco y protección mientras haya cambios de Compose o `.env` sin guardar
- Cronología persistente de la autoactualización en 8 etapas, con carga del host en directo
- Detección fiable del contenedor actual con valores Compose `hostname:` personalizados, y estado degradado visible si la verificación no es posible

### Seguridad y autenticación
- Cuentas locales con 2FA TOTP opcional, secretos cifrados, códigos de recuperación de un solo uso y revocación de sesiones
- Cuentas locales con acceso limitado y permisos por instancia, stack y servicio, con espacio de trabajo dedicado ([guía](docs/scoped-users.md)); desactívelas antes de volver a una versión anterior de Enhanced
- Autenticación por trusted proxy limitada a redes explícitamente autorizadas, con identidades del proxy asociadas a cuentas locales
- Creación no interactiva del primer administrador desde un archivo secreto
- Protección del inicio de sesión con Cloudflare Turnstile
- Análisis de vulnerabilidades Trivy con excepciones CVE
- Validación centralizada de los nombres de stacks contra recorridos de rutas
- Sidecar de autoactualización restringido con plan de actualización firmado
- Transferencia cifrada de credenciales de registros privados
- Protecciones y confirmaciones en las operaciones destructivas
- Comprobaciones de los almacenes de certificados TLS tras el incidente de eMudhra ([comprobaciones TLS](security/emudhra/README.md))

### Monitorización
- Estadísticas de CPU, RAM y disco del sistema, los stacks y los contenedores, con barra de estado configurable
- Detalles del sistema host, temperaturas y particiones de disco supervisadas
- Historial opcional de CPU/RAM cada 5 minutos para el host y por servicio Compose, con interrupciones visibles
- Tarjetas de salud del panel, detección de bucles de fallos y auto-reparación de healthchecks
- Logs en directo responsivos y a pantalla completa con filtro por servicio, búsqueda, rangos de tiempo, **desde el último reinicio**, copia de las últimas 50 / 100 / 150 líneas o de todo lo cargado, pausa del desplazamiento, gestión de líneas largas y marcas de tiempo por defecto opcionales
- Modo de bajo consumo para NAS y hosts pequeños
- Integraciones opcionales Kula, Dozzle, PowerWatch y PowerWatch Hub, con la potencia de PowerWatch visible en las instancias vinculadas

### Recursos Docker
- Imágenes, volúmenes, redes y contenedores no gestionados, con búsqueda
- Gestión de redes `bridge`, `macvlan` e `ipvlan`
- Limpieza manual y automática unificada de imágenes, redes, volúmenes y caché de compilación, con vistas previas, exclusiones e historial
- Recuperación exacta de las ejecuciones perdidas y clasificación por Image ID
- Protección de los contenedores activos y detenidos, de las imágenes de rollback y recuperación y de las imágenes recientes de Dockge-Enhanced

### Búsqueda y archivos
- Búsqueda global multiinstancia (`Ctrl+K`) en stacks, archivos Compose/`.env`, recursos Docker y snapshots Restic recientes
- Búsqueda opcional en los valores de `.env`, que nunca se devuelven ni se guardan en el historial
- Filas compactas de volúmenes montados con su tamaño y explorador/editor de volúmenes para cada contenedor, incluso con el stack detenido
- Gestor opcional de archivos del host limitado a una raíz, con transferencias por fragmentos, edición de texto y lectura de archivos de log

### Automatización y auditoría
- Tokens de API REST limitados por permisos y por stack
- Webhooks por stack
- Integración personalizada y ejemplos opcionales de Home Assistant
- Historial de auditoría centralizado con origen, estado y duración
- Guías: [API REST, webhooks y Home Assistant](docs/AUTOMATION.es.md) · [Integración con Home Assistant](docs/HOME-ASSISTANT.md)

### Integraciones
- Zerobyte: instalación gestionada o conexión externa
- PowerWatch y PowerWatch Hub: observación externa o despliegue gestionado
- PlugNPiN para Nginx Proxy Manager, Pi-hole y AdGuard Home
- Dozzle
- Kula
- Home Assistant

### Apariencia e idiomas
- Paletas de día y de noche separadas, incluidos los temas originales de Dockge-Enhanced
- Opciones Catppuccin, Nord, Solarized, Dracula, Gruvbox, Tokyo Night y Rosé Pine
- Preferencias guardadas en el navegador y modo Auto que sigue al sistema
- Funciones de Enhanced traducidas al inglés, francés, alemán, español y chino simplificado; los demás idiomas de la interfaz usan el inglés para estas funciones, igual que las traducciones españolas aún pendientes

### Notificaciones y acceso
- Notificaciones de Discord y Apprise, localizadas en EN / FR / ES / zh-CN
- Nombre de la instancia en las notificaciones y enlaces `DOCKGE_PUBLIC_URL`
- Anuncios operativos remotos y registro persistente de novedades no leídas
- Informes semanales y mensuales opcionales del conteo anónimo de instalaciones mediante un webhook de Discord en GitHub Actions
- Clientes móviles de terceros

</details>

---

## Flujo de actualización automática de Dockge-Enhanced

> **Independiente de ImageWatcher:** el modo Inmediato comprueba las imágenes de las stacks cada 5 minutos. El flujo siguiente corresponde únicamente a la autoactualización protegida de Dockge-Enhanced.

<details>
<summary>Mostrar el proceso de actualización protegida</summary>

Dockge-Enhanced gestiona automáticamente todo el flujo: copia Restic obligatoria, verificación de integridad, reemplazo controlado del contenedor, healthcheck y confirmación final. Las notificaciones Discord/Apprise permiten seguir la operación sin mantener abierta la WebUI.

El updater admite el socket Unix habitual (incluido `DOCKGE_DOCKER_SOCKET`) y un Docker Socket Proxy de confianza configurado con `DOCKER_HOST=tcp://proxy:2375`. En modo TCP no monta ningún socket: el sidecar arranca conectado a una de las redes Docker de la instancia, se conecta después a las redes adicionales y solo ejecuta el plan firmado cuando recibe la señal de que todas están listas. Utiliza el mismo endpoint Docker configurado. El proxy debe permitir inspeccionar, crear, iniciar, detener y eliminar contenedores, inspeccionar/descargar imágenes y conectar redes; un proxy de solo lectura no puede realizar un self-update. Un endpoint TCP sin cifrar debe permanecer únicamente en una red interna de confianza. Los parámetros TLS se conservan si el directorio de certificados está montado en Enhanced; de lo contrario la actualización se detiene de forma segura antes de reemplazar nada.

Antes de iniciar una autoactualización, Enhanced comprueba también que no haya ninguna operación sensible en curso: copia o restauración Restic, copia/traslado/transferencia de datos o replicación de stacks, comprobaciones/actualizaciones de imágenes Docker, análisis Trivy e integración protegida de stacks externas. Si una operación bloquea la actualización, esta queda en espera, la razón aparece en la WebUI y se envía mediante Discord/Apprise, y el watcher la reintenta automáticamente.

<table>
<tr>
<td align="center" width="50%"><a href="screens/AutoUpdate-ResticVerification.png"><img src="screens/AutoUpdate-ResticVerification.png" width="100%"/></a><br/><sub><strong>1. Verificación Restic</strong> — control de la copia antes del reemplazo.</sub></td>
<td align="center" width="50%"><a href="screens/AutoUpdate-Healthcheck.png"><img src="screens/AutoUpdate-Healthcheck.png" width="100%"/></a><br/><sub><strong>2. Healthcheck</strong> — validación del nuevo contenedor.</sub></td>
</tr>
<tr>
<td align="center" width="50%"><a href="screens/AutoUpdate-Completed.png"><img src="screens/AutoUpdate-Completed.png" width="100%"/></a><br/><sub><strong>3. Actualización completada</strong> — build instalado y estado final.</sub></td>
<td align="center" width="50%"><a href="screens/AutoUpdate-Notifications.png"><img src="screens/AutoUpdate-Notifications.png" width="100%"/></a><br/><sub><strong>4. Notificaciones</strong> — disponibilidad, cambios y confirmación final.</sub></td>
</tr>
</table>

</details>

## Capturas de pantalla

<details>
<summary>Mostrar las capturas de pantalla</summary>

<table>
  <tr>
    <td align="center" width="33%">
      <a href="screens/1.png"><img src="screens/1.png" width="100%"/></a>
      <sub>Panel multiinstancia y estado global</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/2.png"><img src="screens/2.png" width="100%"/></a>
      <sub>Vista de una stack con Compose, contenedores y registros</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/3.png"><img src="screens/3.png" width="100%"/></a>
      <sub>Gestión detallada de una stack y sus acciones</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/4.png"><img src="screens/4.png" width="100%"/></a>
      <sub>Asistente de copia/migración — selección de datos</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/5.png"><img src="screens/5.png" width="100%"/></a>
      <sub>Asistente de copia/migración — preparación de la transferencia</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/6.png"><img src="screens/6.png" width="100%"/></a>
      <sub>Asistente de copia/migración — mapeo y validación de volúmenes</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/7.png"><img src="screens/7.png" width="100%"/></a>
      <sub>Vista de stack con herramientas avanzadas de operación</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/8.png"><img src="screens/8.png" width="100%"/></a>
      <sub>Supervisión de actualizaciones de imágenes</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/9.png"><img src="screens/9.png" width="100%"/></a>
      <sub>Estado detallado de las imágenes supervisadas</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/10.png"><img src="screens/10.png" width="100%"/></a>
      <sub>Programación del inicio y parada de stacks</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/11.png"><img src="screens/11.png" width="100%"/></a>
      <sub>Análisis de seguridad y resultados de Trivy</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/12.png"><img src="screens/12.png" width="100%"/></a>
      <sub>Configuración de copias Restic</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/13.png"><img src="screens/13.png" width="100%"/></a>
      <sub>Volúmenes incluidos, exclusiones y coherencia de las copias</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/14.png"><img src="screens/14.png" width="100%"/></a>
      <sub>Gestión de recursos Docker</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/15.png"><img src="screens/15.png" width="100%"/></a>
      <sub>Supervisión y estado de los contenedores</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/16.png"><img src="screens/16.png" width="100%"/></a>
      <sub>Interfaz responsive / móvil</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/17.png"><img src="screens/17.png" width="100%"/></a>
      <sub>Historial y registro de auditoría</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/18.png"><img src="screens/18.png" width="100%"/></a>
      <sub>Ajustes de seguridad y autenticación</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/19.png"><img src="screens/19.png" width="100%"/></a>
      <sub>Integraciones opcionales</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/20.png"><img src="screens/20.png" width="100%"/></a>
      <sub>Automatización, API y webhooks</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/21.png"><img src="screens/21.png" width="100%"/></a>
      <sub>Página Acerca de e información de versión</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/EnhancedUpdate.png"><img src="screens/EnhancedUpdate.png" width="100%"/></a>
      <sub>Actualización integrada de Dockge Enhanced</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/DiscordUpdates.png"><img src="screens/DiscordUpdates.png" width="100%"/></a>
      <sub>Discord — alertas de actualizaciones de imágenes</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/DiscordTrivy.png"><img src="screens/DiscordTrivy.png" width="100%"/></a>
      <sub>Discord — alertas de seguridad Trivy</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/DiscordBackup.png"><img src="screens/DiscordBackup.png" width="100%"/></a>
      <sub>Discord — notificaciones de copias de seguridad</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/DiscordEnhancedUpdate.png"><img src="screens/DiscordEnhancedUpdate.png" width="100%"/></a>
      <sub>Discord — alertas de actualización de Dockge Enhanced</sub>
    </td>
  </tr>
</table>

</details>

---

## Instalación

```yaml
# compose.yaml
services:
  dockge:
    image: ghcr.io/aerya/dockge-enhanced:latest
    container_name: dockge-enhanced
    restart: unless-stopped
    ports:
      - 5001:5001
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ../../data:/app/data
      - ../../opt/stacks:/opt/stacks
      - ../../backup/dockge:/backup          # opcional — volumen local dedicado para copias de seguridad
      - ../../docker:/dockers-data           # opcional — datos adicionales para copiar de seguridad
    environment:
      - DOCKGE_STACKS_DIR=/opt/stacks
      - DOCKGE_DATA_DIR=/app/data
#      - DOCKER_API_VERSION=x.xx             # opcional — para dispositivos NAS con API de Docker más antigua
      - TZ=Europe/Paris                      # zona del proceso opcional; programaciones configurables en la WebUI
```

```bash
docker compose up -d
```

Abre **http://localhost:5001**, crea tu cuenta de administrador y luego haz clic en **Monitoreo** en la barra de navegación.

> El volumen `/backup:/backup` es opcional pero recomendado si usas **local** como destino de copia de seguridad Restic — establece la ruta del destino en `/backup` para que tus instantáneas caigan en un directorio de anfitrión dedicado fuera del contenedor.

> **¿Necesitas respaldar varios directorios de datos?** Añade tantos volúmenes como necesites (por ejemplo `../../media:/media-data`) y selecciona las rutas montadas en **Backup → Docker volumes to backup**; Restic las incluye en cada copia. Consulta la [guía de Restic](docs/restic.es.md).

> **¿Monitoreando una partición de disco diferente a `/`?** Las estadísticas de disco se leen desde dentro del contenedor con `df`. Si quieres rastrear una ruta de anfitrión como `/mnt/data`, montala de solo lectura y agrégalas en la pestaña **Monitoreo** bajo *Particiones de disco monitoreadas*:
> ```yaml
>       - /mnt/data:/mnt/data:ro
> ```

**PowerWatch y PowerWatch Hub son opcionales**: no hace falta añadirlos al Compose de Enhanced. Tras instalarlo, abre **Monitorización** (`/watcher/monitoring`) para conectar instancias existentes o instalar los servicios gestionados por separado. Las instancias PowerWatch protegidas se admiten: introduce su token API Bearer de solo lectura en Monitorización → PowerWatch. Las instancias sin autenticación siguen funcionando sin token.

### Probar Dockge-Enhanced junto a Dockge

Dockge y Dockge-Enhanced pueden ejecutarse en el mismo host Docker, pero sus configuraciones Compose predeterminadas no pueden utilizarse sin cambios porque ambos publican el puerto `5001`.

Para probarlos en paralelo:

- instale Dockge-Enhanced desde un directorio Compose separado;
- utilice otro puerto del host, por ejemplo `5002:5001`;
- utilice un directorio `/app/data` separado;
- utilice preferiblemente un directorio de stacks separado con una stack dedicada a la prueba.

Ejemplo:

```yaml
ports:
  - 5002:5001
volumes:
  - ./enhanced-data:/app/data
  - /opt/dockge-enhanced-test-stacks:/opt/stacks
environment:
  - DOCKGE_STACKS_DIR=/opt/stacks
  - DOCKGE_DATA_DIR=/app/data
```

Después puede abrir Dockge-Enhanced en **http://localhost:5002**, mientras su instalación de Dockge permanece disponible en el puerto `5001`.

Ambas aplicaciones pueden acceder al mismo directorio de stacks, pero nunca deben editar, desplegar, actualizar ni realizar otra operación sobre la misma stack **simultáneamente**. Para una prueba prudente, es preferible utilizar un directorio de stacks separado.

### Migrar de Dockge a Dockge-Enhanced

La migración es sencilla porque Dockge-Enhanced comparte la misma base que Dockge:

1. Detenga Dockge.
2. Haga una copia de seguridad del archivo Compose, del directorio de datos y del directorio de stacks de Dockge.
3. En el archivo Compose existente de Dockge, sustituya la imagen por:

   ```yaml
   image: ghcr.io/aerya/dockge-enhanced:latest
   ```

4. Conserve los montajes existentes de `/app/data` y del directorio de stacks.
5. Descargue la imagen y reinicie el proyecto Compose:

   ```bash
   docker compose pull
   docker compose up -d
   ```

Dockge-Enhanced se iniciará con su cuenta, configuración y stacks existentes.

Conserve la copia de seguridad creada antes de la migración. Si decide volver a Dockge, detenga Dockge-Enhanced y restaure esa copia antes de reiniciar la imagen original de Dockge.

### Integración opcional PlugNPiN

<details>
<summary>Mostrar las instrucciones de configuración</summary>

Abre **Configuración → Integraciones** para configurar [PlugNPiN](https://github.com/DeepSpace2/PlugNPiN). La integración permanece totalmente inactiva hasta que se selecciona **Habilitar PlugNPiN** y se guarda el formulario. Habilitarlo crea el stack gestionado `plugnpin-dockge-enhanced`; deshabilitarlo ejecuta Compose down y elimina el directorio de stack generado.

Las credenciales de Nginx Proxy Manager son requeridas por PlugNPiN. Pi-hole, AdGuard Home, métricas y registro de depuración permanecen opcionalmente individuales. Las contraseñas se escriben a través de stdin en el volumen Docker dedicado `dockge_enhanced_plugnpin_secrets` y nunca se devuelven al navegador ni se incluyen en el archivo Compose generado.

Para publicar un servicio, edita su stack y usa **Publicación PlugNPiN (opcional)** debajo del editor Compose. El asistente genera y puede aplicar las etiquetas requeridas `plugNPiN.ip` y `plugNPiN.url` más opciones NPM seleccionadas. Las etiquetas y comentarios en formato de mapeo existentes se conservan. Para etiquetas en formato de lista, Dockge ofrece deliberadamente salida de solo copia en lugar de reescribir la estructura existente.

> Deshabilitar el controlador detiene sus contenedores pero no puede garantizar la eliminación inmediata de entradas que creó mientras los contenedores de aplicación etiquetados aún se están ejecutando. Elimina las etiquetas o detén las aplicaciones afectadas mientras PlugNPiN se está ejecutando si esas entradas deben eliminarse primero.

> PlugNPiN `1.0.0` está actualmente publicado upstream solo para `amd64`. Dockge mantiene la integración deshabilitada con un mensaje claro en arquitecturas no compatibles; el resto de Dockge Enhanced permanece multi-arquitectura.

</details>

---

## Variables de entorno

| Variable | Predeterminado | Descripción |
|---|---|---|
| `DOCKGE_STACKS_DIR` | `/opt/stacks` | Directorio que contiene los stacks Docker Compose |
| `DOCKGE_DATA_DIR` | `/app/data` | Directorio de datos de Dockge; cámbialo solo para un montaje persistente personalizado |
| `DOCKGE_PUBLIC_URL` | *(ninguna)* | URL pública usada en enlaces de notificaciones Discord (por ejemplo `https://dockge.example.com`) |
| `DOCKER_API_VERSION` | *(ninguna)* | Fija la versión de la API de Docker negociada por el cliente — útil en ciertos sistemas NAS (por ejemplo Synology DSM 7.x) |
| `TZ` | `UTC` | Zona del proceso en el contenedor; predeterminada para programaciones hasta elegir una en **Ajustes → General**. La elección WebUI tiene prioridad para las programaciones de Enhanced. |
| `DOCKGE_PORT` | `5001` | Puerto de la interfaz web |
| `DOCKGE_SSL_KEY` / `DOCKGE_SSL_CERT` | — | Habilita HTTPS |
| `DOCKGE_AUTH_MODE` | *(no establecido)* | Modo de autenticación: `local`, `disabled`, o `trusted-proxy`. Cuando no está establecido, se conserva el comportamiento histórico y la configuración `disableAuth` |
| `DOCKGE_AUTH_PROXY_HEADER` | `x-forwarded-user` | Encabezado que contiene la identidad validada por proxy en modo `trusted-proxy` |
| `DOCKGE_AUTH_PROXY_TRUSTED_NETWORKS` | *(requerido en modo proxy)* | Direcciones o CIDRs separados por comas permitidos para proporcionar el encabezado de identidad |
| `DOCKGE_BOOTSTRAP_USERNAME` | *(ninguna)* | Nombre del primer administrador, creado solo cuando la base de datos no contiene usuarios |
| `DOCKGE_BOOTSTRAP_PASSWORD_FILE` | *(ninguna)* | Archivo secreto que contiene la contraseña; recomendado para bootstrap automatizado |
| `DOCKGE_BOOTSTRAP_PASSWORD` | *(ninguna)* | Alternativa de contraseña directa, menos segura porque es visible en el entorno del contenedor |
| `DOCKGE_TRANSFER_RSYNC_PROFILES` | `[]` | Array JSON de perfiles SSH/rsync locales (`label`, `host`, `port`, `user`, `path`, `keyPath`, opcional `bandwidthKbps`). Configura la misma identidad de destino en ambas instancias; las rutas de clave nunca salen de su instancia |
| `DOCKGE_AUTH_PROXY_ADMIN_USERS` | *(ninguno)* | Identidades del proxy, separadas por comas, que se crean como administradores en su primer inicio de sesión en modo `trusted-proxy`; las demás identidades nuevas quedan limitadas y sin permisos |
| `DOCKGE_REVERSE_HUB_URL` | *(ninguno)* | Origen del servidor central para una conexión inversa opcional (HTTP(S), sin ruta); consulta la [guía de agentes inversos](docs/compose-and-reverse-agents.md) |
| `DOCKGE_REVERSE_TOKEN_FILE` / `DOCKGE_REVERSE_TOKEN` | *(ninguno)* | Token propio del nodo para la conexión inversa; el archivo tiene prioridad y es la opción recomendada |
| `DOCKGE_FILE_MANAGER_ROOT` | *(ninguno)* | Ruta del contenedor expuesta por el gestor opcional de archivos del host; desactivado si no se define |
| `DOCKGE_FILE_MANAGER_MAX_FILE_SIZE` | `104857600` | Tamaño máximo de transferencia del gestor de archivos del host, en bytes (100 MiB) |
| `DOCKGE_DOCKER_SOCKET` | `/var/run/docker.sock` | Ruta del socket Docker, por ejemplo para Docker rootless o Podman |
| `DOCKER_HOST` | *(ninguno)* | Endpoint de Docker, por ejemplo `tcp://proxy:2375` con un Docker Socket Proxy de confianza |
| `DOCKGE_CONTAINER_ID` | *(ninguno)* | ID explícito del contenedor de Enhanced cuando no puede deducirse de `HOSTNAME` |
| `DOCKGE_USAGE_COUNT` | *(activado)* | Ponlo en `false` para desactivar el conteo mensual anónimo de instalaciones |

> ℹ️ Sin `DOCKGE_DATA_DIR`, Dockge-Enhanced usa su volumen persistente `/app/data`. Una ruta configurada explícitamente siempre tiene prioridad.

> ℹ️ `DOCKGE_PUBLIC_URL` es opcional. Si no está configurado, las notificaciones Discord se envían sin enlace. Funciona con proxies inversos y dominios HTTPS.

> Los perfiles SSH/rsync requieren que la clave privada y un archivo `known_hosts` poblado estén montados de solo lectura en cada instancia Dockge participante. `StrictHostKeyChecking=yes` siempre se aplica; las contraseñas y comandos remotos arbitrarios no se aceptan desde la WebUI.

### Autenticación y configuración inicial

**Las instalaciones existentes no requieren cambios.** Sin las variables anteriores, las cuentas, la página de inicio de sesión, 2FA y la configuración **Deshabilitar autenticación** funcionan exactamente como antes. En el primer inicio de una nueva instalación, abre `/setup` y crea el administrador normalmente. Una vez inicializado, el servidor rechaza todo intento de configuración posterior incluso si la URL SPA permanece conocida.

Para un bootstrap sin interacción, es preferible montar un secreto y establecer solo estas variables opcionales:

```yaml
services:
  dockge:
    environment:
      - DOCKGE_BOOTSTRAP_USERNAME=admin
      - DOCKGE_BOOTSTRAP_PASSWORD_FILE=/run/secrets/dockge_admin_password
    secrets:
      - dockge_admin_password

secrets:
  dockge_admin_password:
    file: ./secrets/dockge_admin_password
```

El bootstrap se ignora tan pronto como existe un usuario, por lo que nunca cambia una cuenta o contraseña existente.

Para delegar el acceso a [OAuth2 Proxy](https://oauth2-proxy.github.io/oauth2-proxy/configuration/overview/) o Traefik ForwardAuth:

```yaml
environment:
  - DOCKGE_AUTH_MODE=trusted-proxy
  - DOCKGE_AUTH_PROXY_HEADER=x-forwarded-user
  - DOCKGE_AUTH_PROXY_TRUSTED_NETWORKS=172.20.0.0/24
```

Sustituye el CIDR de ejemplo por la red exacta del proxy y configúralo para que transmita el encabezado elegido. El puerto de Dockge no debe ser accesible directamente: solo los proxies declarados pueden aportar una identidad. Cada identidad del proxy usa la cuenta local con el mismo nombre de usuario: una cuenta limitada restringe a ese usuario del proxy y una cuenta de administrador conserva el acceso completo. Una identidad sin cuenta se crea como cuenta limitada sin permisos, salvo el primer usuario de una instalación nueva y las identidades indicadas en `DOCKGE_AUTH_PROXY_ADMIN_USERS`, que pasan a ser administradores. Las cuentas existentes conservan su rol, y un cambio de rol o una desactivación puede tardar hasta 30 segundos en aplicarse a las sesiones del proxy. La gestión de cuentas solo está disponible con autenticación local. Nunca excluyas `/setup`, `/socket.io` ni `/api/*` de la autenticación; el proxy debe reenviar WebSockets y proteger todo el host.

---

## Actualizaciones automáticas

Este fork rastrea automáticamente los lanzamientos upstream de Dockge a través de GitHub Actions:
- **Diario** — verifica un nuevo lanzamiento estable
- **Si se encuentra** — fusiona cambios upstream y abre un PR
- **Al fusionar** — reconstruye y publica imágenes Docker (`amd64` + `arm64`) a GHCR
- **En conflictos de autenticación** — mantiene temporalmente la versión Enhanced en la rama de sincronización y lista explícitamente archivos que requieren comparación antes de fusionar

La ventana configurada en la pestaña **Actualizaciones** es global: cuando está activa para la autoactualización de Dockge-Enhanced, también controla todas las actualizaciones automáticas de imágenes. Las imágenes detectadas fuera de los días y horas permitidos quedan pendientes. Las acciones manuales **Actualizar ahora** nunca se retrasan por esta ventana.

---

## Apps móviles / clientes de terceros

Dockge-Enhanced es gratuito y de código abierto.

Actualmente no hay una app oficial de iOS o Android mantenida por este proyecto.

Pueden existir clientes de terceros, pero son independientes de Dockge-Enhanced a menos que se listen explícitamente aquí.

---

## Atribución

Si tu app, servicio, artículo o integración usa funcionalidades, endpoints API, capturas de pantalla, documentación o marca Dockge-Enhanced, por favor acredita el proyecto y enlaza a este repositorio.

Los clientes de terceros comerciales están permitidos por la licencia, pero no deben implicar afiliación oficial sin permiso.

---

## Créditos

- [**Apprise**](https://github.com/caronc/apprise-api) — gateway de notificación multiplataforma
- [**darthrater78/dockge**](https://github.com/darthrater78/dockge) / [**ha-dockge**](https://github.com/darthrater78/ha-dockge) — inspiración para la detección de conflictos de puertos, diferencias Compose e integración Home Assistant.
- [**crossly/Dockge-Enhanced**](https://github.com/crossly/Dockge-Enhanced) — fuente de mejoras importantes de UI/UX, temas, internacionalización y arquitectura frontend adaptadas en este proyecto
- [**Dockge**](https://github.com/louislam/dockge) por louislam — el proyecto original (licencia MIT)
- [**Dozzle**](https://github.com/amir20/dozzle) por Amir Rajan — visor de registros Docker en tiempo real (licencia MIT)
- [**hamphh/dockge**](https://github.com/hamphh/dockge) por hamphh — inspiración y etiquetas compatibles para excluir por servicio el estado global y las actualizaciones de imágenes
- [**Isurupro7**](https://github.com/Isurupro7) / [**Dockge #1006**](https://github.com/louislam/dockge/pull/1006) — inspiración para límites opcionales de CPU/RAM por servicio, sin modificar los permisos restringidos
- [**Kula**](https://github.com/c0m4r/kula) por c0m4r — monitor de sistema ligero (AGPLv3)
- [**Lorwell/dockge**](https://github.com/Lorwell/dockge) por Lorwell — inspiración para el gestor de archivos del host restringido y la vista por contenedor real adaptados a Enhanced (licencia MIT)
- [**PlugNPiN**](https://github.com/DeepSpace2/PlugNPiN) por DeepSpace2 — automatización opcional de DNS y Nginx Proxy Manager (GPLv3)
- [**PowerWatch**](https://github.com/Aerya/PowerWatch) — monitorización eléctrica Linux y Hub de agregación, integrados opcionalmente en Enhanced
- [**Restic**](https://restic.net/) — herramienta de copia de seguridad encriptada
- [**Trivy**](https://github.com/aquasecurity/trivy) — escáner de vulnerabilidades
- [**Zerobyte**](https://github.com/nicotsx/zerobyte) — aplicación de copias basada en Restic, conectada o desplegada opcionalmente por Enhanced

---

## Licencia

MIT — ver [LICENSE](LICENSE).

**Operaciones diarias de las stacks**

Enhanced prepara ahora los directorios host que falten para bind mounts absolutos antes de iniciar, desplegar o recrear cuando el montaje sea claramente un directorio. Resulta especialmente útil en NAS Synology, donde Docker rechaza una fuente bind que todavía no existe. Las fuentes que parezcan archivos nunca se crean automáticamente como carpetas. El modo **Inmediato** de una imagen lanza su comprobación dirigida al guardar la política. Tras un reinicio correcto, Enhanced recarga además el estado real de la stack y oculta la salida de progreso Compose obsoleta.

El historial CPU/RAM conserva los huecos reales de muestreo, pero usa un gráfico más compacto inspirado en PowerWatch, con rejilla más ligera y áreas de relleno sutiles.
