<template>
    <section class="shadow-box p-3 my-3">
        <h4>{{ $t(diagnostics ? 'configTools.diagnostics' : 'configTools.title') }}</h4>
        <p class="small">{{ $t(diagnostics ? 'configTools.diagnosticsHint' : 'configTools.historyHint') }}</p>
        <div class="d-flex flex-wrap gap-2">
            <button class="btn btn-sm btn-normal" :disabled="busy" @click="load">{{ $t('refresh') }}</button>
            <button v-if="!diagnostics" class="btn btn-sm btn-normal" :disabled="busy" @click="merged">{{ $t('configTools.merged') }}</button>
        </div>
        <div v-if="pending" class="alert alert-warning mt-3" role="alert">
            <p>{{ $t(pending.action === 'merged' ? 'configTools.secrets' : 'configTools.confirmRestore') }}</p>
            <button type="button" class="btn btn-sm btn-primary me-2" :disabled="busy" @click="confirmAction">{{ $t('Confirm') }}</button>
            <button type="button" class="btn btn-sm btn-secondary" :disabled="busy" @click="pending = null">{{ $t('cancel') }}</button>
        </div>
        <p v-if="error" class="text-danger mt-2" role="alert">{{ $t(error) }}</p>
        <p v-if="success" class="text-success mt-2" role="status">{{ $t('configTools.restored') }}</p>
        <p v-if="busy" class="mt-2" aria-live="polite">{{ $t('loading') }}</p>
        <p v-else-if="!items.length && !error" class="mt-2">{{ $t('configTools.empty') }}</p>
        <ul class="list-unstyled mt-2">
            <li v-for="item in items" :key="item.id || item.key" class="border-bottom py-2 d-flex flex-wrap gap-2 align-items-center">
                <template v-if="diagnostics">
                    <span :class="item.ok ? 'text-success' : 'text-danger'">{{ item.ok ? '✓' : '✗' }}</span>
                    <strong>{{ $te(item.key) ? $t(item.key) : item.key }}</strong>
                    <span>{{ $te(item.detail) ? $t(item.detail) : item.detail }}</span>
                </template>
                <template v-else>
                    <time>{{ new Date(item.date).toLocaleString() }}</time>
                    <span>{{ $t('configTools.reason.' + item.reason) }}</span>
                    <button class="btn btn-sm btn-normal ms-auto" :disabled="busy" @click="restore(item.id)">{{ $t('configTools.restore') }}</button>
                </template>
            </li>
        </ul>
        <template v-if="config !== null">
            <p class="text-warning small">{{ $t('configTools.secrets') }}</p>
            <button class="btn btn-sm btn-normal" @click="config = null">{{ $t('composeDiagnostics.close') }}</button>
            <pre class="configuration-output border rounded p-2 mt-2">{{ config }}</pre>
        </template>
    </section>
</template>

<script>
export default {
    props: { stackName: { type: String,
        default: "" },
    endpoint: { type: String,
        default: "" },
    diagnostics: Boolean },
    emits: [ "restored" ],
    data: () => ({ items: [],
        config: null,
        busy: false,
        error: "",
        success: false,
        pending: null,
        generation: 0 }),
    watch: {
        stackName() {
            this.load();
        },
        endpoint() {
            this.load();
        },
    },
    mounted() {
        this.load();
    },
    beforeUnmount() {
        this.generation++;
    },
    methods: {
        async request(action, extra = {}) {
            this.busy = true;
            this.error = "";
            const generation = ++this.generation;
            try {
                const data = await new Promise((resolve, reject) => {
                    const timer = setTimeout(() => reject(new Error("configTools.unavailable")), 30000);
                    this.$root.emitAgent(this.endpoint, "configurationTools", { action,
                        stack: this.stackName,
                        ...extra }, response => {
                        clearTimeout(timer);
                        if (response.ok) {
                            resolve(response.data);
                        } else {
                            reject(new Error(response.msg || "configTools.unavailable"));
                        }
                    });
                });
                return generation === this.generation ? data : undefined;
            } catch (error) {
                if (generation === this.generation) {
                    this.error = error.message;
                }
            } finally {
                if (generation === this.generation) {
                    this.busy = false;
                }
            }
        },
        async load() {
            this.pending = null;
            this.config = null;
            this.items = [];
            const data = await this.request(this.diagnostics ? "diagnostics" : "history");
            if (data) {
                this.items = data;
            }
        },
        merged() {
            this.pending = { action: "merged" };
        },
        restore(id) {
            this.pending = { action: "restore",
                id };
        },
        async confirmAction() {
            const pending = this.pending;
            if (!pending || this.busy) {
                return;
            }
            this.pending = null;
            this.success = false;
            const data = await this.request(pending.action, { id: pending.id,
                confirmed: true });
            if (pending.action === "merged" && typeof data === "string") {
                this.config = data;
            } else if (pending.action === "restore" && data === true) {
                this.success = true;
                this.$emit("restored");
                await this.load();
            }
        },
    },
};
</script>

<style scoped>
.configuration-output { max-height: 28rem; overflow: auto; font-size: .8rem; }
</style>
