import yaml from "yaml";
import crypto from "node:crypto";
import {
    fetchCatalogResource,
    fetchCatalogText,
    safeCatalogLink,
    composeWarnings,
} from "./app-catalog";

export const CATALOG_SOURCES = [
    {
        id: "lissy93",
        name: "Lissy93",
        format: "portainer",
        repo: "Lissy93/portainer-templates",
        file: "main/templates.json",
    },
    {
        id: "portainer",
        name: "Portainer",
        format: "portainer",
        repo: "portainer/templates",
        file: "v3/templates.json",
    },
    {
        id: "pi-amd64",
        name: "Pi-Hosted AMD64",
        format: "portainer",
        repo: "pi-hosted/pi-hosted",
        file: "master/template/portainer-v3-amd64.json",
    },
    {
        id: "pi-arm64",
        name: "Pi-Hosted ARM64",
        format: "portainer",
        repo: "pi-hosted/pi-hosted",
        file: "master/template/portainer-v3-arm64.json",
    },
    {
        id: "linuxserver",
        name: "LinuxServer / Technorabilia",
        format: "portainer",
        repo: "technorabilia/portainer-templates",
        file: "main/lsio/templates/templates.json",
    },
    {
        id: "truenas",
        name: "TrueNAS",
        format: "truenas",
        repo: "truenas/apps",
        file: "master/catalog.json",
    },
    {
        id: "umbrel",
        name: "Umbrel",
        format: "umbrel",
        repo: "getumbrel/umbrel-apps",
        file: "",
    },
    {
        id: "runtipi",
        name: "Runtipi",
        format: "runtipi",
        repo: "runtipi/runtipi-appstore",
        file: "",
    },
    {
        id: "roqueos",
        name: "RoqueOS",
        format: "casaos",
        repo: "roqueribeiro/roqueos-containers-list",
        file: "",
    },
    {
        id: "yundera",
        name: "Yundera",
        format: "casaos",
        repo: "Yundera/AppStore",
        file: "",
    },
] as const;
type Source = (typeof CATALOG_SOURCES)[number];
const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
const localized = (value: unknown): string =>
    typeof value === "string"
        ? value.slice(0, 8000)
        : String(
            record(value).en_us ??
                  record(value).en ??
                  Object.values(record(value))[0] ??
                  "",
        ).slice(0, 8000);
export interface CatalogEntry {
    index: number;
    title: string;
    description: string;
    note: string;
    categories: string[];
    logo: string;
    website: string;
    origin: string;
    supported: boolean;
    native: boolean;
    composeFile: string;
    failed?: boolean;
}
interface SourceIndex {
    source: string;
    revision: string;
    fetchedAt: number;
    items: CatalogEntry[];
    loading: boolean;
    loaded: number;
    failed: number;
}

export function parseSourceMetadata(
    source: Source,
    raw: string,
    file: string,
    index: number,
): CatalogEntry {
    const data = record(
        file.endsWith(".json")
            ? JSON.parse(raw)
            : yaml.parse(raw, { maxAliasCount: 100 }),
    );
    const meta = source.format === "casaos" ? record(data["x-casaos"]) : data;
    const directory = file.slice(0, file.lastIndexOf("/"));
    const categories = Array.isArray(meta.categories)
        ? meta.categories.map(String)
        : [ localized(meta.category) || "Other" ];
    const website =
        meta.website ??
        meta.home ??
        meta.developer_url ??
        meta.project_url ??
        meta.source ??
        meta.repo;
    return {
        index,
        title:
            localized(meta.name || meta.title) || directory.split("/").at(-1)!,
        description: localized(
            meta.description || meta.tagline || meta.short_desc,
        ),
        note: localized(meta.releaseNotes || meta.tips),
        categories,
        logo:
            safeCatalogLink(meta.icon || meta.icon_url) ||
            (source.format === "runtipi"
                ? `https://raw.githubusercontent.com/${source.repo}/HEAD/${directory}/metadata/logo.jpg`
                : source.format === "umbrel"
                    ? `https://getumbrel.github.io/umbrel-apps-gallery/${directory}/icon.svg`
                    : ""),
        website: safeCatalogLink(website),
        origin: `https://github.com/${source.repo}/tree/HEAD/${directory}`,
        supported: true,
        native: true,
        composeFile:
            source.format === "casaos"
                ? file
                : `${directory}/docker-compose.yml`,
    };
}

export class CatalogSources {
    private indexes = new Map<string, SourceIndex>();
    private busy = new Set<string>();
    constructor(
        private fetchRaw = fetchCatalogText,
        private fetchTree = (repo: string) =>
            fetchCatalogResource(
                "api.github.com",
                `/repos/${repo}/git/trees/HEAD?recursive=1`,
            ),
    ) {}

