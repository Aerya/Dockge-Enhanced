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

        <!-- Desktop header -->
        <header v-if="! $root.isMobile" class="d-flex flex-wrap justify-content-center py-3 mb-3 border-bottom">
            <div class="d-flex align-items-center mb-3 mb-md-0 me-md-auto">
                <router-link to="/" class="d-flex align-items-center text-dark text-decoration-none">
                    <object class="bi me-2 ms-4" width="40" height="40" data="/icon.svg" />
                    <span class="fs-4 title">Dockge-Enhanced</span>
                </router-link>
                <span class="ms-2 d-flex gap-1 align-items-center" style="font-size:.72rem">
                    <a href="https://github.com/louislam/dockge" target="_blank" rel="noopener"
                        class="github-badge" title="Dockge upstream">Dockge</a>
                    <span style="opacity:.35">+</span>
                    <a href="https://github.com/Aerya/dockge-enhanced" target="_blank" rel="noopener"
                        class="github-badge github-badge-enhanced" title="Dockge Enhanced">Enhanced</a>
                </span>
            </div>

            <a v-if="hasNewVersion" target="_blank" href="https://github.com/louislam/dockge/releases" class="btn btn-warning me-3">
                <font-awesome-icon icon="arrow-alt-circle-up" /> {{ $t("newUpdate") }}
            </a>

            <!-- Bannière mise à jour Dockge-Enhanced -->
            <div v-if="selfUpdate.available && !selfUpdate.dismissed" class="self-update-banner me-3">
                <font-awesome-icon icon="arrow-circle-up" class="me-1" />
                Dockge-Enhanced : nouvelle version disponible —
                <code class="mx-2">docker pull ghcr.io/aerya/dockge-enhanced:latest && docker compose up -d</code>
                <button class="btn-copy ms-1" @click="copyUpdateCmd" :title="selfUpdate.copied ? 'Copié !' : 'Copier'">
                    {{ selfUpdate.copied ? '✓' : '⧉' }}
                </button>
                <button class="btn-dismiss ms-2" @click="selfUpdate.dismissed = true" title="Fermer">✕</button>
            </div>

            <!-- System Stats (desktop uniquement) -->
            <div v-if="$root.loggedIn && systemStats" class="system-stats d-none d-lg-flex align-items-center gap-3 me-auto ms-4">
                <span class="stat-pill" :class="statClass(systemStats.cpu)">
                    <font-awesome-icon icon="microchip" class="me-1" />{{ systemStats.cpu }}%
                </span>
                <span class="stat-pill" :class="statClass(systemStats.ram.percent)">
                    <font-awesome-icon icon="memory" class="me-1" />{{ formatBytes(systemStats.ram.used) }}/{{ formatBytes(systemStats.ram.total) }}
                </span>
                <span class="stat-pill" :class="statClass(systemStats.disk.percent)">
                    <font-awesome-icon icon="floppy-disk" class="me-1" />{{ systemStats.disk.mount }} {{ systemStats.disk.percent }}%
                </span>
            </div>

            <ul class="nav nav-pills">
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
                        <font-awesome-icon icon="shield-alt" /> Surveillance
                    </router-link>
                </li>

                <li v-if="$root.loggedIn" class="nav-item me-2">
                    <router-link to="/resources" class="nav-link">
                        <font-awesome-icon icon="cube" /> Ressources
                    </router-link>
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

                            <!--<li>
                                <router-link to="/registry" class="dropdown-item" :class="{ active: $route.path.includes('settings') }">
                                    <font-awesome-icon icon="warehouse" /> {{ $t("registry") }}
                                </router-link>
                            </li>-->

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
        </header>

        <main>
            <div v-if="$root.socketIO.connecting" class="container mt-5">
                <h4>{{ $t("connecting...") }}</h4>
            </div>

            <router-view v-if="$root.loggedIn" />
            <Login v-if="! $root.loggedIn && $root.allowLoginDialog" />
        </main>

        <!-- Mobile bottom nav -->
        <nav v-if="$root.isMobile && $root.loggedIn" class="bottom-nav">
            <router-link to="/">
                <div><font-awesome-icon icon="home" /></div>
                {{ $t("home") }}
            </router-link>
            <router-link to="/console">
                <div><font-awesome-icon icon="terminal" /></div>
                {{ $t("console") }}
            </router-link>
            <router-link to="/watcher">
                <div><font-awesome-icon icon="shield-alt" /></div>
                Surveillance
            </router-link>
            <router-link to="/resources">
                <div><font-awesome-icon icon="cube" /></div>
                Ressources
            </router-link>
            <router-link to="/settings/general">
                <div><font-awesome-icon icon="cog" /></div>
                {{ $t("Settings") }}
            </router-link>
        </nav>
    </div>
