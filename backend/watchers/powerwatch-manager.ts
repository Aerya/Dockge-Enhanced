import * as fs from "node:fs/promises";
import { isIP } from "node:net";
import * as path from "node:path";
import childProcessAsync from "promisify-child-process";
import { resolveDataDir } from "../data-dir";

export type PowerWatchMode = "managed" | "external";
export type PowerWatchToggleMode = "auto" | "enabled" | "disabled";

export interface PowerWatchSettings {
    enabled: boolean;
    mode: PowerWatchMode;
    apiUrl: string;
    /** Read-only PowerWatch API token. Never returned by getSettingsSafe(). */
    apiToken: string;
    webUrl: string;
    externalContainer: string;
    hostPort: number;
    bindAddress: string;
    managedWebUrl: string;
    msrMode: PowerWatchToggleMode;
    nvidiaMode: PowerWatchToggleMode;
    hubEnabled: boolean;
    hubWebUrl: string;
    hubMode: PowerWatchMode;
    hubHostPort: number;
    hubBindAddress: string;
    hubManagedWebUrl: string;
}

export interface PowerWatchHubStatus {
    enabled: boolean;
    reachable: boolean;
    webUrl: string | null;
    lastError?: string | null;
}

export interface PowerWatchSnapshot {
    enabled: boolean;
    mode: PowerWatchMode;
    reachable: boolean;
    totalWatts: number | null;
    confidence: "Measured" | "Estimated" | null;
    timestamp: string | null;
    webUrl: string | null;
    status: "disabled" | "online" | "stopped" | "offline";
    lastError?: string | null;
}

export interface PowerWatchDetection {
    containers: Array<{ name: string;
        image: string;
        state: string;
        hostPort: number | null }>;
    capabilities: { linux: boolean;
        powercap: boolean;
        msr: boolean;
        nvidia: boolean };
    portAvailable: boolean;
}

interface DockerInspect {
    Name?: string;
    Config?: { Image?: string;
        Labels?: Record<string, string> };
    State?: { Running?: boolean };
    HostConfig?: { PortBindings?: Record<string, Array<{ HostIp?: string;
        HostPort?: string }> | null> };
}

interface SnapshotPayload {
    timestamp?: unknown;
    total?: { watts?: unknown;
        confidence?: unknown;
        timestamp?: unknown } | null;
}

interface CommandResult { stdout: string;
    stderr: string;
    code: number }
interface PowerWatchDependencies {
    docker: (args: string[], options?: { cwd?: string;
        timeoutMs?: number }) => Promise<CommandResult>;
    fetchJson: (url: string, timeoutMs: number, options?: { bearerToken?: string }) => Promise<unknown>;
    platform: () => NodeJS.Platform;
    now: () => number;
}

const DATA_DIR = resolveDataDir();
const STACKS_DIR = process.env.DOCKGE_STACKS_DIR ?? "/opt/stacks";
const SETTINGS_PATH = path.join(DATA_DIR, "powerwatch-settings.json");
export const POWERWATCH_STACK_NAME = "powerwatch-dockge-enhanced";
export const POWERWATCH_CONTAINER_NAME = "powerwatch-dockge-enhanced";
export const POWERWATCH_IMAGE = "ghcr.io/aerya/powerwatch:latest";
export const POWERWATCH_VOLUME = "powerwatch_dockge_data";
const STACK_DIR = path.join(STACKS_DIR, POWERWATCH_STACK_NAME);
export const POWERWATCH_HUB_STACK_NAME = "powerwatch-hub-dockge-enhanced";
export const POWERWATCH_HUB_CONTAINER_NAME = "powerwatch-hub-dockge-enhanced";
export const POWERWATCH_HUB_VOLUME = "powerwatch_hub_dockge_data";
const HUB_STACK_DIR = path.join(STACKS_DIR, POWERWATCH_HUB_STACK_NAME);
const CACHE_TTL_MS = 8_000;
const REQUEST_TIMEOUT_MS = 4_000;
const HOST_PROBE_TIMEOUT_MS = 180_000;
export const POWERWATCH_TOKEN_MASK = "********";

export const DEFAULT_POWERWATCH_SETTINGS: PowerWatchSettings = {
    enabled: false,
    mode: "external",
    apiUrl: "",
    apiToken: "",
    webUrl: "",
    externalContainer: "",
    hostPort: 3000,
    bindAddress: "127.0.0.1",
    managedWebUrl: "",
    msrMode: "auto",
    nvidiaMode: "auto",
    hubEnabled: false,
    hubWebUrl: "",
    hubMode: "external",
    hubHostPort: 3065,
    hubBindAddress: "127.0.0.1",
    hubManagedWebUrl: "",
};

async function defaultDocker(args: string[], options: { cwd?: string;
    timeoutMs?: number } = {}): Promise<CommandResult> {
    const child = childProcessAsync.spawn("docker", args, {
        encoding: "utf8",
        cwd: options.cwd,
        timeout: options.timeoutMs,
    });
    const result = await child;
    return {
        stdout: result.stdout?.toString() ?? "",
        stderr: result.stderr?.toString() ?? "",
        code: result.code ?? 0,
    };
}

