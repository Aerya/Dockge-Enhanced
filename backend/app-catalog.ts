import https from "node:https";
import crypto from "node:crypto";
import yaml from "yaml";

export const DEFAULT_CATALOG = "https://raw.githubusercontent.com/Lissy93/portainer-templates/main/templates.json";
const MAX_BYTES = 5 * 1024 * 1024;
type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown, max = 4000) => typeof value === "string" ? value.slice(0, max) : "";

/** Beta sources are public GitHub raw files, never arbitrary server-side URLs. */
export function catalogURL(input: unknown): URL {
    if (typeof input !== "string" || input.length > 2048) {
        throw new Error("appCatalog.invalidSource");
    }
    const url = new URL(input);
    if (url.origin !== "https://raw.githubusercontent.com" || url.username || url.password || url.search || url.hash || !/^\/[\w.-]+\/[\w.-]+\/[^/]+\/.+/.test(url.pathname) || /%(?:2f|5c|00)/i.test(url.pathname)) {
        throw new Error("appCatalog.invalidSource");
    }
    return url;
}

export function fetchCatalogText(input: unknown): Promise<string> {
    const url = catalogURL(input);
    return fetchCatalogResource("raw.githubusercontent.com", url.pathname);
}

/** Only trusted adapters may select the GitHub API; callers cannot supply hosts. */
export function fetchCatalogResource(hostname: "raw.githubusercontent.com" | "api.github.com", resource: string): Promise<string> {
    return new Promise((resolve, reject) => {
        // Fixed origin, no redirect following, no proxy or credentials from templates.
        const request = https.get({ hostname,
            path: resource,
            port: 443,
            headers: { "User-Agent": "Dockge-Enhanced-catalog" } }, response => {
            if (response.statusCode !== 200) {
                response.resume();
                reject(new Error("appCatalog.fetchFailed"));
                return;
            }
            const chunks: Buffer[] = [];
            let size = 0;
            response.on("data", (chunk: Buffer) => {
                size += chunk.length;
                if (size > MAX_BYTES) {
                    request.destroy(new Error("appCatalog.tooLarge"));
                } else {
                    chunks.push(chunk);
                }
            });
            response.on("error", reject);
            response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        });
        const timer = setTimeout(() => request.destroy(new Error("appCatalog.fetchFailed")), 15000);
        request.on("error", () => reject(new Error("appCatalog.fetchFailed")));
        request.on("close", () => clearTimeout(timer));
    });
}

export function parseCatalog(raw: string) {
    if (Buffer.byteLength(raw) > MAX_BYTES) {
        throw new Error("appCatalog.tooLarge");
    }
    const data = object(JSON.parse(raw));
    if (!Array.isArray(data.templates) || data.templates.length > 3000) {
        throw new Error("appCatalog.invalidSource");
    }
    return data.templates.map((value, index) => {
        const item = object(value);
        return { index,
            title: text(item.title, 160),
            description: text(item.description),
            logo: safeCatalogLink(item.logo),
            origin: safeCatalogLink(object(item.repository).url) || safeCatalogLink(item.maintainer),
            website: safeCatalogLink(item.website || item.webpage || item.officialDoc) || safeCatalogLink(text(item.description).match(/https:\/\/[^\s<>]+/)?.[0]),
            note: text(item.note, 8000),
            categories: Array.isArray(item.categories) ? item.categories.filter(v => typeof v === "string").slice(0, 10) : [],
            supported: [ 1, 3 ].includes(Number(item.type)) && (!item.platform || item.platform === "linux"),
            type: Number(item.type) };
    });
}

export function safeCatalogLink(value: unknown): string {
    try {
        const url = new URL(String(value));
        if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".") || /(^[\d.]+$|:|\.(local|localhost|internal)$)/i.test(url.hostname)) {
            return "";
        }
        return url.href;
    } catch {
        return "";
    }
}

export function stackfileURL(repository: unknown): string {
    const repo = object(repository);
    const url = new URL(text(repo.url));
    const parts = url.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
    const file = text(repo.stackfile);
    const ref = text(repo.reference) || "HEAD";
    if (url.origin !== "https://github.com" || url.username || url.password || url.search || url.hash || parts.length !== 2 || !parts.every(v => /^[\w.-]+$/.test(v)) || !file || file.startsWith("/") || file.split("/").some(v => !v || v === "." || v === "..") || !/^[\w./-]+$/.test(file) || !/^[\w.-]+$/.test(ref)) {
        throw new Error("appCatalog.unsupported");
    }
    return catalogURL(`https://raw.githubusercontent.com/${parts.join("/")}/${ref}/${file}`).href;
}

