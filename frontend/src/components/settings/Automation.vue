<template>
    <div class="my-4">
        <div class="mb-4">
            <h4 class="mb-1">{{ $t("automation.heading") }}</h4>
            <p class="text-muted mb-0">{{ $t("automation.description") }}</p>
        </div>

        <div v-if="error" class="alert alert-danger">{{ error }}</div>

        <section class="shadow-box big-padding mb-4">
            <h5 class="settings-subheading">{{ $t("automation.tokens.heading") }}</h5>
            <p class="form-text">{{ $t("automation.tokens.hint") }}</p>

            <div v-if="createdToken" class="alert alert-warning">
                <strong>{{ $t("automation.secretOnce") }}</strong>
                <div class="input-group mt-2">
                    <input :value="createdToken" class="form-control font-monospace" readonly>
                    <button type="button" class="btn btn-normal" @click="copy(createdToken)">
                        <font-awesome-icon icon="copy" /> {{ $t("Copy") }}
                    </button>
                </div>
                <pre class="example mt-2 mb-0">curl -H "Authorization: Bearer {{ createdToken }}" {{ origin }}/api/v1/stacks</pre>
            </div>

            <form class="row g-3 mb-4" @submit.prevent="createToken">
                <div class="col-md-6">
                    <label class="form-label" for="automation-token-name">{{ $t("automation.name") }}</label>
                    <input id="automation-token-name" v-model.trim="tokenForm.name" class="form-control" required maxlength="120">
                </div>
                <div class="col-md-6">
                    <label class="form-label" for="automation-token-expiry">{{ $t("automation.expiresAt") }}</label>
                    <input id="automation-token-expiry" v-model="tokenForm.expiresAt" class="form-control" type="datetime-local">
                </div>
                <div class="col-12">
                    <label class="form-label">{{ $t("automation.permissions") }}</label>
                    <div class="permission-grid">
                        <label v-for="permission in permissions" :key="permission" class="form-check">
                            <input v-model="tokenForm.permissions" class="form-check-input" type="checkbox" :value="permission">
                            <span class="form-check-label"><code>{{ permission }}</code></span>
                        </label>
                    </div>
                </div>
                <div class="col-12">
                    <label class="form-label">{{ $t("automation.stacks") }}</label>
                    <div class="d-flex flex-wrap gap-3">
                        <label class="form-check">
                            <input v-model="tokenForm.allStacks" class="form-check-input" type="checkbox">
                            <span class="form-check-label">{{ $t("automation.allStacks") }}</span>
                        </label>
                        <label v-for="stack in stacks" :key="stack.name" class="form-check">
                            <input v-model="tokenForm.stacks" class="form-check-input" type="checkbox" :value="stack.name" :disabled="tokenForm.allStacks">
                            <span class="form-check-label">{{ stack.name }}</span>
                        </label>
                    </div>
                </div>
                <div class="col-12">
                    <button class="btn btn-primary" :disabled="savingToken">
                        <font-awesome-icon :icon="savingToken ? 'spinner' : 'key'" :spin="savingToken" class="me-1" />
                        {{ $t("automation.tokens.create") }}
                    </button>
                </div>
            </form>

            <div class="table-responsive">
                <table class="table table-sm align-middle">
                    <thead>
                        <tr>
                            <th>{{ $t("automation.name") }}</th>
                            <th>{{ $t("automation.prefix") }}</th>
                            <th>{{ $t("automation.scope") }}</th>
                            <th>{{ $t("automation.lastUsed") }}</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="token in tokens" :key="token.id">
                            <td>{{ token.name }}</td>
                            <td><code>{{ token.prefix }}</code></td>
                            <td>
                                <div>{{ token.stacks.join(", ") }}</div>
                                <small class="text-muted">{{ token.permissions.join(", ") }}</small>
                            </td>
                            <td>{{ formatDate(token.lastUsedAt) }}</td>
                            <td class="text-end">
                                <span v-if="token.revokedAt" class="badge bg-secondary">{{ $t("automation.revoked") }}</span>
                                <button v-else type="button" class="btn btn-sm btn-danger" @click="revokeToken(token)">
                                    {{ $t("automation.revoke") }}
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>

        <section class="shadow-box big-padding">
            <h5 class="settings-subheading">{{ $t("automation.webhooks.heading") }}</h5>
            <p class="form-text">{{ $t("automation.webhooks.hint") }}</p>

            <div v-if="createdWebhook" class="alert alert-warning">
                <strong>{{ $t("automation.secretOnce") }}</strong>
                <div class="input-group mt-2">
                    <input :value="webhookUrl(createdWebhook.token, createdWebhook.action)" class="form-control font-monospace" readonly>
                    <button type="button" class="btn btn-normal" @click="copy(webhookUrl(createdWebhook.token, createdWebhook.action))">
                        <font-awesome-icon icon="copy" /> {{ $t("Copy") }}
                    </button>
                </div>
                <pre class="example mt-2 mb-0">curl -X POST "{{ webhookUrl(createdWebhook.token, createdWebhook.action) }}"</pre>
                <details class="mt-2">
                    <summary>{{ $t("automation.examples") }}</summary>
                    <pre class="example mt-2">{{ $t("automation.homeAssistantExample", { url: webhookUrl(createdWebhook.token, createdWebhook.action) }) }}</pre>
                    <pre class="example">{{ $t("automation.githubExample", { url: webhookUrl(createdWebhook.token, createdWebhook.action) }) }}</pre>
                    <pre class="example mb-0">{{ $t("automation.uptimeKumaExample", { url: webhookUrl(createdWebhook.token, createdWebhook.action) }) }}</pre>
                </details>
            </div>

            <form class="row g-3 mb-4" @submit.prevent="createWebhook">
                <div class="col-md-6">
                    <label class="form-label" for="automation-webhook-name">{{ $t("automation.name") }}</label>
                    <input id="automation-webhook-name" v-model.trim="webhookForm.name" class="form-control" required maxlength="120">
                </div>
                <div class="col-md-6">
                    <label class="form-label" for="automation-webhook-stack">{{ $t("automation.stack") }}</label>
                    <select id="automation-webhook-stack" v-model="webhookForm.stack" class="form-select" required>
                        <option disabled value="">{{ $t("automation.selectStack") }}</option>
                        <option v-for="stack in stacks" :key="stack.name" :value="stack.name">{{ stack.name }}</option>
                    </select>
                </div>
                <div class="col-md-6">
                    <label class="form-label" for="automation-webhook-expiry">{{ $t("automation.expiresAt") }}</label>
                    <input id="automation-webhook-expiry" v-model="webhookForm.expiresAt" class="form-control" type="datetime-local">
                </div>
                <div class="col-md-6">
                    <label class="form-label" for="automation-webhook-rate">{{ $t("automation.rateLimit") }}</label>
                    <input id="automation-webhook-rate" v-model.number="webhookForm.rateLimitPerMinute" class="form-control" type="number" min="1" max="60">
                </div>
                <div class="col-12">
                    <label class="form-label">{{ $t("automation.actions") }}</label>
                    <div class="permission-grid">
                        <label v-for="action in actions" :key="action" class="form-check">
                            <input v-model="webhookForm.actions" class="form-check-input" type="checkbox" :value="action">
                            <span class="form-check-label"><code>{{ action }}</code></span>
                        </label>
                    </div>
                </div>
                <div class="col-12">
                    <button class="btn btn-primary" :disabled="savingWebhook">
                        <font-awesome-icon :icon="savingWebhook ? 'spinner' : 'link'" :spin="savingWebhook" class="me-1" />
                        {{ $t("automation.webhooks.create") }}
                    </button>
                </div>
            </form>

            <div class="table-responsive">
                <table class="table table-sm align-middle">
                    <thead>
                        <tr>
                            <th>{{ $t("automation.name") }}</th>
                            <th>{{ $t("automation.stack") }}</th>
                            <th>{{ $t("automation.actions") }}</th>
                            <th>{{ $t("automation.lastUsed") }}</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="webhook in webhooks" :key="webhook.id">
                            <td>{{ webhook.name }}<br><code>{{ webhook.prefix }}…</code></td>
                            <td>{{ webhook.stack }}</td>
                            <td>{{ webhook.actions.join(", ") }}</td>
                            <td>{{ formatDate(webhook.lastUsedAt) }}</td>
                            <td class="text-end">
                                <div class="btn-group btn-group-sm">
                                    <button type="button" class="btn" :class="webhook.enabled ? 'btn-warning' : 'btn-success'" @click="toggleWebhook(webhook)">
                                        {{ webhook.enabled ? $t("automation.disable") : $t("automation.enable") }}
                                    </button>
                                    <button type="button" class="btn btn-normal" @click="rotateWebhook(webhook)">
                                        {{ $t("automation.rotate") }}
                                    </button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>
    </div>
