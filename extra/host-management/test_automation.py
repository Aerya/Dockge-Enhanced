import datetime
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import patch
import apt_provider
import executor


def origin(**kwargs):
    return NS(trusted=True, origin='Debian', label='Debian-Security', codename='bookworm-security', archive='oldstable-security', **kwargs)


def package(name='example', versions=None, essential=False, held=False):
    v = NS(version='1:1.0-1+deb12u2', policy_priority=500, downloadable=True, origins=[origin()])
    return NS(name=name, installed=NS(version='1:1.0-1+deb12u1', priority='optional'), candidate=v,
              versions=versions or [v], essential=essential, _pkg=NS(selected_state=2 if held else 1))


class ProviderTests(unittest.TestCase):
    def select(self, packages, scope='security', allowed=()):
        # Native comparison is integration-tested using apt_pkg; fixture suffixes are ordered here.
        return apt_provider.select_versions(packages, lambda a, b: (a > b) - (a < b), 'debian', 'bookworm', scope, allowed=allowed)

    def test_security_origin_and_trust_required(self):
        self.assertEqual(len(self.select([package()])), 1)
        for key, value in [('trusted', False), ('origin', 'ThirdParty'), ('codename', 'trixie-security'), ('label', 'Debian')]:
            p = package()
            setattr(p.versions[0].origins[0], key, value)
            self.assertEqual(self.select([p]), [])

    def test_conservative_requires_allowlist_and_rejects_critical_and_held(self):
        self.assertEqual(self.select([package()], 'conservative'), [])
        self.assertEqual(len(self.select([package()], 'security-conservative', ['example'])), 1)
        for p in [package('linux-image-amd64'), package('example', essential=True), package('example', held=True)]:
            self.assertEqual(self.select([p], 'conservative', [p.name]), [])

    def test_security_selection_does_not_add_non_security_dependencies(self):
        with patch('apt_provider.candidates', return_value=[{'name': 'example', 'installed': '1', 'version': '2'}]):
            with self.assertRaises(ValueError):
                executor.simulate(lambda args: 'Inst example [1] (2 repo)\nInst unrelated [1] (2 repo)', scope='security')


class ScheduleTests(unittest.TestCase):
    schedule = {'enabled': True, 'days': [0], 'hour': 2, 'minute': 0, 'scope': 'security'}
    policy = {'mode': 'automatic', 'allowInstall': True, 'allowAutomatic': True, 'allowedScopes': ['security'], 'utcHours': list(range(24))}

    def test_schedule_validation_and_local_authority(self):
        for values in [{'hour': 24}, {'days': [True]}, {'scope': 'shell'}, {'command': 'id'}, {'enabled': 'yes'}]:
            with self.assertRaises(ValueError):
                executor.validate_schedule({**self.schedule, **values})
        with patch('apt_provider.stable_system', return_value=True):
            for policy in [{**self.policy, 'allowAutomatic': False}, {**self.policy, 'mode': 'manual'}, {**self.policy, 'allowedScopes': ['all']}]:
                with self.assertRaises(ValueError):
                    executor.authorized(policy, 'security', automatic=True)
        with patch('apt_provider.stable_system', return_value=False):
            with self.assertRaises(ValueError):
                executor.authorized(self.policy, 'security', automatic=True)

    def test_schedule_can_be_revoked_after_local_permission_removed(self):
        request = {'id': 'a' * 32, 'action': 'schedule', 'hostId': executor.host_identity(),
                   'expires': executor.time.time() + 120, 'schedule': {**self.schedule, 'enabled': False}}
        with patch('executor.write_report') as write:
            result = executor.process(request, {'mode': 'disabled'})
            self.assertEqual(result['state'], 'scheduled')
            self.assertFalse(write.call_args.args[1]['enabled'])

    def test_no_catch_up_no_duplicate_execution_and_results(self):
        now = datetime.datetime(2026, 11, 30, 2, 1, tzinfo=datetime.timezone.utc)
        with tempfile.TemporaryDirectory() as temp, patch.object(executor, 'STATE', Path(temp)), patch('executor.safe_json', return_value=self.schedule), patch('apt_provider.stable_system', return_value=True), patch('executor.publish') as publish, patch('executor.simulate', return_value={'packages': [], 'digest': 'a' * 64}), patch('executor.refresh_metadata'):
            execute = unittest.mock.Mock(return_value=0)
            executor.run_schedule(self.policy, now.replace(hour=3), execute=execute)
            execute.assert_not_called()
            executor.run_schedule(self.policy, now, execute=execute)
            executor.run_schedule(self.policy, now, execute=execute)
            self.assertEqual(execute.call_count, 1)
            self.assertEqual(publish.call_count, 2)
            self.assertEqual(publish.call_args.args[0]['state'], 'complete')
            self.assertTrue(publish.call_args.args[0]['automatic'])

    def test_failed_schedule_consumes_slot_and_reports_failure(self):
        now = datetime.datetime(2026, 11, 30, 2, 1, tzinfo=datetime.timezone.utc)
        with tempfile.TemporaryDirectory() as temp, patch.object(executor, 'STATE', Path(temp)), patch('executor.safe_json', return_value=self.schedule), patch('apt_provider.stable_system', return_value=True), patch('executor.publish') as publish, patch('executor.simulate', side_effect=ValueError('secret not to publish')):
            executor.run_schedule(self.policy, now)
            event = publish.call_args.args[0]
            self.assertEqual(event['state'], 'failed')
            self.assertNotIn('secret', str(event))
