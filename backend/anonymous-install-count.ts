import { promises as fs } from "node:fs";
import path from "node:path";
import { randomInt } from "node:crypto";
import { log } from "./log";

const DEFAULT_RELEASE_BASE_URL = "https://github.com/Aerya/Dockge-Enhanced/releases/download/usage-count";
const STATE_FILENAME = "anonymous-install-count.json";
const RETRY_INTERVAL_MS = 12 * 60 * 60 * 1000;
const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;
const START_DELAY_MIN_MS = 5 * 60 * 1000;
const START_DELAY_MAX_MS = 30 * 60 * 1000;

export interface AnonymousInstallCountState {
    lastCountedMonth: string | null;
    lastAttemptAt: string | null;
}

function envFlagDisabled(value: string | undefined): boolean {
    return [ "0", "false", "no", "off" ].includes((value ?? "").trim().toLowerCase());
}

export function getUsageCountMonth(date = new Date()): string {
    return date.toISOString().slice(0, 7);
}

export function getUsageCountAssetUrl(month: string, baseUrl = DEFAULT_RELEASE_BASE_URL): string {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Invalid usage count month");
    const normalizedBase = baseUrl.trim().replace(/\/+$/, "");
    const parsed = new URL(normalizedBase);
    if (parsed.protocol !== "https:") throw new Error("Usage count endpoint must use HTTPS");
    return `${normalizedBase}/${month}.txt`;
}

export function shouldAttemptUsageCount(state: AnonymousInstallCountState, now = new Date()): boolean {
    const month = getUsageCountMonth(now);
    if (state.lastCountedMonth === month) return false;
    if (!state.lastAttemptAt) return true;
    const lastAttempt = Date.parse(state.lastAttemptAt);
    if (!Number.isFinite(lastAttempt)) return true;
    return now.getTime() - lastAttempt >= RETRY_INTERVAL_MS;
}

class AnonymousInstallCount {
    private readonly statePath: string;

    constructor(dataDir: string) {
        this.statePath = path.join(dataDir, STATE_FILENAME);
    }

    private async loadState(): Promise<AnonymousInstallCountState> {
        try {
            const parsed = JSON.parse(await fs.readFile(this.statePath, "utf8")) as Partial<AnonymousInstallCountState>;
            return {
                lastCountedMonth: typeof parsed.lastCountedMonth === "string" ? parsed.lastCountedMonth : null,
                lastAttemptAt: typeof parsed.lastAttemptAt === "string" ? parsed.lastAttemptAt : null,
            };
        } catch {
            return { lastCountedMonth: null, lastAttemptAt: null };
        }
    }

    private async saveState(state: AnonymousInstallCountState): Promise<void> {
        await fs.mkdir(path.dirname(this.statePath), { recursive: true });
        const temporary = `${this.statePath}.${process.pid}.${Date.now()}.tmp`;
        await fs.writeFile(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
        await fs.rename(temporary, this.statePath);
    }

    async run(now = new Date()): Promise<void> {
        const state = await this.loadState();
        if (!shouldAttemptUsageCount(state, now)) return;

        const month = getUsageCountMonth(now);
        state.lastAttemptAt = now.toISOString();
        await this.saveState(state);

        const baseUrl = process.env.DOCKGE_USAGE_COUNT_URL?.trim() || DEFAULT_RELEASE_BASE_URL;
        let response: Response;
        try {
            response = await fetch(getUsageCountAssetUrl(month, baseUrl), {
                method: "GET",
                redirect: "follow",
                cache: "no-store",
                signal: AbortSignal.timeout(15_000),
            });
        } catch (error) {
            log.debug("usage-count", `Monthly GitHub count request failed: ${error instanceof Error ? error.message : String(error)}`);
            return;
        }

        if (!response.ok) {
            log.debug("usage-count", `Monthly GitHub count request returned HTTP ${response.status}`);
            return;
        }

        // Consume the tiny asset so GitHub records a completed download.
        await response.arrayBuffer();
        state.lastCountedMonth = month;
        await this.saveState(state);
    }
}

let started = false;

export function startAnonymousInstallCount(dataDir: string): void {
    if (started || process.env.NODE_ENV !== "production" || process.env.CI === "true" || envFlagDisabled(process.env.DOCKGE_USAGE_COUNT)) return;
    started = true;

    const counter = new AnonymousInstallCount(dataDir);
    const run = () => counter.run().catch((error) => {
        log.debug("usage-count", `Monthly GitHub count failed: ${error instanceof Error ? error.message : String(error)}`);
    });

    const initialTimer = setTimeout(() => {
        void run();
        const timer = setInterval(() => void run(), POLL_INTERVAL_MS);
        timer.unref();
    }, randomInt(START_DELAY_MIN_MS, START_DELAY_MAX_MS));
    initialTimer.unref();
}
