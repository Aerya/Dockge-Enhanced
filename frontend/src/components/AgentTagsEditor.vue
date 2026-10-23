<template>
    <details class="mt-1">
        <summary class="small text-muted">{{ $t('agentTags.title') }}<span v-for="tag in tags" :key="tag" class="badge bg-secondary ms-1">{{ tag }}</span></summary>
        <form class="mt-2" @submit.prevent="save">
            <label class="small">{{ $t('agentTags.help') }}
                <input v-model="draft" class="form-control form-control-sm" :disabled="saving" maxlength="820">
            </label>
            <button type="submit" class="btn btn-sm btn-normal ms-1" :disabled="saving">{{ $t('Save') }}</button>
            <div v-if="error" role="alert" class="small text-danger">{{ error }}</div>
        </form>
    </details>
</template>

<script>
import { normalizeAgentTags } from "../../../common/agent-tags";
export default {
    props: {
        endpoint: { type: String,
            required: true },
        tags: { type: Array,
            default: () => [] },
    },
    data() {
        return { draft: this.tags.join(", "),
            saving: false,
            error: "" };
    },
    watch: {
        tags(value) {
            this.draft = value.join(", ");
        },
    },
    methods: {
        save() {
            let tags;
            try {
                tags = normalizeAgentTags(this.draft.split(","));
            } catch {
                this.error = this.$t("agentTags.invalid");
                return;
            }
            this.error = "";
            this.saving = true;
            this.$root.getSocket().timeout(10000).emit("setAgentTags", { endpoint: this.endpoint,
                tags }, (error, res) => {
                this.saving = false;
                if (error || !res?.ok) {
                    this.error = res?.msg || this.$t("agentTags.saveFailed");
                }
            });
        },
    },
};
</script>
