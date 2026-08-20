<template>
    <div class="shadow-box">
        <div class="list-header">
            <div class="header-top">
                <div class="stack-summary" :aria-label="$t('stackSummaryAria')" role="group">
                    <button
                        class="stack-summary-pill stack-summary-pill--total"
                        :class="{ selected: stackStatusFilter === 'all' }"
                        type="button"
                        @click="setStackStatusFilter('all')"
                    >
                        <span>{{ $t("stackSummaryStacks") }}</span>
                        <strong>{{ stackSummary.total }}</strong>
                    </button>
                    <button
                        class="stack-summary-pill stack-summary-pill--active"
                        :class="{ selected: stackStatusFilter === 'active' }"
                        type="button"
                        @click="setStackStatusFilter('active')"
                    >
                        <span>{{ $t("stackSummaryActive") }}</span>
                        <strong>{{ stackSummary.active }}</strong>
                    </button>
                    <button
                        class="stack-summary-pill stack-summary-pill--stopped"
                        :class="{ selected: stackStatusFilter === 'stopped' }"
                        :title="$t('stackSummaryStoppedTooltip')"
                        type="button"
                        @click="setStackStatusFilter('stopped')"
                    >
                        <span>{{ $t("stackSummaryStopped") }}</span>
                        <strong>{{ stackSummary.stopped }}</strong>
                    </button>
                    <button
                        class="stack-summary-pill stack-summary-pill--inactive"
                        :class="{ selected: stackStatusFilter === 'inactive' }"
                        :title="$t('stackSummaryInactiveTooltip')"
                        type="button"
                        @click="setStackStatusFilter('inactive')"
                    >
                        <span>{{ $t("stackSummaryInactive") }}</span>
                        <strong>{{ stackSummary.inactive }}</strong>
                    </button>
                    <button
                        class="stack-summary-pill stack-summary-pill--scheduled"
                        :class="{ selected: stackStatusFilter === 'scheduled' }"
                        :title="$t('stackScheduler.scheduledTooltip')"
                        type="button"
                        @click="setStackStatusFilter('scheduled')"
                    >
                        <span>{{ $t("stackScheduler.scheduled") }}</span>
                        <strong>{{ stackSummary.scheduled }}</strong>
                    </button>
                </div>
                <div class="search-wrapper" :class="{ 'search-wrapper--single-agent': agentOptions.length <= 1 }">
                    <details v-if="agentOptions.length > 1" class="stack-agent-filter">
                        <summary class="stack-agent-select">
                            <span>{{ agentFilterLabel }}</span>
                            <font-awesome-icon icon="chevron-down" />
                        </summary>
                        <div class="stack-agent-menu shadow">
                            <label class="stack-agent-option stack-agent-option--all">
                                <input
                                    class="form-check-input"
                                    type="checkbox"
                                    :checked="allAgentsSelected"
                                    @change="selectAllAgents"
                                />
                                <span>{{ $t("stackFilterAllInstances") }}</span>
                            </label>
                            <label
                                v-for="agent in agentOptions"
                                :key="agent.endpoint"
                                class="stack-agent-option"
                            >
                                <input
                                    class="form-check-input"
                                    type="checkbox"
                                    :checked="isAgentSelected(agent.endpoint)"
                                    @change="toggleAgent(agent.endpoint)"
                                />
                                <span class="agent-color-dot" :style="agentColorStyle(agent.endpoint)"></span>
                                <span>{{ agent.label }}</span>
                            </label>
                        </div>
                    </details>
                    <button
                        v-if="agentOptions.length > 1"
                        class="btn btn-sm stack-group-toggle"
                        :class="{ active: stackGroupByAgent }"
                        type="button"
                        :title="$t('stackGroupByInstance')"
                        :aria-pressed="stackGroupByAgent"
                        @click="stackGroupByAgent = !stackGroupByAgent"
                    >
                        <font-awesome-icon icon="layer-group" />
                    </button>
                    <label class="visually-hidden" for="stackSort">{{ $t("stackSortLabel") }}</label>
                    <select id="stackSort" v-model="stackSort" class="form-select form-select-sm stack-sort-select">
                        <option value="name">{{ $t("stackSortName") }}</option>
                        <option value="status">{{ $t("stackSortStatus") }}</option>
                        <option value="agent">{{ $t("stackSortAgent") }}</option>
                        <option value="created">{{ $t("stackSortCreated") }}</option>
                        <option value="updated">{{ $t("stackSortUpdated") }}</option>
                    </select>
                    <div class="stack-search-field">
                        <a v-if="searchText == ''" class="search-icon">
                            <font-awesome-icon icon="search" />
                        </a>
                        <a v-if="searchText != ''" class="search-icon" style="cursor: pointer" @click="clearSearchText">
                            <font-awesome-icon icon="times" />
                        </a>
                        <form>
                            <input v-model="searchText" class="form-control search-input" autocomplete="off" />
                        </form>
                    </div>
                </div>
            </div>

            <!-- TODO -->
            <div v-if="false" class="header-filter">
                <!--<StackListFilter :filterState="filterState" @update-filter="updateFilter" />-->
            </div>
        </div>
        <div ref="stackList" class="stack-list" :class="{ scrollbar: scrollbar }">
            <div v-if="Object.keys(sortedStackList).length === 0" class="text-center mt-3">
                <router-link to="/compose">{{ $t("addFirstStackMsg") }}</router-link>
            </div>

            <template v-for="group in stackListGroups" :key="group.endpoint || '__local__'">
                <div
                    v-if="stackGroupByAgent && agentOptions.length > 1"
                    class="stack-agent-group"
                    :style="agentColorStyle(group.endpoint)"
                >
                    <span class="agent-color-dot"></span>
                    <strong>{{ group.label }}</strong>
                    <span class="stack-agent-count">{{ group.stacks.length }}</span>
                </div>
                <StackListItem
                    v-for="item in group.stacks"
                    :key="`${item.endpoint || '__local__'}:${item.name}`"
                    :stack="item"
                    :agent-colors="agentOptions.length > 1 ? agentColors(item.endpoint) : null"
                    :scheduled="isStackScheduled(item.name, item.endpoint)"
                    :pinned="isStackPinned(item)"
                    @toggle-pin="toggleStackPin(item)"
                />
            </template>
        </div>
    </div>
