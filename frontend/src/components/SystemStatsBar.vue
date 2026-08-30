<template>
    <div class="sys-stats" :class="`variant-${variant}`">
        <span class="status-item" :class="statClass(systemStats.cpu)" :title="cpuStatTooltip()">
            <font-awesome-icon icon="microchip" />CPU {{ systemStats.cpu }}%
            <span class="status-meter" :aria-label="diskUsageBarLabel(systemStats.cpu)">
                <span class="status-meter-fill" :style="{ width: Math.min(100, systemStats.cpu) + '%' }"></span>
            </span>
        </span>
        <span class="status-item" :class="statClass(systemStats.ram.percent)" :title="ramStatTooltip()">
            <font-awesome-icon icon="memory" />RAM {{ systemStats.ram.percent }}%
            <span class="status-meter" :aria-label="diskUsageBarLabel(systemStats.ram.percent)">
                <span class="status-meter-fill" :style="{ width: Math.min(100, systemStats.ram.percent) + '%' }"></span>
            </span>
        </span>
        <span v-if="fullestDisk" class="status-item" :class="statClass(fullestDisk.percent)" :title="disksTooltip">
            <font-awesome-icon icon="floppy-disk" />{{ fullestDisk.mount }} {{ fullestDisk.percent }}%
            <span class="status-meter" :aria-label="diskUsageBarLabel(fullestDisk.percent)">
                <span class="status-meter-fill" :style="{ width: Math.min(100, fullestDisk.percent) + '%' }"></span>
            </span>
            <span v-if="systemStats.diskDisplayMode === 'bar'">{{ formatDiskTotal(fullestDisk.total) }}</span>
            <span v-if="diskList.length > 1">+{{ diskList.length - 1 }}</span>
        </span>
        <span v-if="systemStats.hostNavbarDisplay?.uptime" class="status-item stat-neutral">
            <font-awesome-icon icon="clock" />{{ formatUptime(systemStats.host?.uptimeSeconds) }}
        </span>
        <span v-if="systemStats.hostNavbarDisplay?.cpuTemperatures && systemStats.host?.temperatures?.cpu?.length" class="status-item stat-neutral">
            <font-awesome-icon icon="temperature-half" />{{ tempSummary(systemStats.host.temperatures.cpu) }}
        </span>
        <span v-if="systemStats.hostNavbarDisplay?.diskTemperatures && systemStats.host?.temperatures?.disks?.length" class="status-item stat-neutral">
            <font-awesome-icon icon="hard-drive" />{{ tempSummary(systemStats.host.temperatures.disks) }}
        </span>

        <span class="status-spacer"></span>

        <a v-if="kulaUrl" :href="kulaUrl" target="_blank" class="status-item status-link">
            <font-awesome-icon icon="chart-bar" />Kula
        </a>
        <a v-if="dozzleUrl" :href="dozzleUrl" target="_blank" class="status-item status-link">
            <font-awesome-icon icon="terminal" />Dozzle
        </a>
    </div>
</template>

<script>
export default {
    props: {
        /** System stats payload from /api/system/stats */
        systemStats: {
            type: Object,
            required: true,
        },
        /** "header": full-width row inside the desktop header; "bottom": fixed slim status bar */
        variant: {
            type: String,
            default: "bottom",
        },
        kulaUrl: {
            type: String,
            default: null,
        },
        dozzleUrl: {
            type: String,
            default: null,
        },
    },

    computed: {
        // Barre de stats : on n'affiche que le disque le plus plein,
        // le détail de tous les disques est dans l'infobulle.
        diskList() {
            return this.systemStats.disks ?? (this.systemStats.disk ? [ this.systemStats.disk ] : []);
        },

        fullestDisk() {
            return this.diskList.reduce((max, d) => (!max || d.percent > max.percent ? d : max), null);
        },

        disksTooltip() {
            return this.diskList
                .map((d) => `${d.mount} ${d.percent}% (${this.formatDiskTotal(d.total)})`)
                .join("\n");
        },
    },

    methods: {
        statClass(percent) {
            if (percent >= 85) {
                return "stat-danger";
            }
            if (percent >= 70) {
                return "stat-warning";
            }
            return "stat-ok";
        },

        formatBytes(bytes) {
            if (bytes === 0) {
                return "0 B";
            }
            const gb = bytes / (1024 ** 3);
            if (gb >= 1) {
                return gb.toFixed(1) + " GB";
            }
            const mb = bytes / (1024 ** 2);
            return mb.toFixed(0) + " MB";
        },

        diskUsageBarLabel(percent) {
            const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
            const filled = Math.round(clamped / 10);
            return `[${"⣿".repeat(filled)}${" ".repeat(10 - filled)}]`;
        },

        formatDiskTotal(bytes) {
            if (!bytes) {
                return "0B";
            }
            const units = [ "B", "Kio", "Mio", "Gio", "Tio", "Pio" ];
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
            if (days > 0) {
                return `${this.$t("timeUnit.day", [ days ])} ${this.$t("timeUnit.hour", [ hours ])}`;
            }
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
    },
};
</script>

<style lang="scss" scoped>
.sys-stats {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    font-size: var(--fs-xs);
    font-weight: 500;
    white-space: nowrap;

    &.variant-bottom {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 900; // below mobile header (1000) and offcanvas backdrop (1040)
        height: 28px;
        padding: 0 var(--space-4);
        background: var(--bg-surface);
        border-top: 1px solid var(--border-color);
        overflow-x: auto;

        @media (max-width: $bp-mobile) {
            display: none;
        }
    }

    &.variant-header {
        grid-area: stats;
        justify-content: center;
        justify-self: center;
        width: min(100%, 80rem);
        flex-wrap: wrap;
        row-gap: var(--space-1);

        @media (max-width: $bp-tablet) {
            display: none;
        }
    }
}

.status-spacer {
    flex: 1;

    .variant-header & {
        display: none;
    }
}

.status-item {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    transition: color 0.3s;

    &.stat-ok      { color: var(--success); }
    &.stat-warning  { color: var(--warning); }
    &.stat-danger   { color: var(--danger); }
    &.stat-neutral  { color: var(--text-color); }
}

.status-link {
    color: var(--primary-strong);
    text-decoration: none;

    &:hover {
        color: var(--primary-hover);
    }
}

.status-meter {
    display: inline-block;
    width: 3rem;
    height: 4px;
    border-radius: var(--radius-pill);
    background: var(--bg-raised);
    overflow: hidden;
}

.status-meter-fill {
    display: block;
    height: 100%;
    border-radius: var(--radius-pill);
    background: currentColor;
    transition: width 0.3s ease;
}
</style>
