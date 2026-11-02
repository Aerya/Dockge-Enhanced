# Konfigurierbare Befehlspuffer

[en](command-buffers.md) · [fr](command-buffers.fr.md) · [de](command-buffers.de.md) · [es](command-buffers.es.md) · [zh-CN](command-buffers.zh-CN.md)

Die Grenzen erfasster Befehlsausgaben lassen sich über begrenzte Umgebungsvariablen anpassen. Bei Überschreitung nennen Logs Befehlsgruppe, Quellcodeposition und Grenze, ohne Argumente oder erfasste Ausgabe. Standardwerte und Streaming-Befehle bleiben erhalten.

## Konfiguration

Diese Variablen auf jeder Enhanced-Instanz setzen, die Befehle ausführt. Hilfscontainer übernehmen die validierten Werte. Ungültige Werte führen mit Warnung zu den Standardwerten; der angegebene Wert wird nicht protokolliert. Enhanced nach Umgebungsänderungen neu starten/erstellen. Zeitlimits, fachliche Log-Grenzen und Streaming-Übertragungen bleiben unverändert.

| Variable | Standard | Beschreibung |
| --- | --- | --- |
| `DOCKGE_COMMAND_BUFFER_MULTIPLIER` | `1` | Multiplikator vorhandener Grenzen (Ganzzahl 1–16); vorsichtig erhöhen: der Speicherbedarf steigt pro gleichzeitigem Befehl. |
| `DOCKGE_COMMAND_BUFFER_MAX_MIB` | `256` | Absolute Grenze pro Befehl in MiB (Ganzzahl 1–256). |

Standardwerte: Multiplikator 1 und Obergrenze 256 MiB. Effektive Grenze = min(bisherige Grenze × Multiplikator, Obergrenze). Native Befehle beginnen meist bei 1 MiB, erfasste promisify-child-process-Ausgaben bei 200 KiB; die Volume-Prüfung nutzt 4 MiB und behält kleine Gruppen benötigter Felder. Node begrenzt jeden Ausgabestrom; promisify-child-process zählt stdout und stderr zusammen.

```yaml
environment:
  DOCKGE_COMMAND_BUFFER_MULTIPLIER: "2"
  DOCKGE_COMMAND_BUFFER_MAX_MIB: "256"
```

## Diagnose

Ein maxBuffer- oder ENOBUFS-Fehler erzeugt einen [commandBuffer]-Eintrag mit Datei/Zeile, sicherer Befehlsgruppe sowie ursprünglicher und effektiver Grenze in Bytes. Argumente, Umgebungswerte, absolute Pfade und erfasste Ausgaben werden diesem Eintrag nicht hinzugefügt. Der ursprüngliche Fehler wird weitergegeben; andere Fehler werden nicht umklassifiziert. Höhere Grenzen benötigen mehr Speicher und ersetzen keine begrenzten Abfragen.
