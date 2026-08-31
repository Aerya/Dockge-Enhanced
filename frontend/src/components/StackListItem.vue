<template>
    <div
        :class="{ 'dim' : !stack.isManagedByDockge, 'active': active }"
        :style="agentStyle"
        class="item"
        role="link"
        tabindex="0"
        @click="$router.push(url)"
        @keydown.enter="$router.push(url)"
    >
        <span
            class="status-dot"
            :class="statusDotClass"
            :title="statusText"
            role="img"
            :aria-label="statusText"
        ></span>
        <div class="title">
            <div class="name-row">
                <span class="name">{{ stackName }}</span><span v-if="stack.isExternal" class="badge text-bg-info ms-1">{{ $t("externalStacks.external") }}</span>
                <font-awesome-icon v-if="scheduled" icon="calendar-days" class="scheduled-indicator" :title="$t('stackScheduler.scheduledTooltip')" />
            </div>
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
            <div class="meta-row">
                <StackUpdateBadge :stack-name="stackName" />
                <StackStatsBadge :stack-name="stackName" />
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
import { EXITED, RUNNING, statusNameShort } from "../../../common/util-common";
import StackUpdateBadge from "./StackUpdateBadge.vue";
import StackStatsBadge from "./StackStatsBadge.vue";

export default {
    components: {
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
        stackName() {
            return this.stack.name;
        },
        active() {
            return this.$route.path === this.url;
        },
        statusText() {
            return this.$t(statusNameShort(this.stack?.status));
        },
        statusDotClass() {
            switch (this.stack?.status) {
                case RUNNING:
                    return "status-dot--running";
                case EXITED:
                    return "status-dot--stopped";
                default:
                    return "status-dot--inactive";
            }
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
};
</script>

<style lang="scss" scoped>

// Single source of truth for stack-list rows (the global
// `.stack-list .item` rule in styles/main.scss was removed in favor of this).
// Modern quiet row: status dot + name, no per-item borders or tint fills.
// Status colors mirror the summary filter pills in StackList.vue
// (running = success, stopped = warning, inactive = hollow).
.item {
    text-decoration: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 40px;
    margin-bottom: 2px;
    padding: 6px 10px;
    border-radius: var(--radius-md);
    transition: background-color ease-in-out 0.15s;

    &.disabled {
        opacity: 0.3;
    }

    &:hover {
        background: var(--hover-soft);
    }

    &.active {
        background: var(--primary-soft);

        .name {
            color: var(--agent-color, var(--primary-strong));

            .dark & {
                color: var(--agent-color-dark, var(--primary-strong));
            }
        }
    }
}

.status-dot {
    flex: 0 0 auto;
    width: 9px;
    height: 9px;
    margin-inline-start: 3px;
    border-radius: 50%;

    &--running {
        background: var(--success);
        box-shadow: 0 0 0 3px var(--success-soft);
    }

    &--stopped {
        background: var(--warning);
    }

    &--inactive {
        background: transparent;
        box-shadow: inset 0 0 0 2px var(--border-strong);
    }
}

// Gentle "live" breathing on the running dot only.
@media (prefers-reduced-motion: no-preference) {
    .status-dot--running {
        animation: status-dot-pulse 2.4s ease-in-out infinite;
    }
}

@keyframes status-dot-pulse {
    0%, 100% {
        box-shadow: 0 0 0 3px var(--success-soft);
    }
    50% {
        box-shadow: 0 0 0 5px var(--success-soft);
    }
}

.title {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
}

.name-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}

.name {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--agent-color, inherit);
    font-weight: 600;

    .dark & {
        color: var(--agent-color-dark, inherit);
    }
}

// Update/stats tags get their own wrapping line under the name so a narrow
// sidebar never forces the row wider than the card (flex no-wrap on the
// name line used to push the badges past the card edge).
.meta-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    min-width: 0;

    &:empty {
        display: none;
    }
}

.endpoint {
    font-size: var(--fs-xs);
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    a {
        color: inherit;
        text-decoration: underline;
        text-underline-offset: 2px;
    }
}

.scheduled-indicator {
    flex: 0 0 auto;
    color: var(--primary-strong);
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

.item:hover .stack-pin-button {
    opacity: 1;
}

@media (hover: none) {
    .stack-pin-button {
        opacity: .6;
    }
}

.dim {
    opacity: 0.5;
}

</style>
