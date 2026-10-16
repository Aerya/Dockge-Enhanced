<template>
    <section class="shadow-box stack-resource-history mb-3">
        <div class="resource-history-header">
            <h5 class="mb-0"><font-awesome-icon icon="chart-line" class="me-2" />{{ $t('stackHistory.action') }} <small>{{ $t('stackHistory.stackTotal') }}</small></h5>
            <div class="resource-history-periods" role="group" :aria-label="$t('watcher.monitoring.historyPeriod')">
                <button v-for="option in presets" :key="option.value" type="button" class="btn btn-sm" :class="preset === option.value ? 'btn-primary' : 'btn-normal'" :aria-pressed="preset === option.value" @click="preset = option.value">
                    {{ $t(option.label) }}
                </button>
                <button type="button" class="btn btn-sm btn-normal" :disabled="loading" :title="$t('refresh')" :aria-label="$t('refresh')" @click="load">
                    <font-awesome-icon icon="sync" :spin="loading" />
                </button>
                <button type="button" class="btn btn-sm btn-normal" :title="$t('stackHistory.close')" :aria-label="$t('stackHistory.close')" @click="$emit('close')"><font-awesome-icon icon="times" /></button>
            </div>
        </div>
        <p v-if="!enabled && result?.points.length" class="form-text">{{ $t('stackHistory.paused') }}</p>
        <p v-if="error" class="text-warning mb-0">{{ error }}</p>
        <p v-else-if="!result?.points.length" class="form-text mb-0">
            {{ $t(enabled ? 'stackHistory.empty' : 'stackHistory.enableHint') }}
            <router-link v-if="!enabled && !endpoint" to="/watcher/monitoring">{{ $t('watcher.tab.monitoring') }}</router-link>
        </p>
        <template v-else>
            <div class="resource-history-charts">
                <article v-for="chart in charts" :key="chart.metric" class="resource-history-chart" :class="`resource-history-chart--${chart.metric}`">
                    <div class="resource-chart-heading">
                        <strong>{{ chart.label }}</strong>
                        <span class="resource-chart-value">{{ chart.format(chart.average) }}</span>
                    </div>
                    <div class="resource-chart-summary"><span>{{ $t('watcher.monitoring.historyAverage') }}</span><span>{{ $t('watcher.monitoring.historyMaximum') }} {{ chart.format(chart.max) }}</span></div>
                    <ResourceSparkline :points="result.points" :metric="chart.metric" :from="chartFrom" :to="result.to" :bucket-seconds="result.bucketSeconds" :ceiling="chart.ceiling" :label="chart.label" :format="chart.format" :color="chart.metric === 'memUsed' ? 'var(--success)' : 'var(--primary)'" />
                    <div class="resource-chart-times"><span>{{ ticks[0]?.label }}</span><span>{{ ticks[ticks.length - 1]?.label }}</span></div>
                </article>
            </div>
        </template>
        <details v-if="result?.containers?.length" class="resource-container-section" open>
            <summary>{{ $t('stackHistory.containers') }} <span class="badge bg-secondary">{{ result.containerCount }}</span></summary>
            <div class="resource-container-list">
                <article v-for="container in result.containers" :key="container.id" class="resource-container-row">
                    <div class="resource-container-identity"><strong :title="container.name">{{ container.name }}</strong><small>{{ container.service }} · {{ container.id.slice(0, 12) }}</small></div>
                    <div v-for="chart in charts" :key="chart.metric" class="resource-container-metric" :title="`${$t('watcher.monitoring.historyAverage')}: ${chart.format(chart.metric === 'cpuPercent' ? container.cpuAverage : container.memAverage)} · ${$t('watcher.monitoring.historyMaximum')}: ${chart.format(chart.metric === 'cpuPercent' ? container.cpuMax : container.memMax)}`">
                        <ResourceSparkline :points="container.points" :metric="chart.metric" :from="chartFrom" :to="result.to" :bucket-seconds="result.containerBucketSeconds" :ceiling="Math.max(chart.metric === 'cpuPercent' ? 1 : 1024, (chart.metric === 'cpuPercent' ? container.cpuMax : container.memMax) * 1.1)" :label="`${container.name} · ${chart.label}`" :format="chart.format" :color="chart.metric === 'memUsed' ? 'var(--success)' : 'var(--primary)'" :height="28" />
                        <span :class="chart.metric === 'memUsed' ? 'resource-ram' : 'resource-cpu'"><small>{{ chart.label }}</small> {{ chart.format(chart.metric === 'cpuPercent' ? container.cpuAverage : container.memAverage) }}</span>
                    </div>
                </article>
            </div>
            <p v-if="result.containerCount > result.containers.length" class="form-text mb-0">{{ $t('stackHistory.containerLimit', { shown: result.containers.length, total: result.containerCount }) }}</p>
        </details>
        <div class="resource-history-footnote">
            <span :title="`${$t('stackHistory.metricHelp')} ${$t('stackHistory.recordingHint')}`"><font-awesome-icon icon="info-circle" /> {{ $t('stackHistory.sampleInterval') }}</span>
            <span v-if="result?.points.length && chartFrom !== result.from">{{ $t('stackHistory.availableSince') }} {{ new Date(chartFrom).toLocaleString() }}</span>
            <span v-if="lastSample">{{ $t('stackHistory.lastSample') }} {{ new Date(lastSample).toLocaleString() }}</span>
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onMounted, onUnmounted, ref, watch } from "vue";
import { formatMem } from "../composables/useStackStats";
import { type ResourceHistoryPoint } from "../stack-resource-chart";
import { useI18n } from "vue-i18n";
import ResourceSparkline from "./ResourceSparkline.vue";

