# Blockierte Selbstaktualisierung wiederherstellen

[en](self-update-recovery.md) · [fr](self-update-recovery.fr.md) · [de](self-update-recovery.de.md) · [es](self-update-recovery.es.md) · [zh-CN](self-update-recovery.zh-CN.md)

Diese Anleitung betrifft nur „Duplicate mount point“ beim Start des Sidecars. Die Korrektur #607 ist im offiziellen Image `:latest` veröffentlicht. Die alte Version kann sie nicht selbst installieren. Ich entschuldige mich für diese Regression.

## Vor den Befehlen

Verwenden Sie das Terminal des Docker-Hosts, nicht ein Terminal innerhalb von Enhanced. Bewahren Sie eine aktuelle Datensicherung auf. Kein `down -v`, keine Bereinigung und keine Datenlöschung. Nur Enhanced wird kurz unterbrochen; erstellen Sie andere Dienste nicht neu.

## Installation identifizieren

Ersetzen Sie `ENHANCED_CONTAINER` durch den tatsächlichen Containernamen. Diese Befehle lesen nur Compose-Metadaten:

```bash
docker inspect ENHANCED_CONTAINER --format '{{index .Config.Labels "com.docker.compose.project"}}'
docker inspect ENHANCED_CONTAINER --format '{{index .Config.Labels "com.docker.compose.service"}}'
docker inspect ENHANCED_CONTAINER --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'
docker inspect ENHANCED_CONTAINER --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}'
```

Behalten Sie Projektname, Dienst, Arbeitsverzeichnis und ALLE angegebenen Compose-/Override-Dateien in ihrer Reihenfolge bei. Behalten Sie auch Ihre üblichen `--env-file`-Optionen und Profile. Veröffentlichen Sie weder Konfiguration noch Geheimnisse.

## Compose-Installation aktualisieren

Erstellen Sie im ermittelten Arbeitsverzeichnis die dauerhafte Datei `recovery-image.yaml` mit folgendem Inhalt. Ersetzen Sie `SERVICE` durch den Enhanced-Dienstnamen, nicht den Containernamen:

```yaml
services:
  SERVICE:
    image: ghcr.io/aerya/dockge-enhanced:latest
```

Ersetzen Sie in JEDEM Befehl `PROJECT`, `BASE_COMPOSE` und `SERVICE`. Fügen Sie zwischen Basisdatei und `recovery-image.yaml` für JEDES vorhandene Override ein `-f` in der ursprünglichen Reihenfolge ein. Die Wiederherstellungsdatei muss zuletzt stehen: Sie ersetzt nur das Image, auch wenn ein altes Override einen Digest festlegt. Fahren Sie nicht fort, wenn eine Datei fehlt oder unklar ist.

```bash
docker compose -p PROJECT -f BASE_COMPOSE -f recovery-image.yaml config --images
```

Prüfen Sie, dass die Imageliste `ghcr.io/aerya/dockge-enhanced:latest` enthält. Danach:

```bash
docker compose -p PROJECT -f BASE_COMPOSE -f recovery-image.yaml pull SERVICE
docker compose -p PROJECT -f BASE_COMPOSE -f recovery-image.yaml up -d --no-deps SERVICE
```

Löschen Sie `recovery-image.yaml` anschließend nicht: Docker speichert den Pfad in den Compose-Metadaten; spätere Vorgänge können die Datei lesen. Behalten Sie bestehende Overrides und löschen Sie nichts ungeprüft. Nach Prüfung der Oberfläche und des Zustands verwenden künftige Aktualisierungen den korrigierten Mechanismus.

## Andere Installationen und Hilfe

Ohne Compose-Metadaten (etwa Unraid-Template oder anderes Verwaltungswerkzeug) aktualisieren Sie mit dem ursprünglichen Werkzeug auf das offizielle Image `:latest`. Behalten Sie alle Einstellungen, Ports, Netzwerke und Einbindungen. Wenden Sie diese Compose-Befehle nicht auf andere Installationsarten an. Erstellen Sie bei Bedarf ein Issue mit Fehler und Installationsart, ohne Geheimnisse. Eigene Images müssen #607 enthalten; die Zielauswahl dieser Meldung erfasst sie nicht automatisch.

