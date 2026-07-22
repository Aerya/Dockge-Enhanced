<template>
    <section class="shadow-box big-padding mb-3" aria-live="polite">
        <div class="storage-heading">
            <div>
                <h4 class="mb-1"><font-awesome-icon icon="hard-drive" class="me-2" />{{ $t("stackStorage.heading") }}</h4>
                <p class="form-text mb-0">{{ $t("stackStorage.hint") }}</p>
            </div>
            <div class="d-flex gap-2">
                <button class="btn btn-sm btn-normal" :disabled="loading" @click="load">
                    <span v-if="loading" class="spinner-border spinner-border-sm me-1" />
                    <font-awesome-icon v-else icon="rotate" class="me-1" />{{ $t("stackStorage.refresh") }}
                </button>
                <button v-if="$root.agentCount > 1" class="btn btn-sm btn-primary" @click="$emit('transfer')">
                    <font-awesome-icon icon="copy" class="me-1" />{{ $t("stackStorage.transfer") }}
                </button>
            </div>
        </div>

        <div v-if="error" class="alert alert-danger mt-3 mb-0">{{ error }}</div>
        <div v-else-if="!loading" class="table-responsive mt-3">
            <table class="table align-middle mb-0">
                <thead>
                    <tr>
                        <th>{{ $t("stackTransfer.service") }}</th>
                        <th>{{ $t("stackTransfer.type") }}</th>
                        <th>{{ $t("stackTransfer.source") }}</th>
                        <th>{{ $t("stackTransfer.target") }}</th>
                        <th>{{ $t("stackTransfer.size") }}</th>
                        <th>{{ $t("stackStorage.state") }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="mount in mounts" :key="mount.id">
                        <td><strong>{{ mount.service }}</strong></td>
                        <td><span class="badge bg-secondary">{{ mount.type }}</span></td>
                        <td class="text-break"><code>{{ mount.source || "—" }}</code><small v-if="mount.resolvedSource && mount.resolvedSource !== mount.source" class="d-block text-muted">{{ mount.resolvedSource }}</small></td>
                        <td><code>{{ mount.target }}</code></td>
                        <td>{{ formatBytes(mount.size) }}</td>
                        <td><span class="badge" :class="mount.resolvedSource ? 'bg-success' : 'bg-warning text-dark'">{{ $t(mount.resolvedSource ? "stackStorage.available" : "stackStorage.declared") }}</span></td>
                    </tr>
                    <tr v-if="mounts.length === 0"><td colspan="6" class="text-center text-muted">{{ $t("stackTransfer.noMounts") }}</td></tr>
                </tbody>
                <tfoot v-if="mounts.length"><tr><th colspan="4">{{ $t("stackStorage.total") }}</th><th>{{ formatBytes(totalBytes) }}</th><th>{{ mounts.length }}</th></tr></tfoot>
            </table>
        </div>
        <div v-if="warnings.length" class="alert alert-warning mt-3 mb-0">{{ warnings.join(" · ") }}</div>
    </section>
</template>

<script>
export default {
    props: {
        stackName: { type: String,
            required: true },
        endpoint: { type: String,
            default: "" },
    },
    emits: [ "transfer" ],
    data() {
        return { loading: false,
            mounts: [],
            warnings: [],
            error: "" };
    },
    computed: {
        totalBytes() {
            return this.mounts.reduce((total, mount) => total + (Number(mount.size) || 0), 0);
        },
    },
    mounted() {
        this.load();
    },
    methods: {
        load() {
            this.loading = true;
            this.error = "";
            this.$root.emitAgent(this.endpoint, "analyzeStackTransfer", this.stackName, this.endpoint, response => {
                this.loading = false;
                if (!response?.ok) {
                    this.error = this.$t(response?.msg || "Error");
                    return;
                }
                this.mounts = response.data.mounts || [];
                this.warnings = response.data.warnings || [];
            });
        },
        formatBytes(value) {
            if (value === null || value === undefined) {
                return "—";
            }
            const units = [ "B", "KB", "MB", "GB", "TB" ];
            let size = Number(value);
            let unit = 0;
            while (size >= 1024 && unit < units.length - 1) {
                size /= 1024;
                unit++;
            }
            return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
        },
    },
};
</script>

<style scoped>
.storage-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
</style>
