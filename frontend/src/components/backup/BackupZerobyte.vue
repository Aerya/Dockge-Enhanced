<template>
    <section class="shadow-box big-padding mb-4" aria-label="Zerobyte">
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="settings-subheading mb-0"><font-awesome-icon icon="database" class="me-2" />{{ $t('watcher.zerobyte.title') }}</h5>
            <div class="form-check form-switch mb-0">
                <input id="zerobyte-enabled" v-model="configuration.enabled" type="checkbox" class="form-check-input" :disabled="busy" role="switch" :aria-expanded="configuration.enabled" @change="toggleEnabled" />
                <label for="zerobyte-enabled" class="form-check-label">{{ $t('watcher.zerobyte.enable') }}</label>
            </div>
        </div>
        <div v-if="configuration.enabled">
            <p class="form-text mb-3">{{ $t('watcher.zerobyte.intro') }}</p>
            <div class="mb-3">
                <div class="form-check form-check-inline">
                    <input id="zerobyte-existing" v-model="connectionMode" class="form-check-input" type="radio" name="zerobyte-connection-mode" value="existing" />
                    <label class="form-check-label" for="zerobyte-existing">{{ $t('watcher.zerobyte.useExisting') }}</label>
                </div>
                <div class="form-check form-check-inline">
                    <input id="zerobyte-managed" v-model="connectionMode" class="form-check-input" type="radio" name="zerobyte-connection-mode" value="managed" />
                    <label class="form-check-label" for="zerobyte-managed">{{ $t('watcher.zerobyte.installNew') }}</label>
                </div>
            </div>
            <div v-if="connectionMode === 'existing'" class="alert alert-warning">
                <strong>{{ $t('watcher.zerobyte.externalWarningTitle') }}</strong>
                <p class="mb-2">{{ $t('watcher.zerobyte.externalWarning') }}</p>
                <label class="d-block mb-2"><input v-model="configuration.externalRisksAcknowledged" type="checkbox" class="form-check-input me-2" @change="configuration.externalRestoreRoot = configuration.externalRisksAcknowledged ? configuration.externalRestoreRoot : ''" />{{ $t('watcher.zerobyte.externalAcknowledge') }}</label>
                <label for="external-restore-root" class="form-label">{{ $t('watcher.zerobyte.externalRestoreRoot') }}</label>
                <input id="external-restore-root" v-model.trim="configuration.externalRestoreRoot" class="form-control" placeholder="/restore-test" :disabled="!configuration.externalRisksAcknowledged" />
                <small>{{ $t('watcher.zerobyte.externalRestoreHelp') }}</small>
            </div>
            <div v-if="connectionMode === 'managed'" class="border rounded p-3 mb-3">
                <p class="form-text mb-3">{{ $t('watcher.zerobyte.managedSummary') }}</p>
                <template v-if="installation?.installed">
                    <p class="mb-2">{{ $t('watcher.zerobyte.installPresent') }}: <strong>{{ installation.name }}</strong> ({{ installation.running ? $t('watcher.zerobyte.running') : $t('watcher.zerobyte.stopped') }})</p>
                    <a v-if="installation.url" :href="installation.url" target="_blank" rel="noopener noreferrer">{{ $t('watcher.zerobyte.openWebui') }} <font-awesome-icon icon="external-link-alt" /></a>
                </template>
                <div class="row g-3 my-1">
                    <div class="col-lg-6">
                        <div class="border rounded p-3 h-100">
                            <h6 class="fw-bold">{{ $t('watcher.zerobyte.sourcesTitle') }}</h6>
                            <p class="form-text">{{ $t('watcher.zerobyte.sourcesDescription') }}</p>
                            <div v-for="(mount, index) in localMounts" :key="index" class="mb-2">
                                <div class="zerobyte-mount-editor">
                                    <select v-model="mount.kind" class="form-select form-select-sm" style="max-width: 155px" :aria-label="$t('watcher.zerobyte.mountType')">
                                        <option value="bind">{{ $t('watcher.zerobyte.bindMount') }}</option>
                                        <option value="volume">{{ $t('watcher.zerobyte.dockerVolume') }}</option>
                                    </select>
                                    <input v-model.trim="mount.source" :title="mount.source" class="form-control form-control-sm" :aria-label="$t('watcher.zerobyte.sourcesTitle')" :placeholder="mount.kind === 'volume' ? 'app_data' : '/srv/docker/app-data'" autocomplete="off" />
                                    <button type="button" class="btn btn-outline-danger btn-sm" :disabled="busy" @click="removeMount(index)">{{ $t('watcher.zerobyte.removeMount') }}</button>
                                </div>
                                <small v-if="mount.target" class="form-text d-block">{{ $t('watcher.zerobyte.containerPath') }}: <code>{{ mount.target }}</code></small>
                            </div>
                            <button type="button" class="btn btn-normal btn-sm" :disabled="busy || localMounts.length >= 12" @click="addMount">{{ $t('watcher.zerobyte.addSource') }}</button>
                            <p class="form-text small mt-2 mb-0">{{ $t('watcher.zerobyte.sourcesReadonly') }}</p>
                        </div>
                    </div>
                    <div class="col-lg-6">
                        <div class="border rounded p-3 h-100">
                            <h6 class="fw-bold">{{ $t('watcher.zerobyte.destinationsTitle') }}</h6>
                            <p class="form-text">{{ $t('watcher.zerobyte.destinationsDescription') }}</p>
                            <div v-for="(mount, index) in destinationMounts" :key="index" class="mb-2">
                                <div class="zerobyte-mount-editor">
                                    <select v-model="mount.kind" class="form-select form-select-sm" style="max-width: 155px" :aria-label="$t('watcher.zerobyte.mountType')">
                                        <option value="bind">{{ $t('watcher.zerobyte.bindMount') }}</option>
                                    </select>
                                    <input v-model.trim="mount.source" :title="mount.source" class="form-control form-control-sm" :aria-label="$t('watcher.zerobyte.destinationsTitle')" :placeholder="mount.kind === 'volume' ? 'backup_store' : '/mnt/backup/zerobyte'" autocomplete="off" />
                                    <button type="button" class="btn btn-outline-danger btn-sm" :disabled="busy" @click="removeDestination(index)">{{ $t('watcher.zerobyte.removeMount') }}</button>
                                </div>
                                <label class="form-check-label small d-block mt-1"><input v-model="mount.remote" type="checkbox" class="form-check-input me-1" />{{ $t('watcher.zerobyte.expectRemote') }}</label>
                                <small v-if="mount.target" class="form-text d-block">{{ $t('watcher.zerobyte.containerPath') }}: <code>{{ mount.target }}</code></small>
                            </div>
                            <button type="button" class="btn btn-normal btn-sm" :disabled="busy || destinationMounts.length >= 12" @click="addDestination">{{ $t('watcher.zerobyte.addDestination') }}</button>
                            <p class="form-text small mt-2 mb-0">{{ $t('watcher.zerobyte.destinationsWritable') }}</p>
                        </div>
                    </div>
                </div>
                <p class="form-text mb-2">{{ $t('watcher.zerobyte.pathSafety') }}</p>
                <p class="form-text mb-2">{{ $t('watcher.zerobyte.remoteMountWarning') }}</p>
                <div v-if="remoteResticDestinations" class="form-check mb-3">
                    <input id="zerobyte-remote-separate" v-model="remoteSeparationConfirmed" class="form-check-input" type="checkbox" />
                    <label for="zerobyte-remote-separate" class="form-check-label">{{ $t('watcher.zerobyte.remoteSeparationAttestation') }}</label>
                </div>
                <p class="form-text mb-2">{{ $t('watcher.zerobyte.managedConfig') }}</p>
                <p class="form-text mb-3">{{ $t('watcher.zerobyte.resticExcludeNotice') }}</p>
                <template v-if="!installation?.installed">
                    <label class="form-label" for="zerobyte-install-url">{{ $t('watcher.zerobyte.installAddress') }}</label>
                    <input id="zerobyte-install-url" v-model.trim="installUrl" type="url" class="form-control mb-2" autocomplete="off" />
                    <button type="button" class="btn btn-primary btn-sm" :disabled="busy || !installUrl || !validMountCount || (remoteResticDestinations && !remoteSeparationConfirmed)" @click="install">{{ $t('watcher.zerobyte.installAction') }}</button>
                </template>
                <button v-else type="button" class="btn btn-outline-warning btn-sm" :disabled="busy || !mountsChanged || !validMountCount || (remoteResticDestinations && !remoteSeparationConfirmed)" @click="updateMounts">{{ $t('watcher.zerobyte.applyMounts') }}</button>
                <p v-if="!validMountCount" class="form-text mt-2 mb-0">{{ $t('watcher.zerobyte.requireBoth') }}</p>
                <p class="form-text small mt-2 mb-0">{{ $t('watcher.zerobyte.configureRepository') }}</p>
                <p class="small form-text mt-2 mb-0">{{ $t('watcher.zerobyte.installNoPrivileges') }}</p>
            </div>
            <div v-if="connectionMode === 'managed' && installation?.installed" class="border rounded p-3 mb-3">
                <h6>{{ $t('watcher.zerobyte.workflowTitle') }}</h6>
                <p class="form-text">{{ $t('watcher.zerobyte.workflowHelp') }}</p>
                <p class="alert alert-info">{{ $t('watcher.zerobyte.outagePolicy') }}</p>
                <div class="row g-2 mb-2">
                    <div class="col-md-6"><label class="form-label">{{ $t('watcher.zerobyte.jobName') }}</label><input v-model.trim="workflowInput.name" class="form-control" maxlength="60" /></div>
                    <div class="col-md-3"><label class="form-label">{{ $t('watcher.zerobyte.cron') }}</label><input v-model.trim="workflowInput.cron" class="form-control" /></div>
                    <div class="col-md-3"><label class="form-label">{{ $t('watcher.zerobyte.maxMinutes') }}</label><input v-model.number="workflowInput.maxMinutes" type="number" min="1" max="120" class="form-control" /></div>
                    <div class="col-md-6"><label class="form-label">{{ $t('watcher.zerobyte.sourcesTitle') }}</label><select v-model="workflowInput.source" class="form-select"><option value="">—</option><option v-for="m in installation.localMounts" :key="m.target" :value="m.target">{{ m.source }} → {{ m.target }}</option></select></div>
                    <div class="col-md-6"><label class="form-label">{{ $t('watcher.zerobyte.destinationsTitle') }}</label><select v-model="workflowInput.destination" class="form-select"><option value="">—</option><option v-for="m in installation.destinationMounts" :key="m.target" :value="m.target">{{ m.source }} → {{ m.target }}</option></select></div>
                </div>
                <label class="form-label">{{ $t('watcher.zerobyte.stopStacks') }}</label>
                <p class="form-text">{{ $t('watcher.zerobyte.stopStacksHelp') }}</p>
                <div class="d-flex flex-wrap gap-3 mb-2"><label v-for="name in workflowStacks" :key="name"><input v-model="workflowInput.stacks" :value="name" type="checkbox" class="form-check-input me-1" />{{ name }}</label></div>
                <button type="button" class="btn btn-normal btn-sm me-2" :disabled="busy || !configuration.hasApiKey" @click="previewWorkflow">{{ $t('watcher.zerobyte.previewPlan') }}</button>
                <div v-if="workflowPlan" class="border rounded p-2 my-2">
                    <p class="mb-1"><strong>{{ workflowPlan.name }}</strong> : <code>{{ workflowPlan.source }}</code> → <code>{{ workflowPlan.repositoryPath }}</code></p>
                    <p class="mb-2">{{ $t('watcher.zerobyte.stopStacks') }} : {{ workflowPlan.stacks.join(', ') || '—' }} · {{ workflowPlan.cron }} · {{ workflowPlan.maxMinutes }} min</p>
                    <p>{{ $t('watcher.zerobyte.planEffect') }}</p>
                    <button type="button" class="btn btn-primary btn-sm" :disabled="busy" @click="provisionWorkflow">{{ $t('watcher.zerobyte.provision') }}</button>
                </div>
                <div v-for="workflow in workflowStatus?.workflows.filter(w => w.blockedTasks?.length) || []" :key="workflow.id" class="alert alert-danger mt-2">
                    {{ workflow.name }} — {{ $t('watcher.zerobyte.workflowPaused') }}
                    <button type="button" class="btn btn-outline-danger btn-sm ms-2" :disabled="busy" @click="acknowledgeWorkflow(workflow.id)">{{ $t('watcher.zerobyte.acknowledgeWorkflow') }}</button>
                </div>
                <div v-if="workflowStatus?.active" class="alert alert-info mt-2">{{ $t('watcher.zerobyte.workflowActive') }} : {{ workflowStatus.active.workflow }}</div>
                <ul v-if="workflowStatus?.events?.length" class="small mt-3 mb-0"><li v-for="event in workflowStatus.events" :key="event.at + event.workflow" :class="event.state === 'failure' ? 'text-danger' : ''">{{ date(event.at) }} · {{ event.state }} · {{ event.detail }}</li></ul>
            </div>
            <div v-for="workflow in workflowStatus?.workflows" :key="'recovery-' + workflow.id" class="border rounded p-2 mb-2" role="status">
                <p v-if="!workflow.protected" class="text-warning mb-1">{{ $t('watcher.zerobyte.migrationPending') }}</p>
                <strong>{{ workflow.name }}</strong> · {{ $t('watcher.zerobyte.recovery.' + workflow.recovery) }}
                <p v-if="workflow.blockedTasks?.length" class="text-warning mb-1">{{ $t('watcher.zerobyte.workflowPaused') }}</p>
                <p v-if="workflow.recovery === 'required'" class="text-danger mb-1">{{ $t('watcher.zerobyte.recoveryAction') }}</p>
            </div>
            <details class="border rounded p-3 mb-3">
                <summary>{{ $t('watcher.zerobyte.federationTitle') }}</summary>
                <p class="form-text mt-2">{{ $t('watcher.zerobyte.federationHelp') }}</p>
                <button type="button" class="btn btn-normal btn-sm mb-2" :disabled="busy" @click="loadFederation">{{ $t('watcher.zerobyte.refresh') }}</button>
                <div v-for="peer in federation" :key="peer.endpoint" class="border-top py-2 small"><strong>{{ peer.name }}</strong> — {{ !peer.online ? $t('watcher.zerobyte.peerOffline') : !peer.summary.enabled ? $t('watcher.zerobyte.peerDisabled') : !peer.summary.reachable ? $t('watcher.zerobyte.peerUnavailable') : $t('watcher.zerobyte.peerCounts', { jobs: peer.summary.jobs, failed: peer.summary.failedJobs, active: peer.summary.activeTasks }) }}</div>
            </details>
            <div v-if="configuration.enabled" class="row g-3 mb-3">
                <div class="col-md-6">
                    <label class="form-label" for="zerobyte-url">{{ $t('watcher.zerobyte.url') }}</label>
                    <input id="zerobyte-url" v-model.trim="configuration.url" type="url" class="form-control" placeholder="http://zerobyte:4096" autocomplete="off" @input="clearExternalApproval" />
                </div>
                <div class="col-md-6">
                    <label class="form-label" for="zerobyte-key">{{ $t('watcher.zerobyte.key') }}</label>
                    <input id="zerobyte-key" v-model="apiKey" type="password" class="form-control" :placeholder="configuration.hasApiKey ? $t('watcher.zerobyte.keySaved') : $t('watcher.zerobyte.key')" autocomplete="new-password" @input="clearExternalApproval" />
                </div>
            </div>
            <details v-if="connectionMode === 'existing'" class="border rounded p-3 mb-3">
                <summary>{{ $t('watcher.zerobyte.diagnostics') }}</summary>
                <p class="form-text">{{ $t('watcher.zerobyte.diagnosticHelp') }}</p>
                <button type="button" class="btn btn-normal btn-sm" :disabled="busy" @click="loadDiagnostics">{{ $t('watcher.zerobyte.test') }}</button>
                <ul v-if="diagnostics.length" class="small mt-2"><li v-for="check in diagnostics" :key="check.key">{{ $t('watcher.zerobyte.check.' + check.key) }} — {{ $t('watcher.zerobyte.checkState.' + check.state) }}</li></ul>
            </details>
            <div v-if="migrationPlan" class="alert alert-warning">
                <strong>{{ $t('watcher.zerobyte.migrationTitle') }}</strong>
                <p>{{ $t('watcher.zerobyte.migrationHelp') }}</p>
                <pre class="small text-wrap">{{ JSON.stringify(migrationPlan, null, 2) }}</pre>
                <button type="button" class="btn btn-primary btn-sm" :disabled="busy" @click="applyMigration">{{ $t('watcher.zerobyte.migrationApply') }}</button>
                <button type="button" class="btn btn-normal btn-sm ms-2" @click="migrationPlan = null">{{ $t('watcher.zerobyte.migrationCancel') }}</button>
            </div>
            <div class="d-flex flex-wrap gap-2 mb-2">
                <button type="button" class="btn btn-primary btn-sm" :disabled="busy" @click="save">{{ $t('watcher.zerobyte.save') }}</button>
                <button v-if="configuration.enabled" type="button" class="btn btn-normal btn-sm" :disabled="busy || !configuration.hasApiKey" @click="test">{{ $t('watcher.zerobyte.test') }}</button>
                <button v-if="configuration.enabled" type="button" class="btn btn-normal btn-sm" :disabled="busy || !configuration.hasApiKey" @click="loadOverview">{{ $t('watcher.zerobyte.refresh') }}</button>
            </div>
            <p v-if="message" class="small mb-2" :class="error ? 'text-danger' : 'text-success'" role="status">{{ message }}</p>
            <template v-if="configuration.enabled && overview">
                <hr class="my-3" />
                <h6>{{ $t('watcher.zerobyte.phase1') }}</h6>
                <p class="form-text">{{ $t('watcher.zerobyte.overviewHint') }}</p>
                <div class="row g-2 mb-3">
                    <div v-for="repo in overview.repositories" :key="repo.shortId" class="col-md-6 col-xl-4">
                        <div class="border rounded p-2 h-100">
                            <strong class="d-block text-truncate">{{ repo.name }}</strong>
                            <small class="form-text">{{ $t('watcher.zerobyte.snapshots') }}: {{ repo.snapshotCount ?? '—' }} · {{ $t('watcher.zerobyte.storage') }}: {{ bytes(repo.storedBytes) }}</small>
                        </div>
                    </div>
                </div>
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <h6 class="mb-0">{{ $t('watcher.zerobyte.phase2') }}</h6>
                    <small class="form-text">{{ overview.tasks.length }} {{ $t('watcher.zerobyte.tasks') }}</small>
                </div>
                <div v-if="overview.jobs.length === 0" class="form-text mb-3">{{ $t('watcher.zerobyte.noJobs') }}</div>
                <div v-for="job in overview.jobs" :key="job.shortId" class="border rounded p-2 mb-2">
                    <div class="d-flex flex-wrap justify-content-between gap-2 align-items-center">
                        <div>
                            <strong>{{ job.name }}</strong>
                            <small v-if="!workflowStatus?.workflows.some(w => w.jobId === job.shortId && w.protected)" class="d-block text-warning">{{ $t('watcher.zerobyte.legacyJobWarning') }}</small>
                            <span class="badge ms-2" :class="job.lastBackupStatus === 'success' ? 'bg-success' : 'bg-secondary'">{{ job.lastBackupStatus || '—' }}</span>
                            <div class="form-text small">{{ $t('watcher.zerobyte.last') }}: {{ date(job.lastBackupAt) }} · {{ $t('watcher.zerobyte.next') }}: {{ date(job.nextBackupAt) }}</div>
                        </div>
                        <div class="d-flex flex-wrap gap-2">
                            <button v-if="connectionMode === 'managed' && !job.enabled && !workflowStatus?.workflows.some(w => w.jobId === job.shortId && w.protected)" type="button" class="btn btn-normal btn-sm" :disabled="busy" @click="previewMigration(job.shortId)">{{ $t('watcher.zerobyte.migrationTitle') }}</button>
                            <button type="button" class="btn btn-primary btn-sm" :disabled="busy || Boolean(workflowStatus?.active) || workflowStatus?.workflows.some(w => w.jobId === job.shortId && (!w.protected || w.blockedTasks?.length))" @click="run(job.shortId)">{{ $t('watcher.zerobyte.run') }}</button>
                            <button type="button" class="btn btn-outline-danger btn-sm" :disabled="busy" @click="cleanup(job.shortId, job.name)">{{ $t('watcher.zerobyte.cleanup') }}</button>
                        </div>
                    </div>
                </div>
                <details class="mt-3">
                    <summary class="fw-semibold">{{ $t('watcher.zerobyte.phase3') }}</summary>
                    <p class="form-text mt-2">{{ $t('watcher.zerobyte.createHint') }}</p>
                    <div class="row g-2 align-items-end mb-3">
                        <div class="col-md-3"><label class="form-label">{{ $t('watcher.zerobyte.jobName') }}</label><input v-model.trim="newJob.name" class="form-control" maxlength="80" /></div>
                        <div class="col-md-3">
                            <label class="form-label">{{ $t('watcher.zerobyte.volume') }}</label>
                            <select v-model.number="newJob.volumeId" class="form-select"><option :value="0">—</option><option v-for="vol in overview.volumes.filter(v => v.numericId !== null)" :key="vol.id" :value="vol.numericId">{{ vol.name }} ({{ vol.status || '—' }})</option></select>
                        </div>
                        <div class="col-md-3"><label class="form-label">{{ $t('watcher.zerobyte.repository') }}</label><select v-model="newJob.repositoryId" class="form-select"><option value="">—</option><option v-for="repo in overview.repositories" :key="repo.shortId" :value="repo.shortId">{{ repo.name }}</option></select></div>
                        <div class="col-md-3"><label class="form-label">{{ $t('watcher.zerobyte.cron') }}</label><input v-model.trim="newJob.cronExpression" class="form-control" placeholder="0 3 * * *" /></div>
                    </div>
                    <button type="button" class="btn btn-normal btn-sm mb-3" :disabled="busy || !newJob.name || !newJob.volumeId || !newJob.repositoryId" @click="createJob">{{ $t('watcher.zerobyte.create') }}</button>
                    <hr />
                    <p class="form-text">{{ $t('watcher.zerobyte.restoreHint') }}</p>
                    <p v-if="!overview.restoreEnabled" class="text-warning small">{{ $t('watcher.zerobyte.restoreDisabled') }}</p>
                    <div class="d-flex flex-wrap gap-2 mb-2">
                        <select v-model="selectedRepo" class="form-select form-select-sm w-auto" :disabled="busy"><option value="">{{ $t('watcher.zerobyte.repository') }}</option><option v-for="repo in overview.repositories" :key="repo.shortId" :value="repo.shortId">{{ repo.name }}</option></select>
                        <button type="button" class="btn btn-normal btn-sm" :disabled="busy || !selectedRepo" @click="loadSnapshots">{{ $t('watcher.zerobyte.snapshots') }}</button>
                        <select v-model="selectedSnapshot" class="form-select form-select-sm w-auto" :disabled="busy"><option value="">{{ $t('watcher.zerobyte.selectSnapshot') }}</option><option v-for="snapshot in snapshots" :key="snapshot.id" :value="snapshot.id">{{ snapshot.id }} · {{ date(snapshot.time) }}</option></select>
                        <button type="button" class="btn btn-outline-warning btn-sm" :disabled="busy || !overview.restoreEnabled || !selectedSnapshot" @click="restore">{{ $t('watcher.zerobyte.restore') }}</button>
                    </div>
                </details>
            </template>
        </div>
        <p v-if="!configuration.enabled && error && message" class="small text-danger mb-0" role="status">{{ message }}</p>
    </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n/dist/vue-i18n.esm-browser.prod.js";
