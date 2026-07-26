import { createHash, randomBytes } from "node:crypto";
import { Request } from "express";
import childProcessAsync from "promisify-child-process";
import { R } from "redbean-node";
import { RUNNING } from "../../common/util-common";
import { AuditLogger } from "../audit-log";
import { DockgeServer } from "../dockge-server";
import { Stack } from "../stack";
import { ValidationError } from "../util-server";
import { BackupManager } from "../watchers/backup-manager";

export const STACK_ACTIONS = [
    "start",
    "stop",
    "restart",
    "update",
    "recreate",
    "pull-recreate",
    "build-recreate",
    "backup",
] as const;

export type StackAutomationAction = typeof STACK_ACTIONS[number];

export const AUTOMATION_PERMISSIONS = [
    "stack:read",
    ...STACK_ACTIONS.map(action => `stack:${action}` as const),
    "history:read",
] as const;

export type AutomationPermission = typeof AUTOMATION_PERMISSIONS[number];

interface AutomationTokenRow {
    id: number;
    name: string;
    prefix: string;
    secret_hash: string;
    permissions: string;
    stacks: string;
    created_at: string;
    expires_at: string | null;
    last_used_at: string | null;
    revoked_at: string | null;
}

interface AutomationWebhookRow {
    id: number;
    name: string;
    prefix: string;
    secret_hash: string;
    stack_name: string;
    actions: string;
    enabled: number | boolean;
    rate_limit_per_minute: number;
    created_at: string;
    expires_at: string | null;
    last_used_at: string | null;
    rotated_at: string | null;
}

export interface AutomationIdentity {
    id: number;
    name: string;
    prefix: string;
    permissions: AutomationPermission[];
    stacks: string[];
}

export interface WebhookIdentity {
    id: number;
    name: string;
    prefix: string;
    stack: string;
    actions: StackAutomationAction[];
}

interface RateWindow {
    startedAt: number;
    count: number;
}

const API_RATE_LIMIT_PER_MINUTE = 60;
const MAX_OUTPUT_LENGTH = 64 * 1024;
const rateWindows = new Map<string, RateWindow>();

function hashSecret(value: string): string {
    return createHash("sha256").update(value).digest("hex");
}

function parseJsonList<T extends string>(value: string): T[] {
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter(item => typeof item === "string") as T[] : [];
    } catch {
        return [];
    }
}

function normalizeStackName(value: unknown): string {
    const stack = String(value ?? "").trim();
    if (!/^[a-z0-9_-]+$/.test(stack)) {
        throw new ValidationError("Invalid stack name");
    }
    return stack;
}

function normalizeExpiration(value: unknown): string | null {
    if (value === undefined || value === null || value === "") {
        return null;
    }
    const date = new Date(String(value));
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
        throw new ValidationError("Expiration must be a valid future date");
    }
    return date.toISOString();
}

function enforceRateLimit(key: string, limit: number): void {
    const now = Date.now();
    const current = rateWindows.get(key);
    if (!current || now - current.startedAt >= 60_000) {
        rateWindows.set(key, { startedAt: now,
            count: 1 });
        return;
    }
    if (current.count >= limit) {
        throw new AutomationRateLimitError();
    }
    current.count += 1;
}

function extractApiToken(req: Request): string {
    const authorization = req.header("authorization") ?? "";
    if (/^Bearer\s+/i.test(authorization)) {
        return authorization.replace(/^Bearer\s+/i, "").trim();
    }
    return (req.header("x-api-key") ?? "").trim();
}

function safeOutput(value: unknown): string {
    const text = String(value ?? "")
        .replace(/\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\))/g, "")
        .replace(/\r/g, "\n")
        .replace(/\n{3,}/g, "\n\n");
    return text.length > MAX_OUTPUT_LENGTH
        ? `${text.slice(0, MAX_OUTPUT_LENGTH)}\n[output truncated]`
        : text;
}

function isExpired(value: string | null): boolean {
    return Boolean(value && new Date(value).getTime() <= Date.now());
}

export class AutomationRateLimitError extends Error {
    constructor() {
        super("Rate limit exceeded");
        this.name = "AutomationRateLimitError";
    }
}

export class AutomationManager {
    private static instance?: AutomationManager;

    static getInstance(): AutomationManager {
        if (!AutomationManager.instance) {
            AutomationManager.instance = new AutomationManager();
        }
        return AutomationManager.instance;
    }

