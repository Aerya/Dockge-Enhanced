import { promises as fs } from "node:fs";
import path from "node:path";
import childProcessAsync from "promisify-child-process";
import { acceptedComposeFileNames } from "../common/util-common";
import { ValidationError } from "./util-server";

export interface ExternalStackRegistration {
    name: string;
    project: string;
    composeFile: string;
    workingDir: string;
    importedAt: string;
}

export interface DiscoveredExternalStack {
    project: string;
    status: string;
    composeFile: string | null;
    workingDir: string | null;
    mounts: string[];
    pathStatus: "accessible" | "not-accessible" | "not-authorized" | "unknown";
    imported: boolean;
}

export interface ExternalAllowedMount {
    source: string;
    destination: string;
}

interface DockerInspect {
    Config?: { Labels?: Record<string, string> };
    Mounts?: Array<{ Type?: string; Source?: string; Name?: string; Destination?: string }>;
    State?: { Status?: string };
}

export function selectAllowedMounts(mounts: DockerInspect["Mounts"], allowedRoots: string[]): ExternalAllowedMount[] {
    const selected = new Map<string, ExternalAllowedMount>();
    for (const mount of mounts ?? []) {
        if (mount.Type !== "bind" || !mount.Source || !mount.Destination) continue;
        const destination = path.resolve(mount.Destination);
        const supportsAllowedRoot = allowedRoots.some((root) => {
            const relative = path.relative(destination, path.resolve(root));
            return relative === "" || (!path.isAbsolute(relative) && !relative.startsWith(`..${path.sep}`) && relative !== "..");
        });
        if (!supportsAllowedRoot) continue;
        selected.set(`${mount.Source}:${destination}`, { source: mount.Source, destination });
    }
    return [ ...selected.values() ].sort((a, b) => a.destination.localeCompare(b.destination));
}

function isSafeStackName(value: string): boolean {
    return /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value);
}

function splitAllowedRoots(value: string | undefined): string[] {
    return (value ?? "").split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean);
}

export class ExternalStackManager {
    private registrations: ExternalStackRegistration[] | null = null;

    constructor(private readonly dataDir: string, private readonly stacksDir: string, private readonly allowedRoots = splitAllowedRoots(process.env.DOCKGE_EXTERNAL_STACKS_ALLOWED_PATHS)) {
    }

    private get file(): string {
        return path.join(this.dataDir, "external-stacks.json");
    }

    async getAllowedRoots(): Promise<string[]> {
        const roots: string[] = [];
        for (const root of this.allowedRoots) {
            try {
                const real = await fs.realpath(root);
                const stat = await fs.stat(real);
                if (stat.isDirectory()) roots.push(real);
            } catch {
                // An unavailable bind mount is deliberately not an allowed path.
            }
        }
        return [ ...new Set(roots) ].sort();
    }

    async getAllowedMounts(): Promise<ExternalAllowedMount[]> {
        const containerId = (process.env.HOSTNAME ?? "").trim();
        if (!containerId) return [];
        try {
            const result = await childProcessAsync.spawn("docker", [ "inspect", containerId ], {
                encoding: "utf8",
                maxBuffer: 2 * 1024 * 1024,
            });
            const inspected = JSON.parse(result.stdout?.toString() ?? "[]") as DockerInspect[];
            return selectAllowedMounts(inspected[0]?.Mounts, await this.getAllowedRoots());
        } catch {
            return [];
        }
    }

    private async load(): Promise<ExternalStackRegistration[]> {
        if (this.registrations) return this.registrations;
        try {
            const parsed = JSON.parse(await fs.readFile(this.file, "utf8")) as unknown;
            this.registrations = Array.isArray(parsed)
                ? parsed.filter((entry): entry is ExternalStackRegistration => Boolean(entry)
                    && typeof entry === "object"
                    && isSafeStackName((entry as ExternalStackRegistration).name)
                    && typeof (entry as ExternalStackRegistration).project === "string"
                    && typeof (entry as ExternalStackRegistration).composeFile === "string"
                    && typeof (entry as ExternalStackRegistration).workingDir === "string"
                    && typeof (entry as ExternalStackRegistration).importedAt === "string")
                : [];
        } catch {
            this.registrations = [];
        }
        return this.registrations;
    }

    private async save(): Promise<void> {
        const content = JSON.stringify(await this.load(), null, 2);
        const temporary = `${this.file}.${process.pid}.${Date.now()}.tmp`;
        await fs.mkdir(this.dataDir, { recursive: true });
        await fs.writeFile(temporary, content, { mode: 0o600 });
        await fs.rename(temporary, this.file);
    }

