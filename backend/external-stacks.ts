import { promises as fs } from "node:fs";
import path from "node:path";
import childProcessAsync from "promisify-child-process";
import { ValidationError } from "./util-server";

export interface ExternalStackRegistration {
    name: string;
    project: string;
    composeFile: string;
    configFiles: string[];
    envFiles: string[];
    workingDir: string;
    dataPaths: string[];
    mounts: string[];
    importedAt: string;
}

export interface DiscoveredExternalStack {
    project: string;
    status: string;
    composeFile: string | null;
    configFiles: string[];
    configFilesNeedingAccess: string[];
    envFiles: string[];
    envFilesNeedingAccess: string[];
    workingDir: string | null;
    envFile: string | null;
    envStatus: "present" | "absent" | "unknown";
    mounts: string[];
    dataPaths: string[];
    dataPathsNeedingAccess: string[];
    autoAccessAllowed: boolean;
    pathStatus: "accessible" | "not-accessible" | "not-authorized" | "unknown";
    imported: boolean;
    importedName: string | null;
}

export interface ExternalAllowedMount {
    source: string;
    destination: string;
}

interface DockerInspect {
    Id?: string;
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


function isCoveredByRoot(candidate: string, root: string): boolean {
    const relative = path.relative(path.resolve(root), path.resolve(candidate));
    return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

export function selectManagedStackRoots(mounts: DockerInspect["Mounts"], stacksDir: string): string[] {
    const stacksRoot = path.resolve(stacksDir);
    const roots = new Set<string>([ stacksRoot ]);
    const candidates = (mounts ?? [])
        .filter((mount) => mount.Type === "bind" && mount.Source && mount.Destination && path.isAbsolute(mount.Source))
        .map((mount) => {
            const destination = path.resolve(mount.Destination!);
            const relative = path.relative(destination, stacksRoot);
            const coversStacksDir = relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
            return coversStacksDir ? { source: path.resolve(mount.Source!), destination, relative } : null;
        })
        .filter((entry): entry is { source: string; destination: string; relative: string } => entry !== null);

    // Docker resolves overlapping mounts using the most specific destination.
    // Mirror that rule so a broad parent bind cannot hide the actual stacks bind.
    const mostSpecificLength = candidates.reduce((max, entry) => Math.max(max, entry.destination.length), -1);
    for (const entry of candidates) {
        if (entry.destination.length !== mostSpecificLength) continue;
        roots.add(path.resolve(entry.source, entry.relative));
    }

    return [ ...roots ].sort();
}

function normalizeComposeProjectName(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "")
        .replace(/^[^a-z0-9]+/, "");
}

function collectComposePathAliases(containers: DockerInspect[]): ExternalAllowedMount[] {
    const aliases = new Map<string, ExternalAllowedMount>();
    for (const container of containers) {
        for (const mount of container.Mounts ?? []) {
            if (mount.Type !== "bind" || !mount.Source || !mount.Destination) continue;
            if (!path.isAbsolute(mount.Source) || !path.isAbsolute(mount.Destination)) continue;
            const source = path.resolve(mount.Source);
            const destination = path.resolve(mount.Destination);
            aliases.set(`${source}:${destination}`, { source, destination });
        }
    }
    return [ ...aliases.values() ].sort((a, b) =>
        b.destination.length - a.destination.length || a.destination.localeCompare(b.destination)
    );
}

export function isManagedComposeProject(
    workingDir: string | null,
    configFiles: string[],
    managedRoots: string[],
    pathAliases: ExternalAllowedMount[] = [],
    project = ""
): boolean {
    const candidates = [ workingDir, ...configFiles ]
        .filter((candidate): candidate is string => typeof candidate === "string" && path.isAbsolute(candidate))
        .map((candidate) => path.resolve(candidate));

    if (candidates.some((candidate) => managedRoots.some((root) => isCoveredByRoot(candidate, root)))) {
        return true;
    }

    const normalizedProject = normalizeComposeProjectName(project);
    if (!normalizedProject || pathAliases.length === 0) return false;

    // A companion may operate the same Enhanced-managed stack from another
    // container-side Compose path. Gluetun-Companion is a concrete example:
    // the managed stack directory is bind-mounted as /compose and Compose can
    // recreate the project from there.
    // https://github.com/Aerya/Gluetun-Companion
    for (const candidate of candidates) {
        for (const alias of pathAliases) {
            if (!isCoveredByRoot(candidate, alias.destination)) continue;

            const relativeToAlias = path.relative(alias.destination, candidate);
            const hostCandidate = path.resolve(alias.source, relativeToAlias);

            for (const root of managedRoots) {
                if (!isCoveredByRoot(hostCandidate, root)) continue;

                const relativeToManagedRoot = path.relative(path.resolve(root), hostCandidate);
                if (
                    !relativeToManagedRoot ||
                    relativeToManagedRoot === ".." ||
                    path.isAbsolute(relativeToManagedRoot)
                ) continue;

                const stackDirectory = relativeToManagedRoot.split(path.sep)[0];
                if (
                    stackDirectory &&
                    normalizeComposeProjectName(stackDirectory) === normalizedProject
                ) {
                    return true;
                }
            }
        }
    }

    return false;
}

function isSafeStackName(value: string): boolean {
    return /^[a-z0-9][a-z0-9_-]*$/.test(value);
}

function splitAllowedRoots(value: string | undefined): string[] {
    return (value ?? "").split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean);
}

