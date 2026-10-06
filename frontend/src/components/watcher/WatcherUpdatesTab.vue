<template>
    <section class="watcher-updates">
        <h2 class="h4 mb-3"><font-awesome-icon icon="sync-alt" class="me-2" />{{ $t("updates.heading") }}</h2>

        <div class="shadow-box big-padding mb-3">
            <h3 class="h6">{{ $t("updates.self.heading") }}</h3>
            <p class="form-text">{{ $t("updates.self.backupRequired") }}</p>
            <p class="alert alert-info py-2">{{ $t("updates.self.scopeHint") }}</p>
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
            <label class="form-check-label d-block mb-2"><input v-model="updatePause.enabled" class="form-check-input me-1" type="checkbox" @change="saveUpdatePause">{{ $t("updates.pause.global") }}</label>
            <div v-if="updatePause.enabled" class="d-flex flex-wrap gap-2 align-items-center">
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
            <p v-if="updatePause.enabled" class="form-text mb-0">{{ pauseLabel }}</p>
        </div>

        <div class="shadow-box big-padding mb-3">
            <h3 class="h6">{{ $t("updates.images.heading") }}</h3>
            <p class="form-text">{{ $t("updates.images.description") }}</p>
            <button class="btn btn-sm btn-primary" :disabled="imageBatch.running || !availableImages" @click="updateAllImages">
                {{ $t("updates.images.start", { count: availableImages }) }}
            </button>
            <p v-if="imageBatch.running" class="form-text mt-2 mb-0">
                {{ $t("updates.images.progress", { completed: imageBatch.completed, total: imageBatch.total, image: imageBatch.current || '…' }) }}
            </p>
            <p v-else-if="imageBatch.error" class="alert alert-danger py-2 mt-2 mb-0">
                {{ $t("updates.images.failed", { completed: imageBatch.completed, total: imageBatch.total, error: imageBatch.error }) }}
            </p>
            <p v-else-if="imageBatch.total && imageBatch.completed === imageBatch.total" class="alert alert-success py-2 mt-2 mb-0">
                {{ $t("updates.images.done", { count: imageBatch.completed }) }}
            </p>
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
                <span v-if="activeStep" class="ms-2">{{ $t("updates.status.step", { current: activeStep, total: updateStageDefinitions.length }) }}</span>
            </div>
            <p v-if="status.error && !operationActive" class="alert alert-danger py-2 mb-3">
                {{ $t("updates.status.checkUnavailable") }}
            </p>

            <template v-if="operationActive || showStageTimeline">
                <div v-if="operationExecuting && hostStats" class="machine-load mb-3">
                    <strong>{{ $t("updates.status.machineLoad") }}</strong>
                    <span>CPU {{ hostStats.cpu }}%</span>
                    <span>RAM {{ hostStats.ram.percent }}%</span>
                    <span v-if="loadAverageLabel">{{ $t("updates.status.loadAverage", { value: loadAverageLabel }) }}</span>
                </div>

                <div v-if="operationExecuting && progressPercent !== null" class="progress mb-2" role="progressbar" :aria-valuenow="progressPercent" aria-valuemin="0" aria-valuemax="100">
                    <div class="progress-bar" :style="{ width: `${progressPercent}%` }">{{ progressPercent }}%</div>
                </div>
                <div v-if="operationExecuting && progress" class="progress-details form-text mb-3">
                    <template v-if="progress.phase === 'backup'">
                        <span>{{ $t("updates.status.backupProgress", { label: progress.label, completed: formatBytes(progress.completed), total: formatBytes(progress.total) }) }}</span>
                        <span v-if="progress.totalFiles">{{ $t("updates.status.backupFilesProgress", {
                            completed: progress.filesDone ?? 0,
                            total: progress.totalFiles,
                        }) }}</span>
                        <span v-if="throughputLabel">{{ $t("updates.status.throughput", { rate: throughputLabel }) }}</span>
                    </template>
                    <template v-else-if="progress.phase === 'verification'">
                        <span>{{ $t("updates.status.verificationProgress", { label: progress.label, current: progress.destinationIndex, total: progress.destinationCount }) }}</span>
                    </template>
                    <template v-else>
                        <span>{{ $t("updates.status.retentionProgress", {
                            label: progress.label,
                            current: progress.destinationIndex,
                            total: progress.destinationCount,
                            count: progress.snapshotsToRemove ?? 0,
                        }) }}</span>
                    </template>
                </div>
                <div v-if="operationExecuting" class="timing-grid form-text mb-3">
                    <span v-if="elapsedLabel">{{ $t("updates.status.elapsed", { time: elapsedLabel }) }}</span>
                    <span v-if="stageElapsedLabel">{{ $t("updates.status.stageElapsed", { time: stageElapsedLabel }) }}</span>
                    <span v-if="remainingLabel">{{ $t("updates.status.remaining", { time: remainingLabel }) }}</span>
                </div>

                <div v-if="showStageTimeline" class="update-stages mb-3">
                    <div
                        v-for="(step, index) in updateStageDefinitions"
                        :key="step.stage"
                        class="update-stage"
                        :class="stepStatusClass(step.stage)"
                    >
                        <span class="stage-marker">{{ stepMarker(step.stage) }}</span>
                        <div class="stage-body">
                            <div class="stage-heading">
                                <strong>{{ index + 1 }}. {{ $t(step.titleKey) }}</strong>
                                <span v-if="stepDurationLabel(step.stage)" class="stage-duration">{{ stepDurationLabel(step.stage) }}</span>
                            </div>
                            <div class="form-text">{{ $t(step.descriptionKey) }}</div>
                        </div>
                    </div>
                    <div v-if="operation.stage === 'rollback'" class="update-stage" :class="stepStatusClass('rollback')">
                        <span class="stage-marker">{{ stepMarker("rollback") }}</span>
                        <div class="stage-body">
                            <div class="stage-heading">
                                <strong>{{ $t("updates.stage.rollback.title") }}</strong>
                                <span v-if="stepDurationLabel('rollback')" class="stage-duration">{{ stepDurationLabel("rollback") }}</span>
                            </div>
                            <div class="form-text">{{ $t("updates.stage.rollback.description") }}</div>
                        </div>
                    </div>
                </div>
            </template>

            <p v-if="operation.state === 'scheduled'" class="alert alert-warning py-2 mb-3">
                {{ $t("updates.status.deferredReason", { reason: blockerReason }) }}
            </p>
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
type SelfUpdateStage = "preparing" | "backup" | "verify-backup" | "prune-backup" | "prepare-updater" | "pull-target" | "replace-container" | "health-check" | "rollback";
interface StageTiming {
    stage: SelfUpdateStage;
    startedAt: string;
    finishedAt?: string | null;
}
interface Operation {
    state: string;
    message: string;
    startedAt?: string | null;
    finishedAt?: string | null;
    targetImage?: string;
    deferredBy?: string;
    stage?: SelfUpdateStage;
    stageStartedAt?: string | null;
    stageHistory?: StageTiming[];
}
interface HostStats {
    cpu: number;
    ram: {
        percent: number;
    };
    host?: {
        loadAverage?: number[];
    };
}