import { api } from "./shared";

interface ManagedInstallation {
    installed: boolean;
    running: boolean;
    url: string;
    apiUrl?: string;
    port: number | null;
    name: string;
    localMounts: LocalMount[];
    destinationMounts?: LocalMount[];
    remoteResticDestinations?: boolean;
}

interface LocalMount {
    source: string;
    target?: string;
    kind: "bind" | "volume";
    remote?: boolean;
}

interface Config {
    enabled: boolean;
    url: string;
    hasApiKey: boolean;
    restoreEnabled: boolean;
    externalRisksAcknowledged: boolean;
    externalRestoreRoot: string;
}

interface Job {
    shortId: string;
    name: string;
    lastBackupStatus: string | null;
    lastBackupAt: number | null;
    nextBackupAt: number | null;
}

interface Repo {
    shortId: string;
    name: string;
    snapshotCount: number | null;
    storedBytes: number | null;
}

interface Volume {
    id: string;
    numericId: number | null;
    name: string;
    status: string;
}

interface Overview {
    jobs: Job[];
    repositories: Repo[];
    volumes: Volume[];
    tasks: unknown[];
    restoreEnabled: boolean;
}

interface Snapshot {
    id: string;
    hostname: string;
    time: number | null;
}

const { t } = useI18n();
const configuration = ref<Config>({
    enabled: false,
    url: "",
    hasApiKey: false,
    restoreEnabled: false,
    externalRisksAcknowledged: false,
    externalRestoreRoot: "",
});
const connectionMode = ref<"existing" | "managed">("existing");
const installUrl = ref("http://127.0.0.1:14097");
const installation = ref<ManagedInstallation | null>(null);
const remoteResticDestinations = ref(false);
const remoteSeparationConfirmed = ref(false);
const localMounts = ref<LocalMount[]>([]);
const destinationMounts = ref<LocalMount[]>([]);
const originalMounts = ref<string[]>([]);
const originalDestinations = ref<string[]>([]);
const selectedMounts = (items: LocalMount[]) => items.filter(m => m.source.trim()).map(m => ({ kind: m.kind,
    source: m.source.trim(),
    remote: m.remote === true }));
