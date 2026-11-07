# Anwendungskatalog (BETA)

[English](application-catalog.md) · [Français](application-catalog.fr.md) · [Deutsch](application-catalog.de.md) · [Español](application-catalog.es.md) · [简体中文](application-catalog.zh-CN.md)

## Durchsuchen und auswählen

Alle Quellen sind standardmäßig aktiviert und werden beim Öffnen von Anwendungen schrittweise geladen. Deaktivieren Sie einzelne Quellen unter Quellen verwalten. Kategorien haben eine eigene Suche und eine höhenbegrenzte Liste mit Bildlauf, getrennt von der Anwendungssuche. Die Auswahl wird pro Konto auf dieser Instanz gespeichert.

Gleiche Anwendungsnamen bieten eine Quellenauswahl; Vorlagen sind nicht austauschbar. Websites und Logos werden angezeigt, sofern die Quelle sie bereitstellt. Kataloge ausdrücklich aktualisieren; bestehende Stacks bleiben unverändert.

## Vor der Bereitstellung prüfen

Nur Administratoren haben Zugriff. Der Import erstellt einen editierbaren Compose/.env-Entwurf; Zielinstanz im Editor wählen, prüfen und ausdrücklich bereitstellen. Kein Portainer-Konto und keine Installation erforderlich. Swarm, Windows und nicht unterstützte Portainer-Ausführungsoptionen werden abgelehnt statt ignoriert.

Native Vorlagen von Umbrel, Runtipi, RoqueOS und Yundera können plattformeigene Variablen, Proxy-Dienste, Pfade, Geheimnisse, Netzwerke und Zusatzdateien benötigen. Enhanced führt keine Repository-Hooks aus, installiert keine Plattformdienste und lädt keine Zusatzdateien herunter. Entwürfe müssen angepasst werden; erfolgreicher Import garantiert keinen Betrieb. TrueNAS-Vorlagen benötigen dessen Rendering-System und sind nur einsehbar.

Image-Architektur, Ports, Mounts, Privilegien und Geheimnisse einschließlich Vorgabewerten prüfen. Wichtige Daten vor der Bereitstellung sichern. Kataloganfragen gehen nur an öffentliche GitHub-Endpunkte, mit Größen-/Zeitgrenzen und ohne Weiterleitungen. Logos lädt der Browser ohne Referrer von ihren Anbietern; Links öffnen separat. Metadaten können unvollständig oder in der Originalsprache sein.

## Quellen und Wartung

Jedes Quellrepository pflegt seine Anwendungen und Vorlagen. Enhanced stellt Anzeige-/Importadapter bereit, keine Upstream-Wartung oder Kompatibilitätszertifizierung. Der Katalog ist eine BETA.

- [Lissy93](https://github.com/Lissy93/portainer-templates)
- [Portainer](https://github.com/portainer/templates)
- [Pi-Hosted](https://github.com/pi-hosted/pi-hosted)
- [LinuxServer / Technorabilia](https://github.com/technorabilia/portainer-templates)
- [TrueNAS](https://github.com/truenas/apps)
- [Umbrel](https://github.com/getumbrel/umbrel-apps)
- [Runtipi](https://github.com/runtipi/runtipi-appstore)
- [RoqueOS](https://github.com/roqueribeiro/roqueos-containers-list)
- [Yundera](https://github.com/Yundera/AppStore)

