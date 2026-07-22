import { Cron } from "croner";
import { io, Socket as SocketClient } from "socket.io-client";
import { AgentSocket } from "../../common/agent-socket";
import { Agent } from "../models/agent";
import { DockgeServer } from "../dockge-server";
import { log } from "../log";
import { Settings } from "../settings";
import { DockgeSocket, ValidationError } from "../util-server";
import { StackTransferSocketHandler } from "../agent-socket-handlers/stack-transfer-socket-handler";
import { StackBackupPolicy, normalizeStackBackupPolicy } from "./backup-manager";
import { markRunningTransferJobsInterrupted, StackTransferMount, StackTransferRequest } from "../transfers/stack-transfer";

const SETTINGS_KEY = "stackReplicationPolicies";
const ALLOWED_INTERVALS = new Set([ 15, 60, 360, 1440 ]);
const RPC_TIMEOUT = 2 * 60 * 60_000;

export type StackReplicationStatus = "idle" | "running" | "ready" | "error" | "active";

export interface StackReplicationPolicy {
    id: string;
    enabled: boolean;
    sourceEndpoint: string;
    sourceStackName: string;
    targetEndpoint: string;
    targetName: string;
    repositoryId: string;
    targetComposeYAML?: string;
    targetComposeENV?: string;
    targetComposeOverrideYAML?: string;
    intervalMinutes: number;
    mappings: StackTransferMount[];
    consistency: StackBackupPolicy;
    restoreTestEnabled: boolean;
    restoreTestIntervalHours: number;
    restoreTestStartContainers: boolean;
    storageMode: "restored" | "repository";
    retentionCount: number;
    status: StackReplicationStatus;
    createdAt: string;
    updatedAt: string;
    lastRunAt?: string;
    lastSuccessAt?: string;
    lastDurationMs?: number;
    lastSnapshotId?: string;
    snapshotHistory?: Array<{ snapshotId: string; repositoryId: string; archivePath: string; createdAt: string; bytesTransferred: number }>;
    lastTransferredBytes?: number;
    totalTransferredBytes?: number;
    lastHealthcheckAt?: string;
    lastHealthcheckStatus?: "passed" | "failed";
    driftDetectedAt?: string;
    driftReason?: string;
    lastRepositoryId?: string;
    lastArchivePath?: string;
    synchronizedAt?: string;
    activatedAt?: string;
    error?: string;
    cleanupWarning?: string;
    lastRestoreTestAt?: string;
    lastRestoreTestDurationMs?: number;
    lastRestoreTestBytes?: number;
    lastRestoreTestFiles?: number;
    lastRestoreTestMounts?: number;
    lastRestoreTestContainersStarted?: boolean;
    lastRestoreTestWarnings?: string[];
    lastRestoreTestError?: string;
}

export interface StackReplicationInput {
    id?: string;
    sourceEndpoint: string;
    sourceStackName: string;
    targetEndpoint: string;
    targetName: string;
    repositoryId: string;
    targetComposeYAML?: string;
    targetComposeENV?: string;
    targetComposeOverrideYAML?: string;
    intervalMinutes: number;
    mappings: StackTransferMount[];
    consistency: StackBackupPolicy;
    restoreTestEnabled?: boolean;
    restoreTestIntervalHours?: number;
    restoreTestStartContainers?: boolean;
    enabled?: boolean;
    storageMode?: "restored" | "repository";
    retentionCount?: number;
}

interface RpcResponse<T = unknown> {
    ok: boolean;
    data?: T;
    msg?: string;
}

interface TransferAnalysis {
    composeYAML: string;
    composeENV: string;
    composeOverrideYAML: string;
    mounts: StackTransferMount[];
}

function stringField(value: unknown, name: string, allowEmpty = false): string {
    if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
        throw new ValidationError(`${name} must be a string`);
    }
    return value.trim();
}

function optionalFileField(value: unknown, name: string, allowEmpty = false): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
        throw new ValidationError(`${name} must be a string`);
    }
    return value;
}