const { t } = useI18n();
const settings = ref({ mode: "manual", schedule: { type: "immediate", start: "03:00", end: "05:00", days: [ 0, 1, 2, 3, 4, 5, 6 ] }, pause: { enabled: false, until: null as string | null } });
const updatePause = ref({ enabled: false, until: null as string | null });
const emptyBuild = (): BuildMetadata => ({ revision: "", created: "" });
const status = ref({ updateAvailable: false, repo: "", localDigest: "", remoteDigest: "", localBuild: emptyBuild(), remoteBuild: emptyBuild(), error: null as string | null });
const operation = ref<Operation>({ state: "idle", message: "", startedAt: null, finishedAt: null, targetImage: "" });
const progress = ref<null | {
    phase: "backup" | "verification" | "retention";
    label: string;
    completed?: number;
    total?: number;
    filesDone?: number;
    totalFiles?: number;
    destinationIndex?: number;
    destinationCount?: number;
    snapshotsToRemove?: number;
}>(null);
const hostStats = ref<HostStats | null>(null);
const updating = ref(false);
const availableImages = ref(0);
const imageBatch = ref({
    running: false,
    total: 0,
    completed: 0,
    current: null as string | null,
    error: null as string | null,
});
const pausePreset = ref("7");
const pauseDate = ref("");
const now = ref(Date.now());
const weekDays = computed(() => [ 0, 1, 2, 3, 4, 5, 6 ].map((value) => ({ value, label: t(`updates.self.day${value}`) })));
let statusTimer: ReturnType<typeof setInterval> | undefined;
let clockTimer: ReturnType<typeof setInterval> | undefined;

