import test from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import { writeFile } from "node:fs/promises";
import { Settings } from "../settings";
import { parseComparisonReport, runComparison, startImageComparison, type ComparisonJob } from "./trivy-comparison-runner";
import { compareImageScans } from "./trivy-comparison";

const digest = "sha256:" + "a".repeat(64);
const target = "sha256:" + "b".repeat(64);
function report(image: string, id = "CVE-1") {
    return JSON.stringify({ SchemaVersion: 2,
        ArtifactType: "container_image",
        Metadata: {},
        Results: [{ Target: image + " (alpine 3.22)",
            Class: "os-pkgs",
            Type: "alpine",
            Vulnerabilities: [{ VulnerabilityID: id,
                PkgName: "libc",
                InstalledVersion: "1",
                Severity: "HIGH" }] }] });
}
test("OS image names do not manufacture resolved/new vulnerabilities", () => {
    const before = parseComparisonReport(report("old"), digest, "linux/amd64", "db");
    const after = parseComparisonReport(report("new"), target, "linux/amd64", "db");
    assert.equal(compareImageScans(before, after).persistent.length, 1);
    assert.throws(() => parseComparisonReport("{}", digest, "linux/amd64", "db"));
    assert.throws(() => parseComparisonReport("{\"SchemaVersion\":2,\"ArtifactType\":\"container_image\",\"Metadata\":{},\"Results\":{}}", digest, "linux/amd64", "db"));
});
test("unknown images cannot start a Docker scan", () => {
    assert.throws(() => startImageComparison("absent", "private.test/secret:latest"));
});
for (const failure of [ "none", "current", "target", "database", "changed-container" ]) {
    test("immutable comparison and helper cleanup: " + failure, async (t) => {
        t.mock.method(Settings, "get", async () => null);
        t.mock.method(axios, "get", async () => ({ data: { manifests: [{ digest: target,
            platform: { os: "linux",
                architecture: "amd64" } }] },
        headers: {
            "content-type": "application/vnd.oci.image.index.v1+json",
            "docker-content-digest": target,
        } }));
        const commands: string[][] = [];
        let metadataReads = 0;
        const job: ComparisonJob = { id: "unit-test",
            stack: "fixture",
            image: "registry.test/app:1",
            startedAt: new Date().toISOString(),
            phase: "preparing" };
        const docker = async (args: string[]) => {
            commands.push(args);
            if (args[0] === "image" && args[1] === "save") {
                await writeFile(args[3], "fixture", { mode: 0o600 });
                return "";
            }
            if (args[0] === "ps") {
                return "container-id";
            }
            if (args[0] === "inspect") {
                if (args.includes("{{json .Config.Image}}")) {
                    return JSON.stringify(job.image);
                }
                if (args.includes("{{.Image}}")) {
                    return digest;
                }
                return JSON.stringify({ Config: { Image: job.image },
                    Image: failure === "changed-container" ? target : digest });
            }
            if (args[0] === "image" && args[1] === "inspect") {
                return JSON.stringify({ Os: "linux",
                    Architecture: "amd64",
                    Size: 1024 });
            }
            if (args.includes("cat /tmp/trivy-cache/db/metadata.json /tmp/trivy-cache/java-db/metadata.json")) {
                metadataReads++;
                return failure === "database" && metadataReads > 1 ? "changed-db" : "db";
            }
            if (args.includes("--input")) {
                if (failure === "current") {
                    throw new Error("scan failed");
                }
                return report("old");
            }
            if (args.includes("--image-src")) {
                assert.ok(args.at(-1)?.endsWith("@" + target));
                assert.ok(args.includes("--skip-db-update"));
                assert.ok(args.includes("--skip-java-db-update"));
                if (failure === "target") {
                    throw new Error("scan failed");
                }
                return report("new", "CVE-2");
            }
            return "";
        };
        if (failure === "none") {
            await runComparison(job, docker);
            assert.equal(job.phase, "complete");
            assert.equal(job.result?.noLongerDetected.length, 1);
            assert.equal(job.result?.newlyDetected.length, 1);
        } else {
            await assert.rejects(runComparison(job, docker));
            assert.equal(job.result, undefined);
        }
        assert.deepEqual(commands.at(-1), [ "rm", "-f", "dockge-cve-preview-unit-test" ]);
        const helper = commands.find(args => args[0] === "create")!;
        assert.ok(!helper.some(arg => arg.includes("docker.sock")));
        assert.ok(helper.includes("--cap-drop") && helper.includes("--memory"));
        assert.ok(!commands.some(args => args[0] === "stop" || args[0] === "restart"));
    });
}
