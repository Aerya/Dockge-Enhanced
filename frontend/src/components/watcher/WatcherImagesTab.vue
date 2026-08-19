<template>
    <div>
        <!-- IMAGE WATCHER CONFIG -->
        <div class="shadow-box big-padding mb-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h5 class="settings-subheading mb-0">
                    <font-awesome-icon icon="sync-alt" class="me-2" />{{
                        $t("watcher.img.heading")
                    }}
                </h5>
                <div class="form-check form-switch mb-0">
                    <input
                        id="imgEnabled"
                        v-model="imgSettings.enabled"
                        class="form-check-input"
                        type="checkbox"
                        role="switch"
                    />
                    <label class="form-check-label" for="imgEnabled">
                        <span :class="imgSettings.enabled ? 'text-success' : ''">
                            {{
                                imgSettings.enabled
                                    ? $t("watcher.img.enabled")
                                    : $t("watcher.img.disabled")
                            }}
                        </span>
                    </label>
                </div>
            </div>

            <div class="row g-3">
                <!-- Intervalle -->
                <div class="col-lg-3">
                    <label class="form-label">{{
                        $t("watcher.img.frequency")
                    }}</label>
                    <select
                        v-model.number="imgSettings.intervalHours"
                        class="form-select"
                    >
                        <option :value="1">{{ $t("watcher.img.every1h") }}</option>
                        <option :value="3">{{ $t("watcher.img.every3h") }}</option>
                        <option :value="6">{{ $t("watcher.img.every6h") }}</option>
                        <option :value="12">{{ $t("watcher.img.every12h") }}</option>
                        <option :value="24">{{ $t("watcher.img.every24h") }}</option>
                    </select>
                </div>

                <!-- Plateforme image -->
                <div class="col-lg-3">
                    <label class="form-label">{{
                        $t("watcher.img.platform")
                    }}</label>
                    <input
                        v-model.trim="imgSettings.imagePlatform"
                        class="form-control"
                        placeholder="auto, linux/amd64, linux/arm64"
                    />
                    <small class="text-muted">
                        {{ $t("watcher.img.platformHint") }}
                    </small>
                </div>

                <!-- Actions -->
                <div class="col-12 d-flex gap-2 flex-wrap">
                    <button
                        class="btn btn-primary"
                        :disabled="saving"
                        @click="saveImgSettings"
                    >
                        <span
                            v-if="saving"
                            class="spinner-border spinner-border-sm me-1"
                        />
                        <font-awesome-icon v-else icon="save" class="me-1" />{{
                            $t("watcher.img.save")
                        }}
                    </button>
                    <button
                        class="btn btn-normal"
                        :disabled="running"
                        @click="runCheck"
                    >
                        <span
                            v-if="running"
                            class="spinner-border spinner-border-sm me-1"
                        />
                        <font-awesome-icon v-else icon="play" class="me-1" />{{
                            $t("watcher.img.checkNow")
                        }}
                    </button>
                </div>
            </div>
        </div>

        <!-- CREDENTIALS -->
        <div class="shadow-box big-padding mb-4">
            <h5 class="settings-subheading mb-3">
                <font-awesome-icon icon="key" class="me-2" />{{
                    $t("watcher.creds.heading")
                }}
            </h5>
            <i18n-t keypath="watcher.creds.hint" tag="p" class="form-text mb-3">
                <template #registry><strong>ghcr.io</strong></template>
                <template #scope><code>read:packages</code></template>
            </i18n-t>

            <div v-if="credentials.length > 0" class="mb-3">
                <div
                    v-for="cred in credentials"
                    :key="cred.registry"
                    class="d-flex align-items-center gap-3 p-2 rounded mb-2 cred-row"
                >
                    <span class="badge bg-secondary">{{ cred.registry }}</span>
                    <span class="form-text">{{ cred.username }}</span>
                    <span class="form-text">{{ $t("watcher.creds.token") }} : ***</span>
                    <button
                        class="btn btn-sm btn-outline-danger ms-auto"
                        @click="removeCred(cred.registry)"
                    >
                        <font-awesome-icon icon="trash" />
                    </button>
                </div>
            </div>
            <p v-else class="form-text fst-italic">
                {{ $t("watcher.creds.none") }}
            </p>

            <div class="row g-2 align-items-end">
                <div class="col-md-3">
                    <label class="form-label small">{{
                        $t("watcher.creds.registry")
                    }}</label>
                    <input
                        v-model="newCred.registry"
                        type="text"
                        class="form-control form-control-sm"
                        placeholder="ghcr.io"
                    />
                </div>
                <div class="col-md-3">
                    <label class="form-label small">{{
                        $t("watcher.creds.username")
                    }}</label>
                    <input
                        v-model="newCred.username"
                        type="text"
                        class="form-control form-control-sm"
                        placeholder="monpseudo"
                        autocomplete="off"
                    />
                </div>
                <div class="col-md-4">
                    <label class="form-label small">{{
                        $t("watcher.creds.token")
                    }}</label>
                    <input
                        v-model="newCred.token"
                        type="password"
                        class="form-control form-control-sm"
                        placeholder="ghp_xxxxx"
                        autocomplete="new-password"
                    />
                </div>
                <div class="col-md-2">
                    <button
                        class="btn btn-sm btn-success w-100"
                        :disabled="
                            !newCred.registry || !newCred.username || !newCred.token
                        "
                        @click="addCred"
                    >
                        <font-awesome-icon icon="plus" class="me-1" />{{
                            $t("watcher.creds.add")
                        }}
                    </button>
                </div>
            </div>
        </div>

        <!-- STATUS TABLE -->
        <div class="shadow-box big-padding mb-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h5 class="settings-subheading mb-0">
                    <font-awesome-icon icon="table" class="me-2" />{{
                        $t("watcher.status.heading")
                    }}
                </h5>
                <div class="d-flex align-items-center gap-3">
                    <div class="form-check form-switch mb-0">
                        <input
                            id="showDigests"
                            v-model="showDigests"
                            class="form-check-input"
                            type="checkbox"
                            role="switch"
                        />
                        <label class="form-check-label small" for="showDigests">{{
                            $t("watcher.status.showDigests")
                        }}</label>
                    </div>
                    <small class="form-text">{{ $t("watcher.status.lastCheck") }} :
                        {{ lastCheckDisplay }}</small>
                    <button class="btn btn-sm btn-normal" @click="loadStatus">
                        <font-awesome-icon icon="sync" />
                    </button>
                </div>
            </div>

            <div
                v-if="imageStatuses.length === 0"
                class="text-center form-text fst-italic py-3"
            >
                {{ $t("watcher.status.noData") }}
            </div>
            <template v-else>
                <div class="input-group input-group-sm mb-3 image-search">
                    <span class="input-group-text">
                        <font-awesome-icon icon="search" />
                    </span>
                    <input
                        v-model.trim="imageFilter"
                        class="form-control"
                        type="search"
                        :placeholder="$t('watcher.status.searchImage')"
                    />
                    <button
                        v-if="imageFilter"
                        class="btn btn-outline-secondary"
                        type="button"
                        @click="imageFilter = ''"
                    >
                        <font-awesome-icon icon="times" />
                    </button>
                </div>
                <div
                    v-if="imagesByStack.length === 0"
                    class="text-center form-text fst-italic py-3"
                >
                    {{ $t("watcher.status.noMatch") }}
                </div>
            </template>
            <div v-if="imageStatuses.length > 0 && imagesByStack.length > 0" class="table-responsive">
                <table class="table table-hover mb-0">
                    <thead>
                        <tr>
                            <th>{{ $t("watcher.status.image") }}</th>
                            <th>{{ $t("watcher.status.state") }}</th>
                            <th v-if="showDigests">
                                {{ $t("watcher.status.localDigest") }}
                            </th>
                            <th v-if="showDigests">
                                {{ $t("watcher.status.remoteDigest") }}
                            </th>
                            <th>{{ $t("watcher.status.checkedAt") }}</th>
                            <th
                                :title="$t('watcher.status.autoUpdateHint')"
                                style="white-space: nowrap; min-width: 160px"
                            >
                                {{ $t("watcher.status.autoUpdate") }}
                            </th>
                            <th style="white-space: nowrap; min-width: 130px">
                                {{ $t("watcher.rollback.col") }}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <template v-for="group in imagesByStack" :key="group.stack">
                            <tr class="stack-group-header">
                                <td :colspan="showDigests ? 7 : 5">
                                    <font-awesome-icon
                                        icon="layer-group"
                                        class="me-2 opacity-75"
                                    />
                                    <strong>{{ group.stack }}</strong>
                                    <span
                                        class="ms-2 text-muted stack-group-count"
                                    >{{
                                        $t("watcher.status.imageCount", {
                                            count: group.items.length,
                                        })
                                    }}</span>
                                </td>
                            </tr>
                            <tr v-for="s in group.items" :key="s.stack + s.image">
                                <td>
                                    <code>{{ s.image }}</code>
                                    <button
                                        class="btn btn-sm btn-link p-0 ms-2 btn-search-project"
                                        @click="searchImage(s.image)"
                                    >
                                        {{ $t("watcher.status.searchProject") }}
                                    </button>
                                </td>
                                <td>
                                    <span
                                        v-if="s.error"
                                        class="badge bg-danger"
                                        :title="s.error"
                                    >
                                        <font-awesome-icon
                                            icon="exclamation-triangle"
                                            class="me-1"
                                        />{{ $t("watcher.status.error") }}
                                    </span>
                                    <template v-else-if="s.hasUpdate">
                                        <span class="badge bg-warning text-dark d-block mb-1">
                                            <font-awesome-icon
                                                icon="arrow-circle-up"
                                                class="me-1"
                                            />{{ $t("watcher.status.updateAvailable") }}
                                        </span>
                                        <button
                                            class="btn btn-xs btn-outline-secondary btn-ignore-version"
                                            :disabled="ignoringKey === `${s.stack}::${s.image}`"
                                            :title="$t('watcher.status.ignoreVersion')"
                                            @click="ignoreVersion(s)"
                                        >
                                            <span
                                                v-if="ignoringKey === `${s.stack}::${s.image}`"
                                                class="spinner-border spinner-border-sm"
                                            />
                                            <template v-else>
                                                ⏭
                                                {{ $t("watcher.status.ignoreVersion") }}
                                            </template>
                                        </button>
                                    </template>
                                    <template v-else-if="s.ignoredDigest">
                                        <span class="badge bg-secondary d-block mb-1">
                                            ⏭ {{ $t("watcher.status.versionIgnored") }}
                                        </span>
                                        <button
                                            class="btn btn-xs btn-outline-secondary btn-ignore-version"
                                            :disabled="clearingKey === `${s.stack}::${s.image}`"
                                            :title="$t('watcher.status.clearIgnored')"
                                            @click="clearIgnoredDigest(s)"
                                        >
                                            <span
                                                v-if="clearingKey === `${s.stack}::${s.image}`"
                                                class="spinner-border spinner-border-sm"
                                            />
                                            <template v-else>
                                                ✕ {{ $t("watcher.status.clearIgnored") }}
                                            </template>
                                        </button>
                                    </template>
                                    <span v-else class="badge bg-success">
                                        <font-awesome-icon icon="check-circle" class="me-1" />{{
                                            $t("watcher.status.upToDate")
                                        }}
                                    </span>
                                </td>
                                <td v-if="showDigests">
                                    <code class="small">{{
                                        s.localDigest ? s.localDigest.slice(7, 19) + "…" : "—"
                                    }}</code>
                                </td>
                                <td v-if="showDigests">
                                    <code class="small">{{
                                        s.remoteDigest ? s.remoteDigest.slice(7, 19) + "…" : "—"
                                    }}</code>
                                </td>
                                <td class="small form-text">
                                    {{ s.lastChecked ? fmtDate(s.lastChecked) : "—" }}
                                </td>
                                <td>
                                    <div class="au-cell">
                                        <select
                                            class="form-select form-select-sm au-select"
                                            :value="getAutoUpdateMode(s)"
                                            @change="
                                                setAutoUpdateMode(
                                                    s,
                                                    ($event.target as HTMLSelectElement).value as
                                                        | 'off'
                                                        | 'ignored'
                                                        | 'immediate'
                                                        | 'scheduled',
                                                )
                                            "
                                        >
                                            <option value="off">
                                                {{ $t("watcher.status.auOff") }}
                                            </option>
                                            <option value="ignored">
                                                🚫 {{ $t("watcher.status.auIgnored") }}
                                            </option>
                                            <option value="immediate">
                                                ⚡ {{ $t("watcher.status.auImmediate") }}
                                            </option>
                                            <option value="scheduled">
                                                🕐 {{ $t("watcher.status.auScheduled") }}
                                            </option>
                                        </select>
                                        <template v-if="getAutoUpdateMode(s) === 'scheduled'">
                                            <input
                                                type="time"
                                                class="form-control form-control-sm au-time"
                                                :value="getAutoUpdateTime(s)"
                                                @change="
                                                    setAutoUpdateMode(
                                                        s,
                                                        'scheduled',
                                                        ($event.target as HTMLInputElement).value,
                                                    )
                                                "
                                            />
                                            <span
                                                v-if="isPending(s)"
                                                class="au-pending"
                                                :title="$t('watcher.status.auPendingHint')"
                                            >⏳</span>
                                        </template>
                                    </div>
                                </td>
                                <!-- ─── Rollback ─── -->
                                <td>
                                    <template v-if="rollbackFor(s)">
                                        <div class="rollback-cell">
                                            <div class="d-flex align-items-center gap-1 mb-1">
                                                <span
                                                    class="rollback-countdown"
                                                    :title="
                                                        $t('watcher.rollback.expiresAt') +
                                                            ' ' +
                                                            fmtDate(rollbackFor(s)!.expiresAt)
                                                    "
                                                >
                                                    ⏳ {{ rollbackCountdown(rollbackFor(s)!) }}
                                                </span>
                                            </div>
                                            <div class="d-flex gap-1">
                                                <button
                                                    class="btn btn-xs btn-rollback"
                                                    :disabled="
                                                        rollbackingKey === `${s.stack}::${s.image}`
                                                    "
                                                    :title="$t('watcher.rollback.btnTitle')"
                                                    @click="doRollback(s)"
                                                >
                                                    <span
                                                        v-if="
                                                            rollbackingKey === `${s.stack}::${s.image}`
                                                        "
                                                        class="spinner-border spinner-border-sm"
                                                    />
                                                    <template v-else>
                                                        ↩ {{ $t("watcher.rollback.btn") }}
                                                    </template>
                                                </button>
                                                <button
                                                    class="btn btn-xs btn-outline-secondary"
                                                    :title="$t('watcher.rollback.dismiss')"
                                                    @click="dismissRollback(s)"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        </div>
                                    </template>
                                    <span v-else class="form-text">—</span>
                                </td>
                            </tr>
                        </template>
                    </tbody>
                </table>
            </div>
        </div>
        <!-- ═══ HISTORIQUE AUTO-UPDATES ═══ -->
        <div class="shadow-box update-history-panel mb-4">
            <button
                class="update-history-toggle"
                type="button"
                @click="updateHistoryOpen = !updateHistoryOpen"
            >
                <span class="update-history-title">
                    <font-awesome-icon icon="history" class="me-2" />{{
                        $t("watcher.updateHistory.heading")
                    }}
                </span>
                <span class="update-history-summary">
                    {{ updateHistorySummary }}
                </span>
                <font-awesome-icon
                    icon="chevron-down"
                    class="update-history-chevron"
                    :class="{ open: updateHistoryOpen }"
                />
            </button>
            <div v-if="updateHistoryOpen" class="update-history-content">
                <div class="d-flex justify-content-end mb-2">
                    <button
                        v-if="updateHistory.length > 0"
                        class="btn btn-sm btn-outline-danger"
                        @click="clearUpdateHistory"
                    >
                        {{ $t("watcher.updateHistory.clear") }}
                    </button>
                </div>
                <div
                    v-if="updateHistory.length === 0"
                    class="text-center form-text fst-italic py-3"
                >
                    {{ $t("watcher.updateHistory.empty") }}
                </div>
                <table
                    v-else
                    class="table table-sm table-borderless mb-0 update-history-table"
                >
                    <thead>
                        <tr>
                            <th></th>
                            <th>{{ $t("watcher.updateHistory.date") }}</th>
                            <th>{{ $t("watcher.updateHistory.stack") }}</th>
                            <th>{{ $t("watcher.updateHistory.image") }}</th>
                            <th>{{ $t("watcher.updateHistory.mode") }}</th>
                            <th>{{ $t("watcher.updateHistory.status") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <template
                            v-for="(h, i) in visibleUpdateHistory"
                            :key="`${h.timestamp}-${i}`"
                        >
                            <tr>
                                <td class="update-history-expand-cell">
                                    <button
                                        class="btn btn-xs btn-outline-secondary"
                                        type="button"
                                        @click="toggleUpdateHistoryDetail(i)"
                                    >
                                        <font-awesome-icon
                                            icon="chevron-down"
                                            :class="{ open: expandedUpdateHistoryRows.has(i) }"
                                        />
                                    </button>
                                </td>
                                <td class="small form-text text-nowrap">
                                    {{ fmtDate(h.timestamp) }}
                                </td>
                                <td class="small">
                                    <code>{{ h.stack }}</code>
                                </td>
                                <td class="small update-history-image" :title="h.image">
                                    {{ h.image }}
                                </td>
                                <td>
                                    <span
                                        class="badge"
                                        :class="
                                            h.mode === 'immediate' ? 'bg-primary' : 'bg-secondary'
                                        "
                                    >
                                        {{
                                            h.mode === "immediate"
                                                ? $t("watcher.updateHistory.immediate")
                                                : $t("watcher.updateHistory.scheduled")
                                        }}
                                    </span>
                                </td>
                                <td>
                                    <span v-if="h.success" class="badge bg-success">✓ OK</span>
                                    <span v-else class="badge bg-danger" :title="h.error">✗ {{ $t("watcher.status.error") }}</span>
                                </td>
                            </tr>
                            <tr
                                v-if="expandedUpdateHistoryRows.has(i)"
                                class="update-history-detail-row"
                            >
                                <td colspan="6">
                                    <div class="update-history-detail">
                                        <div>
                                            <span class="form-text">
                                                {{ $t("watcher.updateHistory.digests") }}
                                            </span>
                                            <code class="ms-2">
                                                {{ formatUpdateHistoryDigests(h) }}
                                            </code>
                                        </div>
                                        <div v-if="h.error" class="text-danger small mt-1">
                                            {{ h.error }}
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        </template>
                    </tbody>
                </table>
                <button
                    v-if="updateHistory.length > visibleUpdateHistory.length"
                    class="btn btn-sm btn-normal mt-2"
                    type="button"
                    @click="showAllUpdateHistory = true"
                >
                    {{
                        $t("watcher.updateHistory.showAll", {
                            count: updateHistory.length,
                        })
                    }}
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n/dist/vue-i18n.esm-browser.prod.js";
import { watcherApi } from "./shared";
import type { Cred, ImageStatus, ImgSettings, RollbackEntry, UpdateHistoryEntry } from "./shared";

const imgSettings = defineModel<ImgSettings>("imgSettings", { required: true });
const credentials = defineModel<Cred[]>("credentials", { required: true });
const emit = defineEmits<{
    (e: "toast", msg: string, ok?: boolean): void;
}>();

const { t, locale } = useI18n();

// ─── State ────────────────────────────────────────────────────────

const newCred = ref<Cred>({ registry: "",
    username: "",
    token: "" });
const imageStatuses = ref<ImageStatus[]>([]);
const rollbackEntries = ref<RollbackEntry[]>([]);
const updateHistory = ref<UpdateHistoryEntry[]>([]);
const updateHistoryOpen = ref(false);
const showAllUpdateHistory = ref(false);
const expandedUpdateHistoryRows = ref(new Set<number>());
const rollbackingKey = ref<string | null>(null);
const ignoringKey = ref<string | null>(null);
const clearingKey = ref<string | null>(null);
const saving = ref(false);
const running = ref(false);
const imageFilter = ref("");
const showDigests = ref(false);

let pollTimer: ReturnType<typeof setInterval> | null = null;

const lastCheckDisplay = computed(() => {
    if (!imageStatuses.value.length) {
        return t("watcher.status.never");
    }
    const dates = imageStatuses.value
        .map((s) => new Date(s.lastChecked).getTime())
        .filter(Boolean);
    if (!dates.length) {
        return "—";
    }
    return fmtDate(new Date(Math.max(...dates)));
});

const imagesByStack = computed(() => {
    const q = imageFilter.value.toLowerCase();
    const map = new Map<string, ImageStatus[]>();
    for (const s of imageStatuses.value) {
        // Filtre sur le nom d'image ou le nom de stack
        if (q && !s.image.toLowerCase().includes(q) && !s.stack.toLowerCase().includes(q)) {
            continue;
        }
        if (!map.has(s.stack)) {
            map.set(s.stack, []);
        }
        map.get(s.stack)!.push(s);
    }
    return [ ...map.entries() ].map(([ stack, items ]) => ({ stack,
        items }));
});

// ─── Recherche DuckDuckGo pour une image ──────────────────────────
function searchImage(image: string): void {
    const noTag = image.replace(/:[\w.-]+$/, "");
    window.open(
        `https://duckduckgo.com/?q=${encodeURIComponent(noTag)}`,
        "_blank",
    );
}

function showToast(msg: string, ok = true) {
    emit("toast", msg, ok);
}

// ─── Init & polling ───────────────────────────────────────────────

onMounted(async () => {
    const [ statusRes, rollbackRes, histRes ] = await Promise.all([
        watcherApi("GET", "/image/status"),
        watcherApi("GET", "/image/rollback"),
        watcherApi("GET", "/image/update-history"),
    ]);
    if (statusRes.ok) {
        imageStatuses.value = statusRes.data ?? [];
    }
    if (rollbackRes.ok) {
        rollbackEntries.value = rollbackRes.data ?? [];
    }
    if (histRes.ok) {
        updateHistory.value = histRes.data ?? [];
    }
    pollTimer = setInterval(loadStatus, 10000);
});

onUnmounted(() => {
    if (pollTimer) {
        clearInterval(pollTimer);
    }
});

async function loadStatus() {
    const [ statusRes, rollbackRes, autoUpdateRes ] = await Promise.all([
        watcherApi("GET", "/image/status"),
        watcherApi("GET", "/image/rollback"),
        watcherApi("GET", "/image/auto-update"),
    ]);
    if (statusRes.ok) {
        imageStatuses.value = statusRes.data;
    }
    if (rollbackRes.ok) {
        rollbackEntries.value = rollbackRes.data;
    }
    if (autoUpdateRes.ok) {
        imgSettings.value.autoUpdateConfig = autoUpdateRes.data?.autoUpdateConfig ?? {};
        imgSettings.value.pendingAutoUpdates = autoUpdateRes.data?.pendingAutoUpdates ?? [];
    }
}

function rollbackFor(s: ImageStatus): RollbackEntry | undefined {
    return rollbackEntries.value.find((r) => r.key === `${s.stack}::${s.image}`);
}

function rollbackCountdown(entry: RollbackEntry): string {
    const ms = new Date(entry.expiresAt).getTime() - Date.now();
    if (ms <= 0) {
        return t("watcher.rollback.expired");
    }
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return h > 0
        ? `${t("timeUnit.hour", [ h ])} ${t("timeUnit.minute", [ String(m).padStart(2, "0") ])}`
        : t("timeUnit.minute", [ m ]);
}

function fmtDate(iso: string): string {
    if (!iso) {
        return "—";
    }
    return new Date(iso).toLocaleString(locale.value || "en-GB");
}

const visibleUpdateHistory = computed(() =>
    showAllUpdateHistory.value
        ? updateHistory.value
        : updateHistory.value.slice(0, 10),
);

const updateHistorySummary = computed(() => {
    if (updateHistory.value.length === 0) {
        return t("watcher.updateHistory.empty");
    }
    const failures = updateHistory.value.filter((h) => !h.success).length;
    const last = updateHistory.value[0]?.timestamp
        ? fmtDate(updateHistory.value[0].timestamp)
        : "-";
    return t("watcher.updateHistory.summary", {
        count: updateHistory.value.length,
        failures,
        last,
    });
});

function toggleUpdateHistoryDetail(index: number) {
    const next = new Set(expandedUpdateHistoryRows.value);
    if (next.has(index)) {
        next.delete(index);
    } else {
        next.add(index);
    }
    expandedUpdateHistoryRows.value = next;
}

function formatUpdateHistoryDigests(h: UpdateHistoryEntry): string {
    if (h.oldDigest && h.newDigest) {
        return `${h.oldDigest.slice(7, 19)} -> ${h.newDigest.slice(7, 19)}`;
    }
    if (h.oldDigest) {
        return `${h.oldDigest.slice(7, 19)} -> -`;
    }
    return "-";
}

async function clearUpdateHistory() {
    await watcherApi("DELETE", "/image/update-history");
    updateHistory.value = [];
    showAllUpdateHistory.value = false;
    expandedUpdateHistoryRows.value = new Set();
}

async function doRollback(s: ImageStatus) {
    const key = `${s.stack}::${s.image}`;
    if (
        !confirm(t("watcher.rollback.confirm", { image: s.image,
            stack: s.stack }))
    ) {
        return;
    }
    rollbackingKey.value = key;
    try {
        const res = await watcherApi("POST", "/image/rollback", { key });
        if (res.ok) {
            showToast(t("watcher.rollback.done", { image: s.image }));
            await loadStatus();
        } else {
            showToast(`❌ ${res.message}`, false);
        }
    } finally {
        rollbackingKey.value = null;
    }
}

async function dismissRollback(s: ImageStatus) {
    const key = `${s.stack}::${s.image}`;
    const res = await watcherApi("DELETE", `/image/rollback/${encodeURIComponent(key)}`);
    if (res.ok) {
        rollbackEntries.value = rollbackEntries.value.filter((r) => r.key !== key);
        showToast(t("watcher.rollback.dismissed"));
    }
}

// ─── Actions ──────────────────────────────────────────────────────

async function saveImgSettings() {
    saving.value = true;
    try {
        const res = await watcherApi("POST", "/image/settings", { ...imgSettings.value });
        showToast(res.ok ? t("watcher.img.saved") : `❌ ${res.message}`, res.ok);
    } finally {
        saving.value = false;
    }
}

async function runCheck() {
    running.value = true;
    try {
        await watcherApi("POST", "/image/run");
        showToast(t("watcher.img.checking"));
    } finally {
        running.value = false;
    }
}

function getAutoUpdateMode(
    s: ImageStatus,
): "off" | "ignored" | "immediate" | "scheduled" {
    const cfg = imgSettings.value.autoUpdateConfig[`${s.stack}::${s.image}`];
    return cfg?.mode ?? "off";
}

function getAutoUpdateTime(s: ImageStatus): string {
    return (
        imgSettings.value.autoUpdateConfig[`${s.stack}::${s.image}`]?.time ??
        "02:00"
    );
}

function isPending(s: ImageStatus): boolean {
    return imgSettings.value.pendingAutoUpdates.includes(
        `${s.stack}::${s.image}`,
    );
}

async function ignoreVersion(s: ImageStatus) {
    const key = `${s.stack}::${s.image}`;
    ignoringKey.value = key;
    try {
        const res = await watcherApi("POST", "/image/ignore-digest", {
            key,
            digest: s.remoteDigest,
        });
        if (res.ok) {
            const idx = imageStatuses.value.findIndex(
                (x) => x.stack === s.stack && x.image === s.image,
            );
            if (idx !== -1) {
                imageStatuses.value[idx] = {
                    ...imageStatuses.value[idx],
                    hasUpdate: false,
                    ignoredDigest: s.remoteDigest,
                };
            }
            showToast(t("watcher.status.ignoreVersionDone"));
        } else {
            showToast(`❌ ${res.message}`, false);
        }
    } finally {
        ignoringKey.value = null;
    }
}

async function clearIgnoredDigest(s: ImageStatus) {
    const key = `${s.stack}::${s.image}`;
    clearingKey.value = key;
    try {
        const res = await watcherApi("DELETE", "/image/ignore-digest", { key });
        if (res.ok) {
            await loadStatus();
            showToast(t("watcher.status.clearIgnoredDone"));
        } else {
            showToast(`❌ ${res.message}`, false);
        }
    } finally {
        clearingKey.value = null;
    }
}

async function setAutoUpdateMode(
    s: ImageStatus,
    mode: "off" | "ignored" | "immediate" | "scheduled",
    time?: string,
) {
    const key = `${s.stack}::${s.image}`;
    const body: Record<string, unknown> = { key,
        mode };
    if (mode === "scheduled") {
        body.time = time ?? getAutoUpdateTime(s);
    }
    const res = await watcherApi("POST", "/image/auto-update", body);
    if (res.ok) {
        if (mode === "off") {
            delete imgSettings.value.autoUpdateConfig[key];
            imgSettings.value.pendingAutoUpdates =
                imgSettings.value.pendingAutoUpdates.filter((k) => k !== key);
        } else {
            imgSettings.value.autoUpdateConfig[key] =
                mode === "scheduled" ? { mode,
                    time: body.time as string } : { mode };
        }
        showToast(t("watcher.status.autoUpdateSaved"));
    } else {
        showToast(`❌ ${res.message}`, false);
    }
}

async function addCred() {
    const res = await watcherApi("POST", "/image/credentials", { ...newCred.value });
    if (res.ok) {
        credentials.value = credentials.value
            .filter((c) => c.registry !== newCred.value.registry)
            .concat({ ...newCred.value,
                token: "***" });
        newCred.value = { registry: "",
            username: "",
            token: "" };
        showToast(t("watcher.creds.added"));
    } else {
        showToast(`❌ ${res.message}`, false);
    }
}

async function removeCred(registry: string) {
    try {
        const res = await watcherApi(
            "DELETE",
            `/image/credentials/${encodeURIComponent(registry)}`,
        );
        if (res.ok) {
            credentials.value = credentials.value.filter(
                (c) => c.registry !== registry,
            );
            showToast(t("watcher.creds.removed"));
        } else {
            showToast(
                `❌ ${res.message ?? t("watcher.creds.removeFail")}`,
                false,
            );
        }
    } catch {
        showToast(t("watcher.creds.removeNetworkFail"), false);
    }
}
</script>

<style lang="scss" scoped>

.settings-subheading {
    font-size: var(--fs-lg);
    font-weight: 600;
}

// Tables État des images
.table-responsive .table {
    @include data-table;

    // "Voir le projet →" : btn-link force $link-color:#111, on l'écrase
    .btn-link {
        color: var(--primary);

        &:hover {
            color: var(--primary-hover);
        }
    }
}

// ─── Rollback ─────────────────────────────────────────────────────
.rollback-cell {
    min-width: 120px;
}

.rollback-countdown {
    font-size: var(--fs-xs);
    font-family: var(--font-mono);
    color: var(--warning);
    cursor: default;
}

.btn-rollback {
    background: var(--warning-soft);
    border: 1px solid color-mix(in srgb, var(--warning) 40%, transparent);
    color: var(--warning);

    &:hover:not(:disabled) {
        background: color-mix(in srgb, var(--warning) 28%, transparent);
    }

    &:disabled {
        opacity: 0.5;
    }
}

.stack-group-header {
    td {
        background: var(--bg-raised);
        border-top: 2px solid var(--border-color);
        padding: 0.45rem 0.75rem;
        font-size: var(--fs-md);
        letter-spacing: 0.02em;
        color: var(--text-color);
    }

    &:first-child td {
        border-top-color: transparent;
    }
}

.stack-group-count {
    font-size: var(--fs-sm);
    font-weight: 400;
}

.btn-search-project {
    font-size: var(--fs-xs);
    opacity: 0.7;
}

.btn-ignore-version {
    font-size: var(--fs-xs);
    padding: 1px 5px;
    white-space: nowrap;
}

.form-control::placeholder,
.form-control-sm::placeholder {
    color: var(--text-muted) !important;
    opacity: 1;
}

.au-cell {
    display: flex;
    align-items: center;
    gap: 4px;
}

.au-select {
    width: auto;
    min-width: 120px;
    font-size: var(--fs-sm);
    padding: 2px 6px;
}

.au-time {
    width: 90px;
    font-size: var(--fs-sm);
    padding: 2px 4px;
}

.au-pending {
    font-size: var(--fs-md);
    opacity: 0.75;
    cursor: default;
}

.update-history-image {
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.update-history-panel {
    padding: 0;
    overflow: hidden;
}

.update-history-toggle {
    width: 100%;
    min-height: 54px;
    display: grid;
    grid-template-columns: minmax(180px, auto) 1fr auto;
    align-items: center;
    gap: 12px;
    padding: 14px 18px;
    border: none;
    background: transparent;
    color: inherit;
    text-align: left;
}

.update-history-title {
    font-weight: 600;
}

.update-history-summary {
    min-width: 0;
    color: var(--text-muted);
    font-size: var(--fs-md);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.update-history-chevron,
.update-history-expand-cell .svg-inline--fa {
    transition: transform 0.15s ease;
}

.update-history-chevron.open,
.update-history-expand-cell .open {
    transform: rotate(180deg);
}

.update-history-content {
    padding: 0 18px 16px;
    overflow-x: auto;
}

.update-history-table th:first-child,
.update-history-expand-cell {
    width: 34px;
}

.update-history-detail-row > td {
    padding-top: 0;
}

.update-history-detail {
    margin-left: 34px;
    padding: 8px 10px;
    border-left: 2px solid color-mix(in srgb, var(--primary) 35%, transparent);
    background: var(--bg-raised);
    border-radius: var(--radius-sm);
}

@media (max-width: $bp-mobile) {
    .update-history-toggle {
        grid-template-columns: 1fr auto;
    }

    .update-history-summary {
        grid-column: 1 / -1;
    }
}

.table {
    --bs-table-border-color: var(--border-color);

    th {
        font-size: var(--fs-xs);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        opacity: 0.55;
    }

    td {
        vertical-align: middle;
    }
}

// Ligne d'identifiant de registry
.cred-row {
    background: var(--bg-raised);
}
</style>
