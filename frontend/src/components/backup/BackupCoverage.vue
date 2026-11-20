<template>
    <section class="shadow-box p-3 mb-4">
        <h5>{{ $t('backupCoverage.title') }}</h5>
        <p class="small text-secondary">{{ $t('backupCoverage.hint') }}</p>
        <button class="btn btn-normal" :disabled="busy" @click="load">{{ $t('backupCoverage.inspect') }}</button>
        <section v-for="entry in entries" :key="entry.endpoint" class="mt-3">
            <h6>{{ $root.endpointDisplayFunction(entry.endpoint) || $t('localInstance') }}</h6>
            <p v-if="!entry.data" class="text-warning">{{ $t('backupCoverage.unknown') }}</p>
            <template v-else>
                <p class="small">{{ entry.data.capturedAt }}</p>
                <p v-if="entry.data.zerobyteState === 'unknown'" class="text-warning">Zerobyte — {{ $t('backupCoverage.unknown') }}</p>
                <p v-for="name in entry.data.unavailable" :key="name" class="text-warning">{{ name }} — {{ $t('backupCoverage.unknown') }}</p>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead><tr><th>Stack</th><th>{{ $t('backupCoverage.resource') }}</th><th>{{ $t('backupCoverage.state') }}</th><th>{{ $t('backupCoverage.evidence') }}</th></tr></thead>
                        <tbody>
                            <tr v-for="row in entry.data.rows" :key="row.stack + row.source">
                                <td>{{ row.stack }}</td><td>{{ row.kind }} · {{ row.resource }}</td>
                                <td :class="row.state === 'protected' ? 'text-success' : 'text-warning'">{{ $t('backupCoverage.' + row.state) }}</td>
                                <td>
                                    <div v-for="(proof, i) in row.proofs" :key="i" class="mb-2">
                                        <strong>{{ proof.destination }}</strong> — {{ $t('backupCoverage.' + proof.state) }}<br>
                                        {{ $t('backupCoverage.configured') }}: {{ proof.configured ? '✓' : '—' }} · {{ $t('backupCoverage.success') }}: {{ proof.lastSuccess || '—' }}<br>
                                        {{ $t('backupCoverage.verification') }}: {{ $t('backupCoverage.' + (proof.verification || 'unknown')) }}
                                        <span v-if="proof.overdue" class="text-warning d-block">{{ $t('backupCoverage.overdue') }}</span>
                                        <span v-if="proof.exclusions" class="text-warning d-block">{{ $t('backupCoverage.exclusions') }}</span>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </template>
        </section>
    </section>
</template>
<script>
export default {
    data: () => ({ entries: [],
        busy: false,
        generation: 0 }),
    watch: { "$root.username"() {
        this.generation++;
        this.entries = [];
        this.busy = false;
    } },
    beforeUnmount() {
        this.generation++;
    },
    methods: {
        async load() {
            if (this.busy || this.$root.userAccess?.role !== "admin") {
                return;
            }
            const generation = ++this.generation;
            this.busy = true;
            this.entries = [];
            const endpoints = [ ...new Set([ "", ...Object.keys(this.$root.agentList || {}) ]) ];
            for (const endpoint of endpoints) {
                const result = await new Promise(resolve => {
                    const timer = setTimeout(() => resolve({ ok: false }), 90000);
                    this.$root.emitAgent(endpoint, "backup:coverage", response => {
                        clearTimeout(timer);
                        resolve(response || { ok: false });
                    });
                });
                if (generation !== this.generation) {
                    return;
                }
                this.entries.push({ endpoint,
                    data: result.ok ? result.data : null });
            }
            this.busy = false;
        },
    },
};
</script>
