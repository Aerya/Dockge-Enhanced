# Zerobyte (optional)

[English](zerobyte.md) · [Français](zerobyte.fr.md) · [Español](zerobyte.es.md) · [Deutsch](zerobyte.de.md) · [简体中文](zerobyte.zh-CN.md)

Aktivieren Sie unter **Sicherungen** die Option **Zerobyte (optional)**. Ausschalten blendet den gesamten Bereich aus und bewahrt Konfiguration, Zugangsdaten, Container und Backup-Daten. Die bestehenden Sicherungsbereiche, Repositories und Aufbewahrungsregeln von nativem Enhanced-Restic bleiben erhalten: **Es gibt keine automatische Auslassung oder Migration**.

## Vorhandene Instanz

Geben Sie den **vom Enhanced-Server aus** erreichbaren HTTP(S)-Origin und einen in den Zerobyte-Einstellungen erstellten API-Schlüssel ein. Zugangsdaten, Abfrageparameter und Pfade in der URL werden abgelehnt. Speichern und testen Sie die Verbindung. Enhanced verwaltet keine Docker-Ressourcen externer Instanzen. Die Übersicht verknüpfter Instanzen ist schreibgeschützt; geschützte Stack-Hooks stehen für die unten beschriebenen verwalteten Workflows zur Verfügung.

## Verwaltete Installation

Enhanced erzeugt ein reguläres Compose-Projekt im eigenen Stack-Verzeichnis. Der Projektname wird aus den tatsächlichen Daten-/Stack-Mount-Pfaden von Enhanced abgeleitet, um Kollisionen zwischen Instanzen zu vermeiden. Beide Verzeichnisse müssen erkennbare Host-Bind-Mounts sein. Zerobyte verwendet das offizielle Image `ghcr.io/nicotsx/zerobyte:v0.43.2` mit reduzierten Rechten: ohne Docker-Socket, SYS_ADMIN oder FUSE. Interne Datenbank/Konfiguration und Wiederherstellungsbereich verwenden automatisch angelegte persistente benannte Volumes; wählen Sie diese niemals als Quelle oder Ziel.

1. Fügen Sie mindestens ein vorhandenes Host-Verzeichnis oder vorhandenes benanntes Docker-Volume als **Quelle** hinzu. Nach Prüfung zeigt Enhanced den Pfad `/sources/local-…`. Quellen sind schreibgeschützt.
2. Fügen Sie mindestens ein anderes vorhandenes Host-Verzeichnis als **Ziel** hinzu. Es ist unter `/destinations/store-…` beschreibbar. Für auf dem Host gemountete NFS-/SMB-/SSHFS-/rclone-Freigaben wählen Sie **Dieses Verzeichnis muss eine gemountete Remote-Freigabe sein**. Fehlende deklarierte Freigaben werden abgelehnt.
3. Bestätigen Sie bei Aufforderung die Trennung von entfernten Enhanced-Restic-Repositories. Enhanced kann nicht beweisen, dass S3-/SFTP-/REST-Speicher von einer Host-Freigabe getrennt ist. Lokale Repositories einschließlich deaktivierter Ziele werden automatisch im Host-Namensraum geprüft.
4. Wählen Sie einen freien lokalen Port mit `http://127.0.0.1:<port>` und bestätigen Sie die Installation. Die Oberfläche ist nur über Loopback erreichbar; verwenden Sie von anderen Rechnern einen SSH-Tunnel. Enhanced tritt dem Projektnetzwerk bei; das Verbindungsfeld verwendet den instanzspezifischen Dienstalias. Nach Austausch des Enhanced-Containers muss dieser im Netzwerk bleiben.
5. Öffnen Sie Zerobyte, schließen Sie die Ersteinrichtung ab, verwahren Sie den Wiederherstellungsschlüssel sicher und erstellen Sie einen API-Schlüssel. Tragen Sie ihn in Enhanced ein und speichern Sie die Verbindung.
6. **Mounts erstellen keine logischen Volumes, Repositories oder Backup-Jobs.** Erstellen Sie in Zerobyte Directory-Quellen an den angezeigten Quellpfaden und Local-Repositories unter den Zielpfaden, danach einen Job. Über Enhanced erstellte Jobs sind zunächst deaktiviert. Zeitpläne und Aufbewahrung werden in Zerobyte konfiguriert.

