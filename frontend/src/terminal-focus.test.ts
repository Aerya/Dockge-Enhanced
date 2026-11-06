import assert from "node:assert/strict";
import test from "node:test";
import { configureTerminalFocus } from "./terminal-focus";

for (const touch of [ false, true ]) {
    for (const mode of [ "displayOnly", "interactive", "mainTerminal" ]) {
        test(`${mode}, touch=${touch}: only desktop interactive terminals get automatic focus`, () => {
            let focused = false;
            const terminal = {
                options: { disableStdin: false },
                textarea: { readOnly: false } as HTMLTextAreaElement,
                focus: () => {
                    focused = true;
                },
            };
            configureTerminalFocus(terminal, mode, touch);
            assert.equal(terminal.options.disableStdin, mode === "displayOnly");
            assert.equal(terminal.textarea.readOnly, mode === "displayOnly");
            assert.equal(focused, mode !== "displayOnly" && !touch);
            // Touchscreen interactive terminals still accept a deliberate focus.
            terminal.focus();
            assert.equal(focused, true);
        });
    }
}

test("unavailable textarea does not break initialisation", () => {
    configureTerminalFocus({ options: {},
        textarea: undefined,
        focus: () => assert.fail() }, "displayOnly", true);
});
