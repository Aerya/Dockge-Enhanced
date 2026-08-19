<template>
    <!-- ═══ HISTORIQUE ═══ -->
    <div class="shadow-box big-padding mb-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="settings-subheading mb-0">
                <font-awesome-icon icon="chart-line" class="me-2" />{{ $t('watcher.backup.history.heading') }}
            </h5>
            <small v-if="nextBackupDate" class="form-text">
                <font-awesome-icon icon="clock" class="me-1" />
                {{ $t('watcher.backup.history.nextBackup') }} : {{ fmtDate(nextBackupDate) }}
            </small>
        </div>
        <div v-if="history.length === 0" class="text-center form-text fst-italic py-3">
            {{ $t('watcher.backup.history.none') }}
        </div>
        <div v-else class="table-responsive">
            <table class="table table-hover mb-0 table-sm">
                <thead>
                    <tr>
                        <th>{{ $t('watcher.backup.history.date') }}</th>
                        <th>{{ $t('watcher.backup.history.type') }}</th>
                        <th>{{ $t('watcher.backup.history.status') }}</th>
                        <th>{{ $t('watcher.backup.history.snapshot') }}</th>
                        <th>{{ $t('watcher.backup.history.dataAdded') }}</th>
                        <th>{{ $t('watcher.backup.history.files') }}</th>
                        <th>{{ $t('watcher.backup.history.duration') }}</th>
                        <th>{{ $t('watcher.backup.history.restoreTest') }}</th>
                        <th>{{ $t('watcher.backup.history.warnings') }}</th>
                    </tr>
                </thead>
                <tbody>
                    <template v-for="(h, i) in filteredHistory" :key="`${h.timestamp}-${i}`">
                    <tr :class="h.success ? 'history-row-ok' : 'history-row-err'">
                        <td class="small form-text">{{ fmtDate(h.timestamp) }}</td>
                        <td>
                            <span class="badge" :class="backupTriggerClass(backupTrigger(h))">
                                {{ backupTriggerLabel(t, backupTrigger(h)) }}
                            </span>
                        </td>
                        <td>
                            <span v-if="h.success" class="badge bg-success">✓ OK</span>
                            <span v-else class="badge bg-danger error-badge" @click="toggleError(i)">
                                ✗ {{ $t('watcher.status.error') }}
                                <span class="error-badge-caret">{{ expandedErrors.has(i) ? '▲' : '▼' }}</span>
                            </span>
                        </td>
                        <td><code class="small">{{ h.snapshotId ?? "—" }}</code></td>
                        <td class="small">{{ h.dataAdded ? formatBytes(h.dataAdded) : "—" }}</td>
                        <td class="small form-text">
                            {{ h.filesNew ?? 0 }} {{ $t('watcher.backup.history.new') }} ·
                            {{ h.filesChanged ?? 0 }} {{ $t('watcher.backup.history.modified') }}
                        </td>
                        <td class="small form-text">{{ formatDuration(h.duration) }}</td>
                        <td class="small">
                            <template v-if="restoreTestStatus(h) === 'ok'">
                                <span class="badge bg-success"
                                    :title="(h.destinations ?? []).map(d => d.restoreTest?.testedFile ?? '').filter(Boolean).join('\n')">
                                    {{ $t('watcher.backup.restoreTestOk') }}
                                </span>
                            </template>
                            <template v-else-if="restoreTestStatus(h) === 'fail'">
                                <span class="badge bg-danger"
                                    :title="(h.destinations ?? []).filter(d => d.restoreTest && !d.restoreTest.ok).map(d => `${d.label}: ${d.restoreTest?.error ?? '?'}`).join('\n')">
                                    {{ $t('watcher.backup.restoreTestFail') }}
                                </span>
                            </template>
                            <template v-else>
                                <span class="form-text">—</span>
                            </template>
                        </td>
                        <td class="small">
                            <span v-if="h.warnings?.length" class="badge bg-warning text-dark"
                                :title="h.warnings.join('\n')">
                                {{ h.warnings.length }}
                            </span>
                            <span v-else class="form-text">—</span>
                        </td>
                    </tr>
                    <tr v-if="!h.success && expandedErrors.has(i)" class="history-row-err-detail">
                        <td colspan="9">
                            <div class="backup-error-detail">
                                <div v-if="h.error" class="backup-error-global">
                                    <pre>{{ h.error }}</pre>
                                </div>
                                <template v-if="h.destinations?.some(d => d.error)">
                                    <div v-for="d in h.destinations?.filter(d => d.error)" :key="d.label" class="backup-error-dest">
                                        <span class="backup-error-dest-label">{{ d.label }}</span>
                                        <pre>{{ d.error }}</pre>
                                    </div>
                                </template>
                            </div>
                        </td>
                    </tr>
                    </template>
                </tbody>
            </table>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n/dist/vue-i18n.esm-browser.prod.js";
import { fmtDate } from "../../composables/useServerTz";
import {
    formatBytes,
    formatDuration,
    backupTrigger,
    backupTriggerLabel,
    backupTriggerClass,
    type BackupResult,
    type RestoreTestResult,
} from "./shared";

const { t } = useI18n();

const props = defineProps<{
    history: BackupResult[];
    nextBackupDate: Date | null;
}>();

const filteredHistory = computed(() => props.history);

const expandedErrors = ref<Set<number>>(new Set());
function toggleError(i: number) {
    const s = new Set(expandedErrors.value);
    s.has(i) ? s.delete(i) : s.add(i);
    expandedErrors.value = s;
}

function restoreTestStatus(h: BackupResult): "ok" | "fail" | "none" {
    const tests = (h.destinations ?? []).map(d => d.restoreTest).filter(Boolean) as RestoreTestResult[];
    if (tests.length === 0) return "none";
    return tests.every(t => t.ok) ? "ok" : "fail";
}
</script>

<style lang="scss" scoped>

.settings-subheading {
    font-size: var(--fs-lg);
    font-weight: 600;
}

// Tables Historique : même look que WatcherSettings
.table-responsive .table {
    @include data-table;

    > thead > tr > th {
        opacity: 1;
    }

    > tbody > tr > td {
        vertical-align: middle;
    }

    > tbody > tr:hover > td {
        background: var(--bg-raised);
    }
}

// Coloration par statut : bordure gauche sur la 1ère cellule
.history-row-ok  > td:first-child { border-left: 3px solid var(--success); }
.history-row-err > td:first-child { border-left: 3px solid var(--danger); }

.error-badge { cursor: pointer; user-select: none; }
.error-badge-caret { font-size: 0.65em; margin-left: 4px; opacity: 0.8; }

.history-row-err-detail > td {
    padding: 0;
    border-left: 3px solid var(--danger);
    background: var(--danger-soft);
}
.backup-error-detail {
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.backup-error-detail pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-all;
    font-size: var(--fs-sm);
    color: var(--danger);
    background: var(--bg-raised);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    max-height: 200px;
    overflow-y: auto;
}
.backup-error-dest { display: flex; flex-direction: column; gap: 4px; }
.backup-error-dest-label {
    font-size: var(--fs-xs);
    font-weight: 600;
    color: var(--danger);
    text-transform: uppercase;
    letter-spacing: 0.03em;
}

.table th {
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: .05em;
    opacity: .55;
}

.table td {
    vertical-align: middle;
}
</style>
