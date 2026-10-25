# Docker rollout

[English](service-rollout.md) · [Français](service-rollout.fr.md) · [Deutsch](service-rollout.de.md) · [Español](service-rollout.es.md) · [简体中文](service-rollout.zh-CN.md)

## Einrichtung

Nutzen Sie natives Traefik, wenn Docker-Erkennung und Verbindungsabbau bereits passen. Andernfalls im Diensteditor den **internen TCP-Port** eingeben und **Optionales Relay vorbereiten** wählen. Vor Speichern und Bereitstellen den Entwurf prüfen: veröffentlichter Port und Traefik/PlugNPiN-Labels wechseln auf einen separaten Relay-Dienst. Die erste Bereitstellung kann unterbrechen. Ein Proxy-Ziel mit Host-IP und veröffentlichtem Port bleibt erhalten; ein Ziel mit dem Anwendungsdienstnamen muss ausdrücklich auf den Relay-Namen geändert werden.

Das Relay verwendet Nginx stream ohne TLS-Terminierung oder Verwaltungs-API. HTTP, TLS und WebSocket können über TCP laufen; UDP/QUIC wird nicht unterstützt. Keine NPM-, Caddy- oder HAProxy-API-Zugangsdaten erforderlich. Protokollkompatibilität bedeutet keine Zertifizierung jeder Produktversion. Die native Integration unterstützt derzeit Traefik. Das Relay erhält ein persistentes Konfigurationsvolume und ein eigenes Netzwerk/Alias; während der Nutzung nicht löschen. Die Konfiguration zusammen mit der Stack sichern.

## Wiederherstellung und Grenzen

Healthchecks und zusätzliche CPU/RAM-Kapazität sind erforderlich. Feste Containernamen, gemeinsam beschreibbare Volumes und Namespace-Verbraucher bleiben inkompatibel. Der Assistent lehnt mehrdeutige Portvariablen/-bereiche, profiles und extends ab. Vorhandene CPU/RAM-Limits bleiben erhalten. Verbindungen sehen die Relay-IP; Anwendungen mit Bedarf an der ursprünglichen Client-IP benötigen eine separat geprüfte Trusted-Proxy-Konfiguration.

Bei Anwendungsupdates wird das Relay nicht neu erstellt. Neue Verbindungen wechseln erst zu gesunden Ersatzcontainern. Bestehende Verbindungen dürfen auf der alten Generation enden. Nach etwa zwei Minuten führen verbleibende Verbindungen zu einem unvollständigen Vorgang: Container bleiben erhalten und gesunde alte Replikate erhalten nach Möglichkeit wieder den Verkehr. Vor einem neuen Versuch die Replikate prüfen; keine noch genutzten Container löschen. Relay-Neustart, Recreate und Rollback sind nicht unterbrechungsfrei.

Beide Seiten verknüpfter Instanzen aktualisieren. Eingeschränkte Konten brauchen Update-Rechte für Anwendung **und Relay**. Öffnen des Editors ändert nichts; Vorbereiten ändert nur den Entwurf. Deaktivieren progressiver Updates entfernt weder Relay noch Portmigration. Diese Rückmigration ausdrücklich prüfen. Keine produktive Proxy-Konfiguration wird automatisch verändert.

Rollende Updates ergänzen keine Compose-Override-Datei und kein temporäres Label mehr: Ein späteres Deploy ohne Änderungen behält den Container bei. Ist beim Relay-Start die gespeicherte Konfiguration ungültig (etwa nach down/up mit entfernten Containernamen), wird sie durch die geprüfte Bootstrap-Konfiguration aus Compose ersetzt. Eine weiterhin gültige Konfiguration bleibt erhalten. Dies behebt die Neustartschleife durch verschwundene Namen, ist aber noch keine vollständige automatische Wiederherstellung eines unterbrochenen Vorgangs. Gleichzeitige Enhanced-Aktionen im selben Stack-Verzeichnis werden während des Vorgangs abgewiesen; absichtlich aus dem Verkehr genommene alte Replikate lösen währenddessen keine automatische Reparatur aus.

[Wowu/docker-rollout](https://github.com/Wowu/docker-rollout) · [Dockge #170](https://github.com/louislam/dockge/pull/170) · [Nginx](https://nginx.org/en/docs/control.html)
