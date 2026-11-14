<template>
    <div class="border-top mt-2 pt-2">
        <label class="d-flex align-items-start gap-2 small mb-2">
            <input v-model="confirmed" type="checkbox" :disabled="busy">
            <span>{{ $t("imageCve.confirm") }}</span>
        </label>
        <button class="btn btn-sm btn-outline-primary" :disabled="busy || !confirmed" @click="start">{{ $t("imageCve.open") }}</button>
        <p v-if="busy" class="small mt-2" role="status">{{ $t("imageCve.phase." + (job?.phase || 'preparing')) }}</p>
        <p v-if="error" class="text-warning small mt-2" role="alert">{{ $t("imageCve.error") }}</p>
        <div v-if="job?.phase === 'complete' && job.result" class="mt-2">
            <p class="small text-break">{{ $t("imageCve.images") }}<br><code>{{ job.currentDigest }}</code> → <code>{{ job.targetDigest }}</code> ({{ job.platform }})</p>
            <p class="small">{{ $t("imageCve.warning") }}</p>
            <div class="table-responsive">
                <table class="table table-sm small comparison-summary">
                    <thead><tr><th>{{ $t("imageCve.severity") }}</th><th>{{ $t("imageCve.current") }}</th><th>{{ $t("imageCve.target") }}</th></tr></thead>
                    <tbody>
                        <tr v-for="severity in severities" :key="severity">
                            <th>{{ severity }}</th><td>{{ severityCount(severity, false) }}</td><td>{{ severityCount(severity, true) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <details v-for="kind in kinds" :key="kind" class="mb-2">
                <summary>{{ $t("imageCve." + kind) }} : {{ rows(kind).length }}</summary>
                <div class="comparison-findings small">
                    <p v-for="(finding, index) in rows(kind)" :key="index" class="mb-1 text-break">
                        <strong>{{ finding.vulnerabilityId }}</strong> · {{ finding.severity }} · {{ finding.packageName }} {{ finding.installedVersion }} · {{ finding.target }}
                    </p>
                </div>
            </details>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, getCurrentInstance, onUnmounted } from "vue";
import { watcherApi } from "./shared";
import type { ComparisonJob } from "../../../../backend/watchers/trivy-comparison-runner";
const props = defineProps<{ image: string;
    stack: string;
    endpoint?: string }>();
const root = getCurrentInstance()?.proxy?.$root as { emitAgent?: (endpoint: string, event: string, ...args: unknown[]) => void } | undefined;
const confirmed = ref(false);
const error = ref(false);
const job = ref<ComparisonJob | null>(null);
const starting = ref(false);
const busy = computed(() => starting.value || Boolean(job.value && ![ "complete", "error" ].includes(job.value.phase)));
const kinds = [ "noLongerDetected", "newlyDetected", "persistent" ] as const;
const severities = [ "CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN" ];
function severityCount(severity: string, target: boolean) {
    const result = job.value?.result;
    if (!result) {
        return 0;
    }
    const findings = target
        ? [ ...result.newlyDetected, ...result.persistent.map(item => item.after) ]
        : [ ...result.noLongerDetected, ...result.persistent.map(item => item.before) ];
    return findings.filter(item => item.severity === severity).length;
}
let timer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
onUnmounted(() => {
    disposed = true;
    clearTimeout(timer);
});
function rows(kind: typeof kinds[number]) {
    if (!job.value?.result) {
        return [];
    }
    return kind === "persistent" ? job.value.result.persistent.map(item => item.after) : job.value.result[kind];
}
async function request(id?: string): Promise<{ ok: boolean;
    data?: ComparisonJob }> {
    const payload = id ? { id } : { stack: props.stack,
        image: props.image,
        confirmed: confirmed.value };
    if (props.endpoint !== undefined) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Agent unavailable")), 15000);
            root?.emitAgent?.(props.endpoint ?? "", "imageCveComparison", payload, (response: { ok: boolean;
                data?: ComparisonJob }) => {
                clearTimeout(timeout);
                resolve(response);
            });
        });
    }
    return id ? watcherApi("GET", "/image/cve-comparison/" + encodeURIComponent(id)) : watcherApi("POST", "/image/cve-comparison", payload);
}
async function poll() {
    if (disposed || !job.value) {
        return;
    }
    try {
        const response = await request(job.value.id);
        if (!response.ok || !response.data) {
            throw new Error("Comparison unavailable");
        }
        job.value = response.data;
        error.value = job.value.phase === "error";
        if (busy.value && !disposed) {
            timer = setTimeout(poll, 2000);
        }
    } catch {
        error.value = true;
        job.value = null;
    }
}
async function start() {
    starting.value = true;
    error.value = false;
    job.value = null;
    try {
        const response = await request();
        if (!response.ok || !response.data) {
            throw new Error("Comparison unavailable");
        }
        job.value = response.data;
        timer = setTimeout(poll, 1000);
    } catch {
        error.value = true;
    } finally {
        starting.value = false;
    }
}
</script>

<style scoped>
.comparison-findings { max-height: 18rem; overflow-y: auto; }
.comparison-summary {
    --bs-table-bg: transparent;
    --bs-table-color: inherit;
    color: inherit;
}
.comparison-summary :is(th, td) {
    color: inherit;
    background: transparent;
    border-color: rgba(128, 128, 128, 0.35);
}
</style>
