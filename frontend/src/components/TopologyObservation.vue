<template>
    <div class="mt-3">
        <h4 class="h6">{{ $t('networkObservation.title') }}</h4>
        <p class="small text-secondary">{{ $t('networkObservation.hint') }}</p>
        <p>{{ $t('networkObservation.host') }}: {{ $t('networkObservation.' + observation.host.state) }}</p>
        <details v-for="field in ['interfaces', 'routes', 'tunnels', 'firewall']" :key="field">
            <summary>{{ $t('networkObservation.' + field) }}</summary>
            <pre class="small observation-data">{{ observation.host[field] === undefined ? $t('networkObservation.unavailable') : JSON.stringify(observation.host[field], null, 2) }}</pre>
        </details>
        <table class="table table-sm mt-3">
            <thead><tr><th>{{ $t('topology.containers') }}</th><th>↓ B/s</th><th>↑ B/s</th><th>{{ $t('networkObservation.history') }}</th></tr></thead>
            <tbody>
                <tr v-for="c in containers" :key="c.id">
                    <td>{{ c.name }}</td><td>{{ rate(c.id, 'rx') }}</td><td>{{ rate(c.id, 'tx') }}</td>
                    <td><details v-if="sample(c.id)?.history.length"><summary>{{ sample(c.id).history.length }}</summary><div v-for="point in sample(c.id).history" :key="point.at" class="small">{{ new Date(point.at).toLocaleTimeString() }} · ↓ {{ Math.round(point.rx) }} · ↑ {{ Math.round(point.tx) }} B/s</div></details></td>
                </tr>
            </tbody>
        </table>
    </div>
</template>
<script>
export default {
    props: { observation: { type: Object,
        required: true },
    containers: { type: Array,
        required: true } },
    methods: {
        sample(id) {
            return this.observation.traffic.find(row => row.id === id);
        },
        rate(id, direction) {
            const sample = this.sample(id);
            return sample?.state === "available" ? Math.round(sample[direction]).toLocaleString() : this.$t("networkObservation." + (sample?.state || "unavailable"));
        },
    },
};
</script>
<style scoped>.observation-data { max-height: 20rem; white-space: pre-wrap; overflow-wrap: anywhere; }</style>
