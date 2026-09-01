<template>
    <section class="watcher-updates">
        <h2 class="h4 mb-3"><font-awesome-icon icon="sync-alt" class="me-2" />{{ $t("updates.heading") }}</h2>

        <div class="shadow-box big-padding mb-3">
            <h3 class="h6">{{ $t("updates.self.heading") }}</h3>
            <p class="form-text">{{ $t("updates.self.backupRequired") }}</p>
            <label class="form-label" for="self-update-mode">{{ $t("updates.self.mode") }}</label>
            <select id="self-update-mode" v-model="settings.mode" class="form-select" @change="save">
                <option value="manual">{{ $t("updates.self.manual") }}</option>
                <option value="sidecar">{{ $t("updates.self.sidecar") }}</option>
                <option value="agent" disabled>{{ $t("updates.self.agent") }}</option>
            </select>
            <p class="form-text">{{ $t("updates.self.agentUnavailable") }}</p>

            <template v-if="settings.mode === 'sidecar'">
                <label class="form-label mt-3">{{ $t("updates.self.when") }}</label>
                <div class="d-flex flex-wrap gap-3">
                    <label class="form-check-label"><input v-model="settings.schedule.type" class="form-check-input me-1" type="radio" value="immediate" @change="save">{{ $t("updates.self.immediate") }}</label>
                    <label class="form-check-label"><input v-model="settings.schedule.type" class="form-check-input me-1" type="radio" value="window" @change="save">{{ $t("updates.self.window") }}</label>
                </div>
                <div v-if="settings.schedule.type === 'window'" class="d-flex gap-2 mt-2 align-items-center">
                    <input v-model="settings.schedule.start" class="form-control" type="time" @change="save">
                    <span>→</span>
                    <input v-model="settings.schedule.end" class="form-control" type="time" @change="save">
                </div>
                <div v-if="settings.schedule.type === 'window'" class="mt-2">
                    <span class="form-label d-block mb-1">{{ $t("updates.self.days") }}</span>
                    <label v-for="day in weekDays" :key="day.value" class="form-check-label me-3">
                        <input v-model="settings.schedule.days" class="form-check-input me-1" type="checkbox" :value="day.value" @change="save">
                        {{ day.label }}
                    </label>
                </div>
            </template>
        </div>

        <div class="shadow-box big-padding mb-3">
            <h3 class="h6">{{ $t("updates.pause.heading") }}</h3>
            <label class="form-check-label d-block mb-2"><input v-model="globalPause.enabled" class="form-check-input me-1" type="checkbox" @change="saveGlobalPause">{{ $t("updates.pause.global") }}</label>
            <div v-if="globalPause.enabled" class="d-flex flex-wrap gap-2 align-items-center">
                <select v-model="pausePreset" class="form-select form-select-sm pause-preset" @change="applyPausePreset">
                    <option value="1">{{ $t("updates.pause.oneDay") }}</option>
                    <option value="3">{{ $t("updates.pause.threeDays") }}</option>
                    <option value="7">{{ $t("updates.pause.oneWeek") }}</option>
                    <option value="14">{{ $t("updates.pause.twoWeeks") }}</option>
                    <option value="21">{{ $t("updates.pause.threeWeeks") }}</option>
                    <option value="indefinite">{{ $t("updates.pause.indefinite") }}</option>
                </select>
                <input v-model="pauseDate" class="form-control form-control-sm pause-date" type="datetime-local" @change="setCustomPause">
            </div>
            <p v-if="globalPause.enabled" class="form-text mb-0">{{ pauseLabel }}</p>
        </div>

        <div class="shadow-box big-padding">
            <h3 class="h6 mb-3">{{ $t("updates.status.heading") }}</h3>

            <div class="build-grid mb-3">
                <div class="build-card">
                    <span class="build-label">{{ $t("updates.status.installedBuild") }}</span>
                    <strong>{{ installedBuildLabel }}</strong>
                    <span v-if="status.localDigest" class="digest-line"><span>{{ $t("updates.status.digest") }}</span> <code :title="status.localDigest">{{ shortDigest(status.localDigest) }}</code></span>
                </div>
                <div v-if="showTargetBuild" class="build-card">
                    <span class="build-label">{{ targetBuildTitle }}</span>
                    <strong>{{ targetBuildLabel }}</strong>
                    <span v-if="targetDigest" class="digest-line"><span>{{ $t("updates.status.digest") }}</span> <code :title="targetDigest">{{ shortDigest(targetDigest) }}</code></span>
                </div>
            </div>

            <div class="current-state mb-3" :class="currentStateClass">
                <strong>{{ currentStateLabel }}</strong>
                <span v-if="activeStep" class="ms-2">{{ $t("updates.status.step", { current: activeStep, total: 4 }) }}</span>
            </div>

            <template v-if="operationActive">
                <div v-if="progressPercent !== null" class="progress mb-2" role="progressbar" :aria-valuenow="progressPercent" aria-valuemin="0" aria-valuemax="100">
                    <div class="progress-bar" :style="{ width: `${progressPercent}%` }">{{ progressPercent }}%</div>
                </div>
                <div v-if="progress" class="form-text mb-2">
                    <template v-if="progress.phase === 'backup'">
                        {{ $t("updates.status.backupProgress", { label: progress.label, completed: formatBytes(progress.completed), total: formatBytes(progress.total) }) }}
                    </template>
                    <template v-else>
                        {{ $t("updates.status.verificationProgress", { label: progress.label, current: progress.destinationIndex, total: progress.destinationCount }) }}
                    </template>
                </div>
                <div class="timing-grid form-text mb-2">
                    <span v-if="elapsedLabel">{{ $t("updates.status.elapsed", { time: elapsedLabel }) }}</span>
                    <span v-if="remainingLabel">{{ $t("updates.status.remaining", { time: remainingLabel }) }}</span>
                </div>
            </template>

            <p v-if="showTechnicalError" class="alert alert-danger py-2 mb-3">{{ operation.message }}</p>

            <button
                v-if="status.updateAvailable && !operationActive"
                class="btn btn-sm btn-primary mt-1"
                :disabled="updating"
                @click="startUpdate"
            >
                <span v-if="updating" class="spinner-border spinner-border-sm me-1" />
                {{ $t("updates.self.start") }}
            </button>

            <div v-if="lastOperationLabel" class="last-operation mt-3 pt-3 border-top">
                <span class="build-label">{{ $t("updates.status.lastOperation") }}</span>
                <div>{{ lastOperationLabel }}</div>
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n/dist/vue-i18n.esm-browser.prod.js";
import { watcherApi } from "./shared";