const validMountCount = computed(() => selectedMounts(localMounts.value).length > 0 && selectedMounts(destinationMounts.value).length > 0);
const mountsChanged = computed(() =>
    JSON.stringify(selectedMounts(localMounts.value).map(m => `${m.kind}:${m.source}`)) !== JSON.stringify(originalMounts.value) ||
    JSON.stringify(selectedMounts(destinationMounts.value).map(m => `${m.kind}:${m.source}`)) !== JSON.stringify(originalDestinations.value)
);

function addMount(): void {
    if (localMounts.value.length < 12) {
        localMounts.value.push({ source: "",
            kind: "bind" });
    }
}

function removeMount(index: number): void {
    localMounts.value.splice(index, 1);
}

function addDestination(): void {
    if (destinationMounts.value.length < 12) {
        destinationMounts.value.push({ source: "",
            kind: "bind" });
    }
}

function removeDestination(index: number): void {
    destinationMounts.value.splice(index, 1);
}

function syncMounts(): void {
    const originals = installation.value?.localMounts ?? [];
    localMounts.value = originals.map(m => ({ ...m }));
    originalMounts.value = originals.map(m => `${m.kind}:${m.source}`);
    const destinations = installation.value?.destinationMounts ?? [];
    destinationMounts.value = destinations.map(m => ({ ...m }));
    originalDestinations.value = destinations.map(m => `${m.kind}:${m.source}`);
}

