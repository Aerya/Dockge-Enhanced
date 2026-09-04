<template>
    <div class="container-fluid external-stacks-page">
        <section class="external-hero mb-4">
            <div class="external-hero__copy">
                <div class="external-kicker">
                    <span class="external-beta-badge">Beta</span>
                    <span>{{ $t("externalStacks.kicker") }}</span>
                </div>
                <h1 class="mb-2"><font-awesome-icon icon="folder-open" class="me-2" />{{ $t("externalStacks.heading") }}</h1>
                <p class="mb-0">{{ $t("externalStacks.intro") }}</p>
            </div>
            <div class="external-hero__actions">
                <select
                    v-if="$root.agentCount > 1"
                    v-model="selectedEndpoint"
                    class="form-select external-instance-select"
                    :disabled="loading || configuring !== ''"
                    :aria-label="$t('agentName')"
                    @change="changeEndpoint"
                >
                    <option
                        v-for="entry in agentEntries"
                        :key="entry.endpoint || '__local__'"
                        :value="entry.endpoint"
                        :disabled="entry.status && entry.status !== 'online'"
                    >
                        {{ entry.label }}
                    </option>
                </select>
                <button class="btn btn-primary external-scan-btn" :disabled="loading" @click="refresh">
                    <font-awesome-icon :icon="loading ? 'spinner' : 'sync-alt'" :spin="loading" class="me-2" />{{ $t("externalStacks.scan") }}
                </button>
            </div>
        </section>

        <div v-if="hasScanned" class="external-summary-grid mb-4" role="status">
            <div class="external-summary-card">
                <span class="external-summary-card__value">{{ stacks.length }}</span>
                <span>{{ $t("externalStacks.summary.detected") }}</span>
            </div>
            <div class="external-summary-card">
                <span class="external-summary-card__value">{{ statusCounts.ready }}</span>
                <span>{{ $t("externalStacks.summary.ready") }}</span>
            </div>
            <div class="external-summary-card">
                <span class="external-summary-card__value">{{ statusCounts.integrated }}</span>
                <span>{{ $t("externalStacks.summary.integrated") }}</span>
            </div>
        </div>

        <div v-if="accessOperation && activeAccessStates.includes(accessOperation.state)" class="external-operation mb-4">
            <div class="external-operation__icon"><font-awesome-icon icon="spinner" spin /></div>
            <div>
                <strong>{{ $t("externalStacks.automaticAccessInProgress") }}</strong>
                <div class="form-text mt-1">{{ accessOperation.message }}</div>
                <code v-if="accessOperation.requestedPath">{{ accessOperation.requestedPath }}</code>
            </div>
        </div>

        <div class="external-security-note mb-4">
            <font-awesome-icon icon="shield-alt" />
            <div>
                <strong>{{ $t("externalStacks.securityTitle") }}</strong>
                <div>{{ $t("externalStacks.securityHint") }}</div>
            </div>
        </div>

        <div v-if="!loading && hasScanned && stacks.length === 0" class="external-empty">
            <font-awesome-icon icon="check-circle" />
            <strong>{{ $t("externalStacks.empty") }}</strong>
            <span>{{ $t("externalStacks.emptyHint") }}</span>
        </div>

        <div v-else class="external-stack-grid">
            <article v-for="stack in stacks" :key="stack.project" class="external-stack-card" :class="{ 'external-stack-card--integrated': stack.imported }">
                <header class="external-stack-card__header">
                    <div class="external-stack-card__identity">
                        <div class="external-stack-card__title-row">
                            <h2>{{ stack.project }}</h2>
                            <span v-if="stack.imported" class="external-pill external-pill--integrated">
                                <font-awesome-icon icon="check" />{{ $t("externalStacks.integrated") }}
                            </span>
                        </div>
                        <div class="external-stack-card__badges">
                            <span class="external-pill" :class="stack.status === 'running' ? 'external-pill--running' : 'external-pill--muted'">{{ stack.status }}</span>
                            <span class="external-pill" :class="pathPillClass(stack.pathStatus)">{{ $t(`externalStacks.path.${stack.pathStatus}`) }}</span>
                            <span v-if="stack.envStatus === 'present'" class="external-pill external-pill--env">.env</span>
                            <span v-if="stack.configFilesNeedingAccess && stack.configFilesNeedingAccess.length" class="external-pill external-pill--warning">{{ $t("externalStacks.configAccessCount", { count: stack.configFilesNeedingAccess.length }) }}</span>
                            <span v-if="stack.envFilesNeedingAccess && stack.envFilesNeedingAccess.length" class="external-pill external-pill--warning">{{ $t("externalStacks.envAccessCount", { count: stack.envFilesNeedingAccess.length }) }}</span>
                            <span v-if="stack.dataPathsNeedingAccess && stack.dataPathsNeedingAccess.length" class="external-pill external-pill--warning">{{ $t("externalStacks.dataAccessCount", { count: stack.dataPathsNeedingAccess.length }) }}</span>
                        </div>
                    </div>
                    <div v-if="stack.imported" class="external-stack-card__header-actions">
                        <button
                            v-if="needsProtectedAccess(stack) && stack.autoAccessAllowed"
                            class="btn btn-sm btn-primary"
                            :disabled="configuring !== ''"
                            @click="configureAccessOnly(stack)"
                        >
                            <font-awesome-icon :icon="configuring === stack.project ? 'spinner' : 'link'" :spin="configuring === stack.project" class="me-1" />
                            {{ $t("externalStacks.authorizePaths") }}
                        </button>
                        <router-link v-if="stack.importedName" class="btn btn-sm btn-normal" :to="composeUrl(stack.importedName)">
                            {{ $t("externalStacks.open") }} <font-awesome-icon icon="chevron-right" class="ms-1" />
                        </router-link>
                    </div>
                </header>

                <div class="external-stack-details">
                    <div class="external-detail-row">
                        <span class="external-detail-label">{{ $t("externalStacks.composeFile") }}</span>
                        <code>{{ stack.composeFile || "—" }}</code>
                    </div>
                    <div class="external-detail-row">
                        <span class="external-detail-label">{{ $t("externalStacks.envFile") }}</span>
                        <code :title="stack.envFiles?.length ? stack.envFiles.join('\n') : ''">{{ stack.envFile || "—" }}</code>
                        <span v-if="stack.envFile" class="external-detail-state">{{ $t(`externalStacks.env.${stack.envStatus}`) }}</span>
                        <span v-if="stack.envFiles?.length > 1" class="external-detail-state">+{{ stack.envFiles.length - 1 }}</span>
                    </div>
                    <div class="external-detail-row">
                        <span class="external-detail-label">{{ $t("externalStacks.workingDir") }}</span>
                        <code>{{ stack.workingDir || "—" }}</code>
                    </div>
                </div>

                <details class="external-mounts" :open="stack.mounts.length <= 3">
                    <summary>
                        <span>{{ $t("externalStacks.volumes") }}</span>
                        <span class="external-mount-count">{{ stack.mounts.length }}</span>
                    </summary>
                    <div v-if="stack.mounts.length" class="external-mount-list">
                        <code v-for="mount in stack.mounts" :key="mount">{{ formatMount(mount) }}</code>
                    </div>
                    <div v-else class="form-text mt-2">{{ $t("externalStacks.noVolumes") }}</div>
                </details>

                <div v-if="!stack.imported" class="external-stack-action">
                    <label :for="`external-name-${stack.project}`" class="form-label">{{ $t("externalStacks.name") }}</label>
                    <div class="external-stack-action__row">
                        <input
                            :id="`external-name-${stack.project}`"
                            v-model.trim="names[stack.project]"
                            class="form-control"
                            maxlength="96"
                            autocomplete="off"
                            :placeholder="$t('externalStacks.namePlaceholder')"
                        >
                        <button
                            v-if="!needsProtectedAccess(stack)"
                            class="btn btn-primary"
                            :disabled="!canIntegrate(stack) || importing === stack.project"
                            @click="importStack(stack)"
                        >
                            <font-awesome-icon :icon="importing === stack.project ? 'spinner' : 'plus'" :spin="importing === stack.project" class="me-1" />
                            {{ $t("externalStacks.import") }}
                        </button>
                        <button
                            v-else-if="stack.autoAccessAllowed && stack.workingDir && (stack.pathStatus === 'accessible' || ['not-accessible', 'not-authorized'].includes(stack.pathStatus))"
                            class="btn btn-primary"
                            :disabled="!canIntegrate(stack) || configuring !== ''"
                            @click="configureAccessAndImport(stack)"
                        >
                            <font-awesome-icon :icon="configuring === stack.project ? 'spinner' : 'link'" :spin="configuring === stack.project" class="me-1" />
                            {{ $t("externalStacks.authorizeAndIntegrate") }}
                        </button>
                        <button v-else class="btn btn-normal" disabled>{{ $t("externalStacks.unavailable") }}</button>
                    </div>
                    <div class="form-text mt-2">
                        <template v-if="needsProtectedAccess(stack) && !stack.autoAccessAllowed">{{ $t("externalStacks.automaticAccessBlocked") }}</template>
                        <template v-else-if="stack.pathStatus === 'accessible' && stack.configFilesNeedingAccess && stack.configFilesNeedingAccess.length">{{ $t("externalStacks.configAccessHint", { count: stack.configFilesNeedingAccess.length }) }}</template>
                        <template v-else-if="stack.pathStatus === 'accessible' && stack.envFilesNeedingAccess && stack.envFilesNeedingAccess.length">{{ $t("externalStacks.envAccessHint", { count: stack.envFilesNeedingAccess.length }) }}</template>
                        <template v-else-if="stack.pathStatus === 'accessible' && stack.dataPathsNeedingAccess && stack.dataPathsNeedingAccess.length">{{ $t("externalStacks.dataAccessHint", { count: stack.dataPathsNeedingAccess.length }) }}</template>
                        <template v-else-if="stack.pathStatus === 'accessible'">{{ $t("externalStacks.readyHint") }}</template>
                        <template v-else-if="stack.pathStatus === 'not-authorized'">{{ $t("externalStacks.authorizeOnlyHint") }}</template>
                        <template v-else-if="stack.pathStatus === 'not-accessible'">{{ $t("externalStacks.autoPatchHint", { path: stack.workingDir }) }}</template>
                        <template v-else>{{ $t("externalStacks.composePathUnavailable") }}</template>
                    </div>
                </div>
            </article>
        </div>

        <div v-if="allowedMounts.length" class="external-access-footnote mt-4">
            <span>{{ $t("externalStacks.allowedRoots") }}</span>
            <code v-for="mount in allowedMounts" :key="`${mount.source}:${mount.destination}`">{{ mount.source }} → {{ mount.destination }}</code>
        </div>
    </div>
