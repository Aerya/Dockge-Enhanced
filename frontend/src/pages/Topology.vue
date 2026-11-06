<template>
    <main class="topology-page">
        <div class="d-flex gap-3 align-items-center mb-3"><h2 class="me-auto">{{ $t('topology.title') }}</h2><button class="btn btn-normal" :disabled="busy" @click="load">{{ $t('refresh') }}</button></div>
        <p class="small text-secondary">{{ $t('topology.hint') }}</p>
        <div class="d-flex flex-wrap gap-3 align-items-end mb-3">
            <label>{{ $t('topology.view') }}<select v-model="view" class="form-select"><option value="map">{{ $t('topology.title') }}</option><option value="ports">{{ $t('topology.ports') }}</option></select></label>
            <label>{{ $t('topology.instance') }}<select v-model="instance" class="form-select"><option value="*">{{ $t('topology.all') }}</option><option v-for="ep in endpoints" :key="ep" :value="ep">{{ instanceLabel(ep) }}</option></select></label>
            <label>{{ $t('topology.group') }}<select v-model="group" class="form-select"><option value="">{{ $t('topology.all') }}</option><option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option></select></label>
            <label>Stack<select v-model="stack" class="form-select"><option value="">{{ $t('topology.all') }}</option><option v-for="s in stackOptions" :key="s.key" :value="s.key">{{ s.label }}</option></select></label>
            <label><input v-model="stopped" type="checkbox"> {{ $t('topology.stopped') }}</label><label><input v-model="external" type="checkbox"> {{ $t('topology.external') }}</label>
        </div>
        <p v-if="busy" role="status">{{ $t('topology.loading') }}</p>
        <p v-if="groupsError" class="text-warning">{{ $t('topology.groupsUnavailable') }}</p>
        <p v-for="ep in failures" :key="ep" class="alert alert-warning">{{ instanceLabel(ep) }} — {{ $t('topology.unavailable') }}</p>
        <TopologyInstance v-for="entry in entries" :key="entry.endpoint" :snapshot="entry.snapshot" :containers="entry.containers" :context-ids="entry.contextIds" :endpoint="entry.endpoint" :label="instanceLabel(entry.endpoint)" :view="view" />
        <p v-if="!busy && !entries.length">{{ $t('topology.empty') }}</p>
        <p class="small text-secondary">{{ $t('topology.webHint') }} {{ $t('topology.sharedHint') }}</p>
    </main>
</template>
<script>
import TopologyInstance from "../components/TopologyInstance.vue";
import { topologyOwner } from "../../../common/docker-topology";
import { stackIdentity } from "../../../common/stack-groups";
export default {
    components: { TopologyInstance },
    data: () => ({ view: "map",
        instance: "",
        group: "",
        stack: "",
        stopped: false,
        external: true,
        snapshots: {},
        failures: [],
        groups: [],
        groupsError: false,
        busy: false,
        generation: 0 }),
    computed: {
        endpoints() {
            return [ ...new Set([ "", ...Object.keys(this.$root.agentList || {}) ]) ];
        },
        stackOptions() {
            return Object.entries(this.snapshots).filter(([ ep ]) => this.instance === "*" || this.instance === ep).flatMap(([ endpoint, snapshot ]) => [ ...new Set(snapshot.containers.filter(c => this.accept(c, endpoint, false)).map(c => c.stack)) ].map(name => ({ key: stackIdentity({ name,
                endpoint }),
            label: (name || this.$t("topology.unmanaged")) + " · " + this.instanceLabel(endpoint) }))).sort((a, b) => a.label.localeCompare(b.label));
        },
        entries() {
            return Object.entries(this.snapshots).filter(([ ep ]) => this.instance === "*" || this.instance === ep).map(([ endpoint, snapshot ]) => {
                const selected = snapshot.containers.filter(c => this.accept(c, endpoint));
                const context = snapshot.containers.filter(c => selected.some(item => topologyOwner(item, snapshot.containers)?.id === c.id) && !selected.includes(c));
                return { endpoint,
                    snapshot,
                    containers: [ ...selected, ...context ],
                    contextIds: context.map(c => c.id) };
            }).filter(e => e.containers.length || e.snapshot.unavailable);
        },
    },
    watch: {
        instance() {
            this.stack = "";
        },
        group() {
            this.stack = "";
            if (this.group) {
                this.instance = "*";
            }
        },
        endpoints() {
            this.load();
        },
        "$root.username"() {
            this.invalidate();
            this.groups = [];
            this.group = "";
            this.load();
        },
    },
    mounted() {
        const socket = this.$root.getSocket();
        socket.on("connect", this.load);
        socket.on("disconnect", this.invalidate);
        socket.on("stackGroups:changed", this.loadGroups);
        this.load();
    },
    beforeUnmount() {
        this.invalidate();
        const socket = this.$root.getSocket();
        socket.off("connect", this.load);
        socket.off("disconnect", this.invalidate);
        socket.off("stackGroups:changed", this.loadGroups);
    },
    methods: {
        instanceLabel(ep) {
            return this.$root.endpointDisplayFunction(ep) || this.$t("localInstance");
        },
        accept(c, endpoint, filterStack = true) {
            const key = stackIdentity({ name: c.stack,
                endpoint });
            return (this.stopped || c.state === "running") && (this.external || !c.external)
                && (!this.group || this.groups.find(g => g.id === this.group)?.members.includes(key))
                && (!filterStack || !this.stack || key === this.stack);
        },
        invalidate() {
            this.generation++;
            this.snapshots = {};
            this.busy = false;
            this.failures = this.endpoints;
        },
        request(endpoint, event) {
            return new Promise(resolve => {
                const timeout = setTimeout(() => resolve({ ok: false }), 90000);
                const callback = result => {
                    clearTimeout(timeout);
                    resolve(result || { ok: false });
                };
                if (event === "stackGroups:get") {
                    this.$root.getSocket().emit(event, callback);
                } else {
                    this.$root.emitAgent(endpoint, event, callback);
                }
            });
        },
        async loadGroups() {
            const generation = this.generation;
            const result = await this.request("", "stackGroups:get");
            if (generation !== this.generation) {
                return;
            }
            this.groupsError = !result.ok;
            this.groups = result.ok ? result.config.preferences.groups : [];
            if (this.group && !this.groups.some(g => g.id === this.group)) {
                this.group = "";
            }
        },
        async load() {
            if (this.$root.userAccess?.role !== "admin") {
                this.invalidate();
                return;
            }
            const generation = ++this.generation;
            this.busy = true;
            this.snapshots = {};
            this.failures = [];
            const groups = this.loadGroups();
            const pending = [ ...this.endpoints ];
            const worker = async () => {
                while (pending.length && generation === this.generation) {
                    const endpoint = pending.shift();
                    const result = await this.request(endpoint, "topology:get");
                    if (generation !== this.generation) {
                        return;
                    }
                    if (result.ok && Array.isArray(result.snapshot?.containers) && Array.isArray(result.snapshot?.networks)) {
                        this.snapshots = { ...this.snapshots,
                            [endpoint]: result.snapshot };
                    } else {
                        this.failures.push(endpoint);
                    }
                }
            };
            await Promise.all([ worker(), worker(), groups ]);
            if (generation === this.generation) {
                this.busy = false;
                if (!this.stack && !this.group && this.view === "map") {
                    this.stack = this.stackOptions[0]?.key || "";
                }
            }
        },
    },
};
</script>
<style scoped>.topology-page { padding: 1rem; } label { max-width: 100%; } select { max-width: 24rem; }</style>
