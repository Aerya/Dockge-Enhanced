

<p align="center">
  <img src="https://raw.githubusercontent.com/Aerya/Dockge-Enhanced/main/frontend/public/icon.svg" width="120" alt="Dockge Enhanced logo">
</p>

# Dockge Enhanced
> [!WARNING]
> ## Corrección crítica de la autoactualización de Dockge-Enhanced
>
> Varios builds publicados entre **el 31 de agosto de 2026 y el 2 de septiembre de 2026** contenían defectos en el mecanismo de actualización automática de Dockge-Enhanced.
>
> En determinadas condiciones, el sidecar podía detener el contenedor Dockge-Enhanced, no conseguir crear la nueva versión y, en algunos builds, tampoco restaurar automáticamente la versión anterior.
>
> El mecanismo ha sido corregido y reforzado. A partir del build **`0fc2564` / versión 1.5.4**, la actualización automática:
>
> - descarga siempre el último `dockge-enhanced-updater:latest` antes de cada actualización;
> - descarga explícitamente la imagen objetivo de Dockge-Enhanced;
> - realiza una copia Restic obligatoria antes del reemplazo;
> - verifica el nuevo contenedor antes de validar la actualización;
> - conserva el rollback y un snapshot de recuperación.
>
> **Si tu instalación utiliza un build anterior a `0fc2564` / versión 1.5.4, realiza una última actualización manual antes de activar o volver a activar las actualizaciones automáticas:**
>
> ```bash
> docker pull ghcr.io/aerya/dockge-enhanced:latest
> docker compose up -d
> ```
>
> Una vez completada esta actualización, puedes activar **Automática mediante sidecar protegido**. Dockge-Enhanced gestionará automáticamente las siguientes actualizaciones.
>
> **Las stacks gestionadas por Dockge-Enhanced y sus datos persistentes no se ven afectados por este problema.**
>
> Mis disculpas a todos los usuarios afectados. Una función diseñada precisamente para hacer las actualizaciones más seguras no debería poder dejar Dockge-Enhanced fuera de servicio. Gracias a todos los que utilizan, prueban y reportan problemas: vuestros comentarios permitieron identificar y corregir rápidamente estos defectos.

---

