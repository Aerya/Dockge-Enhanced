import test from "node:test";
import assert from "node:assert/strict";
import { mainTerminalShell, Terminal } from "./terminal";
import { DockgeServer } from "./dockge-server";

test("captures progress output without changing the terminal exit contract", async () => {
    let output = "";
    const exitCode = await Terminal.exec({} as DockgeServer, undefined, `terminal-capture-${Date.now()}`, process.execPath, [ "-e", "process.stderr.write('\\u001b[31mport is already allocated\\u001b[0m\\n');" ], process.cwd(), data => {
        output += data;
    });

    assert.equal(exitCode, 0);
    assert.match(output, /port is already allocated/);
});

test("uses bash on Unix when it is available", () => {
    assert.equal(mainTerminalShell("linux", (command) => command === "bash"), "bash");
});

test("falls back to sh on Unix when bash is unavailable", () => {
    assert.equal(mainTerminalShell("linux", () => false), "sh");
});

test("prefers PowerShell 7 and keeps the Windows PowerShell fallback", () => {
    assert.equal(mainTerminalShell("win32", (command) => command === "pwsh.exe"), "pwsh.exe");
    assert.equal(mainTerminalShell("win32", () => false), "powershell.exe");
});
