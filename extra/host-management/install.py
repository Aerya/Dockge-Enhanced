"""Fixed host setup, invoked only by the explicitly approved bundled installer."""
import base64
import fcntl
import json
import os
from pathlib import Path
import pwd
import re
import stat
import subprocess
import sys
import tempfile

FILES = ('collector.py', 'executor.py', 'apt_provider.py', 'dockge-host-collector.service', 'dockge-host-collector.timer', 'dockge-host-executor.service', 'dockge-host-executor.timer')
SCOPES = ('all', 'security', 'conservative', 'security-conservative')


def validate(options):
    if not isinstance(options, dict) or set(options) != {'mode', 'scopes', 'hours', 'packages', 'refreshMetadata'}:
        raise ValueError('invalid options')
    if options['mode'] not in ('monitor', 'manual', 'automatic') or type(options['refreshMetadata']) is not bool:
        raise ValueError('invalid mode')
    if not isinstance(options['scopes'], list) or not options['scopes'] or any(s not in SCOPES for s in options['scopes']):
        raise ValueError('invalid scopes')
    if not isinstance(options['hours'], list) or not options['hours'] or any(type(h) is not int or not 0 <= h <= 23 for h in options['hours']):
        raise ValueError('invalid hours')
    if not isinstance(options['packages'], list) or len(options['packages']) > 500 or any(not isinstance(p, str) or not re.fullmatch(r'[a-z0-9][a-z0-9+.-]{0,199}', p) for p in options['packages']):
        raise ValueError('invalid packages')
    return options


def safe_directory(directory, mode=0o755):
    # Never follow a writable or symlinked destination into unrelated host data.
    current = Path('/')
    for part in Path(directory).parts[1:]:
        current /= part
        try:
            info = current.lstat()
        except FileNotFoundError:
            current.mkdir(mode=mode if current == Path(directory) else 0o755)
            info = current.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise ValueError('unsafe installation directory')


def atomic(directory, name, content, mode=0o644):
    target = Path(directory) / name
    if target.exists() or target.is_symlink():
        info = target.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_nlink != 1 or info.st_mode & 0o022:
            raise ValueError('unsafe existing file')
    fd, temporary = tempfile.mkstemp(dir=directory)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), mode)
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def run(args, accepted=(0,)):
    result = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LC_ALL': 'C', 'DEBIAN_FRONTEND': 'noninteractive'}, check=False)
    if result.returncode not in accepted:
        raise ValueError('host setup command failed')
    return result.returncode


def install(payload):
    options = validate(payload['options'])
    if set(payload['files']) != set(FILES):
        raise ValueError('invalid bundle')
    release = dict(line.split('=', 1) for line in Path('/etc/os-release').read_text().splitlines() if '=' in line)
    distro = release.get('ID', '').strip('"')
    if distro not in ('debian', 'ubuntu', 'arch', 'garuda') or not Path('/run/systemd/system').is_dir():
        raise ValueError('unsupported host')
    if options['mode'] != 'monitor' and (distro not in ('debian', 'ubuntu') or release.get('RELEASE_TYPE', '').strip('"') == 'rolling' or not re.fullmatch(r'[0-9]+(?:\.[0-9]+)*', release.get('VERSION_ID', '').strip('"'))):
        raise ValueError('updates unsupported on this host')
    # Never replace an executor while apt/dpkg may still be writing.
    if run(['systemctl', 'is-active', '--quiet', 'dockge-host-executor.service'], (0, 3, 4)) == 0:
        raise ValueError('executor busy')
    for directory, mode in [('/usr/local/lib/dockge-host', 0o755), ('/etc/dockge-host', 0o700), ('/var/lib/dockge-host-executor', 0o700), ('/var/lib/dockge-host-operations', 0o755), ('/var/lib/dockge-host-requests', 0o700), ('/etc/systemd/system', 0o755)]:
        safe_directory(directory, mode)
    try:
        pwd.getpwnam('dockge-host')
    except KeyError:
        run(['useradd', '--system', '--no-create-home', '--shell', '/usr/sbin/nologin', 'dockge-host'])
    # Existing local exclusions survive an explicitly approved policy change.
    previous = Path('/etc/dockge-host/policy.json')
    exclusions = []
    if previous.exists() or previous.is_symlink():
        info = previous.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_nlink != 1 or info.st_mode & 0o022 or info.st_size > 65536:
            raise ValueError('unsafe existing policy')
        old = previous.read_bytes()
        exclusions = json.loads(old).get('exclusions', [])
        atomic(previous.parent, 'policy.previous.json', old, 0o600)
    for name in FILES:
        content = base64.b64decode(payload['files'][name], validate=True)
        if len(content) > 262144:
            raise ValueError('oversized bundle')
        atomic('/etc/systemd/system' if name.endswith(('.service', '.timer')) else '/usr/local/lib/dockge-host', name, content)
    if options['mode'] != 'monitor':
        check = subprocess.run(['/usr/bin/python3', '-c', 'import apt, apt_pkg'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if check.returncode:
            run(['/usr/bin/apt-get', '-o', 'APT::Update::Error-Mode=any', 'update'])
            run(['/usr/bin/apt-get', '--assume-yes', '--no-remove', '--no-install-recommends', 'install', 'python3-apt'])
    policy = {'mode': 'disabled' if options['mode'] == 'monitor' else options['mode'], 'allowInstall': options['mode'] != 'monitor',
              'allowAutomatic': options['mode'] == 'automatic', 'allowedScopes': options['scopes'], 'utcHours': options['hours'],
              'conservativePackages': options['packages'], 'exclusions': exclusions, 'refreshMetadata': options['refreshMetadata']}
    atomic('/etc/dockge-host', 'policy.json', json.dumps(policy).encode(), 0o600)
    if options['mode'] != 'automatic':
        schedule_path = Path('/var/lib/dockge-host-executor/schedule.json')
        if schedule_path.exists() or schedule_path.is_symlink():
            info = schedule_path.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or info.st_size > 65536:
                raise ValueError('unsafe schedule')
            schedule = json.loads(schedule_path.read_text())
            schedule['enabled'] = False
            atomic(schedule_path.parent, 'schedule.json', json.dumps(schedule).encode(), 0o600)
    run(['systemctl', 'daemon-reload'])
    run(['systemctl', 'enable', '--now', 'dockge-host-collector.timer'])
    run(['systemctl', 'start', 'dockge-host-collector.service'])
    if options['mode'] == 'monitor':
        run(['systemctl', 'disable', '--now', 'dockge-host-executor.timer'])
        # Refresh capabilities even in monitoring mode; this cannot execute any update.
        run(['/usr/bin/python3', '/usr/local/lib/dockge-host/executor.py']) if distro in ('debian', 'ubuntu') else None
    else:
        run(['systemctl', 'enable', '--now', 'dockge-host-executor.timer'])
    print(json.dumps({'ok': True, 'mode': options['mode']}))


def main():
    if os.geteuid() != 0 or Path('/.dockerenv').exists() or Path('/run/.containerenv').exists():
        raise ValueError('host namespace required')
    fd = os.open('/run/dockge-host-install.lock', os.O_CREAT | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        raw = sys.stdin.buffer.read(2 * 1024 * 1024 + 1)
        if len(raw) > 2 * 1024 * 1024:
            raise ValueError('oversized bundle')
        install(json.loads(raw))
    finally:
        os.close(fd)

if __name__ == '__main__':
    try:
        main()
    except Exception:
        raise SystemExit('Host setup failed; retry after checking host support and active package operations')
