import childProcessAsync from "promisify-child-process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { DockgeServer } from "./dockge-server";
import { Stack } from "./stack";
import { ValidationError } from "./util-server";

const MAX_GIT_OUTPUT = 256 * 1024;
const DEFAULT_GITIGNORE = [
    "# Dockge Enhanced safe defaults",
    ".env",
    ".env.*",
    "!.env.example",
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx",
    "secrets/",
    ".dockge-meta.json",
    "",
].join("\n");

export function isSensitiveGitPath(value: string): boolean {
    return value.split(/\s+->\s+/).some(candidate => {
        const normalized = candidate.replace(/^"|"$/g, "").replaceAll("\\", "/");
        const parts = normalized.split("/");
        const basename = parts.at(-1)?.toLowerCase() ?? "";
        const isEnvironment = basename === ".env"
            || (basename.startsWith(".env.") && basename !== ".env.example");
        return isEnvironment
            || parts.some(part => /^secrets?$/i.test(part))
            || /\.(?:pem|key|p12|pfx)$/i.test(basename);
    });
}

interface GitResult {
    stdout: string;
    stderr: string;
}

function trimOutput(value: unknown): string {
    const text = String(value ?? "");
    return text.length > MAX_GIT_OUTPUT
        ? `${text.slice(0, MAX_GIT_OUTPUT)}\n[output truncated]`
        : text;
}

function sanitizeRemote(value: string): string {
    const remote = value.trim();
    try {
        const url = new URL(remote);
        url.username = "";
        url.password = "";
        return url.toString();
    } catch {
        return remote.replace(/(https?:\/\/)[^/@\s]+@/i, "$1***@");
    }
}

export function validateGitRemote(value: unknown): string {
    const remote = String(value ?? "").trim();
    if (!remote || remote.length > 2048 || /[\r\n\u0000]/.test(remote)) {
        throw new ValidationError("Invalid Git remote URL");
    }
    if (/^https?:\/\/[^/\s]*@/i.test(remote)) {
        throw new ValidationError("Credentials must not be embedded in a Git remote URL");
    }
    if (!/^https?:\/\/[^\s]+$/i.test(remote) && !/^(?:ssh:\/\/[^\s]+|git@[A-Za-z0-9_.-]+:[^\s]+)$/.test(remote)) {
        throw new ValidationError("Git remote must use HTTPS or SSH");
    }
    return remote;
}

export class StackGitService {
    constructor(private server: DockgeServer) {
    }

    async status(stackName: string) {
        const cwd = await this.stackPath(stackName);
        const initialized = await this.isRepository(cwd);
        if (!initialized) {
            return {
                initialized: false,
                branch: null,
                remote: null,
                changes: [],
                history: [],
            };
        }
        const [ branch, status, remote, history ] = await Promise.all([
            this.run(cwd, [ "branch", "--show-current" ], true),
            this.run(cwd, [ "status", "--porcelain=v1" ], true),
            this.run(cwd, [ "remote", "get-url", "origin" ], true),
            this.run(cwd, [ "log", "-n", "20", "--date=iso-strict", "--pretty=format:%H%x09%ad%x09%s" ], true),
        ]);
        return {
            initialized: true,
            branch: branch.stdout.trim() || null,
            remote: remote.stdout.trim() ? sanitizeRemote(remote.stdout) : null,
            changes: status.stdout.split(/\r?\n/).filter(Boolean).map(line => ({
                status: line.slice(0, 2),
                path: line.slice(3),
                sensitive: isSensitiveGitPath(line.slice(3)),
            })),
            history: history.stdout.split(/\r?\n/).filter(Boolean).map(line => {
                const [ hash, date, ...message ] = line.split("\t");
                return { hash,
                    date,
                    message: message.join("\t") };
            }),
        };
    }

    async diff(stackName: string): Promise<string> {
        const cwd = await this.repositoryPath(stackName);
        const worktree = await this.run(cwd, [
            "diff", "--no-ext-diff", "--",
            ".", ":(exclude).env", ":(exclude).env.*", ":(exclude)secrets/**",
            ":(exclude)*.pem", ":(exclude)*.key", ":(exclude)*.p12", ":(exclude)*.pfx",
        ], true);
        const staged = await this.run(cwd, [
            "diff", "--cached", "--no-ext-diff", "--",
            ".", ":(exclude).env", ":(exclude).env.*", ":(exclude)secrets/**",
            ":(exclude)*.pem", ":(exclude)*.key", ":(exclude)*.p12", ":(exclude)*.pfx",
        ], true);
        return trimOutput([ worktree.stdout, staged.stdout ].filter(Boolean).join("\n"));
    }

    async init(stackName: string) {
        const cwd = await this.stackPath(stackName);
        if (!await this.isRepository(cwd)) {
            await this.run(cwd, [ "init" ]);
        }
        const ignorePath = path.join(cwd, ".gitignore");
        try {
            await fs.access(ignorePath);
        } catch {
            await fs.writeFile(ignorePath, DEFAULT_GITIGNORE, {
                encoding: "utf8",
                mode: 0o600,
            });
        }
        return await this.status(stackName);
    }

