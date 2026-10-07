#!/usr/bin/env node
const fs = require("node:fs");

const args = process.argv.slice(2);
fs.appendFileSync(process.env.DOCKGE_PRUNE_FIXTURE_LOG, `${JSON.stringify(args)}\n`);

const id = number => `sha256:${number.toString(16).padStart(64, "0")}`;
const rows = [
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
    RepoTags: [ `${row.Repository}:${row.Tag}` ],
    RepoDigests: [],
    Created: "2026-09-01T00:00:00Z",
}));

if (args[0] === "images" && args[1] === "-a") {
    process.stdout.write(rows.map(row => JSON.stringify(row)).join("\n"));
} else if (args[0] === "image" && args[1] === "inspect") {
    const selected = args.slice(2).map(reference => images.find(image =>
        image.Id === reference || image.RepoTags.includes(reference))).filter(Boolean);
    if (selected.length !== args.length - 2) {
        process.stderr.write("Error response from daemon: No such image\n");
        process.exitCode = 1;
    } else {
        process.stdout.write(JSON.stringify(selected));
    }
} else if (args[0] === "ps" && args[1] === "-aq") {
    if (args.length === 2 || args[3] === `ancestor=${id(1)}`) {
        process.stdout.write("fixture-active-container\n");
    }
} else if (args[0] === "inspect" && args[1] === "fixture-active-container") {
    process.stdout.write(JSON.stringify([{ Id: "fixture-active-container", Image: id(1), State: { Status: "running" } }]));
} else if (args[0] !== "rmi") {
    process.stderr.write(`Commande inattendue : ${args.join(" ")}\n`);
    process.exitCode = 2;
}
