<template>
    <section class="mb-4">
        <h5>{{ $t("resourceLimits.title") }}</h5>
        <p class="form-text">{{ $t("resourceLimits.help") }}</p>
        <div class="row g-2">
            <label class="col-12 col-sm-6">
                <span class="form-label">{{ $t("resourceLimits.cpu") }}</span>
                <input v-model="cpu" class="form-control form-control-sm" type="text" inputmode="decimal" placeholder="0.5" :disabled="!!structureError" />
            </label>
            <label class="col-12 col-sm-6">
                <span class="form-label">{{ $t("resourceLimits.memory") }}</span>
                <input v-model="memory" class="form-control form-control-sm" type="text" placeholder="512M" :disabled="!!structureError" />
            </label>
        </div>
        <p class="form-text">{{ $t("resourceLimits.existing") }}</p>
        <p class="form-text text-warning">{{ $t("resourceLimits.warning") }}</p>
        <p v-if="error || structureError" role="alert" class="text-danger">{{ $t(`resourceLimits.${error || structureError}`) }}</p>
        <button type="button" class="btn btn-sm btn-primary" :disabled="!!structureError || !changed" @click="apply">{{ $t("resourceLimits.apply") }}</button>
        <p class="form-text mb-0 mt-2">{{ $t("resourceLimits.saveHint") }}</p>
    </section>
</template>

<script>
import { applyResourceLimits, readResourceLimits } from "../service-resource-limits";

export default {
    props: {
        service: { type: Object,
            required: true },
    },
    emits: [ "apply" ],
    data: () => ({ cpu: "",
        memory: "",
        originalCpu: "",
        originalMemory: "",
        error: "",
        structureError: "" }),
    computed: {
        changed() {
            return this.cpu.trim() !== this.originalCpu || this.memory.trim() !== this.originalMemory;
        },
    },
    watch: {
        service: {
            immediate: true,
            deep: true,
            handler() {
                this.error = "";
                this.structureError = "";
                try {
                    const draft = readResourceLimits(this.service);
                    this.cpu = this.originalCpu = draft.cpu;
                    this.memory = this.originalMemory = draft.memory;
                } catch {
                    this.structureError = "invalidStructure";
                }
            },
        },
    },
    methods: {
        apply() {
            this.error = "";
            try {
                this.$emit("apply", applyResourceLimits(this.service, { cpu: this.cpu,
                    memory: this.memory }));
            } catch (error) {
                this.error = error.message;
            }
        },
    },
};
</script>
