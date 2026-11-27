# Actualizaciones de hosts (Beta)

[English](host-management.md) · [Français](host-management.fr.md) · [Deutsch](host-management.de.md) · [Español](host-management.es.md) · [简体中文](host-management.zh-CN.md)

Opcional y desactivado por defecto en `/watcher/hosts`: inventario local, actualizaciones APT/Pacman, análisis CVE Debian/Ubuntu con la imagen Trivy existente y operaciones APT manuales limitadas con autorización local. Los informes se montan en solo lectura. La federación existente transporta las solicitudes; los agentes antiguos permanecen no disponibles. No se ofrecen actualizaciones automáticas, AUR, RPM/APK/Zypper ni cobertura completa del proveedor.

La pestaña Actualizaciones de hosts siempre está visible; solo la supervisión está desactivada por defecto.

Actualizaciones agrupa Dockge-Enhanced, Imágenes Docker y Actualizaciones de hosts (Beta) en tres subpestañas visibles. Se mantienen ocho pestañas principales, las URL existentes y los enlaces a instancias remotas.

## Instalación y seguridad

Ejecute estos comandos localmente en el host Linux elegido tras revisar los scripts. Nunca instale el colector dentro de Enhanced. Requiere Python 3 y systemd. SSH no es necesario ni está implementado. No pruebe instalándolo en producción. La instalación y actualización son acciones locales; el hub no puede sustituir estos archivos.

```sh
sudo useradd --system --no-create-home --shell /usr/sbin/nologin dockge-host
sudo install -d -m 0755 /usr/local/lib/dockge-host
sudo install -m 0644 extra/host-management/collector.py /usr/local/lib/dockge-host/
sudo install -m 0644 extra/host-management/dockge-host-collector.service extra/host-management/dockge-host-collector.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dockge-host-collector.timer
sudo systemctl start dockge-host-collector.service
```

```yaml
services:
  dockge:
    volumes:
      - /var/lib/dockge-host-reports:/host-reports:ro
```

## Limitaciones y recuperación

Monitor admite Debian/Ubuntu y Arch/Garuda. Pacman usa checkupdates o caché con pacman -Qu; nunca pacman -Sy, actualizaciones parciales ni AUR. APT usa la caché existente sin refresco implícito. Reinicio desconocido no significa innecesario. Otros sistemas y proveedores no están soportados. Un host por instancia. Temporizador local: 6 horas; lectura cada minuto. Caducidad 12 horas; historial 90 días, configurables. Huellas evitan inventarios duplicados; se muestran 100 entradas. Se muestran nombres de repositorios depurados y versiones de paquetes de núcleo. Solo se reconoce origen oficial en espejos públicos Debian/Ubuntu inequívocos; otras coincidencias quedan indeterminadas. Pulse una fecha para comparar altas, bajas y versiones con el inventario anterior conservado. No hay filtros avanzados de flota. Un hash de machine-id con prefijo específico vincula informes y operaciones; nunca se transmite machine-id sin procesar.

Análisis CVE opcional, como máximo cada hora tras cambios, o diario. La misma imagen Trivy lee metadatos dpkg/os-release sintéticos, sin raíz del host ni socket Docker. Solo la descarga de bases tiene red; análisis sin conexión. Rechaza bases de más de 72 horas. Cobertura parcial: terceros, ESM y avisos desconocidos no se consideran seguros. Solo una versión corregida exacta presente en el inventario se marca disponible; otras quedan indeterminadas. Sin comparación SemVer genérica. Reanálisis diario, resultados en memoria; tras reiniciar son desconocidos. Bases descargadas en ejecución, no redistribuidas; consulte las licencias de fuentes Trivy. Sin CVE Arch ni fuentes directas.

[Trivy SBOM](https://trivy.dev/docs/latest/target/sbom/) · [Trivy DB sources and licenses](https://github.com/aquasecurity/trivy-db/blob/main/LICENSE)

```sh
sudo systemctl disable --now dockge-host-collector.timer
sudo rm /etc/systemd/system/dockge-host-collector.timer /etc/systemd/system/dockge-host-collector.service
sudo systemctl daemon-reload
# Reports and history are retained.
```

[PatchMon](https://github.com/PatchMon/PatchMon) — Inspiración para inventario de sistemas, supervisión y orquestación de actualizaciones.

[PatchBase](https://github.com/patchbase/patchbase) — Inspiración para inventario de paquetes, correlación de avisos y detección de vulnerabilidades.

## Ejecutor APT manual

Manual se autoriza localmente: instale el ejecutor separado y configure horas UTC y exclusiones en la política de root. Por defecto rechaza instalaciones. Solicitudes válidas dos minutos; simulaciones cinco minutos, recalculadas antes de instalar. La aprobación se consume antes de ejecutar. Sin shell, reinicios, dependencias nuevas, eliminaciones ni planificación automática. Conserva bloqueos APT y configuraciones existentes; revise .dpkg-dist localmente. No detenga un gestor que esté escribiendo; desactivar el temporizador impide nuevas solicitudes. Ante fallos, diagnostique localmente con dpkg --audit y recuperación de la distribución. Sin rollback universal. Un administrador/hub comprometido puede pedir actualizaciones permitidas localmente; root comprometido queda fuera de la frontera de confianza.

El directorio de solicitudes pertenece al UID de Enhanced (adapte 1000). Es el único escribible; informes en solo lectura. Nunca monte /etc/dockge-host ni el estado del ejecutor. Agentes directos/inversos existentes con control de administrador en ambos extremos. Hub-only lee inventarios sin ejecutar Trivy; Agent-only conserva los RPC. Notificaciones ImageWatcher desactivadas por defecto, sin duplicados, máximo cada hora. Sin planificación de flota, selección solo de seguridad ni actualizaciones individuales.

```sh
sudo install -m 0644 extra/host-management/executor.py /usr/local/lib/dockge-host/
sudo install -d -m 0700 /etc/dockge-host /var/lib/dockge-host-executor
sudo install -d -m 0755 /var/lib/dockge-host-operations
sudo install -d -m 0700 -o 1000 /var/lib/dockge-host-requests
sudo install -m 0600 extra/host-management/policy.example.json /etc/dockge-host/policy.json
sudo install -m 0644 extra/host-management/dockge-host-executor.service extra/host-management/dockge-host-executor.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dockge-host-executor.timer
```

```json
{
  "mode": "manual",
  "allowInstall": true,
  "utcHours": [2, 3],
  "exclusions": ["example-package"]
}
```

```yaml
services:
  dockge:
    environment:
      DOCKGE_HOST_REQUEST_DIR: /host-requests
      DOCKGE_HOST_OPERATION_REPORT_DIR: /host-operations
    volumes:
      - /var/lib/dockge-host-requests:/host-requests
      - /var/lib/dockge-host-operations:/host-operations:ro
```

```sh
sudo systemctl disable --now dockge-host-executor.timer
# Wait for any running apt/dpkg operation to complete before removing the service.
sudo rm /etc/systemd/system/dockge-host-executor.timer /etc/systemd/system/dockge-host-executor.service
sudo systemctl daemon-reload
```
