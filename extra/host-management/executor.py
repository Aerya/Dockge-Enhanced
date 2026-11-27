#!/usr/bin/env python3
"""Local, opt-in APT executor. No network listener, shell, or remote policy update."""
import datetime
import fcntl
import hashlib
import json
import os
import re
import stat
import subprocess
import time
from pathlib import Path
from collector import command, write_report, host_identity

POLICY = Path('/etc/dockge-host/policy.json')
INBOX = Path('/var/lib/dockge-host-requests')
STATE = Path('/var/lib/dockge-host-executor')
OUTBOX = Path('/var/lib/dockge-host-operations')
NAME = re.compile(r'^[a-z0-9][a-z0-9+.-]*(?::[a-z0-9][a-z0-9-]*)?$')
VERSION = re.compile(r'^[0-9A-Za-z][0-9A-Za-z.+:~_-]{0,199}$')


def safe_json(path, root=False, maximum=65536):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > maximum:
            raise ValueError('invalid file')
        if root and (info.st_uid != 0 or info.st_mode & 0o022):
            raise ValueError('unsafe ownership')
        data = os.read(fd, maximum + 1)
        if len(data) > maximum:
            raise ValueError('oversized file')
        return json.loads(data)
    finally:
        os.close(fd)


def validate_request(request, now=None):
    now = time.time() if now is None else now
    if not isinstance(request, dict) or set(request) - {'id', 'action', 'expires', 'plan', 'approved', 'hostId'}:
        raise ValueError('invalid request')
    if not re.fullmatch(r'[a-f0-9]{32}', str(request.get('id', ''))):
        raise ValueError('invalid id')
    if request.get('action') not in ('simulate', 'install') or type(request.get('expires')) not in (int, float):
        raise ValueError('invalid operation')
    if not now < request['expires'] <= now + 300:
        raise ValueError('expired')
    if request.get('hostId') != host_identity():
        raise ValueError('wrong host')
    if request['action'] == 'install' and (request.get('approved') is not True or not re.fullmatch(r'[a-f0-9]{64}', str(request.get('plan', '')))):
        raise ValueError('approval required')
    return request


def parse_plan(output):
    packages = []
    for line in output.splitlines():
        if line.startswith('Remv '):
            raise ValueError('removal forbidden')
        if line.startswith('Inst '):
            match = re.match(r'^Inst (\S+) \[([^]]+)\] \((\S+)', line)
            # New packages/dependency changes are intentionally not authorized.
            if not match or not NAME.fullmatch(match[1]) or not VERSION.fullmatch(match[2]) or not VERSION.fullmatch(match[3]):
                raise ValueError('unsupported plan')
            packages.append({'name': match[1], 'installed': match[2], 'version': match[3]})
    if len(packages) > 500 or len({p['name'] for p in packages}) != len(packages):
        raise ValueError('invalid plan')
    return sorted(packages, key=lambda p: p['name'])


def simulate(run=command, exclusions=()):
    output = run(['/usr/bin/apt-get', '--simulate', '--no-remove', '--no-install-recommends', 'upgrade'])
    packages = parse_plan(output)
    if any(p['name'] in exclusions or p['name'].split(':')[0] in exclusions for p in packages):
        raise ValueError('excluded package in plan')
    state = run(['/usr/bin/dpkg-query', '-W', '-f=${binary:Package}\t${Version}\t${db:Status-Abbrev}\\n'])
    payload = {'packages': packages, 'state': hashlib.sha256(state.encode()).hexdigest()}
    payload['digest'] = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    return payload


def install(plan, run=command):
    if not plan['packages']:
        return 0
    args = ['/usr/bin/apt-get', '--assume-yes', '--no-remove', '--no-install-recommends', '--only-upgrade',
            '-o', 'Dpkg::Options::=--force-confold', 'install']
    args += [p['name'] + '=' + p['version'] for p in plan['packages']]
    preview = parse_plan(run([args[0], '--simulate'] + args[1:]))
    if preview != plan['packages']:
        raise ValueError('plan changed')
    # No timeout or kill during writes. Native apt/dpkg locks remain enabled.
    # Output is discarded: it may include repository credentials or maintainer-script secrets.
    result = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LC_ALL': 'C', 'DEBIAN_FRONTEND': 'noninteractive'}, check=False)
    return result.returncode


