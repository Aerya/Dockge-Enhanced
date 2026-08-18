<template>
    <transition ref="tableContainer" name="slide-fade" appear>
        <div v-if="$route.name === 'DashboardHome'">
            <h1 class="mb-3">
                {{ $t("home") }}
            </h1>

            <div class="row first-row">
                <!-- Left -->
                <div class="col-md-7">
                    <!-- Stats -->
                    <div class="shadow-box big-padding text-center mb-4">
                        <div class="row">
                            <div class="col">
                                <h3>{{ $t("active") }}</h3>
                                <span class="num active">{{ activeNum }}</span>
                            </div>
                            <div class="col">
                                <h3>{{ $t("exited") }}</h3>
                                <span class="num exited">{{ exitedNum }}</span>
                            </div>
                            <div class="col">
                                <h3>{{ $t("inactive") }}</h3>
                                <span class="num inactive">{{ inactiveNum }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Summary Cards -->
                    <div v-if="hasSummaryCards" class="row g-3 mb-4">
                        <!-- Image Updates -->
                        <div v-if="summary.imageUpdates !== null" class="col-6">
                            <div class="shadow-box summary-card warning" role="button" tabindex="0"
                                 @click="$router.push('/watcher?tab=images')"
                                 @keyup.enter="$router.push('/watcher?tab=images')">
                                <font-awesome-icon icon="sync-alt" class="summary-icon" />
                                <div class="summary-value">{{ summary.imageUpdates }}</div>
                                <div class="summary-label">{{ $t("home.summary.images.title") }}</div>
                            </div>
                        </div>

                        <!-- Backup Status -->
                        <div v-if="summary.backup !== null" class="col-6">
                            <div class="shadow-box summary-card" :class="{ warning: summary.backup.overdue }" role="button" tabindex="0"
                                 @click="$router.push('/watcher?tab=backup')"
                                 @keyup.enter="$router.push('/watcher?tab=backup')">
                                <font-awesome-icon icon="database" class="summary-icon" />
                                <div class="summary-value text">
                                    <template v-if="summary.backup.ageMs === null">{{ $t("home.summary.backup.never") }}</template>
                                    <template v-else>{{ formatBackupAge(summary.backup.ageMs) }}</template>
                                </div>
                                <div class="summary-label">{{ $t("home.summary.backup.title") }}</div>
                            </div>
                        </div>

                        <!-- Crash-loop / Unhealthy Containers -->
                        <div v-if="summary.containerIssues !== null" class="col-6">
                            <div class="shadow-box summary-card danger" role="button" tabindex="0"
                                 @click="$router.push('/watcher?tab=monitoring')"
                                 @keyup.enter="$router.push('/watcher?tab=monitoring')">
                                <font-awesome-icon icon="heartbeat" class="summary-icon" />
                                <div class="summary-value">{{ summary.containerIssues }}</div>
                                <div class="summary-label">{{ $t("home.summary.monitoring.title") }}</div>
                            </div>
                        </div>

                        <!-- Trivy Security Scan -->
                        <div v-if="summary.trivyVulnerable !== null" class="col-6">
                            <div class="shadow-box summary-card danger" role="button" tabindex="0"
                                 @click="$router.push('/watcher?tab=trivy')"
                                 @keyup.enter="$router.push('/watcher?tab=trivy')">
                                <font-awesome-icon icon="shield-alt" class="summary-icon" />
                                <div class="summary-value">{{ summary.trivyVulnerable }}</div>
                                <div class="summary-label">{{ $t("home.summary.trivy.title") }}</div>
                            </div>
                        </div>
                    </div>

                    <!-- Docker Run -->
                    <h2 class="mb-3">{{ $t("Docker Run") }}</h2>
                    <div class="mb-3">
                        <textarea id="name" v-model="dockerRunCommand" type="text" class="form-control docker-run shadow-box" required placeholder="docker run ..."></textarea>
                    </div>

                    <button class="btn-normal btn mb-4" @click="convertDockerRun">{{ $t("Convert to Compose") }}</button>
                </div>
                <!-- Right -->
                <div class="col-md-5">
                    <!-- Agent List -->
                    <div class="shadow-box big-padding">
                        <h4 class="mb-3">{{ $tc("dockgeAgent", 2) }} <span class="badge bg-warning" style="font-size: 12px;">beta</span></h4>

                        <div v-for="(agent, endpoint) in $root.agentList" :key="endpoint" class="mb-3 agent">
                            <!-- Agent Status -->
                            <template v-if="$root.agentStatusList[endpoint]">
                                <span v-if="$root.agentStatusList[endpoint] === 'online'" class="badge bg-primary me-2">{{ $t("agentOnline") }}</span>
                                <span v-else-if="$root.agentStatusList[endpoint] === 'offline'" class="badge bg-danger me-2">{{ $t("agentOffline") }}</span>
                                <span v-else class="badge bg-secondary me-2">{{ $t($root.agentStatusList[endpoint]) }}</span>
                            </template>

                            <!-- Agent Display Name -->
                            <template v-if="editingAgentEndpoint === endpoint">
                                <input v-model="agentNameDraft" class="form-control form-control-sm agent-name-input"
                                    maxlength="100" :placeholder="$t('agentNamePlaceholder')"
                                    @keyup.enter="renameAgent(agent)" @keyup.esc="cancelRenameAgent" />
                                <button class="btn btn-sm btn-link text-success p-1" :title="$t('saveAgentName')"
                                    @click="renameAgent(agent)">
                                    <font-awesome-icon icon="check" />
                                </button>
                                <button class="btn btn-sm btn-link text-secondary p-1" :title="$t('cancel')"
                                    @click="cancelRenameAgent">
                                    <font-awesome-icon icon="times" />
                                </button>
                            </template>
                            <template v-else>
                                <span class="agent-identity">
                                    <template v-if="endpoint === ''">
                                        <span>{{ agent.displayName || $t("currentEndpoint") }}</span>
                                        <span class="badge bg-info text-dark ms-2" :title="$t('localInstanceHint')">{{ $t("localInstance") }}</span>
                                    </template>
                                    <template v-else>
                                        <a :href="agent.url" target="_blank">{{ agent.displayName || endpoint }}</a>
                                        <small v-if="agent.displayName" class="text-muted d-block">{{ endpoint }}</small>
                                    </template>
                                </span>
                                <button class="btn btn-sm btn-link p-1 rename-agent" :title="$t('renameAgent')"
                                    @click="startRenameAgent(endpoint, agent)">
                                    <font-awesome-icon icon="pen" />
                                </button>
                            </template>

                            <!-- Remove Button -->
                            <font-awesome-icon v-if="endpoint !== ''" class="ms-2 remove-agent" icon="trash" @click="showRemoveAgentDialog[agent.url] = !showRemoveAgentDialog[agent.url]" />

                            <!-- Remoe Agent Dialog -->
                            <BModal v-model="showRemoveAgentDialog[agent.url]" :okTitle="$t('removeAgent')" okVariant="danger" @ok="removeAgent(agent.url)">
                                <p>{{ agent.url }}</p>
                                {{ $t("removeAgentMsg") }}
                            </BModal>
                        </div>

                        <button v-if="!showAgentForm" class="btn btn-normal" @click="showAgentForm = !showAgentForm">{{ $t("addAgent") }}</button>

                        <!-- Add Agent Form -->
                        <form v-if="showAgentForm" @submit.prevent="addAgent">
                            <div class="mb-3">
                                <label for="agentDisplayName" class="form-label">{{ $t("agentName") }}</label>
                                <input id="agentDisplayName" v-model="agent.displayName" type="text" maxlength="100"
                                    class="form-control" :placeholder="$t('agentNamePlaceholder')">
                            </div>
                            <div class="mb-3">
                                <label for="url" class="form-label">{{ $t("dockgeURL") }}</label>
                                <input id="url" v-model="agent.url" type="url" class="form-control" required placeholder="http://">
                            </div>

                            <div class="mb-3">
                                <label for="username" class="form-label">{{ $t("Username") }}</label>
                                <input id="username" v-model="agent.username" type="text" class="form-control" required>
                            </div>

                            <div class="mb-3">
                                <label for="password" class="form-label">{{ $t("Password") }}</label>
                                <input id="password" v-model="agent.password" type="password" class="form-control" required autocomplete="new-password">
                            </div>

                            <button type="submit" class="btn btn-primary" :disabled="connectingAgent">
                                <template v-if="connectingAgent">{{ $t("connecting") }}</template>
                                <template v-else>{{ $t("connect") }}</template>
                            </button>
                        </form>

                        <p class="small text-muted mt-3 mb-0">{{ $t("agentFederation.hint") }}</p>
                    </div>
                </div>
            </div>
        </div>
    </transition>
    <router-view ref="child" />
</template>

<script>
import { statusNameShort } from "../../../common/util-common";

export default {
    components: {

    },
    props: {
        calculatedHeight: {
            type: Number,
            default: 0
        }
    },
    data() {
        return {
            page: 1,
            perPage: 25,
            initialPerPage: 25,
            paginationConfig: {
                hideCount: true,
                chunksNavigation: "scroll",
            },
            importantHeartBeatListLength: 0,
            displayedRecords: [],
            dockerRunCommand: "",
            showAgentForm: false,
            showRemoveAgentDialog: {},
            editingAgentEndpoint: null,
            agentNameDraft: "",
            connectingAgent: false,
            federationMigrationAttempted: false,
            summary: {
                imageUpdates: null,
                backup: null,
                containerIssues: null,
                trivyVulnerable: null,
            },
            agent: {
                url: "http://",
                username: "",
                password: "",
                displayName: "",
            },
        };
    },

    computed: {
        activeNum() {
            return this.getStatusNum("active");
        },
        inactiveNum() {
            return this.getStatusNum("inactive");
        },
        exitedNum() {
            return this.getStatusNum("exited");
        },
        hasSummaryCards() {
            return this.summary.imageUpdates !== null
                || this.summary.backup !== null
                || this.summary.containerIssues !== null
                || this.summary.trivyVulnerable !== null;
        },
    },

    watch: {
        perPage() {
            this.$nextTick(() => {
                this.getImportantHeartbeatListPaged();
            });
        },

        page() {
            this.getImportantHeartbeatListPaged();
        },
    },

    mounted() {
        this.initialPerPage = this.perPage;

        this.$watch(() => this.$root.agentCount, (count) => {
            if (count > 1 && !this.federationMigrationAttempted) {
                this.federationMigrationAttempted = true;
                this.migrateFederation();
            }
        }, { immediate: true });

        window.addEventListener("resize", this.updatePerPage);
        this.updatePerPage();

        this.fetchSummary();
    },

    beforeUnmount() {
        window.removeEventListener("resize", this.updatePerPage);
    },

    methods: {

        /**
         * Auth headers for the watcher/monitoring REST APIs (same pattern as Layout.vue).
         * @returns {object} headers object
         */
        summaryHeaders() {
            const token = localStorage.getItem("token") ?? sessionStorage.getItem("token") ?? "";
            return token ? { "Authorization": `Bearer ${token}` } : {};
        },

        /**
         * Silent GET helper — returns parsed JSON on success, null on any
         * network error / non-2xx (401, feature off...) so cards stay hidden.
         * @param {string} path - API path
         * @returns {Promise<object|null>} parsed body or null
         */
        async summaryGet(path) {
            try {
                const res = await fetch(path, { headers: this.summaryHeaders() });
                if (!res.ok) {
                    return null;
                }
                const json = await res.json();
                return json?.ok ? json : null;
            } catch {
                return null;
            }
        },

        /**
         * Loads the summary cards data. Every card is independent: any failed
         * request or disabled feature simply hides its card.
         * @returns {Promise<void>}
         */
        async fetchSummary() {
            const [
                imgSettings,
                backupSettings,
                backupHistory,
                monSettings,
                overview,
                trivySettings,
                trivyStatus,
            ] = await Promise.all([
                this.summaryGet("/api/watcher/image/settings"),
                this.summaryGet("/api/watcher/backup/settings"),
                this.summaryGet("/api/watcher/backup/history"),
                this.summaryGet("/api/monitoring/settings"),
                this.summaryGet("/api/monitoring/overview"),
                this.summaryGet("/api/watcher/trivy/settings"),
                this.summaryGet("/api/watcher/trivy/status"),
            ]);

            // 1. Image updates — only when watcher enabled and updates pending
            if (imgSettings?.data?.enabled && overview?.data?.images) {
                const n = overview.data.images.pendingCount ?? 0;
                this.summary.imageUpdates = n > 0 ? n : null;
            }

            // 2. Backup — shown when enabled; warning when never backed up or overdue
            const bs = backupSettings?.data;
            if (bs?.enabled && Array.isArray(backupHistory?.data)) {
                const lastSuccess = backupHistory.data.find((e) => e.success);
                if (!lastSuccess) {
                    this.summary.backup = { ageMs: null,
                        overdue: true };
                } else {
                    const ageMs = Math.max(0, Date.now() - new Date(lastSuccess.timestamp).getTime());
                    const intervalMs = (Number(bs.intervalHours) || 24) * 3_600_000;
                    this.summary.backup = { ageMs,
                        overdue: ageMs > intervalMs * 1.5 };
                }
            }

            // 3. Crash-loop / unhealthy containers — monitoring enabled + issues present
            const ms = monSettings?.data;
            if (ms && (ms.crashLoopEnabled || ms.healthcheckEnabled) && overview?.data) {
                const n = (overview.data.crashes?.length ?? 0) + (overview.data.health?.length ?? 0);
                this.summary.containerIssues = n > 0 ? n : null;
            }

            // 4. Trivy — images at or above the configured severity threshold
            const ts = trivySettings?.data;
            if (ts?.enabled && Array.isArray(trivyStatus?.data?.lastResults)) {
                const levels = { UNKNOWN: 0,
                    LOW: 1,
                    MEDIUM: 2,
                    HIGH: 3,
                    CRITICAL: 4 };
                const min = levels[ts.minSeverityAlert] ?? levels.HIGH;
                const n = trivyStatus.data.lastResults.filter((r) => (levels[r.maxSeverity] ?? 0) >= min).length;
                this.summary.trivyVulnerable = n > 0 ? n : null;
            }
        },

        /**
         * Formats a backup age for the card value.
         * @param {number} ageMs - age in milliseconds
         * @returns {string} localized relative time
         */
        formatBackupAge(ageMs) {
            const minutes = Math.floor(ageMs / 60_000);
            if (minutes < 60) {
                return this.$t("home.summary.time.minutesAgo", { n: Math.max(1, minutes) });
            }
            const hours = Math.floor(minutes / 60);
            if (hours < 48) {
                return this.$t("home.summary.time.hoursAgo", { n: hours });
            }
            return this.$t("home.summary.time.daysAgo", { n: Math.floor(hours / 24) });
        },

        migrateFederation() {
            this.$root.getSocket().emit("repairAgentMesh", {
                self: this.federationSelf(),
            }, (res) => {
                if (!res.ok) {
                    this.$root.toastRes(res);
                }
            });
        },

        addAgent() {
            this.connectingAgent = true;
            this.$root.getSocket().emit("addAgent", {
                ...this.agent,
                self: this.federationSelf(),
            }, (res) => {
                this.$root.toastRes(res);

                if (res.ok) {
                    this.showAgentForm = false;
                    this.agent = {
                        url: "http://",
                        username: "",
                        password: "",
                        displayName: "",
                    };
                }

                this.connectingAgent = false;
            });
        },

        federationSelf() {
            return {
                url: window.location.origin,
                token: localStorage.getItem("token") ?? sessionStorage.getItem("token") ?? "",
                displayName: this.$root.agentList?.[""]?.displayName || window.location.hostname,
            };
        },

        startRenameAgent(endpoint, agent) {
            this.editingAgentEndpoint = endpoint;
            this.agentNameDraft = agent.displayName || "";
            this.$nextTick(() => document.querySelector(".agent-name-input")?.focus());
        },

        cancelRenameAgent() {
            this.editingAgentEndpoint = null;
            this.agentNameDraft = "";
        },

        renameAgent(agent) {
            this.$root.getSocket().emit("renameAgent", {
                url: agent.url,
                displayName: this.agentNameDraft,
            }, (res) => {
                this.$root.toastRes(res);
                if (res.ok) this.cancelRenameAgent();
            });
        },

        removeAgent(url) {
            this.$root.getSocket().emit("removeAgent", { url,
                self: this.federationSelf() }, (res) => {
                if (res.ok) {
                    this.$root.toastRes(res);

                    let urlObj = new URL(url);
                    let endpoint = urlObj.host;

                    // Remove the stack list and status list of the removed agent
                    delete this.$root.allAgentStackList[endpoint];
                }
            });
        },

        getStatusNum(statusName) {
            let num = 0;

            for (let stackName in this.$root.completeStackList) {
                const stack = this.$root.completeStackList[stackName];
                if (statusNameShort(stack.status) === statusName) {
                    num += 1;
                }
            }
            return num;
        },

        convertDockerRun() {
            if (this.dockerRunCommand.trim() === "docker run") {
                throw new Error("Please enter a docker run command");
            }

            // composerize is working in dev, but after "vite build", it is not working
            // So pass to backend to do the conversion
            this.$root.getSocket().emit("composerize", this.dockerRunCommand, (res) => {
                if (res.ok) {
                    this.$root.composeTemplate = res.composeTemplate;
                    this.$router.push("/compose");
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        /**
         * Updates the displayed records when a new important heartbeat arrives.
         * @param {object} heartbeat - The heartbeat object received.
         * @returns {void}
         */
        onNewImportantHeartbeat(heartbeat) {
            if (this.page === 1) {
                this.displayedRecords.unshift(heartbeat);
                if (this.displayedRecords.length > this.perPage) {
                    this.displayedRecords.pop();
                }
                this.importantHeartBeatListLength += 1;
            }
        },

        /**
         * Retrieves the length of the important heartbeat list for all monitors.
         * @returns {void}
         */
        getImportantHeartbeatListLength() {
            this.$root.getSocket().emit("monitorImportantHeartbeatListCount", null, (res) => {
                if (res.ok) {
                    this.importantHeartBeatListLength = res.count;
                    this.getImportantHeartbeatListPaged();
                }
            });
        },

        /**
         * Retrieves the important heartbeat list for the current page.
         * @returns {void}
         */
        getImportantHeartbeatListPaged() {
            const offset = (this.page - 1) * this.perPage;
            this.$root.getSocket().emit("monitorImportantHeartbeatListPaged", null, offset, this.perPage, (res) => {
                if (res.ok) {
                    this.displayedRecords = res.data;
                }
            });
        },

        /**
         * Updates the number of items shown per page based on the available height.
         * @returns {void}
         */
        updatePerPage() {
            const tableContainer = this.$refs.tableContainer;
            const tableContainerHeight = tableContainer.offsetHeight;
            const availableHeight = window.innerHeight - tableContainerHeight;
            const additionalPerPage = Math.floor(availableHeight / 58);

            if (additionalPerPage > 0) {
                this.perPage = Math.max(this.initialPerPage, this.perPage + additionalPerPage);
            } else {
                this.perPage = this.initialPerPage;
            }

        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars";

.num {
    font-size: 30px;

    font-weight: bold;
    display: block;

    &.active {
        color: $primary;
    }

    &.exited {
        color: $danger;
    }
}

.shadow-box {
    padding: 20px;
}

table {
    font-size: 14px;

    tr {
        transition: all ease-in-out 0.2ms;
    }

    @media (max-width: 550px) {
        table-layout: fixed;
        overflow-wrap: break-word;
    }
}

.docker-run {
    border: none;
    font-family: 'JetBrains Mono', monospace;
    font-size: 15px;
}

.first-row .shadow-box {

}

.remove-agent {
    cursor: pointer;
    color: rgba(255, 255, 255, 0.3);
}

.agent {
    display: flex;
    align-items: center;
    gap: .25rem;

    a {
        text-decoration: none;
    }
}

.agent-identity {
    min-width: 0;
    flex: 1;
}

.agent-name-input {
    width: min(220px, 100%);
}

.rename-agent {
    color: rgba(255, 255, 255, 0.45);
}

.summary-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    height: 100%;
    padding: 16px 10px;
    text-align: center;
    cursor: pointer;
    color: #6b7280;
    transition: transform 0.15s ease, box-shadow 0.15s ease;

    &:hover {
        transform: translateY(-2px);
    }

    .summary-icon {
        font-size: 20px;
    }

    .summary-value {
        font-size: 22px;
        font-weight: bold;
        color: #334155;

        &.text {
            font-size: 16px;
        }
    }

    .summary-label {
        font-size: 13px;
    }

    &.warning {
        .summary-icon, .summary-value {
            color: $warning;
        }
    }

    &.danger {
        .summary-icon, .summary-value {
            color: $danger;
        }
    }

    .dark & {
        color: $dark-font-color3;

        .summary-value {
            color: $dark-font-color;
        }

        &.warning {
            .summary-icon, .summary-value {
                color: $warning;
            }
        }

        &.danger {
            .summary-icon, .summary-value {
                color: lighten($danger, 10%);
            }
        }
    }
}

</style>
