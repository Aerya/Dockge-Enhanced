# Windows 11 mit Docker Desktop (WSL2)

[English](windows.md) · [Français](windows.fr.md) · [Deutsch](windows.de.md) · [Español](windows.es.md) · [简体中文](windows.zh-CN.md)

Enhanced läuft als **Linux-Container**, nicht als nativer Windows-Dienst oder Windows-Container. Docker Desktop mit WSL2-Engine und aktivierter Integration der Linux-Distribution verwenden. Compose ist bereits enthalten; keine zweite Docker Engine in WSL installieren.

In Docker Desktop **Use the WSL 2 based engine** und unter **Resources → WSL Integration** die Distribution aktivieren. Im Terminal dieser Distribution prüfen:

```bash
docker version
docker compose version
mkdir -p "$HOME/dockge-enhanced"/{data,stacks,backups}
cd "$HOME/dockge-enhanced"
```

Empfohlen wird das Linux-Dateisystem der Distribution (etwa `/home/user/dockge-enhanced`), nicht `/mnt/c`. Daten und Stacks getrennt einbinden. Das Stack-Verzeichnis benötigt **denselben absoluten Pfad in Enhanced und auf dem Docker-Host**.

Dort `compose.yaml` erstellen:

```yaml
services:
  dockge:
    image: ghcr.io/aerya/dockge-enhanced:latest
    container_name: dockge-enhanced
    restart: unless-stopped
    ports:
      - "5001:5001"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ${HOME}/dockge-enhanced/data:/app/data
      - ${HOME}/dockge-enhanced/stacks:${HOME}/dockge-enhanced/stacks
      - ${HOME}/dockge-enhanced/backups:/backup
    environment:
      DOCKGE_STACKS_DIR: ${HOME}/dockge-enhanced/stacks
      DOCKGE_DATA_DIR: /app/data
```

Danach `docker compose up -d` ausführen, `http://localhost:5001` öffnen und ein Administratorkonto erstellen. Den Docker-Socket privat halten: Er ermöglicht die Kontrolle über die Linux-Docker-Engine. Testinstanzen benötigen separate Verzeichnisse und einen anderen Port.

Restic kann `/backup` als lokales Ziel nutzen. Verwaltetes Zerobyte wurde mit **Linux-WSL-Quell- und Zielverzeichnissen** getestet, getrennt von Enhanced-Daten und Stacks. Pfad- und Speicheridentitätsprüfungen nicht für abgelehnte Pfade abschwächen. Zuerst in einen eigenen Testbereich wiederherstellen. Eine Sicherung in derselben Windows-VM/auf demselben Datenträger schützt nicht vor dessen Verlust.

Die NTFS-Variante wurde ebenfalls für Compose, `.env`, relative Pfade mit Leerzeichen, benannte Volumes und Restic getestet. Beim Start aus PowerShell `C:/...` als Bind-Quelle und `/run/desktop/mnt/host/c/...` als passenden Stack-Zielpfad/`DOCKGE_STACKS_DIR` verwenden. Diese Docker-Desktop-Zuordnung ist nicht auf Linux übertragbar. NTFS-Freigaben garantieren nicht dieselben Eigentümer-, chmod- oder Leistungseigenschaften wie Linux; für Datenbanken Linux-WSL-Speicher/benannte Volumes bevorzugen. Verwaltetes Zerobyte auf NTFS ist nicht validiert; die WSL-Konfiguration oben verwenden.

- Docker Desktop muss laufen. Der Start bei Anmeldung ist kein unbeaufsichtigter Windows-Systemdienst; nach einem Neustart anmelden und auf die Linux-Engine warten. `restart: unless-stopped` startet Docker Desktop nicht.
- CPU/RAM, Datenträgerstatistiken und Speicherprüfung beim Self-Update sehen die Linux-VM/Docker-Dateisysteme, nicht ganz Windows. Auch den freien Windows-Speicher prüfen: Die scheinbare Kapazität eines virtuellen Datenträgers ist kein reservierter Host-Speicher.
- Host-systemd, Linux-Hardwaresensoren, Host-Netzwerk, USB/GPU und NAS-Netzwerk-Mounts entsprechen nicht nativem Linux. Nicht davon ausgehen, dass PowerWatch durch diese VM Windows-Hardware messen kann.
- Verbundene Instanzen müssen ihre konfigurierten Adressen erreichen. `localhost` bezeichnet den Aufrufer; `host.docker.internal` dient Containern zum Zugriff auf diesen Windows-Host, nicht als öffentliche Adresse für andere Server. Die Windows-Firewall nur für vertrauenswürdige Clients öffnen.

Tests in einer isolierten Windows 11 Enterprise Evaluation 26H2-VM, Docker Desktop 4.97 / Engine 29.9, WSL 3.0.3 und Ubuntu 24.04: Compose/ENV, Nicht-root-Zugriff, benannte/relative Volumes, Healthchecks, CPU/RAM-Limits, Neustart/Neuerstellung, SQLite/node-pty und Browser-Terminal, Restic-Snapshot/Wiederherstellung, verwaltetes Zerobyte mit geschützten Hooks und Wiederherstellung sowie zwei verbundene Instanzen und eingeschränkte Rechte. Der Sidecar verwendet ein Linux-Ziel und behält die von Docker gemeldete Windows-Quelle bei. Keine Unterstützung nativer Windows-Container behauptet.

**Nach einem Windows-Neustart:** Mit Docker Desktop 4.97 schlug der automatische Start mit WSL-Bind-Mounts in diesem Test fehl: Der Socket war nicht verfügbar und ein Container sah ein leeres Verzeichnis, obwohl die echten WSL-Dateien erhalten waren. Führen Sie bei einem scheinbar leeren Verzeichnis nicht erneut die Ersteinrichtung aus. Warten Sie, bis `docker version` in Ihrer Distribution funktioniert, prüfen Sie die Dateien in `data` und `stacks` und führen Sie im Installationsverzeichnis `docker compose up -d` aus. Starten Sie in Enhanced gestoppte Stacks und starten Sie Stacks mit unvollständigen Mounts neu. Diese Wiederaufnahme, bestehende Konten und eine neue Zerobyte-Sicherung/Wiederherstellung wurden geprüft. Die NTFS-Variante startete in diesem Test automatisch. Ein vollständig unbeaufsichtigter WSL-Start ist daher **nicht validiert**; dieses Mount-Problem wurde auch [Docker Desktop gemeldet](https://github.com/docker/desktop-feedback/issues/601).

[Docker Desktop / WSL](https://docs.docker.com/desktop/features/wsl/) · [WSL filesystems](https://learn.microsoft.com/en-us/windows/wsl/filesystems)
