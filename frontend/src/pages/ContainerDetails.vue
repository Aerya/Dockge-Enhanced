<template>
    <div class="container-details">
        <router-link :to="stackRoute" class="back-link"><font-awesome-icon icon="chevron-left" /> {{ $t("back") }}</router-link>
        <div class="details-header mb-3">
            <div>
                <h1 class="mb-1">{{ instance?.name || $t("containerInstance.title") }}</h1>
                <div class="service-identity">{{ stackName }} / {{ instance?.service || "…" }}</div>
            </div>
            <div v-if="instance" class="d-flex flex-wrap align-items-center gap-2">
                <span class="badge" :class="instance.health === 'unhealthy' ? 'bg-danger' : isRunning ? 'bg-primary' : 'bg-secondary'">{{ instance.health || instance.state }}</span>
                <button v-if="!isRunning" class="btn btn-sm btn-primary" :disabled="processing" @click="performAction('start')">{{ $t("startStack") }}</button>
                <button v-if="isRunning" class="btn btn-sm btn-normal" :disabled="processing" @click="performAction('restart')">{{ $t("restartStack") }}</button>
                <button v-if="isRunning" class="btn btn-sm btn-normal" :disabled="processing" @click="performAction('stop')">{{ $t("stopStack") }}</button>
            </div>
        </div>

        <div v-if="!loaded" class="shadow-box big-padding">{{ $t("containerInstance.loading") }}</div>
        <div v-else-if="!instance" class="shadow-box big-padding">{{ unavailable ? $t("containerInstance.unavailable") : $t("containerInstance.notFound") }}</div>
        <template v-else>
            <div class="details-grid mb-3">
                <div class="shadow-box detail-card"><div class="detail-label">ID</div><code>{{ instance.id }}</code></div>
                <div class="shadow-box detail-card"><div class="detail-label">{{ $t("dockerImage") }}</div><span>{{ instance.image || $t("notAvailableShort") }}</span></div>
                <div class="shadow-box detail-card"><div class="detail-label">{{ $t("containerInstance.state") }}</div><span>{{ instance.state || $t("notAvailableShort") }}</span></div>
                <div class="shadow-box detail-card"><div class="detail-label">{{ $t("containerInstance.health") }}</div><span>{{ instance.health || $t("notAvailableShort") }}</span></div>
                <div class="shadow-box detail-card"><div class="detail-label">{{ $tc("port", 2) }}</div><span>{{ instance.ports || $t("notAvailableShort") }}</span></div>
                <div class="shadow-box detail-card"><div class="detail-label">{{ $t("containerInstance.createdAt") }}</div><span>{{ instance.createdAt || $t("notAvailableShort") }}</span></div>
                <div v-if="stats" class="shadow-box detail-card"><div class="detail-label">CPU</div><span>{{ stats.CPUPerc }}</span></div>
                <div v-if="stats" class="shadow-box detail-card"><div class="detail-label">RAM</div><span>{{ stats.MemUsage }}</span></div>
            </div>
            <div class="shadow-box detail-card">
                <div class="d-flex align-items-center gap-2 mb-2">
                    <h2 class="h5 mb-0">{{ $t("stackLogs") }}</h2>
                    <button class="btn btn-sm btn-normal ms-auto" :disabled="logsLoading" @click="loadLogs">{{ $t("refresh") }}</button>
                </div>
                <pre class="instance-logs">{{ logs || $t("containerInstance.noLogs") }}</pre>
                <div class="form-text">{{ $t("containerInstance.logsHint") }}</div>
            </div>
        </template>
    </div>
</template>

<script>
export default {
    data() {
        return {
            instance: null,
            stats: null,
            logs: "",
            loaded: false,
            processing: false,
            logsLoading: false,
            instanceLoading: false,
            unavailable: false,
            requestTimeout: null,
            refreshTimer: null,
        };
    },
    computed: {
        stackName() {
            return this.$route.params.stackName;
        },
        containerId() {
            return this.$route.params.containerId;
        },
        endpoint() {
            return this.$route.params.endpoint || "";
        },
        stackRoute() {
            return this.endpoint
                ? `/compose/${encodeURIComponent(this.stackName)}/${encodeURIComponent(this.endpoint)}`
                : `/compose/${encodeURIComponent(this.stackName)}`;
        },
        isRunning() {
            return this.instance?.state === "running";
        },
    },
    mounted() {
        this.refresh();
        this.refreshTimer = window.setInterval(() => {
            if (!document.hidden) {
                this.refresh();
            }
        }, 10000);
    },
    unmounted() {
        window.clearInterval(this.refreshTimer);
        window.clearTimeout(this.requestTimeout);
    },
    methods: {
        refresh() {
            if (this.instanceLoading) {
                return;
            }
            this.instanceLoading = true;
            this.requestTimeout = window.setTimeout(() => {
                this.instanceLoading = false;
                this.loaded = true;
                this.unavailable = true;
            }, 10000);
            this.$root.emitAgent(this.endpoint, "containerInstances", this.stackName, (res) => {
                window.clearTimeout(this.requestTimeout);
                this.instanceLoading = false;
                this.loaded = true;
                if (res.ok) {
                    this.unavailable = false;
                    this.instance = res.instances.find((item) => item.id === this.containerId) || null;
                    if (this.instance) {
                        this.loadLogs();
                    }
                } else {
                    this.unavailable = true;
                    this.instance = null;
                }
            });
            this.$root.emitAgent(this.endpoint, "dockerStats", (res) => {
                if (res.ok && this.instance) {
                    this.stats = res.dockerStats[this.instance.name] || null;
                }
            });
        },
        loadLogs() {
            if (this.logsLoading || !this.instance) {
                return;
            }
            this.logsLoading = true;
            this.$root.emitAgent(this.endpoint, "containerInstanceLogs", this.stackName, this.containerId, (res) => {
                this.logsLoading = false;
                if (res.ok) {
                    this.logs = res.logs;
                }
            });
        },
        performAction(action) {
            if (this.processing || !this.instance) {
                return;
            }
            if (action === "stop" && !window.confirm(this.$t("containerInstance.confirmStop", { name: this.instance.name }))) {
                return;
            }
            this.processing = true;
            this.$root.emitAgent(this.endpoint, "containerInstanceAction", this.stackName, this.containerId, action, (res) => {
                this.processing = false;
                if (res.ok) {
                    this.refresh();
                } else {
                    this.$root.toastRes(res);
                }
            });
        },
    },
};
</script>

<style scoped lang="scss">
.container-details {
    min-width: 0;
}
.back-link {
    display: inline-block;
    margin-bottom: .75rem;
    color: var(--text-muted);
    text-decoration: none;
}
.details-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 1rem;
}
.details-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: .75rem;
}
.detail-card {
    min-width: 0;
    padding: 1rem;
    overflow-wrap: anywhere;
}
.detail-label {
    margin-bottom: .35rem;
    color: var(--text-muted);
    font-size: var(--fs-sm);
}
.service-identity {
    color: var(--text-muted);
}
.instance-logs {
    overflow: auto;
    max-height: min(60vh, 560px);
    padding: .8rem;
    border-radius: var(--radius-sm);
    background: #0b1017;
    color: #d9e4f0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: var(--fs-sm);
}
</style>
