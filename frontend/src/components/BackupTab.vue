<template>
    <div>
        <!-- ═══ DESTINATIONS ═══ -->
        <div class="shadow-box big-padding mb-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h5 class="settings-subheading mb-0">
                    <font-awesome-icon icon="archive" class="me-2" />{{ $t('watcher.backup.heading') }}
                    <span v-if="isBackupStale" class="badge bg-warning text-dark ms-2" style="font-size:.72rem;font-weight:500">{{ $t('watcher.backup.stale') }}</span>
                </h5>
                <div class="form-check form-switch mb-0">
                    <input v-model="settings.enabled" class="form-check-input" type="checkbox"
                        id="backupEnabled" role="switch" />
                    <label class="form-check-label" for="backupEnabled">
                        <span :class="settings.enabled ? 'text-success' : ''">
                            {{ settings.enabled ? $t('watcher.backup.enabled') : $t('watcher.backup.disabled') }}
                        </span>
                    </label>
                </div>
            </div>

            <!-- Intervalle global -->
            <div class="row g-3 mb-3">
                <div class="col-md-4">
                    <label class="form-label">{{ $t('watcher.backup.frequency') }}</label>
                    <select v-model.number="settings.intervalHours" class="form-select">
                        <option :value="6">{{ $t('watcher.backup.every6h') }}</option>
                        <option :value="12">{{ $t('watcher.backup.every12h') }}</option>
                        <option :value="24">{{ $t('watcher.backup.everyDay') }}</option>
                        <option :value="48">{{ $t('watcher.backup.every2days') }}</option>
                        <option :value="168">{{ $t('watcher.backup.everyWeek') }}</option>
                    </select>
                </div>
                <div class="col-md-8 d-flex align-items-end">
                    <div>
                        <div class="form-check form-switch mb-0">
                            <input v-model="settings.backupOnSave" class="form-check-input" type="checkbox"
                                id="backupOnSave" role="switch" />
                            <label class="form-check-label fw-semibold" for="backupOnSave">
                                {{ $t('watcher.backup.backupOnSave') }}
                            </label>
                        </div>
                        <small class="form-text">{{ $t('watcher.backup.backupOnSaveHint') }}</small>
                    </div>
                </div>
            </div>

            <!-- ── Liste des destinations ── -->
            <div v-for="(dest, idx) in settings.destinations" :key="idx" class="dest-card mb-3">

                <!-- En-tête de la carte -->
                <div class="dest-card-header d-flex align-items-center gap-2">
                    <div class="form-check form-switch mb-0">
                        <input :id="`destEnabled${idx}`" v-model="dest.enabled"
                            class="form-check-input" type="checkbox" role="switch" />
                    </div>
                    <input v-model="dest.label" type="text" class="form-control form-control-sm dest-label-input"
                        :placeholder="$t('watcher.backup.destLabel')" />
                    <select v-model="dest.type" class="form-select form-select-sm dest-type-select"
                        @change="onDestTypeChange(dest)">
                        <option value="local">{{ $t('watcher.backup.destLocal') }}</option>
                        <option value="sftp">{{ $t('watcher.backup.destSftp') }}</option>
                        <option value="s3">{{ $t('watcher.backup.destS3') }}</option>
                        <option value="rest">{{ $t('watcher.backup.destRest') }}</option>
                    </select>
                    <button class="btn btn-sm btn-link dest-toggle-btn" @click="toggleDest(idx)">
                        <font-awesome-icon :icon="expandedDest === idx ? 'chevron-up' : 'chevron-down'" />
                    </button>
                    <button class="btn btn-sm btn-outline-danger ms-auto"
                        :disabled="settings.destinations.length <= 1"
                        @click="removeDestination(idx)">
                        <font-awesome-icon icon="trash" />
                    </button>
                </div>

                <!-- Corps de la carte (dépliable) -->
                <div v-show="expandedDest === idx" class="dest-card-body row g-3 mt-1">

                    <!-- Mot de passe Restic (par destination) -->
                    <div class="col-md-5">
                        <label class="form-label">{{ $t('watcher.backup.resticPassword') }}</label>
                        <input v-model="dest.resticPassword" type="password"
                            class="form-control" :placeholder="$t('watcher.backup.resticPasswordPlaceholder')"
                            autocomplete="new-password" />
                        <small class="text-danger">{{ $t('watcher.backup.resticPasswordWarning') }}</small>
                    </div>

                    <!-- ── Config LOCAL ── -->
                    <template v-if="dest.type === 'local'">
                        <div class="col-12">
                            <label class="form-label">{{ $t('watcher.backup.localPath') }}</label>
                            <input v-model="dest.local!.path" type="text"
                                class="form-control" placeholder="/backup" />
                            <p class="form-text mt-1">
                                <font-awesome-icon icon="info-circle" class="me-1" />{{ $t('watcher.backup.volumes.backupVolHint') }}
                            </p>
                        </div>
                    </template>

                    <!-- ── Config SFTP ── -->
                    <template v-if="dest.type === 'sftp'">
                        <div class="col-md-5">
                            <label class="form-label">{{ $t('watcher.backup.sftpHost') }}</label>
                            <input v-model="dest.sftp!.host" type="text"
                                class="form-control" placeholder="192.168.1.100 ou nas.local" />
                        </div>
                        <div class="col-md-2">
                            <label class="form-label">{{ $t('watcher.backup.sftpPort') }}</label>
                            <input v-model.number="dest.sftp!.port" type="number"
                                class="form-control" placeholder="22" />
                        </div>
                        <div class="col-md-5">
                            <label class="form-label">{{ $t('watcher.backup.sftpUser') }}</label>
                            <input v-model="dest.sftp!.user" type="text"
                                class="form-control" placeholder="backup-user" />
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">{{ $t('watcher.backup.sftpRemotePath') }}</label>
                            <input v-model="dest.sftp!.path" type="text"
                                class="form-control" placeholder="/volume1/backups/dockge" />
                        </div>
                        <div class="col-12">
                            <label class="form-label">{{ $t('watcher.backup.sftpAuthMode') }}</label>
                            <div class="d-flex gap-3">
                                <div class="form-check">
                                    <input class="form-check-input" type="radio" :id="`sftpAuthKey${idx}`"
                                        v-model="dest.sftp!.authMode" value="key" />
                                    <label class="form-check-label" :for="`sftpAuthKey${idx}`">
                                        <font-awesome-icon icon="key" class="me-1" />{{ $t('watcher.backup.sftpAuthKey') }}
                                    </label>
                                </div>
                                <div class="form-check">
                                    <input class="form-check-input" type="radio" :id="`sftpAuthPwd${idx}`"
                                        v-model="dest.sftp!.authMode" value="password" />
                                    <label class="form-check-label" :for="`sftpAuthPwd${idx}`">
                                        <font-awesome-icon icon="lock" class="me-1" />{{ $t('watcher.backup.sftpAuthPassword') }}
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div v-if="dest.sftp!.authMode !== 'password'" class="col-md-6">
                            <label class="form-label">{{ $t('watcher.backup.sftpKeyPath') }}</label>
                            <input v-model="dest.sftp!.keyPath" type="text"
                                class="form-control" placeholder="/root/.ssh/id_rsa" />
                            <small class="form-text">{{ $t('watcher.backup.sftpKeyPathHint') }}</small>
                        </div>
                        <div v-if="dest.sftp!.authMode === 'password'" class="col-md-6">
                            <label class="form-label">{{ $t('watcher.backup.sftpSshPassword') }}</label>
                            <input v-model="dest.sftp!.password" type="password"
                                class="form-control" autocomplete="new-password" />
                            <small class="form-text">{{ $t('watcher.backup.sftpSshPasswordHint') }}</small>
                        </div>
                    </template>

                    <!-- ── Config S3 / B2 ── -->
                    <template v-if="dest.type === 's3'">
                        <div class="col-md-6">
                            <label class="form-label">
                                {{ $t('watcher.backup.s3Endpoint') }}
                                <small class="form-text">{{ $t('watcher.backup.s3EndpointHint') }}</small>
                            </label>
                            <input v-model="dest.s3!.endpoint" type="text"
                                class="form-control" placeholder="https://s3.us-west-004.backblazeb2.com" />
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">{{ $t('watcher.backup.s3Bucket') }}</label>
                            <input v-model="dest.s3!.bucket" type="text"
                                class="form-control" placeholder="mon-bucket" />
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">{{ $t('watcher.backup.s3Path') }}</label>
                            <input v-model="dest.s3!.path" type="text"
                                class="form-control" placeholder="dockge/backups" />
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">{{ $t('watcher.backup.s3AccessKey') }}</label>
                            <input v-model="dest.s3!.accessKeyId" type="text"
                                class="form-control" placeholder="AKIAIOSFODNN7EXAMPLE" />
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">{{ $t('watcher.backup.s3SecretKey') }}</label>
                            <input v-model="dest.s3!.secretAccessKey" type="password"
                                class="form-control" autocomplete="new-password" />
                        </div>
                    </template>

                    <!-- ── Config REST ── -->
                    <template v-if="dest.type === 'rest'">
                        <div class="col-md-6">
                            <label class="form-label">{{ $t('watcher.backup.restUrl') }}</label>
                            <input v-model="dest.rest!.url" type="text"
                                class="form-control" placeholder="https://restic.exemple.com/dockge" />
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">{{ $t('watcher.backup.restUser') }}</label>
                            <input v-model="dest.rest!.user" type="text" class="form-control" />
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">{{ $t('watcher.backup.restPassword') }}</label>
                            <input v-model="dest.rest!.password" type="password"
                                class="form-control" autocomplete="new-password" />
                        </div>
                    </template>
                </div>
            </div>

            <!-- Bouton ajouter destination -->
            <button class="btn btn-normal btn-sm mt-1" @click="addDestination">
                <font-awesome-icon icon="plus" class="me-1" />{{ $t('watcher.backup.addDest') }}
            </button>

            <!-- Options communes -->
            <div class="row g-3 mt-2">
                <div class="col-12 d-flex gap-4 flex-wrap">
                    <div class="form-check">
                        <input v-model="settings.includeEnvFiles" type="checkbox"
                            class="form-check-input" id="includeEnv" />
                        <label class="form-check-label" for="includeEnv">
                            <span v-html="$t('watcher.backup.includeEnv')"></span>
                            <small class="form-text">{{ $t('watcher.backup.includeEnvHint') }}</small>
                        </label>
                    </div>
                </div>

            </div>
        </div>

        <!-- ═══ VOLUMES ═══ -->
        <div class="shadow-box mb-4 vol-section" :class="{ collapsed: volumesCollapsed }">
            <!-- Header cliquable -->
            <div class="vol-section-header" @click="toggleVolumes">
                <h5 class="settings-subheading mb-0">
                    <font-awesome-icon icon="hdd" class="me-2" />{{ $t('watcher.backup.volumes.heading') }}
                    <span v-if="volumesCollapsed" class="badge-summary ms-2">
                        <span v-if="volBadge">{{ volBadge }}</span>
                        <span v-else class="text-muted">{{ $t('watcher.backup.volumes.noneSelected') }}</span>
                    </span>
                </h5>
                <font-awesome-icon :icon="volumesCollapsed ? 'chevron-down' : 'chevron-up'" class="chevron-icon" />
            </div>
            <!-- Body -->
            <div v-if="!volumesCollapsed" class="vol-section-body">
                <p class="form-text mb-3">{{ $t('watcher.backup.volumes.hint') }}</p>
                <!-- Chargement des volumes montés -->
                <div v-if="loadingMountedVols" class="text-muted mb-2" style="font-size:.82rem">
                    <span class="spinner-border spinner-border-sm me-1" />{{ $t('watcher.backup.volumes.detecting') }}
                </div>
                <!-- Liste unifiée : /app/data + volumes montés -->
                <div class="vol-list">
                    <div v-for="vol in allBackupVols" :key="vol.destination" class="vol-entry"
                        :class="{ 'vol-entry-active': volState(vol.destination) !== 'none' }">
                        <!-- Ligne principale du volume -->
                        <div class="vol-row" :class="{
                            active: volState(vol.destination) !== 'none',
                            partial: volState(vol.destination) === 'partial'
                        }">
                            <div class="d-flex align-items-center gap-2 flex-grow-1 min-w-0">
                                <input type="checkbox" class="form-check-input flex-shrink-0"
                                    :checked="volState(vol.destination) !== 'none'"
                                    @change="toggleWholeVol(vol.destination)" />
                                <code class="vol-path">{{ vol.destination }}</code>
                                <span v-if="vol.source" class="vol-source text-truncate">{{ vol.source }}</span>
                            </div>
                            <button type="button" class="btn btn-xs btn-normal flex-shrink-0"
                                @click.stop="toggleExpand(vol.destination)"
                                :title="$t('watcher.backup.volumes.browse')">
                                <font-awesome-icon :icon="expandedVols.has(vol.destination) ? 'chevron-up' : 'chevron-down'" />
                            </button>
                        </div>
                        <!-- Panel sous-dossiers -->
                        <div v-if="expandedVols.has(vol.destination)" class="vol-subdirs-panel">
                            <!-- Barre d'actions -->
                            <div class="vol-subdirs-actions">
                                <button type="button" class="btn btn-xs btn-normal"
                                    @click="selectAllDirs(vol.destination)">
                                    {{ $t('watcher.backup.volumes.selectAll') }}
                                </button>
                                <button type="button" class="btn btn-xs btn-normal ms-1"
                                    @click="selectNoneDirs(vol.destination)">
                                    {{ $t('watcher.backup.volumes.selectNone') }}
                                </button>
                                <button type="button" class="btn btn-xs btn-normal ms-2"
                                    @click="loadVolSizes(vol.destination)"
                                    :disabled="loadingVolSizes[vol.destination]">
                                    <span v-if="loadingVolSizes[vol.destination]" class="spinner-border spinner-border-sm me-1" />
                                    <font-awesome-icon v-else icon="weight-hanging" class="me-1" />
                                    {{ $t('watcher.backup.volumes.calcSizes') }}
                                </button>
                            </div>
                            <!-- Chargement dossiers -->
                            <div v-if="loadingVolDirs[vol.destination]"
                                class="text-muted py-2 ps-3" style="font-size:.82rem">
                                <span class="spinner-border spinner-border-sm me-1" />{{ $t('watcher.backup.volumes.loadingDirs') }}
                            </div>
                            <!-- Dossier vide -->
                            <div v-else-if="(volDirs[vol.destination] ?? []).length === 0"
                                class="text-muted py-2 ps-3" style="font-size:.82rem">
                                {{ $t('watcher.backup.volumes.noDirs') }}
                            </div>
                            <!-- Liste des sous-dossiers -->
                            <div v-else class="vol-dir-list">
                                <div v-for="dir in volDirs[vol.destination]" :key="dir"
                                    class="vol-dir-row"
                                    :class="{ active: isSubdirSelected(vol.destination, dir) }"
                                    @click="toggleSubdir(vol.destination, dir)">
                                    <div class="form-check mb-0">
                                        <input type="checkbox" class="form-check-input"
                                            :checked="isSubdirSelected(vol.destination, dir)"
                                            @click.stop="toggleSubdir(vol.destination, dir)" />
                                        <label class="form-check-label" @click.stop="toggleSubdir(vol.destination, dir)">
                                            <code class="vol-path">{{ dir }}</code>
                                        </label>
                                    </div>
                                    <span v-if="volSizes[vol.destination + '/' + dir]" class="vol-size">
                                        <font-awesome-icon icon="weight-hanging" class="me-1 text-muted" />{{ volSizes[vol.destination + '/' + dir] }}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ═══ RÉTENTION ═══ -->
        <div class="shadow-box big-padding mb-4">
            <h5 class="settings-subheading mb-3">
                <font-awesome-icon icon="history" class="me-2" />{{ $t('watcher.backup.retention.heading') }}
            </h5>
            <div class="row g-3">
                <div class="col-md-3">
                    <label class="form-label">{{ $t('watcher.backup.retention.keepLast') }}</label>
                    <input v-model.number="settings.retention.keepLast" type="number"
                        class="form-control" min="1" max="100" />
                </div>
                <div class="col-md-3">
                    <label class="form-label">{{ $t('watcher.backup.retention.keepDaily') }}</label>
                    <input v-model.number="settings.retention.keepDaily" type="number"
                        class="form-control" min="0" />
                </div>
                <div class="col-md-3">
                    <label class="form-label">{{ $t('watcher.backup.retention.keepWeekly') }}</label>
                    <input v-model.number="settings.retention.keepWeekly" type="number"
                        class="form-control" min="0" />
                </div>
                <div class="col-md-3">
                    <label class="form-label">{{ $t('watcher.backup.retention.keepMonthly') }}</label>
                    <input v-model.number="settings.retention.keepMonthly" type="number"
                        class="form-control" min="0" />
                </div>
            </div>
            <small class="form-text mt-2 d-block">{{ $t('watcher.backup.retention.hint') }}</small>
        </div>

        <!-- ═══ ACTIONS ═══ -->
        <div class="d-flex gap-2 flex-wrap mb-4">
            <button class="btn btn-primary" @click="save" :disabled="saving">
                <span v-if="saving" class="spinner-border spinner-border-sm me-1" />
                <font-awesome-icon v-else icon="save" class="me-1" />{{ $t('watcher.backup.saveConfig') }}
            </button>
            <button class="btn btn-normal" @click="initRepo" :disabled="initing">
                <span v-if="initing" class="spinner-border spinner-border-sm me-1" />
                <font-awesome-icon v-else icon="database" class="me-1" />{{ $t('watcher.backup.initRepo') }}
            </button>
            <button class="btn btn-success" @click="runBackup" :disabled="running">
                <span v-if="running" class="spinner-border spinner-border-sm me-1" />
                <font-awesome-icon v-else icon="cloud-upload-alt" class="me-1" />{{ $t('watcher.backup.runNow') }}
            </button>
            <button class="btn btn-normal" @click="loadSnapshots" :disabled="loadingSnaps">
                <span v-if="loadingSnaps" class="spinner-border spinner-border-sm me-1" />
                <font-awesome-icon v-else icon="sync" class="me-1" />{{ $t('watcher.backup.refreshSnapshots') }}
            </button>
            <button class="btn btn-normal" @click="checkIntegrity" :disabled="checking">
                <span v-if="checking" class="spinner-border spinner-border-sm me-1" />
                <font-awesome-icon v-else icon="shield-alt" class="me-1" />
                {{ checking ? $t('watcher.backup.checkRunning') : $t('watcher.backup.checkIntegrity') }}
            </button>
        </div>

        <!-- ═══ CHECK RESULTS ═══ -->
        <div v-if="checkResults.length > 0" class="mb-4">
            <div v-for="r in checkResults" :key="r.destIndex"
                class="shadow-box big-padding mb-2"
                :style="r.ok ? 'border-left: 3px solid #22c55e' : 'border-left: 3px solid #ef4444'">
                <div class="d-flex align-items-center gap-2 mb-1">
                    <strong>{{ r.ok ? $t('watcher.backup.checkOk') : $t('watcher.backup.checkFail') }}</strong>
                    <span class="form-text">— {{ r.label }}</span>
                </div>
                <pre class="small form-text mb-0" style="white-space:pre-wrap;max-height:200px;overflow-y:auto">{{ r.output }}</pre>
            </div>
        </div>

        <!-- ═══ HISTORIQUE ═══ -->
        <div class="shadow-box big-padding mb-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h5 class="settings-subheading mb-0">
                    <font-awesome-icon icon="chart-line" class="me-2" />{{ $t('watcher.backup.history.heading') }}
                </h5>
                <small v-if="nextBackupDate" class="form-text">
                    <font-awesome-icon icon="clock" class="me-1" />
                    Prochain backup : {{ fmtDate(nextBackupDate) }}
                </small>
            </div>
            <div v-if="history.length === 0" class="text-center form-text fst-italic py-3">
                {{ $t('watcher.backup.history.none') }}
            </div>
            <div v-else class="table-responsive">
                <table class="table table-hover mb-0 table-sm">
                    <thead>
                        <tr>
                            <th>{{ $t('watcher.backup.history.date') }}</th>
                            <th>{{ $t('watcher.backup.history.status') }}</th>
                            <th>{{ $t('watcher.backup.history.snapshot') }}</th>
                            <th>{{ $t('watcher.backup.history.dataAdded') }}</th>
                            <th>{{ $t('watcher.backup.history.files') }}</th>
                            <th>{{ $t('watcher.backup.history.duration') }}</th>
                            <th>{{ $t('watcher.backup.history.warnings') }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(h, i) in history" :key="i" :class="h.success ? 'history-row-ok' : 'history-row-err'">
                            <td class="small form-text">{{ fmtDate(h.timestamp) }}</td>
                            <td>
                                <span v-if="h.success" class="badge bg-success">✓ OK</span>
                                <span v-else class="badge bg-danger" :title="h.error">✗ {{ $t('watcher.status.error') }}</span>
                            </td>
                            <td><code class="small">{{ h.snapshotId ?? "—" }}</code></td>
                            <td class="small">{{ h.dataAdded ? formatBytes(h.dataAdded) : "—" }}</td>
                            <td class="small form-text">
                                {{ h.filesNew ?? 0 }} {{ $t('watcher.backup.history.new') }} ·
                                {{ h.filesChanged ?? 0 }} {{ $t('watcher.backup.history.modified') }}
                            </td>
                            <td class="small form-text">{{ formatDuration(h.duration) }}</td>
                            <td class="small">
                                <span v-if="h.warnings?.length" class="badge bg-warning text-dark"
                                    :title="h.warnings.join('\\n')">
                                    {{ h.warnings.length }}
                                </span>
                                <span v-else class="form-text">—</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- ═══ SNAPSHOTS RESTIC ═══ -->
        <div class="shadow-box big-padding mb-4">
            <h5 class="settings-subheading mb-3">
                <font-awesome-icon icon="camera" class="me-2" />{{ $t('watcher.backup.snapshots.heading') }}
            </h5>
            <div v-if="snapshots.length === 0" class="text-center form-text fst-italic py-3">
                {{ $t('watcher.backup.snapshots.none') }}
            </div>
            <div v-else class="table-responsive">
                <table class="table table-hover mb-0 table-sm">
                    <thead>
                        <tr>
                            <th style="width:1rem"></th>
                            <th>{{ $t('watcher.backup.snapshots.id') }}</th>
                            <th>{{ $t('watcher.backup.snapshots.date') }}</th>
                            <th>{{ $t('watcher.backup.snapshots.tags') }}</th>
                            <th>{{ $t('watcher.backup.snapshots.paths') }}</th>
                            <th>{{ $t('watcher.backup.snapshots.size') }}</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        <template v-for="snap in snapshots" :key="snap.id">
                            <!-- Ligne principale du snapshot -->
                            <tr class="snapshot-row" @click="toggleSnapshotFiles(snap.short_id)"
                                style="cursor:pointer">
                                <td>
                                    <font-awesome-icon
                                        :icon="expandedSnapshot === snap.short_id ? 'chevron-down' : 'chevron-right'"
                                        class="text-muted" style="font-size:.75rem" />
                                </td>
                                <td><code>{{ snap.short_id }}</code></td>
                                <td class="small form-text">{{ fmtDate(snap.time) }}</td>
                                <td>
                                    <span v-for="tag in (snap.tags ?? [])" :key="tag"
                                        class="badge bg-secondary me-1 small">{{ tag }}</span>
                                </td>
                                <td class="small form-text">{{ snap.paths.length }} {{ $t('watcher.backup.snapshots.path') }}</td>
                                <td class="small form-text">
                                    {{ snapshotSizeMap.has(snap.short_id) ? formatBytes(snapshotSizeMap.get(snap.short_id)!) : '—' }}
                                </td>
                                <td class="text-end" @click.stop>
                                    <button class="btn btn-sm btn-outline-danger"
                                        @click="deleteSnapshot(snap.short_id)"
                                        :title="`${$t('watcher.backup.snapshots.deleteConfirm', [snap.short_id])}`">
                                        <font-awesome-icon icon="trash" />
                                    </button>
                                </td>
                            </tr>

                            <!-- Ligne expandable : liste des fichiers -->
                            <tr v-if="expandedSnapshot === snap.short_id" class="snapshot-files-row">
                                <td colspan="7" class="p-0">
                                    <div class="snapshot-files-panel px-4 py-3">

                                        <!-- Loading -->
                                        <div v-if="loadingFiles" class="text-center form-text py-2">
                                            <span class="spinner-border spinner-border-sm me-2" />
                                            {{ $t('watcher.backup.snapshots.loading') }}
                                        </div>

                                        <!-- Aucun fichier -->
                                        <div v-else-if="snapshotFiles.length === 0"
                                            class="form-text fst-italic">
                                            {{ $t('watcher.backup.snapshots.noFiles') }}
                                        </div>

                                        <!-- Arborescence par stack -->
                                        <template v-else>
                                            <div class="d-flex align-items-center justify-content-between mb-3">
                                                <div class="d-flex align-items-center gap-2">
                                                    <input type="checkbox" class="form-check-input"
                                                        :checked="selectedFiles.size === snapshotFiles.length"
                                                        @change="toggleSelectAll"
                                                        :title="$t('watcher.backup.snapshots.selectAll')" />
                                                    <small class="form-text">
                                                        {{ selectedFiles.size }}/{{ snapshotFiles.length }} {{ $t('watcher.backup.snapshots.selected') }}
                                                    </small>
                                                </div>
                                                <button class="btn btn-sm btn-warning"
                                                    :disabled="selectedFiles.size === 0 || restoring"
                                                    @click="restoreSelected(snap.short_id)">
                                                    <span v-if="restoring" class="spinner-border spinner-border-sm me-1" />
                                                    <font-awesome-icon v-else icon="undo" class="me-1" />
                                                    {{ $t('watcher.backup.snapshots.restoreSelected') }}
                                                </button>
                                            </div>

                                            <div class="snap-tree">
                                                <div v-for="sg in stackGroups" :key="sg.name" class="snap-stack">

                                                    <!-- En-tête de stack (cliquable) -->
                                                    <div class="snap-stack-header" @click="toggleStack(sg.name)">
                                                        <input type="checkbox" class="form-check-input flex-shrink-0" @click.stop
                                                            :checked="isStackAllSelected(sg)"
                                                            :indeterminate.prop="isStackPartialSelected(sg)"
                                                            @change.stop="toggleStackSelect(sg)" />
                                                        <font-awesome-icon
                                                            :icon="expandedStacks.has(sg.name) ? 'chevron-down' : 'chevron-right'"
                                                            class="snap-chevron" />
                                                        <code class="snap-stack-name">{{ sg.name }}</code>
                                                        <span class="snap-count">{{ sg.totalCount }}</span>
                                                        <button class="btn btn-xs btn-warning ms-auto flex-shrink-0"
                                                            :disabled="restoring"
                                                            @click.stop="restoreStack(snap.short_id, sg)"
                                                            :title="$t('watcher.backup.snapshots.restoreStack')">
                                                            <font-awesome-icon icon="undo" />
                                                        </button>
                                                    </div>

                                                    <!-- Contenu de la stack -->
                                                    <div v-if="expandedStacks.has(sg.name)" class="snap-stack-body">

                                                        <!-- Fichiers directs (compose, env, other) -->
                                                        <div v-for="f in sg.directFiles" :key="f.path"
                                                            class="snap-file-row"
                                                            :class="{ 'opacity-50': f.diskStatus === 'missing' }">
                                                            <input type="checkbox" class="form-check-input flex-shrink-0"
                                                                :checked="selectedFiles.has(f.path)"
                                                                @change="toggleFile(f.path)" />
                                                            <font-awesome-icon :icon="fileIcon(f)" class="snap-file-icon" />
                                                            <span class="snap-filename">{{ f.name }}</span>
                                                            <span v-if="f.services?.length" class="snap-services">
                                                                <span v-for="svc in f.services" :key="svc"
                                                                    class="badge bg-dark" style="font-size:.68rem">{{ svc }}</span>
                                                            </span>
                                                            <span v-if="f.aliases?.length"
                                                                class="badge bg-secondary snap-alias"
                                                                :title="f.aliases!.join('\n')">
                                                                {{ $t('watcher.backup.snapshots.aliases', [f.aliases!.length]) }}
                                                            </span>
                                                            <button v-if="f.type === 'compose' || f.type === 'env'"
                                                                class="btn btn-xs btn-normal flex-shrink-0 snap-preview-btn"
                                                                @click.stop="openPreview(snap.short_id, f)"
                                                                :title="$t('watcher.backup.snapshots.preview')">
                                                                <font-awesome-icon icon="eye" />
                                                            </button>
                                                            <div class="snap-badges">
                                                                <span v-if="f.prevSnapshotId === null" class="badge bg-secondary">{{ $t('watcher.backup.snapshots.firstSnapshot') }}</span>
                                                                <span v-else-if="f.snapDiff === 'added'" class="badge bg-success">{{ $t('watcher.backup.snapshots.diffAdded') }}</span>
                                                                <span v-else-if="f.snapDiff === 'modified'" class="badge bg-warning text-dark">{{ $t('watcher.backup.snapshots.diffModified') }}</span>
                                                                <span v-else class="badge bg-secondary opacity-50">{{ $t('watcher.backup.snapshots.diffUnchanged') }}</span>
                                                                <span v-if="f.diskStatus === 'unchanged'" class="badge bg-success">{{ $t('watcher.backup.snapshots.diskUnchanged') }}</span>
                                                                <span v-else-if="f.diskStatus === 'modified'" class="badge bg-warning text-dark">{{ $t('watcher.backup.snapshots.diskModified') }}</span>
                                                                <span v-else class="badge bg-secondary">{{ $t('watcher.backup.snapshots.diskMissing') }}</span>
                                                            </div>
                                                        </div>

                                                        <!-- Fichiers de volume directement dans le volume (sans sous-dossier) -->
                                                        <div v-for="f in sg.volRootFiles" :key="f.path"
                                                            class="snap-file-row"
                                                            :class="{ 'opacity-50': f.diskStatus === 'missing' }">
                                                            <input type="checkbox" class="form-check-input flex-shrink-0"
                                                                :checked="selectedFiles.has(f.path)"
                                                                @change="toggleFile(f.path)" />
                                                            <font-awesome-icon icon="hdd" class="snap-file-icon" />
                                                            <span class="snap-filename">{{ volFileInnerPath(f) }}</span>
                                                            <div class="snap-badges">
                                                                <span v-if="f.prevSnapshotId === null" class="badge bg-secondary">{{ $t('watcher.backup.snapshots.firstSnapshot') }}</span>
                                                                <span v-else-if="f.snapDiff === 'added'" class="badge bg-success">{{ $t('watcher.backup.snapshots.diffAdded') }}</span>
                                                                <span v-else-if="f.snapDiff === 'modified'" class="badge bg-warning text-dark">{{ $t('watcher.backup.snapshots.diffModified') }}</span>
                                                                <span v-else class="badge bg-secondary opacity-50">{{ $t('watcher.backup.snapshots.diffUnchanged') }}</span>
                                                                <span v-if="f.diskStatus === 'unchanged'" class="badge bg-success">{{ $t('watcher.backup.snapshots.diskUnchanged') }}</span>
                                                                <span v-else-if="f.diskStatus === 'modified'" class="badge bg-warning text-dark">{{ $t('watcher.backup.snapshots.diskModified') }}</span>
                                                                <span v-else class="badge bg-secondary">{{ $t('watcher.backup.snapshots.diskMissing') }}</span>
                                                            </div>
                                                        </div>

                                                        <!-- Dossiers de volume (tiroirs) -->
                                                        <div v-for="folder in sg.volFolders" :key="folder.name" class="snap-folder">

                                                            <!-- En-tête du dossier (cliquable) -->
                                                            <div class="snap-folder-header" @click="toggleFolder(sg.name, folder.name)">
                                                                <input type="checkbox" class="form-check-input flex-shrink-0" @click.stop
                                                                    :checked="isFolderAllSelected(folder)"
                                                                    :indeterminate.prop="isFolderPartialSelected(folder)"
                                                                    @change.stop="toggleFolderSelect(folder)" />
                                                                <font-awesome-icon
                                                                    :icon="expandedFolders.has(sg.name + '::' + folder.name) ? 'folder-open' : 'folder'"
                                                                    class="snap-folder-icon" />
                                                                <span class="snap-foldername">{{ folder.name }}/</span>
                                                                <span class="snap-count">{{ folder.files.length }}</span>
                                                            </div>

                                                            <!-- Fichiers du dossier -->
                                                            <div v-if="expandedFolders.has(sg.name + '::' + folder.name)" class="snap-folder-body">
                                                                <div v-for="f in folder.files" :key="f.path"
                                                                    class="snap-file-row snap-file-in-folder"
                                                                    :class="{ 'opacity-50': f.diskStatus === 'missing' }">
                                                                    <input type="checkbox" class="form-check-input flex-shrink-0"
                                                                        :checked="selectedFiles.has(f.path)"
                                                                        @change="toggleFile(f.path)" />
                                                                    <font-awesome-icon icon="hdd" class="snap-file-icon" />
                                                                    <span class="snap-filename">{{ volFileInFolder(f, folder.name) }}</span>
                                                                    <div class="snap-badges">
                                                                        <span v-if="f.prevSnapshotId === null" class="badge bg-secondary">{{ $t('watcher.backup.snapshots.firstSnapshot') }}</span>
                                                                        <span v-else-if="f.snapDiff === 'added'" class="badge bg-success">{{ $t('watcher.backup.snapshots.diffAdded') }}</span>
                                                                        <span v-else-if="f.snapDiff === 'modified'" class="badge bg-warning text-dark">{{ $t('watcher.backup.snapshots.diffModified') }}</span>
                                                                        <span v-else class="badge bg-secondary opacity-50">{{ $t('watcher.backup.snapshots.diffUnchanged') }}</span>
                                                                        <span v-if="f.diskStatus === 'unchanged'" class="badge bg-success">{{ $t('watcher.backup.snapshots.diskUnchanged') }}</span>
                                                                        <span v-else-if="f.diskStatus === 'modified'" class="badge bg-warning text-dark">{{ $t('watcher.backup.snapshots.diskModified') }}</span>
                                                                        <span v-else class="badge bg-secondary">{{ $t('watcher.backup.snapshots.diskMissing') }}</span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                        </div>

                                                    </div>
                                                </div>
                                            </div>
                                        </template>
                                    </div>
                                </td>
                            </tr>
                        </template>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- ═══ MODAL APERÇU / DIFF ═══ -->
        <Teleport to="body">
            <div v-if="preview.open" class="preview-overlay" @click.self="preview.open = false">
                <div class="preview-modal">

                    <!-- En-tête -->
                    <div class="preview-header">
                        <code class="preview-filename">{{ preview.fileName }}</code>
                        <div class="preview-tabs">
                            <button :class="['preview-tab-btn', preview.tab === 'preview' && 'active']"
                                @click="preview.tab = 'preview'">
                                <font-awesome-icon icon="eye" class="me-1" />{{ $t('watcher.backup.snapshots.previewTab') }}
                            </button>
                            <button :class="['preview-tab-btn', preview.tab === 'diff' && 'active']"
                                :disabled="preview.loading || !preview.diskContent"
                                @click="preview.tab = 'diff'">
                                <font-awesome-icon icon="code-branch" class="me-1" />{{ $t('watcher.backup.snapshots.diffTab') }}
                            </button>
                        </div>
                        <button class="preview-close-btn" @click="preview.open = false">
                            <font-awesome-icon icon="times" />
                        </button>
                    </div>

                    <!-- Chargement -->
                    <div v-if="preview.loading" class="preview-loading">
                        <span class="spinner-border spinner-border-sm me-2" />{{ $t('watcher.backup.snapshots.loading') }}
                    </div>

                    <!-- Corps -->
                    <div v-else class="preview-body">

                        <!-- Onglet Aperçu -->
                        <pre v-if="preview.tab === 'preview'" class="preview-code">{{ preview.snapshotContent }}</pre>

                        <!-- Onglet Diff -->
                        <div v-else class="diff-view">
                            <div v-if="!preview.diskContent" class="form-text fst-italic p-3">
                                {{ $t('watcher.backup.snapshots.diffMissing') }}
                            </div>
                            <template v-else>
                                <div class="diff-legend">
                                    <span class="diff-leg-rm">− {{ $t('watcher.backup.snapshots.diffLegendSnapshot') }}</span>
                                    <span class="diff-leg-add">+ {{ $t('watcher.backup.snapshots.diffLegendDisk') }}</span>
                                    <span v-if="diffResult.every(l => l.type === 'same')" class="diff-leg-ok">
                                        ✓ {{ $t('watcher.backup.snapshots.diffIdentical') }}
                                    </span>
                                </div>
                                <div class="diff-lines">
                                    <div v-for="(ln, i) in diffResult" :key="i"
                                        :class="['diff-line', `diff-${ln.type}`]">
                                        <span class="diff-lnum">{{ i + 1 }}</span>
                                        <span class="diff-marker">{{ ln.type === 'removed' ? '−' : ln.type === 'added' ? '+' : ' ' }}</span>
                                        <span class="diff-text">{{ ln.line }}</span>
                                    </div>
                                </div>
                            </template>
                        </div>

                    </div>
                </div>
            </div>
        </Teleport>

        <!-- TOAST -->
        <Transition name="slide-fade">
            <div v-if="toast.msg" class="toast-float" :class="toast.ok ? 'toast-ok' : 'toast-err'">
                {{ toast.msg }}
            </div>
        </Transition>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n/dist/vue-i18n.esm-browser.prod.js";
import { initServerTz, fmtDate } from "../composables/useServerTz";

const { t } = useI18n();

// ─── Types ────────────────────────────────────────────────────────

interface LocalConfig { path: string }
interface SftpConfig { host: string; port: number; user: string; path: string; authMode: "key" | "password"; keyPath?: string; password?: string }
interface S3Config { endpoint?: string; bucket: string; path: string; accessKeyId: string; secretAccessKey: string }
interface RestConfig { url: string; user?: string; password?: string }
interface Destination {
    label: string;
    enabled: boolean;
    type: "local" | "sftp" | "s3" | "rest";
    resticPassword: string;
    local?: LocalConfig;
    sftp?: SftpConfig;
    s3?: S3Config;
    rest?: RestConfig;
}
interface Retention { keepLast: number; keepDaily: number; keepWeekly: number; keepMonthly: number }
interface VolumeBackupConfig { selectedVolumes: string[] }
interface MountedVolume { source: string; destination: string }
interface Settings { enabled: boolean; intervalHours: number; destinations: Destination[]; retention: Retention; includeEnvFiles: boolean; discordWebhooks?: string[]; notificationLang?: "fr" | "en"; volumeBackup: VolumeBackupConfig; extraPaths?: string[]; backupOnSave: boolean }
interface Snapshot { id: string; short_id: string; time: string; tags?: string[]; paths: string[] }
interface SnapshotFile {
    path: string; name: string; stack: string; type: "compose" | "env" | "volume" | "other";
    relativePath?: string;
    services?: string[];
    aliases?: string[];
    size: number; mtime: string;
    diskStatus: "unchanged" | "modified" | "missing";
    snapDiff:   "added" | "modified" | "unchanged";
    prevSnapshotId: string | null;
}
interface BackupResult { success: boolean; snapshotId?: string; duration: number; dataAdded?: number; filesNew?: number; filesChanged?: number; error?: string; warnings?: string[]; timestamp: string }
interface DiffLine { type: "same" | "added" | "removed"; line: string }

// ─── State ────────────────────────────────────────────────────────

const DEFAULT_DEST = (): Destination => ({
    label: "Local",
    enabled: true,
    type: "local",
    resticPassword: "",
    local: { path: "/app/data/backups" },
    sftp: { host: "", port: 22, user: "", path: "", authMode: "key" },
    s3: { endpoint: "", bucket: "", path: "dockge", accessKeyId: "", secretAccessKey: "" },
    rest: { url: "", user: "", password: "" },
});

const settings = ref<Settings>({
    enabled: false,
    intervalHours: 24,
    destinations: [DEFAULT_DEST()],
    retention: { keepLast: 10, keepDaily: 7, keepWeekly: 4, keepMonthly: 3 },
    includeEnvFiles: true,
    volumeBackup: { selectedVolumes: [] },
    extraPaths: [],
    backupOnSave: true,
});

const mountedVols = ref<MountedVolume[]>([]);
const loadingMountedVols = ref(false);
const expandedVols = ref<Set<string>>(new Set());
const volDirs = ref<Record<string, string[]>>({});
const volSizes = ref<Record<string, string>>({});
const loadingVolDirs = ref<Record<string, boolean>>({});
const loadingVolSizes = ref<Record<string, boolean>>({});

const APP_DATA = "/app/data";

// Tous les volumes affichables : /app/data en premier, puis les volumes montés détectés
const allBackupVols = computed<MountedVolume[]>(() => [
    { destination: APP_DATA, source: "" },
    ...mountedVols.value,
]);

// Badge résumé pour le header rétractable
const volBadge = computed(() => {
    const sel = settings.value.volumeBackup.selectedVolumes;
    if (sel.length === 0) return null;
    const allPaths = allBackupVols.value.map(v => v.destination);
    const tops = new Set(sel.map(p => allPaths.find(v => p === v || p.startsWith(v + "/")) ?? p));
    const parts: string[] = [];
    if (tops.has(APP_DATA)) parts.push("/app/data");
    const others = [...tops].filter(v => v !== APP_DATA).length;
    if (others > 0) parts.push(`${others} vol.`);
    return parts.join(" · ") || null;
});
const volumesCollapsed = ref(localStorage.getItem("backupVolumesCollapsed") === "1");
function toggleVolumes() {
    volumesCollapsed.value = !volumesCollapsed.value;
    localStorage.setItem("backupVolumesCollapsed", volumesCollapsed.value ? "1" : "0");
}
const expandedDest = ref<number>(0);
const snapshots = ref<Snapshot[]>([]);
const history = ref<BackupResult[]>([]);

const saving = ref(false);
const initing = ref(false);
const running = ref(false);
const loadingSnaps = ref(false);
const checking = ref(false);
type CheckResult = { destIndex: number; label: string; ok: boolean; output: string };
const checkResults = ref<CheckResult[]>([]);
const expandedSnapshot  = ref<string | null>(null);
const snapshotFiles     = ref<SnapshotFile[]>([]);
const selectedFiles     = ref<Set<string>>(new Set());
const loadingFiles      = ref(false);
const restoring         = ref(false);
const preview = ref({
    open: false,
    snapId: "",
    filePath: "",
    fileName: "",
    snapshotContent: "",
    diskContent: null as string | null,
    loading: false,
    tab: "preview" as "preview" | "diff",
});
const expandedStacks    = ref<Set<string>>(new Set());
const expandedFolders   = ref<Set<string>>(new Set());
const toast = ref({ msg: "", ok: true });

function addDestination() {
    const d = DEFAULT_DEST();
    d.label = `Destination ${settings.value.destinations.length + 1}`;
    settings.value.destinations.push(d);
    expandedDest.value = settings.value.destinations.length - 1;
}
function removeDestination(idx: number) {
    if (settings.value.destinations.length <= 1) return;
    settings.value.destinations.splice(idx, 1);
    if (expandedDest.value >= settings.value.destinations.length) {
        expandedDest.value = settings.value.destinations.length - 1;
    }
}
function toggleDest(idx: number) {
    expandedDest.value = expandedDest.value === idx ? -1 : idx;
}
function onDestTypeChange(dest: Destination) {
    if (!dest.local) dest.local = { path: "/app/data/backups" };
    if (!dest.sftp)  dest.sftp  = { host: "", port: 22, user: "", path: "", authMode: "key" };
    if (!dest.s3)    dest.s3    = { endpoint: "", bucket: "", path: "dockge", accessKeyId: "", secretAccessKey: "" };
    if (!dest.rest)  dest.rest  = { url: "", user: "", password: "" };
}

function fileIcon(file: SnapshotFile): string {
    if (file.type === "compose") return "file-code";
    if (file.type === "env") return "key";
    if (file.type === "volume") return "hdd";
    return "file-code";
}

// ─── Arborescence des fichiers d'un snapshot ─────────────────────

interface VolFolder  { name: string; files: SnapshotFile[] }
interface StackGroup { name: string; directFiles: SnapshotFile[]; volRootFiles: SnapshotFile[]; volFolders: VolFolder[]; totalCount: number }

const stackGroups = computed<StackGroup[]>(() => {
    const map = new Map<string, StackGroup>();
    for (const f of snapshotFiles.value) {
        if (!map.has(f.stack))
            map.set(f.stack, { name: f.stack, directFiles: [], volRootFiles: [], volFolders: [], totalCount: 0 });
        const sg = map.get(f.stack)!;
        sg.totalCount++;
        if (f.type !== "volume" || !f.relativePath) {
            sg.directFiles.push(f);
        } else {
            const sep = f.relativePath.indexOf("/");
            const innerPath = sep >= 0 ? f.relativePath.slice(sep + 1) : "";
            if (!innerPath || !innerPath.includes("/")) {
                sg.volRootFiles.push(f);
            } else {
                const topDir = innerPath.split("/")[0];
                let folder = sg.volFolders.find(vf => vf.name === topDir);
                if (!folder) { folder = { name: topDir, files: [] }; sg.volFolders.push(folder); }
                folder.files.push(f);
            }
        }
    }
    return [...map.values()];
});

function volFileInnerPath(f: SnapshotFile): string {
    if (!f.relativePath) return f.name;
    const sep = f.relativePath.indexOf("/");
    return sep >= 0 ? f.relativePath.slice(sep + 1) : f.name;
}
function volFileInFolder(f: SnapshotFile, folderName: string): string {
    const inner = volFileInnerPath(f);
    return inner.startsWith(folderName + "/") ? inner.slice(folderName.length + 1) : inner;
}
function toggleStack(name: string) {
    const s = new Set(expandedStacks.value);
    s.has(name) ? s.delete(name) : s.add(name);
    expandedStacks.value = s;
}
function toggleFolder(stackName: string, folderName: string) {
    const key = `${stackName}::${folderName}`;
    const s = new Set(expandedFolders.value);
    s.has(key) ? s.delete(key) : s.add(key);
    expandedFolders.value = s;
}
function getAllStackFiles(sg: StackGroup): SnapshotFile[] {
    return [...sg.directFiles, ...sg.volRootFiles, ...sg.volFolders.flatMap(vf => vf.files)];
}
function isStackAllSelected(sg: StackGroup): boolean {
    const all = getAllStackFiles(sg);
    return all.length > 0 && all.every(f => selectedFiles.value.has(f.path));
}
function isStackPartialSelected(sg: StackGroup): boolean {
    const all = getAllStackFiles(sg);
    const n = all.filter(f => selectedFiles.value.has(f.path)).length;
    return n > 0 && n < all.length;
}
function toggleStackSelect(sg: StackGroup) {
    const all = getAllStackFiles(sg);
    const s = new Set(selectedFiles.value);
    isStackAllSelected(sg) ? all.forEach(f => s.delete(f.path)) : all.forEach(f => s.add(f.path));
    selectedFiles.value = s;
}
function isFolderAllSelected(folder: VolFolder): boolean {
    return folder.files.length > 0 && folder.files.every(f => selectedFiles.value.has(f.path));
}
function isFolderPartialSelected(folder: VolFolder): boolean {
    const n = folder.files.filter(f => selectedFiles.value.has(f.path)).length;
    return n > 0 && n < folder.files.length;
}
function toggleFolderSelect(folder: VolFolder) {
    const s = new Set(selectedFiles.value);
    isFolderAllSelected(folder)
        ? folder.files.forEach(f => s.delete(f.path))
        : folder.files.forEach(f => s.add(f.path));
    selectedFiles.value = s;
}

// ─── Aperçu / Diff ───────────────────────────────────────────────

function diffLines(aText: string, bText: string): DiffLine[] {
    const a = aText.split("\n");
    const b = bText.split("\n");
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    const result: DiffLine[] = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
            result.unshift({ type: "same", line: a[i - 1] });
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            result.unshift({ type: "added", line: b[j - 1] });
            j--;
        } else {
            result.unshift({ type: "removed", line: a[i - 1] });
            i--;
        }
    }
    return result;
}