const apiKey = ref("");
const busy = ref(false);
const message = ref("");
const error = ref(false);
const overview = ref<Overview | null>(null);
const snapshots = ref<Snapshot[]>([]);
const selectedRepo = ref("");
const selectedSnapshot = ref("");
const newJob = ref({ name: "",
    volumeId: 0,
    repositoryId: "",
    cronExpression: "0 3 * * *" });

interface WorkflowPlan { id: string;
    name: string;
    source: string;
    destination: string;
    repositoryPath: string;
    stacks: string[];
    cron: string;
    maxMinutes: number }
const workflowInput = ref({ name: "",
    source: "",
    destination: "",
    stacks: [] as string[],
    cron: "0 3 * * *",
    maxMinutes: 30 });
const workflowPlan = ref<WorkflowPlan | null>(null);
const workflowStacks = ref<string[]>([]);
const workflowStatus = ref<{ workflows: { id: string;
    name: string;
    jobId?: string;
    blockedTasks?: string[];
    recovery: string;
    protected: boolean }[];
active: { workflow: string } | null;
events: { workflow: string;
    at: number;
    state: string;
    detail: string }[] } | null>(null);
const diagnostics = ref<{ key: string;
    state: string }[]>([]);
const migrationPlan = ref<Record<string, unknown> | null>(null);
async function loadDiagnostics() {
    await action(async () => {
        const result = await api("GET", "/zerobyte/diagnostics");
        if (!result.ok) {
            throw new Error(result.message);
        }
        diagnostics.value = result.data.checks;
    });
}
async function previewMigration(jobId: string) {
    await action(async () => {
        const result = await api("POST", "/zerobyte/workflows/migration/plan", { jobId,
            stacks: workflowInput.value.stacks,
            maxMinutes: workflowInput.value.maxMinutes });
        if (!result.ok) {
            throw new Error(result.message);
        }
        migrationPlan.value = result.data;
    });
}
async function applyMigration() {
    if (!migrationPlan.value || !window.confirm(t("watcher.zerobyte.migrationHelp"))) {
        return;
    }
    await action(async () => {
        const result = await api("POST", "/zerobyte/workflows/migration/apply", { ...migrationPlan.value,
            confirmation: "MIGRATE ZEROBYTE" });
        if (!result.ok) {
            throw new Error(result.message);
        }
        migrationPlan.value = null;
        await loadWorkflowStatus();
    });
}
const federation = ref<{ endpoint: string;
    name: string;
    online: boolean;
    summary: { enabled: boolean;
        reachable: boolean;
        jobs: number;
        failedJobs: number;
        activeTasks: number } }[]>([]);
