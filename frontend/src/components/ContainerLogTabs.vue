<template>
    <section class="container-log-tabs mb-2">
        <div class="log-tabs" role="tablist" :aria-label="$t('logTabs.heading')">
            <button type="button" role="tab" :aria-selected="!selected" :class="{ active: !selected }" @click="select('')">{{ $t("logServiceAll") }}</button>
            <button v-for="container in containers" :key="container.id" type="button" role="tab" :aria-selected="selected === container.id" :class="{ active: selected === container.id }" :title="container.id" @click="select(container.id)">
                {{ container.name || container.service }} <small>{{ container.id.slice(0, 8) }}</small>
            </button>
        </div>
        <div v-if="selected && view" role="tabpanel" :aria-label="selected" class="mt-2">
            <div class="d-flex flex-wrap gap-2 mb-2">
                <input v-model="view.search" type="search" class="form-control form-control-sm log-search" :placeholder="$t('logSearchPlaceholder')" :aria-label="$t('logSearchPlaceholder')">
                <button type="button" class="btn btn-sm btn-normal" @click="view.paused = !view.paused">{{ $t(view.paused ? 'logTabs.resume' : 'logTabs.pause') }}</button>
                <button type="button" class="btn btn-sm btn-normal" :disabled="loading" @click="refresh">{{ $t("Refresh") }}</button>
            </div>
            <div v-if="error" class="alert alert-warning" role="alert">{{ error }}</div>
            <pre ref="output" class="log-output" @scroll="rememberScroll">{{ filteredLogs || $t("containerInstance.noLogs") }}</pre>
            <div class="form-text">{{ $t("containerInstance.logsHint") }} {{ $t("logTabs.retention") }}</div>
        </div>
    </section>
</template>

<script>
export default {
    props: {
        containers: { type: Array,
            default: () => [] },
        stackName: { type: String,
            required: true },
        endpoint: { type: String,
            default: "" },
        enabled: { type: Boolean,
            default: true },
    },
    emits: [ "selection" ],
    data: () => ({ selected: "",
        views: {},
        error: "",
        loading: false,
        request: 0,
        timer: null,
        timeout: null,
        disposed: false }),
    computed: {
        view() {
            return this.views[this.selected];
        },
        filteredLogs() {
            const view = this.view;
            if (!view) {
                return "";
            }
            if (!view.search) {
                return view.logs;
            }
            const query = view.search.toLocaleLowerCase();
            return view.logs.split("\n").filter(line => line.toLocaleLowerCase().includes(query)).join("\n");
        },
    },
    watch: {
        containers() {
            const ids = new Set(this.containers.map(c => c.id));
            for (const id of Object.keys(this.views)) {
                if (!ids.has(id)) {
                    delete this.views[id];
                }
            }
            if (this.selected && !ids.has(this.selected)) {
                this.select("");
            }
        },
        enabled(value) {
            if (!value) {
                this.cancel();
            } else {
                this.refresh();
            }
        },
        stackName() {
            this.reset();
        },
        endpoint() {
            this.reset();
        },
    },
    mounted() {
        this.$emit("selection", false);
        this.timer = setInterval(() => {
            if (!document.hidden && !this.view?.paused) {
                this.refresh();
            }
        }, 10000);
    },
    beforeUnmount() {
        this.disposed = true;
        clearInterval(this.timer);
        this.cancel();
    },
    methods: {
        cancel() {
            this.request++;
            clearTimeout(this.timeout);
            this.loading = false;
        },
        reset() {
            this.select("");
            this.views = {};
        },
        rememberScroll() {
            if (this.view && this.$refs.output) {
                this.view.scroll = this.$refs.output.scrollTop;
            }
        },
        select(id) {
            this.rememberScroll();
            this.cancel();
            this.error = "";
            this.selected = id;
            if (id && !this.views[id]) {
                // Bound cached snapshots; only the selected container is polled.
                const keys = Object.keys(this.views);
                if (keys.length >= 20) {
                    delete this.views[keys[0]];
                }
                this.views[id] = { logs: "",
                    search: "",
                    paused: false,
                    scroll: 0 };
            }
            this.$emit("selection", Boolean(id));
            this.$nextTick(() => {
                if (this.$refs.output) {
                    this.$refs.output.scrollTop = this.view?.scroll || 0;
                }
            });
            if (!this.view?.paused) {
                this.refresh();
            }
        },
        refresh() {
            if (!this.enabled || !this.selected || this.loading || this.disposed) {
                return;
            }
            const id = this.selected;
            const request = ++this.request;
            this.loading = true;
            this.timeout = setTimeout(() => {
                if (this.request === request) {
                    this.cancel();
                    this.error = this.$t("logTabs.timeout");
                }
            }, 10000);
            this.$root.emitAgent(this.endpoint, "containerInstanceLogs", this.stackName, id, res => {
                if (this.disposed || request !== this.request || id !== this.selected) {
                    return;
                }
                clearTimeout(this.timeout);
                this.loading = false;
                if (!res.ok) {
                    this.view.logs = "";
                    this.error = this.$t("logTabs.unavailable");
                    return;
                }
                this.rememberScroll();
                this.view.logs = String(res.logs || "");
                this.error = "";
                this.$nextTick(() => {
                    if (this.$refs.output) {
                        this.$refs.output.scrollTop = this.view?.scroll || 0;
                    }
                });
            });
        },
    },
};
</script>

<style scoped>
.log-tabs { display: flex; gap: .3rem; overflow-x: auto; max-width: 100%; padding-bottom: .3rem; }
.log-tabs button { flex: 0 0 auto; border: 1px solid var(--bs-border-color, #555); border-radius: .4rem; background: transparent; color: inherit; padding: .3rem .6rem; }
.log-tabs button.active { background: var(--bs-primary, #608bc6); color: #fff; }
.log-tabs small { opacity: .7; }
.log-search { max-width: 24rem; }
.log-output { height: 320px; max-height: 45vh; overflow: auto; white-space: pre; background: #111; color: #ddd; padding: .6rem; border-radius: .3rem; font-size: .8rem; }
</style>
