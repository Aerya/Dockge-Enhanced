export function resolveCommandBuffer(original: number): number;
export function commandBufferEnvArgs(): string[];
export function isBufferOverflow(error: unknown): boolean;
export function wrapBuffered<T>(fn: T, options: { mode: "exec" | "execFile" | "spawn"; defaultBytes?: number }): T;
export const exec: typeof import("node:child_process").exec;
export const execFile: typeof import("node:child_process").execFile;
export const execFileSync: typeof import("node:child_process").execFileSync;
