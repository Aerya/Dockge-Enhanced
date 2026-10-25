# Anmeldung mit OpenID Connect (OIDC)

[English](oidc.md) · [Français](oidc.fr.md) · [Español](oidc.es.md) · [Deutsch](oidc.de.md) · [简体中文](oidc.zh-CN.md)

Dockge-Enhanced kann Benutzer direkt über einen OpenID-Connect-Anbieter wie Pocket ID, Authentik, Keycloak, Authelia oder Google anmelden, ohne vorgeschalteten Reverse Proxy. OIDC funktioniert **zusätzlich** zu lokalen Konten, 2FA und eingeschränkten Konten im Authentifizierungsmodus `local` (Standard). Ist `DOCKGE_AUTH_MODE` auf `disabled` oder `trusted-proxy` gesetzt, wird OIDC ignoriert.

Dockge verwendet den Authorization-Code-Flow mit PKCE (S256), `state` und `nonce`. Das ID-Token wird geprüft (Signatur, Issuer, Audience, Ablauf, Nonce). Nach erfolgreicher Anmeldung öffnet Dockge dieselbe Sitzung wie bei einer Passwortanmeldung; HTTP-APIs, Widerruf, Audit-Log und eingeschränkte Konten verhalten sich genau gleich.

## Einrichtung beim Anbieter

Legen Sie bei Ihrem Anbieter einen OIDC-Client (eine Anwendung) an:

- **Redirect-URI / Callback-URL**: `https://dockge.example.com/api/auth/oidc/callback`
- **Client-Typ**: vertraulich (mit Client-Secret) oder öffentlich (nur PKCE). Beides funktioniert.
- **Scopes**: `openid profile email`. Fügen Sie `groups` hinzu, wenn Sie `DOCKGE_OIDC_ADMIN_GROUPS` verwenden und Ihr Anbieter dies verlangt (Pocket ID, Authentik).

## Konfiguration

| Variable | Standard | Beschreibung |
|---|---|---|
| `DOCKGE_OIDC_ISSUER` | *(keine)* | Issuer-URL. Ist sie gesetzt, wird OIDC aktiviert. Die Erkennung nutzt `<issuer>/.well-known/openid-configuration` |
| `DOCKGE_OIDC_CLIENT_ID` | *(erforderlich)* | Client-ID |
| `DOCKGE_OIDC_CLIENT_SECRET` | *(keine)* | Client-Secret. Für einen öffentlichen Client leer lassen |
| `DOCKGE_OIDC_CLIENT_SECRET_FILE` | *(keine)* | Datei mit dem Secret (empfohlen, hat Vorrang) |
| `DOCKGE_OIDC_REDIRECT_URI` | *(erforderlich)* | Öffentliche Callback-URL, die auf `/api/auth/oidc/callback` endet |
| `DOCKGE_OIDC_SCOPES` | `openid profile email` | Angeforderte Scopes |
| `DOCKGE_OIDC_USERNAME_CLAIM` | `preferred_username` | Claim, der als Dockge-Benutzername dient (`email` ist ebenfalls üblich) |
| `DOCKGE_OIDC_GROUPS_CLAIM` | `groups` | Claim mit den Gruppen des Benutzers |
| `DOCKGE_OIDC_ADMIN_USERS` | *(keine)* | Kommagetrennte Benutzernamen, die Administratoren werden |
| `DOCKGE_OIDC_ADMIN_GROUPS` | *(keine)* | Kommagetrennte Gruppen, deren Mitglieder Administratoren sind (siehe unten) |
| `DOCKGE_OIDC_LINK_EXISTING` | `false` | Erlaubt der ersten OIDC-Anmeldung, ein bestehendes lokales Konto mit demselben Benutzernamen zu verknüpfen |
| `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN` | `false` | Blendet das Formular für Benutzername/Passwort aus und lehnt Passwortanmeldungen ab |
| `DOCKGE_OIDC_BUTTON_LABEL` | „Mit SSO anmelden“ (übersetzt) | Text der Anmeldeschaltfläche |
| `DOCKGE_OIDC_ALLOW_HTTP` | `false` | Erlaubt `http://`-URLs für Issuer und Redirect. **Nur für lokale Tests** |

Dockge startet nicht, wenn die Konfiguration unvollständig ist, etwa ohne Client-ID oder Redirect-URI, oder mit `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN` ohne Issuer. Die Redirect-URI stammt ausschließlich aus der Konfiguration, nie aus Request-Headern. Ist der Anbieter nicht erreichbar, funktioniert die lokale Anmeldung weiter und die SSO-Schaltfläche meldet den Fehler.

### Beispiel: Pocket ID

