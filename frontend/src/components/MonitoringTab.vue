<template>
    <div>

        <!-- ═══ SECTION 1 : STATUT GLOBAL ═══ -->
        <div class="shadow-box big-padding mb-4">
            <div class="d-flex align-items-center justify-content-between mb-3">
                <h5 class="settings-subheading mb-0">
                    <font-awesome-icon icon="chart-line" class="me-2" />{{ $t('watcher.monitoring.statusHeading') }}
                </h5>
                <span v-if="overviewLoading" class="spinner-border spinner-border-sm text-secondary" />
            </div>

            <div class="monitoring-cards">
                <!-- Dernier backup -->
                <div class="monitoring-card" :class="backupCardClass">
                    <div class="mc-body">
                        <div class="mc-label">{{ $t('watcher.monitoring.lastBackup') }}</div>
                        <div class="mc-value" v-if="overview.backup.lastTimestamp">
                            <span :class="overview.backup.success ? 'text-success' : 'text-danger'">
                                {{ overview.backup.success ? '✅' : '❌' }}
                            </span>
                            {{ formatAge(overview.backup.ageMinutes) }}
                        </div>
                        <div class="mc-value text-muted" v-else>{{ $t('watcher.monitoring.lastBackupNever') }}</div>
                    </div>
                </div>

                <!-- Images en attente -->
                <div class="monitoring-card" :class="overview.images.pendingCount > 0 ? 'mc-warn' : 'mc-ok'">
                    <div class="mc-body">
                        <div class="mc-label">{{ $t('watcher.monitoring.pendingUpdates') }}</div>
                        <div class="mc-value">
                            <span :class="overview.images.pendingCount > 0 ? 'badge bg-warning text-dark' : 'badge bg-success'">
                                {{ overview.images.pendingCount }}
                            </span>
                            <span v-if="overview.images.pendingImages.length" class="mc-detail">
                                {{ overview.images.pendingImages.map(i => i.image.split(':')[0].split('/').pop()).join(', ') }}
                            </span>
                        </div>
                    </div>
                </div>

                <!-- CVE critiques -->
                <div class="monitoring-card" :class="overview.trivy.criticalCount > 0 ? 'mc-danger' : 'mc-ok'">
                    <div class="mc-body">
                        <div class="mc-label">{{ $t('watcher.monitoring.criticalCves') }}</div>
                        <div class="mc-value">
                            <span :class="overview.trivy.criticalCount > 0 ? 'badge bg-danger' : 'badge bg-success'">
                                {{ overview.trivy.criticalCount }}
                            </span>
                            <span v-if="overview.trivy.criticalImages.length" class="mc-detail">
                                {{ overview.trivy.criticalImages.map(i => i.image.split(':')[0].split('/').pop()).join(', ') }}
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Prochain scan Trivy -->
                <div class="monitoring-card mc-neutral">
                    <div class="mc-body">
                        <div class="mc-label">{{ $t('watcher.monitoring.nextTrivy') }}</div>
                        <div class="mc-value" v-if="overview.trivy.nextScanAt">
                            {{ formatAge(nextTrivyMinutes) }}
                        </div>
                        <div class="mc-value text-muted" v-else>{{ $t('watcher.monitoring.nextTrivyNone') }}</div>
                        <div class="mc-detail text-muted" v-if="overview.trivy.lastScanAt">
                            {{ $t('watcher.monitoring.lastBackupAge') }} {{ formatAge(lastTrivyMinutes) }}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ═══ SECTION 2 : PARAMÈTRES D'AFFICHAGE ═══ -->
        <div class="shadow-box big-padding mb-4">
            <h5 class="settings-subheading mb-3">
                <font-awesome-icon icon="display" class="me-2" />{{ $t('watcher.monitoring.displayHeading') }}
            </h5>

            <div class="row g-3 align-items-start">
                <!-- Toggle stats par stack -->
                <div class="col-12">
                    <div class="form-check form-switch mb-0">
                        <input id="monStackStats" v-model="localStackStatsEnabled"
                            class="form-check-input" type="checkbox" role="switch" />
                        <label class="form-check-label fw-semibold" for="monStackStats">
                            {{ $t('watcher.monitoring.stackStats') }}
                        </label>
                    </div>
                    <small class="form-text">{{ $t('watcher.monitoring.stackStatsHint') }}</small>
                </div>

                <!-- Partition disque -->
                <div class="col-md-6">
                    <label class="form-label small" for="monDiskPartition">
                        <font-awesome-icon icon="floppy-disk" class="me-1" />{{ $t('watcher.monitoring.diskPartition') }}
                    </label>
                    <div class="input-group input-group-sm">
                        <input id="monDiskPartition" v-model="diskPartition"
                            class="form-control" placeholder="/" style="max-width: 200px" />
                        <button class="btn btn-primary btn-sm" @click="saveDisplaySettings" :disabled="savingDisplay">
                            <span v-if="savingDisplay" class="spinner-border spinner-border-sm me-1" />
                            <font-awesome-icon v-else icon="save" class="me-1" />{{ $t('Save') }}
                        </button>
                    </div>
                    <small class="form-text">{{ $t('watcher.monitoring.diskPartitionHint') }}</small>
                </div>
            </div>
        </div>

        <!-- ═══ SECTION 3 : CRASH LOOP ═══ -->
        <div class="shadow-box big-padding mb-4">
            <h5 class="settings-subheading mb-3">
                <font-awesome-icon icon="rotate" class="me-2" />{{ $t('watcher.monitoring.crashHeading') }}
            </h5>

            <div class="row g-3 mb-3">
                <!-- Activer -->
                <div class="col-12">
                    <div class="form-check form-switch mb-0">
                        <input id="crashEnabled" v-model="monSettings.crashLoopEnabled"
                            class="form-check-input" type="checkbox" role="switch" />
                        <label class="form-check-label fw-semibold" for="crashEnabled">
                            {{ $t('watcher.monitoring.crashEnabled') }}
                        </label>
                    </div>
                </div>

                <template v-if="monSettings.crashLoopEnabled">
                    <!-- Seuil -->
                    <div class="col-md-4">
                        <label class="form-label small">{{ $t('watcher.monitoring.crashThreshold') }}</label>
                        <div class="input-group input-group-sm">
                            <input v-model.number="monSettings.crashLoopThreshold" type="number" min="2" max="50"
                                class="form-control" style="max-width: 80px" />
                            <span class="input-group-text">{{ $t('watcher.monitoring.crashRestarts') }}</span>
                        </div>
                    </div>

                    <!-- Fenêtre -->
                    <div class="col-md-4">
                        <label class="form-label small">{{ $t('watcher.monitoring.crashWindow') }}</label>
                        <div class="input-group input-group-sm">
                            <input v-model.number="monSettings.crashLoopWindowMinutes" type="number" min="1" max="60"
                                class="form-control" style="max-width: 80px" />
                            <span class="input-group-text">min</span>
                        </div>
                    </div>

                    <!-- Cooldown -->
                    <div class="col-md-4">
                        <label class="form-label small">{{ $t('watcher.monitoring.crashCooldown') }}</label>
                        <div class="input-group input-group-sm">
                            <input v-model.number="monSettings.crashLoopCooldownMinutes" type="number" min="5" max="1440"
                                class="form-control" style="max-width: 80px" />
                            <span class="input-group-text">min</span>
                        </div>
                    </div>

                    <!-- Webhooks Discord -->
                    <div class="col-12">
                        <label class="form-label small">{{ $t('watcher.img.discordWebhook') }}</label>
                        <div v-for="(wh, idx) in monSettings.discordWebhooks" :key="idx"
                            class="d-flex align-items-center gap-2 mb-2">
                            <span class="form-control form-control-sm text-truncate"
                                style="font-family:monospace;font-size:.78rem">{{ maskWebhook(wh) }}</span>
                            <button class="btn btn-sm btn-outline-danger" @click="removeWebhook(idx)">
                                <font-awesome-icon icon="times" />
                            </button>
                        </div>
                        <div class="input-group input-group-sm mt-1">
                            <input v-model="newWebhook" type="url" class="form-control"
                                placeholder="https://discord.com/api/webhooks/..." autocomplete="off" />
                            <button class="btn btn-success btn-sm" @click="addWebhook" :disabled="!newWebhook">
                                <font-awesome-icon icon="plus" class="me-1" />{{ $t('watcher.img.addWebhook') }}
                            </button>
                        </div>
                    </div>
                </template>
            </div>

            <div class="d-flex gap-2 mb-4">
                <button class="btn btn-primary btn-sm" @click="saveMonSettings" :disabled="savingMon">
                    <span v-if="savingMon" class="spinner-border spinner-border-sm me-1" />
                    <font-awesome-icon v-else icon="save" class="me-1" />{{ $t('Save') }}
                </button>
            </div>

            <!-- Tableau crash events -->
            <div v-if="monSettings.crashLoopEnabled">
                <h6 class="form-text fw-semibold mb-2">{{ $t('watcher.monitoring.crashEventsHeading') }}</h6>
                <div v-if="!overview.crashes.length" class="form-text fst-italic">
                    {{ $t('watcher.monitoring.crashEventEmpty') }}
                </div>
                <table v-else class="table table-sm table-dark table-bordered small mb-0">
                    <thead>
                        <tr>
                            <th>{{ $t('watcher.monitoring.crashColContainer') }}</th>
                            <th>{{ $t('watcher.monitoring.crashColCount') }}</th>
                            <th>{{ $t('watcher.monitoring.crashColWindow') }}</th>
                            <th>{{ $t('watcher.monitoring.crashColTime') }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(ev, i) in overview.crashes" :key="i">
                            <td><code>{{ ev.containerName }}</code></td>
                            <td><span class="badge bg-danger">{{ ev.restartCount }}×</span></td>
                            <td>{{ ev.windowMinutes }} min</td>
                            <td class="text-muted">{{ fmtDate(ev.timestamp) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- ═══ SECTION 4 : SEUILS CPU/RAM PAR STACK ═══ -->
        <div class="shadow-box big-padding mb-4">
            <h5 class="settings-subheading mb-3">
                <font-awesome-icon icon="gauge-high" class="me-2" />{{ $t('watcher.monitoring.stackAlertsHeading') }}
            </h5>

            <div class="row g-3 mb-3">
                <!-- Intervalle de check -->
                <div class="col-md-4">
                    <label class="form-label small">{{ $t('watcher.monitoring.stackAlertsInterval') }}</label>
                    <div class="input-group input-group-sm">
                        <input v-model.number="monSettings.stackAlertsIntervalMinutes" type="number" min="1" max="60"
                            class="form-control" style="max-width: 80px" />
                        <span class="input-group-text">min</span>
                    </div>
                </div>

                <!-- Cooldown -->
                <div class="col-md-4">
                    <label class="form-label small">{{ $t('watcher.monitoring.stackAlertsCooldown') }}</label>
                    <div class="input-group input-group-sm">
                        <input v-model.number="monSettings.stackAlertsCooldownMinutes" type="number" min="5" max="1440"
                            class="form-control" style="max-width: 80px" />
                        <span class="input-group-text">min</span>
                    </div>
                </div>

                <!-- Tableau par stack -->
                <div class="col-12">
                    <div v-if="!stacksList.length" class="form-text fst-italic">
                        {{ $t('watcher.monitoring.stackAlertsEmpty') }}
                    </div>
                    <table v-else class="table table-sm table-dark table-bordered small mb-0">
                        <thead>
                            <tr>
                                <th>Stack</th>
                                <th>{{ $t('watcher.monitoring.stackAlertsCpu') }}</th>
                                <th>{{ $t('watcher.monitoring.stackAlertsRam') }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="stack in stacksList" :key="stack">
                                <td><code>{{ stack }}</code></td>
                                <td>
                                    <div class="input-group input-group-sm">
                                        <input
                                            :value="monSettings.stackAlerts[stack]?.cpuPercent ?? ''"
                                            @input="setCpuThreshold(stack, ($event.target as HTMLInputElement).value)"
                                            type="number" min="1" max="100" placeholder="—"
                                            class="form-control form-control-sm"
                                            style="max-width: 70px" />
                                        <span class="input-group-text">%</span>
                                    </div>
                                </td>
                                <td>
                                    <div class="input-group input-group-sm">
                                        <input
                                            :value="monSettings.stackAlerts[stack]?.ramMB ?? ''"
                                            @input="setRamThreshold(stack, ($event.target as HTMLInputElement).value)"
                                            type="number" min="1" placeholder="—"
                                            class="form-control form-control-sm"
                                            style="max-width: 80px" />
                                        <span class="input-group-text">MB</span>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <button class="btn btn-primary btn-sm" @click="saveMonSettings" :disabled="savingMon">
                <span v-if="savingMon" class="spinner-border spinner-border-sm me-1" />
                <font-awesome-icon v-else icon="save" class="me-1" />{{ $t('Save') }}
            </button>
        </div>

        <!-- Toast -->
        <Transition name="slide-fade">
            <div v-if="toast.msg" class="toast-float" :class="toast.ok ? 'toast-ok' : 'toast-err'">
                {{ toast.msg }}
            </div>
        </Transition>

    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useI18n } from "vue-i18n/dist/vue-i18n.esm-browser.prod.js";
import { initServerTz, fmtDate } from "../composables/useServerTz";
import { stackStatsEnabled } from "../composables/useStackStats";

const { t } = useI18n();
initServerTz();

// ─── Types ────────────────────────────────────────────────────────

interface MonitoringSettings {
    crashLoopEnabled: boolean;
    crashLoopThreshold: number;
    crashLoopWindowMinutes: number;
    crashLoopCooldownMinutes: number;
    stackAlertsEnabled: boolean;
    stackAlerts: Record<string, { cpuPercent?: number; ramMB?: number }>;
    stackAlertsIntervalMinutes: number;
    stackAlertsCooldownMinutes: number;
    discordWebhooks: string[];
    notificationLang: "fr" | "en";
}

interface Overview {
    backup: { lastTimestamp: string | null; ageMinutes: number | null; success: boolean | null };
    images: { pendingCount: number; pendingImages: { image: string; stack: string }[] };
    trivy:  { criticalCount: number; criticalImages: { image: string; stack: string; maxSeverity: string }[]; lastScanAt: string | null; nextScanAt: string | null };
    crashes: { containerName: string; restartCount: number; windowMinutes: number; timestamp: string }[];
}

// ─── API helper ───────────────────────────────────────────────────

async function api(method: string, path: string, body?: unknown): Promise<{ ok: boolean; data?: unknown; message?: string }> {
    const token = localStorage.getItem("token") ?? "";
    const fullPath = "/api" + path;
    const sep = fullPath.includes("?") ? "&" : "?";
    const res = await fetch(`${fullPath}${sep}token=${encodeURIComponent(token)}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
}

// ─── State ────────────────────────────────────────────────────────

const overviewLoading = ref(false);
const overview = ref<Overview>({
    backup:  { lastTimestamp: null, ageMinutes: null, success: null },
    images:  { pendingCount: 0, pendingImages: [] },
    trivy:   { criticalCount: 0, criticalImages: [], lastScanAt: null, nextScanAt: null },
    crashes: [],
});

const monSettings = ref<MonitoringSettings>({
    crashLoopEnabled: false,
    crashLoopThreshold: 5,
    crashLoopWindowMinutes: 10,
    crashLoopCooldownMinutes: 60,
    stackAlertsEnabled: false,
    stackAlerts: {},
    stackAlertsIntervalMinutes: 5,
    stackAlertsCooldownMinutes: 30,
    discordWebhooks: [],
    notificationLang: "fr",
});

const stacksList     = ref<string[]>([]);
const diskPartition  = ref("/");
const savingMon      = ref(false);
const savingDisplay  = ref(false);
const newWebhook     = ref("");
const toast          = ref({ msg: "", ok: true });

// Sync with global stackStatsEnabled composable
const localStackStatsEnabled = ref(stackStatsEnabled.value);
watch(localStackStatsEnabled, (val) => {
    stackStatsEnabled.value = val;
    localStorage.setItem("stackStatsEnabled", String(val));
});

// ─── Computed ─────────────────────────────────────────────────────

const backupCardClass = computed(() => {
    if (!overview.value.backup.lastTimestamp) return "mc-neutral";
    return overview.value.backup.success ? "mc-ok" : "mc-danger";
});

const nextTrivyMinutes = computed<number | null>(() => {
    const s = overview.value.trivy.nextScanAt;
    if (!s) return null;
    return Math.max(0, Math.floor((new Date(s).getTime() - Date.now()) / 60_000));
});

const lastTrivyMinutes = computed<number | null>(() => {
    const s = overview.value.trivy.lastScanAt;
    if (!s) return null;
    return Math.floor((Date.now() - new Date(s).getTime()) / 60_000);
});

// ─── Helpers ──────────────────────────────────────────────────────

function formatAge(minutes: number | null): string {
    if (minutes === null) return "—";
    if (minutes < 1) return t("watcher.monitoring.ageJustNow");
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function maskWebhook(url: string): string {
    try {
        const u = new URL(url);
        return u.origin + u.pathname.replace(/\/[^/]+$/, "/***");
    } catch { return url; }
}

function showToast(msg: string, ok = true) {
    toast.value = { msg, ok };
    setTimeout(() => { toast.value.msg = ""; }, 3000);
}

// ─── Stack threshold helpers ──────────────────────────────────────

function setCpuThreshold(stack: string, val: string) {
    const num = val === "" ? undefined : Number(val);
    monSettings.value.stackAlerts[stack] = {
        ...monSettings.value.stackAlerts[stack],
        cpuPercent: num,
    };
}

function setRamThreshold(stack: string, val: string) {
    const num = val === "" ? undefined : Number(val);
    monSettings.value.stackAlerts[stack] = {
        ...monSettings.value.stackAlerts[stack],
        ramMB: num,
    };
}

// ─── Webhook helpers ──────────────────────────────────────────────

function addWebhook() {
    if (!newWebhook.value.trim()) return;
    monSettings.value.discordWebhooks.push(newWebhook.value.trim());
    newWebhook.value = "";
}
function removeWebhook(idx: number) {
    monSettings.value.discordWebhooks.splice(idx, 1);
}

// ─── API calls ────────────────────────────────────────────────────

async function loadOverview() {
    overviewLoading.value = true;
    try {
        const res = await api("GET", "/monitoring/overview");
        if (res.ok) overview.value = res.data as Overview;
    } finally {
        overviewLoading.value = false;
    }
}

async function loadSettings() {
    const [settingsRes, displayRes, stacksRes] = await Promise.all([
        api("GET", "/monitoring/settings"),
        api("GET", "/monitoring/display-settings"),
        api("GET", "/monitoring/stacks"),
    ]);
    if (settingsRes.ok) monSettings.value = settingsRes.data as MonitoringSettings;
    if (displayRes.ok) diskPartition.value = (displayRes.data as { diskPartition: string }).diskPartition ?? "/";
    if (stacksRes.ok)  stacksList.value    = stacksRes.data as string[];
}

async function saveMonSettings() {
    savingMon.value = true;
    try {
        // stackAlertsEnabled is always true — the toggle has been removed
        const payload = { ...monSettings.value, stackAlertsEnabled: true };
        const res = await api("POST", "/monitoring/settings", payload);
        showToast(res.ok ? "✅ " + t("watcher.monitoring.saved") : `❌ ${res.message}`, res.ok);
    } finally { savingMon.value = false; }
}

async function saveDisplaySettings() {
    savingDisplay.value = true;
    try {
        const res = await api("POST", "/monitoring/display-settings", { diskPartition: diskPartition.value });
        showToast(res.ok ? "✅ " + t("watcher.monitoring.saved") : `❌ ${res.message}`, res.ok);
    } finally { savingDisplay.value = false; }
}

// ─── Polling ──────────────────────────────────────────────────────

let pollTimer: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
    await Promise.all([loadOverview(), loadSettings()]);
    pollTimer = setInterval(loadOverview, 30_000);
});

onUnmounted(() => {
    if (pollTimer) clearInterval(pollTimer);
});
</script>

<style scoped>
/* ── Overview cards ── */
.monitoring-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
}

.monitoring-card {
    border-radius: 10px;
    padding: 14px 16px;
    display: flex;
    gap: 12px;
    align-items: flex-start;
    border: 1px solid rgba(255,255,255,.07);
    background: rgba(255,255,255,.04);
    transition: border-color .2s;
}

.monitoring-card.mc-ok     { border-color: rgba(34,197,94,.35);  }
.monitoring-card.mc-warn   { border-color: rgba(245,158,11,.35); }
.monitoring-card.mc-danger { border-color: rgba(239,68,68,.35);  }
.monitoring-card.mc-neutral{ border-color: rgba(255,255,255,.1); }

.mc-icon { font-size: 1.6rem; line-height: 1; flex-shrink: 0; }

.mc-label {
    font-size: .72rem;
    text-transform: uppercase;
    letter-spacing: .05em;
    color: #9ca3af;
    margin-bottom: 4px;
}
.mc-value {
    font-size: 1rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
}
.mc-detail {
    font-size: .7rem;
    color: #9ca3af;
    font-weight: 400;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* ── Toast (clone du BackupTab) ── */
.toast-float {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9999;
    padding: 10px 18px;
    border-radius: 8px;
    font-size: .875rem;
    font-weight: 600;
    box-shadow: 0 4px 16px rgba(0,0,0,.4);
}
.toast-ok  { background: #22c55e; color: #fff; }
.toast-err { background: #ef4444; color: #fff; }

.slide-fade-enter-active, .slide-fade-leave-active { transition: all .25s ease; }
.slide-fade-enter-from, .slide-fade-leave-to { transform: translateY(12px); opacity: 0; }
</style>