Un fork de [Dockge](https://github.com/louislam/dockge) centrado en ampliar sus funcionalidades, que convierte su sencilla experiencia de gestión de Docker Compose en una plataforma Docker más completa — con federación multiservidor, migración y replicación de stacks, copias Restic, actualizaciones de imágenes y de Dockge-Enhanced con rollback, análisis de seguridad, monitorización, automatización, notificaciones y gestión de recursos Docker, todo desde la interfaz web.
Un fork de [Dockge](https://github.com/louislam/dockge) centrado en ampliar sus funcionalidades, que convierte su sencilla experiencia de gestión de Docker Compose en una plataforma Docker más completa — con federación multiservidor, migración y replicación de stacks, copias Restic, actualizaciones de imágenes y de Dockge-Enhanced con rollback, análisis de seguridad, monitorización, automatización, notificaciones y gestión de recursos Docker, todo desde la interfaz web.

<p align="center">
  🇪🇸 Español ·
  🇬🇧 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.md">English</a> ·
  🇫🇷 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.fr.md">Français</a> ·
  🇨🇳 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white" alt="Docker">
  <img src="https://github.com/Aerya/Dockge-Enhanced/actions/workflows/build-publish.yml/badge.svg?branch=main" alt="Build">
  <img src="https://img.shields.io/badge/arch-amd64%20%7C%20arm64-lightgrey" alt="multi-arch">
  <img src="https://img.shields.io/badge/i18n-EN%20%7C%20FR%20%7C%20ES%20%7C%20zh--CN-blue" alt="i18n">
  <img src="https://img.shields.io/badge/based%20on-Dockge-orange?logo=github&logoColor=white" alt="based on Dockge">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT">
</p>

<p align="center">
  <strong>¿Lo usas? ¿Te gusta?</strong>
  <a href="https://github.com/Aerya/Dockge-Enhanced"><strong>⭐ ¡Dale una estrella!</strong></a>
  — solo toma dos segundos.
</p>

---

<p align="center">
  <img src="screens/D-E.vs.Others.EN.09.26.png" alt="Dockge Enhanced comparison" width="100%">
</p>

## Funcionalidades

### Lo que distingue a Dockge Enhanced

| Área | Lo que agrega Dockge Enhanced |
| --- | --- |
| **Multiservidor** | Federación en malla completa entre instancias Dockge-Enhanced, administración desde cualquier servidor vinculado, selección y agrupación de servidores, estado de actualizaciones remotas, copia/migración transaccional de stacks, transferencias reanudables y replicación en frío programada |
| **Gestión de stacks** | Stacks fijadas, indicadores compactos de estado y recursos, navegación plegable/redimensionable, espacio Logs/Compose flexible, copia del YAML sin formato, acciones y programación por stack y contenedor, Build + Recreate, notas, herramientas Git, requisitos de inicio del host y protecciones para namespaces de red VPN compartidos |
| **Copias de seguridad y recuperación** | Copias Restic multidestino de bind mounts y volúmenes, consistencia por stack, restauración selectiva, comprobación de repositorios, verificación y diferencias de snapshots, además de los mecanismos de recuperación usados por las actualizaciones protegidas |
| **Actualizaciones** | Detección de actualizaciones de imágenes, actualizaciones manuales o automáticas de contenedores con rollback, indicadores remotos, pausas globales/por imagen y autoactualización protegida de Dockge-Enhanced con copia obligatoria, controles de integridad y recuperación automática |
| **Migración y replicación** | Transferencias transaccionales entre instancias, migración de Compose y datos persistentes, trabajos reanudables, finalización explícita de movimientos, réplicas en frío programadas, snapshots de recuperación y flujos de recuperación |
| **Automatización y auditoría** | API REST limitada por permisos, webhooks por stack, ejemplos para Home Assistant, operaciones programadas e historial centralizado con origen, estado y duración |
| **Recursos Docker** | Gestión de imágenes, volúmenes, redes y contenedores no gestionados, operaciones masivas, auto-prune y protecciones frente a acciones destructivas |
| **Seguridad** | Escaneo de vulnerabilidades con Trivy, excepciones CVE, flujos de actualización protegidos, 2FA, trusted proxy y Cloudflare Turnstile |
| **Monitorización** | Estadísticas del sistema, stacks y contenedores, barra de estado configurable, tarjetas de salud del panel, detección de crash loops, auto-heal de healthchecks, logs responsivos/a pantalla completa e integraciones opcionales con Kula y Dozzle gestionado |
| **Integraciones** | PlugNPiN y asistente de etiquetas por servicio para Nginx Proxy Manager, Pi-hole y AdGuard Home |
| **Notificaciones y acceso** | Notificaciones Discord y Apprise localizadas en EN/FR/ES/zh-CN, soporte multiinstancia, 2FA, trusted proxy, Turnstile y clientes móviles de terceros |

## Últimas novedades

Los cambios recientes más importantes permanecen visibles directamente en el README para entender rápidamente qué ha cambiado en Dockge-Enhanced.

### 🆕 Septiembre de 2026

**Retención dedicada de las copias de self-update**

Los snapshots Restic obligatorios creados antes de una autoactualización protegida de Dockge-Enhanced usan ahora una política de retención dedicada. Una vez que el nuevo snapshot se ha **creado y verificado**, Dockge-Enhanced conserva los **2 últimos snapshots de self-update de esta instalación** y elimina las generaciones anteriores antes de iniciar el sidecar. Una etiqueta estable específica de la instalación evita limpiar snapshots de otra instancia Dockge-Enhanced que comparta el mismo repositorio Restic. La retención normal (`keepLast`, diaria, semanal y mensual) no cambia. Si esta limpieza dedicada falla, se conserva la copia verificada y la actualización puede continuar; el error queda registrado y una autoactualización posterior volverá a intentar la limpieza.


**Correspondencia de nombres de proyecto Docker Compose**

Las stacks gestionadas cuyo directorio contiene puntos o mayúsculas se relacionan ahora con Docker Compose mediante la ruta real `ConfigFiles`, en lugar de depender únicamente del nombre de proyecto normalizado por Docker. Esto evita entradas duplicadas “gestionada/detenida” y “externa/en ejecución” para la misma stack.

**Compatibilidad con la sintaxis larga de puertos Compose**

Las tarjetas de contenedores admiten ahora tanto la sintaxis corta como la larga de puertos Compose. Las definiciones con `published`, `target`, `protocol`, `mode` o `host_ip` ya no provocan `split is not a function` ni hacen desaparecer la tarjeta del contenedor. Los valores IPv6 de `host_ip` también se formatean correctamente en los enlaces generados.

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

Las stacks pueden copiarse o moverse entre instancias junto con su configuración Compose y sus datos persistentes, con transferencias reanudables y rollback.

**Requisitos del host y recuperación automática**

Una stack puede requerir montajes del host o servicios `systemd` antes de arrancar y Dockge-Enhanced puede supervisar su disponibilidad.

**Interfaz responsive y monitorización mejorada**

La navegación, Logs/Compose, indicadores de recursos, tarjetas de salud, temas y vista móvil fueron ampliamente renovados.

➡️ **[Consultar el changelog completo](CHANGELOG.es-ES.md)**

---

## Catálogo de funcionalidades

### Multiservidor y federación
- Federación en malla completa
- Administración desde cualquier instancia vinculada
- Selección y agrupación de servidores
- Estado remoto de stacks y actualizaciones
- Tokens de federación dedicados y recuperación de enlaces

### Gestión de stacks
- Crear, editar, iniciar, detener y recrear stacks Compose
- Stacks fijadas y ordenación avanzada
- Notas y herramientas Git
- Build + Recreate
- Acciones por servicio/contenedor
- Operaciones programadas
- Requisitos de host y protecciones VPN
- Barra lateral redimensionable con indicadores de recursos

### Migración y replicación
- Copia o movimiento entre instancias
- Transferencia de Compose, bind mounts y volúmenes
- Trabajos reanudables y SHA-256
- Despliegue transaccional y rollback
- Transferencia de imágenes locales y credenciales privadas
- Detección de conflictos `container_name`
- Replicación en frío programada

### Copias y recuperación
- Restic multidestino
- Bind mounts y volúmenes
- Restauración selectiva
- Verificación de repositorios y snapshots
- Historial e integración con recuperación protegida

### Actualizaciones
- Monitorización y detección remota
- Actualización manual y automática
- Rollback, programación y pausas
- Autoactualización protegida de Dockge-Enhanced
- Copia Restic, integridad, readiness y recuperación automática

### Seguridad
- Validación centralizada de nombres de stacks para bloquear path traversal fuera del directorio gestionado
- Trivy y excepciones CVE
- 2FA, Turnstile y trusted proxy
- Sidecar restringido y plan firmado
- Protecciones destructivas
- Transferencia cifrada de credenciales

### Monitorización
- Estadísticas del sistema, stacks y contenedores
- Barra de estado y tarjetas de salud
- Crash loops y auto-heal
- Logs live/pantalla completa
- Kula y Dozzle

### Recursos Docker
- Imágenes, volúmenes, redes y contenedores no gestionados
- Acciones masivas y auto-prune
- Protecciones de borrado

### Automatización y auditoría
- API REST
- Webhooks
- Home Assistant
- Operaciones programadas
- Historial centralizado

### Integraciones
- PlugNPiN
- Nginx Proxy Manager
- Pi-hole
- AdGuard Home
- Dozzle y Kula

### Notificaciones y acceso
- Discord y Apprise
- EN / FR / ES / zh-CN
- 2FA, trusted proxy, Turnstile
- Clientes móviles de terceros

---

---

## Flujo de actualización automática de Dockge-Enhanced

Dockge-Enhanced gestiona automáticamente todo el flujo: copia Restic obligatoria, verificación de integridad, reemplazo controlado del contenedor, healthcheck y confirmación final. Las notificaciones Discord/Apprise permiten seguir la operación sin mantener abierta la WebUI.

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

## Capturas de pantalla

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
      - TZ=Europe/Paris                      # zona horaria (afecta actualizaciones programadas)
```

```bash
docker compose up -d
```

Abre **http://localhost:5001**, crea tu cuenta de administrador y luego haz clic en **Monitoreo** en la barra de navegación.

> El volumen `/backup:/backup` es opcional pero recomendado si usas **local** como destino de copia de seguridad Restic — establece la ruta del destino en `/backup` para que tus instantáneas caigan en un directorio de anfitrión dedicado fuera del contenedor.

> **¿Copiando de seguridad múltiples directorios de datos?** Agrega tantos volúmenes como necesites (por ejemplo `../../media:/media-data`), luego registra cada ruta de contenedor en la pestaña Copias de seguridad bajo **Rutas adicionales** — Restic los incluirá todos en cada ejecución de copia de seguridad.

> **¿Monitoreando una partición de disco diferente a `/`?** Las estadísticas de disco se leen desde dentro del contenedor con `df`. Si quieres rastrear una ruta de anfitrión como `/mnt/data`, montala de solo lectura y agrégalas en la pestaña **Monitoreo** bajo *Particiones de disco monitoreadas*:
> ```yaml
>       - /mnt/data:/mnt/data:ro
> ```

### Integración opcional PlugNPiN

Abre **Configuración → Integraciones** para configurar [PlugNPiN](https://github.com/DeepSpace2/PlugNPiN). La integración permanece totalmente inactiva hasta que se selecciona **Habilitar PlugNPiN** y se guarda el formulario. Habilitarlo crea el stack gestionado `plugnpin-dockge-enhanced`; deshabilitarlo ejecuta Compose down y elimina el directorio de stack generado.

Las credenciales de Nginx Proxy Manager son requeridas por PlugNPiN. Pi-hole, AdGuard Home, métricas y registro de depuración permanecen opcionalmente individuales. Las contraseñas se escriben a través de stdin en el volumen Docker dedicado `dockge_enhanced_plugnpin_secrets` y nunca se devuelven al navegador ni se incluyen en el archivo Compose generado.

Para publicar un servicio, edita su stack y usa **Publicación PlugNPiN (opcional)** debajo del editor Compose. El asistente genera y puede aplicar las etiquetas requeridas `plugNPiN.ip` y `plugNPiN.url` más opciones NPM seleccionadas. Las etiquetas y comentarios en formato de mapeo existentes se conservan. Para etiquetas en formato de lista, Dockge ofrece deliberadamente salida de solo copia en lugar de reescribir la estructura existente.

> Deshabilitar el controlador detiene sus contenedores pero no puede garantizar la eliminación inmediata de entradas que creó mientras los contenedores de aplicación etiquetados aún se están ejecutando. Elimina las etiquetas o detén las aplicaciones afectadas mientras PlugNPiN se está ejecutando si esas entradas deben eliminarse primero.

> PlugNPiN `1.0.0` está actualmente publicado upstream solo para `amd64`. Dockge mantiene la integración deshabilitada con un mensaje claro en arquitecturas no compatibles; el resto de Dockge Enhanced permanece multi-arquitectura.

---

## Variables de entorno

| Variable | Predeterminado | Descripción |
|---|---|---|
| `DOCKGE_STACKS_DIR` | `/opt/stacks` | Directorio que contiene los stacks Docker Compose |
| `DOCKGE_DATA_DIR` | `/opt/dockge/data` | Directorio de datos de Dockge (establece en `/app/data`) |
| `DOCKGE_PUBLIC_URL` | *(ninguna)* | URL pública usada en enlaces de notificaciones Discord (por ejemplo `https://dockge.example.com`) |
| `DOCKER_API_VERSION` | *(ninguna)* | Fija la versión de la API de Docker negociada por el cliente — útil en ciertos sistemas NAS (por ejemplo Synology DSM 7.x) |
| `TZ` | `UTC` | Zona horaria del contenedor — **importante** para que las actualizaciones automáticas programadas se disparen en la hora local correcta (por ejemplo `Europe/Paris`) |
| `DOCKGE_PORT` | `5001` | Puerto de la interfaz web |
| `DOCKGE_SSL_KEY` / `DOCKGE_SSL_CERT` | — | Habilita HTTPS |
| `DOCKGE_AUTH_MODE` | *(no establecido)* | Modo de autenticación: `local`, `disabled`, o `trusted-proxy`. Cuando no está establecido, se conserva el comportamiento histórico y la configuración `disableAuth` |
| `DOCKGE_AUTH_PROXY_HEADER` | `x-forwarded-user` | Encabezado que contiene la identidad validada por proxy en modo `trusted-proxy` |
| `DOCKGE_AUTH_PROXY_TRUSTED_NETWORKS` | *(requerido en modo proxy)* | Direcciones o CIDRs separados por comas permitidos para proporcionar el encabezado de identidad |
| `DOCKGE_BOOTSTRAP_USERNAME` | *(ninguna)* | Nombre del primer administrador, creado solo cuando la base de datos no contiene usuarios |
| `DOCKGE_BOOTSTRAP_PASSWORD_FILE` | *(ninguna)* | Archivo secreto que contiene la contraseña; recomendado para bootstrap automatizado |
| `DOCKGE_BOOTSTRAP_PASSWORD` | *(ninguna)* | Alternativa de contraseña directa, menos segura porque es visible en el entorno del contenedor |
| `DOCKGE_TRANSFER_RSYNC_PROFILES` | `[]` | Array JSON de perfiles SSH/rsync locales (`label`, `host`, `port`, `user`, `path`, `keyPath`, opcional `bandwidthKbps`). Configura la misma identidad de destino en ambas instancias; las rutas de clave nunca salen de su instancia |

> ⚠️ Siempre establece `DOCKGE_DATA_DIR=/app/data` para coincidir con el montaje del volumen, de lo contrario la configuración no persistirá después de un reinicio.

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

Reemplaza el CIDR de ejemplo con la red exacta del proxy y configúralo para pasar el encabezado seleccionado. El puerto Dockge no debe ser directamente accesible: solo los proxies declarados pueden proporcionar una identidad. Cada usuario autorizado por el proxy recibe derechos de administrador porque Dockge Enhanced actualmente no proporciona roles separados. Nunca exempts `/setup`, `/socket.io`, o `/api/*` de la autenticación; el proxy debe reenviar WebSockets y proteger todo el host.

---

## Actualizaciones automáticas

Este fork rastrea automáticamente los lanzamientos upstream de Dockge a través de GitHub Actions:
- **Diario** — verifica un nuevo lanzamiento estable
- **Si se encuentra** — fusiona cambios upstream y abre un PR
- **Al fusionar** — reconstruye y publica imágenes Docker (`amd64` + `arm64`) a GHCR
- **En conflictos de autenticación** — mantiene temporalmente la versión Enhanced en la rama de sincronización y lista explícitamente archivos que requieren comparación antes de fusionar

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

- [**Dockge**](https://github.com/louislam/dockge) por louislam — el proyecto original (licencia MIT)
- [**Trivy**](https://github.com/aquasecurity/trivy) — escáner de vulnerabilidades
- [**Restic**](https://restic.net/) — herramienta de copia de seguridad encriptada
- [**Apprise**](https://github.com/caronc/apprise-api) — gateway de notificación multiplataforma
- [**Kula**](https://github.com/c0m4r/kula) por c0m4r — monitor de sistema ligero (AGPLv3)
- [**Dozzle**](https://github.com/amir20/dozzle) por Amir Rajan — visor de registros Docker en tiempo real (licencia MIT)
- [**PlugNPiN**](https://github.com/DeepSpace2/PlugNPiN) por DeepSpace2 — automatización opcional de DNS y Nginx Proxy Manager (GPLv3)
- [**crossly/Dockge-Enhanced**](https://github.com/crossly/Dockge-Enhanced) — fuente de mejoras importantes de UI/UX, temas, internacionalización y arquitectura frontend adaptadas en este proyecto

---

## Licencia

MIT — ver [LICENSE](LICENSE).