async function defaultFetchJson(url: string, timeoutMs: number, options: { bearerToken?: string } = {}): Promise<unknown> {
    // This URL is deliberately configured by an authenticated Dockge administrator and is
    // validated as credential-free HTTP(S). Private LAN targets are a supported use case, so
    // they cannot be blocked; redirects are refused to keep the request on the approved origin.
    // codeql[js/request-forgery]
    const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
        headers: options.bearerToken ? { Authorization: `Bearer ${options.bearerToken}` } : undefined,
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    try {
        return await response.json();
    } catch {
        throw new Error("PowerWatch returned invalid JSON");
    }
}

const DEFAULT_DEPENDENCIES: PowerWatchDependencies = {
    docker: defaultDocker,
    fetchJson: defaultFetchJson,
    platform: () => process.platform,
    now: () => Date.now(),
};

function quoteYaml(value: string): string {
    return JSON.stringify(value);
}

function snapshotEndpoint(apiUrl: string): string {
    const url = new URL(apiUrl);
    url.pathname = `${url.pathname.replace(/\/$/, "")}/api/snapshot`;
    url.search = "";
    url.hash = "";
    return url.toString();
}

function hubSnapshotEndpoint(webUrl: string): string {
    const url = new URL(webUrl);
    url.pathname = `${url.pathname.replace(/\/$/, "")}/api/hub/snapshot`;
    url.search = "";
    url.hash = "";
    return url.toString();
}

function parseSnapshotJson(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        throw new Error("PowerWatch returned invalid JSON");
    }
}

export function validatePowerWatchUrl(value: string, field: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
        return "";
    }
    let url: URL;
    try {
        url = new URL(trimmed);
    } catch {
        throw new Error(`${field}: invalid URL`);
    }
    if (![ "http:", "https:" ].includes(url.protocol)) {
        throw new Error(`${field}: only HTTP(S) is allowed`);
    }
    if (url.username || url.password) {
        throw new Error(`${field}: credentials in URLs are not allowed`);
    }
    return url.toString().replace(/\/$/, "");
}

function validateSettings(input: Partial<PowerWatchSettings>, current: PowerWatchSettings): PowerWatchSettings {
    const next = { ...current,
        ...input };
    if (![ "external", "managed" ].includes(next.mode)) {
        throw new Error("Invalid PowerWatch mode");
    }
    if (!Number.isInteger(Number(next.hostPort)) || Number(next.hostPort) < 1 || Number(next.hostPort) > 65535) {
        throw new Error("Invalid PowerWatch port");
    }
    if (isIP(next.bindAddress.trim()) === 0) {
        throw new Error("Invalid PowerWatch bind address");
    }
    if (![ "auto", "enabled", "disabled" ].includes(next.msrMode) || ![ "auto", "enabled", "disabled" ].includes(next.nvidiaMode)) {
        throw new Error("Invalid PowerWatch hardware mode");
    }
    next.apiUrl = validatePowerWatchUrl(next.apiUrl, "apiUrl");
    next.webUrl = validatePowerWatchUrl(next.webUrl, "webUrl");
    // A masked/omitted token only belongs to the original PowerWatch target.
    // Never forward it to a different URL, selected container or managed instance.
    const target = (s: PowerWatchSettings): string => s.mode === "managed"
        ? "managed:powerwatch-dockge-enhanced"
        : s.externalContainer ? `container:${s.externalContainer}` : `url:${s.apiUrl || s.webUrl}`;
    if (input.apiToken === POWERWATCH_TOKEN_MASK || input.apiToken === undefined) {
        next.apiToken = target(next) === target(current) ? current.apiToken : "";
    } else {
        next.apiToken = next.apiToken.trim();
        if (next.apiToken.length > 4096 || /[^\x21-\x7e]/.test(next.apiToken)) {
            throw new Error("Invalid PowerWatch API token");
        }
    }
    next.managedWebUrl = validatePowerWatchUrl(next.managedWebUrl, "managedWebUrl");
    next.hubWebUrl = validatePowerWatchUrl(next.hubWebUrl, "hubWebUrl");
    next.hubManagedWebUrl = validatePowerWatchUrl(next.hubManagedWebUrl, "hubManagedWebUrl");
    if (![ "managed", "external" ].includes(next.hubMode)) {
        throw new Error("Invalid PowerWatch Hub mode");
    }
    if (!Number.isInteger(Number(next.hubHostPort)) || Number(next.hubHostPort) < 1024 || Number(next.hubHostPort) > 65535) {
        throw new Error("Invalid PowerWatch Hub port");
    }
    if (isIP(next.hubBindAddress.trim()) === 0) {
        throw new Error("Invalid PowerWatch Hub bind address");
    }
    next.hubHostPort = Number(next.hubHostPort);
    next.hubBindAddress = next.hubBindAddress.trim();
    next.hubEnabled = Boolean(next.hubEnabled);
    next.externalContainer = next.externalContainer.trim();
    next.hostPort = Number(next.hostPort);
    next.bindAddress = next.bindAddress.trim();
    return next;
}

