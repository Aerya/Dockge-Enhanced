<template>
    <div>
        <!-- ═══ DESTINATIONS ═══ -->
        <BackupDestinations v-model="settings" :is-backup-stale="isBackupStale" />

        <!-- ═══ VOLUMES ═══ -->
        <BackupVolumes v-model="settings" :mounted-vols="mountedVols" :loading-mounted-vols="loadingMountedVols" />

        <!-- ═══ PATTERNS D'EXCLUSION ═══ -->
        <div class="shadow-box big-padding mb-4">
            <h5 class="settings-subheading mb-1">
                <font-awesome-icon icon="ban" class="me-2" />{{ $t('watcher.backup.excludePatterns.heading') }}
            </h5>
            <p class="form-text mb-3">{{ $t('watcher.backup.excludePatterns.hint') }}</p>
            <div class="d-flex gap-2 mb-2">
                <input v-model="newExcludePattern" type="text" class="form-control form-control-sm"
                    :placeholder="$t('watcher.backup.excludePatterns.placeholder')"
                    @keydown.enter.prevent="addExcludePattern" />
                <button class="btn btn-sm btn-outline-primary" @click="addExcludePattern">
                    <font-awesome-icon icon="plus" />
                </button>
            </div>
            <div v-if="(settings.excludePatterns ?? []).length > 0" class="exclude-pattern-list">
                <div v-for="(p, i) in settings.excludePatterns" :key="i" class="exclude-pattern-item">
                    <code class="small">{{ p }}</code>
                    <button class="btn btn-xs btn-link text-danger p-0" @click="removeExcludePattern(i)">
                        <font-awesome-icon icon="times" />
                    </button>
                </div>
            </div>
            <p v-else class="form-text fst-italic mb-0">{{ $t('watcher.backup.excludePatterns.empty') }}</p>
        </div>

        <!-- ═══ COHÉRENCE PAR STACK ═══ -->
        <BackupStackPolicies v-model="settings" :stacks-list="stacksList" />

        <!-- ═══ RÉTENTION ═══ -->
        <div class="shadow-box big-padding mb-4">
            <h5 class="settings-subheading mb-3">
                <font-awesome-icon icon="history" class="me-2" />{{ $t('watcher.backup.retention.heading') }}
            </h5>
            <div class="row g-3">
                <div class="col-md-3">
                    <label class="form-label">{{ $t('watcher.backup.retention.keepLast') }}</label>
                    <input v-model.number="settings.retention.keepLast" type="number"
                        class="form-control" min="1" max="100" />
                </div>
                <div class="col-md-3">
                    <label class="form-label">{{ $t('watcher.backup.retention.keepDaily') }}</label>
                    <input v-model.number="settings.retention.keepDaily" type="number"
                        class="form-control" min="0" />
                </div>
                <div class="col-md-3">
                    <label class="form-label">{{ $t('watcher.backup.retention.keepWeekly') }}</label>
                    <input v-model.number="settings.retention.keepWeekly" type="number"
                        class="form-control" min="0" />
                </div>
                <div class="col-md-3">
                    <label class="form-label">{{ $t('watcher.backup.retention.keepMonthly') }}</label>
                    <input v-model.number="settings.retention.keepMonthly" type="number"
                        class="form-control" min="0" />
                </div>
            </div>
            <small class="form-text mt-2 d-block">{{ $t('watcher.backup.retention.hint') }}</small>
        </div>

        <!-- ═══ ACTIONS ═══ -->
        <div class="d-flex gap-2 flex-wrap mb-4">
            <button class="btn btn-primary" @click="save" :disabled="saving">
                <span v-if="saving" class="spinner-border spinner-border-sm me-1" />
                <font-awesome-icon v-else icon="save" class="me-1" />{{ $t('watcher.backup.saveConfig') }}
            </button>
            <button class="btn btn-normal" @click="initRepo" :disabled="initing">
                <span v-if="initing" class="spinner-border spinner-border-sm me-1" />
                <font-awesome-icon v-else icon="database" class="me-1" />{{ $t('watcher.backup.initRepo') }}
            </button>
            <button class="btn btn-success" @click="runBackup" :disabled="running">
                <span v-if="running" class="spinner-border spinner-border-sm me-1" />
                <font-awesome-icon v-else icon="cloud-upload-alt" class="me-1" />{{ $t('watcher.backup.runNow') }}
            </button>
            <button class="btn btn-normal" @click="snapshotsPanel?.loadSnapshots()" :disabled="snapshotsPanel?.loadingSnaps">
                <span v-if="snapshotsPanel?.loadingSnaps" class="spinner-border spinner-border-sm me-1" />
                <font-awesome-icon v-else icon="sync" class="me-1" />{{ $t('watcher.backup.refreshSnapshots') }}
            </button>
            <button class="btn btn-normal" @click="checkIntegrity" :disabled="checking">
                <span v-if="checking" class="spinner-border spinner-border-sm me-1" />
                <font-awesome-icon v-else icon="shield-alt" class="me-1" />
                {{ checking ? $t('watcher.backup.checkRunning') : $t('watcher.backup.checkIntegrity') }}
            </button>
        </div>

        <!-- ═══ BACKUP EN COURS ═══ -->
        <div v-if="runningDests.length > 0" class="backup-running-banner mb-3">
            <span class="spinner-border spinner-border-sm me-2 text-primary" />
            <span class="fw-semibold me-2">{{ $t('watcher.backup.inProgress') }}</span>
            <span v-for="d in runningDests" :key="d.label" class="backup-running-dest">
                {{ d.label }}
                <span class="text-muted ms-1">({{ formatElapsed(d.startedAt) }})</span>
            </span>
        </div>

        <!-- ═══ CHECK RESULTS ═══ -->
        <div v-if="checkResults.length > 0" class="mb-4">
            <div v-for="r in checkResults" :key="r.destIndex"
                class="shadow-box big-padding mb-2"
                :style="r.ok ? 'border-left: 3px solid var(--success)' : 'border-left: 3px solid var(--danger)'">
                <div class="d-flex align-items-center gap-2 mb-1">
                    <strong>{{ r.ok ? $t('watcher.backup.checkOk') : $t('watcher.backup.checkFail') }}</strong>
                    <span class="form-text">— {{ r.label }}</span>
                </div>
                <pre class="small form-text mb-0" style="white-space:pre-wrap;max-height:200px;overflow-y:auto">{{ r.output }}</pre>
            </div>
        </div>

        <!-- ═══ HISTORIQUE ═══ -->
        <BackupHistory :history="history" :next-backup-date="nextBackupDate" />

        <!-- ═══ SNAPSHOTS RESTIC (+ modal aperçu / diff) ═══ -->
        <BackupSnapshots ref="snapshotsPanel" @toast="showToast" />

        <BModal v-model="concurrentBackupModal" :title="$t('watcher.backup.concurrentPopupTitle')"
            ok-only :ok-title="$t('close')">
            <p class="mb-0">{{ $t('watcher.backup.concurrentPopupBody') }}</p>
        </BModal>

        <!-- TOAST -->
        <Transition name="slide-fade">
            <div v-if="toast.msg" class="toast-float" :class="toast.ok ? 'toast-ok' : 'toast-err'">
                {{ toast.msg }}
            </div>
        </Transition>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n/dist/vue-i18n.esm-browser.prod.js";
