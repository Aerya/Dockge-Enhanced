import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";

export type Provider = "onepassword" | "doppler" | "infisical" | "bitwarden";
export interface Connection { id: string;
    name: string;
    provider: Provider;
    url: string;
    token: string;
    clientId: string }
export interface Binding { connection: string;
    project: string;
    environment: string;
    secretPath: string }
interface State { version: 1;
    connections: Array<Omit<Connection, "token"> & { sealed: string }>;
    bindings: Record<string, Binding> }
const empty = (): State => ({ version: 1,
    connections: [],
    bindings: {} });
export const secretsError = () => new Error("stackSecrets.unavailable");
export const canonicalPath = (value: string) => realpathSync(value);

/** Credentials are never returned by list(), or stored in stack files/history. */
export class SecretsStore {
    private tail: Promise<unknown> = Promise.resolve();
    constructor(readonly dataDir: string) {}
    private get filename() {
        return path.join(this.dataDir, "stack-secrets.json");
    }

    read(): State {
        try {
            const state = JSON.parse(readFileSync(this.filename, "utf8"));
            if (state.version !== 1 || !Array.isArray(state.connections) || !state.bindings || typeof state.bindings !== "object") {
                throw secretsError();
            }
            return state;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return empty();
            }
            throw secretsError();
        }
    }

    list() {
        return this.read().connections.map(({ sealed, ...item }) => ({ ...item,
            configured: !!sealed }));
    }

    binding(cwd: string): Binding | undefined {
        const bindings = this.read().bindings;
        if (!Object.keys(bindings).length) {
            return;
        }
        try {
            return bindings[canonicalPath(cwd)];
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return bindings[path.resolve(cwd)];
            }
            throw secretsError();
        }
    }

    private async key(create = false): Promise<Buffer> {
        const filename = path.join(this.dataDir, "stack-secrets.key");
        try {
            const key = await fs.readFile(filename);
            if (key.length !== 32) {
                throw secretsError();
            }
            return key;
        } catch (error) {
            if (!create || (error as NodeJS.ErrnoException).code !== "ENOENT" || this.read().connections.length) {
                throw secretsError();
            }
        }
        await fs.mkdir(this.dataDir, { recursive: true,
            mode: 0o700 });
        await fs.writeFile(filename, randomBytes(32), { flag: "wx",
            mode: 0o600 });
        return fs.readFile(filename);
    }

    async connection(id: string): Promise<Connection> {
        try {
            const item = this.read().connections.find(item => item.id === id);
            if (!item) {
                throw secretsError();
            }
            const [ iv, tag, payload ] = item.sealed.split(".").map(s => Buffer.from(s, "base64"));
            const decipher = createDecipheriv("aes-256-gcm", await this.key(), iv);
            decipher.setAAD(Buffer.from(item.id));
            decipher.setAuthTag(tag);
            const token = Buffer.concat([ decipher.update(payload), decipher.final() ]).toString("utf8");
            const { sealed, ...config } = item;
            return { ...config,
                token };
        } catch {
            throw secretsError();
        }
    }

    private mutate(update: (state: State) => Promise<void> | void) {
        const task = this.tail.then(async () => {
            const state = this.read();
            await update(state);
            const temporary = this.filename + "." + randomUUID();
            await fs.mkdir(this.dataDir, { recursive: true,
                mode: 0o700 });
            try {
                await fs.writeFile(temporary, JSON.stringify(state), { flag: "wx",
                    mode: 0o600 });
                await fs.rename(temporary, this.filename);
            } finally {
                await fs.rm(temporary, { force: true });
            }
        });
        this.tail = task.catch(() => {});
        return task;
    }

    save(value: Connection) {
        return this.mutate(async state => {
            if (!value || ![ "onepassword", "doppler", "infisical", "bitwarden" ].includes(value.provider)
                || typeof value.name !== "string" || !value.name.trim() || value.name.length > 100) {
                throw secretsError();
            }
            const old = state.connections.find(item => item.id === value.id);
            if (value.id && !old) {
                throw secretsError();
            }
            if (old && old.provider !== value.provider) {
                throw secretsError();
            }
            const id = old?.id ?? randomUUID();
            let url = "";
            if ([ "infisical", "bitwarden" ].includes(value.provider)) {
                const parsed = new URL(value.url);
                if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
                    throw secretsError();
                }
                url = parsed.href.replace(/\/$/, "");
            }
            if (typeof value.clientId !== "string" || value.clientId.length > 200 || typeof value.token !== "string" || value.token.length > 16384) {
                throw secretsError();
            }
            if (old && old.url !== url && !value.token) {
                throw secretsError();
            }
            let sealed = old?.sealed ?? "";
            if (value.token) {
                const iv = randomBytes(12);
                const cipher = createCipheriv("aes-256-gcm", await this.key(true), iv);
                cipher.setAAD(Buffer.from(id));
                const payload = Buffer.concat([ cipher.update(value.token, "utf8"), cipher.final() ]);
                sealed = [ iv, cipher.getAuthTag(), payload ].map(b => b.toString("base64")).join(".");
            }
            if (!sealed || (value.provider === "infisical" && !value.clientId)) {
                throw secretsError();
            }
            state.connections = state.connections.filter(item => item.id !== id);
            state.connections.push({ id,
                name: value.name.trim(),
                provider: value.provider,
                url,
                clientId: value.clientId,
                sealed });
        });
    }

    remove(id: string) {
        return this.mutate(state => {
            if (Object.values(state.bindings).some(binding => binding.connection === id)) {
                throw new Error("stackSecrets.inUse");
            }
            state.connections = state.connections.filter(item => item.id !== id);
        });
    }

    bind(cwd: string, binding: Binding | null) {
        return this.mutate(state => {
            const key = canonicalPath(cwd);
            if (binding === null) {
                delete state.bindings[key];
                return;
            }
            const connection = state.connections.find(item => item.id === binding.connection);
            if (!connection) {
                throw secretsError();
            }
            for (const field of [ "project", "environment", "secretPath" ] as const) {
                if (typeof binding[field] !== "string" || binding[field].length > 500 || /[\x00-\x1f]/.test(binding[field])) {
                    throw secretsError();
                }
            }
            if (connection.provider === "onepassword" && !binding.environment) {
                throw secretsError();
            }
            if (connection.provider === "bitwarden" && !/^[a-f0-9-]{36}$/i.test(binding.project)) {
                throw secretsError();
            }
            if (connection.provider === "infisical" && (!binding.project || !binding.environment || !binding.secretPath.startsWith("/"))) {
                throw secretsError();
            }
            state.bindings[key] = { connection: binding.connection,
                project: binding.project,
                environment: binding.environment,
                secretPath: binding.secretPath };
        });
    }
}
let runtimeStore: SecretsStore | undefined;
export function configureSecrets(dataDir: string) {
    runtimeStore = new SecretsStore(dataDir);
    return runtimeStore;
}
export function getSecretsStore() {
    return runtimeStore;
}
