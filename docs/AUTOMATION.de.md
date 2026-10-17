# REST-API, Webhooks und Automatisierung

[English](AUTOMATION.md) · [Français](AUTOMATION.fr.md) · [Español](AUTOMATION.es.md) · [Deutsch](AUTOMATION.de.md) · [简体中文](AUTOMATION.zh-CN.md)

Alles auf dieser Seite ist optional. Tokens oder Webhooks werden erst erstellt, wenn ein Administrator sie unter **Einstellungen → Automatisierung** anfordert.

## Sicherheitsmodell

- Ein Geheimnis wird nur einmal angezeigt. Dockge Enhanced speichert lediglich seinen SHA-256-Hash.
- Jeder Token begrenzt unabhängig Berechtigungen, erlaubte Stacks und optional seine Gültigkeitsdauer.
- Jeder Webhook gilt für einen Stack und eine feste Aktionsliste. Er kann jederzeit deaktiviert oder rotiert werden.
- API-Tokens sind auf 60 Anfragen pro Minute begrenzt; Webhook-Limits sind von 1 bis 60 konfigurierbar.
- Stack-API-Antworten enthalten weder `compose.yaml` noch `.env` oder Notizen.
- Jede Aktion wird mit Ursprung, Akteur, Dauer und begrenzter Ausgabe im Audit-Protokoll gespeichert.

Bewahren Sie Tokens und Webhook-URLs in einem Geheimnismanager auf. Schützen Sie `/api/*` mit HTTPS und veröffentlichen Sie niemals Geheimnisse in Repositories, Protokollen oder Screenshots.

## REST-API

Tokens unterstützen `Authorization: Bearer <TOKEN>` oder `X-API-Key: <TOKEN>`.

```bash
export DOCKGE_URL="https://dockge.example.com"
export DOCKGE_TOKEN="dge_..."

curl -fsS \
  -H "Authorization: Bearer ${DOCKGE_TOKEN}" \
  "${DOCKGE_URL}/api/v1/stacks"
```

| Methode | Endpunkt | Berechtigung |
| --- | --- | --- |
| `GET` | `/api/v1/stacks` | `stack:read` |
| `GET` | `/api/v1/stacks/:name` | `stack:read` |
| `POST` | `/api/v1/stacks/:name/actions/:action` | `stack:<action>` |
| `GET` | `/api/v1/history?stack=:name&limit=100&offset=0` | `history:read` |

Verfügbare Aktionen: `start`, `stop`, `restart`, `update`, `recreate`, `pull-recreate`, `build-recreate` und `backup`.

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer ${DOCKGE_TOKEN}" \
  "${DOCKGE_URL}/api/v1/stacks/immich/actions/restart"
```

`build-recreate` lehnt Stacks ohne Compose-Direktive `build` ab. `backup` sichert Compose-, `.env`- und Metadatendateien dieses Stacks über die bereits in Dockge Enhanced konfigurierten Ziele.

## Webhooks

Die Oberfläche zeigt nach Erstellung oder Rotation die vollständige URL:

```text
POST https://dockge.example.com/api/webhooks/dwh_<id>_<secret>/<action>
```

Das Geheimnis in der URL authentifiziert den Aufruf; ein zusätzlicher Header ist nicht erforderlich.

```bash
curl -fsS -X POST \
  "https://dockge.example.com/api/webhooks/dwh_1_SECRET/restart"
```

Eine Rotation macht die alte URL sofort ungültig. Deaktivierte, abgelaufene, zu häufig aufgerufene Webhooks oder unzulässige Aktionen liefern den entsprechenden Authentifizierungs-, Ratenlimit- oder Berechtigungsfehler.

## Home Assistant

Beispiel mit einem auf `start`, `stop` und `restart` begrenzten Webhook für den Stack `immich`:

```yaml
rest_command:
  dockge_immich_restart:
    url: !secret dockge_immich_restart_webhook
    method: POST
    timeout: 120
```

In `secrets.yaml`:

```yaml
dockge_immich_restart_webhook: "https://dockge.example.com/api/webhooks/dwh_1_SECRET/restart"
```

Beispielschaltfläche:

```yaml
button:
  - platform: template
    name: Restart Immich
    press:
      - action: rest_command.dockge_immich_restart
```

## Weitere Werkzeuge

- **Build + Recreate** erscheint nur, wenn mindestens ein Dienst eine `build`-Direktive hat. Es führt für diese Dienste `docker compose build --pull` aus, danach `docker compose up -d --remove-orphans`.
- **Stack-Notizen** liegen in `.dockge-meta.json`, sind auf 10.000 Zeichen begrenzt und werden mitgesichert. Speichern Sie darin keine Geheimnisse.
- Der Bereich **Git** wird manuell bedient, ist standardmäßig eingeklappt und nur für lokale Stacks verfügbar. Er verweigert Zugangsdaten in URLs, schließt sensible Dateien aus, erstellt Commits als technische Identität `Dockge Enhanced <dockge-enhanced@localhost>`, erzwingt `pull --ff-only`, verlangt vor einer Wiederherstellung einen sauberen Arbeitsbaum und prüft anschließend Compose.
- **Docker-Netzwerke** unterstützen `bridge`, `macvlan` und `ipvlan`. Lösch- und Verbindungsoperationen erfordern Bestätigung; `bridge`, `host` und `none` sind geschützt. Docker Swarm und `overlay` sind ausdrücklich ausgeschlossen.
- Die Versionsprüfung von Dockge Enhanced bleibt rein informativ: Diese API löst niemals ein automatisches Anwendungsupdate aus.
