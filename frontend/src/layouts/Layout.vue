<template>
    <div :class="classes">
        <div v-if="! $root.socketIO.connected && ! $root.socketIO.firstConnect" class="lost-connection">
            <div class="container-fluid">
                {{ $root.socketIO.connectionErrorMsg }}
                <div v-if="$root.socketIO.showReverseProxyGuide">
                    {{ $t("reverseProxyMsg1") }} <a href="https://github.com/louislam/uptime-kuma/wiki/Reverse-Proxy" target="_blank">{{ $t("reverseProxyMsg2") }}</a>
                </div>
            </div>
        </div>

        <div v-if="showReleaseNews" class="release-news-backdrop" role="presentation" @click.self="closeReleaseNews">
            <section class="release-news-dialog" role="dialog" aria-modal="true" :aria-labelledby="'release-news-title'">
                <div class="release-news-header">
                    <div>
                        <div class="release-news-kicker">Dockge-Enhanced</div>
                        <h2 id="release-news-title">{{ $t("releaseNews.title") }}</h2>
                    </div>
                    <button type="button" class="btn btn-sm btn-normal" :aria-label="$t('releaseNews.close')" @click="closeReleaseNews">
                        <font-awesome-icon icon="times" />
                    </button>
                </div>
                <p class="release-news-intro">{{ $t("releaseNews.intro") }}</p>
                <ul class="release-news-list">
                    <li v-for="item in releaseNewsItems" :key="item">
                        <font-awesome-icon icon="check-circle" />
                        <span>{{ $t(item) }}</span>
                    </li>
                </ul>
                <div class="release-news-actions">
                    <button type="button" class="btn btn-primary" @click="closeReleaseNews">{{ $t("releaseNews.gotIt") }}</button>
                </div>
            </section>
        </div>

        <!-- Desktop header -->
        <header v-if="! $root.isMobile" class="desktop-header py-3 mb-3 border-bottom" :class="{ 'has-stats': showHeaderStats }">
            <div class="desktop-brand d-flex align-items-center">
                <router-link to="/" class="d-flex align-items-center text-dark text-decoration-none">
                    <object class="bi me-2 ms-4" width="40" height="40" data="/icon.svg" />
                    <span class="fs-4 title">Dockge-Enhanced</span>
                </router-link>
                <span class="ms-2 d-flex gap-1 align-items-center brand-badges">
                    <a href="https://github.com/louislam/dockge" target="_blank" rel="noopener"
                        class="github-badge" title="Dockge upstream">Dockge</a>
                    <span style="opacity:.35">+</span>
                    <a href="https://github.com/Aerya/dockge-enhanced" target="_blank" rel="noopener"
                        class="github-badge github-badge-enhanced" title="Dockge Enhanced">Enhanced</a>
                </span>
            </div>

            <div class="desktop-update-area">
                <a v-if="hasNewVersion" target="_blank" href="https://github.com/louislam/dockge/releases" class="btn btn-warning">
                    <font-awesome-icon icon="arrow-alt-circle-up" /> {{ $t("newUpdate") }}
                </a>

                <!-- Bannière mise à jour Dockge-Enhanced -->
                <div v-if="selfUpdate.available && !selfUpdate.dismissed" class="self-update-banner">
                    <font-awesome-icon icon="arrow-circle-up" class="me-1" />
                    {{ $t("selfUpdate.banner") }} —
                    <code class="mx-2">{{ selfUpdateCmd }}</code>
                    <button class="btn-copy ms-1" @click="copyUpdateCmd" :title="selfUpdate.copied ? $t('selfUpdate.copied') : $t('selfUpdate.copy')">
                        {{ selfUpdate.copied ? '✓' : '⧉' }}
                    </button>
                    <button class="btn-dismiss ms-2" @click="selfUpdate.dismissed = true" :title="$t('selfUpdate.dismiss')">✕</button>
                </div>
            </div>

            <ul class="desktop-nav nav nav-pills">
                <li v-if="$root.loggedIn" class="nav-item me-2">
                    <router-link to="/" class="nav-link">
                        <font-awesome-icon icon="home" /> {{ $t("home") }}
                    </router-link>
                </li>

                <li v-if="$root.loggedIn" class="nav-item me-2">
                    <router-link to="/console" class="nav-link">
                        <font-awesome-icon icon="terminal" /> {{ $t("console") }}
                    </router-link>
                </li>

                <li v-if="$root.loggedIn" class="nav-item me-2">
                    <router-link to="/watcher" class="nav-link">
                        <font-awesome-icon icon="bolt" /> {{ $t("watcher.title") }}
                    </router-link>
                </li>

                <li class="nav-item me-2 d-flex align-items-center">
                    <button type="button" class="nav-link theme-toggle" :aria-label="$t('Theme')" @click="$root.toggleTheme">
                        <font-awesome-icon :icon="$root.theme === 'dark' ? 'sun' : 'moon'" />
                    </button>
                </li>

                <li v-if="$root.loggedIn" class="nav-item">
                    <div class="dropdown dropdown-profile-pic">
                        <div class="nav-link" data-bs-toggle="dropdown">
                            <div class="profile-pic">{{ $root.usernameFirstChar }}</div>
                            <font-awesome-icon icon="angle-down" />
                        </div>

                        <!-- Header's Dropdown Menu -->
                        <ul class="dropdown-menu">
                            <!-- Username -->
                            <li>
                                <i18n-t v-if="$root.username != null" tag="span" keypath="signedInDisp" class="dropdown-item-text">
                                    <strong>{{ $root.username }}</strong>
                                </i18n-t>
                                <span v-if="$root.username == null" class="dropdown-item-text">{{ $t("signedInDispDisabled") }}</span>
                            </li>

                            <li><hr class="dropdown-divider"></li>

                            <!-- Functions -->

                            <li>
                                <button class="dropdown-item" @click="scanFolder">
                                    <font-awesome-icon icon="arrows-rotate" /> {{ $t("scanFolder") }}
                                </button>
                            </li>

                            <li>
                                <router-link to="/settings/general" class="dropdown-item" :class="{ active: $route.path.includes('settings') }">
                                    <font-awesome-icon icon="cog" /> {{ $t("Settings") }}
                                </router-link>
                            </li>

                            <li>
                                <button class="dropdown-item" @click="$root.logout">
                                    <font-awesome-icon icon="sign-out-alt" />
                                    {{ $t("Logout") }}
                                </button>
                            </li>
                        </ul>
                    </div>
                </li>
            </ul>

            <SystemStatsBar
                v-if="showHeaderStats"
                variant="header"
                :system-stats="systemStats"
                :kula-url="kulaUrl"
                :dozzle-url="dozzleUrl"
            />
        </header>

        <!-- Mobile header -->
        <header v-if="$root.isMobile" class="mobile-header">
            <button type="button" class="mobile-nav-toggle" aria-label="Menu" @click="showMobileNav = true">
                <font-awesome-icon icon="bars" />
            </button>
            <router-link to="/" class="mobile-brand text-decoration-none">
                <object class="bi me-2" width="28" height="28" data="/icon.svg" />
                <span class="title">Dockge-Enhanced</span>
            </router-link>
            <button type="button" class="mobile-nav-toggle ms-auto" :aria-label="$t('Theme')" @click="$root.toggleTheme">
                <font-awesome-icon :icon="$root.theme === 'dark' ? 'sun' : 'moon'" />
            </button>
        </header>

        <!-- Mobile navigation drawer -->
        <BOffcanvas v-model="showMobileNav" placement="start" title="Dockge-Enhanced" body-class="mobile-drawer">
            <div v-if="$root.loggedIn && $root.username != null" class="mobile-drawer-user">
                <span class="profile-pic">{{ $root.usernameFirstChar }}</span>
                <strong>{{ $root.username }}</strong>
            </div>

            <nav class="mobile-drawer-nav">
                <router-link to="/" class="mobile-drawer-link">
                    <font-awesome-icon icon="home" /> {{ $t("home") }}
                </router-link>
                <router-link to="/console" class="mobile-drawer-link">
                    <font-awesome-icon icon="terminal" /> {{ $t("console") }}
                </router-link>
                <router-link to="/watcher" class="mobile-drawer-link">
                    <font-awesome-icon icon="bolt" /> {{ $t("watcher.title") }}
                </router-link>
                <button type="button" class="mobile-drawer-link" @click="mobileScanFolder">
                    <font-awesome-icon icon="arrows-rotate" /> {{ $t("scanFolder") }}
                </button>

                <div class="mobile-drawer-section">{{ $t("Settings") }}</div>
                <router-link to="/settings/general" class="mobile-drawer-link mobile-drawer-sublink">
                    {{ $t("general") }}
                </router-link>
                <router-link to="/settings/appearance" class="mobile-drawer-link mobile-drawer-sublink">
                    {{ $t("Appearance") }}
                </router-link>
                <router-link to="/settings/security" class="mobile-drawer-link mobile-drawer-sublink">
                    {{ $t("Security") }}
                </router-link>
                <router-link to="/settings/globalEnv" class="mobile-drawer-link mobile-drawer-sublink">
                    {{ $t("GlobalEnv") }}
                </router-link>
                <router-link to="/settings/integrations" class="mobile-drawer-link mobile-drawer-sublink">
                    {{ $t("Integrations") }}
                </router-link>
                <router-link to="/settings/automation" class="mobile-drawer-link mobile-drawer-sublink">
                    {{ $t("automation.heading") }}
                </router-link>
                <router-link to="/settings/about" class="mobile-drawer-link mobile-drawer-sublink">
                    {{ $t("About") }}
                </router-link>
            </nav>

            <div v-if="$root.loggedIn" class="mobile-drawer-footer">
                <button type="button" class="mobile-drawer-link mobile-drawer-logout" @click="mobileLogout">
                    <font-awesome-icon icon="sign-out-alt" /> {{ $t("Logout") }}
                </button>
            </div>
        </BOffcanvas>

        <main>
            <div v-if="$root.socketIO.connecting" class="container mt-5">
                <h4>{{ $t("connecting...") }}</h4>
            </div>

            <router-view v-if="$root.loggedIn" />
            <Login v-if="! $root.loggedIn && $root.allowLoginDialog" />
        </main>

        <!-- System status bar (VS Code-style slim bottom bar, desktop/tablet only) -->
        <SystemStatsBar
            v-if="$root.loggedIn && systemStats && statsPosition === 'bottom'"
            variant="bottom"
            :system-stats="systemStats"
            :kula-url="kulaUrl"
            :dozzle-url="dozzleUrl"
        />
    </div>
