import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
import collector
import executor


class CollectorTests(unittest.TestCase):
    def test_debian_source_multiarch_and_epoch(self):
        def run(args, accepted=(0,)):
            if args[0] == 'dpkg-query':
                return 'ii \tlibssl3:amd64\t1:3.0.11-1~deb12u1\tamd64\topenssl\t1:3.0.11-1~deb12u1\nrc \told\t1\tall\told\t1\n'
            return 'Inst libssl3 [1:3.0.11-1~deb12u1] (1:3.0.11-1~deb12u2 Debian:12 [amd64])\n'
        packages, freshness = collector.apt(run)
        self.assertEqual(len(packages), 1)
        self.assertEqual(packages[0]['source'], 'openssl')
        self.assertEqual(packages[0]['available'], '1:3.0.11-1~deb12u2')
        self.assertEqual(freshness, 'cached')

    def test_pacman_foreign_and_non_destructive_fallback(self):
        calls = []
        def run(args, accepted=(0,)):
            calls.append(args)
            return {'-Q': 'linux 6.12-1\naur-package 1-1\n', '-Qm': 'aur-package 1-1\n', '-Qu': 'linux 6.12-1 -> 6.13-1\n'}[args[1]]
        with patch('collector.shutil.which', return_value=None):
            packages, freshness = collector.pacman(run)
        self.assertEqual(packages[1]['origin'], 'foreign')
        self.assertEqual(packages[0]['available'], '6.13-1')
        self.assertEqual(freshness, 'cached')
        self.assertFalse(any('-Sy' in c or '-Syu' in c for c in calls))

    def test_atomic_report_and_symlink_refusal(self):
        with tempfile.TemporaryDirectory() as tmp:
            collector.write_report(tmp, {'schemaVersion': 1})
            self.assertEqual(json.loads((Path(tmp) / 'inventory.json').read_text()), {'schemaVersion': 1})
            link = Path(tmp) / 'link'
            link.symlink_to(tmp)
            with self.assertRaises(RuntimeError):
                collector.write_report(link, {})

    def test_container_refused_before_commands(self):
        with patch('collector.Path.exists', return_value=True), patch('collector.command') as run:
            with self.assertRaises(RuntimeError):
                collector.collect()
            run.assert_not_called()


class ExecutorTests(unittest.TestCase):
    def request(self, **values):
        return {'hostId': executor.host_identity(), 'id': 'a' * 32, 'action': 'simulate', 'expires': time.time() + 60, **values}

    def test_expiry_injection_and_approval(self):
        for values in ({'hostId': 'b' * 64}, {'expires': 0}, {'expires': time.time() + 1000}, {'action': 'shell'}, {'id': '../x'},
                       {'command': 'id'}, {'action': 'install', 'plan': 'b' * 64}, {'action': 'install', 'approved': True, 'plan': '$(id)'}):
            with self.assertRaises(ValueError):
                executor.validate_request(self.request(**values))

    def test_local_authorization_cannot_be_escalated(self):
        with self.assertRaises(ValueError):
            executor.process(self.request(), {'mode': 'disabled', 'allowInstall': True})
        with self.assertRaises(ValueError):
            executor.process(self.request(), {'mode': 'manual', 'allowInstall': False})
        with self.assertRaises(ValueError):
            executor.process(self.request(), {'mode': 'automatic', 'allowInstall': True})

    def test_no_removals_new_dependencies_or_injected_packages(self):
        for output in ('Remv libc6 [2.0]', 'Inst new (1.0 repo)', 'Inst $(id) [1] (2 repo)'):
            with self.assertRaises(ValueError):
                executor.parse_plan(output)
        self.assertEqual(executor.parse_plan('Inst openssl [1:3.0-1~deb12u1] (1:3.0-1~deb12u2 repo)'),
                         [{'name': 'openssl', 'installed': '1:3.0-1~deb12u1', 'version': '1:3.0-1~deb12u2'}])

    def test_changed_state_changes_plan_and_exclusions_fail_closed(self):
        def run(args, accepted=(0,)):
            return 'Inst openssl [1] (2 repo)' if 'apt-get' in args[0] else 'openssl\t1\tii'
        first = executor.simulate(run)
        second = executor.simulate(lambda args: run(args) + ('x' if 'dpkg' in args[0] else ''))
        self.assertNotEqual(first['digest'], second['digest'])
        with self.assertRaises(ValueError):
            executor.simulate(run, ['openssl'])

    def test_install_no_shell_and_no_write_timeout(self):
        plan = {'packages': [{'name': 'openssl', 'installed': '1', 'version': '2'}]}
        with patch('executor.subprocess.run') as run:
            run.return_value.returncode = 0
            self.assertEqual(executor.install(plan, lambda args: 'Inst openssl [1] (2 repo)'), 0)
            args, kwargs = run.call_args
            self.assertIn('openssl=2', args[0])
            self.assertIn('--no-remove', args[0])
            self.assertNotIn('timeout', kwargs)
            self.assertNotIn('shell', kwargs)

    def test_obsolete_plan_never_executes(self):
        policy = {'mode': 'manual', 'allowInstall': True, 'utcHours': list(range(24))}
        with patch('executor.simulate', return_value={'digest': 'c' * 64}), patch('executor.safe_json', return_value={'plan': 'b' * 64, 'expires': 0}):
            with self.assertRaises(ValueError):
                executor.process(self.request(action='install', approved=True, plan='b' * 64), policy, execute=lambda *args: self.fail('execution'))


if __name__ == '__main__':
    unittest.main()
