import { bitwardenExecutable } from "./bitwarden-cli";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { type Binding, type Connection, secretsError } from "./store";

const exec = promisify(execFile);
const MAX_BYTES = 1024 * 1024;
/** Never let provider variables reconfigure the executable, Docker endpoint or Compose files. */
export function secretEnvironment(entries: Array<[string, string]>): Record<string, string> {
    if (!entries.length || entries.length > 1000) {
        throw secretsError();
    }
    const result: Record<string, string> = Object.create(null);
    let bytes = 0;
    for (const [ key, value ] of entries) {
        if (typeof key !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || /^(PATH|HOME|SHELL|ENV|BASH_ENV|IFS|PWD|TMPDIR|TMP|TEMP|NODE_OPTIONS|NODE_PATH|SSL_CERT_FILE|SSL_CERT_DIR|__proto__|constructor|prototype)$/i.test(key)
            || /^(DOCKER_|COMPOSE_|LD_|DYLD_|OP_|BWS_|DOPPLER_|INFISICAL_)/i.test(key)
            || typeof value !== "string" || value.includes("\0") || Object.hasOwn(result, key)) {
            throw secretsError();
        }
        bytes += Buffer.byteLength(key) + Buffer.byteLength(value);
        if (bytes > MAX_BYTES) {
            throw secretsError();
        }
        result[key] = value;
    }
    return result;
}
async function json<T>(url: string, init: RequestInit): Promise<T> {
    const response = await fetch(url, { ...init,
        redirect: "error",
        signal: AbortSignal.timeout(20_000) });
    if (!response.ok || Number(response.headers.get("content-length")) > MAX_BYTES) {
        throw secretsError();
    }
    const reader = response.body?.getReader();
    if (!reader) {
        throw secretsError();
    }
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            size += value.length;
            if (size > MAX_BYTES) {
                throw secretsError();
            }
            parts.push(value);
        }
        return JSON.parse(Buffer.concat(parts).toString("utf8"));
    } finally {
        await reader.cancel();
    }
}
async function readOnePassword(token: string, environment: string) {
    const sdk = await import("@1password/sdk");
    const client = await sdk.createClient({ auth: token,
        integrationName: "Dockge-Enhanced",
        integrationVersion: "1.5.4" });
    return client.environments.getVariables(environment);
}
export async function resolveSecrets(connection: Connection, binding: Binding, onePassword = readOnePassword): Promise<Record<string, string>> {
    try {
        switch (connection.provider) {
            case "onepassword": {
                const data = await onePassword(connection.token, binding.environment);
                return secretEnvironment(data.variables.map(variable => [ variable.name, variable.value ]));
            }
            case "doppler": {
                const url = new URL("https://api.doppler.com/v3/configs/config/secrets/download");
                url.searchParams.set("format", "json");
                url.searchParams.set("include_dynamic_secrets", "false");
                if (binding.project) {
                    url.searchParams.set("project", binding.project);
                }
                if (binding.environment) {
                    url.searchParams.set("config", binding.environment);
                }
                const data = await json<Record<string, string>>(url.href, { headers: { Authorization: `Bearer ${connection.token}` } });
                return secretEnvironment(Object.entries(data));
            }
            case "infisical": {
                const auth = await json<{ accessToken: string }>(connection.url + "/api/v1/auth/universal-auth/login", { method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ clientId: connection.clientId,
                        clientSecret: connection.token }) });
                if (typeof auth.accessToken !== "string" || !auth.accessToken) {
                    throw secretsError();
                }
                const url = new URL(connection.url + "/api/v4/secrets");
                for (const [ key, value ] of Object.entries({ projectId: binding.project,
                    environment: binding.environment,
                    secretPath: binding.secretPath,
                    viewSecretValue: "true",
                    expandSecretReferences: "true",
                    includeImports: "false",
                    recursive: "false" })) {
                    url.searchParams.set(key, value);
                }
                const data = await json<{ secrets: Array<{ secretKey: string;
                    secretValue: string;
                    secretValueHidden?: boolean }> }>(url.href, { headers: { Authorization: `Bearer ${auth.accessToken}` } });
                if (!Array.isArray(data.secrets) || data.secrets.some((secret) => secret.secretValueHidden)) {
                    throw secretsError();
                }
                return secretEnvironment(data.secrets.map((secret) => [ secret.secretKey, secret.secretValue ]));
            }
            case "bitwarden": {
                // The official CLI supports musl on both architectures, unlike sdk-napi.
                // No state file/cache: all provider credentials stay in the child environment.
                const directory = await mkdtemp(path.join(os.tmpdir(), "dockge-bws-"));
                try {
                    const config = path.join(directory, "config");
                    await writeFile(config, JSON.stringify({ profiles: { dockge: { ...bitwardenEndpoints(connection.url),
                        state_opt_out: "true" } } }), { mode: 0o600 });
                    const { stdout } = await exec(bitwardenExecutable(), [ "--config-file", config, "--profile", "dockge", "--output", "json", "secret", "list", binding.project ], {
                        env: { PATH: process.env.PATH,
                            BWS_ACCESS_TOKEN: connection.token },
                        timeout: 30_000,
                        maxBuffer: MAX_BYTES,
                        encoding: "utf8",
                    });
                    const secrets = JSON.parse(stdout);
                    if (!Array.isArray(secrets)) {
                        throw secretsError();
                    }
                    return secretEnvironment(secrets.map(secret => [ secret.key, secret.value ]));
                } finally {
                    await rm(directory, { recursive: true,
                        force: true });
                }
            }
        }
    } catch {
        throw secretsError();
    }
}

export function bitwardenEndpoints(url: string) {
    if ([ "https://vault.bitwarden.com", "https://vault.bitwarden.eu" ].includes(url)) {
        const suffix = url.endsWith(".eu") ? "eu" : "com";
        return { server_api: `https://api.bitwarden.${suffix}`,
            server_identity: `https://identity.bitwarden.${suffix}` };
    }
    return { server_base: url };
}
