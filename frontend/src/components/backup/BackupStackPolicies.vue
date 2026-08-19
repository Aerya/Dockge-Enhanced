<template>
    <!-- ═══ COHÉRENCE PAR STACK ═══ -->
    <div v-if="stacksList.length > 0" class="shadow-box big-padding mb-4 stacks-exclude-section">
        <!-- Header cliquable -->
        <button type="button" class="vol-section-header" @click="toggleStacksSection">
            <h5 class="settings-subheading mb-0">
                <font-awesome-icon icon="layer-group" class="me-2" />{{ $t('watcher.backup.excludeStacks.heading') }}
                <span v-if="stacksCollapsed && (settings.excludedStacks?.length ?? 0) > 0" class="badge-summary ms-2">
                    {{ $t('watcher.backup.excludeStacks.excludedCount', { count: settings.excludedStacks.length }) }}
                </span>
            </h5>
            <font-awesome-icon :icon="stacksCollapsed ? 'chevron-down' : 'chevron-up'" class="chevron-icon" />
        </button>
        <!-- Body -->
        <div v-if="!stacksCollapsed" class="vol-section-body">
            <p class="form-text mb-3">{{ $t('watcher.backup.excludeStacks.hint') }}</p>
            <div class="stacks-policy-list">
                <div v-for="stack in stacksList" :key="stack"
                    class="stack-policy-item"
                    :class="{ 'stack-excluded': isStackExcluded(stack) }">
                    <div class="stack-policy-main">
                        <div class="form-check form-switch mb-0">
                            <input
                                :id="`stackInclude_${stack}`"
                                class="form-check-input"
                                type="checkbox"
                                role="switch"
                                :checked="!isStackExcluded(stack)"
                                @change="toggleStackExclusion(stack)" />
                            <label :for="`stackInclude_${stack}`" class="form-check-label stack-toggle-label">
                                <font-awesome-icon icon="layer-group" class="me-1 opacity-50 stack-icon" />
                                {{ stack }}
                            </label>
                        </div>
                        <select v-if="!isStackExcluded(stack)" v-model="stackPolicy(stack).mode"
                            class="form-select form-select-sm stack-policy-select">
                            <option value="hot">{{ $t('watcher.backup.stackPolicy.hot') }}</option>
                            <option value="stop">{{ $t('watcher.backup.stackPolicy.stop') }}</option>
                            <option value="hooks">{{ $t('watcher.backup.stackPolicy.hooks') }}</option>
                        </select>
                        <span v-else class="badge bg-secondary stack-excluded-badge">
                            {{ $t('watcher.backup.excludeStacks.excluded') }}
                        </span>
                    </div>
                    <p v-if="!isStackExcluded(stack)" class="form-text mb-0 mt-2">
                        {{ $t(`watcher.backup.stackPolicy.${stackPolicy(stack).mode}Hint`) }}
                    </p>
                    <div v-if="!isStackExcluded(stack) && stackPolicy(stack).mode === 'hooks'" class="row g-2 mt-1">
                        <div class="col-md-4">
                            <label class="form-label small">{{ $t('watcher.backup.stackPolicy.service') }}</label>
                            <input v-model="stackPolicy(stack).hookService" class="form-control form-control-sm"
                                :placeholder="$t('watcher.backup.stackPolicy.servicePlaceholder')" />
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small">{{ $t('watcher.backup.stackPolicy.preHook') }}</label>
                            <input v-model="stackPolicy(stack).preHook" class="form-control form-control-sm"
                                :placeholder="$t('watcher.backup.stackPolicy.preHookPlaceholder')" />
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small">{{ $t('watcher.backup.stackPolicy.postHook') }}</label>
                            <input v-model="stackPolicy(stack).postHook" class="form-control form-control-sm"
                                :placeholder="$t('watcher.backup.stackPolicy.postHookPlaceholder')" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { Settings, StackBackupPolicy } from "./shared";

const settings = defineModel<Settings>({ required: true });
defineProps<{ stacksList: string[] }>();

const stacksCollapsed = ref(localStorage.getItem("backupStacksCollapsed") === "1");
function toggleStacksSection() {
    stacksCollapsed.value = !stacksCollapsed.value;
    localStorage.setItem("backupStacksCollapsed", stacksCollapsed.value ? "1" : "0");
}
function isStackExcluded(stack: string): boolean {
    return (settings.value.excludedStacks ?? []).includes(stack);
}
function toggleStackExclusion(stack: string) {
    const excluded = settings.value.excludedStacks ?? [];
    if (excluded.includes(stack)) {
        settings.value.excludedStacks = excluded.filter(s => s !== stack);
    } else {
        settings.value.excludedStacks = [...excluded, stack];
    }
}
function stackPolicy(stack: string): StackBackupPolicy {
    settings.value.stackPolicies ??= {};
    settings.value.stackPolicies[stack] ??= { mode: "hot" };
    return settings.value.stackPolicies[stack];
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

// ─── Politiques de cohérence par stack ──────────────────────────
.stacks-exclude-section {
    padding: 0 !important;
    overflow: hidden;
}

.stacks-policy-list {
    display: flex;
    flex-direction: column;
    gap: .5rem;
}

.stack-policy-item {
    padding: .65rem .75rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-color);
    background: var(--bg-raised);
    transition: background .15s, border-color .15s;

    &.stack-excluded {
        background: color-mix(in srgb, var(--text-muted) 12%, transparent);
        border-color: color-mix(in srgb, var(--text-muted) 30%, transparent);
    }
}

.stack-policy-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
}

.stack-policy-select {
    width: min(260px, 50%);
}

.stack-toggle-label {
    font-size: var(--fs-md);
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 280px;
}

.stack-icon { font-size: var(--fs-xs); }

.stack-excluded-badge {
    font-size: var(--fs-xs);
    padding: .15em .4em;
    white-space: nowrap;
    flex-shrink: 0;
}
</style>
