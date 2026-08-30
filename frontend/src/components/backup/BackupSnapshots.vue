<template>
    <!-- ═══ SNAPSHOTS RESTIC ═══ -->
    <div class="shadow-box big-padding mb-4">
        <div class="d-flex justify-content-between align-items-center gap-3 mb-3 flex-wrap">
            <h5 class="settings-subheading mb-0">
                <font-awesome-icon icon="camera" class="me-2" />{{ $t('watcher.backup.snapshots.heading') }}
            </h5>
            <small v-if="snapshotRepositorySizeLabel" class="form-text">
                {{ $t('watcher.backup.snapshots.repositorySize') }} :
                <strong>{{ snapshotRepositorySizeLabel }}</strong>
            </small>
            <small v-else-if="loadingSnapshotStats" class="form-text">
                <span class="spinner-border spinner-border-sm me-1" />
                {{ $t('watcher.backup.snapshots.loadingSizes') }}
            </small>
        </div>
        <div class="backup-filter-bar mb-3">
            <button v-for="f in snapshotFilters"
                :key="f"
                type="button"
                class="backup-filter-btn"
                :class="{ active: snapshotFilter === f }"
                @click="snapshotFilter = f">
                {{ $t(`watcher.backup.filter.${f}`) }}
            </button>
        </div>
        <div v-if="snapshots.length === 0" class="text-center form-text fst-italic py-3">
            {{ $t('watcher.backup.snapshots.none') }}
        </div>
        <div v-else-if="filteredSnapshots.length === 0" class="text-center form-text fst-italic py-3">
            {{ $t('watcher.backup.snapshots.noneFiltered') }}
        </div>
        <div v-else class="table-responsive">
            <table class="table table-hover mb-0 table-sm">
                <thead>
                    <tr>
                        <th style="width:1rem"></th>
                        <th>{{ $t('watcher.backup.snapshots.id') }}</th>
                        <th>{{ $t('watcher.backup.snapshots.date') }}</th>
                        <th>{{ $t('watcher.backup.snapshots.tags') }}</th>
                        <th>{{ $t('watcher.backup.snapshots.paths') }}</th>
                        <th>{{ $t('watcher.backup.snapshots.size') }}</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <template v-for="snap in filteredSnapshots" :key="snap.id">
                        <!-- Ligne principale du snapshot -->
                        <tr class="snapshot-row" @click="toggleSnapshotFiles(snap.short_id)"
                            style="cursor:pointer">
                            <td>
                                <font-awesome-icon
                                    :icon="expandedSnapshot === snap.short_id ? 'chevron-down' : 'chevron-right'"
                                    class="snap-chevron" />
                            </td>
                            <td><code>{{ snap.short_id }}</code></td>
                            <td class="small form-text">{{ fmtDate(snap.time) }}</td>
                            <td>
                                <span class="badge me-1" :class="backupTriggerClass(backupTrigger(snap))">
                                    {{ backupTriggerLabel(t, backupTrigger(snap)) }}
                                </span>
                                <span v-for="tag in (snap.tags ?? [])" :key="tag"
                                    class="badge bg-secondary me-1 small">{{ tag }}</span>
                            </td>
                            <td class="small form-text">{{ snap.paths.length }} {{ $t('watcher.backup.snapshots.path') }}</td>
                            <td class="small form-text">
                                <span :title="snapshotFileCountLabel(snap)">
                                    {{ snapshotSizeLabel(snap) }}
                                </span>
                            </td>
                            <td class="text-end" @click.stop>
                                <button class="btn btn-sm btn-outline-danger"
                                    @click="deleteSnapshot(snap.short_id)"
                                    :title="`${$t('watcher.backup.snapshots.deleteConfirm', [snap.short_id])}`">
                                    <font-awesome-icon icon="trash" />
                                </button>
                            </td>
                        </tr>

                        <!-- Ligne expandable : liste des fichiers -->
                        <tr v-if="expandedSnapshot === snap.short_id" class="snapshot-files-row">
                            <td colspan="7" class="p-0">
                                <div class="snapshot-files-panel px-4 py-3">

                                    <!-- Loading -->
                                    <div v-if="loadingFiles" class="text-center form-text py-2">
                                        <span class="spinner-border spinner-border-sm me-2" />
                                        {{ $t('watcher.backup.snapshots.loading') }}
                                    </div>

                                    <!-- Aucun fichier -->
                                    <div v-else-if="snapshotFiles.length === 0"
                                        class="form-text fst-italic">
                                        {{ $t('watcher.backup.snapshots.noFiles') }}
                                    </div>

                                    <!-- Arborescence par stack -->
                                    <template v-else>
                                        <div class="d-flex align-items-center justify-content-between mb-3">
                                            <div class="d-flex align-items-center gap-2">
                                                <input type="checkbox" class="form-check-input"
                                                    :checked="selectedFiles.size === snapshotFiles.length"
                                                    @change="toggleSelectAll"
                                                    :title="$t('watcher.backup.snapshots.selectAll')" />
                                                <small class="form-text">
                                                    {{ selectedFiles.size }}/{{ snapshotFiles.length }} {{ $t('watcher.backup.snapshots.selected') }}
                                                </small>
                                            </div>
                                            <button class="btn btn-sm btn-warning"
                                                :disabled="selectedFiles.size === 0 || restoring"
                                                @click="restoreSelected(snap.short_id)">
                                                <span v-if="restoring" class="spinner-border spinner-border-sm me-1" />
                                                <font-awesome-icon v-else icon="undo" class="me-1" />
                                                {{ $t('watcher.backup.snapshots.restoreSelected') }}
                                            </button>
                                        </div>

                                        <div class="snap-tree">
                                            <div v-for="sg in stackGroups" :key="sg.name" class="snap-stack">

                                                <!-- En-tête de stack (cliquable) -->
                                                <button type="button" class="snap-stack-header" @click="toggleStack(sg.name)">
                                                    <input type="checkbox" class="form-check-input flex-shrink-0" @click.stop
                                                        :checked="isStackAllSelected(sg)"
                                                        :indeterminate.prop="isStackPartialSelected(sg)"
                                                        @change.stop="toggleStackSelect(sg)" />
                                                    <font-awesome-icon
                                                        :icon="expandedStacks.has(sg.name) ? 'chevron-down' : 'chevron-right'"
                                                        class="snap-chevron" />
                                                    <code class="snap-stack-name">{{ sg.name }}</code>
                                                    <span class="snap-count">{{ sg.totalCount }}</span>
                                                    <button class="btn btn-xs btn-warning ms-auto flex-shrink-0"
                                                        :disabled="restoring"
                                                        @click.stop="restoreStack(snap.short_id, sg)"
                                                        :title="$t('watcher.backup.snapshots.restoreStack')">
                                                        <font-awesome-icon icon="undo" />
                                                    </button>
                                                </button>

                                                <!-- Contenu de la stack -->
                                                <div v-if="expandedStacks.has(sg.name)" class="snap-stack-body">

                                                    <!-- Fichiers directs (compose, env, other) -->
                                                    <template v-for="f in sg.directFiles" :key="f.path">

                                                    <!-- Volume directory → lazy-browse -->
                                                    <template v-if="f.type === 'volume'">
                                                        <div class="snap-vol-dir-header"
                                                            @click="browseToggle(snap.short_id, f.path)">
                                                            <input type="checkbox" class="form-check-input flex-shrink-0" @click.stop
                                                                :checked="selectedFiles.has(f.path)"
                                                                @change.stop="toggleFile(f.path)" />
                                                            <font-awesome-icon
                                                                :icon="browseOpen[bKey(snap.short_id, f.path)] ? 'folder-open' : 'folder'"
                                                                class="snap-folder-icon" />
                                                            <code class="snap-foldername">{{ f.path }}/</code>
                                                            <span v-if="browseLoading[bKey(snap.short_id, f.path)]"
                                                                class="spinner-border spinner-border-sm ms-2" />
                                                            <font-awesome-icon v-else
                                                                :icon="browseOpen[bKey(snap.short_id, f.path)] ? 'chevron-down' : 'chevron-right'"
                                                                class="ms-2 snap-chevron" />
                                                            <div class="snap-badges ms-auto">
                                                                <span v-if="f.snapDiff === 'added'" class="badge bg-success">{{ $t('watcher.backup.snapshots.diffAdded') }}</span>
                                                                <span v-else class="badge bg-secondary opacity-50">{{ $t('watcher.backup.snapshots.diffUnchanged') }}</span>
                                                                <span v-if="f.diskStatus !== 'missing'" class="badge bg-success">{{ $t('watcher.backup.snapshots.diskUnchanged') }}</span>
                                                                <span v-else class="badge bg-secondary">{{ $t('watcher.backup.snapshots.diskMissing') }}</span>
                                                            </div>
                                                        </div>
                                                        <!-- Enfants du volume (lazy-loaded) -->
                                                        <div v-if="browseOpen[bKey(snap.short_id, f.path)]" class="snap-vol-children">
                                                            <div v-for="child in (browseCache[bKey(snap.short_id, f.path)] ?? [])"
                                                                :key="child.path" class="snap-vol-child-row">
                                                                <template v-if="child.type === 'dir'">
                                                                    <!-- Sous-dossier : cliquable pour descendre d'un niveau -->
                                                                    <div class="snap-vol-subdir-header"
                                                                        @click="browseToggle(snap.short_id, child.path)">
                                                                        <input type="checkbox" class="form-check-input flex-shrink-0" @click.stop
                                                                            :checked="selectedFiles.has(child.path)"
                                                                            @change.stop="toggleFile(child.path)" />
                                                                        <font-awesome-icon
                                                                            :icon="browseOpen[bKey(snap.short_id, child.path)] ? 'folder-open' : 'folder'"
                                                                            class="snap-folder-icon" />
                                                                        <code class="snap-foldername">{{ child.name }}/</code>
                                                                        <span v-if="browseLoading[bKey(snap.short_id, child.path)]"
                                                                            class="spinner-border spinner-border-sm ms-2" />
                                                                        <font-awesome-icon v-else
                                                                            :icon="browseOpen[bKey(snap.short_id, child.path)] ? 'chevron-down' : 'chevron-right'"
                                                                            class="ms-2 snap-chevron" />
                                                                    </div>
                                                                    <!-- Petits-enfants -->
                                                                    <div v-if="browseOpen[bKey(snap.short_id, child.path)]" class="snap-vol-children snap-vol-children--l2">
                                                                        <div v-for="gc in (browseCache[bKey(snap.short_id, child.path)] ?? [])"
                                                                            :key="gc.path" class="snap-vol-child-row">
                                                                            <input type="checkbox" class="form-check-input flex-shrink-0"
                                                                                :checked="selectedFiles.has(gc.path)"
                                                                                @change="toggleFile(gc.path)" />
                                                                            <font-awesome-icon :icon="gc.type === 'dir' ? 'folder' : 'file'" class="snap-file-icon" />
                                                                            <code class="snap-foldername">{{ gc.name }}{{ gc.type === 'dir' ? '/' : '' }}</code>
                                                                            <span class="snap-filesize ms-auto text-muted">{{ gc.type === 'file' ? formatBytes(gc.size) : '' }}</span>
                                                                        </div>
                                                                    </div>
                                                                </template>
                                                                <template v-else>
                                                                    <!-- Fichier direct dans le volume -->
                                                                    <input type="checkbox" class="form-check-input flex-shrink-0"
                                                                        :checked="selectedFiles.has(child.path)"
                                                                        @change="toggleFile(child.path)" />
                                                                    <font-awesome-icon icon="file" class="snap-file-icon" />
                                                                    <code class="snap-foldername">{{ child.name }}</code>
                                                                    <span class="snap-filesize ms-auto text-muted">{{ formatBytes(child.size) }}</span>
                                                                </template>
                                                            </div>
                                                        </div>
                                                    </template>

                                                    <!-- Fichier normal (compose, env, other) -->
                                                    <div v-else
                                                        class="snap-file-row"
                                                        :class="{ 'opacity-50': f.diskStatus === 'missing' }">
                                                        <input type="checkbox" class="form-check-input flex-shrink-0"
                                                            :checked="selectedFiles.has(f.path)"
                                                            @change="toggleFile(f.path)" />
                                                        <font-awesome-icon :icon="fileIcon(f)" class="snap-file-icon" />
                                                        <span class="snap-filename">{{ f.name }}</span>
                                                        <span v-if="f.services?.length" class="snap-services">
                                                            <span v-for="svc in f.services" :key="svc"
                                                                class="badge bg-dark">{{ svc }}</span>
                                                        </span>
                                                        <span v-if="f.aliases?.length"
                                                            class="badge bg-secondary snap-alias"
                                                            :title="f.aliases!.join('\n')">
                                                            {{ $t('watcher.backup.snapshots.aliases', [f.aliases!.length]) }}
                                                        </span>
                                                        <button v-if="f.type === 'compose' || f.type === 'env'"
                                                            class="btn btn-xs btn-normal flex-shrink-0 snap-preview-btn"
                                                            @click.stop="openPreview(snap.short_id, f)"
                                                            :title="$t('watcher.backup.snapshots.preview')">
                                                            <font-awesome-icon icon="eye" />
                                                        </button>
                                                        <div class="snap-badges">
                                                            <span v-if="f.prevSnapshotId === null" class="badge bg-secondary">{{ $t('watcher.backup.snapshots.firstSnapshot') }}</span>
                                                            <span v-else-if="f.snapDiff === 'added'" class="badge bg-success">{{ $t('watcher.backup.snapshots.diffAdded') }}</span>
                                                            <span v-else-if="f.snapDiff === 'modified'" class="badge bg-warning text-dark">{{ $t('watcher.backup.snapshots.diffModified') }}</span>
                                                            <span v-else class="badge bg-secondary opacity-50">{{ $t('watcher.backup.snapshots.diffUnchanged') }}</span>
                                                            <span v-if="f.diskStatus === 'unchanged'" class="badge bg-success">{{ $t('watcher.backup.snapshots.diskUnchanged') }}</span>
                                                            <span v-else-if="f.diskStatus === 'modified'" class="badge bg-warning text-dark">{{ $t('watcher.backup.snapshots.diskModified') }}</span>
                                                            <span v-else class="badge bg-secondary">{{ $t('watcher.backup.snapshots.diskMissing') }}</span>
                                                        </div>
                                                    </div>

                                                    </template>

                                                    <!-- Fichiers de volume directement dans le volume (sans sous-dossier) -->
                                                    <div v-for="f in sg.volRootFiles" :key="f.path"
                                                        class="snap-file-row"
                                                        :class="{ 'opacity-50': f.diskStatus === 'missing' }">
                                                        <input type="checkbox" class="form-check-input flex-shrink-0"
                                                            :checked="selectedFiles.has(f.path)"
                                                            @change="toggleFile(f.path)" />
                                                        <font-awesome-icon icon="hdd" class="snap-file-icon" />
                                                        <span class="snap-filename">{{ volFileInnerPath(f) }}</span>
                                                        <div class="snap-badges">
                                                            <span v-if="f.prevSnapshotId === null" class="badge bg-secondary">{{ $t('watcher.backup.snapshots.firstSnapshot') }}</span>
                                                            <span v-else-if="f.snapDiff === 'added'" class="badge bg-success">{{ $t('watcher.backup.snapshots.diffAdded') }}</span>
                                                            <span v-else-if="f.snapDiff === 'modified'" class="badge bg-warning text-dark">{{ $t('watcher.backup.snapshots.diffModified') }}</span>
                                                            <span v-else class="badge bg-secondary opacity-50">{{ $t('watcher.backup.snapshots.diffUnchanged') }}</span>
                                                            <span v-if="f.diskStatus === 'unchanged'" class="badge bg-success">{{ $t('watcher.backup.snapshots.diskUnchanged') }}</span>
                                                            <span v-else-if="f.diskStatus === 'modified'" class="badge bg-warning text-dark">{{ $t('watcher.backup.snapshots.diskModified') }}</span>
                                                            <span v-else class="badge bg-secondary">{{ $t('watcher.backup.snapshots.diskMissing') }}</span>
                                                        </div>
                                                    </div>

                                                    <!-- Dossiers de volume (tiroirs) -->
                                                    <div v-for="folder in sg.volFolders" :key="folder.name" class="snap-folder">

                                                        <!-- En-tête du dossier (cliquable) -->
                                                        <button type="button" class="snap-folder-header" @click="toggleFolder(sg.name, folder.name)">
                                                            <input type="checkbox" class="form-check-input flex-shrink-0" @click.stop
                                                                :checked="isFolderAllSelected(folder)"
                                                                :indeterminate.prop="isFolderPartialSelected(folder)"
                                                                @change.stop="toggleFolderSelect(folder)" />
                                                            <font-awesome-icon
                                                                :icon="expandedFolders.has(sg.name + '::' + folder.name) ? 'folder-open' : 'folder'"
                                                                class="snap-folder-icon" />
                                                            <span class="snap-foldername">{{ folder.name }}/</span>
                                                            <span class="snap-count">{{ folder.files.length }}</span>
                                                        </button>

                                                        <!-- Fichiers du dossier -->
                                                        <div v-if="expandedFolders.has(sg.name + '::' + folder.name)" class="snap-folder-body">
                                                            <div v-for="f in folder.files" :key="f.path"
                                                                class="snap-file-row snap-file-in-folder"
                                                                :class="{ 'opacity-50': f.diskStatus === 'missing' }">
                                                                <input type="checkbox" class="form-check-input flex-shrink-0"
                                                                    :checked="selectedFiles.has(f.path)"
                                                                    @change="toggleFile(f.path)" />
                                                                <font-awesome-icon icon="hdd" class="snap-file-icon" />
                                                                <span class="snap-filename">{{ volFileInFolder(f, folder.name) }}</span>
                                                                <div class="snap-badges">
                                                                    <span v-if="f.prevSnapshotId === null" class="badge bg-secondary">{{ $t('watcher.backup.snapshots.firstSnapshot') }}</span>
                                                                    <span v-else-if="f.snapDiff === 'added'" class="badge bg-success">{{ $t('watcher.backup.snapshots.diffAdded') }}</span>
                                                                    <span v-else-if="f.snapDiff === 'modified'" class="badge bg-warning text-dark">{{ $t('watcher.backup.snapshots.diffModified') }}</span>
                                                                    <span v-else class="badge bg-secondary opacity-50">{{ $t('watcher.backup.snapshots.diffUnchanged') }}</span>
                                                                    <span v-if="f.diskStatus === 'unchanged'" class="badge bg-success">{{ $t('watcher.backup.snapshots.diskUnchanged') }}</span>
                                                                    <span v-else-if="f.diskStatus === 'modified'" class="badge bg-warning text-dark">{{ $t('watcher.backup.snapshots.diskModified') }}</span>
                                                                    <span v-else class="badge bg-secondary">{{ $t('watcher.backup.snapshots.diskMissing') }}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                    </div>

                                                </div>
                                            </div>
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

    <!-- ═══ MODAL APERÇU / DIFF ═══ -->
    <BackupSnapshotDiff v-model="preview" />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n/dist/vue-i18n.esm-browser.prod.js";
