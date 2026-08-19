<template>
    <div>
        <div class="shadow-box big-padding mb-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h5 class="settings-subheading mb-0">
                    <font-awesome-icon icon="bug" class="me-2" />{{
                        $t("watcher.trivy.heading")
                    }}
                </h5>
                <div class="form-check form-switch mb-0">
                    <input
                        id="trivyEnabled"
                        v-model="trivySettings.enabled"
                        class="form-check-input"
                        type="checkbox"
                        role="switch"
                    />
                    <label class="form-check-label" for="trivyEnabled">
                        <span :class="trivySettings.enabled ? 'text-success' : ''">
                            {{
                                trivySettings.enabled
                                    ? $t("watcher.trivy.enabled")
                                    : $t("watcher.trivy.disabled")
                            }}
                        </span>
                    </label>
                </div>
            </div>

            <div class="row g-3">
                <div class="col-lg-2">
                    <label class="form-label">{{
                        $t("watcher.trivy.interval")
                    }}</label>
                    <select
                        v-model.number="trivySettings.intervalHours"
                        class="form-select"
                    >
                        <option :value="12">12h</option>
                        <option :value="24">24h</option>
                        <option :value="72">{{ $t("watcher.trivy.every3d") }}</option>
                        <option :value="168">{{ $t("watcher.trivy.every7d") }}</option>
                    </select>
                </div>

                <div class="col-lg-3">
                    <label class="form-label">{{
                        $t("watcher.trivy.minSeverity")
                    }}</label>
                    <select
                        v-model="trivySettings.minSeverityAlert"
                        class="form-select"
                    >
                        <option value="LOW">{{ $t("watcher.trivy.low") }}</option>
                        <option value="MEDIUM">{{ $t("watcher.trivy.medium") }}</option>
                        <option value="HIGH">{{ $t("watcher.trivy.high") }}</option>
                        <option value="CRITICAL">
                            {{ $t("watcher.trivy.critical") }}
                        </option>
                    </select>
                </div>

                <div class="col-lg-2">
                    <label class="form-label">{{
                        $t("watcher.trivy.timeout")
                    }}</label>
                    <select
                        v-model.number="trivySettings.scanTimeoutMinutes"
                        class="form-select"
                    >
                        <option :value="5">5 min</option>
                        <option :value="10">10 min</option>
                        <option :value="20">20 min</option>
                        <option :value="30">30 min</option>
                    </select>
                </div>

                <div class="col-12 d-flex gap-4 flex-wrap">
                    <div class="form-check">
                        <input
                            id="ignoreUnfixed"
                            v-model="trivySettings.ignoreUnfixed"
                            type="checkbox"
                            class="form-check-input"
                        />
                        <label class="form-check-label" for="ignoreUnfixed">
                            {{ $t("watcher.trivy.ignoreUnfixed") }}
                        </label>
                    </div>
                </div>

                <div class="col-12">
                    <small class="hint-muted">{{
                        $t("watcher.trivy.dockerInfo")
                    }}</small>
                </div>

                <div class="col-12 d-flex gap-2 flex-wrap">
                    <button
                        class="btn btn-primary"
                        :disabled="savingTrivy"
                        @click="saveTrivySettings"
                    >
                        <span
                            v-if="savingTrivy"
                            class="spinner-border spinner-border-sm me-1"
                        />
                        <font-awesome-icon v-else icon="save" class="me-1" />{{
                            $t("watcher.trivy.save")
                        }}
                    </button>
                    <button
                        class="btn btn-warning"
                        :disabled="scanning"
                        @click="runScanAndRefresh()"
                    >
                        <span
                            v-if="scanning"
                            class="spinner-border spinner-border-sm me-1"
                        />
                        <font-awesome-icon v-else icon="shield-alt" class="me-1" />{{
                            $t("watcher.trivy.scanNow")
                        }}
                    </button>
                </div>
            </div>
        </div>

        <!-- TRIVY — CVEs ignorés -->
        <div
            v-if="trivySettings.ignoredCVEs?.length"
            class="shadow-box big-padding mb-4"
        >
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h5 class="settings-subheading mb-0">
                    <span class="me-2" style="opacity: 0.7">⊘</span>{{ $t("watcher.trivy.ignoredCVEs") }}
                    <span class="badge bg-secondary ms-2 badge-count">{{
                        trivySettings.ignoredCVEs.length
                    }}</span>
                </h5>
            </div>
            <div class="d-flex flex-wrap gap-2">
                <div
                    v-for="cveId in trivySettings.ignoredCVEs"
                    :key="cveId"
                    class="d-flex align-items-center gap-1 badge-cve-ignored"
                >
                    <span class="cve-ignored-id">{{ cveId }}</span>
                    <button
                        class="btn-cve-clear"
                        :disabled="clearingCVE === cveId"
                        :title="$t('watcher.trivy.clearCVE')"
                        @click="clearIgnoredCVE(cveId)"
                    >
                        <span
                            v-if="clearingCVE === cveId"
                            class="spinner-border spinner-border-sm"
                            style="width: 0.6rem; height: 0.6rem"
                        />
                        <template v-else>✕</template>
                    </button>
                </div>
            </div>
            <p class="form-text mt-2 mb-0 trivy-hint">
                {{ $t("watcher.trivy.ignoredCVEsHint") }}
            </p>
        </div>

        <!-- TRIVY STATUS -->
        <div class="shadow-box big-padding mb-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h5 class="settings-subheading mb-0">
                    <font-awesome-icon icon="shield-alt" class="me-2" />{{
                        $t("watcher.trivy.status.heading")
                    }}
                </h5>
                <div class="d-flex align-items-center gap-3">
                    <small v-if="trivyStatus.lastScanAt" class="form-text">
                        {{ $t("watcher.trivy.status.lastScan") }} :
                        {{ fmtDate(trivyStatus.lastScanAt) }}
                    </small>
                    <small v-if="nextTrivyDate" class="form-text">
                        {{ $t("watcher.trivy.nextScan") }} :
                        {{ fmtDate(nextTrivyDate) }}
                    </small>
                    <button class="btn btn-sm btn-normal" @click="loadTrivyStatus">
                        <font-awesome-icon icon="sync" />
                    </button>
                </div>
            </div>

            <div v-if="trivyStatus.running" class="text-center py-3 text-warning">
                <span class="spinner-border spinner-border-sm me-2" />
                {{ $t("watcher.trivy.status.running") }}
            </div>
            <div
                v-else-if="!trivyStatus.lastScanAt"
                class="text-center form-text fst-italic py-3"
            >
                {{ $t("watcher.trivy.status.never") }}
            </div>
            <div v-else class="table-responsive">
                <table class="table mb-0">
                    <thead>
                        <tr>
                            <th>{{ $t("watcher.trivy.status.image") }}</th>
                            <th>{{ $t("watcher.trivy.status.maxSeverity") }}</th>
                            <th>{{ $t("watcher.trivy.status.vulns") }}</th>
                            <th></th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        <template v-for="group in trivyByStack" :key="group.stack">
                            <tr class="stack-group-header">
                                <td colspan="5">
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
                            <template v-for="r in group.items" :key="r.image + r.stack">
                                <tr
                                    class="trivy-row"
                                    @click="toggleTrivyDetail(r.image + r.stack)"
                                >
                                    <td>
                                        <code class="small">{{ r.image }}</code>
                                    </td>
                                    <td>
                                        <span
                                            v-if="r.error"
                                            class="badge bg-danger"
                                            :title="r.error"
                                        >
                                            <font-awesome-icon
                                                icon="exclamation-triangle"
                                                class="me-1"
                                            />{{ $t("watcher.status.error") }}
                                        </span>
                                        <span
                                            v-else-if="
                                                r.maxSeverity === 'UNKNOWN' &&
                                                    !r.counts?.CRITICAL &&
                                                    !r.counts?.HIGH &&
                                                    !r.counts?.MEDIUM &&
                                                    !r.counts?.LOW
                                            "
                                            class="badge bg-success"
                                        >
                                            <font-awesome-icon
                                                icon="check-circle"
                                                class="me-1"
                                            />{{ $t("watcher.trivy.status.ok") }}
                                        </span>
                                        <span
                                            v-else
                                            class="badge"
                                            :class="{
                                                'bg-danger': r.maxSeverity === 'CRITICAL',
                                                'bg-warning text-dark': r.maxSeverity === 'HIGH',
                                                'bg-primary': r.maxSeverity === 'MEDIUM',
                                                'bg-info text-dark': r.maxSeverity === 'LOW',
                                                'bg-secondary': r.maxSeverity === 'UNKNOWN',
                                            }"
                                        >
                                            {{ r.maxSeverity }}
                                        </span>
                                    </td>
                                    <td class="small">
                                        <span v-if="r.counts">
                                            <span v-if="r.counts.CRITICAL" class="me-2">🔴 {{ r.counts.CRITICAL }}</span>
                                            <span v-if="r.counts.HIGH" class="me-2">🟠 {{ r.counts.HIGH }}</span>
                                            <span v-if="r.counts.MEDIUM" class="me-2">🟡 {{ r.counts.MEDIUM }}</span>
                                            <span v-if="r.counts.LOW" class="me-2">🔵 {{ r.counts.LOW }}</span>
                                            <span
                                                v-if="
                                                    !r.counts.CRITICAL &&
                                                        !r.counts.HIGH &&
                                                        !r.counts.MEDIUM &&
                                                        !r.counts.LOW
                                                "
                                                class="text-muted"
                                            >—</span>
                                        </span>
                                    </td>
                                    <td class="text-end" style="width: 36px" @click.stop>
                                        <button
                                            class="btn btn-xs btn-outline-secondary btn-scan-single"
                                            :disabled="scanning"
                                            :title="$t('watcher.trivy.scanImage')"
                                            @click="runScanSingle(r.image)"
                                        >
                                            <font-awesome-icon icon="shield-alt" />
                                        </button>
                                    </td>
                                    <td class="text-end pe-2" style="width: 30px">
                                        <font-awesome-icon
                                            :icon="
                                                expandedTrivyImage === r.image + r.stack
                                                    ? 'chevron-up'
                                                    : 'chevron-down'
                                            "
                                            class="text-muted small"
                                        />
                                    </td>
                                </tr>
                                <tr
                                    v-if="expandedTrivyImage === r.image + r.stack"
                                    class="trivy-detail-row"
                                >
                                    <td colspan="6" class="p-0">
                                        <div class="trivy-detail-panel">
                                            <div
                                                v-if="
                                                    !fullResultFor(r.image, r.stack)?.vulns?.length
                                                "
                                                class="fst-italic text-muted p-2"
                                            >
                                                {{ $t("watcher.trivy.noVulnsAboveThreshold") }}
                                            </div>
                                            <table
                                                v-else
                                                class="table table-sm mb-0 trivy-vuln-table"
                                            >
                                                <thead>
                                                    <tr>
                                                        <th>CVE</th>
                                                        <th>{{ $t("watcher.trivy.package") }}</th>
                                                        <th>
                                                            {{ $t("watcher.trivy.installedVersion") }}
                                                        </th>
                                                        <th>{{ $t("watcher.trivy.fixAvailable") }}</th>
                                                        <th></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    <tr
                                                        v-for="v in (
                                                            fullResultFor(r.image, r.stack)?.vulns ?? []
                                                        ).filter((v) => !ignoredCVEsSet.has(v.id))"
                                                        :key="v.id + v.pkg"
                                                    >
                                                        <td>
                                                            <a
                                                                :href="v.url"
                                                                target="_blank"
                                                                rel="noopener"
                                                                class="cve-link"
                                                                :class="`cve-${v.severity.toLowerCase()}`"
                                                            >
                                                                {{ v.id }}
                                                            </a>
                                                        </td>
                                                        <td>
                                                            <code class="small">{{ v.pkg }}</code>
                                                        </td>
                                                        <td>
                                                            <code class="small">{{ v.installed }}</code>
                                                        </td>
                                                        <td>
                                                            <span
                                                                v-if="v.fixed"
                                                                class="text-success small"
                                                            >{{ v.fixed }}</span>
                                                            <span
                                                                v-else
                                                                class="text-muted small fst-italic"
                                                            >—</span>
                                                        </td>
                                                        <td
                                                            class="text-end"
                                                            style="width: 32px"
                                                            @click.stop
                                                        >
                                                            <button
                                                                class="btn btn-xs btn-outline-secondary btn-cve-ignore"
                                                                :disabled="ignoringCVE === v.id"
                                                                :title="$t('watcher.trivy.ignoreCVE')"
                                                                @click="ignoreCVE(v.id)"
                                                            >
                                                                <span
                                                                    v-if="ignoringCVE === v.id"
                                                                    class="spinner-border spinner-border-sm"
                                                                />
                                                                <template v-else>⊘</template>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                    <!-- Footer : CVEs ignorés pour cette image -->
                                                    <tr
                                                        v-if="
                                                            (
                                                                fullResultFor(r.image, r.stack)?.vulns ?? []
                                                            ).some((v) => ignoredCVEsSet.has(v.id))
                                                        "
                                                    >
                                                        <td
                                                            colspan="5"
                                                            class="text-muted fst-italic trivy-ignored-footer"
                                                        >
                                                            ⊘
                                                            {{
                                                                $t("watcher.trivy.ignoredCount", {
                                                                    count: (
                                                                        fullResultFor(r.image, r.stack)
                                                                            ?.vulns ?? []
                                                                    ).filter((v) => ignoredCVEsSet.has(v.id))
                                                                        .length,
                                                                })
                                                            }}
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </td>
                                </tr>
                            </template>
                        </template>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n/dist/vue-i18n.esm-browser.prod.js";
