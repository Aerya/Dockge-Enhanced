import fs, { promises as fsAsync } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import yaml from "yaml";
import { DockgeServer } from "../dockge-server";
import { Stack } from "../stack";
import { DockgeSocket, fileExists, ValidationError } from "../util-server";
import { Settings } from "../settings";

const execFileAsync = promisify(execFile);
const PATH_RULES_SETTING = "stackTransferPathRules";
const JOBS_SETTING = "stackTransferJobs";
const HELPER_IMAGE = process.env.DOCKGE_VOLUME_HELPER_IMAGE || "busybox:stable";

export type TransferMountType = "bind" | "volume" | "tmpfs" | "unknown";
export type MappingConfidence = "high" | "medium" | "manual";

export interface StackTransferMount {
    id: string;
    service: string;
    type: TransferMountType;
    source: string;
    resolvedSource?: string;
    target: string;
    readOnly: boolean;
    external: boolean;
    size: number | null;
    targetSource: string;
    confidence: MappingConfidence;
    reason: string;
    transferData?: boolean;
}

export interface StackTransferInventory {
    stackName: string;
    composeYAML: string;
    composeENV: string;
    composeOverrideYAML: string;
    mounts: StackTransferMount[];
    runningServices: string[];
    warnings: string[];
}

export interface StackTransferPathRule {
    sourcePrefix: string;
    targetPrefix: string;
}

export interface StackTransferIssue {
    severity: "error" | "warning" | "success";
    scope: "save" | "deploy";
    code: string;
    message: string;
    params?: Record<string, string>;
}

export interface StackTransferRequest {
    operation: "copy" | "move";
    sourceEndpoint: string;
    sourceStackName: string;
    targetName: string;
    composeYAML: string;
    composeENV: string;
    composeOverrideYAML: string;
    mappings: StackTransferMount[];
    deploy: boolean;
    dataTransfer?: boolean;
    overwriteExisting?: boolean;
    transferId?: string;
}

export interface StackTransferJobLog {
    at: string;
    phase: string;
    message: string;
}

export interface StackTransferJob {
    id: string;
    operation: "copy" | "move";
    sourceEndpoint: string;
    sourceStackName: string;
    targetName: string;
    status: "queued" | "running" | "interrupted" | "target-ready" | "succeeded" | "failed" | "rolled-back";
    phase: string;
    progress: number;
    logs: StackTransferJobLog[];
    request?: StackTransferRequest;
    rollbackDir?: string;
    rollbackData?: {
        transferId: string;
        repositoryId: string;
        snapshotId: string;
        archivePath: string;
        mappings: StackTransferMount[];
    };
    resumable?: boolean;
    error?: string;
    createdAt: string;
    updatedAt: string;
}

interface ParsedMount {
    type: TransferMountType;
    source: string;
    target: string;
    readOnly: boolean;
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseShortMount(value: string): ParsedMount | null {
    const parts = value.split(":");
    if (parts.length === 1) {
        return { type: "volume",
            source: "",
            target: parts[0],
            readOnly: false };
    }
    const mode = parts.length > 2 ? parts.pop()! : "";
    const target = parts.pop() || "";
    const source = parts.join(":");
    if (!target) {
        return null;
    }
    const bind = source.startsWith("/") || source.startsWith(".") || source.startsWith("~") || source.includes("${");
    return {
        type: bind ? "bind" : "volume",
        source,
        target,
        readOnly: mode.split(",").includes("ro"),
    };
}

function parseMount(value: unknown): ParsedMount | null {
    if (typeof value === "string") {
        return parseShortMount(value);
    }
    const mount = asRecord(value);
    if (typeof mount.target !== "string") {
        return null;
    }
    const type: TransferMountType = typeof mount.type === "string" && [ "bind", "volume", "tmpfs" ].includes(mount.type)
        ? mount.type as TransferMountType
        : "unknown";
    return {
        type,
        source: typeof mount.source === "string" ? mount.source : "",
        target: mount.target,
        readOnly: mount.read_only === true,
    };
}

function collectDeclaredMounts(composeYAML: string, overrideYAML: string): Array<ParsedMount & { service: string }> {
    const result = new Map<string, ParsedMount & { service: string }>();
    for (const content of [ composeYAML, overrideYAML ]) {
        if (!content.trim()) {
            continue;
        }
        const config = asRecord(yaml.parse(content));
        for (const [ service, rawService ] of Object.entries(asRecord(config.services))) {
            const volumes = asRecord(rawService).volumes;
            if (!Array.isArray(volumes)) {
                continue;
            }
            for (const rawMount of volumes) {
                const mount = parseMount(rawMount);
                if (!mount) {
                    continue;
                }
                result.set(`${service}:${mount.target}`, { ...mount,
                    service });
            }
        }
    }
    return [ ...result.values() ];
}

function volumeDefinitions(composeYAML: string, overrideYAML: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const content of [ composeYAML, overrideYAML ]) {
        if (!content.trim()) {
            continue;
        }
        Object.assign(result, asRecord(asRecord(yaml.parse(content)).volumes));
    }
    return result;
}