</template>

<script>
const PENDING_IMPORT_KEY = "dockge-external-stack-pending-import";

export default {
    data() {
        let pendingImport = null;
        try {
            pendingImport = JSON.parse(sessionStorage.getItem(PENDING_IMPORT_KEY) || "null");
        } catch {
            pendingImport = null;
        }
        return {
            stacks: [],
            allowedMounts: [],
            names: {},
            loading: false,
            importing: "",
            hasScanned: false,
            configuring: "",
            accessOperation: null,
            accessOperationTimer: null,
            handledOperationId: "",
            pendingImport,
            selectedEndpoint: localStorage.getItem("dockge-external-stacks-endpoint") || "",
            activeAccessStates: [ "preparing", "updating", "waiting-health", "rolling-back" ],
        };
    },
    computed: {
        agentEntries() {
            return Object.entries(this.$root.agentList || {}).map(([ endpoint, agent ]) => ({
                endpoint,
                label: this.$root.endpointDisplayFunction(endpoint) || agent?.displayName || endpoint || window.location.hostname,
                status: this.$root.agentStatusList?.[endpoint] || "online",
            }));
        },
        statusCounts() {
            return {
                ready: this.stacks.filter((stack) => stack.pathStatus === "accessible" && !stack.configFilesNeedingAccess?.length && !stack.envFilesNeedingAccess?.length && !stack.dataPathsNeedingAccess?.length && !stack.imported).length,
                integrated: this.stacks.filter((stack) => stack.imported).length,
            };
        },
    },
    mounted() {
        const agents = this.$root.agentList || {};
        if (!Object.prototype.hasOwnProperty.call(agents, this.selectedEndpoint) || (this.$root.agentStatusList?.[this.selectedEndpoint] && this.$root.agentStatusList[this.selectedEndpoint] !== "online")) {
            this.selectedEndpoint = "";
        }
        this.refresh();
        this.loadAccessOperation();
        this.accessOperationTimer = window.setInterval(this.loadAccessOperation, 2000);
    },
    beforeUnmount() {
        if (this.accessOperationTimer) window.clearInterval(this.accessOperationTimer);
    },
    methods: {
        changeEndpoint() {
            localStorage.setItem("dockge-external-stacks-endpoint", this.selectedEndpoint);
            this.stacks = [];
            this.allowedMounts = [];
            this.hasScanned = false;
            this.accessOperation = null;
            this.configuring = "";
            this.handledOperationId = "";
            this.refresh();
            this.loadAccessOperation();
        },
        composeUrl(stackName) {
            const base = `/compose/${encodeURIComponent(stackName)}`;
            return this.selectedEndpoint ? `${base}/${encodeURIComponent(this.selectedEndpoint)}` : base;
        },
        suggestedName(project) {
            const clean = project.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
            return (clean || "external-stack").slice(0, 96);
        },
        needsProtectedAccess(stack) {
            return stack.pathStatus !== "accessible" || Boolean(stack.configFilesNeedingAccess?.length) || Boolean(stack.envFilesNeedingAccess?.length) || Boolean(stack.dataPathsNeedingAccess?.length);
        },
        canIntegrate(stack) {
            return Boolean(stack.composeFile && this.names[stack.project] && /^[a-z0-9][a-z0-9_-]*$/.test(this.names[stack.project]));
        },
        refresh() {
            this.loading = true;
            let completed = false;
            const timeout = window.setTimeout(() => {
                if (completed) return;
                completed = true;
                this.loading = false;
                this.$root.toastError(this.$t("externalStacks.timeout"));
            }, 15000);
            this.$root.emitAgent(this.selectedEndpoint, "discoverExternalStacks", (res) => {
                if (completed) return;
                completed = true;
                window.clearTimeout(timeout);
                this.loading = false;
                if (!res?.ok) return this.$root.toastRes(res);
                this.stacks = res.stacks || [];
                this.allowedMounts = res.allowedMounts || [];
                this.hasScanned = true;
                for (const stack of this.stacks) {
                    if (!this.names[stack.project]) this.names[stack.project] = this.suggestedName(stack.project);
                }
                this.resumePendingImport();
            });
        },
        importStack(stack, forcedName = "") {
            const name = forcedName || this.names[stack.project];
            if (!name || this.importing) return;
            this.importing = stack.project;
            this.$root.emitAgent(this.selectedEndpoint, "importExternalStack", {
                name,
                project: stack.project,
                composeFile: stack.composeFile,
            }, (res) => {
                this.importing = "";
                this.$root.toastRes(res);
                if (res?.ok) {
                    this.clearPendingImport();
                    this.refresh();
                }
            });
        },
        setPendingImport(stack) {
            this.pendingImport = { project: stack.project, name: this.names[stack.project], endpoint: this.selectedEndpoint };
            sessionStorage.setItem(PENDING_IMPORT_KEY, JSON.stringify(this.pendingImport));
        },
        clearPendingImport() {
            this.pendingImport = null;
            sessionStorage.removeItem(PENDING_IMPORT_KEY);
        },
        resumePendingImport() {
            if (!this.pendingImport || this.importing || (this.pendingImport.endpoint || "") !== this.selectedEndpoint) return;
            const stack = this.stacks.find((candidate) => candidate.project === this.pendingImport.project);
            if (!stack) return;
            if (stack.imported) {
                this.clearPendingImport();
                return;
            }
            if (!this.needsProtectedAccess(stack) && stack.composeFile) {
                const pending = { ...this.pendingImport };
                this.importStack(stack, pending.name);
            }
        },
        loadAccessOperation() {
            this.$root.emitAgent(this.selectedEndpoint, "getExternalStackAccessStatus", (res) => {
                if (!res?.ok || !res.operation) return;
                this.accessOperation = res.operation;
                if (this.activeAccessStates.includes(res.operation.state)) {
                    this.configuring = res.operation.project || this.configuring;
                    return;
                }
                this.configuring = "";
                if (!res.operation.id || this.handledOperationId === res.operation.id) return;
                this.handledOperationId = res.operation.id;
                sessionStorage.removeItem("dockge-external-access-in-progress");
                if (res.operation.state === "succeeded") {
                    this.$root.toastSuccess(this.$t("externalStacks.automaticAccessSucceeded"));
                    this.refresh();
                } else if ([ "failed", "rolled-back", "rollback-failed" ].includes(res.operation.state)) {
                    this.clearPendingImport();
                    this.$root.toastError(this.$t("externalStacks.automaticAccessFailed", { message: res.operation.message || "" }));
                }
            });
        },
        configureAccessAndImport(stack) {
            if (!this.canIntegrate(stack)) return;
            this.startProtectedAccess(stack, true);
        },
        configureAccessOnly(stack) {
            this.startProtectedAccess(stack, false);
        },
        startProtectedAccess(stack, finishImport) {
            if (!stack?.workingDir || !confirm(this.$t("externalStacks.automaticAccessConfirm", { path: stack.workingDir }))) return;
            if (finishImport) this.setPendingImport(stack);
            else this.clearPendingImport();
            this.configuring = stack.project;
            this.$root.emitAgent(this.selectedEndpoint, "prepareExternalStackAccess", { project: stack.project }, (res) => {
                if (!res?.ok) {
                    this.configuring = "";
                    if (finishImport) this.clearPendingImport();
                    return this.$root.toastRes(res);
                }
                this.accessOperation = res.operation;
                sessionStorage.setItem("dockge-external-access-in-progress", "1");
                this.$root.toastSuccess(this.$t("externalStacks.automaticAccessStarted"));
            });
        },
        pathPillClass(status) {
            return {
                accessible: "external-pill--ready",
                "not-accessible": "external-pill--muted",
                "not-authorized": "external-pill--warning",
                unknown: "external-pill--muted",
            }[status] || "external-pill--muted";
        },
        formatMount(mount) {
            return mount.replace(/^bind:\s*/, "bind · ").replace(/^volume:\s*/, "volume · ");
        },
    },
};
</script>

