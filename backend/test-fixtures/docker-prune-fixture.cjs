#!/usr/bin/env node
const fs = require("node:fs");

const args = process.argv.slice(2);
fs.appendFileSync(process.env.DOCKGE_PRUNE_FIXTURE_LOG, `${JSON.stringify(args)}\n`);

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
const images = rows.map(row => ({
    Id: row.ID,
    RepoTags: row.Tag === "<none>" ? [] : [ `${row.Repository}:${row.Tag}` ],
    RepoDigests: row.RepoDigests ?? [],
    Created: row.Created ?? "2026-09-01T00:00:00Z",
}));

if (args[0] === "images" && args[1] === "-a") {
    process.stdout.write(rows.map(row => JSON.stringify(row)).join("\n"));
} else if (args[0] === "image" && args[1] === "inspect") {
    const selected = args.slice(2).map(reference => images.find(image =>
        image.Id === reference || image.RepoTags.includes(reference))).filter(Boolean);
    if (selected.length !== args.length - 2 || args.slice(2).some(reference => scenario.missingIds?.includes(reference))) {
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