function normalizeRules(value: unknown): Record<string, StackTransferPathRule[]> {
    const raw = asRecord(value);
    const result: Record<string, StackTransferPathRule[]> = {};
    for (const [ sourceEndpoint, rules ] of Object.entries(raw)) {
        if (!Array.isArray(rules)) {
            continue;
        }
        result[sourceEndpoint] = rules.filter(rule => {
            const item = asRecord(rule);
            return typeof item.sourcePrefix === "string" && typeof item.targetPrefix === "string";
        }).map(rule => ({
            sourcePrefix: normalizePathPrefix(String(asRecord(rule).sourcePrefix)),
            targetPrefix: normalizePathPrefix(String(asRecord(rule).targetPrefix)),
        })).filter(rule => rule.sourcePrefix.startsWith("/") && rule.targetPrefix.startsWith("/"));
    }
    return result;
}

function normalizePathPrefix(value: string): string {
    const normalized = value.trim().replace(/\/+$/, "");
    return normalized || "/";
}

function pathMatchesPrefix(value: string, prefix: string): boolean {
    return prefix === "/" ? path.isAbsolute(value) : value === prefix || value.startsWith(prefix + "/");
}

function rewritePathPrefix(value: string, sourcePrefix: string, targetPrefix: string): string {
    const suffix = sourcePrefix === "/" ? value : value.slice(sourcePrefix.length);
    return targetPrefix === "/" ? suffix || "/" : targetPrefix + suffix;
}

export function suggestTargetSource(mount: Pick<StackTransferMount, "type" | "source">, rules: StackTransferPathRule[]): Pick<StackTransferMount, "targetSource" | "confidence" | "reason"> {
    if (mount.type === "tmpfs" || !mount.source) {
        return { targetSource: mount.source,
            confidence: "high",
            reason: "recreated" };
    }
    if (mount.type === "volume" || !path.isAbsolute(mount.source)) {
        return { targetSource: mount.source,
            confidence: "high",
            reason: mount.type === "volume" ? "named-volume" : "relative-bind" };
    }
    const matchingRule = [ ...rules ]
        .filter(rule => pathMatchesPrefix(mount.source, rule.sourcePrefix))
        .sort((a, b) => b.sourcePrefix.length - a.sourcePrefix.length)[0];
    if (matchingRule) {
        return {
            targetSource: rewritePathPrefix(mount.source, matchingRule.sourcePrefix, matchingRule.targetPrefix),
            confidence: "high",
            reason: "path-rule",
        };
    }
    return { targetSource: mount.source,
        confidence: "manual",
        reason: "absolute-bind" };
}

export async function runDocker(args: string[], cwd?: string, timeout = 30_000): Promise<string> {
    const { stdout } = await execFileAsync("docker", args, { cwd,
        timeout,
        maxBuffer: 8 * 1024 * 1024 });
    return String(stdout || "");
}

function composeArgs(server: DockgeServer, dir: string, projectName: string, command: string[]): string[] {
    const args = [ "compose" ];
    const globalEnv = path.join(server.stacksDir, "global.env");
    const localEnv = path.join(dir, ".env");
    if (fs.existsSync(globalEnv)) {
        args.push("--env-file", globalEnv);
    }
    if (fs.existsSync(localEnv)) {
        args.push("--env-file", localEnv);
    }
    args.push("-p", projectName, "-f", path.join(dir, "compose.yaml"));
    const override = path.join(dir, "compose.override.yaml");
    if (fs.existsSync(override)) {
        args.push("-f", override);
    }
    return [ ...args, ...command ];
}

function parseComposeJSON(output: string): Record<string, unknown> {
    const parsed = JSON.parse(output || "{}");
    return asRecord(parsed);
}

async function resolvedComposeForStack(server: DockgeServer, stack: Stack): Promise<Record<string, unknown>> {
    const output = await runDocker(stack.getComposeOptions("config", "--format", "json"), stack.fullPath);
    return parseComposeJSON(output);
}

function resolvedMounts(config: Record<string, unknown>): Map<string, ParsedMount & { service: string }> {
    const result = new Map<string, ParsedMount & { service: string }>();
    for (const [ service, rawService ] of Object.entries(asRecord(config.services))) {
        const volumes = asRecord(rawService).volumes;
        if (!Array.isArray(volumes)) {
            continue;
        }
        for (const rawMount of volumes) {
            const mount = parseMount(rawMount);
            if (mount) {
                result.set(`${service}:${mount.target}`, { ...mount,
                    service });
            }
        }
    }
    return result;
}

