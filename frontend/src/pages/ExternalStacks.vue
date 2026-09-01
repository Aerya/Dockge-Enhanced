<template>
    <div class="container-fluid external-stacks-page">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
            <div>
                <h1 class="mb-1"><font-awesome-icon icon="folder-open" class="me-2" />{{ $t("externalStacks.heading") }}</h1>
                <p class="form-text mb-0">{{ $t("externalStacks.intro") }}</p>
            </div>
            <button class="btn btn-normal" :disabled="loading" @click="refresh">
                <font-awesome-icon :icon="loading ? 'spinner' : 'arrows-rotate'" :spin="loading" class="me-1" />{{ $t("refresh") }}
            </button>
        </div>

        <div class="alert alert-warning py-2"><font-awesome-icon icon="flask" class="me-2" />{{ $t("externalStacks.experimental") }}</div>
        <div class="shadow-box p-3 mb-3">
            <div class="fw-bold mb-1">{{ $t("externalStacks.allowedRoots") }}</div>
            <div v-if="allowedRoots.length" class="font-monospace small">{{ allowedRoots.join(" · ") }}</div>
            <div v-else class="text-warning small">{{ $t("externalStacks.noAllowedRoots") }}</div>
            <div class="form-text mt-2">{{ $t("externalStacks.allowedRootsHelp") }}</div>
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
                    <input v-model="names[stack.project]" class="form-control form-control-sm" :aria-label="$t('externalStacks.name')" :placeholder="$t('externalStacks.name')">
                    <button class="btn btn-sm btn-primary" :disabled="stack.pathStatus !== 'accessible' || !stack.composeFile || importing === stack.project" @click="importStack(stack)">
                        <font-awesome-icon :icon="importing === stack.project ? 'spinner' : 'plus'" :spin="importing === stack.project" class="me-1" />{{ $t("externalStacks.import") }}
                    </button>
                </div>
            </div>
            <dl class="row small mt-3 mb-0">
                <dt class="col-sm-3">{{ $t("externalStacks.composeFile") }}</dt><dd class="col-sm-9 font-monospace">{{ stack.composeFile || "—" }}</dd>
                <dt class="col-sm-3">{{ $t("externalStacks.workingDir") }}</dt><dd class="col-sm-9 font-monospace">{{ stack.workingDir || "—" }}</dd>
                <dt class="col-sm-3">{{ $t("externalStacks.mounts") }}</dt><dd class="col-sm-9"><span v-if="stack.mounts.length" class="font-monospace">{{ stack.mounts.join(" · ") }}</span><span v-else>—</span></dd>
            </dl>
        </div>
    </div>
</template>

<script>
export default {
    data() {
        return { stacks: [], allowedRoots: [], names: {}, loading: false, importing: "" };
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
                if (completed) return;
                completed = true;
                this.loading = false;
                this.$root.toastError(this.$t("externalStacks.timeout"));
            }, 15000);
            this.$root.emitAgent("", "discoverExternalStacks", (res) => {
                if (completed) return;
                completed = true;
                window.clearTimeout(timeout);
                this.loading = false;
                if (!res?.ok) return this.$root.toastRes(res);
                this.stacks = res.stacks || [];
                this.allowedRoots = res.allowedRoots || [];
                for (const stack of this.stacks) {
                    if (!this.names[stack.project]) this.names[stack.project] = this.suggestedName(stack.project);
                }
            });
        },
        importStack(stack) {
            this.importing = stack.project;
            this.$root.emitAgent("", "importExternalStack", {
                name: this.names[stack.project], project: stack.project, composeFile: stack.composeFile,
            }, (res) => {
                this.importing = "";
                this.$root.toastRes(res);
                if (res?.ok) this.refresh();
            });
        },
        statusClass(status) {
            return {
                accessible: "text-bg-success", "not-accessible": "text-bg-secondary", "not-authorized": "text-bg-warning", unknown: "text-bg-secondary",
            }[status] || "text-bg-secondary";
        },
    },
};
</script>

<style lang="scss" scoped>
.external-stacks-page { max-width: 1200px; }
.external-stack-card { overflow-wrap: anywhere; }
.external-stack-import { min-width: min(100%, 340px); }
@media (max-width: 576px) { .external-stack-import { width: 100%; } }
</style>
