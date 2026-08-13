import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import { isIP } from "node:net";
import * as path from "node:path";

const DATA_DIR = process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data";
const STACKS_DIR = process.env.DOCKGE_STACKS_DIR ?? "/opt/stacks";

export const PLUGNPIN_STACK_NAME = "plugnpin-dockge-enhanced";
export const PLUGNPIN_CONTAINER_NAME = "plugnpin-dockge-enhanced";
export const PLUGNPIN_SOCKET_PROXY_NAME = "plugnpin-socket-proxy";
export const PLUGNPIN_IMAGE = "ghcr.io/deepspace2/plugnpin:1.0.0";
export const PLUGNPIN_SOCKET_PROXY_IMAGE = "lscr.io/linuxserver/socket-proxy@sha256:b3c91258489c6d6ef26f20e9681177e3e861798466a2b85a3572ee0464c5e088";
export const PLUGNPIN_SECRET_HELPER_IMAGE = "busybox@sha256:73aaf090f3d85aa34ee199857f03fa3a95c8ede2ffd4cc2cdb5b94e566b11662";
export const PLUGNPIN_SECRETS_VOLUME = "dockge_enhanced_plugnpin_secrets";

const MANAGED_MARKER_CONTENT = "plugnpin-integration-v1\n";
const SECRETS_VOLUME_OWNER_LABEL = "com.dockge-enhanced.integration";

export type PlugNPiNDnsProvider = "none" | "pihole" | "adguard";
export type PlugNPiNStatus = "disabled" | "running" | "stopped" | "error";

export interface PlugNPiNSettings {
    enabled: boolean;
    npmHost: string;
    npmUsername: string;
    dnsProvider: PlugNPiNDnsProvider;
    piholeHost: string;
    adguardHomeHost: string;
    adguardHomeUsername: string;
    runInterval: string;
    timezone: string;
    debug: boolean;
    metrics: boolean;
    metricsPort: number;
    metricsBindAddress: string;
}

export interface PlugNPiNSettingsInput extends Partial<PlugNPiNSettings> {
    npmPassword?: string;
    piholePassword?: string;
    adguardHomePassword?: string;
}

export interface PlugNPiNSafeSettings extends PlugNPiNSettings {
    npmPasswordConfigured: boolean;
    piholePasswordConfigured: boolean;
    adguardHomePasswordConfigured: boolean;
    image: string;
    architecture: string;
    architectureSupported: boolean;
}

interface StoredPlugNPiNSettings extends PlugNPiNSettings {
    npmPasswordConfigured: boolean;
    piholePasswordConfigured: boolean;
    adguardHomePasswordConfigured: boolean;
}

interface CommandResult {
    stdout: string;
    stderr: string;
}

export type PlugNPiNCommandRunner = (
    command: string,
    args: string[],
    stdin?: string,
) => Promise<CommandResult>;

export interface PlugNPiNManagerPaths {
    dataDir: string;
    stacksDir: string;
}

const DEFAULT_SETTINGS: StoredPlugNPiNSettings = {
    enabled: false,
    npmHost: "",
    npmUsername: "",
    npmPasswordConfigured: false,
    dnsProvider: "none",
    piholeHost: "",
    piholePasswordConfigured: false,
    adguardHomeHost: "",
    adguardHomeUsername: "",
    adguardHomePasswordConfigured: false,
    runInterval: "1h",
    timezone: "",
    debug: false,
    metrics: false,
    metricsPort: 9100,
    metricsBindAddress: "127.0.0.1",
};

const SECRET_FILE_NAMES = {
    npmHost: "NGINX_PROXY_MANAGER_HOST",
    npmUsername: "NGINX_PROXY_MANAGER_USERNAME",
    npmPassword: "NGINX_PROXY_MANAGER_PASSWORD",
    piholeHost: "PIHOLE_HOST",
    piholePassword: "PIHOLE_PASSWORD",
    adguardHomeHost: "ADGUARD_HOME_HOST",
    adguardHomeUsername: "ADGUARD_HOME_USERNAME",
    adguardHomePassword: "ADGUARD_HOME_PASSWORD",
} as const;

function quoteYaml(value: string): string {
    return JSON.stringify(value);
}

function normalizeUrl(value: unknown): string {
    let normalized = String(value ?? "").trim();
    while (normalized.endsWith("/")) {
        normalized = normalized.slice(0, -1);
    }
    return normalized;
}