async function openPreview(snapId: string, f: SnapshotFile) {
    preview.value = {
        open: true, snapId, filePath: f.path, fileName: f.name,
        snapshotContent: "", diskContent: null, loading: true, tab: "preview",
    };
    try {
        const res = await api("GET", `/backup/snapshots/${snapId}/file-content?path=${encodeURIComponent(f.path)}`);
        if (res.ok) {
            preview.value.snapshotContent = res.data.snapshot ?? "";
            preview.value.diskContent     = res.data.disk ?? null;
        } else {
            showToast(`❌ ${res.message}`, false);
            preview.value.open = false;
        }
    } finally {
        preview.value.loading = false;
    }
}

// ─── Helpers ─────────────────────────────────────────────────────

function formatBytes(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
    if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
    return `${(b / 1024 ** 3).toFixed(2)} GB`;
}
function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}
function showToast(msg: string, ok = true) {
    toast.value = { msg, ok };
    setTimeout(() => (toast.value.msg = ""), 3500);
}

const API = "/api/watcher";
async function api(method: string, path: string, body?: unknown) {
    const token = localStorage.getItem("token") ?? "";
    const res = await fetch(API + path, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return res.json();
}

// ─── Helpers ──────────────────────────────────────────────────────

/** Fusionne les settings chargés depuis le serveur en préservant
 *  les sous-objets destination (sftp/s3/rest) qui peuvent être absents
 *  du fichier sauvegardé si on n'a configuré que "local". */
function mergeSettings(loaded: Partial<Settings>): Settings {
    const loadedDests: Destination[] = loaded.destinations ?? [];
    const merged = loadedDests.map((d, idx) => {
        const def = settings.value.destinations[idx] ?? DEFAULT_DEST();
        const dest: Destination = { ...def, ...d };
        // Migration authMode
        if (dest.sftp && !dest.sftp.authMode) {
            dest.sftp.authMode = dest.sftp.keyPath ? "key" : "password";
        }
        // Assure que les sous-objets de config existent
        if (!dest.local) dest.local = { path: "/app/data/backups" };
        if (!dest.sftp)  dest.sftp  = { host: "", port: 22, user: "", path: "", authMode: "key" };
        if (!dest.s3)    dest.s3    = { endpoint: "", bucket: "", path: "dockge", accessKeyId: "", secretAccessKey: "" };
        if (!dest.rest)  dest.rest  = { url: "", user: "", password: "" };
        return dest;
    });
    return {
        ...settings.value,
        ...loaded,
        destinations: merged.length > 0 ? merged : [DEFAULT_DEST()],
        volumeBackup: {
            // Migration : si l'ancienne config avait includeAppData=true, l'ajouter à selectedVolumes
            selectedVolumes: (() => {
                const sel: string[] = loaded.volumeBackup?.selectedVolumes ?? [];
                if ((loaded.volumeBackup as any)?.includeAppData && !sel.includes(APP_DATA)) {
                    return [APP_DATA, ...sel];
                }
                return sel;
            })(),
        } as VolumeBackupConfig,
    };
}

// ─── Computed ─────────────────────────────────────────────────────

const nextBackupDate = computed(() => {
    if (!settings.value.enabled || history.value.length === 0) return null;
    const last = new Date(history.value[0].timestamp).getTime();
    return new Date(last + settings.value.intervalHours * 3_600_000);
});

const isBackupStale = computed(() => {
    if (!settings.value.enabled) return false;
    const lastSuccess = history.value.find(h => h.success);
    if (!lastSuccess) return false;
    return Date.now() - new Date(lastSuccess.timestamp).getTime() > 2 * (settings.value.intervalHours ?? 24) * 3_600_000;
});

const diffResult = computed<DiffLine[]>(() => {
    if (!preview.value.diskContent || !preview.value.snapshotContent) return [];
    return diffLines(preview.value.snapshotContent, preview.value.diskContent);
});

const snapshotSizeMap = computed(() => {
    const map = new Map<string, number>();
    for (const h of history.value) {
        if (h.snapshotId && h.dataAdded != null) {
            map.set(h.snapshotId.slice(0, 8), h.dataAdded);
        }
    }
    return map;
});

// ─── Init ─────────────────────────────────────────────────────────

async function loadMountedVols() {
    loadingMountedVols.value = true;
    try {
        const res = await api("GET", "/backup/mounted-volumes");
        if (res.ok) mountedVols.value = res.data as MountedVolume[];
    } finally {
        loadingMountedVols.value = false;
    }
}

// ── Sélection volumes ───────────────────────────────────────────

function volState(volPath: string): "none" | "all" | "partial" {
    const sel = settings.value.volumeBackup.selectedVolumes;
    if (sel.includes(volPath)) return "all";
    if (sel.some(p => p.startsWith(volPath + "/"))) return "partial";
    return "none";
}

function toggleWholeVol(volPath: string) {
    const state = volState(volPath);
    const sel = settings.value.volumeBackup.selectedVolumes;
    const filtered = sel.filter(p => p !== volPath && !p.startsWith(volPath + "/"));
    settings.value.volumeBackup.selectedVolumes = state === "none" ? [...filtered, volPath] : filtered;
}

function isSubdirSelected(volPath: string, dir: string): boolean {
    const sel = settings.value.volumeBackup.selectedVolumes;
    return sel.includes(volPath) || sel.includes(`${volPath}/${dir}`);
}

function toggleSubdir(volPath: string, dir: string) {
    const fullPath = `${volPath}/${dir}`;
    const sel = settings.value.volumeBackup.selectedVolumes;
    const dirs = volDirs.value[volPath] ?? [];
    if (sel.includes(volPath)) {
        // Tout sélectionné → passer en mode partiel : tous sauf ce dossier
        settings.value.volumeBackup.selectedVolumes = [
            ...sel.filter(p => p !== volPath),
            ...dirs.filter(d => d !== dir).map(d => `${volPath}/${d}`),
        ];
    } else {
        const idx = sel.indexOf(fullPath);
        if (idx === -1) {
            sel.push(fullPath);
            // Si tous les sous-dossiers sont maintenant cochés → revenir au vol entier
            if (dirs.length > 0 && dirs.every(d => sel.includes(`${volPath}/${d}`))) {
                settings.value.volumeBackup.selectedVolumes = [
                    ...sel.filter(p => !p.startsWith(volPath + "/")),
                    volPath,
                ];
            }
        } else {
            sel.splice(idx, 1);
        }
    }
}

function selectAllDirs(volPath: string) {
    const sel = settings.value.volumeBackup.selectedVolumes;
    settings.value.volumeBackup.selectedVolumes = [
        ...sel.filter(p => p !== volPath && !p.startsWith(volPath + "/")),
        volPath,
    ];
}

function selectNoneDirs(volPath: string) {
    settings.value.volumeBackup.selectedVolumes =
        settings.value.volumeBackup.selectedVolumes.filter(
            p => p !== volPath && !p.startsWith(volPath + "/")
        );
}

async function toggleExpand(volPath: string) {
    const next = new Set(expandedVols.value);
    if (next.has(volPath)) {
        next.delete(volPath);
    } else {
        next.add(volPath);
    }
    // Mise à jour immédiate → le chevron et le panel réagissent tout de suite
    expandedVols.value = next;
    // Chargement des sous-dossiers uniquement si le volume vient d'être ouvert
    if (next.has(volPath) && !volDirs.value[volPath]) {
        await loadVolDirs(volPath);
    }
}

async function loadVolDirs(volPath: string) {
    loadingVolDirs.value = { ...loadingVolDirs.value, [volPath]: true };
    try {
        const res = await api("GET", `/backup/volume-dirs?path=${encodeURIComponent(volPath)}`);
        if (res.ok) volDirs.value = { ...volDirs.value, [volPath]: res.data as string[] };
    } finally {
        loadingVolDirs.value = { ...loadingVolDirs.value, [volPath]: false };
    }
}

async function loadVolSizes(volPath: string) {
    loadingVolSizes.value = { ...loadingVolSizes.value, [volPath]: true };
    try {
        const res = await api("GET", `/backup/volume-sizes?path=${encodeURIComponent(volPath)}`);
        if (res.ok) {
            const newSizes = { ...volSizes.value };
            for (const [dir, size] of Object.entries(res.data as Record<string, string>)) {
                newSizes[`${volPath}/${dir}`] = size as string;
            }
            volSizes.value = newSizes;
        }
    } finally {
        loadingVolSizes.value = { ...loadingVolSizes.value, [volPath]: false };
    }
}

onMounted(async () => {
    const [settingsRes, histRes, snapsRes] = await Promise.all([
        api("GET", "/backup/settings"),
        api("GET", "/backup/history"),
        api("GET", "/backup/snapshots"),
    ]);
    if (settingsRes.ok) {
        settings.value = mergeSettings(settingsRes.data);
    }
    if (histRes.ok) history.value = histRes.data;
    if (snapsRes.ok) snapshots.value = (snapsRes.data as Snapshot[]).sort(
        (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
    );
    await initServerTz(api);
    await loadMountedVols();
});

// ─── Actions ──────────────────────────────────────────────────────

async function save() {
    saving.value = true;
    try {
        const { discordWebhooks: _wh, notificationLang: _lang, ...settingsPayload } = settings.value;
        const res = await api("POST", "/backup/settings", settingsPayload);
        if (res.ok) {
            showToast(t('watcher.backup.saved'));
            // Resync depuis le serveur pour éviter les désynchronisations
            // (notamment le champ "enabled" qui peut repartir à false sinon)
            const reloaded = await api("GET", "/backup/settings");
            if (reloaded.ok) {
                settings.value = mergeSettings(reloaded.data);
            }
        } else {
            showToast(`❌ ${res.message}`, false);
        }
    } finally { saving.value = false; }
}

async function initRepo() {
    initing.value = true;
    try {
        const res = await api("POST", "/backup/init");
        showToast(res.ok ? t('watcher.backup.repoInit') : `❌ ${res.message}`, res.ok);
    } finally { initing.value = false; }
}

async function runBackup() {
    running.value = true;
    try {
        await api("POST", "/backup/run");
        showToast(t('watcher.backup.launched'));
        setTimeout(async () => {
            const res = await api("GET", "/backup/history");
            if (res.ok) history.value = res.data;
        }, 5000);
    } finally { running.value = false; }
}

async function loadSnapshots() {
    loadingSnaps.value = true;
    try {
        const res = await api("GET", "/backup/snapshots");
        if (res.ok) snapshots.value = (res.data as Snapshot[]).sort(
            (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
        );
        else showToast(`❌ ${res.message}`, false);
    } finally { loadingSnaps.value = false; }
}

async function checkIntegrity() {
    checking.value = true;
    checkResults.value = [];
    try {
        const res = await api("POST", "/backup/check");
        if (res.ok) {
            checkResults.value = res.data as CheckResult[];
        } else {
            showToast(`❌ ${res.message}`, false);
        }
    } finally { checking.value = false; }
}

async function deleteSnapshot(id: string) {
    if (!confirm(t('watcher.backup.snapshots.deleteConfirm', [id]))) return;
    const res = await api("DELETE", `/backup/snapshots/${id}`);
    if (res.ok) {
        snapshots.value = snapshots.value.filter(s => s.short_id !== id);
        showToast(t('watcher.backup.snapshots.deleted'));
    } else {
        showToast(`❌ ${res.message}`, false);
    }
}

async function toggleSnapshotFiles(shortId: string) {
    if (expandedSnapshot.value === shortId) {
        expandedSnapshot.value = null;
        snapshotFiles.value = [];
        selectedFiles.value = new Set();
        expandedStacks.value = new Set();
        expandedFolders.value = new Set();
        return;
    }
    expandedSnapshot.value = shortId;
    snapshotFiles.value = [];
    selectedFiles.value = new Set();
    expandedStacks.value = new Set();
    expandedFolders.value = new Set();
    loadingFiles.value = true;
    try {
        const res = await api("GET", `/backup/snapshots/${shortId}/files`);
        if (res.ok) snapshotFiles.value = res.data;
        else showToast(`❌ ${res.message}`, false);
    } finally {
        loadingFiles.value = false;
    }
}

function toggleFile(filePath: string) {
    const s = new Set(selectedFiles.value);
    if (s.has(filePath)) s.delete(filePath);
    else s.add(filePath);
    selectedFiles.value = s;
}

function toggleSelectAll() {
    if (selectedFiles.value.size === snapshotFiles.value.length) {
        selectedFiles.value = new Set();
    } else {
        selectedFiles.value = new Set(snapshotFiles.value.map(f => f.path));
    }
}

async function restoreSelected(shortId: string) {
    const paths = [...selectedFiles.value];
    if (paths.length === 0) return;
    if (!confirm(t('watcher.backup.snapshots.restoreConfirm', [paths.length, shortId]))) return;
    restoring.value = true;
    try {
        const res = await api("POST", `/backup/snapshots/${shortId}/restore`, { files: paths });
        if (res.ok) {
            showToast(t('watcher.backup.snapshots.restoreOk', [res.restored]));
            // Rafraîchit les statuts des fichiers
            const refresh = await api("GET", `/backup/snapshots/${shortId}/files`);
            if (refresh.ok) snapshotFiles.value = refresh.data;
        } else {
            showToast(t('watcher.backup.snapshots.restoreErr'), false);
        }
    } finally {
        restoring.value = false;
    }
}

async function restoreStack(shortId: string, sg: StackGroup) {
    const paths = getAllStackFiles(sg).map(f => f.path);
    if (paths.length === 0) return;
    if (!confirm(t('watcher.backup.snapshots.restoreStackConfirm', [sg.name, shortId]))) return;
    restoring.value = true;
    try {
        const res = await api("POST", `/backup/snapshots/${shortId}/restore`, { files: paths });
        if (res.ok) {
            showToast(t('watcher.backup.snapshots.restoreOk', [res.restored]));
            const refresh = await api("GET", `/backup/snapshots/${shortId}/files`);
            if (refresh.ok) snapshotFiles.value = refresh.data;
        } else {
            showToast(t('watcher.backup.snapshots.restoreErr'), false);
        }
    } finally {
        restoring.value = false;
    }
}

</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.form-control::placeholder,
.form-control-sm::placeholder {
    color: #9ca3af !important;
    opacity: 1;
}

.settings-subheading {
    font-size: 1.1rem;
    font-weight: 600;
}

// Tables Historique + Snapshots : même look que WatcherSettings
.table-responsive .table {
    --bs-table-bg: transparent;
    --bs-table-color: #e5e7eb;

    > thead > tr > th {
        color: #9ca3af;
        font-size: .72rem;
        text-transform: uppercase;
        letter-spacing: .05em;
        border-bottom-color: rgba(255,255,255,.1);
        opacity: 1;
    }

    > tbody > tr > td {
        color: #e5e7eb;
        border-bottom-color: rgba(255,255,255,.06);
        vertical-align: middle;
    }

    > tbody > tr:hover > td {
        background: rgba(255,255,255,.04);
    }
}

// Coloration par statut : bordure gauche sur la 1ère cellule
// ── Cartes destinations ──────────────────────────────────────────
.dest-card {
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 10px;
    overflow: hidden;
}
.dest-card-header {
    padding: .6rem .9rem;
    background: rgba(255,255,255,.04);
    border-bottom: 1px solid rgba(255,255,255,.07);
}
.dest-card-body {
    padding: .75rem 1rem 1rem;
}
.dest-label-input {
    max-width: 180px;
    background-color: rgba(255,255,255,.05);
    border-color: rgba(255,255,255,.15);
    color: #e5e7eb;
}
.dest-type-select {
    max-width: 140px;
    background-color: rgba(255,255,255,.05);
    border-color: rgba(255,255,255,.15);
    color: #e5e7eb;
}
.dest-toggle-btn {
    color: #9ca3af;
    padding: 2px 6px;
    &:hover { color: #e5e7eb; }
}

.history-row-ok  > td:first-child { border-left: 3px solid #22c55e; }
.history-row-err > td:first-child { border-left: 3px solid #ef4444; }
.snapshot-row    > td:first-child { border-left: 3px solid #f59e0b; }

.table th {
    font-size: .72rem;
    text-transform: uppercase;
    letter-spacing: .05em;
    opacity: .55;
    border-bottom-color: $dark-border-color;
}

.table td {
    vertical-align: middle;
    border-bottom-color: $dark-border-color;
}

.toast-float {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    z-index: 9999;
    padding: .65rem 1.25rem;
    border-radius: 50rem;
    font-size: .875rem;
    font-weight: 500;
    box-shadow: 0 4px 16px rgba(0, 0, 0, .4);
}

.toast-ok {
    background: #166534;
    color: #bbf7d0;
    border: 1px solid #15803d;
}

.toast-err {
    background: #7f1d1d;
    color: #fecaca;
    border: 1px solid #b91c1c;
}

// ─── Section Volumes rétractable ────────────────────────────────
.vol-section {
    padding: 0 !important;
    overflow: hidden;

    &.collapsed .vol-section-header {
        border-bottom: none;
    }
}

.vol-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 20px;
    cursor: pointer;
    border-bottom: 1px solid rgba(255,255,255,.07);
    user-select: none;
    transition: background .15s;

    &:hover { background: rgba(255,255,255,.03); }

    .chevron-icon {
        font-size: .8rem;
        color: #6b7280;
        transition: transform .2s;
    }

    .badge-summary {
        font-size: .72rem;
        font-weight: 400;
        color: #74c2ff;
        background: rgba(116,194,255,.12);
        padding: 2px 8px;
        border-radius: 50rem;
        vertical-align: middle;
    }
}

.vol-section-body {
    padding: 16px 20px 20px;
}

// ─── Vol-rows (sélection volumes) ────────────────────────────────
.vol-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: rgba(0,0,0,.15);
    transition: background .15s;

    &.active {
        background: rgba(116,194,255,.07);
    }

    .vol-path {
        font-size: .82rem;
        color: #74c2ff;
        background: rgba(116,194,255,.1);
        padding: 1px 6px;
        border-radius: 4px;
    }

    .vol-size {
        font-size: .82rem;
        font-family: monospace;
        color: #9ca3af;
        white-space: nowrap;
    }
}

// Boutons extra-petits
.btn-xs {
    padding: 2px 8px;
    font-size: .75rem;
    line-height: 1.4;
    border-radius: 4px;
}

// ─── Liste unifiée de volumes ──────────────────────────────────────
.vol-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.vol-entry {
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,.08);
    transition: border-color .15s;

    &.vol-entry-active {
        border-color: rgba(116,194,255,.35);
    }
}

.vol-source {
    font-size: .75rem;
    color: #6b7280;
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
}

// ─── Panel sous-dossiers ──────────────────────────────────────────
.vol-subdirs-panel {
    border-top: 1px solid rgba(255,255,255,.07);
    background: rgba(0,0,0,.12);
    padding: 10px 14px 12px;
}

.vol-subdirs-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 10px;
}

.vol-dir-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 260px;
    overflow-y: auto;
}

.vol-dir-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 8px;
    border-radius: 5px;
    cursor: pointer;
    transition: background .12s;

    &:hover { background: rgba(255,255,255,.05); }

    &.active {
        background: rgba(116,194,255,.08);
        .form-check-label code { color: #74c2ff; }
    }

    .vol-size {
        font-size: .78rem;
        font-family: monospace;
        color: #9ca3af;
        white-space: nowrap;
        flex-shrink: 0;
        margin-left: 8px;
    }
}

.snapshot-row:hover td {
    background: rgba(255,255,255,.04);
}

.snapshot-files-row td {
    background: rgba(0,0,0,.2) !important;
    border-bottom: 2px solid $dark-border-color !important;
}

.snapshot-files-panel {
    color: #e5e7eb;

    // Bootstrap applique color via --bs-table-color sur les cellules — on force direct
    .table {
        --bs-table-bg: transparent;
        --bs-table-color: #e5e7eb;

        > :not(caption) > * > * {
            color: #e5e7eb;
        }

        > thead > tr > th {
            opacity: 1; // annule le .55 du scope global
            color: #9ca3af;
        }
    }

    code {
        background-color: rgba(255, 255, 255, 0.08);
        color: #e5e7eb;
        padding: 0.1em 0.35em;
        border-radius: 3px;
    }
}

.snapshot-files-panel {
    border-left: 3px solid #f59e0b;
}

// ─── Arborescence snapshot (tiroirs / sous-tiroirs) ──────────────
.snap-tree {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: .82rem;
}

.snap-stack {
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 7px;
    overflow: hidden;
}

.snap-stack-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    background: rgba(245,158,11,.07);
    cursor: pointer;
    user-select: none;
    transition: background .12s;

    &:hover { background: rgba(245,158,11,.12); }

    .snap-stack-name {
        font-size: .82rem;
        color: #f59e0b;
        background: rgba(245,158,11,.12);
        padding: 1px 6px;
        border-radius: 4px;
        flex: 1;
    }
}

.snap-stack-body {
    background: rgba(0,0,0,.12);
    border-top: 1px solid rgba(255,255,255,.07);
}

.snap-folder {
    border-top: 1px solid rgba(255,255,255,.05);
}

.snap-folder-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px 6px 32px;
    cursor: pointer;
    user-select: none;
    background: rgba(255,255,255,.02);
    transition: background .12s;

    &:hover { background: rgba(255,255,255,.05); }

    .snap-foldername {
        font-family: monospace;
        font-size: .82rem;
        color: #fbbf24;
        flex: 1;
    }
}