    async createToken(input: {
        name?: unknown;
        permissions?: unknown;
        stacks?: unknown;
        expiresAt?: unknown;
    }) {
        const name = String(input.name ?? "").trim();
        if (!name || name.length > 120) {
            throw new ValidationError("Token name is required and must not exceed 120 characters");
        }
        const permissions = Array.isArray(input.permissions)
            ? [ ...new Set(input.permissions.map(String)) ]
            : [];
        if (permissions.length === 0 || permissions.some(permission => !AUTOMATION_PERMISSIONS.includes(permission as AutomationPermission))) {
            throw new ValidationError("At least one valid permission is required");
        }
        const stacks = Array.isArray(input.stacks)
            ? [ ...new Set(input.stacks.map(String).map(value => value.trim()).filter(Boolean)) ]
            : [];
        if (stacks.length === 0 || stacks.some(stack => stack !== "*" && !/^[a-z0-9_-]+$/.test(stack))) {
            throw new ValidationError("At least one valid stack or * is required");
        }
        const expiresAt = normalizeExpiration(input.expiresAt);
        const prefix = randomBytes(6).toString("hex");
        const token = `dge_${prefix}_${randomBytes(32).toString("base64url")}`;
        const now = new Date().toISOString();
        const [ id ] = await R.knex("automation_token").insert({
            name,
            prefix,
            secret_hash: hashSecret(token),
            permissions: JSON.stringify(permissions),
            stacks: JSON.stringify(stacks),
            created_at: now,
            expires_at: expiresAt,
            last_used_at: null,
            revoked_at: null,
        });
        return {
            token,
            item: await this.getTokenById(Number(id)),
        };
    }

    async listTokens() {
        const rows = await R.knex("automation_token").select("*").orderBy("id", "desc") as AutomationTokenRow[];
        return rows.map(row => this.safeToken(row));
    }

    async revokeToken(id: number) {
        const updated = await R.knex("automation_token")
            .where({ id })
            .whereNull("revoked_at")
            .update({ revoked_at: new Date().toISOString() });
        if (!updated) {
            throw new ValidationError("Token not found or already revoked");
        }
        return await this.getTokenById(id);
    }

    async authenticateToken(req: Request): Promise<AutomationIdentity> {
        const token = extractApiToken(req);
        if (!token || !/^dge_[a-f0-9]{12}_[A-Za-z0-9_-]+$/.test(token)) {
            throw new AutomationAuthenticationError();
        }
        const row = await R.knex("automation_token")
            .where({ secret_hash: hashSecret(token) })
            .whereNull("revoked_at")
            .first() as AutomationTokenRow | undefined;
        if (!row || isExpired(row.expires_at)) {
            throw new AutomationAuthenticationError();
        }
        enforceRateLimit(`api:${row.id}`, API_RATE_LIMIT_PER_MINUTE);
        const lastUsedAt = new Date().toISOString();
        await R.knex("automation_token").where({ id: row.id }).update({ last_used_at: lastUsedAt });
        return {
            id: row.id,
            name: row.name,
            prefix: row.prefix,
            permissions: parseJsonList<AutomationPermission>(row.permissions),
            stacks: parseJsonList<string>(row.stacks),
        };
    }

    assertAccess(identity: AutomationIdentity, permission: AutomationPermission, stack?: string): void {
        if (!identity.permissions.includes(permission)) {
            throw new AutomationAuthorizationError(`Missing permission: ${permission}`);
        }
        if (stack && !identity.stacks.includes("*") && !identity.stacks.includes(stack)) {
            throw new AutomationAuthorizationError("Token is not allowed to access this stack");
        }
    }

    async createWebhook(input: {
        name?: unknown;
        stack?: unknown;
        actions?: unknown;
        expiresAt?: unknown;
        rateLimitPerMinute?: unknown;
    }) {
        const name = String(input.name ?? "").trim();
        if (!name || name.length > 120) {
            throw new ValidationError("Webhook name is required and must not exceed 120 characters");
        }
        const stack = normalizeStackName(input.stack);
        const actions = Array.isArray(input.actions)
            ? [ ...new Set(input.actions.map(String)) ]
            : [];
        if (actions.length === 0 || actions.some(action => !STACK_ACTIONS.includes(action as StackAutomationAction))) {
            throw new ValidationError("At least one valid webhook action is required");
        }
        const rateLimitPerMinute = Math.trunc(Number(input.rateLimitPerMinute ?? 10));
        if (!Number.isInteger(rateLimitPerMinute) || rateLimitPerMinute < 1 || rateLimitPerMinute > 60) {
            throw new ValidationError("Webhook rate limit must be between 1 and 60 requests per minute");
        }
        await this.assertStackExists(stack);
        const expiresAt = normalizeExpiration(input.expiresAt);
        const now = new Date().toISOString();
        const secret = randomBytes(32).toString("base64url");
        const placeholderHash = hashSecret(`pending:${secret}:${now}`);
        const [ id ] = await R.knex("automation_webhook").insert({
            name,
            prefix: "",
            secret_hash: placeholderHash,
            stack_name: stack,
            actions: JSON.stringify(actions),
            enabled: true,
            rate_limit_per_minute: rateLimitPerMinute,
            created_at: now,
            expires_at: expiresAt,
            last_used_at: null,
            rotated_at: null,
        });
        const token = `dwh_${Number(id)}_${secret}`;
        const prefix = `dwh_${Number(id)}`;
        await R.knex("automation_webhook").where({ id }).update({
            prefix,
            secret_hash: hashSecret(token),
        });
        return {
            token,
            item: await this.getWebhookById(Number(id)),
        };
    }

