<template>
    <section class="shadow-box p-3 mb-3 topology-instance">
        <h3 class="h5">{{ label }}</h3>
        <p class="small text-secondary">{{ $t('topology.snapshot') }} {{ snapshot.capturedAt }} · {{ snapshot.containers.length }} {{ $t('topology.containers') }}</p>
        <p v-if="snapshot.unavailable" class="text-warning">{{ $t('topology.partial', { count: snapshot.unavailable }) }}</p>
        <p v-if="!containers.length">{{ $t('topology.empty') }}</p>
        <div v-else-if="view === 'ports'" class="table-responsive">
            <table class="table table-sm">
                <thead><tr><th>{{ $t('topology.address') }}</th><th :aria-sort="descending ? 'descending' : 'ascending'"><button class="btn btn-link p-0" @click="descending = !descending">{{ $t('topology.port') }} {{ descending ? '↓' : '↑' }}</button></th><th>{{ $t('topology.target') }}</th><th>{{ $t('topology.protocol') }}</th><th>Stack / {{ $t('topology.service') }}</th><th>{{ $t('topology.containers') }}</th></tr></thead>
                <tbody>
                    <tr v-for="row in portRows" :key="row.key">
                        <td>{{ row.port.address }}</td><td><a v-if="portUrl(row.port)" :href="portUrl(row.port)" target="_blank" rel="noopener noreferrer" :title="$t('topology.webHint')">{{ row.port.published }} ↗</a><span v-else>{{ row.port.published }}</span></td>
                        <td>{{ row.port.target }}</td><td>{{ row.port.protocol.toUpperCase() }}</td><td><router-link v-if="route(row.container)" :to="route(row.container)">{{ row.container.stack }}</router-link><span v-else>{{ $t('topology.unmanaged') }}</span><small class="d-block">{{ row.container.service }}</small></td>
                        <td><router-link v-if="route(row.container, true)" :to="route(row.container, true)">{{ row.container.name }}</router-link><span v-else>{{ row.container.name }}</span><small v-if="row.container.external" class="d-block">{{ $t('topology.externalBadge') }}</small></td>
                    </tr>
                </tbody>
            </table>
            <p v-if="!portRows.length" class="small">{{ $t('topology.noPorts') }}</p>
        </div>
        <div v-else ref="graph" class="topology-graph">
            <svg class="topology-lines" aria-hidden="true"><path v-for="(path, index) in paths" :key="index" :d="path.d" :class="{ shared: path.shared }" /></svg>
            <div><h4>{{ $t('topology.networks') }}</h4><button v-for="node in networkNodes" :key="node.key" class="topology-node btn btn-normal" :data-node="node.key" @click="selected = node.info"><strong>{{ node.name }}</strong><small>{{ node.caption }}</small></button></div>
            <div>
                <h4>{{ $t('topology.containers') }}</h4><div v-for="container in containers" :key="container.id" class="topology-node" :data-node="'c-' + container.id">
                    <button class="btn btn-link p-0 text-start" @click="selectContainer(container)">{{ container.name }}</button><small>{{ container.service }} · {{ container.state === 'running' ? $t('topology.running') : $t('topology.notRunning') }}</small><small v-if="container.external">{{ $t('topology.externalBadge') }}</small><small v-if="contextIds.includes(container.id)">{{ $t('topology.context') }}</small>
                    <div class="d-flex gap-2 mt-2"><router-link v-if="route(container)" :to="route(container)" class="small">Stack ↗</router-link><router-link v-if="route(container, true)" :to="route(container, true)" class="small">{{ $t('topology.details') }} ↗</router-link></div>
                </div>
            </div>
            <div><h4>{{ $t('topology.ports') }}</h4><div v-for="container in publishing" :key="container.id" class="topology-node" :data-node="'p-' + container.id"><strong>{{ container.name }}</strong><div v-for="(port, index) in container.ports" :key="index" class="small mt-1"><a v-if="portUrl(port)" :href="portUrl(port)" :title="$t('topology.webHint')" target="_blank" rel="noopener noreferrer">{{ port.address.includes(':') ? '[' + port.address + ']' : port.address }}:{{ port.published }} ↗</a><span v-else>{{ port.address }}:{{ port.published }}</span> → {{ port.target }}/{{ port.protocol }}</div></div><p v-if="!publishing.length" class="small">{{ $t('topology.noPorts') }}</p></div>
        </div>
        <div v-if="selected" class="small mt-3 topology-detail" aria-live="polite">{{ selected }}</div>
        <p v-if="containers.some(c => c.mode === 'host')" class="small text-warning mt-2">{{ $t('topology.hostNotice') }}</p>
    </section>
