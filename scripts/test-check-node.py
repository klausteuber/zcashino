#!/usr/bin/env python3
"""Exercise the cron monitor with fake Docker, clock and Telegram; no network."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


class NodeMonitorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        scripts = self.root / 'scripts'
        scripts.mkdir()
        shutil.copyfile(Path(__file__).with_name('check-node.sh'), scripts / 'check-node.sh')
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.write_executable(self.bin / 'docker', '''
import json, os, sys
args = sys.argv[1:]
mode = os.environ['TEST_MODE']
if 'inspect' in args:
    print('2026-10-22T00:00:00Z')
elif 'ps' in args:
    if mode != 'down': print('fake-container')
elif 'exec' in args:
    if mode == 'error': sys.exit(1)
    height = int(os.environ['TEST_NOW'])
    print(json.dumps({'node_tip': {'height': height},
                     'wallet_tip': {'height': height},
                     'fully_synced_height': height - (10 if mode == 'sync' else 0)}))
else:
    sys.exit('Unexpected Docker command: ' + repr(args))
''')
        self.write_executable(self.bin / 'date', '''
import os, sys
now = int(os.environ['TEST_NOW'])
if sys.argv[1:] == ['+%s']: print(now)
elif '-d' in sys.argv or '-j' in sys.argv: print(now - int(os.environ.get('TEST_UPTIME', '3600')))
else: print('test clock')
''')
        self.write_executable(scripts / 'send-alert.sh', '''
import os, sys
with open(os.environ['TEST_MESSAGES'], 'a') as messages:
    messages.write(sys.argv[1] + '\\n')
''')
        self.now = 1_800_000_000
        self.messages = self.root / 'messages'
        self.state = self.root / '.node-monitor-alerts'

    def write_executable(self, path, body):
        path.write_text('#!' + sys.executable + '\n' + body)
        path.chmod(0o755)

    def check(self, mode='healthy', advance=300, **overrides):
        self.now += advance
        env = {
            'PATH': str(self.bin) + os.pathsep + os.environ['PATH'],
            'COMPOSE_FILE': 'docker-compose.mainnet.yml',
            'NODE_WALLET_BACKEND': 'zallet',
            'TEST_MODE': mode,
            'TEST_NOW': str(self.now),
            'TEST_MESSAGES': str(self.messages),
            **overrides,
        }
        result = subprocess.run(['bash', str(self.root / 'scripts/check-node.sh')],
                                env=env, text=True, capture_output=True)
        self.assertEqual(result.returncode, 1 if mode in ('down', 'error') else 0,
                         result.stdout + result.stderr)
        return result.stdout

    def alerts(self):
        return self.messages.read_text().splitlines() if self.messages.exists() else []

    def test_healthy_and_brief_sync_dips_stay_silent(self):
        self.check()
        self.check('sync')
        self.check('sync')
        self.check()
        self.check('sync')
        self.assertEqual(self.alerts(), [])
        self.assertFalse(self.state.exists())

    def test_persistent_sync_warns_once_and_repeats_after_six_hours(self):
        for _ in range(3): self.check('sync')
        self.assertEqual(len(self.alerts()), 1)
        for _ in range(71): self.check('sync')
        self.assertEqual(len(self.alerts()), 1)
        self.check('sync')
        self.assertEqual(len(self.alerts()), 2)

    def test_outage_and_rpc_error_are_immediate_even_during_sync(self):
        self.check('sync')
        self.check('down')
        self.check('error')
        self.check('error')
        self.assertEqual([s.split(':')[0] for s in self.alerts()], ['NODE DOWN', 'NODE ERROR'])

    def test_recovery_requires_two_checks_and_only_sends_once(self):
        self.check('down')
        self.check()
        self.assertEqual(len(self.alerts()), 1)
        self.assertTrue(self.state.exists())
        self.check()
        self.check()
        self.assertEqual([s.split(':')[0] for s in self.alerts()], ['NODE DOWN', 'NODE OK'])
        self.assertFalse(self.state.exists())
        self.check('down')
        self.assertEqual(len(self.alerts()), 3)

    def test_flapping_does_not_reset_cooldown_or_announce_recovery(self):
        self.check('error')
        for _ in range(3):
            self.check()
            self.check('error')
        self.assertEqual(len(self.alerts()), 1)
        self.check()
        self.check()
        self.assertEqual(len(self.alerts()), 2)

    def test_long_gap_breaks_sync_and_recovery_streaks(self):
        self.check('sync')
        self.check('sync')
        self.check('sync', advance=901)
        self.assertEqual(self.alerts(), [])
        self.check('down')
        self.check()
        self.check(advance=901)
        self.assertEqual(len(self.alerts()), 1)
        self.check()
        self.assertEqual(len(self.alerts()), 2)

    def test_pause_and_startup_break_pending_sync_streak(self):
        for skip in ('pause', 'startup'):
            self.check()
            self.check('sync')
            self.check('sync')
            if skip == 'pause':
                pause = self.root / '.node-monitor-paused'
                pause.touch()
                self.check()
                pause.unlink()
            else:
                self.check('sync', TEST_UPTIME='60')
            self.check('sync')
            self.assertEqual(self.alerts(), [])

    def test_existing_incident_state_is_preserved_until_confirmed_recovery(self):
        self.state.write_text(f'NODE ERROR|{self.now}\n')
        self.check('error')
        self.check()
        self.assertEqual(self.alerts(), [])
        self.check()
        self.assertEqual(len(self.alerts()), 1)
        self.assertTrue(self.alerts()[0].startswith('NODE OK:'))

    def test_threshold_overrides(self):
        self.check('sync', NODE_SYNC_ALERT_CHECKS='1')
        self.check('sync', NODE_SYNC_ALERT_CHECKS='1', NODE_ALERT_COOLDOWN_SECONDS='0')
        self.check(NODE_RECOVERY_CHECKS='1')
        self.assertEqual(len(self.alerts()), 3)


if __name__ == '__main__':
    unittest.main()