<style lang="scss" scoped>
.external-stacks-page {
    max-width: 1240px;
    padding-bottom: 36px;
}

.external-hero {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    padding: 22px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    background: linear-gradient(135deg, var(--bg-raised), var(--primary-soft));
}

.external-hero__copy { max-width: 780px; }
.external-hero__actions { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; }
.external-instance-select { min-width: 190px; max-width: 280px; }
.external-hero h1 { font-size: clamp(1.55rem, 2vw, 2rem); }
.external-hero p { color: var(--text-muted); line-height: 1.55; }
.external-kicker { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: var(--text-muted); font-size: var(--fs-sm); font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
.external-beta-badge { padding: 3px 7px; border-radius: 999px; background: var(--warning-soft); color: var(--warning); font-size: 10px; }
.external-scan-btn { white-space: nowrap; }

.external-summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.external-summary-card { display: flex; align-items: center; gap: 10px; min-height: 64px; padding: 12px 16px; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-raised); color: var(--text-muted); }
.external-summary-card__value { color: var(--text-color); font-size: 1.55rem; font-weight: 800; }

.external-operation, .external-security-note { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-raised); }
.external-operation { border-left: 3px solid var(--primary); }
.external-operation__icon { color: var(--primary); }
.external-operation code { display: block; width: fit-content; max-width: 100%; margin-top: 6px; overflow-wrap: anywhere; }
.external-security-note { color: var(--text-muted); }
.external-security-note > svg { flex: 0 0 auto; margin-top: 2px; color: var(--success); }
.external-security-note strong { display: block; color: var(--text-color); margin-bottom: 2px; }

