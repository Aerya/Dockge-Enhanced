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
                            class="form-check-input" type="checkbox" role="switch" />
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

                <!-- Affichage barre haute -->
                <div class="col-12">
                    <label class="form-label small">
                        <font-awesome-icon icon="display" class="me-1" />{{ $t('watcher.monitoring.navbarHostDisplay') }}
                    </label>
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
                        <code class="form-control form-control-sm" style="max-width:220px;background:rgba(255,255,255,.04)">{{ p }}</code>
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
                <div class="d-flex align-items-center gap-2">
                    <small class="form-text">{{ $t('watcher.notifLang') }}</small>
                    <div class="notif-lang-toggle">
                        <button :class="['notif-lang-btn', monSettings.notificationLang !== 'en' && 'active']"
                            @click="monSettings.notificationLang = 'fr'">🇫🇷</button>
                        <button :class="['notif-lang-btn', monSettings.notificationLang === 'en' && 'active']"
                            @click="monSettings.notificationLang = 'en'">🇬🇧</button>
                    </div>
                </div>
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
                    <span v-if="kulaStatus === 'running'" class="badge bg-success ms-2" style="font-size:.7rem">{{ $t('watcher.kula.running') }}</span>
                    <span v-else-if="kulaSettings.enabled" class="badge bg-warning text-dark ms-2" style="font-size:.7rem">{{ $t('watcher.kula.stopped') }}</span>
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

        <!-- Toast -->
        <Transition name="slide-fade">
            <div v-if="toast.msg" class="toast-float" :class="toast.ok ? 'toast-ok' : 'toast-err'">
                {{ toast.msg }}
            </div>
        </Transition>

    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useI18n } from "vue-i18n/dist/vue-i18n.esm-browser.prod.js";
import { initServerTz, fmtDate } from "../composables/useServerTz";
import { stackStatsEnabled } from "../composables/useStackStats";
import { setLowPower, POLL, makePoller, type Poller } from "../composables/useLowPower";

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
    notificationLang: "fr" | "en";
    lowPowerMode: boolean;
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
    notificationLang: "fr",
    lowPowerMode: false,
});

