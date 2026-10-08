import * as fs from "node:fs/promises";
import { isIP } from "node:net";
import * as path from "node:path";
import childProcessAsync from "promisify-child-process";

export type PowerWatchMode = "managed" | "external";
export type PowerWatchToggleMode = "auto" | "enabled" | "disabled";

export interface PowerWatchSettings {
    enabled: boolean;
    mode: PowerWatchMode;
    apiUrl: string;
    webUrl: string;
    externalContainer: string;
    hostPort: number;
    bindAddress: string;
    managedWebUrl: string;
    msrMode: PowerWatchToggleMode;
    nvidiaMode: PowerWatchToggleMode;
    hubEnabled: boolean;
    hubWebUrl: string;
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
    fetchJson: (url: string, timeoutMs: number) => Promise<unknown>;
    platform: () => NodeJS.Platform;
    now: () => number;
}

const DATA_DIR = process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data";
const STACKS_DIR = process.env.DOCKGE_STACKS_DIR ?? "/opt/stacks";
const SETTINGS_PATH = path.join(DATA_DIR, "powerwatch-settings.json");
export const POWERWATCH_STACK_NAME = "powerwatch-dockge-enhanced";
export const POWERWATCH_CONTAINER_NAME = "powerwatch-dockge-enhanced";
export const POWERWATCH_IMAGE = "ghcr.io/aerya/powerwatch:latest";
export const POWERWATCH_VOLUME = "powerwatch_dockge_data";
const STACK_DIR = path.join(STACKS_DIR, POWERWATCH_STACK_NAME);
const CACHE_TTL_MS = 8_000;
const REQUEST_TIMEOUT_MS = 4_000;