export function normalizePlugNPiNSettings(input: Partial<PlugNPiNSettings>): PlugNPiNSettings {
    const dnsProvider: PlugNPiNDnsProvider = [ "none", "pihole", "adguard" ].includes(input.dnsProvider ?? "")
        ? input.dnsProvider as PlugNPiNDnsProvider
        : "none";

    return {
        enabled: input.enabled === true,
        npmHost: normalizeUrl(input.npmHost),
        npmUsername: String(input.npmUsername ?? "").trim(),
        dnsProvider,
        piholeHost: normalizeUrl(input.piholeHost),
        adguardHomeHost: normalizeUrl(input.adguardHomeHost),
        adguardHomeUsername: String(input.adguardHomeUsername ?? "").trim(),
        runInterval: String(input.runInterval ?? "1h").trim() || "1h",
        timezone: String(input.timezone ?? "").trim(),
        debug: input.debug === true,
        metrics: input.metrics === true,
        metricsPort: Number.isInteger(Number(input.metricsPort)) ? Number(input.metricsPort) : 9100,
        metricsBindAddress: String(input.metricsBindAddress ?? "127.0.0.1").trim() || "127.0.0.1",
    };
}

export function validatePlugNPiNSettings(
    settings: PlugNPiNSettings,
    configured: Pick<StoredPlugNPiNSettings, "npmPasswordConfigured" | "piholePasswordConfigured" | "adguardHomePasswordConfigured">,
): void {
    if (!settings.enabled) {
        return;
    }

    if (!settings.npmHost || !settings.npmUsername || !configured.npmPasswordConfigured) {
        throw new Error("Nginx Proxy Manager host, username and password are required");
    }

    for (const [ label, url ] of [
        [ "Nginx Proxy Manager", settings.npmHost ],
        [ "Pi-hole", settings.dnsProvider === "pihole" ? settings.piholeHost : "" ],
        [ "AdGuard Home", settings.dnsProvider === "adguard" ? settings.adguardHomeHost : "" ],
    ] as const) {
        if (!url) {
            continue;
        }
        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            throw new Error(`${label} URL is invalid`);
        }
        if (![ "http:", "https:" ].includes(parsed.protocol)) {
            throw new Error(`${label} URL must use http or https`);
        }
    }

    if (settings.dnsProvider === "pihole" && (!settings.piholeHost || !configured.piholePasswordConfigured)) {
        throw new Error("Pi-hole host and password are required");
    }
    if (settings.dnsProvider === "adguard" && (
        !settings.adguardHomeHost
        || !settings.adguardHomeUsername
        || !configured.adguardHomePasswordConfigured
    )) {
        throw new Error("AdGuard Home host, username and password are required");
    }
    if (!/^(?:0|(?:\d+(?:\.\d+)?)(?:ns|us|µs|ms|s|m|h))$/.test(settings.runInterval)) {
        throw new Error("Run interval must use a Go duration such as 30m, 1h or 24h");
    }
    if (settings.metricsPort < 1 || settings.metricsPort > 65535) {
        throw new Error("Metrics port must be between 1 and 65535");
    }
    if (isIP(settings.metricsBindAddress) !== 4) {
        throw new Error("Metrics bind address must be an IPv4 address");
    }
}

export function renderPlugNPiNCompose(settings: PlugNPiNSettings): string {
    const lines = [
        "# Generated and managed by Dockge Enhanced.",
        "# Change settings from Settings > Integrations to avoid losing edits.",
        "services:",
        "  socket-proxy:",
        `    image: ${PLUGNPIN_SOCKET_PROXY_IMAGE}`,
        `    container_name: ${PLUGNPIN_SOCKET_PROXY_NAME}`,
        "    restart: unless-stopped",
        "    environment:",
        "      CONTAINERS: \"1\"",
        "      EVENTS: \"1\"",
        "      PING: \"1\"",
        "      VERSION: \"1\"",
        "    read_only: true",
        "    tmpfs:",
        "      - /run",
        "    volumes:",
        "      - /var/run/docker.sock:/var/run/docker.sock:ro",
        "",
        "  plugnpin:",
        `    image: ${PLUGNPIN_IMAGE}`,
        `    container_name: ${PLUGNPIN_CONTAINER_NAME}`,
        "    restart: unless-stopped",
        "    depends_on:",
        "      - socket-proxy",
        "    environment:",
        "      DOCKER_HOST: tcp://socket-proxy:2375",
        `      PIHOLE_DISABLED: ${quoteYaml(String(settings.dnsProvider !== "pihole"))}`,
        `      ADGUARD_HOME_DISABLED: ${quoteYaml(String(settings.dnsProvider !== "adguard"))}`,
        `      RUN_INTERVAL: ${quoteYaml(settings.runInterval)}`,
        `      DEBUG: ${quoteYaml(String(settings.debug))}`,
        `      METRICS: ${quoteYaml(String(settings.metrics))}`,
        `      METRICS_SERVER_PORT: ${quoteYaml(String(settings.metricsPort))}`,
    ];

    if (settings.timezone) {
        lines.push(`      TZ: ${quoteYaml(settings.timezone)}`);
    }
    if (settings.metrics) {
        lines.push(
            "    ports:",
            `      - ${quoteYaml(`${settings.metricsBindAddress}:${settings.metricsPort}:${settings.metricsPort}`)}`,
        );
    }
    lines.push(
        "    volumes:",
        "      - plugnpin-secrets:/run/secrets:ro",
        "",
        "volumes:",
        "  plugnpin-secrets:",
        "    external: true",
        `    name: ${PLUGNPIN_SECRETS_VOLUME}`,
        "",
    );
    return lines.join("\n");
}