import { fmtDate } from "../../composables/useServerTz";
import BackupSnapshotDiff from "./BackupSnapshotDiff.vue";
import {
    api,
    formatBytes,
    backupTrigger,
    backupTriggerLabel,
    backupTriggerClass,
    type Snapshot,
    type SnapshotStats,
    type SnapshotFile,
    type PreviewState,
} from "./shared";

const { t } = useI18n();

const emit = defineEmits<{
    toast: [msg: string, ok?: boolean];
}>();

function showToast(msg: string, ok = true) {
    emit("toast", msg, ok);
}

type BackupViewFilter = "scheduled" | "on-save" | "manual" | "all" | "errors";
type SnapshotFilter = Exclude<BackupViewFilter, "errors">;

const snapshots = ref<Snapshot[]>([]);
const snapshotStats = ref<SnapshotStats | null>(null);
const loadingSnapshotStats = ref(false);
const snapshotFilters: SnapshotFilter[] = ["scheduled", "on-save", "manual", "all"];
const snapshotFilter = ref<SnapshotFilter>("scheduled");
const loadingSnaps = ref(false);
const expandedSnapshot  = ref<string | null>(null);
const snapshotFiles     = ref<SnapshotFile[]>([]);
const selectedFiles     = ref<Set<string>>(new Set());
const loadingFiles      = ref(false);
const restoring         = ref(false);
const preview = ref<PreviewState>({
    open: false,
    snapId: "",
    filePath: "",
    fileName: "",
    snapshotContent: "",
    diskContent:  null,
    prevContent:  null,
    loading: false,
    tab: "preview",
});
const expandedStacks    = ref<Set<string>>(new Set());
const expandedFolders   = ref<Set<string>>(new Set());

