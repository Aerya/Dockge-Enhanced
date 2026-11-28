// Immutable bootstrap inside a short-lived, explicitly approved privileged container.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ns = ['--target', '1', '--mount', '--uts', '--ipc', '--net', '--pid', '--root', '--wd=/', '--'];
const prereq = `set -eu
. /etc/os-release
case "$ID" in debian|ubuntu|arch|garuda) ;; *) exit 20;; esac
[ -d /run/systemd/system ] || exit 21
if [ ! -x /usr/bin/python3 ]; then
 case "$ID" in
 debian|ubuntu) export DEBIAN_FRONTEND=noninteractive; apt-get -o APT::Update::Error-Mode=any update; apt-get -y --no-remove --no-install-recommends install python3 ;;
 arch|garuda) pacman --noconfirm --needed -S python ;;
 esac
fi`;
try {
    const options = JSON.parse(Buffer.from(process.argv[2], 'base64').toString());
    const names = ['collector.py', 'executor.py', 'apt_provider.py', 'dockge-host-collector.service', 'dockge-host-collector.timer', 'dockge-host-executor.service', 'dockge-host-executor.timer'];
    const files = Object.fromEntries(names.map(name => [name, fs.readFileSync(path.join(__dirname, name)).toString('base64')]));
    // No timeout/kill during package writes. Raw subprocess output never reaches logs.
    const check = spawnSync('/usr/bin/nsenter', [...ns, '/bin/sh', '-c', prereq], {stdio: 'ignore'});
    if (check.status !== 0) throw new Error('prerequisites');
    const result = spawnSync('/usr/bin/nsenter', [...ns, '/usr/bin/python3', '-c', fs.readFileSync(path.join(__dirname, 'install.py'), 'utf8')], {
        input: JSON.stringify({options, files}), encoding: 'utf8', maxBuffer: 4096,
    });
    if (result.status !== 0) throw new Error('installation');
    process.stdout.write(result.stdout);
} catch {
    process.stderr.write('Host setup failed\n');
    process.exitCode = 1;
}
