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
                <h3 class="h6">{{ $t("updates.status.heading") }}</h3>
                <p class="mb-1">{{ operation.message || $t("updates.status.idle") }}</p>
                <button
                    v-if="status.updateAvailable"
                    class="btn btn-sm btn-primary mt-2"
                    :disabled="updating"
                    @click="startUpdate"
                >
                    <span v-if="updating" class="spinner-border spinner-border-sm me-1" />
                    {{ $t("updates.self.start") }}
                </button>
                <small v-if="status.updateAvailable" class="text-warning d-block mt-2">{{ $t("updates.status.available") }}</small>
                <small v-else class="text-success">{{ $t("updates.status.current") }}</small>
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n/dist/vue-i18n.esm-browser.prod.js";
import { watcherApi } from "./shared";

const { t } = useI18n();
const settings = ref({ mode: "manual", schedule: { type: "immediate", start: "03:00", end: "05:00", days: [ 0, 1, 2, 3, 4, 5, 6 ] }, pause: { enabled: false, until: null as string | null } });
const globalPause = ref({ enabled: false, until: null as string | null });
const status = ref({ updateAvailable: false, repo: "" });
const operation = ref({ state: "idle", message: "" });
const updating = ref(false);
const pausePreset = ref("7");
const pauseDate = ref("");
const weekDays = computed(() => [ 0, 1, 2, 3, 4, 5, 6 ].map((value) => ({ value, label: t(`updates.self.day${value}`) })));

const pauseLabel = computed(() => globalPause.value.until ? t("updates.pause.until", { date: new Date(globalPause.value.until).toLocaleString() }) : t("updates.pause.indefinite"));

async function load() {
    const [ settingsResult, statusResult, pauseResult ] = await Promise.all([
        watcherApi("GET", "/self/settings"), watcherApi("GET", "/self/status"), watcherApi("GET", "/image/auto-update"),
    ]);
    if (settingsResult.ok) settings.value = settingsResult.data;
    if (statusResult.ok) {
        status.value = statusResult;
        operation.value = statusResult.operation ?? operation.value;
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

async function startUpdate() {
    if (!status.value.repo) return;
    updating.value = true;
    try {
        const res = await watcherApi("POST", "/self/update", { targetImage: `ghcr.io/${status.value.repo}:latest` });
        if (res.ok) {
            sessionStorage.setItem("dockge-self-update-in-progress", "1");
            operation.value = res.data;
        }
    } finally {
        updating.value = false;
    }
}

onMounted(load);
</script>

<style scoped lang="scss">
.watcher-updates { max-width: 760px; }
.pause-preset { width: auto; min-width: 11rem; }
.pause-date { width: auto; }
</style>