// ─── Lazy-browse des dossiers volumes ────────────────────────────
interface BrowseEntry { name: string; path: string; type: "file" | "dir"; size: number; mtime: string }
const browseCache   = ref<Record<string, BrowseEntry[]>>({});   // clé = snapshotId::path
const browseLoading = ref<Record<string, boolean>>({});
const browseOpen    = ref<Record<string, boolean>>({});

function bKey(snapId: string, p: string) { return `${snapId}::${p}`; }

async function browseToggle(snapId: string, dirPath: string) {
    const k = bKey(snapId, dirPath);
    if (browseOpen.value[k]) { browseOpen.value[k] = false; return; }
    if (!browseCache.value[k]) {
        browseLoading.value[k] = true;
        try {
            const res = await api("GET", `/backup/snapshots/${snapId}/browse?path=${encodeURIComponent(dirPath)}`);
            if (res.ok) browseCache.value[k] = res.data as BrowseEntry[];
        } finally { browseLoading.value[k] = false; }
    }
    browseOpen.value[k] = true;
}

function fileIcon(file: SnapshotFile): string {
    if (file.type === "compose") return "file-code";
    if (file.type === "env") return "key";
    if (file.type === "volume") return "hdd";
    return "file-code";
}

// ─── Arborescence des fichiers d'un snapshot ─────────────────────

