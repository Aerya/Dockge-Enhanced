import { createHash } from "node:crypto";
import os from "node:os";
import { promisify } from "node:util";
import { execFile } from "../buffered-process";
import { Settings } from "../settings";
import { hubOnly, requireLocalRuntime } from "../hub-mode";
import { parseReport, type HostReport } from "./report";
import { EMPTY_OPERATIONS, HOST_SCOPES, hostOperationStatus, queueHostOperation } from "./operations";
const exec = promisify(execFile);
const OWNER = "net.dockge-enhanced.host-owner";
const SETUP = "dockge-host-setup";
interface Context { owner: string;
    image: string;
    bridge: string }
interface SetupOptions { mode: "monitor" | "manual" | "automatic";
    scopes: string[];
    hours: number[];
    packages: string[];
    refreshMetadata: boolean }
interface SetupJob extends Context { id: string;
    mode: string;
    state: string;
    options?: SetupOptions }
export function setupOptions(value: unknown): SetupOptions {
    const v = value as SetupOptions;
    if (!v || Object.keys(v).some(k => !["mode", "scopes", "hours", "packages", "refreshMetadata"].includes(k)) ||
        !["monitor", "manual", "automatic"].includes(v.mode) || typeof v.refreshMetadata !== "boolean" ||
        !Array.isArray(v.scopes) || !v.scopes.length || v.scopes.length > 4 || v.scopes.some(s => !HOST_SCOPES.includes(s)) ||
        !Array.isArray(v.hours) || !v.hours.length || v.hours.length > 24 || v.hours.some(h => !Number.isInteger(h) || h < 0 || h > 23) ||
        !Array.isArray(v.packages) || v.packages.length > 500 || v.packages.some(p => typeof p !== "string" || !/^[a-z0-9][a-z0-9+.-]{0,199}$/.test(p))) {
        throw new Error("hosts.invalidSettings");
    }
    return { mode: v.mode,
        scopes: [...new Set(v.scopes)],
        hours: [...new Set(v.hours)],
        packages: [...new Set(v.packages)],
        refreshMetadata: v.refreshMetadata };
}
export async function hostDocker(...args: string[]): Promise<string> {
    try {
        return (await exec("docker", args, { timeout: 30000,
            maxBuffer: 20 * 1024 * 1024 })).stdout;
    } catch {
        throw new Error("hosts.setupFailed");
    }
}
async function context(): Promise<Context> {
    requireLocalRuntime();
    const security = JSON.parse(await hostDocker("info", "--format", "{{json .SecurityOptions}}"));
    if (!Array.isArray(security) || security.some((s: string) => /rootless|userns/.test(s))) {
        throw new Error("hosts.setupUnsupported");
    }
    const self = JSON.parse(await hostDocker("inspect", process.env.HOSTNAME || os.hostname()))[0];
    const data = self.Mounts?.find((m: { Destination: string }) => m.Destination === "/app/data");
    if (!data?.Source || !/^sha256:[a-f0-9]{64}$/.test(self.Image)) {
        throw new Error("hosts.setupUnsupported");
    }
    const owner = createHash("sha256").update(data.Source).digest("hex").slice(0, 16);
    return { owner,
        image: self.Image,
        bridge: `dockge-host-bridge-${owner}` };
}
export function bridgeArgs(c: Context): string[] {
    return ["create", "--name", c.bridge, "--label", `${OWNER}=${c.owner}`, "--label", "net.dockge-enhanced.host-component=bridge", "--pull=never",
        "--restart", "unless-stopped", "--network", "none", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--read-only", "--user", "0:0",
        "--pids-limit", "64", "--memory", "128m", "--tmpfs", "/tmp:rw,noexec,nosuid,size=32m",
        "--mount", "type=bind,source=/var/lib/dockge-host-reports,target=/host-reports,readonly",
        "--mount", "type=bind,source=/var/lib/dockge-host-operations,target=/host-operations,readonly",
        "--mount", "type=bind,source=/var/lib/dockge-host-requests,target=/host-requests",
        "--entrypoint", "node", c.image, "-e", "setInterval(()=>{},3600000)"];
}
async function inspect(name: string) {
    return JSON.parse(await hostDocker("inspect", name))[0];
}
async function ensureBridge(c: Context) {
    const present = await inspect(c.bridge).catch(() => null);
    if (present) {
        if (present.Config?.Labels?.[OWNER] !== c.owner) {
            throw new Error("hosts.setupFailed");
        }
        await hostDocker("rm", "-f", c.bridge);
    }
    await hostDocker(...bridgeArgs(c));
    await hostDocker("start", c.bridge);
    await Settings.set("hostManagedBridge", c);
    cache = null;
}
let starting = false;
let reconciling: Promise<void> | null = null;
export async function startHostSetup(raw: unknown) {
    const options = setupOptions(raw);
    if (starting) {
        throw new Error("hosts.setupBusy");
    }
    starting = true;
    try {
        const c = await context();
        const previous = await inspect(SETUP).catch(() => null);
        if (previous) {
            if (previous.Config?.Labels?.[OWNER] !== c.owner || previous.State?.Running) {
                throw new Error("hosts.setupBusy");
            }
            await hostDocker("rm", SETUP);
        }
        // Only this explicitly approved one-shot process gets host namespaces. It has no Docker socket.
        const id = (await hostDocker("create", "--name", SETUP, "--label", `${OWNER}=${c.owner}`, "--label", "net.dockge-enhanced.host-component=setup",
            "--pull=never", "--privileged", "--pid=host", "--network", "none", "--restart", "no", "--entrypoint", "node", c.image,
            "/app/extra/host-management/bootstrap.cjs", Buffer.from(JSON.stringify(options)).toString("base64"))).trim();
        if (!/^[a-f0-9]{64}$/.test(id)) {
            throw new Error("hosts.setupFailed");
        }
        await Settings.set("hostSetupJob", { ...c,
            id,
            mode: options.mode,
            options,
            state: "installing" });
        await hostDocker("start", id);
        return { state: "installing" };
    } finally {
        starting = false;
    }
}
async function reconcile() {
    const job = await Settings.get("hostSetupJob") as SetupJob | null;
    if (!job || job.state !== "installing") {
        return;
    }
    try {
        const container = await inspect(job.id);
        if (container.Config?.Labels?.[OWNER] !== job.owner) {
            throw new Error("owner");
        }
        if (container.State?.Status === "created") {
            if (!starting) {
                await hostDocker("start", job.id);
            }
            return;
        }
        if (container.State?.Running) {
            return;
        }
        if (container.State?.ExitCode !== 0) {
            throw new Error("installer");
        }
        await ensureBridge(job);
        await Settings.set("hostSetupJob", { ...job,
            state: "ready" });
        await hostDocker("rm", job.id).catch(() => undefined);
    } catch {
        await Settings.set("hostSetupJob", { ...job,
            state: "failed" });
    }
}
export async function hostSetupStatus() {
    if (hubOnly()) {
        return { state: "unsupported",
            mode: "monitor" };
    }
    if (!reconciling) {
        reconciling = reconcile().finally(() => {
            reconciling = null;
        });
    }
    await reconciling;
    const job = await Settings.get("hostSetupJob") as SetupJob | null;
    return { state: job?.state ?? "required",
        mode: job?.mode ?? "monitor",
        options: job?.options };
}
type BridgeData = { report: HostReport;
    operations: Awaited<ReturnType<typeof hostOperationStatus>> };
