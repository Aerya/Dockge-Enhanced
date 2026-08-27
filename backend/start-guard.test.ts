import assert from "node:assert/strict";
import test from "node:test";
import { isHostMountPoint, Stack } from "./stack";

test("keeps legacy stacks unguarded", () => {
    assert.deepEqual(Stack.normalizeStartGuard(undefined), { enabled: false, conditions: [] });
    assert.deepEqual(Stack.normalizeStartGuard({ enabled: true, conditions: [] }), { enabled: true, conditions: [] });
});

test("validates only safe host mount and systemd prerequisites", () => {
    assert.deepEqual(Stack.normalizeStartGuard({
        enabled: true,
        conditions: [
            { type: "mount", target: " /mnt/torrent " },
            { type: "systemd", target: "rclone-synology.service" },
        ],
    }), {
        enabled: true,
        conditions: [
            { type: "mount", target: "/mnt/torrent" },
            { type: "systemd", target: "rclone-synology.service" },
        ],
    });
    assert.throws(() => Stack.normalizeStartGuard({ enabled: true, conditions: [ { type: "mount", target: "relative" } ] }, true));
    assert.throws(() => Stack.normalizeStartGuard({ enabled: true, conditions: [ { type: "systemd", target: "bad.service;id" } ] }, true));
    assert.deepEqual(Stack.normalizeStartGuard({ enabled: true, conditions: [ { type: "mount", target: "relative" } ] }), { enabled: false, conditions: [] });
});

test("recognizes a host mount point without trusting a directory", () => {
    const mountInfo = "36 25 0:32 / /host/mnt/torrent rw,relatime - ext4 /dev/sda1 rw\n37 25 0:33 / /host/mnt/media rw,relatime - ext4 /dev/sdb1 rw";
    assert.equal(isHostMountPoint(mountInfo, "/mnt/torrent"), true);
    assert.equal(isHostMountPoint(mountInfo, "/mnt/torrent/missing"), false);
});
