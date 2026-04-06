<template>
    <span v-if="stackStatsEnabled && stat" class="stack-stats-badge ms-2" :class="cpuClass">
        <font-awesome-icon icon="microchip" class="me-1" />{{ stat.cpu.toFixed(1) }}%
        <span class="sep">·</span>
        <font-awesome-icon icon="memory" class="me-1" />{{ formatMem(stat.memUsed) }}
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
    if (cpu >= 85) return "stat-danger";
    if (cpu >= 70) return "stat-warning";
    return "stat-ok";
});
</script>

<style lang="scss" scoped>
.stack-stats-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-weight: 500;
    vertical-align: middle;
    letter-spacing: 0.01em;
    transition: color 0.3s;

    &.stat-ok      { color: #a8d8b0; } // vert menthe pastel
    &.stat-warning  { color: #f0d898; } // jaune blé pastel
    &.stat-danger   { color: #f0a8a8; } // rose saumon pastel

    .sep {
        opacity: 0.35;
        margin: 0 1px;
    }
}
</style>