function clearExternalApproval() {
    configuration.value.externalRisksAcknowledged = false;
    configuration.value.externalRestoreRoot = "";
}
async function loadWorkflowStatus(refreshStacks = false) {
    const result = await api("GET", "/zerobyte/workflows");
    if (result.ok) {
        workflowStatus.value = result.data;
    }
    if (refreshStacks && installation.value?.installed) {
        const stacks = await api("GET", "/zerobyte/workflows/stacks");
        if (stacks.ok) {
            workflowStacks.value = stacks.data;
        }
    }
}
async function previewWorkflow() {
    await action(async () => {
        const result = await api("POST", "/zerobyte/workflows/plan", workflowInput.value);
        if (!result.ok) {
            throw new Error(result.message);
        }
        workflowPlan.value = result.data;
    });
}
async function provisionWorkflow() {
    if (!workflowPlan.value || !window.confirm(t("watcher.zerobyte.provisionConfirm"))) {
        return;
    }
    const plan = workflowPlan.value;
    await action(async () => {
        const result = await api("POST", "/zerobyte/workflows/provision", { ...plan,
            confirmation: "PROVISION ZEROBYTE" });
        if (!result.ok) {
            throw new Error(result.message);
        }
        notice(t("watcher.zerobyte.provisioned"));
        workflowPlan.value = null;
        await loadWorkflowStatus();
    });
    await loadOverview();
}
async function acknowledgeWorkflow(id: string) {
    if (!window.confirm(t("watcher.zerobyte.acknowledgeConfirm"))) {
        return;
    }
    await action(async () => {
        const result = await api("POST", `/zerobyte/workflows/${id}/acknowledge`, { confirmation: "ACKNOWLEDGE WORKFLOW" });
        if (!result.ok) {
            throw new Error(result.message);
        }
        await loadWorkflowStatus();
    });
}
async function loadFederation() {
    await action(async () => {
        const result = await api("GET", "/zerobyte/federation");
        if (!result.ok) {
            throw new Error(result.message);
        }
        federation.value = result.data;
    });
}

