# Zerobyte (opcional)

[English](zerobyte.md) · [Français](zerobyte.fr.md) · [Español](zerobyte.es.md) · [Deutsch](zerobyte.de.md) · [简体中文](zerobyte.zh-CN.md)

En **Copias de seguridad**, activa **Zerobyte (opcional)**. Desactivarlo oculta toda la sección y conserva la configuración, las credenciales, los contenedores y las copias. Restic nativo conserva su cobertura, repositorios y retención: **no se realiza ninguna exclusión ni migración automática**.

## Instancia existente

Introduce el origen HTTP(S) accesible **desde el servidor Enhanced** y una clave API generada en los ajustes de Zerobyte. Se rechazan credenciales, parámetros de consulta y rutas en la URL. Guarda y prueba la conexión. Enhanced no administra los recursos Docker de una instancia externa. El resumen de instancias vinculadas es de solo lectura; los hooks protegidos de stacks están disponibles para los flujos gestionados descritos más abajo.

## Instalación gestionada

Enhanced genera un proyecto Compose normal en su directorio de stacks. El nombre deriva de las rutas reales de montaje de datos y stacks de Enhanced para evitar colisiones entre instancias. Ambos directorios deben ser bind mounts identificables del host. Zerobyte usa la imagen oficial `ghcr.io/nicotsx/zerobyte:v0.43.2` con privilegios reducidos: sin socket Docker, SYS_ADMIN ni FUSE. La base de datos/configuración interna y el área de restauración usan volúmenes persistentes con nombre creados automáticamente; nunca los selecciones como fuentes o destinos.

1. Añade al menos un directorio existente del host o volumen Docker con nombre existente como **fuente**. Enhanced muestra su ruta `/sources/local-…` tras validarla. Las fuentes son de solo lectura.
2. Añade al menos un directorio existente y distinto del host como **destino**. Será escribible en `/destinations/store-…`. Para recursos NFS/SMB/SSHFS/rclone montados en el host, selecciona **Este directorio debe ser un recurso remoto montado**. Si falta un recurso declarado, se rechaza.
3. Confirma la separación respecto a los repositorios Restic remotos de Enhanced cuando se solicite. Enhanced no puede demostrar que S3/SFTP/REST sean distintos de un recurso montado en el host. Los repositorios locales, incluidos los destinos desactivados, se comprueban automáticamente en el espacio de nombres del host.
4. Elige un puerto local libre con `http://127.0.0.1:<port>` y confirma la instalación. La interfaz solo escucha en loopback: usa un túnel SSH desde otra máquina. Enhanced se une a la red del proyecto; la conexión usa el alias del servicio específico de la instancia. Debe permanecer en esa red al reemplazar el contenedor Enhanced.
5. Abre Zerobyte, completa su configuración inicial, guarda la clave de recuperación de forma segura y genera una clave API. Introduce esa clave en Enhanced y guarda la conexión.
6. **Los montajes no crean volúmenes lógicos, repositorios ni tareas de copia.** En Zerobyte, crea fuentes Directory en las rutas mostradas y repositorios Local bajo las rutas de destino; después crea una tarea. Las tareas creadas desde Enhanced empiezan desactivadas. Configura horarios y retención en Zerobyte.

Se rechazan rutas con enlaces simbólicos, recorrido de directorios, raíces de sistema/control, ascendencia compartida entre fuente y destino, destinos anidados, alias de bind mounts y solapamientos con datos de Enhanced, datos internos de Zerobyte o repositorios Restic locales de Enhanced. Un verificador temporal de solo lectura, sin red y con únicamente DAC_READ_SEARCH tras retirar las demás capacidades inspecciona los directorios del host. La identidad del sistema de archivos de cada destino se comprueba en cada inicio de Zerobyte. Un recurso desaparecido o reemplazado impide el arranque en lugar de escribir en su directorio local de respaldo. Revalida los montajes al cambiar el almacenamiento intencionadamente. Los bind mounts Docker mantienen asociado el sistema de archivos montado durante la ejecución; un recurso inaccesible puede provocar errores o bloquear las E/S. Esto no garantiza la disponibilidad de la red.

