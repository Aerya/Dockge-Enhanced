<template>
    <!-- ═══ MODAL APERÇU / DIFF ═══ -->
    <Teleport to="body">
        <div v-if="preview.open" class="preview-overlay" @click.self="preview.open = false">
            <div class="preview-modal">

                <!-- En-tête -->
                <div class="preview-header">
                    <code class="preview-filename">{{ preview.fileName }}</code>
                    <div class="preview-tabs">
                        <button :class="['preview-tab-btn', preview.tab === 'preview' && 'active']"
                            @click="preview.tab = 'preview'">
                            <font-awesome-icon icon="eye" class="me-1" />{{ $t('watcher.backup.snapshots.previewTab') }}
                        </button>
                        <button :class="['preview-tab-btn', preview.tab === 'snapdiff' && 'active']"
                            :disabled="preview.loading || !preview.prevContent"
                            @click="preview.tab = 'snapdiff'">
                            <font-awesome-icon icon="code-branch" class="me-1" />{{ $t('watcher.backup.snapshots.snapDiffTab') }}
                        </button>
                        <button :class="['preview-tab-btn', preview.tab === 'diff' && 'active']"
                            :disabled="preview.loading || !preview.diskContent"
                            @click="preview.tab = 'diff'">
                            <font-awesome-icon icon="hard-drive" class="me-1" />{{ $t('watcher.backup.snapshots.diffTab') }}
                        </button>
                    </div>
                    <button class="preview-close-btn" @click="preview.open = false">
                        <font-awesome-icon icon="times" />
                    </button>
                </div>

                <!-- Chargement -->
                <div v-if="preview.loading" class="preview-loading">
                    <span class="spinner-border spinner-border-sm me-2" />{{ $t('watcher.backup.snapshots.loading') }}
                </div>

                <!-- Corps -->
                <div v-else class="preview-body">

                    <!-- Onglet Aperçu -->
                    <pre v-if="preview.tab === 'preview'" class="preview-code">{{ preview.snapshotContent }}</pre>

                    <!-- Onglet Diff entre snapshots -->
                    <div v-else-if="preview.tab === 'snapdiff'" class="diff-view">
                        <div v-if="!preview.prevContent" class="form-text fst-italic p-3">
                            {{ $t('watcher.backup.snapshots.snapDiffNoPrev') }}
                        </div>
                        <template v-else>
                            <div class="diff-legend">
                                <span class="diff-leg-rm">− {{ $t('watcher.backup.snapshots.snapDiffLegendPrev') }}</span>
                                <span class="diff-leg-add">+ {{ $t('watcher.backup.snapshots.snapDiffLegendCurr') }}</span>
                                <span v-if="snapDiffResult.every(l => l.type === 'same')" class="diff-leg-ok">
                                    ✓ {{ $t('watcher.backup.snapshots.diffIdentical') }}
                                </span>
                            </div>
                            <div class="diff-lines">
                                <div v-for="(ln, i) in snapDiffResult" :key="i"
                                    :class="['diff-line', `diff-${ln.type}`]">
                                    <span class="diff-lnum">{{ i + 1 }}</span>
                                    <span class="diff-marker">{{ ln.type === 'removed' ? '−' : ln.type === 'added' ? '+' : ' ' }}</span>
                                    <span class="diff-text">{{ ln.line }}</span>
                                </div>
                            </div>
                        </template>
                    </div>

                    <!-- Onglet Diff vs disque -->
                    <div v-else class="diff-view">
                        <div v-if="!preview.diskContent" class="form-text fst-italic p-3">
                            {{ $t('watcher.backup.snapshots.diffMissing') }}
                        </div>
                        <template v-else>
                            <div class="diff-legend">
                                <span class="diff-leg-rm">− {{ $t('watcher.backup.snapshots.diffLegendSnapshot') }}</span>
                                <span class="diff-leg-add">+ {{ $t('watcher.backup.snapshots.diffLegendDisk') }}</span>
                                <span v-if="diffResult.every(l => l.type === 'same')" class="diff-leg-ok">
                                    ✓ {{ $t('watcher.backup.snapshots.diffIdentical') }}
                                </span>
                            </div>
                            <div class="diff-lines">
                                <div v-for="(ln, i) in diffResult" :key="i"
                                    :class="['diff-line', `diff-${ln.type}`]">
                                    <span class="diff-lnum">{{ i + 1 }}</span>
                                    <span class="diff-marker">{{ ln.type === 'removed' ? '−' : ln.type === 'added' ? '+' : ' ' }}</span>
                                    <span class="diff-text">{{ ln.line }}</span>
                                </div>
                            </div>
                        </template>
                    </div>

                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { diffLines, type DiffLine, type PreviewState } from "./shared";

