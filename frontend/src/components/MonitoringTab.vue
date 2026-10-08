<template>
    <div>

        <!-- ═══ SECTION 1 : STATUT GLOBAL ═══ -->
        <div class="shadow-box big-padding mb-4">
            <div class="d-flex align-items-center justify-content-between mb-3">
                <h5 class="settings-subheading mb-0">
                    <font-awesome-icon icon="chart-line" class="me-2" />{{ $t('watcher.monitoring.statusHeading') }}
                </h5>
                <span v-if="overviewLoading" class="spinner-border spinner-border-sm text-secondary" />
            </div>

            <div class="monitoring-cards">
                <!-- Dernier backup -->
                <div class="monitoring-card" :class="backupCardClass">
                    <div class="mc-body">
                        <div class="mc-label">{{ $t('watcher.monitoring.lastBackup') }}</div>
                        <div class="mc-value" v-if="overview.backup.lastTimestamp">
                            <span :class="overview.backup.success ? 'text-success' : 'text-danger'">
                                {{ overview.backup.success ? '✅' : '❌' }}
                            </span>
                            {{ formatAge(overview.backup.ageMinutes) }}
                        </div>
                        <div class="mc-value text-muted" v-else>{{ $t('watcher.monitoring.lastBackupNever') }}</div>
                    </div>
                </div>

                <!-- Images en attente -->
                <div class="monitoring-card" :class="overview.images.pendingCount > 0 ? 'mc-warn' : 'mc-ok'">
                    <div class="mc-body">
                        <div class="mc-label">{{ $t('watcher.monitoring.pendingUpdates') }}</div>
                        <div class="mc-value">
                            <span :class="overview.images.pendingCount > 0 ? 'badge bg-warning text-dark' : 'badge bg-success'">
                                {{ overview.images.pendingCount }}
                            </span>
                            <span v-if="overview.images.pendingImages.length" class="mc-detail">
                                {{ overview.images.pendingImages.map(i => i.image.split(':')[0].split('/').pop()).join(', ') }}
                            </span>
                        </div>
                    </div>
                </div>

                <!-- CVE critiques -->
                <div class="monitoring-card" :class="overview.trivy.criticalCount > 0 ? 'mc-danger' : 'mc-ok'">
                    <div class="mc-body">
                        <div class="mc-label">{{ $t('watcher.monitoring.criticalCves') }}</div>
                        <div class="mc-value">
                            <span :class="overview.trivy.criticalCount > 0 ? 'badge bg-danger' : 'badge bg-success'">
                                {{ overview.trivy.criticalCount }}
                            </span>
                            <span v-if="overview.trivy.criticalImages.length" class="mc-detail">
                                {{ overview.trivy.criticalImages.map(i => i.image.split(':')[0].split('/').pop()).join(', ') }}
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Prochain scan Trivy -->
                <div class="monitoring-card mc-neutral">
                    <div class="mc-body">
                        <div class="mc-label">{{ $t('watcher.monitoring.nextTrivy') }}</div>
                        <div class="mc-value" v-if="overview.trivy.nextScanAt">
                            {{ $t('watcher.monitoring.inTime') }} {{ formatAge(nextTrivyMinutes) }}
                        </div>
                        <div class="mc-value text-muted" v-else>{{ $t('watcher.monitoring.nextTrivyNone') }}</div>
                        <div class="mc-detail text-muted" v-if="overview.trivy.lastScanAt">
                            {{ $t('watcher.monitoring.lastScan') }} {{ formatAge(lastTrivyMinutes) }}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ═══ SECTION 2 : PARAMÈTRES D'AFFICHAGE ═══ -->
        <div class="shadow-box big-padding mb-4">
            <div class="d-flex align-items-center justify-content-between mb-3">
                <h5 class="settings-subheading mb-0">
                    <font-awesome-icon icon="microchip" class="me-2" />{{ $t('watcher.monitoring.hostHeading') }}
                </h5>
                <button class="btn btn-sm btn-normal" @click="loadHostStats">
                    <font-awesome-icon icon="sync" class="me-1" />{{ $t('refresh') }}
                </button>
            </div>
            <div v-if="hostStats" class="host-grid">
                <div class="host-item">
                    <span>{{ $t('watcher.monitoring.hostCpu') }}</span>
                    <strong>{{ hostStats.cpuModel || 'CPU' }} · {{ hostStats.cpuCores }} {{ $t('watcher.monitoring.hostCores') }}</strong>
                </div>
                <div class="host-item">
                    <span>{{ $t('watcher.monitoring.hostUptime') }}</span>
                    <strong>{{ formatUptime(hostStats.uptimeSeconds) }}</strong>
                </div>
                <div class="host-item">
                    <span>{{ $t('watcher.monitoring.hostLoad') }}</span>
                    <strong>{{ hostStats.loadAverage.map(n => n.toFixed(2)).join(' / ') }}</strong>
                    <small v-if="hostStats.processCount !== null">{{ hostStats.processCount }} {{ $t('watcher.monitoring.hostProcesses') }}</small>
                </div>
            </div>
            <div v-if="hostStats?.perCoreCpu?.length" class="core-grid mt-3">
                <div v-for="(core, index) in hostStats.perCoreCpu" :key="index" class="core-meter">
                    <span>{{ $t('watcher.monitoring.hostCore') }} {{ index + 1 }}</span>
                    <div class="core-bar"><span :style="{ width: `${core}%` }"></span></div>
                    <strong>{{ core }}%</strong>
                </div>
            </div>
            <div v-if="hostStats" class="temperature-grid mt-3">
                <div>
                    <h6>{{ $t('watcher.monitoring.hostCpuTemps') }}</h6>
                    <span v-if="!hostStats.temperatures.cpu.length" class="text-muted small">{{ $t('notAvailableShort') }}</span>
                    <span v-for="temp in hostStats.temperatures.cpu" :key="temp.label" class="temp-chip">{{ friendlyTempLabel(temp.label) }}: {{ temp.celsius }} °C</span>
                </div>
                <div>
                    <h6>{{ $t('watcher.monitoring.hostDiskTemps') }}</h6>
                    <span v-if="!hostStats.temperatures.disks.length" class="text-muted small">{{ $t('notAvailableShort') }}</span>
                    <span v-for="temp in hostStats.temperatures.disks" :key="temp.label" class="temp-chip">{{ temp.label }}: {{ temp.celsius }} °C</span>
                </div>
            </div>

            <section class="host-history mt-4">
                <h6 class="settings-subheading mb-3">{{ $t('watcher.monitoring.historyTitle') }}</h6>
                <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                    <div class="form-check form-switch mb-0">
                        <input id="monHistory" v-model="monSettings.historyEnabled" class="form-check-input" type="checkbox" role="switch" @change="toggleHistory" />
                        <label class="form-check-label fw-semibold" for="monHistory">{{ $t('watcher.monitoring.historyEnabled') }}</label>
                        <div class="form-text">{{ $t('watcher.monitoring.historyHint') }}</div>
                    </div>
                    <button class="btn btn-sm btn-normal" :disabled="historyLoading" @click="loadHistory">
                        <span v-if="historyLoading" class="spinner-border spinner-border-sm me-1" />
                        <font-awesome-icon v-else icon="sync" class="me-1" />{{ $t('refresh') }}
                    </button>
                </div>
                <div class="history-controls mb-3">
                    <span class="history-period-label">{{ $t('watcher.monitoring.historyPeriod') }}</span>
                    <div class="history-preset-group" role="group" :aria-label="$t('watcher.monitoring.historyPeriod')">
                        <button v-for="preset in historyPresetOptions" :key="preset.value" type="button" class="btn btn-sm history-preset-btn" :class="{ active: historyPreset === preset.value }" @click="selectHistoryPreset(preset.value)">
                            {{ $t(preset.label) }}
                        </button>
                    </div>
                    <template v-if="historyPreset === 'custom'">
                        <div class="history-custom-range">
                            <input v-model.number="historyAmount" class="form-control form-control-sm" type="number" min="1" @change="loadHistory" />
                            <select v-model="historyUnit" class="form-select form-select-sm" @change="loadHistory">
                                <option value="days">{{ $t('watcher.monitoring.historyDays') }}</option>
                                <option value="weeks">{{ $t('watcher.monitoring.historyWeeks') }}</option>
                                <option value="months">{{ $t('watcher.monitoring.historyMonths') }}</option>
                                <option value="years">{{ $t('watcher.monitoring.historyYears') }}</option>
                            </select>
                        </div>
                    </template>
                    <button type="button" class="btn btn-primary btn-sm ms-auto" :disabled="savingHistoryPrefs" @click="saveHistoryPreferences">
                        <span v-if="savingHistoryPrefs" class="spinner-border spinner-border-sm me-1" />
                        <font-awesome-icon v-else icon="save" class="me-1" />{{ $t('watcher.monitoring.historySave') }}
                    </button>
                </div>
                <div v-if="historyPoints.length" class="history-stats mb-2">
                    <span class="history-stat-card"><i class="history-legend history-legend--cpu"></i><strong>CPU</strong><span>{{ $t('watcher.monitoring.historyAverage') }} {{ historyStats.cpuAverage.toFixed(1) }}%</span><span>{{ $t('watcher.monitoring.historyMaximum') }} {{ historyStats.cpuMax.toFixed(1) }}%</span></span>
                    <span class="history-stat-card"><i class="history-legend history-legend--ram"></i><strong>RAM</strong><span>{{ $t('watcher.monitoring.historyAverage') }} {{ historyStats.ramAverage.toFixed(1) }}%</span><span>{{ $t('watcher.monitoring.historyMaximum') }} {{ historyStats.ramMax.toFixed(1) }}%</span></span>
                </div>
                <div v-if="historyPoints.length" ref="historyChartWrap" class="history-chart-wrap">
                    <svg class="history-chart" :viewBox="`0 0 ${historyChart.width} ${historyChart.height}`" preserveAspectRatio="xMinYMin meet" role="img" :aria-label="$t('watcher.monitoring.historyChart')">
                        <rect :x="historyChart.left" :y="historyChart.top" :width="historyPlotWidth" :height="historyPlotHeight" class="history-plot-bg" />
                        <line v-for="value in historyYTicks" :key="value" :x1="historyChart.left" :x2="historyChart.width - historyChart.right" :y1="historyY(value)" :y2="historyY(value)" class="history-grid-line" />
                        <text v-for="value in historyYTicks" :key="`label-${value}`" :x="historyChart.left - 10" :y="historyY(value) + 4" text-anchor="end" class="history-axis-label">{{ value }}%</text>
                        <g v-for="tick in historyTimeTicks" :key="tick.timestamp">
                            <line :x1="tick.x" :x2="tick.x" :y1="historyChart.top" :y2="historyChart.height - historyChart.bottom" class="history-grid-line history-grid-line--vertical" />
                            <text :x="tick.x" :y="historyChart.height - 8" text-anchor="middle" class="history-axis-label history-time-label">{{ tick.label }}</text>
                        </g>
                        <polygon v-for="(segment, index) in cpuHistoryAreas" :key="`cpu-area-${index}`" :points="segment" class="history-area history-area--cpu" />
                        <polygon v-for="(segment, index) in ramHistoryAreas" :key="`ram-area-${index}`" :points="segment" class="history-area history-area--ram" />
                        <polyline v-for="(segment, index) in cpuHistorySegments" :key="`cpu-${index}`" :points="segment" class="history-line history-line--cpu" />
                        <polyline v-for="(segment, index) in ramHistorySegments" :key="`ram-${index}`" :points="segment" class="history-line history-line--ram" />
                        <circle v-for="point in historyPoints" :key="`tip-${point.sampledAt}`" :cx="historyX(point.sampledAt)" :cy="historyY(point.cpuPercent)" r="7" class="history-hitpoint">
                            <title>{{ historyTooltip(point) }}</title>
                        </circle>
                    </svg>
                </div>
                <div v-else-if="!historyLoading" class="text-muted small">{{ $t('watcher.monitoring.historyEmpty') }}</div>
            </section>
        </div>

        <div class="shadow-box big-padding mb-4 powerwatch-panel">
            <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                <h5 class="settings-subheading mb-0">
                    <font-awesome-icon icon="bolt" class="me-2" />{{ $t("watcher.powerwatch.heading") }}
                    <span v-if="powerWatchStatus?.reachable" class="badge bg-success ms-2 badge-sm">{{ $t("watcher.powerwatch.online") }}</span>
                    <span v-else-if="powerWatchStatus?.status === 'stopped'" class="badge bg-secondary ms-2 badge-sm">{{ $t("watcher.powerwatch.stopped") }}</span>
                    <span v-else-if="powerWatchSettings.enabled" class="badge bg-warning text-dark ms-2 badge-sm">{{ $t("watcher.powerwatch.offline") }}</span>
                </h5>
                <a
                    v-if="powerWatchEffectiveUrl" :href="powerWatchEffectiveUrl" target="_blank" rel="noopener noreferrer"
                    class="btn btn-sm btn-outline-secondary" :title="$t('watcher.powerwatch.open')"
                    :aria-label="$t('watcher.powerwatch.open')"
                ><font-awesome-icon icon="external-link-alt" class="me-1" />{{ $t("watcher.powerwatch.open") }}</a>
            </div>

            <div class="form-check form-switch mb-3">
                <input id="powerWatchEnabled" v-model="powerWatchSettings.enabled" class="form-check-input" type="checkbox" role="switch" />
                <label class="form-check-label fw-semibold" for="powerWatchEnabled">{{ $t("watcher.powerwatch.enable") }}</label>
            </div>

            <template v-if="powerWatchSettings.enabled">
                <div class="d-flex flex-wrap gap-3 mb-3">
                    <label class="form-check">
                        <input v-model="powerWatchSettings.mode" class="form-check-input" type="radio" value="external" />
                        <span class="form-check-label">{{ $t("watcher.powerwatch.external") }}</span>
                    </label>
                    <label class="form-check">
                        <input v-model="powerWatchSettings.mode" class="form-check-input" type="radio" value="managed" />
                        <span class="form-check-label">{{ $t("watcher.powerwatch.managed") }}</span>
                    </label>
                </div>

                <template v-if="powerWatchSettings.mode === 'external'">
                    <div v-if="powerWatchDetection?.containers?.length" class="mb-3">
                        <div class="small fw-semibold mb-2">{{ $t("watcher.powerwatch.detected") }}</div>
                        <div v-for="container in powerWatchDetection.containers" :key="container.name" class="powerwatch-detected mb-2">
                            <code>{{ container.name }}</code><span>{{ container.image }}</span><span>{{ $t(container.state === "running" ? "watcher.powerwatch.online" : "watcher.powerwatch.stopped") }}</span>
                            <span v-if="container.hostPort">{{ container.hostPort }} → 3000</span>
                            <button class="btn btn-sm btn-normal" type="button" @click="usePowerWatchContainer(container)">{{ $t("watcher.powerwatch.useInstance") }}</button>
                        </div>
                    </div>
                    <div class="row g-3">
                        <div class="col-12">
                            <label class="form-label small">{{ $t("watcher.powerwatch.apiUrl") }}</label>
                            <input v-model="powerWatchSettings.apiUrl" type="url" class="form-control form-control-sm" :disabled="Boolean(powerWatchSettings.externalContainer)" />
                        </div>
                        <div class="col-12">
                            <label class="form-label small">{{ $t("watcher.powerwatch.webUrl") }}</label>
                            <input v-model="powerWatchSettings.webUrl" type="url" class="form-control form-control-sm" />
                        </div>
                        <div v-if="powerWatchSettings.externalContainer" class="col-12 small">
                            {{ $t("watcher.powerwatch.selectedContainer") }} <code>{{ powerWatchSettings.externalContainer }}</code>
                            <button type="button" class="btn btn-sm btn-link" @click="powerWatchSettings.externalContainer = ''">{{ $t("watcher.powerwatch.clear") }}</button>
                        </div>
                    </div>
                </template>

                <template v-else>
                    <div class="row g-3">
                        <div class="col-md-3">
                            <label class="form-label small">{{ $t("watcher.powerwatch.port") }}</label>
                            <input v-model.number="powerWatchSettings.hostPort" type="number" min="1" max="65535" class="form-control form-control-sm" />
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small">{{ $t("watcher.powerwatch.bindAddress") }}</label>
                            <input v-model="powerWatchSettings.bindAddress" class="form-control form-control-sm" />
                        </div>
                        <div class="col-12">
                            <label class="form-label small">{{ $t("watcher.powerwatch.webUrlOptional") }}</label>
                            <input v-model="powerWatchSettings.managedWebUrl" type="url" class="form-control form-control-sm" />
                        </div>
                    </div>
                    <div v-if="powerWatchSettings.bindAddress === '0.0.0.0'" class="alert alert-warning py-2 mt-3">{{ $t("watcher.powerwatch.lanWarning") }}</div>
                    <details class="mt-3">
                        <summary>{{ $t("watcher.powerwatch.advanced") }}</summary>
                        <div class="row g-3 mt-1">
                            <div class="col-md-4"><label class="form-label small">MSR</label><select v-model="powerWatchSettings.msrMode" class="form-select form-select-sm"><option value="auto">{{ $t("watcher.powerwatch.auto") }}</option><option value="enabled">{{ $t("watcher.powerwatch.enabled") }}</option><option value="disabled">{{ $t("watcher.powerwatch.disabled") }}</option></select></div>
                            <div class="col-md-4"><label class="form-label small">NVIDIA</label><select v-model="powerWatchSettings.nvidiaMode" class="form-select form-select-sm"><option value="auto">{{ $t("watcher.powerwatch.auto") }}</option><option value="enabled">{{ $t("watcher.powerwatch.enabled") }}</option><option value="disabled">{{ $t("watcher.powerwatch.disabled") }}</option></select></div>
                        </div>
                    </details>
                    <div v-if="powerWatchDetection" class="powerwatch-diagnostic mt-3">
                        <span :class="powerWatchDetection.capabilities.linux ? 'text-success' : 'text-danger'">Linux: {{ capabilityLabel(powerWatchDetection.capabilities.linux) }}</span>
                        <span>RAPL: {{ capabilityLabel(powerWatchDetection.capabilities.powercap, true) }}</span>
                        <span>MSR: {{ capabilityLabel(powerWatchDetection.capabilities.msr, true) }}</span>
                        <span>NVIDIA: {{ capabilityLabel(powerWatchDetection.capabilities.nvidia, true) }}</span>
                        <span :class="powerWatchDetection.portAvailable ? 'text-success' : 'text-danger'">{{ $t("watcher.powerwatch.port") }}: {{ powerWatchDetection.portAvailable ? $t("watcher.powerwatch.available") : $t("watcher.powerwatch.portInUse") }}</span>
                        <span class="text-success">{{ $t("watcher.powerwatch.volumeKept") }}</span>
                    </div>
                </template>

                <div v-if="powerWatchStatus" class="powerwatch-current mt-3">
                    <strong>{{ $t("watcher.powerwatch.current") }}:</strong>
                    <span><font-awesome-icon icon="bolt" /> {{ powerWatchDisplayWatts }}</span>
                    <span v-if="powerWatchStatus.confidence">{{ powerWatchConfidence }}</span>
                    <small v-if="powerWatchStatus.lastError" class="text-warning">{{ powerWatchStatus.lastError }}</small>
                </div>
            </template>

            <div class="powerwatch-hub-panel mt-4 pt-3">
                <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                    <h6 class="mb-0"><font-awesome-icon icon="bolt" class="me-2" />{{ $t("watcher.powerwatch.hub") }}</h6>
                    <a
                        v-if="powerWatchHubEffectiveUrl" :href="powerWatchHubEffectiveUrl" target="_blank" rel="noopener noreferrer"
                        class="btn btn-sm btn-outline-secondary" :title="$t('watcher.powerwatch.openHub')"
                        :aria-label="$t('watcher.powerwatch.openHub')"
                    ><font-awesome-icon icon="external-link-alt" class="me-1" />{{ $t("watcher.powerwatch.openHub") }}</a>
                </div>
                <p class="small text-muted mb-3">{{ $t("watcher.powerwatch.hubHelp") }}</p>
                <div class="form-check form-switch mb-3">
                    <input id="powerWatchHubEnabled" v-model="powerWatchSettings.hubEnabled" class="form-check-input" type="checkbox" role="switch" />
                    <label class="form-check-label fw-semibold" for="powerWatchHubEnabled">{{ $t("watcher.powerwatch.enableHub") }}</label>
                </div>
                <div v-if="powerWatchSettings.hubEnabled" class="row g-3">
                    <div class="col-12">
                        <label class="form-label small">{{ $t("watcher.powerwatch.hubWebUrl") }}</label>
                        <input v-model="powerWatchSettings.hubWebUrl" type="url" class="form-control form-control-sm" />
                    </div>
                    <div v-if="powerWatchHubStatus" class="col-12 small">
                        <span v-if="powerWatchHubStatus.reachable" class="text-success">{{ $t("watcher.powerwatch.hubOnline") }}</span>
                        <span v-else class="text-warning">{{ $t("watcher.powerwatch.hubOffline") }}<template v-if="powerWatchHubStatus.lastError">: {{ powerWatchHubStatus.lastError }}</template></span>
                    </div>
                </div>
            </div>

            <div class="d-flex flex-wrap gap-2 mt-3">
                <button class="btn btn-primary btn-sm" :disabled="powerWatchLoading" @click="savePowerWatchSettings"><font-awesome-icon icon="save" class="me-1" />{{ $t("Save") }}</button>
                <button class="btn btn-normal btn-sm" :disabled="powerWatchLoading" @click="detectPowerWatch"><font-awesome-icon icon="magnifying-glass" class="me-1" />{{ $t("watcher.powerwatch.checkHost") }}</button>
                <button v-if="powerWatchSettings.enabled" class="btn btn-normal btn-sm" :disabled="powerWatchLoading" @click="testPowerWatch"><font-awesome-icon icon="plug" class="me-1" />{{ $t("watcher.powerwatch.test") }}</button>
                <button v-if="powerWatchSettings.hubEnabled" class="btn btn-normal btn-sm" :disabled="powerWatchLoading" @click="testPowerWatchHub"><font-awesome-icon icon="plug" class="me-1" />{{ $t("watcher.powerwatch.testHub") }}</button>
                <template v-if="powerWatchSettings.enabled && powerWatchSettings.mode === 'managed'">
                    <button class="btn btn-success btn-sm" :disabled="powerWatchLoading" @click="powerWatchAction('install')">{{ $t("watcher.powerwatch.install") }}</button>
                    <button class="btn btn-success btn-sm" :disabled="powerWatchLoading" @click="powerWatchAction('start')">{{ $t("watcher.powerwatch.start") }}</button>
                    <button class="btn btn-warning btn-sm" :disabled="powerWatchLoading" @click="powerWatchAction('restart')">{{ $t("watcher.powerwatch.restart") }}</button>
                    <button class="btn btn-danger btn-sm" :disabled="powerWatchLoading" @click="powerWatchAction('stop')">{{ $t("watcher.powerwatch.stop") }}</button>
                </template>
            </div>
        </div>

        <div class="shadow-box big-padding mb-4">
            <h5 class="settings-subheading mb-3">
                <font-awesome-icon icon="display" class="me-2" />{{ $t('watcher.monitoring.displayHeading') }}
            </h5>

            <div class="row g-3 align-items-start">
                <!-- Toggle stats par stack -->
                <div class="col-12">
                    <div class="form-check form-switch mb-0">
                        <input id="monStackStats" v-model="localStackStatsEnabled"
                            class="form-check-input" type="checkbox" role="switch"
                            @change="saveStackStatsSetting" />
                        <label class="form-check-label fw-semibold" for="monStackStats">
                            {{ $t('watcher.monitoring.stackStats') }}
                        </label>
                    </div>
                    <small class="form-text">{{ $t('watcher.monitoring.stackStatsHint') }}</small>
                </div>

                <!-- Toggle mode low-power / Synology -->
                <div class="col-12">
                    <div class="form-check form-switch mb-0">
                        <input id="monLowPower" v-model="monSettings.lowPowerMode"
                            class="form-check-input" type="checkbox" role="switch"
                            @change="toggleLowPower" />
                        <label class="form-check-label fw-semibold" for="monLowPower">
                            {{ $t('watcher.monitoring.lowPower') }}
                        </label>
                    </div>
                    <small class="form-text">{{ $t('watcher.monitoring.lowPowerHint') }}</small>
                </div>

                <!-- Affichage barre de stats système -->
                <div class="col-12">
                    <label class="form-label small">
                        <font-awesome-icon icon="display" class="me-1" />{{ $t('watcher.monitoring.navbarHostDisplay') }}
                    </label>
                    <div class="d-flex align-items-center gap-2 mb-2">
                        <label class="form-check-label" for="navbarPosition">{{ $t('watcher.monitoring.navbarPosition') }}</label>
                        <select id="navbarPosition" v-model="hostNavbarDisplay.navbarPosition" class="form-select form-select-sm navbar-position-select">
                            <option value="bottom">{{ $t('watcher.monitoring.navbarPositionBottom') }}</option>
                            <option value="top">{{ $t('watcher.monitoring.navbarPositionTop') }}</option>
                        </select>
                    </div>
                    <div class="navbar-host-options">
                        <div class="form-check form-switch">
                            <input id="navbarCpuModel" v-model="hostNavbarDisplay.cpuModel" class="form-check-input" type="checkbox" role="switch" />
                            <label class="form-check-label" for="navbarCpuModel">{{ $t('watcher.monitoring.navbarCpuModel') }}</label>
                        </div>
                        <div class="form-check form-switch">
                            <input id="navbarPerCoreCpu" v-model="hostNavbarDisplay.perCoreCpu" class="form-check-input" type="checkbox" role="switch" />
                            <label class="form-check-label" for="navbarPerCoreCpu">{{ $t('watcher.monitoring.navbarPerCoreCpu') }}</label>
                        </div>
                        <div class="form-check form-switch">
                            <input id="navbarUptime" v-model="hostNavbarDisplay.uptime" class="form-check-input" type="checkbox" role="switch" />
                            <label class="form-check-label" for="navbarUptime">{{ $t('watcher.monitoring.navbarUptime') }}</label>
                        </div>
                        <div class="form-check form-switch">
                            <input id="navbarCpuTemps" v-model="hostNavbarDisplay.cpuTemperatures" class="form-check-input" type="checkbox" role="switch" />
                            <label class="form-check-label" for="navbarCpuTemps">{{ $t('watcher.monitoring.navbarCpuTemps') }}</label>
                        </div>
                        <div class="form-check form-switch">
                            <input id="navbarDiskTemps" v-model="hostNavbarDisplay.diskTemperatures" class="form-check-input" type="checkbox" role="switch" />
                            <label class="form-check-label" for="navbarDiskTemps">{{ $t('watcher.monitoring.navbarDiskTemps') }}</label>
                        </div>
                    </div>
                    <small class="form-text">{{ $t('watcher.monitoring.navbarHostDisplayHint') }}</small>
                </div>

                <!-- Partitions disque -->
                <div class="col-12">
                    <label class="form-label small">
                        <font-awesome-icon icon="floppy-disk" class="me-1" />{{ $t('watcher.monitoring.diskPartition') }}
                    </label>
                    <div v-for="(p, idx) in diskPartitions" :key="idx"
                        class="d-flex align-items-center gap-2 mb-2">
                        <code class="form-control form-control-sm" style="max-width:220px;background:var(--bg-raised)">{{ p }}</code>
                        <button class="btn btn-sm btn-outline-danger" @click="removePartition(idx)">
                            <font-awesome-icon icon="times" />
                        </button>
                    </div>
                    <div class="input-group input-group-sm mt-1" style="max-width:320px">
                        <input v-model="newPartition" type="text" class="form-control"
                            placeholder="/" @keyup.enter="addPartition" />
                        <button class="btn btn-success btn-sm" @click="addPartition" :disabled="!newPartition.trim()">
                            <font-awesome-icon icon="plus" class="me-1" />{{ $t('Add') }}
                        </button>
                    </div>
                    <small class="form-text">{{ $t('watcher.monitoring.diskPartitionHint') }}</small>
                    <div class="mt-3">
                        <label class="form-label small">{{ $t('watcher.monitoring.diskDisplayMode') }}</label>
                        <div class="d-flex flex-wrap gap-3">
                            <div class="form-check">
                                <input id="diskDisplayCompact" v-model="diskDisplayMode"
                                    class="form-check-input" type="radio" value="compact" />
                                <label class="form-check-label" for="diskDisplayCompact">
                                    {{ $t('watcher.monitoring.diskDisplayCompact') }}
                                </label>
                            </div>
                            <div class="form-check">
                                <input id="diskDisplayBar" v-model="diskDisplayMode"
                                    class="form-check-input" type="radio" value="bar" />
                                <label class="form-check-label" for="diskDisplayBar">
                                    {{ $t('watcher.monitoring.diskDisplayBar') }}
                                    <span class="disk-display-example ms-1">
                                        <span>/home</span>
                                        <span class="disk-example-bar" aria-label="[⣿⣿        ]">
                                            <span class="disk-example-bracket">[</span>
                                            <span class="disk-example-cells" aria-hidden="true">
                                                <span
                                                    v-for="(filled, index) in diskDisplayExampleCells"
                                                    :key="index"
                                                    class="disk-example-cell"
                                                    :class="{ filled }"
                                                ></span>
                                            </span>
                                            <span class="disk-example-bracket">]</span>
                                        </span>
                                        <span>19% 2Tio</span>
                                    </span>
                                </label>
                            </div>
                        </div>
                        <small class="form-text">{{ $t('watcher.monitoring.diskDisplayModeHint') }}</small>
                    </div>
                    <div class="mt-2">
                        <button class="btn btn-primary btn-sm" @click="saveDisplaySettings" :disabled="savingDisplay">
                            <span v-if="savingDisplay" class="spinner-border spinner-border-sm me-1" />
                            <font-awesome-icon v-else icon="save" class="me-1" />{{ $t('Save') }}
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- ═══ SECTION 3 : CRASH LOOP ═══ -->
        <div class="shadow-box big-padding mb-4">
            <h5 class="settings-subheading mb-3">
                <font-awesome-icon icon="rotate" class="me-2" />{{ $t('watcher.monitoring.crashHeading') }}
            </h5>

            <div class="row g-3 mb-3">
                <!-- Activer -->
                <div class="col-12">
                    <div class="form-check form-switch mb-0">
                        <input id="crashEnabled" v-model="monSettings.crashLoopEnabled"
                            class="form-check-input" type="checkbox" role="switch" />
                        <label class="form-check-label fw-semibold" for="crashEnabled">
                            {{ $t('watcher.monitoring.crashEnabled') }}
                        </label>
                    </div>
                </div>

                <template v-if="monSettings.crashLoopEnabled">
                    <!-- Seuil -->
                    <div class="col-md-4">
                        <label class="form-label small">{{ $t('watcher.monitoring.crashThreshold') }}</label>
                        <div class="input-group input-group-sm">
                            <input v-model.number="monSettings.crashLoopThreshold" type="number" min="2" max="50"
                                class="form-control" style="max-width: 80px" />
                            <span class="input-group-text">{{ $t('watcher.monitoring.crashRestarts') }}</span>
                        </div>
                    </div>

                    <!-- Fenêtre -->
                    <div class="col-md-4">
                        <label class="form-label small">{{ $t('watcher.monitoring.crashWindow') }}</label>
                        <div class="input-group input-group-sm">
                            <input v-model.number="monSettings.crashLoopWindowMinutes" type="number" min="1" max="60"
                                class="form-control" style="max-width: 80px" />
                            <span class="input-group-text">min</span>
                        </div>
                    </div>

                    <!-- Cooldown -->
                    <div class="col-md-4">
                        <label class="form-label small">{{ $t('watcher.monitoring.crashCooldown') }}</label>
                        <div class="input-group input-group-sm">
                            <input v-model.number="monSettings.crashLoopCooldownMinutes" type="number" min="5" max="1440"
                                class="form-control" style="max-width: 80px" />
                            <span class="input-group-text">min</span>
                        </div>
                    </div>

                    <!-- Webhooks Discord -->
                    <div class="col-12">
                        <p class="notif-provider-label">Discord</p>
                        <div v-for="(wh, idx) in monSettings.discordWebhooks" :key="idx"
                            class="d-flex align-items-center gap-2 mb-2">
                            <span class="form-control form-control-sm text-truncate notif-url-display">{{ maskWebhook(wh) }}</span>
                            <button class="btn btn-sm btn-outline-danger" @click="removeWebhook(idx)">
                                <font-awesome-icon icon="times" />
                            </button>
                        </div>
                        <p v-if="!monSettings.discordWebhooks.length" class="form-text fst-italic mb-2">{{ $t('watcher.img.noWebhook') }}</p>
                        <div class="input-group input-group-sm mt-1">
                            <input v-model="newWebhook" type="url" class="form-control"
                                placeholder="https://discord.com/api/webhooks/..." autocomplete="off" />
                            <button class="btn btn-success btn-sm" @click="addWebhook" :disabled="!newWebhook">
                                <font-awesome-icon icon="plus" />
                            </button>
                        </div>
                    </div>

                    <!-- URLs Apprise -->
                    <div class="col-12">
                        <p class="notif-provider-label">Apprise</p>
                        <div v-for="(url, idx) in monSettings.appriseUrls" :key="idx"
                            class="d-flex align-items-center gap-2 mb-2">
                            <span class="form-control form-control-sm text-truncate notif-url-display">{{ url }}</span>
                            <button class="btn btn-sm btn-outline-danger" @click="removeAppriseUrl(idx)">
                                <font-awesome-icon icon="times" />
                            </button>
                        </div>
                        <p v-if="!monSettings.appriseUrls.length" class="form-text fst-italic mb-2">{{ $t('watcher.apprise.noUrl') }}</p>
                        <div class="input-group input-group-sm mt-1">
                            <input v-model="newAppriseUrl" type="text" class="form-control"
                                :placeholder="$t('watcher.apprise.urlPlaceholder')" autocomplete="off" />
                            <button class="btn btn-success btn-sm" @click="addAppriseUrl" :disabled="!newAppriseUrl">
                                <font-awesome-icon icon="plus" />
                            </button>
                        </div>
                    </div>
                </template>
            </div>

            <div class="d-flex align-items-center gap-3 flex-wrap mb-4">
                <button class="btn btn-primary btn-sm" @click="saveMonSettings" :disabled="savingMon">
                    <span v-if="savingMon" class="spinner-border spinner-border-sm me-1" />
                    <font-awesome-icon v-else icon="save" class="me-1" />{{ $t('Save') }}
                </button>
                <button class="btn btn-normal btn-sm" @click="testAppriseMonitoring"
                    :disabled="testingApprise || !monSettings.appriseUrls.length">
                    <span v-if="testingApprise" class="spinner-border spinner-border-sm me-1" />
                    <font-awesome-icon v-else icon="paper-plane" class="me-1" />{{ $t('watcher.apprise.test') }}
                </button>
            </div>

            <!-- Tableau crash events -->
            <div v-if="monSettings.crashLoopEnabled">
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <h6 class="form-text fw-semibold mb-0">{{ $t('watcher.monitoring.crashEventsHeading') }}</h6>
                    <button v-if="overview.crashes.length" class="btn btn-sm btn-outline-secondary"
                        @click="clearCrashEvents" :disabled="clearingEvents">
                        <span v-if="clearingEvents" class="spinner-border spinner-border-sm me-1" />
                        <font-awesome-icon v-else icon="trash" class="me-1" />{{ $t('watcher.monitoring.crashClearList') }}
                    </button>
                </div>
                <div v-if="!overview.crashes.length" class="form-text fst-italic">
                    {{ $t('watcher.monitoring.crashEventEmpty') }}
                </div>
                <table v-else class="table table-sm table-dark table-bordered small mb-0">
                    <thead>
                        <tr>
                            <th>{{ $t('watcher.monitoring.crashColContainer') }}</th>
                            <th>{{ $t('watcher.monitoring.crashColCount') }}</th>
                            <th>{{ $t('watcher.monitoring.crashColWindow') }}</th>
                            <th>{{ $t('watcher.monitoring.crashColTime') }}</th>
                            <th style="width:1%"></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(ev, i) in overview.crashes" :key="i">
                            <td><code>{{ ev.containerName }}</code></td>
                            <td><span class="badge bg-danger">{{ ev.restartCount }}×</span></td>
                            <td>{{ ev.windowMinutes }} min</td>
                            <td class="text-muted">{{ fmtDate(ev.timestamp) }}</td>
                            <td>
                                <!-- Dropdown durée d'exclusion -->
                                <div class="dropdown">
                                    <button class="btn btn-sm btn-outline-warning dropdown-toggle py-0 px-2"
                                        type="button" data-bs-toggle="dropdown" aria-expanded="false"
                                        :title="$t('watcher.monitoring.crashExcludeBtn')">
                                        <font-awesome-icon icon="ban" />
                                    </button>
                                    <ul class="dropdown-menu dropdown-menu-dark dropdown-menu-end">
                                        <li><h6 class="dropdown-header">{{ $t('watcher.monitoring.crashExcludeFor') }}</h6></li>
                                        <li>
                                            <a class="dropdown-item" href="#"
                                                @click.prevent="excludeContainer(ev.containerName, 1)">
                                                1 {{ $t('watcher.monitoring.crashExcludeHour') }}
                                            </a>
                                        </li>
                                        <li>
                                            <a class="dropdown-item" href="#"
                                                @click.prevent="excludeContainer(ev.containerName, 6)">
                                                6 {{ $t('watcher.monitoring.crashExcludeHours') }}
                                            </a>
                                        </li>
                                        <li>
                                            <a class="dropdown-item" href="#"
                                                @click.prevent="excludeContainer(ev.containerName, 24)">
                                                24 {{ $t('watcher.monitoring.crashExcludeHours') }}
                                            </a>
                                        </li>
                                        <li>
                                            <a class="dropdown-item" href="#"
                                                @click.prevent="excludeContainer(ev.containerName, 72)">
                                                72 {{ $t('watcher.monitoring.crashExcludeHours') }}
                                            </a>
                                        </li>
                                        <li><hr class="dropdown-divider"></li>
                                        <li>
                                            <a class="dropdown-item" href="#"
                                                @click.prevent="excludeContainer(ev.containerName, null)">
                                                {{ $t('watcher.monitoring.crashExcludePermanent') }}
                                            </a>
                                        </li>
                                    </ul>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <!-- Section exclusions actives -->
                <div v-if="exclusions.length" class="mt-3">
                    <div class="d-flex align-items-center justify-content-between mb-2">
                        <h6 class="form-text fw-semibold mb-0">
                            <font-awesome-icon icon="ban" class="me-1 text-warning" />{{ $t('watcher.monitoring.crashExclusionsHeading') }}
                        </h6>
                        <button class="btn btn-sm btn-outline-danger" @click="clearExclusions">
                            <font-awesome-icon icon="trash" class="me-1" />{{ $t('watcher.monitoring.crashExclusionsClear') }}
                        </button>
                    </div>
                    <table class="table table-sm table-dark table-bordered small mb-0">
                        <thead>
                            <tr>
                                <th>{{ $t('watcher.monitoring.crashColContainer') }}</th>
                                <th>{{ $t('watcher.monitoring.crashExcludeExpiry') }}</th>
                                <th style="width:1%"></th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="excl in exclusions" :key="excl.containerName">
                                <td><code>{{ excl.containerName }}</code></td>
                                <td class="text-muted">
                                    <span v-if="!excl.expiresAt" class="badge bg-secondary">{{ $t('watcher.monitoring.crashExcludePermanent') }}</span>
                                    <span v-else>{{ fmtDate(excl.expiresAt) }}</span>
                                </td>
                                <td>
                                    <button class="btn btn-sm btn-outline-danger py-0 px-2"
                                        @click="removeExclusion(excl.containerName)"
                                        :title="$t('watcher.monitoring.crashExcludeRemove')">
                                        <font-awesome-icon icon="times" />
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- ═══ SECTION 4 : KULA ═══ -->
        <div class="shadow-box big-padding mb-4">
            <h5 class="settings-subheading mb-3">
                <font-awesome-icon icon="heartbeat" class="me-2" />{{ $t('watcher.monitoring.healthHeading') }}
            </h5>

            <div class="row g-3 mb-3">
                <div class="col-12">
                    <div class="form-check form-switch mb-0">
                        <input id="healthEnabled" v-model="monSettings.healthcheckEnabled"
                            class="form-check-input" type="checkbox" role="switch" />
                        <label class="form-check-label fw-semibold" for="healthEnabled">
                            {{ $t('watcher.monitoring.healthEnabled') }}
                        </label>
                    </div>
                    <small class="form-text">{{ $t('watcher.monitoring.healthHint') }}</small>
                </div>

                <template v-if="monSettings.healthcheckEnabled">
                    <div class="col-md-8">
                        <label class="form-label small">{{ $t('watcher.monitoring.healthMode') }}</label>
                        <select v-model="monSettings.healthcheckAutoHealMode" class="form-select form-select-sm">
                            <option value="notify">{{ $t('watcher.monitoring.healthModeNotify') }}</option>
                            <option value="restart_container">{{ $t('watcher.monitoring.healthModeRestartContainer') }}</option>
                            <option value="restart_service">{{ $t('watcher.monitoring.healthModeRestartService') }}</option>
                            <option value="stack_aware">{{ $t('watcher.monitoring.healthModeStackAware') }}</option>
                        </select>
                        <small class="form-text">{{ $t('watcher.monitoring.healthModeHint') }}</small>
                    </div>

                    <div class="col-md-4">
                        <label class="form-label small">{{ $t('watcher.monitoring.healthCooldown') }}</label>
                        <div class="input-group input-group-sm">
                            <input v-model.number="monSettings.healthcheckCooldownMinutes" type="number" min="1" max="1440"
                                class="form-control" style="max-width: 80px" />
                            <span class="input-group-text">min</span>
                        </div>
                    </div>
                </template>
            </div>

            <div class="d-flex align-items-center gap-3 flex-wrap mb-4">
                <button class="btn btn-primary btn-sm" @click="saveMonSettings" :disabled="savingMon">
                    <span v-if="savingMon" class="spinner-border spinner-border-sm me-1" />
                    <font-awesome-icon v-else icon="save" class="me-1" />{{ $t('Save') }}
                </button>
            </div>

            <div v-if="monSettings.healthcheckEnabled">
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <h6 class="form-text fw-semibold mb-0">{{ $t('watcher.monitoring.healthEventsHeading') }}</h6>
                    <button v-if="overview.health.length" class="btn btn-sm btn-outline-secondary"
                        @click="clearHealthEvents" :disabled="clearingHealthEvents">
                        <span v-if="clearingHealthEvents" class="spinner-border spinner-border-sm me-1" />
                        <font-awesome-icon v-else icon="trash" class="me-1" />{{ $t('watcher.monitoring.crashClearList') }}
                    </button>
                </div>
                <div v-if="!overview.health.length" class="form-text fst-italic">
                    {{ $t('watcher.monitoring.healthEventEmpty') }}
                </div>
                <table v-else class="table table-sm table-dark table-bordered small mb-0">
                    <thead>
                        <tr>
                            <th>{{ $t('watcher.monitoring.crashColContainer') }}</th>
                            <th>{{ $t('watcher.monitoring.healthColStack') }}</th>
                            <th>{{ $t('watcher.monitoring.healthColAction') }}</th>
                            <th>{{ $t('watcher.monitoring.healthColStatus') }}</th>
                            <th>{{ $t('watcher.monitoring.crashColTime') }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(ev, i) in overview.health" :key="i">
                            <td><code>{{ ev.containerName }}</code></td>
                            <td>
                                <span v-if="ev.stackName || ev.serviceName">
                                    {{ ev.stackName || '-' }}<span v-if="ev.serviceName"> / {{ ev.serviceName }}</span>
                                </span>
                                <span v-else class="text-muted">-</span>
                            </td>
                            <td>{{ healthActionLabel(ev.action) }}</td>
                            <td>
                                <span :class="healthStatusBadge(ev.actionStatus)">
                                    {{ healthStatusLabel(ev.actionStatus) }}
                                </span>
                                <span v-if="ev.message" class="text-muted ms-2">{{ ev.message }}</span>
                            </td>
                            <td class="text-muted">{{ fmtDate(ev.timestamp) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <div class="shadow-box big-padding mb-4">
            <div class="d-flex align-items-center justify-content-between mb-3">
                <h5 class="settings-subheading mb-0">
                    <font-awesome-icon icon="chart-bar" class="me-2" />{{ $t('watcher.kula.heading') }}
                    <span v-if="kulaStatus === 'running'" class="badge bg-success ms-2 badge-sm">{{ $t('watcher.kula.running') }}</span>
                    <span v-else-if="kulaSettings.enabled" class="badge bg-warning text-dark ms-2 badge-sm">{{ $t('watcher.kula.stopped') }}</span>
                </h5>
                <div class="d-flex gap-2 align-items-center">
                    <a v-if="kulaStatus === 'running'" :href="kulaEffectiveUrl" target="_blank"
                        class="btn btn-sm btn-outline-secondary">
                        <font-awesome-icon icon="external-link-alt" class="me-1" />{{ $t('watcher.kula.openExternal') }}
                    </a>
                </div>
            </div>

            <!-- Toggle + config -->
            <div class="row g-3 mb-3">
                <div class="col-12">
                    <div class="form-check form-switch mb-0">
                        <input id="kulaEnabled" v-model="kulaSettings.enabled"
                            class="form-check-input" type="checkbox" role="switch" />
                        <label class="form-check-label fw-semibold" for="kulaEnabled">
                            {{ $t('watcher.kula.enable') }}
                        </label>
                    </div>
                    <small class="form-text">{{ $t('watcher.kula.enableHint') }}</small>
                </div>

                <template v-if="kulaSettings.enabled">
                    <!-- Port -->
                    <div class="col-md-3">
                        <label class="form-label small">{{ $t('watcher.kula.port') }}</label>
                        <input v-model.number="kulaSettings.port" type="number" min="1024" max="65535"
                            class="form-control form-control-sm" style="max-width:120px" />
                    </div>

                    <!-- Mode réseau -->
                    <div class="col-md-4">
                        <label class="form-label small">{{ $t('watcher.kula.networkMode') }}</label>
                        <select v-model="kulaSettings.networkMode" class="form-select form-select-sm" style="max-width:160px">
                            <option value="bridge">Bridge (-p port:27960)</option>
                            <option value="host">Host (--network host)</option>
                        </select>
                    </div>

                    <!-- URL personnalisée -->
                    <div class="col-12">
                        <label class="form-label small">{{ $t('watcher.kula.customUrl') }}</label>
                        <input v-model="kulaSettings.customUrl" type="url" class="form-control form-control-sm"
                            style="max-width:380px"
                            :placeholder="`http://${windowHostname}:${kulaSettings.port}`" />
                        <small class="form-text">{{ $t('watcher.kula.customUrlHint') }} <code>{{ kulaEffectiveUrl }}</code></small>
                    </div>
                </template>
            </div>

            <div class="d-flex gap-2 mb-3">
                <button class="btn btn-primary btn-sm" @click="saveKulaSettings" :disabled="savingKula">
                    <span v-if="savingKula" class="spinner-border spinner-border-sm me-1" />
                    <font-awesome-icon v-else icon="save" class="me-1" />{{ $t('Save') }}
                </button>
                <button v-if="kulaSettings.enabled && kulaStatus !== 'running'" class="btn btn-success btn-sm"
                    @click="startKula" :disabled="kulaActionLoading">
                    <span v-if="kulaActionLoading" class="spinner-border spinner-border-sm me-1" />
                    <font-awesome-icon v-else icon="play" class="me-1" />{{ $t('watcher.kula.start') }}
                </button>
                <button v-if="kulaStatus === 'running'" class="btn btn-danger btn-sm"
                    @click="stopKula" :disabled="kulaActionLoading">
                    <span v-if="kulaActionLoading" class="spinner-border spinner-border-sm me-1" />
                    <font-awesome-icon v-else icon="stop" class="me-1" />{{ $t('watcher.kula.stop') }}
                </button>
            </div>

            <!-- Lien vers kula -->
            <div v-if="kulaStatus === 'running'" class="kula-open-hint mt-2">
                <font-awesome-icon icon="circle-check" class="text-success me-2" />
                {{ $t('watcher.kula.runningHint') }}
                <a :href="kulaEffectiveUrl" target="_blank" class="kula-open-link ms-1">
                    {{ kulaEffectiveUrl }} <font-awesome-icon icon="external-link-alt" class="ms-1" />
                </a>
            </div>
        </div>

        <div class="shadow-box big-padding mb-4">
            <div class="d-flex align-items-center justify-content-between mb-3">
                <h5 class="settings-subheading mb-0">
                    <font-awesome-icon icon="terminal" class="me-2" />{{ $t("watcher.dozzle.heading") }}
                    <span v-if="dozzleStatus === 'running'" class="badge bg-success ms-2 badge-sm">{{ $t("watcher.dozzle.running") }}</span>
                    <span v-else-if="dozzleSettings.enabled" class="badge bg-warning text-dark ms-2 badge-sm">{{ $t("watcher.dozzle.stopped") }}</span>
                </h5>
                <a v-if="dozzleStatus === 'running'" :href="dozzleEffectiveUrl" target="_blank" class="btn btn-sm btn-outline-secondary">
                    <font-awesome-icon icon="external-link-alt" class="me-1" />{{ $t("watcher.dozzle.open") }}
                </a>
            </div>
            <div class="form-check form-switch mb-1">
                <input id="dozzleEnabled" v-model="dozzleSettings.enabled" class="form-check-input" type="checkbox" role="switch" />
                <label class="form-check-label fw-semibold" for="dozzleEnabled">{{ $t("watcher.dozzle.enable") }}</label>
            </div>
            <small class="form-text">{{ $t("watcher.dozzle.hint") }}</small>
            <div v-if="dozzleSettings.enabled" class="row g-3 my-1">
                <div class="col-md-3">
                    <label class="form-label small">{{ $t("watcher.dozzle.port") }}</label>
                    <input v-model.number="dozzleSettings.port" type="number" min="1024" max="65535" class="form-control form-control-sm" style="max-width:120px" />
                </div>
                <div class="col-12">
                    <label class="form-label small">{{ $t("watcher.dozzle.customUrl") }}</label>
                    <input v-model="dozzleSettings.customUrl" type="url" class="form-control form-control-sm" style="max-width:380px" :placeholder="`http://${windowHostname}:${dozzleSettings.port}`" />
                    <small class="form-text">{{ $t("watcher.dozzle.effectiveUrl") }} <code>{{ dozzleEffectiveUrl }}</code></small>
                </div>
            </div>
            <div class="d-flex gap-2 mt-3">
                <button class="btn btn-primary btn-sm" :disabled="savingDozzle" @click="saveDozzleSettings">
                    <span v-if="savingDozzle" class="spinner-border spinner-border-sm me-1" />
                    <font-awesome-icon v-else icon="save" class="me-1" />{{ $t("Save") }}
                </button>
                <button v-if="dozzleSettings.enabled && dozzleStatus !== 'running'" class="btn btn-success btn-sm" :disabled="dozzleActionLoading" @click="startDozzle">
                    <font-awesome-icon icon="play" class="me-1" />{{ $t("watcher.dozzle.start") }}
                </button>
                <button v-if="dozzleStatus === 'running'" class="btn btn-danger btn-sm" :disabled="dozzleActionLoading" @click="stopDozzle">
                    <font-awesome-icon icon="stop" class="me-1" />{{ $t("watcher.dozzle.stop") }}
                </button>
            </div>
        </div>

        <!-- Toast -->
        <Transition name="slide-fade">
            <div v-if="toast.msg" class="toast-float" :class="toast.ok ? 'toast-ok' : 'toast-err'">
                {{ toast.msg }}
            </div>
        </Transition>

    </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n/dist/vue-i18n.esm-browser.prod.js";
import { initServerTz, fmtDate } from "../composables/useServerTz";
import { stackStatsEnabled } from "../composables/useStackStats";
import { setLowPower, POLL, makePoller, type Poller } from "../composables/useLowPower";
import { formatPowerWatts, resolvePowerWatchWebUrl, type PowerWatchFrontendSnapshot } from "../powerwatch";

const { t } = useI18n();
initServerTz();

// ─── Types ────────────────────────────────────────────────────────

interface CrashExclusion {
    containerName: string;
    expiresAt: string | null;
}

type HealthAutoHealMode = "notify" | "restart_container" | "restart_service" | "stack_aware";
type HealthActionStatus = "notified" | "success" | "failed" | "skipped";

interface KulaSettings {
    enabled:     boolean;
    port:        number;
    customUrl:   string;
    networkMode: "bridge" | "host";
}

interface DozzleSettings { enabled: boolean; port: number; customUrl: string }

interface PowerWatchSettings {
    enabled: boolean;
    mode: "managed" | "external";
    apiUrl: string;
    webUrl: string;
    externalContainer: string;
    hostPort: number;
    bindAddress: string;
    managedWebUrl: string;
    msrMode: "auto" | "enabled" | "disabled";
    nvidiaMode: "auto" | "enabled" | "disabled";
    hubEnabled: boolean;
    hubWebUrl: string;
}

interface PowerWatchHubStatus {
    enabled: boolean;
    reachable: boolean;
    webUrl: string | null;
    lastError?: string | null;
}

interface PowerWatchDetection {
    containers: Array<{ name: string;
        image: string;
        state: string;
        hostPort: number | null }>;
    capabilities: { linux: boolean;
        powercap: boolean;
        msr: boolean;
        nvidia: boolean };
    portAvailable: boolean;
}

interface MonitoringSettings {
    crashLoopEnabled: boolean;
    crashLoopThreshold: number;
    crashLoopWindowMinutes: number;
    crashLoopCooldownMinutes: number;
    healthcheckEnabled: boolean;
    healthcheckAutoHealMode: HealthAutoHealMode;
    healthcheckCooldownMinutes: number;
    discordWebhooks: string[];
    appriseUrls: string[];
    lowPowerMode: boolean;
    historyEnabled: boolean;
    historyPreset: "24h" | "7d" | "1m" | "custom";
    historyAmount: number;
    historyUnit: "days" | "weeks" | "months" | "years";
}

interface MonitoringHistoryPoint {
    sampledAt: string;
    cpuPercent: number;
    ramPercent: number;
    ramUsed: number;
    ramTotal: number;
}

interface HistoryTimeTick {
    timestamp: number;
    x: number;
    label: string;
}

interface Overview {
    backup: { lastTimestamp: string | null; ageMinutes: number | null; success: boolean | null };
    images: { pendingCount: number; pendingImages: { image: string; stack: string }[] };
    trivy:  { criticalCount: number; criticalImages: { image: string; stack: string; maxSeverity: string }[]; lastScanAt: string | null; nextScanAt: string | null };
    crashes: { containerName: string; restartCount: number; windowMinutes: number; timestamp: string }[];
    health: {
        containerName: string;
        stackName: string | null;
        serviceName: string | null;
        action: HealthAutoHealMode;
        actionStatus: HealthActionStatus;
        message: string;
        timestamp: string;
    }[];
}

interface HostStats {
    cpuModel: string;
    cpuCores: number;
    perCoreCpu: number[];
    loadAverage: number[];
    processCount: number | null;
    uptimeSeconds: number;
    temperatures: {
        cpu: { label: string; celsius: number }[];
        disks: { label: string; celsius: number }[];
    };
}

interface HostNavbarDisplay {
    cpuModel: boolean;
    perCoreCpu: boolean;
    uptime: boolean;
    cpuTemperatures: boolean;
    diskTemperatures: boolean;
    navbarPosition: "top" | "bottom";
}

// ─── API helper ───────────────────────────────────────────────────

const API = "/api";

async function api(method: string, path: string, body?: unknown): Promise<{ ok: boolean; data?: unknown; message?: string }> {
    const token = localStorage.getItem("token") ?? sessionStorage.getItem("token") ?? "";
    const fullPath = API + path;
    const sep = fullPath.includes("?") ? "&" : "?";
    const res = await fetch(`${fullPath}${sep}token=${encodeURIComponent(token)}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
}

// ─── State ────────────────────────────────────────────────────────

const overviewLoading = ref(false);
const overview = ref<Overview>({
    backup:  { lastTimestamp: null, ageMinutes: null, success: null },
    images:  { pendingCount: 0, pendingImages: [] },
    trivy:   { criticalCount: 0, criticalImages: [], lastScanAt: null, nextScanAt: null },
    crashes: [],
    health: [],
});
const hostStats = ref<HostStats | null>(null);

const monSettings = ref<MonitoringSettings>({
    crashLoopEnabled: false,
    crashLoopThreshold: 5,
    crashLoopWindowMinutes: 10,
    crashLoopCooldownMinutes: 60,
    healthcheckEnabled: false,
    healthcheckAutoHealMode: "notify",
    healthcheckCooldownMinutes: 30,
    discordWebhooks: [],
    appriseUrls: [],
    lowPowerMode: false,
    historyEnabled: false,
    historyPreset: "24h",
    historyAmount: 7,
    historyUnit: "days",
});

const historyPreset = ref<"24h" | "7d" | "1m" | "custom">("24h");
const historyAmount = ref(7);
const historyUnit = ref<"days" | "weeks" | "months" | "years">("days");
const historyLoading = ref(false);
const savingHistoryPrefs = ref(false);
const historyPoints = ref<MonitoringHistoryPoint[]>([]);
const historyStats = ref({
    cpuAverage: 0,
    cpuMax: 0,
    ramAverage: 0,
    ramMax: 0,
});
const historyFrom = ref(0);
const historyTo = ref(1);
const historyBucketSeconds = ref(300);

const historyPresetOptions = [
    {
        value: "24h" as const,
        label: "watcher.monitoring.history24h",
    },
    {
        value: "7d" as const,
        label: "watcher.monitoring.history7d",
    },
    {
        value: "1m" as const,
        label: "watcher.monitoring.history1m",
    },
    {
        value: "custom" as const,
        label: "watcher.monitoring.historyCustom",
    },
];

const historyChartWrap = ref<HTMLElement | null>(null);
const historyChartWidth = ref(960);
const historyChart = computed(() => ({
    width: historyChartWidth.value,
    height: 220,
    left: 52,
    right: 16,
    top: 12,
    bottom: 32,
}));
const historyYTicks = [ 0, 25, 50, 75, 100 ];
const historyPlotWidth = computed(() =>
    Math.max(1, historyChart.value.width - historyChart.value.left - historyChart.value.right)
);
const historyPlotHeight = computed(() =>
    historyChart.value.height - historyChart.value.top - historyChart.value.bottom
);

let historyChartResizeObserver: ResizeObserver | null = null;

function syncHistoryChartWidth(): void {
    const el = historyChartWrap.value;
    if (!el) {
        return;
    }

    const styles = window.getComputedStyle(el);
    const horizontalPadding =
        (Number.parseFloat(styles.paddingLeft) || 0) +
        (Number.parseFloat(styles.paddingRight) || 0);

    const width = Math.floor(el.clientWidth - horizontalPadding);
    if (width > 0) {
        historyChartWidth.value = Math.max(240, width);
    }
}

function observeHistoryChart(): void {
    historyChartResizeObserver?.disconnect();
    historyChartResizeObserver = null;

    if (!historyChartWrap.value) {
        return;
    }

    syncHistoryChartWidth();

    historyChartResizeObserver = new ResizeObserver(() => {
        syncHistoryChartWidth();
    });
    historyChartResizeObserver.observe(historyChartWrap.value);
}

function historyX(sampledAt: string): number {
    const value = Date.parse(sampledAt);
    const ratio = (value - historyFrom.value) / Math.max(1, historyTo.value - historyFrom.value);
    return historyChart.value.left + Math.max(0, Math.min(1, ratio)) * historyPlotWidth.value;
}

function historyY(percent: number): number {
    const ratio = Math.max(0, Math.min(100, percent)) / 100;
    return historyChart.value.top + (1 - ratio) * historyPlotHeight.value;
}

const historyTimeTicks = computed(() => {
    const from = historyFrom.value;
    const to = historyTo.value;
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
        return [] as HistoryTimeTick[];
    }
    const duration = to - from;
    const formatter = duration <= 48 * 3_600_000
        ? new Intl.DateTimeFormat(undefined, {
            hour: "2-digit",
            minute: "2-digit",
        })
        : duration <= 45 * 86_400_000
            ? new Intl.DateTimeFormat(undefined, {
                day: "2-digit",
                month: "short",
            })
            : duration <= 400 * 86_400_000
                ? new Intl.DateTimeFormat(undefined, {
                    month: "short",
                    year: "2-digit",
                })
                : new Intl.DateTimeFormat(undefined, { year: "numeric" });
    return [ 0, 0.25, 0.5, 0.75, 1 ].map(ratio => {
        const timestamp = from + duration * ratio;
        return {
            timestamp,
            x: historyChart.value.left + historyPlotWidth.value * ratio,
            label: formatter.format(new Date(timestamp)),
        };
    });
});

function historySegments(metric: "cpuPercent" | "ramPercent"): string[] {
    const segments: string[][] = [];
    let current: string[] = [];
    let previous = 0;
    for (const point of historyPoints.value) {
        const timestamp = Date.parse(point.sampledAt);
        if (previous && timestamp - previous > historyBucketSeconds.value * 2_500) {
            if (current.length > 1) {
                segments.push(current);
            }
            current = [];
        }
        current.push(`${historyX(point.sampledAt)},${historyY(point[metric])}`);
        previous = timestamp;
    }
    if (current.length > 1) {
        segments.push(current);
    }
    return segments.map(segment => segment.join(" "));
}

function historyAreas(segments: string[]): string[] {
    const baseline = historyY(0);
    return segments.map((segment) => {
        const points = segment.split(" ").filter(Boolean);
        if (points.length < 2) {
            return segment;
        }
        const firstX = points[0].split(",")[0];
        const lastX = points[points.length - 1].split(",")[0];
        return `${firstX},${baseline} ${segment} ${lastX},${baseline}`;
    });
}

const cpuHistorySegments = computed(() => historySegments("cpuPercent"));
const ramHistorySegments = computed(() => historySegments("ramPercent"));
const cpuHistoryAreas = computed(() => historyAreas(cpuHistorySegments.value));
const ramHistoryAreas = computed(() => historyAreas(ramHistorySegments.value));

function historyTooltip(point: MonitoringHistoryPoint): string {
    return `${new Date(point.sampledAt).toLocaleString()} · CPU ${point.cpuPercent.toFixed(1)}% · RAM ${point.ramPercent.toFixed(1)}%`;
}

const diskPartitions = ref<string[]>(["/"]);
const diskDisplayMode = ref<"compact" | "bar">("compact");
const hostNavbarDisplay = ref<HostNavbarDisplay>({
    cpuModel: false,
    perCoreCpu: false,
    uptime: false,
    cpuTemperatures: false,
    diskTemperatures: false,
    navbarPosition: "bottom",
});
const diskDisplayExampleCells = [true, true, false, false, false, false, false, false, false, false];
const newPartition   = ref("");
const savingMon      = ref(false);
const savingDisplay  = ref(false);
const newWebhook     = ref("");
const newAppriseUrl  = ref("");
const testingApprise = ref(false);
const toast          = ref({ msg: "", ok: true });

const exclusions     = ref<CrashExclusion[]>([]);
const clearingEvents = ref(false);
const clearingHealthEvents = ref(false);

// ── Kula ──────────────────────────────────────────────────────────
const kulaSettings = ref<KulaSettings>({
    enabled: false, port: 27960, customUrl: "", networkMode: "bridge",
});
const kulaStatus        = ref<"running" | "stopped" | "error">("stopped");
const savingKula        = ref(false);
const kulaActionLoading = ref(false);
const windowHostname    = window.location.hostname;

const kulaEffectiveUrl = computed(() =>
    kulaSettings.value.customUrl?.trim()
        ? kulaSettings.value.customUrl.trim()
        : `http://${windowHostname}:${kulaSettings.value.port}`
);
const dozzleSettings = ref<DozzleSettings>({ enabled: false, port: 8080, customUrl: "" });
const dozzleStatus = ref<"running" | "stopped" | "error">("stopped");
const savingDozzle = ref(false);
const dozzleActionLoading = ref(false);
const dozzleEffectiveUrl = computed(() => dozzleSettings.value.customUrl?.trim() || `http://${windowHostname}:${dozzleSettings.value.port}`);
const powerWatchSettings = ref<PowerWatchSettings>({
    enabled: false,
    mode: "external",
    apiUrl: "",
    webUrl: "",
    externalContainer: "",
    hostPort: 3000,
    bindAddress: "127.0.0.1",
    managedWebUrl: "",
    msrMode: "auto",
    nvidiaMode: "auto",
    hubEnabled: false,
    hubWebUrl: "",
});
const powerWatchStatus = ref<(PowerWatchFrontendSnapshot & { lastError?: string | null }) | null>(null);
const powerWatchDetection = ref<PowerWatchDetection | null>(null);
const powerWatchLoading = ref(false);
const savedPowerWatchSettings = ref<PowerWatchSettings | null>(null);
const powerWatchHubStatus = ref<PowerWatchHubStatus | null>(null);
const powerWatchEffectiveUrl = computed(() => resolvePowerWatchWebUrl(powerWatchStatus.value?.webUrl, windowHostname));
const powerWatchHubEffectiveUrl = computed(() => resolvePowerWatchWebUrl(powerWatchHubStatus.value?.webUrl || powerWatchSettings.value.hubWebUrl, windowHostname));
const powerWatchDisplayWatts = computed(() => powerWatchStatus.value?.reachable
    ? formatPowerWatts(powerWatchStatus.value.totalWatts, navigator.language)
    : "—");
const powerWatchConfidence = computed(() => powerWatchStatus.value?.confidence === "Measured"
    ? t("watcher.powerwatch.measured")
    : powerWatchStatus.value?.confidence === "Estimated" ? t("watcher.powerwatch.estimated") : "");

// L'option appartient à cette instance et est persistée côté serveur.
const localStackStatsEnabled = ref(false);

// ─── Computed ─────────────────────────────────────────────────────

const backupCardClass = computed(() => {
    if (!overview.value.backup.lastTimestamp) {
        return "mc-neutral";
    }
    return overview.value.backup.success ? "mc-ok" : "mc-danger";
});

const nextTrivyMinutes = computed<number | null>(() => {
    const s = overview.value.trivy.nextScanAt;
    if (!s) {
        return null;
    }
    return Math.max(0, Math.floor((new Date(s).getTime() - Date.now()) / 60_000));
});

const lastTrivyMinutes = computed<number | null>(() => {
    const s = overview.value.trivy.lastScanAt;
    if (!s) {
        return null;
    }
    return Math.floor((Date.now() - new Date(s).getTime()) / 60_000);
});

// ─── Helpers ──────────────────────────────────────────────────────

function formatAge(minutes: number | null): string {
    if (minutes === null) {
        return "—";
    }
    if (minutes < 1) {
        return t("watcher.monitoring.ageJustNow");
    }
    if (minutes < 60) {
        return t("timeUnit.minute", [ minutes ]);
    }
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0
        ? `${t("timeUnit.hour", [ h ])} ${t("timeUnit.minute", [ m ])}`
        : t("timeUnit.hour", [ h ]);
}

function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const parts = [];
    if (days > 0) {
        parts.push(t("timeUnit.day", [ days ]));
    }
    if (hours > 0) {
        parts.push(t("timeUnit.hour", [ hours ]));
    }
    parts.push(t("timeUnit.minute", [ minutes ]));
    return parts.join(" ");
}

function friendlyTempLabel(label: string): string {
    const match = label.match(/^Core\s+(\d+)$/i);
    if (match) {
        return `${t("watcher.monitoring.hostCore")} ${match[1]}`;
    }
    if (/processor|package|cpu/i.test(label)) {
        return t("watcher.monitoring.hostProcessor");
    }
    return label;
}

function maskWebhook(url: string): string {
    try {
        const u = new URL(url);
        return u.origin + u.pathname.replace(/\/[^/]+$/, "/***");
    } catch { return url; }
}

function showToast(msg: string, ok = true) {
    toast.value = { msg, ok };
    setTimeout(() => { toast.value.msg = ""; }, 3000);
}

function healthActionLabel(action: HealthAutoHealMode): string {
    return t(`watcher.monitoring.healthAction.${action}`);
}

function healthStatusLabel(status: HealthActionStatus): string {
    return t(`watcher.monitoring.healthStatus.${status}`);
}

function healthStatusBadge(status: HealthActionStatus): string {
    if (status === "success") {
        return "badge bg-success";
    }
    if (status === "failed") {
        return "badge bg-danger";
    }
    return "badge bg-secondary";
}

// ─── Webhook helpers ──────────────────────────────────────────────

function addWebhook() {
    if (!newWebhook.value.trim()) {
        return;
    }
    monSettings.value.discordWebhooks.push(newWebhook.value.trim());
    newWebhook.value = "";
}
function removeWebhook(idx: number) {
    monSettings.value.discordWebhooks.splice(idx, 1);
}

// ─── Apprise helpers ──────────────────────────────────────────────

function addAppriseUrl() {
    const url = newAppriseUrl.value.trim();
    if (!url || monSettings.value.appriseUrls.includes(url)) {
        return;
    }
    monSettings.value.appriseUrls.push(url);
    newAppriseUrl.value = "";
}
function removeAppriseUrl(idx: number) {
    monSettings.value.appriseUrls.splice(idx, 1);
}
async function testAppriseMonitoring() {
    if (!monSettings.value.appriseUrls.length) {
        return;
    }
    testingApprise.value = true;
    try {
        // Le serverUrl est partagé — stocké dans les settings image (watcher-router)
        const imgRes = await api("GET", "/watcher/image/settings");
        const serverUrl = imgRes.ok ? ((imgRes.data as Record<string, unknown>)?.appriseServerUrl as string ?? "") : "";
        const res = await api("POST", "/watcher/apprise/test", {
            serverUrl,
            urls: monSettings.value.appriseUrls,
        });
        showToast(res.ok ? "✅ " + t("watcher.apprise.testOk") : "❌ " + t("watcher.apprise.testFail"), res.ok);
    } finally {
        testingApprise.value = false;
    }
}

// ─── Crash exclusions ─────────────────────────────────────────────

async function loadExclusions() {
    const res = await api("GET", "/monitoring/crash-exclusions");
    if (res.ok) {
        exclusions.value = res.data as CrashExclusion[];
    }
}

async function excludeContainer(containerName: string, durationHours: number | null) {
    const res = await api("POST", "/monitoring/crash-exclusions", { containerName, durationHours });
    if (res.ok) {
        showToast("✅ " + t("watcher.monitoring.crashExcludeAdded"));
        await Promise.all([loadExclusions(), loadOverview()]);
    } else {
        showToast(`❌ ${res.message}`, false);
    }
}

async function removeExclusion(containerName: string) {
    const encoded = encodeURIComponent(containerName);
    const res = await api("DELETE", `/monitoring/crash-exclusions/${encoded}`);
    if (res.ok) {
        showToast("✅ " + t("watcher.monitoring.crashExcludeRemoved"));
        await Promise.all([loadExclusions(), loadOverview()]);
    } else {
        showToast(`❌ ${res.message}`, false);
    }
}

async function clearExclusions() {
    const res = await api("DELETE", "/monitoring/crash-exclusions");
    if (res.ok) {
        showToast("✅ " + t("watcher.monitoring.crashExclusionsCleared"));
        await Promise.all([loadExclusions(), loadOverview()]);
    } else {
        showToast(`❌ ${res.message}`, false);
    }
}

async function clearCrashEvents() {
    clearingEvents.value = true;
    try {
        const res = await api("DELETE", "/monitoring/crash-events");
        if (res.ok) {
            showToast("✅ " + t("watcher.monitoring.crashListCleared"));
            await loadOverview();
        } else {
            showToast(`❌ ${res.message}`, false);
        }
    } finally { clearingEvents.value = false; }
}

async function clearHealthEvents() {
    clearingHealthEvents.value = true;
    try {
        const res = await api("DELETE", "/monitoring/health-events");
        if (res.ok) {
            showToast("✅ " + t("watcher.monitoring.healthListCleared"));
            await loadOverview();
        } else {
            showToast(`❌ ${res.message}`, false);
        }
    } finally { clearingHealthEvents.value = false; }
}

// ─── API calls ────────────────────────────────────────────────────

async function loadOverview() {
    overviewLoading.value = true;
    try {
        const res = await api("GET", "/monitoring/overview");
        if (res.ok) {
            overview.value = res.data as Overview;
        }
    } finally {
        overviewLoading.value = false;
    }
}

async function loadHostStats() {
    const res = await api("GET", "/system/stats");
    if (res.ok) {
        const data = res.data as { host?: HostStats };
        hostStats.value = data.host ?? null;
    }
}

async function loadSettings() {
    const [settingsRes, displayRes] = await Promise.all([
        api("GET", "/monitoring/settings"),
        api("GET", "/monitoring/display-settings"),
    ]);
    if (settingsRes.ok) {
        const d = settingsRes.data as MonitoringSettings;
        monSettings.value = { ...monSettings.value, ...d, appriseUrls: Array.isArray(d.appriseUrls) ? d.appriseUrls : [] };
        historyPreset.value = d.historyPreset ?? "24h";
        historyAmount.value = Number.isSafeInteger(d.historyAmount) && d.historyAmount > 0 ? d.historyAmount : 7;
        historyUnit.value = d.historyUnit ?? "days";
        // Propage le mode low-power à toute l'app dès le chargement
        setLowPower(monSettings.value.lowPowerMode);
    }
    if (displayRes.ok) {
        const d = displayRes.data as { diskPartitions?: string[]; diskDisplayMode?: "compact" | "bar"; hostNavbarDisplay?: Partial<HostNavbarDisplay>; stackStatsEnabled?: boolean };
        localStackStatsEnabled.value = d.stackStatsEnabled === true;
        stackStatsEnabled.value = localStackStatsEnabled.value;
        diskPartitions.value = d.diskPartitions?.length ? d.diskPartitions : ["/"];
        diskDisplayMode.value = d.diskDisplayMode === "bar" ? "bar" : "compact";
        hostNavbarDisplay.value = {
            ...hostNavbarDisplay.value,
            ...(d.hostNavbarDisplay ?? {}),
        };
    }
}

async function saveMonSettings() {
    savingMon.value = true;
    try {
        const res = await api("POST", "/monitoring/settings", monSettings.value);
        showToast(res.ok ? "✅ " + t("watcher.monitoring.saved") : `❌ ${res.message}`, res.ok);
    } finally { savingMon.value = false; }
}

async function loadHistory() {
    historyLoading.value = true;
    try {
        const query = historyPreset.value === "custom"
            ? `amount=${encodeURIComponent(String(Math.max(1, historyAmount.value)))}&unit=${encodeURIComponent(historyUnit.value)}`
            : `preset=${encodeURIComponent(historyPreset.value)}`;
        const res = await api("GET", `/monitoring/history?${query}`);
        if (!res.ok || !res.data) {
            showToast(`❌ ${res.message ?? t("watcher.monitoring.historyLoadError")}`, false);
            return;
        }
        const data = res.data as {
            points: MonitoringHistoryPoint[];
            stats: typeof historyStats.value;
            from: string;
            to: string;
            bucketSeconds: number;
        };
        historyPoints.value = data.points;
        historyStats.value = data.stats;
        historyFrom.value = Date.parse(data.from);
        historyTo.value = Date.parse(data.to);
        historyBucketSeconds.value = data.bucketSeconds;
        await nextTick();
        observeHistoryChart();
    } catch {
        showToast(`❌ ${t("watcher.monitoring.historyLoadError")}`, false);
    } finally {
        historyLoading.value = false;
    }
}

async function toggleHistory() {
    const res = await api("POST", "/monitoring/settings", { historyEnabled: monSettings.value.historyEnabled });
    showToast(res.ok ? "✅ " + t("watcher.monitoring.saved") : `❌ ${res.message}`, res.ok);
    await loadHistory();
}

async function selectHistoryPreset(preset: "24h" | "7d" | "1m" | "custom") {
    historyPreset.value = preset;
    await loadHistory();
}

async function saveHistoryPreferences() {
    savingHistoryPrefs.value = true;
    try {
        const amount = Math.max(1, Math.floor(Number(historyAmount.value) || 1));
        historyAmount.value = amount;
        const res = await api("POST", "/monitoring/settings", {
            historyPreset: historyPreset.value,
            historyAmount: amount,
            historyUnit: historyUnit.value,
        });
        if (res.ok) {
            monSettings.value.historyPreset = historyPreset.value;
            monSettings.value.historyAmount = amount;
            monSettings.value.historyUnit = historyUnit.value;
        }
        showToast(res.ok ? "✅ " + t("watcher.monitoring.saved") : `❌ ${res.message}`, res.ok);
        if (res.ok) {
            await loadHistory();
        }
    } finally {
        savingHistoryPrefs.value = false;
    }
}

/** Bascule le mode low-power : effet immédiat dans l'app + persistance. */
async function toggleLowPower() {
    setLowPower(monSettings.value.lowPowerMode);
    await saveMonSettings();
}

function addPartition() {
    const val = newPartition.value.trim();
    if (val && !diskPartitions.value.includes(val)) {
        diskPartitions.value.push(val);
    }
    newPartition.value = "";
}

function removePartition(idx: number) {
    diskPartitions.value.splice(idx, 1);
}

async function saveStackStatsSetting() {
    stackStatsEnabled.value = localStackStatsEnabled.value;
    const res = await api("POST", "/monitoring/display-settings", { stackStatsEnabled: localStackStatsEnabled.value });
    if (!res.ok) {
        showToast(`❌ ${res.message}`, false);
    }
}

async function saveDisplaySettings() {
    savingDisplay.value = true;
    try {
        const res = await api("POST", "/monitoring/display-settings", {
            diskPartitions: diskPartitions.value,
            diskDisplayMode: diskDisplayMode.value,
            hostNavbarDisplay: hostNavbarDisplay.value,
            stackStatsEnabled: localStackStatsEnabled.value,
        });
        showToast(res.ok ? "✅ " + t("watcher.monitoring.saved") : `❌ ${res.message}`, res.ok);
    } finally { savingDisplay.value = false; }
}

// ── Kula API ──────────────────────────────────────────────────────

async function loadKulaSettings() {
    const res = await api("GET", "/watcher/kula/settings");
    if (res.ok) {
        kulaSettings.value = res.data as KulaSettings;
    }
}

async function loadKulaStatus() {
    const res = await api("GET", "/watcher/kula/status") as { ok: boolean; status?: string };
    if (res.ok && res.status) {
        kulaStatus.value = res.status as "running" | "stopped" | "error";
    }
}

async function saveKulaSettings() {
    savingKula.value = true;
    try {
        const res = await api("POST", "/watcher/kula/settings", kulaSettings.value);
        if (res.ok) {
            showToast("✅ " + t("watcher.kula.saved"));
            await loadKulaStatus();
        } else {
            showToast(`❌ ${res.message}`, false);
        }
    } finally { savingKula.value = false; }
}

async function startKula() {
    kulaActionLoading.value = true;
    try {
        const res = await api("POST", "/watcher/kula/start");
        if (res.ok) {
            showToast("✅ " + t("watcher.kula.started"));
            setTimeout(loadKulaStatus, 2000);
        } else {
            showToast(`❌ ${res.message}`, false);
        }
    } finally { kulaActionLoading.value = false; }
}

async function stopKula() {
    kulaActionLoading.value = true;
    try {
        const res = await api("POST", "/watcher/kula/stop");
        if (res.ok) {
            showToast("✅ " + t("watcher.kula.stopp"));
            kulaStatus.value = "stopped";
        } else {
            showToast(`❌ ${res.message}`, false);
        }
    } finally { kulaActionLoading.value = false; }
}

async function loadDozzleSettings() {
    const res = await api("GET", "/watcher/dozzle/settings");
    if (res.ok) {
        dozzleSettings.value = res.data as DozzleSettings;
    }
}
async function loadDozzleStatus() {
    const res = await api("GET", "/watcher/dozzle/status") as { ok: boolean; status?: string };
    if (res.ok && res.status) {
        dozzleStatus.value = res.status as "running" | "stopped" | "error";
    }
}
async function saveDozzleSettings() {
    savingDozzle.value = true;
    try {
        const res = await api("POST", "/watcher/dozzle/settings", dozzleSettings.value);
        showToast(res.ok ? "✅ " + t("watcher.dozzle.saved") : `❌ ${res.message}`, res.ok);
        await loadDozzleStatus();
    } finally { savingDozzle.value = false; }
}
async function startDozzle() {
    dozzleActionLoading.value = true;
    try {
        const res = await api("POST", "/watcher/dozzle/start");
        showToast(res.ok ? "✅ " + t("watcher.dozzle.started") : `❌ ${res.message}`, res.ok);
        await loadDozzleStatus();
    } finally { dozzleActionLoading.value = false; }
}
async function stopDozzle() {
    dozzleActionLoading.value = true;
    try {
        const res = await api("POST", "/watcher/dozzle/stop");
        showToast(res.ok ? "✅ " + t("watcher.dozzle.stoppedToast") : `❌ ${res.message}`, res.ok);
        await loadDozzleStatus();
    } finally { dozzleActionLoading.value = false; }
}

async function loadPowerWatch() {
    const [ settings, status, hubStatus ] = await Promise.all([
        api("GET", "/watcher/powerwatch/settings"),
        api("GET", "/watcher/powerwatch/status"),
        api("GET", "/watcher/powerwatch/hub/status"),
    ]);
    if (settings.ok) {
        powerWatchSettings.value = settings.data as PowerWatchSettings;
        savedPowerWatchSettings.value = { ...powerWatchSettings.value };
    }
    if (status.ok) {
        powerWatchStatus.value = status.data as PowerWatchFrontendSnapshot & { lastError?: string | null };
    }
    if (hubStatus.ok) {
        powerWatchHubStatus.value = hubStatus.data as PowerWatchHubStatus;
    }
}

async function savePowerWatchSettings() {
    const switchingFromManaged = savedPowerWatchSettings.value?.enabled &&
        savedPowerWatchSettings.value.mode === "managed" && powerWatchSettings.value.mode === "external";
    if (switchingFromManaged && !window.confirm(t("watcher.powerwatch.confirmManagedToExternal"))) {
        return;
    }
    powerWatchLoading.value = true;
    try {
        const res = await api("POST", "/watcher/powerwatch/settings", {
            ...powerWatchSettings.value,
            confirmStopManaged: Boolean(switchingFromManaged),
        });
        showToast(res.ok ? "✅ " + t("watcher.powerwatch.saved") : `❌ ${res.message}`, res.ok);
        if (res.ok) {
            await loadPowerWatch();
        }
    } finally {
        powerWatchLoading.value = false;
    }
}

async function detectPowerWatch() {
    powerWatchLoading.value = true;
    try {
        const res = await api("GET", "/watcher/powerwatch/detect");
        if (res.ok) {
            powerWatchDetection.value = res.data as PowerWatchDetection;
        }
        showToast(res.ok ? "✅ " + t("watcher.powerwatch.hostChecked") : `❌ ${res.message}`, res.ok);
    } finally {
        powerWatchLoading.value = false;
    }
}

async function testPowerWatch() {
    powerWatchLoading.value = true;
    try {
        const res = await api("POST", "/watcher/powerwatch/test", powerWatchSettings.value);
        if (res.ok) {
            powerWatchStatus.value = res.data as PowerWatchFrontendSnapshot & { lastError?: string | null };
        }
        showToast(res.ok && res.data?.reachable ? "✅ " + t("watcher.powerwatch.online") : `❌ ${res.data?.lastError || res.message}`, Boolean(res.ok && res.data?.reachable));
    } finally {
        powerWatchLoading.value = false;
    }
}

async function testPowerWatchHub() {
    powerWatchLoading.value = true;
    try {
        const res = await api("POST", "/watcher/powerwatch/hub/test", powerWatchSettings.value);
        if (res.ok) {
            powerWatchHubStatus.value = res.data as PowerWatchHubStatus;
        }
        showToast(res.ok && res.data?.reachable ? "✅ " + t("watcher.powerwatch.hubOnline") : `❌ ${res.data?.lastError || res.message}`, Boolean(res.ok && res.data?.reachable));
    } finally {
        powerWatchLoading.value = false;
    }
}

async function powerWatchAction(action: "install" | "start" | "stop" | "restart") {
    powerWatchLoading.value = true;
    try {
        const saved = await api("POST", "/watcher/powerwatch/settings", powerWatchSettings.value);
        const res = saved.ok ? await api("POST", `/watcher/powerwatch/${action}`) : saved;
        showToast(res.ok ? "✅ PowerWatch" : `❌ ${res.message}`, res.ok);
        await loadPowerWatch();
    } finally {
        powerWatchLoading.value = false;
    }
}

function usePowerWatchContainer(container: PowerWatchDetection["containers"][number]) {
    powerWatchSettings.value.externalContainer = container.name;
    powerWatchSettings.value.apiUrl = "";
    if (!powerWatchSettings.value.webUrl && container.hostPort) {
        powerWatchSettings.value.webUrl = `http://${windowHostname}:${container.hostPort}`;
    }
}

function capabilityLabel(value: boolean, optional = false): string {
    if (value) {
        return t("watcher.powerwatch.available");
    }
    return optional ? t("watcher.powerwatch.optionalUnavailable") : t("watcher.powerwatch.notAvailable");
}

// ─── Polling ──────────────────────────────────────────────────────

let overviewPoller: Poller | null = null;

onMounted(async () => {
    await Promise.all([loadOverview(), loadHostStats(), loadSettings(), loadKulaSettings(), loadKulaStatus(), loadDozzleSettings(), loadDozzleStatus(), loadPowerWatch(), loadExclusions()]);
    await loadHistory();
    // Overview : cadence selon le mode + pause si onglet caché
    overviewPoller = makePoller({ fetch: loadOverview, interval: POLL.overview });
    overviewPoller.start();
});

onUnmounted(() => {
    if (overviewPoller) {
        overviewPoller.stop();
    }
    historyChartResizeObserver?.disconnect();
    historyChartResizeObserver = null;
});
</script>

<style lang="scss" scoped>
/* ── Overview cards ── */
.monitoring-cards {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
}

@media (max-width: $bp-phone) {
    .monitoring-cards { grid-template-columns: 1fr; }
}

.monitoring-card {
    border-radius: var(--radius-lg);
    padding: 20px 22px;
    display: flex;
    gap: 16px;
    align-items: flex-start;
    border: 1px solid var(--border-color);
    background: var(--bg-raised);
    transition: border-color .2s;
    min-height: 90px;
}

.monitoring-card.mc-ok     { border-color: color-mix(in srgb, var(--success) 35%, transparent); }
.monitoring-card.mc-warn   { border-color: color-mix(in srgb, var(--warning) 35%, transparent); }
.monitoring-card.mc-danger { border-color: color-mix(in srgb, var(--danger) 35%, transparent); }
.monitoring-card.mc-neutral{ border-color: var(--border-strong); }

.host-history {
    padding-top: 1rem;
    border-top: 1px solid var(--border-color);
}
.history-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: .5rem;
    .form-select, .form-control { width: auto; min-width: 8rem; }
}
.history-period-label {
    flex: 0 0 auto;
    color: var(--text-muted);
    font-size: var(--fs-sm);
    font-weight: 600;
    white-space: nowrap;
}
.history-preset-group {
    display: inline-flex;
    flex-wrap: wrap;
    gap: .35rem;
}
.history-preset-btn {
    border: 1px solid var(--border-strong);
    background: var(--bg-raised);
    color: var(--text-muted);
}
.history-preset-btn:hover,
.history-preset-btn.active {
    border-color: var(--primary);
    color: var(--text-color);
    background: color-mix(in srgb, var(--primary) 14%, var(--bg-raised));
}
.history-custom-range {
    display: inline-flex;
    align-items: center;
    gap: .4rem;
}
.history-custom-range .form-control { width: 6rem; min-width: 6rem; }
.history-custom-range .form-select { min-width: 8.5rem; }
.history-stats {
    display: flex;
    flex-wrap: wrap;
    gap: .6rem;
    color: var(--text-muted);
    font-size: var(--fs-sm);
}
.history-stat-card {
    display: inline-flex;
    align-items: center;
    gap: .45rem;
    padding: .4rem .65rem;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--bg-raised);
}
.history-stat-card strong { color: var(--text-color); }
.history-legend {
    display: inline-block;
    width: .7rem;
    height: .7rem;
    margin-right: .35rem;
    border-radius: 50%;
}
.history-legend--cpu { background: var(--primary); }
.history-legend--ram { background: var(--success); }
.history-chart-wrap {
    width: 100%;
    min-height: 190px;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--border-color) 75%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--bg-raised) 96%, var(--bg-surface));
    padding: .35rem .5rem .2rem;
}
.history-chart {
    display: block;
    width: 100%;
    max-width: 100%;
    height: 220px;
}
.history-plot-bg {
    fill: color-mix(in srgb, var(--bg-surface) 34%, transparent);
    stroke: none;
}
.history-grid-line { stroke: var(--border-color); stroke-width: 1; stroke-opacity: .45; vector-effect: non-scaling-stroke; }
.history-grid-line--vertical { stroke-opacity: .16; }
.history-axis-label { fill: var(--text-muted); font-size: 10px; }
.history-time-label { font-size: 9.5px; }
.history-area { stroke: none; pointer-events: none; }
.history-area--cpu { fill: color-mix(in srgb, var(--primary) 12%, transparent); }
.history-area--ram { fill: color-mix(in srgb, var(--success) 10%, transparent); }
.history-line {
    fill: none;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
}
.history-line--cpu { stroke: var(--primary); }
.history-line--ram { stroke: var(--success); }
.history-hitpoint { fill: transparent; stroke: transparent; cursor: crosshair; }