Pfade mit symbolischen Links, Verzeichnistraversierung, System-/Steuerungswurzeln, gemeinsamer Quelle-/Ziel-Abstammung, verschachtelten Zielen, Bind-Aliasen oder Überschneidungen mit Enhanced-Daten, internen Zerobyte-Daten oder lokalen Enhanced-Restic-Repositories werden abgelehnt. Host-Verzeichnisse werden durch einen temporären schreibgeschützten Prüfer ohne Netzwerk geprüft, dessen einzige verbleibende Fähigkeit DAC_READ_SEARCH ist. Die Dateisystemidentität jedes Ziels wird bei jedem Zerobyte-Start geprüft. Eine verschwundene oder ersetzte Freigabe verhindert den Start, statt in das lokale Ersatzverzeichnis zu schreiben. Bei absichtlichem Speicherwechsel müssen Mounts neu validiert werden. Docker-Bind-Mounts halten das eingebundene Dateisystem während der Laufzeit fest; eine nicht verfügbare Freigabe kann E/A scheitern oder hängen lassen. Dies garantiert keine Netzwerkverfügbarkeit.

Unveränderte Installationseinstellungen verwenden Projekt und Volumes erneut. Konfigurieren Sie vor Mount-Änderungen die API-Verbindung, deaktivieren Sie alle Jobs und warten Sie auf das Ende laufender Operationen. Bestätigen Sie die explizite Mount-Aktualisierung; bei fehlgeschlagenem Austausch wird die vorherige Compose-Datei erneut angewendet. Prüfen Sie danach vorhandene logische Jobs. Es gibt keinen Endpunkt zur Deinstallation oder Volume-Löschung. Halten Sie `.env` und `.zerobyte.json` privat; sie werden für Eigentumsnachweis und persistente Konfiguration benötigt. Eine fehlgeschlagene Erstbereitstellung bewahrt Volumes und Metadaten für Wiederholung und Diagnose.

## Operationen und Wiederherstellung

Die Übersicht zeigt nur freigegebene Felder für Jobs, Repositories, logische Quellen und aktive Aufgaben; unbekannte Statistiken bleiben unbekannt. Backup und Aufbewahrungsbereinigung erfordern ausdrückliche Bestätigung. Die Bereinigung kann Zerobyte-Snapshots nach der jeweiligen Job-Richtlinie löschen. Sie ruft niemals die native Enhanced-Restic-Wartung auf.

Verwaltete Wiederherstellungen prüfen `/restore-test` automatisch; externe Wiederherstellungen benötigen eine **geprüfte dedizierte Wurzel mit ausdrücklicher Freigabe für diese URL und diesen API-Schlüssel**, wie unten beschrieben. Wählen Sie niemals Anwendungsdaten oder Quell-/Zielverzeichnisse. Jede Anfrage erstellt einen zufälligen Unterpfad, mit deaktivierter Löschung und Überschreibmodus `never`. Wiederherstellungen sind asynchron: Prüfen Sie den Abschluss in Zerobyte vor Verwendung der Dateien. Bei externen Instanzen muss der Betreiber den Wiederherstellungs-Mount unabhängig prüfen.

Schlüssel bleiben serverseitig in `zerobyte-settings.json` (Modus 0600), werden nicht an den Browser zurückgegeben und erscheinen weder in URLs noch in Fehlermeldungen des entfernten Dienstes. Oberfläche und Verwaltungsendpunkte nutzen die bestehende HTTP-Authentifizierungsrichtlinie von Enhanced; die engen Pre-/Post-Callback-Endpunkte benötigen stattdessen das Workflow-Geheimnis. Wie sonst in Enhanced entfällt dieser Schutz bei deaktivierter Authentifizierung. Anfragen haben Zeit- und Antwortgrößenlimits und verweigern Weiterleitungen.

## Entwicklungsprüfung

