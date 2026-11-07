export const CONTAINER_SHELLS = [ "sh", "bash", "ash", "zsh", "fish" ];

export function validContainerShell(shell: unknown): shell is string {
    return typeof shell === "string" && shell.length <= 160
        && /^(?:[a-zA-Z][a-zA-Z0-9_-]*|\/(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+)$/.test(shell)
        && !shell.split("/").includes("..");
}

export function preferredContainerShell(configured: unknown): string {
    return validContainerShell(configured) && configured !== "default" ? configured : "sh";
}

export function shellTerminalName(base: string, shell: string): string {
    return base + "-shell-" + encodeURIComponent(shell);
}
