import path from "path";
import * as fs from "node:fs";
import { Cron } from "croner";
import { AuditLogger } from "../audit-log";
import { DockgeServer } from "../dockge-server";
import { log } from "../log";
import { Stack } from "../stack";

const DATA_DIR = process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data";
const SETTINGS_PATH = path.join(DATA_DIR, "stack-schedules.json");

export type ScheduleMode = "off" | "daily" | "weekly" | "biweekly" | "monthly" | "custom";
export type ScheduleAction = "start" | "stop";

export interface ScheduleRule {
    mode: ScheduleMode;
    time?: string;
    weekday?: number;
    dayOfMonth?: number;
    anchorDate?: string;
    cron?: string;
}

export interface ScheduleExecution {
    timestamp: string;
    success: boolean;
    error?: string;
}

export interface StackSchedule {
    start: ScheduleRule;
    stop: ScheduleRule;
    lastStart?: ScheduleExecution;
    lastStop?: ScheduleExecution;
}

export interface StackScheduleView extends StackSchedule {
    stack: string;
    nextStart: string | null;
    nextStop: string | null;
}

const OFF_RULE: ScheduleRule = { mode: "off" };
const MODES = new Set<ScheduleMode>([ "off", "daily", "weekly", "biweekly", "monthly", "custom" ]);

function validTime(value: unknown): value is string {
    return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validDate(value: unknown): value is string {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }
    const [ year, month, day ] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day, 12);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function weekdayForDate(value: string): number {
    const [ year, month, day ] = value.split("-").map(Number);
    return new Date(year, month - 1, day).getDay();
}

