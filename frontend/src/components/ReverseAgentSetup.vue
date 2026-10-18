<template>
    <details class="mt-3">
        <summary>{{ $t('reverseAgent.title') }}</summary>
        <p class="form-text">{{ $t('reverseAgent.help') }}</p>
        <form v-if="!token" @submit.prevent="create">
            <label class="form-label">{{ $t('agentNamePlaceholder') }}
                <input v-model="name" class="form-control" maxlength="100" :disabled="busy">
            </label>
            <button type="submit" class="btn btn-normal d-block" :disabled="busy">{{ $t('reverseAgent.create') }}</button>
        </form>
        <template v-else>
            <p class="form-text">{{ $t('reverseAgent.tokenHelp') }}</p>
            <button type="button" class="btn btn-normal btn-sm mb-2" @click="visible = !visible">{{ $t(visible ? 'reverseAgent.hide' : 'reverseAgent.show') }}</button>
            <textarea v-if="visible" class="form-control font-monospace small" :aria-label="$t('reverseAgent.configuration')" :value="configuration" rows="6" readonly spellcheck="false" @focus="$event.target.select()" />
            <button type="button" class="btn btn-normal btn-sm mt-2" @click="token = ''; visible = false">{{ $t('reverseAgent.done') }}</button>
        </template>
        <p v-if="error" role="alert" class="text-danger">{{ error }}</p>
    </details>
</template>

<script>
export default {
    data() {
        return { name: "",
            busy: false,
            token: "",
            visible: false,
            error: "" };
    },
    computed: {
        configuration() {
            return `environment:\n  DOCKGE_REVERSE_HUB_URL: ${JSON.stringify(location.origin)}\n  DOCKGE_REVERSE_TOKEN: ${JSON.stringify(this.token)}\n`;
        },
    },
    methods: {
        create() {
            this.busy = true;
            this.error = "";
            this.$root.getSocket().timeout(10000).emit("createReverseAgent", { displayName: this.name }, (error, res) => {
                this.busy = false;
                if (error || !res?.ok) {
                    this.error = res?.msg || this.$t("reverseAgent.failed");
                    return;
                }
                this.token = res.token;
            });
        },
    },
};
</script>
