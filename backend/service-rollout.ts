/**
 * Conservative rolling replacement inspired by Wowu/docker-rollout (MIT):
 * https://github.com/Wowu/docker-rollout
 * No shell hooks or downloaded executable; the existing Docker transport is reused.
 */
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { rolloutEnabled, rolloutProblems, ROLLOUT_DRAIN_FILE, ROLLOUT_HEALTH_PREFIX } from "../common/service-rollout";
import { resolveDataDir } from "./data-dir";
import { RolloutRelay } from "./rollout-relay";
import { LABEL_RELAY, LABEL_RELAY_OWNER, LABEL_RELAY_PORT, RELAY_IMAGE, relayConfig } from "../common/rollout-relay";

export type DockerRun = (args: string[], timeout: number) => Promise<string>;
export type ComposeRun = (args: string[], timeout: number, override?: string) => Promise<string>;
interface Container {
    Id: string;
    Name?: string;
    Image: string;
    State: { Running: boolean;
        Paused?: boolean;
        Health?: { Status: string } };
    Config: { Image: string;
        Labels: Record<string, string>;
        Env?: string[];
        Healthcheck?: { Test?: string[] } };
    Mounts?: { RW: boolean }[];
    HostConfig?: { PortBindings?: Record<string, unknown>;
        NetworkMode?: string };
    NetworkSettings?: { Networks: Record<string, unknown> };
}
interface Model { name: string;
    services: Record<string, Record<string, unknown>> }
interface Target { name: string;
    old: Container[];
    image: string;
    relay?: RolloutRelay;
    relayService?: string;
    relayOrigin?: string }
const MARKER = "dockge.rollout.operation";
const ids = (output: string) => output.trim().split(/\s+/).filter(Boolean);
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const exec = promisify(execFile);

export function rolloutTransport(prefix: string[], cwd: string): { compose: ComposeRun;
    docker: DockerRun } {
    const docker: DockerRun = async (args, timeout) => {
        const { stdout } = await exec("docker", args, { cwd,
            timeout,
            encoding: "utf8",
            maxBuffer: 20 * 1024 * 1024 });
        return stdout;
    };
    return { docker,
        compose: (args, timeout, override) => {
            const base = override ? prefix.filter((arg, index) =>
                !(arg === "-f" && prefix[index + 1] === override) && !(arg === override && prefix[index - 1] === "-f")) : prefix;
            return docker([ ...base, ...(override ? [ "-f", override ] : []), ...args ], timeout);
        } };
}

export interface RolloutPlan {
    services: string[];
    managedServices: string[];
    execute(allowed?: () => boolean | Promise<boolean>): Promise<void>;
}

/**
 * Caller must own the shared image-update reservation throughout preparation,
 * pull and execution. A process restart with leftover replicas fails closed.
 */