    private async canonicalComposeFile(composeFile: string): Promise<{ composeFile: string; workingDir: string }> {
        if (!path.isAbsolute(composeFile)) throw new ValidationError("External compose path must be absolute");
        const candidate = await fs.realpath(composeFile);
        const stat = await fs.stat(candidate);
        if (!stat.isFile() || !acceptedComposeFileNames.includes(path.basename(candidate))) {
            throw new ValidationError("External stack must reference a supported Compose file");
        }
        const workingDir = await fs.realpath(path.dirname(candidate));
        const allowedRoots = await this.getAllowedRoots();
        const allowed = allowedRoots.some((root) => candidate === root || candidate.startsWith(`${root}${path.sep}`));
        if (!allowed) throw new ValidationError("External stack path is not in an allowed root");
        return { composeFile: candidate, workingDir };
    }

    async get(name: string): Promise<ExternalStackRegistration | undefined> {
        this.registrations = null;
        return (await this.load()).find((entry) => entry.name === name);
    }

    async list(): Promise<ExternalStackRegistration[]> {
        this.registrations = null;
        return [ ...(await this.load()) ];
    }

    async import(name: string, project: string, composeFile: string): Promise<ExternalStackRegistration> {
        if (!isSafeStackName(name)) throw new ValidationError("Invalid external stack name");
        if (!project || project.length > 128) throw new ValidationError("Invalid Compose project name");
        const canonical = await this.canonicalComposeFile(composeFile);
        const stacksRoot = path.resolve(this.stacksDir);
        if (canonical.workingDir === stacksRoot || canonical.workingDir.startsWith(`${stacksRoot}${path.sep}`)) {
            throw new ValidationError("This stack is already inside DOCKGE_STACKS_DIR");
        }
        this.registrations = null;
        const registrations = await this.load();
        if (registrations.some((entry) => entry.name === name)) throw new ValidationError("External stack name already exists");
        if (registrations.some((entry) => entry.composeFile === canonical.composeFile)) throw new ValidationError("This external Compose file is already imported");
        const registration: ExternalStackRegistration = { name, project, ...canonical, importedAt: new Date().toISOString() };
        registrations.push(registration);
        await this.save();
        return registration;
    }

    async assertRegisteredPath(registration: ExternalStackRegistration): Promise<ExternalStackRegistration> {
        const canonical = await this.canonicalComposeFile(registration.composeFile);
        if (canonical.workingDir !== registration.workingDir) throw new ValidationError("External stack working directory changed");
        return { ...registration, ...canonical };
    }

    async discover(): Promise<DiscoveredExternalStack[]> {
        const options = { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 };
        const result = await childProcessAsync.spawn("docker", [ "ps", "-aq", "--filter", "label=com.docker.compose.project" ], options);
        const ids = (result.stdout?.toString() ?? "").split("\n").map((id) => id.trim()).filter(Boolean);
        if (ids.length === 0) return [];
        const inspected = await childProcessAsync.spawn("docker", [ "inspect", ...ids ], options);
        const containers = JSON.parse(inspected.stdout?.toString() ?? "[]") as DockerInspect[];
        const byProject = new Map<string, { status: string; composeFile: string | null; workingDir: string | null; mounts: Set<string> }>();
        for (const container of containers) {
            const labels = container.Config?.Labels ?? {};
            const project = labels["com.docker.compose.project"];
            if (!project) continue;
            const current = byProject.get(project) ?? { status: container.State?.Status ?? "unknown", composeFile: null, workingDir: null, mounts: new Set<string>() };
            const configFiles = labels["com.docker.compose.project.config_files"];
            if (configFiles) current.composeFile = configFiles.split(",").find((candidate) => path.isAbsolute(candidate)) ?? current.composeFile;
            current.workingDir = labels["com.docker.compose.project.working_dir"] ?? current.workingDir;
            if (container.State?.Status === "running") current.status = "running";
            for (const mount of container.Mounts ?? []) {
                const source = mount.Source ?? mount.Name;
                if (source) current.mounts.add(`${mount.Type ?? "volume"}: ${source}${mount.Destination ? ` → ${mount.Destination}` : ""}`);
            }
            byProject.set(project, current);
        }
        const registrations = await this.load();
        const allowedRoots = await this.getAllowedRoots();
        const output: DiscoveredExternalStack[] = [];
        for (const [ project, item ] of byProject) {
            const imported = registrations.some((entry) => entry.project === project || (item.composeFile !== null && entry.composeFile === item.composeFile));
            let pathStatus: DiscoveredExternalStack["pathStatus"] = "unknown";
            if (item.composeFile) {
                try {
                    const real = await fs.realpath(item.composeFile);
                    pathStatus = allowedRoots.some((root) => real === root || real.startsWith(`${root}${path.sep}`)) ? "accessible" : "not-authorized";
                } catch {
                    pathStatus = "not-accessible";
                }
            }
            output.push({ project, status: item.status, composeFile: item.composeFile, workingDir: item.workingDir, mounts: [ ...item.mounts ].sort(), pathStatus, imported });
        }
        return output.sort((a, b) => a.project.localeCompare(b.project));
    }
}
