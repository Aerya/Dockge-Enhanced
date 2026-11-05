import assert from "node:assert/strict";
import test from "node:test";
import { Terminal } from "./terminal";
import type { DockgeServer } from "./dockge-server";

test("real PTY inherits the environment and supports clear and 256 colours", async () => {
    const original = process.env.TERM;
    delete process.env.TERM;
    const output: string[] = [];
    const terminal = new Terminal({} as DockgeServer, "terminal-env-test", "/bin/sh",
        [ "-c", "printf \"TERM=%s\\n\" \"$TERM\"; tput colors; clear" ], process.cwd());
    terminal.outputTransform = text => {
        output.push(text);
        return text;
    };
    try {
        const result = new Promise<number>(resolve => terminal.onExit(resolve));
        terminal.start();
        assert.equal(await result, 0);
        assert.match(output.join(""), /TERM=xterm-256color/);
        assert.match(output.join(""), /256/);
        assert.match(output.join(""), /\u001b\[/);
        assert.equal(process.env.TERM, undefined, "do not mutate the server environment");
    } finally {
        terminal.close();
        if (original !== undefined) {
            process.env.TERM = original;
        }
    }
});

test("explicit terminal environment is preserved without inheriting server variables", async () => {
    const output: string[] = [];
    process.env.DOCKGE_TERMINAL_TEST_SECRET = "must-not-leak";
    const terminal = new Terminal({} as DockgeServer, "terminal-env-explicit-test", "/bin/sh",
        [ "-c", "printf \"%s|%s|%s\" \"$TERM\" \"$CUSTOM_VALUE\" \"${DOCKGE_TERMINAL_TEST_SECRET-unset}\"" ],
        process.cwd(), { CUSTOM_VALUE: "kept",
            TERM: "dumb" });
    terminal.outputTransform = text => {
        output.push(text);
        return text;
    };
    try {
        const result = new Promise<number>(resolve => terminal.onExit(resolve));
        terminal.start();
        assert.equal(await result, 0);
        assert.equal(output.join(""), "xterm-256color|kept|unset");
    } finally {
        terminal.close();
        delete process.env.DOCKGE_TERMINAL_TEST_SECRET;
    }
});