import { watcherApi } from "./shared";
import type { TrivyFullResult, TrivySettings, TrivyStatus } from "./shared";

const trivySettings = defineModel<TrivySettings>("trivySettings", { required: true });
const emit = defineEmits<{
    (e: "toast", msg: string, ok?: boolean): void;
}>();

const { t, locale } = useI18n();

// ─── State ────────────────────────────────────────────────────────

const trivyStatus = ref<TrivyStatus>({
    running: false,
    lastScanAt: null,
    scannedCount: 0,
    lastResults: [],
    lastFullResults: [],
});
const expandedTrivyImage = ref<string | null>(null);
const ignoringCVE = ref<string | null>(null);
const clearingCVE = ref<string | null>(null);
const savingTrivy = ref(false);
const scanning = ref(false);

const ignoredCVEsSet = computed(
    () => new Set(trivySettings.value.ignoredCVEs ?? []),
);

const nextTrivyDate = computed(() => {
    if (!trivySettings.value.enabled || !trivyStatus.value.lastScanAt) {
        return null;
    }
    return new Date(
        new Date(trivyStatus.value.lastScanAt).getTime() +
            trivySettings.value.intervalHours * 3_600_000,
    );
});

const trivyByStack = computed(() => {
    const map = new Map<string, typeof trivyStatus.value.lastResults>();
    for (const r of trivyStatus.value.lastResults) {
        if (!map.has(r.stack)) {
            map.set(r.stack, []);
        }
        map.get(r.stack)!.push(r);
    }
    return [ ...map.entries() ].map(([ stack, items ]) => ({ stack,
        items }));
});

