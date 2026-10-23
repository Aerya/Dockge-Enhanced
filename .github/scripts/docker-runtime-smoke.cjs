"use strict";

const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { brotliCompressSync, brotliDecompressSync } = require("node:zlib");

async function main() {
    const [ major, minor, patch ] = process.versions.node.split(".").map(Number);
    assert.equal(major, 26, "L’image doit conserver Node 26");
    assert.ok(minor > 12 || (minor === 12 && patch >= 1), "Node >= 26.12.1 requis");
    console.log(`Runtime embarqué : Node ${process.versions.node}, ${process.platform}/${process.arch}`);
    const payload = Buffer.from("Dockge-Enhanced : test Brotli bénin");
    assert.deepEqual(brotliDecompressSync(brotliCompressSync(payload)), payload);
    if (process.argv.includes("--runtime-only")) return;

    const requireApp = createRequire("/app/package.json");
    const sqlite = requireApp("@louislam/sqlite3");
    const pty = requireApp("@homebridge/node-pty-prebuilt-multiarch");
    const directory = mkdtempSync(join(tmpdir(), "dockge-native-smoke-"));
    let database;
    try {
        database = await new Promise((resolve, reject) => {
            const db = new sqlite.Database(join(directory, "test.sqlite"), error => error ? reject(error) : resolve(db));
        });
        await new Promise((resolve, reject) => database.exec("CREATE TABLE smoke (value INTEGER); INSERT INTO smoke VALUES (42)", error => error ? reject(error) : resolve()));
        const row = await new Promise((resolve, reject) => database.get("SELECT value FROM smoke", (error, result) => error ? reject(error) : resolve(result)));
        assert.deepEqual(row, { value: 42 });
        console.log("sqlite3 : création, écriture et lecture OK");
        await new Promise((resolve, reject) => {
            const terminal = pty.spawn("/bin/sh", [ "-c", "printf dockge-pty-ok" ], {
                name: "xterm", cols: 80, rows: 24, cwd: directory, env: { PATH: "/usr/bin:/bin", TERM: "xterm" },
            });
            let output = "";
            let exitCode;
            const timer = setTimeout(() => {
                terminal.kill();
                reject(new Error("node-pty : délai dépassé"));
            }, 10000);
            const check = () => {
                if (exitCode !== undefined && exitCode !== 0) {
                    clearTimeout(timer);
                    reject(new Error(`node-pty : code de sortie ${exitCode}`));
                } else if (exitCode === 0 && output.includes("dockge-pty-ok")) {
                    clearTimeout(timer);
                    resolve();
                }
            };
            terminal.onData(data => { output += data; check(); });
            terminal.onExit(event => { exitCode = event.exitCode; check(); });
        });
        console.log("node-pty : création du PTY, sortie du shell et fermeture OK");
    } finally {
        if (database) await new Promise((resolve, reject) => database.close(error => error ? reject(error) : resolve()));
        rmSync(directory, { recursive: true, force: true });
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