function bytes(n: number | null): string {
    return n == null ? "—" : `${(n / 1024 ** 3).toFixed(2)} GiB`;
}

function date(n: number | null): string {
    return n == null ? "—" : new Date(n < 1e12 ? n * 1000 : n).toLocaleString();
}

function notice(text: string, failed = false): void {
    message.value = text;
    error.value = failed;
}

async function action<T>(fn: () => Promise<T>): Promise<T | null> {
    busy.value = true;
    try {
        return await fn();
    } catch (e) {
        notice(e instanceof Error ? e.message : String(e), true);
        return null;
    } finally {
        busy.value = false;
    }
}

async function loadInstallation() {
    await action(async () => {
        const r = await api("GET", "/zerobyte/managed");
        if (!r.ok) {
            throw new Error(r.message);
        }
        installation.value = r.data as ManagedInstallation;
        remoteResticDestinations.value = installation.value.remoteResticDestinations === true;
        syncMounts();
        if (installation.value.installed) {
            connectionMode.value = "managed";
        }
    });
}

async function install() {
    if (!window.confirm(t("watcher.zerobyte.installConfirm"))) {
        return;
    }
    await action(async () => {
        const r = await api("POST", "/zerobyte/managed/install", {
            url: installUrl.value,
            localMounts: selectedMounts(localMounts.value),
            destinationMounts: selectedMounts(destinationMounts.value),
            attestNoRemoteOverlap: remoteSeparationConfirmed.value,
            confirmation: "INSTALL ZEROBYTE",
        });
        if (!r.ok) {
            throw new Error(r.message);
        }
        installation.value = r.data as ManagedInstallation;
        syncMounts();
        configuration.value.url = installation.value.apiUrl || installation.value.url;
        notice(t("watcher.zerobyte.installSuccess"));
    });
}