import { initServerTz } from "../composables/useServerTz";
import { BModal } from "bootstrap-vue-next";
import BackupDestinations from "./backup/BackupDestinations.vue";
import BackupVolumes from "./backup/BackupVolumes.vue";
import BackupStackPolicies from "./backup/BackupStackPolicies.vue";
import BackupHistory from "./backup/BackupHistory.vue";
import BackupSnapshots from "./backup/BackupSnapshots.vue";
import {
    api,
    APP_DATA,
    defaultDestination,
    type BackupResult,
    type Destination,
    type MountedVolume,
    type Settings,
    type VolumeBackupConfig,
} from "./backup/shared";

const { t } = useI18n();

// ─── State ────────────────────────────────────────────────────────

const settings = ref<Settings>({
    enabled: false,
    intervalHours: 24,
    destinations: [defaultDestination(t)],
    retention: { keepLast: 10, keepDaily: 7, keepWeekly: 4, keepMonthly: 3 },
    includeEnvFiles: true,
    volumeBackup: { selectedVolumes: [] },
    extraPaths: [],
    backupOnSave: true,
    preventConcurrentBackups: true,
    excludedStacks: [],
    stackPolicies: {},
    excludePatterns: [],
    restoreTest: true,
});

const stacksList = ref<string[]>([]);
const newExcludePattern = ref("");
function addExcludePattern() {
    const p = newExcludePattern.value.trim();
    if (!p) return;
    if (!(settings.value.excludePatterns ?? []).includes(p)) {
        settings.value.excludePatterns = [...(settings.value.excludePatterns ?? []), p];
    }
    newExcludePattern.value = "";
}
function removeExcludePattern(idx: number) {
    settings.value.excludePatterns = (settings.value.excludePatterns ?? []).filter((_, i) => i !== idx);
}

