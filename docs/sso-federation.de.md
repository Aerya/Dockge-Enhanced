# Verknüpfte Instanzen hinter SSO

[English](sso-federation.md) · [Français](sso-federation.fr.md) · [Deutsch](sso-federation.de.md) · [Español](sso-federation.es.md) · [简体中文](sso-federation.zh-CN.md)

Optionale einseitige Verbindungen erlauben die Verwaltung eines entfernten Servers ohne Rückverbindung oder Weitergabe im Mesh. Verwenden Sie ein Enhanced-Föderationstoken und bei Bedarf separate HTTP-Basic-Zugangsdaten für den Proxy über HTTPS/WebSocket. Authentik benötigt ein berechtigtes Konto (vorhanden oder vorzugsweise dediziert), ein App-Passwort und Header-Authentifizierung; Enhanced konfiguriert den Proxy nicht. Das öffentliche SSO bleibt aktiv. Richten Sie die Verbindung auf jeder lokalen Instanz separat ein.

## Einrichtung
1. Beide Enhanced-Instanzen aktualisieren. Auf der entfernten Instanz per SSO als Administrator anmelden. Unter Startseite **Föderationstoken erstellen** wählen und das Token vertraulich kopieren.
2. In der Proxy-/SSO-Verwaltung ein vorhandenes oder vorzugsweise dediziertes Konto mit Berechtigung für diese Anwendung verwenden und dafür ein App-Passwort erzeugen (nicht das normale SSO-Passwort). In Authentik **Intercept header authentication** beim Proxy-Provider aktivieren. Der Reverse-Proxy muss den Authorization-Header an den Outpost weiterreichen. Enhanced ändert die Proxy-Konfiguration nicht.
3. Lokal **Agent Hinzufügen** wählen, die entfernte HTTPS-Origin ohne Pfad eingeben, **Föderationstoken** wählen und das Enhanced-Token einfügen.
4. **Nur von dieser Instanz aus verbinden** aktivieren. Authentik-Benutzername des gewählten Kontos und App-Passwort des Proxys in die getrennten HTTP-Basic-Felder eingeben und verbinden. Ohne Proxy-Authentifizierung beide Felder leer lassen.
5. Auf jeder gewünschten lokalen Instanz wiederholen. Eine Rückverbindung des entfernten Servers ins private LAN ist nicht erforderlich.

## Sicherheit und Betrieb
Proxy-Zugangsdaten öffnen nur den Proxy; im trusted-proxy-Modus bleibt das Enhanced-Token erforderlich. Ein endpoint-Header allein authentifiziert keinen Agenten. Browser-SSO bleibt unverändert. HTTPS-Zertifikate werden weiterhin geprüft. Proxy-Authentifizierung nutzt WebSocket ohne Weiterleitungen; der Proxy muss WebSocket-Upgrades erlauben. Nicht jeder SSO-Anbieter wird automatisch unterstützt.

Eigene vertrauenswürdige Administratorkonten verwenden: Föderationstokens erlauben administrative Aktionen. Der bestehende Enhanced-Mechanismus gilt: Deaktivieren/Löschen des ausstellenden Kontos macht Tokens ungültig, ein Passwortwechsel nicht. Eine Oberfläche zum Widerruf einzelner Tokens gibt es nicht. Entfernen der lokalen Verbindung beendet sie; bei einem Token-Leck das ausstellende Konto sperren.

Proxy-Zugangsdaten werden wie bisherige Agent-Zugangsdaten in der lokalen Enhanced-Datenbank gespeichert. Datenverzeichnis und Sicherungen schützen. Die Agentenliste gibt sie nicht zurück, und das Mesh verteilt sie nicht. Einseitige Verbindungen bleiben bei der Mesh-Synchronisierung erhalten und können durch sie nicht überschrieben werden. Bei erneuter Authentifizierung ersetzen zwei ausgefüllte Proxy-Felder die Zugangsdaten; zwei leere Felder entfernen die Proxy-Authentifizierung. Zum Ändern der Richtung die Verbindung entfernen und neu anlegen.

Die Verbindung gehört nur ihrer lokalen Instanz. Der entfernte Server erhält keinen administrativen Zugriff auf diese. Bestehende vollständige Mesh-Verbindungen bleiben unverändert. Es entsteht kein VPN; private Adressen werden nicht erreichbar. Übertragungen und Funktionen mit erforderlicher Rück-/Direktverbindung behalten ihre Netzwerkanforderungen.

[Authentik — Header authentication](https://docs.goauthentik.io/add-secure-apps/providers/proxy/header_authentication/)

