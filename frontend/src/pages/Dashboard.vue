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

            <div
                v-if="!$root.isMobile && !sidebarCollapsed"
                class="dashboard-resize-handle"
                role="separator"
                aria-orientation="vertical"
                :aria-label="$t('stackListResize')"
                aria-valuemin="18"
                aria-valuemax="40"
                :aria-valuenow="stackSidebarWidth"
                tabindex="0"
                @pointerdown="startDashboardResize"
                @keydown.left.prevent="resizeDashboardBy(-2)"
                @keydown.right.prevent="resizeDashboardBy(2)"
            >
                <span></span>
            </div>

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
            stackSidebarWidth: Math.min(40, Math.max(18, Number(localStorage.getItem("stackSidebarWidth")) || 25)),
            dashboardResizing: false,
            dashboardMinHeight: 240,
            dashboardHeightObserver: null,
        };
    },
    computed: {
        dashboardLayoutStyle() {
            if (this.$root.isMobile) {
                return {};
            }
            if (this.sidebarCollapsed) {
                return {
                    gridTemplateColumns: "52px minmax(0, 1fr)",
                    minHeight: `${this.dashboardMinHeight}px`,
                };
            }
            return {
                gridTemplateColumns: `minmax(0, ${this.stackSidebarWidth}fr) 10px minmax(0, ${100 - this.stackSidebarWidth}fr)`,
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
        this.stopDashboardResize();
        window.removeEventListener("resize", this.updateDashboardMinHeight);
        this.dashboardHeightObserver?.disconnect();
    },
    methods: {
        toggleSidebar() {
            this.sidebarCollapsed = !this.sidebarCollapsed;
            if (!this.$root.isMobile) {
                localStorage.setItem("stackSidebarCollapsed", String(this.sidebarCollapsed));
            }
        },
        updateDashboardMinHeight() {
            const top = this.$refs.dashboardLayout?.getBoundingClientRect().top;
            if (typeof top !== "number") {
                return;
            }
            this.dashboardMinHeight = Math.max(240, Math.floor(window.innerHeight - top - 16));
        },
        startDashboardResize(event) {
            if (window.innerWidth < 768) {
                return;
            }
            event.preventDefault();
            this.dashboardResizing = true;
            document.body.classList.add("dashboard-resizing");
            window.addEventListener("pointermove", this.moveDashboardResize);
            window.addEventListener("pointerup", this.stopDashboardResize, { once: true });
        },
        moveDashboardResize(event) {
            if (!this.dashboardResizing) {
                return;
            }
            const bounds = this.$refs.dashboardLayout?.getBoundingClientRect();
            if (!bounds?.width) {
                return;
            }
            const width = ((event.clientX - bounds.left) / bounds.width) * 100;
            this.stackSidebarWidth = Math.min(40, Math.max(18, Math.round(width)));
        },
        stopDashboardResize() {
            if (this.dashboardResizing) {
                localStorage.setItem("stackSidebarWidth", String(this.stackSidebarWidth));
            }
            this.dashboardResizing = false;
            document.body.classList.remove("dashboard-resizing");
            window.removeEventListener("pointermove", this.moveDashboardResize);
            window.removeEventListener("pointerup", this.stopDashboardResize);
        },
        resizeDashboardBy(delta) {
            this.stackSidebarWidth = Math.min(40, Math.max(18, this.stackSidebarWidth + delta));
            localStorage.setItem("stackSidebarWidth", String(this.stackSidebarWidth));
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
    gap: var(--space-4);
    align-items: stretch;
    width: 100%;
    transition: grid-template-columns 0.2s ease;

}

.stack-sidebar,
.dashboard-content {
    min-width: 0;
}

.stack-sidebar {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    // The implicit column would otherwise size to the widest child's
    // min-content (a long stack name inside the no-wrap item flex) and spill
    // past the 280px track into the content area. Pin it to the track.
    grid-template-columns: minmax(0, 1fr);
    // Pinned card: the sidebar (and the collapsed rail) stays in place while
    // the right content scrolls.
    position: sticky;
    top: var(--space-3);
    height: calc(100vh - var(--space-6));
    align-self: start;
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

.dashboard-resize-handle {
    align-self: stretch;
    min-height: 240px;
    cursor: col-resize;
    display: flex;
    justify-content: center;
    touch-action: none;
    outline: none;

    span {
        width: 3px;
        min-height: 240px;
        height: 100%;
        border-radius: 2px;
        background: var(--border-color);
        transition: width .15s ease, background-color .15s ease;
    }

    &:hover span,
    &:focus-visible span {
        width: 5px;
        background: $primary;
    }
}

:global(body.dashboard-resizing) {
    cursor: col-resize;
    user-select: none;
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
        position: static;
        height: auto;
        margin-bottom: 1rem;
    }

    .sidebar-header,
    .collapsed .sidebar-header {
        flex-direction: row;
    }
}
</style>