Reaplicar los mismos ajustes reutiliza proyecto y volúmenes. Para cambiar montajes, configura primero la conexión API, desactiva todas las tareas y espera a que terminen las operaciones activas. Confirma la actualización explícita; si falla el reemplazo, se reaplica el Compose anterior. Revisa las tareas lógicas tras cambiar montajes. No hay endpoint de desinstalación ni eliminación de volúmenes. Mantén privados `.env` y `.zerobyte.json`: son necesarios para la propiedad y configuración persistente. Un primer despliegue fallido conserva volúmenes y metadatos para reintentar o diagnosticar.

## Operaciones y restauración

La vista general expone solo campos permitidos de tareas, repositorios, fuentes lógicas y operaciones activas; las estadísticas desconocidas permanecen desconocidas. La copia y la retención requieren confirmación explícita. La retención puede eliminar snapshots de Zerobyte según la política de esa tarea. Nunca ejecuta mantenimiento de Restic de Enhanced.

La restauración gestionada verifica automáticamente `/restore-test`; la externa exige una **raíz dedicada verificada y aprobada explícitamente para esa URL y clave API**, como se describe más abajo. Nunca selecciones datos de aplicaciones ni directorios fuente/destino. Cada solicitud crea una subruta aleatoria, con eliminación desactivada y sobrescritura en `never`. Las restauraciones son asíncronas: confirma su finalización en Zerobyte antes de usar los archivos. En instancias externas, el operador debe comprobar el montaje de restauración independientemente.

Las claves permanecen en el servidor en `zerobyte-settings.json` (modo 0600); no se devuelven al navegador ni aparecen en URL o errores del servidor remoto. La interfaz y los endpoints de administración usan la política HTTP de autenticación existente de Enhanced; los callbacks pre/post restringidos requieren su secreto por flujo. Como en el resto de Enhanced, desactivar la autenticación elimina esa protección. Las solicitudes tienen límites de tiempo y tamaño de respuesta y rechazan redirecciones.

## Verificación durante el desarrollo

La integración se desarrolló con Enhanced `a99418187e3bdc17f1aa4674c031aaffc809db98` y Zerobyte `v0.43.2` (`cc63558bd3329209687dd546ea4b1ec02cf6ff7c`). Usa únicamente directorios y repositorios de prueba aislados para probar copias, retención y restauraciones. Estas comprobaciones no implican un despliegue en producción.

Los textos de la interfaz están disponibles en inglés, francés, alemán, español y chino simplificado. Los demás idiomas usan el mecanismo existente `fallbackLocale: "en"` para las nuevas claves; sus traducciones actuales se conservan.

Ejemplos oficiales de instalación: https://github.com/nicotsx/zerobyte/tree/v0.43.2/examples

## Asistente de flujos protegidos

La instalación gestionada ofrece el **asistente de copias protegidas**: elige una fuente montada, un destino, un nombre, una expresión cron y un plazo (1–120 minutos). Revisa el plan exacto y confirma. Crea o reutiliza una fuente Directory, un repositorio Local dedicado y una tarea desactivada mediante la API real de Zerobyte. Zerobyte añade su identificador de repositorio bajo el directorio padre mostrado. Los registros persistentes de propiedad hacen idempotentes los reintentos; los recursos existentes incompatibles se rechazan y nunca se eliminan. Reutilizar un plan no cambia sus políticas silenciosamente. Usa otro nombre de plan para diferentes políticas de parada o plazos.

Estas tareas reciben webhooks HTTP oficiales pre/post con un secreto por flujo guardado en el servidor. Se aplican a ejecuciones manuales y programadas. La lista de orígenes permitidos del Compose generado solo admite el callback del Enhanced propietario. Conserva su alias DNS `enhanced-<owner>` y la red compartida al reemplazar Enhanced; reaplicar el instalador repara ese alias.

