<p align="center">
  <img src="https://raw.githubusercontent.com/Aerya/Dockge-Enhanced/main/frontend/public/icon.svg" width="120" alt="Dockge Enhanced logo">
</p>

# Dockge Enhanced

Dockge Enhanced ist ein Fork von [Dockge](https://github.com/louislam/dockge) zur Verwaltung Ihrer Docker-Compose-Umgebungen über eine Weboberfläche auf einem oder mehreren Servern. Es vereint Stack- und Containerverwaltung, globale Suche und Dateizugriff, Migration und Replikation, Backups mit Restic oder Zerobyte, Updates mit Rollback sowie Monitoring, Sicherheitsprüfungen und Automatisierung. Integrationen und Wiederherstellungswerkzeuge unterstützen den täglichen Betrieb Ihrer Dienste.

<p align="center">
  🇩🇪 Deutsch ·
  🇬🇧 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.md">English</a> ·
  🇫🇷 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.fr.md">Français</a> ·
  🇪🇸 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.es-ES.md">Español</a> ·
  🇨🇳 <a href="https://github.com/Aerya/Dockge-Enhanced/blob/main/README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="https://github.com/Aerya/Dockge-Enhanced/actions/workflows/build-publish.yml/badge.svg?branch=main" alt="Build">
  <img src="https://img.shields.io/badge/arch-amd64%20%7C%20arm64-lightgrey" alt="multi-arch">
  <img src="https://img.shields.io/badge/i18n-EN%20%7C%20FR%20%7C%20ES%20%7C%20DE%20%7C%20zh--CN-blue" alt="i18n">
  <img src="https://img.shields.io/badge/based%20on-Dockge-orange?logo=github&logoColor=white" alt="based on Dockge">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT">
</p>

<p align="center">
  <strong>Nutzen Sie Dockge-Enhanced gerne?</strong>
  <a href="https://github.com/Aerya/Dockge-Enhanced"><strong>⭐ Geben Sie dem Projekt einen Stern!</strong></a>
  – dauert zwei Sekunden.
</p>

---

## Funktionen

### Was Dockge Enhanced auszeichnet

| Bereich | Dockge Enhanced fügt hinzu |
| --- | --- |
| **Multi-Server** | Full-Mesh-Föderation zwischen Dockge-Enhanced-Instanzen, Verwaltung von jedem verknüpften Server aus, optionale Rückwärtsverbindungen mit Token pro Knoten, persistente Agent-Tags, Servergruppierung und -auswahl, Remote-Aktualisierungsstatus, transaktionales Kopieren/Migrieren von Stacks, fortsetzbare Übertragungen und geplante Kaltreplikation |
| **Stack-Verwaltung** | Fixierte Stacks, kompakte Status- und Ressourcenindikatoren, einklappbare/größenveränderbare Navigation, flexibler Logs-/Compose-Arbeitsbereich, direkt erreichbare Aktionsleiste mit Symbolen oder Symbolen und Text, erläuterte Stack-/Container-Aktionen, Pausieren/Fortsetzen von Stacks, containerbezogene Zeitplanung, Build + Recreate, Notizen, Git-Tools, Startvoraussetzungen auf dem Host sowie die automatische Neuerstellung von Diensten, die sich ein VPN-/Netzwerk-Namespace teilen |
| **Compose-Bearbeitung** | Editoren für Compose, Override und `.env`, Standardvorlagen für Compose und `.env`, benannte Links, YAML-Reparatur, Healthcheck-Assistent pro Dienst, Prüfungen auf Portkonflikte und Image-Abweichungen sowie optionale `TZ` pro Stack; optionale CPU-/RAM-Limits pro Dienst |
| **Backup & Wiederherstellung** | Restic-Backups an mehrere Ziele, Bind-Mounts und Volumes, Konsistenz pro Stack, selektive Wiederherstellung, Repository-Prüfungen, Snapshot-Verifizierung und Diffs, sicheres Zurücksetzen von Repositories sowie Wiederherstellungsworkflows, die von geschützten Updates verwendet werden. Optionale Zerobyte-Verbindung oder verwaltete Installation, geschützte Anwendungsworkflows und separate Testwiederherstellungen |
| **Updates** | Stack-weite Bulk-Richtlinien unter Beibehaltung von Ausnahmen, zielgerichtete sofortige Image-Prüfungen alle 5 Minuten, Beachtung ignorierter Images vor jeder Änderung, manuelles, sequenzielles Bulk- oder automatisches Container-Update mit Rollback, ein gemeinsames Wartungsfenster, Remote-Update-Badges, globale/imagebezogene Pausensteuerungen sowie geschützte Dockge-Enhanced-Selbst-Updates mit obligatorischem Backup, Integritätsprüfungen und automatischer Wiederherstellung |
| **Migration & Replikation** | Transaktionsbasierte Stack-Übertragungen zwischen Instanzen, Migration von Compose und persistenten Daten, fortsetzbare Jobs, explizite Verschiebe-Finalisierung, geplante Kaltrepliken, Wiederherstellungs-Snapshots und Failover-Workflows |
| **Sicherheit & Authentifizierung** | Eingeschränkte lokale Konten mit Berechtigungen pro Stack und Dienst, optionale TOTP-2FA, native OIDC-Anmeldung, Trusted-Proxy-Authentifizierung, Cloudflare Turnstile, Trivy-Schwachstellen-Scans, CVE-Ausnahmen und geschützte Update-Workflows |
| **Monitoring** | System-, Stack- und Container-Statistiken, optionaler 5-Minuten-CPU/RAM-Verlauf, konfigurierbare Statusleiste, Health-Cards, Erkennung von Crash-Loops, Healthcheck-Auto-Heal, responsive/vollbildfähige Logs sowie optionale Kula-, Dozzle-, PowerWatch- und PowerWatch-Hub-Integrationen |
| **Docker-Ressourcen** | Geschützte, einheitliche Bereinigung für Images, Volumes, Netzwerke und Build-Cache, exakte Aufhol-Zeitplanung, Vorschauen, Ausschlüsse, Verlauf und Schutzmaßnahmen bei destruktiven Aktionen |
| **Suche & Dateien** | Globale Suche über mehrere Instanzen, eingeschränkter Host-Dateimanager, Volume-Browser, stückweise Übertragungen, Textbearbeitung und Dateiprotokolle |
| **Externe Stacks** | Vorhandene Compose-Projekte erkennen und integrieren, Pfade freigeben und tatsächliche Container ohne Datenverschiebung prüfen |
| **Automatisierung & Audit** | Berechtigungsgeschützte REST-API, Webhooks pro Stack, Home-Assistant-Integration, geplante Operationen sowie zentralisierter Verlauf einschließlich Operationsursprung, -status und -dauer |
| **Integrationen** | Zerobyte, PowerWatch und PowerWatch Hub, PlugNPiN sowie dienstspezifische Label-Unterstützung für Nginx Proxy Manager, Pi-hole und AdGuard Home, Dozzle, Kula und Home Assistant |
| **Darstellung** | Tag-/Nachtpaletten, integrierte Themes, Browsereinstellungen und Stack-Aktionen mit Symbolen oder Symbolen und Text |
| **Benachrichtigungen & Zugriff** | Discord- und Apprise-Benachrichtigungen lokalisiert in EN/FR/ES/zh-CN, Multi-Instanz-Erkennung, Remote-Ankündigungen und mobile Apps von Drittanbietern |

## Neueste Aktualisierungen

<details>
<summary>Neueste Änderungen anzeigen</summary>

Die wichtigsten kürzlichen Änderungen sind hier gruppiert, damit Sie schnell sehen können, was sich in Dockge-Enhanced geändert hat.

### 🆕 Oktober 2026

**Updates ohne Dienstunterbrechung :** Enhanced startet und prüft den neuen Container, bevor der Verkehr umgeschaltet und der alte entfernt wird. Standardmäßig deaktiviert; die Anwendung muss zwei vorübergehend gleichzeitig laufende Exemplare vertragen. Zusätzliche CPU/RAM sowie Traefik oder das angebotene TCP-Relay sind nötig. Ersteinrichtung, Neustarts, Recreate und Rollback können den Zugriff unterbrechen. [Einrichtung und Vorsichtsmaßnahmen](docs/service-rollout.de.md) · [Wowu/docker-rollout](https://github.com/Wowu/docker-rollout).

**Native OIDC-Anmeldung:** Anmeldung über einen OpenID-Connect-Anbieter wie Pocket ID, Authentik, Keycloak oder Google, ohne Reverse Proxy und zusätzlich zu lokalen Konten und 2FA. Konfiguriert wird über die Umgebungsvariablen `DOCKGE_OIDC_*` mit dem Authorization-Code-Flow und PKCE. Neue OIDC-Benutzer sind eingeschränkte Konten ohne Zugriff, bis ein Administrator ihn gewährt, außer sie stehen in `DOCKGE_OIDC_ADMIN_USERS` oder gehören zu `DOCKGE_OIDC_ADMIN_GROUPS`; mit Admin-Gruppen folgt die Rolle bei jeder Anmeldung der Gruppenmitgliedschaft. Es gibt keine implizite Regel „erster Benutzer wird Administrator“: Legen Sie bei einer neuen Installation zuerst den Administrator an oder konfigurieren Sie eine Admin-Zuordnung. Bestehende lokale Konten werden nur mit `DOCKGE_OIDC_LINK_EXISTING=true` verknüpft. OIDC-Anmeldungen fragen nicht nach dem lokalen TOTP-Code, und OIDC wird in den Modi `disabled` und `trusted-proxy` ignoriert. Wenn Sie `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN=true` setzen, halten Sie das Wiederherstellungsverfahren bereit. [Anleitung](docs/oidc.de.md).

**Standardname der Compose-Datei :** COMPOSE_FILENAME wählt compose.yaml (Standard), compose.yml, docker-compose.yaml oder docker-compose.yml nur für neue Stacks. Bestehende und übernommene Stacks behalten ihre Dateinamen. Andere Namen und Pfade werden abgelehnt.

**Socket.IO-Standardports :** Browser-Ursprünge mit implizitem HTTP/HTTPS-Port entsprechen nun einem Host-Header mit explizitem :80/:443, auch bei IPv6. Andere Hosts und nicht gleichwertige Ports bleiben gesperrt; Proxy-Header umgehen diese Prüfung nicht.

**CPU-/RAM-Limits pro Dienst :** Optionale CPU-/RAM-Limits pro Dienst im Compose-Editor für Administratoren. Vorhandene Aliase bleiben konsistent; andere Ressourceneinstellungen und eingeschränkte Kontorechte bleiben erhalten. Auf den Entwurf anwenden, dann ausdrücklich speichern und bereitstellen. Inspiriert von Isurupro7 (Dockge #1006). Ein zu niedriges RAM-Limit kann den Container wegen Speichermangels stoppen. Die CPU wird gedrosselt. Das Entfernen eines Limits reserviert keine Ressourcen. Vorhandene Ausdrücke bleiben bis zur Bearbeitung erhalten. Andere Ressourceneinstellungen bleiben unverändert. Overrides, extends oder eingebundene Dateien können weiterhin Limits vorgeben: Prüfen Sie die endgültige Compose-Konfiguration. Ein deutlich sichtbarer RAM-Hinweis muss vor dem Anwenden eines neuen oder geänderten Speicherlimits bestätigt werden.

**Ignorierte Images werden beachtet:** ImageWatcher prüft **Ignorieren** nach der Registry-Prüfung, vor dem Download und erneut unmittelbar vor der Neuerstellung der Container, auch bei bereits ausgewählten geplanten Updates und beim verwalteten Dozzle-Container. Veraltete Kandidaten manueller Stapel werden ebenfalls blockiert. Ein bereits begonnener Download darf abgeschlossen werden, es folgt aber keine Neuerstellung; eine bereits laufende Docker-Neuerstellung wird nicht abgebrochen.

**Eingeschränkte lokale Konten:** Unter **Einstellungen → Sicherheit → Benutzer und Berechtigungen** können eingeschränkte Konten erstellt werden. Für jeden lokalen oder verknüpften Stack sind Status, Protokolle, Starten, Stoppen, Neustarten, Aktualisieren und Neuerstellen einzeln freigebbar. Ohne Auswahl besteht kein Zugriff. Bestehende Konten bleiben Administratoren. Der eigene Arbeitsbereich bietet keinen Zugriff auf Compose/.env, Terminal, Dateien, Löschen, Backups oder Einstellungen. Beide Seiten verknüpfter Instanzen einschließlich Rückwärts-Agents aktualisieren; ältere Agents werden nicht umgangen. Rechte gelten für Instanz und Stack-Namen: bei Wiederverwendung eines Namens prüfen. Entzug trennt Sitzungen, bricht aber laufende Docker-Operationen nicht ab. Protokolle können Geheimnisse enthalten. Lokale Anmeldung mit optionalen Dienstrechten für alle Replikate, auch nach Neuerstellung. Benutzer verwalten Passwort, TOTP und Wiederherstellungscodes selbst; Administratoren können 2FA zurücksetzen oder nur das Konto löschen. Dienstaktionen mit Auswirkungen auf Netzwerk-Namespace-Abhängige werden abgelehnt; delegierte Starts starten keine Abhängigkeiten. Bei Trusted-Proxy-Authentifizierung verwendet jede Proxy-Identität das lokale Konto mit demselben Namen; eine unbekannte Identität wird als eingeschränktes Konto ohne Berechtigungen angelegt, außer dem ersten Benutzer einer neuen Installation und den in `DOCKGE_AUTH_PROXY_ADMIN_USERS` aufgeführten Identitäten. [Technische Details](docs/scoped-users.md).

**Compose-Vorlagen und entfernte Agents:** Benannte HTTP/HTTPS-Links, konfigurierbare .env-Standardvorlage, dauerhafte Agent-Tags und Tag-Filter sowie optionale Rückwärtsverbindungen mit individuellen Tokens und automatischer Anmeldung nach Einrichtung des lokalen Kontos. Rückwärts verbundene Agents gehören zu ihrem Hub; Datenübertragungen zwischen Servern benötigen weiterhin direkte Föderation. Ein vorhandenes lokales Administratorkonto genügt; ein neues Konto ist nicht erforderlich. [Dokumentation](docs/compose-and-reverse-agents.md).

**Port-Links:** Unter Einstellungen → Allgemein Hostname oder IP-Adresse für Container-Port-Links auswählen. Jede verknüpfte Instanz behält ihre eigene Auswahl; der bisherige Standard bleibt erhalten. Der Hostname-Modus bevorzugt den primären Hostnamen, danach die Browser-/Agent-Adresse. Der IP-Modus nutzt eine bekannte IP oder eine explizite erreichbare IPv4/IPv6. Ohne bekannte IP bleibt die Port-Anzeige ohne Link mit erklärendem Tooltip sichtbar. Jede hostende Instanz separat konfigurieren und beide Seiten für diese Föderationseinstellung aktualisieren; ältere Agenten behalten ihr Verhalten. Docker-Portbindungen, DNS und gespeicherte Hostnamen bleiben unverändert.

**TLS-Sicherheit und Sicherheitsupdates:** Zertifikatsspeicher und TLS-Komponenten der Images werden nach dem eMudhra-Vorfall aktualisiert. Die Prüfungen umfassen die betroffenen Ketten, beide No-CT-Fälle und eine gültige HTTPS-Verbindung. Laufende Images bleiben unverändert; ihr Austausch muss nach der Validierung geplant werden. Das Image wechselt außerdem auf Node.js 26.12.1 für die Node.js-Sicherheitsreleases vom Oktober 2026, und `follow-redirects` sowie der mitgelieferte Restic-Build erhalten Sicherheitskorrekturen. [Details zum Vorfall](https://emudhra.we-have-a-problem.com/) · [TLS-Prüfungen](security/emudhra/README.md)

**Compose-Prüfungen und Home Assistant:** Warnungen vor Portkonflikten beim Speichern/Bereitstellen, einschließlich aufgelöster Variablen, Overrides und Bereiche; Vergleich laufender Image-Referenzen mit überprüfbarer YAML-Korrektur. Optionale Home-Assistant-Integration mit Zustandssensoren und berechtigungsgebundenen Start/Stopp/Neustart-Aktionen. [Guide](docs/HOME-ASSISTANT.md).

**Instance / Global:** Startseite: zuerst lokale Statistiken, darunter globale Summen unabhängig von Stack-Filtern. Aufklappbare Übersichtskarten zeigen Werte und direkte Menülinks je Instanz. Offline- oder ältere Instanzen werden als nicht verfügbar angezeigt; deaktivierte Backups werden separat ausgewiesen.

**Dienststatus erkannter Stacks:** Erkannte, aber nicht übernommene Compose-Projekte wie DDEV verursachen keine wiederholten `spawn docker ENOENT`-Fehler mehr, wenn ihr Verzeichnis im Stack-Stamm fehlt. Übernommene externe Stacks verwenden für den Dienststatus ihr registriertes Verzeichnis, ihren Projektnamen und ihre Compose-Dateien.

**Optionale TOTP-Zwei-Faktor-Authentifizierung:** Aktivieren Sie sie unter **Einstellungen → Sicherheit → 2FA-Einstellungen** mit Ihrem aktuellen Passwort, scannen Sie den QR-Code und bestätigen Sie einen Authenticator-Code. Speichern Sie die zehn einmal gültigen Wiederherstellungscodes; sie werden nur einmal angezeigt. Standardmäßig deaktiviert, schützt sie lokale Anmeldungen, nicht Trusted-Proxy-Authentifizierung oder Föderationstoken. Verwenden Sie vor der Aktivierung der 2FA Föderationstoken für verknüpfte Instanzen; Verbindungen nur mit Passwort funktionieren danach nicht mehr.

Sichern Sie das gesamte `/app/data`, einschließlich `two-factor.key`. Eine reine Datenbankwiederherstellung kann das Geheimnis ohne diesen Schlüssel nicht entschlüsseln. Bei Verlust von Authenticator und allen Wiederherstellungscodes kann ein Containeradministrator unter `/app` den Befehl `./node_modules/.bin/tsx ./extra/reset-two-factor.ts --username ACCOUNT --confirm` ausführen und Enhanced neu starten; das Passwort bleibt unverändert.

**CPU/RAM-Verlauf pro Compose-Dienst:** Aktivieren Sie die Aufzeichnung unter **Monitoring** und öffnen Sie **Ressourcenverbrauch** in den Stack-Aktionen. Kompakte Diagramme zeigen die Stack-Summe und einen Verlauf pro Compose-Dienst, einschließlich nicht verwalteter Compose-Projekte. Updates und Neuerstellungen bleiben im selben Verlauf; gleichzeitige Replikate werden vor der Berechnung von Mittelwerten und Maxima je Messung addiert. Vorhandene Messwerte bleiben ohne Zurücksetzen erhalten. Zeiträume: 24 Stunden, 7 Tage, 1 Monat, 1 Jahr oder alle Daten. Die Aufzeichnung ist standardmäßig deaktiviert und misst alle 5 Minuten, auch ohne geöffneten Browser. CPU: 100 % entspricht einem Kern; unter Linux wird rückgewinnbarer Cache vom RAM abgezogen. Messlücken bleiben sichtbar; Spitzen zwischen Messungen können fehlen. Stack-Summen enthalten keine nativen Host-Prozesse oder Container außerhalb von Compose. Die CPU/RAM-Sortierung der Stack-Liste bleibt verfügbar.

**Backups mit Zerobyte:** Unter **Sicherungen → Zerobyte** eine vorhandene Instanz verbinden oder eine eigene Compose-Instanz installieren. Zerobyte ergänzt native Restic-Backups oder übernimmt geplante Backups mit getrennten Repositories. Einrichtungsassistent, geschützte Anwendungs-Stopps und -Neustarts, Speicherprüfungen, separate Testwiederherstellungen und lesende Multi-Server-Übersichten stehen zur Verfügung. Bei nicht verfügbarem Netzwerkspeicher wird das Backup ohne lokalen Ersatzspeicher blockiert. [Einrichtungs- und Wiederherstellungsanleitung](docs/zerobyte.de.md).

**Restic sichert sein eigenes Repository nicht mit:** Liegt ein lokales Repository in einem ausgewählten Backup-Ordner, warnt Enhanced Sie und schließt es automatisch aus. Sie können beispielsweise `/app/data` als Quelle und `/app/data/backups` als Repository beibehalten. Das Repository selbst oder seine Unterordner können nicht als Quelle ausgewählt werden. Bestehende Pfade, Passwörter und Aufbewahrungseinstellungen bleiben erhalten.

**Optionaler Healthcheck-Assistent pro Dienst:** Bei einem bestehenden oder neu erstellten Stack auf **Healthcheck konfigurieren** am jeweiligen Dienst klicken. Der Assistent schlägt anhand der internen Compose-Ports eine lokale HTTP-URL oder einen TCP-Port vor. Ziel und genauen Befehl vor dem Einfügen in YAML prüfen oder ändern; vorhandene Healthchecks werden nie automatisch ersetzt. Der Test läuft im Image, das `/bin/sh` und `curl`/`wget` oder `nc` bereitstellen muss. Den Health-Status nach dem Deployment prüfen; ein offener TCP-Port beweist nicht, dass die Anwendung bereit ist.

Im Compose-Bearbeitungsmodus gibt es außerdem **Healthchecks** in der Aktionsleiste des Stacks. Bei mehreren Diensten den gewünschten Dienst auswählen.

#### Updates und ImageWatcher

**Zeitzone der Zeitpläne und optionale Container-TZ:** Die **Zeitzone der Zeitpläne** lässt sich unter **Einstellungen → Allgemein** wählen. Sie gilt für Stack-Start/Stopp, Image-Updates, Selbstaktualisierungsfenster sowie native Restic- und Sicherheitsprüfungs-Crons dieser Instanz. Ohne ausdrückliche Auswahl bleibt die bestehende Laufzeit-Zeitzone erhalten; gespeicherte Uhrzeiten werden nicht umgeschrieben. Verknüpfte Instanzen und externe Werkzeuge wie Zerobyte behalten eigene Einstellungen. Relative Intervalle, Pausenfristen und Aufbewahrung bleiben unverändert. Sommerzeitwechsel folgen der gewählten Zone: Eine fehlende Ortszeit wird nicht garantiert ausgeführt, eine wiederholte Stunde kann zweimal auftreten. Eine Zeit außerhalb des Übergangs, etwa 04:00, ist vorzuziehen.

Unter den Bearbeitungsaktionen eines Stacks bietet **Container-Zeitzone** eine **standardmäßig deaktivierte** Option, um `TZ` zum Compose-Entwurf und Override hinzuzufügen. Vorhandene oder geerbte Werte, auch mögliche Werte aus `env_file`/`extends`, erfordern eine Bestätigung. YAML prüfen, speichern und Container neu erstellen/bereitstellen. Das Image muss `TZ` unterstützen. `.env`-/`env_file`-Dateien bleiben unverändert; spätere globale Zeitzonenänderungen schreiben Stacks nicht automatisch um und erstellen keine Container neu.

**Benachrichtigungen zu Image-Updates:** Discord und Apprise melden ein ausstehendes Image-Update nur einmal pro Stack, Image und Remote-Digest, auch wenn es auf ein geplantes Zeitfenster wartet. Dieser Verlauf bleibt nach einem Neustart von Enhanced erhalten. Ein neuer Digest wird erneut gemeldet; Ergebnisse automatischer Updates erhalten weiterhin eine eigene Benachrichtigung. Fehlgeschlagene Zustellungen werden bei späteren Prüfungen erneut versucht, getrennt je Discord-Webhook und konfiguriertem Apprise-Ziel.

**Gestoppte Dienste bleiben gestoppt:** Automatische Image-Updates werden verschoben, wenn ein betroffener Compose-Dienst oder ein erforderlicher Netzwerk-Namespace-Begleiter gestoppt ist oder fehlt. ImageWatcher prüft dies nach dem Pull vor der Neuerstellung erneut und versucht das Update bei einer späteren Prüfung nochmals. Ein gestoppter Dienst wird nicht durch `compose up` geweckt.

**Prüfintervalle:** Unter **Watcher > Images** erfasst der vollständige Scan standardmäßig **alle 6 Stunden** alle Images. Images im **Sofort-Modus** werden zusätzlich standardmäßig **alle 5 Minuten** gezielt geprüft. Dieses gezielte Intervall lässt sich in Minuten oder Stunden (5 Minuten bis 24 Stunden) einstellen oder separat deaktivieren; der vollständige Scan bleibt aktiv. Das Auswählen des Sofort-Modus kann weiterhin eine einmalige gezielte Prüfung auslösen.

**Vorbereitung von Host-Binds unter macOS**

Vor dem Start oder der Aktualisierung eines Stacks fordert Enhanced Docker auf, jede Verzeichnis-Bind-Quelle direkt vorzubereiten. Dies funktioniert auch mit Pfaden, die von Docker Desktop unter macOS gemeinsam genutzt werden (wie `/Users/...`), ohne anzunehmen, dass der Helper das macOS-Dateisystem über einen Bind-Mount von `/` sehen kann. Datei-Binds wie `/etc/localtime` werden nicht als Verzeichnisse erstellt. Wenn Docker nicht auf einen Quellpfad zugreifen kann, bricht das Update mit dem tatsächlichen Fehler von Docker ab; prüfen Sie, ob das Verzeichnis für Docker Desktop freigegeben ist.

**Speicherplatz beim Selbst-Update und Aufbewahrung alter Images**

Vor einem Backup oder Pull prüft das Selbst-Update den freien Speicherplatz auf dem Speicherdateisystem des Docker-Daemons. Automatische Updates werden zurückgestellt, wenn die Prüfung fehlschlägt oder der Speicherplatz nicht ausreicht; manuelle Updates brechen mit einer Erklärung ab. Ein verschwundener Updater wird in jeder Phase erkannt, während ein Ziel-Image-Pull, der nach 20 Minuten noch läuft, zur Inspektion markiert wird, ohne vorzugeben, er sei gestoppt worden. Nach einem erfolgreichen Update werden nicht verwendete Enhanced-Images, die per Digest abgerufen wurden, täglich überprüft und können entfernt werden, sobald sie mindestens 48 Stunden alt sind. Aktive, Rollback-, Wiederherstellungs- und explizit ausgeschlossene Images bleiben geschützt; dies aktiviert keine allgemeine automatische Image-Bereinigung.

**Sicherere Koordination zwischen ImageWatcher und Selbst-Update**

Schreibgeschützte Registry- und DNS-Prüfungen verzögern Dockge-Enhanced-Selbst-Updates nicht länger. Image-Updates, Rollbacks und die Bereinigung von Rollback-Tags, die Docker verändern, teilen sich nun eine exklusive Reservierung mit dem Selbst-Update, sodass kollidierende Operationen zurückgestellt statt überlagert werden. Ein geplantes Selbst-Update blockiert Image-Updates nicht unnötig; der persistierte Selbst-Update-Status schützt den abgetrennten Updater nach dem Neustart weiterhin. Das Update-Panel priorisiert ein aktives Selbst-Update gegenüber einer veralteten Verfügbarkeitsprüfung.

**Bulk-Richtlinien für automatische Images eines Stacks**

Eine Stack-Seite unterstützt nun das gleichnamige Anwenden der Richtlinien **Aus**, **Sofort** oder **Geplant** auf alle berechtigten Images auf einmal. Eine Vorschau listet Änderungen auf; Benutzer wählen aus, ob **individuelle Ausnahmen beibehalten** (Standard) oder ersetzt werden sollen. Dienste, die über `dockge.imageupdates.check=false` ausgeschlossen wurden, bleiben geschützt, gemeinsam genutzte Images werden dedupliziert, und verknüpfte Instanzen verwenden dieselbe serverseitige Validierung. Zukünftige Images sind davon nicht automatisch betroffen.

**ImageWatcher: schnellere und zuverlässigere sofortige Updates**

Für Images, die auf **Sofort** eingestellt sind, führt der ImageWatcher eine zielgerichtete Prüfung durch, wenn die Einstellung aktiviert ist, und danach alle **5 Minuten**, ohne die globale Scan-Frequenz zu erhöhen. Wenn sich mehrere Stacks dasselbe `:latest`-Image teilen, prüft Enhanced das **tatsächlich in jedem Container laufende** Image anstelle nur des lokalen Tags: Ein Dienst, der noch eine ältere Version ausführt, wird nicht mehr fälschlicherweise als aktuell markiert. Registry-Anfragen für identische Images werden gemeinsam genutzt, HTTP-429-Ratenbegrenzungen lösen eine Abkühlphase aus, und zielgerichtete Prüfungen werden in den Logs zusammengefasst. Pausen, Wartungsfenster und Rollback-Sicherheitsmaßnahmen gelten weiterhin.

**Dienstspezifischer Status und Ausschluss von Image-Updates**

Der visuelle Compose-Editor kann `dockge.status.ignore: "true"` hinzufügen, sodass ein optionaler Dienst nach der Bereitstellung nicht mehr den Gesamt-Stack-Status verschlechtert, während sein eigener Status sichtbar bleibt. Er kann auch `dockge.imageupdates.check: "false"` hinzufügen, um einen Dienst von ImageWatcher-Prüfungen sowie automatischen oder Batch-Image-Updates auszuschließen. Ein explizites Dienst-Update bleibt verfügbar. Vorhandene Dienst-Labels und die YAML-Label-Syntax bleiben erhalten. Inspiriert von [hamphh/dockge](https://github.com/hamphh/dockge).

**Alle verfügbaren Container-Images aktualisieren**

Die Update-Seite kann erkannte Images nacheinander über den vorhandenen Compose-Update- und Rollback-Pfad aktualisieren. Sie zeigt den Fortschritt an, stoppt beim ersten Fehler und hält das Dockge-Enhanced-Selbst-Update separat.

**ImageWatcher-Diagnose und -Metadaten (#493–#495)**

Die Image-Ansicht kann Fehler zuerst sortieren. Vorübergehend unerreichbare Ziele bleiben erhalten, Manifest-Timeouts verwenden begrenzte Wiederholungsversuche, Registry-/Authentifizierungs-/Digest-Fehler sind klarer, und Stack-Zeitstempel ändern sich erst nach einem bestätigten, angewendeten Update.

**Stack-Update-Steuerelemente und Image-Aktionsschaltflächen (#489–#490)**

Die stack-weite Richtlinie für automatische Updates öffnet sich nun aus der Stack-Aktionsleiste in einem Modal; individuelle Container-Steuerelemente bleiben unverändert. Die Aktionen zum Aktualisieren, Ignorieren, Pausieren und Rollback von Images verwenden kompakte Schaltflächen mit barrierefreien Beschriftungen.

**Optionaler DNS-Fallback für Registry-Prüfungen**

Unter **Watcher > Images > Fallback-DNS** können Sie den anwendungsbezogenen DNS-Fallback aktivieren (standardmäßig deaktiviert), IPv4- oder IPv6-Resolver hinzufügen/bearbeiten/entfernen und A- sowie AAAA-Abfragen samt Antwortzeiten und Diagnosen testen. Das System-DNS wird stets zuerst versucht; der Fallback wird nur bei DNS-Auflösungsfehlern in unterstützten ImageWatcher-HTTP-Registry-/Token-Anfragen verwendet. Die ersten Beispiele sind Quad9 (`9.9.9.9`, `2620:fe::fe`) und Cloudflare (`1.1.1.1`, `2606:4700:4700::1111`) und sind vollständig anpassbar. Vorhandene gespeicherte Einstellungen bleiben erhalten. Es werden keine Host- oder Docker-Engine-DNS-Einstellungen geändert; Docker-Engine-Pulls und Selbst-Updates liegen außerhalb dieses Fallbacks.

**Selbst-Update über Docker Socket Proxy**

Die Self-Update-Prüfung und der Update-Sidecar folgen dem tatsächlich von Enhanced verwendeten Docker-Endpunkt: einem Unix-Socket (einschließlich `DOCKGE_DOCKER_SOCKET`) oder `DOCKER_HOST=tcp://…` hinter einem vertrauenswürdigen Docker Socket Proxy. Im TCP-Modus wird kein Platzhalter-Socket eingebunden; der Sidecar wird an die Docker-Netzwerke der Instanz angebunden, bevor er den signierten Plan verarbeitet. Die vom Proxy benötigten Berechtigungen stehen weiter unten im Abschnitt zum automatischen Update-Workflow.

#### Backups, Bereinigung und Zuverlässigkeit

**Schnellere, Race-Conditions-sichere Bereinigung von Docker-Images**

Die Bulk-Image-Bereinigung scannt nun das Docker-Inventar einmal und revalidiert dann nur das Ziel-Image unmittelbar vor jedem `docker rmi`. Die Ressourcenseite führt keinen riesigen `docker image inspect`-Befehl mehr nur aus, um die Imageliste anzuzeigen; die Image-Inspektion ist in Batches begrenzt und toleriert ein Image, das während einer gleichzeitigen Bereinigung verschwindet, und die Bereinigung abgelaufener Rollbacks verwendet dieselbe Docker-Bereinigungssperre. Bestehende Container-, Rollback-/Wiederherstellungs- und Karenzzeit-Schutzmaßnahmen bleiben bestehen.

**Die Bereinigung verwendet nun die echten Image-Referenzen von Docker**

Die Bereinigung ungenutzter Images geht nicht mehr davon aus, dass das von `docker images` angezeigte `Repository:Tag` eine angehängte, entfernbare Referenz ist. Sie verwendet das untersuchte `RepoTags` und `RepoDigests`, entfernt jede erforderliche Referenz, greift bei Bedarf sicher auf die Image-ID zurück und überprüft, ob das physische Image verschwunden ist. Container-Nutzung, Ausschlüsse, aktiver Enhanced-Modus, Wiederherstellung, Rollback- und Karenzzeit-Schutzmaßnahmen bleiben weiterhin durchgesetzt.

**Bereinigungsberichte entsprechen nun dem beobachteten Zustand von Docker**

Wenn eine Batch-Inspektion kein Image zurückgibt, prüft die Bereinigung diese Image-ID direkt, bevor sie sie als abwesend einstuft. Jede Löschung wird erneut überprüft, und ein abschließendes, leichtgewichtiges Docker-Inventar verifiziert das gemeldete Ergebnis. Die Ressourcen zeigen die Docker-Nutzung nun getrennt vom Bereinigungsstatus an: Ein `unused`-Image kann dennoch ein aktiver Enhanced-Dienst sein, für die Wiederherstellung oder den Rollback geschützt, zu neu oder ausgeschlossen sein. Nicht getaggte Images werden neutral als **Nicht getaggtes Image** bezeichnet, nicht als alte Images. Der Workflow bleibt auf ein initiales Inventar, zielgerichtete Prüfungen und eine finale leichte Verifizierung beschränkt.

**Zuverlässige Bereinigung alter Dockge-Enhanced-`<none>`-Images**

Alte `ghcr.io/aerya/dockge-enhanced:<none>`-Images werden nun aus dem Image-Inventar von Docker ausgewählt, anstatt von `RepoDigests`-Metadaten abzuhängen, die nach dem Neu-Taggen möglicherweise fehlen. Images, die älter als die 48-Stunden-Sicherheitsgrenze für Selbst-Updates sind, können daher zuverlässig bereinigt werden, während das aktive Image und wiederherstellungsgeschützte Images unberührt bleiben. Zusammenfassungen nicht verwendeter Images hören zudem auf, gewöhnliche, von Containern verwendete Images als geschützte Bereinigungskandidaten zu zählen.

**Nicht verwendete `repository:<none>`-Images werden nun tatsächlich bereinigt**

Docker behält möglicherweise einen Image-Repository-Namen bei, während sein Tag zu `<none>` wird. Diese Images fielen zuvor zwischen die Bereinigungspfade für hängende (`<none>:<none>`) und getaggte, nicht verwendete Images, sodass Schaltflächen und die geplante Bereinigung sie unbestimmt zurücklassen konnten. Sie werden nun als nicht verwendete Images anhand ihrer Image-ID behandelt, während Container-Nutzung, Ausschlüsse, Rollback-/Wiederherstellungsschutz und Bereinigungs-Karenzzeiten weiterhin durchgesetzt werden. Alte Dockge-Enhanced-Images behalten ihre zusätzliche 48-Stunden-Sicherheitsgrenze für Selbst-Updates.

**Image-bezogenes Bereinigungsalter für alte Dockge-Enhanced-Builds**

Alte `ghcr.io/aerya/dockge-enhanced:<none>`-Images, die per Digest abgerufen wurden, altern nun unabhängig voneinander. Ein neues erfolgreiches Selbst-Update setzt die 48-Stunden-Bereinigungsuhr nicht mehr für jedes ältere Enhanced-Image zurück: Jedes veraltete Image wird anhand seiner eigenen Erstellungszeit bewertet, während das aktive Image und Wiederherstellungs-Snapshots geschützt bleiben. Wenn die einheitliche Docker-Bereinigung eine längere Karenzzeit verwendet, behält dieser größere Wert weiterhin Vorrang.

**Einheitliche Docker-Bereinigung und exakte Aufhol-Zeitplanung**

Docker-Ressourcen teilen sich ein einziges Image-ID-Inventar zwischen der Image-Seite, der Bereinigungsvorschau und der Bereinigung. Dieselbe Karenzzeit gilt für die manuelle und automatische Bereinigung, mehrere Tags für ein physisches Image zählen nur einmal, und Images, die gleichzeitig verschwunden sind, werden eher als bereits abwesend denn als Bereinigungsfehler behandelt. Images gestoppter Container sowie Rollback-/Wiederherstellungs-Assets bleiben geschützt. Images, Netzwerke, Volumes und Build-Cache können unabhängig voneinander ausgewählt werden, Ergebnisse werden pro Kategorie aufgezeichnet, und fällige Jobs werden alle 15 Minuten mit einem Aufholen nach Standby oder Neustart überprüft. Das Aktivieren der einheitlichen Bereinigung setzt die älteren Image-Zeitpläne aus, ohne sie zu löschen.

**Restic-Einrichtungsfeedback und sicherere Initialisierung (#491)**

Backup-Einstellungen, Sofort-Ausführen- und Wartungsaktionen wurden getrennt; Repository-Status und Aufbewahrungshilfe sind klarer, und die Initialisierung verwendet sicherere Schutzmaßnahmen.

**Englische Backend-Meldungen (#477)**

Restic-Passwortfehler, Bereinigungs-Audit-Zusammenfassungen und automatische Update-Meldungen werden in einer englischen Installation nicht mehr fälschlicherweise auf Französisch angezeigt.

**Healthcheck mit konfiguriertem HTTP-Proxy**

Der integrierte Container-Healthcheck ignoriert Proxy-Variablen und fragt `127.0.0.1` direkt ab, sodass ein konfigurierter oder nicht erreichbarer Proxy Enhanced nicht mehr als „unhealthy“ markiert. Andere Netzwerkzugriffe verwenden weiterhin den konfigurierten Proxy.

#### Monitoring und Integrationen

**Optionales PowerWatch-Strom-Monitoring**

[PowerWatch](https://github.com/Aerya/PowerWatch) kann nun im **External**-Modus verbunden werden, welcher lediglich einen bestehenden lokalen Container oder HTTP(S)-Endpunkt liest und ihn niemals steuert, oder im **Managed**-Modus als echter Compose-Stack bereitgestellt werden. Die verwaltete Installation erkennt die RAPL-, MSR- und NVIDIA-Fähigkeiten des Hosts, aktiviert nur den erforderlichen Zugriff, verwendet niemals `privileged: true` und hält Verlauf und Einstellungen in einem persistenten Volume, wenn sie gestoppt oder deaktiviert wird.

Der aktuelle Gesamtmaschinenstrom, die Konfidenz und ein direkter WebUI-Link erscheinen im Monitoring, in der Systemstatusleiste und in kompakten Zusammenfassungen verknüpfter Instanzen über den bestehenden Föderationskanal. Die Statusleiste und Instanzkarten zeigen nur die Wattzahl neben dem Stromsymbol an; der Tooltip identifiziert PowerWatch und dessen gemessene oder geschätzte Konfidenz. PowerWatch misst oder schätzt den Verbrauch gemäß den verfügbaren Sensoren.

**Optionale Monitoring-Dienste: Kula, Dozzle, PowerWatch und Hub**

Unter **Monitoring** (`/watcher/monitoring`) erscheinen die vier optionalen Drittanbieterdienste in separaten, konsistenten Karten mit kurzen Beschreibungen und Links zu ihren GitHub-Repositories. PowerWatch und sein Hub bieten jeweils unabhängige externe/verwaltete Modi, Installation, Start, Neustart, Stopp und Konnektivitätstests. Der verwaltete Hub verwendet die `powerwatch-hub`-Binärdatei des PowerWatch-Images, standardmäßig `127.0.0.1:3065`, und speichert seine Daten in einem dedizierten persistenten Docker-Volume.

Ein Hub kann ohne einen lokal verwalteten PowerWatch ausgeführt werden. Instanzen, die nur über den `127.0.0.1` eines einzelnen Hosts erreichbar sind, sind **nicht automatisch vom Docker-Container des Hubs aus zugänglich**; konfigurieren Sie einen erreichbaren, geschützten Endpunkt für die Föderation. PowerWatch bietet nun eine optionale native Authentifizierung, **standardmäßig deaktiviert**, mit schreibgeschützten Bearer-API-Tokens. **Enhanced unterstützt nun diese schreibgeschützten Bearer-API-Tokens** zum Abfragen geschützter PowerWatch-Instanzen. Geben Sie das Token unter **Monitoring → PowerWatch → Schreibgeschütztes API-Token** ein. Das gespeicherte Token bleibt maskiert und wird niemals an den Hub weitergeleitet. Der Hub unterstützt separat ein optionales Token für administrative Operationen. Setzen Sie eine ungeschützte Schnittstelle niemals öffentlich aus.

Um einen **bestehenden PowerWatch** zu verbinden, geben Sie die gewohnte **WebUI-Adresse** (zum Beispiel `http://192.168.0.64:3064`) in das PowerWatch-URL-Feld ein: Enhanced fordert automatisch `/api/snapshot` auf demselben Ursprung an. Eine separate WebUI-Adresse ist nur für ungewöhnliche Reverse-Proxy-Setups erforderlich und bleibt in den erweiterten Einstellungen verfügbar. Ein **bestehender Hub** benötigt ebenso nur seine WebUI-Adresse; Enhanced ruft `/api/hub/snapshot` automatisch auf.

**Optionaler Host-CPU/RAM-Verlauf**

Das Monitoring kann unabhängig von Browsersitzungen alle 5 Minuten einen leichtgewichtigen Host-CPU/RAM-Messpunkt aufzeichnen. Das responsive SVG-Diagramm bietet 24-Stunden-, 7-Tage-, monatliche und benutzerdefinierte Bereiche; der ausgewählte Anzeigebereich kann gespeichert und beim nächsten Besuch wiederhergestellt werden. Lange Bereiche werden serverseitig downsampled, und Ausfallzeiten bleiben als Lücken sichtbar. Die Aufzeichnung ist standardmäßig deaktiviert und der Energiesparmodus stoppt sie bei expliziter Aktivierung nicht.

Der optionale CPU/RAM-Verlauf behält seine echten Abtastlücken bei, verwendet jedoch ein kompakteres, von PowerWatch inspiriertes Diagramm mit helleren Gitterlinien und dezent gefüllten Bereichen.

#### Stacks, Benutzeroberfläche und Bedienbarkeit

**Direkt erreichbare Stack-Aktionen**

Alle Stack-Aktionen stehen direkt in der Aktionsleiste zur Verfügung, ohne Untermenüs, in optisch getrennten Gruppen, die je nach verfügbarer Breite umbrechen. Die Modi „nur Symbole“ und „Symbole mit Text“ behalten ihre Tooltips; Befehle, Verfügbarkeitsbedingungen und Bestätigungen bleiben unverändert.

**Deutsche Oberfläche**

Oberfläche und Neuigkeiten sind auf Deutsch verfügbar, mit deutscher README und deutschem Changelog. Discord- und Apprise-Benachrichtigungen fallen bei ausgewähltem Deutsch auf Englisch zurück.

**Container-Zähler auf der Startseite**

Die Startseite zeigt laufende, gestoppte und pausierte Container an, einschließlich erreichbarer verknüpfter Instanzen. Stack- und Container-Zähler folgen dem Instanzfilter der Stack-Liste.

**Sicherere Stack-Starts und sofortige Image-Prüfungen**

Enhanced bereitet fehlende absolute Host-Bind-Verzeichnisse vor Start-, Bereitstellungs- oder Neuerstellungsoperationen vor, wenn der Mount eindeutig verzeichnisähnlich ist. Dies ist besonders nützlich auf NAS-Hosts wie Synology, bei denen Docker eine Bind-Quelle verweigert, die noch nicht existiert. Dateiähnliche Bind-Quellen werden niemals automatisch als Verzeichnisse erstellt. Das bildspezifische **Sofort**-Auto-Update startet nun eine gezielte Image-Prüfung, sobald die Richtlinie gespeichert wird. Erfolgreiche Stack-Neustarts aktualisieren zudem den realen Stack-Status und blenden veraltete Compose-Fortschrittsausgaben aus.

**Sauberere Compose-Volumes und -Logs**

Eingebundene Volumes und tatsächliche Container verwenden kompakte Zeilen anstelle von klickbaren Balken über die volle Breite. Das Log-Panel stapelt seine drei Filter, gruppiert seine Aktionen und platziert die Suche ganz nach unten; Filternamen bleiben für Hilfstechnologien verfügbar. Die Darstellungseinstellungen können Log-Zeitstempel für diesen Browser standardmäßig aktivieren.

**Tag- und Nacht-Farbpaletten**

Die Darstellungseinstellungen bieten nun separate Farbpaletten für den Hell- und Dunkelmodus: vier Tages- und acht Nachtoptionen, einschließlich der Original-Themes. Catppuccin, Nord, Solarized, Dracula, Gruvbox, Tokyo Night und Rosé Pine färben die Seite, die Kopfleiste, die Bereiche und die Steuerelemente neu ein. Die ausgewählten Paletten werden im Browser gespeichert, und „Auto“ folgt weiterhin dem System-Theme.

**Zuverlässige Verbindungen zu verknüpften Instanzen**

Das Hinzufügen oder Ändern einer verknüpften Instanz aktualisiert nun die Browsersitzungen, ohne die Föderations-Sockets zu trennen. Beide Instanzen bleiben nach der Mesh-Synchronisation und nach einem Neustart verbunden.

**Passwort-Manager**

Die Kontoeinrichtung versieht nun die Felder für den Benutzernamen und das neue Passwort mit Beschriftungen für Browser-Passwort-Manager.

**Stack-Steuerung und Compose-Erstellung**

Das Pausieren/Fortsetzen von Stacks friert Container ein, ohne Volumes zu entfernen. Automatische Image-Updates warten, während ein Stack pausiert ist; das Pausieren/Fortsetzen wird während einer Restic-Sicherung oder -Wiederherstellung blockiert, und das Pausieren ist für den eigenen Stack von Enhanced oder Stacks mit Stop/Hook-Backup-Richtlinien nicht verfügbar. Die allgemeinen Einstellungen bieten nun eine validierte Standard-Compose-Vorlage nur für neue Stacks. Die Stack-README.md öffnet sich über eine Aktionstaste statt einer leiste in voller Breite, und Container-Aktionssymbole verfügen über erklärende Tooltips. Der bestehende Schutz für oktale tmpfs-Werte und das Hervorheben von Compose-Variablen bleiben unverändert.

**Klarere Stack-Aktionen**

Stack-Schaltflächen erklären nun, was sie ausführen. Ein Hilfebereich zeigt die tatsächlichen Docker-Compose-Befehle für den ausgewählten Stack an, einschließlich der Projekt- und Compose-Datei-Optionen, mit Links zur Docker-Dokumentation. Die ehemalige Schaltfläche „Stop & Inaktiv“ heißt nun „Stack herunterfahren“: Sie führt nach Bestätigung `docker compose down` aus, wobei Container und Compose-Netzwerke entfernt werden, jedoch keine benannten Volumes, Bind-Mounts, Compose-Dateien oder Images. Anonyme Volumes werden beim nächsten `up` möglicherweise nicht erneut eingebunden.

**Anzeigenamen für Stacks**

Verleihen Sie einem Stack von seiner Stack-Seite aus einen WebUI-Anzeigenamen. Sein technischer Name, das Compose-Projekt, die Sicherungsauswahl und der Wiederherstellungspfad bleiben unverändert; der technische Name bleibt neben dem Alias sichtbar.

**Reale Container-Ansicht**

Jeder Compose-Dienst listet nun seine tatsächlichen Container separat auf, einschließlich Replikate. Öffnen Sie einen davon, um dessen Status, Integrität, Image, Ports, Ressourcennutzung und die letzten Protokolle anzuzeigen, oder starten, stoppen und starten Sie genau diesen Container neu. Dienstweite Aktionen bleiben unverändert. Inspiriert von [Lorwell/dockge](https://github.com/Lorwell/dockge).

**Optionaler Host-Dateimanager**

Eine optional aktivierbare Dateiseite kann ein dediziertes Host-Verzeichnis durchsuchen, kleine UTF-8-Dateien bearbeiten, Dateien übertragen und dateibasierte Protokolle verfolgen, entweder lokal oder über eine verknüpfte Enhanced-Instanz. Sie ist vom Volumen-Browser pro Stack getrennt und kann nicht auf Pfade außerhalb ihres konfigurierten Stammverzeichnisses zugreifen.

Hängen Sie nur das Verzeichnis ein, das Sie freigeben möchten, unter demselben Pfad innerhalb von Enhanced ein und setzen Sie `DOCKGE_FILE_MANAGER_ROOT` auf diesen Container-Pfad. Fügen Sie beispielsweise `- /srv/shared:/managed-files` unter `volumes:` und `DOCKGE_FILE_MANAGER_ROOT: /managed-files` unter `environment:` hinzu. Ohne diese Einstellung bleibt der Manager deaktiviert; **mounten Sie keinesfalls `/` oder ein umfassendes Host-Verzeichnis**. Er verweigert außerdem Operationen, wenn die Authentifizierung deaktiviert ist. Die optionale Variable `DOCKGE_FILE_MANAGER_MAX_FILE_SIZE` begrenzt die Übertragungen (Standard: 100 MiB); die Online-Textbearbeitung ist auf 1 MiB begrenzt. Jede verknüpfte Instanz benötigt ihren eigenen expliziten Mount und eine eigene Einstellung.

**Kopieren und Einfügen in Container-Terminals**

Ein Rechtsklick öffnet nun das native Kopieren/Einfügen-Menü des Terminals. Das Einfügen funktioniert auch mit Tastenkombinationen auf lokalen HTTP-Adressen, ohne Zugriff auf die Browser-Zwischenablage-API zu erfordern.

**README.md für verwaltete Stacks**

Die Stack-Seite kann eine Markdown-Datei namens `README.md` anzeigen und bearbeiten, die neben der zugehörigen Compose-Datei gespeichert ist. Diese Datei unterscheidet sich von der kurzen Stack-Notiz und wird bei einem auf eine andere Dockge-Enhanced-Instanz kopierten oder verschobenen Stack mitgenommen. Externe Stacks werden von dieser Funktion nicht bearbeitet.

### 🆕 September 2026

**Zuverlässige automatische Image-Bereinigung**

Die automatische Bereinigung überspringt nicht mehr das nächste geplante Zeitfenster, wenn ein vorheriger Durchlauf einige Sekunden zu spät beendet wurde. Getaggte Images, auf die von einem Container (einschließlich gestoppter Container) verwiesen wird, sowie Rollback-Images bleiben erhalten. Ältere Dockge-Enhanced-Images, die per Digest heruntergeladen wurden, werden ab der nächsten Bereinigung mindestens 48 Stunden nach einem erfolgreichen Selbstanbieter-Update bereinigungsfähig; das aktive Image und Wiederherstellungs-Images werden behalten. Docker-Fehler der jüngsten Bereinigung werden unter Docker-Ressourcen angezeigt.

**Föderations-Verfügbarkeitswarnungen ohne Spam über Nacht**

Benachrichtigungen zur Verfügbarkeit über einen Schutzschalter (Circuit-Breaker) sind nun an ein kontinuierliches Ausfallereignis geknüpft: Jede verknüpfte Instanz sendet höchstens eine Warnung, während ein Peer offline bleibt, und die Warnung wird erst wieder scharfgeschaltet, nachdem sich dieser Peer online erfolgreich erneut authentifiziert hat. Jede Remote-Instanz kann zudem lokal als **Intermittierende Maschine — bei Nichtverfügbarkeit nicht warnen** markiert werden. Dies ist für Desktops, Laptops und andere Peers gedacht, die routinemäßig ausgeschaltet oder in den Energiesparmodus versetzt werden; automatische Wiederverbindungen, Backoff-Mechanismen und der Schutzschalter bleiben aktiv. Da diese Präferenz lokal gilt, markieren Sie den intermittierenden Peer auf jeder dauerhaft eingeschalteten Dockge-Instanz, von der aus Sie keine Verfügbarkeitswarnungen erhalten möchten.

**Prozessweiter Föderations-Transport**

Die Föderation verwendet nun einen einzigen gemeinsam genutzten ausgehenden Transport pro Dockge-Enhanced-Prozess anstelle eines Verbindungssatzes pro WebUI-Socket. Verknüpfte Instanzen werden aus SQLite geladen und automatisch verbunden, sobald der Server auf Anfragen lauscht. Das Öffnen mehrerer WebUIs multipliziert nun keine Remote-Sockets mehr; das Schließen des letzten Browsers trennt verknüpfte Instanzen nicht mehr, und der Wiederholungsversuch des Schutzschalters wird nach ca. 5 Minuten auch dann fortgesetzt, wenn kein WebUI geöffnet ist. Anmeldeinformationsänderungen, Mesh-Reparaturen und das Entfernen von Peers synchronisieren den gemeinsam genutzten Transport sofort neu.

**Härtung gegen Föderations-Wiederverbindungs-Storms**

Föderierte Sockets verwenden nun einen leichtgewichtigen Authentifizierungspfad und führen den WebUI-Stack/Agenten-Bootstrap nicht mehr aus. Socket.IO-Wiederverbindungen werden explizit mit exponentiellem Backoff, Jitter und einem 5-Minuten-Schutzschalter begrenzt. Übermäßige eingehende Föderations-Handshakes werden vor der Authentifizierung abgelehnt, und gleichzeitige eingehende Föderations-Sockets werden limitiert. Wenn ein Wiederverbindungsschutz auslöst oder eine SQLite/Knex-Konkurrenzsituation erkannt wird, gibt die bestehende Discord-/Apprise-Konfiguration eine ratenbegrenzte Warnung aus, ohne SQLite abzufragen.

**Netzamenspace-sichere zielgerichtete Updates**

Zielgerichtete Image-Updates, Dienst-Neuerstellungen und Image-Rollbacks lösen nun das vollständige Compose-Modell auf, bevor ein Container ersetzt wird. Wenn andere Dienste ihren Netzwerknamespace über `network_mode: service:<service>` oder `network_mode: container:<container_name>` teilen, wird jeder direkte und transitive Verbraucher gemeinsam mit dem Anbieter in einer einzigen zielgerichteten Compose-Operation gewaltsam neu erstellt. Unabhängige Dienste bleiben unangetastet, während VPN-, Gluetun- und Sidecar-Stacks den veralteten Netzwerknamespace eines entfernten Containers nicht mehr behalten.

**Externe Stacks (Beta)**

Enhanced kann bestehende Docker-Compose-Projekte erkennen, diese übernehmen, **ohne deren Compose-, .env- oder Spieldaten zu verschieben**, und sie anschließend über die normale Stack-Benutzeroberfläche verwalten. Falls ein Quellpfad innerhalb von Enhanced noch nicht verfügbar ist, patcht eine geschützte Ein-Klick-Autorisierung das eigene Compose von Enhanced automatisch. Übernommene Stacks behalten ihren Projektnamen ohne ein redundantes Präfix vom Typ `external-` und werden als **Extern** markiert; das Löschen von Quelldateien erfordert eine zusätzliche explizite Bestätigung. Der Scanner ordnet außerdem das Stacks-Verzeichnis von Enhanced dessen host-seitigem Bind-Mount zu, sodass bereits von der Instanz verwaltete Stacks ausgeschlossen werden, selbst wenn Docker-Compose-Labels Host-Pfade enthalten.

Wenn die permanente Quellenlöschung ausgewählt wird, entfernt Enhanced nun den Quellen-Bind-Mount und den Allowlist-Eintrag über den geschützten Helfer aus seinem eigenen Compose, erstellt nur seinen eigenen Container neu und löscht anschließend den Host-Ordner. Dies vermeidet `EBUSY`-Fehler, die dadurch verursacht werden, dass versucht wird, ein Verzeichnis zu entfernen, das immer noch einer der Einhängepunkte (Mounts) von Enhanced ist.

Ein unterstütztes Beispiel ist [Gluetun-Companion](https://github.com/Aerya/Gluetun-Companion): Es kann einen von Enhanced verwalteten Gluetun-Stack über einen per Bind-Mount eingebundenen `/compose`-Pfad neu erstellen. Enhanced löst diese Art von Compose-Pfad-Alias nun wieder zum verwalteten Stack auf und bietet ihn nicht zur externen Übernahme an.

**Anonyme Installationsanzahl**

Um eine ungefähre Anzahl aktiver Dockge-Enhanced-Installationen zu ermitteln, ohne einen separaten Analysedienst zu betreiben, lädt Enhanced höchstens einmal im Monat ein winziges technisches Asset von einem dedizierten GitHub-Release herunter. Der öffentliche `download_count` von GitHub für dieses monatliche Asset ist das einzige für die Zählung verwendete Aggregat.

Für diese Zählung wird keine Installationskennung generiert oder gesendet. Die Anfrage enthält keinen Hostnamen, Instanznamen, Stack, Container, Docker-Image, Konfiguration, Pfad, GitHub-Konto, E-Mail-Adresse, Architektur oder Build-Kennung. Wie bei jedem Download von GitHub-Assets wird die Verbindung selbst von GitHub abgewickelt; Dockge-Enhanced empfängt oder speichert keine IP-Adressen der Installation.

Der bereits gezählte Monat wird ausschließlich im lokalen Datenverzeichnis gespeichert, sodass dieselbe Installation das Asset höchstens einmal pro Monat herunterlädt. Die Zählung ist standardmäßig aktiviert und kann mit `DOCKGE_USAGE_COUNT=false` deaktiviert werden. Das Neuerstellen oder Löschen des Datenverzeichnisses kann dazu führen, dass dieselbe Installation für den aktuellen Monat erneut gezählt wird, weshalb die Zahl absichtlich ein Näherungswert ist.

Der Mechanismus ist vollständig öffentlich: [Code auf Enhanced-Seite](./backend/anonymous-install-count.ts), [GitHub-Workflow zur Erstellung der monatlichen Assets](./.github/workflows/usage-count-asset.yml) und [aggregierte Monatszähler](https://github.com/Aerya/Dockge-Enhanced/releases/tag/usage-count).

Repository-Besitzer können ein Actions-Geheimnis namens `USAGE_COUNT_DISCORD_WEBHOOK` hinzufügen, um jeden Montag eine vorläufige Anzahl und am ersten Tag jedes Monats die endgültige Anzahl für den Vormonat zu erhalten. Der Workflow kann auch manuell ausgeführt werden, um die aktuelle Anzahl sofort zu senden. Der Webhook-Wert bleibt von GitHub verschlüsselt und wird niemals in das Repository eingecheckt.

**Globale instanzenübergreifende Suche V2 (`Ctrl+K`)**

Die globale Palette unterstützt nun **Fuzzy-Matching** für kleinere Tippfehler sowie unterstützte Operatoren wie `type:`, `stack:`, `image:`, `port:`, `instance:` und Betriebsfilter einschließlich `is:update`, `is:stopped`, `is:vulnerable`, `is:critical` und `is:backup-failed`. Operator-Chips werden direkt in der Palette angezeigt, sodass die Syntax nicht auswendig gelernt werden muss. Compose- und `.env`-Ergebnisse öffnen den passenden Stack und scrollen CodeMirror direkt zur übereinstimmenden Zeile. Letzte und angepinnte Suchen werden lokal im Browser gespeichert.

Die Suche nach historischen Konfigurationen in **aktuellen Restic-Snapshots** kann direkt aus der Palette heraus aktiviert werden; sie ist zur Schonung von Remote-Repositories auf 5 aktuelle Snapshots und 80 Compose/.env-Dateien pro Instanz begrenzt. Das Durchsuchen von `.env`-**Werten** ist ebenfalls eine explizite Entscheidung (Opt-In): Werte werden nur für den Abgleich verwendet, niemals zurückgegeben/angezeigt, und solange dieser sensible Modus aktiv ist, wird die Suchanfrage niemals in den letzten oder angepinnten Suchen gespeichert. Verknüpfte Instanzen verwenden das V2-Agentenprotokoll, sofern verfügbar, mit einem V1-Fallback für einfache Suchen auf älteren verknüpften Instanzen.

**Automatischer Selbstanbieter-Updateschutz beim Bearbeiten von Compose/.env**

Wenn eine Compose-, Override- oder `.env`-Datei ungespeicherte Änderungen in der WebUI aufweist, blockiert die besitzende Dockge-Enhanced-Instanz vorübergehend ihr automatisches Selbstupdate — einschließlich Bearbeitungen, die von einer anderen verknüpften WebUI aus geöffnet wurden. Der Editor verwaltet eine kurzlebige Heartbeat-Lease, sodass stale (veraltete) Browsersitzungen automatisch ablaufen. Wenn ein Update bereit wird, während ungespeicherte Arbeit vorliegt, erhält der Benutzer einen Dialog mit den Optionen **Speichern und aktualisieren**, **30 Minuten verschieben**, **1 Stunde verschieben** oder **Weiterarbeiten**. Das Backend überprüft Blocker erneut vor dem Vorbereiten und Starten des Updater-Sidecars, sodass eine während der Sicherung/Verifizierung begonnene Bearbeitung nicht durch den Neustart unterbrochen werden kann.

**Übersicht verknüpfter Instanzen auf der Startseite**

Das bestehende Agenten-Panel auf der Startseite dient nun zusätzlich als kompakte Infrastrukturübersicht. Jede verknüpfte Dockge-Enhanced-Instanz zeigt ihre Stack-Gesamtzahlen und -Status, die Host-CPU/RAM-Auslastung, die Betriebszeit und die Anzahl der angepinnten Stacks an, während die bestehenden Steuerelemente zum Umbenennen, zur Reauthentifizierung, zum Entfernen und zum Hinzufügen von Agenten erhalten bleiben. Das Anklicken einer Instanzzusammenfassung filtert die Stack-Liste auf der linken Seite nach diesem Server; ein erneutes Anklicken stellt die Ansicht aller Server wieder her.

**Stack-bezogene CPU-/RAM-Statistiken über verknüpfte Instanzen hinweg**

Die Option **CPU- / RAM-Statistiken pro Stack anzeigen** gehört nun zu jeder einzelnen Dockge-Enhanced-Instanz. Wenn sie auf einem Server aktiviert ist, sammelt dieser Server seine eigenen Docker-Statistiken und stellt sie über den bestehenden Kanal für verknüpfte Instanzen bereit. Jedes verknüpfte WebUI, das diesen Server anzeigt, zeigt dieselben CPU-/RAM-Plaketten für seine Stacks und Container an. Das Ausblenden des Servers blendet auch seine Statistiken aus; das Deaktivieren der Option auf der besitzenden Instanz stoppt die Erfassung und Bereitstellung für diese Instanz.

**Server-persistierte angepinnte Stacks über verknüpfte Instanzen hinweg**

Angepinnte Stacks gehören nun zu der Dockge-Enhanced-Instanz, die sie hostet, anstatt zum `localStorage` eines einzelnen Browsers. Das Anpinnen eines Stacks auf Garuda, DockerLab oder LincStation speichert diese Präferenz auf dem entsprechenden Server. Jedes verknüpfte WebUI, das diesen Server anzeigt, sieht denselben angepinnten Stack; das Ausblenden dieses Servers blendet seine Pins aus, ohne sie zu löschen. Pins überstehen daher Ab- und Anmeldungen, Browserwechsel und Dockge-Enhanced-Updates. Bestehende browser-lokale Pins werden automatisch migriert, sobald ihre besitzenden Instanzen erreichbar sind.

**Dedizierte Aufbewahrung von Sicherungen für Selbstanbieter-Updates**

Obligatorische Restic-Snapshots, die vor geschützten Dockge-Enhanced-Selbstanbieter-Updates erstellt werden, verwenden nun eine dedizierte Aufbewahrungsrichtlinie. Nachdem der neue Snapshot erstellt **und verifiziert** wurde, behält Dockge-Enhanced die **2 neuesten Selbstanbieter-Update-Snapshots für diese Installation** bei und bereinigt ältere Generationen vor dem Start des Updater-Sidecars. Ein stabiles installationsspezifisches Tag verhindert, dass die Bereinigung eine andere Dockge-Enhanced-Instanz berührt, die sich dasselbe Restic-Repository teilt. Die normale Sicherungsaufbewahrung (`keepLast`, täglich, wöchentlich, monatlich) bleibt unverändert. Schlägt diese dedizierte Bereinigung fehl, wird die verifizierte Sicherung behalten und das Update kann fortgesetzt werden; der Bereinigungsfehler wird protokolliert, und ein späteres Selbstanbieter-Update wird es erneut versuchen.

**Abgleich von Docker-Compose-Projektnamen**

Verwaltete Stacks, deren Verzeichnisname Punkte oder Großbuchstaben enthält, werden nun mit Docker Compose unter Verwendung des tatsächlichen `ConfigFiles`-Pfades abgeglichen, anstatt sich nur auf den bereinigten Projektnamen von Docker zu verlassen. Dies verhindert doppelte „managed/stopped“- und „external/running“-Einträge für denselben Stack.

**Unterstützung für lange Docker-Compose-Port-Syntax**

Container-Karten unterstützen nun sowohl die kurze als auch die lange Compose-Port-Syntax. Definitionen mit `published`, `target`, `protocol`, `mode` oder `host_ip` lösen keinen `split is not a function`-Fehler mehr aus und führen nicht mehr dazu, dass die Container-Karte verschwindet. IPv6-Werte für `host_ip` werden in generierten Links ebenfalls korrekt formatiert.

**Compose-YAML-Reparatur und -Formatierer**

Der Stack-Editor enthält eine Aktion **YAML reparieren / formatieren** für `compose.yaml`. Gültige Dokumente werden auf eine Einrückung mit **2 Leerzeichen** normalisiert. Wenn YAML aufgrund häufiger Compose-Einrückungsfehler ungültig ist, versucht Dockge-Enhanced, Dienstschlüssel und Listen (`services`, Dienstoptionen, `environment`, `ports`, `volumes`, `healthcheck.test` usw.) neu auszurichten, validiert das reparierte Dokument und formatiert es anschließend. Kommentare und führende Nullen bei `tmpfs.mode`-Berechtigungen bleiben erhalten. Kann keine sichere Reparatur erstellt werden, bleibt der Originalinhalt unangetastet und der Fehler wird angezeigt.

**Vom Compose-Editor beibehaltene tmpfs-Berechtigungsmodi**

Der visuelle Compose-Editor bewahrt nun oktale Werte mit führenden Nullen wie `tmpfs.mode: 01777` beim Neugenerieren von YAML auf. Das Bearbeiten eines anderen Feldes überschreibt diesen Berechtigungswert nicht mehr im Hintergrund als `1777`.

**Härtung gegen Pfadtraverse bei Stacks**

An Backend-Operationen übergebene Stack-Namen werden nun validiert, bevor ein Pfad aufgelöst wird, einschließlich Code-Pfaden, die die Dateisystemerkennung absichtlich überspringen. Manipulierte Namen wie `../outside` können nun nicht mehr aus dem Verzeichnis der verwalteten Stacks ausbrechen, um auf die Compose- oder `.env`-Dateien einer anderen Anwendung zuzugreifen.

**Geschützte Dockge-Enhanced-Selbstanbieter-Updates**

Dockge-Enhanced kann sich nun über ein bewusst eingeschränktes Sidecar selbst aktualisieren. Jedes Update erfordert eine Restic-Sicherung und eine Repository-Integritätsprüfung, bevor der laufende Container ersetzt wird. Die neue Version muss anschließend Bereitschaftsprüfungen (Readiness Checks) bestehen, andernfalls wird das vorherige unveränderliche Image automatisch wiederhergestellt.

**Status von Remote-Image-Updates**

Informationen zu Image-Updates werden von jeder verbundenen Dockge-Enhanced-Instanz unabhängig abgerufen, sodass Remote-Stacks ihre eigenen Update-Plaketten anzeigen, ohne Server oder identisch benannte Stacks zu vermischen.

**Klare Build-Identität und Update-Fortschritt**

Die Update-Seite identifiziert installierte und verfügbare Builds nun anhand von OCI-Metadaten, einschließlich Build-Datum, Git-Commit und unveränderlichem Digest. Update-Phasen, Restic-Fortschritt, verstrichene Zeit und verbleibende Schätzungen werden einheitlich angezeigt.

**Remote-Ankündigungen**

Dockge-Enhanced kann eine **rein textbasierte betriebliche Ankündigung anzeigen, die aus diesem GitHub-Repository veröffentlicht wurde**, unabhängig vom Mechanismus für Docker-Image-Updates. Dieser Sicherheitskanal wurde nach dem Selbstanbieter-Update-Vorfall Ende August / Anfang September 2026 hinzugefügt: Wenn ein zukünftiger Build ein schwerwiegendes Problem aufweist, kann eine betroffene installierte Version eine Warnung erhalten, ohne darauf warten zu müssen, dass derselbe Update-Mechanismus funktioniert.

Ankündigungen stammen aus [`remote-announcements.json`](remote-announcements.json). Sie sind optional, verwenden ausschließlich HTTPS, sind schema-validiert, in Größe/Anzahl begrenzt, können nach Anwendungsversion, Git-Revision oder OCI-Build-Datum gezielt eingesetzt werden und **können weder Befehle ausführen noch HTML injizieren oder ein Update auslösen**. Links sind auf das GitHub-Repository von Dockge-Enhanced beschränkt. Wenn GitHub nicht verfügbar ist oder das Dokument ungültig ist, zeigt Dockge-Enhanced einfach keine Ankündigung an.

Das Schließen einer Ankündigung blendet sie nur für die aktuelle Browsersitzung aus. **Nicht mehr anzeigen** speichert deren ID im persistenten Dockge-Enhanced-Datenverzeichnis; die Veröffentlichung einer neuen Ankündigung verwendet eine neue ID.

**Kompatibilität verknüpfter Instanzen**

**Kopieren**, **Verschieben** und **Replizieren** verhandeln ein **Übertragungsprotokoll** unabhängig vom Build-SHA. Unterschiedliche Builds bleiben zulässig, solange ihr Protokoll kompatibel ist. Wenn Protokolle inkompatibel sind, wird keine Übertragung gestartet. Eine ausreichend aktuelle Remote-Instanz kann über den normalen Selbstanbieter-Update-Pfad (Restic-Sicherung, Sidecar, Integritätsprüfung und Rollback) aus dem WebUI heraus aktualisiert werden, und Dockge-Enhanced wartet bis zu **2 Stunden** auf ihre Wiederverbindung, bevor es fortfährt. Eine Instanz, die zu alt ist, um auf den Handshake zu antworten, erfordert ein manuelles Update. Die permanente Replikation wechselt zu **Warten auf Kompatibilität** und versucht es etwa alle 10 Minuten erneut, ohne Daten zu verändern.

**Persistente lokale Instanzidentifikation**

Der in den Dockge Agents konfigurierte **lokale Instanzname** ist dauerhaft im Desktop-/Mobil-Header und im Browser-Tab-Titel (`InstanceName · Dockge-Enhanced`) sichtbar. Wenn kein Name konfiguriert ist, wird der Host (`IP:port` oder die Domain) als Fallback verwendet. Es ist keine zusätzliche Einstellung erforderlich.

**Ungelesenes Release-News-Journal**

Das Release-News-Popup verfolgt nun jeden Release-Eintrag einzeln. Werden mehrere automatische Updates installiert, während das WebUI nicht geöffnet ist, werden **alle angesammelten Änderungen** beim nächsten Besuch angezeigt. Das Öffnen oder Neuladen der Seite markiert nichts als gelesen: angezeigte Einträge werden erst dann als bestätigt gewertet, wenn der Benutzer das Popup explizit schließt. Die Nachverfolgung verwendet Release-IDs und hängt nicht mehr von deren Position in der Liste ab. Der veraltete `releaseNewsSeen`-Marker wird automatisch migriert, ohne den vollständigen Verlauf für bestehende Benutzer erneut abzuspielen.

### August 2026

**Transaktionsbasierte Stack-Migration und -Replikation**

Erstellen Sie neue Replikationsrichtlinien **direkt auf der Quellinstanz**. Eine Richtlinie wird auf der Instanz gespeichert, auf der sie erstellt wurde, und nicht automatisch zwischen verknüpften Instanzen geteilt. Bestehende Richtlinien, die von einer anderen Instanz aus erstellt wurden, bleiben dort verwaltbar. Prüfen und entfernen Sie doppelte alte Richtlinien manuell, bevor Sie eine neue erstellen. Diese Änderung löscht weder Richtlinien noch Replikatdaten.

Beim Anzeigen eines verknüpften Quell-Stacks zeigt Enhanced den Replikationsstatus der Quellinstanz schreibgeschützt und getrennt von älteren Richtlinien der aktuellen Instanz an. Konfigurationsdetails werden nicht an verknüpfte Ansichten übertragen.

Stacks können zusammen mit ihrer Compose-Konfiguration und persistenten Daten zwischen Dockge-Enhanced-Instanzen kopiert oder verschoben werden. Übertragungen können fortgesetzt werden, werden am Ziel validiert und sind durch Rollback-Mechanismen geschützt.

**Host-Voraussetzungen und automatische Wiederherstellung**

Ein Stack kann Host-Mounts oder `systemd`-Dienste erfordern, bevor er startet. Dockge-Enhanced kann diese Abhängigkeiten zudem überwachen und deren Ausfall sowie Wiederherstellung sicher handhaben.

**Responsive Benutzeroberfläche und umfangreicheres Monitoring**

Die Stack-Navigation, der Logs/Compose-Arbeitsbereich, Ressourcenindikatoren, Statuskarten, Themes und die mobile Ansicht wurden umfassend überarbeitet.

➡️ **[Vollständiges Changelog anzeigen](CHANGELOG.de.md)**

</details>

---

## Funktionskatalog

<details>
<summary>Alle Funktionen anzeigen</summary>

### Multi-Server & Föderation
- Full-Mesh-Föderation zwischen Dockge-Enhanced-Instanzen, verwaltbar über jede verknüpfte WebUI
- Optionale Rückwärtsverbindungen für Hosts hinter NAT/CGNAT, mit einem Token pro Knoten, automatischer Anbindung und Widerruf; Rückwärts-Agents gehören zu ihrem Hub ([Anleitung](docs/compose-and-reverse-agents.md))
- Persistente Agent-Tags und Tag-Filter, kombinierbar mit dem Instanzfilter
- Serverauswahl, Gruppierung und stabile Serverfarben in der Stack-Liste
- Übersicht verknüpfter Instanzen auf der Startseite, mit Instance-/Global-Statistiken, Erreichbarkeit und direkten WebUI-Links
- Stack-Status, Image-Update-Badges und CPU/RAM-Statistiken pro Stack von jeder Instanz
- Dedizierte Föderations-Tokens, Reparatur unterbrochener Verbindungen und erhaltene Verbindungen bei Browser-Aktualisierungen
- Prozessweiter Föderationstransport mit begrenzten Wiederverbindungen, Circuit Breaker und einer Verfügbarkeitswarnung pro Ausfall
- Zeitweise ausgeschaltete Maschinen können von Verfügbarkeitswarnungen ausgenommen werden
- Versionsbewusste Aushandlung des Transferprotokolls zwischen unterschiedlichen Dockge-Enhanced-Versionen
- Wahl von Hostname oder IP-Adresse für Container-Port-Links pro Instanz

### Stack-Verwaltung
- Compose-Stacks erstellen, bearbeiten, starten, stoppen, neu starten, aktualisieren, neu erstellen, pausieren/fortsetzen und abbauen
- Direkt erreichbare Stack-Aktionsleiste im Modus „nur Symbole“ oder „Symbole mit Text“, mit erläuterten Compose-Befehlen
- Aktionen pro Dienst und pro Container, einschließlich tatsächlicher Container und Compose-Replikate
- Automatische Neuerstellung direkter und transitiver Dienste, die sich über `service:` oder `container:` ein VPN-/Netzwerk-Namespace teilen
- Build + Recreate für lokal gebaute Images
- Geplantes Starten/Stoppen von Stacks und Containern
- Startvoraussetzungen auf dem Host (Mounts und `systemd`-Dienste), mit optionaler Überwachung und Wiederherstellung
- Serverseitig gespeicherte fixierte Stacks, gemeinsam für verknüpfte WebUIs
- Optionale Anzeigenamen in der WebUI, ohne Compose-Projekt oder Restic-Identität zu ändern
- Notizen pro Stack, Markdown-`README.md` und Git-Tools
- Sortierung nach Name, Status, Instanz, Erstellungsdatum, letzter Aktualisierung, CPU oder RAM
- Einklappbare, größenveränderbare Stack-Seitenleiste mit kompakten Status-, CPU- und RAM-Anzeigen sowie flexibler Logs-/Compose-Arbeitsbereich
- Abgleich von Compose-Projektnamen, damit Verzeichnisnamen mit Punkten oder Großbuchstaben keine doppelten Stacks erzeugen
- Erkennung und Übernahme externer Compose-Stacks ohne Verschieben von Dateien oder Daten, mit geschützter Pfadfreigabe
- Optionales vollständiges Entfernen übernommener externer Stacks und labelbasierte Bereinigung defekter externer Stacks, mit verstärkten Bestätigungen
- Option pro Dienst, einen optionalen Dienst beim Gesamtstatus des Stacks zu ignorieren

### Compose-Bearbeitung

- **Standardname der Compose-Datei** — COMPOSE_FILENAME wählt compose.yaml (Standard), compose.yml, docker-compose.yaml oder docker-compose.yml nur für neue Stacks. Bestehende und übernommene Stacks behalten ihre Dateinamen. Andere Namen und Pfade werden abgelehnt.
- optionale CPU-/RAM-Limits pro Dienst — Ändert nur den Entwurf. Speichern Sie und führen Sie anschließend ausdrücklich eine Bereitstellung/Neuerstellung aus. Laufende Container werden hier nicht verändert.
- Editoren für Compose, `compose.override.yaml` und `.env` mit Variablenhervorhebung, Faltung, Suche und Vollbildmodus
- Geprüfte Standardvorlagen für Compose und `.env`, nur für neue Stacks
- Benannte HTTP/HTTPS-Links für Stacks
- Aktion „YAML reparieren / formatieren“, Erhalt von Werten in Anführungszeichen und oktalen `tmpfs`-Modi
- Unterstützung der langen Port-Syntax
- Optionaler Healthcheck-Assistent pro Dienst mit bearbeitbarem HTTP/TCP-Vorschlag und Befehlsvorschau
- Hinweisende Prüfungen auf Portkonflikte und Abweichungen vom laufenden Image vor dem Speichern oder Bereitstellen
- Optionale `TZ` pro Stack, erst nach Prüfung und Bestätigung angewendet
- PlugNPiN-Label-Assistent für Nginx Proxy Manager, Pi-hole und AdGuard Home

### Migration & Replikation
- Stacks mit ihrer Compose-Konfiguration zwischen Instanzen kopieren oder verschieben
- Übertragung von Bind-Mounts und benannten Volumes mit bearbeitbaren Quelle → Ziel-Zuordnungen
- Direkte fortsetzbare HTTP-Übertragungen, gemeinsame Restic-Repositories oder explizite SSH/rsync-Profile
- SHA-256-Prüfung, transaktionale Bereitstellung und Rollback
- Optionale Übertragung lokaler Docker-Images und verschlüsselter Zugangsdaten privater Registries
- Erkennung von `container_name`-Konflikten und Anzeige der tatsächlichen Bereitstellungsfehler
- Explizites Abschließen einer Verschiebung oder Rückkehr zur Quelle
- Geplante Kaltreplikate, auf der Quellinstanz konfiguriert, mit aufbewahrten Snapshots und manuellem Failover
- Isolierte Disaster-Recovery-Tests und Anwendungsprofile für PostgreSQL, MariaDB/MySQL, Redis und SQLite

### Backup & Wiederherstellung
- Native Restic-Backups von Compose, `.env`, Bind-Mounts, benannten Volumes und `/app/data`
- Mehrere Ziele: lokal, SFTP/NAS, S3/Backblaze B2 und REST Server
- Geplante Backups, **Jetzt sichern** und Backups beim Speichern von Compose, mit Schutz vor gleichzeitigen Läufen
- Konsistenz pro Stack: live, stoppen und neu starten oder Anwendungs-Hooks
- Ausschluss von Stacks, integrierte und eigene Ausschlussmuster sowie automatischer Ausschluss verschachtelter lokaler Repositories
- Initialisierung nur fehlender Repositories; Zugriffs-, Netzwerk- und Passwortfehler blockieren die Initialisierung
- Normale Aufbewahrung und eigene Aufbewahrung für Self-Update-Backups
- Sicheres Zurücksetzen von Local-, SFTP-, S3- und REST-Repositories, wobei das alte Repository zur Wiederherstellung erhalten bleibt
- Snapshot-Browser mit Vorschau und Diffs, selektive Wiederherstellung und Wiederherstellung pro Stack
- Wiederherstellungstests nach geplanten Backups, `restic check`, Backup-Verlauf und Warnungen bei überfälligen Backups
- Optionales Zerobyte: Verbindung zu einer bestehenden Instanz oder dedizierte verwaltete Compose-Installation, ergänzend zu Restic oder für geplante Backups, mit getrennten Repositories
- Geführte Erstellung von Zerobyte-Quellen, -Repositories und -Jobs; neue Jobs bleiben bis zur Prüfung deaktiviert, bestehende Jobs können nach Bestätigung migriert werden
- Geschützte Zerobyte-Stopp-/Neustart-Workflows, Integritätsprüfungen, persistentes Wiederherstellungsjournal und gezielte manuelle Wiederherstellung
- Prüfungen des Zerobyte-Netzwerkspeichers ohne lokalen Fallback, dedizierte Testwiederherstellungen und schreibgeschützter föderierter Status
- Anleitungen: [Restic-Backups und Wiederherstellung](docs/restic.de.md) · [Zerobyte-Einrichtung und -Wiederherstellung](docs/zerobyte.de.md)

### Updates & ImageWatcher

- **Updates ohne Dienstunterbrechung** — `dockge.rollout.enabled: "true"`. Prüfen Sie diese Kompatibilität vor dem Aktivieren. Die Anzahl der Anwendungscontainer verdoppelt sich vorübergehend: ausreichend CPU/RAM einplanen. Feste Containernamen und gemeinsam beschreibbare Volumes werden abgelehnt. Das Relay ergänzt einen Container und ein Konfigurationsvolume. Bei der Erstinstallation wird der Zugangsport verschoben; dabei kann es zu einer Unterbrechung kommen. Danach Aktualisieren verwenden; Recreate, Neustarts und Rollback garantieren keine offenen Verbindungen. Nur TCP, kein UDP/QUIC; keine allgemeine Garantie für unterbrechungsfreien Betrieb. [Einrichtung](docs/service-rollout.de.md).
- Erkennung von Image-Updates per Digest, ohne Pull, auch auf entfernten Instanzen
- Richtlinien Aus, Sofort und Geplant pro Image sowie stackweite Sammelrichtlinien, die einzelne Ausnahmen standardmäßig beibehalten
- Vollständiger Scan standardmäßig alle 6 Stunden und gezielte Sofort-Prüfungen standardmäßig alle 5 Minuten, getrennt konfigurierbar oder abschaltbar
- Prüfung der tatsächlich von jedem Container verwendeten Images, gemeinsame Registry-Anfragen und Wiederholungen bei HTTP 429/503
- Optionaler DNS-Fallback für Registry-Prüfungen, ohne DNS von Host oder Docker Engine zu ändern
- **Ignorieren** und `dockge.imageupdates.check: "false"` werden vor jedem Pull oder jeder Neuerstellung beachtet, auch für das verwaltete Dozzle
- Manuelle, automatische und sequenzielle „Alle aktualisieren“-Image-Updates mit Rollback auf das vorherige Image
- Gestoppte und pausierte Stacks werden von automatischen Updates nicht geweckt
- Globale und imagebezogene Pause, übersprungene Versionen und Verlauf automatischer Updates
- Eine Benachrichtigung über ausstehende Updates pro Stack, Image, Digest und Ziel
- Globales Wartungsfenster: Wird es für automatische Dockge-Enhanced-Updates verwendet, gilt es auch für automatische Image-Updates, andernfalls gelten die imagebezogenen Zeitpläne; **Jetzt aktualisieren** bleibt sofort wirksam
- Geschütztes Dockge-Enhanced-Selbst-Update mit obligatorischem Restic-Backup, Integritätsprüfung, Bereitschaftsprüfung und automatischer Wiederherstellung
- Selbst-Update über einen Unix-Socket oder einen vertrauenswürdigen Docker Socket Proxy, mit Speicherplatzprüfung und Schutz bei ungespeicherten Compose- oder `.env`-Änderungen
- Persistente 8-stufige Self-Update-Zeitleiste mit Live-Hostlast
- Zuverlässige Erkennung des eigenen Containers bei benutzerdefinierten Compose-`hostname:`-Werten und sichtbarer eingeschränkter Zustand, wenn die Prüfung nicht möglich ist

### Sicherheit & Authentifizierung
- Lokale Konten mit optionaler TOTP-2FA, verschlüsselten Geheimnissen, Einmal-Wiederherstellungscodes und Sitzungswiderruf
- Eingeschränkte lokale Konten mit Berechtigungen pro Instanz, Stack und Dienst sowie eigenem Arbeitsbereich ([Anleitung](docs/scoped-users.md)); vor einem Downgrade auf eine ältere Enhanced-Version deaktivieren
- Trusted-Proxy-Authentifizierung aus ausdrücklich vertrauenswürdigen Netzwerken, Proxy-Identitäten werden lokalen Konten zugeordnet
- Native OIDC-Anmeldung (Pocket ID, Authentik, Keycloak…) mit PKCE, standardmäßig eingeschränkten Konten und optionaler Admin-Zuordnung nach Benutzer oder Gruppe ([Anleitung](docs/oidc.de.md))
- Nicht interaktive Erstellung des ersten Administrators aus einer Secret-Datei
- Anmeldeschutz mit Cloudflare Turnstile
- Trivy-Schwachstellenscans mit CVE-Ausnahmen
- Zentrale Prüfung von Stack-Namen gegen Pfad-Traversal
- Eingeschränkter Self-Update-Sidecar mit signiertem Update-Plan
- Verschlüsselte Übertragung von Zugangsdaten privater Registries
- Schutzmaßnahmen und Bestätigungen bei destruktiven Operationen
- Prüfung der TLS-Zertifikatsspeicher nach dem eMudhra-Vorfall ([TLS-Prüfungen](security/emudhra/README.md))

### Monitoring
- CPU-, RAM- und Datenträgerstatistiken für System, Stacks und Container, mit konfigurierbarer Statusleiste
- Host-Systemdetails, Temperaturen und überwachte Partitionen
- Optionaler 5-Minuten-CPU/RAM-Verlauf für den Host und pro Compose-Dienst, mit sichtbaren Lücken
- Health-Cards im Dashboard, Crash-Loop-Erkennung und Healthcheck-Auto-Heal
- Responsive Live- und Vollbild-Logs mit Dienstfilter, Suche, Zeitbereichen, **seit dem letzten Neustart**, Kopieren der letzten 50 / 100 / 150 oder aller geladenen Zeilen, pausierbarem Autoscroll, Umgang mit langen Zeilen und optionalen Standard-Zeitstempeln
- Energiesparmodus für NAS und kleine Hosts
- Optionale Integrationen für Kula, Dozzle, PowerWatch und PowerWatch Hub, mit aktueller PowerWatch-Leistung auf verknüpften Instanzen

### Docker-Ressourcen
- Images, Volumes, Netzwerke und nicht verwaltete Container, mit Suche
- Verwaltung von `bridge`-, `macvlan`- und `ipvlan`-Netzwerken
- Einheitliche manuelle und automatische Bereinigung für Images, Netzwerke, Volumes und Build-Cache, mit Vorschau, Ausschlüssen und Verlauf
- Exakte Aufhol-Zeitplanung und Klassifizierung nach Image-ID
- Schutz laufender und gestoppter Container, von Rollback- und Wiederherstellungs-Images sowie aktueller Dockge-Enhanced-Images

### Suche & Dateien
- Globale instanzübergreifende Suche (`Ctrl+K`) in Stacks, Compose-/`.env`-Dateien, Docker-Ressourcen und aktuellen Restic-Snapshots
- Optionale Suche in `.env`-Werten, die nie zurückgegeben oder im Verlauf gespeichert werden
- Kompakte Zeilen für eingebundene Volumes mit Größen und ein Volume-Browser/-Editor pro Container, auch bei gestopptem Stack
- Optionaler, auf ein Wurzelverzeichnis beschränkter Host-Dateimanager mit stückweisen Übertragungen, Textbearbeitung und Anzeige von Dateiprotokollen

### Automatisierung & Audit
- REST-API-Tokens, beschränkt nach Berechtigungen und Stacks
- Webhooks pro Stack
- Optionale benutzerdefinierte Home-Assistant-Integration und Beispiele
- Zentraler Audit-Verlauf mit Ursprung, Status und Dauer
- Anleitungen: [REST-API, Webhooks und Home Assistant](docs/AUTOMATION.de.md) · [Home-Assistant-Integration](docs/HOME-ASSISTANT.md)

### Integrationen
- Zerobyte: verwaltete Installation oder externe Verbindung
- PowerWatch und PowerWatch Hub: externe Beobachtung oder verwaltete Bereitstellung
- PlugNPiN für Nginx Proxy Manager, Pi-hole und AdGuard Home
- Dozzle
- Kula
- Home Assistant

### Darstellung & Sprachen
- Getrennte Tag- und Nachtpaletten, einschließlich der ursprünglichen Dockge-Enhanced-Themes
- Optionen Catppuccin, Nord, Solarized, Dracula, Gruvbox, Tokyo Night und Rosé Pine
- Im Browser gespeicherte Einstellungen mit systemabhängigem Auto-Modus
- Enhanced-Funktionen auf Englisch, Französisch, Deutsch, Spanisch und vereinfachtem Chinesisch; andere Oberflächensprachen verwenden dafür Englisch

### Benachrichtigungen & Zugriff
- Discord- und Apprise-Benachrichtigungen, lokalisiert in EN / FR / ES / zh-CN
- Instanzname in Benachrichtigungen und Links über `DOCKGE_PUBLIC_URL`
- Remote-Betriebsankündigungen und persistentes Journal ungelesener Neuigkeiten
- Optionale wöchentliche und monatliche Berichte zur anonymen Installationszählung über einen Discord-Webhook in GitHub Actions
- Mobile Clients von Drittanbietern

</details>

---

## Automatischer Update-Workflow von Dockge-Enhanced

> **Getrennt von ImageWatcher:** Der Sofortmodus überprüft Stack-Images alle 5 Minuten. Der folgende Workflow gilt nur für geschützte Updates von Dockge-Enhanced selbst.

<details>
<summary>Geschützten Update-Ablauf anzeigen</summary>

Dockge-Enhanced führt den vollständigen Workflow automatisch aus: obligatorisches Restic-Backup, Integritätsprüfung, kontrollierter Containeraustausch, Gesundheitsprüfung und finale Bestätigung. Discord- und Apprise-Benachrichtigungen ermöglichen es Benutzern zudem, den Vorgang zu verfolgen, ohne die WebUI geöffnet halten zu müssen.

Der Updater unterstützt den normalen Unix-Socket (einschließlich `DOCKGE_DOCKER_SOCKET`) und einen vertrauenswürdigen Docker Socket Proxy, der mit `DOCKER_HOST=tcp://proxy:2375` konfiguriert ist. Im TCP-Modus wird niemals ein Socket eingehängt (gemountet): Der Updater startet in einem der Docker-Netzwerke der Instanz, tritt allen zusätzlichen Netzwerken bei und führt seinen signierten Plan erst aus, wenn ein Startsignal alle Anhänge bestätigt. Er verwendet denselben konfigurierten Docker-Endpunkt. Der Proxy muss das Inspektieren, Erstellen, Starten, Stoppen und Entfernen von Containern, das Inspektieren und Herunterladen von Images sowie das Verbinden von Netzwerken erlauben; ein Nur-Lese-Proxy kann kein Selbst-Update durchführen. Belassen Sie einen unverschlüsselten TCP-Endpunkt ausschließlich in einem vertrauenswürdigen internen Netzwerk. TLS-Einstellungen bleiben erhalten, wenn das Zertifikatsverzeichnis im Enhanced-Container eingehängt ist; andernfalls bricht das Update vor dem Ersetzen sicher ab.

Bevor ein automatisches Selbst-Update startet, überprüft Enhanced zudem, dass keine sensible Operation ausgeführt wird: Restic-Backup oder -Wiederherstellung, Stack-Kopieren/-Verschieben/Datenübertragung oder -Replikation, Docker-Image-Prüfungen/-Updates, Trivy-Scans und geschützte Integrationen externer Stacks. Wenn eine Operation das Update blockiert, wechselt es in einen Wartezustand, der Grund wird in der WebUI angezeigt und über Discord/Apprise gesendet, und der Watcher unternimmt automatisch neue Versuche.

<table>
<tr>
<td align="center" width="50%"><a href="screens/AutoUpdate-ResticVerification.png"><img src="screens/AutoUpdate-ResticVerification.png" width="100%"/></a><br/><sub><strong>1. Restic verification</strong> — backup validation before replacement.</sub></td>
<td align="center" width="50%"><a href="screens/AutoUpdate-Healthcheck.png"><img src="screens/AutoUpdate-Healthcheck.png" width="100%"/></a><br/><sub><strong>2. Health check</strong> — validation of the new container.</sub></td>
</tr>
<tr>
<td align="center" width="50%"><a href="screens/AutoUpdate-Completed.png"><img src="screens/AutoUpdate-Completed.png" width="100%"/></a><br/><sub><strong>3. Update completed</strong> — installed build and final state.</sub></td>
<td align="center" width="50%"><a href="screens/AutoUpdate-Notifications.png"><img src="screens/AutoUpdate-Notifications.png" width="100%"/></a><br/><sub><strong>4. Notifications</strong> — availability, main changes and final confirmation.</sub></td>
</tr>
</table>

</details>

## Screenshots

<details>
<summary>Screenshots anzeigen</summary>

<table>
  <tr>
    <td align="center" width="33%">
      <a href="screens/1.png"><img src="screens/1.png" width="100%"/></a>
      <sub>Multi-instance dashboard and global status</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/2.png"><img src="screens/2.png" width="100%"/></a>
      <sub>Stack view with Compose, containers and logs</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/3.png"><img src="screens/3.png" width="100%"/></a>
      <sub>Detailed stack management and actions</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/4.png"><img src="screens/4.png" width="100%"/></a>
      <sub>Copy/migration wizard — data selection</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/5.png"><img src="screens/5.png" width="100%"/></a>
      <sub>Copy/migration wizard — transfer preparation</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/6.png"><img src="screens/6.png" width="100%"/></a>
      <sub>Copy/migration wizard — volume mapping and validation</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/7.png"><img src="screens/7.png" width="100%"/></a>
      <sub>Stack view with advanced operations tools</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/8.png"><img src="screens/8.png" width="100%"/></a>
      <sub>Image update monitoring</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/9.png"><img src="screens/9.png" width="100%"/></a>
      <sub>Detailed monitored-image status</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/10.png"><img src="screens/10.png" width="100%"/></a>
      <sub>Stack start and stop scheduling</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/11.png"><img src="screens/11.png" width="100%"/></a>
      <sub>Security analysis and Trivy results</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/12.png"><img src="screens/12.png" width="100%"/></a>
      <sub>Restic backup configuration</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/13.png"><img src="screens/13.png" width="100%"/></a>
      <sub>Included volumes, exclusions and backup consistency</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/14.png"><img src="screens/14.png" width="100%"/></a>
      <sub>Docker resource management</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/15.png"><img src="screens/15.png" width="100%"/></a>
      <sub>Monitoring and container health</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/16.png"><img src="screens/16.png" width="100%"/></a>
      <sub>Responsive / mobile interface</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/17.png"><img src="screens/17.png" width="100%"/></a>
      <sub>Central audit history</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/18.png"><img src="screens/18.png" width="100%"/></a>
      <sub>Security and authentication settings</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/19.png"><img src="screens/19.png" width="100%"/></a>
      <sub>Optional integrations</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/20.png"><img src="screens/20.png" width="100%"/></a>
      <sub>Automation, API and webhooks</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/21.png"><img src="screens/21.png" width="100%"/></a>
      <sub>About page and version information</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/EnhancedUpdate.png"><img src="screens/EnhancedUpdate.png" width="100%"/></a>
      <sub>In-app Dockge Enhanced update</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/DiscordUpdates.png"><img src="screens/DiscordUpdates.png" width="100%"/></a>
      <sub>Discord — image update alerts</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/DiscordTrivy.png"><img src="screens/DiscordTrivy.png" width="100%"/></a>
      <sub>Discord — Trivy security alerts</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <a href="screens/DiscordBackup.png"><img src="screens/DiscordBackup.png" width="100%"/></a>
      <sub>Discord — backup notifications</sub>
    </td>
    <td align="center" width="33%">
      <a href="screens/DiscordEnhancedUpdate.png"><img src="screens/DiscordEnhancedUpdate.png" width="100%"/></a>
      <sub>Discord — Dockge Enhanced update alerts</sub>
    </td>
  </tr>
</table>

</details>

---

## Installation

```yaml
# compose.yaml
services:
  dockge:
    image: ghcr.io/aerya/dockge-enhanced:latest
    container_name: dockge-enhanced
    restart: unless-stopped
    ports:
      - 5001:5001
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ../../data:/app/data
      - ../../opt/stacks:/opt/stacks
      - ../../backup/dockge:/backup          # optional — dedicated local backup volume
      - ../../docker:/dockers-data           # optional — extra data to back up
    environment:
      - DOCKGE_STACKS_DIR=/opt/stacks
      - DOCKGE_DATA_DIR=/app/data
#      - DOCKER_API_VERSION=x.xx             # optional — for NAS devices with older Docker API
      - TZ=Europe/Paris                      # optionale Laufzeit-Zeitzone; Zeitpläne in der WebUI konfigurierbar
```

```bash
docker compose up -d
```

Öffnen Sie **http://localhost:5001**, erstellen Sie Ihr Administrator-Konto und klicken Sie dann in der Navigationsleiste auf **Monitoring**.

> Das Volume `/backup:/backup` ist optional, wird jedoch empfohlen, wenn Sie **local** als Restic-Backup-Ziel verwenden — legen Sie den Zielpfad auf `/backup` fest, damit Ihre Snapshots in einem dedizierten Host-Verzeichnis außerhalb des Containers landen.

> **Sicherung mehrerer Datenverzeichnisse?** Fügen Sie beliebig viele Volumes hinzu (z. B. `../../media:/media-data`) und wählen Sie die eingebundenen Pfade unter **Backup → Zu sichernde Docker-Volumes** aus; Restic schließt sie in jeden Backup-Lauf ein. Siehe die [Restic-Anleitung](docs/restic.de.md).

> **Überwachung einer anderen Festplattenpartition als `/`?** Festplattenstatistiken werden aus dem Inneren des Containers mit `df` gelesen. Wenn Sie einen Host-Pfad wie `/mnt/data` überwachen möchten, hängen Sie diesen schreibgeschützt ein und fügen Sie ihn im **Monitoring**-Tab unter *Überwachte Festplattenpartitionen* hinzu:
> ```yaml
>       - /mnt/data:/mnt/data:ro
> ```

**PowerWatch und PowerWatch Hub sind optional**: Keines von beiden muss der obigen Enhanced-Compose-Datei hinzugefügt werden. Öffnen Sie nach der Installation **Watcher → Monitoring** (`/watcher/monitoring`), um bestehende Instanzen zu verbinden oder die verwalteten Dienste unabhängig voneinander bereitzustellen. Geschützte PowerWatch-Instanzen werden unterstützt: Geben Sie deren schreibgeschützten Bearer-Token unter Monitoring → PowerWatch ein. Instanzen ohne Authentifizierung erfordern weiterhin kein Token.

### Testen von Dockge-Enhanced parallel zu Dockge

Dockge und Dockge-Enhanced können auf demselben Docker-Host ausgeführt werden, ihre Standard-Compose-Konfigurationen können jedoch nicht unverändert verwendet werden, da beide den Port `5001` veröffentlichen.

Um sie Seite an Seite zu testen:

- installieren Sie Dockge-Enhanced aus einem separaten Compose-Verzeichnis;
- verwenden Sie einen anderen Host-Port, zum Beispiel `5002:5001`;
- verwenden Sie ein separates `/app/data`-Verzeichnis;
- verwenden Sie vorzugsweise ein separates Stacks-Verzeichnis mit einem dedizierten Test-Stack.

Beispiel:

```yaml
ports:
  - 5002:5001
volumes:
  - ./enhanced-data:/app/data
  - /opt/dockge-enhanced-test-stacks:/opt/stacks
environment:
  - DOCKGE_STACKS_DIR=/opt/stacks
  - DOCKGE_DATA_DIR=/app/data
```

Sie können Dockge-Enhanced anschließend unter **http://localhost:5002** öffnen, während Ihre bestehende Dockge-Installation auf Port `5001` verfügbar bleibt.

Beide Anwendungen können auf dasselbe Stacks-Verzeichnis zugreifen, sie sollten jedoch niemals denselben Stack **gleichzeitig** bearbeiten, bereitstellen, aktualisieren oder anderweitig verwalten. Die Verwendung eines separaten Stacks-Verzeichnisses zum Testen ist sicherer.

### Migration von Dockge zu Dockge-Enhanced

Die Migration verläuft unkompliziert, da Dockge-Enhanced dieselbe Grundlage wie Dockge nutzt:

1. Stoppen Sie Dockge.
2. Sichern Sie Ihre Dockge-Compose-Datei, das Datenverzeichnis und das Stacks-Verzeichnis.
3. Ersetzen Sie in Ihrer bestehenden Dockge-Compose-Datei das Image durch:

   ```yaml
   image: ghcr.io/aerya/dockge-enhanced:latest
   ```

4. Behalten Sie Ihre bestehenden Volume-Zuordnungen für `/app/data` und Stacks bei.
5. Laden Sie das Image herunter und starten Sie das Compose-Projekt neu:

   ```bash
   docker compose pull
   docker compose up -d
   ```

Dockge-Enhanced startet mit Ihrem bestehenden Konto, Ihren Einstellungen und Ihren Stacks.

Bewahren Sie das vor der Migration erstellte Backup auf. Wenn Sie beschließen, zu Dockge zurückzukehren, stoppen Sie Dockge-Enhanced und stellen Sie dieses Backup wieder her, bevor Sie das ursprüngliche Dockge-Image neu starten.

### Optionale PlugNPiN-Integration

<details>
<summary>Installationsdetails anzeigen</summary>

Öffnen Sie **Einstellungen → Integrationen**, um [PlugNPiN](https://github.com/DeepSpace2/PlugNPiN) zu konfigurieren. Die Integration bleibt vollständig inaktiv, bis **PlugNPiN aktivieren** ausgewählt und das Formular gespeichert wird. Durch das Aktivieren wird der verwaltete Stack `plugnpin-dockge-enhanced` erstellt; durch das Deaktivieren wird Compose down ausgeführt und das generierte Stack-Verzeichnis entfernt.

Für PlugNPiN sind Anmeldedaten für den Nginx Proxy Manager erforderlich. Pi-hole, AdGuard Home, Metriken und das Debug-Protokoll bleiben individuell optional. Passwörter werden über stdin in das dedizierte Docker-Volume `dockge_enhanced_plugnpin_secrets` geschrieben und niemals an den Browser zurückgegeben oder in die generierte Compose-Datei aufgenommen.

Um einen Dienst zu veröffentlichen, bearbeiten Sie dessen Stack und verwenden Sie **PlugNPiN-Veröffentlichung (optional)** unter dem Compose-Editor. Der Assistent generiert die erforderlichen `plugNPiN.ip`- und `plugNPiN.url`-Labels sowie ausgewählte NPM-Optionen und kann diese anwenden. Vorhandene Labels und Kommentare in Formular- oder Mapping-Ansichten bleiben erhalten. Bei Labels im Listenformat bietet Dockge bewusst eine reine Kopierausgabe an, anstatt die bestehende Struktur umzuschreiben.

> Das Deaktivieren des Controllers stoppt seine Container, kann jedoch nicht die sofortige Entfernung von Einträgen garantieren, die er erstellt hat, während markierte Anwendungscontainer noch laufen. Entfernen Sie die Labels oder stoppen Sie die betroffenen Anwendungen, während PlugNPiN läuft, falls diese Einträge zuerst gelöscht werden müssen.

> PlugNPiN `1.0.0` wird derzeit upstream nur für `amd64` veröffentlicht. Dockge hält die Integration auf nicht unterstützten Architekturen mit einer klaren Meldung deaktiviert; der Rest von Dockge-Enhanced bleibt multiorientiert (Multi-Architecture).

</details>

---

## Umgebungsvariablen

| Variable | Standardwert | Beschreibung |
|---|---|---|
| `DOCKGE_STACKS_DIR` | `/opt/stacks` | Verzeichnis mit Docker-Compose-Stacks |
| `COMPOSE_FILENAME` | `compose.yaml` | COMPOSE_FILENAME wählt compose.yaml (Standard), compose.yml, docker-compose.yaml oder docker-compose.yml nur für neue Stacks. Bestehende und übernommene Stacks behalten ihre Dateinamen. Andere Namen und Pfade werden abgelehnt. |
| `DOCKGE_DATA_DIR` | `/app/data` | Dockge-Datenverzeichnis; nur für einen benutzerdefinierten persistenten Einhängepunkt überschreiben |
| `DOCKGE_PUBLIC_URL` | *(keine)* | Öffentliche URL, die in Discord-Benachrichtigungslinks verwendet wird (z. B. `https://dockge.example.com`) |
| `DOCKER_API_VERSION` | *(keine)* | Legt die vom Client ausgehandelte Docker-API-Version fest — nützlich auf bestimmten NAS-Systemen (z. B. Synology DSM 7.x) |
| `TZ` | `UTC` | Laufzeit-Zeitzone des Containers; Standard für Zeitpläne bis zur ausdrücklichen Auswahl unter **Einstellungen → Allgemein**. Die WebUI-Auswahl hat für Enhanced-Zeitpläne Vorrang. |
| `DOCKGE_PORT` | `5001` | Port der Web-Benutzeroberfläche |
| `DOCKGE_SSL_KEY` / `DOCKGE_SSL_CERT` | — | HTTPS aktivieren |
| `DOCKGE_AUTH_MODE` | *(nicht gesetzt)* | Authentifizierungsmodus: `local`, `disabled` oder `trusted-proxy`. Wenn nicht gesetzt, bleiben das historische Verhalten und die Einstellung `disableAuth` erhalten |
| `DOCKGE_AUTH_PROXY_HEADER` | `x-forwarded-user` | Header, der die vom Proxy validierte Identität im Modus `trusted-proxy` enthält |
| `DOCKGE_AUTH_PROXY_TRUSTED_NETWORKS` | *(im Proxy-Modus erforderlich)* | Durch Kommas getrennte Adressen oder CIDRs, die berechtigt sind, den Identitäts-Header bereitzustellen |
| `DOCKGE_BOOTSTRAP_USERNAME` | *(keine)* | Name des ersten Administrators, wird nur erstellt, wenn die Datenbank keine Benutzer enthält |
| `DOCKGE_BOOTSTRAP_PASSWORD_FILE` | *(keine)* | Secret-Datei, die das Passwort enthält; wird für das automatisierte Bootstrap empfohlen |
| `DOCKGE_BOOTSTRAP_PASSWORD` | *(keine)* | Direkte Passwort-Alternative, weniger sicher, da sie in der Container-Umgebung sichtbar ist |
| `DOCKGE_TRANSFER_RSYNC_PROFILES` | `[]` | JSON-Array lokaler SSH/rsync-Profile (`label`, `host`, `port`, `user`, `path`, `keyPath`, optional `bandwidthKbps`). Konfigurieren Sie dieselbe Zielidentität auf beiden Instanzen; Schlüsselpfade verlassen niemals ihre Instanz |
| `DOCKGE_AUTH_PROXY_ADMIN_USERS` | *(keine)* | Kommagetrennte Proxy-Identitäten, die im Modus `trusted-proxy` bei der ersten Anmeldung als Administratoren angelegt werden; andere neue Identitäten sind eingeschränkt und ohne Berechtigungen |
| `DOCKGE_REVERSE_HUB_URL` | *(keine)* | Hub-Origin für eine optionale Rückwärtsverbindung (HTTP(S), ohne Pfad); siehe die [Anleitung zu Rückwärts-Agents](docs/compose-and-reverse-agents.md) |
| `DOCKGE_REVERSE_TOKEN_FILE` / `DOCKGE_REVERSE_TOKEN` | *(keine)* | Knotenspezifisches Token für die Rückwärtsverbindung; die Datei hat Vorrang und wird empfohlen |
| `DOCKGE_FILE_MANAGER_ROOT` | *(keine)* | Container-Pfad, den der optionale Host-Dateimanager freigibt; ohne Angabe deaktiviert |
| `DOCKGE_FILE_MANAGER_MAX_FILE_SIZE` | `104857600` | Maximale Übertragungsgröße des Host-Dateimanagers in Bytes (100 MiB) |
| `DOCKGE_DOCKER_SOCKET` | `/var/run/docker.sock` | Pfad zum Docker-Socket, z. B. für rootless Docker oder Podman |
| `DOCKER_HOST` | *(keine)* | Docker-Endpunkt, z. B. `tcp://proxy:2375` mit einem vertrauenswürdigen Docker Socket Proxy |
| `DOCKGE_CONTAINER_ID` | *(keine)* | Explizite Container-ID von Enhanced, wenn sie nicht aus `HOSTNAME` ermittelt werden kann |
| `DOCKGE_USAGE_COUNT` | *(aktiviert)* | Auf `false` setzen, um die anonyme monatliche Installationszählung zu deaktivieren |
| `DOCKGE_OIDC_ISSUER` | *(keine)* | Issuer-URL des OpenID-Connect-Anbieters; ist sie gesetzt, wird die native OIDC-Anmeldung aktiviert. Alle Optionen `DOCKGE_OIDC_*` stehen in der [OIDC-Anleitung](docs/oidc.de.md) |

> ℹ️ Ohne `DOCKGE_DATA_DIR` verwendet Dockge-Enhanced sein persistentes `/app/data`-Volume. Explizit konfigurierte Pfade haben immer Vorrang.

> ℹ️ `DOCKGE_PUBLIC_URL` ist optional. Falls nicht gesetzt, werden Discord-Benachrichtigungen ohne Link gesendet. Funktioniert mit Reverse-Proxys und HTTPS-Domains.

> SSH/rsync-Profile erfordern, dass der private Schlüssel und eine gefüllte `known_hosts`-Datei in jeder beteiligten Dockge-Instanz schreibgeschützt eingehängt sind. `StrictHostKeyChecking=yes` wird immer erzwingen; Passwörter und beliebige Remotebefehle werden von der Web-Benutzeroberfläche nicht akzeptiert.

### Authentifizierung und Ersteinrichtung

**Bestehende Installationsvorgänge erfordern keine Änderungen.** Ohne die obigen Variablen funktionieren Konten, die Anmeldeseite, 2FA und die Einstellung **Authentifizierung deaktivieren** genau wie zuvor. Öffnen Sie beim ersten Start einer neuen Installation `/setup` und erstellen Sie den Administrator wie gewohnt. Nach der Initialisierung lehnt der Server jeden weiteren Setup-Versuch ab, selbst wenn die SPA-URL bekannt bleibt.

Für ein nicht-interaktives Bootstrap hängen Sie vorzugsweise ein Secret ein und setzen Sie nur diese optionalen Variablen:

```yaml
services:
  dockge:
    environment:
      - DOCKGE_BOOTSTRAP_USERNAME=admin
      - DOCKGE_BOOTSTRAP_PASSWORD_FILE=/run/secrets/dockge_admin_password
    secrets:
      - dockge_admin_password

secrets:
  dockge_admin_password:
    file: ./secrets/dockge_admin_password
```

Das Bootstrap wird ignoriert, sobald ein Benutzer existiert, wodurch ein bestehendes Konto oder Passwort niemals geändert wird.

So delegieren Sie den Zugriff an [OAuth2 Proxy](https://oauth2-proxy.github.io/oauth2-proxy/configuration/overview/) oder Traefik ForwardAuth:

```yaml
environment:
  - DOCKGE_AUTH_MODE=trusted-proxy
  - DOCKGE_AUTH_PROXY_HEADER=x-forwarded-user
  - DOCKGE_AUTH_PROXY_TRUSTED_NETWORKS=172.20.0.0/24
```

Ersetzen Sie das Beispiel-CIDR durch das genaue Netzwerk des Proxys und konfigurieren Sie ihn so, dass er den gewählten Header weitergibt. Der Dockge-Port darf nicht direkt erreichbar sein: Nur deklarierte Proxys dürfen eine Identität liefern. Jede Proxy-Identität verwendet das lokale Konto mit demselben Benutzernamen: Ein eingeschränktes Konto begrenzt diesen Proxy-Benutzer, ein Administratorkonto behält vollen Zugriff. Eine Identität ohne Konto wird als eingeschränktes Konto ohne Berechtigungen angelegt, außer dem ersten Benutzer einer neuen Installation und den in `DOCKGE_AUTH_PROXY_ADMIN_USERS` aufgeführten Identitäten, die Administratoren werden. Bestehende Konten behalten ihre Rolle; Rollenänderungen oder Deaktivierungen können bis zu 30 Sekunden brauchen, bis sie für Proxy-Sitzungen gelten. Die Kontenverwaltung bleibt nur bei lokaler Authentifizierung verfügbar. Nehmen Sie `/setup`, `/socket.io` oder `/api/*` niemals von der Authentifizierung aus; der Proxy muss WebSockets weiterleiten und den gesamten Host schützen.

### Native OIDC-Anmeldung (Pocket ID, Authentik, Keycloak…)

Ohne Reverse Proxy kann Dockge-Enhanced Benutzer direkt über einen OpenID-Connect-Anbieter anmelden, zusätzlich zu lokalen Konten und 2FA:

```yaml
environment:
  - DOCKGE_OIDC_ISSUER=https://id.example.com
  - DOCKGE_OIDC_CLIENT_ID=dockge
  - DOCKGE_OIDC_CLIENT_SECRET_FILE=/run/secrets/dockge_oidc_secret
  - DOCKGE_OIDC_REDIRECT_URI=https://dockge.example.com/api/auth/oidc/callback
  - DOCKGE_OIDC_ADMIN_GROUPS=dockge-admins
```

Neue OIDC-Benutzer sind eingeschränkte Konten ohne Zugriff, bis ein Administrator ihn gewährt, außer sie gehören zu `DOCKGE_OIDC_ADMIN_GROUPS` oder `DOCKGE_OIDC_ADMIN_USERS`. Niemand wird implizit Administrator: Legen Sie bei einer neuen Installation den ersten Administrator über `/setup` oder `DOCKGE_BOOTSTRAP_*` an oder konfigurieren Sie eine Admin-Zuordnung, sonst wird die erste OIDC-Anmeldung abgelehnt. Bestehende lokale Konten werden nie ohne `DOCKGE_OIDC_LINK_EXISTING=true` verknüpft. OIDC funktioniert nur bei lokaler Authentifizierung und fragt nicht nach dem lokalen TOTP-Code. `DOCKGE_OIDC_DISABLE_LOCAL_LOGIN=true` lässt nur die SSO-Schaltfläche übrig; ist der Anbieter nicht erreichbar, entfernen Sie die Variable und starten den Container neu. [Alle Optionen, Anbieterbeispiele und Wiederherstellung](docs/oidc.de.md).

---

## Automatische Updates

Dieser Fork verfolgt Upstream-Dockge-Releases automatisch über GitHub Actions:
- **Ttäglich** – prüft auf ein neues stabiles Release
- **Falls gefunden** – führt Upstream-Änderungen zusammen und öffnet einen Pull Request
- **Beim Zusammenführen (Merge)** – erstellt Docker-Images neu und veröffentlicht sie (`amd64` + `arm64`) auf der GHCR
- **Bei Authentifizierungskonflikten** – behält die Enhanced-Version temporär im Sync-Branch und listet explizit Dateien auf, die vor dem Zusammenführen verglichen werden müssen

Das in der App auf dem Tab **Updates** konfigurierte Wartungsfenster ist global: Wenn es für automatische Dockge-Enhanced-Updates aktiviert ist, beschränkt es auch alle automatischen Image-Updates. Images, die außerhalb der erlaubten Tage und Stunden erkannt werden, verbleiben in der Warteschlange. Manuelle Aktionen zum **Jetzt aktualisieren** werden durch dieses Fenster niemals verzögert.

---

## Mobile Apps / Clients von Drittanbietern

Dockge-Enhanced ist kostenlos und Open Source.

Derzeit wird von diesem Projekt keine offizielle iOS- oder Android-App gewartet.

Es existieren möglicherweise Clients von Drittanbietern, diese sind jedoch unabhängig von Dockge-Enhanced, es sei denn, sie sind hier ausdrücklich aufgeführt.

---

## Urheberrechtsnachweis

Wenn Ihre App, Ihr Dienst, Ihr Artikel oder Ihre Integration Funktionen, API-Endpunkte, Screenshots, Dokumentationen oder Branding von Dockge-Enhanced verwendet, erwähnen Sie das Projekt bitte und verlinken Sie auf dieses Repository.

Kommerzielle Drittanbieter-Clients sind durch die Lizenz gestattet, dürfen jedoch ohne Erlaubnis keine offizielle Zugehörigkeit implizieren.

---

## Mitwirkende

- [**Apprise**](https://github.com/caronc/apprise-api) – plattformübergreifendes Benachrichtigung-Gateway
- [**darthrater78/dockge**](https://github.com/darthrater78/dockge) / [**ha-dockge**](https://github.com/darthrater78/ha-dockge) — Inspiration für Portkonflikt-Erkennung, Compose-Abweichungsprüfung und Home-Assistant-Integration.
- [**crossly/Dockge-Enhanced**](https://github.com/crossly/Dockge-Enhanced) – Quelle für bedeutende UI/UX-, Themen-, Internationalisierungs- und Frontend-Architekturverbesserungen, die in dieses Projekt übernommen wurden
- [**Dockge**](https://github.com/louislam/dockge) von louislam – das ursprüngliche Projekt (MIT-Lizenz)
- [**Dozzle**](https://github.com/amir20/dozzle) von Amir Rajan – Echtzeit-Docker-Protokollviewer (MIT-Lizenz)
- [**hamphh/dockge**](https://github.com/hamphh/dockge) von hamphh – Inspiration und kompatible Labels für den Stack-Status pro Dienst und den Ausschluss von Image-Updates
- [**Isurupro7**](https://github.com/Isurupro7) / [**Dockge #1006**](https://github.com/louislam/dockge/pull/1006) — Inspiration für optionale CPU-/RAM-Limits pro Dienst, ohne Änderungen an eingeschränkten Kontorechten
- [**RichyHBM**](https://github.com/RichyHBM) / [**Dockge #84**](https://github.com/louislam/dockge/pull/84) — Standardname der Compose-Datei.
- [**Wowu/docker-rollout**](https://github.com/Wowu/docker-rollout) — Updates ohne Dienstunterbrechung.
- [**Kula**](https://github.com/c0m4r/kula) von c0m4r – leichtgewichtiger Systemmonitor (AGPLv3)
- [**Lorwell/dockge**](https://github.com/Lorwell/dockge) von Lorwell – Inspiration für den eingeschränkten Host-Dateimanager und die Ansicht echter Container, angepasst für Enhanced (MIT-Lizenz)
- [**PlugNPiN**](https://github.com/DeepSpace2/PlugNPiN) von DeepSpace2 – optionale DNS- und Nginx-Proxy-Manager-Automatisierung (GPLv3)
- [**PowerWatch**](https://github.com/Aerya/PowerWatch) – Linux-Stromverbrauchsüberwachungs- und Aggregations-Hub, optional in Enhanced integriert
- [**Restic**](https://restic.net/) – verschlüsseltes Backup-Tool
- [**Trivy**](https://github.com/aquasecurity/trivy) – Schwachstellenscanner
- [**Zerobyte**](https://github.com/nicotsx/zerobyte) — Backup-Anwendung auf Basis von Restic, optional mit Enhanced verbunden oder von Enhanced bereitgestellt

---

## Lizenz

MIT – siehe [LICENSE](LICENSE).