export async function prepareRollout(
    compose: ComposeRun,
    docker: DockerRun,
    targets: string[],
    options: { wait?: (ms: number) => Promise<void>;
        attempts?: number;
        stateDir?: string } = {},
): Promise<RolloutPlan | null> {
    const model = JSON.parse(await compose([ "config", "--format", "json" ], 30_000)) as Model;
    if (!model.services || typeof model.services !== "object") {
        throw new Error("Rollout: invalid resolved Compose");
    }
    const selected = targets.filter(name => model.services[name] && rolloutEnabled(model.services[name]));
    if (!selected.length) {
        return null;
    }
    if (typeof model.name !== "string" || !/^[a-z0-9][a-z0-9_-]*$/.test(model.name)) {
        throw new Error("Rollout: invalid Compose project name");
    }
    const canonical = (value: Model) => {
        const copy = structuredClone(value);
        for (const service of Object.values(copy.services)) {
            const labels = service.labels as Record<string, unknown> | undefined;
            if (labels) {
                delete labels[MARKER];
            }
        }
        return JSON.stringify(copy);
    };
    const inspect = async (list: string[]): Promise<Container[]> => list.length
        ? JSON.parse(await docker([ "inspect", ...list ], 15_000)) as Container[] : [];
    const plans: Target[] = [];
    for (const name of selected) {
        const service = model.services[name];
        const relayService = (service.labels as Record<string, string> | undefined)?.[LABEL_RELAY];
        const errors = rolloutProblems(service);
        // Namespace consumers must not remain attached to the replaced container.
        if (Object.values(model.services).some(other =>
            [ other.network_mode, other.pid, other.ipc ].includes("service:" + name))) {
            errors.push("namespace-dependants");
        }
        const deploy = service.deploy as { replicas?: number } | undefined;
        const count = Number(service.scale ?? deploy?.replicas ?? 1);
        if (!Number.isInteger(count) || count < 1 || count > 16) {
            errors.push("replicas");
        }
        if (errors.length) {
            throw new Error("Rollout " + name + ": unmet prerequisites: " + errors.join(", "));
        }
        const old = await inspect(ids(await compose([ "ps", "-aq", name ], 15_000)));
        if (old.length !== count || old.some(container => !container.State.Running || container.State.Paused ||
            container.State.Health?.Status !== "healthy" || container.Config.Labels["com.docker.compose.service"] !== name ||
            (!relayService && !container.Config.Healthcheck?.Test?.[1]?.startsWith(ROLLOUT_HEALTH_PREFIX)) ||
            container.Mounts?.some(mount => mount.RW) || Object.keys(container.HostConfig?.PortBindings ?? {}).length)) {
            throw new Error("Rollout " + name + ": expected healthy replicas without writable mounts or published ports; resolve leftover/stopped containers first");
        }
        if (new Set(old.map(container => container.Image)).size !== 1) {
            throw new Error("Rollout: mixed image versions; reconcile the previous operation first");
        }
        if (relayService) {
            if (old.some(container => Object.keys(container.Config.Labels).some(key => key.startsWith("plugNPiN.") || /^caddy(?:[._]|$)/.test(key)) ||
                container.Config.Labels["traefik.enable"] === "true" || container.Config.Env?.some(value => /^VIRTUAL_HOST=.+/.test(value)))) {
                throw new Error("Rollout: deploy publication-label changes first; old replicas must not own proxy/DNS entries");
            }
            const relayDefinition = model.services[relayService];
            const relayLabels = relayDefinition?.labels as Record<string, string> | undefined;
            const port = Number(relayLabels?.[LABEL_RELAY_PORT]);
            const origin = model.name + "-" + name + "-rollout-origin";
            const networks = service.networks as Record<string, { aliases?: string[] }> | undefined;
            if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(relayService) ||
                relayDefinition?.image !== RELAY_IMAGE || relayLabels?.[LABEL_RELAY_OWNER] !== name ||
                !Number.isInteger(port) || port < 1 || port > 65535 || rolloutEnabled(relayDefinition) ||
                !Object.values(networks ?? {}).some(network => network?.aliases?.includes(origin))) {
                throw new Error("Rollout: invalid managed relay definition");
            }
            relayConfig([ origin ], port);
            const relays = await inspect(ids(await compose([ "ps", "-aq", relayService ], 15_000)));
            if (relays.length !== 1 || !relays[0].State.Running || relays[0].State.Paused ||
                relays[0].Config.Image !== RELAY_IMAGE ||
                relays[0].Config.Labels[LABEL_RELAY_OWNER] !== name ||
                relays[0].Config.Labels[LABEL_RELAY_PORT] !== String(port) ||
                relays[0].Config.Labels["com.docker.compose.project"] !== model.name ||
                relays[0].Config.Labels["com.docker.compose.service"] !== relayService ||
                !old.every(previous => Object.keys(previous.NetworkSettings?.Networks ?? {}).some(network => network in (relays[0].NetworkSettings?.Networks ?? {})))) {
                throw new Error("Rollout: deploy the managed relay first on a shared network");
            }
            const relay = new RolloutRelay(docker, relays[0].Id, port);
            await relay.assertReady();
            plans.push({ name,
                old,
                image: String(service.image),
                relay,
                relayService,
                relayOrigin: origin });
            continue;
        }
        for (const container of old) {
            await docker([ "exec", container.Id, "sh", "-c", "command -v touch >/dev/null && command -v rm >/dev/null && test -w /tmp" ], 15_000);
        }
        const routing = Object.entries(service.labels as Record<string, string>).filter(([ key ]) => key.startsWith("traefik."));
        if (old.some(container => routing.some(([ key, value ]) => container.Config.Labels[key] !== value))) {
            throw new Error("Rollout: deploy routing label changes separately before enabling rolling updates");
        }
        const running = await inspect(ids(await docker([ "ps", "-q" ], 15_000)));
        const proxy = running.some(container => /(^|\/)traefik(:|@|$)/.test(container.Config.Image) && container.State.Running &&
            old.every(previous => Object.keys(previous.NetworkSettings?.Networks ?? {}).some(network => network in (container.NetworkSettings?.Networks ?? {}))));
        if (!proxy) {
            throw new Error("Rollout: no running Traefik on a shared network");
        }
        plans.push({ name,
            old,
            image: String(service.image) });
    }
    return {
        services: selected,
        managedServices: plans.flatMap(plan => plan.relayService ? [ plan.relayService ] : []),
        async execute(allowed = () => true) {
            for (const plan of plans) {
                if (!await allowed()) {
                    throw new Error("Rollout cancelled before replacement");
                }
                const fresh = JSON.parse(await compose([ "config", "--format", "json" ], 30_000)) as Model;
                if (canonical(fresh) !== canonical(model)) {
                    throw new Error("Rollout: Compose changed; retry after reviewing it");
                }
                const current = await inspect(ids(await compose([ "ps", "-aq", plan.name ], 15_000)));
                if (current.length !== plan.old.length || current.some(item => !plan.old.some(old => old.Id === item.Id) || item.State.Health?.Status !== "healthy")) {
                    throw new Error("Rollout: container state changed during pull");
                }
                const imageId = (await docker([ "image", "inspect", "--format", "{{.Id}}", plan.image ], 15_000)).trim();
                if (!/^sha256:[a-f0-9]{64}$/.test(imageId)) {
                    throw new Error("Rollout: invalid target image ID");
                }
                const token = randomUUID();
                const directory = options.stateDir ?? path.join(resolveDataDir(), "rolling-updates");
                await mkdir(directory, { recursive: true,
                    mode: 0o700 });
                // Docker records this path in its Compose discovery labels. Keep
                // one stable, tiny file per project, not a deleted temporary file
                // or an ever-growing chain of historical overrides.
                const override = path.join(directory, createHash("sha256").update(model.name).digest("hex") + ".json");
                // Only the new replicas get this unique marker (--no-recreate).
                await writeFile(override + ".tmp", JSON.stringify({ services: { [plan.name]: { labels: { [MARKER]: token } } } }), { mode: 0o600 });
                await rename(override + ".tmp", override);
                let retiring = false;
                let relayChanged = false;
                const wait = options.wait ?? sleep;
                const hostnames = (containers: Container[]) => containers.map(item => {
                    const hostname = item.Name?.replace(/^\//, "");
                    if (!hostname || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(hostname)) {
                        throw new Error("Rollout: invalid container DNS identity");
                    }
                    return hostname;
                });
                const owned = async () => inspect(ids(await docker([ "ps", "-aq", "--filter", "label=" + MARKER + "=" + token ], 15_000)));
                try {
                    if (plan.relay) {
                        // Freeze discovery before scaling: a service DNS alias would
                        // otherwise expose starting/unhealthy replacement replicas.
                        relayChanged = true;
                        await plan.relay.route(hostnames(plan.old), wait);
                    }
                    await compose([ "up", "-d", "--no-deps", "--no-recreate", "--no-build", "--pull", "never", "--scale", plan.name + "=" + plan.old.length * 2, plan.name ], 120_000, override);
                    let replacements: Container[] = [];
                    let healthy = false;
                    for (let attempt = 0; attempt < (options.attempts ?? 60); attempt++) {
                        if (!await allowed()) {
                            throw new Error("Rollout cancelled; old replicas preserved");
                        }
                        replacements = await owned();
                        if (replacements.length === plan.old.length && replacements.every(container =>
                            container.Image === imageId && container.State.Running && !container.State.Paused &&
                            !container.Mounts?.some(mount => mount.RW) && container.State.Health?.Status === "healthy")) {
                            healthy = true;
                            break;
                        }
                        if (replacements.some(container => container.Image !== imageId || !container.State.Running || container.State.Health?.Status === "unhealthy")) {
                            throw new Error("Rollout: replacement failed its health/image check");
                        }
                        await (options.wait ?? sleep)(2_000);
                    }
                    if (!healthy) {
                        throw new Error("Rollout: healthcheck timeout; old replicas preserved");
                    }
                    // Allow proxy discovery and detect unstable health before retiring anything.
                    await (options.wait ?? sleep)(10_000);
                    const final = await owned();
                    const previous = await inspect(plan.old.map(item => item.Id));
                    if (!await allowed() || final.length !== plan.old.length ||
                        final.some(item => item.Image !== imageId || item.State.Health?.Status !== "healthy" || !item.State.Running || item.State.Paused) ||
                        previous.some(item => !item.State.Running || item.State.Paused || item.State.Health?.Status !== "healthy")) {
                        throw new Error("Rollout: state changed before retirement; old replicas preserved");
                    }
                    // Never remove replacements after retirement starts: a partial stop
                    // must leave the new healthy service available for manual recovery.
                    retiring = true;
                    if (plan.relay) {
                        const previousWorkers = await plan.relay.workers();
                        await plan.relay.route(hostnames(final), wait);
                        await plan.relay.drain(previousWorkers, wait, options.attempts ?? 60);
                    } else {
                        for (const previous of plan.old) {
                            await docker([ "exec", previous.Id, "sh", "-c", "touch " + ROLLOUT_DRAIN_FILE ], 15_000);
                        }
                        let drained = false;
                        for (let attempt = 0; attempt < (options.attempts ?? 60); attempt++) {
                            const draining = await inspect(plan.old.map(item => item.Id));
                            if (draining.every(item => item.State.Running && item.State.Health?.Status === "unhealthy")) {
                                drained = true;
                                break;
                            }
                            await (options.wait ?? sleep)(2_000);
                        }
                        if (!drained) {
                            throw new Error("Rollout: old replicas did not leave the proxy health pool");
                        }
                        await (options.wait ?? sleep)(10_000);
                    }
                    const ready = await owned();
                    if (!await allowed() || ready.length !== plan.old.length || ready.some(item => item.Image !== imageId || !item.State.Running || item.State.Paused || item.State.Health?.Status !== "healthy")) {
                        throw new Error("Rollout: replacements lost readiness while draining");
                    }
                    await docker([ "stop", "--time", "30", ...plan.old.map(item => item.Id) ], 90_000);
                    await docker([ "rm", ...plan.old.map(item => item.Id) ], 30_000);
                    if (plan.relay) {
                        // Normal Compose recreations can change container names.
                        // Once old replicas are gone, service discovery is safe again.
                        await plan.relay.route([ plan.relayOrigin! ], wait);
                    }
                } catch (error) {
                    if (retiring && plan.relay) {
                        // A failed switch/readiness check must not leave traffic on
                        // broken replacements. Restore only if all old replicas live.
                        try {
                            const survivors = await inspect(plan.old.map(item => item.Id));
                            if (survivors.length === plan.old.length && survivors.every(item => item.State.Running && item.State.Health?.Status === "healthy")) {
                                await plan.relay.route(hostnames(plan.old), wait);
                            }
                        } catch { /* keep both generations for explicit recovery */ }
                    }
                    if (retiring && !plan.relay) {
                        // Best effort: restore still-running old replicas to the
                        // proxy pool. Never delete the healthy replacements here.
                        for (const previous of plan.old) {
                            try {
                                await docker([ "exec", previous.Id, "sh", "-c", "rm -f " + ROLLOUT_DRAIN_FILE ], 15_000);
                            } catch { /* stopped containers need operator reconciliation */ }
                        }
                    }
                    if (!retiring) {
                        try {
                            const created = await owned();
                            if (created.length) {
                                await docker([ "rm", "-f", ...created.map(item => item.Id) ], 30_000);
                            }
                            if (plan.relay && relayChanged) {
                                await plan.relay.route([ plan.relayOrigin! ], wait);
                            }
                        } catch {
                            throw new Error("Rollout failed; cleanup incomplete. Old replicas preserved; inspect the marked replacement containers.", { cause: error });
                        }
                    }
                    const detail = error instanceof Error && error.message.startsWith("Rollout relay:") ? " " + error.message : "";
                    throw new Error((retiring ? "Rollout retirement incomplete; replacement containers retained. Inspect the old containers before retrying." : "Rollout failed; old replicas preserved.") + detail, { cause: error });
                }
            }
        },
    };
}
