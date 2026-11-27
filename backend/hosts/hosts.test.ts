import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, symlink, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseReport, readReport, reportState, inventoryHash, type HostReport } from "./report";
import { hostSettings, HOST_DEFAULTS } from "./manager";
import { debianMetadata, parseHostScan, scanHost } from "./security";
import { queueHostOperation } from "./operations";

const fixture = (): HostReport => ({ schemaVersion: 1,
    collectedAt: new Date().toISOString(),
    host: "test-host",
    os: "debian",
    osVersion: "12",
    osName: "Debian 12",
    arch: "amd64",
    kernel: "6.1.0",
    uptime: 10,
    provider: "apt",
    metadata: "cached",
    complete: true,
    reboot: "unknown",
    capabilities: [ "inventory", "updates" ],
    packages: [ { name: "libssl3:amd64",
        version: "1:3.0.11-1~deb12u1",
        source: "openssl",
        sourceVersion: "1:3.0.11-1~deb12u1",
        arch: "amd64",
        origin: "unknown",
        available: "1:3.0.11-1~deb12u2" } ] });

test("disabled by default; invalid modes and settings cannot enable installation", () => {
    assert.equal(HOST_DEFAULTS.enabled, false);
    assert.throws(() => hostSettings({ ...HOST_DEFAULTS,
        enabled: "true" }));
    assert.throws(() => hostSettings({ ...HOST_DEFAULTS,
        retentionDays: 9999 }));
    assert.deepEqual(hostSettings({ ...HOST_DEFAULTS,
        mode: "automatic",
        command: "id" }), HOST_DEFAULTS);
});
test("reports preserve source versions and never confuse freshness with update availability", () => {
    const report = parseReport(fixture());
    assert.equal(report.packages[0].sourceVersion, "1:3.0.11-1~deb12u1");
    assert.equal(reportState(null), "unavailable");
    assert.equal(reportState(report), "fresh");
    assert.equal(reportState({ ...report,
        complete: false }), "partial");
    assert.equal(reportState(report, 12, Date.now() + 13 * 3600000), "stale");
    assert.equal(inventoryHash(report), inventoryHash({ ...report,
        uptime: 999 }));
    assert.notEqual(inventoryHash(report), inventoryHash({ ...report,
        osVersion: "13" }));
});
test("malformed, future, duplicate and injected reports are rejected", () => {
    const r = fixture();
    for (const value of [ null, {}, { ...r,
        schemaVersion: 2 }, { ...r,
        collectedAt: new Date(Date.now() + 86400000).toISOString() },
    { ...r,
        packages: [ ...r.packages, ...r.packages ] }, { ...r,
        packages: [ { ...r.packages[0],
            version: "1\nStatus: installed" } ] },
    { ...r,
        packages: [ { ...r.packages[0],
            name: "$(id)" } ] } ]) {
        assert.throws(() => parseReport(value));
    }
    assert.equal("secret" in parseReport({ ...r,
        secret: "must-not-forward" }), false);
});
test("safe report reader rejects symlinks and writable reports", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "host-test-"));
    try {
        const target = path.join(directory, "source.json");
        await writeFile(target, JSON.stringify(fixture()), { mode: 0o644 });
        await symlink(target, path.join(directory, "inventory.json"));
        await assert.rejects(readReport(directory));
        await rm(path.join(directory, "inventory.json"));
        await writeFile(path.join(directory, "inventory.json"), JSON.stringify(fixture()), { mode: 0o644 });
        assert.equal((await readReport(directory)).host, "test-host");
        await chmod(path.join(directory, "inventory.json"), 0o666);
        await assert.rejects(readReport(directory));
    } finally {
        await rm(directory, { recursive: true,
            force: true });
    }
});
test("Trivy input preserves Debian backport, source and architecture without host mounts", async () => {
    const report = fixture();
    assert.match(debianMetadata(report).status, /Source: openssl \(1:3.0.11-1~deb12u1\)/);
    assert.throws(() => debianMetadata({ ...report,
        os: "garuda",
        provider: "pacman" }));
    const calls: string[][] = [];
    const result = await scanHost(report, async args => {
        calls.push(args);
        if (args.includes("cat")) {
            return JSON.stringify({ UpdatedAt: new Date().toISOString() });
        }
        if (args.includes("rootfs")) {
            return JSON.stringify({ SchemaVersion: 2,
                Metadata: { OS: { Family: "debian" } },
                Results: [ { Class: "os-pkgs",
                    Type: "debian" } ] });
        }
        return "";
    });
    assert.equal(result.state, "partial");
    assert.equal(result.findings.length, 0);
    assert.ok(calls.some(c => c.includes("--network") && c.includes("none")));
    assert.ok(calls.every(c => !c.some(v => v.includes("docker.sock") || v === "--privileged" || v === "/:/host")));
    assert.ok(calls.at(-1)?.includes("rm"));
});
test("CVE parser never treats missing OS data as a clean scan", () => {
    assert.throws(() => parseHostScan({ SchemaVersion: 2,
        Results: [] }, fixture()));
    const r = fixture();
    const findings = parseHostScan({ SchemaVersion: 2,
        Metadata: { OS: { Family: "debian" } },
        Results: [ { Class: "os-pkgs",
            Type: "debian",
            Vulnerabilities: [ {
                VulnerabilityID: "CVE-2026-12345",
                PkgName: "libssl3",
                InstalledVersion: r.packages[0].version,
                FixedVersion: r.packages[0].available,
                Severity: "HIGH",
                PrimaryURL: "javascript:bad",
            } ] } ] }, r);
    assert.equal(findings[0].fix, "available");
    assert.equal(findings[0].url, "https://security-tracker.debian.org/tracker/CVE-2026-12345");
});
test("operation RPC payload does not accept shell commands or implicit approval", async () => {
    await assert.rejects(queueHostOperation({ action: "shell",
        command: "id" }));
    await assert.rejects(queueHostOperation({ action: "install",
        plan: "a".repeat(64) }));
    await assert.rejects(queueHostOperation({ action: "install",
        approved: true,
        plan: "$(id)" }));
});
