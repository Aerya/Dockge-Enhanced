# Docker rollout

[English](service-rollout.md) · [Français](service-rollout.fr.md) · [Deutsch](service-rollout.de.md) · [Español](service-rollout.es.md) · [简体中文](service-rollout.zh-CN.md)

## Configuración

Utilice Traefik nativo si ya cumple los requisitos de descubrimiento Docker y retirada de tráfico. Si no, indique el **puerto TCP interno** en el editor del servicio y elija **Preparar un relé opcional**. Revise antes de guardar y desplegar: el puerto publicado y las etiquetas Traefik/PlugNPiN pasan a un servicio separado. El despliegue inicial puede interrumpir el tráfico. El destino con IP del host y puerto publicado se mantiene; si usa el nombre del servicio de aplicación, cámbielo explícitamente por el del relé.

El relé usa Nginx stream sin terminar TLS ni exponer API administrativa. HTTP, TLS y WebSocket pueden pasar por TCP; UDP/QUIC no está soportado. No requiere credenciales API de NPM, Caddy o HAProxy. Compatibilidad de protocolo no equivale a certificar cada producto/versión. La integración nativa actual es Traefik. El relé tiene volumen de configuración persistente y red/alias propio; no los elimine durante el uso. Incluya la configuración en la copia de la stack.

## Recuperación y límites

Se necesitan healthchecks y CPU/RAM adicionales. Nombres fijos, volúmenes compartidos de escritura y consumidores de espacios de nombres siguen siendo incompatibles. El asistente rechaza variables/rangos ambiguos de puertos, profiles y extends. Conserva los límites CPU/RAM existentes. Las conexiones ven la IP del relé; las aplicaciones que necesitan la IP cliente original requieren una configuración de proxy de confianza revisada por separado.

El relé no se recrea durante las actualizaciones de la aplicación. Las conexiones nuevas cambian solo cuando los reemplazos están sanos. Las existentes pueden terminar en la generación anterior. Tras unos dos minutos, las conexiones persistentes generan una operación incompleta: se conservan los contenedores y, si es posible, se devuelve el tráfico a las réplicas anteriores sanas. Revise y reconcilie antes de reintentar; no elimine contenedores que aún atienden clientes. Reiniciar el relé, Recreate y rollback no son operaciones sin interrupción.

Actualice ambos extremos de las instancias vinculadas. Una cuenta restringida necesita permisos de actualización para la aplicación **y su relé**. Abrir el editor no cambia nada; preparar modifica solo el borrador. Desactivar actualizaciones progresivas no desmonta el relé ni devuelve los puertos: revise explícitamente esa migración. No se modifica automáticamente ningún proxy de producción.

Las actualizaciones progresivas ya no añaden archivos Compose auxiliares ni etiquetas temporales: un Deploy posterior sin cambios conserva el contenedor. Al iniciar el relé, si la configuración persistida no es válida (por ejemplo, después de down/up que eliminó los nombres anteriores), se sustituye por la configuración inicial de Compose tras validarla. Una configuración todavía válida se conserva. Esto corrige el bucle de reinicios por un nombre desaparecido, pero aún no es una reconciliación automática completa de una operación interrumpida. Las acciones simultáneas de Enhanced sobre el mismo directorio de stack se rechazan durante la operación; las réplicas antiguas retiradas intencionadamente del tráfico no activan la reparación automática durante esa retirada.

[Wowu/docker-rollout](https://github.com/Wowu/docker-rollout) · [Dockge #170](https://github.com/louislam/dockge/pull/170) · [Nginx](https://nginx.org/en/docs/control.html)
