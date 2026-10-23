"""Test TLS inside a disposable image; never start the application or mount its data."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile

HOSTS = [p.stem for p in sorted((Path(__file__).parent / 'chains').glob('*.pem'))]
PYTHON = r'''
import json, socket, ssl, sys
hosts = json.loads(sys.argv[1])
contexts = [('stdlib', ssl.create_default_context())]
try:
    import certifi
    contexts.append(('certifi', ssl.create_default_context(cafile=certifi.where())))
except ImportError:
    pass
for name, context in contexts:
    for host in ['example.com'] + hosts:
        try:
            with socket.create_connection((host, 443), timeout=15) as sock:
                with context.wrap_socket(sock, server_hostname=host):
                    pass
        except ssl.SSLCertVerificationError as e:
            if host == 'example.com' or e.verify_code not in (18,19,20,21,23):
                raise
            print(name, host, 'REJECTED', e.verify_code)
        else:
            if host != 'example.com':
                raise RuntimeError(name + ' ACCEPTED ' + host)
            print(name, host, 'OK')
'''
NODE = r'''
const tls = require('node:tls');
const hosts = JSON.parse(process.argv[1]);
const allowed = new Set(['CERT_REVOKED','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT']);
(async () => {
  for (const host of ['example.com', ...hosts]) {
    await new Promise((resolve, reject) => {
      const s = tls.connect({host, port:443, servername:host, rejectUnauthorized:true});
      s.setTimeout(15000, () => s.destroy(new Error('timeout')));
      s.once('secureConnect', () => {s.end(); host === 'example.com' ? resolve() : reject(new Error('ACCEPTED '+host));});
      s.once('error', e => host !== 'example.com' && allowed.has(e.code) ? resolve() : reject(e));
    });
    console.log(host, host === 'example.com' ? 'OK' : 'REJECTED');
  }
})().catch(e => { console.error(e); process.exitCode=1; });
'''


def run(args, **kw):
    return subprocess.run(args, check=True, text=True, **kw)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('image')
    parser.add_argument('--runtime', choices=['python', 'node', 'curl', 'java'], required=True)
    parser.add_argument('--python', default='python')
    args = parser.parse_args()
    assert len(HOSTS) == 14 and sum('noct' in h for h in HOSTS) == 2
    # Offline verification uses the image's bundle, not the runner's trust store.
    with tempfile.TemporaryDirectory() as tmp:
        cid = run(['docker', 'create', '--entrypoint', '/bin/true', args.image], capture_output=True).stdout.strip()
        try:
            run(['docker', 'cp', '-L', cid+':/etc/ssl/certs/ca-certificates.crt', tmp+'/ca.pem'])
        finally:
            run(['docker', 'rm', '-v', cid], capture_output=True)
        for host in HOSTS:
            fixture = Path(__file__).parent / 'chains' / (host+'.pem')
            # Freeze time to incident date; expiration must never count as remediation.
            result = subprocess.run(['openssl','verify','-attime','1792756800','-no-CApath','-no-CAstore','-CAfile',tmp+'/ca.pem','-untrusted',str(fixture),str(fixture)], capture_output=True,text=True)
            output = result.stdout + result.stderr
            if result.returncode == 0 or not any('error '+str(code)+' at' in output for code in [18,19,20,21,23]):
                raise RuntimeError('Unexpected offline result '+host+': '+output)
            print('OS bundle REJECTED',host,flush=True)
    docker = ['docker','run','--rm','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges']
    if args.runtime == 'python':
        run(docker + ['--entrypoint',args.python,args.image,'-c',PYTHON,json.dumps(HOSTS)])
    elif args.runtime == 'node':
        run(docker + ['--entrypoint','node',args.image,'-e',NODE,json.dumps(HOSTS)])
    elif args.runtime == 'curl':
        for host in ['example.com'] + HOSTS:
            result = subprocess.run(docker+['--entrypoint','curl',args.image,'--noproxy','*','--max-time','20','-sS','-o','/dev/null','https://'+host],text=True,capture_output=True)
            if result.returncode != (0 if host == 'example.com' else 60):
                raise RuntimeError(host+': '+result.stderr)
            print('curl',host,'OK' if host == 'example.com' else 'REJECTED')
    else:
        java_dir = Path(__file__).parent.resolve()
        run(['javac','--release','8',str(java_dir/'TrustProbe.java')])
        run(docker+['-v',str(java_dir)+':/probe:ro','--entrypoint','java',args.image,'-cp','/probe','TrustProbe']+HOSTS)


if __name__ == '__main__':
    main()
