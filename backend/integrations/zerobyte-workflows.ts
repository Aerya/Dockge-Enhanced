/** Provisioned jobs use official Zerobyte pre/post webhooks, including scheduled runs. */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import express from "express";
import { log } from "../log";
import { DockgeServer } from "../dockge-server";
import { BackupManager } from "../watchers/backup-manager";
import { zerobyte, ZerobyteManager } from "./zerobyte-manager";
import { managedWorkflowContext, probeManagedDestination } from "./zerobyte-installer";
import { isZerobyteApplicationBackupActive, setZerobyteApplicationBackupActive } from "./zerobyte-coordination";

const exec = promisify(execFile);
interface Prepared { stack: string;
    compose: string;
    project: string;
    services: string[] }
interface Workflow {
    id: string;
    name: string;
    token: string;
    source: string;
    destination: string;
    stacks: string[];
    maxMinutes: number;
    cron: string;
    jobId?: string;
    scheduleId?: number;
    blockedTasks?: string[];
}
interface Lease { workflow: string;
    task: string;
    started: number;
    prepared: Prepared[] }
interface Event { workflow: string;
    at: number;
    state: "running" | "success" | "failure" | "recovered";
    detail: string }
interface State { workflows: Workflow[];
    lease?: Lease;
    events: Event[] }
interface Dependencies {
    context: () => ReturnType<typeof managedWorkflowContext>;
    probe: (target: string) => Promise<void>;
    plan: (names: string[]) => Promise<Prepared[]>;
    stop: (plan: Prepared) => Promise<void>;
    restore: (plans: Prepared[]) => Promise<string[]>;
    nativeBusy: () => boolean;
    notify: (message: string) => Promise<void>;
}
export class ZerobyteWorkflows {
    private file: string;
    private busy = false;
    private queue: Promise<void> = Promise.resolve();
    private timer?: NodeJS.Timeout;
    private dependencies: Dependencies;
    constructor(private server: DockgeServer, private manager: ZerobyteManager = zerobyte, dependencies: Partial<Dependencies> = {}) {
        this.file = path.join(server.config.dataDir, "zerobyte-workflows.json");
        this.dependencies = {
            context: () => managedWorkflowContext(server),
            probe: target => probeManagedDestination(server, target),
            plan: names => this.planStacks(names),
            stop: plan => this.compose(plan, [ "stop", ...plan.services ]),
            restore: plans => this.restoreStacks(plans),
            nativeBusy: () => BackupManager.getInstance().isBackupRunActive() || BackupManager.getInstance().isRestoreRunActive(),
            notify: message => BackupManager.getInstance().notifyIntegrationFailure("Zerobyte", message),
            ...dependencies,
        };
    }