let cache: { at: number;
    value: BridgeData } | null = null;
let reading: Promise<BridgeData> | null = null;
export async function managedHostData() {
    const c = await Settings.get("hostManagedBridge") as Context | null;
    if (!c) {
        return null;
    }
    if (cache && Date.now() - cache.at < 10000) {
        return cache.value;
    }
    if (!reading) {
        reading = (async () => {
            const container = await inspect(c.bridge);
            if (container.Config?.Labels?.[OWNER] !== c.owner) {
                throw new Error("hosts.invalidReport");
            }
            if (!container.State.Running) {
                await hostDocker("start", c.bridge);
            }
            const value = JSON.parse(await hostDocker("exec", c.bridge, "/app/node_modules/.bin/tsx", "/app/backend/hosts/bridge-cli.ts", "read"));
            value.report = parseReport(value.report);
            cache = { at: Date.now(),
                value };
            return value as BridgeData;
        })().finally(() => {
            reading = null;
        });
    }
    return reading;
}
export async function currentHostOperations(hostId?: string) {
    const managed = await managedHostData();
    if (managed) {
        return managed.report.hostId === hostId ? managed.operations : { ...EMPTY_OPERATIONS };
    }
    return hostOperationStatus(hostId);
}
export async function submitHostOperation(request: unknown, hostId: string) {
    const c = await Settings.get("hostManagedBridge") as Context | null;
    if (!c) {
        return queueHostOperation(request, hostId);
    }
    const data = await managedHostData();
    if (data?.report.hostId !== hostId) {
        throw new Error("hosts.invalidOperation");
    }
    const result = JSON.parse(await hostDocker("exec", c.bridge, "/app/node_modules/.bin/tsx", "/app/backend/hosts/bridge-cli.ts", "request", Buffer.from(JSON.stringify({ request,
        hostId })).toString("base64")));
    cache = null;
    return result;
}
