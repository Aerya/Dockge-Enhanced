<template>
    <section>
        <h2>{{ $t('hosts.title') }} <span class="badge bg-warning text-dark">{{ $t('hosts.beta') }}</span></h2>
        <div v-if="error" class="alert alert-warning">{{ $t(error) }}</div>
        <p>{{ $t('hosts.description') }}</p>
        <div v-if="snapshot" class="d-flex flex-wrap gap-2 mb-3">
            <button v-for="item in sections" :key="item" class="btn btn-sm" :class="section === item ? 'btn-primary' : 'btn-outline-secondary'" @click="section = item">{{ $t('hosts.' + item) }}</button>
        </div>
        <template v-if="snapshot">
            <p v-if="snapshot.report?.provider === 'pacman' || ['opensuse-tumbleweed', 'manjaro', 'endeavouros', 'garuda', 'arch'].includes(snapshot.report?.os)" class="alert alert-warning">{{ $t('hosts.rollingWarning') }}</p>
            <p class="alert alert-info">{{ $t('hosts.riskWarning') }}</p>
            <div class="alert" :class="snapshot.state === 'fresh' ? 'alert-info' : 'alert-warning'">{{ $t('hosts.state.' + snapshot.state) }}</div>
            <template v-if="!snapshot.settings.enabled || section === 'configuration'">
                <p>{{ $t('hosts.prerequisites') }}</p>
                <div class="form-check mb-3">
                    <input id="host-enabled" v-model="settings.enabled" :disabled="snapshot.operations.schedule?.enabled" type="checkbox" class="form-check-input">
                    <label for="host-enabled" class="form-check-label">{{ $t('hosts.enable') }}</label>
                </div>
                <label class="form-label" for="host-stale">{{ $t('hosts.staleHours') }}</label>
                <input id="host-stale" v-model.number="settings.staleHours" class="form-control mb-3" type="number" min="6" max="168">
                <label class="form-label" for="host-retention">{{ $t('hosts.retentionDays') }}</label>
                <input id="host-retention" v-model.number="settings.retentionDays" class="form-control mb-3" type="number" min="1" max="365">
                <label class="d-block mb-3"><input v-model="settings.notifications" type="checkbox"> {{ $t('hosts.notifications') }}</label>
                <div v-if="settings.notifications" class="border rounded p-3 mb-3">
                    <label v-for="event in notificationEvents" :key="event" class="d-block"><input v-model="settings.notificationEvents[event]" type="checkbox"> {{ $t('hosts.notify.' + event) }}</label>
                    <label for="host-severity">{{ $t('hosts.notificationSeverity') }}</label>
                    <select id="host-severity" v-model="settings.notificationSeverity" class="form-select"><option v-for="level in ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']" :key="level" :value="level">{{ $t('hosts.severity.' + level) }}</option></select>
                </div>
                <label class="d-block mb-3"><input v-model="settings.cveEnabled" type="checkbox"> {{ $t('hosts.cveEnable') }}</label>
                <button class="btn btn-primary" :disabled="busy" @click="save">{{ $t('Save') }}</button>
                <p class="mt-3">{{ $t('hosts.operationsUnavailable') }}</p>
                <div v-if="snapshot.operations.automatic || snapshot.operations.schedule" class="border rounded p-3 mt-3">
                    <h3>{{ $t('hosts.scheduleTitle') }}</h3>
                    <p>{{ $t('hosts.scheduleHelp') }}</p>
                    <p>{{ $t(snapshot.operations.schedule?.enabled ? 'hosts.scheduleActive' : 'hosts.scheduleInactive') }}</p>
                    <label class="d-block"><input v-model="schedule.enabled" :disabled="!snapshot.operations.automatic" type="checkbox"> {{ $t('hosts.scheduleEnable') }}</label>
                    <label for="host-schedule-scope">{{ $t('hosts.scope') }}</label>
                    <select id="host-schedule-scope" v-model="schedule.scope" class="form-select"><option v-for="item in snapshot.operations.scopes" :key="item" :value="item">{{ $t('hosts.scope.' + item) }}</option></select>
                    <div class="d-flex flex-wrap gap-3 my-2"><label v-for="day in 7" :key="day"><input v-model="schedule.days" type="checkbox" :value="day - 1"> {{ $t('hosts.day.' + (day - 1)) }}</label></div>
                    <label for="host-schedule-hour">{{ $t('hosts.scheduleHour') }}</label>
                    <input id="host-schedule-hour" v-model.number="schedule.hour" class="form-control" type="number" min="0" max="23">
                    <label for="host-schedule-minute">{{ $t('hosts.scheduleMinute') }}</label>
                    <input id="host-schedule-minute" v-model.number="schedule.minute" class="form-control" type="number" min="0" max="59">
                    <button class="btn btn-warning mt-3" :disabled="busy || pending || !schedule.days.length" @click="saveSchedule">{{ $t('hosts.scheduleSave') }}</button>
                    <p v-if="pending">{{ $t('hosts.pending') }}</p>
                </div>
            </template>
            <template v-else-if="section === 'security'">
                <p>{{ $t('hosts.security.' + snapshot.security.state) }}</p>
                <p v-if="snapshot.security.totalFindings">{{ $t('hosts.securityLimit', { count: snapshot.security.totalFindings }) }}</p>
                <p v-if="snapshot.scanning">{{ $t('hosts.scanning') }}</p>
                <p v-if="snapshot.security.scannedAt">{{ date(snapshot.security.scannedAt) }}</p>
                <div class="table-responsive">
                    <table class="table">
                        <thead><tr><th>{{ $t('hosts.cve') }}</th><th>{{ $t('hosts.package') }}</th><th>{{ $t('hosts.installed') }}</th><th>{{ $t('hosts.fixed') }}</th><th>{{ $t('hosts.severity') }}</th></tr></thead>
                        <tbody><tr v-for="v in snapshot.security.findings" :key="v.id + v.pkg"><td><a :href="v.url" target="_blank" rel="noopener noreferrer">{{ v.id }}</a></td><td>{{ v.pkg }} <small v-if="v.status === 'indeterminate'">{{ $t('hosts.originUnverified') }}</small></td><td>{{ v.installed }}</td><td>{{ v.fixed || '—' }} · {{ $t('hosts.fix.' + v.fix) }}</td><td>{{ v.severity }}</td></tr></tbody>
                    </table>
                </div>
            </template>
            <template v-else-if="section === 'history'">
                <h3>{{ $t('hosts.operationHistory') }}</h3>
                <div class="table-responsive"><table class="table">
                    <thead><tr><th>{{ $t('hosts.collectedAt') }}</th><th>{{ $t('hosts.scope') }}</th><th>{{ $t('hosts.execution') }}</th><th>{{ $t('hosts.packages') }}</th><th>{{ $t('hosts.result') }}</th></tr></thead>
                    <tbody><tr v-for="event in snapshot.operationHistory" :key="event.id + event.state"><td>{{ date(event.at * 1000) }}</td><td>{{ $t('hosts.scope.' + event.scope) }}</td><td>{{ $t(event.automatic ? 'hosts.automatic' : 'hosts.manual') }}</td><td>{{ event.count }}</td><td>{{ $t('hosts.operation.' + event.state) }}</td></tr></tbody>
                </table></div>
                <div class="table-responsive">
                    <table class="table">
                        <thead><tr><th>{{ $t('hosts.collectedAt') }}</th><th>{{ $t('hosts.packages') }}</th><th>{{ $t('hosts.updates') }}</th></tr></thead>
                        <tbody><tr v-for="entry in history" :key="entry.collected_at"><td><button class="btn btn-link" @click="showChanges(entry.collected_at)">{{ date(entry.collected_at) }}</button></td><td>{{ entry.value.packages }}</td><td>{{ entry.value.updates }}</td></tr></tbody>
                    </table>
                </div>
                <div v-if="historyChanges">
                    <p>{{ $t(historyChanges.baseline ? 'hosts.changes' : 'hosts.noBaseline', { count: historyChanges.total }) }}</p>
                    <ul><li v-for="p in historyChanges.changes" :key="p.name + p.arch">{{ p.name }} · {{ p.arch }}: {{ p.before || '—' }} → {{ p.after || '—' }}</li></ul>
                </div>
            </template>
            <template v-else-if="snapshot.report">
                <dl class="row">
                    <dt class="col-sm-4">{{ $t('hosts.host') }}</dt><dd class="col-sm-8">{{ snapshot.report.host }}</dd>
                    <dt class="col-sm-4">{{ $t('hosts.os') }}</dt><dd class="col-sm-8">{{ snapshot.report.osName }} · {{ snapshot.report.arch }}</dd>
                    <dt class="col-sm-4">{{ $t('hosts.kernel') }}</dt><dd class="col-sm-8">{{ snapshot.report.kernel }}</dd>
                    <dt class="col-sm-4">{{ $t('hosts.kernelPackages') }}</dt><dd class="col-sm-8">{{ snapshot.report.kernelPackages.join(', ') || '—' }}</dd>
                    <dt class="col-sm-4">{{ $t('hosts.repositories') }}</dt><dd class="col-sm-8">{{ snapshot.report.repositories?.join(', ') || '—' }}</dd>
                    <dt class="col-sm-4">{{ $t('hosts.uptime') }}</dt><dd class="col-sm-8">{{ Math.floor(snapshot.report.uptime / 3600) }}</dd>
                    <dt class="col-sm-4">{{ $t('hosts.collectedAt') }}</dt><dd class="col-sm-8">{{ date(snapshot.report.collectedAt) }}</dd>
                    <dt class="col-sm-4">{{ $t('hosts.metadata') }}</dt><dd class="col-sm-8">{{ $t('hosts.metadata.' + snapshot.report.metadata) }}</dd>
                    <dt class="col-sm-4">{{ $t('hosts.reboot') }}</dt><dd class="col-sm-8">{{ $t('hosts.reboot.' + snapshot.report.reboot) }}</dd>
                    <dt class="col-sm-4">{{ $t('hosts.packages') }}</dt><dd class="col-sm-8">{{ snapshot.report.packageCount }}</dd>
                    <dt class="col-sm-4">{{ $t('hosts.updates') }}</dt><dd class="col-sm-8">{{ snapshot.report.updateCount }}</dd>
                </dl>
                <template v-if="section === 'packages'">
                    <div v-if="(snapshot.operations.manual && snapshot.state === 'fresh') || snapshot.operations.result" class="border rounded p-3 mb-3">
                        <p>{{ $t('hosts.manualWarning') }}</p>
                        <label for="host-scope">{{ $t('hosts.scope') }}</label>
                        <select id="host-scope" v-model="scope" class="form-select mb-3" @change="approved = false"><option v-for="item in snapshot.operations.scopes" :key="item" :value="item">{{ $t('hosts.scope.' + item) }}</option></select>
                        <p v-if="scope.includes('conservative')">{{ $t('hosts.conservativeHelp') }}</p>
                        <button class="btn btn-outline-primary" :disabled="!snapshot.operations.manual || snapshot.state !== 'fresh' || busy || pending || !snapshot.operations.scopes.includes(scope) || snapshot.operations.result?.state === 'running'" @click="operate('simulate')">{{ $t('hosts.simulate') }}</button>
                        <p v-if="pending">{{ $t('hosts.pending') }}</p>
                        <template v-if="snapshot.operations.result">
                            <p>{{ $t('hosts.operation.' + snapshot.operations.result.state) }}</p>
                            <ul><li v-for="p in snapshot.operations.result.packages" :key="p.name">{{ p.name }}: {{ p.installed }} → {{ p.version }}</li></ul>
                            <template v-if="snapshot.operations.result.state === 'simulated' && snapshot.operations.result.expires * 1000 > Date.now() && snapshot.operations.result.scope === scope">
                                <label class="d-block"><input v-model="approved" type="checkbox"> {{ $t('hosts.approve') }}</label>
                                <button class="btn btn-warning" :disabled="!snapshot.operations.manual || snapshot.state !== 'fresh' || !approved || busy || pending" @click="operate('install')">{{ $t('hosts.install') }}</button>
                            </template>
                        </template>
                    </div>
                    <input v-model="search" class="form-control mb-2" :placeholder="$t('hosts.search')" :aria-label="$t('hosts.search')">
                    <label class="mb-3"><input v-model="updatesOnly" type="checkbox"> {{ $t('hosts.updatesOnly') }}</label>
                    <div class="table-responsive">
                        <table class="table">
                            <thead><tr><th>{{ $t('hosts.package') }}</th><th>{{ $t('hosts.installed') }}</th><th>{{ $t('hosts.available') }}</th><th>{{ $t('hosts.origin') }}</th></tr></thead>
                            <tbody><tr v-for="p in packages" :key="p.name + p.arch"><td>{{ p.name }} · {{ p.arch }}</td><td>{{ p.version }}</td><td>{{ p.available || '—' }}</td><td>{{ $t('hosts.origin.' + p.origin) }} <span v-if="p.held" class="badge bg-secondary">{{ $t('hosts.held') }}</span></td></tr></tbody>
                        </table>
                    </div>
                    <p>{{ $t('hosts.resultLimit') }}</p>
                </template>
            </template>
        </template>
    </section>
