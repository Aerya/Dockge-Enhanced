<template>
    <div class="container-fluid">
        <div ref="dashboardLayout" class="dashboard-layout" :class="{ collapsed: sidebarCollapsed }" :style="dashboardLayoutStyle">
            <aside class="stack-sidebar">
                <div class="sidebar-header">
                    <router-link v-if="!sidebarCollapsed" to="/compose" class="btn btn-primary"><font-awesome-icon icon="plus" /> {{ $t("compose") }}</router-link>
                    <router-link v-else to="/compose" class="sidebar-icon-btn" :title="$t('compose')">
                        <font-awesome-icon icon="plus" />
                    </router-link>
                    <button
                        type="button"
                        class="sidebar-icon-btn sidebar-toggle"
                        :aria-label="$t(sidebarCollapsed ? 'stackSidebarExpand' : 'stackSidebarCollapse')"
                        :title="$t(sidebarCollapsed ? 'stackSidebarExpand' : 'stackSidebarCollapse')"
                        @click="toggleSidebar"
                    >
                        <font-awesome-icon :icon="sidebarCollapsed ? 'chevron-right' : 'chevron-left'" />
                    </button>
                </div>
                <StackList v-show="!sidebarCollapsed" :scrollbar="true" />
            </aside>

            <main ref="container" class="dashboard-content mb-3">
                <!-- Add :key to disable vue router re-use the same component -->
                <router-view :key="$route.fullPath" :calculatedHeight="height" />
            </main>
        </div>
    </div>
</template>

<script>

import StackList from "../components/StackList.vue";

export default {
    components: {
        StackList,
    },
    data() {
        return {
            height: 0,
            // Desktop: persisted collapse state. Mobile: always starts
            // collapsed (accordion), the state is not persisted.
            sidebarCollapsed: this.$root.isMobile || localStorage.getItem("stackSidebarCollapsed") === "true",
            dashboardMinHeight: 240,
            dashboardHeightObserver: null,
        };
    },
    computed: {
        dashboardLayoutStyle() {
            if (this.$root.isMobile) {
                return {};
            }
            return {
                minHeight: `${this.dashboardMinHeight}px`,
            };
        },
    },
    mounted() {
        this.height = this.$refs.container.offsetHeight;
        this.$nextTick(this.updateDashboardMinHeight);
        window.addEventListener("resize", this.updateDashboardMinHeight);
        const desktopHeader = document.querySelector(".desktop-header");
        if (desktopHeader && typeof ResizeObserver !== "undefined") {
            this.dashboardHeightObserver = new ResizeObserver(this.updateDashboardMinHeight);
            this.dashboardHeightObserver.observe(desktopHeader);
        }
    },
    unmounted() {
        window.removeEventListener("resize", this.updateDashboardMinHeight);
        this.dashboardHeightObserver?.disconnect();
    },
    methods: {
        updateDashboardMinHeight() {
            const top = this.$refs.dashboardLayout?.getBoundingClientRect().top;
            if (typeof top !== "number") {
                return;
            }
            this.dashboardMinHeight = Math.max(240, Math.floor(window.innerHeight - top - 16));
        },
        toggleSidebar() {
            this.sidebarCollapsed = !this.sidebarCollapsed;
            if (!this.$root.isMobile) {
                localStorage.setItem("stackSidebarCollapsed", String(this.sidebarCollapsed));
            }
        },
    },
};
</script>

<style lang="scss" scoped>

.container-fluid {
    width: 98%;
}

.dashboard-layout {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
    gap: var(--space-4);
    align-items: stretch;
    width: 100%;
    transition: grid-template-columns 0.2s ease;

    &.collapsed {
        grid-template-columns: 52px minmax(0, 1fr);
    }
}

.stack-sidebar,
.dashboard-content {
    min-width: 0;
}

.stack-sidebar {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
}

.sidebar-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-3);

    .collapsed & {
        flex-direction: column;
    }

    .btn {
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
    }

    .sidebar-toggle {
        margin-left: auto;

        .collapsed & {
            margin-left: 0;
        }
    }
}

.sidebar-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-surface);
    color: var(--text-muted);
    cursor: pointer;

    &:hover {
        background: var(--bg-raised);
        color: var(--text-color);
    }
}

@media (max-width: $bp-mobile) {
    .dashboard-layout,
    .dashboard-layout.collapsed {
        display: block;
    }

    // Sidebar stacks above the content; StackList caps itself at 45vh
    // (see StackList.vue) and scrolls internally.
    .stack-sidebar {
        display: block;
        margin-bottom: 1rem;
    }

    .sidebar-header,
    .collapsed .sidebar-header {
        flex-direction: row;
    }
}
</style>
