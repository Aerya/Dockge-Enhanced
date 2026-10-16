<template>
    <div ref="element" class="resource-sparkline" :style="{ height: `${height}px`, '--spark-color': color }" @pointermove="hover" @pointerleave="active = null">
        <svg viewBox="0 0 800 100" preserveAspectRatio="none" role="img" :aria-label="label">
            <defs><linearGradient :id="gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--spark-color)" stop-opacity="0.2" /><stop offset="100%" stop-color="var(--spark-color)" stop-opacity="0" /></linearGradient></defs>
            <line v-for="gridY in [25, 60, 95]" :key="gridY" x1="0" x2="800" :y1="gridY" :y2="gridY" class="spark-grid" />
            <g v-for="(segment, index) in segments" :key="index">
                <polygon :points="`${coordinates(segment)} ${x(segment[segment.length - 1])},98 ${x(segment[0])},98`" :fill="`url(#${gradient})`" />
                <polyline :points="coordinates(segment)" class="spark-line" />
            </g>
            <line v-if="active" :x1="x(active)" :x2="x(active)" y1="0" y2="100" class="spark-cursor" />
        </svg>
        <span v-if="active || points.length" class="spark-dot" :style="dotStyle(active ?? points[points.length - 1])"></span>
        <span v-if="active" class="spark-tooltip">{{ new Date(active.sampledAt).toLocaleString() }} · {{ format(active[metric]) }}</span>
    </div>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref } from "vue";
import { resourceHistorySegments, type ResourceHistoryPoint } from "../stack-resource-chart";

const props = withDefaults(defineProps<{ points: ResourceHistoryPoint[];
    metric: "cpuPercent" | "memUsed";
    from: string;
    to: string;
    bucketSeconds: number;
    ceiling: number;
    label: string;
    format: (value: number) => string;
    color?: string;
    height?: number }>(), { color: "var(--primary)",
    height: 76 });
const element = ref<HTMLElement | null>(null);
const active = ref<ResourceHistoryPoint | null>(null);
const gradient = `resource-spark-${getCurrentInstance()?.uid}`;
const segments = computed(() => resourceHistorySegments(props.points, props.bucketSeconds));
function x(point: ResourceHistoryPoint): number {
    return 3 + Math.max(0, Math.min(1, (Date.parse(point.sampledAt) - Date.parse(props.from)) / Math.max(1, Date.parse(props.to) - Date.parse(props.from)))) * 794;
}
function y(point: ResourceHistoryPoint): number {
    return 95 - Math.max(0, Math.min(1, point[props.metric] / Math.max(1, props.ceiling))) * 90;
}
function coordinates(points: ResourceHistoryPoint[]): string {
    return points.map(point => `${x(point)},${y(point)}`).join(" ");
}
function dotStyle(point: ResourceHistoryPoint) {
    return { left: `${x(point) / 8}%`,
        top: `${y(point)}%` };
}
function hover(event: PointerEvent): void {
    const rect = element.value?.getBoundingClientRect();
    if (!rect || !props.points.length) {
        return;
    }
    const target = Date.parse(props.from) + (event.clientX - rect.left) / rect.width * (Date.parse(props.to) - Date.parse(props.from));
    active.value = props.points.reduce((best, point) => Math.abs(Date.parse(point.sampledAt) - target) < Math.abs(Date.parse(best.sampledAt) - target) ? point : best);
}
</script>

<style scoped>
.resource-sparkline { position: relative; min-width: 0; width: 100%; }
svg { display: block; width: 100%; height: 100%; overflow: hidden; }
.spark-grid { stroke: var(--border-color); stroke-opacity: 0.4; stroke-width: 1; vector-effect: non-scaling-stroke; }
.spark-line { fill: none; stroke: var(--spark-color); stroke-width: 1.7; vector-effect: non-scaling-stroke; stroke-linejoin: round; stroke-linecap: round; }
.spark-cursor { stroke: var(--text-muted); stroke-width: 1; stroke-dasharray: 3; vector-effect: non-scaling-stroke; }
.spark-dot { position: absolute; width: 5px; height: 5px; border-radius: 50%; background: var(--spark-color); transform: translate(-50%, -50%); pointer-events: none; }
.spark-tooltip { position: absolute; left: 50%; top: 0; transform: translateX(-50%); max-width: 100%; padding: 3px 6px; border-radius: 5px; background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-color); font-size: 10px; white-space: nowrap; pointer-events: none; z-index: 2; }
</style>