</template>
<script>
export default {
    data() {
        return { snapshot: null,
            connectionNonce: null,
            historyChanges: null,
            packageRows: [],
            packageGeneration: 0,
            searchTimer: null,
            approved: false,
            scope: "security",
            notificationEvents: [ "updates", "security", "fix", "reboot", "collector", "securityData", "operationStart", "operationSuccess", "operationFailure", "schedule" ],
            schedule: { enabled: false,
                days: [ 0, 1, 2, 3, 4, 5, 6 ],
                hour: 2,
                minute: 0,
                scope: "security" },
            pending: null,
            pollTimer: null,
            settings: {},
            busy: false,
            error: "",
            section: "overview",
            search: "",
            updatesOnly: false,
            generation: 0,
            sections: [ "overview", "host", "packages", "security", "history", "configuration" ] };
    },
    computed: {
        packages() {
            return this.packageRows;
        },
        history() {
            return (this.snapshot?.history || []).map(e => ({ ...e,
                value: JSON.parse(e.summary) }));
        },
    },
    watch: {
        section() {
            if (this.section === "packages") {
                this.searchPackages();
            }
        },
        search() {
            this.searchPackages();
        },
        updatesOnly() {
            this.searchPackages();
        },
    },
    mounted() {
        this.load();
        this.pollTimer = setInterval(() => this.poll(), 15000);
    },
    beforeUnmount() {
        this.generation++;
        clearInterval(this.pollTimer);
        clearTimeout(this.searchTimer);
        this.packageGeneration++;
    },
    methods: {
        async showChanges(timestamp) {
            this.historyChanges = await this.request("hosts:history", { timestamp: Number(timestamp) });
        },
        searchPackages() {
            clearTimeout(this.searchTimer);
            const generation = ++this.packageGeneration;
            this.searchTimer = setTimeout(async () => {
                const rows = await this.request("hosts:packages", { search: this.search,
                    updatesOnly: this.updatesOnly });
                if (generation === this.packageGeneration && rows) {
                    this.packageRows = rows;
                }
            }, 250);
        },
        async poll() {
            if (this.busy || !this.snapshot) {
                return;
            }
            const generation = this.generation;
            const snapshot = await this.request("hosts:get", {});
            if (generation !== this.generation || !snapshot) {
                return;
            }
            if (snapshot.operations.result?.plan !== this.snapshot.operations.result?.plan) {
                this.approved = false;
            }
            const changedInventory = snapshot.report?.collectedAt !== this.snapshot.report?.collectedAt;
            this.snapshot = snapshot;
            if (changedInventory) {
                this.searchPackages();
            }
            if (this.pending && (snapshot.operations.result?.id === this.pending.id || Date.now() > this.pending.expires)) {
                this.pending = null;
            }
        },
        async saveSchedule() {
            this.busy = true;
            const response = await this.request("hosts:operation", { action: "schedule",
                schedule: this.schedule,
                connectionNonce: this.connectionNonce });
            this.busy = false;
            if (response) {
                this.pending = response;
            } else {
                this.error = "hosts.unavailable";
            }
        },
        async operate(action) {
            this.busy = true;
            const response = await this.request("hosts:operation", action === "simulate" ? { action,
                scope: this.scope,
                connectionNonce: this.connectionNonce } : {
                action,
                connectionNonce: this.connectionNonce,
                scope: this.scope,
                approved: this.approved,
                plan: this.snapshot.operations.result?.plan,
            });
            this.busy = false;
            this.approved = false;
            if (response) {
                this.pending = response;
            } else {
                this.error = "hosts.unavailable";
            }
        },
        date(value) {
            return new Date(typeof value === "number" ? value : value).toLocaleString();
        },
        async request(event, payload) {
            return new Promise(resolve => {
                const timer = setTimeout(() => resolve(null), 10000);
                const callback = response => {
                    clearTimeout(timer);
                    resolve(response?.ok ? response.data : null);
                };
                if (event === "hosts:operation") {
                    const socket = this.$root.getSocket();
                    if (!socket.connected) {
                        clearTimeout(timer);
                        resolve(null);
                        return;
                    }
                    socket.volatile.emit("agent", "", event, payload, callback);
                } else {
                    this.$root.emitAgent("", event, payload, callback);
                }
            });
        },
        async load() {
            const generation = ++this.generation;
            this.busy = true;
            const caps = await this.request("hosts:capabilities", {});
            if (generation !== this.generation) {
                return;
            }
            if (caps?.protocol !== 1) {
                this.error = "hosts.unsupported";
                this.busy = false;
                return;
            }
            this.connectionNonce = caps.connectionNonce;
            const snapshot = await this.request("hosts:get", {});
            if (generation !== this.generation) {
                return;
            }
            this.busy = false;
            if (!snapshot) {
                this.error = "hosts.unavailable";
                return;
            }
            this.snapshot = snapshot;
            this.settings = { ...snapshot.settings,
                notificationEvents: { ...snapshot.settings.notificationEvents } };
            if (snapshot.operations.schedule) {
                this.schedule = { ...snapshot.operations.schedule,
                    days: [ ...snapshot.operations.schedule.days ] };
            }
            if (!snapshot.operations.scopes.includes(this.scope)) {
                this.scope = snapshot.operations.scopes[0] ?? "security";
            }
            this.searchPackages();
        },
        async save() {
            this.busy = true;
            const generation = this.generation;
            const snapshot = await this.request("hosts:settings", this.settings);
            if (generation !== this.generation) {
                return;
            }
            this.busy = false;
            this.error = snapshot ? "" : "hosts.unavailable";
            if (snapshot) {
                this.snapshot = snapshot;
                this.settings = { ...snapshot.settings,
                    notificationEvents: { ...snapshot.settings.notificationEvents } };
                this.searchPackages();
            }
        },
    },
};
</script>