async function updateMounts() {
    if (!window.confirm(t("watcher.zerobyte.applyMountsConfirm"))) {
        return;
    }
    await action(async () => {
        const r = await api("POST", "/zerobyte/managed/mounts", {
            localMounts: selectedMounts(localMounts.value),
            destinationMounts: selectedMounts(destinationMounts.value),
            attestNoRemoteOverlap: remoteSeparationConfirmed.value,
            confirmation: "UPDATE ZEROBYTE MOUNTS",
        });
        if (!r.ok) {
            throw new Error(r.message);
        }
        installation.value = r.data as ManagedInstallation;
        syncMounts();
        notice(t("watcher.zerobyte.mountsSaved"));
    });
}

async function load() {
    await action(async () => {
        const r = await api("GET", "/zerobyte/settings");
        if (!r.ok) {
            throw new Error(r.message);
        }
        configuration.value = r.data as Config;
    });
    if (configuration.value.enabled) {
        await loadOverview();
    }
}

async function toggleEnabled() {
    // Enabling opens the panel; configuration is saved after the URL and key are entered.
    // Disabling persists immediately, otherwise the collapsed panel would hide Save.
    await save();
}

async function save() {
    await action(async () => {
        const r = await api("POST", "/zerobyte/settings", {
            enabled: configuration.value.enabled,
            url: configuration.value.url,
            acknowledgeExternalRisks: configuration.value.externalRisksAcknowledged,
            externalRestoreRoot: configuration.value.externalRestoreRoot,
            ...(apiKey.value ? { apiKey: apiKey.value } : {}),
        });
        if (!r.ok) {
            throw new Error(r.message);
        }
        configuration.value = r.data as Config;
        apiKey.value = "";
        if (!configuration.value.enabled) {
            overview.value = null;
        }
        notice(t("watcher.zerobyte.saved"));
    });
    if (configuration.value.enabled && configuration.value.hasApiKey) {
        await loadOverview();
    }
}

