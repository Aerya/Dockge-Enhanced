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
        <div class="alert alert-warning mt-3" role="alert">
            <strong>{{ $t("resourceLimits.warningTitle") }}</strong>
            <p class="mb-0 mt-1">{{ $t("resourceLimits.warning") }}</p>
            <label v-if="memoryRequiresAcknowledgement" class="d-flex gap-2 align-items-start mt-2">
                <input v-model="memoryAcknowledged" type="checkbox" class="form-check-input flex-shrink-0" />
                <span>{{ $t("resourceLimits.acknowledge") }}</span>
            </label>
        </div>
        <p v-if="error || structureError" role="alert" class="text-danger">{{ $t(`resourceLimits.${error || structureError}`) }}</p>
        <button type="button" class="btn btn-sm btn-primary" :disabled="!!structureError || !changed || (memoryRequiresAcknowledgement && !memoryAcknowledged)" @click="apply">{{ $t("resourceLimits.apply") }}</button>
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
        memoryAcknowledged: false,
        error: "",
        structureError: "" }),
    computed: {
        memoryRequiresAcknowledgement() {
            return this.memory.trim() !== "" && this.memory.trim() !== this.originalMemory;
        },
        changed() {
            return this.cpu.trim() !== this.originalCpu || this.memory.trim() !== this.originalMemory;
        },
    },
    watch: {
        cpu() {
            this.error = "";
        },
        memory() {
            this.memoryAcknowledged = false;
            this.error = "";
        },
        service: {
            immediate: true,
            deep: true,
            handler() {
                this.error = "";
                this.memoryAcknowledged = false;
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
                const updated = applyResourceLimits(this.service, { cpu: this.cpu,
                    memory: this.memory });
                if (this.memory.trim() && this.memory.trim() !== this.originalMemory && !this.memoryAcknowledged) {
                    this.error = "acknowledge";
                    return;
                }
                this.$emit("apply", updated);
            } catch (error) {
                this.error = error.message;
            }
        },
    },
};
</script>
