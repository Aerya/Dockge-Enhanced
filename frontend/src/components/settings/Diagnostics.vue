<template>
    <div class="my-3">
        <label for="diagnostic-instance">{{ $t('configTools.instance') }}</label>
        <select id="diagnostic-instance" v-model="endpoint" class="form-select mb-3">
            <option value="">{{ $root.agentList?.['']?.displayName || $t('currentEndpoint') }}</option>
            <template v-for="(agent, key) in $root.agentList" :key="key">
                <option v-if="key" :value="key">{{ agent.displayName || key }}</option>
            </template>
        </select>
        <ConfigurationTools :endpoint="endpoint" diagnostics />
    </div>
</template>
<script>
import ConfigurationTools from "../ConfigurationTools.vue";
export default {
    components: { ConfigurationTools },
    data: () => ({ endpoint: "" }),
};
</script>