interface VolFolder  { name: string; files: SnapshotFile[] }
interface StackGroup { name: string; directFiles: SnapshotFile[]; volRootFiles: SnapshotFile[]; volFolders: VolFolder[]; totalCount: number }

const stackGroups = computed<StackGroup[]>(() => {
    const map = new Map<string, StackGroup>();
    for (const f of snapshotFiles.value) {
        if (!map.has(f.stack))
            map.set(f.stack, { name: f.stack, directFiles: [], volRootFiles: [], volFolders: [], totalCount: 0 });
        const sg = map.get(f.stack)!;
        sg.totalCount++;
        if (f.type !== "volume" || !f.relativePath) {
            sg.directFiles.push(f);
        } else {
            const sep = f.relativePath.indexOf("/");
            const innerPath = sep >= 0 ? f.relativePath.slice(sep + 1) : "";
            if (!innerPath || !innerPath.includes("/")) {
                sg.volRootFiles.push(f);
            } else {
                const topDir = innerPath.split("/")[0];
                let folder = sg.volFolders.find(vf => vf.name === topDir);
                if (!folder) { folder = { name: topDir, files: [] }; sg.volFolders.push(folder); }
                folder.files.push(f);
            }
        }
    }
    return [...map.values()];
});

function volFileInnerPath(f: SnapshotFile): string {
    if (!f.relativePath) return f.name;
    const sep = f.relativePath.indexOf("/");
    return sep >= 0 ? f.relativePath.slice(sep + 1) : f.name;
}
function volFileInFolder(f: SnapshotFile, folderName: string): string {
    const inner = volFileInnerPath(f);
    return inner.startsWith(folderName + "/") ? inner.slice(folderName.length + 1) : inner;
}
function toggleStack(name: string) {
    const s = new Set(expandedStacks.value);
    s.has(name) ? s.delete(name) : s.add(name);
    expandedStacks.value = s;
}
function toggleFolder(stackName: string, folderName: string) {
    const key = `${stackName}::${folderName}`;
    const s = new Set(expandedFolders.value);
    s.has(key) ? s.delete(key) : s.add(key);
    expandedFolders.value = s;
}
function getAllStackFiles(sg: StackGroup): SnapshotFile[] {
    return [...sg.directFiles, ...sg.volRootFiles, ...sg.volFolders.flatMap(vf => vf.files)];
}
function isStackAllSelected(sg: StackGroup): boolean {
    const all = getAllStackFiles(sg);
    return all.length > 0 && all.every(f => selectedFiles.value.has(f.path));
}
function isStackPartialSelected(sg: StackGroup): boolean {
    const all = getAllStackFiles(sg);
    const n = all.filter(f => selectedFiles.value.has(f.path)).length;
    return n > 0 && n < all.length;
}
function toggleStackSelect(sg: StackGroup) {
    const all = getAllStackFiles(sg);
    const s = new Set(selectedFiles.value);
    isStackAllSelected(sg) ? all.forEach(f => s.delete(f.path)) : all.forEach(f => s.add(f.path));
    selectedFiles.value = s;
}
function isFolderAllSelected(folder: VolFolder): boolean {
    return folder.files.length > 0 && folder.files.every(f => selectedFiles.value.has(f.path));
}
function isFolderPartialSelected(folder: VolFolder): boolean {
    const n = folder.files.filter(f => selectedFiles.value.has(f.path)).length;
    return n > 0 && n < folder.files.length;
}
function toggleFolderSelect(folder: VolFolder) {
    const s = new Set(selectedFiles.value);
    isFolderAllSelected(folder)
        ? folder.files.forEach(f => s.delete(f.path))
        : folder.files.forEach(f => s.add(f.path));
    selectedFiles.value = s;
}