const preview = defineModel<PreviewState>({ required: true });

const diffResult = computed<DiffLine[]>(() => {
    if (!preview.value.diskContent || !preview.value.snapshotContent) return [];
    return diffLines(preview.value.snapshotContent, preview.value.diskContent);
});

const snapDiffResult = computed<DiffLine[]>(() => {
    if (!preview.value.prevContent || !preview.value.snapshotContent) return [];
    return diffLines(preview.value.prevContent, preview.value.snapshotContent);
});
</script>

<style lang="scss" scoped>

// ─── Modal Aperçu / Diff ─────────────────────────────────────────
.preview-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, .72);
    z-index: 10000;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 48px 16px 32px;
    overflow-y: auto;
}

.preview-modal {
    background: var(--bg-surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    width: 100%;
    max-width: 900px;
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 96px);
    box-shadow: var(--shadow-card);
}

.preview-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 16px;
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;

    .preview-filename {
        font-size: var(--fs-md);
        color: var(--primary-strong);
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}

.preview-tabs {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
}

.preview-tab-btn {
    background: var(--bg-raised);
    border: 1px solid var(--border-color);
    color: var(--text-muted);
    padding: 4px 12px;
    border-radius: var(--radius-sm);
    font-size: var(--fs-sm);
    cursor: pointer;
    transition: background .12s, color .12s;

    &:hover:not(:disabled) { background: color-mix(in srgb, var(--text-color) 8%, transparent); color: var(--text-color); }
    &.active { background: var(--primary-soft); color: var(--primary-strong); border-color: color-mix(in srgb, var(--primary) 35%, transparent); }
    &:disabled { opacity: .35; cursor: not-allowed; }
}

.preview-close-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1rem;
    cursor: pointer;
    padding: 2px 6px;
    flex-shrink: 0;

    &:hover { color: var(--text-color); }
}

.preview-loading {
    padding: 2.5rem;
    text-align: center;
    color: var(--text-muted);
    font-size: var(--fs-md);
}

.preview-body {
    overflow: auto;
    flex: 1;
    min-height: 0;
}

.preview-code {
    margin: 0;
    padding: 16px 20px;
    font-size: var(--fs-sm);
    color: var(--text-color);
    background: transparent;
    line-height: 1.6;
    white-space: pre;
    overflow: visible;
    tab-size: 2;
}

.diff-view { display: flex; flex-direction: column; height: 100%; }

.diff-legend {
    display: flex;
    gap: 20px;
    align-items: center;
    padding: 7px 16px;
    border-bottom: 1px solid var(--border-color);
    font-size: var(--fs-sm);
    flex-shrink: 0;

    .diff-leg-rm  { color: var(--danger); }
    .diff-leg-add { color: var(--success); }
    .diff-leg-ok  { color: var(--text-muted); margin-left: auto; }
}

.diff-lines {
    overflow: auto;
    flex: 1;
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    line-height: 1.45;
}

.diff-line {
    display: flex;
    align-items: stretch;
    white-space: pre;

    &.diff-removed { background: var(--danger-soft); }
    &.diff-added   { background: var(--success-soft); }
    &:hover        { filter: brightness(1.2); }

    .diff-lnum {
        min-width: 46px;
        text-align: right;
        padding: 1px 8px 1px 4px;
        color: var(--text-muted);
        user-select: none;
        border-right: 1px solid var(--border-color);
        flex-shrink: 0;
    }

    .diff-marker {
        min-width: 20px;
        text-align: center;
        padding: 1px 3px;
        font-weight: 700;
        flex-shrink: 0;
    }

    &.diff-removed .diff-marker { color: var(--danger); }
    &.diff-added   .diff-marker { color: var(--success); }
    &.diff-same    .diff-marker { color: transparent; }

    .diff-text {
        padding: 1px 10px;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--text-color);
    }

    &.diff-removed .diff-text { color: var(--danger); }
    &.diff-added   .diff-text { color: var(--success); }
}
</style>