defineEmits<{ close: [] }>();

const props = withDefaults(defineProps<{ stackName: string;
    endpoint?: string }>(), { endpoint: "" });
const { t } = useI18n();
const root = getCurrentInstance()?.proxy?.$root as { emitAgent?: (endpoint: string, event: string, ...args: unknown[]) => void } | undefined;
const presets = [
    { value: "24h",
        label: "watcher.monitoring.history24h" },
    { value: "7d",
        label: "watcher.monitoring.history7d" },
    { value: "1m",
        label: "watcher.monitoring.history1m" },
    { value: "1y",
        label: "stackHistory.year" },
    { value: "all",
        label: "stackHistory.all" },
];
interface HistoryResult {
    points: ResourceHistoryPoint[];
    containers: Array<{ id: string;
        name: string;
        service: string;
        lastSampledAt: string;
        cpuAverage: number;
        cpuMax: number;
        memAverage: number;
        memMax: number;
        points: ResourceHistoryPoint[] }>;
    containerCount: number;
    containerBucketSeconds: number;
    stats: { cpuAverage: number;
        cpuMax: number;
        memAverage: number;
        memMax: number;
        lastSampledAt?: string };
    from: string;
    to: string;
    bucketSeconds: number;
}
interface HistoryResponse { ok?: boolean;
    enabled?: boolean;
    data?: HistoryResult }
