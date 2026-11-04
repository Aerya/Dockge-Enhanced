[English](configuration-tools.md) · [Français](configuration-tools.fr.md) · [Deutsch](configuration-tools.de.md) · [Español](configuration-tools.es.md) · [简体中文](configuration-tools.zh-CN.md)

# Konfigurationswerkzeuge

Stack-Aktionen → **Dateien und Verlauf** zeigt Versionen und die gespeicherte zusammengeführte Compose-Konfiguration. `docker compose config` läuft auf der zuständigen Instanz, mit Overrides und Variablen, aber ohne ungespeicherten Entwurf. Geheimnisse können sichtbar werden: nur für Administratoren und nach Bestätigung.

Vor Speichern oder Git-Pull bleiben 20 unterschiedliche Versionen von Compose, Override und `.env` erhalten; bei externen Stacks die registrierte Dateikette. Anwendungsdaten, indirekt eingebundene Dateien und das gemeinsame `global.env` sind nicht enthalten. Maximal 2 MiB pro Datei. Ein Verlaufsfehler blockiert das Schreiben.

Versionen liegen verschlüsselt unter `stack-file-history/` im Datenverzeichnis. Zusammen mit `stack-file-history.key` sichern. Ohne Schlüssel sind sie nicht lesbar. Die Versionsliste enthält keine Dateiinhalte. Wiederherstellung sichert zuerst aktuelle Dateien und entfernt bei Bedarf ein früher nicht vorhandenes Override. Sie startet keine Container neu. **Prüfen und ausdrücklich bereitstellen.** Eine geänderte Dateiliste oder gleichzeitige Operation blockiert die Wiederherstellung.

Stack- und globale `.env`-Editoren bieten den **Formularmodus**. Werte sind zunächst verborgen und bleiben wörtlich, einschließlich Anführungszeichen. Komplexe oder mehrzeilige Werte im Textmodus bearbeiten.

**Einstellungen → Instanzdiagnose** prüft Docker, Compose, Git, Buildx und Erstellen/Löschen einer temporären Datei in Daten- und Stack-Verzeichnissen. Verbundene Instanzen sind auswählbar. Keine Konfiguration, Bereitstellung oder Bereinigung.

Beide Instanzen aktualisieren. Ältere Agenten melden nach begrenzter Wartezeit Nichtverfügbarkeit. Eingeschränkte Benutzer erhalten keinen Datei-/Diagnosezugriff und können nichts wiederherstellen. Restic/Zerobyte bleiben für Anwendungsdaten nötig.

[ethanpil/dockge-mod](https://github.com/ethanpil/dockge-mod) — Inspiration für Dateiverlauf, zusammengeführtes Compose, `.env`-Formular und Diagnose.
