# Restic-Backups und Wiederherstellung

[English](restic.md) · [Français](restic.fr.md) · [Español](restic.es.md) · [Deutsch](restic.de.md) · [简体中文](restic.zh-CN.md)

Dockge-Enhanced enthält unter **Backup** eine native [Restic](https://restic.net/)-Engine. Sie ist unabhängig von der optionalen [Zerobyte-Integration](zerobyte.de.md), die eigene Repositories und eine eigene Aufbewahrung verwendet.

## Was gesichert wird

- Die Dateien `compose.yaml`, Override und `.env` jedes einbezogenen Stacks. Ein Stack kann unter **Zu sichernde Stacks und Konsistenz** von allen Backups ausgeschlossen werden.
- Optionale Datenpfade: `/app/data` (Daten von Dockge-Enhanced) und beliebig viele im Enhanced-Container eingebundene Volumes, z. B. `/dockers-data`, ausgewählt unter **Zu sichernde Docker-Volumes**. Größen werden bei Bedarf berechnet.
- Integrierte Ausschlüsse (`*.log`, `__pycache__`, `node_modules`) gelten immer; eigene Glob-Muster werden an `restic --exclude` übergeben.

Sichern Sie das gesamte Verzeichnis `/app/data`, einschließlich `two-factor.key`: Eine Wiederherstellung nur der Datenbank kann TOTP-Geheimnisse ohne diesen Schlüssel nicht entschlüsseln.

## Ziele und Zeitpläne

- Ziele: lokal, SFTP/NAS (SSH-Schlüssel oder Passwort), S3/Backblaze B2 und REST Server. Mehrere Ziele können aktiv sein; jeder Lauf sichert auf alle.
- Binden Sie für ein lokales Ziel ein eigenes Host-Verzeichnis ein, z. B. `../../backup/dockge:/backup`, und verwenden Sie `/backup` als Zielpfad.
- Geplante Backups, **Jetzt sichern** und Backups beim Speichern von Compose sind verfügbar. Snapshots beim Speichern tragen das Tag `on-save`, nutzen eine Wartezeit von 60 Sekunden und überspringen bewusst `restic forget`, sodass viele Speichervorgänge nie ältere tägliche oder wöchentliche Snapshots entfernen.
- Der standardmäßig aktive Überschneidungsschutz verhindert, dass ein manuelles, geplantes oder beim Speichern ausgelöstes Backup startet, während ein anderes Restic-Backup läuft.
- Eine veraltete Restic-Sperre wird vor jedem Backup und jeder Aufbewahrung mit `restic unlock --remove-all` entfernt. Exit-Code 3 (eine Quelldatei konnte nicht gelesen werden) wird als Erfolg mit Warnungen erfasst.

## Konsistenz pro Stack

Jeder einbezogene Stack hat einen eigenen Modus:

- **Live**: keine Unterbrechung.
- **Stoppen und neu starten**: Nur laufende Dienste werden vor dem Snapshot gestoppt und dieselben Dienste anschließend wieder gestartet, auch nach einem Fehler.
- **Anwendungs-Hooks**: Vorher-/Nachher-Befehle laufen mit `docker compose exec` im gewählten Dienst, z. B. ein Datenbank-Dump, ohne Zugriff auf die Host-Shell.

Stacks werden vor der Aufbewahrung und den Wiederherstellungstests wieder gestartet, um Ausfallzeiten kurz zu halten.

## Einstellungen, Aufbewahrung und Wartung

- **Speichern** speichert nur Einstellungen und Aufbewahrung; es startet weder Backup noch Bereinigung.
- **Jetzt sichern** startet ein sofortiges Backup und danach bei Erfolg die normale Aufbewahrung.
- Die Wartungswerkzeuge aktualisieren den Repository- und Snapshot-Status und führen `restic check` auf jedem aktiven Ziel aus.
- Die normale Aufbewahrung (`keepLast`, täglich, wöchentlich, monatlich) läuft nach erfolgreichen geplanten oder manuellen Backups, nicht nach Backups beim Speichern.
- Verpflichtende Snapshots vor geschützten Dockge-Enhanced-Selbst-Updates haben eine eigene Aufbewahrung: Nachdem der neue Snapshot erstellt **und geprüft** wurde, bleiben die zwei neuesten Self-Update-Snapshots dieser Installation erhalten. Ein stabiles Installations-Tag verhindert, dass diese Bereinigung eine andere Instanz im selben Repository betrifft. Schlägt die Bereinigung fehl, bleibt das geprüfte Backup erhalten.
- Die Snapshot-Liste öffnet sich mit **Alle**. Ein Hinweis **Backup überfällig** und eine Benachrichtigung pro Intervall erscheinen, wenn das letzte erfolgreiche Backup älter als das Doppelte des konfigurierten Intervalls ist.

## Initialisierung von Repositories

Beim ersten Backup initialisiert Restic **nur nachweislich fehlende** Repositories. Zugriffs-, Netzwerk- und Passwortfehler blockieren die Initialisierung, statt ein neues Repository anzulegen. Die Oberfläche zeigt den Repository-Status jedes aktiven Ziels.

## Überschneidung von Repository und Quellen

Bewahren Sie lokale Restic-Repositories möglichst außerhalb der zur Sicherung ausgewählten Ordner auf.

- Liegt ein lokales Repository unter einer ausgewählten Quelle, zeigt das Speichern der Einstellungen eine Warnung, und Backups schließen das Repository, seine Reset-Archive und seine anderen Docker-Mount-Pfade automatisch aus. Aufgelöste symbolische Links werden ebenfalls geprüft, deaktivierte lokale Ziele bleiben geschützt.
- Beispielsweise kann `/app/data` ausgewählt bleiben, während ein Repository unter `/app/data/backups` liegt.
- Ein Repository selbst oder einen seiner Unterordner als Backup-Quelle auszuwählen, wird abgelehnt. Pfade werden vor jedem Backup erneut geprüft.
- Diese Prüfung verschiebt oder setzt nie ein Repository zurück. Bestehende Pfade, Passwörter und Aufbewahrungseinstellungen bleiben erhalten.

## Sicheres Zurücksetzen eines Repositories (Local, SFTP, S3 und REST)

Wählen Sie unter **Backup → Wartung und Diagnose** ein aktives Ziel und sehen Sie sich Repository und Anzahl der Snapshots in der Vorschau an.

- Das Zurücksetzen erfordert zwei ausdrückliche Bestätigungen, den exakten Bestätigungssatz und ein kurzlebiges Einmal-Token.
- Ein lokales Repository wird in ein aufbewahrtes Archiv umbenannt, bevor ein neues Repository angelegt wird. Ein entferntes Repository wechselt in ein neues SFTP-Verzeichnis, ein neues S3-Präfix oder eine neue REST-URL; das alte Repository wird nicht gelöscht.
- Das neue aktive Repository enthält keine alten Snapshots. Einträge im aktuellen Verlauf werden nur für dieses Ziel entfernt.
- Das vorherige Repository bleibt zur Wiederherstellung an seinem alten Ort: Dies ist **keine** endgültige Löschung von Backup-Daten.
- Setzen Sie ein Repository, das von anderen Clients genutzt wird, nicht ohne vorherige Abstimmung zurück.

## Wiederherstellung und Prüfung

- Der Snapshot-Browser zeigt Compose-, `.env`- und Volume-Dateien nebeneinander, mit ihrem Status im Vergleich zum vorherigen Snapshot (Neu / Geändert / Unverändert) und zum aktuellen Datenträger (OK / Geändert / Fehlt).
- Textdateien lassen sich vor der Wiederherstellung anzeigen und mit dem Datenträger oder dem vorherigen Snapshot vergleichen.
- Stellen Sie eine beliebige Auswahl von Dateien wieder her, oder einen ganzen Stack mit **Stack wiederherstellen**.
- Nach jedem geplanten Backup liest ein Wiederherstellungstest eine echte Datei aus dem neuen Snapshot und speichert das Ergebnis im Backup-Verlauf. Verwenden Sie **Integrität prüfen** für ein vollständiges `restic check`.
- Geschützte Selbst-Updates und Wiederherstellungsworkflows stützen sich auf diese geprüften Restic-Snapshots.