function normalizeMappings(value: unknown): StackTransferMount[] {
    if (!Array.isArray(value)) {
        throw new ValidationError("mappings must be an array");
    }
    return value.map(raw => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            throw new ValidationError("Invalid replication mapping");
        }
        const mapping = raw as StackTransferMount;
        for (const key of [ "id", "service", "type", "source", "target", "targetSource", "confidence", "reason" ] as const) {
            if (typeof mapping[key] !== "string") {
                throw new ValidationError(`mapping.${key} must be a string`);
            }
        }
        if (typeof mapping.readOnly !== "boolean" || typeof mapping.external !== "boolean") {
            throw new ValidationError("Invalid replication mapping flags");
        }
        return { ...mapping,
            transferData: mapping.transferData === true };
    });
}

function normalizeInput(raw: StackReplicationInput): StackReplicationInput {
    const intervalMinutes = Number(raw.intervalMinutes);
    if (!ALLOWED_INTERVALS.has(intervalMinutes)) {
        throw new ValidationError("Replication interval must be 15 minutes, 1 hour, 6 hours or 24 hours");
    }
    if (typeof raw.repositoryId !== "string" || !raw.repositoryId.trim()) {
        throw new ValidationError("stackReplication.repositoryRequired");
    }
    const input = {
        id: raw.id ? stringField(raw.id, "id") : undefined,
        sourceEndpoint: stringField(raw.sourceEndpoint, "sourceEndpoint", true),
        sourceStackName: stringField(raw.sourceStackName, "sourceStackName"),
        targetEndpoint: stringField(raw.targetEndpoint, "targetEndpoint", true),
        targetName: stringField(raw.targetName, "targetName"),
        repositoryId: raw.repositoryId.trim(),
        targetComposeYAML: optionalFileField(raw.targetComposeYAML, "targetComposeYAML"),
        targetComposeENV: optionalFileField(raw.targetComposeENV, "targetComposeENV", true),
        targetComposeOverrideYAML: optionalFileField(raw.targetComposeOverrideYAML, "targetComposeOverrideYAML", true),
        intervalMinutes,
        mappings: normalizeMappings(raw.mappings),
        consistency: normalizeStackBackupPolicy(raw.consistency),
        restoreTestEnabled: raw.restoreTestEnabled !== false,
        restoreTestIntervalHours: Math.max(1, Math.min(8760, Number(raw.restoreTestIntervalHours) || 168)),
        restoreTestStartContainers: raw.restoreTestStartContainers === true,
        storageMode: raw.storageMode === "repository" ? "repository" as const : "restored" as const,
        retentionCount: Math.max(1, Math.min(30, Math.floor(Number(raw.retentionCount) || 3))),
        enabled: raw.enabled !== false,
    };
    if (!/^[a-z0-9_-]+$/.test(input.sourceStackName) || !/^[a-z0-9_-]+$/.test(input.targetName)) {
        throw new ValidationError("Invalid source or target stack name");
    }
    if (input.sourceEndpoint === input.targetEndpoint && input.sourceStackName === input.targetName) {
        throw new ValidationError("Source and target replica must be different");
    }
    if (!input.mappings.some(mapping => mapping.transferData && (mapping.type === "bind" || mapping.type === "volume"))) {
        throw new ValidationError("Select at least one bind mount or volume for replication");
    }
    return input;
}

export class StackReplicationManager {
    private static instance?: StackReplicationManager;
    private server?: DockgeServer;
    private localAgent = new AgentSocket();
    private cron?: Cron;
    private running = new Set<string>();

    static getInstance(): StackReplicationManager {
        if (!this.instance) {
            this.instance = new StackReplicationManager();
        }
        return this.instance;
    }

    async start(server: DockgeServer): Promise<void> {
        if (this.cron) {
            return;
        }
        this.server = server;
        await markRunningTransferJobsInterrupted();
        const socket = {
            userID: 1,
            endpoint: "",
            id: "stack-replication-manager",
            connected: true,
            emitAgent() {},
        } as unknown as DockgeSocket;
        new StackTransferSocketHandler().create(socket, server, this.localAgent);
        this.cron = new Cron("* * * * *", { protect: true }, () => this.runDue().catch(error => log.error("StackReplication", String(error))));
    }

