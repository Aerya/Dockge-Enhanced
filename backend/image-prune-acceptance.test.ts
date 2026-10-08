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
        const nodeRealReference = `node:26-alpine@${id(8)}`;
        fs.writeFileSync(scenarioPath, JSON.stringify({
            rows: [
                row(1, "ghcr.io/aerya/dockge-enhanced", "<none>"),
                row(2, "ghcr.io/aerya/dockge-enhanced", "<none>"),
                row(3, "ghcr.io/aerya/dockge-enhanced", "<none>"),
                row(4, "ghcr.io/aerya/dockge-enhanced", "<none>", 24),
                row(5, "ghcr.io/aerya/dockge-enhanced", "<none>"),
                row(6, "fixture/excluded"), row(7, "fixture/used"),
                { ...row(8, "node", "26-alpine", 336),
                    InspectRepoTags: [ nodeRealReference ],
                    InspectRepoDigests: [ nodeRealReference ] },
                row(9, "fixture/gone"), row(10, "fixture/ambiguous"),
                row(11, "fixture/stubborn"), row(12, "fixture/gone-during-rmi"),
                row(13, "fixture/final-stubborn"),
                { ...row(14, "fixture/multi"),
                    InspectRepoTags: [ "fixture/multi:first", "fixture/multi:second" ] },
                { ...row(15, "fixture/fallback"),
                    InspectRepoTags: [],
                    InspectRepoDigests: [] },
                { ...row(16, "fixture/fallback-error"),
                    InspectRepoTags: [],
                    InspectRepoDigests: [] },
            ],
            containers: [{ Id: "active-self",
                Image: id(1),
                State: { Status: "running" } },
            { Id: "used-generic",
                Image: id(7),
                State: { Status: "exited" } }],
            missingIds: [ id(9) ],
            batchOmittedIds: [ id(8) ],
            rmiErrors: {
                "node:26-alpine": "Error response from daemon: No such image",
                "fixture/ambiguous:latest": "Error response from daemon: No such image",
                [id(10)]: "permission denied",
                [id(16)]: "permission denied",
                "fixture/gone-during-rmi:latest": "Error response from daemon: No such image",
            },
            rmiMissingAndAbsent: [ "fixture/gone-during-rmi:latest" ],
            rmiLeavesPresent: [ "fixture/stubborn:latest", id(11), "fixture/final-stubborn:latest" ],
            postInspectMissingButFinalPresent: [ id(13) ],
        }));
        const manager = AutoPruneManager.getInstance();
        await manager.updateSettings({ unusedExclusions: [ "fixture/excluded:latest" ] });
        const uiInventory = await manager.loadImageInventory(false);
        const uiStates = await manager.getImagePurgeStates(uiInventory);
        assert.equal(uiStates.get(id(1))?.state, "active");
        assert.equal(uiStates.get(id(2))?.state, "recovery");
        assert.equal(uiStates.get(id(3))?.state, "rollback");
        assert.equal(uiStates.get(id(4))?.state, "tooRecent");
        assert.equal(uiStates.get(id(6))?.state, "excluded");
        assert.equal(uiStates.get(id(7))?.state, "used");
        assert.equal(uiStates.get(id(8))?.state, "purgeable");
        const uiCalls = fs.readFileSync(callsPath, "utf8").trim().split("\n").map(line => JSON.parse(line) as string[]);
        assert.equal(uiCalls.filter(args => args[0] === "images" && args[1] === "-a").length, 1);
        assert.equal(uiCalls.filter(args => args[0] === "image" && args[1] === "inspect" && args.length > 3).length, 0);
        assert.equal(uiCalls.filter(args => args[0] === "image" && args[1] === "inspect" && args.length === 3).length, 5);
        fs.writeFileSync(callsPath, "");

        const result = await manager.runUnusedPrune(false);
        assert.equal(result.examined.length, 16);
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
            [id(11)]: "error",
            [id(12)]: "alreadyAbsent",
            [id(13)]: "error",
            [id(14)]: "removed",
            [id(15)]: "removed",
            [id(16)]: "error",
        });
        assert.equal(result.examined.reduce((sum, item) => sum + Number(Boolean(item.outcome)), 0), 16);
        assert.equal(result.errors.length, 4);
        assert.equal(readImagePruneReports()[0]?.origin, "manual");
        assert.equal(readImagePruneReports()[0]?.examined.length, 16);
        recordImagePruneReport("automatic", "unused", result.examined, result.errors);
        assert.deepEqual(readImagePruneReports().slice(0, 2).map(report => report.origin), [ "automatic", "manual" ]);
        const calls = fs.readFileSync(callsPath, "utf8").trim().split("\n").map(line => JSON.parse(line) as string[]);
        assert.ok(calls.some(args => args[0] === "rmi" && args[1] === id(5)));
        assert.ok(calls.some(args => args[0] === "image" && args[1] === "inspect"
            && args.length === 3 && args[2] === id(8)));
        assert.ok(calls.some(args => args[0] === "rmi" && args[1] === nodeRealReference));
        assert.ok(!calls.some(args => args[0] === "rmi" && args[1] === "node:26-alpine"));
        assert.equal(result.examined.find(item => item.id === id(8))?.outcome, "removed");
        assert.ok(!result.errors.some(error => error.includes(id(8))));
        assert.ok(!result.alreadyAbsent.includes("node:26-alpine"));
        assert.deepEqual(calls.filter(args => args[0] === "rmi"
            && [ "fixture/multi:first", "fixture/multi:second" ].includes(args[1])).map(args => args[1]),
        [ "fixture/multi:first", "fixture/multi:second" ]);
        assert.ok(calls.some(args => args[0] === "rmi" && args[1] === id(15)));
        assert.ok(calls.some(args => args[0] === "rmi" && args[1] === id(16)));
        assert.equal(calls.filter(args => args[0] === "images" && args[1] === "-a").length, 2);
        assert.equal(calls.filter(args => args[0] === "image" && args[1] === "inspect" && args.length > 3).length, 1);
        assert.equal(calls.filter(args => args[0] === "image" && args[1] === "inspect" && args.length === 3).length, 31);
        assert.equal(calls.filter(args => args[0] === "rmi" && !args[1].startsWith("sha256:")).length, 7);
        assert.equal(calls.filter(args => args[0] === "rmi" && args[1].startsWith("sha256:")).length, 5);
        assert.match(result.examined.find(item => item.id === id(10))?.detail ?? "", /permission denied/);
        assert.match(result.examined.find(item => item.id === id(11))?.detail ?? "", /encore présente/);
        assert.match(result.examined.find(item => item.id === id(13))?.detail ?? "", /résultat précédent : removed/);
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

test("les boutons du panneau Purge auto restent des exécutions auto-prune", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "backend/routers/docker-resources-router.ts"), "utf8");
    assert.match(source, /auto-prune\/run\/dangling[\s\S]*runDanglingPrune\(\s*true,\s*undefined,\s*\[\],\s*false,\s*"automatic"/);
    assert.match(source, /auto-prune\/run\/unused[\s\S]*runUnusedPrune\(\s*true,\s*undefined,\s*\[\],\s*false,\s*"automatic"/);
});

test("l'ImageWatcher réconcilie les keep dès son démarrage", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "backend/watchers/image-watcher.ts"), "utf8");
    assert.match(source, /cleanupCron = cron\.schedule\("0 \* \* \* \*"/);
    assert.match(source, /Réconciliation immédiate des tags rollback expirés\/orphelins au démarrage\.[\s\S]*this\.cleanExpiredRollbacks\(\)\.catch\(console\.error\)/);
});