const diskPartitions = ref<string[]>(["/"]);
const diskDisplayMode = ref<"compact" | "bar">("compact");
const hostNavbarDisplay = ref<HostNavbarDisplay>({
    cpuModel: false,
    perCoreCpu: false,
    uptime: false,
    cpuTemperatures: false,
    diskTemperatures: false,
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

// Sync with global stackStatsEnabled composable
const localStackStatsEnabled = ref(stackStatsEnabled.value);
watch(localStackStatsEnabled, (val) => {
    stackStatsEnabled.value = val;
    localStorage.setItem("stackStatsEnabled", String(val));
});

// ─── Computed ─────────────────────────────────────────────────────

const backupCardClass = computed(() => {
    if (!overview.value.backup.lastTimestamp) return "mc-neutral";
    return overview.value.backup.success ? "mc-ok" : "mc-danger";
});

const nextTrivyMinutes = computed<number | null>(() => {
    const s = overview.value.trivy.nextScanAt;
    if (!s) return null;
    return Math.max(0, Math.floor((new Date(s).getTime() - Date.now()) / 60_000));
});

const lastTrivyMinutes = computed<number | null>(() => {
    const s = overview.value.trivy.lastScanAt;
    if (!s) return null;
    return Math.floor((Date.now() - new Date(s).getTime()) / 60_000);
});

// ─── Helpers ──────────────────────────────────────────────────────

function formatAge(minutes: number | null): string {
    if (minutes === null) return "—";
    if (minutes < 1) return t("watcher.monitoring.ageJustNow");
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const parts = [];
    if (days > 0) parts.push(`${days} j`);
    if (hours > 0) parts.push(`${hours} h`);
    parts.push(`${minutes} min`);
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
    if (status === "success") return "badge bg-success";
    if (status === "failed") return "badge bg-danger";
    return "badge bg-secondary";
}

// ─── Webhook helpers ──────────────────────────────────────────────

function addWebhook() {
    if (!newWebhook.value.trim()) return;
    monSettings.value.discordWebhooks.push(newWebhook.value.trim());
    newWebhook.value = "";
}
function removeWebhook(idx: number) {
    monSettings.value.discordWebhooks.splice(idx, 1);
}

// ─── Apprise helpers ──────────────────────────────────────────────

function addAppriseUrl() {
    const url = newAppriseUrl.value.trim();
    if (!url || monSettings.value.appriseUrls.includes(url)) return;
    monSettings.value.appriseUrls.push(url);
    newAppriseUrl.value = "";
}
function removeAppriseUrl(idx: number) {
    monSettings.value.appriseUrls.splice(idx, 1);
}
async function testAppriseMonitoring() {
    if (!monSettings.value.appriseUrls.length) return;
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
    if (res.ok) exclusions.value = res.data as CrashExclusion[];
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
        if (res.ok) overview.value = res.data as Overview;
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
        // Propage le mode low-power à toute l'app dès le chargement
        setLowPower(monSettings.value.lowPowerMode);
    }
    if (displayRes.ok) {
        const d = displayRes.data as { diskPartitions?: string[]; diskDisplayMode?: "compact" | "bar"; hostNavbarDisplay?: Partial<HostNavbarDisplay> };
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

async function saveDisplaySettings() {
    savingDisplay.value = true;
    try {
        const res = await api("POST", "/monitoring/display-settings", {
            diskPartitions: diskPartitions.value,
            diskDisplayMode: diskDisplayMode.value,
            hostNavbarDisplay: hostNavbarDisplay.value,
        });
        showToast(res.ok ? "✅ " + t("watcher.monitoring.saved") : `❌ ${res.message}`, res.ok);
    } finally { savingDisplay.value = false; }
}

// ── Kula API ──────────────────────────────────────────────────────

async function loadKulaSettings() {
    const res = await api("GET", "/watcher/kula/settings");
    if (res.ok) kulaSettings.value = res.data as KulaSettings;
}

async function loadKulaStatus() {
    const res = await api("GET", "/watcher/kula/status") as { ok: boolean; status?: string };
    if (res.ok && res.status) kulaStatus.value = res.status as "running" | "stopped" | "error";
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

// ─── Polling ──────────────────────────────────────────────────────

let overviewPoller: Poller | null = null;

onMounted(async () => {
    await Promise.all([loadOverview(), loadHostStats(), loadSettings(), loadKulaSettings(), loadKulaStatus(), loadExclusions()]);
    // Overview : cadence selon le mode + pause si onglet caché
    overviewPoller = makePoller({ fetch: loadOverview, interval: POLL.overview });
    overviewPoller.start();
});

onUnmounted(() => {
    if (overviewPoller) overviewPoller.stop();
});
</script>

<style scoped>
/* ── Overview cards ── */
.monitoring-cards {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
}

@media (max-width: 600px) {
    .monitoring-cards { grid-template-columns: 1fr; }
}

.monitoring-card {
    border-radius: 12px;
    padding: 20px 22px;
    display: flex;
    gap: 16px;
    align-items: flex-start;
    border: 1px solid rgba(255,255,255,.07);
    background: rgba(255,255,255,.04);
    transition: border-color .2s;
    min-height: 90px;
}

.monitoring-card.mc-ok     { border-color: rgba(34,197,94,.35);  }
.monitoring-card.mc-warn   { border-color: rgba(245,158,11,.35); }
.monitoring-card.mc-danger { border-color: rgba(239,68,68,.35);  }
.monitoring-card.mc-neutral{ border-color: rgba(255,255,255,.1); }

.mc-icon { font-size: 2rem; line-height: 1; flex-shrink: 0; padding-top: 2px; }

.mc-body { flex: 1; min-width: 0; }

.mc-label {
    font-size: .72rem;
    text-transform: uppercase;
    letter-spacing: .05em;
    color: #9ca3af;
    margin-bottom: 6px;
}
.mc-value {
    font-size: 1.1rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    line-height: 1.4;
}
.mc-detail {
    font-size: .75rem;
    color: #9ca3af;
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
    border: 1px solid rgba(255,255,255,.08);
    border-radius: 8px;
    background: rgba(255,255,255,.035);
}

.host-item span,
.host-item small {
    color: #9ca3af;
    font-size: .75rem;
}

.host-item strong {
    color: #e5e7eb;
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
    font-size: .75rem;
}

.core-bar {
    height: 7px;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255,255,255,.1);
}

.core-bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: #60a5fa;
}

.temperature-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
}

.temperature-grid h6 {
    margin-bottom: 8px;
    color: #d1d5db;
}

.temp-chip {
    display: inline-flex;
    margin: 0 6px 6px 0;
    padding: 3px 8px;
    border-radius: 999px;
    background: rgba(255,255,255,.08);
    color: #e5e7eb;
    font-size: .75rem;
}

.navbar-host-options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 18px;
    max-width: 720px;
}

@media (max-width: 700px) {
    .host-grid,
    .core-grid,
    .temperature-grid,
    .navbar-host-options {
        grid-template-columns: 1fr;
    }
}

.toast-float {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9999;
    padding: 10px 18px;
    border-radius: 8px;
    font-size: .875rem;
    font-weight: 600;
    box-shadow: 0 4px 16px rgba(0,0,0,.4);
}
.toast-ok  { background: #22c55e; color: #fff; }
.toast-err { background: #ef4444; color: #fff; }

.slide-fade-enter-active, .slide-fade-leave-active { transition: all .25s ease; }
.slide-fade-enter-from, .slide-fade-leave-to { transform: translateY(12px); opacity: 0; }

/* ── Notification providers ── */
.notif-provider-label {
    font-size: .7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: #6b7280;
    margin-bottom: .5rem;
}
.notif-url-display {
    font-family: monospace;
    font-size: .78rem;
}
.notif-lang-toggle {
    display: flex;
    gap: .2rem;
    background: rgba(255,255,255,.06);
    border-radius: 50rem;
    padding: 2px 4px;
    border: 1px solid rgba(255,255,255,.1);
}
.notif-lang-btn {
    background: transparent;
    border: none;
    border-radius: 50rem;
    padding: 1px 6px;
    font-size: .8rem;
    cursor: pointer;
    opacity: .5;
    transition: opacity .15s, background .15s;
    &.active { opacity: 1; background: rgba(255,255,255,.12); }
    &:hover:not(.active) { opacity: .75; }
}
.btn-normal {
    background: rgba(255,255,255,.08);
    border: 1px solid rgba(255,255,255,.12);
    color: #d1d5db;
    &:hover { background: rgba(255,255,255,.14); color: #fff; }
    &:disabled { opacity: .5; cursor: default; }
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
    font-family: "JetBrains Mono", monospace;
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
    font-size: .875rem;
    color: #9ca3af;
}
.kula-open-link {
    color: #93c5fd;
    text-decoration: none;
    &:hover { text-decoration: underline; }
}
</style>