function toggleTrivyDetail(key: string) {
    expandedTrivyImage.value = expandedTrivyImage.value === key ? null : key;
}

function fullResultFor(
    image: string,
    stack: string,
): TrivyFullResult | undefined {
    return trivyStatus.value.lastFullResults?.find(
        (r) => r.image === image && r.stack === stack,
    );
}

function fmtDate(iso: string): string {
    if (!iso) {
        return "—";
    }
    return new Date(iso).toLocaleString(locale.value || "en-GB");
}

function showToast(msg: string, ok = true) {
    emit("toast", msg, ok);
}

// ─── Init ─────────────────────────────────────────────────────────

onMounted(loadTrivyStatus);

// ─── Actions ──────────────────────────────────────────────────────

async function saveTrivySettings() {
    savingTrivy.value = true;
    try {
        const res = await watcherApi("POST", "/trivy/settings", {
            ...trivySettings.value,
        });
        showToast(res.ok ? t("watcher.trivy.saved") : `❌ ${res.message}`, res.ok);
    } finally {
        savingTrivy.value = false;
    }
}

async function loadTrivyStatus() {
    const res = await watcherApi("GET", "/trivy/status");
    if (res.ok) {
        trivyStatus.value = {
            ...trivyStatus.value,
            ...res.data,
            lastResults: res.data.lastResults ?? [],
            lastFullResults: res.data.lastFullResults ?? [],
        };
    }
}

