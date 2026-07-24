<template>
    <router-link :to="url" :class="{ 'dim' : !stack.isManagedByDockge }" :style="agentStyle" class="item">
        <Uptime :stack="stack" :fixed-width="true" class="me-2" />
        <div class="title">
            <span>{{ stackName }}</span>
            <font-awesome-icon v-if="scheduled" icon="calendar-days" class="scheduled-indicator ms-1" :title="$t('stackScheduler.scheduledTooltip')" />
            <StackUpdateBadge :stack-name="stackName" />
            <StackStatsBadge :stack-name="stackName" />
            <div v-if="$root.agentCount > 1" class="endpoint">{{ endpointDisplay }}</div>
        </div>
    </router-link>
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
        /** If the user is in select mode */
        isSelectMode: {
            type: Boolean,
            default: false,
        },
        scheduled: {
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
        /** Callback to determine if stack is selected */
        isSelected: {
            type: Function,
            default: () => {}
        },
        /** Callback fired when stack is selected */
        select: {
            type: Function,
            default: () => {}
        },
        /** Callback fired when stack is deselected */
        deselect: {
            type: Function,
            default: () => {}
        },
    },
    data() {
        return {
            isCollapsed: true,
        };
    },
    computed: {
        endpointDisplay() {
            return this.$root.endpointDisplayFunction(this.stack.endpoint);
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
    watch: {
        isSelectMode() {
            // TODO: Resize the heartbeat bar, but too slow
            // this.$refs.heartbeatBar.resize();
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

        /**
         * Toggle selection of stack
         * @returns {void}
         */
        toggleSelection() {
            if (this.isSelected(this.stack.id)) {
                this.deselect(this.stack.id);
            } else {
                this.select(this.stack.id);
            }
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.small-padding {
    padding-left: 5px !important;
    padding-right: 5px !important;
}

.collapse-padding {
    padding-left: 8px !important;
    padding-right: 2px !important;
}

.item {
    text-decoration: none;
    display: flex;
    align-items: center;
    min-height: 52px;
    border-radius: 10px;
    transition: all ease-in-out 0.15s;
    width: 100%;
    padding: 5px 8px;
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
        background-color: $highlight-white;
    }
    &.active {
        background-color: #cdf8f4;
    }
    .title {
        margin-top: -4px;

        > span:first-child {
            color: var(--agent-color, inherit);
            font-weight: 650;

            .dark & {
                color: var(--agent-color-dark, inherit);
            }
        }
    }
    .endpoint {
        font-size: 12px;
        color: $dark-font-color3;
    }

    .scheduled-indicator {
        color: #3b82f6;
        font-size: .78rem;
    }
}

.collapsed {
    transform: rotate(-90deg);
}

.animated {
    transition: all 0.2s $easing-in;
}

.select-input-wrapper {
    float: left;
    margin-top: 15px;
    margin-left: 3px;
    margin-right: 10px;
    padding-left: 4px;
    position: relative;
    z-index: 15;
}

.dim {
    opacity: 0.5;
}

</style>
