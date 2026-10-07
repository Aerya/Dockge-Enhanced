import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const id = (number: number) => `sha256:${number.toString(16).padStart(64, "0")}`;
const created = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();

test("chaque image examinée a une raison et les anciens keeps sont réconciliés sans toucher aux images protégées", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dockge-prune-acceptance-"));
    const previous = { PATH: process.env.PATH,
        DOCKGE_DATA_DIR: process.env.DOCKGE_DATA_DIR,
        DOCKGE_PRUNE_FIXTURE_LOG: process.env.DOCKGE_PRUNE_FIXTURE_LOG,
        DOCKGE_PRUNE_FIXTURE_SCENARIO: process.env.DOCKGE_PRUNE_FIXTURE_SCENARIO };
    const callsPath = path.join(directory, "calls.jsonl");
    const scenarioPath = path.join(directory, "scenario.json");
    try {
        fs.copyFileSync(path.join(process.cwd(), "backend/test-fixtures/docker-prune-fixture.cjs"), path.join(directory, "docker"));
        fs.chmodSync(path.join(directory, "docker"), 0o755);
        process.env.PATH = `${directory}${path.delimiter}${previous.PATH}`;
        process.env.DOCKGE_DATA_DIR = directory;
        process.env.DOCKGE_PRUNE_FIXTURE_LOG = callsPath;
        process.env.DOCKGE_PRUNE_FIXTURE_SCENARIO = scenarioPath;
        const { AutoPruneManager, reconcileRollbackKeepTags, rollbackTagFromKey } = await import("./watchers/auto-prune-manager");
        const { readImagePruneReports, recordImagePruneReport } = await import("./image-prune-report");
        fs.mkdirSync(path.join(directory, "self-update", "recovery"), { recursive: true });
        fs.writeFileSync(path.join(directory, "self-update", "status.json"), "{invalide");
        fs.writeFileSync(path.join(directory, "self-update", "recovery", `${"a".repeat(32)}.json`),
            JSON.stringify({ previousImageId: id(2) }));
        fs.writeFileSync(path.join(directory, "rollback-registry.json"), JSON.stringify([{ key: "stack::image",
            oldImageId: id(3),
            expiresAt: "2099-01-01T00:00:00Z" }]));
        const row = (number: number, repository: string, tag = "latest", age = 72) => ({
            Repository: repository,
            Tag: tag,
            ID: id(number),
            Created: created(age),
        });
        fs.writeFileSync(scenarioPath, JSON.stringify({
            rows: [
                row(1, "ghcr.io/aerya/dockge-enhanced", "<none>"),
                row(2, "ghcr.io/aerya/dockge-enhanced", "<none>"),
                row(3, "ghcr.io/aerya/dockge-enhanced", "<none>"),
                row(4, "ghcr.io/aerya/dockge-enhanced", "<none>", 24),
                row(5, "ghcr.io/aerya/dockge-enhanced", "<none>"),
                row(6, "fixture/excluded"), row(7, "fixture/used"),
                row(8, "fixture/old"), row(9, "fixture/gone"), row(10, "fixture/error"),
            ],
            containers: [{ Id: "active-self",
                Image: id(1),
                State: { Status: "running" } },
            { Id: "used-generic",
                Image: id(7),
                State: { Status: "exited" } }],
            missingIds: [ id(9) ],
            rmiErrors: { "fixture/error:latest": "permission denied" },
        }));
        const result = await AutoPruneManager.getInstance().runUnusedPrune(false, undefined, [ "fixture/excluded:latest" ]);
        assert.equal(result.examined.length, 10);
        assert.deepEqual(Object.fromEntries(result.examined.map(item => [ item.id, item.outcome ])), {
            [id(1)]: "active",
            [id(2)]: "recovery",
            [id(3)]: "rollback",
            [id(4)]: "tooRecent",
            [id(5)]: "removed",
            [id(6)]: "excluded",
            [id(7)]: "used",
            [id(8)]: "removed",
            [id(9)]: "alreadyAbsent",
            [id(10)]: "error",
        });
        assert.equal(result.examined.reduce((sum, item) => sum + Number(Boolean(item.outcome)), 0), 10);
        assert.equal(result.errors.length, 1);
        assert.equal(readImagePruneReports()[0]?.origin, "manual");
        assert.equal(readImagePruneReports()[0]?.examined.length, 10);
        recordImagePruneReport("automatic", "unused", result.examined, result.errors);
        assert.deepEqual(readImagePruneReports().slice(0, 2).map(report => report.origin), [ "automatic", "manual" ]);
        const calls = fs.readFileSync(callsPath, "utf8").trim().split("\n").map(line => JSON.parse(line) as string[]);
        assert.ok(calls.some(args => args[0] === "rmi" && args[1] === id(5)));
        assert.ok(!calls.some(args => args[0] === "rmi" && [ id(1), id(2), id(3), id(4) ].includes(args[1])));

        const keepRow = (number: number, key: string) => {
            const [ repository, tag ] = rollbackTagFromKey(key).split(":");
            return row(number, repository, tag, 2_200);
        };
        fs.writeFileSync(path.join(directory, "self-update", "recovery", `${"b".repeat(32)}.json`),
            JSON.stringify({ previousImageId: id(13) }));
        fs.writeFileSync(path.join(directory, "rollback-registry.json"), JSON.stringify([
            { key: "expired::three-months",
                oldImageId: id(12),
                expiresAt: created(2_200) },
            { key: "active::keep",
                oldImageId: id(14),
                expiresAt: "2099-01-01T00:00:00Z" },
        ]));
        fs.writeFileSync(scenarioPath, JSON.stringify({
            rows: [ keepRow(11, "orphan::keep"), keepRow(12, "expired::three-months"),
                keepRow(13, "recovery::keep"), keepRow(14, "active::keep"), keepRow(15, "used::keep") ],
            containers: [ {
                Id: "used-keep",
                Image: id(15),
                State: { Status: "exited" },
            } ],
        }));
        fs.writeFileSync(callsPath, "");
        const retired = await reconcileRollbackKeepTags(directory);
        assert.deepEqual(retired.sort(), [ "orphan::keep", "expired::three-months", "recovery::keep", "used::keep" ]
            .map(rollbackTagFromKey).sort());
        const keepCalls = fs.readFileSync(callsPath, "utf8").trim().split("\n").map(line => JSON.parse(line) as string[]);
        assert.ok(keepCalls.some(args => args[0] === "tag" && args[1] === id(13)));
        assert.ok(keepCalls.some(args => args[0] === "tag" && args[1] === id(15)));
        assert.ok(!keepCalls.some(args => args[0] === "rmi" && args[1] === id(13)));
        assert.ok(!keepCalls.some(args => args[0] === "rmi" && args[1] === id(15)));
        assert.ok(!keepCalls.some(args => args[0] === "rmi" && args[1] === rollbackTagFromKey("active::keep")));
    } finally {
        for (const [ key, value ] of Object.entries(previous)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
        fs.rmSync(directory, { recursive: true,
            force: true });
    }
});
