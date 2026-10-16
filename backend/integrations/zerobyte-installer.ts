/** Instance-scoped Compose installation. No native Restic settings are modified. */
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import YAML from "yaml";
import { DockgeServer } from "../dockge-server";
import { BackupManager } from "../watchers/backup-manager";
import { resolveHostRepositoryPath } from "../watchers/backup-repository-safety";
import { zerobyte } from "./zerobyte-manager";
import { normalizeManagedSources, normalizeManagedDestinations, assertDisjointManagedMounts, type LocalSourceMount, type DockerMount } from "./zerobyte-mounts";

const exec = promisify(execFile);
export const ZEROBYTE_IMAGE = "ghcr.io/nicotsx/zerobyte:v0.43.2";
const OWNER = "net.dockge-enhanced.zerobyte-owner";
let busy = false;
interface Mount extends LocalSourceMount { remote?: boolean;
    fingerprint?: string }
interface Container { Id: string;
    Mounts: DockerMount[];
    Config: { Labels: Record<string, string>;
        Env: string[] };
    State: { Running: boolean } }

async function docker(...args: string[]): Promise<string> {
    try {
        return (await exec("docker", args, { timeout: 180000,
            maxBuffer: 4 * 1024 * 1024 })).stdout;
    } catch {
        // Never return Docker stderr: Compose can include environment secrets in it.
        throw new Error("Zerobyte Docker operation failed; check Docker availability, paths and port conflicts");
    }
}
async function context(server: DockgeServer) {
    const self = (JSON.parse(await docker("inspect", process.env.HOSTNAME || os.hostname())) as Container[])[0];
    const data = self.Mounts.find(m => m.Destination === server.config.dataDir);
    const stacks = self.Mounts.find(m => m.Destination === server.stacksDir);
    if (!data?.Source || !stacks?.Source || data.Type !== "bind" || stacks.Type !== "bind") {
        throw new Error("Managed Zerobyte requires identifiable, separate Enhanced data and stack bind mounts");
    }
    const owner = createHash("sha256").update(data.Source + ":" + stacks.Source).digest("hex").slice(0, 12);
    const name = `zerobyte-${owner}`;
    return { self,
        owner,
        name,
        directory: path.join(server.stacksDir, name) };
}
export function validateZerobyteInstallUrl(raw: unknown) {
    const url = new URL(String(raw));
    const port = Number(url.port);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || !Number.isInteger(port) || port < 1024 || port > 65535 || port === 5055 || port === 5001) {
        throw new Error("Managed Zerobyte requires http://127.0.0.1:<free port>, excluding Enhanced ports");
    }
    return { url: url.origin,
        port };
}
export function overlap(a: string, b: string): boolean {
    return a === b || a.startsWith(b.endsWith("/") ? b : b + "/") || b.startsWith(a.endsWith("/") ? a : a + "/");
}
async function hostInfo(paths: string[], protectedPaths: string[] = []) {
    // Host view is read-only, no network; read/search capability only; reject every symlink component.
    const script = `set -efu
strict=1
for candidate do
 if [ "$candidate" = "__protected__" ]; then strict=0; continue; fi
 if [ "$strict" = 1 ]; then [ -d "/host$candidate" ] || exit 20; fi
 current=''
 remaining=\u0024{candidate#/}
 oldifs=$IFS
 IFS=/
 for segment in $remaining; do
  current="$current/$segment"
  [ ! -L "/host$current" ] || exit 21
 done
 IFS=$oldifs
 if [ "$strict" = 1 ]; then stat -f -c '%t:%i' "/host$candidate"; fi
done
cat /host/proc/1/mountinfo`;
    const probeName = "enhanced-zerobyte-probe-" + createHash("sha256").update(JSON.stringify(paths)).digest("hex").slice(0, 20);
    const args = [ "create", "--rm", "--name", probeName, "--pull=never", "--network", "none", "--cap-drop", "ALL", "--cap-add", "DAC_READ_SEARCH", "--read-only", "--mount", "type=bind,source=/,target=/host,readonly", "--entrypoint", "/bin/sh", ZEROBYTE_IMAGE, "-c", script, "verify", ...paths, "__protected__", ...protectedPaths ];
    let out: string;
    let probeId: string | undefined;
    try {
        probeId = (await exec("docker", args, { timeout: 5000,
            maxBuffer: 4096 })).stdout.trim();
        if (!/^[a-f0-9]{64}$/.test(probeId)) {
            throw new Error("Invalid probe container");
        }
        out = (await exec("docker", [ "start", "--attach", probeId ], { timeout: 15000,
            maxBuffer: 4 * 1024 * 1024 })).stdout;
    } catch {
        throw new Error("Host path validation failed or timed out; operation blocked");
    } finally {
        // A hard NFS syscall can outlive a killed Docker client. A stable name bounds
        // outstanding probes for the same paths; cleanup is best effort and bounded.
        if (probeId) {
            await exec("docker", [ "rm", "-f", probeId ], { timeout: 2000,
                maxBuffer: 4096 }).catch(() => {});
        }
    }
    const lines = out.trim().split("\n");
    return { fingerprints: lines.slice(0, paths.length),
        mountinfo: lines.slice(paths.length) };
}
export function isRemoteMounted(candidate: string, lines: string[]): boolean {
    const mounts = lines.map(line => {
        const [ left, right ] = line.split(" - ");
        return { target: left.split(" ")[4]?.replace(/\\040/g, " "),
            type: right?.split(" ")[0] };
    }).filter(m => m.target && (candidate === m.target || candidate.startsWith(m.target + "/")))
        .sort((a, b) => b.target.length - a.target.length);
    return /^(nfs4?|cifs|smb3|fuse[.].+|fuse|sshfs|9p|ceph|glusterfs)$/.test(mounts[0]?.type ?? "");
}
/** Compare bind aliases in the host mount namespace, including named-volume paths. */
export function hostPathIdentity(candidate: string, lines: string[]): string {
    const decode = (value: string) => value.replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
    const mounts = lines.map(line => {
        const parts = line.split(" - ")[0].split(" ");
        return { device: parts[2],
            root: decode(parts[3] ?? ""),
            target: decode(parts[4] ?? "") };
    }).filter(m => m.target && (m.target === "/" || candidate === m.target || candidate.startsWith(m.target + "/")))
        .sort((a, b) => b.target.length - a.target.length);
    const mount = mounts[0];
    if (!mount) {
        throw new Error("Cannot resolve path in host mount table");
    }
    return mount.device + ":" + path.posix.join(mount.root, path.posix.relative(mount.target, candidate));
}
async function validate(server: DockgeServer, input: Record<string, unknown>, ctx: Awaited<ReturnType<typeof context>>) {
    const backup = BackupManager.getInstance();
    if (backup.settings.destinations.some(d => d.type !== "local") && input.attestNoRemoteOverlap !== true) {
        throw new Error("Explicit confirmation required: remote Enhanced Restic repositories cannot be compared automatically");
    }
    const protectedPaths = ctx.self.Mounts.filter(m => [ server.config.dataDir, server.stacksDir, "/backup" ].includes(m.Destination ?? "")).map(m => m.Source!);
    const others = (await docker("ps", "-aq", "--filter", "label=org.opencontainers.image.source=https://github.com/Aerya/Dockge-Enhanced")).trim().split(/\s+/).filter(Boolean);
    if (others.length) {
        for (const container of JSON.parse(await docker("inspect", ...others)) as Container[]) {
            protectedPaths.push(...container.Mounts.filter(m => [ "/app/data", "/opt/stacks", "/backup" ].includes(m.Destination ?? "")).map(m => m.Source!));
        }
    }
    const mapped = ctx.self.Mounts.map(m => ({ source: m.Source!,
        destination: m.Destination! }));
    protectedPaths.push(...backup.settings.destinations.filter(d => d.type === "local" && d.local?.path).map(d => resolveHostRepositoryPath(d.local!.path, mapped)));
    const internalVolumes = (await docker("volume", "ls", "-q", "--filter", `label=${OWNER}`)).trim().split(/\s+/).filter(Boolean);
    for (const name of internalVolumes) {
        protectedPaths.push(JSON.parse(await docker("volume", "inspect", name))[0].Mountpoint);
    }
    const sources = normalizeManagedSources(input.localMounts, protectedPaths) as Mount[];
    const destinations = normalizeManagedDestinations(input.destinationMounts, protectedPaths) as Mount[];
    if (!sources.length || !destinations.length || destinations.some(m => m.kind !== "bind")) {
        throw new Error("Select existing sources and at least one distinct host destination directory");
    }
    assertDisjointManagedMounts(sources, destinations);
    const canonical: string[] = [];
    for (const m of [ ...sources, ...destinations ]) {
        canonical.push(m.kind === "bind" ? m.source : JSON.parse(await docker("volume", "inspect", m.source))[0].Mountpoint);
    }
    for (const [ i, p ] of canonical.entries()) {
        if (typeof p !== "string" || !path.isAbsolute(p) || protectedPaths.some(root => overlap(p, root)) || canonical.some((q, j) => i !== j && overlap(p, q))) {
            throw new Error("Mount overlaps another mount, application data or an Enhanced Restic repository");
        }
    }
    const systemPaths = [ "/etc", "/proc", "/sys", "/dev", "/root", "/run", "/usr", "/boot", "/var/lib/docker", "/var/lib/containerd" ];
    const info = await hostInfo(canonical, [ ...protectedPaths, ...systemPaths ]);
    const identities = canonical.map(p => hostPathIdentity(p, info.mountinfo));
    const protectedIdentities = protectedPaths.map(p => hostPathIdentity(p, info.mountinfo));
    const systemIdentities = systemPaths.map(p => hostPathIdentity(p, info.mountinfo));
    for (const [ i, identity ] of identities.entries()) {
        if ([ ...sources, ...destinations ][i].kind === "bind" && systemIdentities.some(root => overlap(identity, root))) {
            throw new Error("Bind mount aliases a protected system directory");
        }
        if (identities.some((other, j) => i !== j && overlap(identity, other)) || protectedIdentities.some(root => overlap(identity, root))) {
            throw new Error("Mount alias overlaps another mount or protected application/Restic data");
        }
    }
    for (let i = 0; i < destinations.length; i++) {
        const raw = (input.destinationMounts as Record<string, unknown>[])[i];
        destinations[i].remote = raw.remote === true;
        if (destinations[i].remote && !isRemoteMounted(destinations[i].source, info.mountinfo)) {
            throw new Error("Expected remote destination is not mounted; refusing local fallback");
        }
        destinations[i].fingerprint = info.fingerprints[sources.length + i];
    }
    return { sources,
        destinations };
}
export function composeModel(name: string, owner: string, url: string, port: number, sources: Mount[], destinations: Mount[], callbackPort = 5001) {
    const volumes: Record<string, unknown> = {
        data: { labels: { [OWNER]: owner } },
        restores: { labels: { [OWNER]: owner } },
    };
    const mounts: Record<string, unknown>[] = [
        { type: "volume",
            source: "data",
            target: "/var/lib/zerobyte" },
        { type: "volume",
            source: "restores",
            target: "/restore-test" },
    ];
    for (const [ i, m ] of [ ...sources, ...destinations ].entries()) {
        let source = m.source;
        if (m.kind === "volume") {
            source = `source${i}`;
            volumes[source] = { external: true,
                name: m.source };
        }
        mounts.push({ type: m.kind,
            source,
            target: m.target,
            read_only: i < sources.length,
            ...(m.kind === "bind" ? { bind: { create_host_path: false } } : {}) });
    }
    // Re-check the mounted filesystem on EVERY container start, including daemon restart.
    const checks = destinations.map(m => `[ "$(stat -f -c '%t:%i' '${m.target}')" = '${m.fingerprint}' ] || exit 31`).join("\n");
    return { name,
        services: { zerobyte: {
            image: ZEROBYTE_IMAGE,
            restart: "unless-stopped",
            labels: { [OWNER]: owner },
            ports: [ `127.0.0.1:${port}:4096` ],
            healthcheck: { test: [ "CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:4096/api/healthcheck" ],
                interval: "2s",
                timeout: "2s",
                retries: 15,
                start_period: "5s" },
            environment: { BASE_URL: url,
                APP_SECRET: "${ZEROBYTE_APP_SECRET}",
                TZ: "Europe/Paris",
                WEBHOOK_ALLOWED_ORIGINS: `http://enhanced-${owner}:${callbackPort}` },
            volumes: mounts,
            networks: { default: { aliases: [ name ] } },
            entrypoint: [ "/bin/sh", "-ec", checks.replaceAll("$", () => "$$") + "\nexec bun .output/server/index.mjs" ],
        } },
        volumes };
}
async function ensureCallbackNetwork(ctx: Awaited<ReturnType<typeof context>>): Promise<void> {
    const network = JSON.parse(await docker("network", "inspect", `${ctx.name}_default`))[0];
    const selfNetworks = JSON.parse(await docker("inspect", ctx.self.Id))[0].NetworkSettings.Networks;
    if (network.Containers?.[ctx.self.Id] && !selfNetworks[`${ctx.name}_default`]?.Aliases?.includes(`enhanced-${ctx.owner}`)) {
        await docker("network", "disconnect", `${ctx.name}_default`, ctx.self.Id);
        await docker("network", "connect", "--alias", `enhanced-${ctx.owner}`, `${ctx.name}_default`, ctx.self.Id);
    } else if (!network.Containers?.[ctx.self.Id]) {
        await docker("network", "connect", "--alias", `enhanced-${ctx.owner}`, `${ctx.name}_default`, ctx.self.Id);
    }
}
export async function managedZerobyteStatus(server: DockgeServer) {
    const ctx = await context(server);
    let stored;
    try {
        stored = JSON.parse(await fs.readFile(path.join(ctx.directory, ".zerobyte.json"), "utf8"));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
        }
    }
    const ids = (await docker("ps", "-aq", "--filter", `label=com.docker.compose.project=${ctx.name}`)).trim();
    let running = false;
    if (ids) {
        const containers = JSON.parse(await docker("inspect", ...ids.split(/\s+/))) as Container[];
        if (containers.some(c => c.Config.Labels[OWNER] !== ctx.owner)) {
            throw new Error("Compose project ownership mismatch");
        }
        running = containers.every(c => c.State.Running);
    }
    return { installed: Boolean(stored),
        running,
        name: ctx.name,
        url: stored?.url ?? "",
        apiUrl: `http://${ctx.name}:4096`,
        port: stored?.port ?? null,
        localMounts: stored?.sources ?? [],
        destinationMounts: stored?.destinations ?? [],
        remoteResticDestinations: BackupManager.getInstance().settings.destinations.some(d => d.type !== "local") };
}
async function apply(server: DockgeServer, body: unknown, update: boolean) {
    if (busy) {
        throw new Error("Zerobyte installation already in progress");
    }
    const input = (body ?? {}) as Record<string, unknown>;
    if (input.confirmation !== (update ? "UPDATE ZEROBYTE MOUNTS" : "INSTALL ZEROBYTE")) {
        throw new Error("Explicit installation confirmation required");
    }
    busy = true;
    try {
        const ctx = await context(server);
        const previous = await managedZerobyteStatus(server);
        const { url, port } = validateZerobyteInstallUrl(update ? previous.url : input.url);
        await docker("pull", ZEROBYTE_IMAGE);
        const { sources, destinations } = await validate(server, input, ctx);
        const file = path.join(ctx.directory, "compose.yaml");
        const serialized = YAML.stringify(composeModel(ctx.name, ctx.owner, url, port, sources, destinations, server.config.port));
        let oldCompose: string | undefined;
        if (previous.installed) {
            oldCompose = await fs.readFile(file, "utf8");
            if (oldCompose === serialized && previous.running) {
                await ensureCallbackNetwork(ctx);
                return previous;
            }
            if (oldCompose !== serialized) {
                if (!update) {
                    throw new Error("Installation exists; use the explicit mount update action");
                }
                const overview = await zerobyte.overview();
                if (overview.tasks.length || overview.jobs.some(job => job.enabled)) {
                    throw new Error("Disable Zerobyte jobs and wait for operations to finish before changing mounts");
                }
            }
        } else {
            // Refuse to adopt any unrelated directory/project or existing internal volume.
            try {
                await fs.mkdir(ctx.directory, { mode: 0o700 });
            } catch {
                throw new Error("Stack directory exists or cannot be created; refusing adoption");
            }
            for (const suffix of [ "data", "restores" ]) {
                const found = (await docker("volume", "ls", "-q", "--filter", `name=^${ctx.name}_${suffix}$`)).trim();
                if (found) {
                    throw new Error("Internal volume exists without installation metadata; manual ownership verification required");
                }
            }
            await fs.writeFile(path.join(ctx.directory, ".env"), `ZEROBYTE_APP_SECRET=${randomBytes(32).toString("hex")}\n`, { mode: 0o600,
                flag: "wx" });
        }
        await fs.writeFile(file, serialized, { mode: 0o600 });
        if (!previous.installed) {
            await fs.writeFile(path.join(ctx.directory, ".zerobyte.json"), JSON.stringify({ sources,
                destinations,
                url,
                port }), { mode: 0o600 });
        }
        const compose = (...args: string[]) => docker("compose", "--project-directory", ctx.directory, "-p", ctx.name, "-f", file, ...args);
        try {
            await compose("config", "--quiet");
            await compose("up", "-d", "--wait", "--wait-timeout", "60");
            await ensureCallbackNetwork(ctx);
            await fs.writeFile(path.join(ctx.directory, ".zerobyte.json"), JSON.stringify({ sources,
                destinations,
                url,
                port }), { mode: 0o600 });
        } catch (error) {
            if (oldCompose) {
                await fs.writeFile(file, oldCompose, { mode: 0o600 });
                await compose("up", "-d", "--wait", "--wait-timeout", "60");
            }
            throw error;
        }
        return managedZerobyteStatus(server);
    } finally {
        busy = false;
    }
}
export const installManagedZerobyte = (server: DockgeServer, body: unknown) => apply(server, body, false);
export const updateManagedZerobyteMounts = (server: DockgeServer, body: unknown) => apply(server, body, true);

