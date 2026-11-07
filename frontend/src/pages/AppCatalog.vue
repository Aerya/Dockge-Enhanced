<template>
    <section>
        <h1>{{ $t('appCatalog.title') }} <span class="badge bg-warning text-dark">BETA</span></h1>
        <p class="alert alert-warning">{{ $t('appCatalog.warning') }}</p>
        <label class="w-100">{{ $t('appCatalog.source') }}
            <input v-model="source" class="form-control" type="url" :disabled="busy">
        </label>
        <p class="small text-muted">{{ $t('appCatalog.sourceHelp') }}</p>
        <button class="btn btn-normal mb-3" :disabled="busy" @click="load(true)">{{ $t('refresh') }}</button>
        <p v-if="error" class="alert alert-danger" role="alert">{{ $t(error) }}</p>
        <p v-if="busy" role="status">{{ $t('loading') }}</p>
        <template v-if="catalog">
            <p class="small">{{ new Date(catalog.fetchedAt).toLocaleString() }} · {{ catalog.items.length }} {{ $t('appCatalog.entries') }}</p>
            <input v-model="search" class="form-control mb-3" :placeholder="$t('search')" :aria-label="$t('search')">
            <div class="catalog-list">
                <button v-for="item in filtered" :key="item.index" class="btn btn-normal text-start" :disabled="busy || !item.supported" @click="select(item)">
                    <strong>{{ item.title }}</strong><small class="d-block">{{ item.categories.join(' · ') }}</small>
                    <span class="d-block">{{ item.description }}</span>
                    <small v-if="!item.supported">{{ $t('appCatalog.unsupported') }}</small>
                </button>
            </div>
            <p v-if="filtered.length === 100">{{ $t('appCatalog.refine') }}</p>
        </template>
        <BModal v-if="draft" :model-value="true" :title="selected.title" size="xl" no-footer @update:model-value="draft = null">
            <p>{{ selected.description }}</p>
            <pre v-if="selected.note" class="catalog-note">{{ selected.note }}</pre>
            <p class="small text-break">{{ draft.origin }}<br>SHA256: {{ draft.digest }}</p>
            <p v-for="warning in draft.warnings" :key="warning" class="alert alert-warning">{{ $t(warning) }}</p>
            <label v-for="field in draft.fields" :key="field.name" class="d-block mb-2">{{ field.label }} ({{ field.name }})
                <input v-model="field.value" class="form-control" autocomplete="off">
                <small>{{ field.description }}</small>
            </label>
            <label class="d-block">Compose<textarea v-model="draft.compose" class="form-control font-monospace" rows="14" spellcheck="false"></textarea></label>
            <label class="d-block my-3"><input v-model="confirmed" type="checkbox"> {{ $t('appCatalog.confirm') }}</label>
            <button class="btn btn-primary" :disabled="!confirmed" @click="openEditor">{{ $t('appCatalog.edit') }}</button>
        </BModal>
    </section>
</template>
<script>
import { BModal } from "bootstrap-vue-next";
export default {
    components: { BModal },
    data: () => ({ source: "https://raw.githubusercontent.com/Lissy93/portainer-templates/main/templates.json",
        catalog: null,
        search: "",
        selected: null,
        draft: null,
        confirmed: false,
        busy: false,
        error: "",
        generation: 0,
        timer: null }),
    computed: {
        filtered() {
            const search = this.search.toLocaleLowerCase();
            return (this.catalog?.items || []).filter(item => `${item.title} ${item.description} ${item.categories.join(" ")}`.toLocaleLowerCase().includes(search)).slice(0, 100);
        },
    },
    beforeUnmount() {
        this.generation++;
        clearTimeout(this.timer);
    },
    methods: {
        request(event, input, receive) {
            const generation = ++this.generation;
            this.busy = true;
            this.error = "";
            clearTimeout(this.timer);
            this.timer = setTimeout(() => {
                if (generation === this.generation) {
                    this.generation++;
                    this.busy = false;
                    this.error = "appCatalog.fetchFailed";
                }
            }, 20000);
            this.$root.emitAgent("", event, input, result => {
                if (generation !== this.generation) {
                    return;
                }
                clearTimeout(this.timer);
                this.busy = false;
                if (!result?.ok) {
                    this.error = result?.msg || "appCatalog.fetchFailed";
                    return;
                }
                receive(result.data);
            });
        },
        load(refresh) {
            this.catalog = null;
            this.request("appCatalogList", { source: this.source,
                refresh }, data => {
                this.catalog = data;
            });
        },
        select(item) {
            this.selected = item;
            this.confirmed = false;
            this.request("appCatalogDraft", { source: this.catalog.source,
                revision: this.catalog.revision,
                index: item.index }, data => {
                this.draft = data;
            });
        },
        openEditor() {
            this.$root.composeTemplate = this.draft.compose;
            // Single-quoted dotenv values preserve dollars and prevent injected lines.
            this.$root.envTemplate = "# Imported catalog parameters\n" + this.draft.fields.map(field => `${field.name}='${field.value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`).join("\n");
            this.$router.push("/compose");
        },
    },
};
</script>
<style scoped>
.catalog-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 270px), 1fr)); gap: 12px; }
.catalog-list .btn { white-space: normal; overflow-wrap: anywhere; }
.catalog-note { white-space: pre-wrap; max-height: 160px; overflow: auto; }
</style>
