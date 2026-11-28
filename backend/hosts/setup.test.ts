import test from "node:test";
import assert from "node:assert/strict";
import { bridgeArgs, setupOptions } from "./setup";
const options = { mode: "monitor",
    scopes: ["security"],
    hours: [2],
    packages: [],
    refreshMetadata: false };
test("installer accepts only bounded permissions, never commands, paths or image names", () => {
    assert.equal(setupOptions(options).mode, "monitor");
    for (const change of [{ command: "id" }, { image: "evil" }, { mode: "shell" }, { scopes: ["unknown"] }, { hours: [true] }, { hours: [24] }, { packages: ["a;id"] }, { refreshMetadata: "true" }]) {
        assert.throws(() => setupOptions({ ...options,
            ...change }));
    }
});
test("permanent transport has no host root, host namespaces, network or Docker socket", () => {
    const args = bridgeArgs({ image: "sha256:" + "a".repeat(64),
        owner: "fixture",
        bridge: "dockge-host-bridge-fixture" });
    assert.ok(args.includes("--read-only"));
    assert.ok(args.includes("--no-healthcheck"));
    assert.ok(args.includes("no-new-privileges"));
    assert.equal(args[args.indexOf("--network") + 1], "none");
    assert.equal(args[args.indexOf("--cap-drop") + 1], "ALL");
    assert.ok(args.every(a => !a.includes("docker.sock") && !a.includes("source=/,") && a !== "--privileged" && !a.startsWith("--pid=") && a !== "--pid"));
    assert.ok(args.includes("type=bind,source=/var/lib/dockge-host-reports,target=/host-reports,readonly"));
    assert.ok(args.includes("type=bind,source=/var/lib/dockge-host-operations,target=/host-operations,readonly"));
});
