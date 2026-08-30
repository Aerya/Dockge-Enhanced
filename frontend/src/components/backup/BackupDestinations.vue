<template>
    <!-- ═══ DESTINATIONS ═══ -->
    <div class="shadow-box big-padding mb-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="settings-subheading mb-0">
                <font-awesome-icon icon="archive" class="me-2" />{{ $t('watcher.backup.heading') }}
                <span v-if="isBackupStale" class="badge bg-warning text-dark ms-2 badge-stale">{{ $t('watcher.backup.stale') }}</span>
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
            <div class="col-md-8 d-flex align-items-end gap-4 flex-wrap">
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
                <div>
                    <div class="form-check form-switch mb-0">
                        <input v-model="settings.preventConcurrentBackups" class="form-check-input" type="checkbox"
                            id="preventConcurrentBackups" role="switch" />
                        <label class="form-check-label fw-semibold" for="preventConcurrentBackups">
                            {{ $t('watcher.backup.preventConcurrent') }}
                        </label>
                    </div>
                    <small class="form-text">{{ $t('watcher.backup.preventConcurrentHint') }}</small>
                </div>
                <div>
                    <div class="form-check form-switch mb-0">
                        <input v-model="settings.restoreTest" class="form-check-input" type="checkbox"
                            id="restoreTest" role="switch" />
                        <label class="form-check-label fw-semibold" for="restoreTest">
                            {{ $t('watcher.backup.restoreTest') }}
                        </label>
                    </div>
                    <small class="form-text">{{ $t('watcher.backup.restoreTestHint') }}</small>
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
                            class="form-control" :placeholder="$t('watcher.backup.sftpHostPlaceholder')" />
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
                        <i18n-t keypath="watcher.backup.includeEnv" tag="span">
                            <template #env><code>.env</code></template>
                        </i18n-t>
                        <small class="form-text">{{ $t('watcher.backup.includeEnvHint') }}</small>
                    </label>
                </div>
            </div>

        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n/dist/vue-i18n.esm-browser.prod.js";
import { defaultDestination, type Destination, type Settings } from "./shared";

const { t } = useI18n();

const settings = defineModel<Settings>({ required: true });
defineProps<{ isBackupStale: boolean }>();

const expandedDest = ref<number>(0);

function addDestination() {
    const d = defaultDestination(t);
    d.label = t("watcher.backup.destAutoLabel", { n: settings.value.destinations.length + 1 });
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
</script>

<style lang="scss" scoped>

.form-control::placeholder,
.form-control-sm::placeholder {
    color: var(--text-muted) !important;
    opacity: 1;
}

.settings-subheading {
    font-size: var(--fs-lg);
    font-weight: 600;
}

.badge-stale {
    font-size: var(--fs-xs);
    font-weight: 500;
}

// ── Cartes destinations ──────────────────────────────────────────
.dest-card {
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    overflow: hidden;
}
.dest-card-header {
    padding: .6rem .9rem;
    background: var(--bg-raised);
    border-bottom: 1px solid var(--border-color);
}
.dest-card-body {
    padding: .75rem 1rem 1rem;
}
.dest-label-input {
    max-width: 180px;
}
.dest-type-select {
    max-width: 140px;
}
.dest-toggle-btn {
    color: var(--text-muted);
    padding: 2px 6px;

    &:hover { color: var(--text-color); }
}
</style>