```yaml
services:
  dockge:
    environment:
      - DOCKGE_OIDC_ISSUER=https://id.example.com
      - DOCKGE_OIDC_CLIENT_ID=0f6c...                     # aus Pocket ID → OIDC Clients
      - DOCKGE_OIDC_CLIENT_SECRET_FILE=/run/secrets/dockge_oidc_secret
      - DOCKGE_OIDC_REDIRECT_URI=https://dockge.example.com/api/auth/oidc/callback
      - DOCKGE_OIDC_SCOPES=openid profile email groups
      - DOCKGE_OIDC_ADMIN_GROUPS=dockge-admins
      - DOCKGE_OIDC_BUTTON_LABEL=Mit Pocket ID anmelden
    secrets:
      - dockge_oidc_secret

secrets:
  dockge_oidc_secret:
    file: ./secrets/dockge_oidc_secret
```

Bei Authentik ist der Issuer der „OpenID Configuration Issuer“ der Anwendung, zum Beispiel `https://auth.example.com/application/o/dockge/`. Bei Keycloak lautet er `https://kc.example.com/realms/<realm>`.

## Konten und Rollen

- Jede OIDC-Identität wird über die stabile Kennung des Anbieters (Issuer + `sub`) an ein Dockge-Konto gebunden. Eine Umbenennung beim Anbieter erzeugt kein neues Konto.
- Bei der ersten Anmeldung wird ein fehlendes Konto als **eingeschränktes Konto ohne Stack-Berechtigungen** angelegt: Es sieht nichts, bis ein Administrator unter **Einstellungen → Sicherheit → Benutzer und Berechtigungen** Zugriff gewährt. Verknüpfte Konten tragen dort ein **SSO**-Abzeichen.
- **Administratoren** ergeben sich aus `DOCKGE_OIDC_ADMIN_USERS` und `DOCKGE_OIDC_ADMIN_GROUPS`:
  - Ist `DOCKGE_OIDC_ADMIN_GROUPS` gesetzt, ist die Gruppenmitgliedschaft bei jeder Anmeldung maßgeblich: Der Beitritt zur Gruppe gewährt Administratorrechte, das Verlassen macht das Konto wieder zu einem eingeschränkten Konto. Das Konto behält seine Stack-Berechtigungen. Offene Sitzungen werden mit der neuen Rolle neu verbunden.
  - Mit nur `DOCKGE_OIDC_ADMIN_USERS` werden die aufgeführten Benutzer befördert, und niemand wird je herabgestuft.
- **Es gibt keine implizite Regel „der erste Benutzer wird Administrator“.** Legen Sie bei einer neuen Installation den ersten Administrator über die Einrichtungsseite oder `DOCKGE_BOOTSTRAP_*` an, oder konfigurieren Sie eine Admin-Zuordnung. Andernfalls wird die erste OIDC-Anmeldung mit einer Erklärung abgelehnt, damit eine Installation mit ausschließlich eingeschränkten Konten Sie nicht aussperrt.
- **Bestehende lokale Konten** werden standardmäßig nicht verknüpft: Ein OIDC-Benutzer, dessen Benutzername einem lokalen Konto entspricht, wird abgelehnt. Setzen Sie `DOCKGE_OIDC_LINK_EXISTING=true`, um sie bei der ersten Anmeldung zu verknüpfen. Ist der Benutzernamen-Claim `email`, erfordert die Verknüpfung zusätzlich `email_verified` = true. So kann ein Benutzer des Anbieters, der Benutzernamen oder E-Mail selbst wählen darf, keinen lokalen Administrator übernehmen.
- Wird ein Konto in Dockge deaktiviert, ist auch seine OIDC-Anmeldung gesperrt.

## 2FA

OIDC-Anmeldungen fragen nicht nach dem lokalen TOTP-Code: Die Mehrfaktor-Authentifizierung ist Aufgabe des Anbieters. Die lokale 2FA gilt weiterhin für Passwortanmeldungen desselben Kontos.

## Lokale Anmeldung deaktivieren

Mit `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN=true` zeigt die Anmeldeseite nur die SSO-Schaltfläche, und der Server lehnt Passwortanmeldungen ab. Bestehende Sitzungen, Föderations-Tokens zwischen Instanzen und die Einrichtungsseite funktionieren weiter.

**Wiederherstellung:** Ist der Anbieter nicht mehr verfügbar, entfernen Sie `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN` und starten den Container neu, um sich mit einem lokalen Administratorkonto anzumelden.

## Noch nicht enthalten

- Zuordnung von Gruppen zu Stack-Berechtigungen (nur die Administratorrolle wird zugeordnet).
- Abmeldung beim Anbieter (RP-initiated logout): **Abmelden** beendet nur die Dockge-Sitzung.
- Konfiguration über die Einstellungsoberfläche: OIDC wird über Umgebungsvariablen konfiguriert.