const activeStates = new Set([ "scheduled", "backing-up", "verifying-backup", "updating", "waiting-health", "rolling-back" ]);
const terminalStates = new Set([ "succeeded", "failed", "rolled-back", "rollback-failed" ]);
const failedStates = new Set([ "failed", "rolled-back", "rollback-failed" ]);
const operationActive = computed(() => activeStates.has(operation.value.state));
const operationExecuting = computed(() => operationActive.value && operation.value.state !== "scheduled");
const updateStageDefinitions: Array<{
    stage: Exclude<SelfUpdateStage, "rollback">;
    titleKey: string;
    descriptionKey: string;
}> = [
    {
        stage: "preparing",
        titleKey: "updates.stage.preparing.title",
        descriptionKey: "updates.stage.preparing.description",
    },
    {
        stage: "backup",
        titleKey: "updates.stage.backup.title",
        descriptionKey: "updates.stage.backup.description",
    },
    {
        stage: "verify-backup",
        titleKey: "updates.stage.verify-backup.title",
        descriptionKey: "updates.stage.verify-backup.description",
    },
    {
        stage: "prune-backup",
        titleKey: "updates.stage.prune-backup.title",
        descriptionKey: "updates.stage.prune-backup.description",
    },
    {
        stage: "prepare-updater",
        titleKey: "updates.stage.prepare-updater.title",
        descriptionKey: "updates.stage.prepare-updater.description",
    },
    {
        stage: "pull-target",
        titleKey: "updates.stage.pull-target.title",
        descriptionKey: "updates.stage.pull-target.description",
    },
    {
        stage: "replace-container",
        titleKey: "updates.stage.replace-container.title",
        descriptionKey: "updates.stage.replace-container.description",
    },
    {
        stage: "health-check",
        titleKey: "updates.stage.health-check.title",
        descriptionKey: "updates.stage.health-check.description",
    },
];
const regularStageIndex = new Map<SelfUpdateStage, number>(updateStageDefinitions.map((step, index) => [ step.stage, index + 1 ] as const));
const activeStep = computed(() => operation.value.stage ? (regularStageIndex.get(operation.value.stage) ?? null) : null);
const showStageTimeline = computed(() => Boolean(operation.value.stage || operation.value.stageHistory?.length));
const currentStateLabel = computed(() => {
    if (operationActive.value && operation.value.stage) {
        return t(`updates.stage.${operation.value.stage}.title`);
    }
    if (operationActive.value) return t(`updates.status.${operation.value.state}`);
    if ([ "failed", "rolled-back", "rollback-failed" ].includes(operation.value.state)) return t(`updates.status.${operation.value.state}`);
    if (status.value.error) return t("updates.status.checkUnavailableTitle");
    return status.value.updateAvailable ? t("updates.status.available") : t("updates.status.current");
});
const currentStateClass = computed(() => {
    if (operationActive.value) return "state-active";
    if ([ "failed", "rolled-back", "rollback-failed" ].includes(operation.value.state)) return "state-error";
    if (status.value.error) return "state-error";
    return status.value.updateAvailable ? "state-warning" : "state-success";
});
const showTechnicalError = computed(() => [ "failed", "rollback-failed" ].includes(operation.value.state) && !!operation.value.message);
const blockerReason = computed(() => operation.value.deferredBy
    ? t(`updates.blocker.${operation.value.deferredBy}`)
    : operation.value.message);
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
const stageElapsedMs = computed(() => operation.value.stageStartedAt ? Math.max(0, now.value - Date.parse(operation.value.stageStartedAt)) : 0);
const stageElapsedLabel = computed(() => stageElapsedMs.value ? formatDuration(stageElapsedMs.value) : "");
const remainingLabel = computed(() => {
    if (progress.value?.phase !== "backup" || !progress.value.total || !progress.value.completed || stageElapsedMs.value < 5_000) {
        return "";
    }
    const remaining = progress.value.total - progress.value.completed;
    if (remaining <= 0) return "";
    return formatDuration(stageElapsedMs.value * remaining / progress.value.completed);
});
const throughputLabel = computed(() => {
    if (progress.value?.phase !== "backup" || !progress.value.completed || stageElapsedMs.value < 2_000) {
        return "";
    }
    return `${formatBytes(progress.value.completed / (stageElapsedMs.value / 1000))}/s`;
});
const loadAverageLabel = computed(() => {
    const value = hostStats.value?.host?.loadAverage?.[0];
    return Number.isFinite(value) ? Number(value).toFixed(2) : "";
});
const lastOperationLabel = computed(() => {
    if (!terminalStates.has(operation.value.state) || !operation.value.finishedAt) return "";
    const date = new Date(operation.value.finishedAt).toLocaleString();
    const duration = operation.value.startedAt ? formatDuration(Date.parse(operation.value.finishedAt) - Date.parse(operation.value.startedAt)) : "";
    const state = t(`updates.status.${operation.value.state}`);
    return duration ? t("updates.status.lastOperationWithDuration", { state, date, duration }) : t("updates.status.lastOperationAt", { state, date });
});
const pauseLabel = computed(() => updatePause.value.until ? t("updates.pause.until", { date: new Date(updatePause.value.until).toLocaleString() }) : t("updates.pause.indefinite"));

