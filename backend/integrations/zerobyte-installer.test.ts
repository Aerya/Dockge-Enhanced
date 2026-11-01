import test from "node:test";
import assert from "node:assert/strict";
import { composeModel, isRemoteMounted, validateZerobyteInstallUrl, reconnectOwnedZerobyteNetwork, restoreManagedZerobyteNetwork } from "./zerobyte-installer";
import { zerobyte } from "./zerobyte-manager";
import type { DockgeServer } from "../dockge-server";
import { normalizeManagedSources, normalizeManagedDestinations, assertDisjointManagedMounts } from "./zerobyte-mounts";

test("managed URL stays local and excludes Enhanced ports", () => {
    assert.equal(validateZerobyteInstallUrl("http://127.0.0.1:14097").port, 14097);
    for (const url of [ "http://0.0.0.0:14097", "http://127.0.0.1:5055", "http://127.0.0.1:5001", "https://127.0.0.1:14097", "http://user:secret@127.0.0.1:14097", "http://127.0.0.1:14097/path" ]) {
        assert.throws(() => validateZerobyteInstallUrl(url));
    }
});

test("disabled and external Zerobyte integrations require no Docker context for reconnection", async (t) => {
    for (const config of [{ enabled: false,
        url: "http://zerobyte-abcdef123456:4096" }, { enabled: true,
        url: "https://backup.example.invalid" }]) {
        const stub = t.mock.method(zerobyte, "getSafeConfig", async () => config);
        try {
            // No server/data/stack configuration: attempting Docker context must fail.
            await restoreManagedZerobyteNetwork({} as DockgeServer);
            assert.equal(stub.mock.callCount(), 1);
        } finally {
            stub.mock.restore();
        }
    }
});

test("recreated Enhanced rejoins only its owned Zerobyte network, without disconnecting live callbacks", async () => {
    const ctx = { name: "zerobyte-owned",
        owner: "owned",
        self: { Id: "new-enhanced" } };
    const commands: string[][] = [];
    let connected = false;
    const run = async (...args: string[]) => {
        commands.push(args);
        if (args[0] === "network" && args[1] === "inspect") {
            return JSON.stringify([{ Labels: { "com.docker.compose.project": ctx.name },
                Containers: { server: {},
                    ...(connected ? { "new-enhanced": {} } : {}) } }]);
        }
        if (args[0] === "inspect") {
            return JSON.stringify([{ Id: "server",
                Config: { Labels: { "net.dockge-enhanced.zerobyte-owner": ctx.owner,
                    "com.docker.compose.project": ctx.name } } }]);
        }
        connected = true;
        return "";
    };
    await reconnectOwnedZerobyteNetwork(ctx, run);
    await reconnectOwnedZerobyteNetwork(ctx, run);
    assert.deepEqual(commands.filter(args => args[1] === "connect"), [[ "network", "connect", "--alias", "enhanced-owned", "zerobyte-owned_default", "new-enhanced" ]]);
    assert.ok(!commands.some(args => args[1] === "disconnect"));
});

test("network repair refuses a foreign network, owner or unattached server and retries Docker failures", async () => {
    const ctx = { name: "zerobyte-owned",
        owner: "owned",
        self: { Id: "enhanced" } };
    for (const mismatch of [ "network", "owner", "endpoint" ]) {
        const run = async (...args: string[]) => {
            assert.notEqual(args[1], "connect");
            return args[0] === "network" ? JSON.stringify([{ Labels: { "com.docker.compose.project": mismatch === "network" ? "foreign" : ctx.name },
                Containers: mismatch === "endpoint" ? {} : { server: {} } }]) : JSON.stringify([{ Id: "server",
                Config: { Labels: { "net.dockge-enhanced.zerobyte-owner": mismatch === "owner" ? "foreign" : ctx.owner,
                    "com.docker.compose.project": ctx.name } } }]);
        };
        await assert.rejects(reconnectOwnedZerobyteNetwork(ctx, run), /ownership/);
    }
    await assert.rejects(reconnectOwnedZerobyteNetwork(ctx, async () => {
        throw new Error("Docker unavailable");
    }), /unavailable/);
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
    assert.ok(service.healthcheck.test.includes("http://127.0.0.1:4096/api/healthcheck"));
    assert.ok(service.entrypoint[2].includes("$$(stat"));
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
