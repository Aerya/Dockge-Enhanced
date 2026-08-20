import test from "node:test";
import assert from "node:assert/strict";
import { Terminal } from "./terminal";
import { DockgeServer } from "./dockge-server";

test("captures progress output without changing the terminal exit contract", async () => {
    let output = "";
    const exitCode = await Terminal.exec({} as DockgeServer, undefined, `terminal-capture-${Date.now()}`, process.execPath, [ "-e", "process.stderr.write('\\u001b[31mport is already allocated\\u001b[0m\\n');" ], process.cwd(), data => {
        output += data;
    });

    assert.equal(exitCode, 0);
    assert.match(output, /port is already allocated/);
});
