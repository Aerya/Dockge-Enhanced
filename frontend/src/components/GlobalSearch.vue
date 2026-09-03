<template>
    <div class="global-search-shell">
        <button
            type="button"
            class="nav-link global-search-trigger"
            :class="{ 'global-search-trigger--mobile': mobile }"
            :aria-label="$t('globalSearch.open')"
            :title="$t('globalSearch.shortcutHint')"
            @click="open"
        >
            <font-awesome-icon icon="search" />
            <span v-if="!mobile" class="global-search-trigger__label">{{ $t("globalSearch.open") }}</span>
            <kbd v-if="!mobile" class="global-search-trigger__shortcut">Ctrl K</kbd>
        </button>

        <Teleport to="body">
            <div v-if="visible" class="global-search-backdrop" @click.self="close">
                <section class="global-search-dialog" role="dialog" aria-modal="true" :aria-label="$t('globalSearch.title')">
                    <div class="global-search-input-row">
                        <font-awesome-icon icon="search" class="global-search-input-icon" />
                        <input
                            ref="searchInput"
                            v-model="query"
                            type="search"
                            class="form-control global-search-input"
                            :placeholder="$t('globalSearch.placeholder')"
                            autocomplete="off"
                            spellcheck="false"
                            @input="scheduleSearch"
                            @keydown.down.prevent="moveSelection(1)"
                            @keydown.up.prevent="moveSelection(-1)"
                            @keydown.enter.prevent="activateSelected"
                            @keydown.esc.prevent="close"
                        >
                        <span v-if="loading" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
                        <button type="button" class="btn btn-sm btn-normal" :aria-label="$t('globalSearch.close')" @click="close">
                            <font-awesome-icon icon="times" />
                        </button>
                    </div>

                    <div class="global-search-toolbar">
                        <div class="global-search-filters" role="tablist" :aria-label="$t('globalSearch.filters')">
                            <button
                                v-for="filter in filters"
                                :key="filter.value"
                                type="button"
                                class="global-search-filter"
                                :class="{ active: activeFilter === filter.value }"
                                @click="activeFilter = filter.value; resetSelection()"
                            >
                                {{ filter.label }}
                            </button>
                        </div>
                        <select v-if="instanceOptions.length > 1" v-model="activeEndpoint" class="form-select form-select-sm global-search-instance" @change="resetSelection">
                            <option value="*">{{ $t("globalSearch.allInstances") }}</option>
                            <option v-for="instance in instanceOptions" :key="instance.endpoint" :value="instance.endpoint">
                                {{ instance.name }}
                            </option>
                        </select>
                    </div>

                    <div class="global-search-results" role="listbox">
                        <div v-if="query.trim().length < 2" class="global-search-empty">
                            <font-awesome-icon icon="search" />
                            <span>{{ $t("globalSearch.minChars") }}</span>
                        </div>
                        <div v-else-if="!loading && filteredResults.length === 0" class="global-search-empty">
                            <span>{{ $t("globalSearch.noResults") }}</span>
                        </div>

                        <template v-for="group in groupedResults" :key="group.type">
                            <div class="global-search-group-title">{{ typeLabel(group.type) }}</div>
                            <button
                                v-for="result in group.items"
                                :key="result.uid"
                                type="button"
                                class="global-search-result"
                                :class="{ selected: result.uid === selectedUid }"
                                role="option"
                                :aria-selected="result.uid === selectedUid"
                                @mouseenter="selectedUid = result.uid"
                                @click="activate(result)"
                            >
                                <span class="global-search-result__icon">
                                    <font-awesome-icon :icon="typeIcon(result.type)" />
                                </span>
                                <span class="global-search-result__body">
                                    <span class="global-search-result__title-row">
                                        <strong>{{ result.title }}</strong>
                                        <span class="global-search-result__instance">{{ result.instanceName }}</span>
                                    </span>
                                    <span v-if="result.stackName && result.type !== 'stack'" class="global-search-result__meta">{{ result.stackName }}</span>
                                    <span v-if="result.source" class="global-search-result__meta">
                                        {{ sourceLabel(result.source) }}<template v-if="result.line"> · {{ $t("globalSearch.line", { line: result.line }) }}</template>
                                    </span>
                                    <code v-if="result.excerpt && result.type !== 'env'" class="global-search-result__excerpt">{{ result.excerpt }}</code>
                                    <span v-else-if="result.type === 'env'" class="global-search-result__meta">{{ $t("globalSearch.envValueHidden") }}</span>
                                </span>
                            </button>
                        </template>
                    </div>

                    <div class="global-search-footer">
                        <span>{{ $t("globalSearch.keyboardHint") }}</span>
                        <span v-if="truncated">{{ $t("globalSearch.truncated") }}</span>
                    </div>
                </section>
            </div>
        </Teleport>
    </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";

