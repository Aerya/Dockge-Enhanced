# Host-Updates (Beta)

[English](host-management.md) · [Français](host-management.fr.md) · [Deutsch](host-management.de.md) · [Español](host-management.es.md) · [简体中文](host-management.zh-CN.md)

Optional und standardmäßig deaktiviert unter `/watcher/hosts`: Inventar und Update-Erkennung für Debian/Ubuntu und Arch/Garuda, CVE-Analyse für Debian/Ubuntu sowie manuelle oder geplante APT-Updates nach lokaler Installation und Freigabe. Profile: alle erlaubten Updates, nur Sicherheit, vorsichtig, Sicherheit und vorsichtig. Konfigurierbare Benachrichtigungen für Erkennungen und Vorgänge. Schreibgeschützte Berichte und bestehende Föderation. Arch/Garuda bleiben auf Überwachung beschränkt; AUR, RPM/APK/Zypper, Flottenaktionen und vollständige CVE-Abdeckung fehlen weiterhin.

Der Tab Host-Updates bleibt immer sichtbar; nur die Überwachung ist standardmäßig deaktiviert.

Updates bündelt Dockge-Enhanced, Docker-Images und Host-Updates (Beta) in drei sichtbaren Untertabs. Acht Haupttabs bleiben; bestehende URLs und Links zu entfernten Instanzen bleiben gültig.

## Host-Komponenten installieren

Host-Komponenten direkt aus Dockge installieren: klarer Status, Installation/Reparatur und Berechtigungen in der Oberfläche, erstes Inventar startet sofort. Keine Benutzerbefehle oder Compose-Änderungen nötig.

Dockge installiert die Komponenten und startet das erste Inventar. Keine Befehle, Compose-Änderungen oder SSH-Verbindung nötig. Überwachung: Debian/Ubuntu und Arch/Garuda; Updates: Debian/Ubuntu mit fester Version.

Erlaubte UTC-Stunden, durch Kommas getrennt. Erlaubte Pakete für das vorsichtige Profil, durch Kommas getrennt (leer: keine). Diese Auswahl ersetzt die Executor-Rechte auf dem Host. Bestehende Ausschlüsse bleiben erhalten. Planbarer Modus aktiviert keinen Zeitplan; diesen anschließend einrichten.

Ein Administrator bestätigt den Modus in der Oberfläche. Ein temporärer Container mit exakt dem Instanz-Image betritt die System-Namespaces des Hosts und installiert mitgelieferte Dateien, fehlende Python-Abhängigkeiten und systemd-Dienste. Browserseitige Befehle, Pfade oder Images werden nicht angenommen. Der permanente Transport hat weder Systemprivilegien noch Netzwerk, Docker-Socket oder Host-Wurzel-Mount; Berichte sind schreibgeschützt, nur das Anfrageverzeichnis ist beschreibbar. Dockge muss nicht neu erstellt und die Stack-Konfiguration nicht geändert werden. Manuelle Installationen bleiben kompatibel. Rootless Docker, Benutzer-Remapping, Docker Desktop und Hosts ohne systemd werden nicht unterstützt. Ein Hub muss einen passenden Agent wählen. Unterbrochene Einrichtung lässt sich wiederholen; schreibende Paketmanager niemals beenden.

Anfragen gelten zwei Minuten, Simulationen fünf; Pläne werden neu berechnet und Freigaben vor Ausführung verbraucht. Updates bieten keinen Shellzugriff, neue Abhängigkeiten, Entfernungen oder automatischen Neustart. APT-Sperren bleiben aktiv und Konfigurationen erhalten; danach `.dpkg-dist` prüfen. Unterbrochene Transaktionen benötigen lokal `dpkg --audit` und distributionsspezifische Wiederherstellung, kein universelles Rollback. Zeitplan und Timer deaktivieren verhindert neue Arbeit, ohne laufende Schreibvorgänge zu unterbrechen. Ein kompromittierter Enhanced-Administrator kann angebotene Installationen freigeben; Host-Root-Kompromittierung liegt außerhalb dieser Vertrauensgrenze.

## Einschränkungen und Wiederherstellung

Monitor unterstützt Debian/Ubuntu und Arch/Garuda. Pacman nutzt checkupdates oder den Cache mit pacman -Qu; kein pacman -Sy, Teilupgrade oder AUR. APT nutzt vorhandene Metadaten ohne implizite Aktualisierung. Unbekannter Neustartstatus bedeutet nicht, dass kein Neustart nötig ist. Andere Systeme und Provider werden nicht unterstützt. Ein Host pro Instanz. Timer lokal: 6 Stunden; Einlesen jede Minute. Veraltet nach 12 Stunden; Verlauf 90 Tage, konfigurierbar. Fingerabdrücke vermeiden identische Inventarkopien; Anzeige der letzten 100 Einträge. Bereinigte Quellennamen und installierte Kernelpaketversionen werden angezeigt. Offizielle Herkunft wird nur bei eindeutigen öffentlichen Debian/Ubuntu-Spiegeln erkannt; sonst bleiben Treffer unbestimmt. Inventardatum anklicken, um Paketänderungen mit dem vorherigen gespeicherten Inventar zu vergleichen. Erweiterte Flottenfilter fehlen. Ein domänenspezifischer Hash der machine-id verbindet Berichte und Aktionen; die rohe machine-id wird nie übertragen.

