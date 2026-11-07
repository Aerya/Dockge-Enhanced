import { preferredContainerShell, validContainerShell } from "../common/container-shell";

export interface ShellProbeResult {
    code: number;
    stdout?: string | Buffer | null;
    stderr?: string | Buffer | null;
}

/** Probe a bounded no-op; never retry daemon, permission or timeout errors as another shell. */
export async function resolveContainerShell(requested: string, configured: unknown, probe: (shell: string) => Promise<ShellProbeResult>) {
    const selected = requested === "default" ? preferredContainerShell(configured) : requested;
    if (!validContainerShell(selected)) {
        throw new Error("containerShell.invalid");
    }
    const result = await probe(selected);
    if (result.code === 0) {
        return { shell: selected,
            fallback: false };
    }
    const output = String(result.stderr ?? "") + String(result.stdout ?? "");
    const missing = result.code === 126 || result.code === 127
        || /exec:.*(?:executable file not found|no such file or directory)/i.test(output);
    if (selected !== "sh" && missing) {
        const fallback = await probe("sh");
        if (fallback.code === 0) {
            return { shell: "sh",
                fallback: true };
        }
    }
    throw new Error("containerShell.unavailable");
}

const creating = new Map<string, Promise<unknown>>();
/** Join concurrent opens of the same session; release failed preparations too. */
export async function withShellCreation<T>(name: string, create: () => Promise<T>): Promise<T> {
    const pending = creating.get(name);
    if (pending) {
        return pending as Promise<T>;
    }
    const promise = Promise.resolve().then(create);
    creating.set(name, promise);
    try {
        return await promise;
    } finally {
        if (creating.get(name) === promise) {
            creating.delete(name);
        }
    }
}