export async function analyzeStackTransfer(server: DockgeServer, stackName: string, rules: StackTransferPathRule[] = []): Promise<StackTransferInventory> {
    const stack = await Stack.getStack(server, stackName);
    const composeYAML = stack.composeYAML;
    const composeENV = stack.composeENV;
    const composeOverrideYAML = stack.composeOverrideYAML;
    const warnings: string[] = [];
    let runningServices: string[] = [];
    const definitions = volumeDefinitions(composeYAML, composeOverrideYAML);
    let resolved = new Map<string, ParsedMount & { service: string }>();
    try {
        resolved = resolvedMounts(await resolvedComposeForStack(server, stack));
    } catch (error) {
        warnings.push(error instanceof Error ? error.message : String(error));
    }
    try {
        runningServices = (await runDocker(stack.getComposeOptions("ps", "--status", "running", "--services"), stack.fullPath))
            .split("\n").map(service => service.trim()).filter(Boolean);
    } catch (error) {
        warnings.push(error instanceof Error ? error.message : String(error));
    }

    const runtime = new Map<string, { source: string; size: number | null }>();
    try {
        for (const container of await stack.getVolumeUsage()) {
            for (const mount of container.mounts) {
                runtime.set(`${container.service}:${mount.destination}`, { source: mount.source,
                    size: mount.size });
            }
        }
    } catch (error) {
        warnings.push(error instanceof Error ? error.message : String(error));
    }

    const mounts = collectDeclaredMounts(composeYAML, composeOverrideYAML).map((declared, index): StackTransferMount => {
        const key = `${declared.service}:${declared.target}`;
        const resolvedItem = resolved.get(key);
        const runtimeItem = runtime.get(key);
        const declaredNeedsResolution = declared.source.includes("${") || declared.source.startsWith("~");
        const source = declaredNeedsResolution ? resolvedItem?.source || declared.source : declared.source || resolvedItem?.source || "";
        const definition = declared.type === "volume" ? asRecord(definitions[source]) : {};
        const suggestion = suggestTargetSource({ type: declared.type,
            source }, rules);
        return {
            id: `${index}-${declared.service}-${declared.target}`,
            service: declared.service,
            type: declared.type,
            source,
            resolvedSource: runtimeItem?.source || resolvedItem?.source,
            target: declared.target,
            readOnly: declared.readOnly,
            external: definition.external === true,
            size: runtimeItem?.size ?? null,
            ...suggestion,
        };
    });

    return { stackName,
        composeYAML,
        composeENV,
        composeOverrideYAML,
        mounts,
        runningServices,
        warnings };
}

export async function restoreStackTransferSource(server: DockgeServer, stackName: string, services: string[]): Promise<void> {
    if (!stackName.match(/^[a-z0-9_-]+$/)) {
        throw new ValidationError("Invalid stack name");
    }
    const stack = await Stack.getStack(server, stackName);
    const config = await resolvedComposeForStack(server, stack);
    const knownServices = new Set(Object.keys(asRecord(config.services)));
    const requested = [ ...new Set(services) ];
    if (requested.some(service => !knownServices.has(service))) {
        throw new ValidationError("Invalid service in source restore request");
    }
    if (requested.length > 0) {
        await runDocker(stack.getComposeOptions("start", ...requested), stack.fullPath, 120_000);
    }
}

function mappedMountValue(mount: StackTransferMount, volumeAlias?: string): string {
    const source = volumeAlias || mount.targetSource;
    return `${source}:${mount.target}${mount.readOnly ? ":ro" : ""}`;
}

export function applyStackTransferMappings(overrideYAML: string, mappings: StackTransferMount[]): string {
    const config = overrideYAML.trim() ? asRecord(yaml.parse(overrideYAML)) : {};
    const services = asRecord(config.services);
    const volumeConfigs = asRecord(config.volumes);
    let changed = false;

    for (const [ index, mount ] of mappings.entries()) {
        if (![ "bind", "volume" ].includes(mount.type) || !mount.targetSource || mount.targetSource === mount.source) {
            continue;
        }
        const service = asRecord(services[mount.service]);
        const volumes = Array.isArray(service.volumes) ? [ ...service.volumes ] : [];
        const existingIndex = volumes.findIndex(item => parseMount(item)?.target === mount.target);
        let alias: string | undefined;
        if (mount.type === "volume") {
            alias = `dockge_transfer_${index}`;
            while (volumeConfigs[alias] !== undefined) {
                alias += "_mapped";
            }
            volumeConfigs[alias] = { name: mount.targetSource,
                ...(mount.external ? { external: true } : {}) };
        }
        const value = mappedMountValue(mount, alias);
        if (existingIndex >= 0) {
            volumes[existingIndex] = value;
        } else {
            volumes.push(value);
        }
        service.volumes = volumes;
        services[mount.service] = service;
        changed = true;
    }

    if (!changed) {
        return overrideYAML;
    }
    config.services = services;
    config.volumes = volumeConfigs;
    if (Object.keys(volumeConfigs).length === 0) {
        delete config.volumes;
    }
    return yaml.stringify(config);
}

async function writeTransferFiles(dir: string, request: Pick<StackTransferRequest, "composeYAML" | "composeENV" | "composeOverrideYAML" | "mappings">): Promise<string> {
    await fsAsync.mkdir(dir, { recursive: false });
    await fsAsync.writeFile(path.join(dir, "compose.yaml"), request.composeYAML, "utf8");
    if (request.composeENV.trim()) {
        await fsAsync.writeFile(path.join(dir, ".env"), request.composeENV, "utf8");
    }
    const mappedOverride = applyStackTransferMappings(request.composeOverrideYAML, request.mappings);
    if (mappedOverride.trim()) {
        await fsAsync.writeFile(path.join(dir, "compose.override.yaml"), mappedOverride, "utf8");
    }
    return mappedOverride;
}