Antes de detener aplicaciones, el pre-hook comprueba disponibilidad e identidad de los montajes y realiza una prueba acotada de escritura/fsync/eliminación en el destino. Durante la copia, un supervisor comprueba periódicamente. Si se pierde el almacenamiento o vence el plazo, Enhanced solicita cancelar, reinicia solo los servicios que estaban activos originalmente y registra un fallo persistente. Nunca sustituye el destino por un directorio local. Un plan local configurado por separado es la alternativa explícita; no hay alternativa local ni transferencia posterior automáticas ocultas.

Los flujos interrumpidos siguen pausados hasta una confirmación explícita que verifique que la tarea remota ha terminado. Solicitar cancelar no demuestra que el proceso se haya detenido: comprueba el snapshot de una ejecución interrumpida antes de confiar en él. La interfaz actualiza el estado mientras está abierta; los fallos también se envían a los destinos Discord/Apprise de copias configurados, cuando estén disponibles. La entrega de notificaciones no está garantizada.

La parada opcional de stacks se limita a Compose gestionados dentro del directorio de stacks de esta instancia, con verificación de propiedad mediante etiquetas Docker. Estos hooks no pueden detener Enhanced ni Zerobyte. La lista de servicios activos se registra antes de detenerlos; permite recuperarlos tras fallos de preparación, copia, pérdida de post-hooks o reinicios de Enhanced. Si falla un reinicio, se conserva el registro y se bloquean copias/restauraciones nativas sin fingir una recuperación correcta. Los ajustes, exclusiones y retención de Restic nativo permanecen intactos; solo una barrera dentro del proceso evita que las operaciones nativas coincidan con las paradas. No impide cambios independientes de un operador ni garantiza recuperación si Docker o el host no están disponibles.

Las tareas creadas directamente en Zerobyte o mediante el formulario avanzado no tienen hooks de Enhanced salvo si se aprovisionan explícitamente con este asistente. Se identifican como tales. Su planificación y comportamiento de red dependen de Zerobyte. El asistente protegido crea tareas sin retención automática; la retención manual requiere confirmación. Si el operador añade después una política en Zerobyte, se aplica su mantenimiento automático nativo; Enhanced no intercepta cambios externos.

## Conexiones externas y federación

La configuración externa tiene una advertencia y una aceptación ligadas a la URL **y a la clave API**. Cambiar cualquiera revoca esa aceptación. Las consultas de estado y pruebas de conexión siguen disponibles; las modificaciones requieren aceptación si la conexión no corresponde al origen API gestionado y verificado como propio. La restauración externa permanece desactivada hasta guardar explícitamente una raíz dedicada; la antigua variable global de entorno no la habilita. Las rutas conocidas de fuentes lógicas y repositorios locales se comprueban léxicamente al restaurar, pero Enhanced no puede demostrar la disposición física, resolver enlaces externos ni certificar la separación. La restauración gestionada verifica automáticamente su volumen Docker dedicado, propio y escribible y rechaza alias con otros montajes.

La vista de instancias vinculadas agrega solo contadores permitidos de lectura mediante el transporte federado autenticado existente. Nunca transfiere claves Zerobyte y distingue integración desactivada, Zerobyte inaccesible y pares desconectados/incompatibles. Las operaciones remotas permanecen en sus instancias propietarias. No se usan pares de producción para las pruebas de desarrollo.

### Diagnóstico y migración de tareas existentes

El diagnóstico externo solo consulta la API: configuración, inventario, separación de rutas conocidas y repositorios compartidos entre tareas. Montajes físicos, enlaces simbólicos, identidad remota, permisos reales y restauración independiente son comprobaciones explícitas del operador. Superar las pruebas API no certifica esas propiedades.

