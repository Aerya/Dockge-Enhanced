<template>
    <BModal v-model="visible" size="xl" :title="modalTitle" hide-footer @hidden="reset">
        <div v-if="loading" class="text-center py-5">
            <span class="spinner-border me-2" />{{ $t("stackTransfer.loading") }}
        </div>

        <template v-else>
            <div v-if="targetAgents.length === 0" class="alert alert-warning mb-0">
                {{ $t("stackTransfer.noTarget") }}
            </div>

            <template v-else>
                <div class="row g-3 mb-4">
                    <div class="col-md-5">
                        <label class="form-label">{{ $t("stackTransfer.targetInstance") }}</label>
                        <select v-model="targetEndpoint" class="form-select" @change="targetChanged">
                            <option v-for="item in targetAgents" :key="item.endpoint" :value="item.endpoint">
                                {{ item.name }}
                            </option>
                        </select>
                    </div>
                    <div class="col-md-4">
                        <label class="form-label">{{ $t("stackTransfer.targetName") }}</label>
                        <input v-model="targetName" class="form-control" maxlength="100" @input="invalidatePreflight" />
                    </div>
                    <div class="col-md-3 d-flex align-items-end">
                        <div class="form-check mb-2">
                            <input id="stack-transfer-deploy" v-model="deploy" type="checkbox" class="form-check-input" :disabled="operation === 'move'" @change="invalidatePreflight" />
                            <label for="stack-transfer-deploy" class="form-check-label">{{ $t("stackTransfer.deployTarget") }}</label>
                        </div>
                    </div>
                </div>

                <div class="alert alert-info">
                    <font-awesome-icon icon="circle-info" class="me-1" />
                    {{ $t("stackTransfer.configOnlyWarning") }}
                </div>

                <div class="mb-4">
                    <strong class="me-2">{{ $t("stackTransfer.filesCopied") }}</strong>
                    <span v-for="file in copiedFiles" :key="file" class="badge bg-secondary me-1"><code>{{ file }}</code></span>
                </div>

                <h5>{{ $t("stackTransfer.storageMapping") }}</h5>
                <p class="form-text">{{ $t("stackTransfer.storageMappingHint") }}</p>
                <div class="table-responsive mb-3">
                    <table class="table align-middle transfer-mapping-table">
                        <thead>
                            <tr>
                                <th>{{ $t("stackTransfer.service") }}</th>
                                <th>{{ $t("stackTransfer.type") }}</th>
                                <th>{{ $t("stackTransfer.source") }}</th>
                                <th>{{ $t("stackTransfer.target") }}</th>
                                <th>{{ $t("stackTransfer.size") }}</th>
                                <th>{{ $t("stackTransfer.confidence") }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="mount in mappings" :key="mount.id">
                                <td><strong>{{ mount.service }}</strong><small class="d-block text-muted">{{ mount.target }}</small></td>
                                <td><span class="badge bg-secondary">{{ mount.type }}</span></td>
                                <td class="text-break"><code>{{ mount.source || "—" }}</code><small v-if="mount.resolvedSource && mount.resolvedSource !== mount.source" class="d-block text-muted">{{ mount.resolvedSource }}</small></td>
                                <td>
                                    <input v-if="mount.type === 'bind' || mount.type === 'volume'" v-model="mount.targetSource" class="form-control form-control-sm" @input="mappingChanged(mount)" />
                                    <span v-else class="text-muted">{{ $t("stackTransfer.recreated") }}</span>
                                </td>
                                <td>{{ formatBytes(mount.size) }}</td>
                                <td>
                                    <span class="badge" :class="confidenceClass(mount.confidence)">{{ $t(`stackTransfer.confidence.${mount.confidence}`) }}</span>
                                </td>
                            </tr>
                            <tr v-if="mappings.length === 0">
                                <td colspan="6" class="text-center text-muted">{{ $t("stackTransfer.noMounts") }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <details class="mb-4">
                    <summary class="transfer-rules-summary">{{ $t("stackTransfer.pathRules") }}</summary>
                    <p class="form-text mt-2">{{ $t("stackTransfer.pathRulesHint") }}</p>
                    <div v-for="(rule, index) in pathRules" :key="index" class="row g-2 mb-2">
                        <div class="col"><input v-model="rule.sourcePrefix" class="form-control form-control-sm" placeholder="/source/root" /></div>
                        <div class="col-auto pt-1">→</div>
                        <div class="col"><input v-model="rule.targetPrefix" class="form-control form-control-sm" placeholder="/target/root" /></div>
                        <div class="col-auto"><button class="btn btn-sm btn-outline-danger" @click="pathRules.splice(index, 1)"><font-awesome-icon icon="trash" /></button></div>
                    </div>
                    <button class="btn btn-sm btn-normal me-2" @click="pathRules.push({ sourcePrefix: '', targetPrefix: '' })">{{ $t("stackTransfer.addRule") }}</button>
                    <button class="btn btn-sm btn-primary" :disabled="savingRules" @click="saveRules">{{ $t("stackTransfer.saveRules") }}</button>
                </details>

                <div class="d-flex align-items-center gap-2 mb-3">
                    <button class="btn btn-normal" :disabled="preflightLoading" @click="runPreflight">
                        <span v-if="preflightLoading" class="spinner-border spinner-border-sm me-1" />
                        <font-awesome-icon v-else icon="check" class="me-1" />{{ $t("stackTransfer.validateTarget") }}
                    </button>
                    <span v-if="analysisWarnings.length" class="text-warning small">{{ analysisWarnings.join(" · ") }}</span>
                </div>

                <div v-if="issues.length" class="transfer-issues mb-4">
                    <div v-for="(issue, index) in issues" :key="`${issue.code}-${index}`" class="transfer-issue" :class="`transfer-issue-${issue.severity}`">
                        <font-awesome-icon :icon="issue.severity === 'success' ? 'check' : issue.severity === 'error' ? 'exclamation-triangle' : 'circle-info'" class="me-2" />
                        <span>{{ issueText(issue) }}</span>
                        <span v-if="issue.scope === 'deploy'" class="badge bg-secondary ms-auto">{{ $t("stackTransfer.deployCheck") }}</span>
                    </div>
                </div>

                <details v-if="mappedOverridePreview && mappedOverridePreview !== (stack.composeOverrideYAML || '')" class="mb-4">
                    <summary class="transfer-rules-summary">{{ $t("stackTransfer.generatedOverride") }}</summary>
                    <p class="form-text mt-2">{{ $t("stackTransfer.generatedOverrideHint") }}</p>
                    <pre class="transfer-override-preview">{{ mappedOverridePreview }}</pre>
                </details>

                <div v-if="result" class="alert alert-success">
                    <strong>{{ operation === "copy" ? $t("stackTransfer.copyComplete") : $t("stackTransfer.moveComplete") }}</strong>
                    <div>{{ $t("stackTransfer.jobId") }}: <code>{{ result.job.id }}</code></div>
                    <div v-if="operation === 'move'">{{ $t("stackTransfer.sourceKept") }}</div>
                </div>

                <div v-if="operationError" class="alert alert-danger">{{ operationError }}</div>

                <div class="d-flex justify-content-end gap-2">
                    <button class="btn btn-normal" @click="visible = false">{{ $t("cancel") }}</button>
                    <button class="btn" :class="operation === 'move' ? 'btn-warning' : 'btn-primary'" :disabled="!canTransfer || transferring" @click="executeTransfer">
                        <span v-if="transferring" class="spinner-border spinner-border-sm me-1" />
                        <font-awesome-icon v-else :icon="operation === 'move' ? 'clone' : 'copy'" class="me-1" />
                        {{ operation === "move" ? $t("stackTransfer.moveAction") : $t("stackTransfer.copyAction") }}
                    </button>
                </div>
            </template>
        </template>
    </BModal>
</template>

<script>
export default {
    props: {
        stack: { type: Object,
            required: true },
        endpoint: { type: String,
            default: "" },
    },
    emits: [ "completed" ],
    data() {
        return {
            visible: false,
            loading: false,
            operation: "copy",
            targetEndpoint: "",
            targetName: "",
            deploy: true,
            mappings: [],
            originalMounts: [],
            sourceRunningServices: [],
            analysisWarnings: [],
            pathRules: [],
            issues: [],
            preflightLoading: false,
            preflightSignature: "",
            mappedOverridePreview: "",
            savingRules: false,
            transferring: false,
            operationError: "",
            result: null,
        };
    },
    computed: {
        modalTitle() {
            return this.operation === "move" ? this.$t("stackTransfer.moveTitle", [ this.stack.name ]) : this.$t("stackTransfer.copyTitle", [ this.stack.name ]);
        },
        targetAgents() {
            return Object.entries(this.$root.agentList)
                .filter(([ endpoint ]) => endpoint !== this.endpoint && this.$root.agentStatusList[endpoint] === "online")
                .map(([ endpoint, agent ]) => ({ endpoint,
                    name: agent.displayName || endpoint || this.$t("currentEndpoint") }));
        },
        currentSignature() {
            return JSON.stringify({ targetEndpoint: this.targetEndpoint,
                targetName: this.targetName,
                deploy: this.deploy,
                mappings: this.mappings.map(item => [ item.id, item.targetSource ]) });
        },
        canTransfer() {
            if (!this.targetEndpoint && !this.targetAgents.some(item => item.endpoint === "")) {
                return false;
            }
            if (!this.targetName || this.preflightSignature !== this.currentSignature) {
                return false;
            }
            return !this.issues.some(issue => issue.severity === "error" && (issue.scope === "save" || this.deploy));
        },
        copiedFiles() {
            const files = [ "compose.yaml" ];
            if ((this.stack.composeENV || "").trim()) {
                files.push(".env");
            }
            if ((this.stack.composeOverrideYAML || "").trim() || this.mappings.some(mount => mount.targetSource !== mount.source)) {
                files.push("compose.override.yaml");
            }
            return files;
        },
    },
    methods: {
        emitAgent(endpoint, event, ...args) {
            return new Promise((resolve, reject) => {
                const timeout = window.setTimeout(() => reject(new Error(this.$t("stackTransfer.agentTimeout"))), 180_000);
                this.$root.emitAgent(endpoint, event, ...args, response => {
                    window.clearTimeout(timeout);
                    resolve(response);
                });
            });
        },
        async open(operation) {
            this.reset();
            this.operation = operation;
            this.visible = true;
            this.loading = true;
            this.targetName = this.stack.name;
            await this.$nextTick();
            this.targetEndpoint = this.targetAgents[0]?.endpoint ?? "";
            if (this.targetAgents.length === 0) {
                this.loading = false;
                return;
            }
            try {
                const analysis = await this.emitAgent(this.endpoint, "analyzeStackTransfer", this.stack.name, this.endpoint);
                if (!analysis.ok) {
                    throw new Error(this.$t(analysis.msg));
                }
                this.originalMounts = analysis.data.mounts;
                this.sourceRunningServices = analysis.data.runningServices || [];
                this.analysisWarnings = analysis.data.warnings || [];
                await this.loadRules();
                this.applyRules();
                await this.runPreflight();
            } catch (error) {
                this.operationError = error instanceof Error ? error.message : String(error);
            } finally {
                this.loading = false;
            }
        },
        reset() {
            this.loading = false;
            this.targetEndpoint = "";
            this.targetName = "";
            this.deploy = true;
            this.mappings = [];
            this.originalMounts = [];
            this.sourceRunningServices = [];
            this.analysisWarnings = [];
            this.pathRules = [];
            this.issues = [];
            this.preflightSignature = "";
            this.mappedOverridePreview = "";
            this.operationError = "";
            this.result = null;
            this.transferring = false;
        },
        async targetChanged() {
            this.invalidatePreflight();
            this.operationError = "";
            try {
                await this.loadRules();
                this.applyRules();
                await this.runPreflight();
            } catch (error) {
                this.operationError = error instanceof Error ? error.message : String(error);
            }
        },
        async loadRules() {
            const response = await this.emitAgent(this.targetEndpoint, "getStackTransferPathRules", this.endpoint);
            if (!response.ok) {
                throw new Error(this.$t(response.msg));
            }
            this.pathRules = response.data.map(rule => ({ ...rule }));
        },
        applyRules() {
            const rules = this.pathRules
                .filter(rule => rule.sourcePrefix.startsWith("/") && rule.targetPrefix.startsWith("/"))
                .sort((a, b) => b.sourcePrefix.length - a.sourcePrefix.length);
            this.mappings = this.originalMounts.map(item => {
                const mount = { ...item };
                if (mount.type === "bind" && mount.source.startsWith("/")) {
                    const rule = rules.find(candidate => {
                        const sourcePrefix = this.normalizePrefix(candidate.sourcePrefix);
                        return sourcePrefix === "/" || mount.source === sourcePrefix || mount.source.startsWith(sourcePrefix + "/");
                    });
                    if (rule) {
                        const sourcePrefix = this.normalizePrefix(rule.sourcePrefix);
                        const targetPrefix = this.normalizePrefix(rule.targetPrefix);
                        const suffix = sourcePrefix === "/" ? mount.source : mount.source.slice(sourcePrefix.length);
                        mount.targetSource = targetPrefix === "/" ? suffix || "/" : targetPrefix + suffix;
                        mount.confidence = "high";
                        mount.reason = "path-rule";
                    }
                }
                return mount;
            });
            this.invalidatePreflight();
        },
        mappingChanged(mount) {
            mount.confidence = mount.targetSource === mount.source ? mount.confidence : "medium";
            this.invalidatePreflight();
        },
        invalidatePreflight() {
            this.preflightSignature = "";
            this.mappedOverridePreview = "";
            this.issues = [];
            this.result = null;
        },
        request() {
            return {
                operation: this.operation,
                sourceEndpoint: this.endpoint,
                sourceStackName: this.stack.name,
                targetName: this.targetName.trim().toLowerCase(),
                composeYAML: this.stack.composeYAML,
                composeENV: this.stack.composeENV || "",
                composeOverrideYAML: this.stack.composeOverrideYAML || "",
                mappings: this.mappings,
                deploy: this.deploy,
            };
        },
        async runPreflight() {
            this.preflightLoading = true;
            this.operationError = "";
            try {
                this.targetName = this.targetName.trim().toLowerCase();
                const response = await this.emitAgent(this.targetEndpoint, "preflightStackTransfer", this.request());
                if (!response.ok) {
                    throw new Error(this.$t(response.msg));
                }
                this.issues = response.data.issues;
                this.mappedOverridePreview = response.data.mappedOverrideYAML || "";
                this.preflightSignature = this.currentSignature;
            } catch (error) {
                this.operationError = error instanceof Error ? error.message : String(error);
            } finally {
                this.preflightLoading = false;
            }
        },
        async saveRules() {
            this.savingRules = true;
            try {
                const response = await this.emitAgent(this.targetEndpoint, "setStackTransferPathRules", this.endpoint, this.pathRules);
                if (!response.ok) {
                    throw new Error(this.$t(response.msg));
                }
                this.pathRules = response.data.map(rule => ({ ...rule }));
                this.applyRules();
                await this.runPreflight();
                this.$root.toastSuccess(this.$t("Saved"));
            } catch (error) {
                this.operationError = error instanceof Error ? error.message : String(error);
            } finally {
                this.savingRules = false;
            }
        },
        async executeTransfer() {
            if (!this.canTransfer) {
                return;
            }
            this.transferring = true;
            this.operationError = "";
            try {
                if (this.operation === "move") {
                    const sourceState = await this.emitAgent(this.endpoint, "analyzeStackTransfer", this.stack.name, this.endpoint);
                    if (!sourceState.ok) {
                        throw new Error(this.$t(sourceState.msg));
                    }
                    this.sourceRunningServices = sourceState.data.runningServices || [];
                }
                const response = await this.emitAgent(this.targetEndpoint, "importStackTransfer", this.request());
                if (!response.ok) {
                    throw new Error(this.$t(response.msg));
                }
                const result = response.data;
                if (this.operation === "move" && this.sourceRunningServices.length > 0) {
                    const stopped = await this.emitAgent(this.endpoint, "stopStack", this.stack.name);
                    if (!stopped.ok) {
                        const rollbackErrors = [];
                        if (this.deploy) {
                            try {
                                const deleted = await this.emitAgent(this.targetEndpoint, "deleteStack", this.targetName, { removeFiles: true,
                                    force: true });
                                if (!deleted.ok) {
                                    rollbackErrors.push(this.$t(deleted.msg));
                                }
                            } catch (error) {
                                rollbackErrors.push(error instanceof Error ? error.message : String(error));
                            }
                        }
                        try {
                            const restored = await this.emitAgent(this.endpoint, "restoreStackTransferSource", this.stack.name, this.sourceRunningServices);
                            if (!restored.ok) {
                                rollbackErrors.push(this.$t(restored.msg));
                            }
                        } catch (error) {
                            rollbackErrors.push(error instanceof Error ? error.message : String(error));
                        }
                        try {
                            await this.emitAgent(this.targetEndpoint, "completeStackTransferJob", result.job.id, false, stopped.msg || "Source stop failed");
                        } catch (error) {
                            rollbackErrors.push(error instanceof Error ? error.message : String(error));
                        }
                        const suffix = rollbackErrors.length ? ` (${rollbackErrors.join(" · ")})` : "";
                        throw new Error(`${this.$t(stopped.msg)}${suffix}`);
                    }
                }
                if (this.operation === "move") {
                    await this.emitAgent(this.targetEndpoint, "completeStackTransferJob", result.job.id, true, "");
                }
                this.result = result;
                this.preflightSignature = "";
                this.$root.emitAgent(this.targetEndpoint, "requestStackList", () => {});
                this.$emit("completed", { endpoint: this.targetEndpoint,
                    name: this.targetName,
                    operation: this.operation });
            } catch (error) {
                this.operationError = error instanceof Error ? error.message : String(error);
            } finally {
                this.transferring = false;
            }
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
        confidenceClass(confidence) {
            return { high: "bg-success",
                medium: "bg-warning text-dark",
                manual: "bg-danger" }[confidence] || "bg-secondary";
        },
        normalizePrefix(value) {
            return value.trim().replace(/\/+$/, "") || "/";
        },
        issueText(issue) {
            const key = `stackTransfer.issue.${issue.code}`;
            return this.$te(key) ? this.$t(key, issue.params || {}) : issue.message;
        },
    },
};
</script>

<style scoped lang="scss">
.transfer-mapping-table {
    min-width: 900px;
    code { white-space: normal; }
}
.transfer-rules-summary { cursor: pointer; font-weight: 600; }
.transfer-issues { display: grid; gap: .4rem; }
.transfer-issue { display: flex; align-items: center; border-radius: .4rem; padding: .55rem .75rem; }
.transfer-issue-success { background: rgba(25, 135, 84, .14); color: #75d5a5; }
.transfer-issue-warning { background: rgba(255, 193, 7, .14); color: #ffd76a; }
.transfer-issue-error { background: rgba(220, 53, 69, .14); color: #ff8793; }
.transfer-override-preview { max-height: 260px; overflow: auto; border-radius: .4rem; padding: .75rem; background: rgba(0, 0, 0, .25); font-size: .8rem; }
</style>
