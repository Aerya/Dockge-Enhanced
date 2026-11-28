import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('host_install', Path(__file__).with_name('install.py'))
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)

class SetupTests(unittest.TestCase):
    options = {'mode': 'monitor', 'scopes': ['security'], 'hours': [2, 3], 'packages': [], 'refreshMetadata': False}

    def test_rejects_unknown_fields_and_dangerous_permissions(self):
        for change in [{'command': 'id'}, {'mode': 'shell'}, {'hours': [True]}, {'hours': [24]}, {'scopes': ['shell']}, {'packages': ['x;id']}, {'refreshMetadata': 'yes'}]:
            with self.assertRaises(ValueError):
                installer.validate({**self.options, **change})
        self.assertEqual(installer.validate(self.options)['mode'], 'monitor')

    def test_atomic_install_refuses_symlinks_without_modifying_target(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / 'target'
            target.write_text('preserved')
            (Path(temp) / 'policy.json').symlink_to(target)
            with self.assertRaises(ValueError):
                installer.atomic(temp, 'policy.json', b'changed')
            self.assertEqual(target.read_text(), 'preserved')

    def test_install_refuses_invalid_bundle_before_host_commands(self):
        with patch.object(installer, 'run') as run:
            with self.assertRaises(ValueError):
                installer.install({'options': self.options, 'files': {'../../etc/shadow': 'x'}})
            run.assert_not_called()

    def test_subprocess_output_is_not_exposed(self):
        with patch('subprocess.run') as run:
            run.return_value.returncode = 1
            with self.assertRaisesRegex(ValueError, 'host setup command failed'):
                installer.run(['systemctl', 'start', 'dockge-host-collector.service'])
            self.assertEqual(run.call_args.kwargs['stdout'], installer.subprocess.DEVNULL)
            self.assertNotIn('timeout', run.call_args.kwargs)