    async listWebhooks() {
        const rows = await R.knex("automation_webhook").select("*").orderBy("id", "desc") as AutomationWebhookRow[];
        return rows.map(row => this.safeWebhook(row));
    }

    async setWebhookEnabled(id: number, enabled: boolean) {
        const updated = await R.knex("automation_webhook").where({ id }).update({ enabled });
        if (!updated) {
            throw new ValidationError("Webhook not found");
        }
        return await this.getWebhookById(id);
    }

    async rotateWebhook(id: number) {
        const row = await R.knex("automation_webhook").where({ id }).first() as AutomationWebhookRow | undefined;
        if (!row) {
            throw new ValidationError("Webhook not found");
        }
        const token = `dwh_${id}_${randomBytes(32).toString("base64url")}`;
        await R.knex("automation_webhook").where({ id }).update({
            prefix: `dwh_${id}`,
            secret_hash: hashSecret(token),
            rotated_at: new Date().toISOString(),
        });
        return {
            token,
            item: await this.getWebhookById(id),
        };
    }

    async authenticateWebhook(token: string, action: string): Promise<WebhookIdentity> {
        const match = /^dwh_(\d+)_([A-Za-z0-9_-]+)$/.exec(token);
        if (!match) {
            throw new AutomationAuthenticationError();
        }
        const id = Number(match[1]);
        const row = await R.knex("automation_webhook").where({ id }).first() as AutomationWebhookRow | undefined;
        if (!row || !row.enabled || isExpired(row.expires_at) || row.secret_hash !== hashSecret(token)) {
            throw new AutomationAuthenticationError();
        }
        const actions = parseJsonList<StackAutomationAction>(row.actions);
        if (!STACK_ACTIONS.includes(action as StackAutomationAction) || !actions.includes(action as StackAutomationAction)) {
            throw new AutomationAuthorizationError("Webhook action is not allowed");
        }
        enforceRateLimit(`webhook:${row.id}`, row.rate_limit_per_minute);
        await R.knex("automation_webhook").where({ id }).update({ last_used_at: new Date().toISOString() });
        return {
            id: row.id,
            name: row.name,
            prefix: row.prefix,
            stack: row.stack_name,
            actions,
        };
    }

    async listStacks(server: DockgeServer) {
        const stacks = await Stack.getStackList(server);
        return [ ...stacks.values() ].map(stack => stack.toSimpleJSON(""));
    }

    async getStack(server: DockgeServer, name: string) {
        const stack = await Stack.getStack(server, normalizeStackName(name));
        await stack.updateStatus();
        return stack.toSimpleJSON("");
    }

    async runStackAction(
        server: DockgeServer,
        stackName: string,
        action: StackAutomationAction,
        context: {
            origin: "api" | "webhook";
            actor: string;
            ip?: string | null;
            endpoint?: string | null;
        },
    ) {
        const name = normalizeStackName(stackName);
        if (!STACK_ACTIONS.includes(action)) {
            throw new ValidationError("Unsupported stack action");
        }
        const startedAt = Date.now();
        let output = "";
        try {
            if (action === "backup") {
                const backup = await BackupManager.getInstance().runBackup({
                    trigger: "manual",
                    tag: `stack-${name}`,
                    stackName: name,
                });
                output = backup.error ?? `Backup ${backup.success ? "completed" : "failed"}`;
                if (!backup.success) {
                    throw new Error(output);
                }
            } else {
                const stack = await Stack.getStack(server, name);
                output = await this.runComposeAction(stack, action);
            }
            const durationMs = Date.now() - startedAt;
            await AuditLogger.getInstance().log({
                action: `stack.${action.replace(/-/g, "_")}`,
                category: "automation",
                targetType: "stack",
                target: name,
                username: context.actor,
                ip: context.ip,
                endpoint: context.endpoint,
                message: safeOutput(output).slice(0, 2000) || null,
                metadata: {
                    origin: context.origin,
                    durationMs,
                    output: safeOutput(output),
                    rollback: null,
                },
            });
            server.sendStackList();
            return {
                stack: name,
                action,
                success: true,
                durationMs,
                output: safeOutput(output),
            };
        } catch (error) {
            const durationMs = Date.now() - startedAt;
            const message = error instanceof Error ? error.message : String(error);
            await AuditLogger.getInstance().log({
                action: `stack.${action.replace(/-/g, "_")}`,
                category: "automation",
                targetType: "stack",
                target: name,
                username: context.actor,
                ip: context.ip,
                endpoint: context.endpoint,
                status: "failure",
                message,
                metadata: {
                    origin: context.origin,
                    durationMs,
                    output: safeOutput(output),
                    rollback: null,
                },
            });
            throw error;
        }
    }

