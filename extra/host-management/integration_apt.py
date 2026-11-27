#!/usr/bin/env python3
"""CI only: real APT transaction in a disposable dpkg root with a local file repo."""
import hashlib
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path
from unittest.mock import patch
import executor
import apt_provider

if os.environ.get('GITHUB_ACTIONS') != 'true' or os.geteuid() != 0:
    raise SystemExit('Only run as root on the disposable GitHub Actions VM')

real_run = subprocess.run

def invoke(args, **kwargs):
    return real_run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, **kwargs).stdout

with tempfile.TemporaryDirectory(prefix='dockge-apt-test-') as temp:
    base = Path(temp)
    root = base / 'root'
    repo = base / 'repo'
    state = base / 'executor'
    for directory in [root / 'var/lib/dpkg', root / 'var/log', repo, state, base / 'apt/etc/apt', base / 'apt/var/lib/apt/lists/partial', base / 'apt/var/cache/apt/archives/partial', base / 'apt/var/log/apt']:
        directory.mkdir(parents=True, exist_ok=True)
    (root / 'var/lib/dpkg/status').touch()
    entries = []
    for version in ['1.0', '2.0']:
        package = base / ('pkg-' + version)
        (package / 'DEBIAN').mkdir(parents=True)
        (package / 'DEBIAN/control').write_text(f'Package: dockge-host-test\nVersion: {version}\nArchitecture: all\nMaintainer: Test <test@example.invalid>\nDescription: disposable package without scripts\n')
        output = repo / ('dockge-host-test_' + version + '.deb')
        invoke(['dpkg-deb', '--build', str(package), str(output)])
        content = output.read_bytes()
        entries.append((package / 'DEBIAN/control').read_text() + f'Filename: {output.name}\nSize: {len(content)}\nSHA256: {hashlib.sha256(content).hexdigest()}\n')
    (repo / 'Packages').write_text('\n'.join(entries))
    (repo / 'Release').write_text('Origin: Debian\nLabel: Debian-Security\nSuite: oldstable-security\nCodename: bookworm-security\nArchitectures: amd64\nDescription: disposable security repository\n')
    invoke(['dpkg', '--root=' + str(root), '--install', str(repo / 'dockge-host-test_1.0.deb')])
    (base / 'apt/etc/apt/sources.list').write_text(f'deb [trusted=yes] file:{repo} ./\n')
    config = base / 'apt.conf'
    config.write_text(f'''Dir "{base / 'apt'}";
Dir::State::status "{root / 'var/lib/dpkg/status'}";
Dir::Etc::sourcelist "sources.list";
Dir::Etc::sourceparts "-";
Dir::Etc::main "-";
Dir::Etc::parts "-";
APT::Architecture "amd64";
APT::Sandbox::User "root";
DPkg::Options {{ "--root={root}"; }};
''')
    invoke(['/usr/bin/apt-get', '-c', str(config), 'update'], env={**os.environ, 'APT_CONFIG': str(config)})

    def isolated_args(args):
        if args[0] == '/usr/bin/apt-get':
            return [args[0], '-c', str(config)] + args[1:]
        if args[0] == '/usr/bin/dpkg-query':
            return [args[0], '--admindir=' + str(root / 'var/lib/dpkg')] + args[1:]
        raise AssertionError('unexpected executable')

    def read_command(args, accepted=(0,)):
        return invoke(isolated_args(args), env={**os.environ, 'APT_CONFIG': str(config)})

    def write_command(args, **kwargs):
        kwargs['env'] = {**kwargs.get('env', {}), 'APT_CONFIG': str(config)}
        return real_run(isolated_args(args), **kwargs)

    policy = {'mode': 'manual', 'allowInstall': True, 'utcHours': list(range(24)), 'exclusions': []}
    request = {'hostId': executor.host_identity(), 'id': 'a' * 32, 'action': 'simulate', 'expires': time.time() + 120}
    with patch.object(executor, 'STATE', state):
        plan = executor.process(request, policy, read_command)
        assert plan['packages'] == [{'name': 'dockge-host-test', 'installed': '1.0', 'version': '2.0'}], plan
        (state / 'plan.json').write_text(json.dumps(plan))
        install = {**request, 'id': 'b' * 32, 'action': 'install', 'approved': True, 'plan': plan['plan']}
        with patch('executor.subprocess.run', side_effect=write_command):
            result = executor.process(install, policy, read_command)
        assert result['state'] == 'complete', result
        assert not (state / 'plan.json').exists()
        version = invoke(['/usr/bin/dpkg-query', '--admindir=' + str(root / 'var/lib/dpkg'), '-W', '-f=${Version}', 'dockge-host-test'])
        assert version == '2.0', version
        try:
            executor.process(install, policy, read_command)
            raise AssertionError('replayed approval accepted')
        except FileNotFoundError:
            pass
    # Re-open the same isolated APT configuration through python-apt: real native version/origin selection.
    import apt
    import apt_pkg
    apt_pkg.init_config()
    apt_pkg.read_config_file(apt_pkg.config, str(config))
    apt_pkg.init_system()
    assert apt_pkg.version_compare('1:1.0-1+deb12u2', '1:1.0-1+deb12u1') > 0
    assert apt_pkg.version_compare('2:1.0', '1:99.0') > 0
    invoke(['dpkg', '--root=' + str(root), '--install', str(repo / 'dockge-host-test_1.0.deb')])
    security_candidates = lambda scope, exclusions=(), allowed=(): apt_provider.select_versions(apt.Cache(), apt_pkg.version_compare, 'debian', 'bookworm', scope, exclusions, allowed)
    with patch.object(executor, 'STATE', state), patch('apt_provider.candidates', side_effect=security_candidates):
        security_policy = {**policy, 'allowedScopes': ['security', 'security-conservative'], 'conservativePackages': ['dockge-host-test']}
        security_request = {**request, 'scope': 'security'}
        plan = executor.process(security_request, security_policy, read_command)
        assert len(plan['packages']) == 1, plan
        conservative = executor.simulate(read_command, scope='security-conservative', allowed=['dockge-host-test'])
        assert conservative['packages'] == plan['packages']
        (state / 'plan.json').write_text(json.dumps(plan))
        with patch('executor.subprocess.run', side_effect=write_command):
            result = executor.process({**security_request, 'action': 'install', 'approved': True, 'plan': plan['plan']}, security_policy, read_command)
        assert result['state'] == 'complete', result
        invoke(['dpkg', '--root=' + str(root), '--install', str(repo / 'dockge-host-test_1.0.deb')])
        outbox = base / 'operations'
        outbox.mkdir()
        schedule = {'enabled': True, 'days': list(range(7)), 'hour': 2, 'minute': 0, 'scope': 'security'}
        (state / 'schedule.json').write_text(json.dumps(schedule))
        automatic_policy = {**security_policy, 'mode': 'automatic', 'allowAutomatic': True}
        import datetime
        scheduled = datetime.datetime(2026, 11, 30, 2, 1, tzinfo=datetime.timezone.utc)
        with patch.object(executor, 'OUTBOX', outbox), patch('apt_provider.stable_system', return_value=True), patch('executor.subprocess.run', side_effect=write_command):
            executor.run_schedule(automatic_policy, scheduled, run=read_command)
            executor.run_schedule(automatic_policy, scheduled, run=read_command)
        events = json.loads((outbox / 'events.json').read_text())
        assert [e['state'] for e in events] == ['running', 'complete'], events
        assert all(e['automatic'] for e in events)
        assert invoke(['/usr/bin/dpkg-query', '--admindir=' + str(root / 'var/lib/dpkg'), '-W', '-f=${Version}', 'dockge-host-test']) == '2.0'
print('Isolated APT all/security/conservative simulation, manual/automatic installs and replay refusal passed')
