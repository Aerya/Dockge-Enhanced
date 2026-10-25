# Docker rollout

[English](service-rollout.md) · [Français](service-rollout.fr.md) · [Deutsch](service-rollout.de.md) · [Español](service-rollout.es.md) · [简体中文](service-rollout.zh-CN.md)

## Einrichtung

Nutzen Sie natives Traefik, wenn Docker-Erkennung und Verbindungsabbau bereits passen. Andernfalls im Diensteditor den **internen TCP-Port** eingeben und **Optionales Relay vorbereiten** wählen. Vor Speichern und Bereitstellen den Entwurf prüfen: veröffentlichter Port und Traefik/PlugNPiN-Labels wechseln auf einen separaten Relay-Dienst. Die erste Bereitstellung kann unterbrechen. Ein Proxy-Ziel mit Host-IP und veröffentlichtem Port bleibt erhalten; ein Ziel mit dem Anwendungsdienstnamen muss ausdrücklich auf den Relay-Namen geändert werden.

Das Relay verwendet Nginx stream ohne TLS-Terminierung oder Verwaltungs-API. HTTP, TLS und WebSocket können über TCP laufen; UDP/QUIC wird nicht unterstützt. Keine NPM-, Caddy- oder HAProxy-API-Zugangsdaten erforderlich. Protokollkompatibilität bedeutet keine Zertifizierung jeder Produktversion. Die native Integration unterstützt derzeit Traefik. Das Relay erhält ein persistentes Konfigurationsvolume und ein eigenes Netzwerk/Alias; während der Nutzung nicht löschen. Die Konfiguration zusammen mit der Stack sichern.

## Wiederherstellung und Grenzen

Healthchecks und zusätzliche CPU/RAM-Kapazität sind erforderlich. Feste Containernamen, gemeinsam beschreibbare Volumes und Namespace-Verbraucher bleiben inkompatibel. Der Assistent lehnt mehrdeutige Portvariablen/-bereiche, profiles und extends ab. Vorhandene CPU/RAM-Limits bleiben erhalten. Verbindungen sehen die Relay-IP; Anwendungen mit Bedarf an der ursprünglichen Client-IP benötigen eine separat geprüfte Trusted-Proxy-Konfiguration.

Bei Anwendungsupdates wird das Relay nicht neu erstellt. Neue Verbindungen wechseln nur zu gesunden Ersatzcontainern. Verbindungen über die Wartezeit im Vordergrund hinaus bleiben offen; alte Container werden automatisch entfernt, sobald ihre Worker-Generationen beendet sind. Lange Verbindungen allein schalten neue Anfragen nicht auf die alte Version zurück. Relay-Neustart, Recreate und expliziter Rollback bleiben unterbrechend.

Beide Seiten verknüpfter Instanzen aktualisieren. Eingeschränkte Konten brauchen Update-Rechte für Anwendung **und Relay**. Öffnen des Editors ändert nichts; Vorbereiten ändert nur den Entwurf. Deaktivieren progressiver Updates entfernt weder Relay noch Portmigration. Diese Rückmigration ausdrücklich prüfen. Keine produktive Proxy-Konfiguration wird automatisch verändert.

Rollende Updates ergänzen weder Compose-Override noch temporäres Label; ein unverändertes Deploy behält den Container. Das Journal wird vor Docker-Mutationen atomar gespeichert. Nach Unterbrechung werden nicht festgeschriebene Transaktionen abgebrochen; festgeschriebene Vorgänge setzen nur die Entfernung gespeicherter alter IDs fort. Identität und Gesundheit werden erneut geprüft; bei fehlerhaftem Ersatz kann der Verkehr zur gespeicherten gesunden Vorgängergeneration zurückkehren. Gleichzeitige Stack-Mutationen sind gesperrt, passiver Verbindungsabbau gibt aber die globale Updatesperre frei. Absichtlich entwässerte Replikate lösen keine automatische Reparatur aus. Das Journal gehört in persistente Enhanced-Daten und Backups; nicht zum Entsperren löschen. Geänderte Identitäten oder ungesunde verbleibende Replikate stoppen Löschungen und zeigen eine Warnung. Der Verlauf vermerkt den zum Anwendungszeitpunkt aufgeschobenen Abbau; der Dienst zeigt den aktuellen Zustand. Beim Relay-Start ersetzt die validierte Compose-Startkonfiguration eine ungültige gespeicherte Route; gültige Routen bleiben erhalten.

[Wowu/docker-rollout](https://github.com/Wowu/docker-rollout) · [Dockge #170](https://github.com/louislam/dockge/pull/170) · [Nginx](https://nginx.org/en/docs/control.html)
