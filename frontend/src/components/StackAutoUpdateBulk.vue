<template>
    <section class="shadow-box big-padding mb-3 compose-tight" aria-labelledby="stack-image-policy-title">
        <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
            <h4 id="stack-image-policy-title" class="mb-0">{{ $t("stackBulk.title") }}</h4>
            <button class="btn btn-sm btn-normal" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
                {{ $t(expanded ? "stackBulk.close" : "stackBulk.open") }}
            </button>
        </div>
        <p v-if="expanded" class="form-text">{{ $t("stackBulk.intro") }}</p>
        <div v-if="expanded">
            <label for="bulk-update-mode" class="form-label">{{ $t("stackBulk.mode") }}</label>
            <select id="bulk-update-mode" v-model="mode" class="form-select mb-2" :disabled="loading" @change="clearPreview">
                <option value="off">{{ $t("stackBulk.off") }}</option>
                <option value="immediate">{{ $t("stackBulk.immediate") }}</option>
                <option value="scheduled">{{ $t("stackBulk.scheduled") }}</option>
            </select>
            <div v-if="mode === 'scheduled'" class="mb-2">
                <label for="bulk-update-time" class="form-label">{{ $t("stackBulk.time") }}</label>
                <input id="bulk-update-time" v-model="time" type="time" class="form-control" :disabled="loading" @input="clearPreview" />
            </div>
            <fieldset class="mb-3" :disabled="loading">
                <legend class="form-label">{{ $t("stackBulk.existing") }}</legend>
                <div class="form-check mb-2">
                    <input id="bulk-preserve" v-model="preserveExisting" class="form-check-input" type="radio" :value="true" @change="clearPreview" />
                    <label class="form-check-label" for="bulk-preserve">{{ $t("stackBulk.preserve") }}</label>
                </div>
                <div class="form-check">
                    <input id="bulk-replace" v-model="preserveExisting" class="form-check-input" type="radio" :value="false" @change="clearPreview" />
                    <label class="form-check-label" for="bulk-replace">{{ $t("stackBulk.replace") }}</label>
                </div>
            </fieldset>
            <p class="form-text">{{ $t("stackBulk.excludedHint") }}</p>
            <p v-if="error" class="text-danger" role="alert">{{ error }}</p>
            <button class="btn btn-normal" type="button" :disabled="loading" @click="previewChanges">
                {{ loading ? $t("stackBulk.loading") : $t("stackBulk.preview") }}
            </button>
            <div v-if="preview" class="mt-3" aria-live="polite">
                <h5>{{ $t("stackBulk.summary") }}</h5>
                <p>{{ $t("stackBulk.counts", { eligible: preview.eligible, changed: preview.changed, preserved: preview.preserved, excluded: preview.excludedServices }) }}</p>
                <ul v-if="preview.changes.length" class="small">
                    <li v-for="change in preview.changes" :key="change.key">
                        <code>{{ change.image }}</code> — {{ change.before }} → {{ change.after }}
                    </li>
                </ul>
                <p v-if="!preview.changed" class="form-text">{{ $t("stackBulk.noChanges") }}</p>
                <button v-else class="btn btn-primary" type="button" :disabled="loading" @click="applyChanges">
                    {{ $t("stackBulk.apply") }}
                </button>
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
import { getCurrentInstance, ref } from "vue";
import { useI18n } from "vue-i18n/dist/vue-i18n.esm-browser.prod.js";

const props = defineProps<{ stackName: string;
    endpoint: string }>();
const emit = defineEmits<{ applied: [] }>();
const { t } = useI18n();
const ownerRoot = (getCurrentInstance()?.proxy as unknown as { $root?: { emitAgent: (endpoint: string, event: string, payload: unknown, callback: (result: { ok?: boolean;
    data?: Preview;
    msg?: string;
    message?: string }) => void) => void } })?.$root;
const expanded = ref(false);
const mode = ref<"off" | "immediate" | "scheduled">("scheduled");
const time = ref("02:00");
const preserveExisting = ref(true);
const loading = ref(false);
const error = ref("");

type Preview = {
    previewToken: string;
    eligible: number;
    changed: number;
    preserved: number;
    excludedServices: number;
    changes: { key: string;
        image: string;
        before: string;
        after: string }[];
};
const preview = ref<Preview | null>(null);

function clearPreview() {
    preview.value = null;
    error.value = "";
}

function authHeaders() {
    const token = localStorage.getItem("token") ?? sessionStorage.getItem("token") ?? "";
    return { "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function request(path: "preview" | "apply", body: Record<string, unknown>): Promise<Preview> {
    if (props.endpoint) {
        return await new Promise<Preview>((resolve, reject) => {
            if (!ownerRoot) {
                reject(new Error(t("stackBulk.failed")));
                return;
            }
            const event = path === "preview" ? "watcherImageAutoUpdateBulkPreview" : "watcherImageAutoUpdateBulkApply";
            ownerRoot.emitAgent(props.endpoint, event, body, (result: { ok?: boolean;
                data?: Preview;
                msg?: string;
                message?: string }) => {
                if (result?.ok && result.data) {
                    resolve(result.data);
                } else {
                    reject(new Error(result?.msg ?? result?.message ?? t("stackBulk.failed")));
                }
            });
        });
    }
    const response = await fetch(`/api/watcher/image/auto-update-bulk/${path}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
        throw new Error(result.message ?? t("stackBulk.failed"));
    }
    return result.data as Preview;
}

async function previewChanges() {
    loading.value = true;
    clearPreview();
    try {
        preview.value = await request("preview", { stack: props.stackName,
            mode: mode.value,
            time: time.value,
            preserveExisting: preserveExisting.value });
    } catch (reason) {
        error.value = reason instanceof Error ? reason.message : String(reason);
    } finally {
        loading.value = false;
    }
}

async function applyChanges() {
    const current = preview.value;
    if (!current) {
        return;
    }
    loading.value = true;
    error.value = "";
    try {
        await request("apply", { stack: props.stackName,
            mode: mode.value,
            time: time.value,
            preserveExisting: preserveExisting.value,
            previewToken: current.previewToken });
        clearPreview();
        expanded.value = false;
        emit("applied");
    } catch (reason) {
        error.value = reason instanceof Error ? reason.message : String(reason);
        preview.value = null;
    } finally {
        loading.value = false;
    }
}
</script>
