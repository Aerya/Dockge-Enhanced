[English](README.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [中文](README.zh-CN.md)

# Dockge-Enhanced auf Unraid

Installation über eine Unraid-Docker-Vorlage mit derselben Enhanced-Anwendung wie auf anderen Systemen. Compose ist enthalten: **kein Unraid-Compose-Plugin erforderlich**. Die Vorlage ist noch nicht in Community Applications gelistet.

## Installation und Updates

1. [XML-Vorlage](dockge-enhanced.xml) nach `/boot/config/plugins/dockerMan/templates-user/my-dockge-enhanced.xml` kopieren.
2. Unter **Docker → Add Container** auswählen. Standardimage: `ghcr.io/aerya/dockge-enhanced:latest`. Für unveröffentlichte PRs deren Testimage verwenden; `latest` enthält unveröffentlichte Änderungen nicht.
3. Freien Port wählen (Standard **5055**). Persistente Verzeichnisse unter `/mnt/user/appdata/dockge-enhanced` prüfen: `data` für Enhanced, `stacks` für Compose.
4. Stack-Pfad **auf dem Host, im Container und in `DOCKGE_STACKS_DIR` identisch halten**. Bei einem Pool-Pfad statt `/mnt/user` alle drei gemeinsam ändern. Relative Anwendungsmounts werden auf dem Docker-Host aufgelöst.
5. Anwenden, WebUI öffnen, Administrator anlegen. **Unraid-Autostart** für Enhanced aktivieren; `restart: unless-stopped` allein reicht nach einem Array-Stopp nicht. Array-Autostart nach Bedarf konfigurieren.
6. Enhanced über **Unraids Docker-Registerkarte** aktualisieren, Mounts beibehalten. Ein vollständiges internes Sidecar-Update mit Restic-Sicherung wurde ebenfalls getestet; es ändert die Unraid-Vorlage nicht. Nur einen automatischen Update-Manager wählen. Anwendungsupdates bleiben über Enhanced möglich.

Nicht denselben Stack mit Enhanced und Compose Manager verwalten. Beim Wechsel von `test/unraid` bisherige Ordner und Port in der Vorlage beibehalten; Umbenennen ist unnötig. Vorher sichern und niemals zwei laufende Enhanced-Instanzen auf dieselben Daten zugreifen lassen.

## Rechte und Sicherheit

Enhanced läuft im Container als root und benötigt Schreibrechte für `data`/`stacks`. **`PUID`/`PGID` werden nicht unterstützt.** Anwendungen können eigene IDs verwenden: `99:100` mit einem `0750`-Ordner wurde getestet.

Kein pauschales `chmod 777`, rekursives `chown` oder Abschalten des User-Namespace-Remappings. Eigentümer, ACLs und Elternverzeichnisse prüfen. Remapped root ist nicht zwingend Host-root. Der Editor erhält Modi wie `0777`; ihre Anwendung hängt auch von Compose und dem Config-/Secret-Typ ab.

**Nicht privilegiert**, aber der Docker-Socket kontrolliert **alle Host-Container und Volumes**. Getrennte Ordner isolieren Docker nicht. WebUI nicht direkt im Internet veröffentlichen. Bereinigungseinstellungen prüfen und wichtige Daten vorher sichern.

## Sicherung und Wiederherstellung

- **Restic integriert**: separates Ziel verwenden. Sicherung, Integritätsprüfung sowie Compose-/`.env`-Wiederherstellung getestet.
- **Von Enhanced installiertes Zerobyte**: Quellen nur lesbar, separates Ziel und getrennte Wiederherstellung. Sicherung mit Dienst-Stopp/Neustart getestet. Nach Neuerstellung von Enhanced wird die eigene Zerobyte-Netzwerkverbindung nach Eigentümerprüfung automatisch wiederhergestellt.
- **Unraid Appdata Backup**: Enhanced-Ordner `data` und `stacks` wählen, Container beim Kopieren stoppen. Überschneidungen mit Enhanced-Backups/Updates vermeiden. **Benannte Docker-Volumes**, besonders Zerobytes interne Daten, sind nicht automatisch durch das Plugin abgedeckt: separat sichern.
- Compose-Sicherungen ersetzen keine Sicherung der Anwendungsdaten. Wiederherstellung praktisch testen.

`depends_on`/`service_healthy` und `network_mode: service:...` gelten beim Compose-Deployment. Unraid/Docker startet Container auch einzeln; Neustartrichtlinien garantieren keine Compose-Reihenfolge. Abhängige Anwendungen müssen sich neu verbinden können.

## Validierung und Diagnose

Geprüft in einer **VM mit Unraid 7.3.4 / Docker 29.8.2**, XFS-Array und btrfs-Docker-vDisk: DockerMan-Installation/Updates, Bearbeitung/Deployment, Non-root-Rechte, IPv4-/IPv6-Portlinks, Enhanced-/Host-Neustart, Array-Stopp/Start, Restic, Zerobyte und Appdata Backup. CI ergänzt Regressionstests, AMD64/ARM64-Builds und strikte Trivy-Prüfungen.

Zusätzlich getestet: vollständige Wiederherstellung von `data` und `stacks` mit Appdata Backup, HTTP über macvlan und ipvlan, Zerobyte-Netzwerkausfall sowie Sicherung/Wiederherstellung auf einem SMB/CIFS-Mount im Labor. Remote-Mounts müssen vor Zerobyte verfügbar sein: fehlt ein Mount, wird das Backup ohne Schreibzugriff auf das darunterliegende lokale Verzeichnis abgelehnt. Nach erneutem Einhängen Zerobyte starten; meldet der Schutz eine geänderte Speicheridentität, den Speicher ausdrücklich neu validieren.

Keine Zertifizierung jeder Hardware-/Pool-/Plugin-Kombination und keine nativen macOS-/Windows-Tests. Unraid-Version, Image/Commit, Pfade, Netzwerktreiber, Schritte und Logs **ohne Geheimnisse** in [Enhanced issues](https://github.com/Aerya/Dockge-Enhanced/issues) melden. Beim Entfernen eines Labors Namen und Ordnerinhalte prüfen; keine globale Docker-Bereinigung.

## Quellen

Vorlage nach alex3305 adaptiert. Die historischen Berichte dienten als Testgrundlage, nicht als Behauptung universeller Fehlerbehebung.

[alex3305/unraid-docker-templates](https://github.com/alex3305/unraid-docker-templates/blob/main/dockge.xml) · [Dockge 238](https://github.com/louislam/dockge/discussions/238) · [911](https://github.com/louislam/dockge/issues/911) · [906](https://github.com/louislam/dockge/issues/906) · [455](https://github.com/louislam/dockge/issues/455) · [290](https://github.com/louislam/dockge/issues/290)
