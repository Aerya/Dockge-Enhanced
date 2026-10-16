import test from "node:test";
import assert from "node:assert/strict";
import { composeModel, isRemoteMounted, validateZerobyteInstallUrl } from "./zerobyte-installer";
import { normalizeManagedSources, normalizeManagedDestinations, assertDisjointManagedMounts } from "./zerobyte-mounts";

test("managed URL stays local and excludes Enhanced ports", () => {
    assert.equal(validateZerobyteInstallUrl("http://127.0.0.1:14097").port, 14097);
    for (const url of [ "http://0.0.0.0:14097", "http://127.0.0.1:5055", "http://127.0.0.1:5001", "https://127.0.0.1:14097", "http://user:secret@127.0.0.1:14097", "http://127.0.0.1:14097/path" ]) {
        assert.throws(() => validateZerobyteInstallUrl(url));
    }
});
test("paths refuse traversal, system roots, protected repositories and all overlaps", () => {
    for (const source of [ "/", "/etc", "/etc/sub", "/srv/../etc", "/var/lib/docker", "/srv/repository", "/srv" ]) {
        assert.throws(() => normalizeManagedSources([{ source }], [ "/srv/repository" ]));
    }
    const sources = normalizeManagedSources([{ source: "/srv/application" }]);
    for (const source of [ "/srv/application", "/srv/application/repo", "/srv" ]) {
        assert.throws(() => assertDisjointManagedMounts(sources, normalizeManagedDestinations([{ source }])));
    }
    assert.throws(() => normalizeManagedDestinations([{ source: "/backup/a" }, { source: "/backup/a/b" }]));
});
test("remote mount declaration fails for missing mounts and nested local overmounts", () => {
    const lines = [ "1 0 8:1 / / rw - ext4 /dev/root rw", "2 1 0:1 / /mnt/remote rw - nfs4 server:/backup rw" ];
    assert.equal(isRemoteMounted("/mnt/remote/data", lines), true);
    assert.equal(isRemoteMounted("/mnt/remote/data", lines.slice(0, 1)), false);
    assert.equal(isRemoteMounted("/mnt/remote/data", [ ...lines, "3 2 8:1 / /mnt/remote/data rw - ext4 /dev/root rw" ]), false);
});
test("Compose preserves external volumes, source RO, destination RW and storage identity guard", () => {
    const sources = normalizeManagedSources([{ source: "app_data",
        kind: "volume" }]);
    const destinations = normalizeManagedDestinations([{ source: "/mnt/backup" }]).map(m => ({ ...m,
        fingerprint: "123:456" }));
    const compose = composeModel("test-project", "owner", "http://127.0.0.1:14097", 14097, sources, destinations);
    const service = compose.services.zerobyte;
    assert.equal(service.volumes[2].read_only, true);
    assert.equal(service.volumes[3].read_only, false);
    assert.deepEqual(service.volumes[3].bind, { create_host_path: false });
    assert.deepEqual(service.ports, [ "127.0.0.1:14097:4096" ]);
    assert.ok(JSON.stringify(compose).includes("\"external\":true"));
    assert.ok(service.entrypoint[2].includes("123:456"));
    assert.ok(service.entrypoint[2].includes("exit 31"));
    assert.ok(!JSON.stringify(compose).includes("docker.sock"));
});

test("host mount identities expose bind aliases and nested aliases", async () => {
    const { hostPathIdentity } = await import("./zerobyte-installer");
    const table = [ "1 0 8:1 / / rw - ext4 /dev/root rw", "2 1 8:1 /srv/app /mnt/alias rw - ext4 /dev/root rw" ];
    assert.equal(hostPathIdentity("/srv/app/data", table), hostPathIdentity("/mnt/alias/data", table));
    assert.notEqual(hostPathIdentity("/srv/other", table), hostPathIdentity("/mnt/alias/data", table));
});

test("filesystem root aliases overlap every protected child", async () => {
    const { hostPathIdentity, overlap } = await import("./zerobyte-installer");
    const table = [ "1 0 8:1 / / rw - ext4 /dev/root rw", "2 1 8:1 / /mnt/root-alias rw - ext4 /dev/root rw" ];
    assert.equal(overlap(hostPathIdentity("/mnt/root-alias", table), hostPathIdentity("/etc", table)), true);
    assert.equal(overlap("/", "/srv"), true);
    assert.equal(overlap("/srv/one", "/srv/other"), false);
});