CVE-Analyse optional, bei Inventaränderung höchstens stündlich, sonst täglich. Dasselbe Trivy-Image liest synthetische dpkg-/os-release-Metadaten, ohne Host-Root oder Docker-Socket. Nur Datenbankdownload mit Netzwerk; Analyse offline. Datenbanken älter als 72 Stunden werden abgelehnt. Teilabdeckung: Drittanbieter, ESM und unbekannte Meldungen bleiben unbestimmt. Exakte Korrekturversion im Updateinventar gilt als verfügbar; sonst lokale Verfügbarkeit unbekannt. Kein generischer SemVer-Vergleich. Tägliche Neuanalyse, Ergebnisse im Speicher; nach Neustart zunächst unbekannt. Datenbanken werden zur Laufzeit heruntergeladen, nicht weiterverteilt; Trivy-Quellenlizenzen beachten. Arch-CVEs und direkte Herstellerfeeds fehlen.

[Trivy SBOM](https://trivy.dev/docs/latest/target/sbom/) · [Trivy DB sources and licenses](https://github.com/aquasecurity/trivy-db/blob/main/LICENSE)

[PatchMon](https://github.com/PatchMon/PatchMon) — Inspiration für Systeminventar, Überwachung und Update-Orchestrierung.

[PatchBase](https://github.com/patchbase/patchbase) — Inspiration für Paketinventar, Sicherheitsmeldungsabgleich und Schwachstellenerkennung.

## Profile, Zeitpläne und Benachrichtigungen

Kein Update garantiert den Ausschluss von Inkompatibilitäten. **Nur Sicherheit** wählt Versionen aus vertrauenswürdigen offiziellen Debian/Ubuntu-Sicherheitsquellen anhand nativer APT-Vergleiche, unabhängig von Trivy. ESM und Drittanbieterquellen sind ausgeschlossen. **Vorsichtig** benötigt die lokale Freigabeliste `conservativePackages`; essentielle/wichtige Pakete und zentrale kritische Familien (Kernel, Boot, Netzwerk, Treiber, Docker, Datenbanken) sind ausgeschlossen. Eine leere Liste aktualisiert nichts. **Sicherheit und vorsichtig** kombiniert beide Einschränkungen. Zusätzliche oder nicht ausgewählte Abhängigkeiten, Entfernungen und gehaltene Pakete werden verweigert; dadurch kann der gesamte Vorgang blockieren. Auch `all` benötigt eine ausdrückliche Freigabe in `allowedScopes` und ist nicht vorsichtig.

Bei Arch/Garuda und Rolling-Release-Systemen können Abhängigkeiten, Treiber oder Anwendungen brechen und manuelle Eingriffe erfordern. Ankündigungen lesen, sichern und vollständige Updates nach Distributionsanleitung durchführen (z. B. `garuda-update`). Partielle, reine Sicherheits- und automatische Rolling-Release-Updates bietet diese Beta nicht an.

Unter Konfiguration Wochentage, UTC-Zeit und Profil speichern. Der lokale Executor berechnet jeden Plan neu und prüft die Richtlinie erneut. Ein Termin läuft einmal; ab fünf Minuten Verspätung entfällt er, ohne Nachholen oder automatischen Wiederholungsversuch bei Fehlern. Der Zeitplan läuft auch ohne Hub-Verbindung weiter. Vor Abschalten der Überwachung den Zeitplan deaktivieren und speichern. Lokale Freigabe widerrufen oder Timer deaktivieren verhindert neue Vorgänge; laufende APT/dpkg-Schreibvorgänge niemals unterbrechen. Kein automatischer Neustart, Distributionswechsel oder universelles Rollback.

Benachrichtigungen verwenden die unter Benachrichtigungen eingerichteten Discord/Apprise-Kanäle und sind separat standardmäßig aus. Wählbar: Updates, Schwachstellen nach Schweregrad, Korrekturen, Neustartbedarf, alte/fehlende Collector- oder Sicherheitsdaten, Start, Erfolg, Fehler und Zeitplanänderungen. Installationsmeldungen enthalten manuell/automatisch, Profil und Paketanzahl. Erkennungsmeldungen werden dedupliziert und je Typ stündlich begrenzt; Vorgänge haben keine solche Begrenzung. Überwachung und Versand laufen ohne geöffnete Seite. Fehlgeschlagene Sendungen werden innerhalb der Aufbewahrungszeit bei aktiven Benachrichtigungen wiederholt; ein erfolgreicher Kanal gilt als Zustellung. Der Executor hält die letzten 100 Ereignisse für erneute Verbindungen vor; Enhanced speichert sie gemäß Aufbewahrung, standardmäßig 90 Tage. Der Puffer ist nicht unbegrenzt.