// ─── Aperçu / Diff ───────────────────────────────────────────────

async function openPreview(snapId: string, f: SnapshotFile) {
    const autoTab = (f.snapDiff === "modified" && f.prevSnapshotId) ? "snapdiff" : "preview";
    preview.value = {
        open: true, snapId, filePath: f.path, fileName: f.name,
        snapshotContent: "", diskContent: null, prevContent: null,
        loading: true, tab: autoTab,
    };
    try {
        let url = `/backup/snapshots/${snapId}/file-content?path=${encodeURIComponent(f.path)}`;
        if (f.prevSnapshotId) url += `&prevId=${encodeURIComponent(f.prevSnapshotId)}`;
        const res = await api("GET", url);
        if (res.ok) {
            preview.value.snapshotContent = res.data.snapshot ?? "";
            preview.value.diskContent     = res.data.disk ?? null;
            preview.value.prevContent     = res.data.prev ?? null;
        } else {
            showToast(`❌ ${res.message}`, false);
            preview.value.open = false;
        }
    } finally {
        preview.value.loading = false;
    }
}

// ─── Computed ─────────────────────────────────────────────────────

function matchesSnapshotFilter(item: Snapshot): boolean {
    if (snapshotFilter.value === "all") return true;
    return backupTrigger(item) === snapshotFilter.value;
}

