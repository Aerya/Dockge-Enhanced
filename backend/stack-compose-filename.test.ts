import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Stack } from "./stack";
import type { DockgeServer } from "./dockge-server";
import { acceptedComposeFileNames } from "../common/util-common";

test("new filename is validated, persisted and rediscovered without renaming existing stacks", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-filename-"));
    const previous = process.env.COMPOSE_FILENAME;
    const server = { stacksDir: root,
        config: { dataDir: root } } as DockgeServer;
    const yaml = "services:\n  app:\n    image: busybox:stable\n";
    try {
        delete process.env.COMPOSE_FILENAME;
        await new Stack(server, "default", yaml, "").save(true);
        assert.equal(await fs.readFile(path.join(root, "default", "compose.yaml"), "utf8"), yaml);
        for (const [ index, filename ] of acceptedComposeFileNames.entries()) {
            process.env.COMPOSE_FILENAME = filename;
            const name = `fixture-${index}`;
            await new Stack(server, name, yaml, "VALUE=kept").save(true);
            assert.equal(await fs.readFile(path.join(root, name, filename), "utf8"), yaml);
            assert.equal(await fs.readFile(path.join(root, name, ".env"), "utf8"), "VALUE=kept");
            process.env.COMPOSE_FILENAME = "../forbidden.yaml";
            const restored = new Stack(server, name);
            assert.equal(restored.composeYAML, yaml);
            restored.setComposeContent(yaml + "# saved\n", "VALUE=updated");
            await restored.save(false);
            assert.equal(await fs.readFile(path.join(root, name, filename), "utf8"), yaml + "# saved\n");
            assert.equal((await fs.readdir(path.join(root, name))).filter(file => acceptedComposeFileNames.includes(file)).length, 1);
            // Copying/restoring the directory preserves discovery independently of the setting.
            await fs.cp(path.join(root, name), path.join(root, name + "-restored"), { recursive: true });
            assert.equal(new Stack(server, name + "-restored").composeYAML, yaml + "# saved\n");
        }
        for (const filename of [ "../escape.yaml", "/tmp/escape.yaml", "custom.yaml", ".env", "compose.override.yaml", " compose.yaml", "compose.yaml\n" ]) {
            process.env.COMPOSE_FILENAME = filename;
            await assert.rejects(new Stack(server, "invalid", yaml, "").save(true), /COMPOSE_FILENAME/);
            await assert.rejects(fs.stat(path.join(root, "invalid")), { code: "ENOENT" });
        }
        const external = path.join(root, "external");
        await fs.mkdir(external);
        await fs.writeFile(path.join(external, "custom.yaml"), yaml);
        const stack = new Stack(server, "external", undefined, "", false, undefined, external, "external", [ path.join(external, "custom.yaml") ]);
        assert.equal(stack.composeYAML, yaml);
        stack.setComposeContent(yaml + "# external\n", "");
        await stack.save(false);
        assert.equal(await fs.readFile(path.join(external, "custom.yaml"), "utf8"), yaml + "# external\n");
    } finally {
        if (previous === undefined) {
            delete process.env.COMPOSE_FILENAME;
        } else {
            process.env.COMPOSE_FILENAME = previous;
        }
        await fs.rm(root, { recursive: true,
            force: true });
    }
});
