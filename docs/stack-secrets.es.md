# Gestores de secretos por stack

[English](stack-secrets.md) · [Français](stack-secrets.fr.md) · [Deutsch](stack-secrets.de.md) · Español · [简体中文](stack-secrets.zh-CN.md)

Conecte una stack a Bitwarden Secrets Manager, 1Password, Doppler o Infisical para recuperar secretos durante las operaciones Compose sin copiarlos a su archivo `.env`.
Corrección de Bitwarden: el perfil temporal utiliza el formato TOML que espera el CLI oficial, lo que restablece la recuperación de secretos.

**1Password utiliza una versión preliminar de su SDK.** Una prueba de conexión correcta confirma la recuperación, no el funcionamiento de la aplicación.

## Configuración

1. En **Ajustes → Gestores de secretos**, seleccione la instancia de la stack. Añada una conexión con una cuenta de máquina limitada a los secretos necesarios.
2. Para Bitwarden, lea la licencia enlazada y seleccione **Instalar el CLI oficial de Bitwarden**. El CLI no se redistribuye en la imagen: se descarga la versión oficial 2.1.0, se verifica SHA-256 y se guarda en `data/secret-tools/bws`. Se admiten Linux AMD64 y ARM64. También puede instalarlo manualmente en `/usr/local/bin/bws`. Se trata de **Bitwarden Secrets Manager**, no de la bóveda personal; no se anuncia compatibilidad con Vaultwarden.
3. Abra **Gestores de secretos** en la stack guardada, seleccione la conexión e indique su ámbito.
4. Guarde y seleccione **Probar el acceso guardado**. No despliega nada ni muestra valores.
5. Referencie las variables en Compose y despliegue o recree la stack. Guardar el ajuste no modifica los contenedores existentes.

| Proveedor | Conexión | Ámbito en la stack |
| --- | --- | --- |
| Bitwarden Secrets Manager | Token de cuenta de máquina y dirección HTTPS; Cloud EE. UU., Europa o servidor oficial autoalojado | ID del proyecto |
| 1Password | Token de cuenta de servicio autorizado para leer el Environment | ID del Environment |
| Doppler | Token de servicio de solo lectura | Proyecto y configuración; opcionales si el token ya limita el ámbito |
| Infisical | Dirección HTTPS, Client ID y Client Secret de una identidad de máquina con Universal Auth | Proyecto, entorno y carpeta; solo la carpeta seleccionada, sin importaciones ni recursión |

Prefiera variables obligatorias:

```yaml
services:
  app:
    image: su-imagen
    environment:
      DISCORD_TOKEN: ${DISCORD_TOKEN:?required}
```

Los valores recuperados tienen prioridad para la interpolación Compose. Los valores literales en `environment:` siguen siendo explícitos y no se reemplazan automáticamente. También se admiten variables sin valor como `DISCORD_TOKEN:`; las que sigan sin resolverse tras `compose config` bloquean la creación, el inicio, el reinicio y la construcción. Para variables opcionales, use un valor predeterminado explícito como `${OPTIONAL_VALUE:-}`.

## Ejecución y límites

- Las acciones de la interfaz, operaciones automáticas y reversiones usan la conexión en la propia instancia de la stack. Actualice también las instancias vinculadas. Una reversión lee los secretos actuales del proveedor; no restaura versiones anteriores de los secretos.
- Si falla el proveedor, el comando se bloquea sin recurrir silenciosamente a un entorno vacío. Los valores se reutilizan en memoria dentro de la misma operación; no se modifica el entorno global de Dockge.
- El estado se lee directamente de Docker, sin interpolar Compose ni acceder al proveedor. Otros comandos Compose pueden requerirlo.
- Se ocultan la salida de los comandos Compose protegidos y la configuración resuelta. Se rechazan la migración y la replicación para evitar transferir secretos resueltos o desplegar el destino sin su proveedor.
- Se rechazan nombres que puedan reconfigurar Docker, Compose o Node, incluidos `PATH`, `DOCKER_*`, `COMPOSE_*`, `NODE_OPTIONS` y `LD_*`, así como nombres duplicados, respuestas vacías y valores inválidos. No se solicitan secretos dinámicos de Doppler.
- Los tokens se cifran en `data/stack-secrets.json` con `data/stack-secrets.key`. Conserve la clave y proteja las copias del volumen de datos: archivo y clave juntos permiten recuperar los tokens. Una clave ausente bloquea el acceso y no se reemplaza automáticamente.
- La integración no escribe los valores recuperados en Compose, `.env` ni su historial. No limpia archivos, historiales o copias existentes; elimine por separado los secretos que ya estaban guardados.
- **No garantiza «cero secretos en disco».** Docker almacena variables de entorno en la configuración de los contenedores, accesible a sus administradores. Las aplicaciones pueden escribir sus propios registros o archivos. La integración no sustituye los secretos montados como archivos cuando la aplicación los admite.

## Fuentes

[1Password Environments](https://www.1password.dev/environments/read-environment-variables) · [Doppler Service Tokens](https://docs.doppler.com/docs/service-tokens) · [Infisical Universal Auth](https://infisical.com/docs/documentation/platform/identities/universal-auth) · [Bitwarden CLI](https://bitwarden.com/help/secrets-manager-cli/) · [Licencia Bitwarden](https://github.com/bitwarden/sdk-sm/blob/bws-v2.1.0/LICENSE)