</template>

<script>
import Login from "../components/Login.vue";
import { compareVersions } from "compare-versions";
import { ALL_ENDPOINTS } from "../../../common/util-common";

export default {

    components: {
        Login,
    },

    data() {
        return {
            selfUpdate: {
                available:     false,
                containerName: "dockge-enhanced",
                dismissed:     false,
                copied:        false,
            },
            systemStats:      null,
            statsTimer:       null,
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

    },

    watch: {

    },

    mounted() {
        this.checkSelfUpdate();
        this.fetchSystemStats();
        this.statsTimer = setInterval(this.fetchSystemStats, 5000);
    },

    beforeUnmount() {
        if (this.statsTimer) clearInterval(this.statsTimer);
    },

    methods: {
        async checkSelfUpdate() {
            try {
                const token = localStorage.getItem("token") ?? "";
                const res = await fetch("/api/watcher/self/status", {
                    headers: { "Authorization": `Bearer ${token}` },
                });
                const data = await res.json();
                if (data.ok && data.updateAvailable) {
                    this.selfUpdate.available     = true;
                    this.selfUpdate.containerName = data.containerName ?? "dockge-enhanced";
                }
            } catch { /* silencieux */ }
        },

        copyUpdateCmd() {
            const cmd = `docker pull ghcr.io/aerya/dockge-enhanced:latest && docker compose up -d`;
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
                const token = localStorage.getItem("token") ?? "";
                const res = await fetch("/api/system/stats", {
                    headers: { "Authorization": `Bearer ${token}` },
                });
                const data = await res.json();
                if (data.ok) this.systemStats = data.data;
            } catch { /* silencieux */ }
        },

        statClass(percent) {
            if (percent >= 85) return "stat-danger";
            if (percent >= 70) return "stat-warning";
            return "stat-ok";
        },

        formatBytes(bytes) {
            if (bytes === 0) return "0 B";
            const gb = bytes / (1024 ** 3);
            if (gb >= 1) return gb.toFixed(1) + " GB";
            const mb = bytes / (1024 ** 2);
            return mb.toFixed(0) + " MB";
        },

        scanFolder() {
            this.$root.emitAgent(ALL_ENDPOINTS, "requestStackList", (res) => {
                this.$root.toastRes(res);
            });
        },
    },

};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.nav-link {
    &.status-page {
        background-color: rgba(255, 255, 255, 0.1);
    }
}

.self-update-banner {
    display: flex;
    align-items: center;
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.5);
    border-radius: 8px;
    padding: 5px 12px;
    font-size: 0.85rem;
    color: #d97706;

    code {
        background: rgba(0,0,0,0.12);
        border-radius: 4px;
        padding: 1px 6px;
        font-size: 0.82rem;
        color: inherit;
    }

    .btn-copy, .btn-dismiss {
        background: none;
        border: 1px solid rgba(245,158,11,0.4);
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.8rem;
        padding: 1px 5px;
        color: inherit;
        line-height: 1.4;
        &:hover { background: rgba(245,158,11,0.2); }
    }
}