.external-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 42px 18px; border: 1px dashed var(--border-strong); border-radius: var(--radius-lg); color: var(--text-muted); text-align: center; }
.external-empty > svg { color: var(--success); font-size: 1.6rem; }
.external-empty strong { color: var(--text-color); }

.external-stack-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 500px), 1fr)); gap: 16px; }
.external-stack-card { min-width: 0; padding: 18px; border: 1px solid var(--border-color); border-radius: var(--radius-lg); background: var(--bg-raised); box-shadow: 0 10px 30px rgba(0, 0, 0, .035); }
.external-stack-card--integrated { border-color: color-mix(in srgb, var(--success) 36%, var(--border-color)); }
.external-stack-card__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.external-stack-card__identity { min-width: 0; }
.external-stack-card__header-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.external-stack-card__title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.external-stack-card h2 { min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; font-size: 1.08rem; font-weight: 750; }
.external-stack-card__badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; }

.external-pill { display: inline-flex; align-items: center; gap: 4px; padding: 3px 7px; border: 1px solid var(--border-color); border-radius: 999px; background: var(--bg-input); color: var(--text-muted); font-size: 10px; font-weight: 700; line-height: 1.2; }
.external-pill--running, .external-pill--ready, .external-pill--integrated { border-color: color-mix(in srgb, var(--success) 40%, transparent); background: var(--success-soft); color: var(--success); }
.external-pill--warning { border-color: color-mix(in srgb, var(--warning) 45%, transparent); background: var(--warning-soft); color: var(--warning); }
.external-pill--muted { color: var(--text-muted); }
.external-pill--env { border-color: color-mix(in srgb, var(--primary) 32%, transparent); background: var(--primary-soft); color: var(--primary-strong); }