</template>

<script>
import StackListItem from "../components/StackListItem.vue";
import { CREATED_FILE, CREATED_STACK, EXITED, RUNNING, UNKNOWN } from "../../../common/util-common";
import { useStackSchedules } from "../composables/useStackSchedules";

export default {
    components: {
        StackListItem,
    },
    setup() {
        const { schedules } = useStackSchedules();
        return { schedules };
    },
    props: {
        /** Should the scrollbar be shown */
        scrollbar: {
            type: Boolean,
        },
    },
    data() {
        return {
            searchText: "",
            stackStatusFilter: "all",
            stackAgentFilters: this.loadAgentFilters(),
            stackGroupByAgent: this.loadStackGrouping(),
            stackSort: this.loadStackSort(),
            pinnedStacks: this.loadPinnedStacks(),
            filterState: {
                status: null,
                active: null,
                tags: null,
            }
        };
    },
    computed: {
        /**
         * Returns a sorted list of stacks based on the applied filters and search text.
         * @returns {Array} The sorted list of stacks.
         */
        sortedStackList() {
            let result = this.agentFilteredStacks;

            result = result.filter(stack => {
                // filter by search text
                // finds stack name, tag name or tag value
                let searchTextMatch = true;
                if (this.searchText !== "") {
                    const loweredSearchText = this.searchText.toLowerCase();
                    searchTextMatch =
                        stack.name.toLowerCase().includes(loweredSearchText)
                        || stack.tags.find(tag => tag.name.toLowerCase().includes(loweredSearchText)
                            || tag.value?.toLowerCase().includes(loweredSearchText));
                }

                // filter by active
                let activeMatch = true;
                if (this.filterState.active != null && this.filterState.active.length > 0) {
                    activeMatch = this.filterState.active.includes(stack.active);
                }

                let statusSummaryMatch = true;
                if (this.stackStatusFilter === "scheduled") {
                    statusSummaryMatch = this.isStackScheduled(stack.name, stack.endpoint);
                } else if (this.stackStatusFilter !== "all") {
                    statusSummaryMatch = this.getStackStatusSummary(stack) === this.stackStatusFilter;
                }

                // filter by tags
                let tagsMatch = true;
                if (this.filterState.tags != null && this.filterState.tags.length > 0) {
                    tagsMatch = stack.tags.map(tag => tag.tag_id) // convert to array of tag IDs
                        .filter(stackTagId => this.filterState.tags.includes(stackTagId)) // perform Array Intersaction between filter and stack's tags
                        .length > 0;
                }

                return searchTextMatch && activeMatch && statusSummaryMatch && tagsMatch;
            });

            result.sort((m1, m2) => {
                const pinnedOrder = Number(this.isStackPinned(m2)) - Number(this.isStackPinned(m1));
                if (pinnedOrder !== 0) {
                    return pinnedOrder;
                }

                if (this.stackSort === "name") {
                    return m1.name.localeCompare(m2.name, undefined, { sensitivity: "base" });
                }

                if (this.stackSort === "agent") {
                    const agent1 = this.$root.endpointDisplayFunction(m1.endpoint || "");
                    const agent2 = this.$root.endpointDisplayFunction(m2.endpoint || "");
                    const agentOrder = agent1.localeCompare(agent2, undefined, { sensitivity: "base" });
                    if (agentOrder !== 0) {
                        return agentOrder;
                    }

                    const endpointOrder = (m1.endpoint || "").localeCompare(m2.endpoint || "");
                    if (endpointOrder !== 0) {
                        return endpointOrder;
                    }
                    return m1.name.localeCompare(m2.name);
                }

                if (this.stackSort === "created" || this.stackSort === "updated") {
                    const field = this.stackSort === "created" ? "createdAt" : "lastUpdated";
                    const date1 = m1[field] ? Date.parse(m1[field]) : Number.NaN;
                    const date2 = m2[field] ? Date.parse(m2[field]) : Number.NaN;
                    const valid1 = Number.isFinite(date1);
                    const valid2 = Number.isFinite(date2);

                    if (valid1 && !valid2) {
                        return -1;
                    }
                    if (!valid1 && valid2) {
                        return 1;
                    }
                    if (valid1 && valid2 && date1 !== date2) {
                        return date2 - date1;
                    }

                    return m1.name.localeCompare(m2.name, undefined, { sensitivity: "base" });
                }

                // sort by managed by dockge
                if (m1.isManagedByDockge && !m2.isManagedByDockge) {
                    return -1;
                } else if (!m1.isManagedByDockge && m2.isManagedByDockge) {
                    return 1;
                }

                // sort by status
                if (m1.status !== m2.status) {
                    if (m2.status === RUNNING) {
                        return 1;
                    } else if (m1.status === RUNNING) {
                        return -1;
                    } else if (m2.status === EXITED) {
                        return 1;
                    } else if (m1.status === EXITED) {
                        return -1;
                    } else if (m2.status === CREATED_STACK) {
                        return 1;
                    } else if (m1.status === CREATED_STACK) {
                        return -1;
                    } else if (m2.status === CREATED_FILE) {
                        return 1;
                    } else if (m1.status === CREATED_FILE) {
                        return -1;
                    } else if (m2.status === UNKNOWN) {
                        return 1;
                    } else if (m1.status === UNKNOWN) {
                        return -1;
                    }
                }
                return m1.name.localeCompare(m2.name);
            });

            return result;
        },

        allStacks() {
            return Object.values(this.$root.completeStackList);
        },

        agentOptions() {
            return Object.keys(this.$root.agentList)
                .map(endpoint => ({
                    endpoint,
                    label: this.$root.endpointDisplayFunction(endpoint),
                }))
                .sort((agent1, agent2) => {
                    const labelOrder = agent1.label.localeCompare(agent2.label, undefined, { sensitivity: "base" });
                    return labelOrder || agent1.endpoint.localeCompare(agent2.endpoint);
                });
        },

        allAgentsSelected() {
            return this.stackAgentFilters.length === 0;
        },

        agentFilterLabel() {
            if (this.allAgentsSelected) {
                return this.$t("stackFilterAllInstances");
            }
            if (this.stackAgentFilters.length === 1) {
                return this.$root.endpointDisplayFunction(this.stackAgentFilters[0]);
            }
            return this.$t("stackFilterSelectedInstances", [ this.stackAgentFilters.length ]);
        },

        agentFilteredStacks() {
            if (this.allAgentsSelected) {
                return this.allStacks;
            }

            return this.allStacks.filter(stack => this.stackAgentFilters.includes(stack.endpoint || ""));
        },

        stackListGroups() {
            if (!this.stackGroupByAgent || this.agentOptions.length <= 1) {
                return [{
                    endpoint: "__all__",
                    label: "",
                    stacks: this.sortedStackList,
                }];
            }

            return this.agentOptions
                .map(agent => ({
                    endpoint: agent.endpoint,
                    label: agent.label,
                    stacks: this.sortedStackList.filter(stack => (stack.endpoint || "") === agent.endpoint),
                }))
                .filter(group => group.stacks.length > 0);
        },

        stackSummary() {
            const summary = {
                total: 0,
                active: 0,
                stopped: 0,
                inactive: 0,
                scheduled: 0,
            };

            for (const stack of this.agentFilteredStacks) {
                const status = this.getStackStatusSummary(stack);
                summary.total += 1;

                if (status === "active") {
                    summary.active += 1;
                } else if (status === "stopped") {
                    summary.stopped += 1;
                } else {
                    summary.inactive += 1;
                }
                if (this.isStackScheduled(stack.name, stack.endpoint)) {
                    summary.scheduled += 1;
                }
            }

            return summary;
        },

        isDarkTheme() {
            return document.body.classList.contains("dark");
        },

        /**
         * Determines if any filters are active.
         * @returns {boolean} True if any filter is active, false otherwise.
         */
        filtersActive() {
            return this.filterState.status != null || this.filterState.active != null || this.filterState.tags != null || this.stackStatusFilter !== "all" || this.searchText !== "";
        }
    },
    watch: {
        agentOptions(options) {
            const available = new Set(options.map(agent => agent.endpoint));
            const filtered = this.stackAgentFilters.filter(endpoint => available.has(endpoint));
            if (filtered.length !== this.stackAgentFilters.length) {
                this.stackAgentFilters = filtered;
            }
        },
        stackAgentFilters: {
            deep: true,
            handler(value) {
                localStorage.setItem("stackAgentFilters", JSON.stringify(value));
            },
        },
        stackGroupByAgent(value) {
            localStorage.setItem("stackGroupByAgent", String(value));
        },
        stackSort(value) {
            localStorage.setItem("stackSort", value);
        },
    },
    methods: {
        stackPinKey(stack) {
            return JSON.stringify([ stack.endpoint || "", stack.name ]);
        },
        loadPinnedStacks() {
            try {
                const stored = JSON.parse(localStorage.getItem("pinnedStacks") || "[]");
                return Array.isArray(stored) ? stored.filter(key => typeof key === "string") : [];
            } catch {
                return [];
            }
        },
        isStackPinned(stack) {
            return this.pinnedStacks.includes(this.stackPinKey(stack));
        },
        toggleStackPin(stack) {
            const key = this.stackPinKey(stack);
            this.pinnedStacks = this.pinnedStacks.includes(key)
                ? this.pinnedStacks.filter(candidate => candidate !== key)
                : [ ...this.pinnedStacks, key ];
            localStorage.setItem("pinnedStacks", JSON.stringify(this.pinnedStacks));
        },
        loadStackSort() {
            const stored = localStorage.getItem("stackSort");
            const migrationKey = "stackSortNameDefaultV1";
            if (!localStorage.getItem(migrationKey)) {
                localStorage.setItem(migrationKey, "true");
                localStorage.setItem("stackSort", "name");
                return "name";
            }
            return [ "name", "status", "agent" ].includes(stored) ? stored : "name";
        },
        loadStackGrouping() {
            const migrationKey = "stackGroupOptionalV1";
            if (!localStorage.getItem(migrationKey)) {
                localStorage.setItem(migrationKey, "true");
                localStorage.setItem("stackGroupByAgent", "false");
                return false;
            }
            return localStorage.getItem("stackGroupByAgent") === "true";
        },
        loadAgentFilters() {
            try {
                const stored = JSON.parse(localStorage.getItem("stackAgentFilters") || "[]");
                if (Array.isArray(stored)) {
                    return stored.filter(endpoint => typeof endpoint === "string");
                }
            } catch {
                // Repli sur l'ancien filtre mono-instance.
            }

            const legacy = localStorage.getItem("stackAgentFilter");
            return legacy && legacy !== "__all__" ? [ legacy ] : [];
        },
        selectAllAgents() {
            this.stackAgentFilters = [];
        },
        isAgentSelected(endpoint) {
            return this.allAgentsSelected || this.stackAgentFilters.includes(endpoint);
        },
        toggleAgent(endpoint) {
            if (this.allAgentsSelected) {
                this.stackAgentFilters = this.agentOptions
                    .map(agent => agent.endpoint)
                    .filter(candidate => candidate !== endpoint);
                return;
            }

            if (this.stackAgentFilters.includes(endpoint)) {
                const selected = this.stackAgentFilters.filter(candidate => candidate !== endpoint);
                this.stackAgentFilters = selected.length === 0 ? [] : selected;
            } else {
                const selected = [ ...this.stackAgentFilters, endpoint ];
                this.stackAgentFilters = selected.length === this.agentOptions.length ? [] : selected;
            }
        },
        agentColorIndex(endpoint) {
            const index = this.agentOptions.findIndex(agent => agent.endpoint === (endpoint || ""));
            return Math.max(0, index) % 8;
        },
        agentColors(endpoint) {
            const palettes = [
                {
                    light: "#1d4ed8",
                    dark: "#60a5fa",
                    tint: "rgba(37, 99, 235, .09)",
                    darkTint: "rgba(96, 165, 250, .11)"
                },
                {
                    light: "#047857",
                    dark: "#34d399",
                    tint: "rgba(5, 150, 105, .09)",
                    darkTint: "rgba(52, 211, 153, .11)"
                },
                {
                    light: "#b45309",
                    dark: "#fbbf24",
                    tint: "rgba(217, 119, 6, .10)",
                    darkTint: "rgba(251, 191, 36, .11)"
                },
                {
                    light: "#7e22ce",
                    dark: "#c084fc",
                    tint: "rgba(147, 51, 234, .09)",
                    darkTint: "rgba(192, 132, 252, .11)"
                },
                {
                    light: "#be123c",
                    dark: "#fb7185",
                    tint: "rgba(225, 29, 72, .09)",
                    darkTint: "rgba(251, 113, 133, .11)"
                },
                {
                    light: "#0e7490",
                    dark: "#22d3ee",
                    tint: "rgba(8, 145, 178, .09)",
                    darkTint: "rgba(34, 211, 238, .11)"
                },
                {
                    light: "#4d7c0f",
                    dark: "#a3e635",
                    tint: "rgba(101, 163, 13, .09)",
                    darkTint: "rgba(163, 230, 53, .11)"
                },
                {
                    light: "#c2410c",
                    dark: "#fb923c",
                    tint: "rgba(234, 88, 12, .09)",
                    darkTint: "rgba(251, 146, 60, .11)"
                },
            ];
            return palettes[this.agentColorIndex(endpoint)];
        },
        agentColorStyle(endpoint) {
            const colors = this.agentColors(endpoint);
            return {
                "--agent-color": colors.light,
                "--agent-color-dark": colors.dark,
                "--agent-tint": colors.tint,
                "--agent-tint-dark": colors.darkTint,
            };
        },
        /**
         * Clear the search bar
         * @returns {void}
         */
        clearSearchText() {
            this.searchText = "";
        },
        /**
         * Set the stack summary status filter.
         * @param {string} statusFilter Status filter to apply
         * @returns {void}
         */
        setStackStatusFilter(statusFilter) {
            this.stackStatusFilter = statusFilter;
        },
        /**
         * Return the compact summary bucket for a stack status.
         * @param {object} stack Stack to classify
         * @returns {string} Summary status bucket
         */
        getStackStatusSummary(stack) {
            if (stack.status === RUNNING) {
                return "active";
            }

            if (stack.status === EXITED) {
                return "stopped";
            }

            return "inactive";
        },
        isStackScheduled(stackName, endpoint = "") {
            if (endpoint) {
                return false;
            }
            const schedule = this.schedules.find(item => item.stack === stackName);
            return Boolean(schedule && (schedule.start?.mode !== "off" || schedule.stop?.mode !== "off"));
        },
        /**
         * Update the StackList Filter
         * @param {object} newFilter Object with new filter
         * @returns {void}
         */
        updateFilter(newFilter) {
            this.filterState = newFilter;
        },
    },
};
</script>

