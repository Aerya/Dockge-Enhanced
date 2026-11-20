import { mkdir, writeFile, readdir, readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { previewModel } from "../common/deployment-preview";
import { rolloutTransport, type DockerRun } from "./service-rollout";
const active = new Set<string>();
/** Only deterministic, exclusively owned preview projects; no arbitrary Compose in recovery. */
async function cleanupPreviews(stateDir: string, docker: DockerRun) {
    const directory = path.join(stateDir, "previews");
    for (const name of await readdir(directory).catch(() => [])) {
        if (!/^preview-[a-f0-9]{32}$/.test(name) || active.has(name)) {
            continue;
        }
        const marker = path.join(directory, name);
        if ((await readFile(marker, "utf8")).trim() !== name) {
            throw new Error("Invalid preview journal");
        }
        const ids = (await docker([ "ps", "-aq", "--filter", "label=dockge.preview.project=" + name, "--filter", "label=com.docker.compose.project=" + name ], 15000)).trim().split(/\s+/).filter(Boolean);
        if (ids.some(id => !/^[a-f0-9]{12,64}$/.test(id))) {
            throw new Error("Invalid preview identity");
        }
        if (ids.length) {
            await docker([ "rm", "-f", "-v", ...ids ], 30000);
        }
        const networks = (await docker([ "network", "ls", "-q", "--filter", "label=dockge.preview.project=" + name, "--filter", "label=com.docker.compose.project=" + name ], 15000)).trim().split(/\s+/).filter(Boolean);
        if (networks.some(id => !/^[a-f0-9]{12,64}$/.test(id))) {
            throw new Error("Invalid preview network identity");
        }
        if (networks.length) {
            await docker([ "network", "rm", ...networks ], 15000);
        }
        await rm(path.join(directory, name + ".json"), { force: true });
        await rm(marker);
    }
}
/** A transient, real health preview, automatically destroyed; never deploy over a production project. */
export async function runDeploymentPreview(input: unknown, stateDir: string) {
    const project = "preview-" + randomUUID().replaceAll("-", "");
    const model = previewModel(input, project);
    const directory = path.join(stateDir, "previews");
    await mkdir(directory, { recursive: true,
        mode: 0o700 });
    const file = path.join(directory, project + ".json");
    const transport = rolloutTransport([ "compose", "-p", project, "-f", file ], directory);
    active.add(project);
    try {
        await writeFile(path.join(directory, project), project, { mode: 0o600,
            flag: "wx" });
        await writeFile(file, JSON.stringify(model), { mode: 0o600,
            flag: "wx" });
        for (const service of Object.values(model.services)) {
            const reference = String((service as Record<string, unknown>).image);
            const inspect = () => transport.docker([ "image", "inspect", reference ], 15000);
            let text: string;
            try {
                text = await inspect();
            } catch {
                await transport.docker([ "pull", reference ], 120000);
                text = await inspect();
            }
            const [ image ] = JSON.parse(text) as Array<{ Id: string;
                Config?: { Labels?: Record<string, string>;
                    Env?: string[] } }>;
            if (!/^sha256:[a-f0-9]{64}$/.test(image.Id) || Object.keys(image.Config?.Labels || {}).some(key => /^(traefik\.|caddy[._]|plugNPiN\.)/.test(key)) ||
                image.Config?.Env?.some(value => /^VIRTUAL_HOST=.+/.test(value))) {
                throw new Error("Preview refuses image-level publication metadata");
            }
            (service as Record<string, unknown>).image = image.Id;
        }
        // Pin the inspected local image; never allow a later pull to bypass metadata checks.
        await writeFile(file, JSON.stringify(model), { mode: 0o600 });
        await transport.compose([ "up", "-d", "--no-build", "--pull", "never" ], 120000);
        const expected = Object.keys(model.services).length;
        for (let attempt = 0; attempt < 30; attempt++) {
            const ids = (await transport.compose([ "ps", "-aq" ], 15000)).trim().split(/\s+/).filter(Boolean);
            const states = ids.length ? JSON.parse(await transport.docker([ "inspect", "--format", "{{json .State}}", ...ids ], 15000).then(text => "[" + text.trim().split("\n").join(",") + "]")) as Array<{ Running: boolean;
                Health?: { Status: string } }> : [];
            if (states.length !== expected || states.some(s => !s.Running || s.Health?.Status === "unhealthy")) {
                throw new Error("Preview failed health checks");
            }
            if (states.every(s => s.Health?.Status === "healthy")) {
                return { healthy: true,
                    services: Object.keys(model.services) };
            }
            if (states.some(s => !s.Health)) {
                return { healthy: false,
                    services: Object.keys(model.services) };
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        throw new Error("Preview health timeout");
    } finally {
        active.delete(project);
        await recoverPreviews(stateDir, transport.docker);
    }
}

let cleanupQueue: Promise<void> = Promise.resolve();
export function recoverPreviews(stateDir: string, docker: DockerRun): Promise<void> {
    const pending = cleanupQueue.catch(() => {}).then(() => cleanupPreviews(stateDir, docker));
    cleanupQueue = pending;
    return pending;
}
