<template>
    <div class="post-update-options mb-3">
        <h5>{{ $t("postUpdate.title") }}</h5>
        <div class="form-check">
            <input :id="`${id}-cleanup`" v-model="cleanup" type="checkbox" class="form-check-input" :disabled="!supported" />
            <label :for="`${id}-cleanup`" class="form-check-label">{{ $t("postUpdate.cleanup") }}</label>
        </div>
        <div class="form-check">
            <input :id="`${id}-rollback`" v-model="rollback" type="checkbox" class="form-check-input" :disabled="!supported" />
            <label :for="`${id}-rollback`" class="form-check-label">{{ $t("postUpdate.rollback") }}</label>
        </div>
        <p class="form-text mb-1">{{ $t("postUpdate.help") }}</p>
        <p v-if="bulk" class="form-text mb-1">{{ $t("postUpdate.bulk") }}</p>
        <p v-if="!supported" class="text-warning small">{{ $t("postUpdate.unsupported") }}</p>
    </div>
</template>

<script>
import { postUpdatePolicy, POST_UPDATE_CLEANUP, POST_UPDATE_ROLLBACK } from "../../../common/post-update-policy";
import { setComposeLabel } from "../../../common/compose-labels";

export default {
    props: {
        services: { type: Object,
            required: true },
        supported: { type: Boolean,
            default: false },
        id: { type: String,
            required: true },
        bulk: { type: Boolean,
            default: false },
    },
    computed: {
        cleanup: {
            get() {
                return Object.values(this.services).every(service => postUpdatePolicy(service.labels).cleanup);
            },
            set(value) {
                this.apply(POST_UPDATE_CLEANUP, value);
            },
        },
        rollback: {
            get() {
                return Object.values(this.services).every(service => postUpdatePolicy(service.labels).rollback);
            },
            set(value) {
                this.apply(POST_UPDATE_ROLLBACK, value);
            },
        },
    },
    methods: {
        apply(key, enabled) {
            if (!this.supported) {
                return;
            }
            for (const service of Object.values(this.services)) {
                setComposeLabel(service, key, enabled ? "true" : "false");
            }
        },
    },
};
</script>
