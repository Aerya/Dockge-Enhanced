# Windows 11 con Docker Desktop (WSL2)

[English](windows.md) · [Français](windows.fr.md) · [Deutsch](windows.de.md) · [Español](windows.es.md) · [简体中文](windows.zh-CN.md)

Enhanced funciona como **contenedor Linux**, no como servicio Windows nativo ni contenedor Windows. Utilice Docker Desktop con motor WSL2 y active la integración de su distribución Linux. Compose ya está incluido; no instale otro Docker Engine en WSL.

En Docker Desktop, active **Use the WSL 2 based engine** y su distribución en **Resources → WSL Integration**. Abra el terminal de esa distribución y compruebe:

```bash
docker version
docker compose version
mkdir -p "$HOME/dockge-enhanced"/{data,stacks,backups}
cd "$HOME/dockge-enhanced"
```

Se recomienda el sistema de archivos Linux de la distribución (por ejemplo `/home/user/dockge-enhanced`), no `/mnt/c`. Separe los montajes de datos y stacks. El directorio de stacks debe tener **la misma ruta absoluta dentro de Enhanced y en el host Docker**.

Cree `compose.yaml` en ese directorio:

```yaml
services:
  dockge:
    image: ghcr.io/aerya/dockge-enhanced:latest
    container_name: dockge-enhanced
    restart: unless-stopped
    ports:
      - "5001:5001"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ${HOME}/dockge-enhanced/data:/app/data
      - ${HOME}/dockge-enhanced/stacks:${HOME}/dockge-enhanced/stacks
      - ${HOME}/dockge-enhanced/backups:/backup
    environment:
      DOCKGE_STACKS_DIR: ${HOME}/dockge-enhanced/stacks
      DOCKGE_DATA_DIR: /app/data
```

Ejecute `docker compose up -d`, abra `http://localhost:5001` y cree su cuenta de administrador. Mantenga privado el socket Docker: permite controlar el motor Docker Linux. Para pruebas, use otros directorios y otro puerto.

Restic puede utilizar `/backup` como destino local. Zerobyte gestionado se ha probado con **directorios Linux WSL de origen y destino**, separados de los datos y stacks de Enhanced. No debilite los controles de rutas o identidad del almacenamiento para aceptar una ruta rechazada. Restaure primero en una ubicación de prueba dedicada. Una copia en la misma VM/disco Windows no protege contra la pérdida de ese disco.

La variante NTFS también se probó con Compose, `.env`, rutas relativas con espacios, volúmenes nombrados y Restic. Desde PowerShell, use `C:/...` como origen bind y `/run/desktop/mnt/host/c/...` como destino de stacks/`DOCKGE_STACKS_DIR`. Este mapeo específico de Docker Desktop no es portable a Linux. NTFS no ofrece las mismas garantías de propietarios, chmod o rendimiento que Linux; para bases de datos prefiera almacenamiento Linux WSL/volúmenes nombrados. Zerobyte gestionado en NTFS no está validado; use la configuración WSL anterior.

- Docker Desktop debe estar iniciado. Su arranque al iniciar sesión no es un servicio Windows autónomo; después de reiniciar, inicie sesión y espere al motor Linux. `restart: unless-stopped` no inicia Docker Desktop.
- CPU/RAM, estadísticas de disco y comprobación de espacio del self-update ven la VM Linux/los sistemas expuestos a Docker, no todo Windows. Compruebe también el espacio del disco Windows: la capacidad aparente del disco virtual no reserva espacio en el host.
- systemd del host, sensores Linux, red host, acceso USB/GPU y montajes NAS no equivalen a Linux nativo. No suponga que PowerWatch mide el hardware Windows a través de la VM.
- Las instancias vinculadas deben alcanzar sus direcciones configuradas. `localhost` es quien llama; `host.docker.internal` sirve a contenedores para acceder a este host Windows, no es una dirección pública para otros servidores. Abra el firewall Windows solo a clientes de confianza.

Pruebas en una VM aislada Windows 11 Enterprise Evaluation 26H2, Docker Desktop 4.97 / Engine 29.9, WSL 3.0.3 y Ubuntu 24.04: Compose/ENV, acceso no-root, volúmenes nombrados/relativos, healthchecks, límites CPU/RAM, restart/recreate, SQLite/node-pty y terminal web, snapshot/restauración Restic, Zerobyte gestionado con hooks protegidos y restauración, dos instancias vinculadas y permisos limitados. El sidecar usa un destino Linux conservando el origen Windows que indica Docker. No se anuncia compatibilidad con contenedores Windows nativos.

**Después de reiniciar Windows:** con Docker Desktop 4.97, el arranque automático con binds WSL falló en esta prueba: el socket no estaba disponible y un contenedor veía un directorio vacío, aunque los archivos reales de WSL seguían intactos. No repita la configuración inicial sobre un directorio aparentemente vacío. Espere a que `docker version` funcione en su distribución, compruebe los archivos de `data` y `stacks` y ejecute `docker compose up -d` desde el directorio de instalación. En Enhanced, inicie las stacks detenidas y reinicie las que tengan montajes incompletos. Se verificaron esta recuperación, las cuentas existentes y una nueva copia/restauración Zerobyte. La variante NTFS arrancó automáticamente en esta prueba. El arranque WSL totalmente autónomo **no está validado**; este problema de montajes también está [notificado a Docker Desktop](https://github.com/docker/desktop-feedback/issues/601).

[Docker Desktop / WSL](https://docs.docker.com/desktop/features/wsl/) · [WSL filesystems](https://learn.microsoft.com/en-us/windows/wsl/filesystems)
