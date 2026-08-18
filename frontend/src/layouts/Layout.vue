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
        <header v-if="! $root.isMobile" class="desktop-header py-3 mb-3 border-bottom">
            <div class="desktop-brand d-flex align-items-center">
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

            <!-- System Stats (desktop uniquement) -->
            <div v-if="$root.loggedIn && systemStats" class="system-stats d-none d-lg-flex align-items-center">
                <span class="stat-pill" :class="statClass(systemStats.cpu)" :title="cpuStatTooltip()">
                    <font-awesome-icon icon="microchip" class="me-1" />CPU
                    <span class="disk-bar ms-1" :aria-label="diskUsageBarLabel(systemStats.cpu)">
                        <span class="disk-bar-bracket">[</span>
                        <span class="disk-bar-cells" aria-hidden="true">
                            <span
                                v-for="(filled, index) in diskUsageCells(systemStats.cpu)"
                                :key="index"
                                class="disk-bar-cell"
                                :class="{ filled }"
                            ></span>
                        </span>
                        <span class="disk-bar-bracket">]</span>
                    </span>
                    <span class="ms-1">{{ systemStats.cpu }}%</span>
                </span>
                <span class="stat-pill" :class="statClass(systemStats.ram.percent)" :title="ramStatTooltip()">
                    <font-awesome-icon icon="memory" class="me-1" />RAM
                    <span class="disk-bar ms-1" :aria-label="diskUsageBarLabel(systemStats.ram.percent)">
                        <span class="disk-bar-bracket">[</span>
                        <span class="disk-bar-cells" aria-hidden="true">
                            <span
                                v-for="(filled, index) in diskUsageCells(systemStats.ram.percent)"
                                :key="index"
                                class="disk-bar-cell"
                                :class="{ filled }"
                            ></span>
                        </span>
                        <span class="disk-bar-bracket">]</span>
                    </span>
                    <span class="ms-1">{{ systemStats.ram.percent }}%</span>
                </span>
                <span v-for="d in (systemStats.disks ?? [systemStats.disk])" :key="d.mount"
                    class="stat-pill" :class="statClass(d.percent)">
                    <font-awesome-icon icon="floppy-disk" class="me-1" />
                    <template v-if="systemStats.diskDisplayMode === 'bar'">
                        {{ d.mount }}
                        <span class="disk-bar ms-1" :aria-label="diskUsageBarLabel(d.percent)">
                            <span class="disk-bar-bracket">[</span>
                            <span class="disk-bar-cells" aria-hidden="true">
                                <span
                                    v-for="(filled, index) in diskUsageCells(d.percent)"
                                    :key="index"
                                    class="disk-bar-cell"
                                    :class="{ filled }"
                                ></span>
                            </span>
                            <span class="disk-bar-bracket">]</span>
                        </span>
                        <span class="ms-1">{{ d.percent }}%</span>
                        <span class="ms-1">{{ formatDiskTotal(d.total) }}</span>
                    </template>
                    <template v-else>
                        {{ d.mount }} {{ d.percent }}%
                    </template>
                </span>
                <a v-if="kulaUrl" :href="kulaUrl" target="_blank" class="stat-pill stat-kula">
                    <font-awesome-icon icon="chart-bar" class="me-1" />Kula
                </a>
                <a v-if="dozzleUrl" :href="dozzleUrl" target="_blank" class="stat-pill stat-kula">
                    <font-awesome-icon icon="terminal" class="me-1" />Dozzle
                </a>
                <span v-if="systemStats.hostNavbarDisplay?.uptime" class="stat-pill stat-neutral">
                    <font-awesome-icon icon="clock" class="me-1" />{{ $t("watcher.monitoring.navbarUptimeShort") }} : {{ formatUptime(systemStats.host?.uptimeSeconds) }}
                </span>
                <span v-if="systemStats.hostNavbarDisplay?.cpuTemperatures && systemStats.host?.temperatures?.cpu?.length" class="stat-pill stat-neutral">
                    <font-awesome-icon icon="temperature-half" class="me-1" />CPU {{ tempSummary(systemStats.host.temperatures.cpu) }}
                </span>
                <span v-if="systemStats.hostNavbarDisplay?.diskTemperatures && systemStats.host?.temperatures?.disks?.length" class="stat-pill stat-neutral">
                    <font-awesome-icon icon="hard-drive" class="me-1" />{{ tempSummary(systemStats.host.temperatures.disks) }}
                </span>
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
                        <font-awesome-icon icon="bolt" /> Enhanced
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
                <div><font-awesome-icon icon="bolt" /></div>
                Enhanced
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
import { setLowPower, POLL, makePoller } from "../composables/useLowPower";
import { getLatestReleaseNewsId, getReleaseNewsSince } from "../release-news";

