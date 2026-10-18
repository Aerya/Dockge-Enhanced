<template>
    <section v-if="visible && result && (result.conflicts.length || result.drift.length)" class="compose-diagnostics border rounded p-2 mb-2 small" aria-live="polite">
        <div class="d-flex flex-wrap gap-2 align-items-center">
            <strong :title="$t('composeDiagnostics.hint')">{{ $t('composeDiagnostics.title') }}</strong>
            <button class="btn btn-sm btn-normal ms-auto" @click="visible = false">{{ $t('composeDiagnostics.close') }}</button>
        </div>
        <template v-if="result">
            <p v-if="result.warnings.length" class="text-warning">{{ $t('composeDiagnostics.partial') }}: {{ result.warnings.join(', ') }}</p>
            <div v-for="(item, index) in result.conflicts" :key="`port-${index}`" class="border rounded p-2 mb-2">
                <strong>{{ $t('composeDiagnostics.port') }} {{ item.requested.published }}/{{ item.requested.protocol }}</strong>
                · {{ item.requested.service }} ↔ {{ item.occupied.owner }} / {{ item.occupied.service }} ({{ item.occupied.host || '*' }}:{{ item.occupied.published }})
            </div>
            <div v-for="item in result.drift" :key="item.service" class="border rounded p-2 mb-2 text-break">
                <strong>{{ item.service }}</strong>: <code>{{ item.configured }}</code> → <code>{{ item.running.join(', ') }}</code>
                <button v-if="item.running.length === 1 && !external" class="btn btn-sm btn-normal ms-2" @click="$emit('sync', item)">{{ $t('composeDiagnostics.sync') }}</button>
                <span v-else class="small">{{ $t('composeDiagnostics.manualSync') }}</span>
            </div>
        </template>
    </section>
</template>

<script>
export default {
    props: { draft: { type: Object,
        required: true },
    endpoint: { type: String,
        default: "" },
    external: Boolean },
    emits: [ "sync", "busy" ],
    data: () => ({ visible: false,
        busy: false,
        result: null,
        error: false }),
    watch: {
        draft: {
            handler(value, previous) {
                if (JSON.stringify(value) !== JSON.stringify(previous)) {
                    this.result = null;
                }
            } },
    },
    methods: {
        async scan(notify = true) {
            if (this.busy) {
                return null;
            }
            this.visible = false;
            this.busy = true;
            this.$emit("busy", true);
            this.result = null;
            this.error = false;
            const snapshot = JSON.stringify(this.draft);
            try {
                const result = await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error("timeout")), 90000);
                    this.$root.emitAgent(this.endpoint, "inspectComposeDraft", this.draft, response => {
                        clearTimeout(timeout);
                        if (response.ok) {
                            resolve(response.data);
                        } else {
                            reject(new Error("unavailable"));
                        }
                    });
                });
                if (snapshot !== JSON.stringify(this.draft)) {
                    throw new Error("draft changed");
                }
                this.result = result;
                this.visible = result.conflicts.length > 0 || result.drift.length > 0;
                if (notify && !this.visible) {
                    if (result.warnings.length) {
                        this.$root.toastError(`${this.$t("composeDiagnostics.partial")}: ${result.warnings.join(", ")}`);
                    } else {
                        this.$root.toastSuccess(this.$t("composeDiagnostics.clear"));
                    }
                }
                return this.result;
            } catch {
                this.error = true;
                if (notify) {
                    this.$root.toastError(this.$t("composeDiagnostics.unavailable"));
                }
                return null;
            } finally {
                this.busy = false;
                this.$emit("busy", false);
            }
        },
        async confirmSave() {
            const result = await this.scan(false);
            if (!result || result.conflicts.length || result.warnings.length) {
                return window.confirm(this.$t(result ? "composeDiagnostics.confirm" : "composeDiagnostics.confirmUnavailable"));
            }
            return true;
        },
    },
};
</script>