    start(): void {
        setZerobyteApplicationBackupActive(true);
        this.timer = setInterval(() => {
            void this.tick().catch(() => {});
        }, 15000);
        this.timer.unref();
        void this.read().then(state => {
            setZerobyteApplicationBackupActive(Boolean(state.lease));
        }).catch(() => {});
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
        }
    }

    private async read(): Promise<State> {
        try {
            return JSON.parse(await fs.readFile(this.file, "utf8")) as State;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return { workflows: [],
                    events: [] };
            }
            throw error;
        }
    }

    private async write(state: State): Promise<void> {
        await fs.mkdir(path.dirname(this.file), { recursive: true });
        const temporary = this.file + "." + randomUUID();
        try {
            await fs.writeFile(temporary, JSON.stringify(state), { mode: 0o600,
                flag: "wx" });
            await fs.rename(temporary, this.file);
        } finally {
            await fs.rm(temporary, { force: true });
        }
    }

    private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
        const previous = this.queue;
        let release!: () => void;
        this.queue = new Promise<void>(resolve => {
            release = resolve;
        });
        await previous;
        this.busy = true;
        try {
            return await operation();
        } finally {
            this.busy = false;
            release();
        }
    }

    async assertCanRun(jobId: string): Promise<void> {
        const state = await this.read();
        if (state.lease || state.workflows.some(w => w.jobId === jobId && w.blockedTasks?.length)) {
            throw new Error("An application backup is active or this workflow awaits acknowledgement");
        }
    }

    async assertIdle(): Promise<void> {
        if ((await this.read()).lease || this.busy) {
            throw new Error("An application backup is active; configuration changes are blocked");
        }
    }

    async status() {
        const state = await this.read();
        return { workflows: state.workflows.map(w => ({ id: w.id,
            name: w.name,
            source: w.source,
            destination: w.destination,
            stacks: w.stacks,
            cron: w.cron,
            maxMinutes: w.maxMinutes,
            jobId: w.jobId,
            blockedTasks: w.blockedTasks ?? [] })),
        active: state.lease ? { workflow: state.lease.workflow,
            started: state.lease.started } : null,
        events: state.events.slice(-30).reverse() };
    }

    private async event(state: State, workflow: Workflow, event: Event["state"], detail: string) {
        state.events.push({ workflow: workflow.id,
            at: Date.now(),
            state: event,
            detail });
        state.events = state.events.slice(-100);
        await this.write(state);
        if (event === "failure") {
            await this.dependencies.notify(`Zerobyte ${workflow.name}: ${detail}`).catch(() => {});
        }
    }

    async plan(input: Record<string, unknown>) {
        const ctx = await this.dependencies.context();
        const source = ctx.localMounts.find((m: { target: string }) => m.target === input.source);
        const destination = ctx.destinationMounts.find((m: { target: string }) => m.target === input.destination);
        const name = typeof input.name === "string" ? input.name.trim() : "";
        const cron = typeof input.cron === "string" ? input.cron.trim() : "0 3 * * *";
        const stacks = Array.isArray(input.stacks) ? input.stacks : [];
        const maxMinutes = Number(input.maxMinutes ?? 30);
        if (!source || !destination || !name || name.length > 60 || !/^[0-9*,/-]+(?:\s+[0-9*,/-]+){4}$/.test(cron) ||
            stacks.length > 12 || stacks.some(s => typeof s !== "string") || !Number.isInteger(maxMinutes) || maxMinutes < 1 || maxMinutes > 120) {
            throw new Error("Invalid provisioning plan: choose one managed source, one destination and a bounded job duration");
        }
        const id = createHash("sha256").update(ctx.owner + source.target + destination.target + name).digest("hex").slice(0, 16);
        // Validate stack ownership and self-protection before presenting the plan.
        await this.dependencies.plan(stacks as string[]);
        return { id,
            name,
            source: source.target,
            destination: destination.target,
            repositoryPath: destination.target + "/enhanced-" + id,
            stacks: [ ...new Set(stacks as string[]) ],
            cron,
            maxMinutes,
            enabled: false,
            automaticRetention: false };
    }

    async provision(input: Record<string, unknown>) {
        return this.exclusive(async () => {
            const state = await this.read();
            if (state.lease) {
                throw new Error("A backup is active");
            }
            if (input.confirmation !== "PROVISION ZEROBYTE") {
                throw new Error("Explicit provisioning confirmation required");
            }
            const plan = await this.plan(input);
            let workflow = state.workflows.find(w => w.id === plan.id);
            const reused = Boolean(workflow?.jobId);
            if (workflow && (workflow.cron !== plan.cron || workflow.maxMinutes !== plan.maxMinutes || JSON.stringify(workflow.stacks) !== JSON.stringify(plan.stacks))) {
                throw new Error("Existing workflow has different settings; use a new plan name rather than silently changing an active policy");
            }
            if (!workflow) {
                workflow = { ...plan,
                    token: randomBytes(32).toString("hex") };
                state.workflows.push(workflow);
                await this.write(state); // Preserve the secret before any upstream resource is created.
            }
            await this.dependencies.probe(plan.destination);
            const ctx = await this.dependencies.context();
            const resources = await this.manager.resources();
            const prefix = `Enhanced ${plan.id}`;
            let volume = resources.volumes.find(v => v.name === prefix + " source");
            if (volume && ((volume.config as { backend?: string;
                path?: string })?.backend !== "directory" || (volume.config as { path?: string }).path !== plan.source)) {
                throw new Error("Existing source name belongs to another configuration");
            }
            volume ??= await this.manager.createVolume(prefix + " source", plan.source);
            let repository = resources.repositories.find(r => r.name === prefix + " repository");
            if (repository && ((repository.config as { backend?: string;
                path?: string })?.backend !== "local" || (repository.config as { path?: string }).path !== `${plan.repositoryPath}/${repository.shortId}`)) {
                throw new Error("Existing repository name belongs to another configuration");
            }
            repository ??= await this.manager.createRepository(prefix + " repository", plan.repositoryPath);
            const hooks = Object.fromEntries([ "pre", "post" ].map(phase => [ phase, {
                url: `${ctx.callbackOrigin}/api/watcher/zerobyte/hooks/${plan.id}/${phase}`,
                headers: [ `Authorization: Bearer ${workflow!.token}` ],
            }]));
            let job = resources.jobs.find(j => j.name === prefix + " job");
            if (job && ((typeof job.enabled !== "boolean" || (!reused && job.enabled !== false)) || job.volumeId !== volume.id || job.repositoryId !== repository.id ||
                JSON.stringify(job.backupWebhooks) !== JSON.stringify(hooks))) {
                throw new Error("Existing job is not owned by this provisioning plan");
            }
            job ??= await this.manager.createWorkflowJob({ name: prefix + " job",
                volumeId: volume.id,
                repositoryId: repository.shortId,
                cronExpression: plan.cron,
                backupWebhooks: hooks,
                maxRetries: 0 });
            if (typeof job.shortId !== "string" || typeof job.id !== "number") {
                throw new Error("Unsupported created job schema");
            }
            workflow.jobId = job.shortId;
            workflow.scheduleId = job.id;
            await this.write(state);
            return { id: workflow.id,
                jobId: workflow.jobId,
                reused };
        });
    }

    async hook(workflowId: string, phase: string, authorization: string, body: Record<string, unknown>) {
        return this.exclusive(async () => {
            const state = await this.read();
            const workflow = state.workflows.find(w => w.id === workflowId);
            const received = Buffer.from(authorization);
            const expected = Buffer.from(`Bearer ${workflow?.token ?? ""}`);
            if (!workflow || received.length !== expected.length || !timingSafeEqual(received, expected)) {
                throw new Error("Invalid workflow credential");
            }
            if (typeof workflow.jobId !== "string" || String(body.scheduleId) !== workflow.jobId || typeof body.jobId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(body.jobId) || body.sourcePath !== workflow.source) {
                throw new Error("Workflow context mismatch");
            }
            if (workflow.blockedTasks?.length) {
                throw new Error("Workflow paused after an interrupted backup; verify cancellation and acknowledge its alert");
            }
            if (phase === "pre") {
                if (state.lease?.task === body.jobId && state.lease.workflow === workflow.id) {
                    return;
                }
                if (state.lease || this.dependencies.nativeBusy() || isZerobyteApplicationBackupActive()) {
                    throw new Error("Another application backup or native restore is active");
                }
                const lease: Lease = { workflow: workflow.id,
                    task: body.jobId,
                    started: Date.now(),
                    prepared: [] };
                setZerobyteApplicationBackupActive(true);
                state.lease = lease;
                await this.write(state);
                try {
                    const assertTaskActive = async () => {
                        const task = await this.manager.task(lease.task);
                        if (task.kind !== "backup" || task.resourceId !== workflow.jobId || ![ "running", "queued" ].includes(String(task.status))) {
                            throw new Error("Backup task is no longer active or belongs to another workflow");
                        }
                    };
                    await assertTaskActive();
                    // Check storage before stopping applications. A lost mount never means local fallback.
                    await this.dependencies.probe(workflow.destination);
                    const plans = await this.dependencies.plan(workflow.stacks);
                    for (const plan of plans) {
                        await assertTaskActive();
                        lease.prepared.push(plan);
                        await this.write(state); // Journal before each stop, so restart can recover a partial stop.
                        if (plan.services.length) {
                            await this.dependencies.stop(plan);
                        }
                    }
                    await assertTaskActive();
                    await this.event(state, workflow, "running", "Backup admitted; destination checked and selected services prepared");
                } catch (error) {
                    await this.finish(state, workflow, false, error instanceof Error ? error.message : "Pre-backup check failed");
                    throw error;
                }
            } else if (phase === "post") {
                if (!state.lease || state.lease.task !== body.jobId || state.lease.workflow !== workflow.id) {
                    return;
                }
                let success = body.status === "success";
                if (success) {
                    try {
                        await this.dependencies.probe(workflow.destination);
                    } catch {
                        success = false;
                    }
                }
                await this.finish(state, workflow, success, success ? "Backup completed; selected services restarted" : "Backup failed, cancelled or storage unavailable; selected services restarted");
                if (!success) {
                    throw new Error("Backup has a failure alert; no local fallback and no automatic retention from Enhanced");
                }
            } else {
                throw new Error("Unknown workflow phase");
            }
        });
    }

    private async finish(state: State, workflow: Workflow, success: boolean, detail: string) {
        const errors = await this.dependencies.restore(state.lease?.prepared ?? []);
        if (errors.length) {
            await this.event(state, workflow, "failure", "Service restart requires operator attention");
            throw new Error("Service restart failed; recovery journal retained");
        }
        delete state.lease;
        setZerobyteApplicationBackupActive(false);
        await this.event(state, workflow, success ? "success" : "failure", detail);
    }

    async tick(): Promise<void> {
        if (this.busy) {
            return;
        }
        await this.exclusive(async () => {
            const state = await this.read();
            if (!state.lease) {
                return;
            }
            setZerobyteApplicationBackupActive(true);
            const workflow = state.workflows.find(w => w.id === state.lease!.workflow);
            if (!workflow) {
                throw new Error("Recovery journal has no matching workflow");
            }
            try {
                const task = await this.manager.task(state.lease.task);
                if ([ "failed", "cancelled", "stale", "succeeded" ].includes(String(task.status))) {
                    await this.finish(state, workflow, false, "Missing post-hook: services recovered; inspect Zerobyte task before trusting the backup");
                    return;
                }
            } catch { /* Unreachable API does not permit claiming success; deadline still applies. */ }
            try {
                await this.dependencies.probe(workflow.destination);
            } catch {
                workflow.blockedTasks = [ ...new Set([ ...(workflow.blockedTasks ?? []), state.lease.task ]) ];
                await this.event(state, workflow, "failure", "Destination outage detected: backup cancellation requested, no local fallback");
                await this.manager.cancelTask(state.lease.task).catch(() => {});
                await this.finish(state, workflow, false, "Destination unavailable: services recovered; do not trust this backup and verify cancellation before acknowledging");
                return;
            }
            if (Date.now() - state.lease.started > workflow.maxMinutes * 60000) {
                workflow.blockedTasks = [ ...new Set([ ...(workflow.blockedTasks ?? []), state.lease.task ]) ];
                await this.write(state);
                await this.manager.cancelTask(state.lease.task).catch(() => {});
                await this.finish(state, workflow, false, "Backup deadline exceeded: cancellation requested and services recovered; verify remote task cancellation");
            }
        });
    }

    async acknowledge(workflowId: string, confirmation: unknown): Promise<void> {
        if (confirmation !== "ACKNOWLEDGE WORKFLOW") {
            throw new Error("Explicit workflow acknowledgement required");
        }
        await this.exclusive(async () => {
            const state = await this.read();
            const workflow = state.workflows.find(w => w.id === workflowId);
            if (!workflow || state.lease) {
                throw new Error("Workflow is unknown or still active");
            }
            for (const taskId of workflow.blockedTasks ?? []) {
                const task = await this.manager.task(taskId);
                if (![ "failed", "cancelled", "stale", "succeeded" ].includes(String(task.status))) {
                    throw new Error("Interrupted task cancellation is not confirmed; workflow remains paused");
                }
            }
            workflow.blockedTasks = [];
            await this.event(state, workflow, "recovered", "Operator acknowledged the interrupted backup after checking task termination; inspect any resulting snapshot before use");
        });
    }

    async listStacks(): Promise<string[]> {
        const entries = await fs.readdir(this.server.stacksDir, { withFileTypes: true });
        const result: string[] = [];
        for (const entry of entries.filter(e => e.isDirectory() && !/^zerobyte-[a-f0-9]{12}$/.test(e.name))) {
            try {
                await this.planStacks([ entry.name ]);
                result.push(entry.name);
            } catch { /* Unsafe or unrelated project. */ }
        }
        return result;
    }

    private async compose(plan: Prepared, args: string[]): Promise<void> {
        try {
            await exec("docker", [ "compose", "-p", plan.project, "-f", plan.compose, ...args ], { cwd: path.dirname(plan.compose),
                timeout: 30000,
                maxBuffer: 4096 });
        } catch {
            throw new Error("Scoped Compose operation failed");
        }
    }

    private async planStacks(names: string[]): Promise<Prepared[]> {
        const plans: Prepared[] = [];
        const root = await fs.realpath(this.server.stacksDir);
        for (const name of names) {
            if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name) || /^zerobyte-[a-f0-9]{12}$/.test(name)) {
                throw new Error("Invalid or protected stack name");
            }
            const directory = await fs.realpath(path.join(root, name));
            if (path.dirname(directory) !== root) {
                throw new Error("Stack escapes the managed directory");
            }
            let compose = "";
            for (const file of [ "compose.yaml", "compose.yml", "docker-compose.yml", "docker-compose.yaml" ]) {
                try {
                    const candidate = await fs.realpath(path.join(directory, file));
                    if (path.dirname(candidate) === directory) {
                        compose = candidate;
                        break;
                    }
                } catch { /* next */ }
            }
            if (!compose) {
                throw new Error("Managed Compose file missing");
            }
            const { stdout } = await exec("docker", [ "compose", "-f", compose, "ps", "-q", "--status", "running" ], { cwd: directory,
                timeout: 10000 });
            const ids = stdout.trim().split(/\s+/).filter(Boolean);
            const services: string[] = [];
            let project = name;
            if (ids.length) {
                const containers = JSON.parse((await exec("docker", [ "inspect", ...ids ], { timeout: 10000 })).stdout);
                for (const container of containers) {
                    const labels = container.Config?.Labels ?? {};
                    if (container.Config?.Image?.includes("dockge") || labels["org.opencontainers.image.source"] === "https://github.com/Aerya/Dockge-Enhanced" || labels["net.dockge-enhanced.zerobyte-owner"] ||
                        !String(labels["com.docker.compose.project.config_files"] || "").split(",").includes(compose)) {
                        throw new Error("Refusing to stop Enhanced, Zerobyte or a project outside this managed stack");
                    }
                    project = labels["com.docker.compose.project"];
                    const service = labels["com.docker.compose.service"];
                    if (!/^[A-Za-z0-9_.-]+$/.test(service) || !/^[A-Za-z0-9_-]+$/.test(project)) {
                        throw new Error("Invalid Compose identity");
                    }
                    services.push(service);
                }
            }
            plans.push({ stack: name,
                compose,
                project,
                services: [ ...new Set(services) ] });
        }
        return plans;
    }

    private async restoreStacks(plans: Prepared[]): Promise<string[]> {
        const errors: string[] = [];
        for (const plan of [ ...plans ].reverse()) {
            if (plan.services.length) {
                try {
                    await this.compose(plan, [ "start", ...plan.services ]);
                } catch {
                    errors.push(plan.stack);
                }
            }
        }
        return errors;
    }
}
const instances = new WeakMap<DockgeServer, ZerobyteWorkflows>();
export function workflowsFor(server: DockgeServer): ZerobyteWorkflows {
    let instance = instances.get(server);
    if (!instance) {
        instance = new ZerobyteWorkflows(server);
        instances.set(server, instance);
        instance.start();
    }
    return instance;
}
export function createZerobyteHookRouter(server: DockgeServer) {
    const router = express.Router();
    router.post("/zerobyte/hooks/:workflow/:phase", express.json({ limit: "16kb" }), async (req, res) => {
        try {
            await workflowsFor(server).hook(req.params.workflow, req.params.phase, req.headers.authorization ?? "", req.body ?? {});
            res.json({ ok: true });
        } catch (error) {
            log.warn("zerobyte", `Workflow ${req.params.phase} rejected: ${error instanceof Error ? error.message : "operation failed"}`);
            res.status(403).json({ ok: false,
                message: error instanceof Error ? error.message : "Workflow rejected" });
        }
    });
    return router;
}
