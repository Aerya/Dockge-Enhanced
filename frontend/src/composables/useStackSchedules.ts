import { computed, onMounted, onUnmounted, ref } from "vue";
import { makePoller, POLL, type Poller } from "./useLowPower";

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
    stack: string;
    start: ScheduleRule;
    stop: ScheduleRule;
    lastStart?: ScheduleExecution;
    lastStop?: ScheduleExecution;
    nextStart: string | null;
    nextStop: string | null;
}

const schedules = ref<StackSchedule[]>([]);
const timezone = ref("UTC");
const enabled = ref(false);
const loading = ref(false);
const error = ref("");
let poller: Poller | null = null;
let subscribers = 0;

function headers(json = false): Record<string, string> {
    const token = localStorage.getItem("token") ?? sessionStorage.getItem("token") ?? "";
    return {
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        ...(json ? { "Content-Type": "application/json" } : {}),
    };
}

async function loadSchedules() {
    loading.value = true;
    error.value = "";
    try {
        const response = await fetch("/api/watcher/stack-schedules", { headers: headers() });
        const json = await response.json();
        if (response.ok && json.ok) {
            schedules.value = json.data?.schedules ?? [];
            timezone.value = json.data?.timezone ?? "UTC";
            enabled.value = json.data?.enabled === true;
        } else {
            error.value = json.message ?? response.statusText;
        }
    } catch (loadError) {
        error.value = loadError instanceof Error ? loadError.message : String(loadError);
    } finally {
        loading.value = false;
    }
}

export function useStackSchedules() {
    onMounted(() => {
        subscribers++;
        if (subscribers === 1) {
            poller = makePoller({ fetch: loadSchedules,
                interval: POLL.overview });
            poller.start();
        }
    });

    onUnmounted(() => {
        subscribers--;
        if (subscribers === 0 && poller) {
            poller.stop();
            poller = null;
        }
    });

    function scheduleFor(stack: string) {
        return computed(() => schedules.value.find(item => item.stack === stack) ?? null);
    }

    async function saveSchedule(stack: string, start: ScheduleRule, stop: ScheduleRule) {
        const response = await fetch(`/api/watcher/stack-schedules/${encodeURIComponent(stack)}`, {
            method: "PUT",
            headers: headers(true),
            body: JSON.stringify({ start,
                stop }),
        });
        const json = await response.json();
        if (!response.ok || !json.ok) {
            throw new Error(json.message ?? response.statusText);
        }
        const index = schedules.value.findIndex(item => item.stack === stack);
        if (index === -1) {
            schedules.value.push(json.data);
        } else {
            schedules.value[index] = json.data;
        }
        return json.data as StackSchedule;
    }

    async function setEnabled(value: boolean) {
        const response = await fetch("/api/watcher/stack-schedules/enabled", {
            method: "PUT",
            headers: headers(true),
            body: JSON.stringify({ enabled: value }),
        });
        const json = await response.json();
        if (!response.ok || !json.ok) {
            throw new Error(json.message ?? response.statusText);
        }
        enabled.value = json.data?.enabled === true;
    }

    return {
        schedules,
        timezone,
        enabled,
        loading,
        error,
        loadSchedules,
        scheduleFor,
        saveSchedule,
        setEnabled,
    };
}