const filteredSnapshots = computed(() => snapshots.value.filter(matchesSnapshotFilter));

const snapshotRepositorySizeLabel = computed(() => {
    const size = snapshotStats.value?.repositorySize;
    return typeof size === "number" ? formatBytes(size) : "";
});

const visibleSnapshotsForStats = computed(() => filteredSnapshots.value.slice(0, 10));

function snapshotStat(snap: Snapshot): { size?: number; fileCount?: number } {
    const stat = snapshotStats.value?.snapshots[snap.short_id];
    return {
        size: stat?.size ?? snap.size ?? snap.summary?.total_bytes_processed,
        fileCount: stat?.fileCount ?? snap.fileCount ?? snap.summary?.total_files_processed,
    };
}

function snapshotSizeLabel(snap: Snapshot): string {
    const size = snapshotStat(snap).size;
    if (typeof size === "number") return formatBytes(size);
    return loadingSnapshotStats.value ? t("watcher.backup.snapshots.loadingSizes") : "—";
}

function snapshotFileCountLabel(snap: Snapshot): string {
    const fileCount = snapshotStat(snap).fileCount;
    if (typeof fileCount !== "number") return "";
    return t("watcher.backup.snapshots.fileCount", [fileCount]);
}

// ─── Init ─────────────────────────────────────────────────────────