.snap-folder-body {
    background: rgba(0,0,0,.08);
    border-top: 1px solid rgba(255,255,255,.04);
}

.snap-file-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px 5px 32px;
    border-top: 1px solid rgba(255,255,255,.04);
    transition: background .1s;

    &:hover { background: rgba(255,255,255,.03); }

    &.snap-file-in-folder { padding-left: 52px; }
}

.snap-filename {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: monospace;
    font-size: .8rem;
}

.snap-services {
    display: flex;
    gap: 3px;
    flex-shrink: 0;
}

.snap-badges {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
}

.snap-chevron, .snap-file-icon {
    font-size: .72rem;
    color: #9ca3af;
    flex-shrink: 0;
}

.snap-folder-icon {
    font-size: .82rem;
    color: #fbbf24;
    flex-shrink: 0;
}

.snap-count {
    font-size: .65rem;
    background: rgba(255,255,255,.12);
    color: #9ca3af;
    padding: 1px 6px;
    border-radius: 50rem;
    flex-shrink: 0;
}

.snap-alias {
    font-size: .62rem;
    flex-shrink: 0;
}

// ─── Bouton aperçu (œil) ────────────────────────────────────────
.snap-preview-btn {
    opacity: 0;
    transition: opacity .15s;
    .snap-file-row:hover & { opacity: 1; }
}
.snap-file-row:hover .snap-preview-btn { opacity: 1; }