</template>

<script>
import Login from "../components/Login.vue";
import SystemStatsBar from "../components/SystemStatsBar.vue";
import { compareVersions } from "compare-versions";
import { ALL_ENDPOINTS } from "../../../common/util-common";
import { setLowPower, POLL, makePoller } from "../composables/useLowPower";
import { getLatestReleaseNewsId, getReleaseNewsSince } from "../release-news";

export default {

    components: {
        Login,
        SystemStatsBar,
    },

    data() {
        return {
            selfUpdate: {
                available:     false,
                containerName: "dockge-enhanced",
                repo:          "",
                dismissed:     false,
                copied:        false,
            },
            systemStats:      null,
            statsPoller:      null,
            kulaUrl:          null,
            dozzleUrl:        null,
            showReleaseNews:  false,
            releaseNewsItems: [],
            showMobileNav: false,
        };
    },

    computed: {

        // Theme or Mobile
        classes() {
            const classes = {};
            classes[this.$root.theme] = true;
            classes["mobile"] = this.$root.isMobile;
            return classes;
        },

        hasNewVersion() {
            if (this.$root.info.latestVersion && this.$root.info.version) {
                return compareVersions(this.$root.info.latestVersion, this.$root.info.version) >= 1;
            } else {
                return false;
            }
        },

        selfUpdateCmd() {
            const repo = this.selfUpdate.repo || "aerya/dockge-enhanced";
            return `docker pull ghcr.io/${repo}:latest && docker compose up -d`;
        },

        // Where the system stats render (see MonitoringTab display settings)
        statsPosition() {
            return this.systemStats?.hostNavbarDisplay?.navbarPosition === "top" ? "top" : "bottom";
        },

        showHeaderStats() {
            return this.$root.loggedIn && !!this.systemStats && this.statsPosition === "top";
        },

    },

    watch: {

        // Close the mobile drawer on every navigation
        "$route.path"() {
            this.showMobileNav = false;
        },

    },

    mounted() {
        this.checkReleaseNews();
        this.checkSelfUpdate();
        this.fetchKulaStatus();
        this.fetchDozzleStatus();
        // Informe le backend de la langue de l'interface (notifications)
        this.$root.getSocket().emit("setUILocale", localStorage.getItem("locale") ?? "en");
        // Poll system stats : cadence selon le mode + pause si onglet caché
        this.statsPoller = makePoller({
            fetch:    () => Promise.all([ this.fetchSystemStats(), this.fetchKulaStatus(), this.fetchDozzleStatus() ]),
            interval: POLL.system,
        });
        this.statsPoller.start();
        window.addEventListener("keydown", this.onReleaseNewsKeydown);
    },

    beforeUnmount() {
        if (this.statsPoller) this.statsPoller.stop();
        window.removeEventListener("keydown", this.onReleaseNewsKeydown);
    },

    methods: {
        checkReleaseNews() {
            this.releaseNewsItems = getReleaseNewsSince(localStorage.getItem("releaseNewsSeen"));
            this.showReleaseNews = this.releaseNewsItems.length > 0;
        },

        closeReleaseNews() {
            localStorage.setItem("releaseNewsSeen", getLatestReleaseNewsId());
            this.showReleaseNews = false;
        },

        onReleaseNewsKeydown(e) {
            if (e.key === "Escape" && this.showReleaseNews) {
                this.closeReleaseNews();
            }
        },
        async checkSelfUpdate() {
            try {
                const token = localStorage.getItem("token") ?? sessionStorage.getItem("token") ?? "";
                const res = await fetch("/api/watcher/self/status", {
                    headers: { "Authorization": `Bearer ${token}` },
                });
                const data = await res.json();
                if (data.ok && data.updateAvailable) {
                    this.selfUpdate.available     = true;
                    this.selfUpdate.containerName = data.containerName ?? "dockge-enhanced";
                    this.selfUpdate.repo          = data.repo ?? "";
                }
            } catch { /* silencieux */ }
        },

        copyUpdateCmd() {
            const cmd = this.selfUpdateCmd;
            const markCopied = () => {
                this.selfUpdate.copied = true;
                setTimeout(() => { this.selfUpdate.copied = false; }, 2000);
            };
            if (navigator.clipboard) {
                navigator.clipboard.writeText(cmd).then(markCopied).catch(() => this.copyFallback(cmd, markCopied));
            } else {
                this.copyFallback(cmd, markCopied);
            }
        },

        copyFallback(text, cb) {
            const el = document.createElement("textarea");
            el.value = text;
            el.style.position = "fixed";
            el.style.opacity = "0";
            document.body.appendChild(el);
            el.focus();
            el.select();
            try { document.execCommand("copy"); cb(); } catch { /* silencieux */ }
            document.body.removeChild(el);
        },

        async fetchSystemStats() {
            try {
                const token = localStorage.getItem("token") ?? sessionStorage.getItem("token") ?? "";
                const res = await fetch("/api/system/stats", {
                    headers: { "Authorization": `Bearer ${token}` },
                });
                const data = await res.json();
                if (data.ok) this.systemStats = data.data;
                setLowPower(data.lowPowerMode);
            } catch {
                // Ne jamais conserver un lien Kula périmé si le service est
                // désactivé, supprimé ou temporairement injoignable.
                this.kulaUrl = null;
            }
        },

        async fetchKulaStatus() {
            try {
                const token = localStorage.getItem("token") ?? sessionStorage.getItem("token") ?? "";
                const [settingsRes, statusRes] = await Promise.all([
                    fetch("/api/watcher/kula/settings", { headers: { "Authorization": `Bearer ${token}` } }),
                    fetch("/api/watcher/kula/status",   { headers: { "Authorization": `Bearer ${token}` } }),
                ]);
                const settings = await settingsRes.json();
                const status   = await statusRes.json();
                if (settings.ok && settings.data?.enabled && status.status === "running") {
                    const s = settings.data;
                    this.kulaUrl = s.customUrl?.trim()
                        ? s.customUrl.trim()
                        : `http://${window.location.hostname}:${s.port}`;
                } else {
                    this.kulaUrl = null;
                }
            } catch { /* silencieux */ }
        },

        async fetchDozzleStatus() {
            try {
                const token = localStorage.getItem("token") ?? sessionStorage.getItem("token") ?? "";
                const [settingsRes, statusRes] = await Promise.all([
                    fetch("/api/watcher/dozzle/settings", { headers: { "Authorization": `Bearer ${token}` } }),
                    fetch("/api/watcher/dozzle/status", { headers: { "Authorization": `Bearer ${token}` } }),
                ]);
                const settings = await settingsRes.json();
                const status = await statusRes.json();
                if (settings.data?.enabled && status.status === "running") {
                    this.dozzleUrl = settings.data.customUrl?.trim() || `http://${window.location.hostname}:${settings.data.port}`;
                } else {
                    this.dozzleUrl = null;
                }
            } catch { this.dozzleUrl = null; }
        },

        scanFolder() {
            this.$root.emitAgent(ALL_ENDPOINTS, "requestStackList", (res) => {
                this.$root.toastRes(res);
            });
        },

        mobileScanFolder() {
            this.showMobileNav = false;
            this.scanFolder();
        },

        mobileLogout() {
            this.showMobileNav = false;
            this.$root.logout();
        },
    },

};
</script>

