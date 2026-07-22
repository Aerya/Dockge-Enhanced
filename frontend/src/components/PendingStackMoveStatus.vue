<template>
    <div v-if="move" class="alert alert-warning d-flex flex-wrap align-items-center justify-content-between gap-3">
        <div>
            <strong>{{ $t("stackMove.pending") }}</strong>
            <div>{{ $t("stackMove.pendingHint", { target: `${endpointName(move.targetEndpoint)} / ${move.targetName}` }) }}</div>
        </div>
        <div class="d-flex gap-2">
            <button class="btn btn-warning" :disabled="busy" @click="rollback">{{ $t("stackMove.returnSource") }}</button>
            <button class="btn btn-danger" :disabled="busy" @click="finalize">{{ $t("stackMove.finalize") }}</button>
        </div>
        <div v-if="error" class="alert alert-danger w-100 mb-0">{{ error }}</div>
    </div>
</template>

<script>
export default {
    props: { sourceEndpoint: { type: String,
        default: "" },
    sourceStackName: { type: String,
        required: true } },
    data() {
        return { move: null,
            busy: false,
            error: "" };
    },
    mounted() {
        this.load();
    },
    methods: {
        load() {
            this.$root.getSocket().emit("listPendingStackMoves", this.sourceEndpoint, this.sourceStackName, response => {
                if (response?.ok) {
                    this.move = response.data[0] || null;
                }
            });
        },
        endpointName(endpoint) {
            return this.$root.endpointDisplayFunction(endpoint);
        },
        complete(status) {
            return new Promise((resolve, reject) => this.$root.getSocket().emit("completePendingStackMove", this.move.id, status, response => response?.ok ? resolve(response) : reject(new Error(this.$t(response?.msg || "Error")))));
        },
        emitAgent(endpoint, event, ...args) {
            return new Promise(resolve => this.$root.emitAgent(endpoint, event, ...args, resolve));
        },
        async rollback() {
            if (!confirm(this.$t("stackMove.returnConfirm"))) {
                return;
            }
            this.busy = true;
            this.error = "";
            try {
                const stopped = await this.emitAgent(this.move.targetEndpoint, "deleteStack", this.move.targetName, { removeFiles: false,
                    force: false });
                if (!stopped.ok) {
                    throw new Error(this.$t(stopped.msg));
                }
                const restored = await this.emitAgent(this.sourceEndpoint, "restoreStackTransferSource", this.sourceStackName, this.move.runningServices);
                if (!restored.ok) {
                    throw new Error(this.$t(restored.msg));
                }
                await this.complete("rolled-back");
                this.move = null;
            } catch (error) {
                this.error = error instanceof Error ? error.message : String(error);
            } finally {
                this.busy = false;
            }
        },
        async finalize() {
            if (!confirm(this.$t("stackMove.finalizeConfirm"))) {
                return;
            }
            this.busy = true;
            this.error = "";
            try {
                const deleted = await this.emitAgent(this.sourceEndpoint, "deleteStack", this.sourceStackName, { removeFiles: true,
                    force: false });
                if (!deleted.ok) {
                    throw new Error(this.$t(deleted.msg));
                }
                await this.complete("finalized");
                this.$router.push("/");
            } catch (error) {
                this.error = error instanceof Error ? error.message : String(error);
            } finally {
                this.busy = false;
            }
        },
    },
};
</script>
