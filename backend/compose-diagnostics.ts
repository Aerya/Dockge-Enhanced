import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm, access, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Stack } from "./stack";
import type { DockgeServer } from "./dockge-server";
import { ComposeModel, findImageDrift, findPortConflicts, modelPorts, PublishedPort } from "../common/compose-diagnostics";

const exec = promisify(execFile);
const activeScans = new WeakSet<DockgeServer>();

async function docker(args: string[], cwd?: string): Promise<string> {
    try {
        const result = await exec("docker", args, { cwd,
            timeout: 15000,
            maxBuffer: 8 * 1024 * 1024 });
        return result.stdout;
    } catch {
        // Compose stderr can contain interpolated secrets. Never return it to the browser.
        throw new Error("composeDiagnostics.unavailable");
    }
}

export async function inspectComposeDraft(server: DockgeServer, name: string, compose: string, env: string, override: string, isAdd: boolean, runDocker = docker) {
    if (activeScans.has(server)) {
        throw new Error("composeDiagnostics.unavailable");
    }
    activeScans.add(server);
    try {
        return await inspectDraft(server, name, compose, env, override, isAdd, runDocker);
    } finally {
        activeScans.delete(server);
    }
}

async function inspectDraft(server: DockgeServer, name: string, compose: string, env: string, override: string, isAdd: boolean, runDocker: typeof docker) {
    const deadline = Date.now() + 60000;
    const run = async (args: string[], cwd?: string) => {
        if (Date.now() > deadline) {
            throw new Error("composeDiagnostics.unavailable");
        }
        return runDocker(args, cwd);
    };
    const stack = isAdd ? new Stack(server, name, compose, env) : await Stack.getStack(server, name);
    if (!isAdd && !stack.isManagedByDockge) {
        throw new Error("composeDiagnostics.unavailable");
    }
    stack.setComposeContent(compose, env, override);
    stack.validate();
    const temporary = await mkdtemp(path.join(os.tmpdir(), "dockge-compose-check-"));
    try {
        const envFile = path.join(temporary, ".env");
        await writeFile(envFile, env, { mode: 0o600 });
        const metadata = stack.toSimpleJSON("") as { externalProject?: string;
            externalEnvFiles?: string[];
            externalConfigFiles?: string[] };
        const args = [ "compose", "--project-directory", stack.path ];
        if (metadata.externalProject) {
            args.push("--project-name", metadata.externalProject);
        }
        if (!stack.isExternal) {
            const globalEnv = path.join(server.stacksDir, "global.env");
            try {
                await access(globalEnv);
                args.push("--env-file", globalEnv);
            } catch { /* No optional global environment. */ }
        }
        args.push("--env-file", envFile);
        for (const file of metadata.externalEnvFiles?.slice(1) ?? []) {
            args.push("--env-file", file);
        }
        const texts = stack.isExternal && metadata.externalConfigFiles?.length
            ? [ compose, ...await Promise.all(metadata.externalConfigFiles.slice(1).map(file => readFile(file, "utf8"))) ]
            : stack.getComposeConfigTexts();
        for (const [ index, text ] of texts.entries()) {
            const file = path.join(temporary, `${index}.yaml`);
            await writeFile(file, text, { mode: 0o600 });
            args.push("-f", file);
        }
        const model: ComposeModel = JSON.parse(await run([ ...args, "config", "--format", "json" ]));
        const warnings: string[] = [];
        const occupied: PublishedPort[] = [];
        const stacks = await Stack.getStackList(server);
        const remaining = [ ...stacks ].filter(([ otherName, other ]) => otherName !== name && other.isManagedByDockge);
        await Promise.all(Array.from({ length: 4 }, async () => {
            for (;;) {
                const next = remaining.shift();
                if (!next) {
                    break;
                }
                const [ otherName, other ] = next;
                try {
                    const config = JSON.parse(await run(other.getComposeOptions("config", "--format", "json"), other.path));
                    occupied.push(...modelPorts(config, otherName));
                } catch {
                    warnings.push(otherName);
                }
            }
        }));
        const ids = (await run([ "ps", "-q" ])).trim().split(/\s+/).filter(Boolean);
        const containers: {
            Name: string;
            Config: { Image: string;
                Labels?: Record<string, string> };
            NetworkSettings: { Ports?: Record<string, { HostIp: string;
                HostPort: string }[] | null> };
        }[] = ids.length ? JSON.parse(await run([ "inspect", ...ids ])) : [];
        const project = model.name || metadata.externalProject || name;
        const running = [];
        for (const container of containers) {
            const labels = container.Config.Labels ?? {};
            if (labels["com.docker.compose.project"] === project) {
                if (labels["com.docker.compose.oneoff"]?.toLowerCase() !== "true") {
                    running.push({ service: labels["com.docker.compose.service"],
                        image: container.Config.Image });
                }
                continue;
            }
            for (const [ port, bindings ] of Object.entries(container.NetworkSettings.Ports ?? {})) {
                for (const binding of bindings ?? []) {
                    occupied.push({ owner: labels["com.docker.compose.project"] ?? container.Name.replace(/^\//, ""),
                        service: labels["com.docker.compose.service"] ?? "",
                        published: binding.HostPort,
                        host: binding.HostIp,
                        protocol: port.split("/")[1] });
                }
            }
        }
        const requested = modelPorts(model, name);
        // Detect duplicate bindings between services of the draft too.
        const internal = requested.flatMap((port, index) => findPortConflicts([ port ], requested.slice(index + 1)));
        const conflicts = [ ...internal, ...findPortConflicts(requested, occupied) ];
        return { conflicts: [ ...new Map(conflicts.map(item => [ JSON.stringify(item), item ])).values() ],
            drift: findImageDrift(model, running),
            warnings };
    } finally {
        await rm(temporary, { recursive: true,
            force: true });
    }
}
