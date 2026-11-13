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
                <dt>{{ $t("imageVersionPreview.sameMajor") }}</dt><dd>{{ result.sameMajor || "—" }}</dd>
                <dt>{{ $t("imageVersionPreview.nextMajor") }}</dt><dd>{{ result.nextMajor || "—" }}</dd>
            </dl>
            <p v-if="result.partial" class="text-warning small mb-2">{{ $t("imageVersionPreview.partial") }}</p>
            <button class="btn btn-sm btn-outline-secondary" @click="result = null">{{ $t("Close") }}</button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { watcherApi } from "./shared";
const props = defineProps<{ image: string;
    stack: string }>();
const loading = ref(false);
const error = ref(false);
const result = ref<{ configuredTag: string;
    localDigest: string;
    targetDigest: string;
    platform: string;
    sameMajor: string | null;
    nextMajor: string | null;
    partial: boolean } | null>(null);
async function load() {
    loading.value = true;
    error.value = false;
    result.value = null;
    try {
        const response = await watcherApi("POST", "/image/version-preview", { image: props.image,
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