<style lang="scss" scoped>

.shadow-box {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
}

.small-padding {
    padding-left: 5px !important;
    padding-right: 5px !important;
}

.list-header {
    border-bottom: 1px solid var(--border-color);
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    margin: -10px;
    margin-bottom: 7px;
    padding: 8px 10px;
    container-type: inline-size;

    .dark & {
        background-color: var(--bg-raised);
        border-bottom: 0;
    }
}

.header-top {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 7px;
}

.header-filter {
    display: flex;
    align-items: center;
}

// The card's padding is 10px at every width, so the negative margin must
// never exceed -10px (previously -20px bled 10px past the card edge).
@media (max-width: $bp-mobile) {
    .list-header {
        margin: -10px;
        margin-bottom: 10px;
        padding: 5px;
    }
}

.search-wrapper {
    display: grid;
    grid-template-columns: minmax(10.5rem, 1.35fr) 32px minmax(8.5rem, 1fr) minmax(9rem, 1.35fr);
    align-items: center;
    gap: 6px;
    width: 100%;
    min-width: 0;
}

.stack-sort-select {
    width: 100%;
    min-width: 0;
}

.stack-agent-select {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    height: 31px;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 5px 10px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    color: var(--text-color);
    cursor: pointer;
    list-style: none;

    &::-webkit-details-marker {
        display: none;
    }

    span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    svg {
        flex: 0 0 auto;
        font-size: var(--fs-xs);
        transition: transform .15s ease;
    }
}

