<template>
    <details class="shadow-box big-padding mb-3" @toggle="opened">
        <summary>{{ $t('stackSecrets.title') }}</summary>
        <div class="mt-3">
            <p class="alert alert-warning">{{ $t('stackSecrets.experimental') }}</p>
            <p>{{ $t('stackSecrets.stackHint') }}</p>
            <div v-if="message" class="alert" :class="failed ? 'alert-danger' : 'alert-success'" role="status">{{ message }}</div>
            <form @submit.prevent="save">
                <fieldset :disabled="busy || !loaded">
                    <label :for="inputId + '-connection'" class="form-label">{{ $t('stackSecrets.connection') }}</label>
                    <select :id="inputId + '-connection'" v-model="binding.connection" class="form-select mb-3">
                        <option value="">{{ $t('stackSecrets.none') }}</option>
                        <option v-for="connection in connections" :key="connection.id" :value="connection.id">{{ connection.name }}</option>
                    </select>
                    <template v-if="binding.connection">
                        <div v-if="provider !== 'onepassword'" class="mb-3">
                            <label :for="inputId + '-project'" class="form-label">{{ $t('stackSecrets.project') }}</label>
                            <input :id="inputId + '-project'" v-model.trim="binding.project" class="form-control" :required="provider !== 'doppler'">
                        </div>
                        <div v-if="provider !== 'bitwarden'" class="mb-3">
                            <label :for="inputId + '-environment'" class="form-label">{{ $t('stackSecrets.environment') }}</label>
                            <input :id="inputId + '-environment'" v-model.trim="binding.environment" class="form-control" :required="provider !== 'doppler'">
                        </div>
                        <div v-if="provider === 'infisical'" class="mb-3">
                            <label :for="inputId + '-path'" class="form-label">{{ $t('stackSecrets.path') }}</label>
                            <input :id="inputId + '-path'" v-model.trim="binding.secretPath" class="form-control" required>
                        </div>
                    </template>
                    <button type="submit" class="btn btn-primary me-2">{{ $t('Save') }}</button>
                    <button type="button" class="btn btn-outline-primary" :disabled="!savedConnection || dirty" @click="test">{{ $t('stackSecrets.test') }}</button>
                </fieldset>
            </form>
        </div>
    </details>
</template>
<script>
const empty = () => ({ connection: "",
    project: "",
    environment: "",
    secretPath: "/" });
export default {
    props: { endpoint: { type: String,
        default: "" },
    stackName: { type: String,
        required: true } },
    data: () => ({ connections: [],
        binding: empty(),
        snapshot: "",
        savedConnection: "",
        loaded: false,
        busy: false,
        message: "",
        failed: false,
        generation: 0 }),
    computed: {
        inputId() {
            return "secrets-" + this.stackName;
        },
        provider() {
            return this.connections.find(item => item.id === this.binding.connection)?.provider;
        },
        dirty() {
            return JSON.stringify(this.binding) !== this.snapshot;
        },
    },
    beforeUnmount() {
        this.generation++;
    },
    methods: {
        opened(event) {
            if (event.target.open && !this.loaded) {
                this.load();
            }
        },
        request(event, payload, done) {
            this.busy = true;
            this.message = "";
            const generation = ++this.generation;
            this.$root.emitAgent(this.endpoint, event, { name: this.stackName,
                ...payload }, res => {
                if (generation !== this.generation) {
                    return;
                }
                this.busy = false;
                this.failed = !res.ok;
                if (res.ok) {
                    done(res.data);
                } else {
                    this.message = this.$t(res.msg || "stackSecrets.unavailable");
                }
            });
        },
        load() {
            this.request("stackSecrets:getBinding", {}, data => {
                this.connections = data.connections;
                this.binding = data.binding || empty();
                this.snapshot = JSON.stringify(this.binding);
                this.savedConnection = this.binding.connection;
                this.loaded = true;
            });
        },
        save() {
            this.request("stackSecrets:bind", { binding: this.binding.connection ? { ...this.binding } : null }, () => {
                this.snapshot = JSON.stringify(this.binding);
                this.savedConnection = this.binding.connection;
                this.message = this.$t("stackSecrets.saved");
            });
        },
        test() {
            this.request("stackSecrets:test", {}, () => {
                this.message = this.$t("stackSecrets.testSuccess");
            });
        },
    },
};
</script>