<style lang="scss" scoped>

.nav-link {
    &.status-page {
        background-color: var(--bg-raised);
    }
}

.desktop-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas:
        "brand updates navigation";
    align-items: center;
    gap: 0.75rem 1.25rem;
    padding-inline: 1.5rem;

    &.has-stats {
        grid-template-areas:
            "brand updates navigation"
            "stats stats stats";
    }
}

.desktop-brand {
    grid-area: brand;
    min-width: 0;
}

.desktop-update-area {
    grid-area: updates;
    display: flex;
    justify-content: center;
    min-width: 0;
}

.desktop-nav {
    grid-area: navigation;
    justify-self: end;
}

.theme-toggle {
    border: 0;
    background: transparent;
    cursor: pointer;
}

.self-update-banner {
    display: flex;
    align-items: center;
    background: var(--warning-soft);
    border: 1px solid var(--warning);
    border-radius: var(--radius-sm);
    padding: 5px 12px;
    font-size: var(--fs-md);
    color: var(--warning);

    code {
        background: var(--bg-raised);
        border-radius: var(--radius-sm);
        padding: 1px 6px;
        font-size: var(--fs-md);
        color: inherit;
    }

    .btn-copy, .btn-dismiss {
        background: none;
        border: 1px solid var(--warning);
        border-radius: var(--radius-sm);
        cursor: pointer;
        font-size: var(--fs-sm);
        padding: 1px 5px;
        color: inherit;
        line-height: 1.4;
        &:hover { background: var(--warning-soft); }
    }
}

