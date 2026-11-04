import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "./buffered-process";
import type { DockgeServer } from "./dockge-server";
import type { Stack } from "./stack";

const exec = promisify(execFile);

export async function mergedStackConfiguration(stack: Stack): Promise<string> {
    try {
        const result = await exec("docker", stack.getComposeOptions("config"), {
            cwd: stack.path,
            timeout: 15000,
            maxBuffer: 8 * 1024 * 1024,
        });
        return result.stdout;
    } catch {
        // Docker errors can include interpolated credentials. Never forward them.
        throw new Error("configTools.configUnavailable");
    }
}

export interface Diagnostic { key: string;
    ok: boolean;
    detail: string }

export async function configurationDiagnostics(server: DockgeServer): Promise<Diagnostic[]> {
    const tools = [[ "docker", "version", "--format", "{{.Server.Version}}" ], [ "docker", "compose", "version", "--short" ], [ "git", "--version" ], [ "docker", "buildx", "version" ]];
    const results = await Promise.all(tools.map(async ([ file, ...args ], index) => {
        const key = [ "Docker", "Compose", "Git", "Buildx" ][index];
        try {
            const { stdout } = await exec(file, args, { timeout: 10000,
                maxBuffer: 65536 });
            return { key,
                ok: true,
                detail: stdout.trim().slice(0, 200) };
        } catch {
            return { key,
                ok: false,
                detail: "configTools.toolUnavailable" };
        }
    }));
    for (const [ key, directory ] of [[ "configTools.dataDirectory", server.config.dataDir ], [ "configTools.stacksDirectory", server.stacksDir ]]) {
        const filename = path.join(directory, `.dockge-write-test-${randomUUID()}`);
        try {
            await fs.writeFile(filename, "", { flag: "wx",
                mode: 0o600 });
            await fs.unlink(filename);
            results.push({ key,
                ok: true,
                detail: "configTools.writable" });
        } catch {
            results.push({ key,
                ok: false,
                detail: "configTools.notWritable" });
        }
    }
    return results;
}
