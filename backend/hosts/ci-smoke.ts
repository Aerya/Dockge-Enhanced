import { promisify } from "node:util";
import { execFile } from "../buffered-process";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseReport } from "./report";
import { scanHost } from "./security";
if (process.env.GITHUB_ACTIONS !== "true" || !process.env.HOST_TEST_REPORT) {
    throw new Error("Disposable GitHub Actions runner only");
}
const report = parseReport(JSON.parse(await readFile(process.env.HOST_TEST_REPORT, "utf8")));
assert.equal(report.provider, "apt");
assert.ok(report.packages.length > 0);
const execute = promisify(execFile);
const result = await scanHost(report, async args => {
    if (args.includes("rootfs")) {
        console.log((await execute("docker", [ "exec", args[1], "ls", "-lR", "/tmp/host" ])).stdout);
        console.log((await execute("docker", [ "exec", args[1], "cat", "/tmp/host/etc/os-release" ])).stdout);
        args = args.filter(a => a !== "--quiet");
        args.splice(args.indexOf("rootfs") + 1, 0, "--debug");
    }
    const result = await execute("docker", args, { timeout: 600000,
        maxBuffer: 32 * 1024 * 1024 });
    if (args.includes("rootfs")) {
        console.log(result.stderr);
        const json = JSON.parse(result.stdout);
        console.log(JSON.stringify({ schema: json.SchemaVersion,
            os: json.Metadata?.OS,
            results: json.Results?.map((r: { Class: string;
                Type: string }) => ({ class: r.Class,
                type: r.Type })) }));
    }
    return result.stdout;
});
assert.equal(result.state, "partial");
assert.match(result.database!, /^[a-f0-9]{64}$/);
console.log("Host metadata scan with real Trivy succeeded; package inventory was not transmitted.");
