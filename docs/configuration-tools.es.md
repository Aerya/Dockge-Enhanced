[English](configuration-tools.md) · [Français](configuration-tools.fr.md) · [Deutsch](configuration-tools.de.md) · [Español](configuration-tools.es.md) · [简体中文](configuration-tools.zh-CN.md)

# Herramientas de configuración

Acciones de stack → **Archivos e historial** muestra versiones y el Compose combinado guardado. Ejecuta `docker compose config` en la instancia propietaria, con overrides y variables, pero sin cambios del borrador. Puede mostrar secretos: requiere administrador y confirmación.

Se guardan 20 versiones distintas antes de guardar o hacer pull de Git: Compose, override y `.env`, o la cadena registrada en stacks externos. No incluye datos de aplicaciones, archivos incluidos indirectamente ni el `global.env` compartido. Máximo 2 MiB por archivo. Un fallo del historial bloquea la escritura.

Las versiones se cifran en `stack-file-history/` dentro del directorio de datos. Haz backup junto con `stack-file-history.key`; sin la clave no se pueden leer. La lista no contiene los archivos. Restaurar conserva primero los archivos actuales y también restaura la ausencia de un override. No reinicia contenedores. **Revisa y despliega explícitamente.** Una lista de archivos distinta u operación simultánea bloquea la restauración.

Los editores `.env` de stacks y globales ofrecen **Modo formulario**. Los valores se ocultan por defecto y son literales, incluidas las comillas. Las líneas complejas o multilínea se editan en modo texto.

**Ajustes → Diagnóstico de instancia** comprueba Docker, Compose, Git, Buildx y creación/eliminación de un archivo temporal en los directorios de datos y stacks. Permite elegir una instancia vinculada. No configura, despliega ni limpia recursos.

Actualiza ambas instancias. Los agentes antiguos muestran indisponibilidad tras un plazo limitado. Las cuentas restringidas no acceden a archivos/resultados ni restauran versiones. Mantén Restic/Zerobyte para los datos de aplicaciones.

[ethanpil/dockge-mod](https://github.com/ethanpil/dockge-mod) — inspiración para el historial, Compose combinado, formulario `.env` y diagnóstico.