.bottom-nav {
    z-index: 1000;
    position: fixed;
    bottom: 0;
    height: calc(60px + env(safe-area-inset-bottom));
    width: 100%;
    left: 0;
    background-color: #fff;
    box-shadow: 0 15px 47px 0 rgba(0, 0, 0, 0.05), 0 5px 14px 0 rgba(0, 0, 0, 0.05);
    text-align: center;
    white-space: nowrap;
    padding: 0 10px env(safe-area-inset-bottom);

    a {
        text-align: center;
        width: 20%;
        display: inline-block;
        height: 100%;
        padding: 8px 10px 0;
        font-size: 13px;
        color: #c1c1c1;
        overflow: hidden;
        text-decoration: none;

        &.router-link-exact-active, &.active {
            color: $primary;
            font-weight: bold;
        }

        div {
            font-size: 20px;
        }
    }
}

main {
    min-height: calc(100vh - 160px);
}

.title {
    font-weight: bold;
}

.github-badge {
    color: #9ca3af;
    text-decoration: none;
    border: 1px solid rgba(255,255,255,.15);
    border-radius: 50rem;
    padding: 1px 7px;
    transition: color .15s, border-color .15s;

    &:hover {
        color: #e5e7eb;
        border-color: rgba(255,255,255,.4);
    }
}

.github-badge-enhanced {
    color: #f59e0b;
    border-color: rgba(245,158,11,.35);

    &:hover {
        color: #fcd34d;
        border-color: rgba(245,158,11,.7);
    }
}

.system-stats {
    font-size: 0.78rem;
    font-weight: 500;
    letter-spacing: 0.01em;
}

.stat-pill {
    display: inline-flex;
    align-items: center;
    padding: 3px 9px;
    border-radius: 50rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    transition: color 0.3s;

    &.stat-ok      { color: #a8d8b0; } // vert menthe pastel
    &.stat-warning  { color: #f0d898; } // jaune blé pastel
    &.stat-danger   { color: #f0a8a8; } // rose saumon pastel
}

.nav {
    margin-right: 25px;
}

.lost-connection {
    padding: 5px;
    background-color: crimson;
    color: white;
    position: fixed;
    width: 100%;
    z-index: 99999;
}

// Profile Pic Button with Dropdown
.dropdown-profile-pic {
    user-select: none;

    .nav-link {
        cursor: pointer;
        display: flex;
        gap: 6px;
        align-items: center;
        background-color: rgba(200, 200, 200, 0.2);
        padding: 0.5rem 0.8rem;

        &:hover {
            background-color: rgba(255, 255, 255, 0.2);
        }
    }

    .dropdown-menu {
        transition: all 0.2s;
        padding-left: 0;
        padding-bottom: 0;
        margin-top: 8px !important;
        border-radius: 16px;
        overflow: hidden;

        .dropdown-divider {
            margin: 0;
            border-top: 1px solid rgba(0, 0, 0, 0.4);
            background-color: transparent;
        }

        .dropdown-item-text {
            font-size: 14px;
            padding-bottom: 0.7rem;
        }

        .dropdown-item {
            padding: 0.7rem 1rem;
        }

        .dark & {
            background-color: $dark-bg;
            color: $dark-font-color;
            border-color: $dark-border-color;

            .dropdown-item {
                color: $dark-font-color;

                &.active {
                    color: $dark-font-color2;
                    background-color: $highlight !important;
                }

                &:hover {
                    background-color: $dark-bg2;
                }
            }
        }
    }

    .profile-pic {
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        background-color: $primary;
        width: 24px;
        height: 24px;
        margin-right: 5px;
        border-radius: 50rem;
        font-weight: bold;
        font-size: 10px;
    }
}

.dark {
    header {
        background-color: $dark-header-bg;
        border-bottom-color: $dark-header-bg !important;

        span {
            color: #f0f6fc;
        }
    }

    .bottom-nav {
        background-color: $dark-bg;
    }
}
</style>
