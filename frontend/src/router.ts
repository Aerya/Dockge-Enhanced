import { createRouter, createWebHistory } from "vue-router";

import Layout from "./layouts/Layout.vue";
import Setup from "./pages/Setup.vue";
import Dashboard from "./pages/Dashboard.vue";
import DashboardHome from "./pages/DashboardHome.vue";
import Console from "./pages/Console.vue";
import Compose from "./pages/Compose.vue";
import ContainerTerminal from "./pages/ContainerTerminal.vue";
import WatcherSettings from "./components/WatcherSettings.vue";
import { i18n } from "./i18n";

const Settings = () => import("./pages/Settings.vue");

// Settings - Sub Pages
import Appearance from "./components/settings/Appearance.vue";
import General from "./components/settings/General.vue";
const Security = () => import("./components/settings/Security.vue");
const GlobalEnv = () => import("./components/settings/GlobalEnv.vue");
const Integrations = () => import("./components/settings/Integrations.vue");
const Automation = () => import("./components/settings/Automation.vue");
import About from "./components/settings/About.vue";

// Watcher - Tabs
import WatcherImagesTab from "./components/watcher/WatcherImagesTab.vue";
import WatcherTrivyTab from "./components/watcher/WatcherTrivyTab.vue";
import WatcherNotificationsTab from "./components/watcher/WatcherNotificationsTab.vue";
import WatcherUpdatesTab from "./components/watcher/WatcherUpdatesTab.vue";
import BackupTab from "./components/BackupTab.vue";
import MonitoringTab from "./components/MonitoringTab.vue";
import AuditLogTab from "./components/AuditLogTab.vue";
import StackSchedulerTab from "./components/StackSchedulerTab.vue";
const DockerResources = () => import("./pages/DockerResources.vue");

// Valid watcher tab slugs, used to map legacy /watcher?tab=X deep links
const WATCHER_TABS = new Set([ "images", "updates", "scheduler", "trivy", "backup", "resources", "notifications", "monitoring", "audit" ]);

const routes = [
    {
        path: "/empty",
        component: Layout,
        children: [
            {
                path: "",
                component: Dashboard,
                children: [
                    {
                        name: "DashboardHome",
                        path: "/",
                        component: DashboardHome,
                        meta: { title: "home" },
                        children: [
                            {
                                path: "/compose",
                                component: Compose,
                                meta: { title: "compose" },
                            },
                            {
                                path: "/compose/:stackName/:endpoint",
                                component: Compose,
                                meta: { title: "compose" },
                            },
                            {
                                path: "/compose/:stackName",
                                component: Compose,
                                meta: { title: "compose" },
                            },
                            {
                                path: "/terminal/:stackName/:serviceName/:type",
                                component: ContainerTerminal,
                                name: "containerTerminal",
                                meta: { title: "terminal" },
                            },
                            {
                                path: "/terminal/:stackName/:serviceName/:type/:endpoint",
                                component: ContainerTerminal,
                                name: "containerTerminalEndpoint",
                                meta: { title: "terminal" },
                            },
                        ]
                    },
                    {
                        path: "/watcher",
                        component: WatcherSettings,
                        children: [
                            {
                                path: "",
                                // Bare /watcher and legacy /watcher?tab=X deep links
                                redirect: (to) => {
                                    const tab = typeof to.query.tab === "string" ? to.query.tab : "";
                                    // query: {} drops the legacy ?tab=X from the redirected URL
                                    return { path: WATCHER_TABS.has(tab) ? `/watcher/${tab}` : "/watcher/images", query: {} };
                                },
                            },
                            {
                                path: "images",
                                name: "watcher-images",
                                component: WatcherImagesTab,
                                meta: { title: "watcher.tab.images" },
                            },
                            {
                                path: "updates",
                                name: "watcher-updates",
                                component: WatcherUpdatesTab,
                                meta: { title: "updates.heading" },
                            },
                            {
                                path: "scheduler",
                                name: "watcher-scheduler",
                                component: StackSchedulerTab,
                                meta: { title: "watcher.tab.scheduler" },
                            },
                            {
                                path: "trivy",
                                name: "watcher-trivy",
                                component: WatcherTrivyTab,
                                meta: { title: "watcher.tab.security" },
                            },
                            {
                                path: "backup",
                                name: "watcher-backup",
                                component: BackupTab,
                                meta: { title: "watcher.tab.backup" },
                            },
                            {
                                path: "resources",
                                name: "watcher-resources",
                                component: DockerResources,
                                meta: { title: "watcher.tab.resources" },
                            },
                            {
                                path: "notifications",
                                name: "watcher-notifications",
                                component: WatcherNotificationsTab,
                                meta: { title: "watcher.tab.notifications" },
                            },
                            {
                                path: "monitoring",
                                name: "watcher-monitoring",
                                component: MonitoringTab,
                                meta: { title: "watcher.tab.monitoring" },
                            },
                            {
                                path: "audit",
                                name: "watcher-audit",
                                component: AuditLogTab,
                                meta: { title: "watcher.tab.audit" },
                            },
                        ]
                    },
                    {
                        path: "/resources",
                        redirect: "/watcher",
                    },
                    {
                        path: "/console",
                        component: Console,
                        meta: { title: "console" },
                    },
                    {
                        path: "/settings",
                        component: Settings,
                        meta: { title: "Settings" },
                        children: [
                            {
                                path: "general",
                                name: "settings-general",
                                component: General,
                                meta: { title: "general" },
                            },
                            {
                                path: "appearance",
                                name: "settings-appearance",
                                component: Appearance,
                                meta: { title: "Appearance" },
                            },
                            {
                                path: "security",
                                name: "settings-security",
                                component: Security,
                                meta: { title: "Security" },
                            },
                            {
                                path: "globalEnv",
                                name: "settings-globalEnv",
                                component: GlobalEnv,
                                meta: { title: "GlobalEnv" },
                            },
                            {
                                path: "integrations",
                                name: "settings-integrations",
                                component: Integrations,
                                meta: { title: "Integrations" },
                            },
                            {
                                path: "automation",
                                name: "settings-automation",
                                component: Automation,
                                meta: { title: "automation.heading" },
                            },
                            {
                                path: "about",
                                name: "settings-about",
                                component: About,
                                meta: { title: "About" },
                            },
                        ]
                    },
                ]
            },
        ]
    },
    {
        path: "/setup",
        component: Setup,
    },
    {
        path: "/:pathMatch(.*)*",
        redirect: "/",
    },
];

export const router = createRouter({
    linkActiveClass: "active",
    history: createWebHistory(),
    routes,
});

router.afterEach((to) => {
    const key = to.meta.title;
    const title = typeof key === "string" ? i18n.global.t(key) : "";
    document.title = (title ? `${title} - ` : "") + "Dockge Enhanced - " + location.host;
});
