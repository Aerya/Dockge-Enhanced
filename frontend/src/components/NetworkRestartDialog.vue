<template>
    <BModal :model-value="true" :title="$t('networkRestart.title')" no-footer @update:model-value="$emit('close')">
        <p>{{ $t("networkRestart.explanation") }}</p>
        <p class="alert alert-warning">{{ $t("networkRestart.warning") }}</p>
        <p v-if="message" role="status">{{ message }}</p>
        <ol v-if="plan">
            <li v-for="row in plan.containers" :key="row.id">
                <strong>{{ row.stack }} / {{ row.service }}</strong> — {{ row.name }}
                <span v-if="!row.health"> · {{ $t("networkRestart.noHealth") }}</span>
            </li>
        </ol>
        <div class="d-flex gap-2">
            <button class="btn btn-normal" :disabled="busy" @click="preview">{{ $t("refresh") }}</button>
            <button class="btn btn-warning" :disabled="busy || !plan" @click="execute">{{ $t("networkRestart.confirm") }}</button>
        </div>
    </BModal>
</template>
<script>
import { BModal } from "bootstrap-vue-next";
export default {
    components: { BModal },
    props: { endpoint: { type: String,
        default: "" },
    stackName: { type: String,
        required: true } },
    emits: [ "close", "completed" ],
    data: () => ({ plan: null,
        busy: false,
        message: "",
        timer: null,
        generation: 0 }),
    mounted() {
        this.preview();
    },
    beforeUnmount() {
        this.generation++;
        clearTimeout(this.timer);
    },
    methods: {
        request(event, args, timeout, done) {
            const generation = ++this.generation;
            clearTimeout(this.timer);
            this.busy = true;
            this.message = this.$t("networkRestart.working");
            this.timer = setTimeout(() => {
                if (this.generation !== generation) {
                    return;
                }
                this.generation++;
                this.busy = false;
                this.plan = null;
                this.message = this.$t("networkRestart.unknown");
            }, timeout);
            this.$root.emitAgent(this.endpoint, event, this.stackName, ...args, result => {
                if (this.generation !== generation) {
                    return;
                }
                clearTimeout(this.timer);
                this.busy = false;
                this.message = result.ok ? "" : this.$t(result.msg || "networkRestart.failed");
                if (result.ok) {
                    done(result);
                }
            });
        },
        preview() {
            this.plan = null;
            this.request("networkRestartPreview", [], 60000, result => {
                this.plan = result;
            });
        },
        execute() {
            const token = this.plan.token;
            this.plan = null;
            this.request("networkRestartExecute", [ token ], 420000, () => {
                this.message = this.$t("Restarted");
                this.$emit("completed");
            });
        },
    },
};
</script>
