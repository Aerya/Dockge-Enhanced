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
    request = {'id': 'a' * 32, 'action': 'simulate', 'expires': time.time() + 120}
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
print('Isolated APT simulation, approved install and replay refusal passed')