/** Convert supported container fields explicitly; never silently discard execution options. */
export function containerCompose(item: RecordValue): string {
    const allowed = new Set([ "id", "type", "title", "name", "description", "categories", "platform", "logo", "maintainer", "note", "image", "env", "ports", "volumes", "restart_policy", "command", "hostname", "network", "privileged", "interactive", "labels" ]);
    [ "website", "webpage", "officialDoc" ].forEach(key => allowed.add(key));
    if (Object.keys(item).some(key => !allowed.has(key)) || !text(item.image)) {
        throw new Error("appCatalog.unsupported");
    }
    const service: RecordValue = { image: item.image };
    for (const [ source, target ] of [[ "command", "command" ], [ "hostname", "hostname" ], [ "restart_policy", "restart" ], [ "privileged", "privileged" ], [ "labels", "labels" ]]) {
        if (item[source] !== undefined) {
            service[target] = item[source];
        }
    }
    if (item.interactive) {
        service.stdin_open = true;
        service.tty = true;
    }
    if (Array.isArray(item.labels)) {
        service.labels = Object.fromEntries(item.labels.map(value => {
            const label = object(value);
            if (typeof label.name !== "string" || typeof label.value !== "string") {
                throw new Error("appCatalog.unsupported");
            }
            return [ label.name, label.value ];
        }));
    }
    if (item.network) {
        if (![ "host", "bridge", "none" ].includes(String(item.network))) {
            throw new Error("appCatalog.unsupported");
        }
        service.network_mode = item.network;
    }
    if (Array.isArray(item.ports)) {
        service.ports = item.ports.map(port => {
            if (typeof port !== "string" || !/^[\d.:[\]-]+(?:\/(?:tcp|udp|sctp))?$/.test(port)) {
                throw new Error("appCatalog.unsupported");
            }
            return port;
        });
    }
    const volumes: RecordValue = {};
    if (Array.isArray(item.volumes)) {
        service.volumes = item.volumes.map((value, i) => {
            const entry = object(value);
            if (typeof entry.container !== "string" || !entry.container.startsWith("/") || Object.keys(entry).some(key => ![ "container", "bind", "readonly" ].includes(key))) {
                throw new Error("appCatalog.unsupported");
            }
            const source = text(entry.bind) || `data${i}`;
            const bind = source.startsWith("/") || source.startsWith(".") || source.startsWith("~");
            if (!bind) {
                volumes[source] = {};
            }
            return { type: bind ? "bind" : "volume",
                source,
                target: entry.container,
                read_only: entry.readonly === true };
        });
    }
    service.environment = Object.fromEntries(environmentFields(item).map(entry => [ entry.name, `\${${entry.name}}` ]));
    return yaml.stringify({ services: { app: service },
        ...(Object.keys(volumes).length ? { volumes } : {}) });
}

export function environmentFields(item: RecordValue) {
    return (Array.isArray(item.env) ? item.env : []).slice(0, 200).map(value => {
        const entry = object(value);
        const name = text(entry.name, 100);
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
            throw new Error("appCatalog.unsupported");
        }
        const selection = Array.isArray(entry.select) ? entry.select.map(object).find(option => option.default === true)?.value : undefined;
        return { name,
            label: text(entry.label, 200) || name,
            description: text(entry.description),
            value: text(entry.default ?? selection, 4000) };
    });
}

export function composeWarnings(compose: string): string[] {
    const data = object(yaml.parse(compose, { maxAliasCount: 100 }));
    if (!Object.keys(object(data.services)).length) {
        throw new Error("appCatalog.unsupported");
    }
    const warnings = new Set<string>();
    for (const raw of Object.values(object(data.services))) {
        const service = object(raw);
        if (service.privileged || service.cap_add || service.devices || service.pid === "host" || service.network_mode === "host") {
            warnings.add("appCatalog.hostAccess");
        }
        if (service.volumes) {
            warnings.add("appCatalog.mounts");
        }
        if (service.build || service.env_file || service.extends || service.configs || service.secrets || data.include) {
            warnings.add("appCatalog.extraFiles");
        }
    }
    if (data.configs || data.secrets || data.include) {
        warnings.add("appCatalog.extraFiles");
    }
    return [ ...warnings ];
}

export class ApplicationCatalog {
    private cache = new Map<string, { raw: string;
        fetchedAt: number }>();

    private pending = new Set<string>();
    constructor(private fetchText = fetchCatalogText) {}

    async list(source: unknown, refresh = false) {
        const url = catalogURL(source).href;
        let cached = this.cache.get(url);
        if (!cached || refresh && Date.now() - cached.fetchedAt > 60000 || Date.now() - cached.fetchedAt > 3600000) {
            if (this.pending.size >= 3 || this.pending.has(url)) {
                throw new Error("appCatalog.busy");
            }
            this.pending.add(url);
            try {
                const raw = await this.fetchText(url);
                parseCatalog(raw);
                cached = { raw,
                    fetchedAt: Date.now() };
                if (this.cache.size >= 5) {
                    this.cache.delete(this.cache.keys().next().value!);
                }
                this.cache.set(url, cached);
            } finally {
                this.pending.delete(url);
            }
        }
        return { source: url,
            fetchedAt: cached.fetchedAt,
            revision: crypto.createHash("sha256").update(cached.raw).digest("hex"),
            items: parseCatalog(cached.raw) };
    }

    async draft(source: unknown, revision: unknown, index: unknown) {
        const url = catalogURL(source).href;
        const cached = this.cache.get(url);
        if (!cached || revision !== crypto.createHash("sha256").update(cached.raw).digest("hex") || !Number.isInteger(index)) {
            throw new Error("appCatalog.refreshRequired");
        }
        const item = object(JSON.parse(cached.raw).templates[index as number]);
        if (![ 1, 3 ].includes(Number(item.type)) || item.platform && item.platform !== "linux") {
            throw new Error("appCatalog.unsupported");
        }
        const origin = Number(item.type) === 3 ? stackfileURL(item.repository) : url;
        const compose = Number(item.type) === 3 ? await this.fetchText(origin) : containerCompose(item);
        if (Buffer.byteLength(compose) > 512 * 1024) {
            throw new Error("appCatalog.tooLarge");
        }
        return { compose,
            origin,
            digest: crypto.createHash("sha256").update(compose).digest("hex"),
            fields: environmentFields(item),
            warnings: composeWarnings(compose) };
    }
}
