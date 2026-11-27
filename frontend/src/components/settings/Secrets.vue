<template>
    <div class="my-4">
        <h4>{{ $t('stackSecrets.title') }}</h4>
        <p class="text-muted small">{{ $t('stackSecrets.onePasswordPreview') }}</p>
        <p>{{ $t('stackSecrets.settingsHint') }}</p>
        <label for="secrets-instance" class="form-label">{{ $t('configTools.instance') }}</label>
        <select id="secrets-instance" v-model="endpoint" class="form-select mb-3" :disabled="busy">
            <option v-if="!$root.info.hubOnly" value="">{{ $t('currentEndpoint') }}</option>
            <template v-for="(agent, key) in $root.agentList" :key="key">
                <option v-if="key" :value="key">{{ agent.displayName || key }}</option>
            </template>
        </select>
        <div v-if="message" class="alert" :class="failed ? 'alert-danger' : 'alert-success'" role="status">{{ message }}</div>
        <div v-for="connection in connections" :key="connection.id" class="d-flex align-items-center gap-2 mb-2">
            <span class="flex-grow-1">{{ connection.name }} — {{ providers[connection.provider] }}</span>
            <button type="button" class="btn btn-sm btn-outline-primary" :disabled="busy" @click="edit(connection)">{{ $t('Edit') }}</button>
            <button type="button" class="btn btn-sm btn-outline-danger" :disabled="busy" @click="remove(connection)">{{ $t('Delete') }}</button>
        </div>
        <form class="shadow-box big-padding mt-3" autocomplete="off" @submit.prevent="save">
            <fieldset :disabled="busy || ($root.info.hubOnly && !endpoint)">
                <label for="secrets-name" class="form-label">{{ $t('Name') }}</label>
                <input id="secrets-name" v-model.trim="form.name" class="form-control mb-3" maxlength="100" required>
                <label for="secrets-provider" class="form-label">{{ $t('stackSecrets.provider') }}</label>
                <select id="secrets-provider" v-model="form.provider" class="form-select mb-3" :disabled="!!form.id" @change="providerChanged">
                    <option v-for="(label, value) in providers" :key="value" :value="value">{{ label }}</option>
                </select>
                <template v-if="['bitwarden', 'infisical'].includes(form.provider)">
                    <label for="secrets-url" class="form-label">{{ $t('stackSecrets.url') }}</label>
                    <input id="secrets-url" v-model.trim="form.url" type="url" class="form-control mb-3" required>
                </template>
                <template v-if="form.provider === 'infisical'">
                    <label for="secrets-client" class="form-label">Client ID</label>
                    <input id="secrets-client" v-model.trim="form.clientId" class="form-control mb-3" required>
                </template>
                <div v-if="form.provider === 'bitwarden'" class="alert alert-info">
                    <p>{{ $t('stackSecrets.bitwardenInstallHint') }} <a href="https://github.com/bitwarden/sdk-sm/blob/bws-v2.1.0/LICENSE" target="_blank" rel="noopener noreferrer">{{ $t('stackSecrets.license') }}</a></p>
                    <button type="button" class="btn btn-outline-primary" :disabled="toolInstalled" @click="request('stackSecrets:installBitwarden', {})">{{ $t(toolInstalled ? 'stackSecrets.cliInstalled' : 'stackSecrets.installCli') }}</button>
                </div>
                <label for="secrets-token" class="form-label">{{ $t(form.provider === 'infisical' ? 'stackSecrets.clientSecret' : 'stackSecrets.token') }}</label>
                <input id="secrets-token" v-model="form.token" type="password" autocomplete="new-password" class="form-control" :required="!form.id">
                <div class="form-text mb-3">{{ $t('stackSecrets.tokenHint') }}</div>
                <button type="submit" class="btn btn-primary me-2">{{ $t('Save') }}</button>
                <button type="button" class="btn btn-secondary" @click="reset">{{ $t('stackSecrets.newConnection') }}</button>
            </fieldset>
        </form>
    </div>
</template>
<script>
const providers = { bitwarden: "Bitwarden Secrets Manager",
    onepassword: "1Password",
    doppler: "Doppler",
    infisical: "Infisical" };
const blank = () => ({ id: "",
    name: "",
    provider: "bitwarden",
    url: "https://vault.bitwarden.com",
    token: "",
    clientId: "" });
export default {
    data: () => ({ providers,
        toolInstalled: false,
        endpoint: "",
        connections: [],
        form: blank(),
        message: "",
        failed: false,
        busy: false,
        generation: 0 }),
    watch: { endpoint() {
        this.reset();
        this.load();
    } },
    mounted() {
        this.load();
    },
    beforeUnmount() {
        this.generation++;
        this.form.token = "";
    },
    methods: {
        reset() {
            this.form = blank();
        },
        providerChanged() {
            this.form.token = "";
            this.form.clientId = "";
            this.form.url = this.form.provider === "infisical" ? "https://app.infisical.com" : "https://vault.bitwarden.com";
        },
        edit(connection) {
            this.form = { ...connection,
                token: "" };
        },
        request(event, payload) {
            this.busy = true;
            this.message = "";
            const generation = ++this.generation;
            this.$root.emitAgent(this.endpoint, event, payload, res => {
                if (generation !== this.generation) {
                    return;
                }
                this.busy = false;
                this.failed = !res.ok;
                if (res.ok) {
                    this.connections = res.data;
                    this.reset();
                    this.refreshTool();
                } else {
                    this.message = this.$t(res.msg || "stackSecrets.unavailable");
                }
            });
        },
        refreshTool() {
            const endpoint = this.endpoint;
            this.$root.emitAgent(endpoint, "stackSecrets:toolStatus", {}, res => {
                if (this.endpoint === endpoint) {
                    this.toolInstalled = !!res.data?.available;
                }
            });
        },
        load() {
            if (!this.$root.info.hubOnly || this.endpoint) {
                this.request("stackSecrets:list", {});
            }
        },
        save() {
            const payload = { ...this.form };
            this.form.token = "";
            this.request("stackSecrets:save", payload);
        },
        remove(connection) {
            if (window.confirm(this.$t("stackSecrets.deleteConfirm", { name: connection.name }))) {
                this.request("stackSecrets:delete", { id: connection.id });
            }
        },
    },
};
</script>