async function defaultCommandRunner(command: string, args: string[], stdin?: string): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: [ stdin === undefined ? "ignore" : "pipe", "pipe", "pipe" ],
        });
        let stdout = "";
        let stderr = "";
        child.stdout!.setEncoding("utf8");
        child.stderr!.setEncoding("utf8");
        child.stdout!.on("data", chunk => stdout += chunk);
        child.stderr!.on("data", chunk => stderr += chunk);
        child.on("error", reject);
        child.on("close", code => {
            if (code === 0) {
                resolve({ stdout,
                    stderr });
            } else {
                reject(new Error(`${command} ${args.join(" ")} failed (${code}): ${stderr.trim()}`));
            }
        });
        if (stdin !== undefined) {
            child.stdin!.end(stdin);
        }
    });
}

export class PlugNPiNManager {
    private static instance: PlugNPiNManager;
    private settings: StoredPlugNPiNSettings = { ...DEFAULT_SETTINGS };
    private commandRunner: PlugNPiNCommandRunner;
    private operation: Promise<void> = Promise.resolve();
    private settingsDir: string;
    private settingsPath: string;
    private stackDir: string;
    private composePath: string;
    private managedMarkerPath: string;

    constructor(
        commandRunner: PlugNPiNCommandRunner = defaultCommandRunner,
        paths: PlugNPiNManagerPaths = {
            dataDir: DATA_DIR,
            stacksDir: STACKS_DIR,
        },
    ) {
        this.commandRunner = commandRunner;
        this.settingsDir = path.join(paths.dataDir, "plugnpin");
        this.settingsPath = path.join(this.settingsDir, "settings.json");
        this.stackDir = path.join(paths.stacksDir, PLUGNPIN_STACK_NAME);
        this.composePath = path.join(this.stackDir, "compose.yaml");
        this.managedMarkerPath = path.join(this.stackDir, ".dockge-enhanced-managed");
    }

    static getInstance(): PlugNPiNManager {
        if (!PlugNPiNManager.instance) {
            PlugNPiNManager.instance = new PlugNPiNManager();
        }
        return PlugNPiNManager.instance;
    }

    async loadSettings(): Promise<void> {
        try {
            const raw = JSON.parse(await fs.readFile(this.settingsPath, "utf8")) as Partial<StoredPlugNPiNSettings>;
            this.settings = {
                ...DEFAULT_SETTINGS,
                ...normalizePlugNPiNSettings(raw),
                npmPasswordConfigured: raw.npmPasswordConfigured === true,
                piholePasswordConfigured: raw.piholePasswordConfigured === true,
                adguardHomePasswordConfigured: raw.adguardHomePasswordConfigured === true,
            };
        } catch {
            this.settings = { ...DEFAULT_SETTINGS };
        }
    }

    getSettingsSafe(): PlugNPiNSafeSettings {
        return {
            ...normalizePlugNPiNSettings(this.settings),
            npmPasswordConfigured: this.settings.npmPasswordConfigured,
            piholePasswordConfigured: this.settings.piholePasswordConfigured,
            adguardHomePasswordConfigured: this.settings.adguardHomePasswordConfigured,
            image: PLUGNPIN_IMAGE,
            architecture: process.arch,
            architectureSupported: process.arch === "x64",
        };
    }

    async startIfEnabled(): Promise<void> {
        await this.loadSettings();
        if (this.settings.enabled) {
            await this.enqueue(() => this.deploy());
        }
    }