interface BuildMetadata { revision: string; created: string; }
interface Operation {
    state: string;
    message: string;
    startedAt?: string | null;
    finishedAt?: string | null;
    targetImage?: string;
}

const { t } = useI18n();
const settings = ref({ mode: "manual", schedule: { type: "immediate", start: "03:00", end: "05:00", days: [ 0, 1, 2, 3, 4, 5, 6 ] }, pause: { enabled: false, until: null as string | null } });
const globalPause = ref({ enabled: false, until: null as string | null });
const emptyBuild = (): BuildMetadata => ({ revision: "", created: "" });
const status = ref({ updateAvailable: false, repo: "", localDigest: "", remoteDigest: "", localBuild: emptyBuild(), remoteBuild: emptyBuild() });
const operation = ref<Operation>({ state: "idle", message: "", startedAt: null, finishedAt: null, targetImage: "" });
const progress = ref<null | { phase: "backup" | "verification"; label: string; completed?: number; total?: number; destinationIndex?: number; destinationCount?: number }>(null);
const updating = ref(false);
const pausePreset = ref("7");
const pauseDate = ref("");
const now = ref(Date.now());
const weekDays = computed(() => [ 0, 1, 2, 3, 4, 5, 6 ].map((value) => ({ value, label: t(`updates.self.day${value}`) })));
let statusTimer: ReturnType<typeof setInterval> | undefined;
let clockTimer: ReturnType<typeof setInterval> | undefined;