.mobile-header {
    position: sticky;
    top: 0;
    z-index: 1000; // below Bootstrap modal (1055) and offcanvas backdrop (1040)
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border-color);
}

.mobile-nav-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-color);
}

.mobile-brand {
    display: flex;
    align-items: center;
    color: var(--text-color);
    font-size: var(--fs-lg);
}

// BOffcanvas teleports to <body>, so the drawer styles must be global.
:global(.mobile-drawer) {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}

:global(.mobile-drawer-user) {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--border-color);

    .profile-pic {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: var(--primary-text);
        background-color: var(--primary-strong);
        width: 28px;
        height: 28px;
        border-radius: var(--radius-pill);
        font-weight: bold;
        font-size: var(--fs-xs);
    }

    // Long usernames/emails ellipsize instead of breaking the row layout
    strong {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}

:global(.mobile-drawer-section) {
    margin-top: var(--space-2);
    padding: 0 var(--space-3);
    font-size: var(--fs-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
}

:global(.mobile-drawer-sublink) {
    padding-left: var(--space-5);
}

:global(.mobile-drawer-nav) {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}

:global(.mobile-drawer-link) {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text-color);
    text-align: left;
    text-decoration: none;

    &:hover {
        background: var(--bg-raised);
    }

    &.router-link-exact-active, &.active {
        background: var(--primary-soft);
        color: var(--primary-strong);
        font-weight: bold;
    }
}

