<template>
    <section class="service-links">
        <header class="d-flex flex-wrap gap-2 mb-3">
            <h2 class="me-auto">{{ $t("serviceLinks.title") }}</h2>
            <button class="btn btn-sm btn-normal" :disabled="busy || !!editing" @click="load">{{ $t("refresh") }}</button>
            <button class="btn btn-sm btn-primary" :disabled="busy" @click="edit()">{{ $t("serviceLinks.add") }}</button>
        </header>
        <p class="small text-secondary">{{ $t("serviceLinks.hint") }}</p>
        <p v-if="error" class="alert alert-warning" role="alert">{{ $t(error) }}</p>
        <p v-if="unavailable" class="text-warning" role="status">{{ $t("serviceLinks.unavailable") }}</p>
        <form v-if="editing" class="shadow-box p-3 mb-3" @submit.prevent="apply">
            <label class="d-block mb-2">{{ $t("serviceLinks.name") }}<input v-model="editing.name" required maxlength="100" class="form-control" /></label>
            <label class="d-block mb-2">URL<input v-model="editing.url" required type="url" maxlength="2048" class="form-control" placeholder="https://example.org" /></label>
            <label class="d-block mb-2">{{ $t("serviceLinks.group") }}<input v-model="editing.group" maxlength="100" class="form-control" /></label>
            <label class="d-block mb-2"><input v-model="editing.enabled" type="checkbox" /> {{ $t("serviceLinks.enabled") }}</label>
            <button class="btn btn-sm btn-primary me-2" :disabled="busy">{{ $t("Save") }}</button>
            <button class="btn btn-sm btn-normal" type="button" @click="editing = null">{{ $t("cancel") }}</button>
        </form>
        <div class="d-flex flex-wrap gap-3 mb-3">
            <input v-model="search" class="form-control link-search" :placeholder="$t('serviceLinks.search')" :aria-label="$t('serviceLinks.search')" />
            <label><input v-model="config.showStackLinks" type="checkbox" :disabled="busy" @change="save" /> {{ $t("serviceLinks.showStacks") }}</label>
        </div>
        <p v-if="!cards.length && !busy">{{ $t("serviceLinks.empty") }}</p>
        <section v-for="group in groups" :key="group" class="mb-4">
            <h3 class="h5">{{ group || $t("serviceLinks.defaultGroup") }}</h3>
            <div class="link-grid">
                <article v-for="card in cards.filter(item => item.group === group)" :key="card.id" class="shadow-box p-3" :class="{ 'link-disabled': card.enabled === false }">
                    <a v-if="card.enabled !== false" :href="card.url" target="_blank" rel="noopener noreferrer" class="fw-bold">{{ card.name }} ↗</a>
                    <strong v-else>{{ card.name }}</strong>
                    <small class="d-block text-break mt-2">{{ card.url }}</small>
                    <small v-if="card.stack" class="d-block mt-2">{{ card.stack }} · {{ card.endpoint || $t("serviceLinks.local") }}</small>
                    <div v-else class="d-flex gap-1 mt-3">
                        <button class="btn btn-sm btn-normal" @click="edit(card)">{{ $t("Edit") }}</button>
                        <button class="btn btn-sm btn-normal" :disabled="busy" :title="$t('serviceLinks.up')" @click="move(card.id, -1)">↑</button>
                        <button class="btn btn-sm btn-normal" :disabled="busy" :title="$t('serviceLinks.down')" @click="move(card.id, 1)">↓</button>
                        <button class="btn btn-sm btn-outline-danger" :disabled="busy" @click="pendingDelete = card.id">{{ $t("Delete") }}</button>
                    </div>
                    <div v-if="pendingDelete === card.id" class="mt-2">
                        <p>{{ $t("serviceLinks.confirmDelete") }}</p>
                        <button class="btn btn-sm btn-danger me-2" :disabled="busy" @click="remove(card.id)">{{ $t("Confirm") }}</button>
                        <button class="btn btn-sm btn-normal" @click="pendingDelete = null">{{ $t("cancel") }}</button>
                    </div>
                </article>
            </div>
        </section>
    </section>
