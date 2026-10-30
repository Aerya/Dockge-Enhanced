[English](README.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [中文](README.zh-CN.md)

# Dockge-Enhanced auf Unraid — Testversion

Experimentelles Installationspaket, keine zertifizierte Unraid-Unterstützung. Die Anwendung bleibt unverändert. Es wurde kein Eintrag bei Community Applications eingereicht.

## Installation

1. Auf den erfolgreichen Workflow **Image de test Unraid** im Branch `test/unraid` warten. Image: `ghcr.io/aerya/dockge-enhanced:test-unraid`. `latest` bleibt unverändert; zusätzlich wird `test-unraid-<commit>` unveränderlich veröffentlicht.
2. [XML-Vorlage](dockge-enhanced.xml) dieses Branches nach `/boot/config/plugins/dockerMan/templates-user/my-dockge-enhanced-unraid-test.xml` kopieren und unter Docker → Add Container auswählen. Dies ist eine manuelle Vorlage, keine CA-Installation.
3. Alle Mounts prüfen und einen freien Host-Port wählen (Standard 5055). NEUE Daten- und Stack-Verzeichnisse verwenden, keine Produktionsdaten. Vorgabe: `/mnt/user/appdata/dockge-enhanced-unraid-test`.
4. Host-Pfad, Container-Pfad der Stacks und `DOCKGE_STACKS_DIR` müssen identisch sein. Bei einem Pool-Pfad statt `/mnt/user` alle drei gemeinsam ändern. Relative Anwendungs-Bind-Mounts werden auf dem Docker-Host aufgelöst.
5. WebUI öffnen, Administrator und Wegwerf-Stacks anlegen. Enhanced-Self-Update auf manuell lassen und kein internes Update starten. Test-Container über Unraid mit dem Test-Tag aktualisieren.
6. Automatische Image-Updates, Bereinigung, Host-Monitoring und verbundene Instanzen zunächst nicht konfigurieren. Keine Produktionseinstellungen importieren.

Compose ist im Image enthalten; das Unraid-Compose-Plugin wird dafür nicht benötigt. Niemals denselben Stack gleichzeitig durch Compose Manager und Enhanced verwalten lassen.

## Berechtigungen und Isolation

Enhanced läuft derzeit als root im Container und benötigt Schreibzugriff auf Daten/Stacks. `PUID`/`PGID` werden von Enhanced nicht unterstützt und ändern keine Eigentümer. Anwendungen können eigene UID/GID-Einstellungen haben.

Kein pauschales `chmod 777`, rekursives `chown` oder Abschalten des User-Namespace-Remappings. Zuerst Eigentümer, ACLs, Zugriff auf Elternverzeichnisse und konkrete Fehlermeldung prüfen. Container-root ist bei Remapping nicht unbedingt Host-root. Compose erstellen/speichern, Enhanced neu starten und Persistenz von Anmeldung/Datenbank prüfen. Schreibfehler oder schreibgeschütztes SQLite sind fehlgeschlagene Tests, kein Grund für schwächere Sicherheit.

Die Vorlage ist **nicht privilegiert**, der Docker-Socket erlaubt jedoch Kontrolle über **alle Host-Container und Volumes**. Getrennte Ordner isolieren Docker nicht. Einen entbehrlichen Unraid-Testserver bevorzugen; keine globale Bereinigung auf einem Produktionshost. WebUI nicht direkt im Internet veröffentlichen.

## Erforderliche Tests

Unraid-/Docker-Version, Pool/Pfad, Netzwerktreiber und Image-Commit angeben. Vor Host-Tests wichtige Daten unabhängig sichern.

- Installieren; Wegwerf-Stack erstellen, bearbeiten, speichern und bereitstellen; Enhanced neu starten und Persistenz prüfen.
- Inline-Konfigurationsrechte wie `mode: 0777` nach Bearbeitung/Speichern prüfen, einschließlich Datei und tatsächlicher Rechte.
- Host neu starten sowie Array stoppen/starten; Mounts müssen vorher verfügbar sein. Gesunde VPN-Abhängigkeit und `network_mode: service:...` testen. Compose-Reihenfolge gilt für Compose-Operationen, nicht für beliebige Einzelstarts durch den Host. `restart: unless-stopped` garantiert diese Reihenfolge nicht.
- Stop/Start durch Backup-Plugins testen, ohne konkurrierende Stack-Verwaltung.
- Bridge, externe Netze (gegebenenfalls br0), mehrere Netze und Port-Links testen. Eine Netzwerk-ID in inspect bedeutet allein keinen Verbindungsfehler.
- Test-Image über Unraid aktualisieren und Einstellungen/Stacks prüfen. Internes Sidecar-Self-Update ist auf Unraid **nicht validiert**.

Realer Unraid-Neustart, Array, Backup-Plugins und benutzerdefinierte Netze wurden hier nicht geprüft. CI prüft Vorlage, AMD64/ARM64-Builds, striktes Trivy, native Module und HTTP-Start auf Linux-Runnern. Dies ersetzt keine Unraid-Tests.

## Entfernen und melden

Nur die für den Test angelegten Stacks/Container und anschließend den Enhanced-Testcontainer entfernen. Dedizierte Verzeichnisse erst nach Inhaltsprüfung löschen. Kein globales Docker-Prune. Reproduktionsschritte und von Geheimnissen bereinigte Logs unter [Enhanced issues](https://github.com/Aerya/Dockge-Enhanced/issues) melden.

## Quellen

Vorlage nach alex3305 adaptiert. Die verlinkten Berichte sind Testfälle, keine Behauptung, dass Enhanced alle Fehler aufweist oder behebt.

[alex3305/unraid-docker-templates](https://github.com/alex3305/unraid-docker-templates/blob/main/dockge.xml) · [Dockge 238](https://github.com/louislam/dockge/discussions/238) · [911](https://github.com/louislam/dockge/issues/911) · [906](https://github.com/louislam/dockge/issues/906) · [455](https://github.com/louislam/dockge/issues/455) · [290](https://github.com/louislam/dockge/issues/290)