type ResultType = "stack" | "compose" | "env" | "backup" | "config";
type BackendResult = {
    id: string;
    type: Exclude<ResultType, "config">;
    title: string;
    stackName?: string;
    source?: "compose" | "override" | "env";
    line?: number;
    excerpt?: string;
    status?: number;
    timestamp?: string;
};
type SearchResult = Omit<BackendResult, "type"> & {
    type: ResultType;
    uid: string;
    endpoint: string;
    instanceName: string;
    route?: string;
};

export default defineComponent({
    props: {
        mobile: {
            type: Boolean,
            default: false,
        },
    },
    data() {
        return {
            visible: false,
            query: "",
            loading: false,
            results: [] as SearchResult[],
            activeFilter: "all" as "all" | ResultType,
            activeEndpoint: "*",
            selectedUid: "",
            debounceTimer: null as number | null,
            requestSeq: 0,
            truncated: false,
        };
    },
    computed: {
        filters(): Array<{ value: "all" | ResultType; label: string }> {
            return [
                { value: "all", label: this.$t("globalSearch.filter.all") as string },
                { value: "stack", label: this.$t("globalSearch.filter.stacks") as string },
                { value: "compose", label: this.$t("globalSearch.filter.compose") as string },
                { value: "env", label: this.$t("globalSearch.filter.variables") as string },
                { value: "backup", label: this.$t("globalSearch.filter.backups") as string },
                { value: "config", label: this.$t("globalSearch.filter.config") as string },
            ];
        },
        instanceOptions(): Array<{ endpoint: string; name: string }> {
            const agents = (this.$root.agentList ?? {}) as Record<string, { displayName?: string; url?: string }>;
            const options = Object.entries(agents)
                .filter(([ endpoint ]) => endpoint === "" || this.$root.agentStatusList?.[endpoint] === "online")
                .map(([ endpoint, agent ]) => ({
                    endpoint,
                    name: agent?.displayName || endpoint || this.$t("globalSearch.localInstance") as string,
                }));
            if (!options.some(item => item.endpoint === "")) {
                options.unshift({ endpoint: "", name: this.$t("globalSearch.localInstance") as string });
            }
            return options.sort((a, b) => a.endpoint === "" ? -1 : b.endpoint === "" ? 1 : a.name.localeCompare(b.name));
        },
        filteredResults(): SearchResult[] {
            return this.results.filter((result) =>
                (this.activeFilter === "all" || result.type === this.activeFilter)
                && (this.activeEndpoint === "*" || result.endpoint === this.activeEndpoint)
            );
        },
        groupedResults(): Array<{ type: ResultType; items: SearchResult[] }> {
            const order: ResultType[] = [ "stack", "compose", "env", "backup", "config" ];
            return order.map(type => ({ type, items: this.filteredResults.filter(item => item.type === type) })).filter(group => group.items.length > 0);
        },
    },
    mounted() {
        document.addEventListener("keydown", this.onGlobalKeydown);
    },
    beforeUnmount() {
        document.removeEventListener("keydown", this.onGlobalKeydown);
        if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
    },
    methods: {
        onGlobalKeydown(event: KeyboardEvent) {
            if (!this.$root.loggedIn) return;
            if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
                event.preventDefault();
                this.visible ? this.close() : this.open();
            }
        },
        open() {
            this.visible = true;
            this.$nextTick(() => (this.$refs.searchInput as HTMLInputElement | undefined)?.focus());
        },
        close() {
            this.visible = false;
        },
        scheduleSearch() {
            if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
            this.debounceTimer = window.setTimeout(() => this.runSearch(), 250);
        },
        async runSearch() {
            const query = this.query.trim();
            const seq = ++this.requestSeq;
            this.selectedUid = "";
            this.truncated = false;
            if (query.length < 2) {
                this.results = [];
                this.loading = false;
                return;
            }

            this.loading = true;
            const configResults = this.searchConfiguration(query);
            const requests = this.instanceOptions.map(instance => this.searchInstance(instance.endpoint, instance.name, query));
            const settled = await Promise.all(requests);
            if (seq !== this.requestSeq) return;

            this.results = [ ...settled.flatMap(item => item.results), ...configResults ];
            this.truncated = settled.some(item => item.truncated);
            this.loading = false;
            this.resetSelection();
        },
        searchInstance(endpoint: string, instanceName: string, query: string): Promise<{ results: SearchResult[]; truncated: boolean }> {
            return new Promise((resolve) => {
                let done = false;
                const finish = (value: { results: SearchResult[]; truncated: boolean }) => {
                    if (done) return;
                    done = true;
                    window.clearTimeout(timer);
                    resolve(value);
                };
                const timer = window.setTimeout(() => finish({ results: [], truncated: false }), 3000);
                this.$root.emitAgent(endpoint, "globalSearch", query, 50, (res) => {
                    if (!res?.ok || !res.data) return finish({ results: [], truncated: false });
                    const results = Array.isArray(res.data.results) ? res.data.results : [];
                    finish({
                        results: results.map((result: BackendResult) => ({
                            ...result,
                            endpoint,
                            instanceName,
                            uid: `${endpoint}|${result.id}`,
                        })),
                        truncated: res.data.truncated === true,
                    });
                });
            });
        },
        searchConfiguration(query: string): SearchResult[] {
            const needle = query.toLocaleLowerCase();
            const entries = [
                [ "/settings/general", "general", "instance docker stacks directory hostname language general" ],
                [ "/settings/appearance", "Appearance", "theme appearance interface ui colors" ],
                [ "/settings/security", "Security", "security authentication password session" ],
                [ "/settings/globalEnv", "GlobalEnv", "global env environment variables" ],
                [ "/settings/integrations", "Integrations", "integrations docker socket agents" ],
                [ "/settings/automation", "automation.heading", "automation webhook api actions" ],
                [ "/watcher/updates", "updates.heading", "self update automatic sidecar maintenance pause" ],
                [ "/watcher/images", "watcher.tab.images", "images watcher update registry credentials" ],
                [ "/watcher/scheduler", "watcher.tab.scheduler", "scheduler schedule stacks cron" ],
                [ "/watcher/trivy", "watcher.tab.security", "trivy vulnerabilities cve scanner security" ],
                [ "/watcher/backup", "watcher.tab.backup", "backup restic snapshot restore retention destination" ],
                [ "/watcher/resources", "watcher.tab.resources", "resources images volumes networks prune" ],
                [ "/watcher/notifications", "watcher.tab.notifications", "notifications discord apprise webhook" ],
                [ "/watcher/monitoring", "watcher.tab.monitoring", "monitoring cpu ram disk stats" ],
                [ "/watcher/audit", "watcher.tab.audit", "audit history events actions" ],
            ] as const;
            return entries.flatMap(([ route, key, keywords ], index) => {
                const title = this.$t(key) as string;
                if (!`${title} ${keywords}`.toLocaleLowerCase().includes(needle)) return [];
                return [{
                    id: `config:${route}`,
                    uid: `config:${route}`,
                    type: "config" as const,
                    title,
                    excerpt: this.$t("globalSearch.configHint") as string,
                    endpoint: "",
                    instanceName: this.$t("globalSearch.localInstance") as string,
                    route,
                    status: index,
                }];
            });
        },
        resetSelection() {
            this.selectedUid = this.filteredResults[0]?.uid ?? "";
        },
        moveSelection(delta: number) {
            const items = this.filteredResults;
            if (!items.length) return;
            const current = Math.max(0, items.findIndex(item => item.uid === this.selectedUid));
            const next = (current + delta + items.length) % items.length;
            this.selectedUid = items[next].uid;
        },
        activateSelected() {
            const result = this.filteredResults.find(item => item.uid === this.selectedUid) ?? this.filteredResults[0];
            if (result) this.activate(result);
        },
        activate(result: SearchResult) {
            if (result.type === "config" && result.route) {
                this.$router.push(result.route);
                this.close();
                return;
            }
            if ((result.type === "stack" || result.type === "compose" || result.type === "env") && result.stackName) {
                const base = `/compose/${encodeURIComponent(result.stackName)}`;
                const path = result.endpoint ? `${base}/${encodeURIComponent(result.endpoint)}` : base;
                this.$router.push(path);
                this.close();
                return;
            }
            if (result.type === "backup") {
                if (result.endpoint) {
                    const agentUrl = this.$root.agentList?.[result.endpoint]?.url;
                    if (agentUrl) {
                        const href = new URL("watcher/backup", `${agentUrl.replace(/\/?$/, "/")}`).toString();
                        window.open(href, "_blank", "noopener,noreferrer");
                    }
                } else {
                    this.$router.push("/watcher/backup");
                }
                this.close();
            }
        },
        typeLabel(type: ResultType) {
            const keys: Record<ResultType, string> = {
                stack: "globalSearch.group.stacks",
                compose: "globalSearch.group.compose",
                env: "globalSearch.group.variables",
                backup: "globalSearch.group.backups",
                config: "globalSearch.group.config",
            };
            return this.$t(keys[type]);
        },
        typeIcon(type: ResultType) {
            return ({ stack: "layer-group", compose: "code-branch", env: "key", backup: "archive", config: "cog" } as Record<ResultType, string>)[type];
        },
        sourceLabel(source: string) {
            return source === "override" ? "compose.override.yaml" : source === "env" ? ".env" : "compose.yaml";
        },
    },
});
</script>