function stageTiming(stage: SelfUpdateStage): StageTiming | undefined {
    return [...(operation.value.stageHistory ?? [])].reverse().find(entry => entry.stage === stage);
}

function stepStatusClass(stage: SelfUpdateStage): string {
    if (stage === "rollback") {
        if (operation.value.state === "rolling-back") {
            return "stage-current";
        }
        if (operation.value.state === "rolled-back") {
            return "stage-done";
        }
        if (operation.value.state === "rollback-failed") {
            return "stage-failed";
        }
    }

    if ([ "rolling-back", "rolled-back", "rollback-failed" ].includes(operation.value.state)) {
        const history = operation.value.stageHistory ?? [];
        const rollbackIndex = history.map(entry => entry.stage).lastIndexOf("rollback");
        const failedStage = rollbackIndex > 0 ? history[rollbackIndex - 1]?.stage : undefined;
        if (failedStage === stage) {
            return "stage-failed";
        }
    }

    if (failedStates.has(operation.value.state) && operation.value.stage === stage) {
        return "stage-failed";
    }
    if (operationExecuting.value && operation.value.stage === stage) {
        return "stage-current";
    }
    if (stageTiming(stage)?.finishedAt) {
        return "stage-done";
    }
    return "stage-pending";
}

function stepMarker(stage: SelfUpdateStage): string {
    const statusClass = stepStatusClass(stage);
    if (statusClass === "stage-done") {
        return "✓";
    }
    if (statusClass === "stage-failed") {
        return "×";
    }
    if (statusClass === "stage-current") {
        return "●";
    }
    return "○";
}

function stepDurationLabel(stage: SelfUpdateStage): string {
    const timing = stageTiming(stage);
    if (!timing) {
        return "";
    }
    const startedAt = Date.parse(timing.startedAt);
    const finishedAt = timing.finishedAt ? Date.parse(timing.finishedAt) : (operation.value.stage === stage ? now.value : NaN);
    if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || finishedAt < startedAt) {
        return "";
    }
    return formatDuration(finishedAt - startedAt);
}

