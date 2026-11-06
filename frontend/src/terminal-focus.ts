import type { Terminal } from "@xterm/xterm";

/** Keep log viewers read-only and never summon a touchscreen keyboard on mount. */
export function configureTerminalFocus(terminal: Pick<Terminal, "options" | "textarea" | "focus">, mode: string, touch: boolean): void {
    const readOnly = mode === "displayOnly";
    terminal.options.disableStdin = readOnly;
    if (terminal.textarea) {
        terminal.textarea.readOnly = readOnly;
    }
    if (!readOnly && !touch) {
        terminal.focus();
    }
}
