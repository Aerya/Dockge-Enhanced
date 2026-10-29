#!/usr/bin/env node
// Strict test-only Docker replacement: never contacts a Docker daemon.
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FIXTURE_DOCKER_LOG, JSON.stringify(args) + "\n");
let result;
if (args[0] === "container" && args[1] === "inspect") {
    result = JSON.stringify([{
        Id: "a".repeat(64), Image: "sha256:" + "b".repeat(64), Name: "/fixture-enhanced",
        Config: { Image: "ghcr.io/aerya/dockge-enhanced:latest", Labels: {} },
        Mounts: [{ Type: "volume", Name: "fixture-data", Source: "/fixture-data", Destination: process.env.DOCKGE_DATA_DIR }],
        NetworkSettings: { Networks: { "fixture-network": {} } },
    }]);
} else if (args[0] === "info") result = "/fixture-docker";
else if (args[0] === "image" && args[1] === "inspect") result = "100000000";
else if (args[0] === "image" && args[1] === "pull") result = "pulled";
else if (args[0] === "run" && args.includes("df")) result = "Filesystem 1024-blocks Used Available Capacity Mounted on\nfixture 20000000 1 10000000 1% /dockge-docker-root";
else if (args[0] === "run" && args.includes("-d")) result = "fixture-sidecar";
else { process.stderr.write("Unexpected fake Docker command"); process.exit(1); }
process.stdout.write(result);
