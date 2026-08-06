<template>
    <div v-if="links.length" class="remote-instance-links">
        <span class="remote-instance-links__label">{{ $t("remoteInstances.openOn") }}</span>
        <a
            v-for="link in links"
            :key="link.endpoint"
            class="btn btn-sm btn-normal remote-instance-links__button"
            :href="link.href"
            target="_blank"
            rel="noopener noreferrer"
            :title="$t('remoteInstances.openOnNamed', { name: link.name })"
        >
            <font-awesome-icon icon="external-link-square-alt" />
            <span>{{ link.name }}</span>
        </a>
    </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";

interface AgentLink {
    url?: string;
    displayName?: string;
}

export default defineComponent({
    props: {
        agents: {
            type: Object as PropType<Record<string, AgentLink>>,
            required: true,
        },
        path: {
            type: String,
            required: true,
        },
        endpoint: {
            type: String,
            default: "",
        },
    },
    computed: {
        links(): Array<{ endpoint: string; name: string; href: string }> {
            return Object.entries(this.agents)
                .filter(([ endpoint, agent ]) => endpoint && agent.url && (!this.endpoint || endpoint === this.endpoint))
                .map(([ endpoint, agent ]) => ({
                    endpoint,
                    name: agent.displayName || endpoint,
                    href: new URL(this.path.replace(/^\//, ""), `${agent.url!.replace(/\/?$/, "/")}`).toString(),
                }))
                .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
        },
    },
});
</script>

<style lang="scss" scoped>
.remote-instance-links {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
}

.remote-instance-links__label {
    color: #9ca3af;
    font-size: 0.82rem;
}

.remote-instance-links__button {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    white-space: nowrap;
}
</style>