@media (max-width: $bp-phone) {
    .history-controls { align-items: stretch; }
    .history-preset-group { width: 100%; }
    .history-preset-btn { flex: 1 1 auto; }
    .history-custom-range { width: 100%; }
    .history-custom-range .form-control,
    .history-custom-range .form-select { flex: 1 1 0; width: auto; min-width: 0; }
    .history-controls .btn-primary { width: 100%; margin-left: 0 !important; }
    .history-stat-card { width: 100%; }
    .history-chart { height: 220px; }
}

.mc-icon { font-size: var(--fs-2xl); line-height: 1; flex-shrink: 0; padding-top: 2px; }

.mc-body { flex: 1; min-width: 0; }

.mc-label {
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: .05em;
    color: var(--text-muted);
    margin-bottom: 6px;
}
.mc-value {
    font-size: var(--fs-lg);
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    line-height: 1.4;
}
.mc-detail {
    font-size: var(--fs-xs);
    color: var(--text-muted);
    font-weight: 400;
    margin-top: 4px;
    white-space: normal;
    word-break: break-word;
}

/* ── Toast (clone du BackupTab) ── */
.host-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}

.host-item {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    padding: 12px 14px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-raised);
}

.host-item span,
.host-item small {
    color: var(--text-muted);
    font-size: var(--fs-xs);
}