async function runScan(image?: string) {
    scanning.value = true;
    try {
        await watcherApi("POST", "/trivy/run", image ? { image } : {});
        showToast(t("watcher.trivy.scanning"));
    } finally {
        scanning.value = false;
    }
}

async function runScanSingle(image: string) {
    await runScan(image);
    let attempts = 0;
    const poll = setInterval(async () => {
        await loadTrivyStatus();
        attempts++;
        if (!trivyStatus.value.running || attempts >= 40) {
            clearInterval(poll);
        }
    }, 3000);
}

async function runScanAndRefresh(image?: string) {
    await runScan(image);
    // Polling du statut toutes les 3s pendant 2 minutes max
    let attempts = 0;
    const poll = setInterval(async () => {
        await loadTrivyStatus();
        attempts++;
        if (!trivyStatus.value.running || attempts >= 40) {
            clearInterval(poll);
        }
    }, 3000);
}

async function ignoreCVE(cveId: string) {
    ignoringCVE.value = cveId;
    try {
        const res = await watcherApi("POST", "/trivy/ignore-cve", { cveId });
        if (res.ok) {
            if (!trivySettings.value.ignoredCVEs) {
                trivySettings.value.ignoredCVEs = [];
            }
            if (!trivySettings.value.ignoredCVEs.includes(cveId)) {
                trivySettings.value.ignoredCVEs = [
                    ...trivySettings.value.ignoredCVEs,
                    cveId,
                ];
            }
            showToast(t("watcher.trivy.ignoreCVEDone"));
        } else {
            showToast(`❌ ${res.message}`, false);
        }
    } finally {
        ignoringCVE.value = null;
    }
}