    private async runComposeAction(stack: Stack, action: Exclude<StackAutomationAction, "backup">): Promise<string> {
        const outputs: string[] = [];
        const run = async (command: string, ...args: string[]) => {
            const result = await childProcessAsync.spawn(
                "docker",
                stack.getComposeOptions(command, ...args),
                {
                    cwd: stack.fullPath,
                    encoding: "utf-8",
                    maxBuffer: MAX_OUTPUT_LENGTH * 2,
                },
            );
            const stdout = result.stdout?.toString() ?? "";
            const stderr = result.stderr?.toString() ?? "";
            outputs.push([ stdout, stderr ].filter(Boolean).join("\n"));
            const code = result.code ?? 0;
            if (code !== 0) {
                throw new Error(`docker compose ${command} failed with exit code ${code}`);
            }
        };

        if (action === "start") {
            await run("up", "-d", "--remove-orphans");
        } else if (action === "stop") {
            await run("stop");
        } else if (action === "restart") {
            await run("restart");
        } else if (action === "recreate") {
            await run("up", "-d", "--force-recreate", "--remove-orphans");
        } else if (action === "pull-recreate") {
            await run("pull");
            await run("up", "-d", "--force-recreate", "--remove-orphans");
        } else if (action === "build-recreate") {
            const buildServices = stack.getBuildServices();
            if (buildServices.length === 0) {
                throw new ValidationError("This stack has no service with a build configuration");
            }
            await run("build", "--pull", ...buildServices);
            await run("up", "-d", "--remove-orphans");
        } else {
            await stack.updateStatus();
            const wasRunning = stack.status === RUNNING;
            await run("pull");
            if (wasRunning) {
                await run("up", "-d", "--remove-orphans");
            }
        }
        return outputs.join("\n").trim();
    }

    private async assertStackExists(stack: string): Promise<void> {
        const server = AutomationServerRegistry.get();
        await Stack.getStack(server, stack);
    }

    private safeToken(row: AutomationTokenRow) {
        return {
            id: row.id,
            name: row.name,
            prefix: row.prefix,
            permissions: parseJsonList<AutomationPermission>(row.permissions),
            stacks: parseJsonList<string>(row.stacks),
            createdAt: row.created_at,
            expiresAt: row.expires_at,
            lastUsedAt: row.last_used_at,
            revokedAt: row.revoked_at,
        };
    }

    private safeWebhook(row: AutomationWebhookRow) {
        return {
            id: row.id,
            name: row.name,
            prefix: row.prefix,
            stack: row.stack_name,
            actions: parseJsonList<StackAutomationAction>(row.actions),
            enabled: Boolean(row.enabled),
            rateLimitPerMinute: row.rate_limit_per_minute,
            createdAt: row.created_at,
            expiresAt: row.expires_at,
            lastUsedAt: row.last_used_at,
            rotatedAt: row.rotated_at,
        };
    }

    private async getTokenById(id: number) {
        const row = await R.knex("automation_token").where({ id }).first() as AutomationTokenRow | undefined;
        if (!row) {
            throw new ValidationError("Token not found");
        }
        return this.safeToken(row);
    }

    private async getWebhookById(id: number) {
        const row = await R.knex("automation_webhook").where({ id }).first() as AutomationWebhookRow | undefined;
        if (!row) {
            throw new ValidationError("Webhook not found");
        }
        return this.safeWebhook(row);
    }
}

export class AutomationAuthenticationError extends Error {
    constructor() {
        super("Invalid or expired automation credential");
        this.name = "AutomationAuthenticationError";
    }
}

export class AutomationAuthorizationError extends Error {
    constructor(message = "Automation credential is not allowed to perform this action") {
        super(message);
        this.name = "AutomationAuthorizationError";
    }
}

class AutomationServerRegistry {
    private static server?: DockgeServer;

    static set(server: DockgeServer): void {
        AutomationServerRegistry.server = server;
    }

    static get(): DockgeServer {
        if (!AutomationServerRegistry.server) {
            throw new Error("Automation server is not initialized");
        }
        return AutomationServerRegistry.server;
    }
}

export function registerAutomationServer(server: DockgeServer): void {
    AutomationServerRegistry.set(server);
}
