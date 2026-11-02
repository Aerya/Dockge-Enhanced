import { promises as fs } from "node:fs";
import path from "node:path";
import { randomInt } from "node:crypto";
import { log } from "./log";
import { periods, periodStart } from "../extra/usage-periods.cjs";

const DEFAULT_RELEASE_BASE_URL = "https://github.com/Aerya/Dockge-Enhanced/releases/download/usage-count";
const STATE_FILENAME = "anonymous-install-count.json";
const RETRY_INTERVAL_MS = 12 * 60 * 60 * 1000;
const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;
const START_DELAY_MIN_MS = 5 * 60 * 1000;
const START_DELAY_MAX_MS = 30 * 60 * 1000;

export interface AnonymousInstallCountState {
    lastCountedMonth: string | null;
    lastAttemptAt: string | null;
    lastCountedWeek?: string | null;
    lastCountedYear?: string | null;
    attempts?: Record<string, string>;
}

function envFlagDisabled(value: string | undefined): boolean {
    return [ "0", "false", "no", "off" ].includes((value ?? "").trim().toLowerCase());
}

export function getUsageCountMonth(date = new Date()): string {
    return date.toISOString().slice(0, 7);
}

export function getUsageCountAssetUrl(month: string, baseUrl = DEFAULT_RELEASE_BASE_URL): string {
    periodStart(month);
    const normalizedBase = baseUrl.trim().replace(/\/+$/, "");
    const parsed = new URL(normalizedBase);
    if (parsed.protocol !== "https:") {
        throw new Error("Usage count endpoint must use HTTPS");
    }
    return `${normalizedBase}/${month}.txt`;
}

export function shouldAttemptUsageCount(state: AnonymousInstallCountState, now = new Date()): boolean {
    const month = getUsageCountMonth(now);
    if (state.lastCountedMonth === month) {
        return false;
    }
    if (!state.lastAttemptAt) {
        return true;
    }
    const lastAttempt = Date.parse(state.lastAttemptAt);
    if (!Number.isFinite(lastAttempt)) {
        return true;
    }
    return now.getTime() - lastAttempt >= RETRY_INTERVAL_MS;
}

export class AnonymousInstallCount {
    private readonly statePath: string;
    private running = false;

    constructor(dataDir: string) {
        this.statePath = path.join(dataDir, STATE_FILENAME);
    }

    private async loadState(): Promise<AnonymousInstallCountState> {
        try {
            const raw: unknown = JSON.parse(await fs.readFile(this.statePath, "utf8"));
            if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
                throw new Error("Invalid count state");
            }
            const parsed = raw as Partial<AnonymousInstallCountState>;
            for (const value of [ parsed.lastCountedMonth, parsed.lastCountedWeek, parsed.lastCountedYear, parsed.lastAttemptAt ]) {
                if (value !== undefined && value !== null && typeof value !== "string") {
                    throw new Error("Invalid count state field");
                }
            }
            if (parsed.attempts !== undefined && (!parsed.attempts || typeof parsed.attempts !== "object" || Array.isArray(parsed.attempts) || Object.values(parsed.attempts).some(value => typeof value !== "string"))) {
                throw new Error("Invalid count retry state");
            }
            return {
                lastCountedMonth: typeof parsed.lastCountedMonth === "string" ? parsed.lastCountedMonth : null,
                lastAttemptAt: typeof parsed.lastAttemptAt === "string" ? parsed.lastAttemptAt : null,
                lastCountedWeek: typeof parsed.lastCountedWeek === "string" ? parsed.lastCountedWeek : null,
                lastCountedYear: typeof parsed.lastCountedYear === "string" ? parsed.lastCountedYear : null,
                attempts: parsed.attempts && typeof parsed.attempts === "object" ? parsed.attempts : {},
            };
        } catch (error) {
            if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
                throw error;
            }
            return { lastCountedMonth: null,
                lastAttemptAt: null };
        }
    }

    private async saveState(state: AnonymousInstallCountState): Promise<void> {
        await fs.mkdir(path.dirname(this.statePath), { recursive: true });
        const temporary = `${this.statePath}.${process.pid}.${Date.now()}.tmp`;
        await fs.writeFile(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
        await fs.rename(temporary, this.statePath);
    }

    async run(now = new Date()): Promise<void> {
        if (this.running) {
            return;
        }
        this.running = true;
        try {
            await this.countPeriods(now);
        } finally {
            this.running = false;
        }
    }

    private async countPeriods(now: Date): Promise<void> {
        const state = await this.loadState();
        const current = periods(now);
        const fields = { month: "lastCountedMonth",
            week: "lastCountedWeek",
            year: "lastCountedYear" } as const;
        state.attempts = Object.fromEntries(Object.entries(state.attempts ?? {}).filter(([ key ]) => Object.values(current).includes(key)));
        const baseUrl = process.env.DOCKGE_USAGE_COUNT_URL?.trim() || DEFAULT_RELEASE_BASE_URL;
        for (const kind of [ "month", "week", "year" ] as const) {
            const key = current[kind];
            if (state[fields[kind]] === key) {
                continue;
            }
            const attempt = state.attempts[key];
            const elapsed = now.getTime() - Date.parse(attempt ?? "");
            if (elapsed >= 0 && elapsed < RETRY_INTERVAL_MS) {
                continue;
            }
            state.attempts[key] = now.toISOString();
            if (kind === "month") {
                state.lastAttemptAt = now.toISOString();
            }
            await this.saveState(state);
            try {
                const response = await fetch(getUsageCountAssetUrl(key, baseUrl), {
                    method: "GET",
                    redirect: "follow",
                    cache: "no-store",
                    signal: AbortSignal.timeout(15_000),
                });
                if (!response.ok) {
                    await response.body?.cancel();
                    log.warn("usage-count", `${kind}: count unavailable (HTTP ${response.status}); retry in 12h`);
                    continue;
                }
                await response.arrayBuffer();
            } catch {
                // Never log endpoint URLs, proxies or credentials from network errors.
                log.warn("usage-count", `${kind}: count request failed; retry in 12h`);
                continue;
            }
            state[fields[kind]] = key;
            await this.saveState(state);
        }
    }
}

let started = false;

export function startAnonymousInstallCount(dataDir: string): void {
    if (started || process.env.NODE_ENV !== "production" || process.env.CI === "true" || envFlagDisabled(process.env.DOCKGE_USAGE_COUNT)) {
        return;
    }
    started = true;

    const counter = new AnonymousInstallCount(dataDir);
    const run = () => counter.run().catch((error) => {
        log.warn("usage-count", `Count state could not be read or saved (${error instanceof Error ? error.name : "unknown error"}); no state reset performed`);
    });

    const initialTimer = setTimeout(() => {
        void run();
        const timer = setInterval(() => void run(), POLL_INTERVAL_MS);
        timer.unref();
    }, randomInt(START_DELAY_MIN_MS, START_DELAY_MAX_MS));
    initialTimer.unref();
}