async function clearIgnoredCVE(cveId: string) {
    clearingCVE.value = cveId;
    try {
        const res = await watcherApi("DELETE", "/trivy/ignore-cve", { cveId });
        if (res.ok) {
            trivySettings.value.ignoredCVEs = (
                trivySettings.value.ignoredCVEs ?? []
            ).filter((id) => id !== cveId);
            showToast(t("watcher.trivy.clearCVEDone"));
        } else {
            showToast(`❌ ${res.message}`, false);
        }
    } finally {
        clearingCVE.value = null;
    }
}
</script>

<style lang="scss" scoped>

.settings-subheading {
    font-size: var(--fs-lg);
    font-weight: 600;
}

// Table Résultats du dernier scan
.table-responsive .table {
    @include data-table;
}

// Panneau CVE Trivy (hors table-responsive)
.trivy-detail-panel .table {
    @include data-table;
}

.trivy-row {
    cursor: pointer;

    &:hover {
        background: var(--bg-raised);
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

.trivy-detail-row td {
    padding: 0 !important;
}

.trivy-detail-panel {
    background: var(--bg-raised);
    border-top: 1px solid var(--border-color);
}

.trivy-vuln-table {
    font-size: var(--fs-sm);
}

.btn-scan-single {
    font-size: var(--fs-xs);
    padding: 1px 5px;
}

.btn-cve-ignore {
    font-size: var(--fs-xs);
    padding: 1px 4px;
    opacity: 0.6;
}

.trivy-ignored-footer {
    font-size: var(--fs-xs);
    padding: 0.25rem 0.5rem;
    border-bottom: none;
}

.cve-link {
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    text-decoration: none;

    &:hover {
        text-decoration: underline;
    }

    &.cve-critical {
        color: var(--danger);
    }

    &.cve-high {
        color: #f97316; // orange: pas de token pour cette teinte de sévérité
    }

    &.cve-medium {
        color: var(--warning);
    }

    &.cve-low {
        color: var(--primary-strong);
    }

    &.cve-unknown {
        color: var(--text-muted);
    }
}

// ─── CVE ignorés ─────────────────────────────────────────────────
.badge-cve-ignored {
    background: var(--bg-raised);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    padding: 2px 7px 2px 8px;
}

.cve-ignored-id {
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    color: var(--text-muted);
}

.btn-cve-clear {
    background: none;
    border: none;
    padding: 0 0 0 4px;
    font-size: var(--fs-xs);
    color: var(--text-muted);
    cursor: pointer;
    line-height: 1;

    &:hover:not(:disabled) {
        color: var(--danger);
    }

    &:disabled {
        opacity: 0.4;
        cursor: default;
    }
}

.badge-count {
    font-size: var(--fs-xs);
}

.trivy-hint {
    font-size: var(--fs-xs);
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

.hint-muted {
    color: var(--text-muted);
}
</style>
