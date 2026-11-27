# Actualizaciones de hosts (Beta)

[English](host-management.md) · [Français](host-management.fr.md) · [Deutsch](host-management.de.md) · [Español](host-management.es.md) · [简体中文](host-management.zh-CN.md)

Opcional y desactivado por defecto en `/watcher/hosts`: inventario y detección de actualizaciones Debian/Ubuntu y Arch/Garuda, análisis CVE Debian/Ubuntu y actualizaciones APT manuales o programadas tras instalación y autorización locales. Perfiles: todas las permitidas, solo seguridad, prudente, seguridad y prudente. Notificaciones configurables de detecciones y operaciones. Informes de solo lectura y federación existente. Arch/Garuda solo permiten supervisión; AUR, RPM/APK/Zypper, operaciones de flota y cobertura CVE completa siguen sin estar disponibles.

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

## Ejecutor APT local

Manual se autoriza localmente: instale el ejecutor separado y configure horas UTC y exclusiones en la política de root. Por defecto rechaza instalaciones. Solicitudes válidas dos minutos; simulaciones cinco minutos, recalculadas antes de instalar. La aprobación se consume antes de ejecutar. Sin shell, reinicios, dependencias nuevas ni eliminaciones. Conserva bloqueos APT y configuraciones existentes; revise .dpkg-dist localmente. No detenga un gestor que esté escribiendo; desactivar el temporizador impide nuevas solicitudes. Ante fallos, diagnostique localmente con dpkg --audit y recuperación de la distribución. Sin rollback universal. Un administrador/hub comprometido puede pedir actualizaciones permitidas localmente; root comprometido queda fuera de la frontera de confianza.

El directorio de solicitudes pertenece al UID de Enhanced (adapte 1000). Es el único escribible; informes en solo lectura. Nunca monte /etc/dockge-host ni el estado del ejecutor. Agentes directos/inversos existentes con control de administrador en ambos extremos. Hub-only lee inventarios sin ejecutar Trivy; Agent-only conserva los RPC. Las notificaciones y la programación por host se detallan abajo. Sin operaciones de flota ni selección individual de paquetes.

```sh
sudo install -m 0644 extra/host-management/executor.py extra/host-management/apt_provider.py /usr/local/lib/dockge-host/
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
  "allowAutomatic": false,
  "allowedScopes": ["security", "conservative", "security-conservative"],
  "conservativePackages": [],
  "refreshMetadata": false,
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

## Perfiles, programación y notificaciones

Ninguna actualización garantiza ausencia de incompatibilidades. **Solo seguridad** selecciona versiones de repositorios de seguridad oficiales y confiables Debian/Ubuntu con comparaciones nativas APT, independientemente de Trivy. Excluye ESM y terceros. **Prudente** exige la lista local `conservativePackages` y excluye paquetes esenciales/importantes y familias críticas (núcleo, arranque, red, controladores, Docker, bases de datos). Una lista vacía no actualiza nada. **Seguridad y prudente** combina ambos filtros. Se rechazan dependencias fuera de la selección, paquetes nuevos, eliminaciones y paquetes retenidos; una dependencia adicional puede bloquear toda la operación. `all` también requiere autorización explícita en `allowedScopes` y no es prudente.

Arch/Garuda y las distribuciones rolling-release pueden sufrir roturas de dependencias, controladores o aplicaciones y requerir intervención manual. Leer los anuncios, realizar copias y preferir actualizaciones completas según la distribución (por ejemplo `garuda-update`). Esta beta no ofrece actualizaciones parciales, solo de seguridad ni automáticas para rolling-release.

Instalar también `apt_provider.py` y el paquete del sistema `python3-apt` para perfiles específicos. Se usa `/usr/bin/python3`. `mode: manual` permite simulación y aprobación manual. Para programar en Debian/Ubuntu de versión fija, configurar localmente `mode: automatic`, `allowInstall: true`, `allowAutomatic: true`, `allowedScopes` y `utcHours`. El hub no puede modificar esta política. `refreshMetadata: true` permite explícitamente actualizar índices APT antes de simulaciones y trabajos programados; un fallo impide instalar. En caso contrario se usan índices existentes.

En Configuración guardar días, hora UTC y perfil. El ejecutor local recalcula el plan y comprueba la política en cada ejecución. Cada horario se ejecuta una vez; con cinco minutos de retraso se omite, sin recuperación ni reintento automático tras fallo. Continúa con el hub desconectado. Desactivar y guardar el horario antes de desactivar la supervisión. Revocar la política local o desactivar el temporizador impide nuevos trabajos; nunca interrumpir escrituras APT/dpkg activas. Sin reinicio automático, cambio de versión de distribución ni reversión universal.

Las notificaciones usan Discord/Apprise configurados en Notificaciones y están desactivadas por defecto de forma independiente. Eventos seleccionables: actualizaciones, vulnerabilidades por gravedad, correcciones, reinicio necesario, recopilador o datos de seguridad antiguos/no disponibles, inicio, éxito, fallo y cambios de programación. Las instalaciones indican modo manual/automático, perfil y número de paquetes. Las detecciones se deduplican y limitan a una por hora y tipo; las operaciones no tienen esa limitación. La supervisión y el envío funcionan sin página abierta. Los fallos de envío se reintentan mientras se conservan y están habilitados; basta un canal correcto para considerar entregado. El ejecutor conserva los últimos 100 eventos para reconexiones; Enhanced aplica su retención, 90 días por defecto. El búfer no es ilimitado.