Die Integration wurde mit Enhanced `a99418187e3bdc17f1aa4674c031aaffc809db98` und Zerobyte `v0.43.2` (`cc63558bd3329209687dd546ea4b1ec02cf6ff7c`) entwickelt. Verwenden Sie für Backup-, Aufbewahrungs- und Wiederherstellungstests ausschließlich isolierte Testverzeichnisse und Repositories. Entwicklungsprüfungen bedeuten keine Produktivbereitstellung.

Oberflächentexte gibt es in Englisch, Französisch, Deutsch, Spanisch und vereinfachtem Chinesisch. Andere Oberflächensprachen verwenden für neue Schlüssel den etablierten Mechanismus `fallbackLocale: "en"`; vorhandene Übersetzungen bleiben erhalten.

Offizielle Installationsbeispiele: https://github.com/nicotsx/zerobyte/tree/v0.43.2/examples

## Assistent für geschützte Workflows

Die verwaltete Installation bietet den **Assistenten für geschützte Backups**: Wählen Sie eine gemountete Quelle, ein Ziel, einen Namen, einen Cron-Ausdruck und eine Frist (1–120 Minuten). Prüfen und bestätigen Sie den genauen Plan. Über die echte Zerobyte-API erstellt oder verwendet er eine Directory-Quelle, ein dediziertes Local-Repository und einen deaktivierten Job. Zerobyte fügt unter dem angezeigten Repository-Elternpfad eine eigene Repository-ID hinzu. Persistente Eigentumsdatensätze machen Wiederholungen idempotent; kollidierende Ressourcen werden abgelehnt und niemals gelöscht. Ein erneut verwendeter Plan ändert seine Richtlinien nicht heimlich. Verwenden Sie für andere Stoppregeln oder Fristen einen neuen Plannamen.

Solche Jobs erhalten offizielle HTTP-Pre-/Post-Webhooks mit einem serverseitigen Workflow-Geheimnis. Sie gelten für manuelle und geplante Läufe. Die Freigabeliste im erzeugten Compose erlaubt nur den Callback-Origin des besitzenden Enhanced. Bewahren Sie beim Austausch von Enhanced den DNS-Alias `enhanced-<owner>` und das gemeinsame Netzwerk; erneutes Anwenden des Installers repariert den Callback-Alias.

Vor dem Stoppen von Anwendungen prüft der Pre-Hook Verfügbarkeit und Dateisystemidentität der Host-Mounts und führt einen zeitlich begrenzten Schreib-/fsync-/Löschtest im Ziel aus. Während des Backups prüft ein Wächter regelmäßig. Bei Speicherverlust oder Fristablauf fordert Enhanced Abbruch an, startet nur ursprünglich laufende Dienste neu und speichert einen dauerhaften Fehler. Es ersetzt das Ziel niemals durch ein lokales Verzeichnis. Ein separat konfigurierter lokaler Backup-Plan ist die ausdrückliche Alternative; es gibt weder versteckten Ersatzspeicher noch eine spätere automatische Übertragung.

Unterbrochene Workflows bleiben bis zur ausdrücklichen Bestätigung pausiert, die den Endzustand der entfernten Aufgabe prüft. Eine Abbruchanforderung beweist nicht, dass der entfernte Prozess gestoppt ist: Vertrauen Sie einem Snapshot des unterbrochenen Laufs erst nach Prüfung. Die Oberfläche aktualisiert den Status, solange sie geöffnet ist; Fehler nutzen außerdem konfigurierte Backup-Discord-/Apprise-Ziele, soweit verfügbar. Die Zustellung ist nicht garantiert.

Optionale Stack-Stopps sind auf verwaltete Compose-Dateien im Stack-Verzeichnis dieser Enhanced-Instanz begrenzt und prüfen Docker-Label-Eigentum. Enhanced und Zerobyte können so nicht gestoppt werden. Die Liste laufender Dienste wird vor dem Stopp journalisiert; sie ermöglicht Wiederherstellung nach Vorbereitungsausfall, Backup-Fehler, verlorenen Post-Hooks oder Enhanced-Neustarts. Fehlgeschlagene Dienststarts behalten das Journal und blockieren native Backups/Wiederherstellungen, statt Erfolg vorzutäuschen. Native Restic-Einstellungen, Ausschlüsse und Aufbewahrung bleiben unverändert; lediglich eine prozessinterne Sperre verhindert Rennen zwischen nativen Operationen und Anwendungsstopps. Dies verhindert keine unabhängigen Containeränderungen durch Betreiber und garantiert keine Wiederherstellung bei nicht verfügbarem Docker oder Host.