def process(request, policy, run=command, execute=install):
    validate_request(request)
    if policy.get('mode') != 'manual' or policy.get('allowInstall') is not True:
        raise ValueError('local authorization required')
    exclusions = policy.get('exclusions', [])
    if not isinstance(exclusions, list) or any(not isinstance(p, str) or not NAME.fullmatch(p) for p in exclusions):
        raise ValueError('invalid local policy')
    now = datetime.datetime.now(datetime.timezone.utc)
    hours = policy.get('utcHours', [])
    if not isinstance(hours, list) or any(type(h) is not int or h not in range(24) for h in hours) or now.hour not in hours:
        raise ValueError('outside maintenance window')
    plan = simulate(run, exclusions)
    if request['action'] == 'simulate':
        return {'state': 'simulated', 'plan': plan['digest'], 'packages': plan['packages'], 'expires': time.time() + 300}
    saved = safe_json(STATE / 'plan.json', root=True)
    if saved.get('plan') != request['plan'] or saved.get('expires', 0) <= time.time() or plan['digest'] != request['plan']:
        raise ValueError('obsolete plan')
    # Consume the approval before executing, including on failure or process crash.
    os.unlink(STATE / 'plan.json')
    return {'state': 'complete' if execute(plan, run) == 0 else 'failed', 'plan': plan['digest'], 'packages': plan['packages']}


def main():
    if os.geteuid() != 0 or Path('/.dockerenv').exists() or Path('/run/.containerenv').exists():
        raise ValueError('run locally as root')
    release = dict(line.split('=', 1) for line in Path('/etc/os-release').read_text().splitlines() if '=' in line)
    if release.get('ID', '').strip('\"') not in ('debian', 'ubuntu'):
        raise ValueError('unsupported distribution')
    policy = safe_json(POLICY, root=True)
    # Directories must be provisioned locally; requests is the only writable mount in Enhanced.
    for directory in (STATE, OUTBOX):
        info = directory.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise ValueError('unsafe state directory')
    lock = os.open(STATE / 'lock', os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        write_report(OUTBOX, {'schemaVersion': 1, 'hostId': host_identity(), 'expires': time.time() + 60,
                             'manual': policy.get('mode') == 'manual' and policy.get('allowInstall') is True,
                             'automatic': False}, 'capabilities.json')
        for file in sorted(INBOX.glob('*.json'))[:20]:
            if not re.fullmatch(r'[a-f0-9]{32}\.json', file.name):
                continue
            try:
                request = safe_json(file)
                validate_request(request)
                if file.stem != request['id']:
                    raise ValueError('id mismatch')
            except Exception:
                file.unlink(missing_ok=True)
                continue
            marker = STATE / (request['id'] + '.used')
            try:
                fd = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            except FileExistsError:
                file.unlink(missing_ok=True)
                continue
            os.close(fd)
            file.unlink()
            result = {'id': request['id'], 'at': time.time(), 'state': 'failed'}
            try:
                result.update(process(request, policy))
                if result['state'] == 'simulated':
                    write_report(STATE, result)
                    os.replace(STATE / 'inventory.json', STATE / 'plan.json')
            except Exception:
                pass
            write_report(OUTBOX, result)
            write_report(OUTBOX, result, request['id'] + '.json')
            # Expired ids cannot be replayed, so markers can be pruned after one day.
        for marker in STATE.glob('*.used'):
            if marker.stat().st_mtime < time.time() - 86400:
                marker.unlink()
    finally:
        os.close(lock)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        raise SystemExit('Host operation refused or executor unavailable')