    async browse(id: unknown, refresh = false): Promise<SourceIndex> {
        const source = CATALOG_SOURCES.find(
            (item) => item.id === id && item.format !== "portainer",
        );
        if (!source) {
            throw new Error("appCatalog.invalidSource");
        }
        const cached = this.indexes.get(source.id);
        if (
            cached &&
            (cached.loading ||
                !refresh ||
                Date.now() - cached.fetchedAt < 60000)
        ) {
            return structuredClone(cached);
        }
        if (this.busy.has(source.id) || this.busy.size >= 2) {
            throw new Error("appCatalog.busy");
        }
        this.busy.add(source.id);
        try {
            const result: SourceIndex = {
                source: source.id,
                revision: crypto.randomUUID(),
                fetchedAt: Date.now(),
                items: [],
                loading: false,
                loaded: 0,
                failed: 0,
            };
            if (source.format === "truenas") {
                const data = record(
                    JSON.parse(
                        await this.fetchRaw(
                            `https://raw.githubusercontent.com/${source.repo}/${source.file}`,
                        ),
                    ),
                );
                for (const train of [ "stable", "community", "enterprise" ]) {
                    for (const [ name, value ] of Object.entries(
                        record(data[train]),
                    )) {
                        const meta = record(value);
                        result.items.push({
                            index: result.items.length,
                            title: localized(meta.title || name),
                            description: localized(meta.description),
                            note: "",
                            categories: Array.isArray(meta.categories)
                                ? meta.categories.map(String)
                                : [],
                            logo: safeCatalogLink(meta.icon_url),
                            website: safeCatalogLink(meta.home),
                            origin: `https://github.com/${source.repo}/tree/master/trains/${encodeURIComponent(train)}/${encodeURIComponent(name)}`,
                            supported: false,
                            native: true,
                            composeFile: "",
                        });
                    }
                }
                result.loaded = result.items.length;
                this.indexes.set(source.id, result);
                this.busy.delete(source.id);
                return structuredClone(result);
            }
            const tree = JSON.parse(await this.fetchTree(source.repo));
            if (tree.truncated || !Array.isArray(tree.tree)) {
                throw new Error("appCatalog.tooLarge");
            }
            const pattern =
                source.format === "umbrel"
                    ? /^[\w.-]+\/umbrel-app\.yml$/
                    : source.format === "runtipi"
                        ? /^apps\/[\w.-]+\/config\.json$/
                        : /^Apps\/[\w.-]+\/docker-compose\.yml$/;
            const files: string[] = tree.tree
                .filter(
                    (item: Record<string, unknown>) =>
                        item.type === "blob" &&
                        typeof item.path === "string" &&
                        pattern.test(item.path),
                )
                .map((item: { path: string }) => item.path);
            if (files.length > 1500) {
                throw new Error("appCatalog.tooLarge");
            }
            result.loading = true;
            result.items = files.map((file, index) => ({
                index,
                title: file.split("/").at(-2)!,
                description: "",
                note: "",
                categories: [],
                logo: "",
                website: "",
                origin: `https://github.com/${source.repo}/tree/HEAD/${file.slice(0, file.lastIndexOf("/"))}`,
                supported: false,
                native: true,
                composeFile: "",
            }));
            this.indexes.set(source.id, result);
            // Four bounded metadata workers per source. Browsers poll progress; never run repository code.
            let cursor = 0;
            const worker = async () => {
                while (cursor < files.length) {
                    const index = cursor++;
                    try {
                        if (Date.now() - result.fetchedAt > 10 * 60 * 1000) {
                            throw new Error("timeout");
                        }
                        const raw = await this.fetchRaw(
                            `https://raw.githubusercontent.com/${source.repo}/HEAD/${files[index]}`,
                        );
                        result.items[index] = parseSourceMetadata(
                            source,
                            raw,
                            files[index],
                            index,
                        );
                    } catch {
                        result.items[index].failed = true;
                        result.failed++;
                    }
                    result.loaded++;
                }
            };
            void Promise.all(Array.from({ length: 4 }, worker)).finally(() => {
                result.loading = false;
                this.busy.delete(source.id);
            });
            return structuredClone(result);
        } catch (error) {
            this.busy.delete(source.id);
            throw error;
        }
    }

    async draft(id: unknown, revision: unknown, index: unknown) {
        const source = CATALOG_SOURCES.find((item) => item.id === id);
        const catalog = source && this.indexes.get(source.id);
        const item = Number.isInteger(index)
            ? catalog?.items[index as number]
            : undefined;
        if (
            !source ||
            !catalog ||
            catalog.revision !== revision ||
            !item?.supported ||
            !item.composeFile
        ) {
            throw new Error("appCatalog.refreshRequired");
        }
        const origin = `https://raw.githubusercontent.com/${source.repo}/HEAD/${item.composeFile}`;
        const compose = await this.fetchRaw(origin);
        if (Buffer.byteLength(compose) > 512 * 1024) {
            throw new Error("appCatalog.tooLarge");
        }
        const warnings = [ "appCatalog.native", ...composeWarnings(compose) ];
        // Expose required platform variables for review, never invent paths or credentials.
        const variables = [
            ...new Set(
                [
                    ...compose.matchAll(
                        /(?<!\$)\$(?:\{([A-Za-z_][A-Za-z0-9_]*)(?::?\?[^}]*)?\}|([A-Za-z_][A-Za-z0-9_]*))/g,
                    ),
                ].map((match) => match[1] || match[2]),
            ),
        ];
        const fields = variables.map((name) => ({
            name,
            label: name,
            description: "",
            value: "",
        }));
        return {
            compose,
            origin,
            digest: crypto.createHash("sha256").update(compose).digest("hex"),
            fields,
            warnings,
        };
    }
}
