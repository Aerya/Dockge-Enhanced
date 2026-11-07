<template>
    <section class="app-store">
        <header class="d-flex flex-wrap justify-content-between gap-3 mb-3">
            <div>
                <h1>
                    {{ $t("appCatalog.title") }}
                    <span class="badge bg-warning text-dark fs-6">BETA</span>
                </h1>
                <p class="text-muted">{{ $t("appCatalog.intro") }}</p>
            </div>
            <label>{{ $t("appCatalog.repository") }}
                <select
                    v-model="sourceId"
                    class="form-select"
                    @change="
                        category = '';
                        page = 1;
                    "
                >
                    <option value="all">
                        {{ $t("appCatalog.allLoaded") }}
                    </option>
                    <option
                        v-for="source in sources"
                        :key="source.id"
                        :value="source.id"
                    >
                        {{ source.name }}
                    </option>
                    <option value="custom">
                        {{ $t("appCatalog.custom") }}
                    </option>
                </select>
            </label>
        </header>
        <details class="mb-3">
            <summary>{{ $t("appCatalog.precautions") }}</summary>
            <p>{{ $t("appCatalog.warning") }}</p>
            <p>{{ $t("appCatalog.sourceHelp") }}</p>
        </details>
        <div
            v-if="sourceId !== 'all'"
            class="d-flex flex-wrap gap-2 align-items-center mb-3"
        >
            <input
                v-if="sourceId === 'custom'"
                v-model="customSource"
                class="form-control"
                type="url"
                :aria-label="$t('appCatalog.source')"
            />
            <a
                v-else-if="sourceDefinition"
                :href="'https://github.com/' + sourceDefinition.repo"
                target="_blank"
                rel="noopener noreferrer"
            >{{ $t("appCatalog.browseRepo") }}</a>
            <button class="btn btn-normal" :disabled="busy" @click="load(true)">
                {{ $t("appCatalog.load") }}
            </button>
        </div>
        <p v-if="error" class="alert alert-danger" role="alert">
            {{ $t(error) }}
        </p>
        <p v-if="busy" role="status">{{ $t("loading") }}</p>
        <p
            v-for="status in loadingSources"
            :key="status.key"
            class="small"
            role="status"
        >
            {{ status.name }} — {{ status.loaded }} /
            {{ status.items.length }} · {{ $t("appCatalog.indexing") }}
        </p>
        <p
            v-for="status in failedSources"
            :key="status.key"
            class="alert alert-warning"
        >
            {{ status.name }} : {{ status.failed }}
            {{ $t("appCatalog.failedEntries") }}
        </p>
        <div class="store-layout">
            <aside>
                <input
                    v-model="search"
                    class="form-control mb-3"
                    :placeholder="$t('appCatalog.search')"
                    :aria-label="$t('appCatalog.search')"
                    @input="page = 1"
                />
                <button
                    class="btn w-100 text-start mb-1"
                    :class="!category ? 'btn-primary' : 'btn-normal'"
                    @click="
                        category = '';
                        page = 1;
                    "
                >
                    {{ $t("appCatalog.allCategories") }}
                </button>
                <button
                    v-for="entry in categories"
                    :key="entry"
                    class="btn w-100 text-start mb-1"
                    :class="category === entry ? 'btn-primary' : 'btn-normal'"
                    @click="
                        category = entry;
                        page = 1;
                    "
                >
                    {{ entry }}
                </button>
            </aside>
            <div>
                <p class="small text-muted">
                    {{ filtered.length }} {{ $t("appCatalog.entries") }}
                </p>
                <div class="catalog-list">
                    <article
                        v-for="item in paged"
                        :key="item.key"
                        class="shadow-box catalog-card"
                    >
                        <div class="d-flex gap-3 align-items-center">
                            <img
                                v-if="item.logo && !brokenLogos[item.logo]"
                                :src="item.logo"
                                alt=""
                                width="44"
                                height="44"
                                loading="lazy"
                                referrerpolicy="no-referrer"
                                @error="brokenLogos[item.logo] = true"
                            />
                            <span v-else class="catalog-initial">{{
                                item.title.slice(0, 1).toUpperCase()
                            }}</span>
                            <h5 class="mb-0">{{ item.title }}</h5>
                        </div>
                        <small class="text-muted">{{ item.sourceName }} ·
                            {{ item.categories.join(" · ") }}</small>
                        <p class="catalog-description">
                            {{ item.description }}
                        </p>
                        <div class="d-flex flex-wrap gap-2 mt-auto">
                            <a
                                v-if="item.website"
                                :href="item.website"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="btn btn-sm btn-normal"
                            >{{ $t("appCatalog.website") }}</a>
                            <a
                                v-if="item.origin"
                                :href="item.origin"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="btn btn-sm btn-normal"
                            >{{ $t("appCatalog.browseRepo") }}</a>
                            <button
                                class="btn btn-sm btn-primary"
                                :disabled="busy"
                                @click="showDetails(item)"
                            >
                                {{ $t("appCatalog.details") }}
                            </button>
                        </div>
                    </article>
                </div>
                <nav
                    class="d-flex gap-3 align-items-center mt-3"
                    :aria-label="$t('appCatalog.pages')"
                >
                    <button
                        class="btn btn-normal"
                        :disabled="page <= 1"
                        @click="page--"
                    >
                        ←
                    </button><span>{{ page }} / {{ pages }}</span><button
                        class="btn btn-normal"
                        :disabled="page >= pages"
                        @click="page++"
                    >
                        →
                    </button>
                </nav>
            </div>
        </div>
        <BModal
            v-if="selected"
            :model-value="true"
            :title="selected.title"
            size="xl"
            no-footer
            @update:model-value="closeDetails"
        >
            <p>{{ selected.description }}</p>
            <div class="d-flex gap-3 mb-3">
                <a
                    v-if="selected.website"
                    :href="selected.website"
                    target="_blank"
                    rel="noopener noreferrer"
                >{{ $t("appCatalog.website") }}</a><a
                    v-if="selected.origin"
                    :href="selected.origin"
                    target="_blank"
                    rel="noopener noreferrer"
                >{{ $t("appCatalog.browseRepo") }}</a>
            </div>
            <label v-if="alternatives.length > 1" class="d-block mb-3">{{ $t("appCatalog.chooseSource")
            }}<select
                class="form-select"
                :value="selected.key"
                @change="
                    showDetails(
                        alternatives.find(
                            (item) => item.key === $event.target.value,
                        ),
                    )
                "
            >
                <option
                    v-for="item in alternatives"
                    :key="item.key"
                    :value="item.key"
                >
                    {{ item.sourceName }}
                </option>
            </select></label>
            <p v-else>
                {{ $t("appCatalog.repository") }} : {{ selected.sourceName }}
            </p>
            <pre v-if="selected.note" class="catalog-note">{{
                selected.note
            }}</pre>
            <p v-if="!selected.supported" class="alert alert-warning">
                {{
                    $t(
                        selected.native
                            ? "appCatalog.nativeOnly"
                            : "appCatalog.unsupported",
                    )
                }}
            </p>
            <p v-if="error" class="alert alert-danger">{{ $t(error) }}</p>
            <button
                v-if="selected.supported && !draft"
                class="btn btn-primary"
                :disabled="busy"
                @click="importDraft"
            >
                {{ $t("appCatalog.prepare") }}
            </button>
            <template v-if="draft">
                <p class="small text-break">
                    {{ draft.origin }}<br />SHA256: {{ draft.digest }}
                </p>
                <p
                    v-for="warning in draft.warnings"
                    :key="warning"
                    class="alert alert-warning"
                >
                    {{ $t(warning) }}
                </p>
                <label
                    v-for="field in draft.fields"
                    :key="field.name"
                    class="d-block mb-2"
                >{{ field.label }} ({{ field.name }})<input
                    v-model="field.value"
                    class="form-control"
                    autocomplete="off"
                /><small>{{ field.description }}</small></label>
                <label class="d-block">Compose<textarea
                    v-model="draft.compose"
                    class="form-control font-monospace"
                    rows="14"
                    spellcheck="false"
                ></textarea>
                </label>
                <label class="d-block my-3"><input v-model="confirmed" type="checkbox" />
                    {{ $t("appCatalog.confirm") }}</label>
                <button
                    class="btn btn-primary"
                    :disabled="!confirmed"
                    @click="openEditor"
                >
                    {{ $t("appCatalog.edit") }}
                </button>
            </template>
        </BModal>
    </section>