:global(.mobile-drawer-footer) {
    margin-top: auto;
    padding-top: var(--space-3);
    border-top: 1px solid var(--border-color);
}

:global(.mobile-drawer-logout) {
    color: var(--danger);
}

main {
    min-height: calc(100vh - 160px);

    @media (min-width: $bp-mobile) {
        // Reserve space for the fixed bottom status bar
        padding-bottom: calc(28px + var(--space-3));
    }

    @media (max-width: $bp-mobile) {
        // Compact mobile header (~45px) instead of the desktop chrome
        min-height: calc(100vh - 45px);
    }
}

.title {
    font-weight: bold;
}

.brand-badges {
    font-size: var(--fs-xs);
}

.github-badge {
    color: var(--text-muted);
    text-decoration: none;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-pill);
    padding: 1px 7px;
    transition: color .15s, border-color .15s;

    &:hover {
        color: var(--text-color);
        border-color: var(--text-muted);
    }
}

.github-badge-enhanced {
    color: var(--warning);
    border-color: color-mix(in srgb, var(--warning) 40%, transparent);

    &:hover {
        color: var(--warning);
        border-color: color-mix(in srgb, var(--warning) 70%, transparent);
    }
}

.nav {
    margin-right: 0;
}

.lost-connection {
    padding: 5px;
    background-color: var(--danger);
    color: var(--primary-text);
    position: fixed;
    width: 100%;
    z-index: 99999;
}