    stop(): void {
        this.cron?.stop();
        this.cron = undefined;
    }

    private async read(): Promise<StackReplicationPolicy[]> {
        const value = await Settings.get(SETTINGS_KEY);
        return Array.isArray(value) ? value as StackReplicationPolicy[] : [];
    }

    private async write(policies: StackReplicationPolicy[]): Promise<void> {
        await Settings.set(SETTINGS_KEY, policies, "stack-replication");
    }

    async list(sourceEndpoint?: string, sourceStackName?: string): Promise<StackReplicationPolicy[]> {
        const policies = await this.read();
        return policies.filter(policy => sourceEndpoint === undefined || (policy.sourceEndpoint === sourceEndpoint && policy.sourceStackName === sourceStackName));
    }

    async save(raw: StackReplicationInput): Promise<StackReplicationPolicy> {
        const input = normalizeInput(raw);
        const policies = await this.read();
        const duplicate = policies.find(policy => policy.sourceEndpoint === input.sourceEndpoint && policy.sourceStackName === input.sourceStackName && policy.id !== input.id);
        if (duplicate) {
            throw new ValidationError("This source stack already has a cold replica");
        }
        const existing = input.id ? policies.find(policy => policy.id === input.id) : undefined;
        if (existing?.status === "active") {
            throw new ValidationError("An activated replica cannot be reconfigured");
        }
        const now = new Date().toISOString();
        const policy: StackReplicationPolicy = {
            ...(existing || {} as StackReplicationPolicy),
            ...input,
            id: existing?.id || `replica-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
            status: existing?.status || "idle",
            restoreTestEnabled: input.restoreTestEnabled !== false,
            restoreTestIntervalHours: input.restoreTestIntervalHours || 168,
            restoreTestStartContainers: input.restoreTestStartContainers === true,
            storageMode: input.storageMode || "restored",
            retentionCount: input.retentionCount || 3,
            createdAt: existing?.createdAt || now,
            updatedAt: now,
        };
        await this.write([ policy, ...policies.filter(item => item.id !== policy.id) ]);
        return policy;
    }

    async remove(id: string): Promise<void> {
        if (this.running.has(id)) {
            throw new ValidationError("Replication is currently running");
        }
        const policies = await this.read();
        if (!policies.some(policy => policy.id === id)) {
            throw new ValidationError("Replication policy not found");
        }
        await this.write(policies.filter(policy => policy.id !== id));
    }

    private async update(id: string, changes: Partial<StackReplicationPolicy>): Promise<StackReplicationPolicy> {
        const policies = await this.read();
        const policy = policies.find(item => item.id === id);
        if (!policy) {
            throw new ValidationError("Replication policy not found");
        }
        Object.assign(policy, changes, { updatedAt: new Date().toISOString() });
        await this.write(policies);
        return policy;
    }

    private async runDue(): Promise<void> {
        const now = Date.now();
        for (const policy of await this.read()) {
            const dueAt = policy.lastSuccessAt ? new Date(policy.lastSuccessAt).getTime() + policy.intervalMinutes * 60_000 : 0;
            if (policy.enabled && policy.status !== "active" && dueAt <= now && !this.running.has(policy.id)) {
                this.run(policy.id).catch(error => log.error("StackReplication", `${policy.id}: ${error instanceof Error ? error.message : String(error)}`));
            }
        }
    }

    async run(id: string): Promise<StackReplicationPolicy> {
        if (this.running.has(id)) {
            throw new ValidationError("Replication is already running");
        }
        const policy = (await this.read()).find(item => item.id === id);
        if (!policy) {
            throw new ValidationError("Replication policy not found");
        }
        if (policy.status === "active") {
            throw new ValidationError("Activated replica cannot be synchronized");
        }
        this.running.add(id);
        const started = Date.now();
        const transferId = `replication-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        let snapshotCreated = false;
        let targetSynchronized = false;
        await this.update(id, { status: "running",
            lastRunAt: new Date(started).toISOString(),
            error: undefined,
            cleanupWarning: undefined });
        try {
            if (policy.lastSuccessAt) {
                const drift = await this.call<{ drifted: boolean; reason?: string }>(policy.targetEndpoint, "inspectStackReplicaDrift", policy.targetName, policy.id);
                if (drift.drifted) {
                    await this.update(id, { enabled: false,
                        status: "error",
                        driftDetectedAt: new Date().toISOString(),
                        driftReason: drift.reason || "Target replica drift detected",
                        error: `Replication automatically suspended: ${drift.reason || "target drift detected"}` });
                    throw new ValidationError(`Replication automatically suspended: ${drift.reason || "target drift detected"}`);
                }
            }
            const analysis = await this.call<TransferAnalysis>(policy.sourceEndpoint, "analyzeStackTransfer", policy.sourceStackName, policy.sourceEndpoint);
            const [ sourceCapabilities, targetCapabilities ] = await Promise.all([
                this.call<{ repositories: Array<{ id: string }> }>(policy.sourceEndpoint, "getStackTransferDataCapabilities", policy.sourceStackName),
                this.call<{ repositories: Array<{ id: string }> }>(policy.targetEndpoint, "getStackTransferDataCapabilities", policy.sourceStackName),
            ]);
            if (!sourceCapabilities.repositories.some(repository => repository.id === policy.repositoryId) || !targetCapabilities.repositories.some(repository => repository.id === policy.repositoryId)) {
                throw new ValidationError("Shared Restic repository is no longer available on both instances");
            }
            const savedMappings = new Map(policy.mappings.map(mapping => [ mapping.id, mapping ]));
            const mappings = analysis.mounts.map(mount => ({ ...mount,
                ...(savedMappings.get(mount.id) || {}),
                id: mount.id }));
            const selected = mappings.filter(mapping => mapping.transferData && (mapping.type === "bind" || mapping.type === "volume"));
            if (selected.length === 0) {
                throw new ValidationError("No selected storage remains in the source stack");
            }
            const transfer: StackTransferRequest = {
                operation: "copy",
                sourceEndpoint: policy.sourceEndpoint,
                sourceStackName: policy.sourceStackName,
                targetName: policy.targetName,
                composeYAML: policy.targetComposeYAML ?? analysis.composeYAML,
                composeENV: policy.targetComposeENV ?? analysis.composeENV,
                composeOverrideYAML: policy.targetComposeOverrideYAML ?? analysis.composeOverrideYAML,
                mappings,
                deploy: false,
                dataTransfer: true,
            };
            const snapshot = await this.call<{ snapshotId: string; archivePath: string; bytesTransferred: number }>(policy.sourceEndpoint, "createStackTransferDataSnapshot", {
                transferId,
                stackName: policy.sourceStackName,
                repositoryId: policy.repositoryId,
                mappings,
                policy: policy.consistency,
                phase: "copy",
            });
            snapshotCreated = true;
            const synchronized = await this.call<{ synchronizedAt: string }>(policy.targetEndpoint, "syncStackReplicaTarget", {
                replicaId: policy.id,
                transferId,
                repositoryId: policy.repositoryId,
                snapshotId: snapshot.snapshotId,
                archivePath: snapshot.archivePath,
                transfer,
                storageMode: policy.storageMode || "restored",
            });
            targetSynchronized = true;
            const restoreTestDue = policy.restoreTestEnabled !== false && (!policy.lastRestoreTestAt || Date.now() - new Date(policy.lastRestoreTestAt).getTime() >= (policy.restoreTestIntervalHours || 168) * 3_600_000);
            let restoreTest: { bytesRead: number; testedAt: string; durationMs: number; fileCount: number; mountsChecked: number; containersStarted: boolean; warnings: string[] } | undefined;
            let restoreTestError: string | undefined;
            if (restoreTestDue) {
                try {
                    restoreTest = await this.call(policy.targetEndpoint, "testStackReplicaSnapshot", policy.targetName, policy.id, policy.restoreTestStartContainers === true);
                } catch (error) {
                    restoreTestError = error instanceof Error ? error.message : String(error);
                }
            }
            await this.call(policy.sourceEndpoint, "completeStackTransferDataSource", transferId, true, true);
            let cleanupWarning: string | undefined;
            const history = [{ snapshotId: snapshot.snapshotId,
                repositoryId: policy.repositoryId,
                archivePath: snapshot.archivePath,
                createdAt: new Date().toISOString(),
                bytesTransferred: snapshot.bytesTransferred || 0 }, ...(policy.snapshotHistory || []) ]
                .filter((item, index, items) => items.findIndex(candidate => candidate.snapshotId === item.snapshotId) === index);
            const retained = history.slice(0, policy.retentionCount || 3);
            const expired = history.slice(policy.retentionCount || 3);
            if (expired.length) {
                try {
                    for (const [ repositoryId, snapshots ] of Object.entries(Object.groupBy(expired, item => item.repositoryId))) {
                        await this.call(policy.sourceEndpoint, "forgetStackTransferSnapshots", repositoryId, snapshots!.map(item => item.snapshotId));
                    }
                } catch (error) {
                    cleanupWarning = error instanceof Error ? error.message : String(error);
                }
            }
            return await this.update(id, {
                status: "ready",
                lastSuccessAt: new Date().toISOString(),
                lastDurationMs: Date.now() - started,
                lastSnapshotId: snapshot.snapshotId,
                snapshotHistory: retained,
                lastTransferredBytes: snapshot.bytesTransferred || 0,
                totalTransferredBytes: (policy.totalTransferredBytes || 0) + (snapshot.bytesTransferred || 0),
                lastRepositoryId: policy.repositoryId,
                lastArchivePath: snapshot.archivePath,
                synchronizedAt: synchronized.synchronizedAt,
                cleanupWarning,
                ...(restoreTest ? { lastRestoreTestAt: restoreTest.testedAt,
                    lastRestoreTestBytes: restoreTest.bytesRead,
                    lastRestoreTestDurationMs: restoreTest.durationMs,
                    lastRestoreTestFiles: restoreTest.fileCount,
                    lastRestoreTestMounts: restoreTest.mountsChecked,
                    lastRestoreTestContainersStarted: restoreTest.containersStarted,
                    lastRestoreTestWarnings: restoreTest.warnings,
                    lastRestoreTestError: undefined } : {}),
                ...(restoreTest?.containersStarted ? { lastHealthcheckAt: restoreTest.testedAt,
                    lastHealthcheckStatus: "passed" as const } : {}),
                ...(restoreTestError ? { lastRestoreTestAt: new Date().toISOString(),
                    lastRestoreTestError: restoreTestError,
                    ...(policy.restoreTestStartContainers ? { lastHealthcheckAt: new Date().toISOString(),
                        lastHealthcheckStatus: "failed" as const } : {}) } : {}),
                driftDetectedAt: undefined,
                driftReason: undefined,
                error: undefined,
            });
        } catch (error) {
            if (snapshotCreated && !targetSynchronized) {
                await this.call(policy.sourceEndpoint, "completeStackTransferDataSource", transferId, false, false).catch(() => {});
            }
            const message = error instanceof Error ? error.message : String(error);
            await this.update(id, { status: "error",
                lastDurationMs: Date.now() - started,
                error: message });
            throw error;
        } finally {
            this.running.delete(id);
        }
    }

    async activate(id: string): Promise<StackReplicationPolicy> {
        if (this.running.has(id)) {
            throw new ValidationError("Replication is currently running");
        }
        const policy = (await this.read()).find(item => item.id === id);
        if (!policy || !policy.lastSuccessAt) {
            throw new ValidationError("No synchronized replica is available");
        }
        const drift = await this.call<{ drifted: boolean; reason?: string }>(policy.targetEndpoint, "inspectStackReplicaDrift", policy.targetName, policy.id);
        if (drift.drifted) {
            await this.update(id, { enabled: false,
                status: "error",
                driftDetectedAt: new Date().toISOString(),
                driftReason: drift.reason || "Target replica drift detected",
                error: `Activation blocked and replication suspended: ${drift.reason || "target drift detected"}` });
            throw new ValidationError(`Activation blocked: ${drift.reason || "target replica drift detected"}`);
        }
        const result = await this.call<{ activatedAt: string }>(policy.targetEndpoint, "activateStackReplicaTarget", policy.targetName, policy.id);
        return this.update(id, { status: "active",
            enabled: false,
            activatedAt: result.activatedAt,
            error: undefined });
    }

    async testRecovery(id: string): Promise<StackReplicationPolicy> {
        if (this.running.has(id)) {
            throw new ValidationError("Replication is currently running");
        }
        const policy = (await this.read()).find(item => item.id === id);
        if (!policy?.lastSuccessAt || policy.status === "active") {
            throw new ValidationError("A synchronized, inactive replica is required for a recovery test");
        }
        this.running.add(id);
        const started = Date.now();
        try {
            const result = await this.call<{ bytesRead: number; testedAt: string; durationMs: number; fileCount: number; mountsChecked: number; containersStarted: boolean; warnings: string[] }>(policy.targetEndpoint, "testStackReplicaSnapshot", policy.targetName, policy.id, policy.restoreTestStartContainers === true);
            return await this.update(id, { lastRestoreTestAt: result.testedAt,
                lastRestoreTestDurationMs: result.durationMs,
                lastRestoreTestBytes: result.bytesRead,
                lastRestoreTestFiles: result.fileCount,
                lastRestoreTestMounts: result.mountsChecked,
                lastRestoreTestContainersStarted: result.containersStarted,
                lastRestoreTestWarnings: result.warnings,
                lastRestoreTestError: undefined,
                ...(result.containersStarted ? { lastHealthcheckAt: result.testedAt,
                    lastHealthcheckStatus: "passed" as const } : {}) });
        } catch (error) {
            await this.update(id, { lastRestoreTestAt: new Date().toISOString(),
                lastRestoreTestDurationMs: Date.now() - started,
                lastRestoreTestError: error instanceof Error ? error.message : String(error),
                ...(policy.restoreTestStartContainers ? { lastHealthcheckAt: new Date().toISOString(),
                    lastHealthcheckStatus: "failed" as const } : {}) });
            throw error;
        } finally {
            this.running.delete(id);
        }
    }

    private async call<T = unknown>(endpoint: string, event: string, ...args: unknown[]): Promise<T> {
        const response = endpoint ? await this.remoteCall<T>(endpoint, event, args) : await this.localCall<T>(event, args);
        if (!response.ok) {
            throw new Error(response.msg || `${event} failed`);
        }
        return response.data as T;
    }

    private localCall<T>(event: string, args: unknown[]): Promise<RpcResponse<T>> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`${event} timed out`)), RPC_TIMEOUT);
            this.localAgent.call(event, ...args, (response: RpcResponse<T>) => {
                clearTimeout(timer);
                resolve(response);
            });
        });
    }

    private async remoteCall<T>(endpoint: string, event: string, args: unknown[]): Promise<RpcResponse<T>> {
        const agent = (await Agent.getAgentList())[endpoint];
        if (!agent) {
            throw new ValidationError(`Agent not found: ${endpoint}`);
        }
        return new Promise((resolve, reject) => {
            let client: SocketClient | undefined;
            let settled = false;
            const finish = (error?: Error, response?: RpcResponse<T>) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                client?.disconnect();
                if (error) {
                    reject(error);
                } else {
                    resolve(response!);
                }
            };
            const timer = setTimeout(() => finish(new Error(`${endpoint}: ${event} timed out`)), RPC_TIMEOUT);
            client = io(agent.url, { reconnection: false,
                extraHeaders: { endpoint } });
            client.once("connect_error", error => finish(error));
            client.once("connect", () => {
                client!.emit("login", { username: agent.username,
                    password: agent.password }, (login: RpcResponse) => {
                    if (!login?.ok) {
                        finish(new Error(login?.msg || `${endpoint}: login failed`));
                        return;
                    }
                    client!.emit("agent", endpoint, event, ...args, (response: RpcResponse<T>) => finish(undefined, response));
                });
            });
        });
    }
}
