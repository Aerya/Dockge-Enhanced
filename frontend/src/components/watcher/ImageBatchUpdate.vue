<template>
    <div class="shadow-box big-padding mb-3">
        <h3 class="h6">{{ $t("updates.images.heading") }}</h3>
        <p class="form-text">{{ $t("updates.images.description") }}</p>
        <button class="btn btn-sm btn-primary" :disabled="imageBatch.running || !availableImages" @click="updateAllImages">
            {{ $t("updates.images.start", { count: availableImages }) }}
        </button>
        <p v-if="imageBatch.running" class="form-text mt-2 mb-0">
            {{ $t("updates.images.progress", { completed: imageBatch.completed, total: imageBatch.total, image: imageBatch.current || '…' }) }}
        </p>
        <p v-else-if="imageBatch.error" class="alert alert-danger py-2 mt-2 mb-0">
            {{ $t("updates.images.failed", { completed: imageBatch.completed, total: imageBatch.total, error: imageBatch.error }) }}
        </p>
        <p v-else-if="imageBatch.total && imageBatch.completed === imageBatch.total" class="alert alert-success py-2 mt-2 mb-0">
            {{ $t("updates.images.done", { count: imageBatch.completed }) }}
        </p>
    </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { useI18n } from "vue-i18n/dist/vue-i18n.esm-browser.prod.js";
import { watcherApi } from "./shared";
const { t } = useI18n();
const availableImages = ref(0);
const imageBatch = ref({
    running: false,
    total: 0,
    completed: 0,
    current: null as string | null,
    error: null as string | null,
});

let timer: ReturnType<typeof setInterval> | undefined;
async function load() {
    const result = await watcherApi("GET", "/image/update-all");
    if (result.ok) {
        availableImages.value = result.data.available;
        imageBatch.value = result.data.batch;
    }
}
async function updateAllImages() {
    if (!window.confirm(t("updates.images.confirm", { count: availableImages.value }))) {
        return;
    }
    const result = await watcherApi("POST", "/image/update-all");
    if (result.ok) {
        imageBatch.value = result.data;
        await load();
    } else {
        imageBatch.value = {
            running: false,
            total: 0,
            completed: 0,
            current: null,
            error: result.message || t("updates.images.unknownError"),
        };
    }
}

onMounted(() => {
    void load();
    timer = setInterval(load, 2500);
});
onBeforeUnmount(() => clearInterval(timer));
</script>