    async saveSettings(input: PlugNPiNSettingsInput): Promise<PlugNPiNSafeSettings> {
        return this.enqueue(async () => {
            const normalized = normalizePlugNPiNSettings({ ...this.settings,
                ...input });
            const next: StoredPlugNPiNSettings = {
                ...normalized,
                npmPasswordConfigured: Boolean(input.npmPassword) || this.settings.npmPasswordConfigured,
                piholePasswordConfigured: Boolean(input.piholePassword) || this.settings.piholePasswordConfigured,
                adguardHomePasswordConfigured: Boolean(input.adguardHomePassword) || this.settings.adguardHomePasswordConfigured,
            };
            if (next.enabled && process.arch !== "x64") {
                throw new Error(`PlugNPiN ${PLUGNPIN_IMAGE} is not published for ${process.arch}`);
            }
            validatePlugNPiNSettings(next, next);

            await fs.mkdir(this.settingsDir, { recursive: true });
            if (next.enabled) {
                await this.ensureManagedStackDirectory();
                await this.ensureSecretsVolume();
                await this.writeTextSecret(SECRET_FILE_NAMES.npmHost, next.npmHost);
                await this.writeTextSecret(SECRET_FILE_NAMES.npmUsername, next.npmUsername);
                if (input.npmPassword) {
                    await this.writeTextSecret(SECRET_FILE_NAMES.npmPassword, input.npmPassword);
                }
                if (next.dnsProvider === "pihole") {
                    await this.writeTextSecret(SECRET_FILE_NAMES.piholeHost, next.piholeHost);
                    if (input.piholePassword) {
                        await this.writeTextSecret(SECRET_FILE_NAMES.piholePassword, input.piholePassword);
                    }
                }
                if (next.dnsProvider === "adguard") {
                    await this.writeTextSecret(SECRET_FILE_NAMES.adguardHomeHost, next.adguardHomeHost);
                    await this.writeTextSecret(SECRET_FILE_NAMES.adguardHomeUsername, next.adguardHomeUsername);
                    if (input.adguardHomePassword) {
                        await this.writeTextSecret(SECRET_FILE_NAMES.adguardHomePassword, input.adguardHomePassword);
                    }
                }
            }

            if (next.enabled) {
                this.settings = next;
                await this.persistSettings();
                await this.deploy();
            } else {
                await this.stopAndRemoveGeneratedStack();
                this.settings = next;
                await this.persistSettings();
            }
            return this.getSettingsSafe();
        });
    }

    async start(): Promise<void> {
        return this.enqueue(async () => {
            validatePlugNPiNSettings(this.settings, this.settings);
            if (!this.settings.enabled) {
                throw new Error("PlugNPiN integration is disabled");
            }
            await this.deploy();
        });
    }

    async stop(): Promise<void> {
        return this.enqueue(() => this.compose([ "stop" ]));
    }

    async restart(): Promise<void> {
        return this.enqueue(async () => {
            if (!this.settings.enabled) {
                throw new Error("PlugNPiN integration is disabled");
            }
            await this.compose([ "restart" ]);
        });
    }

    async getStatus(): Promise<{ status: PlugNPiNStatus; message?: string }> {
        if (!this.settings.enabled) {
            return { status: "disabled" };
        }
        try {
            const { stdout } = await this.commandRunner("docker", [
                "inspect", "--format", "{{.State.Status}}|{{.State.ExitCode}}|{{.State.Error}}", PLUGNPIN_CONTAINER_NAME,
            ]);
            const [ state, exitCode, stateError ] = stdout.trim().split("|", 3);
            if (state === "running") {
                return { status: "running" };
            }
            if ([ "dead", "restarting" ].includes(state) || (state === "exited" && exitCode !== "0")) {
                return { status: "error",
                    message: stateError || `${state} (${exitCode})` };
            }
            return { status: "stopped",
                message: state || undefined };
        } catch {
            return { status: "stopped" };
        }
    }

    async getLogs(tail = 200): Promise<string> {
        const numericTail = Number.isFinite(tail) ? tail : 200;
        const safeTail = Math.max(1, Math.min(1000, Math.trunc(numericTail)));
        const { stdout, stderr } = await this.commandRunner("docker", [
            "logs", "--tail", String(safeTail), PLUGNPIN_CONTAINER_NAME,
        ]);
        return `${stdout}${stderr}`.trimEnd();
    }

