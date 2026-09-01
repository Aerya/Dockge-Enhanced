<template>
    <div class="container-fluid external-stacks-page">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
            <div>
                <h1 class="mb-1"><font-awesome-icon icon="folder-open" class="me-2" />{{ $t("externalStacks.heading") }}</h1>
                <p class="form-text mb-0">{{ $t("externalStacks.intro") }}</p>
            </div>
            <button class="btn btn-normal" :disabled="loading" @click="refresh">
                <font-awesome-icon :icon="loading ? 'spinner' : 'arrows-rotate'" :spin="loading" class="me-1" />{{ $t("externalStacks.scan") }}
            </button>
        </div>

        <div class="alert alert-warning py-2"><font-awesome-icon icon="flask" class="me-2" />{{ $t("externalStacks.experimental") }}</div>
        <div class="alert alert-info py-2"><font-awesome-icon icon="server" class="me-2" />{{ $t("externalStacks.localOnly") }}</div>
        <div class="shadow-box p-3 mb-3">
            <div class="fw-bold mb-2">{{ $t("externalStacks.allowedRoots") }}</div>
            <ul v-if="allowedMounts.length" class="external-root-list font-monospace small mb-3">
                <li v-for="mount in allowedMounts" :key="`${mount.source}:${mount.destination}`"><code>{{ mount.source }}:{{ mount.destination }}</code></li>
            </ul>
            <div v-else class="text-warning small mb-3">{{ $t("externalStacks.noAllowedMounts") }}</div>
            <div class="external-path-help">
                <span class="badge text-bg-success">{{ $t("externalStacks.path.accessible") }}</span>
                <span class="form-text">{{ $t("externalStacks.accessibleHelp") }}</span>
                <span class="badge text-bg-warning">{{ $t("externalStacks.path.not-authorized") }}</span>
                <span class="form-text">{{ $t("externalStacks.allowedRootsHelp") }}</span>
                <span class="badge text-bg-secondary">{{ $t("externalStacks.path.not-accessible") }}</span>
                <span class="form-text">{{ $t("externalStacks.notAccessibleHelp") }}</span>
            </div>
        </div>

        <div v-if="hasScanned" class="external-stack-counts mb-3" role="status">
            <div class="external-stack-count text-success"><span>{{ statusCounts.accessible }}</span>{{ $tc("externalStacks.count.accessible", statusCounts.accessible) }}</div>
            <div class="external-stack-count text-warning"><span>{{ statusCounts.notAuthorized }}</span>{{ $tc("externalStacks.count.not-authorized", statusCounts.notAuthorized) }}</div>
            <div class="external-stack-count text-secondary"><span>{{ statusCounts.notAccessible }}</span>{{ $tc("externalStacks.count.not-accessible", statusCounts.notAccessible) }}</div>
        </div>

        <div v-if="!loading && stacks.length === 0" class="shadow-box p-4 text-center text-muted">{{ $t("externalStacks.empty") }}</div>
        <div v-for="stack in stacks" :key="stack.project" class="shadow-box p-3 mb-3 external-stack-card">
            <div class="d-flex flex-wrap justify-content-between align-items-start gap-2">
                <div>
                    <h2 class="h5 mb-1">{{ stack.project }} <span v-if="stack.imported" class="badge text-bg-info ms-1">{{ $t("externalStacks.imported") }}</span></h2>
                    <span class="badge" :class="stack.status === 'running' ? 'text-bg-success' : 'text-bg-secondary'">{{ stack.status }}</span>
                    <span class="badge ms-1" :class="statusClass(stack.pathStatus)">{{ $t(`externalStacks.path.${stack.pathStatus}`) }}</span>
                </div>
                <div v-if="!stack.imported" class="external-stack-import d-flex gap-2">
                    <input v-model="names[stack.project]" class="form-control form-control-sm external-stack-name" :aria-label="$t('externalStacks.name')" :placeholder="$t('externalStacks.name')">
                    <button class="btn btn-sm btn-primary" :disabled="stack.pathStatus !== 'accessible' || !stack.composeFile || importing === stack.project" @click="importStack(stack)">
                        <font-awesome-icon :icon="importing === stack.project ? 'spinner' : 'plus'" :spin="importing === stack.project" class="me-1" />{{ $t("externalStacks.import") }}
                    </button>
                </div>
            </div>
            <dl class="row small mt-3 mb-0">
                <dt class="col-sm-3">{{ $t("externalStacks.composeFile") }}</dt><dd class="col-sm-9 font-monospace">{{ stack.composeFile || "—" }}</dd>
                <dt class="col-sm-3">{{ $t("externalStacks.volumes") }}</dt>
                <dd class="col-sm-9">
                    <ul v-if="stack.mounts.length" class="external-volume-list font-monospace mb-0"><li v-for="mount in stack.mounts" :key="mount">{{ formatMount(mount) }}</li></ul>
                    <span v-else>—</span>
                </dd>
            </dl>
            <div v-if="stack.pathStatus === 'not-accessible'" class="external-stack-requirements is-unavailable mt-3 small">
                <div class="fw-bold mb-1">{{ $t("externalStacks.requiredConfiguration") }}</div>
                <div>{{ $t("externalStacks.requiredVolume") }}</div>
                <code v-if="stack.workingDir">- {{ stack.workingDir }}:{{ stack.workingDir }}</code>
                <div v-else>{{ $t("externalStacks.composePathUnavailable") }}</div>
                <div v-if="stack.workingDir" class="mt-1">{{ $t("externalStacks.requiredAllowedPath", { path: stack.workingDir }) }}</div>
            </div>
            <div v-else-if="stack.pathStatus === 'not-authorized'" class="external-stack-requirements is-warning mt-3 small">
                <div class="fw-bold mb-1">{{ $t("externalStacks.requiredConfiguration") }}</div>
                <div>{{ $t("externalStacks.noAdditionalVolume") }}</div>
                <div v-if="stack.workingDir">{{ $t("externalStacks.requiredAllowedPath", { path: stack.workingDir }) }}</div>
            </div>
        </div>
    </div>