</template>

<script>
const permissions = [
    "stack:read",
    "stack:start",
    "stack:stop",
    "stack:restart",
    "stack:update",
    "stack:recreate",
    "stack:pull-recreate",
    "stack:build-recreate",
    "stack:backup",
    "history:read",
];
const actions = [ "start", "stop", "restart", "update", "recreate", "pull-recreate", "build-recreate", "backup" ];

export default {
    data() {
        return {
            permissions,
            actions,
            stacks: [],
            tokens: [],
            webhooks: [],
            error: "",
            savingToken: false,
            savingWebhook: false,
            createdToken: "",
            createdWebhook: null,
            tokenForm: {
                name: "",
                permissions: [ "stack:read" ],
                stacks: [],
                allStacks: false,
                expiresAt: "",
            },
            webhookForm: {
                name: "",
                stack: "",
                actions: [ "restart" ],
                expiresAt: "",
                rateLimitPerMinute: 10,
            },
        };
    },
    computed: {
        origin() {
            return window.location.origin;
        },
    },
    mounted() {
        this.load();
    },
    methods: {
        async api(method, path, body) {
            const response = await fetch(`/api/automation${path}`, {
                method,
                headers: {
                    "Authorization": `Bearer ${this.$root.getAuthToken()}`,
                    ...(body === undefined ? {} : { "Content-Type": "application/json" }),
                },
                body: body === undefined ? undefined : JSON.stringify(body),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.ok === false) {
                throw new Error(data.error || data.message || `HTTP ${response.status}`);
            }
            return data.data;
        },
        async load() {
            this.error = "";
            try {
                [ this.stacks, this.tokens, this.webhooks ] = await Promise.all([
                    this.api("GET", "/stacks"),
                    this.api("GET", "/tokens"),
                    this.api("GET", "/webhooks"),
                ]);
            } catch (error) {
                this.error = error instanceof Error ? error.message : String(error);
            }
        },
        expiration(value) {
            return value ? new Date(value).toISOString() : null;
        },
        async createToken() {
            this.savingToken = true;
            this.error = "";
            try {
                const data = await this.api("POST", "/tokens", {
                    name: this.tokenForm.name,
                    permissions: this.tokenForm.permissions,
                    stacks: this.tokenForm.allStacks ? [ "*" ] : this.tokenForm.stacks,
                    expiresAt: this.expiration(this.tokenForm.expiresAt),
                });
                this.createdToken = data.token;
                this.tokenForm.name = "";
                this.tokens = await this.api("GET", "/tokens");
            } catch (error) {
                this.error = error instanceof Error ? error.message : String(error);
            } finally {
                this.savingToken = false;
            }
        },
        async revokeToken(token) {
            if (!confirm(this.$t("automation.revokeConfirm", { name: token.name }))) {
                return;
            }
            try {
                await this.api("DELETE", `/tokens/${token.id}`);
                this.tokens = await this.api("GET", "/tokens");
            } catch (error) {
                this.error = error instanceof Error ? error.message : String(error);
            }
        },
        async createWebhook() {
            this.savingWebhook = true;
            this.error = "";
            try {
                const data = await this.api("POST", "/webhooks", {
                    ...this.webhookForm,
                    expiresAt: this.expiration(this.webhookForm.expiresAt),
                });
                this.createdWebhook = {
                    token: data.token,
                    action: data.item.actions[0],
                };
                this.webhookForm.name = "";
                this.webhooks = await this.api("GET", "/webhooks");
            } catch (error) {
                this.error = error instanceof Error ? error.message : String(error);
            } finally {
                this.savingWebhook = false;
            }
        },
        async toggleWebhook(webhook) {
            try {
                await this.api("PATCH", `/webhooks/${webhook.id}`, { enabled: !webhook.enabled });
                this.webhooks = await this.api("GET", "/webhooks");
            } catch (error) {
                this.error = error instanceof Error ? error.message : String(error);
            }
        },
        async rotateWebhook(webhook) {
            if (!confirm(this.$t("automation.rotateConfirm", { name: webhook.name }))) {
                return;
            }
            try {
                const data = await this.api("POST", `/webhooks/${webhook.id}/rotate`);
                this.createdWebhook = {
                    token: data.token,
                    action: data.item.actions[0],
                };
                this.webhooks = await this.api("GET", "/webhooks");
            } catch (error) {
                this.error = error instanceof Error ? error.message : String(error);
            }
        },
        webhookUrl(token, action) {
            return `${this.origin}/api/webhooks/${token}/${action}`;
        },
        async copy(value) {
            await navigator.clipboard.writeText(value);
            this.$root.toastSuccess(this.$t("Copied"));
        },
        formatDate(value) {
            return value ? new Date(value).toLocaleString() : "—";
        },
    },
};
</script>

<style scoped>
.permission-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
    gap: .35rem 1rem;
}

.example {
    overflow: auto;
    padding: .75rem;
    border-radius: .5rem;
    color: #d8dee9;
    background: #1f2430;
    white-space: pre-wrap;
}
</style>