.host-item strong {
    color: var(--text-color);
    font-size: .95rem;
    overflow-wrap: anywhere;
}

.core-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 14px;
}

.core-meter {
    display: grid;
    grid-template-columns: 48px 1fr 44px;
    align-items: center;
    gap: 8px;
    font-size: var(--fs-xs);
}

.core-bar {
    height: 7px;
    overflow: hidden;
    border-radius: var(--radius-pill);
    background: var(--bg-raised);
}

.core-bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--primary);
}

.temperature-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
}

.temperature-grid h6 {
    margin-bottom: 8px;
    color: var(--text-color);
}

.temp-chip {
    display: inline-flex;
    margin: 0 6px 6px 0;
    padding: 3px 8px;
    border-radius: var(--radius-pill);
    background: var(--bg-raised);
    color: var(--text-color);
    font-size: var(--fs-xs);
}

.navbar-host-options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 18px;
    max-width: 720px;
}

.navbar-position-select {
    max-width: 220px;
}

@media (max-width: $bp-mobile) {
    .host-grid,
    .core-grid,
    .temperature-grid,
    .navbar-host-options {
        grid-template-columns: 1fr;
    }
}

.toast-float {
    position: fixed; right: 1.25rem; bottom: 1.5rem; z-index: 9999;
    padding: .6rem 1rem; border-radius: var(--radius-md); font-size: var(--fs-md); color: var(--primary-text);
    box-shadow: var(--shadow-popover);
    &.toast-ok { background: var(--success); }
    &.toast-err { background: var(--danger); }
    @media (max-width: $bp-mobile) { bottom: var(--space-4); }
}

