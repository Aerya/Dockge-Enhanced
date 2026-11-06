import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parse } from "yaml";

test("all installation examples use identical host/container stack paths", () => {
    for (const file of [ "compose.yaml", "README.md", "README.fr.md", "README.de.md", "README.es-ES.md", "README.zh-CN.md" ]) {
        const source = readFileSync(new URL("../" + file, import.meta.url), "utf8");
        const yaml = file.endsWith(".yaml") ? source : source.match(/```yaml\n# compose\.yaml\n([\s\S]*?)\n```/)?.[1];
        assert.ok(yaml, file);
        const service = parse(yaml).services.dockge;
        const directory = service.environment.find((item: string) => item.startsWith("DOCKGE_STACKS_DIR=")).split("=")[1];
        assert.ok(directory.startsWith("/"));
        assert.ok(service.volumes.includes(directory + ":" + directory), file);
    }
});

test("Docker Compose resolves the default stack mount without a daemon or deployment", () => {
    const output = execFileSync("docker", [ "compose", "--env-file", "/dev/null", "-f", "compose.yaml", "config", "--format", "json" ], {
        cwd: new URL("../", import.meta.url),
        encoding: "utf8",
        timeout: 15000,
    });
    const service = JSON.parse(output).services.dockge;
    const mount = service.volumes.find((item: { target: string }) => item.target === service.environment.DOCKGE_STACKS_DIR);
    assert.equal(mount.type, "bind");
    assert.equal(mount.source, mount.target);
});
