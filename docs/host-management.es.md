# Actualizaciones de hosts (Beta)

[English](host-management.md) · [Français](host-management.fr.md) · [Deutsch](host-management.de.md) · [Español](host-management.es.md) · [简体中文](host-management.zh-CN.md)

Opcional y desactivado por defecto en `/watcher/hosts`: inventario y detección de actualizaciones Debian/Ubuntu y Arch/Garuda, análisis CVE Debian/Ubuntu y actualizaciones APT manuales o programadas tras instalación y autorización locales. Perfiles: todas las permitidas, solo seguridad, prudente, seguridad y prudente. Notificaciones configurables de detecciones y operaciones. Informes de solo lectura y federación existente. Arch/Garuda solo permiten supervisión; AUR, RPM/APK/Zypper, operaciones de flota y cobertura CVE completa siguen sin estar disponibles.

La pestaña Actualizaciones de hosts siempre está visible; solo la supervisión está desactivada por defecto.

Actualizaciones agrupa Dockge-Enhanced, Imágenes Docker y Actualizaciones de hosts (Beta) en tres subpestañas visibles. Se mantienen ocho pestañas principales, las URL existentes y los enlaces a instancias remotas.

## Instalación de componentes del host

Instalar componentes del host desde Dockge: estado explícito, instalación/reparación y permisos en la interfaz, primer inventario inmediato. Sin comandos ni cambios Compose por parte del usuario.

Dockge instala los componentes e inicia el primer inventario. No requiere comandos, cambios Compose ni conexión SSH. Supervisión: Debian/Ubuntu y Arch/Garuda; ejecución: Debian/Ubuntu de versión fija.

Horas UTC autorizadas, separadas por comas. Paquetes permitidos para el perfil prudente, separados por comas (vacío: ninguno). Estas opciones sustituyen los permisos del ejecutor. Se conservan las exclusiones existentes. El modo programable no activa un horario; configúrelo después.

Un administrador confirma el modo en la interfaz. Un contenedor temporal basado en la imagen exacta de la instancia entra en los espacios del sistema anfitrión e instala archivos incluidos, dependencias Python ausentes y servicios systemd. No acepta comandos, rutas ni imágenes del navegador. El transporte permanente no tiene privilegios del sistema, red, socket Docker ni montaje raíz del host; los informes son de solo lectura y solo se escribe en solicitudes. No requiere recrear Dockge ni modificar su stack. Las instalaciones manuales siguen siendo compatibles. No admite Docker rootless, remapeo de usuarios, Docker Desktop ni hosts sin systemd. En un hub debe seleccionarse un agente compatible. Se puede reintentar una instalación interrumpida; nunca matar un gestor de paquetes que esté escribiendo.

Las solicitudes caducan en dos minutos y simulaciones en cinco; se recalcula el plan y consume la aprobación antes de ejecutar. Las actualizaciones no exponen shell, dependencias nuevas, eliminaciones ni reinicio automático. Se conservan bloqueos APT y configuraciones; revisar `.dpkg-dist` después. Una transacción interrumpida exige `dpkg --audit` local y recuperación de la distribución, sin reversión universal. Desactivar horario y temporizador impide nuevos trabajos sin interrumpir escrituras. Un administrador Enhanced comprometido puede autorizar instalaciones ofrecidas; root del host comprometido queda fuera de esta frontera.

## Limitaciones y recuperación

Monitor admite Debian/Ubuntu y Arch/Garuda. Pacman usa checkupdates o caché con pacman -Qu; nunca pacman -Sy, actualizaciones parciales ni AUR. APT usa la caché existente sin refresco implícito. Reinicio desconocido no significa innecesario. Otros sistemas y proveedores no están soportados. Un host por instancia. Temporizador local: 6 horas; lectura cada minuto. Caducidad 12 horas; historial 90 días, configurables. Huellas evitan inventarios duplicados; se muestran 100 entradas. Se muestran nombres de repositorios depurados y versiones de paquetes de núcleo. Solo se reconoce origen oficial en espejos públicos Debian/Ubuntu inequívocos; otras coincidencias quedan indeterminadas. Pulse una fecha para comparar altas, bajas y versiones con el inventario anterior conservado. No hay filtros avanzados de flota. Un hash de machine-id con prefijo específico vincula informes y operaciones; nunca se transmite machine-id sin procesar.