/** Only the owned managed API origin can authorize Docker-backed safety checks. */
export async function managedConnection(server: DockgeServer): Promise<boolean> {
    const config = await zerobyte.getSafeConfig();
    const ctx = await context(server);
    return config.url === `http://${ctx.name}:4096`;
}
export async function managedRestoreRoot(server: DockgeServer): Promise<string> {
    if (!await managedConnection(server)) {
        throw new Error("This connection is external");
    }
    const ctx = await context(server);
    const containers = JSON.parse(await docker("inspect", `${ctx.name}-zerobyte-1`)) as Container[];
    const container = containers[0];
    if (container?.Config.Labels[OWNER] !== ctx.owner) {
        throw new Error("Managed ownership mismatch");
    }
    const mount = container.Mounts.find(m => m.Destination === "/restore-test");
    if (!mount?.Name || mount.Type !== "volume" || mount.RW !== true) {
        throw new Error("Dedicated restore volume is missing");
    }
    if (container.Mounts.some(m => m.Destination !== "/restore-test" && (m.Name === mount.Name || m.Source === mount.Source))) {
        throw new Error("Restore volume is shared with application data or backup mounts");
    }
    const volume = JSON.parse(await docker("volume", "inspect", mount.Name))[0];
    if (volume.Labels?.[OWNER] !== ctx.owner) {
        throw new Error("Restore volume ownership mismatch");
    }
    return "/restore-test";
}
export async function managedWorkflowContext(server: DockgeServer) {
    if (!await managedConnection(server)) {
        throw new Error("Provisioning and stack hooks require the owned managed connection");
    }
    const ctx = await context(server);
    const status = await managedZerobyteStatus(server);
    const alias = `enhanced-${ctx.owner}`;
    return { ...status,
        directory: ctx.directory,
        owner: ctx.owner,
        selfId: ctx.self.Id,
        container: `${ctx.name}-zerobyte-1`,
        callbackOrigin: `http://${alias}:${server.config.port}` };
}
/** A bounded read/write/fsync probe uses the mounted container path, never a fallback. */
export async function probeManagedDestination(server: DockgeServer, target: string): Promise<void> {
    const ctx = await managedWorkflowContext(server);
    const destination = (ctx.destinationMounts as Mount[]).find(m => m.target === target);
    if (!destination || !/^\/destinations\/store-[a-f0-9]{12}$/.test(target)) {
        throw new Error("Unknown managed destination");
    }
    const info = await hostInfo([ destination.source ]);
    if (destination.remote && !isRemoteMounted(destination.source, info.mountinfo)) {
        throw new Error("Remote destination is unmounted; backup deferred, no local fallback");
    }
    if (info.fingerprints[0] !== destination.fingerprint) {
        throw new Error("Destination filesystem changed; backup blocked");
    }
    const script = `const fs=require('node:fs');const hash=require('node:crypto').createHash('sha256').update(process.argv[1]).digest('hex');
const lock='/tmp/enhanced-probe-'+hash;const identity=pid=>{try{return fs.readFileSync('/proc/'+pid+'/stat','utf8').split(') ')[1].split(' ')[19]}catch{return null}};
try{const old=JSON.parse(fs.readFileSync(lock,'utf8'));if(identity(old.pid)===old.identity)throw Error('Previous probe is still blocked');fs.unlinkSync(lock)}catch(e){if(e.code!=='ENOENT')throw e}
const own=fs.openSync(lock,'wx',0o600);fs.writeFileSync(own,JSON.stringify({pid:process.pid,identity:identity(process.pid)}));fs.closeSync(own);
const p=process.argv[1]+'/.dockge-probe-'+require('node:crypto').randomUUID();let fd;
try{fd=fs.openSync(p,'wx',0o600);fs.writeSync(fd,'probe');fs.fsyncSync(fd)}finally{try{if(fd!==undefined)fs.closeSync(fd);fs.rmSync(p,{force:true})}finally{fs.rmSync(lock,{force:true})}}`;

    try {
        await exec("docker", [ "exec", ctx.container, "timeout", "10", "bun", "-e", script, target ], { timeout: 12000,
            maxBuffer: 4096 });
    } catch {
        throw new Error("Destination I/O unavailable or timed out; backup deferred, no local fallback");
    }
}
