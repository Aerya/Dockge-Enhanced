"""APT-native version/origin selection. No SemVer and no promise of zero risk."""
import re
from pathlib import Path

SCOPES = ('all', 'security', 'conservative', 'security-conservative')
CRITICAL = re.compile(r'^(linux|grub|shim|systemd|udev|libc6|libstdc\+\+|libgcc|apt|dpkg|openssl|libssl|openssh|network|netplan|nvidia|mesa|firmware|docker|containerd|runc|podman|postgresql|mysql|mariadb|redis|mongodb|zfs|btrfs|cryptsetup|lvm2|mdadm)(?:$|[-.0-9])')


def distribution():
    data = dict(line.split('=', 1) for line in Path('/etc/os-release').read_text().splitlines() if '=' in line)
    return data.get('ID', '').strip('"'), data.get('VERSION_CODENAME', '').strip('"')


def stable_system():
    data = dict(line.split('=', 1) for line in Path('/etc/os-release').read_text().splitlines() if '=' in line)
    return data.get('RELEASE_TYPE', '').strip('"') != 'rolling' and data.get('ID', '').strip('"') in ('debian', 'ubuntu') and bool(re.fullmatch(r'[0-9]+(?:\.[0-9]+)*', data.get('VERSION_ID', '').strip('"')))


def supported_origin(origin, distro, codename, security=False):
    if not origin.trusted or not codename or not re.fullmatch(r'[a-z][a-z0-9-]*', codename):
        return False
    if distro == 'debian':
        if security:
            return origin.origin == 'Debian' and origin.label == 'Debian-Security' and origin.codename == codename + '-security'
        return origin.origin == 'Debian' and origin.codename in (codename, codename + '-updates', codename + '-security') and origin.label in ('Debian', 'Debian-Security')
    if distro == 'ubuntu':
        return origin.origin == 'Ubuntu' and origin.archive in ((codename + '-security',) if security else (codename, codename + '-updates', codename + '-security'))
    return False


def select_versions(cache, compare, distro, codename, scope, exclusions=(), allowed=()):
    if scope not in SCOPES or scope == 'all' or distro not in ('debian', 'ubuntu'):
        raise ValueError('unsupported scope')
    security = scope in ('security', 'security-conservative')
    conservative = scope in ('conservative', 'security-conservative')
    selected = []
    for package in cache:
        installed = package.installed
        candidate = package.candidate
        name = package.name
        short = name.split(':')[0]
        if not installed or not candidate or name in exclusions or short in exclusions:
            continue
        # Holds are also enforced by apt-get; never bypass them with --allow-change-held-packages.
        if package._pkg.selected_state == 2:
            continue
        if conservative and (short not in allowed or package.essential or installed.priority in ('required', 'important') or CRITICAL.match(short)):
            continue
        versions = [v for v in package.versions if compare(v.version, installed.version) > 0 and
                    compare(v.version, candidate.version) <= 0 and v.policy_priority > 0 and v.downloadable and
                    any(supported_origin(o, distro, codename, security) for o in v.origins)]
        if not versions:
            continue
        best = versions[0]
        for version in versions[1:]:
            if compare(version.version, best.version) > 0:
                best = version
        selected.append({'name': name, 'installed': installed.version, 'version': best.version})
    return sorted(selected, key=lambda p: p['name'])


def candidates(scope, exclusions=(), allowed=()):
    import apt
    import apt_pkg
    distro, codename = distribution()
    return select_versions(apt.Cache(), apt_pkg.version_compare, distro, codename, scope, exclusions, allowed)


def available():
    try:
        import apt
        import apt_pkg
        return True
    except ImportError:
        return False