const mountedVols = ref<MountedVolume[]>([]);
const loadingMountedVols = ref(false);
const history = ref<BackupResult[]>([]);

const saving = ref(false);
const initing = ref(false);
const running = ref(false);
const concurrentBackupModal = ref(false);
const lastBlockedSeen = ref(0);

// ── Backup en cours ──────────────────────────────────────────────
type RunningDest = { label: string; startedAt: number };
const runningDests   = ref<RunningDest[]>([]);
const elapsedTick    = ref(0);  // s'incrémente toutes les secondes pour forcer le re-rendu
let pollTimer: ReturnType<typeof setInterval> | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;

function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(async () => {
        try {
            const res = await api("GET", "/backup/running");
            if (res.ok) {
                runningDests.value = res.data;
                if (res.blocked?.timestamp > lastBlockedSeen.value) {
                    lastBlockedSeen.value = res.blocked.timestamp;
                    concurrentBackupModal.value = true;
                }
            }
        } catch { /* silencieux */ }
    }, 3000);
    tickTimer = setInterval(() => { elapsedTick.value++; }, 1000);
}

function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
}

function formatElapsed(startedAt: number): string {
    void elapsedTick.value; // dépendance réactive
    const ms = Date.now() - startedAt;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

onUnmounted(stopPolling);
const checking = ref(false);
type CheckResult = { destIndex: number; label: string; ok: boolean; output: string };
const checkResults = ref<CheckResult[]>([]);
const toast = ref({ msg: "", ok: true });

// Panneau snapshots (expose loadSnapshots / loadingSnaps pour la barre d'actions)
const snapshotsPanel = ref<InstanceType<typeof BackupSnapshots> | null>(null);

function showToast(msg: string, ok = true) {
    toast.value = { msg, ok };
    setTimeout(() => (toast.value.msg = ""), 3500);
}

/** Fusionne les settings chargés depuis le serveur en préservant
 *  les sous-objets destination (sftp/s3/rest) qui peuvent être absents
 *  du fichier sauvegardé si on n'a configuré que "local". */
function mergeSettings(loaded: Partial<Settings>): Settings {
    const loadedDests: Destination[] = loaded.destinations ?? [];
    const merged = loadedDests.map((d, idx) => {
        const def = settings.value.destinations[idx] ?? defaultDestination(t);
        const dest: Destination = { ...def, ...d };
        // Migration authMode
        if (dest.sftp && !dest.sftp.authMode) {
            dest.sftp.authMode = dest.sftp.keyPath ? "key" : "password";
        }
        // Assure que les sous-objets de config existent
        if (!dest.local) dest.local = { path: "/app/data/backups" };
        if (!dest.sftp)  dest.sftp  = { host: "", port: 22, user: "", path: "", authMode: "key" };
        if (!dest.s3)    dest.s3    = { endpoint: "", bucket: "", path: "dockge", accessKeyId: "", secretAccessKey: "" };
        if (!dest.rest)  dest.rest  = { url: "", user: "", password: "" };
        return dest;
    });
    return {
        ...settings.value,
        ...loaded,
        destinations: merged.length > 0 ? merged : [defaultDestination(t)],
        volumeBackup: {
            // Migration : si l'ancienne config avait includeAppData=true, l'ajouter à selectedVolumes
            selectedVolumes: (() => {
                const sel: string[] = loaded.volumeBackup?.selectedVolumes ?? [];
                if ((loaded.volumeBackup as any)?.includeAppData && !sel.includes(APP_DATA)) {
                    return [APP_DATA, ...sel];
                }
                return sel;
            })(),
        } as VolumeBackupConfig,
    };
}

// ─── Computed ─────────────────────────────────────────────────────

const nextBackupDate = computed(() => {
    if (!settings.value.enabled || history.value.length === 0) return null;
    const last = new Date(history.value[0].timestamp).getTime();
    return new Date(last + settings.value.intervalHours * 3_600_000);
});

const isBackupStale = computed(() => {
    if (!settings.value.enabled) return false;
    const lastSuccess = history.value.find(h => h.success);
    if (!lastSuccess) return false;
    return Date.now() - new Date(lastSuccess.timestamp).getTime() > 2 * (settings.value.intervalHours ?? 24) * 3_600_000;
});

// ─── Init ─────────────────────────────────────────────────────────

async function loadMountedVols() {
    loadingMountedVols.value = true;
    try {
        const res = await api("GET", "/backup/mounted-volumes");
        if (res.ok) mountedVols.value = res.data as MountedVolume[];
    } finally {
        loadingMountedVols.value = false;
    }
}

onMounted(async () => {
    const [settingsRes, histRes, stacksRes] = await Promise.all([
        api("GET", "/backup/settings"),
        api("GET", "/backup/history"),
        api("GET", "/backup/stacks"),
    ]);
    if (settingsRes.ok) {
        settings.value = mergeSettings(settingsRes.data);
    }
    if (histRes.ok) history.value = histRes.data;
    if (stacksRes.ok) stacksList.value = stacksRes.data ?? [];
    await initServerTz(api);
    await loadMountedVols();
    const runningRes = await api("GET", "/backup/running");
    if (runningRes.ok) {
        runningDests.value = runningRes.data;
        const blockedAt = runningRes.blocked?.timestamp ?? 0;
        lastBlockedSeen.value = blockedAt;
        if (blockedAt > Date.now() - 60_000) concurrentBackupModal.value = true;
    }
    startPolling();
});

// ─── Actions ──────────────────────────────────────────────────────

async function save() {
    saving.value = true;
    try {
        const { discordWebhooks: _wh, notificationLang: _lang, ...settingsPayload } = settings.value;
        const res = await api("POST", "/backup/settings", settingsPayload);
        if (res.ok) {
            showToast(t('watcher.backup.saved'));
            // Resync depuis le serveur pour éviter les désynchronisations
            // (notamment le champ "enabled" qui peut repartir à false sinon)
            const reloaded = await api("GET", "/backup/settings");
            if (reloaded.ok) {
                settings.value = mergeSettings(reloaded.data);
            }
        } else {
            showToast(`❌ ${res.message}`, false);
        }
    } finally { saving.value = false; }
}

async function initRepo() {
    initing.value = true;
    try {
        const res = await api("POST", "/backup/init");
        showToast(res.ok ? t('watcher.backup.repoInit') : `❌ ${res.message}`, res.ok);
    } finally { initing.value = false; }
}

async function runBackup() {
    running.value = true;
    try {
        const res = await api("POST", "/backup/run");
        if (!res.ok && res.code === "backup_already_running") {
            concurrentBackupModal.value = true;
            return;
        }
        if (!res.ok) {
            showToast(`❌ ${res.message}`, false);
            return;
        }
        showToast(t('watcher.backup.launched'));
        // Démarre le polling immédiatement (avec un léger délai pour que le backend enregistre la dest)
        setTimeout(() => startPolling(), 1500);
        // Recharge l'historique après la fin estimée (polling s'arrête tout seul)
        setTimeout(async () => {
            const res = await api("GET", "/backup/history");
            if (res.ok) history.value = res.data;
        }, 5000);
    } finally { running.value = false; }
}

async function checkIntegrity() {
    checking.value = true;
    checkResults.value = [];
    try {
        const res = await api("POST", "/backup/check");
        if (res.ok) {
            checkResults.value = res.data as CheckResult[];
        } else {
            showToast(`❌ ${res.message}`, false);
        }
    } finally { checking.value = false; }
}

</script>

<style lang="scss" scoped>

.form-control::placeholder,
.form-control-sm::placeholder {
    color: var(--text-muted) !important;
    opacity: 1;
}

.settings-subheading {
    font-size: var(--fs-lg);
    font-weight: 600;
}

.exclude-pattern-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.exclude-pattern-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--bg-raised);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 2px 8px 2px 10px;
}

.backup-running-banner {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    border: 1px solid color-mix(in srgb, var(--primary) 35%, transparent);
    background: var(--primary-soft);
    animation: banner-pulse 2s ease-in-out infinite;
}
.backup-running-dest {
    background: var(--bg-raised);
    border-radius: var(--radius-sm);
    padding: 1px 8px;
    font-size: var(--fs-md);
}
@keyframes banner-pulse {
    0%, 100% { border-color: color-mix(in srgb, var(--primary) 35%, transparent); }
    50%       { border-color: color-mix(in srgb, var(--primary) 75%, transparent); }
}

// Boutons extra-petits
.btn-xs {
    padding: 2px 8px;
    font-size: var(--fs-xs);
    line-height: 1.4;
    border-radius: var(--radius-sm);
}

.toast-float {
    position: fixed;
    right: 1.25rem;
    bottom: 1.5rem;
    z-index: 9999;
    padding: .6rem 1rem;
    border-radius: var(--radius-md);
    font-size: var(--fs-md);
    color: var(--primary-text);
    box-shadow: var(--shadow-popover);

    &.toast-ok { background: var(--success); }
    &.toast-err { background: var(--danger); }

    @media (max-width: $bp-mobile) { bottom: var(--space-4); }
}
</style>
