import test from "node:test";
import assert from "node:assert/strict";
import { sidecarStateMount } from "./state-mount";

test("Windows drive source is retained, with a Linux host-visible sidecar destination", () => {
    assert.deepEqual(sidecarStateMount({ Type: "bind",
        Source: "C:/Lab data/enhanced" }), {
        hostPath: "/run/desktop/mnt/host/c/Lab data/enhanced",
        args: [ "--mount", "type=bind,source=C:/Lab data/enhanced,target=/state", "--mount", "type=bind,source=C:/Lab data/enhanced,target=/run/desktop/mnt/host/c/Lab data/enhanced,readonly" ],
    });
});

test("Linux, NAS, Unraid and macOS data paths retain the same host-visible alias", () => {
    for (const source of [ "/srv/dockge/data", "/volume1/docker/data", "/mnt/user/appdata/dockge", "/Users/example/dockge/data" ]) {
        const mapping = sidecarStateMount({ Type: "bind",
            Source: source });
        assert.equal(mapping.hostPath, source);
        assert.equal(mapping.args[1], `type=bind,source=${source},target=/state`);
        assert.equal(mapping.args[3], `type=bind,source=${source},target=${source},readonly`);
    }
});

test("named volume remains the writable source, not an anonymous replacement", () => {
    const mapping = sidecarStateMount({ Type: "volume",
        Name: "enhanced-data",
        Source: "/var/lib/docker/volumes/enhanced-data/_data" });
    assert.equal(mapping.args[1], "type=volume,source=enhanced-data,target=/state");
    assert.equal(mapping.hostPath, "/var/lib/docker/volumes/enhanced-data/_data");
});

test("mount fields containing commas are CSV escaped without creating extra options", () => {
    const mapping = sidecarStateMount({ Type: "bind",
        Source: "/srv/data,with\"quotes" });
    assert.equal(mapping.args[1], "type=bind,\"source=/srv/data,with\"\"quotes\",target=/state");
});

test("invalid state sources and missing named volumes fail closed", () => {
    for (const mount of [{}, { Type: "tmpfs",
        Source: "/data" }, { Type: "bind",
        Source: "relative" }, { Type: "bind",
        Source: "C:/../Windows" }, { Type: "volume",
        Source: "/var/lib/docker/volumes/data/_data" }]) {
        assert.throws(() => sidecarStateMount(mount));
    }
});