const activeStates = new Set([ "scheduled", "backing-up", "verifying-backup", "updating", "waiting-health", "rolling-back" ]);
const terminalStates = new Set([ "succeeded", "failed", "rolled-back", "rollback-failed" ]);
const operationActive = computed(() => activeStates.has(operation.value.state));
const updateSteps: Record<string, number> = { "backing-up": 1, "verifying-backup": 2, "updating": 3, "waiting-health": 4 };
const activeStep = computed(() => updateSteps[operation.value.state] ?? null);
const currentStateLabel = computed(() => {
    if (operationActive.value) return t(`updates.status.${operation.value.state}`);
    if ([ "failed", "rolled-back", "rollback-failed" ].includes(operation.value.state)) return t(`updates.status.${operation.value.state}`);
    return status.value.updateAvailable ? t("updates.status.available") : t("updates.status.current");
});
const currentStateClass = computed(() => {
    if (operationActive.value) return "state-active";
    if ([ "failed", "rolled-back", "rollback-failed" ].includes(operation.value.state)) return "state-error";
    return status.value.updateAvailable ? "state-warning" : "state-success";
});
const showTechnicalError = computed(() => [ "failed", "rollback-failed" ].includes(operation.value.state) && !!operation.value.message);
const showTargetBuild = computed(() => status.value.updateAvailable || operationActive.value);
const targetBuildTitle = computed(() => operationActive.value ? t("updates.status.targetBuild") : t("updates.status.availableBuild"));
const installedBuildLabel = computed(() => buildLabel(status.value.localBuild, status.value.localDigest));
const operationTargetDigest = computed(() => operation.value.targetImage?.match(/sha256:[a-f0-9]{64}/i)?.[0] ?? "");
const targetDigest = computed(() => operationActive.value ? (operationTargetDigest.value || status.value.remoteDigest) : status.value.remoteDigest);
const targetBuildMetadata = computed(() => (!operationActive.value || targetDigest.value === status.value.remoteDigest) ? status.value.remoteBuild : emptyBuild());
const targetBuildLabel = computed(() => buildLabel(targetBuildMetadata.value, targetDigest.value));
const progressPercent = computed(() => {
    if (!progress.value || progress.value.phase !== "backup" || !progress.value.total) return null;
    return Math.max(0, Math.min(100, Math.round((progress.value.completed || 0) / progress.value.total * 100)));
});
const elapsedMs = computed(() => operation.value.startedAt ? Math.max(0, now.value - Date.parse(operation.value.startedAt)) : 0);
const elapsedLabel = computed(() => elapsedMs.value ? formatDuration(elapsedMs.value) : "");
const remainingLabel = computed(() => {
    if (progress.value?.phase !== "backup" || !progress.value.total || !progress.value.completed || elapsedMs.value < 5_000) return "";
    const remaining = progress.value.total - progress.value.completed;
    if (remaining <= 0) return "";
    return formatDuration(elapsedMs.value * remaining / progress.value.completed);
});
const lastOperationLabel = computed(() => {
    if (!terminalStates.has(operation.value.state) || !operation.value.finishedAt) return "";
    const date = new Date(operation.value.finishedAt).toLocaleString();
    const duration = operation.value.startedAt ? formatDuration(Date.parse(operation.value.finishedAt) - Date.parse(operation.value.startedAt)) : "";
    const state = t(`updates.status.${operation.value.state}`);
    return duration ? t("updates.status.lastOperationWithDuration", { state, date, duration }) : t("updates.status.lastOperationAt", { state, date });
});
const pauseLabel = computed(() => globalPause.value.until ? t("updates.pause.until", { date: new Date(globalPause.value.until).toLocaleString() }) : t("updates.pause.indefinite"));