<style lang="scss" scoped>
.global-search-shell { display: flex; align-items: center; }
.global-search-trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    border: 1px solid var(--border-color);
    background: var(--bg-raised);
    color: var(--text-muted);
    white-space: nowrap;
}
.global-search-trigger:hover { color: var(--text-color); border-color: var(--border-strong); }
.global-search-trigger--mobile { width: 36px; height: 36px; justify-content: center; padding: 0; border-radius: var(--radius-sm); }
.global-search-trigger__label { font-size: var(--fs-sm); }
.global-search-trigger__shortcut { border: 0; border-radius: var(--radius-sm); padding: 1px 5px; background: var(--bg-surface); color: var(--text-muted); font-size: var(--fs-xs); }

:global(.global-search-backdrop) {
    position: fixed;
    inset: 0;
    z-index: 100100;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: min(12vh, 110px) 16px 24px;
    background: rgba(4, 10, 18, .72);
    backdrop-filter: blur(4px);
}
:global(.global-search-dialog) {
    width: min(760px, 100%);
    max-height: min(720px, calc(100vh - 140px));
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    background: var(--bg-surface);
    color: var(--text-color);
    box-shadow: var(--shadow-card);
}
:global(.global-search-input-row) { display: flex; align-items: center; gap: .65rem; padding: .85rem 1rem; border-bottom: 1px solid var(--border-color); }
:global(.global-search-input-icon) { color: var(--text-muted); }
:global(.global-search-input) { min-width: 0; border: 0 !important; box-shadow: none !important; background: transparent !important; color: var(--text-color) !important; font-size: var(--fs-lg); }
:global(.global-search-toolbar) { display: flex; gap: .75rem; align-items: center; justify-content: space-between; padding: .65rem 1rem; border-bottom: 1px solid var(--border-color); }
:global(.global-search-filters) { display: flex; flex-wrap: wrap; gap: .35rem; }
:global(.global-search-filter) { border: 1px solid var(--border-color); border-radius: var(--radius-pill); padding: .22rem .6rem; background: transparent; color: var(--text-muted); font-size: var(--fs-xs); }
:global(.global-search-filter.active) { border-color: var(--primary-strong); background: var(--primary-soft); color: var(--primary-strong); }
:global(.global-search-instance) { width: min(210px, 38%); }
:global(.global-search-results) { overflow-y: auto; padding: .55rem; }
:global(.global-search-group-title) { padding: .55rem .7rem .3rem; color: var(--text-muted); font-size: var(--fs-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
:global(.global-search-result) { width: 100%; display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: .55rem; align-items: start; border: 0; border-radius: var(--radius-md); padding: .65rem .7rem; background: transparent; color: var(--text-color); text-align: left; }
:global(.global-search-result:hover), :global(.global-search-result.selected) { background: var(--bg-raised); }
:global(.global-search-result__icon) { display: flex; justify-content: center; padding-top: .15rem; color: var(--primary-strong); }
:global(.global-search-result__body) { min-width: 0; display: flex; flex-wrap: wrap; gap: .18rem .5rem; align-items: baseline; }
:global(.global-search-result__title-row) { width: 100%; min-width: 0; display: flex; align-items: baseline; justify-content: space-between; gap: .6rem; }
:global(.global-search-result__title-row strong) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
:global(.global-search-result__instance), :global(.global-search-result__meta) { color: var(--text-muted); font-size: var(--fs-xs); }
:global(.global-search-result__excerpt) { width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: .12rem .35rem; border-radius: var(--radius-sm); background: var(--bg-raised); color: var(--text-color); font-size: var(--fs-xs); }
:global(.global-search-empty) { min-height: 180px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .65rem; color: var(--text-muted); }
:global(.global-search-footer) { display: flex; justify-content: space-between; gap: 1rem; padding: .55rem 1rem; border-top: 1px solid var(--border-color); color: var(--text-muted); font-size: var(--fs-xs); }
@media (max-width: 1240px) {
    .global-search-trigger__label { display: none; }
}
@media (max-width: 767px) {
    :global(.global-search-backdrop) { padding: 12px; }
    :global(.global-search-dialog) { max-height: calc(100vh - 24px); }
    :global(.global-search-toolbar) { align-items: flex-start; flex-direction: column; }
    :global(.global-search-instance) { width: 100%; }
    :global(.global-search-footer) { display: none; }
}
</style>