function normalizeSnapshot(payload: unknown, settings: PowerWatchSettings, webUrl: string | null): PowerWatchSnapshot {
    const source = payload && typeof payload === "object" ? payload as SnapshotPayload : {};
    const watts = typeof source.total?.watts === "number" && Number.isFinite(source.total.watts) && source.total.watts >= 0
        ? source.total.watts : null;
    const confidence = source.total?.confidence === "Measured" || source.total?.confidence === "Estimated"
        ? source.total.confidence : null;
    const timestampCandidate = source.total?.timestamp ?? source.timestamp;
    return {
        enabled: settings.enabled,
        mode: settings.mode,
        reachable: true,
        totalWatts: watts,
        confidence,
        timestamp: typeof timestampCandidate === "string" ? timestampCandidate : null,
        webUrl,
        status: "online",
        lastError: null,
    };
}

function addressForUrl(address: string): string {
    return address.includes(":") ? `[${address}]` : address;
}

function addressForPortBinding(address: string): string {
    return address.includes(":") ? `[${address}]` : address;
}

export function buildPowerWatchCompose(settings: PowerWatchSettings, capabilities: PowerWatchDetection["capabilities"]): string {
    const useMsr = settings.msrMode === "enabled" || (settings.msrMode === "auto" && !capabilities.powercap && capabilities.msr);
    const useNvidia = settings.nvidiaMode === "enabled" || (settings.nvidiaMode === "auto" && capabilities.nvidia);
    const lines = [
        "# Generated by Dockge-Enhanced — managed PowerWatch service",
        `name: ${POWERWATCH_STACK_NAME}`,
        "services:",
        "  powerwatch:",
        `    image: ${POWERWATCH_IMAGE}`,
        `    container_name: ${POWERWATCH_CONTAINER_NAME}`,
        "    hostname: powerwatch",
        "    restart: unless-stopped",
        "    pid: host",
        "    labels:",
        "      com.dockge-enhanced.managed: powerwatch",
        "      com.dockge-enhanced.integration: powerwatch",
        "    ports:",
        `      - ${quoteYaml(`${addressForPortBinding(settings.bindAddress)}:${settings.hostPort}:3000`)}`,
        "    volumes:",
        "      - /sys:/sys:ro",
        "      - /sys/devices/virtual:/host-sys-virtual:ro",
        "      - /sys/firmware:/host-sys-firmware:ro",
        `      - ${POWERWATCH_VOLUME}:/data/.local/share/powerwatch`,
        "    environment:",
        "      POWERWATCH_POWERCAP_PATH: /host-sys-virtual/powercap/intel-rapl",
        "      POWERWATCH_DMI_TABLE_PATH: /host-sys-firmware/dmi/tables/DMI",
    ];
    if (useNvidia) {
        lines.push("      NVIDIA_VISIBLE_DEVICES: all", "      NVIDIA_DRIVER_CAPABILITIES: utility");
    }
    if (useMsr) {
        lines.push("    cap_add:", "      - SYS_RAWIO", "    devices:", "      - /dev/cpu/0/msr:/dev/cpu/0/msr:r");
    }
    if (useNvidia) {
        lines.push(
            "    deploy:",
            "      resources:",
            "        reservations:",
            "          devices:",
            "            - driver: nvidia",
            "              count: all",
            "              capabilities: [gpu]",
        );
    }
    lines.push(
        "    read_only: true",
        "    tmpfs:",
        "      - /tmp",
        "    security_opt:",
        "      - no-new-privileges:true",
        "volumes:",
        `  ${POWERWATCH_VOLUME}:`,
        `    name: ${POWERWATCH_VOLUME}`,
        "",
    );
    return lines.join("\n");
}

/** PowerWatch Hub shares the published PowerWatch image but uses its own binary and state. */
export function buildPowerWatchHubCompose(settings: PowerWatchSettings): string {
    return [
        "# Generated by Dockge-Enhanced — managed PowerWatch Hub service",
        `name: ${POWERWATCH_HUB_STACK_NAME}`,
        "services:",
        "  powerwatch-hub:",
        `    image: ${POWERWATCH_IMAGE}`,
        `    container_name: ${POWERWATCH_HUB_CONTAINER_NAME}`,
        "    restart: unless-stopped",
        "    labels:",
        "      com.dockge-enhanced.managed: powerwatch-hub",
        "      com.dockge-enhanced.integration: powerwatch-hub",
        "    entrypoint: [/usr/local/bin/powerwatch-hub]",
        "    command:",
        "      - --host",
        "      - 0.0.0.0",
        "      - --port",
        "      - '3000'",
        "      - --config",
        "      - /data/powerwatch-hub.json",
        "      - --database",
        "      - /data/powerwatch-hub.db",
        "      - --refresh-interval",
        "      - '2'",
        "      - --history-interval",
        "      - '60'",
        "      - --stale-after",
        "      - '15'",
        "    ports:",
        `      - ${quoteYaml(`${addressForPortBinding(settings.hubBindAddress)}:${settings.hubHostPort}:3000`)}`,
        "    volumes:",
        `      - ${POWERWATCH_HUB_VOLUME}:/data`,
        "    read_only: true",
        "    tmpfs:",
        "      - /tmp",
        "    security_opt:",
        "      - no-new-privileges:true",
        "volumes:",
        `  ${POWERWATCH_HUB_VOLUME}:`,
        `    name: ${POWERWATCH_HUB_VOLUME}`,
        "",
    ].join("\n");
}

