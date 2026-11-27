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
import secrets
import apt_provider
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
    if not isinstance(request, dict) or set(request) - {'id', 'action', 'expires', 'plan', 'approved', 'hostId', 'scope', 'schedule'}:
        raise ValueError('invalid request')
    if not re.fullmatch(r'[a-f0-9]{32}', str(request.get('id', ''))):
        raise ValueError('invalid id')
    if request.get('action') not in ('simulate', 'install', 'schedule') or type(request.get('expires')) not in (int, float):
        raise ValueError('invalid operation')
    if not now < request['expires'] <= now + 300:
        raise ValueError('expired')
    if request.get('hostId') != host_identity():
        raise ValueError('wrong host')
    if request.get('scope', 'all') not in apt_provider.SCOPES:
        raise ValueError('invalid scope')
    if request['action'] == 'schedule':
        validate_schedule(request.get('schedule'))
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


def simulate(run=command, exclusions=(), scope="all", allowed=()):
    if scope != "all":
        selected = apt_provider.candidates(scope, exclusions, allowed)
        for item in selected:
            if not NAME.fullmatch(item["name"]) or not VERSION.fullmatch(item["version"]):
                raise ValueError("invalid candidate")
        output = run(["/usr/bin/apt-get", "--simulate", "--no-remove", "--no-install-recommends", "--only-upgrade", "install"] + [p["name"] + "=" + p["version"] for p in selected]) if selected else ""
        packages = parse_plan(output)
        if packages != selected:
            raise ValueError("dependency outside selected scope")
    else:
        output = run(['/usr/bin/apt-get', '--simulate', '--no-remove', '--no-install-recommends', 'upgrade'])
        packages = parse_plan(output)
    if any(p['name'] in exclusions or p['name'].split(':')[0] in exclusions for p in packages):
        raise ValueError('excluded package in plan')
    state = run(['/usr/bin/dpkg-query', '-W', '-f=${binary:Package}\t${Version}\t${db:Status-Abbrev}\\n'])
    payload = {'packages': packages, 'scope': scope, 'state': hashlib.sha256(state.encode()).hexdigest()}
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


def validate_schedule(schedule):
    if not isinstance(schedule, dict) or set(schedule) != {'enabled', 'days', 'hour', 'minute', 'scope'}:
        raise ValueError('invalid schedule')
    if type(schedule['enabled']) is not bool or not isinstance(schedule['days'], list) or not 1 <= len(schedule['days']) <= 7:
        raise ValueError('invalid schedule')
    if any(type(d) is not int or d not in range(7) for d in schedule['days']) or len(set(schedule['days'])) != len(schedule['days']):
        raise ValueError('invalid days')
    if type(schedule['hour']) is not int or schedule['hour'] not in range(24) or type(schedule['minute']) is not int or schedule['minute'] not in range(60):
        raise ValueError('invalid time')
    if schedule['scope'] not in apt_provider.SCOPES:
        raise ValueError('invalid scope')
    return schedule


def authorized(policy, scope, automatic=False, window=True):
    if policy.get('mode') not in ('manual', 'automatic') or policy.get('allowInstall') is not True:
        raise ValueError('local authorization required')
    if automatic and not apt_provider.stable_system():
        raise ValueError('rolling or unsupported system')
    if automatic and (policy.get('mode') != 'automatic' or policy.get('allowAutomatic') is not True):
        raise ValueError('automatic not authorized')
    scopes = policy.get('allowedScopes', ['all'])
    if not isinstance(scopes, list) or any(s not in apt_provider.SCOPES for s in scopes) or scope not in scopes:
        raise ValueError('scope not authorized')
    for key in ('exclusions', 'conservativePackages'):
        values = policy.get(key, [])
        if not isinstance(values, list) or len(values) > 500 or any(not isinstance(p, str) or not NAME.fullmatch(p) for p in values):
            raise ValueError('invalid local policy')
    hours = policy.get('utcHours', [])
    if not isinstance(hours, list) or any(type(h) is not int or h not in range(24) for h in hours):
        raise ValueError('invalid window')
    if window and datetime.datetime.now(datetime.timezone.utc).hour not in hours:
        raise ValueError('outside maintenance window')


