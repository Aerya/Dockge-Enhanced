#!/usr/bin/env python3
"""Optional, network-free host inventory. Run on the host, never inside Enhanced."""
import argparse
import datetime
import json
import os
import platform
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

MAX_OUTPUT = 16 * 1024 * 1024
PACKAGE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9+_.:@~-]{0,199}$")


def command(args, accepted=(0,)):
    # A file bounds memory; RLIMIT_FSIZE bounds output without a pipe deadlock.
    import resource
    def limits():
        resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_OUTPUT, MAX_OUTPUT))
    with tempfile.TemporaryFile() as output:
        result = subprocess.run(args, stdout=output, stderr=subprocess.DEVNULL,
                                timeout=120, env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C"},
                                preexec_fn=limits, check=False)
        if result.returncode not in accepted:
            raise RuntimeError("provider failed")
        output.seek(0)
        return output.read(MAX_OUTPUT).decode("utf-8", errors="strict")


def apt(run=command):
    packages = []
    for line in run(["dpkg-query", "-W", "-f=${db:Status-Abbrev}\t${binary:Package}\t${Version}\t${Architecture}\t${source:Package}\t${source:Version}\\n"]).splitlines():
        parts = line.split("\t")
        if len(parts) == 6 and parts[0].startswith("ii"):
            _, name, version, arch, source, source_version = parts
            packages.append(dict(name=name, version=version, arch=arch, source=source or name.split(":")[0], sourceVersion=source_version or version, origin="unknown", available=None))
    updates = {}
    for line in run(["apt-get", "--simulate", "-o", "Debug::NoLocking=1", "upgrade"]).splitlines():
        match = re.match(r"^Inst (\S+) (?:\[[^]]+\] )?\((\S+)", line)
        if match:
            updates[match[1]] = match[2]
    for item in packages:
        item["available"] = updates.get(item["name"], updates.get(item["name"].split(":")[0]))
    return packages, "cached"


def pacman(run=command):
    foreign = {line.split()[0] for line in run(["pacman", "-Qm"], (0, 1)).splitlines() if line}
    packages = []
    for line in run(["pacman", "-Q"]).splitlines():
        name, version = line.split(" ", 1)
        packages.append(dict(name=name, version=version, arch=platform.machine(), source=name, sourceVersion=version,
                             origin="foreign" if name in foreign else "repository", available=None))
    if shutil.which("checkupdates"):
        output = run(["checkupdates"], (0, 2))
        freshness = "refreshed"
    else:
        output = run(["pacman", "-Qu"], (0, 1))
        freshness = "cached"
    updates = {}
    for line in output.splitlines():
        match = re.match(r"^(\S+) \S+ -> (\S+)$", line)
        if match:
            updates[match[1]] = match[2]
    for item in packages:
        item["available"] = updates.get(item["name"])
    return packages, freshness


PROVIDERS = {"apt": apt, "pacman": pacman}


def collect():
    if Path("/.dockerenv").exists() or Path("/run/.containerenv").exists() or os.environ.get("container"):
        raise RuntimeError("collector must run on the host")
    release = {}
    for line in Path("/etc/os-release").read_text().splitlines():
        key, sep, value = line.partition("=")
        if sep and key in ("ID", "VERSION_ID", "PRETTY_NAME", "ID_LIKE"):
            release[key] = value.strip('"\'')[:200]
    provider = "apt" if shutil.which("dpkg-query") and shutil.which("apt-get") else "pacman" if shutil.which("pacman") else "unsupported"
    packages, freshness = PROVIDERS[provider]() if provider in PROVIDERS else ([], "unavailable")
    if len(packages) > 100000 or any(not PACKAGE.fullmatch(p["name"]) for p in packages):
        raise RuntimeError("invalid inventory")
    return dict(schemaVersion=1, collectedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                host=platform.node(), os=release.get("ID", "unknown"), osVersion=release.get("VERSION_ID", ""),
                osName=release.get("PRETTY_NAME", "unknown"), arch=platform.machine(), kernel=platform.release(),
                uptime=float(Path("/proc/uptime").read_text().split()[0]), provider=provider,
                metadata=freshness, complete=provider in PROVIDERS, packages=packages,
                reboot="required" if Path("/run/reboot-required").exists() else "unknown",
                capabilities=["inventory", "updates"] if provider in PROVIDERS else [])


def write_report(directory, report, filename="inventory.json"):
    directory = Path(directory)
    if directory.is_symlink() or not directory.is_dir():
        raise RuntimeError("invalid report directory")
    data = json.dumps(report, ensure_ascii=True, separators=(",", ":")).encode()
    if len(data) > MAX_OUTPUT:
        raise RuntimeError("inventory too large")
    fd, temporary = tempfile.mkstemp(prefix=".inventory-", dir=directory)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
            os.fchmod(output.fileno(), 0o644)
        os.replace(temporary, directory / filename)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="/var/lib/dockge-host-reports")
    args = parser.parse_args()
    try:
        write_report(args.output, collect())
    except Exception:
        # Keep last successful report: the consumer marks it stale. Never log command output.
        raise SystemExit("Host inventory failed; previous report retained")