function isPowerWatchImage(image: string | undefined): boolean {
    return Boolean(image && (image === "ghcr.io/aerya/powerwatch" || image.startsWith("ghcr.io/aerya/powerwatch:" ) || image.startsWith("ghcr.io/aerya/powerwatch@")));
}

function publishedPort(inspect: DockerInspect): number | null {
    const binding = inspect.HostConfig?.PortBindings?.["3000/tcp"]?.[0]?.HostPort;
    const port = Number(binding);
    return Number.isInteger(port) && port > 0 ? port : null;
}

/** A listening socket is reported in /proc/net/tcp{,6} with TCP state 0A. */
function hostPortIsListening(probe: string, port: number): boolean {
    const match = probe.match(/PW_TCP_BEGIN\r?\n([\s\S]*?)PW_TCP_END/);
    if (!match) {
        throw new Error("Unable to read Docker host TCP listeners");
    }
    const hexPort = port.toString(16).toUpperCase().padStart(4, "0");
    return match[1].split(/\r?\n/).some((line) => {
        const fields = line.trim().split(/\s+/);
        return fields.length >= 4 && fields[3] === "0A" && fields[1]?.split(":").at(-1)?.toUpperCase() === hexPort;
    });
}

function isOurManagedPowerWatch(item: DockerInspect): boolean {
    const labels = item.Config?.Labels ?? {};
    return item.Name?.replace(/^\//, "") === POWERWATCH_CONTAINER_NAME &&
        labels["com.dockge-enhanced.managed"] === "powerwatch" &&
        labels["com.dockge-enhanced.integration"] === "powerwatch" &&
        labels["com.docker.compose.project"] === POWERWATCH_STACK_NAME &&
        labels["com.docker.compose.service"] === "powerwatch";
}

function hasPublishedHostPort(item: DockerInspect, port: number): boolean {
    return Object.values(item.HostConfig?.PortBindings ?? {}).some((bindings) =>
        bindings?.some((binding) => Number(binding.HostPort) === port));
}

export class PowerWatchManager {
    private static instance: PowerWatchManager;
    settings: PowerWatchSettings = { ...DEFAULT_POWERWATCH_SETTINGS };
    private cache: { at: number;
        value: PowerWatchSnapshot } | null = null;

    private inFlight: Promise<PowerWatchSnapshot> | null = null;

    constructor(private readonly dependencies: PowerWatchDependencies = DEFAULT_DEPENDENCIES) {}

    static getInstance(): PowerWatchManager {
        if (!PowerWatchManager.instance) {
            PowerWatchManager.instance = new PowerWatchManager();
        }
        return PowerWatchManager.instance;
    }

    async loadSettings(): Promise<void> {
        try {
            this.settings = validateSettings(JSON.parse(await fs.readFile(SETTINGS_PATH, "utf8")) as Partial<PowerWatchSettings>, DEFAULT_POWERWATCH_SETTINGS);
        } catch {
            this.settings = { ...DEFAULT_POWERWATCH_SETTINGS };
        }
    }

    getSettingsSafe(): PowerWatchSettings {
        return { ...this.settings,
            apiToken: this.settings.apiToken ? POWERWATCH_TOKEN_MASK : "" };
    }

    async saveSettings(partial: Partial<PowerWatchSettings> & { confirmStopManaged?: boolean }): Promise<void> {
        const previous = this.settings;
        const { confirmStopManaged = false, ...settingsInput } = partial;
        const next = validateSettings(settingsInput, previous);
        if (previous.enabled && previous.mode === "managed" && (!next.enabled || next.mode !== "managed")) {
            if (next.mode === "external" && !confirmStopManaged) {
                throw new Error("Confirmation required before stopping managed PowerWatch");
            }
            await this.stop();
        }
        if (previous.hubEnabled && previous.hubMode === "managed" &&
            (!next.hubEnabled || next.hubMode !== "managed")) {
            if (next.hubMode === "external" && !confirmStopManaged) {
                throw new Error("Confirmation required before stopping managed PowerWatch Hub");
            }
            await this.hubStop();
        }
        this.settings = next;
        this.cache = null;
        await fs.mkdir(DATA_DIR, { recursive: true });
        // Settings include a Bearer secret: protect both newly created and legacy files.
        await fs.writeFile(SETTINGS_PATH, JSON.stringify(this.settings, null, 2), { mode: 0o600 });
        await fs.chmod(SETTINGS_PATH, 0o600);
    }

    async startIfEnabled(): Promise<void> {
        await this.loadSettings();
        if (this.settings.enabled && this.settings.mode === "managed") {
            await this.start();
        }
        if (this.settings.hubEnabled && this.settings.hubMode === "managed") {
            await this.hubStart();
        }
    }

    private async docker(args: string[], options?: { cwd?: string;
        timeoutMs?: number }): Promise<string> {
        const result = await this.dependencies.docker(args, options);
        if (result.code !== 0) {
            throw new Error(result.stderr.trim() || `docker ${args[0]} failed`);
        }
        return result.stdout;
    }

    private async inspect(name: string): Promise<DockerInspect | null> {
        try {
            const parsed = JSON.parse(await this.docker([ "inspect", name ])) as DockerInspect[];
            return parsed[0] ?? null;
        } catch {
            return null;
        }
    }

    async detect(): Promise<PowerWatchDetection> {
        const ids = (await this.docker([ "ps", "-aq" ])).trim().split(/\s+/).filter(Boolean);
        const containers: PowerWatchDetection["containers"] = [];
        const inspections = (await Promise.all(ids.map(id => this.inspect(id)))).filter((item): item is DockerInspect => Boolean(item));
        for (const inspect of inspections) {
            if (!isPowerWatchImage(inspect.Config?.Image)) {
                continue;
            }
            const name = inspect.Name?.replace(/^\//, "") ?? "";
            containers.push({ name,
                image: inspect.Config?.Image ?? "",
                state: inspect.State?.Running ? "running" : "stopped",
                hostPort: publishedPort(inspect) });
        }
        // This probe runs on the Docker *host* (not in Enhanced's own network
        // namespace). --pull=missing supports a first install without a cached image.
        // A missing optional NVIDIA/MSR/RAPL sensor must never fail the shell.
        const hostProbe = await this.dependencies.docker([
            "run", "--rm", "--pull=missing", "--network", "host", "--read-only", "--entrypoint", "sh",
            "-v", "/sys:/host-sys:ro", "-v", "/dev:/host-dev:ro",
            POWERWATCH_IMAGE, "-c",
            "test -d /host-sys/devices/virtual/powercap/intel-rapl && echo powercap; " +
                "test -c /host-dev/cpu/0/msr && echo msr; " +
                "test -c /host-dev/nvidiactl && echo nvidia-device; " +
                "printf 'PW_TCP_BEGIN\\n'; cat /proc/net/tcp || exit 30; " +
                "if test -r /proc/net/tcp6; then cat /proc/net/tcp6 || exit 31; fi; " +
                "printf 'PW_TCP_END\\n'; exit 0",
        ], { timeoutMs: HOST_PROBE_TIMEOUT_MS });
        if (hostProbe.code !== 0) {
            throw new Error(`Unable to inspect Docker host sensors: ${hostProbe.stderr.trim() || "probe failed"}`);
        }
        const info = await this.dependencies.docker([ "info", "--format", "{{json .Runtimes}}" ]);
        if (info.code !== 0) {
            throw new Error(`Unable to inspect Docker GPU runtimes: ${info.stderr.trim() || "docker info failed"}`);
        }
        const probe = hostProbe.stdout;
        const hostPortBusy = hostPortIsListening(probe, this.settings.hostPort);
        let nvidiaAvailable = false;
        if (probe.includes("nvidia-device") && info.stdout.toLowerCase().includes("nvidia")) {
            // A configured runtime alone is insufficient: verify the GPU can
            // actually be accessed from a disposable PowerWatch container.
            const gpuProbe = await this.dependencies.docker([
                "run", "--rm", "--pull=never", "--gpus", "all", "--read-only",
                "--env", "NVIDIA_DRIVER_CAPABILITIES=utility", "--entrypoint", "sh",
                POWERWATCH_IMAGE, "-c",
                "test -c /dev/nvidiactl && command -v nvidia-smi >/dev/null && nvidia-smi -L >/dev/null",
            ], { timeoutMs: REQUEST_TIMEOUT_MS * 6 });
            nvidiaAvailable = gpuProbe.code === 0;
        }
        const capabilities = {
            linux: this.dependencies.platform() === "linux",
            powercap: probe.includes("powercap"),
            msr: probe.includes("msr"),
            nvidia: nvidiaAvailable,
        };
        const otherDockerPortBusy = inspections.some((item) =>
            item.State?.Running && !isOurManagedPowerWatch(item) && hasPublishedHostPort(item, this.settings.hostPort));
        // Own existing managed instance is an expected listener during 'start'
        // and a configuration refresh. Never exempt another process/container.
        const ownManagedPort = inspections.some((item) =>
            item.State?.Running && isOurManagedPowerWatch(item) && hasPublishedHostPort(item, this.settings.hostPort));
        const portAvailable = !otherDockerPortBusy && (!hostPortBusy || ownManagedPort);
        return { containers,
            capabilities,
            portAvailable };
    }

    private managedWebUrlFor(settings: PowerWatchSettings): string | null {
        return settings.managedWebUrl || `http://${addressForUrl(settings.bindAddress)}:${settings.hostPort}`;
    }

    private externalWebUrl(settings = this.settings): string | null {
        return settings.webUrl || settings.apiUrl || null;
    }

    private async assertExternalContainer(name: string): Promise<DockerInspect> {
        const inspect = await this.inspect(name);
        if (!inspect || !isPowerWatchImage(inspect.Config?.Image)) {
            throw new Error("Selected container is not PowerWatch");
        }
        return inspect;
    }

    private async readSnapshot(settings = this.settings): Promise<PowerWatchSnapshot> {
        try {
            let payload: unknown;
            let webUrl: string | null;
            if (settings.mode === "managed") {
                const inspect = await this.inspect(POWERWATCH_CONTAINER_NAME);
                if (!inspect?.State?.Running) {
                    throw new Error("PowerWatch is stopped");
                }
                const output = await this.readContainerSnapshot(POWERWATCH_CONTAINER_NAME, settings.apiToken);
                payload = parseSnapshotJson(output);
                webUrl = this.managedWebUrlFor(settings);
            } else if (settings.externalContainer) {
                const inspect = await this.assertExternalContainer(settings.externalContainer);
                if (!inspect.State?.Running) {
                    throw new Error("PowerWatch container is stopped");
                }
                const output = await this.readContainerSnapshot(settings.externalContainer, settings.apiToken);
                payload = parseSnapshotJson(output);
                const port = publishedPort(inspect);
                webUrl = settings.webUrl || (port ? `http://127.0.0.1:${port}` : null);
            } else {
                // The WebUI and API share the same origin. A single browser-facing
                // URL is sufficient, including for older settings with webUrl only.
                const baseUrl = settings.apiUrl || settings.webUrl;
                if (!baseUrl) {
                    throw new Error("PowerWatch URL is required");
                }
                payload = await this.dependencies.fetchJson(snapshotEndpoint(baseUrl), REQUEST_TIMEOUT_MS, { bearerToken: settings.apiToken || undefined });
                webUrl = this.externalWebUrl(settings);
            }
            return normalizeSnapshot(payload, settings, webUrl);
        } catch (error) {
            return {
                enabled: settings.enabled,
                mode: settings.mode,
                reachable: false,
                totalWatts: null,
                confidence: null,
                timestamp: null,
                webUrl: settings.mode === "managed" ? this.managedWebUrlFor(settings) : this.externalWebUrl(settings),
                status: error instanceof Error && error.message.includes("stopped") ? "stopped" : "offline",
                lastError: error instanceof Error ? error.message : String(error),
            };
        }
    }

    private async readContainerSnapshot(container: string, apiToken: string): Promise<string> {
        const args = [ "exec", container, "curl", "--fail", "--silent", "--show-error", "--max-time", "4" ];
        if (apiToken) {
            args.push("--header", `Authorization: Bearer ${apiToken}`);
        }
        args.push("http://127.0.0.1:3000/api/snapshot");
        return this.docker(args, { timeoutMs: REQUEST_TIMEOUT_MS + 1_000 });
    }

    async getSnapshot(force = false): Promise<PowerWatchSnapshot> {
        if (!this.settings.enabled) {
            return { enabled: false,
                mode: this.settings.mode,
                reachable: false,
                totalWatts: null,
                confidence: null,
                timestamp: null,
                webUrl: null,
                status: "disabled" };
        }
        const now = this.dependencies.now();
        if (!force && this.cache && now - this.cache.at < CACHE_TTL_MS) {
            return this.cache.value;
        }
        if (this.inFlight) {
            return this.inFlight;
        }
        this.inFlight = this.readSnapshot().then((value) => {
            this.cache = { at: this.dependencies.now(),
                value };
            return value;
        }).finally(() => {
            this.inFlight = null;
        });
        return this.inFlight;
    }

    async test(candidate?: Partial<PowerWatchSettings>): Promise<PowerWatchSnapshot> {
        if (!candidate) {
            return this.getSnapshot(true);
        }
        const candidateSettings = validateSettings(candidate, this.settings);
        return this.readSnapshot(candidateSettings);
    }

    async getHubStatus(): Promise<PowerWatchHubStatus> {
        if (!this.settings.hubEnabled) {
            return { enabled: false,
                reachable: false,
                webUrl: null };
        }
        return this.testHub();
    }

    private hubUrl(settings: PowerWatchSettings): string {
        return settings.hubManagedWebUrl || `http://${addressForUrl(settings.hubBindAddress)}:${settings.hubHostPort}`;
    }

    async testHub(candidate?: Partial<PowerWatchSettings>): Promise<PowerWatchHubStatus> {
        const settings = candidate ? validateSettings(candidate, this.settings) : this.settings;
        if (!settings.hubEnabled) {
            return { enabled: false,
                reachable: false,
                webUrl: null };
        }
        const url = settings.hubMode === "managed" ? this.hubUrl(settings) : settings.hubWebUrl;
        try {
            if (settings.hubMode === "managed") {
                const inspect = await this.assertHubOwnership();
                if (!inspect?.State?.Running) {
                    throw new Error("PowerWatch Hub is stopped");
                }
                const raw = await this.docker([ "exec", POWERWATCH_HUB_CONTAINER_NAME, "curl", "--fail", "--silent", "--show-error", "--max-time", "4", "http://127.0.0.1:3000/api/hub/snapshot" ], { timeoutMs: REQUEST_TIMEOUT_MS + 1000 });
                parseSnapshotJson(raw);
            } else {
                if (!url) {
                    throw new Error("PowerWatch Hub URL is required");
                }
                await this.dependencies.fetchJson(hubSnapshotEndpoint(url), REQUEST_TIMEOUT_MS);
            }
            return { enabled: true,
                reachable: true,
                webUrl: url,
                lastError: null };
        } catch (error) {
            return { enabled: true,
                reachable: false,
                webUrl: url || null,
                lastError: error instanceof Error ? error.message : String(error) };
        }
    }

    async getManagedStates(): Promise<{ powerwatch: { installed: boolean;
        running: boolean };
    hub: { installed: boolean;
        running: boolean } }> {
        const [ powerwatch, hub ] = await Promise.all([ this.assertManagedOwnership(), this.assertHubOwnership() ]);
        return { powerwatch: { installed: Boolean(powerwatch),
            running: Boolean(powerwatch?.State?.Running) },
        hub: { installed: Boolean(hub),
            running: Boolean(hub?.State?.Running) } };
    }

    private async assertHubOwnership(): Promise<DockerInspect | null> {
        const inspect = await this.inspect(POWERWATCH_HUB_CONTAINER_NAME);
        if (!inspect) {
            return null;
        }
        const labels = inspect.Config?.Labels ?? {};
        if (labels["com.dockge-enhanced.managed"] !== "powerwatch-hub" ||
            labels["com.dockge-enhanced.integration"] !== "powerwatch-hub" ||
            labels["com.docker.compose.project"] !== POWERWATCH_HUB_STACK_NAME ||
            labels["com.docker.compose.service"] !== "powerwatch-hub") {
            throw new Error(`${POWERWATCH_HUB_CONTAINER_NAME} exists but is not owned by Dockge-Enhanced`);
        }
        return inspect;
    }

    private async assertHubPortAvailable(): Promise<void> {
        const ids = (await this.docker([ "ps", "-aq" ])).trim().split(/\s+/).filter(Boolean);
        const inspections = (await Promise.all(ids.map(id => this.inspect(id)))).filter((item): item is DockerInspect => Boolean(item));
        const own = inspections.find(item => item.Name?.replace(/^\//, "") === POWERWATCH_HUB_CONTAINER_NAME && item.State?.Running);
        if (inspections.some(item => item.State?.Running && item !== own && hasPublishedHostPort(item, this.settings.hubHostPort))) {
            throw new Error(`PowerWatch Hub port ${this.settings.hubHostPort} is already used by another Docker container`);
        }
        // Probe the host namespace: Enhanced's own container namespace cannot detect host processes.
        const probe = await this.dependencies.docker([ "run", "--rm", "--pull=missing", "--network", "host", "--read-only", "--entrypoint", "sh", POWERWATCH_IMAGE, "-c",
            "printf 'PW_TCP_BEGIN\\n'; cat /proc/net/tcp || exit 30; if test -r /proc/net/tcp6; then cat /proc/net/tcp6 || exit 31; fi; printf 'PW_TCP_END\\n'" ], { timeoutMs: HOST_PROBE_TIMEOUT_MS });
        if (probe.code !== 0) {
            throw new Error(`Unable to check PowerWatch Hub host port: ${probe.stderr.trim() || "probe failed"}`);
        }
        const busy = hostPortIsListening(probe.stdout, this.settings.hubHostPort);
        if (busy && !(own && hasPublishedHostPort(own, this.settings.hubHostPort))) {
            throw new Error(`PowerWatch Hub port ${this.settings.hubHostPort} is already in use`);
        }
    }

    async hubInstall(): Promise<void> {
        await this.hubStart();
    }

    async hubStart(): Promise<void> {
        if (!this.settings.hubEnabled || this.settings.hubMode !== "managed") {
            throw new Error("Managed PowerWatch Hub is not enabled");
        }
        await this.assertHubOwnership();
        await this.assertHubPortAvailable();
        const composePath = path.join(HUB_STACK_DIR, "compose.yaml");
        let existingCompose: string | null = null;
        try {
            existingCompose = await fs.readFile(composePath, "utf8");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                throw error;
            }
        }
        if (existingCompose !== null &&
            (!existingCompose.startsWith("# Generated by Dockge-Enhanced — managed PowerWatch Hub service\n") ||
                !existingCompose.includes(`name: ${POWERWATCH_HUB_STACK_NAME}\n`) ||
                !existingCompose.includes("com.dockge-enhanced.managed: powerwatch-hub"))) {
            throw new Error(`Stack ${POWERWATCH_HUB_STACK_NAME} is not managed by Dockge-Enhanced`);
        }
        if (existingCompose === null) {
            try {
                if ((await fs.readdir(HUB_STACK_DIR)).length > 0) {
                    throw new Error(`Stack directory ${POWERWATCH_HUB_STACK_NAME} is not empty`);
                }
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                    throw error;
                }
            }
        }
        await fs.mkdir(HUB_STACK_DIR, { recursive: true });
        await fs.writeFile(composePath, buildPowerWatchHubCompose(this.settings));
        await this.docker([ "compose", "--project-name", POWERWATCH_HUB_STACK_NAME, "--file", "compose.yaml", "up", "-d", "powerwatch-hub" ], { cwd: HUB_STACK_DIR });
    }

    async hubStop(): Promise<void> {
        const inspect = await this.assertHubOwnership();
        if (!inspect) {
            return;
        }
        const composePath = path.join(HUB_STACK_DIR, "compose.yaml");
        const file = await fs.readFile(composePath, "utf8");
        if (!file.startsWith("# Generated by Dockge-Enhanced — managed PowerWatch Hub service\n")) {
            throw new Error("Refusing to stop an unmanaged PowerWatch Hub stack");
        }
        await this.docker([ "compose", "--project-name", POWERWATCH_HUB_STACK_NAME, "--file", "compose.yaml", "stop", "powerwatch-hub" ], { cwd: HUB_STACK_DIR });
    }

    async hubRestart(): Promise<void> {
        await this.hubStop();
        await this.hubStart();
    }

    private async assertManagedOwnership(): Promise<DockerInspect | null> {
        const inspect = await this.inspect(POWERWATCH_CONTAINER_NAME);
        if (!inspect) {
            return null;
        }
        const labels = inspect.Config?.Labels ?? {};
        if (labels["com.dockge-enhanced.managed"] !== "powerwatch" ||
            labels["com.dockge-enhanced.integration"] !== "powerwatch" ||
            labels["com.docker.compose.project"] !== POWERWATCH_STACK_NAME ||
            labels["com.docker.compose.service"] !== "powerwatch") {
            throw new Error(`${POWERWATCH_CONTAINER_NAME} exists but is not owned by Dockge-Enhanced`);
        }
        return inspect;
    }

    async install(): Promise<void> {
        if (!this.settings.enabled || this.settings.mode !== "managed") {
            throw new Error("Managed PowerWatch is not enabled");
        }
        await this.start();
    }

    async start(): Promise<void> {
        if (!this.settings.enabled || this.settings.mode !== "managed") {
            throw new Error("Managed PowerWatch is not enabled");
        }
        await this.assertManagedOwnership();
        const detection = await this.detect();
        if (!detection.capabilities.linux) {
            throw new Error("PowerWatch Managed requires Linux");
        }
        if (!detection.portAvailable) {
            throw new Error(`Port ${this.settings.hostPort} is already in use`);
        }
        if (this.settings.msrMode === "enabled" && !detection.capabilities.msr) {
            throw new Error("MSR was requested but /dev/cpu/0/msr is unavailable");
        }
        if (this.settings.nvidiaMode === "enabled" && !detection.capabilities.nvidia) {
            throw new Error("NVIDIA was requested but the Docker runtime/device is unavailable");
        }
        const composePath = path.join(STACK_DIR, "compose.yaml");
        let existingCompose: string | null = null;
        try {
            existingCompose = await fs.readFile(composePath, "utf8");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                throw error;
            }
        }
        if (existingCompose !== null &&
            (!existingCompose.startsWith("# Generated by Dockge-Enhanced — managed PowerWatch service\n") ||
                !existingCompose.includes(`name: ${POWERWATCH_STACK_NAME}\n`) ||
                !existingCompose.includes("com.dockge-enhanced.managed: powerwatch"))) {
            throw new Error(`Stack ${POWERWATCH_STACK_NAME} already contains an unmanaged compose.yaml; refusing to overwrite it`);
        }
        if (existingCompose === null) {
            try {
                const files = await fs.readdir(STACK_DIR);
                if (files.length > 0) {
                    throw new Error(`Stack directory ${POWERWATCH_STACK_NAME} is not empty; refusing to take ownership`);
                }
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                    throw error;
                }
            }
        }
        await fs.mkdir(STACK_DIR, { recursive: true });
        await fs.writeFile(composePath, buildPowerWatchCompose(this.settings, detection.capabilities));
        await this.docker([ "compose", "--project-name", POWERWATCH_STACK_NAME, "--file", "compose.yaml", "up", "-d", "powerwatch" ], { cwd: STACK_DIR });
        this.cache = null;
    }

    async stop(): Promise<void> {
        if (this.settings.mode !== "managed") {
            throw new Error("External PowerWatch is observation-only");
        }
        const inspect = await this.assertManagedOwnership();
        if (!inspect) {
            return;
        }
        await this.docker([ "compose", "--project-name", POWERWATCH_STACK_NAME, "--file", "compose.yaml", "stop", "powerwatch" ], { cwd: STACK_DIR });
        this.cache = null;
    }

    async restart(): Promise<void> {
        await this.stop();
        await this.start();
    }
}