function dateNumber(date: Date): number {
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function anchorNumber(value: string): number {
    const [ year, month, day ] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
}

export class StackScheduler {
    private static instance?: StackScheduler;
    private server?: DockgeServer;
    private schedules: Record<string, StackSchedule> = {};
    private jobs = new Map<string, Cron>();
    private runningStacks = new Set<string>();
    private timezone = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    static getInstance(): StackScheduler {
        if (!StackScheduler.instance) {
            StackScheduler.instance = new StackScheduler();
        }
        return StackScheduler.instance;
    }

    async start(server: DockgeServer): Promise<void> {
        this.server = server;
        this.load();
        this.reschedule();
    }

    async list(): Promise<{ timezone: string; schedules: StackScheduleView[] }> {
        if (!this.server) {
            return { timezone: this.timezone,
                schedules: [] };
        }
        const stackList = await Stack.getStackList(this.server, true);
        const names = [ ...stackList.keys() ].sort((a, b) => a.localeCompare(b));
        return {
            timezone: this.timezone,
            schedules: names.map(stack => this.viewFor(stack)),
        };
    }

    get(stack: string): StackScheduleView {
        return this.viewFor(stack);
    }

    async save(stack: string, input: { start?: ScheduleRule; stop?: ScheduleRule }): Promise<StackScheduleView> {
        await this.assertLocalStack(stack);
        const previous = this.schedules[stack];
        this.schedules[stack] = {
            start: this.normalizeRule(input.start),
            stop: this.normalizeRule(input.stop),
            ...(previous?.lastStart ? { lastStart: previous.lastStart } : {}),
            ...(previous?.lastStop ? { lastStop: previous.lastStop } : {}),
        };
        this.persist();
        this.reschedule();
        return this.viewFor(stack);
    }

    async clear(stack: string): Promise<void> {
        await this.assertLocalStack(stack);
        delete this.schedules[stack];
        this.persist();
        this.reschedule();
    }

    private load(): void {
        try {
            this.schedules = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
        } catch {
            this.schedules = {};
        }
    }

    private persist(): void {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(this.schedules, null, 2), { mode: 0o600 });
        fs.chmodSync(SETTINGS_PATH, 0o600);
    }

    private normalizeRule(input?: ScheduleRule): ScheduleRule {
        const mode = input?.mode ?? "off";
        if (!MODES.has(mode)) {
            throw new Error("Mode de planification invalide");
        }
        if (mode === "off") {
            return { ...OFF_RULE };
        }

        if (mode === "custom") {
            const expression = String(input?.cron ?? "").trim();
            if (expression.split(/\s+/).length !== 5) {
                throw new Error("Le cron libre doit contenir exactement 5 champs");
            }
            const probe = new Cron(expression, { paused: true,
                timezone: this.timezone });
            const next = probe.nextRun();
            probe.stop();
            if (!next) {
                throw new Error("Expression cron invalide");
            }
            return { mode,
                cron: expression };
        }

        const time = input?.time;
        if (!validTime(time)) {
            throw new Error("Heure invalide");
        }
        if (mode === "daily") {
            return { mode,
                time };
        }

        if (mode === "weekly") {
            const weekday = Number(input?.weekday);
            if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
                throw new Error("Jour de semaine invalide");
            }
            return { mode,
                time,
                weekday };
        }

        if (mode === "biweekly") {
            const anchorDate = input?.anchorDate;
            if (!validDate(anchorDate)) {
                throw new Error("Date de première exécution invalide");
            }
            return { mode,
                time,
                anchorDate };
        }

        const dayOfMonth = Number(input?.dayOfMonth);
        if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 28) {
            throw new Error("Le jour du mois doit être compris entre 1 et 28");
        }
        return { mode,
            time,
            dayOfMonth };
    }

    private expressionFor(rule: ScheduleRule): string | null {
        if (rule.mode === "off") {
            return null;
        }
        if (rule.mode === "custom") {
            return rule.cron ?? null;
        }
        const [ hour, minute ] = (rule.time ?? "00:00").split(":").map(Number);
        if (rule.mode === "daily") {
            return `${minute} ${hour} * * *`;
        }
        if (rule.mode === "weekly") {
            return `${minute} ${hour} * * ${rule.weekday}`;
        }
        if (rule.mode === "biweekly") {
            return `${minute} ${hour} * * ${weekdayForDate(rule.anchorDate!)}`;
        }
        return `${minute} ${hour} ${rule.dayOfMonth} * *`;
    }

    private reschedule(): void {
        for (const job of this.jobs.values()) {
            job.stop();
        }
        this.jobs.clear();

        for (const [ stack, schedule ] of Object.entries(this.schedules)) {
            for (const action of [ "start", "stop" ] as ScheduleAction[]) {
                const rule = schedule[action];
                const expression = this.expressionFor(rule);
                if (!expression) {
                    continue;
                }
                const key = `${stack}:${action}`;
                try {
                    const job = new Cron(expression, { protect: true,
                        timezone: this.timezone }, async () => {
                        if (rule.mode === "biweekly" && !this.isBiweeklyOccurrence(rule, new Date())) {
                            return;
                        }
                        await this.execute(stack, action);
                    });
                    this.jobs.set(key, job);
                } catch (error) {
                    log.error("StackScheduler", `Invalid schedule ${key}: ${error}`);
                }
            }
        }
    }

    private isBiweeklyOccurrence(rule: ScheduleRule, date: Date): boolean {
        if (!rule.anchorDate) {
            return false;
        }
        const days = Math.round((dateNumber(date) - anchorNumber(rule.anchorDate)) / 86_400_000);
        return days >= 0 && days % 14 === 0;
    }

    private nextRun(stack: string, action: ScheduleAction): string | null {
        const rule = this.schedules[stack]?.[action];
        const job = this.jobs.get(`${stack}:${action}`);
        if (!rule || !job) {
            return null;
        }
        let next = job.nextRun();
        if (rule.mode === "biweekly") {
            for (let i = 0; next && i < 3 && !this.isBiweeklyOccurrence(rule, next); i++) {
                next = job.nextRun(new Date(next.getTime() + 60_000));
            }
        }
        return next?.toISOString() ?? null;
    }

    private viewFor(stack: string): StackScheduleView {
        const schedule = this.schedules[stack] ?? { start: { ...OFF_RULE },
            stop: { ...OFF_RULE } };
        return {
            stack,
            ...schedule,
            nextStart: this.nextRun(stack, "start"),
            nextStop: this.nextRun(stack, "stop"),
        };
    }

    private async assertLocalStack(stack: string): Promise<void> {
        if (!this.server) {
            throw new Error("Planificateur non initialisé");
        }
        const stackList = await Stack.getStackList(this.server, true);
        if (!stackList.has(stack)) {
            throw new Error("Stack locale introuvable");
        }
    }

    private async execute(stackName: string, action: ScheduleAction): Promise<void> {
        if (!this.server) {
            return;
        }
        if (this.runningStacks.has(stackName)) {
            log.warn("StackScheduler", `${action} ${stackName}: another scheduled action is already running`);
            return;
        }
        this.runningStacks.add(stackName);
        try {
            let execution: ScheduleExecution;
            try {
                const stack = await Stack.getStack(this.server, stackName);
                if (action === "start") {
                    await stack.startScheduled();
                } else {
                    await stack.stopScheduled();
                }
                execution = { timestamp: new Date().toISOString(),
                    success: true };
                this.server.sendStackList();
                log.info("StackScheduler", `${action} ${stackName}: OK`);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                execution = { timestamp: new Date().toISOString(),
                    success: false,
                    error: message };
                log.error("StackScheduler", `${action} ${stackName}: ${message}`);
            }

            const schedule = this.schedules[stackName];
            if (schedule) {
                if (action === "start") {
                    schedule.lastStart = execution;
                } else {
                    schedule.lastStop = execution;
                }
                this.persist();
            }

            await AuditLogger.getInstance().log({
                action: `stack.schedule.${action}`,
                category: "stack",
                targetType: "stack",
                target: stackName,
                status: execution.success ? "success" : "failure",
                message: execution.error ?? null,
                username: "scheduler",
                metadata: { trigger: "cron" },
            });
        } finally {
            this.runningStacks.delete(stackName);
        }
    }
}