.stack-agent-filter[open] .stack-agent-select svg {
    transform: rotate(180deg);
}

.stack-agent-filter {
    position: relative;
    width: 100%;
    min-width: 0;
}

.search-wrapper--single-agent {
    grid-template-columns: minmax(8.5rem, 1fr) minmax(9rem, 1.35fr);
}

.stack-agent-menu {
    position: absolute;
    z-index: 30;
    top: calc(100% + 4px);
    left: 0;
    width: max-content;
    min-width: 100%;
    max-width: min(22rem, 85vw);
    padding: 6px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-surface);
}

.stack-agent-option {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 5px 8px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    white-space: nowrap;

    &:hover {
        background: var(--bg-raised);
    }
}

.stack-agent-option--all {
    margin-bottom: 4px;
    border-bottom: 1px solid var(--border-color);
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.stack-group-toggle {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    min-width: 32px;
    height: 31px;
    padding: 0;
    border: 1px solid var(--border-color);
    color: var(--text-muted);

    &.active {
        border-color: var(--primary);
        background: var(--primary-soft);
        color: var(--primary);
    }
}

.stack-search-field {
    display: flex;
    align-items: center;
    // Small basis so the sort select fits on the same row at 280px sidebar
    // width instead of wrapping to its own line.
    flex: 1 1 6rem;
    min-width: 0;
}

.stack-search-field form {
    flex: 1 1 auto;
    min-width: 0;
}

.search-input {
    width: 100%;
    max-width: none;
}

.stack-list {
    flex: 1 1 0;
    min-height: 0;
    height: auto;
    // Safety net: rows must never spill past the card into the content area.
    overflow-x: hidden;
}

// Mobile: the sidebar is stacked in normal flow (no definite height), so the
// box sizes to content, capped at 45vh, and the list scrolls internally.
@media (max-width: $bp-mobile) {
    .shadow-box {
        height: auto;
        max-height: 45vh;
    }

    .stack-list {
        flex: 0 1 auto;
        overflow-y: auto;
    }
}

.stack-agent-group {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 30px;
    margin: 4px 2px 3px;
    padding: 4px 8px;
    border-inline-start: 4px solid var(--agent-color);
    border-radius: var(--radius-sm);
    background: var(--agent-tint);
    color: var(--agent-color);
    font-size: var(--fs-md);

    .dark & {
        border-inline-start-color: var(--agent-color-dark);
        background: var(--agent-tint-dark);
        color: var(--agent-color-dark);
    }
}

.agent-color-dot {
    width: 9px;
    height: 9px;
    flex: 0 0 9px;
    border-radius: 50%;
    background: var(--agent-color);

    .dark & {
        background: var(--agent-color-dark);
    }
}

.stack-agent-count {
    margin-left: auto;
    padding: 1px 7px;
    border-radius: var(--radius-pill);
    background: var(--bg-raised);
    color: inherit;
    font-weight: 700;
}

// Narrow-layout rules shared by the container query and its media-query fallback.
@mixin stack-list-narrow {
    .search-wrapper {
        grid-template-columns: minmax(0, 1fr) 32px;
    }

    .stack-sort-select,
    .stack-search-field {
        grid-column: 1 / -1;
    }

    .stack-search-field,
    .stack-search-field form,
    .search-input {
        width: 100%;
        min-width: 0;
        max-width: 100%;
    }

    .search-wrapper--single-agent {
        grid-template-columns: minmax(0, 1fr);
    }
}

@container (max-width: 470px) {
    @include stack-list-narrow;
}

// Fallback for browsers without container-query support.
@media (max-width: $bp-tablet) {
    @include stack-list-narrow;
}

.search-icon {
    padding: 10px;
    color: var(--text-muted);

    // Clear filter button (X)
    svg[data-icon="times"] {
        cursor: pointer;
        transition: all ease-in-out 0.1s;

        &:hover {
            opacity: 0.5;
        }
    }
}

.stack-summary {
    display: flex;
    width: 100%;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-width: 0;
}

.stack-summary-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 28px;
    padding: 4px 9px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-raised);
    color: var(--text-color);
    font-size: var(--fs-sm);
    line-height: 1;
    white-space: nowrap;
    transition: border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease;

    &:hover,
    &.selected {
        border-color: var(--primary);
        background: var(--primary-soft);
    }

    strong {
        font-size: var(--fs-md);
        font-weight: 700;
    }
}

.stack-summary-pill--active {
    border-color: var(--success);
    background: var(--success-soft);

    &.selected,
    &:hover {
        border-color: var(--success);
        background: var(--success-soft);
    }
}

.stack-summary-pill--stopped {
    border-color: var(--warning);
    background: var(--warning-soft);

    &.selected,
    &:hover {
        border-color: var(--warning);
        background: var(--warning-soft);
    }
}

.stack-summary-pill--inactive {
    border-color: var(--border-strong);
    background: var(--bg-raised);

    &.selected,
    &:hover {
        border-color: var(--border-strong);
        background: var(--bg-raised);
    }
}

.stack-item {
    width: 100%;
}

.tags {
    margin-top: 4px;
    padding-left: 67px;
    display: flex;
    flex-wrap: wrap;
    gap: 0;
}

.bottom-style {
    padding-left: 67px;
    margin-top: 5px;
}

</style>
