# Verificación de actualizaciones de imágenes

[English](image-update-verification.md) · [Français](image-update-verification.fr.md) · [Deutsch](image-update-verification.de.md) · [Español](image-update-verification.es.md) · [简体中文](image-update-verification.zh-CN.md)

> Cambio propuesto en esta rama; aún no publicado.

ImageWatcher recupera imágenes cuyo tag local desapareció, verifica cada réplica afectada después de Compose y señala las discrepancias como fallos. Las actualizaciones no verificables no cambian la fecha. Las imágenes descargadas quedan protegidas de la limpieza durante 24 horas tras un intento interrumpido o no verificado.

El ID inmutable esperado se captura después del pull y antes de recrear. Cada servicio objetivo normal debe conservar su número de réplicas; todas deben estar ejecutándose, no estar unhealthy y utilizar ese ID. Se incluyen los servicios que comparten un namespace de red. Las actualizaciones progresivas mantienen sus comprobaciones de salud y drenaje; un drenaje pendiente sigue sin verificar y no cambia la fecha.

Si falta el tag local, se utiliza la imagen del contenedor en ejecución. Los errores de registro o inspección siguen siendo desconocidos, nunca al día. Una discrepancia confirmada es un fallo; una verificación imposible aparece como no verificada. Ninguno de estos resultados cuenta como actualización correcta ni modifica lastUpdated.

La limpieza y las actualizaciones de imágenes se excluyen mutuamente. Antes del pull, Enhanced guarda una protección para la referencia objetivo y después el ID de la imagen descargada. Un intento interrumpido o no verificado conserva esta protección durante 24 horas, incluso tras reiniciar. Una finalización verificada libera solo la protección de esa operación. El plazo comienza con el intento o la descarga, no con la compilación de la imagen; después puede aplicarse la limpieza habitual de imágenes sin usar.

La fecha de la stack se llama «Última operación» y tiene una ayuda explicativa. Describe una operación sobre la stack, quizá un solo servicio, y no garantiza que todos estén al día. Los resultados por imagen siguen en el historial de Watcher. Se respetan pausas, exclusiones, ventanas de mantenimiento y rollback.
