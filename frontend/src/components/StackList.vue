<template>
    <div class="shadow-box mb-3" :style="boxStyle">
        <div class="list-header">
            <div class="header-top">
                <!-- TODO -->
                <button v-if="false" class="btn btn-outline-normal ms-2" :class="{ 'active': selectMode }" type="button" @click="selectMode = !selectMode">
                    {{ $t("Select") }}
                </button>

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
                </div>
                <div class="search-wrapper">
                    <label class="visually-hidden" for="stackSort">{{ $t("stackSortLabel") }}</label>
                    <select id="stackSort" v-model="stackSort" class="form-select form-select-sm stack-sort-select">
                        <option value="status">{{ $t("stackSortStatus") }}</option>
                        <option value="agent">{{ $t("stackSortAgent") }}</option>
                    </select>
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

            <!-- TODO -->
            <div v-if="false" class="header-filter">
                <!--<StackListFilter :filterState="filterState" @update-filter="updateFilter" />-->
            </div>

            <!-- TODO: Selection Controls -->
            <div v-if="selectMode && false" class="selection-controls px-2 pt-2">
                <input
                    v-model="selectAll"
                    class="form-check-input select-input"
                    type="checkbox"
                />

                <button class="btn-outline-normal" @click="pauseDialog"><font-awesome-icon icon="pause" size="sm" /> {{ $t("Pause") }}</button>
                <button class="btn-outline-normal" @click="resumeSelected"><font-awesome-icon icon="play" size="sm" /> {{ $t("Resume") }}</button>

                <span v-if="selectedStackCount > 0">
                    {{ $t("selectedStackCount", [ selectedStackCount ]) }}
                </span>
            </div>
        </div>
        <div ref="stackList" class="stack-list" :class="{ scrollbar: scrollbar }" :style="stackListStyle">
            <div v-if="Object.keys(sortedStackList).length === 0" class="text-center mt-3">
                <router-link to="/compose">{{ $t("addFirstStackMsg") }}</router-link>
            </div>

            <StackListItem
                v-for="(item, index) in sortedStackList"
                :key="index"
                :stack="item"
                :isSelectMode="selectMode"
                :isSelected="isSelected"
                :select="select"
                :deselect="deselect"
            />
        </div>
    </div>

    <Confirm ref="confirmPause" :yes-text="$t('Yes')" :no-text="$t('No')" @yes="pauseSelected">
        {{ $t("pauseStackMsg") }}
    </Confirm>
</template>

<script>
import Confirm from "../components/Confirm.vue";
import StackListItem from "../components/StackListItem.vue";
import { CREATED_FILE, CREATED_STACK, EXITED, RUNNING, UNKNOWN } from "../../../common/util-common";

