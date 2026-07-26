<template>
    <div class="shadow-box big-padding mb-3">
        <h5 class="settings-subheading mb-2">
            <font-awesome-icon icon="link" class="me-2" />{{ $t("plugnpin.labels.heading") }}
        </h5>
        <p class="form-text mb-3">{{ $t("plugnpin.labels.hint") }}</p>

        <div class="row g-3">
            <div class="col-md-6">
                <label class="form-label" for="plugnpin-label-service">{{ $t("plugnpin.labels.service") }}</label>
                <select id="plugnpin-label-service" v-model="form.service" class="form-select" required>
                    <option v-for="service in services" :key="service" :value="service">{{ service }}</option>
                </select>
            </div>
            <div class="col-md-6">
                <label class="form-label" for="plugnpin-label-target">{{ $t("plugnpin.labels.target") }}</label>
                <input id="plugnpin-label-target" v-model.trim="form.target" class="form-control" placeholder="192.168.0.10:8080">
            </div>
            <div class="col-12">
                <label class="form-label" for="plugnpin-label-domains">{{ $t("plugnpin.labels.domains") }}</label>
                <input id="plugnpin-label-domains" v-model.trim="form.domains" class="form-control" placeholder="service.home,service.example.com">
            </div>
            <div class="col-md-4">
                <label class="form-label" for="plugnpin-label-scheme">{{ $t("plugnpin.labels.scheme") }}</label>
                <select id="plugnpin-label-scheme" v-model="form.scheme" class="form-select">
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                </select>
            </div>
            <div class="col-md-4">
                <label class="form-label" for="plugnpin-label-certificate">{{ $t("plugnpin.labels.certificate") }}</label>
                <input id="plugnpin-label-certificate" v-model.trim="form.certificateName" class="form-control">
            </div>
            <div class="col-md-4">
                <label class="form-label" for="plugnpin-label-access-list">{{ $t("plugnpin.labels.accessList") }}</label>
                <input id="plugnpin-label-access-list" v-model.trim="form.accessListName" class="form-control">
            </div>
            <div class="col-12 d-flex flex-wrap gap-4">
                <div class="form-check form-switch">
                    <input id="plugnpin-label-websockets" v-model="form.websockets" class="form-check-input" type="checkbox">
                    <label class="form-check-label" for="plugnpin-label-websockets">{{ $t("plugnpin.labels.websockets") }}</label>
                </div>
                <div class="form-check form-switch">
                    <input id="plugnpin-label-ssl" v-model="form.forceSsl" class="form-check-input" type="checkbox">
                    <label class="form-check-label" for="plugnpin-label-ssl">{{ $t("plugnpin.labels.forceSsl") }}</label>
                </div>
                <div class="form-check form-switch">
                    <input id="plugnpin-label-healthy" v-model="form.createOnHealthy" class="form-check-input" type="checkbox">
                    <label class="form-check-label" for="plugnpin-label-healthy">{{ $t("plugnpin.labels.createOnHealthy") }}</label>
                </div>
            </div>
            <div class="col-12">
                <pre class="label-preview mb-0">{{ snippet }}</pre>
            </div>
            <div class="col-12 d-flex flex-wrap gap-2">
                <button type="button" class="btn btn-primary" :disabled="!valid" @click="$emit('apply', { service: form.service, labels })">
                    <font-awesome-icon icon="plus" class="me-1" />{{ $t("plugnpin.labels.apply") }}
                </button>
                <button type="button" class="btn btn-normal" :disabled="!valid" @click="copySnippet">
                    <font-awesome-icon icon="copy" class="me-1" />{{ $t("plugnpin.labels.copy") }}
                </button>
            </div>
        </div>
    </div>
</template>

<script>
export default {
    props: {
        services: {
            type: Array,
            default: () => [],
        },
    },
    emits: [ "apply" ],
    data() {
        return {
            form: {
                service: this.services[0] ?? "",
                target: "",
                domains: "",
                scheme: "http",
                websockets: false,
                forceSsl: false,
                createOnHealthy: false,
                certificateName: "",
                accessListName: "",
            },
        };
    },
    computed: {
        valid() {
            return Boolean(
                this.form.service
                && /^[^:\\s]+:\\d{1,5}$/.test(this.form.target)
                && this.form.domains.split(",").map(value => value.trim()).filter(Boolean).length > 0
            );
        },
        labels() {
            const labels = {
                "plugNPiN.ip": this.form.target,
                "plugNPiN.url": this.form.domains.split(",").map(value => value.trim()).filter(Boolean).join(","),
                "plugNPiN.npmOptions.scheme": this.form.scheme,
                "plugNPiN.npmOptions.websocketsSupport": String(this.form.websockets),
                "plugNPiN.npmOptions.forceSsl": String(this.form.forceSsl),
                "plugNPiN.options.createOnHealthy": String(this.form.createOnHealthy),
            };
            if (this.form.certificateName) {
                labels["plugNPiN.npmOptions.certificateName"] = this.form.certificateName;
            }
            if (this.form.accessListName) {
                labels["plugNPiN.npmOptions.accessListName"] = this.form.accessListName;
            }
            return labels;
        },
        snippet() {
            const lines = [ `${this.form.service || "service"}:`, "  labels:" ];
            for (const [ key, value ] of Object.entries(this.labels)) {
                lines.push(`    ${key}: ${JSON.stringify(value)}`);
            }
            return lines.join("\n");
        },
    },
    watch: {
        services(next) {
            if (!next.includes(this.form.service)) {
                this.form.service = next[0] ?? "";
            }
        },
    },
    methods: {
        async copySnippet() {
            await navigator.clipboard.writeText(this.snippet);
            this.$root.toastSuccess(this.$t("Copied"));
        },
    },
};
</script>

<style scoped>
.label-preview {
    max-height: 18rem;
    overflow: auto;
    padding: .85rem;
    border-radius: .5rem;
    color: #d8dee9;
    background: #1f2430;
}
</style>
