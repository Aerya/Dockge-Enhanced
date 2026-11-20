<template>
    <details class="mt-3" @toggle="toggle">
        <summary>{{ $t('advancedDeployment.title') }}</summary>
        <p class="small text-warning">{{ $t('advancedDeployment.hint') }}</p>
        <label v-if="edit">{{ $t('advancedDeployment.canary') }}
            <select v-model="mode" class="form-select" :disabled="!supported || !relay">
                <option value="">{{ $t('advancedDeployment.off') }}</option>
                <option value="manual">{{ $t('advancedDeployment.manual') }}</option>
                <option value="automatic">{{ $t('advancedDeployment.automatic') }}</option>
            </select>
        </label>
        <div v-if="state" class="my-2">
            Canary {{ state.percent }}% · {{ $t(state.ready ? 'advancedDeployment.ready' : 'advancedDeployment.observing') }}
            <button class="btn btn-sm btn-primary ms-2" :disabled="!state.ready || state.mode !== 'manual'" @click="decision('promote')">{{ $t('advancedDeployment.promote') }}</button>
            <button class="btn btn-sm btn-warning ms-2" @click="decision('abort')">{{ $t('advancedDeployment.abort') }}</button>
        </div>
        <p v-if="unavailable || !supported" class="text-warning">{{ $t('advancedDeployment.unavailable') }}</p>
        <h6 class="mt-3">{{ $t('advancedDeployment.preview') }}</h6>
        <p class="small">{{ $t('advancedDeployment.previewHint') }}</p>
        <label>{{ $t('advancedDeployment.image') }}<input v-model="image" class="form-control" type="text"></label>
        <button class="btn btn-sm btn-normal ms-2" @click="fromImage">{{ $t('advancedDeployment.fromImage') }}</button>
        <textarea v-model="compose" class="form-control mt-2" rows="8" spellcheck="false" :aria-label="$t('advancedDeployment.compose')" />
        <label class="d-block my-2"><input v-model="confirmed" type="checkbox"> {{ $t('advancedDeployment.confirmPreview') }}</label>
        <button class="btn btn-normal" :disabled="!supported || busy || !confirmed" @click="preview">{{ $t('advancedDeployment.runPreview') }}</button>
        <p v-if="result" class="mt-2" role="status">{{ $t('advancedDeployment.' + result) }}</p>
    </details>
</template>
<script>
import { composeLabelValue, setComposeLabel } from "../../../common/compose-labels";
export default {
    props: { supported: { type: Boolean,
        default: false },
    endpoint: { type: String,
        default: "" },
    stack: { type: String,
        required: true },
    name: { type: String,
        required: true },
    service: { type: Object,
        required: true },
    edit: { type: Boolean,
        default: false } },
    data() {
        return { state: null,
            timer: null,
            unavailable: false,
            busy: false,
            result: "",
            image: this.service.image || "",
            compose: "",
            confirmed: false,
            generation: 0 };
    },
    computed: {
        relay() {
            return !!composeLabelValue(this.service.labels, "dockge.rollout.relay");
        },
        mode: {
            get() {
                return composeLabelValue(this.service.labels, "dockge.rollout.canary") || "";
            },
            set(value) {
                if (!this.supported) {
                    return;
                }
                if (value && !window.confirm(this.$t("advancedDeployment.confirmCanary"))) {
                    return;
                }
                setComposeLabel(this.service, "dockge.rollout.canary", value || null);
                if (value) {
                    setComposeLabel(this.service, "dockge.rollout.enabled", "true");
                    setComposeLabel(this.service, "dockge.rollout.migrations", "none");
                }
            },
        },
    },
    mounted() {
        this.fromImage();
    },
    beforeUnmount() {
        clearInterval(this.timer);
        this.generation++;
    },
    methods: {
        fromImage() {
            this.compose = JSON.stringify({ services: { preview: { image: this.image,
                labels: { "dockge.rollout.migrations": "none" },
                ...(this.service.healthcheck ? { healthcheck: this.service.healthcheck } : {}) } } }, null, 2);
        },
        request(event, payload, timeout = 15000) {
            return new Promise(resolve => {
                const timer = setTimeout(() => resolve({ ok: false }), timeout);
                this.$root.emitAgent(this.endpoint, event, payload, response => {
                    clearTimeout(timer);
                    resolve(response || { ok: false });
                });
            });
        },
        toggle(event) {
            clearInterval(this.timer);
            if (event.target.open && !this.edit && this.supported) {
                this.poll();
                this.timer = setInterval(this.poll, 5000);
            }
        },
        async poll() {
            const generation = this.generation;
            const response = await this.request("rollout:canary", { stack: this.stack,
                service: this.name });
            if (generation !== this.generation) {
                return;
            }
            this.unavailable = !response.ok;
            this.state = response.ok ? response.state : null;
        },
        async decision(decision) {
            if (!this.state) {
                return;
            }
            const response = await this.request("rollout:canary", { stack: this.stack,
                service: this.name,
                id: this.state.id,
                decision });
            this.unavailable = !response.ok;
            await this.poll();
        },
        async preview() {
            if (!this.supported || !this.confirmed || this.busy) {
                return;
            }
            this.busy = true;
            this.result = "running";
            const response = await this.request("rollout:preview", { compose: this.compose,
                confirmation: "PREVIEW" }, 240000);
            this.result = response.ok ? response.data.healthy ? "healthy" : "noHealth" : "failed";
            this.busy = false;
        },
    },
};
</script>
