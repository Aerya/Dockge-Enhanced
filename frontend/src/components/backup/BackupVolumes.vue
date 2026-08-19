<template>
    <!-- ═══ VOLUMES ═══ -->
    <div class="shadow-box mb-4 vol-section" :class="{ collapsed: volumesCollapsed }">
        <!-- Header cliquable -->
        <button type="button" class="vol-section-header" @click="toggleVolumes">
            <h5 class="settings-subheading mb-0">
                <font-awesome-icon icon="hdd" class="me-2" />{{ $t('watcher.backup.volumes.heading') }}
                <span v-if="volumesCollapsed" class="badge-summary ms-2">
                    <span v-if="volBadge">{{ volBadge }}</span>
                    <span v-else class="text-muted">{{ $t('watcher.backup.volumes.noneSelected') }}</span>
                </span>
            </h5>
            <font-awesome-icon :icon="volumesCollapsed ? 'chevron-down' : 'chevron-up'" class="chevron-icon" />
        </button>
        <!-- Body -->
        <div v-if="!volumesCollapsed" class="vol-section-body">
            <p class="form-text mb-3">{{ $t('watcher.backup.volumes.hint') }}</p>
            <!-- Chargement des volumes montés -->
            <div v-if="loadingMountedVols" class="text-muted mb-2 vol-note">
                <span class="spinner-border spinner-border-sm me-1" />{{ $t('watcher.backup.volumes.detecting') }}
            </div>
            <!-- Liste unifiée : /app/data + volumes montés -->
            <div class="vol-list">
                <div v-for="vol in allBackupVols" :key="vol.destination" class="vol-entry"
                    :class="{ 'vol-entry-active': volState(vol.destination) !== 'none' }">
                    <!-- Ligne principale du volume -->
                    <div class="vol-row" :class="{
                        active: volState(vol.destination) !== 'none',
                        partial: volState(vol.destination) === 'partial'
                    }">
                        <div class="d-flex align-items-center gap-2 flex-grow-1 min-w-0">
                            <input type="checkbox" class="form-check-input flex-shrink-0"
                                :checked="volState(vol.destination) !== 'none'"
                                @change="toggleWholeVol(vol.destination)" />
                            <code class="vol-path">{{ vol.destination }}</code>
                            <span v-if="vol.source" class="vol-source text-truncate">{{ vol.source }}</span>
                        </div>
                        <button type="button" class="btn btn-xs btn-normal flex-shrink-0"
                            @click.stop="toggleExpand(vol.destination)"
                            :title="$t('watcher.backup.volumes.browse')">
                            <font-awesome-icon :icon="expandedVols.has(vol.destination) ? 'chevron-up' : 'chevron-down'" />
                        </button>
                    </div>
                    <!-- Panel sous-dossiers -->
                    <div v-if="expandedVols.has(vol.destination)" class="vol-subdirs-panel">
                        <!-- Barre d'actions -->
                        <div class="vol-subdirs-actions">
                            <button type="button" class="btn btn-xs btn-normal"
                                @click="selectAllDirs(vol.destination)">
                                {{ $t('watcher.backup.volumes.selectAll') }}
                            </button>
                            <button type="button" class="btn btn-xs btn-normal ms-1"
                                @click="selectNoneDirs(vol.destination)">
                                {{ $t('watcher.backup.volumes.selectNone') }}
                            </button>
                            <button type="button" class="btn btn-xs btn-normal ms-2"
                                @click="loadVolSizes(vol.destination)"
                                :disabled="loadingVolSizes[vol.destination]">
                                <span v-if="loadingVolSizes[vol.destination]" class="spinner-border spinner-border-sm me-1" />
                                <font-awesome-icon v-else icon="weight-hanging" class="me-1" />
                                {{ $t('watcher.backup.volumes.calcSizes') }}
                            </button>
                        </div>
                        <!-- Chargement dossiers -->
                        <div v-if="loadingVolDirs[vol.destination]"
                            class="text-muted py-2 ps-3 vol-note">
                            <span class="spinner-border spinner-border-sm me-1" />{{ $t('watcher.backup.volumes.loadingDirs') }}
                        </div>
                        <!-- Dossier vide -->
                        <div v-else-if="(volDirs[vol.destination] ?? []).length === 0"
                            class="text-muted py-2 ps-3 vol-note">
                            {{ $t('watcher.backup.volumes.noDirs') }}
                        </div>
                        <!-- Liste des sous-dossiers -->
                        <div v-else class="vol-dir-list">
                            <div v-for="dir in volDirs[vol.destination]" :key="dir"
                                class="vol-dir-row"
                                :class="{ active: isSubdirSelected(vol.destination, dir) }"
                                @click="toggleSubdir(vol.destination, dir)">
                                <div class="form-check mb-0">
                                    <input type="checkbox" class="form-check-input"
                                        :checked="isSubdirSelected(vol.destination, dir)"
                                        @click.stop="toggleSubdir(vol.destination, dir)" />
                                    <label class="form-check-label" @click.stop="toggleSubdir(vol.destination, dir)">
                                        <code class="vol-path">{{ dir }}</code>
                                    </label>
                                </div>
                                <span v-if="volSizes[vol.destination + '/' + dir]" class="vol-size">
                                    <font-awesome-icon icon="weight-hanging" class="me-1 text-muted" />{{ volSizes[vol.destination + '/' + dir] }}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n/dist/vue-i18n.esm-browser.prod.js";