Direkt in Zerobyte oder im erweiterten Jobformular erstellte Jobs haben keine Enhanced-Workflow-Hooks, sofern sie nicht ausdrücklich mit diesem Assistenten eingerichtet wurden. Sie werden entsprechend gekennzeichnet. Ihre Planung und ihr Netzwerkverhalten liegen bei Zerobyte. Der geschützte Assistent erstellt Jobs ohne automatische Aufbewahrung; manuelle Bereinigung verlangt weiterhin Bestätigung. Fügt der Betreiber später direkt in Zerobyte eine Aufbewahrungsrichtlinie hinzu, gilt Zerobytes native automatische Wartung; Enhanced fängt externe Konfigurationsänderungen nicht ab.

## Externe Verbindungen und Föderation

Externe Konfigurationen enthalten eine Warnung und Zustimmung, die an URL **und API-Schlüssel** gebunden sind. Jede Änderung widerruft sie. Lesende Status-/Verbindungstests bleiben möglich; Änderungen erfordern Zustimmung, wenn die Verbindung nicht der verifizierte eigene verwaltete API-Origin ist. Externe Wiederherstellung ist bis zum ausdrücklichen Speichern einer dedizierten Wurzel deaktiviert; die frühere globale Umgebungsvariable aktiviert sie nicht. Bekannte logische Quellen und lokale Repository-Pfade werden bei Wiederherstellung lexikalisch auf Überschneidung geprüft; Enhanced kann aber externe Dateisystemstruktur, Linkauflösung oder physische Trennung nicht beweisen. Verwaltete Wiederherstellung prüft stattdessen automatisch das eigene dedizierte beschreibbare Docker-Volume und verweigert Volume-Aliase mit anderen Mounts.

Die Ansicht verknüpfter Instanzen aggregiert ausschließlich freigegebene lesende Zähler über den vorhandenen authentifizierten Föderationstransport. Sie überträgt keine Zerobyte-Schlüssel und unterscheidet deaktivierte Integration, nicht erreichbares Zerobyte und getrennte/inkompatible Gegenstellen. Remote-Operationen bleiben auf ihren besitzenden Instanzen. Produktive Gegenstellen werden nicht für Entwicklungstests verwendet.

### Diagnose und Migration bestehender Jobs

Externe Diagnosen lesen nur die API: Konfiguration, Inventar, Trennung bekannter Pfade und zwischen Jobs geteilte Repositories. Physische Mounts, symbolische Links, Remote-Identität, tatsächliche Rechte und eine unabhängige Wiederherstellungsprobe bleiben ausdrückliche Betreiberprüfungen. Erfolgreiche API-Tests zertifizieren diese Eigenschaften nicht.

Deaktivieren Sie einen bestehenden Job in Zerobyte, warten Sie auf abgeschlossene Aufgaben und wählen Sie Stacks sowie Frist im Assistenten. Prüfen und bestätigen Sie die Migration. Nur Hooks und automatische Wiederholungsanzahl ändern sich; Quelle, Repository, Snapshots, Zeitplan, Filter und Aufbewahrung bleiben erhalten, der Job bleibt deaktiviert. Eigene Hooks und zwischen Jobs geteilte Repositories werden abgelehnt. Nach unklarer API-Antwort bleibt der Job deaktiviert; wiederholen Sie denselben Plan zur Migrationsprüfung.

Anwendungswiederherstellung und Backup-Ergebnis werden getrennt angezeigt. Kann Docker Dienste nicht starten, bleibt das Journal erhalten und die Wiederherstellung wird wiederholt. Prüfen Sie Docker und die benannten Stacks; wiederhergestellte Anwendungen bedeuten kein erfolgreiches Backup. Das Journal wird vor jedem Stopp auf Datenträger synchronisiert.