export async function refreshImportedStackConfiguration(server: DockgeServer, targetName: string, request: Pick<StackTransferRequest, "composeYAML" | "composeENV" | "composeOverrideYAML" | "mappings">): Promise<string> {
    const targetDir = path.join(server.stacksDir, targetName);
    if (!(await fileExists(targetDir))) {
        throw new ValidationError("Target replica stack does not exist");
    }
    const tempDir = path.join(server.stacksDir, `.dockge-replication-config-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const names = [ "compose.yaml", ".env", "compose.override.yaml" ];
    const previous = new Map<string, Buffer | null>();
    try {
        const mappedOverride = await writeTransferFiles(tempDir, request);
        await runDocker(composeArgs(server, tempDir, targetName, [ "config", "--format", "json" ]), tempDir);
        for (const name of names) {
            previous.set(name, await fsAsync.readFile(path.join(targetDir, name)).catch(() => null));
        }
        for (const name of names) {
            const source = path.join(tempDir, name);
            const destination = path.join(targetDir, name);
            if (await fileExists(source)) {
                await fsAsync.rename(source, `${destination}.replication-new`);
                await fsAsync.rename(`${destination}.replication-new`, destination);
            } else {
                await fsAsync.rm(destination, { force: true });
            }
        }
        return mappedOverride;
    } catch (error) {
        for (const [ name, contents ] of previous) {
            const destination = path.join(targetDir, name);
            if (contents === null) {
                await fsAsync.rm(destination, { force: true }).catch(() => {});
            } else {
                await fsAsync.writeFile(destination, contents).catch(() => {});
            }
            await fsAsync.rm(`${destination}.replication-new`, { force: true }).catch(() => {});
        }
        throw error;
    } finally {
        await fsAsync.rm(tempDir, { recursive: true,
            force: true });
    }
}

async function inspectOccupiedPorts(): Promise<Set<string>> {
    const ids = (await runDocker([ "ps", "-q" ])).split(/\s+/).filter(Boolean);
    const occupied = new Set<string>();
    if (ids.length === 0) {
        return occupied;
    }
    const containers = JSON.parse(await runDocker([ "inspect", ...ids ])) as unknown[];
    for (const container of containers) {
        const networkSettings = asRecord(asRecord(container).NetworkSettings);
        for (const [ containerPort, bindings ] of Object.entries(asRecord(networkSettings.Ports))) {
            if (!Array.isArray(bindings)) {
                continue;
            }
            const protocol = containerPort.split("/")[1] || "tcp";
            for (const binding of bindings) {
                const hostPort = asRecord(binding).HostPort;
                if (hostPort) {
                    occupied.add(`${hostPort}/${protocol}`);
                }
            }
        }
    }
    return occupied;
}

async function probeBindPath(hostPath: string): Promise<boolean | null> {
    if (!path.isAbsolute(hostPath)) {
        return true;
    }
    try {
        await runDocker([ "image", "inspect", HELPER_IMAGE ]);
    } catch {
        return null;
    }
    try {
        await runDocker([ "run", "--rm", "--network", "none", "--mount", `type=bind,src=${hostPath},dst=/mnt,readonly`, HELPER_IMAGE, "true" ], undefined, 30_000);
        return true;
    } catch {
        return false;
    }
}

function publishedPorts(config: Record<string, unknown>): Array<{ service: string; published: string; protocol: string }> {
    const result: Array<{ service: string; published: string; protocol: string }> = [];
    for (const [ service, rawService ] of Object.entries(asRecord(config.services))) {
        const ports = asRecord(rawService).ports;
        if (!Array.isArray(ports)) {
            continue;
        }
        for (const rawPort of ports) {
            if (typeof rawPort === "string") {
                const match = rawPort.match(/(?:^|:)(\d+):(\d+)(?:\/(tcp|udp))?$/);
                if (match) {
                    result.push({ service,
                        published: match[1],
                        protocol: match[3] || "tcp" });
                }
            } else {
                const port = asRecord(rawPort);
                if (port.published !== undefined) {
                    result.push({ service,
                        published: String(port.published),
                        protocol: String(port.protocol || "tcp") });
                }
            }
        }
    }
    return result;
}

export async function preflightStackTransfer(server: DockgeServer, request: StackTransferRequest): Promise<{ issues: StackTransferIssue[]; mappedOverrideYAML: string; config?: Record<string, unknown> }> {
    const issues: StackTransferIssue[] = [];
    if (!request.targetName.match(/^[a-z0-9_-]+$/)) {
        issues.push({ severity: "error",
            scope: "save",
            code: "invalid-name",
            message: "Stack name can only contain [a-z][0-9] _ - only" });
        return { issues,
            mappedOverrideYAML: request.composeOverrideYAML };
    }
    const targetExists = await fileExists(path.join(server.stacksDir, request.targetName));
    if (targetExists) {
        issues.push({ severity: request.overwriteExisting ? "warning" : "error",
            scope: "save",
            code: "stack-exists",
            message: request.overwriteExisting ? "Target stack will be replaced transactionally" : "Target stack already exists" });
        if (request.overwriteExisting) {
            try {
                const target = await Stack.getStack(server, request.targetName);
                const running = (await runDocker(target.getComposeOptions("ps", "--status", "running", "--services"), target.fullPath))
                    .split("\n").map(value => value.trim()).filter(Boolean);
                if (running.length) {
                    issues.push({ severity: "error",
                        scope: "save",
                        code: "target-running",
                        message: `Target stack must be stopped before overwrite (${running.join(", ")})`,
                        params: { services: running.join(", ") } });
                }
            } catch (error) {
                issues.push({ severity: "error",
                    scope: "save",
                    code: "target-state-unchecked",
                    message: `Target state could not be verified: ${error instanceof Error ? error.message : String(error)}` });
            }
        }
    }

    const tempDir = path.join(server.stacksDir, `.dockge-transfer-check-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    let mappedOverrideYAML = request.composeOverrideYAML;
    let config: Record<string, unknown> | undefined;
    try {
        mappedOverrideYAML = await writeTransferFiles(tempDir, request);
        const output = await runDocker(composeArgs(server, tempDir, request.targetName, [ "config", "--format", "json" ]), tempDir);
        config = parseComposeJSON(output);
        issues.push({ severity: "success",
            scope: "save",
            code: "compose-valid",
            message: "Compose configuration is valid" });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        issues.push({ severity: "error",
            scope: "save",
            code: "compose-invalid",
            message,
            params: { error: message } });
    } finally {
        await fsAsync.rm(tempDir, { recursive: true,
            force: true });
    }
    if (!config) {
        return { issues,
            mappedOverrideYAML };
    }

    const targetMounts = resolvedMounts(config);
    const occupied = await inspectOccupiedPorts().catch(() => new Set<string>());
    for (const port of publishedPorts(config)) {
        if (occupied.has(`${port.published}/${port.protocol}`)) {
            issues.push({ severity: "error",
                scope: "deploy",
                code: "port-conflict",
                message: `${port.service}: port ${port.published}/${port.protocol} is already in use`,
                params: port });
        }
    }

    for (const mount of request.mappings) {
        if ([ "bind", "volume" ].includes(mount.type) && mount.source && !mount.targetSource.trim()) {
            issues.push({ severity: "error",
                scope: "save",
                code: "mapping-empty",
                message: `${mount.service}:${mount.target}: target source is required`,
                params: { service: mount.service,
                    target: mount.target } });
            continue;
        }
        if (mount.type === "bind" && !path.isAbsolute(mount.targetSource)) {
            const targetRoot = path.join(server.stacksDir, request.targetName);
            const resolvedTarget = path.resolve(targetRoot, mount.targetSource);
            if (resolvedTarget !== targetRoot && !resolvedTarget.startsWith(targetRoot + path.sep)) {
                issues.push({ severity: "error",
                    scope: "deploy",
                    code: "bind-relative-escape",
                    message: `${mount.targetSource}: relative path escapes the target stack directory`,
                    params: { path: mount.targetSource } });
            }
        }
        if (mount.type === "bind" && path.isAbsolute(mount.targetSource)) {
            const exists = await probeBindPath(mount.targetSource);
            issues.push({
                severity: exists === null ? "warning" : exists ? "success" : "error",
                scope: "deploy",
                code: exists === null ? "bind-unchecked" : exists ? "bind-found" : "bind-missing",
                message: exists === null ? `${mount.targetSource}: target path could not be checked because the helper image is unavailable` : exists ? `${mount.targetSource}: target path is available` : `${mount.targetSource}: target path is missing or inaccessible`,
                params: { path: mount.targetSource },
            });
        }
        if (mount.type === "volume" && mount.external) {
            const volumeName = targetMounts.get(`${mount.service}:${mount.target}`)?.source || mount.targetSource;
            try {
                await runDocker([ "volume", "inspect", volumeName ]);
                issues.push({ severity: "success",
                    scope: "deploy",
                    code: "volume-found",
                    message: `${volumeName}: external volume is available`,
                    params: { name: volumeName } });
            } catch {
                issues.push({ severity: "error",
                    scope: "deploy",
                    code: "volume-missing",
                    message: `${volumeName}: external volume is missing`,
                    params: { name: volumeName } });
            }
        }
    }

    const selectedBytes = request.dataTransfer ? request.mappings
        .filter(mount => mount.transferData)
        .reduce((total, mount) => total + (Number.isFinite(mount.size) ? Number(mount.size) : 0), 0) : 0;
    const requiredBytes = Math.max(1024 * 1024, Math.ceil(selectedBytes * (request.overwriteExisting ? 2.1 : 1.1)));
    try {
        const filesystems = new Set<string>([ server.stacksDir ]);
        for (const mount of request.mappings) {
            if (request.dataTransfer && mount.transferData && mount.type === "bind" && path.isAbsolute(mount.targetSource)) {
                let probe = mount.targetSource;
                while (!(await fileExists(probe)) && path.dirname(probe) !== probe) {
                    probe = path.dirname(probe);
                }
                filesystems.add(probe);
            }
        }
        let minimumFree = Number.POSITIVE_INFINITY;
        for (const filesystem of filesystems) {
            const stats = await fsAsync.statfs(filesystem);
            minimumFree = Math.min(minimumFree, Number(stats.bavail) * Number(stats.bsize));
        }
        issues.push({ severity: minimumFree < requiredBytes ? "error" : "success",
            scope: "save",
            code: minimumFree < requiredBytes ? "space-insufficient" : "space-available",
            message: minimumFree < requiredBytes ? `Insufficient free space: ${minimumFree} bytes available, ${requiredBytes} required` : `Free-space check passed: ${minimumFree} bytes available`,
            params: { available: String(minimumFree),
                required: String(requiredBytes) } });
    } catch (error) {
        issues.push({ severity: "error",
            scope: "save",
            code: "space-unchecked",
            message: `Free space could not be verified: ${error instanceof Error ? error.message : String(error)}` });
    }

    for (const [ key, rawNetwork ] of Object.entries(asRecord(config.networks))) {
        const network = asRecord(rawNetwork);
        if (network.external === true) {
            const name = String(network.name || key);
            try {
                await runDocker([ "network", "inspect", name ]);
                issues.push({ severity: "success",
                    scope: "deploy",
                    code: "network-found",
                    message: `${name}: external network is available`,
                    params: { name } });
            } catch {
                issues.push({ severity: "error",
                    scope: "deploy",
                    code: "network-missing",
                    message: `${name}: external network is missing`,
                    params: { name } });
            }
        }
    }

    for (const kind of [ "configs", "secrets" ] as const) {
        for (const [ key, rawDefinition ] of Object.entries(asRecord(config[kind]))) {
            const definition = asRecord(rawDefinition);
            if (definition.external !== true) {
                continue;
            }
            const name = String(definition.name || key);
            try {
                await runDocker([ kind === "configs" ? "config" : "secret", "inspect", name ]);
                issues.push({ severity: "success",
                    scope: "deploy",
                    code: `${kind.slice(0, -1)}-found`,
                    message: `${name}: external ${kind.slice(0, -1)} is available`,
                    params: { name } });
            } catch {
                issues.push({ severity: "error",
                    scope: "deploy",
                    code: `${kind.slice(0, -1)}-missing`,
                    message: `${name}: external ${kind.slice(0, -1)} is missing`,
                    params: { name } });
            }
        }
    }
    for (const [ service, rawService ] of Object.entries(asRecord(config.services))) {
        const devices = asRecord(rawService).devices;
        if (Array.isArray(devices) && devices.length > 0) {
            issues.push({ severity: "warning",
                scope: "deploy",
                code: "devices-manual",
                message: `${service}: Docker devices require manual verification on the target`,
                params: { service } });
        }
    }
    if (!issues.some(issue => issue.severity === "error")) {
        issues.push({ severity: "success",
            scope: "deploy",
            code: "target-ready",
            message: "Target is ready" });
    }
    return { issues,
        mappedOverrideYAML,
        config };
}

async function readJobs(): Promise<StackTransferJob[]> {
    const value = await Settings.get(JOBS_SETTING);
    return Array.isArray(value) ? value as StackTransferJob[] : [];
}

async function saveJob(job: StackTransferJob): Promise<void> {
    const jobs = (await readJobs()).filter(item => item.id !== job.id);
    jobs.unshift(job);
    await Settings.set(JOBS_SETTING, jobs.slice(0, 50), "stack-transfer");
}

async function advanceJob(job: StackTransferJob, phase: string, progress: number, message = phase, changes: Partial<StackTransferJob> = {}): Promise<void> {
    const at = new Date().toISOString();
    Object.assign(job, changes, { phase,
        progress: Math.max(0, Math.min(100, progress)),
        updatedAt: at,
        logs: [ ...(job.logs || []), { at,
            phase,
            message }].slice(-200) });
    await saveJob(job);
}

export async function updateTransferJob(id: string, updates: Partial<StackTransferJob>): Promise<StackTransferJob | null> {
    const job = (await readJobs()).find(item => item.id === id);
    if (!job) {
        return null;
    }
    Object.assign(job, updates, { updatedAt: new Date().toISOString() });
    await saveJob(job);
    return job;
}

export async function appendTransferJobProgress(id: string, phase: string, progress: number, message = phase, updates: Partial<StackTransferJob> = {}): Promise<StackTransferJob | null> {
    const job = (await readJobs()).find(item => item.id === id);
    if (!job) {
        return null;
    }
    await advanceJob(job, phase, progress, message, updates);
    return job;
}

export async function reserveStackTransferJob(request: StackTransferRequest, rollbackData?: StackTransferJob["rollbackData"]): Promise<StackTransferJob> {
    const existing = (await readJobs()).find(item => item.id === request.transferId);
    if (existing) {
        return existing;
    }
    const now = new Date().toISOString();
    const job: StackTransferJob = { id: request.transferId!,
        operation: request.operation,
        sourceEndpoint: request.sourceEndpoint,
        sourceStackName: request.sourceStackName,
        targetName: request.targetName,
        status: "queued",
        phase: "overwrite-snapshotted",
        progress: 15,
        logs: [{ at: now,
            phase: "overwrite-snapshotted",
            message: "Existing target data rollback snapshot persisted before replacement" }],
        request,
        rollbackData,
        resumable: true,
        createdAt: now,
        updatedAt: now };
    await saveJob(job);
    return job;
}

export async function listTransferJobs(): Promise<StackTransferJob[]> {
    return readJobs();
}

export async function markRunningTransferJobsInterrupted(): Promise<number> {
    const jobs = await readJobs();
    let count = 0;
    for (const job of jobs) {
        if (job.status === "running" || job.status === "queued") {
            job.status = "interrupted";
            job.resumable = true;
            job.error = "The process or connection was interrupted; retry with the same transfer id to resume";
            job.updatedAt = new Date().toISOString();
            count++;
        }
    }
    if (count) {
        await Settings.set(JOBS_SETTING, jobs.slice(0, 50), "stack-transfer");
    }
    return count;
}

async function prepareOverwrite(server: DockgeServer, job: StackTransferJob): Promise<void> {
    const targetDir = path.join(server.stacksDir, job.targetName);
    if (!(await fileExists(targetDir))) {
        return;
    }
    const stack = await Stack.getStack(server, job.targetName);
    const running = (await runDocker(stack.getComposeOptions("ps", "--status", "running", "--services"), stack.fullPath))
        .split("\n").map(value => value.trim()).filter(Boolean);
    if (running.length) {
        throw new ValidationError(`Target stack must be stopped before overwrite (${running.join(", ")})`);
    }
    const rollbackDir = path.join(server.stacksDir, `.dockge-overwrite-${job.id}`);
    await fsAsync.rename(targetDir, rollbackDir);
    job.rollbackDir = rollbackDir;
    await advanceJob(job, "target-snapshotted", 20, "Existing target configuration moved to a rollback snapshot");
}

export async function completeStackTransferTarget(server: DockgeServer, jobId: string, success: boolean, errorMessage?: string): Promise<StackTransferJob> {
    const job = (await readJobs()).find(item => item.id === jobId);
    if (!job) {
        throw new ValidationError("Transfer job not found");
    }
    const targetDir = path.join(server.stacksDir, job.targetName);
    if (!success) {
        await rollbackImportedStack(server, job.targetName);
        if (job.rollbackDir && await fileExists(job.rollbackDir)) {
            await fsAsync.rename(job.rollbackDir, targetDir);
        }
    } else if (success && job.rollbackDir) {
        await fsAsync.rm(job.rollbackDir, { recursive: true,
            force: true });
    }
    job.rollbackDir = undefined;
    await advanceJob(job, success ? "completed" : "rolled-back", 100, success ? "Transfer completed" : "Original target restored", {
        status: success ? "succeeded" : "rolled-back",
        error: errorMessage,
        resumable: false,
    });
    return job;
}

export async function verifyDeployment(server: DockgeServer, targetName: string, expectedServices: string[], timeoutMs = 45_000): Promise<void> {
    const stack = await Stack.getStack(server, targetName);
    const deadline = Date.now() + timeoutMs;
    let stableSince: number | null = null;
    while (Date.now() < deadline) {
        const output = await runDocker(stack.getComposeOptions("ps", "--all", "--format", "json"), stack.fullPath);
        const rows = output.trim().startsWith("[")
            ? JSON.parse(output) as unknown[]
            : output.split("\n").filter(Boolean).map(line => JSON.parse(line) as unknown);
        const byService = new Map(rows.map(rawRow => {
            const row = asRecord(rawRow);
            return [ String(row.Service), row ] as const;
        }));
        let waiting = false;
        for (const service of expectedServices) {
            const row = byService.get(service);
            if (!row) {
                waiting = true;
                continue;
            }
            const state = String(row.State || "").toLowerCase();
            const health = String(row.Health || "").toLowerCase();
            if (health === "unhealthy" || [ "dead", "restarting" ].includes(state)) {
                throw new Error(`${service}: ${health || state}`);
            }
            if (state === "exited") {
                let exitCode = Number(row.ExitCode || 0);
                if (row.ID) {
                    try {
                        const inspected = JSON.parse(await runDocker([ "inspect", String(row.ID) ])) as unknown[];
                        const inspectedState = asRecord(asRecord(inspected[0]).State);
                        exitCode = Number(inspectedState.ExitCode ?? exitCode);
                    } catch { /* keep compose value */ }
                }
                if (exitCode !== 0) {
                    throw new Error(`${service}: exited with code ${exitCode}`);
                }
            }
            if (![ "running", "exited" ].includes(state) || health === "starting") {
                waiting = true;
            }
        }
        if (waiting) {
            stableSince = null;
        } else if (stableSince === null) {
            stableSince = Date.now();
        } else if (Date.now() - stableSince >= 3000) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error("Target health verification timed out");
}

export async function rollbackImportedStack(server: DockgeServer, targetName: string): Promise<void> {
    const dir = path.join(server.stacksDir, targetName);
    if (!(await fileExists(dir))) {
        return;
    }
    try {
        await runDocker(composeArgs(server, dir, targetName, [ "down", "--remove-orphans" ]), dir, 120_000);
    } catch { /* best effort */ }
    await fsAsync.rm(dir, { recursive: true,
        force: true });
}

export async function importStackTransfer(server: DockgeServer, socket: DockgeSocket, request: StackTransferRequest): Promise<{ job: StackTransferJob; mappedOverrideYAML: string }> {
    if (request.operation === "move" && !request.deploy && !request.dataTransfer) {
        throw new ValidationError("A move must deploy and verify the target before stopping the source");
    }
    const now = new Date().toISOString();
    const requestedId = request.transferId && /^[a-zA-Z0-9_-]{8,128}$/.test(request.transferId) ? request.transferId : undefined;
    const previous = requestedId ? (await readJobs()).find(item => item.id === requestedId) : undefined;
    const targetStageExists = previous && !(previous.phase === "overwrite-snapshotted" && !previous.rollbackDir) && await fileExists(path.join(server.stacksDir, request.targetName));
    if (previous && targetStageExists && [ "running", "interrupted", "succeeded", "target-ready" ].includes(previous.status)) {
        if (previous.status === "interrupted") {
            previous.status = "running";
            await advanceJob(previous, "resuming-target", Math.max(35, previous.progress || 0), "Existing target stage found; resuming with the same idempotent transfer id");
        }
        if (!request.dataTransfer && previous.status === "running") {
            try {
                if (request.deploy) {
                    await advanceJob(previous, "deploying", 65);
                    const stack = await Stack.getStack(server, request.targetName);
                    const config = await resolvedComposeForStack(server, stack);
                    await stack.deploy(socket);
                    await advanceJob(previous, "verifying", 85);
                    await verifyDeployment(server, request.targetName, Object.keys(asRecord(config.services)));
                }
                await advanceJob(previous, request.operation === "move" ? "waiting-source-stop" : "completed", 100, "Interrupted transfer resumed and verified", { status: request.operation === "move" ? "target-ready" : "succeeded",
                    resumable: request.operation === "move" });
            } catch (error) {
                if (previous.rollbackDir) {
                    await completeStackTransferTarget(server, previous.id, false, error instanceof Error ? error.message : String(error));
                } else {
                    await rollbackImportedStack(server, request.targetName);
                    await advanceJob(previous, "failed", previous.progress, "Resumed transfer failed", { status: "rolled-back",
                        error: error instanceof Error ? error.message : String(error),
                        resumable: false });
                }
                throw error;
            }
        }
        return { job: previous,
            mappedOverrideYAML: applyStackTransferMappings(request.composeOverrideYAML, request.mappings) };
    }
    const job: StackTransferJob = {
        id: requestedId || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        operation: request.operation,
        sourceEndpoint: request.sourceEndpoint,
        sourceStackName: request.sourceStackName,
        targetName: request.targetName,
        status: "running",
        phase: "preflight",
        progress: 5,
        logs: [{ at: now,
            phase: "preflight",
            message: previous ? "Resuming transfer after interruption" : "Transfer accepted" }],
        request: { ...request,
            transferId: requestedId },
        resumable: true,
        rollbackDir: previous?.rollbackDir,
        rollbackData: previous?.rollbackData,
        createdAt: now,
        updatedAt: now,
    };
    await saveJob(job);
    let imported = false;
    let tempDir = "";
    try {
        const preflight = await preflightStackTransfer(server, request);
        const blocking = preflight.issues.filter(issue => issue.severity === "error" && (issue.scope === "save" || request.deploy || request.dataTransfer));
        if (blocking.length > 0) {
            throw new ValidationError(blocking.map(issue => issue.message).join(" ; "));
        }

        if (request.overwriteExisting && !job.rollbackDir) {
            await prepareOverwrite(server, job);
        }
        await advanceJob(job, "copying-configuration", 35);
        tempDir = path.join(server.stacksDir, `.dockge-transfer-${job.id}`);
        const mappedOverrideYAML = await writeTransferFiles(tempDir, request);
        await fsAsync.rename(tempDir, path.join(server.stacksDir, request.targetName));
        imported = true;

        if (request.deploy) {
            await advanceJob(job, "deploying", 65);
            const stack = await Stack.getStack(server, request.targetName);
            await stack.deploy(socket);
            await advanceJob(job, "verifying", 85);
            const config = preflight.config || {};
            await verifyDeployment(server, request.targetName, Object.keys(asRecord(config.services)));
        }

        await advanceJob(job, request.operation === "move" ? "waiting-source-stop" : "completed", 100, "Target configuration imported and verified", {
            status: request.operation === "move" ? "target-ready" : "succeeded",
            resumable: request.operation === "move",
        });
        if (request.operation === "copy" && job.rollbackDir && !request.dataTransfer) {
            await completeStackTransferTarget(server, job.id, true);
        }
        return { job,
            mappedOverrideYAML };
    } catch (error) {
        if (imported) {
            await rollbackImportedStack(server, request.targetName);
        }
        if (tempDir) {
            await fsAsync.rm(tempDir, { recursive: true,
                force: true });
        }
        if (job.rollbackDir) {
            await completeStackTransferTarget(server, job.id, false, error instanceof Error ? error.message : String(error));
        } else {
            await advanceJob(job, "failed", job.progress || 0, "Transfer failed", { status: imported ? "rolled-back" : "failed",
                error: error instanceof Error ? error.message : String(error),
                resumable: !imported });
        }
        throw error;
    }
}

export async function createImportedStackStorage(server: DockgeServer, targetName: string): Promise<void> {
    const stack = await Stack.getStack(server, targetName);
    await runDocker(stack.getComposeOptions("create"), stack.fullPath, 30 * 60_000);
}

export async function deployAndVerifyImportedStack(server: DockgeServer, socket: DockgeSocket, targetName: string): Promise<void> {
    const stack = await Stack.getStack(server, targetName);
    const config = await resolvedComposeForStack(server, stack);
    await stack.deploy(socket);
    await verifyDeployment(server, targetName, Object.keys(asRecord(config.services)));
}

export async function getPathRules(sourceEndpoint: string): Promise<StackTransferPathRule[]> {
    const rules = normalizeRules(await Settings.get(PATH_RULES_SETTING));
    return rules[sourceEndpoint] || [];
}

export async function setPathRules(sourceEndpoint: string, value: unknown): Promise<StackTransferPathRule[]> {
    const rules = normalizeRules(await Settings.get(PATH_RULES_SETTING));
    const normalized = normalizeRules({ [sourceEndpoint]: value })[sourceEndpoint] || [];
    rules[sourceEndpoint] = normalized;
    await Settings.set(PATH_RULES_SETTING, rules, "stack-transfer");
    return normalized;
}
