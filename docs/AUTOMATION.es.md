# API REST, webhooks y automatización

[English](AUTOMATION.md) · [Français](AUTOMATION.fr.md) · [Español](AUTOMATION.es.md) · [Deutsch](AUTOMATION.de.md) · [简体中文](AUTOMATION.zh-CN.md)

Todo lo descrito en esta página es opcional. No se crea ningún token ni webhook hasta que un administrador lo solicite en **Ajustes → Automatización**.

## Modelo de seguridad

- Cada secreto se muestra una sola vez. Dockge Enhanced solo almacena su hash SHA-256.
- Cada token limita de forma independiente los permisos, los stacks permitidos y, opcionalmente, su caducidad.
- Cada webhook apunta a un stack y a una lista cerrada de acciones. Puede desactivarse o rotarse en cualquier momento.
- Los tokens API están limitados a 60 solicitudes por minuto; los límites de los webhooks se configuran entre 1 y 60.
- Las respuestas de la API de stacks no contienen `compose.yaml`, `.env` ni notas.
- Cada acción se registra en el historial de auditoría con su origen, actor, duración y salida de tamaño limitado.

Guarda los tokens y las URL de webhook en un gestor de secretos. Protege `/api/*` con HTTPS y nunca incluyas secretos en repositorios, registros o capturas de pantalla.

## API REST

Los tokens admiten `Authorization: Bearer <TOKEN>` o `X-API-Key: <TOKEN>`.

```bash
export DOCKGE_URL="https://dockge.example.com"
export DOCKGE_TOKEN="dge_..."

curl -fsS \
  -H "Authorization: Bearer ${DOCKGE_TOKEN}" \
  "${DOCKGE_URL}/api/v1/stacks"
```

| Método | Endpoint | Permiso |
| --- | --- | --- |
| `GET` | `/api/v1/stacks` | `stack:read` |
| `GET` | `/api/v1/stacks/:name` | `stack:read` |
| `POST` | `/api/v1/stacks/:name/actions/:action` | `stack:<action>` |
| `GET` | `/api/v1/history?stack=:name&limit=100&offset=0` | `history:read` |

Acciones disponibles: `start`, `stop`, `restart`, `update`, `recreate`, `pull-recreate`, `build-recreate` y `backup`.

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer ${DOCKGE_TOKEN}" \
  "${DOCKGE_URL}/api/v1/stacks/immich/actions/restart"
```

`build-recreate` rechaza los stacks sin directiva Compose `build`. `backup` crea una copia limitada al stack de los archivos Compose, `.env` y metadatos mediante los destinos ya configurados en Dockge Enhanced.

## Webhooks

La interfaz muestra la URL completa después de crearla o rotarla:

```text
POST https://dockge.example.com/api/webhooks/dwh_<id>_<secret>/<action>
```

El secreto de la URL autentica la llamada; no se necesita ninguna cabecera adicional.

```bash
curl -fsS -X POST \
  "https://dockge.example.com/api/webhooks/dwh_1_SECRET/restart"
```

Rotar una URL invalida inmediatamente la anterior. Un webhook desactivado, caducado, limitado por frecuencia o con una acción no autorizada devuelve el error correspondiente de autenticación, límite de solicitudes o autorización.

## Home Assistant

Ejemplo con un webhook limitado a `start`, `stop` y `restart` para el stack `immich`:

```yaml
rest_command:
  dockge_immich_restart:
    url: !secret dockge_immich_restart_webhook
    method: POST
    timeout: 120
```

En `secrets.yaml`:

```yaml
dockge_immich_restart_webhook: "https://dockge.example.com/api/webhooks/dwh_1_SECRET/restart"
```

Ejemplo de botón:

```yaml
button:
  - platform: template
    name: Restart Immich
    press:
      - action: rest_command.dockge_immich_restart
```

## Herramientas adicionales

- **Build + Recreate** solo aparece cuando al menos un servicio tiene una directiva `build`. Ejecuta `docker compose build --pull` para esos servicios y después `docker compose up -d --remove-orphans`.
- Las **notas del stack** se guardan en `.dockge-meta.json`, tienen un límite de 10 000 caracteres y se incluyen en las copias. No guardes secretos en ellas.
- El panel **Git** es manual, está plegado por defecto y solo funciona con stacks locales. Rechaza credenciales en URL, excluye archivos sensibles, crea commits con la identidad técnica `Dockge Enhanced <dockge-enhanced@localhost>`, impone `pull --ff-only`, exige un árbol limpio antes de restaurar y valida Compose después.
- Las **redes Docker** admiten `bridge`, `macvlan` e `ipvlan`. Las operaciones de eliminación y conexión requieren confirmación; `bridge`, `host` y `none` están protegidas. Docker Swarm y `overlay` quedan expresamente excluidos.
- La comprobación de versión de Dockge Enhanced sigue siendo informativa: esta API nunca inicia una actualización automática de la aplicación.