</template>
<script>
import { BModal } from "bootstrap-vue-next";
export default {
    components: { BModal },
    data: () => ({
        sources: [],
        sourceId: "lissy93",
        customSource: "",
        catalogs: {},
        search: "",
        category: "",
        page: 1,
        selected: null,
        draft: null,
        confirmed: false,
        busy: false,
        error: "",
        generation: 0,
        timer: null,
        polling: null,
        brokenLogos: {},
    }),
    computed: {
        sourceDefinition() {
            return this.sources.find((source) => source.id === this.sourceId);
        },
        entries() {
            return Object.entries(this.catalogs).flatMap(([ key, catalog ]) =>
                catalog.items.map((item) => ({
                    ...item,
                    key: `${key}:${item.index}`,
                    sourceKey: key,
                    sourceName: catalog.name,
                    source: catalog.source,
                    revision: catalog.revision,
                    native: catalog.native,
                })),
            );
        },
        scoped() {
            return this.entries.filter(
                (item) =>
                    this.sourceId === "all" || item.sourceKey === this.sourceId,
            );
        },
        categories() {
            return [
                ...new Set(
                    this.scoped.flatMap((item) =>
                        item.categories.map((category) =>
                            category.toLocaleLowerCase(),
                        ),
                    ),
                ),
            ].sort();
        },
        filtered() {
            const query = this.search.toLocaleLowerCase();
            return this.scoped.filter(
                (item) =>
                    (!this.category ||
                        item.categories.some(
                            (category) =>
                                category.toLocaleLowerCase() === this.category,
                        )) &&
                    `${item.title} ${item.description} ${item.categories.join(" ")}`
                        .toLocaleLowerCase()
                        .includes(query),
            );
        },
        pages() {
            return Math.max(1, Math.ceil(this.filtered.length / 24));
        },
        paged() {
            return this.filtered.slice((this.page - 1) * 24, this.page * 24);
        },
        loadingSources() {
            return Object.entries(this.catalogs)
                .filter(([ , item ]) => item.loading)
                .map(([ key, item ]) => ({ ...item,
                    key }));
        },
        failedSources() {
            return Object.entries(this.catalogs)
                .filter(([ , item ]) => item.failed)
                .map(([ key, item ]) => ({ ...item,
                    key }));
        },
        alternatives() {
            const normalize = (name) =>
                name.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
            return this.selected
                ? this.entries.filter(
                    (item) =>
                        normalize(item.title) ===
                          normalize(this.selected.title),
                )
                : [];
        },
    },
    mounted() {
        this.request("appCatalogSources", {}, (data) => {
            this.sources = data;
        });
        this.polling = setInterval(() => this.pollSources(), 4000);
    },
    beforeUnmount() {
        this.generation++;
        clearTimeout(this.timer);
        clearInterval(this.polling);
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
            this.$root.emitAgent("", event, input, (result) => {
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
            const key = this.sourceId;
            const definition = this.sourceDefinition;
            if (!definition && key !== "custom") {
                this.error = "appCatalog.invalidSource";
                return;
            }
            const native = definition && definition.format !== "portainer";
            const source = native
                ? key
                : key === "custom"
                    ? this.customSource
                    : `https://raw.githubusercontent.com/${definition.repo}/${definition.file}`;
            this.request(
                native ? "appCatalogBrowse" : "appCatalogList",
                { source,
                    refresh },
                (data) => {
                    this.catalogs[key] = {
                        ...data,
                        name: definition?.name || this.$t("appCatalog.custom"),
                        native,
                    };
                    this.page = 1;
                },
            );
        },
        pollSources() {
            if (this.busy || this.selected) {
                return;
            }
            const item = this.loadingSources[0];
            if (!item) {
                return;
            }
            this.request("appCatalogBrowse", { source: item.key }, (data) => {
                this.catalogs[item.key] = {
                    ...data,
                    name: item.name,
                    native: true,
                };
            });
        },
        showDetails(item) {
            this.selected = item;
            this.draft = null;
            this.confirmed = false;
            this.error = "";
        },
        closeDetails() {
            this.generation++;
            clearTimeout(this.timer);
            this.busy = false;
            this.selected = null;
            this.draft = null;
        },
        importDraft() {
            const item = this.selected;
            this.request(
                item.native ? "appCatalogSourceDraft" : "appCatalogDraft",
                {
                    source: item.source,
                    revision: item.revision,
                    index: item.index,
                },
                (data) => {
                    this.draft = data;
                },
            );
        },
        openEditor() {
            this.$root.composeTemplate = this.draft.compose;
            this.$root.envTemplate =
                "# Imported catalog parameters\n" +
                this.draft.fields
                    .map(
                        (field) =>
                            `${field.name}='${field.value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`,
                    )
                    .join("\n");
            this.$router.push("/compose");
        },
    },
};
</script>
<style scoped>
.store-layout {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    gap: 24px;
}
.catalog-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr));
    gap: 16px;
}
.catalog-card {
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-wrap: anywhere;
}
.catalog-card img {
    object-fit: contain;
    flex-shrink: 0;
}
.catalog-initial {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: 12px;
    background: var(--bs-secondary-bg);
    font-size: 24px;
}
.catalog-description {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
.catalog-note {
    white-space: pre-wrap;
    max-height: 160px;
    overflow: auto;
}
@media (max-width: 700px) {
    .store-layout {
        grid-template-columns: 1fr;
    }
    .store-layout aside {
        max-height: 220px;
        overflow: auto;
    }
}
</style>
