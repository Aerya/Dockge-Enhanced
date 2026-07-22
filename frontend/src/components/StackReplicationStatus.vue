<template>
    <div v-if="policy" class="stack-replication-status shadow-box mb-3">
        <div class="replication-header">
            <div>
                <font-awesome-icon icon="database" class="me-1" />
                <strong>{{ $t("stackReplication.heading") }}</strong>
                <span class="badge ms-2" :class="statusClass">{{ $t(`stackReplication.status.${policy.status}`) }}</span>
            </div>
            <div class="d-flex gap-2">
                <button class="btn btn-sm btn-normal" :disabled="busy || policy.status === 'active'" :title="$t('stackReplication.edit')" @click="$emit('edit', policy)">
                    <font-awesome-icon icon="pen" />
                </button>
                <button class="btn btn-sm btn-primary" :disabled="busy || policy.status === 'active'" @click="runNow">
                    <span v-if="busyAction === 'run'" class="spinner-border spinner-border-sm me-1" />
                    <font-awesome-icon v-else icon="sync-alt" class="me-1" />{{ $t("stackReplication.runNow") }}
                </button>
                <button class="btn btn-sm btn-warning" :disabled="busy || !policy.lastSuccessAt || policy.status === 'active'" @click="activate">
                    <span v-if="busyAction === 'activate'" class="spinner-border spinner-border-sm me-1" />
                    <font-awesome-icon v-else icon="rocket" class="me-1" />{{ $t("stackReplication.activate") }}
                </button>
                <button class="btn btn-sm btn-normal" :disabled="busy || !policy.lastSuccessAt || policy.status === 'active'" @click="testRecovery">
                    <span v-if="busyAction === 'test'" class="spinner-border spinner-border-sm me-1" />
                    <font-awesome-icon v-else icon="vial" class="me-1" />{{ $t("stackReplication.testRecovery") }}
                </button>
                <button class="btn btn-sm btn-outline-danger" :disabled="busy" :title="$t('stackReplication.remove')" @click="remove">
                    <font-awesome-icon icon="trash" />
                </button>
            </div>
        </div>
        <div class="replication-grid mt-2">
            <div><span>{{ $t("stackReplication.target") }}</span><strong>{{ endpointName(policy.targetEndpoint) }} / {{ policy.targetName }}</strong></div>
            <div><span>{{ $t("stackReplication.frequency") }}</span><strong>{{ intervalLabel(policy.intervalMinutes) }}</strong></div>
            <div><span>{{ $t("stackReplication.lastSuccess") }}</span><strong>{{ policy.lastSuccessAt ? relative(policy.lastSuccessAt) : "—" }}</strong></div>
            <div><span>{{ $t("stackReplication.nextRun") }}</span><strong>{{ nextRun }}</strong></div>
            <div><span>{{ $t("stackReplication.duration") }}</span><strong>{{ duration }}</strong></div>
            <div><span>{{ $t("stackReplication.snapshot") }}</span><strong><code>{{ policy.lastSnapshotId?.slice(0, 12) || "—" }}</code></strong></div>
            <div><span>{{ $t("stackReplication.lastRestoreTest") }}</span><strong>{{ policy.lastRestoreTestAt ? relative(policy.lastRestoreTestAt) : "—" }}</strong></div>
        </div>
        <div v-if="policy.error" class="alert alert-danger py-2 mt-3 mb-0">{{ policy.error }}</div>
        <div v-if="policy.lastRestoreTestError" class="alert alert-danger py-2 mt-3 mb-0">{{ policy.lastRestoreTestError }}</div>
        <div v-else-if="policy.cleanupWarning" class="alert alert-warning py-2 mt-3 mb-0">{{ policy.cleanupWarning }}</div>
        <div v-if="operationError" class="alert alert-danger py-2 mt-3 mb-0">{{ operationError }}</div>
    </div>
</template>

<script>
export default {
    props: {
        sourceEndpoint: { type: String,
            default: "" },
        sourceStackName: { type: String,
            required: true },
    },
    emits: [ "edit" ],
    data() {
        return { policy: null,
            timer: null,
            now: Date.now(),
            busyAction: "",
            operationError: "" };
    },
    computed: {
        busy() {
            return Boolean(this.busyAction) || this.policy?.status === "running";
        },
        statusClass() {
            return { ready: "bg-success",
                running: "bg-primary",
                error: "bg-danger",
                active: "bg-warning text-dark",
                idle: "bg-secondary" }[this.policy?.status] || "bg-secondary";
        },
        nextRun() {
            if (!this.policy?.enabled || !this.policy.lastSuccessAt || this.policy.status === "active") {
                return "—";
            }
            return this.relative(new Date(this.policy.lastSuccessAt).getTime() + this.policy.intervalMinutes * 60_000);
        },
        duration() {
            const ms = this.policy?.lastDurationMs;
            if (!Number.isFinite(ms)) {
                return "—";
            }
            const seconds = Math.round(ms / 1000);
            return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
        },
    },
    mounted() {
        this.load();
        this.timer = window.setInterval(() => {
            this.now = Date.now();
            this.load();
        }, 10000);
    },
    beforeUnmount() {
        window.clearInterval(this.timer);
    },
    methods: {
        load() {
            this.$root.getSocket().emit("listStackReplications", this.sourceEndpoint, this.sourceStackName, response => {
                if (response?.ok) {
                    this.policy = response.data[0] || null;
                }
            });
        },
        endpointName(endpoint) {
            return this.$root.endpointDisplayFunction(endpoint);
        },
        intervalLabel(minutes) {
            return this.$t(`stackReplication.interval.${minutes}`);
        },
        relative(value) {
            const timestamp = typeof value === "number" ? value : new Date(value).getTime();
            const delta = timestamp - this.now;
            const absolute = Math.abs(delta);
            const unit = absolute < 60_000 ? "second" : absolute < 3_600_000 ? "minute" : "hour";
            const divisor = unit === "second" ? 1000 : unit === "minute" ? 60_000 : 3_600_000;
            return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(Math.round(delta / divisor), unit);
        },
        perform(event, action, ...args) {
            this.busyAction = action;
            this.operationError = "";
            this.$root.getSocket().emit(event, ...args, response => {
                this.busyAction = "";
                if (!response?.ok) {
                    this.operationError = this.$t(response?.msg || "Error");
                }
                this.load();
            });
        },
        runNow() {
            this.perform("runStackReplication", "run", this.policy.id);
        },
        activate() {
            if (!confirm(this.$t("stackReplication.activateConfirm"))) {
                return;
            }
            this.perform("activateStackReplication", "activate", this.policy.id, true);
        },
        testRecovery() {
            this.perform("testStackReplicationRecovery", "test", this.policy.id);
        },
        remove() {
            if (!confirm(this.$t("stackReplication.removeConfirm"))) {
                return;
            }
            this.perform("deleteStackReplication", "remove", this.policy.id);
        },
    },
};
</script>

<style scoped lang="scss">
.stack-replication-status { padding: .85rem 1rem; }
.replication-header { display: flex; align-items: center; justify-content: space-between; gap: .75rem; flex-wrap: wrap; }
.replication-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: .65rem 1rem; }
.replication-grid div { display: flex; flex-direction: column; }
.replication-grid span { color: var(--bs-secondary-color); font-size: .78rem; }
</style>
