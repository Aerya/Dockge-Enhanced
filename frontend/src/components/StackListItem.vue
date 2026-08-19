<template>
    <div
        :class="{ 'dim' : !stack.isManagedByDockge }"
        :style="agentStyle"
        class="item"
        role="link"
        tabindex="0"
        @click="$router.push(url)"
        @keydown.enter="$router.push(url)"
    >
        <Uptime :stack="stack" :fixed-width="true" class="me-2" />
        <div class="title">
            <span>{{ stackName }}</span>
            <font-awesome-icon v-if="scheduled" icon="calendar-days" class="scheduled-indicator ms-1" :title="$t('stackScheduler.scheduledTooltip')" />
            <StackUpdateBadge :stack-name="stackName" />
            <StackStatsBadge :stack-name="stackName" />
            <div v-if="$root.agentCount > 1" class="endpoint">
                <a
                    v-if="remoteStackUrl"
                    :href="remoteStackUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    @click.stop
                    @keydown.stop
                >{{ endpointDisplay }}</a>
                <span v-else>{{ endpointDisplay }}</span>
            </div>
        </div>
        <button
            class="stack-pin-button"
            :class="{ 'stack-pin-button--pinned': pinned }"
            type="button"
            :title="$t(pinned ? 'stackUnpin' : 'stackPin')"
            :aria-label="$t(pinned ? 'stackUnpin' : 'stackPin')"
            :aria-pressed="pinned"
            @click.stop="$emit('toggle-pin')"
            @keydown.stop
        >
            <font-awesome-icon icon="thumbtack" />
        </button>
    </div>
</template>

<script>
import Uptime from "./Uptime.vue";
import StackUpdateBadge from "./StackUpdateBadge.vue";
import StackStatsBadge from "./StackStatsBadge.vue";

export default {
    components: {
        Uptime,
        StackUpdateBadge,
        StackStatsBadge,
    },
    props: {
        /** Stack this represents */
        stack: {
            type: Object,
            default: null,
        },
        scheduled: {
            type: Boolean,
            default: false,
        },
        pinned: {
            type: Boolean,
            default: false,
        },
        agentColors: {
            type: Object,
            default: null,
        },
        /** How many ancestors are above this stack */
        depth: {
            type: Number,
            default: 0,
        },
    },
    emits: [ "toggle-pin" ],
    data() {
        return {
            isCollapsed: true,
        };
    },
    computed: {
        endpointDisplay() {
            return this.$root.endpointDisplayFunction(this.stack.endpoint);
        },
        remoteStackUrl() {
            const agentUrl = this.$root.agentList[this.stack.endpoint]?.url;
            if (!this.stack.endpoint || !agentUrl) {
                return "";
            }
            return new URL(`compose/${encodeURIComponent(this.stack.name)}`, agentUrl.replace(/\/?$/, "/")).toString();
        },
        url() {
            if (this.stack.endpoint) {
                return `/compose/${this.stack.name}/${this.stack.endpoint}`;
            } else {
                return `/compose/${this.stack.name}`;
            }
        },
        depthMargin() {
            return {
                marginLeft: `${31 * this.depth}px`,
            };
        },
        stackName() {
            return this.stack.name;
        },
        agentStyle() {
            if (!this.agentColors) {
                return {};
            }
            return {
                "--agent-color": this.agentColors.light,
                "--agent-color-dark": this.agentColors.dark,
                "--agent-tint": this.agentColors.tint,
                "--agent-tint-dark": this.agentColors.darkTint,
            };
        }
    },
    beforeMount() {

    },
    methods: {
        /**
         * Changes the collapsed value of the current stack and saves
         * it to local storage
         * @returns {void}
         */
        changeCollapsed() {
            this.isCollapsed = !this.isCollapsed;

            // Save collapsed value into local storage
            let storage = window.localStorage.getItem("stackCollapsed");
            let storageObject = {};
            if (storage !== null) {
                storageObject = JSON.parse(storage);
            }
            storageObject[`stack_${this.stack.id}`] = this.isCollapsed;

            window.localStorage.setItem("stackCollapsed", JSON.stringify(storageObject));
        },
    },
};
</script>

<style lang="scss" scoped>

.small-padding {
    padding-left: 5px !important;
    padding-right: 5px !important;
}

.collapse-padding {
    padding-left: 8px !important;
    padding-right: 2px !important;
}

// Single source of truth for stack-list rows (the global
// `.stack-list .item` rule in styles/main.scss was removed in favor of this).
// Base values mirror the old global rule: height 52px, radius-md, 0 8px padding.
.item {
    text-decoration: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    height: 52px;
    margin-bottom: 4px;
    border-radius: var(--radius-md);
    transition: all ease-in-out 0.15s;
    width: 100%;
    padding: 0 8px;
    border-inline-start: 4px solid var(--agent-color, transparent);
    background: linear-gradient(90deg, var(--agent-tint, transparent), transparent 42%);

    .dark & {
        border-inline-start-color: var(--agent-color-dark, transparent);
        background: linear-gradient(90deg, var(--agent-tint-dark, transparent), transparent 42%);
    }

    &.disabled {
        opacity: 0.3;
    }
    &:hover {
        background-color: var(--bg-raised);
    }
    &.active {
        background-color: var(--primary-soft);
    }
    .title {
        margin-top: -4px;
        min-width: 0;
        flex: 1;

        > span:first-child {
            color: var(--agent-color, inherit);
            font-weight: 650;

            .dark & {
                color: var(--agent-color-dark, inherit);
            }
        }
    }
    .endpoint {
        font-size: var(--fs-xs);
        color: var(--text-muted);

        a {
            color: inherit;
            text-decoration: underline;
            text-underline-offset: 2px;
        }
    }

    .scheduled-indicator {
        color: var(--primary);
        font-size: var(--fs-sm);
    }

    .stack-pin-button {
        flex: 0 0 auto;
        border: 0;
        padding: 6px;
        background: transparent;
        color: var(--text-muted);
        opacity: 0;
        transition: opacity .15s ease, color .15s ease;

        &:focus-visible,
        &--pinned {
            opacity: 1;
            color: var(--warning);
        }
    }

    &:hover .stack-pin-button {
        opacity: 1;
    }

    @media (hover: none) {
        .stack-pin-button {
            opacity: .6;
        }
    }
}

.collapsed {
    transform: rotate(-90deg);
}

.animated {
    transition: all 0.2s $easing-in;
}

.dim {
    opacity: 0.5;
}

</style>
