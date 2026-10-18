<template>
    <section v-if="visible" class="card p-3 mb-3" aria-live="polite">
        <div class="d-flex flex-wrap gap-2 align-items-center">
            <h5 class="mb-0">{{ $t('composeDiagnostics.title') }}</h5>
            <button class="btn btn-sm btn-normal" :disabled="busy" @click="scan">{{ $t('composeDiagnostics.scan') }}</button>
            <button class="btn btn-sm btn-normal ms-auto" @click="visible = false">{{ $t('composeDiagnostics.close') }}</button>
        </div>
        <p class="small mt-2">{{ $t('composeDiagnostics.hint') }}</p>
        <p v-if="busy">{{ $t('composeDiagnostics.loading') }}</p>
        <p v-if="error" class="text-warning">{{ $t('composeDiagnostics.unavailable') }}</p>
        <template v-if="result">
            <p v-if="result.warnings.length" class="text-warning">{{ $t('composeDiagnostics.partial') }}: {{ result.warnings.join(', ') }}</p>
            <p v-if="!result.conflicts.length && !result.drift.length && !result.warnings.length">{{ $t('composeDiagnostics.clear') }}</p>
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
    emits: [ "sync" ],
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
        async scan() {
            if (this.busy) {
                return null;
            }
            this.visible = true;
            this.busy = true;
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
                return this.result;
            } catch {
                this.error = true;
                return null;
            } finally {
                this.busy = false;
            }
        },
        async confirmSave() {
            const result = await this.scan();
            if (!result || result.conflicts.length || result.warnings.length) {
                return window.confirm(this.$t(result ? "composeDiagnostics.confirm" : "composeDiagnostics.confirmUnavailable"));
            }
            return true;
        },
    },
};
</script>