Desactiva una tarea existente en Zerobyte, espera a que termine y selecciona stacks y plazo en el asistente. Previsualiza y confirma la migración. Solo cambian los hooks y el número de reintentos automáticos; se conservan fuente, repositorio, snapshots, horario, filtros y retención, y la tarea sigue desactivada. Se rechazan hooks personalizados y repositorios compartidos entre tareas. Ante una respuesta API incierta, conserva la tarea desactivada y reintenta el mismo plan para verificar la migración.

La recuperación de aplicaciones se muestra separadamente del resultado de la copia. Si Docker no puede reiniciar servicios, el registro permanece y se reintenta. Comprueba Docker y los stacks indicados; recuperar aplicaciones no implica una copia correcta. El registro se sincroniza a disco antes de cada parada.

### Ensayos de fallos

Usa recursos y stacks dedicados con datos ficticios. Verifica primero el contenido de la copia y de la restauración. Prueba por separado pérdida TCP, servidor detenido, permisos revocados, recurso de solo lectura y espacio agotado; comprueba rechazo previo y alertas persistentes. Desconecta también el almacenamiento durante una ejecución y verifica cancelación, terminación real de la tarea y recuperación únicamente de los servicios originalmente activos.

Para simular fallos Docker, usa un relé de socket dedicado a la instancia de prueba en lugar de detener un daemon compartido con producción. Reiniciar abruptamente contenedores de prueba ejercita la recuperación persistente, pero no simula un corte eléctrico físico del host. Prueba la federación con instancias aisladas, rechazo de autenticación y una versión antigua.

Las comprobaciones usan nombres de sonda estables y un bloqueo local por destino para acotar las sondas bloqueadas en llamadas NFS hard. Un timeout de Enhanced no interrumpe por la fuerza una operación ininterrumpible del kernel; puede ser necesario recuperar el servidor. Las alertas repetidas de un flujo se notifican como máximo una vez cada cinco minutos. Tras un rechazo de autenticación federada, vuelve a autenticar explícitamente el agente; reactivar la cuenta remota no reinicia por sí solo el transporte detenido por seguridad.

### Integridad de tareas y recuperación manual de aplicaciones

Enhanced comprueba las tareas registradas antes del lanzamiento manual y dentro del pre-hook, además de aproximadamente cada minuto si no hay una copia de aplicaciones activa. URL/autenticación de callbacks, fuente, repositorio y reintentos deben coincidir con el flujo. Una protección ausente, modificada o no verificable bloquea el lanzamiento desde Enhanced; hay una verificación inmediata tras corregirla. Nunca se reemplazan hooks silenciosamente. Eliminar todos los hooks y lanzar directamente desde Zerobyte evita la interceptación; conserva activos hooks y supervisión.

Si falla la recuperación, se muestran stacks y servicios registrados. El reintento manual solo reinicia esos servicios después de que termine la tarea remota; nunca lanza otra copia ni marca como correcta una copia interrumpida.

### Revalidación explícita del almacenamiento

Desactiva todas las tareas, termina las operaciones y verifica físicamente servidor, recurso y separación de repositorios. Previsualiza los cambios de huella, declara haber realizado la comprobación y confirma. El consentimiento está ligado a la revisión exacta del plan; cualquier cambio exige otra previsualización.

Cuando la protección del sistema de archivos detiene Zerobyte (31), Enhanced puede leer sin escribir la base de datos de su volumen Docker dedicado verificado. Todas las tareas deben estar desactivadas y las operaciones terminadas. Tras detener el proceso, Enhanced vuelve a comprobar inventario y montajes antes de reemplazar la protección. Los archivos Compose/metadatos anteriores permanecen en copias privadas `.pre-revalidation`. Solo se redespliega Zerobyte; un destino remoto declarado no puede convertirse en una alternativa local.

La federación distingue rechazo de autenticación conocido, pares desconectados, respuestas incompatibles y timeouts. Un timeout no demuestra por sí solo una versión antigua: comprueba conectividad y compatibilidad. Véanse los [ensayos de laboratorio reproducibles](../extra/zerobyte-lab/README.md) (en inglés).
