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
                        <div v-if="summary.images !== null" class="col-6">
                            <div class="shadow-box summary-card" :class="summary.images.state" role="button" tabindex="0"
                                 @click="$router.push('/watcher?tab=images')"
                                 @keyup.enter="$router.push('/watcher?tab=images')">
                                <font-awesome-icon icon="sync-alt" class="summary-icon" />
                                <div class="summary-value" :class="{ text: summary.images.state !== 'warn' }">
                                    <template v-if="summary.images.state === 'disabled'">{{ $t("home.summary.state.disabled") }}</template>
                                    <template v-else-if="summary.images.state === 'ok'">{{ $t("home.summary.state.ok") }}</template>
                                    <template v-else>{{ summary.images.count }}</template>
                                </div>
                                <div class="summary-label">{{ $t("home.summary.images.title") }}</div>
                            </div>
                        </div>

                        <!-- Backup Status -->
                        <div v-if="summary.backup !== null" class="col-6">
                            <div class="shadow-box summary-card" :class="summary.backup.state" role="button" tabindex="0"
                                 @click="$router.push('/watcher?tab=backup')"
                                 @keyup.enter="$router.push('/watcher?tab=backup')">
                                <font-awesome-icon icon="database" class="summary-icon" />
                                <div class="summary-value text">
                                    <template v-if="summary.backup.state === 'disabled'">{{ $t("home.summary.state.disabled") }}</template>
                                    <template v-else-if="summary.backup.ageMs === null">{{ $t("home.summary.backup.never") }}</template>
                                    <template v-else>{{ formatBackupAge(summary.backup.ageMs) }}</template>
                                </div>
                                <div class="summary-label">{{ $t("home.summary.backup.title") }}</div>
                            </div>
                        </div>

                        <!-- Crash-loop / Unhealthy Containers -->
                        <div v-if="summary.containers !== null" class="col-6">
                            <div class="shadow-box summary-card" :class="summary.containers.state" role="button" tabindex="0"
                                 @click="$router.push('/watcher?tab=monitoring')"
                                 @keyup.enter="$router.push('/watcher?tab=monitoring')">
                                <font-awesome-icon icon="heartbeat" class="summary-icon" />
                                <div class="summary-value" :class="{ text: summary.containers.state !== 'danger' }">
                                    <template v-if="summary.containers.state === 'disabled'">{{ $t("home.summary.state.disabled") }}</template>
                                    <template v-else-if="summary.containers.state === 'ok'">{{ $t("home.summary.state.ok") }}</template>
                                    <template v-else>{{ summary.containers.count }}</template>
                                </div>
                                <div class="summary-label">{{ $t("home.summary.monitoring.title") }}</div>
                            </div>
                        </div>

                        <!-- Trivy Security Scan -->
                        <div v-if="summary.trivy !== null" class="col-6">
                            <div class="shadow-box summary-card" :class="summary.trivy.state" role="button" tabindex="0"
                                 @click="$router.push('/watcher?tab=trivy')"
                                 @keyup.enter="$router.push('/watcher?tab=trivy')">
                                <font-awesome-icon icon="shield-alt" class="summary-icon" />
                                <div class="summary-value" :class="{ text: summary.trivy.state !== 'danger' }">
                                    <template v-if="summary.trivy.state === 'disabled'">{{ $t("home.summary.state.disabled") }}</template>
                                    <template v-else-if="summary.trivy.state === 'ok'">{{ $t("home.summary.state.ok") }}</template>
                                    <template v-else>{{ summary.trivy.count }}</template>
                                </div>
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
                        <h4 class="mb-3">{{ $tc("dockgeAgent", 2) }} <span class="badge bg-warning beta-badge">beta</span></h4>

                        <div v-for="(agent, endpoint) in $root.agentList" :key="endpoint" class="mb-3 agent">
                            <!-- Agent Status -->
                            <template v-if="$root.agentStatusList[endpoint]">
                                <span v-if="$root.agentStatusList[endpoint] === 'online'" class="badge bg-primary me-2">{{ $t("agentOnline") }}</span>
                                <span v-else-if="$root.agentStatusList[endpoint] === 'offline'" class="badge bg-danger me-2">{{ $t("agentOffline") }}</span>
                                <span v-else class="badge bg-secondary me-2">{{ $t($root.agentStatusList[endpoint]) }}</span>
                            </template>

                            <!-- Agent Display Name -->
                            <template v-if="editingAgentEndpoint === endpoint">
                                <input
                                    v-model="agentNameDraft" class="form-control form-control-sm agent-name-input"
                                    maxlength="100" :placeholder="$t('agentNamePlaceholder')"
                                    @keyup.enter="renameAgent(agent)" @keyup.esc="cancelRenameAgent"
                                />
                                <button
                                    class="btn btn-sm btn-link text-success p-1" :title="$t('saveAgentName')"
                                    @click="renameAgent(agent)"
                                >
                                    <font-awesome-icon icon="check" />
                                </button>
                                <button
                                    class="btn btn-sm btn-link text-secondary p-1" :title="$t('cancel')"
                                    @click="cancelRenameAgent"
                                >
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
                                <button
                                    class="btn btn-sm btn-link p-1 rename-agent" :title="$t('renameAgent')"
                                    @click="startRenameAgent(endpoint, agent)"
                                >
                                    <font-awesome-icon icon="pen" />
                                </button>
                            </template>

                            <button
                                v-if="endpoint !== '' && $root.agentStatusList[endpoint] === 'offline'"
                                class="btn btn-sm btn-link p-1 ms-1" :title="$t('reauthenticateAgent')"
                                @click="startReauthenticateAgent(agent)"
                            >
                                <font-awesome-icon icon="key" />
                            </button>

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
                                <input
                                    id="agentDisplayName" v-model="agent.displayName" type="text" maxlength="100"
                                    class="form-control" :placeholder="$t('agentNamePlaceholder')"
                                >
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

            <BModal
                v-model="showReauthenticateAgentDialog" :title="$t('reauthenticateAgent')"
                :okTitle="$t('reauthenticateAgent')" okVariant="primary" :okDisabled="reauthenticatingAgent"
                @ok.prevent="reauthenticateAgent"
            >
                <p class="small text-muted">{{ reauthenticateAgentForm.url }}</p>
                <div class="mb-3">
                    <label for="reauthAgentUsername" class="form-label">{{ $t("Username") }}</label>
                    <input
                        id="reauthAgentUsername" v-model="reauthenticateAgentForm.username" type="text"
                        class="form-control" required autocomplete="username"
                    >
                </div>
                <div class="mb-3">
                    <label for="reauthAgentPassword" class="form-label">{{ $t("Password") }}</label>
                    <input
                        id="reauthAgentPassword" v-model="reauthenticateAgentForm.password" type="password"
                        class="form-control" required autocomplete="current-password"
                    >
                </div>
                <p class="small text-muted mb-0">{{ $t("reauthenticateAgentHint") }}</p>
            </BModal>
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
            reauthenticatingAgent: false,
            showReauthenticateAgentDialog: false,
            reauthenticateAgentForm: {
                url: "",
                username: "",
                password: "",
            },
            federationMigrationAttempted: false,
            summary: {
                images: null,
                backup: null,
                containers: null,
                trivy: null,
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
            return this.summary.images !== null
                || this.summary.backup !== null
                || this.summary.containers !== null
                || this.summary.trivy !== null;
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

            // 1. Image updates — card visible whenever the watcher settings respond
            if (imgSettings?.data) {
                if (!imgSettings.data.enabled) {
                    this.summary.images = { state: "disabled" };
                } else if (overview?.data?.images) {
                    const n = overview.data.images.pendingCount ?? 0;
                    this.summary.images = n > 0 ? { state: "warn",
                        count: n } : { state: "ok" };
                }
            }

            // 2. Backup — shown when settings respond; warning when never backed up or overdue
            const bs = backupSettings?.data;
            if (bs) {
                if (!bs.enabled) {
                    this.summary.backup = { state: "disabled" };
                } else if (Array.isArray(backupHistory?.data)) {
                    const lastSuccess = backupHistory.data.find((e) => e.success);
                    if (!lastSuccess) {
                        this.summary.backup = { state: "warn",
                            ageMs: null };
                    } else {
                        const ageMs = Math.max(0, Date.now() - new Date(lastSuccess.timestamp).getTime());
                        const intervalMs = (Number(bs.intervalHours) || 24) * 3_600_000;
                        this.summary.backup = { state: ageMs > intervalMs * 1.5 ? "warn" : "ok",
                            ageMs };
                    }
                }
            }

            // 3. Crash-loop / unhealthy containers
            const ms = monSettings?.data;
            if (ms) {
                if (!(ms.crashLoopEnabled || ms.healthcheckEnabled)) {
                    this.summary.containers = { state: "disabled" };
                } else if (overview?.data) {
                    const n = (overview.data.crashes?.length ?? 0) + (overview.data.health?.length ?? 0);
                    this.summary.containers = n > 0 ? { state: "danger",
                        count: n } : { state: "ok" };
                }
            }

            // 4. Trivy — images at or above the configured severity threshold
            const ts = trivySettings?.data;
            if (ts) {
                if (!ts.enabled) {
                    this.summary.trivy = { state: "disabled" };
                } else if (Array.isArray(trivyStatus?.data?.lastResults)) {
                    const levels = { UNKNOWN: 0,
                        LOW: 1,
                        MEDIUM: 2,
                        HIGH: 3,
                        CRITICAL: 4 };
                    const min = levels[ts.minSeverityAlert] ?? levels.HIGH;
                    const n = trivyStatus.data.lastResults.filter((r) => (levels[r.maxSeverity] ?? 0) >= min).length;
                    this.summary.trivy = n > 0 ? { state: "danger",
                        count: n } : { state: "ok" };
                }
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
                displayName: this.$root.agentList?.[""]?.displayName || window.location.hostname,
            };
        },

        startReauthenticateAgent(agent) {
            this.reauthenticateAgentForm = {
                url: agent.url,
                username: "",
                password: "",
            };
            this.showReauthenticateAgentDialog = true;
        },

        reauthenticateAgent(event) {
            event?.preventDefault?.();
            if (!this.reauthenticateAgentForm.username || !this.reauthenticateAgentForm.password) {
                return;
            }
            this.reauthenticatingAgent = true;
            this.$root.getSocket().emit("reauthenticateAgent", {
                ...this.reauthenticateAgentForm,
                self: this.federationSelf(),
            }, (res) => {
                this.$root.toastRes(res);
                this.reauthenticatingAgent = false;
                if (res.ok) {
                    this.showReauthenticateAgentDialog = false;
                    this.reauthenticateAgentForm.password = "";
                }
            });
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
                if (res.ok) {
                    this.cancelRenameAgent();
                }
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

.num {
    font-size: var(--fs-2xl);

    font-weight: bold;
    display: block;

    &.active {
        color: var(--primary-strong);
    }

    &.exited {
        color: var(--danger);
    }
}

.shadow-box {
    padding: 20px;
}

table {
    font-size: var(--fs-md);

    tr {
        transition: all ease-in-out 0.2ms;
    }

    @media (max-width: $bp-phone) {
        table-layout: fixed;
        overflow-wrap: break-word;
    }
}

.docker-run {
    border: none;
    font-family: var(--font-mono);
    font-size: var(--fs-base);
}

.first-row .shadow-box {

}

.beta-badge {
    font-size: var(--fs-xs);
}

.remove-agent {
    cursor: pointer;
    color: var(--text-muted);
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
    color: var(--text-muted);
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
    color: var(--text-muted);
    transition: transform 0.15s ease, box-shadow 0.15s ease;

    &:hover {
        transform: translateY(-2px);
    }

    .summary-icon {
        font-size: var(--fs-lg);
    }

    .summary-value {
        font-size: var(--fs-lg);
        font-weight: bold;
        color: var(--text-color);

        &.text {
            font-size: var(--fs-base);
        }
    }

    .summary-label {
        font-size: var(--fs-sm);
    }

    &.warn,
    &.warning {
        .summary-icon, .summary-value {
            color: var(--warning);
        }
    }

    &.danger {
        .summary-icon, .summary-value {
            color: var(--danger);
        }
    }

    &.ok {
        .summary-icon, .summary-value {
            color: var(--success);
        }
    }

    &.disabled {
        opacity: .75;

        .summary-icon, .summary-value {
            color: var(--text-muted);
        }
    }
}

</style>