export default {

    components: {
        Login,
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

    },

    watch: {

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

        diskUsageCells(percent) {
            const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
            const filled = Math.round(clamped / 10);
            return Array.from({ length: 10 }, (_, index) => index < filled);
        },

        diskUsageBarLabel(percent) {
            const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
            const filled = Math.round(clamped / 10);
            return `[${"⣿".repeat(filled)}${" ".repeat(10 - filled)}]`;
        },

        formatDiskTotal(bytes) {
            if (!bytes) return "0B";
            const units = ["B", "Kio", "Mio", "Gio", "Tio", "Pio"];
            let value = bytes;
            let unitIndex = 0;
            while (value >= 1024 && unitIndex < units.length - 1) {
                value /= 1024;
                unitIndex += 1;
            }
            const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
            return `${value.toFixed(precision)}${units[unitIndex]}`;
        },

        coreSummary(values) {
            return values.map((value, index) => `C${index + 1} ${value}%`).join(" ");
        },

        cpuStatTooltip() {
            const details = [];
            if (this.systemStats?.hostNavbarDisplay?.cpuModel && this.systemStats?.host?.cpuModel) {
                details.push(this.systemStats.host.cpuModel);
            }
            if (this.systemStats?.hostNavbarDisplay?.perCoreCpu && this.systemStats?.host?.perCoreCpu?.length) {
                details.push(this.coreSummary(this.systemStats.host.perCoreCpu));
            }
            return details.join("\n");
        },

        ramStatTooltip() {
            const ram = this.systemStats?.ram;
            if (!ram) {
                return "";
            }
            return `${this.formatBytes(ram.used)} / ${this.formatBytes(ram.total)}`;
        },

        formatUptime(seconds) {
            const total = Math.max(0, Number(seconds) || 0);
            const days = Math.floor(total / 86400);
            const hours = Math.floor((total % 86400) / 3600);
            if (days > 0) return `${this.$t("timeUnit.day", [ days ])} ${this.$t("timeUnit.hour", [ hours ])}`;
            return this.$t("timeUnit.hour", [ hours ]);
        },

        tempSummary(values) {
            if (!Array.isArray(values) || values.length === 0) {
                return "";
            }
            if (values.length === 1) {
                return `${values[0].celsius}°C`;
            }
            const numbers = values.map(v => Number(v.celsius)).filter(Number.isFinite);
            if (numbers.length === 0) {
                return "";
            }
            return `${Math.min(...numbers)}-${Math.max(...numbers)}°C`;
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

.desktop-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas:
        "brand updates navigation"
        "stats stats stats";
    align-items: center;
    gap: 0.75rem 1.25rem;
    padding-inline: 1.5rem;
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
    display: flex;
    align-items: stretch;

    a {
        text-align: center;
        flex: 1;
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
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
    color: #6b7280;
    text-decoration: none;
    border: 1px solid rgba(0,0,0,.18);
    border-radius: 50rem;
    padding: 1px 7px;
    transition: color .15s, border-color .15s;

    &:hover {
        color: #374151;
        border-color: rgba(0,0,0,.45);
    }

    .dark & {
        color: #9ca3af;
        border-color: rgba(255,255,255,.15);

        &:hover {
            color: #e5e7eb;
            border-color: rgba(255,255,255,.4);
        }
    }
}

.github-badge-enhanced {
    color: #b45309;
    border-color: rgba(180,83,9,.4);

    &:hover {
        color: #92400e;
        border-color: rgba(180,83,9,.7);
    }

    .dark & {
        color: #f59e0b;
        border-color: rgba(245,158,11,.35);

        &:hover {
            color: #fcd34d;
            border-color: rgba(245,158,11,.7);
        }
    }
}

.system-stats {
    grid-area: stats;
    justify-content: center;
    justify-self: center;
    width: min(100%, 80rem);
    font-size: 0.78rem;
    font-weight: 500;
    letter-spacing: 0.01em;
    flex-wrap: wrap;
    gap: 0.35rem 1rem;
    row-gap: 0.35rem;
}

.stat-pill {
    display: inline-flex;
    align-items: center;
    padding: 3px 9px;
    border-radius: 50rem;
    border: 1px solid rgba(0, 0, 0, 0.12);
    transition: color 0.3s;
    white-space: nowrap;

    &.stat-ok      { color: #15803d; }
    &.stat-warning  { color: #a16207; }
    &.stat-danger   { color: #b91c1c; }
    &.stat-neutral  { color: #374151; }
    &.stat-kula {
        color: #1d4ed8;
        text-decoration: none;
        border-color: rgba(29, 78, 216, .35);
        &:hover { color: #1e40af; border-color: rgba(29, 78, 216, .6); }
    }

    .dark & {
        border-color: rgba(255, 255, 255, 0.12);

        &.stat-ok      { color: #a8d8b0; } // vert menthe pastel
        &.stat-warning  { color: #f0d898; } // jaune blé pastel
        &.stat-danger   { color: #f0a8a8; } // rose saumon pastel
        &.stat-neutral  { color: #d1d5db; }
        &.stat-kula {
            color: #93c5fd;
            border-color: rgba(99,172,255,.3);
            &:hover { color: #bfdbfe; border-color: rgba(99,172,255,.6); }
        }
    }
}

.disk-bar {
    display: inline-flex;
    align-items: center;
    gap: 1px;
    font-family: "JetBrains Mono", monospace;
    line-height: 1;
}

.disk-bar-bracket {
    line-height: 1;
}

.disk-bar-cells {
    display: inline-grid;
    grid-template-columns: repeat(10, 0.38rem);
    align-items: center;
    column-gap: 1px;
    height: 0.7rem;
}

.disk-bar-cell {
    display: block;
    width: 0.38rem;
    height: 0.58rem;
    border-radius: 1px;

    &.filled {
        background: currentColor;
    }
}

.nav {
    margin-right: 0;
}

.lost-connection {
    padding: 5px;
    background-color: crimson;
    color: white;
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
    padding: 24px;
    border: 1px solid rgba(127, 127, 127, .24);
    border-radius: 16px;
    color: #1f2937;
    background: #fff;
    box-shadow: 0 24px 80px rgba(0, 0, 0, .38);

    .dark & {
        color: $dark-font-color;
        background: $dark-bg2;
    }
}

.release-news-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;

    h2 {
        margin: 2px 0 0;
        font-size: 1.55rem;
    }
}

.release-news-kicker {
    color: $primary;
    font-size: .72rem;
    font-weight: 700;
    letter-spacing: .08em;
    text-transform: uppercase;
}

.release-news-intro {
    margin: 16px 0;
    color: #6b7280;

    .dark & { color: $dark-font-color3; }
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
            color: #16a34a;
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