.slide-fade-enter-active, .slide-fade-leave-active { transition: all .25s ease; }
.slide-fade-enter-from, .slide-fade-leave-to { transform: translateY(12px); opacity: 0; }

/* ── Notification providers ── */
.notif-provider-label {
    font-size: var(--fs-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: var(--text-muted);
    margin-bottom: .5rem;
}
.notif-url-display {
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
}

.badge-sm {
    font-size: var(--fs-xs);
}

.disk-display-example {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
}

.disk-example-bar {
    display: inline-flex;
    align-items: center;
    gap: 1px;
    font-family: var(--font-mono);
    line-height: 1;
}

.disk-example-bracket {
    line-height: 1;
}

.disk-example-cells {
    display: inline-grid;
    grid-template-columns: repeat(10, 0.38rem);
    align-items: center;
    column-gap: 1px;
    height: 0.7rem;
}

.disk-example-cell {
    display: block;
    width: 0.38rem;
    height: 0.58rem;
    border-radius: 1px;
}

.disk-example-cell.filled {
    background: currentColor;
}

/* ── Kula open link ── */
.kula-open-hint {
    font-size: var(--fs-md);
    color: var(--text-muted);
}
.kula-open-link {
    color: var(--primary-strong);
    text-decoration: none;
    &:hover { text-decoration: underline; }
}
.powerwatch-detected,
.powerwatch-diagnostic,
.powerwatch-current {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: .5rem 1rem;
}
.powerwatch-detected {
    padding: .55rem .7rem;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--bg-raised);
    font-size: var(--fs-sm);
}
.powerwatch-current {
    padding: .65rem .8rem;
    border-radius: var(--radius-sm);
    background: var(--bg-raised);
}
.powerwatch-hub-panel {
    border-top: 1px solid var(--border-color);
}
@media (max-width: $bp-phone) {
    .powerwatch-panel .form-control,
    .powerwatch-panel .form-select,
    .powerwatch-panel .btn { width: 100%; }
}
</style>
