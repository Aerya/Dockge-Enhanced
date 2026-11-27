# Host-Updates (Beta)

[English](host-management.md) · [Français](host-management.fr.md) · [Deutsch](host-management.de.md) · [Español](host-management.es.md) · [简体中文](host-management.zh-CN.md)

Optional und standardmäßig deaktiviert unter `/watcher/hosts`: Inventar und Update-Erkennung für Debian/Ubuntu und Arch/Garuda, CVE-Analyse für Debian/Ubuntu sowie manuelle oder geplante APT-Updates nach lokaler Installation und Freigabe. Profile: alle erlaubten Updates, nur Sicherheit, vorsichtig, Sicherheit und vorsichtig. Konfigurierbare Benachrichtigungen für Erkennungen und Vorgänge. Schreibgeschützte Berichte und bestehende Föderation. Arch/Garuda bleiben auf Überwachung beschränkt; AUR, RPM/APK/Zypper, Flottenaktionen und vollständige CVE-Abdeckung fehlen weiterhin.

Der Tab Host-Updates bleibt immer sichtbar; nur die Überwachung ist standardmäßig deaktiviert.

Updates bündelt Dockge-Enhanced, Docker-Images und Host-Updates (Beta) in drei sichtbaren Untertabs. Acht Haupttabs bleiben; bestehende URLs und Links zu entfernten Instanzen bleiben gültig.

## Installation und Sicherheit

Diese Befehle nach Prüfung der Skripte lokal auf dem gewünschten Linux-Host ausführen. Kollektor niemals in Enhanced installieren. Python 3 und systemd erforderlich. SSH ist weder erforderlich noch implementiert. Nicht zum Testen auf Produktionshosts installieren. Installation und Updates erfolgen lokal; der Hub kann die Dateien nicht ersetzen.

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

## Einschränkungen und Wiederherstellung

Monitor unterstützt Debian/Ubuntu und Arch/Garuda. Pacman nutzt checkupdates oder den Cache mit pacman -Qu; kein pacman -Sy, Teilupgrade oder AUR. APT nutzt vorhandene Metadaten ohne implizite Aktualisierung. Unbekannter Neustartstatus bedeutet nicht, dass kein Neustart nötig ist. Andere Systeme und Provider werden nicht unterstützt. Ein Host pro Instanz. Timer lokal: 6 Stunden; Einlesen jede Minute. Veraltet nach 12 Stunden; Verlauf 90 Tage, konfigurierbar. Fingerabdrücke vermeiden identische Inventarkopien; Anzeige der letzten 100 Einträge. Bereinigte Quellennamen und installierte Kernelpaketversionen werden angezeigt. Offizielle Herkunft wird nur bei eindeutigen öffentlichen Debian/Ubuntu-Spiegeln erkannt; sonst bleiben Treffer unbestimmt. Inventardatum anklicken, um Paketänderungen mit dem vorherigen gespeicherten Inventar zu vergleichen. Erweiterte Flottenfilter fehlen. Ein domänenspezifischer Hash der machine-id verbindet Berichte und Aktionen; die rohe machine-id wird nie übertragen.

CVE-Analyse optional, bei Inventaränderung höchstens stündlich, sonst täglich. Dasselbe Trivy-Image liest synthetische dpkg-/os-release-Metadaten, ohne Host-Root oder Docker-Socket. Nur Datenbankdownload mit Netzwerk; Analyse offline. Datenbanken älter als 72 Stunden werden abgelehnt. Teilabdeckung: Drittanbieter, ESM und unbekannte Meldungen bleiben unbestimmt. Exakte Korrekturversion im Updateinventar gilt als verfügbar; sonst lokale Verfügbarkeit unbekannt. Kein generischer SemVer-Vergleich. Tägliche Neuanalyse, Ergebnisse im Speicher; nach Neustart zunächst unbekannt. Datenbanken werden zur Laufzeit heruntergeladen, nicht weiterverteilt; Trivy-Quellenlizenzen beachten. Arch-CVEs und direkte Herstellerfeeds fehlen.

