<template>
    <span v-if="hasUpdate" class="badge-update" :title="tooltip">
        <font-awesome-icon icon="arrow-circle-up" />MàJ
    </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useImageStatus } from "../composables/useImageStatus";

const props = defineProps<{ stackName: string }>();

const { statusCache: statuses } = useImageStatus();

const stackUpdates = computed(() =>
    statuses.value.filter(s =>
        s.stack === props.stackName && s.hasUpdate && !s.error
    )
);

const hasUpdate = computed(() => stackUpdates.value.length > 0);

const tooltip = computed(() => {
    if (!hasUpdate.value) {
        return "";
    }
    return stackUpdates.value
        .map(u => `${u.image}: mise à jour disponible`)
        .join("\n");
});
</script>

<style lang="scss" scoped>

.badge-update {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 7px;
    border-radius: var(--radius-pill);
    font-size: var(--fs-xs);
    font-weight: 600;
    line-height: 1.5;
    white-space: nowrap;
    background: var(--warning-soft);
    color: var(--warning);
    cursor: default;

    svg {
        font-size: 9px;
    }
}

@media (prefers-reduced-motion: no-preference) {
    .badge-update {
        animation: pulse-update 2s ease-in-out infinite;
    }
}

@keyframes pulse-update {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
}
</style>
