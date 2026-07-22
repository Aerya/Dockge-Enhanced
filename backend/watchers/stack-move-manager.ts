import { Settings } from "../settings";
import { ValidationError } from "../util-server";

const SETTINGS_KEY = "pendingStackMoves";

export interface PendingStackMove {
    id: string;
    sourceEndpoint: string;
    sourceStackName: string;
    targetEndpoint: string;
    targetName: string;
    runningServices: string[];
    dataTransfer: boolean;
    status: "pending" | "finalized" | "rolled-back";
    createdAt: string;
    updatedAt: string;
}

export interface PendingStackMoveInput {
    sourceEndpoint: string;
    sourceStackName: string;
    targetEndpoint: string;
    targetName: string;
    runningServices: string[];
    dataTransfer: boolean;
}

function stackName(value: unknown, field: string): string {
    if (typeof value !== "string" || !/^[a-z0-9_-]+$/.test(value)) {
        throw new ValidationError(`Invalid ${field}`);
    }
    return value;
}

function endpoint(value: unknown, field: string): string {
    if (typeof value !== "string" || value.length > 512) {
        throw new ValidationError(`Invalid ${field}`);
    }
    return value;
}

export class StackMoveManager {
    private static instance?: StackMoveManager;

    static getInstance(): StackMoveManager {
        this.instance ||= new StackMoveManager();
        return this.instance;
    }

    private async read(): Promise<PendingStackMove[]> {
        const value = await Settings.get(SETTINGS_KEY);
        return Array.isArray(value) ? value as PendingStackMove[] : [];
    }

    private async write(value: PendingStackMove[]): Promise<void> {
        await Settings.set(SETTINGS_KEY, value.slice(0, 100), "stack-move");
    }

    async list(sourceEndpoint: string, sourceStackName: string): Promise<PendingStackMove[]> {
        return (await this.read()).filter(item => item.sourceEndpoint === sourceEndpoint && item.sourceStackName === sourceStackName && item.status === "pending");
    }

    async save(raw: PendingStackMoveInput): Promise<PendingStackMove> {
        const input = {
            sourceEndpoint: endpoint(raw.sourceEndpoint, "source endpoint"),
            sourceStackName: stackName(raw.sourceStackName, "source stack"),
            targetEndpoint: endpoint(raw.targetEndpoint, "target endpoint"),
            targetName: stackName(raw.targetName, "target stack"),
            runningServices: Array.isArray(raw.runningServices) && raw.runningServices.every(item => typeof item === "string") ? raw.runningServices : [],
            dataTransfer: raw.dataTransfer === true,
        };
        const records = await this.read();
        const existing = records.find(item => item.status === "pending" && item.sourceEndpoint === input.sourceEndpoint && item.sourceStackName === input.sourceStackName);
        const now = new Date().toISOString();
        const record: PendingStackMove = { ...(existing || {} as PendingStackMove),
            ...input,
            id: existing?.id || `move-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
            status: "pending",
            createdAt: existing?.createdAt || now,
            updatedAt: now };
        await this.write([ record, ...records.filter(item => item.id !== record.id) ]);
        return record;
    }

    async complete(id: string, status: "finalized" | "rolled-back"): Promise<PendingStackMove> {
        const records = await this.read();
        const record = records.find(item => item.id === id);
        if (!record || record.status !== "pending") {
            throw new ValidationError("Pending stack move not found");
        }
        record.status = status;
        record.updatedAt = new Date().toISOString();
        await this.write(records);
        return record;
    }
}