</template>
<script>
import { topologyOwner } from "../../../common/docker-topology";
import { topologyPortUrl, topologyRoute } from "../topology";
export default {
    props: { snapshot: { type: Object,
        required: true },
    containers: { type: Array,
        required: true },
    contextIds: { type: Array,
        default: () => [] },
    endpoint: { type: String,
        default: "" },
    label: { type: String,
        required: true },
    view: { type: String,
        default: "map" } },
    data: () => ({ paths: [],
        descending: false,
        selected: "",
        observer: null }),
    computed: {
        publishing() {
            return this.containers.filter(c => c.ports.length);
        },
        portRows() {
            return this.containers.flatMap(c => c.ports.map((port, i) => ({ key: c.id + ":" + i,
                container: c,
                port }))).sort((a, b) => (this.descending ? -1 : 1) * (a.port.published - b.port.published || a.port.protocol.localeCompare(b.port.protocol)));
        },
        networkNodes() {
            const nodes = new Map();
            for (const c of this.containers) {
                if (c.mode.startsWith("container:")) {
                    const owner = topologyOwner(c, this.snapshot.containers);
                    const name = owner?.name || this.$t("topology.missingOwner");
                    nodes.set(c.mode, { key: c.mode,
                        name,
                        caption: this.$t("topology.shared"),
                        info: name + " · " + this.$t("topology.sharedHint") });
                } else {
                    for (const n of c.networks) {
                        const meta = this.snapshot.networks.find(net => net.name === n.name);
                        nodes.set("n-" + n.name, { key: "n-" + n.name,
                            name: n.name,
                            caption: meta?.driver || "",
                            info: [ n.name, meta?.driver, ...(meta?.subnets || []), ...this.snapshot.containers.filter(item => item.networks.some(net => net.name === n.name)).map(item => item.name) ].filter(Boolean).join(" · ") });
                    }
                }
            }
            return [ ...nodes.values() ];
        },
    },
    watch: { containers() {
        this.selected = "";
        this.$nextTick(this.draw);
    },
    view() {
        this.$nextTick(this.observe);
    } },
    mounted() {
        this.observe();
    },
    beforeUnmount() {
        this.observer?.disconnect();
    },
    methods: {
        route(container, details) {
            return topologyRoute(container, this.endpoint, details);
        },
        portUrl(port) {
            return topologyPortUrl(port, this.snapshot, this.endpoint, this.$root.agentList[this.endpoint]?.url, location.hostname, location.protocol);
        },
        selectContainer(c) {
            const owner = topologyOwner(c, this.snapshot.containers);
            this.selected = [ c.name, c.stack || this.$t("topology.unmanaged"), owner ? this.$t("topology.shared") + ": " + owner.name : c.mode, ...c.networks.map(n => n.name + " " + n.ip) ].join(" · ");
        },
        observe() {
            this.observer?.disconnect();
            if (this.$refs.graph) {
                this.observer = new ResizeObserver(this.draw);
                this.observer.observe(this.$refs.graph);
                this.draw();
            }
        },
        draw() {
            if (!this.$refs.graph) {
                this.paths = [];
                return;
            }
            const box = this.$refs.graph.getBoundingClientRect();
            const elements = new Map([ ...this.$refs.graph.querySelectorAll("[data-node]") ].map(n => [ n.dataset.node, n.getBoundingClientRect() ]));
            const paths = [];
            const add = (a, b, shared = false) => {
                const x = elements.get(a);
                const y = elements.get(b);
                if (!x || !y) {
                    return;
                }
                const x1 = x.right - box.left;
                const x2 = y.left - box.left;
                const y1 = x.top + x.height / 2 - box.top;
                const y2 = y.top + y.height / 2 - box.top;
                paths.push({ d: "M" + x1 + " " + y1 + " C" + (x1 + x2) / 2 + " " + y1 + "," + (x1 + x2) / 2 + " " + y2 + "," + x2 + " " + y2,
                    shared });
            };
            for (const c of this.containers) {
                if (c.mode.startsWith("container:")) {
                    add(c.mode, "c-" + c.id, true);
                } else {
                    for (const n of c.networks) {
                        add("n-" + n.name, "c-" + c.id);
                    }
                }
                if (c.ports.length) {
                    add("c-" + c.id, "p-" + c.id);
                }
            }
            this.paths = paths;
        },
    },
};
</script>
<style scoped lang="scss">
.topology-graph { position: relative; display: grid; grid-template-columns: 1fr 1.1fr 1.2fr; gap: 24px; > div { z-index: 1; min-width: 0; } h4 { font-size: 0.8rem; margin: 1rem 0; } }
.topology-node { display: block; width: 100%; text-align: left; padding: 12px; margin-bottom: 12px; border: 1px solid var(--border-strong); border-radius: 8px; background: var(--bg-surface); overflow-wrap: anywhere; strong, small { display: block; } small { opacity: .8; } }
.topology-lines { position: absolute; width: 100%; height: 100%; pointer-events: none; path { stroke: var(--border-strong); stroke-width: 1.5; fill: none; } .shared { stroke-dasharray: 4 4; } }
.topology-detail { border-top: 1px solid var(--border-strong); padding-top: 12px; overflow-wrap: anywhere; }
@media(max-width: 800px) { .topology-graph { grid-template-columns: 1fr; } .topology-lines { display: none; } }
</style>
