<template>
    <div class="mt-2">
        <button class="btn btn-sm btn-outline-secondary" :disabled="loading" @click="load">
            {{ $t("imageVersionPreview.open") }}
            <span v-if="loading" class="spinner-border spinner-border-sm ms-1" />
        </button>
        <div v-if="error" class="text-warning mt-2" role="alert">{{ $t("imageVersionPreview.error") }}</div>
        <div v-if="result" class="border rounded p-2 mt-2 text-break">
            <p class="small mb-2">{{ $t("imageVersionPreview.warning") }}</p>
            <dl class="small mb-2">
                <dt>{{ $t("imageVersionPreview.current") }}</dt><dd><code>{{ result.localDigest || "—" }}</code></dd>
                <dt>{{ $t("imageVersionPreview.target") }} ({{ result.configuredTag }}, {{ result.platform }})</dt>
                <dd><code>{{ result.targetDigest }}</code></dd>
                <dt>{{ $t("imageVersionPreview.aliases") }}</dt><dd>{{ result.targetAliases.join(", ") || $t("imageVersionPreview.unknown") }}</dd>
                <dt>{{ $t("imageVersionPreview.sameMajor") }}</dt><dd>{{ result.sameMajor || "—" }}</dd>
                <dt>{{ $t("imageVersionPreview.nextMajor") }}</dt><dd>{{ result.nextMajor || "—" }}</dd>
            </dl>
            <p v-if="result.partial || result.unavailableCandidate" class="text-warning small mb-2">{{ $t("imageVersionPreview.partial") }}</p>
            <button class="btn btn-sm btn-outline-secondary" @click="result = null">{{ $t("close") }}</button>
            <ImageCveComparison :image="image" :stack="stack" :endpoint="endpoint" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, getCurrentInstance } from "vue";
import { watcherApi } from "./shared";
import ImageCveComparison from "./ImageCveComparison.vue";
const props = defineProps<{ image: string;
    stack: string;
    endpoint?: string }>();
const root = getCurrentInstance()?.proxy?.$root as { emitAgent?: (endpoint: string, event: string, ...args: unknown[]) => void } | undefined;
const loading = ref(false);
const error = ref(false);
const result = ref<{ configuredTag: string;
    localDigest: string;
    targetDigest: string;
    targetAliases: string[];
    platform: string;
    sameMajor: string | null;
    nextMajor: string | null;
    partial: boolean;
    unavailableCandidate: boolean } | null>(null);
async function load() {
    loading.value = true;
    error.value = false;
    result.value = null;
    try {
        const response = props.endpoint !== undefined ? await new Promise<{ ok: boolean;
            data: typeof result.value }>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("Agent unavailable")), 180000);
            root?.emitAgent?.(props.endpoint ?? "", "imageVersionPreview", props.stack, props.image, (reply: { ok: boolean;
                data: typeof result.value }) => {
                clearTimeout(timer);
                resolve(reply);
            });
        }) : await watcherApi("POST", "/image/version-preview", { image: props.image,
            stack: props.stack });
        if (!response.ok) {
            throw new Error("Preview unavailable");
        }
        result.value = response.data;
    } catch {
        error.value = true;
    } finally {
        loading.value = false;
    }
}
</script>