// ─── Modal Aperçu / Diff ─────────────────────────────────────────
.preview-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, .72);
    z-index: 10000;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 48px 16px 32px;
    overflow-y: auto;
}

.preview-modal {
    background: #1a1d2e;
    border: 1px solid rgba(255, 255, 255, .13);
    border-radius: 10px;
    width: 100%;
    max-width: 900px;
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 96px);
    box-shadow: 0 16px 48px rgba(0, 0, 0, .6);
}

.preview-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, .1);
    flex-shrink: 0;

    .preview-filename {
        font-size: .82rem;
        color: #74c2ff;
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}

.preview-tabs {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
}

.preview-tab-btn {
    background: rgba(255, 255, 255, .06);
    border: 1px solid rgba(255, 255, 255, .1);
    color: #9ca3af;
    padding: 4px 12px;
    border-radius: 6px;
    font-size: .78rem;
    cursor: pointer;
    transition: background .12s, color .12s;

    &:hover:not(:disabled) { background: rgba(255, 255, 255, .11); color: #e5e7eb; }
    &.active { background: rgba(116, 194, 255, .15); color: #74c2ff; border-color: rgba(116, 194, 255, .3); }
    &:disabled { opacity: .35; cursor: not-allowed; }
}

.preview-close-btn {
    background: none;
    border: none;
    color: #6b7280;
    font-size: 1rem;
    cursor: pointer;
    padding: 2px 6px;
    flex-shrink: 0;
    &:hover { color: #e5e7eb; }
}

.preview-loading {
    padding: 2.5rem;
    text-align: center;
    color: #9ca3af;
    font-size: .85rem;
}

.preview-body {
    overflow: auto;
    flex: 1;
    min-height: 0;
}

.preview-code {
    margin: 0;
    padding: 16px 20px;
    font-size: .78rem;
    color: #e5e7eb;
    background: transparent;
    line-height: 1.6;
    white-space: pre;
    overflow: visible;
    tab-size: 2;
}

.diff-view { display: flex; flex-direction: column; height: 100%; }

.diff-legend {
    display: flex;
    gap: 20px;
    align-items: center;
    padding: 7px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, .07);
    font-size: .74rem;
    flex-shrink: 0;

    .diff-leg-rm  { color: #f87171; }
    .diff-leg-add { color: #4ade80; }
    .diff-leg-ok  { color: #9ca3af; margin-left: auto; }
}

.diff-lines {
    overflow: auto;
    flex: 1;
    font-family: "JetBrains Mono", "Fira Code", ui-monospace, monospace;
    font-size: .74rem;
    line-height: 1.45;
}

.diff-line {
    display: flex;
    align-items: stretch;
    white-space: pre;

    &.diff-removed { background: rgba(239, 68, 68, .12); }
    &.diff-added   { background: rgba(74, 222, 128, .09); }
    &:hover        { filter: brightness(1.2); }

    .diff-lnum {
        min-width: 46px;
        text-align: right;
        padding: 1px 8px 1px 4px;
        color: #374151;
        user-select: none;
        border-right: 1px solid rgba(255, 255, 255, .06);
        flex-shrink: 0;
    }

    .diff-marker {
        min-width: 20px;
        text-align: center;
        padding: 1px 3px;
        font-weight: 700;
        flex-shrink: 0;
    }

    &.diff-removed .diff-marker { color: #f87171; }
    &.diff-added   .diff-marker { color: #4ade80; }
    &.diff-same    .diff-marker { color: transparent; }

    .diff-text {
        padding: 1px 10px;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        color: #d1d5db;
    }

    &.diff-removed .diff-text { color: #fca5a5; }
    &.diff-added   .diff-text { color: #bbf7d0; }
}

.notif-lang-toggle {
    display: inline-flex;
    gap: 2px;
    background: rgba(255,255,255,.05);
    border-radius: 50rem;
    padding: 2px 4px;
    border: 1px solid rgba(255,255,255,.08);
}
.notif-lang-btn {
    background: none;
    border: none;
    font-size: .9rem;
    line-height: 1;
    padding: 1px 4px;
    border-radius: 50rem;
    cursor: pointer;
    opacity: .4;
    transition: opacity .15s, background .15s;
    &:hover { opacity: .75; }
    &.active {
        opacity: 1;
        background: rgba(255,255,255,.1);
    }
}
</style>