</template>

<script>
export default {
    data() {
        return {
            stacks: [],
            allowedMounts: [],
            names: {},
            loading: false,
            importing: "",
            hasScanned: false,
        };
    },
    computed: {
        statusCounts() {
            return {
                accessible: this.stacks.filter((stack) => stack.pathStatus === "accessible").length,
                notAuthorized: this.stacks.filter((stack) => stack.pathStatus === "not-authorized").length,
                notAccessible: this.stacks.filter((stack) => stack.pathStatus === "not-accessible" || stack.pathStatus === "unknown").length,
            };
        },
    },
    mounted() {
        this.refresh();
    },
    methods: {
        suggestedName(project) {
            return `external-${project.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "")}`.slice(0, 96);
        },
        refresh() {
            this.loading = true;
            let completed = false;
            const timeout = window.setTimeout(() => {
                if (completed) {
                    return;
                }
                completed = true;
                this.loading = false;
                this.$root.toastError(this.$t("externalStacks.timeout"));
            }, 15000);
            this.$root.emitAgent("", "discoverExternalStacks", (res) => {
                if (completed) {
                    return;
                }
                completed = true;
                window.clearTimeout(timeout);
                this.loading = false;
                if (!res?.ok) {
                    return this.$root.toastRes(res);
                }
                this.stacks = res.stacks || [];
                this.allowedMounts = res.allowedMounts || [];
                this.hasScanned = true;
                for (const stack of this.stacks) {
                    if (!this.names[stack.project]) {
                        this.names[stack.project] = this.suggestedName(stack.project);
                    }
                }
            });
        },
        importStack(stack) {
            this.importing = stack.project;
            this.$root.emitAgent("", "importExternalStack", {
                name: this.names[stack.project],
                project: stack.project,
                composeFile: stack.composeFile,
            }, (res) => {
                this.importing = "";
                this.$root.toastRes(res);
                if (res?.ok) {
                    this.refresh();
                }
            });
        },
        statusClass(status) {
            return {
                accessible: "text-bg-success",
                "not-accessible": "text-bg-secondary",
                "not-authorized": "text-bg-warning",
                unknown: "text-bg-secondary",
            }[status] || "text-bg-secondary";
        },
        formatMount(mount) {
            return mount.replace(/^bind:\s*/, "").replace(/^volume:\s*/, "");
        },
    },
};
</script>

<style lang="scss" scoped>
.external-stacks-page { max-width: 1200px; }
.external-stack-card { overflow-wrap: anywhere; }
.external-stack-import { align-items: center; }
.external-stack-name { width: 170px; }
.external-stack-import .btn { white-space: nowrap; }
.external-root-list { padding-left: 1.35rem; }
.external-root-list li + li { margin-top: .3rem; }
.external-path-help { display: grid; grid-template-columns: max-content minmax(0, 1fr); align-items: start; gap: .55rem .65rem; }
.external-path-help .badge { align-self: start; justify-self: start; }
.external-path-help .form-text { align-self: start; margin-top: 0; }
.external-stack-counts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem; }
.external-stack-count { display: flex; align-items: center; justify-content: center; gap: .55rem; padding: .65rem .8rem; border: 1px solid var(--border-color); border-radius: .65rem; background: var(--bg-raised); font-weight: 600; }
.external-stack-count span { font-size: 1.2rem; }
.external-volume-list { padding-left: 1.1rem; }
.external-volume-list li + li { margin-top: .25rem; }
.external-stack-requirements { padding: .75rem; border: 1px solid var(--border-color); border-left-width: 3px; border-radius: var(--radius-sm); background: var(--bg-raised); color: var(--text-color); }
.external-stack-requirements.is-warning { border-left-color: var(--warning); }
.external-stack-requirements.is-unavailable { border-left-color: var(--text-muted); }
.external-stack-requirements code { display: block; width: fit-content; max-width: 100%; margin-top: .35rem; padding: .35rem .5rem; overflow-wrap: anywhere; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-input); color: var(--text-color); }
@media (max-width: 576px) {
    .external-stack-import { width: 100%; }
    .external-stack-name { min-width: 0; width: 100%; }
    .external-stack-counts { grid-template-columns: 1fr; }
}
</style>