async function loadHostStats() {
    try {
        const token = localStorage.getItem("token") ?? sessionStorage.getItem("token") ?? "";
        const res = await fetch("/api/system/stats", {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (data.ok) {
            hostStats.value = data.data as HostStats;
        }
    } catch {
        // La progression self-update reste utilisable même si les stats hôte sont indisponibles.
    }
}

async function load() {
    const [ settingsResult, statusResult, pauseResult, imageResult ] = await Promise.all([
        watcherApi("GET", "/self/settings"), watcherApi("GET", "/self/status"), watcherApi("GET", "/image/auto-update"), watcherApi("GET", "/image/update-all"),
    ]);
    if (settingsResult.ok) settings.value = settingsResult.data;
    if (statusResult.ok) {
        status.value = { ...status.value, ...statusResult };
        operation.value = statusResult.operation ?? operation.value;
        progress.value = statusResult.progress ?? null;
    }
    if (operationExecuting.value) {
        await loadHostStats();
    } else {
        hostStats.value = null;
    }
    const selfPause = settingsResult.ok ? settingsResult.data.pause : null;
    const globalPause = pauseResult.ok ? pauseResult.data.globalUpdatePause : null;
    const activePause = [ selfPause, globalPause ].find((pause) => pause?.enabled && (!pause.until || Date.parse(pause.until) > Date.now()));
    updatePause.value = activePause ?? globalPause ?? selfPause ?? updatePause.value;
    if (imageResult.ok) {
        availableImages.value = imageResult.data.available;
        imageBatch.value = imageResult.data.batch;
    }
}

async function updateAllImages() {
    if (!window.confirm(t("updates.images.confirm", { count: availableImages.value }))) {
        return;
    }
    const result = await watcherApi("POST", "/image/update-all");
    if (result.ok) {
        imageBatch.value = result.data;
        await load();
    } else {
        imageBatch.value = {
            running: false,
            total: 0,
            completed: 0,
            current: null,
            error: result.message || t("updates.images.unknownError"),
        };
    }
}

async function save() { await watcherApi("POST", "/self/settings", settings.value); }
async function saveUpdatePause() {
    if (!updatePause.value.enabled) updatePause.value.until = null;
    settings.value.pause = { ...updatePause.value };
    await Promise.all([
        watcherApi("POST", "/self/settings", settings.value),
        watcherApi("POST", "/image/update-pause", updatePause.value),
    ]);
}
async function applyPausePreset() {
    updatePause.value.until = pausePreset.value === "indefinite" ? null : new Date(Date.now() + Number(pausePreset.value) * 86_400_000).toISOString();
    await saveUpdatePause();
}
async function setCustomPause() {
    updatePause.value.until = pauseDate.value ? new Date(pauseDate.value).toISOString() : null;
    await saveUpdatePause();
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
.machine-load { display: flex; flex-wrap: wrap; gap: .8rem; align-items: center; border: 1px solid var(--bs-border-color); border-radius: .5rem; padding: .55rem .7rem; font-size: .86rem; }
.progress-details { display: flex; flex-wrap: wrap; gap: .35rem 1rem; }
.update-stages { display: flex; flex-direction: column; gap: .35rem; }
.update-stage { display: flex; gap: .65rem; border-left: 3px solid var(--bs-border-color); padding: .55rem .7rem; background: rgba(var(--bs-secondary-rgb), .035); }
.stage-marker { width: 1.1rem; flex: 0 0 1.1rem; text-align: center; font-weight: 700; }
.stage-body { min-width: 0; flex: 1; }
.stage-heading { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .5rem; }
.stage-duration { color: var(--bs-secondary-color); font-size: .82rem; }
.stage-current { border-left-color: #f59e0b; background: rgba(245, 158, 11, .08); }
.stage-current .stage-marker { color: #f59e0b; }
.stage-done { border-left-color: #22c55e; }
.stage-done .stage-marker { color: #22c55e; }
.stage-failed { border-left-color: #ef4444; background: rgba(239, 68, 68, .08); }
.stage-failed .stage-marker { color: #ef4444; }
.stage-pending { opacity: .7; }
.last-operation { font-size: .9rem; }
</style>