    async setRemote(stackName: string, remoteInput: unknown) {
        const cwd = await this.repositoryPath(stackName);
        const remote = validateGitRemote(remoteInput);
        const existing = await this.run(cwd, [ "remote", "get-url", "origin" ], true);
        await this.run(cwd, existing.stdout.trim()
            ? [ "remote", "set-url", "origin", remote ]
            : [ "remote", "add", "origin", remote ]);
        return await this.status(stackName);
    }

    async commit(stackName: string, messageInput: unknown) {
        const cwd = await this.repositoryPath(stackName);
        const message = String(messageInput ?? "").trim();
        if (!message || message.length > 500 || /[\u0000\r\n]/.test(message)) {
            throw new ValidationError("Commit message is required, must be one line, and must not exceed 500 characters");
        }
        const status = await this.run(cwd, [ "status", "--porcelain=v1", "--untracked-files=all" ]);
        const sensitive = status.stdout.split(/\r?\n/)
            .filter(Boolean)
            .map(line => line.slice(3))
            .filter(file => isSensitiveGitPath(file));
        if (sensitive.length > 0) {
            throw new ValidationError(`Sensitive files must be removed or ignored before commit: ${sensitive.join(", ")}`);
        }
        await this.run(cwd, [
            "add", "-A", "--",
            ".", ":(exclude).env", ":(exclude).env.*", ":(exclude)secrets/**",
            ":(exclude)*.pem", ":(exclude)*.key", ":(exclude)*.p12", ":(exclude)*.pfx",
        ]);
        const staged = await this.run(cwd, [ "diff", "--cached", "--name-only" ]);
        if (!staged.stdout.trim()) {
            throw new ValidationError("No safe Git change to commit");
        }
        await this.run(cwd, [
            "-c", "user.name=Dockge Enhanced",
            "-c", "user.email=dockge-enhanced@localhost",
            "commit", "-m", message,
        ]);
        return await this.status(stackName);
    }

    async pull(stackName: string) {
        const cwd = await this.cleanRepositoryPath(stackName);
        await this.run(cwd, [ "pull", "--ff-only" ]);
        await this.validateCompose(cwd);
        return await this.status(stackName);
    }

    async push(stackName: string) {
        const cwd = await this.repositoryPath(stackName);
        await this.run(cwd, [ "push" ]);
        return await this.status(stackName);
    }

    async restore(stackName: string, refInput: unknown) {
        const cwd = await this.cleanRepositoryPath(stackName);
        const ref = String(refInput ?? "").trim();
        if (!/^[a-f0-9]{7,40}$/i.test(ref)) {
            throw new ValidationError("Restore reference must be a Git commit hash");
        }
        await this.run(cwd, [ "cat-file", "-e", `${ref}^{commit}` ]);
        await this.run(cwd, [ "checkout", ref, "--", "." ]);
        try {
            await this.validateCompose(cwd);
        } catch (error) {
            await this.run(cwd, [ "checkout", "HEAD", "--", "." ]);
            throw new Error(`Restored Compose is invalid; worktree rolled back: ${error instanceof Error ? error.message : String(error)}`);
        }
        return await this.status(stackName);
    }

    private async stackPath(stackName: string): Promise<string> {
        if (!/^[a-z0-9_-]+$/.test(stackName)) {
            throw new ValidationError("Invalid stack name");
        }
        const stack = await Stack.getStack(this.server, stackName);
        return stack.fullPath;
    }

    private async repositoryPath(stackName: string): Promise<string> {
        const cwd = await this.stackPath(stackName);
        if (!await this.isRepository(cwd)) {
            throw new ValidationError("Git is not initialized for this stack");
        }
        return cwd;
    }

    private async cleanRepositoryPath(stackName: string): Promise<string> {
        const cwd = await this.repositoryPath(stackName);
        const status = await this.run(cwd, [ "status", "--porcelain=v1" ]);
        if (status.stdout.trim()) {
            throw new ValidationError("Git worktree must be clean before pull or restore");
        }
        return cwd;
    }

    private async isRepository(cwd: string): Promise<boolean> {
        const result = await this.run(cwd, [ "rev-parse", "--is-inside-work-tree" ], true);
        return result.stdout.trim() === "true";
    }

    private async validateCompose(cwd: string): Promise<void> {
        const result = await childProcessAsync.spawn("docker", [ "compose", "config", "--quiet" ], {
            cwd,
            encoding: "utf8",
        });
        if ((result.code ?? 0) !== 0) {
            throw new Error(trimOutput(result.stderr));
        }
    }

    private async run(cwd: string, args: string[], allowFailure = false): Promise<GitResult> {
        try {
            const gitArgs = [ "-c", `safe.directory=${cwd}`, ...args ];
            const result = await childProcessAsync.spawn("git", gitArgs, {
                cwd,
                encoding: "utf8",
                maxBuffer: MAX_GIT_OUTPUT,
                env: {
                    ...process.env,
                    GIT_TERMINAL_PROMPT: "0",
                },
            });
            const code = result.code ?? 0;
            const stdout = trimOutput(result.stdout);
            const stderr = trimOutput(result.stderr);
            if (code !== 0 && !allowFailure) {
                throw new Error(stderr || stdout || `git ${args[0]} failed`);
            }
            return { stdout,
                stderr };
        } catch (error) {
            if (allowFailure) {
                return { stdout: "",
                    stderr: error instanceof Error ? error.message : String(error) };
            }
            throw error;
        }
    }
}
