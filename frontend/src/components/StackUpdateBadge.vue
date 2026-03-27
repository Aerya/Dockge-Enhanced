<template>
    <span v-if="hasUpdate" class="badge-update ms-2" :title="tooltip">
        <font-awesome-icon icon="arrow-circle-up" class="me-1" />MàJ
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
    if (!hasUpdate.value) return "";
    return stackUpdates.value
        .map(u => `${u.image}: mise à jour disponible`)
        .join("\n");
});
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.badge-update {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px 8px;
    border-radius: 50rem;
    font-size: 10px;
    font-weight: 600;
    line-height: 1;
    background: rgba(248, 163, 6, 0.15);
    color: $warning;
    border: 1px solid rgba(248, 163, 6, 0.3);
    cursor: default;
    vertical-align: middle;
    animation: pulse-update 2s ease-in-out infinite;
}

@keyframes pulse-update {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
}
</style>
