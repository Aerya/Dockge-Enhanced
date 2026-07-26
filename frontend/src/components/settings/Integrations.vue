<template>
    <div class="my-4">
        <div class="d-flex justify-content-between align-items-start gap-3 mb-4">
            <div>
                <h4 class="mb-1">PlugNPiN</h4>
                <p class="text-muted mb-0">{{ $t("plugnpin.description") }}</p>
            </div>
            <span class="badge" :class="statusClass">{{ $t(`plugnpin.status.${status}`) }}</span>
        </div>

        <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>
        <div v-if="!settings.architectureSupported" class="alert alert-danger">
            {{ $t("plugnpin.architectureUnsupported", { architecture: settings.architecture }) }}
        </div>

        <form autocomplete="off" @submit.prevent="save">
            <div class="form-check form-switch mb-3">
                <input id="plugnpin-enabled" v-model="settings.enabled" class="form-check-input" type="checkbox" :disabled="!settings.architectureSupported">
                <label class="form-check-label fw-semibold" for="plugnpin-enabled">{{ $t("plugnpin.enable") }}</label>
                <div class="form-text">{{ $t("plugnpin.enableHint") }}</div>
            </div>

            <div v-if="settings.enabled" class="integration-fields">
                <section class="shadow-box big-padding mb-3">
                    <h5 class="settings-subheading">{{ $t("plugnpin.npmHeading") }}</h5>
                    <div class="row g-3">
                        <div class="col-12">
                            <label class="form-label" for="plugnpin-npm-host">{{ $t("plugnpin.host") }}</label>
                            <input id="plugnpin-npm-host" v-model.trim="settings.npmHost" type="url" class="form-control" placeholder="http://nginx-proxy-manager:81" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label" for="plugnpin-npm-user">{{ $t("Username") }}</label>
                            <input id="plugnpin-npm-user" v-model.trim="settings.npmUsername" class="form-control" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label" for="plugnpin-npm-password">{{ $t("Password") }}</label>
                            <input
                                id="plugnpin-npm-password"
                                v-model="passwords.npmPassword"
                                type="password"
                                class="form-control"
                                :required="!settings.npmPasswordConfigured"
                                :placeholder="settings.npmPasswordConfigured ? $t('plugnpin.secretConfigured') : ''"
                            >
                            <div class="form-text">{{ $t("plugnpin.npmPermissionHint") }}</div>
                        </div>
                    </div>
                </section>

                <section class="shadow-box big-padding mb-3">
                    <h5 class="settings-subheading">{{ $t("plugnpin.dnsHeading") }}</h5>
                    <div class="mb-3">
                        <label class="form-label" for="plugnpin-dns-provider">{{ $t("plugnpin.dnsProvider") }}</label>
                        <select id="plugnpin-dns-provider" v-model="settings.dnsProvider" class="form-select">
                            <option value="none">{{ $t("plugnpin.dnsNone") }}</option>
                            <option value="pihole">Pi-hole</option>
                            <option value="adguard">AdGuard Home</option>
                        </select>
                    </div>

                    <div v-if="settings.dnsProvider === 'pihole'" class="row g-3">
                        <div class="col-md-6">
                            <label class="form-label" for="plugnpin-pihole-host">{{ $t("plugnpin.host") }}</label>
                            <input id="plugnpin-pihole-host" v-model.trim="settings.piholeHost" type="url" class="form-control" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label" for="plugnpin-pihole-password">{{ $t("Password") }}</label>
                            <input
                                id="plugnpin-pihole-password"
                                v-model="passwords.piholePassword"
                                type="password"
                                class="form-control"
                                :required="!settings.piholePasswordConfigured"
                                :placeholder="settings.piholePasswordConfigured ? $t('plugnpin.secretConfigured') : ''"
                            >
                        </div>
                    </div>

                    <div v-if="settings.dnsProvider === 'adguard'" class="row g-3">
                        <div class="col-12">
                            <label class="form-label" for="plugnpin-adguard-host">{{ $t("plugnpin.host") }}</label>
                            <input id="plugnpin-adguard-host" v-model.trim="settings.adguardHomeHost" type="url" class="form-control" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label" for="plugnpin-adguard-user">{{ $t("Username") }}</label>
                            <input id="plugnpin-adguard-user" v-model.trim="settings.adguardHomeUsername" class="form-control" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label" for="plugnpin-adguard-password">{{ $t("Password") }}</label>
                            <input
                                id="plugnpin-adguard-password"
                                v-model="passwords.adguardHomePassword"
                                type="password"
                                class="form-control"
                                :required="!settings.adguardHomePasswordConfigured"
                                :placeholder="settings.adguardHomePasswordConfigured ? $t('plugnpin.secretConfigured') : ''"
                            >
                        </div>
                    </div>
                </section>

                <section class="shadow-box big-padding mb-3">
                    <h5 class="settings-subheading">{{ $t("plugnpin.advancedHeading") }}</h5>
                    <div class="row g-3">
                        <div class="col-md-4">
                            <label class="form-label" for="plugnpin-interval">{{ $t("plugnpin.runInterval") }}</label>
                            <input id="plugnpin-interval" v-model.trim="settings.runInterval" class="form-control" pattern="(?:0|[0-9]+(?:\.[0-9]+)?(?:ns|us|µs|ms|s|m|h))" placeholder="1h" required>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label" for="plugnpin-timezone">{{ $t("plugnpin.timezone") }}</label>
                            <input id="plugnpin-timezone" v-model.trim="settings.timezone" class="form-control" placeholder="Europe/Paris">
                        </div>
                        <div class="col-md-4 d-flex align-items-end">
                            <div class="form-check form-switch mb-2">
                                <input id="plugnpin-debug" v-model="settings.debug" class="form-check-input" type="checkbox">
                                <label class="form-check-label" for="plugnpin-debug">Debug</label>
                            </div>
                        </div>
                        <div class="col-12">
                            <div class="form-check form-switch">
                                <input id="plugnpin-metrics" v-model="settings.metrics" class="form-check-input" type="checkbox">
                                <label class="form-check-label" for="plugnpin-metrics">{{ $t("plugnpin.metrics") }}</label>
                            </div>
                        </div>
                        <template v-if="settings.metrics">
                            <div class="col-md-6">
                                <label class="form-label" for="plugnpin-metrics-bind">{{ $t("plugnpin.metricsBind") }}</label>
                                <input id="plugnpin-metrics-bind" v-model.trim="settings.metricsBindAddress" class="form-control" placeholder="127.0.0.1" required>
                            </div>
                            <div class="col-md-6">
                                <label class="form-label" for="plugnpin-metrics-port">{{ $t("plugnpin.metricsPort") }}</label>
                                <input id="plugnpin-metrics-port" v-model.number="settings.metricsPort" type="number" min="1" max="65535" class="form-control" required>
                            </div>
                        </template>
                    </div>
                </section>

                <div class="alert alert-info">
                    {{ $t("plugnpin.imagePinned") }} <code>{{ settings.image }}</code>
                </div>
            </div>

            <div v-if="initialEnabled && !settings.enabled" class="alert alert-warning">
                {{ $t("plugnpin.disableWarning") }}
            </div>

            <div class="d-flex flex-wrap gap-2">
                <button class="btn btn-primary" type="submit" :disabled="saving">
                    <span v-if="saving" class="spinner-border spinner-border-sm me-1" />
                    <font-awesome-icon v-else icon="save" class="me-1" />{{ $t("Save") }}
                </button>
                <template v-if="initialEnabled">
                    <button v-if="status !== 'running'" class="btn btn-success" type="button" :disabled="acting" @click="action('start')">
                        <font-awesome-icon icon="play" class="me-1" />{{ $t("plugnpin.start") }}
                    </button>
                    <button v-if="status === 'running'" class="btn btn-warning" type="button" :disabled="acting" @click="action('restart')">
                        <font-awesome-icon icon="arrows-rotate" class="me-1" />{{ $t("plugnpin.restart") }}
                    </button>
                    <button v-if="status === 'running'" class="btn btn-danger" type="button" :disabled="acting" @click="action('stop')">
                        <font-awesome-icon icon="stop" class="me-1" />{{ $t("plugnpin.stop") }}
                    </button>
                    <button class="btn btn-normal" type="button" :disabled="logsLoading" @click="loadLogs">
                        <font-awesome-icon icon="terminal" class="me-1" />{{ $t("plugnpin.logs") }}
                    </button>
                </template>
            </div>
        </form>

        <pre v-if="logs !== null" class="integration-logs mt-3">{{ logs || $t("plugnpin.noLogs") }}</pre>
    </div>
