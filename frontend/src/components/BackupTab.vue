<template>
    <div>
        <!-- ═══ DESTINATIONS ═══ -->
        <div class="shadow-box big-padding mb-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h5 class="settings-subheading mb-0">
                    <font-awesome-icon icon="archive" class="me-2" />{{ $t('watcher.backup.heading') }}
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
            <div class="row g-3 mb-4">
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
                        <div class="col-md-7">
                            <label class="form-label">{{ $t('watcher.backup.localPath') }}</label>
                            <input v-model="dest.local!.path" type="text"
                                class="form-control" placeholder="/app/data/backups" />
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

                <!-- Notifications Discord -->
                <div class="col-12">
                    <label class="form-label">
                        {{ $t('watcher.backup.webhooks') }}
                        <small class="form-text">{{ $t('watcher.backup.webhooksHint') }}</small>
                    </label>
                    <div v-for="(wh, idx) in discordWebhooks" :key="idx"
                        class="d-flex align-items-center gap-2 mb-2">
                        <span class="form-control form-control-sm text-truncate" style="font-family:monospace;font-size:.78rem">
                            {{ wh }}
                        </span>
                        <button class="btn btn-sm btn-normal" @click="testWebhook(wh)" :disabled="testing">
                            <span v-if="testing" class="spinner-border spinner-border-sm" />
                            <span v-else><font-awesome-icon icon="paper-plane" /></span>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" @click="removeWebhook(idx)">
                            <font-awesome-icon icon="trash" />
                        </button>
                    </div>
                    <p v-if="discordWebhooks.length === 0" class="form-text fst-italic mb-2">
                        {{ $t('watcher.backup.noWebhook') }}
                    </p>
                    <div class="input-group">
                        <input v-model="newWebhook" type="password" class="form-control form-control-sm"
                            placeholder="https://discord.com/api/webhooks/…" autocomplete="off" />
                        <button class="btn btn-sm btn-success" @click="addWebhook" :disabled="!newWebhook">
                            <font-awesome-icon icon="plus" class="me-1" />{{ $t('watcher.img.addWebhook') }}
                        </button>
                    </div>
                    <!-- Langue des notifications -->
                    <div class="mt-2 d-flex align-items-center gap-2">
                        <small class="form-text">{{ $t('watcher.notifLang') }}</small>
                        <div class="notif-lang-toggle">
                            <button :class="['notif-lang-btn', settings.notificationLang !== 'en' && 'active']"
                                @click="settings.notificationLang = 'fr'">🇫🇷</button>
                            <button :class="['notif-lang-btn', settings.notificationLang === 'en' && 'active']"
                                @click="settings.notificationLang = 'en'">🇬🇧</button>
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
        </div>

        <!-- ═══ HISTORIQUE ═══ -->
        <div class="shadow-box big-padding mb-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h5 class="settings-subheading mb-0">
                    <font-awesome-icon icon="chart-line" class="me-2" />{{ $t('watcher.backup.history.heading') }}
                </h5>
                <small v-if="nextBackupDate" class="form-text">
                    <font-awesome-icon icon="clock" class="me-1" />
                    Prochain backup : {{ nextBackupDate.toLocaleString() }}
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
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(h, i) in history" :key="i" :class="h.success ? 'history-row-ok' : 'history-row-err'">
                            <td class="small form-text">{{ new Date(h.timestamp).toLocaleString() }}</td>
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
                                <td class="small form-text">{{ new Date(snap.time).toLocaleString() }}</td>
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

                                        <!-- Liste des fichiers -->
                                        <template v-else>
                                            <div class="d-flex align-items-center justify-content-between mb-2">
                                                <div class="d-flex align-items-center gap-2">
                                                    <input type="checkbox" class="form-check-input"
                                                        :checked="selectedFiles.size === snapshotFiles.length"
                                                        @change="toggleSelectAll"
                                                        :title="$t('watcher.backup.snapshots.selectAll')" />
                                                    <small class="form-text">
                                                        {{ selectedFiles.size }}/{{ snapshotFiles.length }} sélectionné(s)
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

                                            <table class="table table-sm mb-0" style="font-size:.82rem">
                                                <thead>
                                                    <tr>
                                                        <th style="width:1.5rem"></th>
                                                        <th style="width:8rem">Stack</th>
                                                        <th>Fichier</th>
                                                        <th class="text-center" style="width:9rem">
                                                            {{ $t('watcher.backup.snapshots.colSnapDiff') }}
                                                        </th>
                                                        <th class="text-center" style="width:9rem">
                                                            {{ $t('watcher.backup.snapshots.colDiskStatus') }}
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    <tr v-for="f in snapshotFiles" :key="f.path"
                                                        :class="{ 'opacity-50': f.diskStatus === 'missing' }">
                                                        <td>
                                                            <input type="checkbox" class="form-check-input"
                                                                :checked="selectedFiles.has(f.path)"
                                                                @change="toggleFile(f.path)" />
                                                        </td>
                                                        <td class="fw-semibold">
                                                            <code>{{ f.stack }}</code>
                                                        </td>
                                                        <td>
                                                            <font-awesome-icon
                                                                :icon="f.type === 'compose' ? 'file-code' : 'key'"
                                                                class="me-1 text-muted" />
                                                            {{ f.name }}
                                                        </td>
                                                        <!-- Badge snapDiff -->
                                                        <td class="text-center">
                                                            <span v-if="f.prevSnapshotId === null"
                                                                class="badge bg-secondary">
                                                                {{ $t('watcher.backup.snapshots.firstSnapshot') }}
                                                            </span>
                                                            <span v-else-if="f.snapDiff === 'added'"
                                                                class="badge bg-success">
                                                                {{ $t('watcher.backup.snapshots.diffAdded') }}
                                                            </span>
                                                            <span v-else-if="f.snapDiff === 'modified'"
                                                                class="badge bg-warning text-dark">
                                                                {{ $t('watcher.backup.snapshots.diffModified') }}
                                                            </span>
                                                            <span v-else class="badge bg-secondary opacity-50">
                                                                {{ $t('watcher.backup.snapshots.diffUnchanged') }}
                                                            </span>
                                                        </td>
                                                        <!-- Badge diskStatus -->
                                                        <td class="text-center">
                                                            <span v-if="f.diskStatus === 'unchanged'"
                                                                class="badge bg-success">
                                                                {{ $t('watcher.backup.snapshots.diskUnchanged') }}
                                                            </span>
                                                            <span v-else-if="f.diskStatus === 'modified'"
                                                                class="badge bg-warning text-dark">
                                                                {{ $t('watcher.backup.snapshots.diskModified') }}
                                                            </span>
                                                            <span v-else class="badge bg-secondary">
                                                                {{ $t('watcher.backup.snapshots.diskMissing') }}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </template>
                                    </div>
                                </td>
                            </tr>
                        </template>
                    </tbody>
                </table>
            </div>
        </div>

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
interface Settings { enabled: boolean; intervalHours: number; destinations: Destination[]; retention: Retention; includeEnvFiles: boolean; discordWebhooks?: string[]; notificationLang?: "fr" | "en" }
interface Snapshot { id: string; short_id: string; time: string; tags?: string[]; paths: string[] }
interface SnapshotFile {
    path: string; name: string; stack: string; type: "compose" | "env" | "other";
    size: number; mtime: string;
    diskStatus: "unchanged" | "modified" | "missing";
    snapDiff:   "added" | "modified" | "unchanged";
    prevSnapshotId: string | null;
}
interface BackupResult { success: boolean; snapshotId?: string; duration: number; dataAdded?: number; filesNew?: number; filesChanged?: number; error?: string; timestamp: string }

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
});
const expandedDest = ref<number>(0);
const discordWebhooks = ref<string[]>([]);
const newWebhook = ref("");
const snapshots = ref<Snapshot[]>([]);
const history = ref<BackupResult[]>([]);