onMounted(async () => {
    const res = await api("GET", "/backup/snapshots");
    if (res.ok) {
        snapshots.value = (res.data as Snapshot[]).sort(
            (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
        );
        void loadSnapshotStats();
    }
});

watch(snapshotFilter, () => {
    void loadSnapshotStats();
});

// ─── Actions ──────────────────────────────────────────────────────

async function loadSnapshots() {
    loadingSnaps.value = true;
    try {
        const res = await api("GET", "/backup/snapshots");
        if (res.ok) snapshots.value = (res.data as Snapshot[]).sort(
            (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
        );
        else showToast(`❌ ${res.message}`, false);
        if (res.ok) void loadSnapshotStats();
    } finally { loadingSnaps.value = false; }
}

async function loadSnapshotStats() {
    if (snapshots.value.length === 0) {
        snapshotStats.value = null;
        return;
    }
    const ids = visibleSnapshotsForStats.value
        .filter(snap => typeof snapshotStat(snap).size !== "number")
        .map(snap => snap.short_id)
        .slice(0, 10);
    if (ids.length === 0 && snapshotStats.value?.repositorySize != null) return;

    loadingSnapshotStats.value = true;
    try {
        const query = ids.length > 0 ? `?ids=${encodeURIComponent(ids.join(","))}` : "";
        const res = await api("GET", `/backup/snapshots/stats${query}`);
        if (res.ok) {
            const next = res.data as SnapshotStats;
            snapshotStats.value = {
                ...(snapshotStats.value ?? {}),
                ...next,
                snapshots: {
                    ...(snapshotStats.value?.snapshots ?? {}),
                    ...(next.snapshots ?? {}),
                },
                errors: {
                    ...(snapshotStats.value?.errors ?? {}),
                    ...(next.errors ?? {}),
                },
            };
        }
    } finally {
        loadingSnapshotStats.value = false;
    }
}

async function deleteSnapshot(id: string) {
    if (!confirm(t('watcher.backup.snapshots.deleteConfirm', [id]))) return;
    const res = await api("DELETE", `/backup/snapshots/${id}`);
    if (res.ok) {
        snapshots.value = snapshots.value.filter(s => s.short_id !== id);
        if (snapshotStats.value) {
            const nextStats = { ...snapshotStats.value, snapshots: { ...snapshotStats.value.snapshots } };
            delete nextStats.snapshots[id];
            snapshotStats.value = nextStats;
        }
        showToast(t('watcher.backup.snapshots.deleted'));
    } else {
        showToast(`❌ ${res.message}`, false);
    }
}

async function toggleSnapshotFiles(shortId: string) {
    if (expandedSnapshot.value === shortId) {
        expandedSnapshot.value = null;
        snapshotFiles.value = [];
        selectedFiles.value = new Set();
        expandedStacks.value = new Set();
        expandedFolders.value = new Set();
        return;
    }
    expandedSnapshot.value = shortId;
    snapshotFiles.value = [];
    selectedFiles.value = new Set();
    expandedStacks.value = new Set();
    expandedFolders.value = new Set();
    loadingFiles.value = true;
    try {
        const res = await api("GET", `/backup/snapshots/${shortId}/files`);
        if (res.ok) snapshotFiles.value = res.data;
        else showToast(`❌ ${res.message}`, false);
    } finally {
        loadingFiles.value = false;
    }
}

function toggleFile(filePath: string) {
    const s = new Set(selectedFiles.value);
    if (s.has(filePath)) s.delete(filePath);
    else s.add(filePath);
    selectedFiles.value = s;
}

function toggleSelectAll() {
    if (selectedFiles.value.size === snapshotFiles.value.length) {
        selectedFiles.value = new Set();
    } else {
        selectedFiles.value = new Set(snapshotFiles.value.map(f => f.path));
    }
}

async function restoreSelected(shortId: string) {
    const paths = [...selectedFiles.value];
    if (paths.length === 0) return;
    if (!confirm(t('watcher.backup.snapshots.restoreConfirm', [paths.length, shortId]))) return;
    restoring.value = true;
    try {
        const res = await api("POST", `/backup/snapshots/${shortId}/restore`, { files: paths });
        if (res.ok) {
            showToast(t('watcher.backup.snapshots.restoreOk', [res.restored]));
            // Rafraîchit les statuts des fichiers
            const refresh = await api("GET", `/backup/snapshots/${shortId}/files`);
            if (refresh.ok) snapshotFiles.value = refresh.data;
        } else {
            showToast(t('watcher.backup.snapshots.restoreErr'), false);
        }
    } finally {
        restoring.value = false;
    }
}

async function restoreStack(shortId: string, sg: StackGroup) {
    const paths = getAllStackFiles(sg).map(f => f.path);
    if (paths.length === 0) return;
    if (!confirm(t('watcher.backup.snapshots.restoreStackConfirm', [sg.name, shortId]))) return;
    restoring.value = true;
    try {
        const res = await api("POST", `/backup/snapshots/${shortId}/restore`, { files: paths });
        if (res.ok) {
            showToast(t('watcher.backup.snapshots.restoreOk', [res.restored]));
            const refresh = await api("GET", `/backup/snapshots/${shortId}/files`);
            if (refresh.ok) snapshotFiles.value = refresh.data;
        } else {
            showToast(t('watcher.backup.snapshots.restoreErr'), false);
        }
    } finally {
        restoring.value = false;
    }
}

defineExpose({
    loadSnapshots,
    loadingSnaps,
});
</script>

<style lang="scss" scoped>

.settings-subheading {
    font-size: var(--fs-lg);
    font-weight: 600;
}

// Tables Snapshots : même look que WatcherSettings
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
.snapshot-row    > td:first-child { border-left: 3px solid var(--warning); }

.backup-filter-bar {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-raised);
}

.backup-filter-btn {
    border: 0;
    border-radius: var(--radius-sm);
    padding: 4px 10px;
    background: transparent;
    color: var(--text-muted);
    font-size: var(--fs-sm);
    font-weight: 500;
}

.backup-filter-btn:hover {
    background: color-mix(in srgb, var(--text-color) 6%, transparent);
    color: var(--text-color);
}

.backup-filter-btn.active {
    background: var(--primary-soft);
    color: var(--primary-strong);
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

// Boutons extra-petits
.btn-xs {
    padding: 2px 8px;
    font-size: var(--fs-xs);
    line-height: 1.4;
    border-radius: var(--radius-sm);
}

.snapshot-files-row td {
    background: var(--bg-raised) !important;
    border-bottom: 2px solid var(--border-color) !important;
}

.snapshot-files-panel {
    // Bootstrap applique color via --bs-table-color sur les cellules — on force direct
    .table {
        @include data-table;

        > thead > tr > th {
            opacity: 1; // annule le .55 du scope global
        }
    }
}

.snapshot-files-panel {
    border-left: 3px solid var(--warning);
}

// ─── Arborescence snapshot (tiroirs / sous-tiroirs) ──────────────
.snap-tree {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: var(--fs-md);
}

.snap-stack {
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    overflow: hidden;
}

.snap-stack-header {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 12px;
    border: 0;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
    text-align: left;
    background: var(--warning-soft);
    cursor: pointer;
    user-select: none;
    transition: background .12s;

    &:hover { background: color-mix(in srgb, var(--warning) 18%, transparent); }

    &:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: -2px;
    }

    .snap-stack-name {
        font-size: var(--fs-md);
        color: var(--warning);
        background: color-mix(in srgb, var(--warning) 15%, transparent);
        padding: 1px 6px;
        border-radius: var(--radius-sm);
        flex: 1;
    }
}

.snap-stack-body {
    background: var(--bg-raised);
    border-top: 1px solid var(--border-color);
}

.snap-folder {
    border-top: 1px solid var(--border-color);
}

.snap-folder-header {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 12px 6px 32px;
    border: 0;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
    text-align: left;
    cursor: pointer;
    user-select: none;
    background: color-mix(in srgb, var(--text-color) 2%, transparent);
    transition: background .12s;

    &:hover { background: color-mix(in srgb, var(--text-color) 5%, transparent); }

    &:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: -2px;
    }

    .snap-foldername {
        font-family: var(--font-mono);
        font-size: var(--fs-md);
        color: var(--warning);
        flex: 1;
    }
}

