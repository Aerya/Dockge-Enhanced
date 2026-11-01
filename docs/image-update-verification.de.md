# Überprüfung von Image-Updates

[English](image-update-verification.md) · [Français](image-update-verification.fr.md) · [Deutsch](image-update-verification.de.md) · [Español](image-update-verification.es.md) · [简体中文](image-update-verification.zh-CN.md)

> Vorgeschlagene Änderung in diesem Branch; noch nicht veröffentlicht.

ImageWatcher findet Images ohne lokalen Tag wieder, überprüft nach Compose jedes betroffene Replikat und meldet Abweichungen als Fehler. Nicht überprüfbare Updates ändern das Datum nicht. Heruntergeladene Images bleiben nach abgebrochenen oder ungeprüften Versuchen 24 Stunden vor der Bereinigung geschützt.

Die erwartete unveränderliche Image-ID wird nach dem Pull und vor der Neuerstellung erfasst. Jeder gewöhnliche Zieldienst muss seine Replikatanzahl behalten; alle Replikate müssen laufen, dürfen nicht unhealthy sein und müssen diese ID verwenden. Dienste mit gemeinsamem Netzwerk-Namespace sind eingeschlossen. Rollierende Updates behalten ihre Gesundheits- und Verbindungsprüfungen; ausstehendes Draining bleibt ungeprüft und ändert das Datum nicht.

Fehlt der lokale Tag, wird das Image des laufenden Containers verwendet. Registry- oder Inspektionsfehler bleiben unbekannt und gelten niemals als aktuell. Eine bestätigte Abweichung ist ein Fehler; eine unmögliche Überprüfung wird als ungeprüft angezeigt. Beide Ergebnisse zählen nicht als erfolgreiches Update und ändern lastUpdated nicht.

Bereinigung und Image-Updates schließen sich gegenseitig aus. Vor dem Pull speichert Enhanced einen Schutz für die Zielreferenz und anschließend die heruntergeladene Image-ID. Ein abgebrochener oder ungeprüfter Versuch behält diesen Schutz 24 Stunden lang, auch nach einem Neustart. Ein überprüfter Erfolg gibt nur den Schutz dieses Vorgangs frei. Die Frist beginnt beim Versuch oder Download, nicht beim Image-Build; nach Ablauf kann die normale Bereinigung ungenutzter Images greifen.

Das Stack-Datum heißt „Letzter Vorgang“ und hat einen erklärenden Tooltip. Es beschreibt einen Vorgang am Stack, möglicherweise nur für einen Dienst, und garantiert nicht, dass alle Dienste aktuell sind. Ergebnisse je Image bleiben im Watcher-Verlauf sichtbar. Pausen, Ausschlüsse, Wartungsfenster und Rollback bleiben erhalten.