export default {
    components: {
        Confirm,
        StackListItem,
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
            selectMode: false,
            selectAll: false,
            disableSelectAllWatcher: false,
            selectedStacks: {},
            windowTop: 0,
            stackStatusFilter: "all",
            stackSort: localStorage.getItem("stackSort") || "status",
            filterState: {
                status: null,
                active: null,
                tags: null,
            }
        };
    },
    computed: {
        /**
         * Improve the sticky appearance of the list by increasing its
         * height as user scrolls down.
         * Not used on mobile.
         * @returns {object} Style for stack list
         */
        boxStyle() {
            if (window.innerWidth > 550) {
                return {
                    height: `calc(100vh - 160px + ${this.windowTop}px)`,
                };
            } else {
                return {
                    height: "calc(100vh - 160px)",
                };
            }

        },

        /**
         * Returns a sorted list of stacks based on the applied filters and search text.
         * @returns {Array} The sorted list of stacks.
         */
        sortedStackList() {
            let result = this.allStacks;

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
                if (this.stackStatusFilter !== "all") {
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

                if (this.stackSort === "agent") {
                    const agent1 = this.$root.endpointDisplayFunction(m1.endpoint || "");
                    const agent2 = this.$root.endpointDisplayFunction(m2.endpoint || "");
                    const agentOrder = agent1.localeCompare(agent2, undefined, { sensitivity: "base" });
                    if (agentOrder !== 0) return agentOrder;

                    const endpointOrder = (m1.endpoint || "").localeCompare(m2.endpoint || "");
                    if (endpointOrder !== 0) return endpointOrder;
                    return m1.name.localeCompare(m2.name);
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

        stackSummary() {
            const summary = {
                total: 0,
                active: 0,
                stopped: 0,
                inactive: 0,
            };

            for (const stack of this.allStacks) {
                const status = this.getStackStatusSummary(stack);
                summary.total += 1;

                if (status === "active") {
                    summary.active += 1;
                } else if (status === "stopped") {
                    summary.stopped += 1;
                } else {
                    summary.inactive += 1;
                }
            }

            return summary;
        },

        isDarkTheme() {
            return document.body.classList.contains("dark");
        },

        stackListStyle() {
            //let listHeaderHeight = 107;
            let listHeaderHeight = window.innerWidth > 770 ? 64 : 112;

            if (this.selectMode) {
                listHeaderHeight += 42;
            }

            return {
                "height": `calc(100% - ${listHeaderHeight}px)`
            };
        },

        selectedStackCount() {
            return Object.keys(this.selectedStacks).length;
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
        stackSort(value) {
            localStorage.setItem("stackSort", value);
        },
        searchText() {
            for (let stack of this.sortedStackList) {
                if (!this.selectedStacks[stack.id]) {
                    if (this.selectAll) {
                        this.disableSelectAllWatcher = true;
                        this.selectAll = false;
                    }
                    break;
                }
            }
        },
        selectAll() {
            if (!this.disableSelectAllWatcher) {
                this.selectedStacks = {};

                if (this.selectAll) {
                    this.sortedStackList.forEach((item) => {
                        this.selectedStacks[item.id] = true;
                    });
                }
            } else {
                this.disableSelectAllWatcher = false;
            }
        },
        selectMode() {
            if (!this.selectMode) {
                this.selectAll = false;
                this.selectedStacks = {};
            }
        },
    },
    mounted() {
        window.addEventListener("scroll", this.onScroll);
    },
    beforeUnmount() {
        window.removeEventListener("scroll", this.onScroll);
    },
    methods: {
        /**
         * Handle user scroll
         * @returns {void}
         */
        onScroll() {
            if (window.top.scrollY <= 133) {
                this.windowTop = window.top.scrollY;
            } else {
                this.windowTop = 133;
            }
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
        /**
         * Update the StackList Filter
         * @param {object} newFilter Object with new filter
         * @returns {void}
         */
        updateFilter(newFilter) {
            this.filterState = newFilter;
        },
        /**
         * Deselect a stack
         * @param {number} id ID of stack
         * @returns {void}
         */
        deselect(id) {
            delete this.selectedStacks[id];
        },
        /**
         * Select a stack
         * @param {number} id ID of stack
         * @returns {void}
         */
        select(id) {
            this.selectedStacks[id] = true;
        },
        /**
         * Determine if stack is selected
         * @param {number} id ID of stack
         * @returns {bool} Is the stack selected?
         */
        isSelected(id) {
            return id in this.selectedStacks;
        },
        /**
         * Disable select mode and reset selection
         * @returns {void}
         */
        cancelSelectMode() {
            this.selectMode = false;
            this.selectedStacks = {};
        },
        /**
         * Show dialog to confirm pause
         * @returns {void}
         */
        pauseDialog() {
            this.$refs.confirmPause.show();
        },
        /**
         * Pause each selected stack
         * @returns {void}
         */
        pauseSelected() {
            Object.keys(this.selectedStacks)
                .filter(id => this.$root.stackList[id].active)
                .forEach(id => this.$root.getSocket().emit("pauseStack", id, () => {}));

            this.cancelSelectMode();
        },
        /**
         * Resume each selected stack
         * @returns {void}
         */
        resumeSelected() {
            Object.keys(this.selectedStacks)
                .filter(id => !this.$root.stackList[id].active)
                .forEach(id => this.$root.getSocket().emit("resumeStack", id, () => {}));

            this.cancelSelectMode();
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.shadow-box {
    height: calc(100vh - 150px);
    position: sticky;
    top: 10px;
}

.small-padding {
    padding-left: 5px !important;
    padding-right: 5px !important;
}

.list-header {
    border-bottom: 1px solid #dee2e6;
    border-radius: 10px 10px 0 0;
    margin: -10px;
    margin-bottom: 10px;
    padding: 10px;

    .dark & {
        background-color: $dark-header-bg;
        border-bottom: 0;
    }
}

.header-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
}

.header-filter {
    display: flex;
    align-items: center;
}

@media (max-width: 770px) {
    .list-header {
        margin: -20px;
        margin-bottom: 10px;
        padding: 5px;
    }
}

.search-wrapper {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
}

.stack-sort-select {
    width: auto;
    max-width: 10em;
}

@media (max-width: 770px) {
    .search-wrapper {
        width: 100%;
    }

    .stack-sort-select {
        flex: 0 0 9.5em;
    }

    .search-wrapper form {
        flex: 1 1 auto;
    }

    .search-input {
        width: 100%;
        max-width: none;
    }
}

.search-icon {
    padding: 10px;
    color: #c0c0c0;

    // Clear filter button (X)
    svg[data-icon="times"] {
        cursor: pointer;
        transition: all ease-in-out 0.1s;

        &:hover {
            opacity: 0.5;
        }
    }
}

.search-input {
    max-width: 15em;
}

.stack-summary {
    display: flex;
    flex: 1 1 auto;
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
    border: 1px solid rgba(120, 138, 156, 0.35);
    border-radius: 8px;
    background: rgba(120, 138, 156, 0.08);
    color: #334155;
    font-size: 0.78rem;
    line-height: 1;
    white-space: nowrap;
    transition: border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease;

    .dark & {
        color: $dark-font-color;
    }

    &:hover,
    &.selected {
        border-color: rgba(82, 186, 255, 0.7);
        background: rgba(82, 186, 255, 0.14);
    }

    strong {
        font-size: 0.82rem;
        font-weight: 700;
    }
}

.stack-summary-pill--active {
    border-color: rgba(84, 207, 150, 0.45);
    background: rgba(84, 207, 150, 0.13);

    &.selected,
    &:hover {
        border-color: rgba(84, 207, 150, 0.8);
        background: rgba(84, 207, 150, 0.2);
    }
}

.stack-summary-pill--stopped {
    border-color: rgba(224, 183, 86, 0.45);
    background: rgba(224, 183, 86, 0.13);

    &.selected,
    &:hover {
        border-color: rgba(224, 183, 86, 0.85);
        background: rgba(224, 183, 86, 0.22);
    }
}

.stack-summary-pill--inactive {
    border-color: rgba(148, 163, 184, 0.38);
    background: rgba(148, 163, 184, 0.1);

    &.selected,
    &:hover {
        border-color: rgba(148, 163, 184, 0.72);
        background: rgba(148, 163, 184, 0.18);
    }
}

@media (max-width: 770px) {
    .header-top {
        align-items: flex-start;
        flex-direction: column;
    }

    .search-wrapper {
        width: 100%;
    }

    .search-wrapper form,
    .search-input {
        width: 100%;
        max-width: none;
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

.selection-controls {
    margin-top: 5px;
    display: flex;
    align-items: center;
    gap: 10px;
}

</style>