.snap-folder-body {
    background: var(--bg-raised);
    border-top: 1px solid var(--border-color);
}

.snap-file-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px 5px 32px;
    border-top: 1px solid var(--border-color);
    transition: background .1s;

    &:hover { background: color-mix(in srgb, var(--text-color) 3%, transparent); }

    &.snap-file-in-folder { padding-left: 52px; }
}

.snap-filename {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
}

.snap-services {
    display: flex;
    gap: 3px;
    flex-shrink: 0;

    .badge { font-size: var(--fs-xs); }
}

.snap-badges {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
}

.snap-filesize { font-size: var(--fs-xs); }

.snap-chevron, .snap-file-icon {
    font-size: var(--fs-xs);
    color: var(--text-muted);
    flex-shrink: 0;
}

.snap-folder-icon {
    font-size: var(--fs-md);
    color: var(--warning);
    flex-shrink: 0;
}

.snap-count {
    font-size: var(--fs-xs);
    background: var(--bg-raised);
    color: var(--text-muted);
    padding: 1px 6px;
    border-radius: var(--radius-pill);
    flex-shrink: 0;
}

.snap-alias {
    font-size: var(--fs-xs);
    flex-shrink: 0;
}

// ─── Bouton aperçu (œil) ────────────────────────────────────────
.snap-preview-btn {
    opacity: 0;
    transition: opacity .15s;
    .snap-file-row:hover & { opacity: 1; }
}
.snap-file-row:hover .snap-preview-btn { opacity: 1; }

// ─── Volume lazy-browse tree ──────────────────────────────────────
.snap-vol-dir-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px 6px 16px;
    cursor: pointer;
    user-select: none;
    background: var(--primary-soft);
    border-top: 1px solid var(--border-color);
    transition: background .12s;

    &:hover { background: color-mix(in srgb, var(--primary) 12%, transparent); }

    .snap-foldername { color: var(--primary-strong); }
    .snap-folder-icon { color: var(--primary-strong); }
}

.snap-vol-children {
    background: var(--bg-raised);
    border-top: 1px solid var(--border-color);
}

.snap-vol-child-row {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--border-color);
}

.snap-vol-subdir-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px 5px 32px;
    cursor: pointer;
    user-select: none;
    background: var(--primary-soft);
    transition: background .12s;

    &:hover { background: color-mix(in srgb, var(--primary) 10%, transparent); }

    .snap-foldername { color: var(--primary-strong); font-size: var(--fs-sm); }
    .snap-folder-icon { color: var(--primary-strong); font-size: var(--fs-sm); }
}

.snap-vol-children--l2 {
    background: var(--bg-raised);

    .snap-vol-child-row {
        flex-direction: row;
        align-items: center;
        gap: 8px;
        padding: 4px 12px 4px 52px;
        border-top: 1px solid var(--border-color);
        transition: background .1s;

        &:hover { background: color-mix(in srgb, var(--text-color) 3%, transparent); }

        .snap-foldername { font-size: var(--fs-sm); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    }
}

// Fichier direct dans un volume (l1)
.snap-vol-children > .snap-vol-child-row:not(:has(.snap-vol-subdir-header)) {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    padding: 4px 12px 4px 32px;
    transition: background .1s;

    &:hover { background: color-mix(in srgb, var(--text-color) 3%, transparent); }

    .snap-foldername { font-size: var(--fs-sm); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
</style>