import { api, APP_DATA, type MountedVolume, type Settings } from "./shared";

const { t } = useI18n();

const settings = defineModel<Settings>({ required: true });
const props = defineProps<{
    mountedVols: MountedVolume[];
    loadingMountedVols: boolean;
}>();

const expandedVols = ref<Set<string>>(new Set());
const volDirs = ref<Record<string, string[]>>({});
const volSizes = ref<Record<string, string>>({});
const loadingVolDirs = ref<Record<string, boolean>>({});
const loadingVolSizes = ref<Record<string, boolean>>({});

// Tous les volumes affichables : /app/data en premier, puis les volumes montés détectés
const allBackupVols = computed<MountedVolume[]>(() => [
    { destination: APP_DATA, source: "" },
    ...props.mountedVols,
]);

// Badge résumé pour le header rétractable
const volBadge = computed(() => {
    const sel = settings.value.volumeBackup.selectedVolumes;
    if (sel.length === 0) return null;
    const allPaths = allBackupVols.value.map(v => v.destination);
    const tops = new Set(sel.map(p => allPaths.find(v => p === v || p.startsWith(v + "/")) ?? p));
    const parts: string[] = [];
    if (tops.has(APP_DATA)) parts.push("/app/data");
    const others = [...tops].filter(v => v !== APP_DATA).length;
    if (others > 0) parts.push(t("watcher.backup.volumes.volCount", { count: others }));
    return parts.join(" · ") || null;
});
const volumesCollapsed = ref(localStorage.getItem("backupVolumesCollapsed") === "1");
function toggleVolumes() {
    volumesCollapsed.value = !volumesCollapsed.value;
    localStorage.setItem("backupVolumesCollapsed", volumesCollapsed.value ? "1" : "0");
}

// ── Sélection volumes ───────────────────────────────────────────

function volState(volPath: string): "none" | "all" | "partial" {
    const sel = settings.value.volumeBackup.selectedVolumes;
    if (sel.includes(volPath)) return "all";
    if (sel.some(p => p.startsWith(volPath + "/"))) return "partial";
    return "none";
}

function toggleWholeVol(volPath: string) {
    const state = volState(volPath);
    const sel = settings.value.volumeBackup.selectedVolumes;
    const filtered = sel.filter(p => p !== volPath && !p.startsWith(volPath + "/"));
    settings.value.volumeBackup.selectedVolumes = state === "none" ? [...filtered, volPath] : filtered;
}

function isSubdirSelected(volPath: string, dir: string): boolean {
    const sel = settings.value.volumeBackup.selectedVolumes;
    return sel.includes(volPath) || sel.includes(`${volPath}/${dir}`);
}

function toggleSubdir(volPath: string, dir: string) {
    const fullPath = `${volPath}/${dir}`;
    const sel = settings.value.volumeBackup.selectedVolumes;
    const dirs = volDirs.value[volPath] ?? [];
    if (sel.includes(volPath)) {
        // Tout sélectionné → passer en mode partiel : tous sauf ce dossier
        settings.value.volumeBackup.selectedVolumes = [
            ...sel.filter(p => p !== volPath),
            ...dirs.filter(d => d !== dir).map(d => `${volPath}/${d}`),
        ];
    } else {
        const idx = sel.indexOf(fullPath);
        if (idx === -1) {
            sel.push(fullPath);
            // Si tous les sous-dossiers sont maintenant cochés → revenir au vol entier
            if (dirs.length > 0 && dirs.every(d => sel.includes(`${volPath}/${d}`))) {
                settings.value.volumeBackup.selectedVolumes = [
                    ...sel.filter(p => !p.startsWith(volPath + "/")),
                    volPath,
                ];
            }
        } else {
            sel.splice(idx, 1);
        }
    }
}

function selectAllDirs(volPath: string) {
    const sel = settings.value.volumeBackup.selectedVolumes;
    settings.value.volumeBackup.selectedVolumes = [
        ...sel.filter(p => p !== volPath && !p.startsWith(volPath + "/")),
        volPath,
    ];
}

function selectNoneDirs(volPath: string) {
    settings.value.volumeBackup.selectedVolumes =
        settings.value.volumeBackup.selectedVolumes.filter(
            p => p !== volPath && !p.startsWith(volPath + "/")
        );
}