Análisis CVE opcional, como máximo cada hora tras cambios, o diario. La misma imagen Trivy lee metadatos dpkg/os-release sintéticos, sin raíz del host ni socket Docker. Solo la descarga de bases tiene red; análisis sin conexión. Rechaza bases de más de 72 horas. Cobertura parcial: terceros, ESM y avisos desconocidos no se consideran seguros. Solo una versión corregida exacta presente en el inventario se marca disponible; otras quedan indeterminadas. Sin comparación SemVer genérica. Reanálisis diario, resultados en memoria; tras reiniciar son desconocidos. Bases descargadas en ejecución, no redistribuidas; consulte las licencias de fuentes Trivy. Sin CVE Arch ni fuentes directas.

[Trivy SBOM](https://trivy.dev/docs/latest/target/sbom/) · [Trivy DB sources and licenses](https://github.com/aquasecurity/trivy-db/blob/main/LICENSE)

[PatchMon](https://github.com/PatchMon/PatchMon) — Inspiración para inventario de sistemas, supervisión y orquestación de actualizaciones.

[PatchBase](https://github.com/patchbase/patchbase) — Inspiración para inventario de paquetes, correlación de avisos y detección de vulnerabilidades.

## Perfiles, programación y notificaciones

Ninguna actualización garantiza ausencia de incompatibilidades. **Solo seguridad** selecciona versiones de repositorios de seguridad oficiales y confiables Debian/Ubuntu con comparaciones nativas APT, independientemente de Trivy. Excluye ESM y terceros. **Prudente** exige la lista local `conservativePackages` y excluye paquetes esenciales/importantes y familias críticas (núcleo, arranque, red, controladores, Docker, bases de datos). Una lista vacía no actualiza nada. **Seguridad y prudente** combina ambos filtros. Se rechazan dependencias fuera de la selección, paquetes nuevos, eliminaciones y paquetes retenidos; una dependencia adicional puede bloquear toda la operación. `all` también requiere autorización explícita en `allowedScopes` y no es prudente.

Arch/Garuda y las distribuciones rolling-release pueden sufrir roturas de dependencias, controladores o aplicaciones y requerir intervención manual. Leer los anuncios, realizar copias y preferir actualizaciones completas según la distribución (por ejemplo `garuda-update`). Esta beta no ofrece actualizaciones parciales, solo de seguridad ni automáticas para rolling-release.

En Configuración guardar días, hora UTC y perfil. El ejecutor local recalcula el plan y comprueba la política en cada ejecución. Cada horario se ejecuta una vez; con cinco minutos de retraso se omite, sin recuperación ni reintento automático tras fallo. Continúa con el hub desconectado. Desactivar y guardar el horario antes de desactivar la supervisión. Revocar la política local o desactivar el temporizador impide nuevos trabajos; nunca interrumpir escrituras APT/dpkg activas. Sin reinicio automático, cambio de versión de distribución ni reversión universal.

Las notificaciones usan Discord/Apprise configurados en Notificaciones y están desactivadas por defecto de forma independiente. Eventos seleccionables: actualizaciones, vulnerabilidades por gravedad, correcciones, reinicio necesario, recopilador o datos de seguridad antiguos/no disponibles, inicio, éxito, fallo y cambios de programación. Las instalaciones indican modo manual/automático, perfil y número de paquetes. Las detecciones se deduplican y limitan a una por hora y tipo; las operaciones no tienen esa limitación. La supervisión y el envío funcionan sin página abierta. Los fallos de envío se reintentan mientras se conservan y están habilitados; basta un canal correcto para considerar entregado. El ejecutor conserva los últimos 100 eventos para reconexiones; Enhanced aplica su retención, 90 días por defecto. El búfer no es ilimitado.
