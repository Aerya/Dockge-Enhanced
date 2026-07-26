<template>
    <details class="shadow-box big-padding mb-3" @toggle="onToggle">
        <summary class="git-summary">
            <div>
                <h5 class="settings-subheading mb-1">
                    <font-awesome-icon icon="code-branch" class="me-2" />Git
                </h5>
                <p class="form-text mb-0">{{ $t("stackGit.hint") }}</p>
            </div>
            <button class="btn btn-sm btn-normal" :disabled="loading" @click.prevent="load">
                <font-awesome-icon :icon="loading ? 'spinner' : 'arrows-rotate'" :spin="loading" />
            </button>
        </summary>

        <div v-if="opened" class="mt-3">
            <div v-if="error" class="alert alert-danger py-2">{{ error }}</div>

            <div v-if="status && !status.initialized">
                <div class="alert alert-info">{{ $t("stackGit.notInitialized") }}</div>
                <button class="btn btn-primary" :disabled="acting" @click="action('init')">
                    {{ $t("stackGit.initialize") }}
                </button>
            </div>

            <template v-else-if="status">
                <div class="row g-3 mb-3">
                    <div class="col-md-4">
                        <strong>{{ $t("stackGit.branch") }}:</strong> <code>{{ status.branch || "HEAD" }}</code>
                    </div>
                    <div class="col-md-8">
                        <strong>{{ $t("stackGit.remote") }}:</strong> <code>{{ status.remote || "—" }}</code>
                    </div>
                </div>

                <div class="input-group mb-3">
                    <input v-model.trim="remote" class="form-control" placeholder="https://github.com/owner/repository.git">
                    <button class="btn btn-normal" :disabled="acting || !remote" @click="setRemote">
                        {{ $t("stackGit.saveRemote") }}
                    </button>
                </div>
                <div class="form-text mb-3">{{ $t("stackGit.credentialsHint") }}</div>

                <div v-if="status.changes.length" class="mb-3">
                    <h6>{{ $t("stackGit.changes") }}</h6>
                    <ul class="list-unstyled font-monospace small">
                        <li v-for="change in status.changes" :key="`${change.status}:${change.path}`" :class="{ 'text-danger': change.sensitive }">
                            <code>{{ change.status }}</code> {{ change.path }}
                            <span v-if="change.sensitive"> — {{ $t("stackGit.sensitiveBlocked") }}</span>
                        </li>
                    </ul>
                    <button class="btn btn-sm btn-normal" :disabled="loadingDiff" @click="loadDiff">
                        {{ $t("stackGit.showDiff") }}
                    </button>
                </div>
                <div v-else class="alert alert-success py-2">{{ $t("stackGit.clean") }}</div>

                <pre v-if="diff !== null" class="git-output">{{ diff || $t("stackGit.emptyDiff") }}</pre>

                <div class="input-group mb-3">
                    <input v-model.trim="commitMessage" class="form-control" maxlength="500" :placeholder="$t('stackGit.commitMessage')">
                    <button class="btn btn-primary" :disabled="acting || !commitMessage || status.changes.length === 0" @click="commit">
                        {{ $t("stackGit.commit") }}
                    </button>
                </div>

                <div class="d-flex flex-wrap gap-2 mb-4">
                    <button class="btn btn-normal" :disabled="acting" @click="confirmedAction('pull')">
                        <font-awesome-icon icon="cloud-arrow-down" class="me-1" />Pull --ff-only
                    </button>
                    <button class="btn btn-normal" :disabled="acting" @click="confirmedAction('push')">
                        <font-awesome-icon icon="cloud-arrow-up" class="me-1" />Push
                    </button>
                </div>

                <div v-if="status.history.length">
                    <h6>{{ $t("stackGit.history") }}</h6>
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <tbody>
                                <tr v-for="entry in status.history" :key="entry.hash">
                                    <td><code>{{ entry.hash.slice(0, 10) }}</code></td>
                                    <td>{{ new Date(entry.date).toLocaleString() }}</td>
                                    <td>{{ entry.message }}</td>
                                    <td class="text-end">
                                        <button class="btn btn-sm btn-outline-warning" :disabled="acting || status.changes.length > 0" @click="restore(entry)">
                                            {{ $t("stackGit.restore") }}
                                        </button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </template>
        </div>
    </details>
</template>

<script>
export default {
    props: {
        stackName: {
            type: String,
            required: true,
        },
    },
    data() {
        return {
            status: null,
            diff: null,
            remote: "",
            commitMessage: "",
            loading: false,
            loadingDiff: false,
            acting: false,
            error: "",
            opened: false,
            loaded: false,
        };
    },
    methods: {
        onToggle(event) {
            this.opened = event.target.open;
            if (this.opened && !this.loaded) {
                this.loaded = true;
                this.load();
            }
        },
        async api(method, path, body) {
            const response = await fetch(`/api/stack-tools/${encodeURIComponent(this.stackName)}/git${path}`, {
                method,
                headers: {
                    "Authorization": `Bearer ${this.$root.getAuthToken()}`,
                    ...(body === undefined ? {} : { "Content-Type": "application/json" }),
                },
                body: body === undefined ? undefined : JSON.stringify(body),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.ok === false) {
                throw new Error(data.message || `HTTP ${response.status}`);
            }
            return data.data;
        },
        async load() {
            this.loading = true;
            this.error = "";
            try {
                this.status = await this.api("GET", "/status");
                this.remote = this.status.remote ?? "";
            } catch (error) {
                this.error = error instanceof Error ? error.message : String(error);
            } finally {
                this.loading = false;
            }
        },
        async action(action, body) {
            this.acting = true;
            this.error = "";
            try {
                this.status = await this.api("POST", `/${action}`, body);
                this.diff = null;
            } catch (error) {
                this.error = error instanceof Error ? error.message : String(error);
            } finally {
                this.acting = false;
            }
        },
        confirmedAction(action) {
            if (confirm(this.$t(`stackGit.${action}Confirm`))) {
                this.action(action);
            }
        },
        async setRemote() {
            await this.action("remote", { remote: this.remote });
        },
        async commit() {
            await this.action("commit", { message: this.commitMessage });
            if (!this.error) {
                this.commitMessage = "";
            }
        },
        async loadDiff() {
            this.loadingDiff = true;
            this.error = "";
            try {
                this.diff = await this.api("GET", "/diff");
            } catch (error) {
                this.error = error instanceof Error ? error.message : String(error);
            } finally {
                this.loadingDiff = false;
            }
        },
        restore(entry) {
            if (confirm(this.$t("stackGit.restoreConfirm", { hash: entry.hash.slice(0, 10) }))) {
                this.action("restore", { ref: entry.hash });
            }
        },
    },
};
</script>

<style scoped>
.git-output {
    max-height: 26rem;
    overflow: auto;
    padding: .85rem;
    border-radius: .5rem;
    color: #d8dee9;
    background: #1f2430;
    white-space: pre-wrap;
}

.git-summary {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: .5rem;
    cursor: pointer;
    list-style-position: outside;
}
</style>