### Fehlerübungen

Verwenden Sie dedizierte Freigaben und Stacks mit fiktiven Daten. Prüfen Sie zuerst Backup- und Wiederherstellungsinhalt. Simulieren Sie TCP-Verlust, gestoppten Server, entzogene Rechte, schreibgeschützte Freigabe und vollen Speicher getrennt; prüfen Sie Startverweigerung und persistente Warnungen. Trennen Sie Speicher auch während eines Laufs und prüfen Sie Abbruch, tatsächliches Aufgabenende und Wiederherstellung ausschließlich ursprünglich laufender Dienste.

Nutzen Sie bei Docker-Ausfällen ein dediziertes Socket-Relay der Testinstanz, statt einen mit Produktion geteilten Daemon zu stoppen. Abrupte Testcontainer-Neustarts prüfen persistente Wiederherstellung, aber keinen physischen Host-Stromausfall. Testen Sie Föderation mit isolierten Instanzen, Authentifizierungsablehnung und einer älteren Version.

Speicherprüfungen nutzen stabile Prüfnamen und eine lokale Sperre pro Ziel, um in Hard-NFS-Systemaufrufen blockierte Prüfungen zu begrenzen. Ein Enhanced-Timeout kann eine ununterbrechbare Kernel-Operation nicht erzwingen; die Serverwiederherstellung kann nötig bleiben. Wiederholte Workflow-Warnungen werden höchstens alle fünf Minuten versendet. Nach Föderations-Authentifizierungsablehnung muss der Agent ausdrücklich neu authentifiziert werden; bloßes Reaktivieren des Remote-Kontos startet den aus Sicherheitsgründen gestoppten Transport nicht neu.

### Job-Integrität und manuelle Anwendungswiederherstellung

Enhanced prüft registrierte Jobs vor manuellem Start, im Pre-Hook und ungefähr jede Minute, solange kein Anwendungsbackup läuft. Callback-URLs/-Authentifizierung, Quelle, Repository und Wiederholungen müssen zum Workflow passen. Fehlender, geänderter oder nicht prüfbarer Schutz blockiert Starts aus Enhanced; nach Korrektur steht eine sofortige Prüfung bereit. Hooks werden niemals still ersetzt. Werden sämtliche Hooks entfernt und Jobs direkt in Zerobyte gestartet, wird die Abfangfunktion umgangen; lassen Sie Überwachung und Hooks aktiv.

Fehlgeschlagene Wiederherstellung listet journalisierte Stacks und Dienste auf. Ein manueller Wiederholungsversuch startet ausschließlich diese Dienste nach Ende der entfernten Aufgabe; er startet niemals ein weiteres Backup und markiert ein unterbrochenes Backup nicht als erfolgreich.

### Ausdrückliche Speicher-Neuprüfung

Deaktivieren Sie alle Jobs, beenden Sie Aufgaben und prüfen Sie Server, Freigabe und Repository-Trennung physisch. Zeigen Sie die Fingerabdruckänderungen an, bestätigen Sie die Prüfung und stimmen Sie zu. Die Zustimmung ist an die exakte Planrevision gebunden; Änderungen erfordern eine neue Vorschau.

Stoppt der Dateisystemschutz Zerobyte (31), kann Enhanced die Datenbank seines geprüften dedizierten Docker-Datenvolumes ohne Schreibzugriff lesen. Alle Jobs müssen deaktiviert und Aufgaben beendet sein. Nach Prozessstopp prüft Enhanced Inventar und Mounts erneut, bevor der Schutz ersetzt wird. Frühere Compose-/Metadatendateien bleiben in privaten `.pre-revalidation`-Kopien. Nur Zerobyte wird neu bereitgestellt; ein deklariertes Remote-Ziel darf kein lokaler Ersatzspeicher werden.

Die Föderation unterscheidet bekannte Authentifizierungsablehnung, getrennte Gegenstellen, inkompatible Antworten und Zeitüberschreitungen. Ein Timeout allein beweist keine alte Version: Prüfen Sie Verbindung und Kompatibilität. Siehe [wiederholbare Laborübungen](../extra/zerobyte-lab/README.md) (Englisch).