[Trivy SBOM](https://trivy.dev/docs/latest/target/sbom/) · [Trivy DB sources and licenses](https://github.com/aquasecurity/trivy-db/blob/main/LICENSE)

```sh
sudo systemctl disable --now dockge-host-collector.timer
sudo rm /etc/systemd/system/dockge-host-collector.timer /etc/systemd/system/dockge-host-collector.service
sudo systemctl daemon-reload
# Reports and history are retained.
```

[PatchMon](https://github.com/PatchMon/PatchMon) — Inspiration für Systeminventar, Überwachung und Update-Orchestrierung.

[PatchBase](https://github.com/patchbase/patchbase) — Inspiration für Paketinventar, Sicherheitsmeldungsabgleich und Schwachstellenerkennung.

## Lokaler APT-Executor

Manual muss lokal freigegeben werden: separaten Executor installieren, UTC-Stunden und Ausschlüsse in der root-eigenen Richtlinie festlegen. Standardmäßig keine Installation. Anfragen gelten zwei Minuten, Simulationen fünf Minuten und werden vor Installation neu berechnet. Freigaben werden vor Ausführung verbraucht. Kein Shellzugriff, Neustart, neue Abhängigkeiten oder Entfernen. Native APT-Sperren bleiben aktiv. Bestehende Konfigurationen bleiben erhalten; .dpkg-dist lokal prüfen. Schreibende Paketmanager nicht stoppen; Timer deaktivieren verhindert neue Anfragen. Fehler erfordern lokale Diagnose mit dpkg --audit und distributionsspezifische Wiederherstellung. Kein universelles Rollback. Ein kompromittierter Admin/Hub kann lokal erlaubte Updates anfordern; ein kompromittierter Root-Host liegt außerhalb der Vertrauensgrenze.

Anfrageverzeichnis muss der Enhanced-UID gehören (1000 anpassen). Nur dieses Verzeichnis ist beschreibbar; Ergebnisberichte schreibgeschützt. /etc/dockge-host und Executor-Zustand niemals einbinden. Bestehende direkte/inverse Agents mit Administratorprüfung an beiden Enden. Hub-only liest Inventare, führt Trivy aber nicht aus. Agent-only nutzt dieselben RPCs. Benachrichtigungen und Zeitpläne je Host werden unten beschrieben. Keine Flottenplanung oder Einzelpaketauswahl.

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

## Profile, Zeitpläne und Benachrichtigungen

Kein Update garantiert den Ausschluss von Inkompatibilitäten. **Nur Sicherheit** wählt Versionen aus vertrauenswürdigen offiziellen Debian/Ubuntu-Sicherheitsquellen anhand nativer APT-Vergleiche, unabhängig von Trivy. ESM und Drittanbieterquellen sind ausgeschlossen. **Vorsichtig** benötigt die lokale Freigabeliste `conservativePackages`; essentielle/wichtige Pakete und zentrale kritische Familien (Kernel, Boot, Netzwerk, Treiber, Docker, Datenbanken) sind ausgeschlossen. Eine leere Liste aktualisiert nichts. **Sicherheit und vorsichtig** kombiniert beide Einschränkungen. Zusätzliche oder nicht ausgewählte Abhängigkeiten, Entfernungen und gehaltene Pakete werden verweigert; dadurch kann der gesamte Vorgang blockieren. Auch `all` benötigt eine ausdrückliche Freigabe in `allowedScopes` und ist nicht vorsichtig.

Bei Arch/Garuda und Rolling-Release-Systemen können Abhängigkeiten, Treiber oder Anwendungen brechen und manuelle Eingriffe erfordern. Ankündigungen lesen, sichern und vollständige Updates nach Distributionsanleitung durchführen (z. B. `garuda-update`). Partielle, reine Sicherheits- und automatische Rolling-Release-Updates bietet diese Beta nicht an.

Für gezielte Profile zusätzlich `apt_provider.py` und das Systempaket `python3-apt` installieren. Verwendet wird `/usr/bin/python3`. `mode: manual` erlaubt Simulation und anschließende manuelle Bestätigung. Zeitpläne für Debian/Ubuntu mit fester Version benötigen lokal `mode: automatic`, `allowInstall: true`, `allowAutomatic: true`, `allowedScopes` und `utcHours`. Die Richtlinie ist für den Hub unzugänglich. `refreshMetadata: true` erlaubt die Aktualisierung der APT-Indizes vor Simulationen und geplanten Vorgängen; Fehler verhindern die Installation. Sonst werden vorhandene Indizes verwendet.

Unter Konfiguration Wochentage, UTC-Zeit und Profil speichern. Der lokale Executor berechnet jeden Plan neu und prüft die Richtlinie erneut. Ein Termin läuft einmal; ab fünf Minuten Verspätung entfällt er, ohne Nachholen oder automatischen Wiederholungsversuch bei Fehlern. Der Zeitplan läuft auch ohne Hub-Verbindung weiter. Vor Abschalten der Überwachung den Zeitplan deaktivieren und speichern. Lokale Freigabe widerrufen oder Timer deaktivieren verhindert neue Vorgänge; laufende APT/dpkg-Schreibvorgänge niemals unterbrechen. Kein automatischer Neustart, Distributionswechsel oder universelles Rollback.

Benachrichtigungen verwenden die unter Benachrichtigungen eingerichteten Discord/Apprise-Kanäle und sind separat standardmäßig aus. Wählbar: Updates, Schwachstellen nach Schweregrad, Korrekturen, Neustartbedarf, alte/fehlende Collector- oder Sicherheitsdaten, Start, Erfolg, Fehler und Zeitplanänderungen. Installationsmeldungen enthalten manuell/automatisch, Profil und Paketanzahl. Erkennungsmeldungen werden dedupliziert und je Typ stündlich begrenzt; Vorgänge haben keine solche Begrenzung. Überwachung und Versand laufen ohne geöffnete Seite. Fehlgeschlagene Sendungen werden innerhalb der Aufbewahrungszeit bei aktiven Benachrichtigungen wiederholt; ein erfolgreicher Kanal gilt als Zustellung. Der Executor hält die letzten 100 Ereignisse für erneute Verbindungen vor; Enhanced speichert sie gemäß Aufbewahrung, standardmäßig 90 Tage. Der Puffer ist nicht unbegrenzt.