def refresh_metadata(policy):
    if policy.get('refreshMetadata') is True:
        # Native APT locks; no kill during writes, and no potentially sensitive output.
        result = subprocess.run(['/usr/bin/apt-get', '-o', 'APT::Update::Error-Mode=any', 'update'],
                                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LC_ALL': 'C'}, check=False)
        if result.returncode:
            raise ValueError('metadata refresh failed')


def process(request, policy, run=command, execute=install):
    validate_request(request)
    scope = request.get('scope', 'all')
    if request['action'] == 'schedule':
        schedule = validate_schedule(request['schedule'])
        # Revoking a schedule must remain possible after local installation authority is removed.
        if schedule['enabled']:
            authorized(policy, schedule['scope'], automatic=True, window=False)
        if schedule['enabled'] and schedule['hour'] not in policy.get('utcHours', []):
            raise ValueError('schedule outside maintenance window')
        write_report(STATE, schedule, 'schedule.json')
        return {'state': 'scheduled', 'scope': schedule['scope'], 'schedule': schedule}
    authorized(policy, scope)
    if request['action'] == 'simulate':
        refresh_metadata(policy)
    plan = simulate(run, policy.get('exclusions', []), scope, policy.get('conservativePackages', []))
    if request['action'] == 'simulate':
        return {'state': 'simulated', 'scope': scope, 'plan': plan['digest'], 'packages': plan['packages'], 'expires': time.time() + 300}
    saved = safe_json(STATE / 'plan.json', root=True, maximum=512 * 1024)
    if saved.get('plan') != request['plan'] or saved.get('expires', 0) <= time.time() or plan['digest'] != request['plan'] or saved.get('scope', 'all') != scope:
        raise ValueError('obsolete plan')
    os.unlink(STATE / 'plan.json')
    return {'state': 'complete' if execute(plan, run) == 0 else 'failed', 'scope': scope, 'plan': plan['digest'], 'packages': plan['packages']}


def publish(result):
    result = {'hostId': host_identity(), **result}
    write_report(OUTBOX, result)
    write_report(OUTBOX, result, result['id'] + '.json')
    try:
        events = safe_json(STATE / 'events.json', root=True, maximum=512 * 1024)
    except FileNotFoundError:
        events = []
    event = {k: result[k] for k in ('hostId', 'id', 'at', 'state', 'scope', 'automatic', 'reason') if k in result}
    event['count'] = len(result.get('packages', []))
    events = (events + [event])[-100:]
    write_report(STATE, events, 'events.json')
    write_report(OUTBOX, events, 'events.json')


def run_schedule(policy, now=None, run=command, execute=install):
    now = now or datetime.datetime.now(datetime.timezone.utc)
    try:
        schedule = validate_schedule(safe_json(STATE / 'schedule.json', root=True))
    except FileNotFoundError:
        return
    if not schedule['enabled'] or now.weekday() not in schedule['days']:
        return
    scheduled_minute = schedule['hour'] * 60 + schedule['minute']
    # No catch-up outside the five-minute window, including after reboot/reconnection.
    if not 0 <= now.hour * 60 + now.minute - scheduled_minute < 5:
        return
    slot = now.strftime('%Y-%m-%d') + '-' + str(scheduled_minute)
    marker = STATE / ('schedule-' + slot + '.used')
    try:
        fd = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    except FileExistsError:
        return
    os.close(fd)
    scope = schedule['scope']
    event = {'id': secrets.token_hex(16), 'at': time.time(), 'state': 'running', 'scope': scope, 'automatic': True}
    publish(event)
    try:
        authorized(policy, scope, automatic=True)
        refresh_metadata(policy)
        plan = simulate(run, policy.get('exclusions', []), scope, policy.get('conservativePackages', []))
        # The root-owned policy is the explicit approval for this fresh local scheduled plan.
        event.update({'state': 'complete' if execute(plan, run) == 0 else 'failed', 'packages': plan['packages']})
    except Exception:
        event.update({'state': 'failed', 'reason': 'policy-or-package-manager'})
    event['at'] = time.time()
    publish(event)


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
                             'manual': policy.get('mode') in ('manual', 'automatic') and policy.get('allowInstall') is True,
                             'automatic': policy.get('mode') == 'automatic' and policy.get('allowAutomatic') is True and policy.get('allowInstall') is True and apt_provider.stable_system(),
                             'scopes': [scope for scope in policy.get('allowedScopes', ['all']) if scope in apt_provider.SCOPES and (scope == 'all' or apt_provider.available())],
                             'schedule': safe_json(STATE / 'schedule.json', root=True) if (STATE / 'schedule.json').exists() else None}, 'capabilities.json')
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
            result = {'id': request['id'], 'at': time.time(), 'state': 'running', 'scope': request.get('scope', 'all'), 'automatic': False}
            if request['action'] == 'install':
                publish(result)
            result['state'] = 'failed'
            try:
                result.update(process(request, policy))
                if result['state'] == 'simulated':
                    write_report(STATE, result)
                    os.replace(STATE / 'inventory.json', STATE / 'plan.json')
            except Exception:
                pass
            result['at'] = time.time()
            publish(result)
            # Expired ids cannot be replayed, so markers can be pruned after one day.
        run_schedule(policy)
        for marker in STATE.glob('*.used'):
            if marker.stat().st_mtime < time.time() - 86400:
                marker.unlink()
        for report in OUTBOX.glob('*.json'):
            if re.fullmatch(r'[a-f0-9]{32}\.json', report.name) and report.lstat().st_mtime < time.time() - 90 * 86400:
                report.unlink()
    finally:
        os.close(lock)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        raise SystemExit('Host operation refused or executor unavailable')