const result = ref<HistoryResult | null>(null);
const preset = ref("24h");
const enabled = ref(false);
const loading = ref(false);
const error = ref("");
let sequence = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const lastSample = computed(() => result.value?.stats.lastSampledAt ?? result.value?.points.at(-1)?.sampledAt ?? "");
const chartFrom = computed(() => result.value?.points[0]?.sampledAt ?? result.value?.from ?? new Date().toISOString());
const charts = computed(() => {
    const stats = result.value?.stats;
    return [
        { metric: "cpuPercent" as const,
            label: "CPU",
            average: stats?.cpuAverage ?? 0,
            max: stats?.cpuMax ?? 0,
            ceiling: Math.max(1, Math.ceil((stats?.cpuMax ?? 0) * 1.1)),
            format: (value: number) => `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%` },
        { metric: "memUsed" as const,
            label: "RAM",
            average: stats?.memAverage ?? 0,
            max: stats?.memMax ?? 0,
            ceiling: Math.max(1024 ** 2, (stats?.memMax ?? 0) * 1.1),
            format: (value: number) => formatMem(Math.round(value)) },
    ];
});
const ticks = computed(() => {
    if (!result.value) {
        return [];
    }
    const from = Date.parse(chartFrom.value);
    const duration = Date.parse(result.value.to) - from;
    return [ 0, 0.5, 1 ].map(fraction => {
        const timestamp = from + fraction * duration;
        const options: Intl.DateTimeFormatOptions = duration > 2 * 86_400_000
            ? { day: "numeric",
                month: "short",
                ...(duration > 366 * 86_400_000 ? { year: "2-digit" as const } : {}) }
            : { hour: "2-digit",
                minute: "2-digit",
                ...(duration < 600_000 ? { second: "2-digit" as const } : {}) };
        return { timestamp,
            label: new Date(timestamp).toLocaleString(undefined, options),
            anchor: fraction === 0 ? "start" : fraction === 1 ? "end" : "middle" };
    });
});
async function load(): Promise<void> {
    const request = ++sequence;
    loading.value = true;
    error.value = "";
    try {
        let response: HistoryResponse;
        if (props.endpoint) {
            response = await new Promise<HistoryResponse>((resolve, reject) => {
                const timeout = window.setTimeout(() => reject(new Error(t("stackHistory.unavailable"))), 10_000);
                root?.emitAgent?.(props.endpoint, "stackResourceHistoryGet", props.stackName, preset.value, (data: HistoryResponse) => {
                    window.clearTimeout(timeout);
                    resolve(data);
                });
            });
        } else {
            const token = localStorage.getItem("token") ?? sessionStorage.getItem("token") ?? "";
            const query = new URLSearchParams({ stack: props.stackName,
                preset: preset.value });
            const res = await fetch(`/api/monitoring/stack-history?${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {},
                signal: AbortSignal.timeout(15_000) });
            response = await res.json() as HistoryResponse;
        }
        if (request !== sequence) {
            return;
        }
        if (!response.ok || !response.data) {
            throw new Error(t("stackHistory.unavailable"));
        }
        enabled.value = response.enabled === true;
        result.value = response.data;
    } catch {
        if (request === sequence) {
            error.value = t("stackHistory.unavailable");
        }
    } finally {
        if (request === sequence) {
            loading.value = false;
        }
    }
}
watch(() => [ props.stackName, props.endpoint ], () => {
    result.value = null;
    enabled.value = false;
    preset.value = "24h";
    void load();
});
watch(preset, () => void load());
onMounted(() => {
    void load();
    timer = setInterval(() => {
        if (!document.hidden && !loading.value) {
            void load();
        }
    }, 60_000);
});
onUnmounted(() => {
    sequence++;
    clearInterval(timer);
});
</script>

<style scoped lang="scss">
.stack-resource-history { padding: 14px 16px; max-width: 1180px; }
.resource-history-header, .resource-history-periods, .resource-chart-heading, .resource-history-footnote {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
}
.resource-history-header { justify-content: space-between; margin-bottom: 12px; h5 { font-size: 0.95rem; } h5 small { color: var(--text-muted); font-size: 0.78rem; margin-left: 8px; font-weight: 400; } }
.resource-history-periods { gap: 4px; }
.resource-history-charts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.resource-history-chart {
    min-width: 0;
    padding: 10px 12px 6px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md, 8px);
    background: var(--bg-raised);
    --resource-color: var(--primary);
}
.resource-history-chart--memUsed { --resource-color: var(--success); }
.resource-chart-heading { justify-content: space-between; font-size: 0.78rem; color: var(--resource-color); }
.resource-chart-value { color: var(--text-color); font-size: 1.1rem; font-weight: 650; font-variant-numeric: tabular-nums; }
.resource-chart-summary, .resource-chart-times { display: flex; justify-content: space-between; gap: 4px; color: var(--text-muted); font-size: 10px; }
.resource-chart-times { padding-top: 3px; }
.resource-container-section { margin-top: 12px; summary { font-size: 0.78rem; font-weight: 600; padding: 0 0 6px; cursor: pointer; } }
.resource-container-list { max-height: 260px; overflow: auto; }
.resource-container-row { display: grid; grid-template-columns: minmax(160px, 1.2fr) repeat(2, minmax(100px, 1fr)); gap: 16px; align-items: center; border-top: 1px solid var(--border-color); padding: 8px 0; }
.resource-container-identity { min-width: 0; strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.78rem; } small { display: block; color: var(--text-muted); font-size: 10px; } }
.resource-container-metric { min-width: 0; display: flex; align-items: center; gap: 8px; > span { white-space: nowrap; font-size: 0.75rem; font-variant-numeric: tabular-nums; } small { font-size: 10px; color: var(--text-muted); } }
.resource-cpu { color: var(--primary); }
.resource-ram { color: var(--success); }
.resource-history-footnote { justify-content: space-between; padding-top: 10px; color: var(--text-muted); font-size: 10px; }
@media (max-width: 600px) {
    .stack-resource-history { padding: 12px; }
    .resource-history-charts { gap: 8px; }
    .resource-history-chart { padding: 8px; }
    .resource-chart-summary { flex-direction: column; gap: 0; }
    .resource-container-row { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 12px; }
    .resource-container-identity { grid-column: 1 / -1; }
}
</style>
