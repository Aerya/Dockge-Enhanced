import * as fs from "fs/promises";
import * as os from "node:os";
import * as path from "path";

export interface DockerRegistryCredential {
    registry: string;
    username: string;
    token: string;
}

interface DockerAuthConfig {
    auths?: Record<string, { auth?: string }>;
    [key: string]: unknown;
}

const DATA_DIR = process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data";
const MANAGED_CONFIG_DIR = path.join(DATA_DIR, "docker-config");
const MANAGED_CONFIG_PATH = path.join(MANAGED_CONFIG_DIR, "config.json");

// Capture any operator-provided config before Dockge redirects Docker clients.
const BASE_CONFIG_DIR = process.env.DOCKER_CONFIG ?? path.join(os.homedir(), ".docker");
const BASE_CONFIG_PATH = path.join(BASE_CONFIG_DIR, "config.json");

export function normalizeRegistryHost(registry: string): string {
    const trimmed = registry.trim();
    if (!trimmed) {
        return "";
    }

    try {
        const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
        return normalizeDockerHubAlias(parsed.host.toLowerCase());
    } catch {
        const host = trimmed.replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
        return normalizeDockerHubAlias(host);
    }
}

function normalizeDockerHubAlias(registry: string): string {
    if ([ "docker.io", "index.docker.io", "registry-1.docker.io" ].includes(registry)) {
        return "registry-1.docker.io";
    }
    return registry;
}

function dockerAuthKey(registry: string): string {
    return registry === "registry-1.docker.io"
        ? "https://index.docker.io/v1/"
        : registry;
}

export function buildDockerAuthConfig(
    baseConfig: DockerAuthConfig,
    credentials: DockerRegistryCredential[],
): DockerAuthConfig {
    const auths = { ...(baseConfig.auths ?? {}) };

    for (const credential of credentials) {
        const registry = normalizeRegistryHost(credential.registry);
        const username = credential.username.trim();
        if (!registry || !username || !credential.token) {
            continue;
        }

        auths[dockerAuthKey(registry)] = {
            auth: Buffer.from(`${username}:${credential.token}`, "utf8").toString("base64"),
        };
    }

    return {
        ...baseConfig,
        auths,
    };
}

async function readBaseConfig(): Promise<DockerAuthConfig> {
    if (path.resolve(BASE_CONFIG_PATH) === path.resolve(MANAGED_CONFIG_PATH)) {
        return {};
    }

    try {
        return JSON.parse(await fs.readFile(BASE_CONFIG_PATH, "utf8")) as DockerAuthConfig;
    } catch {
        return {};
    }
}

/**
 * Writes the Docker CLI config inherited by every child `docker` process.
 * Docker stores auth in base64 rather than encrypting it, so permissions are
 * restricted to the Dockge process user.
 */
export async function syncDockerRegistryCredentials(
    credentials: DockerRegistryCredential[],
): Promise<void> {
    const baseConfig = await readBaseConfig();
    const config = buildDockerAuthConfig(baseConfig, credentials);
    const tempPath = `${MANAGED_CONFIG_PATH}.${process.pid}.tmp`;

    await fs.mkdir(MANAGED_CONFIG_DIR, {
        recursive: true,
        mode: 0o700,
    });
    await fs.chmod(MANAGED_CONFIG_DIR, 0o700).catch(() => {});
    await fs.writeFile(tempPath, JSON.stringify(config, null, 2), {
        mode: 0o600,
    });
    await fs.rename(tempPath, MANAGED_CONFIG_PATH);
    await fs.chmod(MANAGED_CONFIG_PATH, 0o600).catch(() => {});

    process.env.DOCKER_CONFIG = MANAGED_CONFIG_DIR;
}

export function getManagedDockerConfigDir(): string {
    return MANAGED_CONFIG_DIR;
}
