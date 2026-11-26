# Secret-Manager pro Stack

[English](stack-secrets.md) · [Français](stack-secrets.fr.md) · Deutsch · [Español](stack-secrets.es.md) · [简体中文](stack-secrets.zh-CN.md)

Verbinden Sie einen Stack mit Bitwarden Secrets Manager, 1Password, Doppler oder Infisical. Secrets werden für Compose-Vorgänge abgerufen, ohne sie in die `.env`-Datei zu kopieren.
Bitwarden-Korrektur: Das temporäre Profil verwendet das vom offiziellen CLI erwartete TOML-Format und ermöglicht wieder das Abrufen von Secrets.

**Bitwarden Secrets Manager ist voll funktionsfähig. 1Password, Doppler und Infisical bleiben experimentell und müssen noch von Benutzern getestet werden.** Ein erfolgreicher Verbindungstest bestätigt den Abruf, nicht die Funktion der Anwendung.

## Einrichtung

1. Unter **Einstellungen → Secret-Manager** die Instanz des Stacks wählen. Eine Verbindung mit einem auf die benötigten Secrets beschränkten Maschinenkonto erstellen.
2. Für Bitwarden die verlinkte Lizenz lesen und **Offizielles Bitwarden-CLI installieren** wählen. Das CLI wird nicht im Image weiterverteilt: Die Installation lädt die offizielle Version 2.1.0, prüft SHA-256 und speichert sie in `data/secret-tools/bws`. Linux AMD64 und ARM64 werden unterstützt. Eine manuelle Installation in `/usr/local/bin/bws` ist ebenfalls möglich. Gemeint ist **Bitwarden Secrets Manager**, nicht der persönliche Passworttresor; Vaultwarden-Kompatibilität wird nicht zugesichert.
3. Im gespeicherten Stack **Secret-Manager** öffnen, die Verbindung wählen und den Bereich eingeben.
4. Speichern und **Gespeicherten Zugriff testen** wählen. Dies startet keine Bereitstellung und zeigt keine Secret-Werte.
5. Variablen in Compose referenzieren, dann bereitstellen oder neu erstellen. Das Speichern allein verändert keine bestehenden Container.

| Anbieter | Verbindung | Bereich im Stack |
| --- | --- | --- |
| Bitwarden Secrets Manager | Maschinenkonto-Token und HTTPS-Adresse; US-/EU-Cloud oder offizieller selbst gehosteter Server | Projekt-ID |
| 1Password | Dienstkonto-Token mit Leserecht für das Environment | Environment-ID |
| Doppler | Diensttoken mit Leserecht | Projekt und Konfiguration; optional bei entsprechend beschränktem Token |
| Infisical | HTTPS-Adresse, Client ID und Client Secret einer Maschinenidentität mit Universal Auth | Projekt, Umgebung und Ordner; nur der ausgewählte Ordner, ohne Imports oder Rekursion |

Pflichtvariablen bevorzugen:

```yaml
services:
  app:
    image: ihr-image
    environment:
      DISCORD_TOKEN: ${DISCORD_TOKEN:?required}
```

Abgerufene Werte haben Vorrang bei der Compose-Interpolation. Literale Werte in `environment:` bleiben explizit und werden nicht automatisch ersetzt. Auch durchgereichte Variablen wie `DISCORD_TOKEN:` sind möglich; nach `compose config` weiterhin unaufgelöste Variablen blockieren Erstellen, Starten, Neustart und Build. Für optionale Variablen einen ausdrücklichen Standard wie `${OPTIONAL_VALUE:-}` verwenden.

## Ausführung und Grenzen

- UI-Aktionen, automatische Vorgänge und Rollbacks nutzen die Verbindung auf der Instanz des Stacks. Auch verknüpfte Instanzen aktualisieren. Ein Rollback liest aktuelle Secrets und stellt keine früheren Secret-Versionen wieder her.
- Anbieterfehler blockieren den Befehl ohne stillen Rückfall auf eine leere Umgebung. Werte werden innerhalb eines Vorgangs im Speicher wiederverwendet; die globale Dockge-Umgebung wird nicht verändert.
- Der Containerstatus wird direkt aus Docker gelesen, ohne Compose-Interpolation oder Anbieterzugriff. Andere Compose-Befehle können den Anbieter benötigen.
- Geschützte Compose-Befehlsausgaben und aufgelöste Konfigurationen werden ausgeblendet. Migration und Replikation dieser Stacks werden abgelehnt, damit keine aufgelösten Secrets übertragen oder Ziele ohne Anbieter bereitgestellt werden.
- Variablennamen, die Docker, Compose oder Node umkonfigurieren können, werden abgelehnt, darunter `PATH`, `DOCKER_*`, `COMPOSE_*`, `NODE_OPTIONS` und `LD_*`. Doppelte Namen, leere Antworten und ungültige Werte ebenfalls. Dynamische Doppler-Secrets werden nicht angefordert.
- Verbindungstoken werden in `data/stack-secrets.json` mit `data/stack-secrets.key` verschlüsselt. Schlüssel erhalten und Datenvolume-Sicherungen schützen: Datei und Schlüssel zusammen ermöglichen die Wiederherstellung der Token. Ein fehlender Schlüssel blockiert den Zugriff und wird nicht automatisch ersetzt.
- Die Integration schreibt abgerufene Werte nicht in Compose-Dateien, `.env` oder deren Verlauf. Bestehende Dateien, Verläufe und Sicherungen werden nicht bereinigt; alte Secrets separat entfernen.
- **Keine Garantie „keine Secrets auf Datenträgern“.** Docker speichert Umgebungsvariablen in der für Docker-Administratoren zugänglichen Containerkonfiguration. Anwendungen können eigene Logs oder Dateien schreiben. Die Integration ersetzt keine als Datei eingebundenen Secrets, wenn die Anwendung diese unterstützt.

## Quellen

[1Password Environments](https://developer.1password.com/docs/sdks/environments/) · [Doppler Service Tokens](https://docs.doppler.com/docs/service-tokens) · [Infisical Universal Auth](https://infisical.com/docs/documentation/platform/identities/universal-auth) · [Bitwarden CLI](https://bitwarden.com/help/secrets-manager-cli/) · [Bitwarden-Lizenz](https://github.com/bitwarden/sdk-sm/blob/bws-v2.1.0/LICENSE)