async function toggleExpand(volPath: string) {
    const next = new Set(expandedVols.value);
    if (next.has(volPath)) {
        next.delete(volPath);
    } else {
        next.add(volPath);
    }
    // Mise à jour immédiate → le chevron et le panel réagissent tout de suite
    expandedVols.value = next;
    // Chargement des sous-dossiers uniquement si le volume vient d'être ouvert
    if (next.has(volPath) && !volDirs.value[volPath]) {
        await loadVolDirs(volPath);
    }
}

async function loadVolDirs(volPath: string) {
    loadingVolDirs.value = { ...loadingVolDirs.value, [volPath]: true };
    try {
        const res = await api("GET", `/backup/volume-dirs?path=${encodeURIComponent(volPath)}`);
        if (res.ok) volDirs.value = { ...volDirs.value, [volPath]: res.data as string[] };
    } finally {
        loadingVolDirs.value = { ...loadingVolDirs.value, [volPath]: false };
    }
}

async function loadVolSizes(volPath: string) {
    loadingVolSizes.value = { ...loadingVolSizes.value, [volPath]: true };
    try {
        const res = await api("GET", `/backup/volume-sizes?path=${encodeURIComponent(volPath)}`);
        if (res.ok) {
            const newSizes = { ...volSizes.value };
            for (const [dir, size] of Object.entries(res.data as Record<string, string>)) {
                newSizes[`${volPath}/${dir}`] = size as string;
            }
            volSizes.value = newSizes;
        }
    } finally {
        loadingVolSizes.value = { ...loadingVolSizes.value, [volPath]: false };
    }
}
</script>

<style lang="scss" scoped>

.settings-subheading {
    font-size: var(--fs-lg);
    font-weight: 600;
}

// ─── Section Volumes rétractable ────────────────────────────────
.vol-section {
    padding: 0 !important;
    overflow: hidden;

    &.collapsed .vol-section-header {
        border-bottom: none;
    }
}

.vol-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 14px 20px;
    cursor: pointer;
    border: 0;
    background: transparent;
    color: inherit;
    font-family: inherit;
    text-align: left;
    border-bottom: 1px solid var(--border-color);
    user-select: none;
    transition: background .15s;

    &:hover { background: color-mix(in srgb, var(--text-color) 3%, transparent); }

    &:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: -2px;
    }

    .chevron-icon {
        font-size: var(--fs-sm);
        color: var(--text-muted);
        transition: transform .2s;
    }

    .badge-summary {
        font-size: var(--fs-xs);
        font-weight: 400;
        color: var(--primary-strong);
        background: var(--primary-soft);
        padding: 2px 8px;
        border-radius: var(--radius-pill);
        vertical-align: middle;
    }
}

.vol-section-body {
    padding: 16px 20px 20px;
}

.vol-note { font-size: var(--fs-md); }

// ─── Vol-rows (sélection volumes) ────────────────────────────────
.vol-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: var(--bg-raised);
    transition: background .15s;

    &.active {
        background: var(--primary-soft);
    }

    .vol-path {
        font-size: var(--fs-md);
        color: var(--primary-strong);
        background: var(--primary-soft);
        padding: 1px 6px;
        border-radius: var(--radius-sm);
    }

    .vol-size {
        font-size: var(--fs-md);
        font-family: var(--font-mono);
        color: var(--text-muted);
        white-space: nowrap;
    }
}

// Boutons extra-petits
.btn-xs {
    padding: 2px 8px;
    font-size: var(--fs-xs);
    line-height: 1.4;
    border-radius: var(--radius-sm);
}

// ─── Liste unifiée de volumes ──────────────────────────────────────
.vol-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.vol-entry {
    border-radius: var(--radius-sm);
    overflow: hidden;
    border: 1px solid var(--border-color);
    transition: border-color .15s;

    &.vol-entry-active {
        border-color: color-mix(in srgb, var(--primary) 40%, transparent);
    }
}

.vol-source {
    font-size: var(--fs-xs);
    color: var(--text-muted);
    font-family: var(--font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
}

// ─── Panel sous-dossiers ──────────────────────────────────────────
.vol-subdirs-panel {
    border-top: 1px solid var(--border-color);
    background: var(--bg-raised);
    padding: 10px 14px 12px;
}

.vol-subdirs-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 10px;
}

.vol-dir-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 260px;
    overflow-y: auto;
}

.vol-dir-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 8px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background .12s;

    &:hover { background: color-mix(in srgb, var(--text-color) 4%, transparent); }

    &.active {
        background: var(--primary-soft);
        .form-check-label code { color: var(--primary-strong); }
    }

    .vol-size {
        font-size: var(--fs-sm);
        font-family: var(--font-mono);
        color: var(--text-muted);
        white-space: nowrap;
        flex-shrink: 0;
        margin-left: 8px;
    }
}
</style>
