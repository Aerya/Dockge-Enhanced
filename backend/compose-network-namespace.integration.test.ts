import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    parseResolvedComposeModel,
    resolveNetworkNamespaceRecreateTargets,
} from "./compose-network-namespace";

const execFileAsync = promisify(execFile);
const currentDir = path.dirname(fileURLToPath(import.meta.url));

test("resolves a realistic mixed service/container namespace fixture through Docker Compose", async () => {
    const fixture = path.join(currentDir, "fixtures", "network-namespace-compose.yaml");
    const { stdout } = await execFileAsync(
        "docker",
        [ "compose", "-f", fixture, "config", "--format", "json" ],
        { encoding: "utf8" },
    );
    const model = parseResolvedComposeModel(stdout);
    assert.deepEqual(
        resolveNetworkNamespaceRecreateTargets(model, [ "vpn-gateway" ]),
        [ "vpn-gateway", "browser-sidecar", "solver", "worker" ],
    );
});