async function test() {
    await action(async () => {
        const r = await api("POST", "/zerobyte/test");
        if (!r.ok) {
            throw new Error(r.message);
        }
        notice(`${t("watcher.zerobyte.connected")} (${r.data.version})`);
    });
}

async function loadOverview() {
    await action(async () => {
        const r = await api("GET", "/zerobyte/overview");
        if (!r.ok) {
            throw new Error(r.message);
        }
        overview.value = r.data as Overview;
        await loadWorkflowStatus();
    });
}

async function run(jobId: string) {
    if (!window.confirm(t("watcher.zerobyte.confirmBackup"))) {
        return;
    }
    await action(async () => {
        const r = await api("POST", `/zerobyte/backups/${encodeURIComponent(jobId)}/run`, { confirmation: "BACKUP" });
        if (!r.ok) {
            throw new Error(r.message);
        }
        notice(t("watcher.zerobyte.started"));
    });
    await loadOverview();
}

async function cleanup(jobId: string, name: string) {
    if (!window.confirm(t("watcher.zerobyte.confirmCleanup", { name }))) {
        return;
    }
    await action(async () => {
        const r = await api("POST", `/zerobyte/backups/${encodeURIComponent(jobId)}/forget`, { confirmation: "CLEANUP" });
        if (!r.ok) {
            throw new Error(r.message);
        }
        notice(t("watcher.zerobyte.started"));
    });
    await loadOverview();
}

async function createJob() {
    await action(async () => {
        const r = await api("POST", "/zerobyte/backups", newJob.value);
        if (!r.ok) {
            throw new Error(r.message);
        }
        notice(t("watcher.zerobyte.createdDisabled"));
    });
    await loadOverview();
}

async function loadSnapshots() {
    selectedSnapshot.value = "";
    snapshots.value = [];
    await action(async () => {
        const r = await api("GET", `/zerobyte/repositories/${encodeURIComponent(selectedRepo.value)}/snapshots`);
        if (!r.ok) {
            throw new Error(r.message);
        }
        snapshots.value = r.data as Snapshot[];
    });
}

async function restore() {
    if (!window.confirm(t("watcher.zerobyte.confirmRestore"))) {
        return;
    }
    await action(async () => {
        const r = await api("POST", `/zerobyte/repositories/${encodeURIComponent(selectedRepo.value)}/restore`, {
            snapshotId: selectedSnapshot.value,
            confirmation: "RESTORE",
        });
        if (!r.ok) {
            throw new Error(r.message);
        }
        notice(`${t("watcher.zerobyte.restoreStarted")} ${r.data.targetPath}`);
    });
}

onMounted(async () => {
    await loadInstallation();
    await load();
    await loadWorkflowStatus(true);
    workflowTimer = window.setInterval(() => {
        if (configuration.value.enabled && !busy.value) {
            void loadWorkflowStatus().catch(() => {});
        }
    }, 5000);
});
let workflowTimer: number | undefined;
onUnmounted(() => {
    if (workflowTimer !== undefined) {
        window.clearInterval(workflowTimer);
    }
});
</script>

<style scoped>
.zerobyte-mount-editor {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: .5rem;
}
.zerobyte-mount-editor select {
    grid-column: 1 / -1;
}
.zerobyte-mount-editor input {
    min-width: 0;
}
</style>