export const DEFAULT_POWERWATCH_SETTINGS: PowerWatchSettings = {
    enabled: false,
    mode: "external",
    apiUrl: "",
    webUrl: "",
    externalContainer: "",
    hostPort: 3000,
    bindAddress: "127.0.0.1",
    managedWebUrl: "",
    msrMode: "auto",
    nvidiaMode: "auto",
    hubEnabled: false,
    hubWebUrl: "",
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

async function defaultFetchJson(url: string, timeoutMs: number): Promise<unknown> {
    // This URL is deliberately configured by an authenticated Dockge administrator and is
    // validated as credential-free HTTP(S). Private LAN targets are a supported use case, so
    // they cannot be blocked; redirects are refused to keep the request on the approved origin.
    // codeql[js/request-forgery]
    const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
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
    next.managedWebUrl = validatePowerWatchUrl(next.managedWebUrl, "managedWebUrl");
    next.hubWebUrl = validatePowerWatchUrl(next.hubWebUrl, "hubWebUrl");
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
        `      - ${POWERWATCH_VOLUME}:/data/.local/share/powerwatch`,
        "    environment:",
        "      POWERWATCH_POWERCAP_PATH: /host-sys-virtual/powercap/intel-rapl",
    ];
    if (useMsr) {
        lines.push("    cap_add:", "      - SYS_RAWIO", "    devices:", "      - /dev/cpu/0/msr:/dev/cpu/0/msr:r");
    }
    if (useNvidia) {
        lines.push(
            "      NVIDIA_VISIBLE_DEVICES: all",
            "      NVIDIA_DRIVER_CAPABILITIES: utility",
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

function isPowerWatchImage(image: string | undefined): boolean {
    return Boolean(image && (image === "ghcr.io/aerya/powerwatch" || image.startsWith("ghcr.io/aerya/powerwatch:" ) || image.startsWith("ghcr.io/aerya/powerwatch@")));
}

function publishedPort(inspect: DockerInspect): number | null {
    const binding = inspect.HostConfig?.PortBindings?.["3000/tcp"]?.[0]?.HostPort;
    const port = Number(binding);
    return Number.isInteger(port) && port > 0 ? port : null;
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
        return { ...this.settings };
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
        this.settings = next;
        this.cache = null;
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.writeFile(SETTINGS_PATH, JSON.stringify(this.settings, null, 2));
    }

    async startIfEnabled(): Promise<void> {
        await this.loadSettings();
        if (this.settings.enabled && this.settings.mode === "managed") {
            await this.start();
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
        const hostProbe = await this.dependencies.docker([
            "run", "--rm", "--read-only", "--entrypoint", "sh",
            "-v", "/sys:/host-sys:ro", "-v", "/dev:/host-dev:ro",
            POWERWATCH_IMAGE, "-c",
            "test -d /host-sys/devices/virtual/powercap/intel-rapl && echo powercap; test -c /host-dev/cpu/0/msr && echo msr; test -c /host-dev/nvidiactl && echo nvidia-device",
        ], { timeoutMs: REQUEST_TIMEOUT_MS * 3 });
        const info = await this.dependencies.docker([ "info", "--format", "{{json .Runtimes}}" ]);
        const probe = hostProbe.stdout;
        const capabilities = {
            linux: this.dependencies.platform() === "linux",
            powercap: probe.includes("powercap"),
            msr: probe.includes("msr"),
            nvidia: probe.includes("nvidia-device") && info.stdout.toLowerCase().includes("nvidia"),
        };
        const portAvailable = !inspections.some((item) => publishedPort(item) === this.settings.hostPort && item.Config?.Labels?.["com.dockge-enhanced.managed"] !== "powerwatch");
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
                const output = await this.docker([ "exec", POWERWATCH_CONTAINER_NAME, "curl", "--fail", "--silent", "--show-error", "--max-time", "4", "http://127.0.0.1:3000/api/snapshot" ], { timeoutMs: REQUEST_TIMEOUT_MS + 1_000 });
                payload = parseSnapshotJson(output);
                webUrl = this.managedWebUrlFor(settings);
            } else if (settings.externalContainer) {
                const inspect = await this.assertExternalContainer(settings.externalContainer);
                if (!inspect.State?.Running) {
                    throw new Error("PowerWatch container is stopped");
                }
                const output = await this.docker([ "exec", settings.externalContainer, "curl", "--fail", "--silent", "--show-error", "--max-time", "4", "http://127.0.0.1:3000/api/snapshot" ], { timeoutMs: REQUEST_TIMEOUT_MS + 1_000 });
                payload = parseSnapshotJson(output);
                const port = publishedPort(inspect);
                webUrl = settings.webUrl || (port ? `http://127.0.0.1:${port}` : null);
            } else {
                if (!settings.apiUrl) {
                    throw new Error("PowerWatch API URL is required");
                }
                payload = await this.dependencies.fetchJson(snapshotEndpoint(settings.apiUrl), REQUEST_TIMEOUT_MS);
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
        if (!this.settings.hubWebUrl) {
            return { enabled: true,
                reachable: false,
                webUrl: null,
                lastError: "PowerWatch Hub URL is required" };
        }
        try {
            await this.dependencies.fetchJson(hubSnapshotEndpoint(this.settings.hubWebUrl), REQUEST_TIMEOUT_MS);
            return { enabled: true,
                reachable: true,
                webUrl: this.settings.hubWebUrl,
                lastError: null };
        } catch (error) {
            return { enabled: true,
                reachable: false,
                webUrl: this.settings.hubWebUrl,
                lastError: error instanceof Error ? error.message : String(error) };
        }
    }

    async testHub(candidate?: Partial<PowerWatchSettings>): Promise<PowerWatchHubStatus> {
        const settings = candidate ? validateSettings(candidate, this.settings) : this.settings;
        if (!settings.hubEnabled) {
            return { enabled: false,
                reachable: false,
                webUrl: null };
        }
        if (!settings.hubWebUrl) {
            throw new Error("PowerWatch Hub URL is required");
        }
        try {
            await this.dependencies.fetchJson(hubSnapshotEndpoint(settings.hubWebUrl), REQUEST_TIMEOUT_MS);
            return { enabled: true,
                reachable: true,
                webUrl: settings.hubWebUrl,
                lastError: null };
        } catch (error) {
            return { enabled: true,
                reachable: false,
                webUrl: settings.hubWebUrl,
                lastError: error instanceof Error ? error.message : String(error) };
        }
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
        await fs.mkdir(STACK_DIR, { recursive: true });
        await fs.writeFile(path.join(STACK_DIR, "compose.yaml"), buildPowerWatchCompose(this.settings, detection.capabilities));
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
        await this.docker([ "compose", "--project-name", POWERWATCH_STACK_NAME, "--file", "compose.yaml", "down" ], { cwd: STACK_DIR });
        this.cache = null;
    }

    async restart(): Promise<void> {
        await this.stop();
        await this.start();
    }
}