const AUTO_ACCESS_DENIED_PREFIXES = [ "/dev", "/proc", "/sys", "/run", "/etc" ];
const AUTO_ACCESS_DENIED_EXACT = new Set([
    "/", "/bin", "/boot", "/dev", "/etc", "/home", "/lib", "/lib64", "/mnt",
    "/opt", "/proc", "/root", "/run", "/sbin", "/srv", "/sys", "/tmp", "/usr", "/var",
]);

export function isSafeExternalDataPath(value: string): boolean {
    if (!value || /[\0\r\n,]/.test(value) || !path.isAbsolute(value)) return false;
    const resolved = path.resolve(value);
    if (resolved !== value || AUTO_ACCESS_DENIED_EXACT.has(resolved)) return false;
    if (AUTO_ACCESS_DENIED_PREFIXES.some((prefix) => resolved === prefix || resolved.startsWith(`${prefix}${path.sep}`))) return false;
    if (resolved === "/var/run/docker.sock" || resolved.endsWith("/docker.sock")) return false;
    return true;
}

function collapsePaths(paths: string[]): string[] {
    const sorted = [ ...new Set(paths.map((entry) => path.resolve(entry))) ].sort((a, b) => a.length - b.length || a.localeCompare(b));
    const output: string[] = [];
    for (const candidate of sorted) {
        if (output.some((root) => candidate === root || candidate.startsWith(`${root}${path.sep}`))) continue;
        output.push(candidate);
    }
    return output;
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

    async getIdentityBindRoots(): Promise<string[]> {
        const containerId = (process.env.HOSTNAME ?? "").trim();
        if (!containerId) return [];
        try {
            const result = await childProcessAsync.spawn("docker", [ "inspect", containerId ], {
                encoding: "utf8",
                maxBuffer: 2 * 1024 * 1024,
            });
            const inspected = JSON.parse(result.stdout?.toString() ?? "[]") as DockerInspect[];
            return [ ...new Set((inspected[0]?.Mounts ?? [])
                .filter((mount) => mount.Type === "bind" && mount.Source && mount.Destination && path.resolve(mount.Source) === path.resolve(mount.Destination))
                .map((mount) => path.resolve(mount.Destination!))) ].sort();
        } catch {
            return [];
        }
    }


    async getManagedStackRoots(): Promise<string[]> {
        const fallback = [ path.resolve(this.stacksDir) ];
        const containerId = (process.env.HOSTNAME ?? "").trim();
        if (!containerId) return fallback;
        try {
            const result = await childProcessAsync.spawn("docker", [ "inspect", containerId ], {
                encoding: "utf8",
                maxBuffer: 2 * 1024 * 1024,
            });
            const inspected = JSON.parse(result.stdout?.toString() ?? "[]") as DockerInspect[];
            return selectManagedStackRoots(inspected[0]?.Mounts, this.stacksDir);
        } catch {
            return fallback;
        }
    }

    private async load(): Promise<ExternalStackRegistration[]> {
        if (this.registrations) return this.registrations;
        try {
            const parsed = JSON.parse(await fs.readFile(this.file, "utf8")) as unknown;
            this.registrations = Array.isArray(parsed)
                ? parsed.filter((entry) => Boolean(entry)
                    && typeof entry === "object"
                    && isSafeStackName((entry as ExternalStackRegistration).name)
                    && typeof (entry as ExternalStackRegistration).project === "string"
                    && typeof (entry as ExternalStackRegistration).composeFile === "string"
                    && typeof (entry as ExternalStackRegistration).workingDir === "string"
                    && typeof (entry as ExternalStackRegistration).importedAt === "string")
                    .map((entry) => {
                        const value = entry as ExternalStackRegistration;
                        return {
                            ...value,
                            configFiles: Array.isArray(value.configFiles) ? value.configFiles.filter((file) => typeof file === "string") : [ value.composeFile ],
                            envFiles: Array.isArray(value.envFiles) ? value.envFiles.filter((file) => typeof file === "string" && path.isAbsolute(file)) : [],
                            dataPaths: Array.isArray(value.dataPaths) ? value.dataPaths.filter((item) => typeof item === "string" && isSafeExternalDataPath(item)) : [],
                            mounts: Array.isArray(value.mounts) ? value.mounts.filter((item) => typeof item === "string") : [],
                        };
                    })
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

    private async canonicalComposeFile(composeFile: string, workingDirInput?: string): Promise<{ composeFile: string; workingDir: string }> {
        if (!path.isAbsolute(composeFile)) throw new ValidationError("External compose path must be absolute");
        const candidate = await fs.realpath(composeFile);
        const stat = await fs.stat(candidate);
        if (!stat.isFile() || !/\.ya?ml$/i.test(candidate)) {
            throw new ValidationError("External stack must reference a YAML Compose file");
        }
        const workingDirCandidate = workingDirInput ?? path.dirname(candidate);
        if (!path.isAbsolute(workingDirCandidate)) throw new ValidationError("External Compose working directory must be absolute");
        const workingDir = await fs.realpath(workingDirCandidate);
        const workingStat = await fs.stat(workingDir);
        if (!workingStat.isDirectory()) throw new ValidationError("External Compose working directory is not a directory");
        const allowedRoots = await this.getAllowedRoots();
        const workingDirAllowed = allowedRoots.some((root) => workingDir === root || workingDir.startsWith(`${root}${path.sep}`));
        const composeAllowed = allowedRoots.some((root) => candidate === root || candidate.startsWith(`${root}${path.sep}`));
        if (!workingDirAllowed) throw new ValidationError("External stack working directory is not in an allowed root");
        if (!composeAllowed) throw new ValidationError("External Compose file is not in an allowed root");
        return { composeFile: candidate, workingDir };
    }

    private async canonicalConfigFiles(configFiles: string[], _workingDir: string, composeFile: string): Promise<string[]> {
        const candidates = configFiles.length > 0 ? configFiles : [ composeFile ];
        const verified: string[] = [];
        const allowedRoots = await this.getAllowedRoots();
        for (const candidate of candidates.slice(0, 16)) {
            if (!path.isAbsolute(candidate)) throw new ValidationError("External Compose config paths must be absolute");
            const real = await fs.realpath(candidate);
            const stat = await fs.stat(real);
            if (!stat.isFile() || !/\.ya?ml$/i.test(real)) throw new ValidationError("External Compose config must be a YAML file");
            const allowed = allowedRoots.some((root) => real === root || real.startsWith(`${root}${path.sep}`));
            if (!allowed) throw new ValidationError("External Compose config is not in an allowed root");
            verified.push(real);
        }
        return [ composeFile, ...[ ...new Set(verified) ].filter((file) => file !== composeFile) ];
    }

    private async canonicalEnvFiles(envFiles: string[]): Promise<string[]> {
        const verified: string[] = [];
        const allowedRoots = await this.getAllowedRoots();
        for (const candidate of envFiles.slice(0, 8)) {
            if (!path.isAbsolute(candidate)) throw new ValidationError("External Compose env-file paths must be absolute");
            const real = await fs.realpath(candidate);
            const stat = await fs.stat(real);
            if (!stat.isFile()) throw new ValidationError("External Compose env-file is not a regular file");
            const allowed = allowedRoots.some((root) => real === root || real.startsWith(`${root}${path.sep}`));
            if (!allowed) throw new ValidationError("External Compose env-file is not in an allowed root");
            verified.push(real);
        }
        return [ ...new Set(verified) ];
    }

    async get(name: string): Promise<ExternalStackRegistration | undefined> {
        this.registrations = null;
        return (await this.load()).find((entry) => entry.name === name);
    }

    async list(): Promise<ExternalStackRegistration[]> {
        this.registrations = null;
        return [ ...(await this.load()) ];
    }

    async getByProject(project: string): Promise<ExternalStackRegistration | undefined> {
        if (!project) return undefined;
        this.registrations = null;
        return (await this.load()).find((entry) => entry.project === project);
    }

    async unregister(name: string): Promise<boolean> {
        if (!isSafeStackName(name)) throw new ValidationError("Invalid external stack name");
        this.registrations = null;
        const registrations = await this.load();
        const index = registrations.findIndex((entry) => entry.name === name);
        if (index < 0) return false;
        registrations.splice(index, 1);
        await this.save();
        return true;
    }

    async assertDeletableSourcePath(registration: ExternalStackRegistration, confirmedPath: string): Promise<ExternalStackRegistration> {
        const verified = await this.assertRegisteredPath(registration);
        const resolvedConfirmed = path.resolve(confirmedPath);
        if (resolvedConfirmed !== verified.workingDir) {
            throw new ValidationError("External stack source confirmation does not match the registered path");
        }
        const protectedRoots = new Set([
            "/", "/bin", "/boot", "/dev", "/etc", "/home", "/lib", "/lib64", "/mnt",
            "/opt", "/proc", "/root", "/run", "/sbin", "/srv", "/sys", "/tmp", "/usr", "/var",
            path.resolve(this.dataDir), path.resolve(this.stacksDir),
        ]);
        if (protectedRoots.has(verified.workingDir)) {
            throw new ValidationError("Refusing to delete a protected host directory");
        }
        const sourceContains = (candidate: string) => {
            const relative = path.relative(verified.workingDir, candidate);
            return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
        };
        if (verified.configFiles.some((file) => !sourceContains(file))) {
            throw new ValidationError("Refusing destructive deletion because this Compose project uses config files outside its source directory");
        }
        const composeStat = await fs.stat(verified.composeFile);
        if (!composeStat.isFile()) throw new ValidationError("Registered Compose file is no longer a regular file");
        return verified;
    }

    async import(name: string, project: string, composeFile: string): Promise<ExternalStackRegistration> {
        if (!isSafeStackName(name)) throw new ValidationError("Invalid external stack name");
        if (!project || project.length > 128) throw new ValidationError("Invalid Compose project name");
        const discovered = (await this.discover()).find((entry) => entry.project === project);
        if (!discovered?.composeFile) throw new ValidationError("External Compose project must still be discoverable before adoption");
        const canonical = await this.canonicalComposeFile(composeFile, discovered.workingDir ?? undefined);
        const discoveredCompose = await fs.realpath(discovered.composeFile);
        if (discoveredCompose !== canonical.composeFile) throw new ValidationError("External Compose file does not match the discovered project");
        const configFiles = await this.canonicalConfigFiles(discovered.configFiles, canonical.workingDir, canonical.composeFile);
        const envFiles = await this.canonicalEnvFiles(discovered.envFiles ?? []);
        const dataPaths = collapsePaths((discovered.dataPaths ?? []).filter(isSafeExternalDataPath));
        const mounts = [ ...(discovered.mounts ?? []) ];
        const stacksRoot = path.resolve(this.stacksDir);
        if (canonical.workingDir === stacksRoot || canonical.workingDir.startsWith(`${stacksRoot}${path.sep}`)) {
            throw new ValidationError("This stack is already inside DOCKGE_STACKS_DIR");
        }
        this.registrations = null;
        const registrations = await this.load();
        if (registrations.some((entry) => entry.name === name)) throw new ValidationError("External stack name already exists");
        if (registrations.some((entry) => entry.project === project)) throw new ValidationError("This external Compose project is already imported");
        if (registrations.some((entry) => entry.composeFile === canonical.composeFile)) throw new ValidationError("This external Compose file is already imported");
        try {
            if ((await fs.stat(path.join(this.stacksDir, name))).isDirectory()) throw new ValidationError("A managed stack already uses this name");
        } catch (error) {
            if (error instanceof ValidationError) throw error;
        }
        const registration: ExternalStackRegistration = { name, project, ...canonical, configFiles, envFiles, dataPaths, mounts, importedAt: new Date().toISOString() };
        registrations.push(registration);
        await this.save();
        return registration;
    }

    async assertRegisteredPath(registration: ExternalStackRegistration): Promise<ExternalStackRegistration> {
        const canonical = await this.canonicalComposeFile(registration.composeFile, registration.workingDir);
        if (canonical.workingDir !== registration.workingDir) throw new ValidationError("External stack working directory changed");
        const configFiles = await this.canonicalConfigFiles(registration.configFiles ?? [ registration.composeFile ], canonical.workingDir, canonical.composeFile);
        const envFiles = await this.canonicalEnvFiles(registration.envFiles ?? []);
        return { ...registration, ...canonical, configFiles, envFiles };
    }

    async discover(): Promise<DiscoveredExternalStack[]> {
        const options = { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 };
        const result = await childProcessAsync.spawn("docker", [ "ps", "-aq", "--filter", "label=com.docker.compose.project" ], options);
        const ids = (result.stdout?.toString() ?? "").split("\n").map((id) => id.trim()).filter(Boolean);
        if (ids.length === 0) return [];
        const inspected = await childProcessAsync.spawn("docker", [ "inspect", ...ids ], options);
        const containers = JSON.parse(inspected.stdout?.toString() ?? "[]") as DockerInspect[];
        const currentContainerId = (process.env.HOSTNAME ?? "").trim();
        let currentProject = "";
        for (const container of containers) {
            if (currentContainerId && container.Id?.startsWith(currentContainerId)) {
                currentProject = container.Config?.Labels?.["com.docker.compose.project"] ?? "";
                break;
            }
        }
        const byProject = new Map<string, { status: string; composeFile: string | null; configFiles: string[]; envFiles: string[]; workingDir: string | null; mounts: Set<string>; dataPaths: Set<string> }>();
        for (const container of containers) {
            const labels = container.Config?.Labels ?? {};
            const project = labels["com.docker.compose.project"];
            if (!project) continue;
            const current = byProject.get(project) ?? { status: container.State?.Status ?? "unknown", composeFile: null, configFiles: [], envFiles: [], workingDir: null, mounts: new Set<string>(), dataPaths: new Set<string>() };
            const configFiles = labels["com.docker.compose.project.config_files"];
            if (configFiles) {
                const files = configFiles.split(",").map((candidate) => candidate.trim()).filter((candidate) => path.isAbsolute(candidate));
                current.configFiles = [ ...new Set([ ...current.configFiles, ...files ]) ];
                current.composeFile = current.configFiles[0] ?? current.composeFile;
            }
            const environmentFiles = labels["com.docker.compose.project.environment_file"];
            if (environmentFiles) {
                const files = environmentFiles.split(",").map((candidate) => candidate.trim()).filter((candidate) => path.isAbsolute(candidate));
                current.envFiles = [ ...new Set([ ...current.envFiles, ...files ]) ];
            }
            current.workingDir = labels["com.docker.compose.project.working_dir"] ?? current.workingDir;
            if (container.State?.Status === "running") current.status = "running";
            for (const mount of container.Mounts ?? []) {
                const source = mount.Source ?? mount.Name;
                if (source) current.mounts.add(`${mount.Type ?? "volume"}: ${source}${mount.Destination ? ` → ${mount.Destination}` : ""}`);
                if ((mount.Type === "bind" || mount.Type === "volume") && mount.Source && isSafeExternalDataPath(path.resolve(mount.Source))) {
                    current.dataPaths.add(path.resolve(mount.Source));
                }
            }
            byProject.set(project, current);
        }
        const registrations = await this.load();
        const allowedRoots = await this.getAllowedRoots();
        const identityBindRoots = await this.getIdentityBindRoots();
        const managedStackRoots = await this.getManagedStackRoots();
        const composePathAliases = collectComposePathAliases(containers);
        const output: DiscoveredExternalStack[] = [];
        for (const [ project, item ] of byProject) {
            if (project === currentProject) continue;
            if (isManagedComposeProject(
                item.workingDir,
                item.configFiles,
                managedStackRoots,
                composePathAliases,
                project
            )) continue;
            const importedRegistration = registrations.find((entry) => entry.project === project || (item.composeFile !== null && entry.composeFile === item.composeFile));
            const imported = Boolean(importedRegistration);
            let pathStatus: DiscoveredExternalStack["pathStatus"] = "unknown";
            let envStatus: DiscoveredExternalStack["envStatus"] = "unknown";
            const defaultEnvFile = item.workingDir && path.isAbsolute(item.workingDir) ? path.join(item.workingDir, ".env") : null;
            const envFile = item.envFiles[0] ?? defaultEnvFile;
            if (item.composeFile) {
                try {
                    const real = await fs.realpath(item.composeFile);
                    pathStatus = allowedRoots.some((root) => real === root || real.startsWith(`${root}${path.sep}`)) ? "accessible" : "not-authorized";
                } catch {
                    pathStatus = "not-accessible";
                }
            }
            if (envFile) {
                try {
                    envStatus = (await fs.stat(envFile)).isFile() ? "present" : "absent";
                } catch {
                    // An explicit --env-file outside the current mounts is not "absent":
                    // Docker reported it, Enhanced simply cannot read it yet.
                    envStatus = item.envFiles.length > 0 ? "unknown" : "absent";
                }
            }
            const workingDirResolved = item.workingDir && path.isAbsolute(item.workingDir) ? path.resolve(item.workingDir) : null;
            const coveredBy = (candidate: string, roots: string[]) => roots.some((root) => candidate === root || candidate.startsWith(`${root}${path.sep}`));
            const dataPaths = collapsePaths([ ...item.dataPaths ].filter((candidate) => !workingDirResolved || !(candidate === workingDirResolved || candidate.startsWith(`${workingDirResolved}${path.sep}`))));
            const dataPathsNeedingAccess = dataPaths.filter((candidate) => !coveredBy(candidate, identityBindRoots));
            const configFilesNeedingAccess = item.configFiles.filter((candidate) => !coveredBy(candidate, identityBindRoots) || !coveredBy(candidate, allowedRoots));
            const envFilesNeedingAccess = item.envFiles.filter((candidate) => !coveredBy(candidate, identityBindRoots) || !coveredBy(candidate, allowedRoots));
            const configAccessRoots = collapsePaths(configFilesNeedingAccess.map((candidate) => path.dirname(candidate)));
            const envAccessRoots = collapsePaths(envFilesNeedingAccess.map((candidate) => path.dirname(candidate)));
            const autoAccessAllowed = Boolean(workingDirResolved
                && isSafeExternalDataPath(workingDirResolved)
                && configAccessRoots.every(isSafeExternalDataPath)
                && dataPaths.every(isSafeExternalDataPath)
                && envAccessRoots.every(isSafeExternalDataPath));
            output.push({
                project,
                status: item.status,
                composeFile: item.composeFile,
                configFiles: item.configFiles,
                configFilesNeedingAccess,
                envFiles: item.envFiles,
                envFilesNeedingAccess,
                workingDir: item.workingDir,
                envFile,
                envStatus,
                mounts: [ ...item.mounts ].sort(),
                dataPaths,
                dataPathsNeedingAccess,
                autoAccessAllowed,
                pathStatus,
                imported,
                importedName: importedRegistration?.name ?? null,
            });
        }
        return output.sort((a, b) => a.project.localeCompare(b.project));
    }
}