.external-stack-details { display: grid; gap: 8px; }
.external-detail-row { display: grid; grid-template-columns: 118px minmax(0, 1fr) auto; align-items: center; gap: 8px; min-width: 0; }
.external-detail-label { color: var(--text-muted); font-size: var(--fs-sm); }
.external-detail-row code { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-color); }
.external-detail-state { color: var(--text-muted); font-size: var(--fs-xs); }

.external-mounts { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border-color); }
.external-mounts summary { display: flex; align-items: center; gap: 7px; width: fit-content; cursor: pointer; color: var(--text-muted); font-size: var(--fs-sm); font-weight: 650; user-select: none; }
.external-mount-count { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 999px; background: var(--bg-input); color: var(--text-color); font-size: 10px; }
.external-mount-list { display: grid; gap: 6px; margin-top: 10px; }
.external-mount-list code { padding: 6px 8px; overflow-wrap: anywhere; border-radius: var(--radius-sm); background: var(--bg-input); color: var(--text-color); }

.external-stack-action { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border-color); }
.external-stack-action__row { display: flex; gap: 8px; }
.external-stack-action__row .form-control { min-width: 0; }
.external-stack-action__row .btn { flex: 0 0 auto; white-space: nowrap; }

.external-access-footnote { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; color: var(--text-muted); font-size: var(--fs-xs); }
.external-access-footnote code { padding: 3px 6px; border-radius: var(--radius-sm); background: var(--bg-input); color: var(--text-color); }

@media (max-width: 768px) {
    .external-hero { flex-direction: column; }
    .external-hero__actions { width: 100%; flex-direction: column; align-items: stretch; }
    .external-instance-select { min-width: 0; max-width: none; width: 100%; }
    .external-scan-btn { width: 100%; }
    .external-summary-grid { grid-template-columns: 1fr; }
    .external-detail-row { grid-template-columns: 1fr; gap: 2px; }
    .external-detail-row code { white-space: normal; overflow-wrap: anywhere; }
    .external-stack-action__row { flex-direction: column; }
}
</style>
