<template>
    <div class="container-fluid">
        <div ref="dashboardLayout" class="dashboard-layout" :style="dashboardLayoutStyle">
            <aside v-if="!$root.isMobile" class="stack-sidebar">
                <div>
                    <router-link to="/compose" class="btn btn-primary mb-3"><font-awesome-icon icon="plus" /> {{ $t("compose") }}</router-link>
                </div>
                <StackList :scrollbar="true" />
            </aside>

            <div
                v-if="!$root.isMobile"
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
@import "../styles/vars.scss";

.container-fluid {
    width: 98%;
}

.dashboard-layout {
    display: grid;
    align-items: stretch;
    width: 100%;
}

.stack-sidebar,
.dashboard-content {
    min-width: 0;
}

.stack-sidebar {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
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
        background: rgba(127, 127, 127, .28);
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

@media (max-width: 767.98px) {
    .dashboard-layout {
        display: block;
    }
}
</style>