.release-news-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99990;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(4, 10, 18, .72);
    backdrop-filter: blur(4px);
}

.release-news-dialog {
    width: min(560px, 100%);
    max-height: min(720px, calc(100vh - 40px));
    overflow-y: auto;
    padding: var(--space-6);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    color: var(--text-color);
    background: var(--bg-surface);
    box-shadow: var(--shadow-card);
}

.release-news-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);

    h2 {
        margin: 2px 0 0;
        font-size: var(--fs-xl);
    }
}

.release-news-kicker {
    color: var(--primary-strong);
    font-size: var(--fs-xs);
    font-weight: 700;
    letter-spacing: .08em;
    text-transform: uppercase;
}

.release-news-intro {
    margin: var(--space-4) 0;
    color: var(--text-muted);
}

.release-news-list {
    display: grid;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;

    li {
        display: grid;
        grid-template-columns: 20px minmax(0, 1fr);
        gap: 10px;
        align-items: start;
        line-height: 1.4;

        svg {
            margin-top: 3px;
            color: var(--success);
        }
    }
}

.release-news-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 22px;
}

// Profile Pic Button with Dropdown
.dropdown-profile-pic {
    user-select: none;

    .nav-link {
        cursor: pointer;
        display: flex;
        gap: 6px;
        align-items: center;
        background-color: var(--bg-raised);
        padding: 0.5rem 0.8rem;

        &:hover {
            background-color: var(--border-color);
        }
    }

    .dropdown-menu {
        transition: all 0.2s;
        padding-left: 0;
        padding-bottom: 0;
        margin-top: 8px !important;
        border-radius: var(--radius-lg);
        overflow: hidden;
        background-color: var(--bg-surface);
        color: var(--text-color);
        border-color: var(--border-color);

        .dropdown-divider {
            margin: 0;
            border-top: 1px solid var(--border-strong);
            background-color: transparent;
        }

        .dropdown-item-text {
            font-size: var(--fs-md);
            padding-bottom: 0.7rem;
        }

        .dropdown-item {
            padding: 0.7rem 1rem;
            color: var(--text-color);

            &.active {
                color: var(--primary-strong);
                background-color: var(--primary-soft) !important;
            }

            &:hover {
                background-color: var(--bg-raised);
            }
        }
    }

    .profile-pic {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--primary-text);
        background-color: var(--primary-strong);
        width: 24px;
        height: 24px;
        margin-right: 5px;
        border-radius: var(--radius-pill);
        font-weight: bold;
        font-size: var(--fs-xs);
    }
}

.dark {
    header {
        background-color: var(--bg-raised);
        border-bottom-color: var(--bg-raised) !important;

        span {
            color: var(--text-color);
        }
    }
}
</style>