    private async enqueue<T>(action: () => Promise<T>): Promise<T> {
        const result = this.operation.then(action, action);
        this.operation = result.then(() => undefined, () => undefined);
        return result;
    }

    private async persistSettings(): Promise<void> {
        await fs.mkdir(this.settingsDir, { recursive: true });
        await fs.writeFile(this.settingsPath, `${JSON.stringify(this.settings, null, 2)}\n`, {
            encoding: "utf8",
            mode: 0o600,
        });
        await fs.chmod(this.settingsPath, 0o600);
    }

    private async ensureSecretsVolume(): Promise<void> {
        try {
            const { stdout } = await this.commandRunner("docker", [
                "volume", "inspect", "--format",
                `{{ index .Labels ${JSON.stringify(SECRETS_VOLUME_OWNER_LABEL)} }}`,
                PLUGNPIN_SECRETS_VOLUME,
            ]);
            if (stdout.trim() !== "plugnpin") {
                throw new Error(`Docker volume already exists and is not managed by Dockge Enhanced: ${PLUGNPIN_SECRETS_VOLUME}`);
            }
            return;
        } catch (error) {
            if (error instanceof Error && error.message.includes("is not managed by Dockge Enhanced")) {
                throw error;
            }
        }
        await this.commandRunner("docker", [
            "volume", "create",
            "--label", `${SECRETS_VOLUME_OWNER_LABEL}=plugnpin`,
            PLUGNPIN_SECRETS_VOLUME,
        ]);
    }

    private async writeTextSecret(filename: string, value: string): Promise<void> {
        if (!/^[A-Z0-9_]+$/.test(filename)) {
            throw new Error("Invalid secret filename");
        }
        await this.commandRunner("docker", [
            "run", "--rm", "-i",
            "-v", `${PLUGNPIN_SECRETS_VOLUME}:/run/secrets`,
            PLUGNPIN_SECRET_HELPER_IMAGE,
            "sh", "-c",
            "umask 077; cat > \"/run/secrets/$1\"; chmod 600 \"/run/secrets/$1\"",
            "write-secret", filename,
        ], value);
    }

    private async deploy(): Promise<void> {
        await this.ensureManagedStackDirectory();
        await fs.writeFile(this.composePath, renderPlugNPiNCompose(this.settings), "utf8");
        await this.compose([ "up", "-d", "--remove-orphans" ]);
    }

    private async stopAndRemoveGeneratedStack(): Promise<void> {
        let markerExists = true;
        try {
            const marker = await fs.readFile(this.managedMarkerPath, "utf8");
            if (marker !== MANAGED_MARKER_CONTENT) {
                throw new Error(`Stack directory is not managed by the PlugNPiN integration: ${this.stackDir}`);
            }
        } catch (error) {
            if (error instanceof Error && error.message.includes("is not managed by the PlugNPiN integration")) {
                throw error;
            }
            markerExists = false;
        }
        if (!markerExists) {
            if (this.settings.enabled) {
                throw new Error(`Managed stack marker is missing; refusing to remove: ${this.stackDir}`);
            }
            return;
        }

        let composeExists = true;
        try {
            await fs.access(this.composePath);
        } catch {
            composeExists = false;
        }
        if (!composeExists && this.settings.enabled) {
            await fs.writeFile(this.composePath, renderPlugNPiNCompose(this.settings), "utf8");
            composeExists = true;
        }
        if (composeExists) {
            // Do not swallow this error: settings must remain enabled if Docker
            // could not actually stop the generated integration.
            await this.compose([ "down", "--remove-orphans" ]);
        }
        await fs.rm(this.stackDir, { recursive: true,
            force: true });
    }

    private async ensureManagedStackDirectory(): Promise<void> {
        try {
            await fs.access(this.stackDir);
        } catch {
            await fs.mkdir(this.stackDir, { recursive: true });
            await fs.writeFile(this.managedMarkerPath, MANAGED_MARKER_CONTENT, {
                encoding: "utf8",
                mode: 0o600,
            });
            return;
        }

        try {
            const marker = await fs.readFile(this.managedMarkerPath, "utf8");
            if (marker !== MANAGED_MARKER_CONTENT) {
                throw new Error("invalid marker");
            }
        } catch {
            throw new Error(`Stack directory already exists and is not managed by Dockge Enhanced: ${this.stackDir}`);
        }
    }

    private async compose(args: string[]): Promise<void> {
        await this.commandRunner("docker", [
            "compose", "--project-name", PLUGNPIN_STACK_NAME,
            "--file", this.composePath,
            ...args,
        ]);
    }
}