</template>
<script>
import { defaultServiceLinks, safeServiceUrl } from "../../../common/service-links";
export default {
    data: () => ({ config: defaultServiceLinks(),
        remote: [],
        search: "",
        busy: false,
        error: "",
        unavailable: false,
        editing: null,
        pendingDelete: null,
        generation: 0 }),
    computed: {
        endpoints() {
            return [ ...new Set([ "", ...Object.values(this.$root.completeStackList || {}).map(stack => stack.endpoint || "") ]) ].sort();
        },
        cards() {
            const query = this.search.toLowerCase();
            return [ ...this.config.links, ...(this.config.showStackLinks ? this.remote : []) ].filter(card => safeServiceUrl(card.url) && (!query || [ card.name, card.url, card.group ].join(" ").toLowerCase().includes(query)));
        },
        groups() {
            return [ ...new Set(this.cards.map(card => card.group)) ];
        },
    },
    watch: {
        endpoints(next, previous) {
            if (JSON.stringify(next) !== JSON.stringify(previous)) {
                this.loadStacks();
            }
        },
    },
    mounted() {
        this.load();
        this.$root.getSocket().on("connect", this.reconnected);
    },
    beforeUnmount() {
        this.generation++;
        this.$root.getSocket().off("connect", this.reconnected);
    },
    methods: {
        request(event, ...args) {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error("serviceLinks.unavailable")), 10000);
                this.$root.getSocket().emit(event, ...args, result => {
                    clearTimeout(timer);
                    if (result?.ok) {
                        resolve(result);
                    } else {
                        reject(new Error(result?.msg || "serviceLinks.unavailable"));
                    }
                });
            });
        },
        async load() {
            this.busy = true;
            this.error = "";
            try {
                this.config = (await this.request("serviceLinks:get")).config;
                await this.loadStacks();
            } catch (error) {
                this.error = error.message;
            } finally {
                this.busy = false;
            }
        },
        reconnected() {
            if (!this.editing && !this.busy) {
                this.load();
            }
        },
        async loadStacks() {
            const generation = ++this.generation;
            const results = await Promise.all(this.endpoints.map(endpoint => new Promise(resolve => {
                const timer = setTimeout(() => resolve({ ok: false }), 10000);
                this.$root.emitAgent(endpoint, "serviceLinks:stacks", result => {
                    clearTimeout(timer);
                    resolve({ ...result,
                        endpoint });
                });
            })));
            if (generation !== this.generation) {
                return;
            }
            this.unavailable = results.some(result => !result.ok || result.unavailable);
            this.remote = results.filter(result => result.ok).flatMap(result => (result.links || []).filter(link => safeServiceUrl(link.url)).map(link => ({
                ...link,
                endpoint: result.endpoint,
                id: JSON.stringify([ result.endpoint, link.stack, link.url ]),
                name: link.stack,
                group: result.endpoint || this.$t("serviceLinks.local"),
            })));
        },
        async save() {
            this.busy = true;
            this.error = "";
            try {
                this.config = (await this.request("serviceLinks:save", JSON.parse(JSON.stringify(this.config)))).config;
                this.editing = null;
                this.pendingDelete = null;
            } catch (error) {
                this.error = error.message;
            } finally {
                this.busy = false;
            }
        },
        edit(card) {
            const bytes = crypto.getRandomValues(new Uint8Array(16));
            this.editing = card ? { ...card } : { id: Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join(""),
                name: "",
                url: "",
                group: "",
                enabled: true };
        },
        apply() {
            if (!safeServiceUrl(this.editing.url) || !this.editing.name.trim()) {
                this.error = "serviceLinks.invalid";
                return;
            }
            const index = this.config.links.findIndex(link => link.id === this.editing.id);
            if (index < 0) {
                this.config.links.push({ ...this.editing });
            } else {
                this.config.links.splice(index, 1, { ...this.editing });
            }
            return this.save();
        },
        remove(id) {
            this.config.links = this.config.links.filter(link => link.id !== id);
            return this.save();
        },
        move(id, direction) {
            const index = this.config.links.findIndex(link => link.id === id);
            const next = index + direction;
            if (next < 0 || next >= this.config.links.length) {
                return;
            }
            const [ link ] = this.config.links.splice(index, 1);
            this.config.links.splice(next, 0, link);
            return this.save();
        },
    },
};
</script>
<style scoped>
.service-links { padding: 1rem; max-width: 1400px; margin: auto; }
.link-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 230px), 1fr)); gap: 1rem; }
.link-disabled { opacity: .55; }
.link-search { max-width: 350px; }
</style>