</template>

<script>
const defaults = {
    enabled: false,
    npmHost: "",
    npmUsername: "",
    npmPasswordConfigured: false,
    dnsProvider: "none",
    piholeHost: "",
    piholePasswordConfigured: false,
    adguardHomeHost: "",
    adguardHomeUsername: "",
    adguardHomePasswordConfigured: false,
    runInterval: "1h",
    timezone: "",
    debug: false,
    metrics: false,
    metricsPort: 9100,
    metricsBindAddress: "127.0.0.1",
    image: "",
    architecture: "",
    architectureSupported: true,
};

export default {
    data() {
        return {
            settings: { ...defaults },
            passwords: {
                npmPassword: "",
                piholePassword: "",
                adguardHomePassword: "",
            },
            initialEnabled: false,
            status: "disabled",
            saving: false,
            acting: false,
            logsLoading: false,
            logs: null,
            errorMessage: "",
            statusTimer: null,
        };
    },
    computed: {
        statusClass() {
            return {
                running: "bg-success",
                stopped: "bg-warning text-dark",
                disabled: "bg-secondary",
                error: "bg-danger",
            }[this.status] ?? "bg-secondary";
        },
    },
    async mounted() {
        await Promise.all([ this.loadSettings(), this.loadStatus() ]);
        this.statusTimer = window.setInterval(this.loadStatus, 10000);
    },
    beforeUnmount() {
        window.clearInterval(this.statusTimer);
    },
    methods: {
        async api(method, path, body) {
            const token = this.$root.getSocket().token;
            const response = await fetch(`/api/integrations${path}`, {
                method,
                headers: {
                    "Authorization": `Bearer ${token}`,
                    ...(body === undefined ? {} : { "Content-Type": "application/json" }),
                },
                body: body === undefined ? undefined : JSON.stringify(body),
            });
            const payload = await response.json();
            if (!response.ok || !payload.ok) {
                throw new Error(payload.message || `HTTP ${response.status}`);
            }
            return payload.data;
        },
        async loadSettings() {
            try {
                const data = await this.api("GET", "/plugnpin/settings");
                this.settings = { ...defaults,
                    ...data };
                this.initialEnabled = this.settings.enabled;
            } catch (error) {
                this.errorMessage = String(error);
            }
        },
        async loadStatus() {
            try {
                const data = await this.api("GET", "/plugnpin/status");
                this.status = data.status;
                if (data.message && data.status === "error") {
                    this.errorMessage = data.message;
                }
            } catch (error) {
                this.status = "error";
                this.errorMessage = String(error);
            }
        },
        async save() {
            if (this.initialEnabled && !this.settings.enabled && !window.confirm(this.$t("plugnpin.disableConfirm"))) {
                this.settings.enabled = true;
                return;
            }
            this.saving = true;
            this.errorMessage = "";
            try {
                const body = { ...this.settings };
                delete body.image;
                for (const [ key, value ] of Object.entries(this.passwords)) {
                    if (value) {
                        body[key] = value;
                    }
                }
                const data = await this.api("PUT", "/plugnpin/settings", body);
                this.settings = { ...defaults,
                    ...data };
                this.initialEnabled = this.settings.enabled;
                this.passwords = { npmPassword: "",
                    piholePassword: "",
                    adguardHomePassword: "" };
                this.$root.toastSuccess(this.$t("plugnpin.saved"));
                await this.loadStatus();
            } catch (error) {
                this.errorMessage = error instanceof Error ? error.message : String(error);
            } finally {
                this.saving = false;
            }
        },
        async action(action) {
            this.acting = true;
            this.errorMessage = "";
            try {
                await this.api("POST", `/plugnpin/${action}`);
                await this.loadStatus();
            } catch (error) {
                this.errorMessage = error instanceof Error ? error.message : String(error);
            } finally {
                this.acting = false;
            }
        },
        async loadLogs() {
            this.logsLoading = true;
            try {
                this.logs = await this.api("GET", "/plugnpin/logs?tail=300");
            } catch (error) {
                this.errorMessage = error instanceof Error ? error.message : String(error);
            } finally {
                this.logsLoading = false;
            }
        },
    },
};
</script>

<style scoped>
.integration-logs {
    max-height: 28rem;
    overflow: auto;
    padding: 1rem;
    border-radius: .5rem;
    color: #d8dee9;
    background: #1f2430;
    white-space: pre-wrap;
}
</style>
