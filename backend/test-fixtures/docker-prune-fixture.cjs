#!/usr/bin/env node
const fs = require("node:fs");

const args = process.argv.slice(2);
const logPath = process.env.DOCKGE_PRUNE_FIXTURE_LOG;
const previousCommands = fs.existsSync(logPath)
    ? fs.readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
fs.appendFileSync(logPath, `${JSON.stringify(args)}\n`);

const id = number => `sha256:${number.toString(16).padStart(64, "0")}`;
const scenario = process.env.DOCKGE_PRUNE_FIXTURE_SCENARIO
    ? JSON.parse(fs.readFileSync(process.env.DOCKGE_PRUNE_FIXTURE_SCENARIO, "utf8")) : {};
const rows = scenario.rows ?? [
    { Repository: "fixture/active", Tag: "latest", ID: id(1) },
    { Repository: "fixture/rollback", Tag: "latest", ID: id(2) },
    ...Array.from({ length: 15 }, (_, index) => ({
        Repository: `fixture/unused-${index}`,
        Tag: "latest",
        ID: id(index + 3),
    })),
];
const removedTargets = new Set(previousCommands
    .filter(command => command[0] === "rmi"
        && (!scenario.rmiErrors?.[command.at(-1)] || scenario.rmiMissingAndAbsent?.includes(command.at(-1)))
        && !scenario.rmiLeavesPresent?.includes(command.at(-1)))
    .map(command => command.at(-1)));
const initialInventoryDone = previousCommands.some(command => command[0] === "images" && command[1] === "-a");
const visibleRows = rows.filter(row => !removedTargets.has(row.ID)
    && !removedTargets.has(`${row.Repository}:${row.Tag}`)
    && !(initialInventoryDone && scenario.missingIds?.includes(row.ID)));
const images = visibleRows.map(row => ({
    Id: row.ID,
    RepoTags: row.Tag === "<none>" ? [] : [ `${row.Repository}:${row.Tag}` ],
    RepoDigests: row.RepoDigests ?? [],
    Created: row.Created ?? "2026-09-01T00:00:00Z",
}));

if (args[0] === "images" && args[1] === "-a") {
    if (args[4] === "{{.ID}}") {
        process.stdout.write([ ...new Set(visibleRows.map(row => row.ID)) ].join("\n"));
    } else {
        process.stdout.write(visibleRows.map(row => JSON.stringify(row)).join("\n"));
    }
} else if (args[0] === "image" && args[1] === "inspect") {
    const selected = args.slice(2).map(reference => images.find(image =>
        image.Id === reference || image.RepoTags.includes(reference))).filter(Boolean);
    const omittedFromBatch = args.length > 3 && args.slice(2).some(reference => scenario.batchOmittedIds?.includes(reference));
    const forcedMissing = args.slice(2).some(reference => scenario.missingIds?.includes(reference)
        || (scenario.postInspectMissingButFinalPresent?.includes(reference)
            && previousCommands.some(command => command[0] === "rmi" && command.at(-1) === reference)));
    const forcedError = args.slice(2).find(reference => scenario.inspectErrors?.[reference]);
    if (forcedError) {
        process.stderr.write(scenario.inspectErrors[forcedError]);
        process.exitCode = 1;
    } else if (omittedFromBatch) {
        process.stdout.write(JSON.stringify(selected.filter(image => !scenario.batchOmittedIds.includes(image.Id))));
    } else if (selected.length !== args.length - 2 || forcedMissing) {
        process.stderr.write("Error response from daemon: No such image\n");
        process.exitCode = 1;
    } else {
        process.stdout.write(JSON.stringify(selected));
    }
} else if (args[0] === "ps" && args[1] === "-aq") {
    const containers = scenario.containers ?? [{ Id: "fixture-active-container", Image: id(1), State: { Status: "running" } }];
    if (args.length === 2) {
        process.stdout.write(containers.map(container => container.Id).join("\n"));
    } else {
        process.stdout.write(containers.filter(container => args[3] === `ancestor=${container.Image}`).map(container => container.Id).join("\n"));
    }
} else if (args[0] === "inspect") {
    const containers = scenario.containers ?? [{ Id: "fixture-active-container", Image: id(1), State: { Status: "running" } }];
    process.stdout.write(JSON.stringify(containers.filter(container => args.slice(1).includes(container.Id))));
} else if (args[0] === "rmi" && scenario.rmiErrors?.[args.at(-1)]) {
    process.stderr.write(scenario.rmiErrors[args.at(-1)]);
    process.exitCode = 1;
} else if (args[0] !== "rmi" && args[0] !== "tag") {
    process.stderr.write(`Commande inattendue : ${args.join(" ")}\n`);
    process.exitCode = 2;
}
