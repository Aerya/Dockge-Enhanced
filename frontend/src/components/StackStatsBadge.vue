<template>
    <span v-if="stackStatsEnabled && stat" class="stat-tags">
        <span class="stat-tag" :class="cpuClass">
            <font-awesome-icon icon="microchip" />{{ stat.cpu.toFixed(1) }}%
        </span>
        <span class="stat-tag stat-tag--mem">
            <font-awesome-icon icon="memory" />{{ formatMem(stat.memUsed) }}
        </span>
    </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useStackStats, stackStatsEnabled, formatMem } from "../composables/useStackStats";

const props = defineProps<{ stackName: string }>();

const { statsCache } = useStackStats();

const stat = computed(() => statsCache.value[props.stackName] ?? null);

const cpuClass = computed(() => {
    const cpu = stat.value?.cpu ?? 0;
    if (cpu >= 85) {
        return "stat-danger";
    }
    if (cpu >= 70) {
        return "stat-warning";
    }
    return "stat-ok";
});
</script>

<style lang="scss" scoped>
.stat-tags {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    min-width: 0;
}

// Soft pill tag: tinted background + matching text color, no border.
.stat-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 7px;
    border-radius: var(--radius-pill);
    background: var(--bg-raised);
    color: var(--text-muted);
    font-size: var(--fs-xs);
    font-weight: 600;
    line-height: 1.5;
    white-space: nowrap;
    letter-spacing: 0.01em;
    transition: color 0.3s, background-color 0.3s;

    svg {
        font-size: 9px;
    }

    &.stat-ok {
        background: var(--success-soft);
        color: var(--success);
    }

    &.stat-warning {
        background: var(--warning-soft);
        color: var(--warning);
    }

    &.stat-danger {
        background: var(--danger-soft);
        color: var(--danger);
    }
}

// Memory stays a steady primary tint; only CPU shifts with load.
.stat-tag--mem {
    background: var(--primary-soft);
    color: var(--primary-strong);
}
</style>