const saving = ref(false);
const initing = ref(false);
const running = ref(false);
const loadingSnaps = ref(false);
const expandedSnapshot  = ref<string | null>(null);
const snapshotFiles     = ref<SnapshotFile[]>([]);
const selectedFiles     = ref<Set<string>>(new Set());
const loadingFiles      = ref(false);
const restoring         = ref(false);
const testing = ref(false);
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

function addWebhook() {
    const url = newWebhook.value.trim();
    if (!url || discordWebhooks.value.includes(url)) return;
    discordWebhooks.value.push(url);
    newWebhook.value = "";
}
function removeWebhook(idx: number) {
    discordWebhooks.value.splice(idx, 1);
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
    };
}

// ─── Computed ─────────────────────────────────────────────────────

const nextBackupDate = computed(() => {
    if (!settings.value.enabled || history.value.length === 0) return null;
    const last = new Date(history.value[0].timestamp).getTime();
    return new Date(last + settings.value.intervalHours * 3_600_000);
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

onMounted(async () => {
    const [settingsRes, histRes, snapsRes] = await Promise.all([
        api("GET", "/backup/settings"),
        api("GET", "/backup/history"),
        api("GET", "/backup/snapshots"),
    ]);
    if (settingsRes.ok) {
        settings.value = mergeSettings(settingsRes.data);
        discordWebhooks.value = settingsRes.data.discordWebhooks ?? [];
    }
    if (histRes.ok) history.value = histRes.data;
    if (snapsRes.ok) snapshots.value = snapsRes.data;
});

// ─── Actions ──────────────────────────────────────────────────────

async function save() {
    saving.value = true;
    try {
        const res = await api("POST", "/backup/settings", { ...settings.value, discordWebhooks: discordWebhooks.value });
        if (res.ok) {
            showToast(t('watcher.backup.saved'));
            // Resync depuis le serveur pour éviter les désynchronisations
            // (notamment le champ "enabled" qui peut repartir à false sinon)
            const reloaded = await api("GET", "/backup/settings");
            if (reloaded.ok) {
                settings.value = mergeSettings(reloaded.data);
                discordWebhooks.value = reloaded.data.discordWebhooks ?? [];
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
        if (res.ok) snapshots.value = res.data;
        else showToast(`❌ ${res.message}`, false);
    } finally { loadingSnaps.value = false; }
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
        return;
    }
    expandedSnapshot.value = shortId;
    snapshotFiles.value = [];
    selectedFiles.value = new Set();
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

async function testWebhook(url: string) {
    testing.value = true;
    try {
        const res = await api("POST", "/discord/test", { webhookUrl: url });
        showToast(res.ok ? t('watcher.discord.testOk') : t('watcher.discord.testFail'), res.ok);
    } finally { testing.value = false; }
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