async function load() {
    const [ settingsResult, statusResult, pauseResult ] = await Promise.all([
        watcherApi("GET", "/self/settings"), watcherApi("GET", "/self/status"), watcherApi("GET", "/image/auto-update"),
    ]);
    if (settingsResult.ok) settings.value = settingsResult.data;
    if (statusResult.ok) {
        status.value = { ...status.value, ...statusResult };
        operation.value = statusResult.operation ?? operation.value;
        progress.value = statusResult.progress ?? null;
    }
    if (pauseResult.ok) globalPause.value = pauseResult.data.globalUpdatePause ?? globalPause.value;
}

async function save() { await watcherApi("POST", "/self/settings", settings.value); }
async function saveGlobalPause() { await watcherApi("POST", "/image/update-pause", globalPause.value); }
async function applyPausePreset() {
    globalPause.value.until = pausePreset.value === "indefinite" ? null : new Date(Date.now() + Number(pausePreset.value) * 86_400_000).toISOString();
    await saveGlobalPause();
}
async function setCustomPause() {
    globalPause.value.until = pauseDate.value ? new Date(pauseDate.value).toISOString() : null;
    await saveGlobalPause();
}

function formatBytes(value?: number): string {
    if (!value) return "0 B";
    const units = [ "B", "KiB", "MiB", "GiB", "TiB" ];
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDuration(ms: number): string {
    const seconds = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    if (minutes === 0) return t("updates.status.seconds", { value: rest });
    if (rest === 0) return t("updates.status.minutes", { value: minutes });
    return t("updates.status.minutesSeconds", { minutes, seconds: rest });
}

function shortDigest(digest: string): string {
    return `sha256:${digest.replace(/^sha256:/, "").slice(0, 12)}`;
}

function buildLabel(build: BuildMetadata, digest: string): string {
    const parts: string[] = [];
    if (build?.created && !Number.isNaN(Date.parse(build.created))) parts.push(new Date(build.created).toLocaleDateString());
    if (build?.revision) parts.push(build.revision.slice(0, 7));
    if (parts.length === 0 && digest) parts.push(shortDigest(digest));
    return parts.length ? parts.join(" · ") : t("updates.status.buildUnknown");
}

async function startUpdate() {
    if (!status.value.repo || !status.value.remoteDigest) return;
    updating.value = true;
    try {
        const res = await watcherApi("POST", "/self/update", { targetImage: `ghcr.io/${status.value.repo}@${status.value.remoteDigest}` });
        if (res.ok) {
            sessionStorage.setItem("dockge-self-update-in-progress", "1");
            operation.value = res.data;
        }
    } finally {
        updating.value = false;
        await load();
    }
}

onMounted(async () => {
    await watcherApi("POST", "/self/check");
    await load();
    statusTimer = setInterval(load, 2_500);
    clockTimer = setInterval(() => { now.value = Date.now(); }, 1_000);
});
onBeforeUnmount(() => {
    if (statusTimer) clearInterval(statusTimer);
    if (clockTimer) clearInterval(clockTimer);
});
</script>

<style scoped lang="scss">
.watcher-updates { max-width: 760px; }
.pause-preset { width: auto; min-width: 11rem; }
.pause-date { width: auto; }
.build-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: .75rem; }
.build-card { border: 1px solid var(--bs-border-color); border-radius: .6rem; padding: .75rem; display: flex; flex-direction: column; gap: .2rem; }
.build-label { color: var(--bs-secondary-color); font-size: .82rem; }
.digest-line { font-size: .75rem; color: var(--bs-secondary-color); }
.build-card code { font-size: .75rem; color: inherit; }
.current-state { border-radius: .5rem; padding: .65rem .75rem; }
.state-success { background: rgba(34, 197, 94, .10); color: #22c55e; }
.state-warning, .state-active { background: rgba(245, 158, 11, .10); color: #f59e0b; }
.state-error { background: rgba(239, 68, 68, .10); color: #ef4444; }
.timing-grid { display: flex; flex-wrap: wrap; gap: 1rem; }
.last-operation { font-size: .9rem; }
</style>
