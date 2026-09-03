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
                            :placeholder="$t('globalSearch.placeholderV2')"
                            autocomplete="off"
                            spellcheck="false"
                            @input="scheduleSearch"
                            @keydown.down.prevent="moveSelection(1)"
                            @keydown.up.prevent="moveSelection(-1)"
                            @keydown.enter.prevent="activateSelected"
                            @keydown.esc.prevent="close"
                        >
                        <button
                            type="button"
                            class="btn btn-sm btn-normal global-search-favorite-btn"
                            :class="{ active: isCurrentFavorite }"
                            :disabled="query.trim().length < 2 || includeEnvValues"
                            :title="includeEnvValues ? $t('globalSearch.historyDisabledSensitive') : $t(isCurrentFavorite ? 'globalSearch.favoriteRemove' : 'globalSearch.favoriteAdd')"
                            @click="toggleFavorite"
                        >
                            <font-awesome-icon icon="star" />
                        </button>
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
                        <select v-if="instanceOptions.length > 1" v-model="activeEndpoint" class="form-select form-select-sm global-search-instance" @change="runSearch">
                            <option value="*">{{ $t("globalSearch.allInstances") }}</option>
                            <option v-for="instance in instanceOptions" :key="instance.endpoint" :value="instance.endpoint">
                                {{ instance.name }}
                            </option>
                        </select>
                    </div>

                    <div class="global-search-advanced">
                        <label class="global-search-option">
                            <input v-model="searchSnapshots" type="checkbox" @change="runSearch">
                            <span>{{ $t("globalSearch.searchSnapshots") }}</span>
                        </label>
                        <label class="global-search-option" :title="$t('globalSearch.envValuesHint')">
                            <input v-model="includeEnvValues" type="checkbox" @change="onSensitiveSearchToggle">
                            <span>{{ $t("globalSearch.searchEnvValues") }}</span>
                        </label>
                        <span v-if="includeEnvValues" class="global-search-sensitive-note">
                            <font-awesome-icon icon="shield-alt" /> {{ $t("globalSearch.historyDisabledSensitive") }}
                        </span>
                    </div>

                    <div class="global-search-operators">
                        <span class="global-search-operators__label">{{ $t("globalSearch.operatorHint") }}</span>
                        <button
                            v-for="operator in operatorSuggestions"
                            :key="operator.value"
                            type="button"
                            class="global-search-operator"
                            :title="$t(operator.titleKey)"
                            @click="insertOperator(operator.value)"
                        >
                            {{ operator.value }}
                        </button>
                    </div>

                    <div class="global-search-results" role="listbox">
                        <template v-if="query.trim().length < 2">
                            <div v-if="!includeEnvValues && favoriteSearches.length" class="global-search-saved-section">
                                <div class="global-search-group-title">{{ $t("globalSearch.favorites") }}</div>
                                <button v-for="item in favoriteSearches" :key="`fav:${item}`" type="button" class="global-search-saved" @click="useSavedSearch(item)">
                                    <font-awesome-icon icon="star" /> <span>{{ item }}</span>
                                </button>
                            </div>
                            <div v-if="!includeEnvValues && recentSearches.length" class="global-search-saved-section">
                                <div class="global-search-group-title">{{ $t("globalSearch.recents") }}</div>
                                <button v-for="item in recentSearches" :key="`recent:${item}`" type="button" class="global-search-saved" @click="useSavedSearch(item)">
                                    <font-awesome-icon icon="clock" /> <span>{{ item }}</span>
                                </button>
                            </div>
                            <div v-if="includeEnvValues || (!favoriteSearches.length && !recentSearches.length)" class="global-search-empty">
                                <font-awesome-icon icon="search" />
                                <span>{{ $t("globalSearch.minChars") }}</span>
                            </div>
                        </template>
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
                                    <span v-if="result.historical" class="global-search-result__badge">{{ $t("globalSearch.historical") }} · {{ shortSnapshot(result.snapshotId) }}</span>
                                    <span v-if="result.diagnostic" class="global-search-result__badge">{{ diagnosticLabel(result) }}</span>
                                    <code v-if="result.excerpt && result.type !== 'env'" class="global-search-result__excerpt">{{ result.excerpt }}</code>
                                    <span v-if="result.type === 'env' || result.envValueMatch" class="global-search-result__meta">
                                        {{ result.envValueMatch ? $t("globalSearch.envValueMatched") : $t("globalSearch.envValueHidden") }}
                                    </span>
                                </span>
                            </button>
                        </template>
                    </div>

                    <div class="global-search-footer">
                        <span>{{ $t("globalSearch.keyboardHint") }}</span>
                        <span v-if="snapshotSearchTruncated">{{ $t("globalSearch.snapshotLimited") }}</span>
                        <span v-else-if="truncated">{{ $t("globalSearch.truncated") }}</span>
                    </div>
                </section>
            </div>
        </Teleport>
    </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";

type ResultType = "stack" | "compose" | "env" | "backup" | "config";
type Diagnostic = "update" | "stopped" | "inactive" | "vulnerable" | "critical" | "backup-failed";
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
    snapshotId?: string;
    historical?: boolean;
    envValueMatch?: boolean;
    diagnostic?: Diagnostic;
    diagnosticCount?: number;
    score?: number;
};
type SearchResult = Omit<BackendResult, "type"> & {
    type: ResultType;
    uid: string;
    endpoint: string;
    instanceName: string;
    route?: string;
};

type SearchResponse = { results: SearchResult[]; truncated: boolean; snapshotSearchTruncated?: boolean };

const RECENT_KEY = "globalSearchRecentV2";
const FAVORITE_KEY = "globalSearchFavoritesV2";
const ENV_VALUES_KEY = "globalSearchEnvValuesV2";

function readStringList(key: string): string[] {
    try {
        const value = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(value) ? value.filter(item => typeof item === "string").slice(0, 8) : [];
    } catch {
        return [];
    }
}

function simpleFuzzy(haystackInput: string, needleInput: string): boolean {
    const haystack = haystackInput.toLocaleLowerCase();
    const needle = needleInput.toLocaleLowerCase();
    if (!needle || haystack.includes(needle)) return true;
    if (Math.abs(haystack.length - needle.length) > 2) return false;
    let previous = Array.from({ length: needle.length + 1 }, (_, i) => i);
    for (let i = 1; i <= haystack.length; i++) {
        const current = [ i ];
        for (let j = 1; j <= needle.length; j++) {
            const cost = haystack[i - 1] === needle[j - 1] ? 0 : 1;
            current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
        }
        previous = current;
    }
    return previous[needle.length] <= (needle.length >= 7 ? 2 : 1);
}

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
            snapshotSearchTruncated: false,
            searchSnapshots: false,
            includeEnvValues: localStorage.getItem(ENV_VALUES_KEY) === "1",
            recentSearches: readStringList(RECENT_KEY),
            favoriteSearches: readStringList(FAVORITE_KEY),
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
        operatorSuggestions(): Array<{ value: string; titleKey: string }> {
            return [
                { value: "type:stack", titleKey: "globalSearch.operator.type" },
                { value: "type:compose", titleKey: "globalSearch.operator.type" },
                { value: "type:env", titleKey: "globalSearch.operator.type" },
                { value: "type:backup", titleKey: "globalSearch.operator.type" },
                { value: "type:config", titleKey: "globalSearch.operator.type" },
                { value: "stack:", titleKey: "globalSearch.operator.stack" },
                { value: "image:", titleKey: "globalSearch.operator.image" },
                { value: "port:", titleKey: "globalSearch.operator.port" },
                { value: "instance:", titleKey: "globalSearch.operator.instance" },
                { value: "is:update", titleKey: "globalSearch.operator.diagnostic" },
                { value: "is:stopped", titleKey: "globalSearch.operator.diagnostic" },
                { value: "is:inactive", titleKey: "globalSearch.operator.diagnostic" },
                { value: "is:vulnerable", titleKey: "globalSearch.operator.diagnostic" },
                { value: "is:critical", titleKey: "globalSearch.operator.diagnostic" },
                { value: "is:backup-failed", titleKey: "globalSearch.operator.diagnostic" },
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
        isCurrentFavorite(): boolean {
            return this.favoriteSearches.includes(this.query.trim());
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
            if (this.includeEnvValues) {
                this.query = "";
                this.results = [];
                this.selectedUid = "";
                this.truncated = false;
                this.snapshotSearchTruncated = false;
                this.loading = false;
            }
        },
        scheduleSearch() {
            if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
            this.debounceTimer = window.setTimeout(() => this.runSearch(), 250);
        },
        parseClientQuery(raw: string): { backendQuery: string; instanceOperand: string; typeOperand: string } {
            let backendQuery = raw.trim();
            let instanceOperand = "";
            let typeOperand = "";
            backendQuery = backendQuery.replace(/(?:^|\s)instance:(?:"([^"]+)"|'([^']+)'|([^\s]+))/i, (_match, a, b, c) => {
                instanceOperand = String(a ?? b ?? c ?? "").trim();
                return " ";
            }).trim().replace(/\s+/g, " ");
            const typeMatch = backendQuery.match(/(?:^|\s)type:([^\s]+)/i);
            if (typeMatch) typeOperand = typeMatch[1].toLocaleLowerCase();
            if (backendQuery.length < 2 && instanceOperand) backendQuery = "type:stack";
            return { backendQuery, instanceOperand, typeOperand };
        },
        targetInstances(instanceOperand: string): Array<{ endpoint: string; name: string }> {
            let options = this.instanceOptions;
            if (this.activeEndpoint !== "*") options = options.filter(item => item.endpoint === this.activeEndpoint);
            if (instanceOperand) {
                options = options.filter(item => simpleFuzzy(item.name, instanceOperand) || simpleFuzzy(item.endpoint, instanceOperand));
            }
            return options;
        },
        async runSearch() {
            const rawQuery = this.query.trim();
            const seq = ++this.requestSeq;
            this.selectedUid = "";
            this.truncated = false;
            this.snapshotSearchTruncated = false;
            if (rawQuery.length < 2) {
                this.results = [];
                this.loading = false;
                return;
            }

            const { backendQuery, instanceOperand, typeOperand } = this.parseClientQuery(rawQuery);
            this.loading = true;
            const localInstanceName = this.$t("globalSearch.localInstance") as string;
            const localConfigAllowed = !instanceOperand || simpleFuzzy(localInstanceName, instanceOperand);
            const configResults = (typeOperand && typeOperand !== "config") || !localConfigAllowed ? [] : this.searchConfiguration(backendQuery);
            const requests = this.targetInstances(instanceOperand).map(instance => this.searchInstance(instance.endpoint, instance.name, backendQuery));
            const settled = await Promise.all(requests);
            if (seq !== this.requestSeq) return;

            this.results = [ ...settled.flatMap(item => item.results), ...configResults ];
            this.truncated = settled.some(item => item.truncated);
            this.snapshotSearchTruncated = settled.some(item => item.snapshotSearchTruncated);
            this.loading = false;
            this.resetSelection();
        },
        searchInstance(endpoint: string, instanceName: string, query: string): Promise<SearchResponse> {
            return new Promise((resolve) => {
                let done = false;
                let fallbackStarted = false;
                const finish = (value: SearchResponse) => {
                    if (done) return;
                    done = true;
                    window.clearTimeout(hardTimer);
                    window.clearTimeout(fallbackTimer);
                    resolve(value);
                };
                const normalizeResponse = (res: any): SearchResponse | null => {
                    if (!res?.ok || !res.data) return null;
                    const results = Array.isArray(res.data.results) ? res.data.results : [];
                    return {
                        results: results.map((result: BackendResult) => ({
                            ...result,
                            endpoint,
                            instanceName,
                            uid: `${endpoint}|${result.id}`,
                        })),
                        truncated: res.data.truncated === true,
                        snapshotSearchTruncated: res.data.snapshotSearchTruncated === true,
                    };
                };
                const canFallback = !this.includeEnvValues && !this.searchSnapshots && !/(?:^|\s)(?:type|stack|image|port|is):/i.test(query);
                const runFallback = () => {
                    if (!canFallback || fallbackStarted || done) return;
                    fallbackStarted = true;
                    this.$root.emitAgent(endpoint, "globalSearch", query, 50, (res) => {
                        const parsed = normalizeResponse(res);
                        if (parsed) finish(parsed);
                    });
                };
                const hardTimer = window.setTimeout(() => finish({ results: [], truncated: false }), 4000);
                const fallbackTimer = window.setTimeout(runFallback, 900);
                this.$root.emitAgent(endpoint, "globalSearchV2", {
                    query,
                    limit: 70,
                    includeEnvValues: this.includeEnvValues,
                    searchSnapshots: this.searchSnapshots,
                }, (res) => {
                    const parsed = normalizeResponse(res);
                    if (parsed) finish(parsed);
                    else runFallback();
                });
            });
        },
        searchConfiguration(query: string): SearchResult[] {
            const terms = query.split(/\s+/).filter(token => token && !/^(?:type|stack|image|port|is):/i.test(token));
            const listAll = /(?:^|\s)type:config(?:\s|$)/i.test(query);
            if (!terms.length && !listAll) return [];
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
                const haystack = `${title} ${keywords}`;
                if (!listAll && !terms.every(term => haystack.toLocaleLowerCase().includes(term.toLocaleLowerCase()) || simpleFuzzy(title, term))) return [];
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
        rememberSearch(value: string) {
            const next = [ value, ...this.recentSearches.filter(item => item !== value) ].slice(0, 8);
            this.recentSearches = next;
            localStorage.setItem(RECENT_KEY, JSON.stringify(next));
        },
        toggleFavorite() {
            const value = this.query.trim();
            if (value.length < 2 || this.includeEnvValues) return;
            const exists = this.favoriteSearches.includes(value);
            this.favoriteSearches = exists
                ? this.favoriteSearches.filter(item => item !== value)
                : [ value, ...this.favoriteSearches ].slice(0, 8);
            localStorage.setItem(FAVORITE_KEY, JSON.stringify(this.favoriteSearches));
        },
        useSavedSearch(value: string) {
            this.query = value;
            this.runSearch();
            this.$nextTick(() => (this.$refs.searchInput as HTMLInputElement | undefined)?.focus());
        },
        insertOperator(value: string) {
            const current = this.query.trim();
            if (!value.endsWith(":") && current.split(/\s+/).includes(value)) {
                this.query = current.split(/\s+/).filter(token => token !== value).join(" ");
            } else {
                this.query = `${current}${current ? " " : ""}${value}`;
            }
            this.$nextTick(() => {
                const input = this.$refs.searchInput as HTMLInputElement | undefined;
                input?.focus();
                if (input) input.selectionStart = input.selectionEnd = input.value.length;
            });
            if (!value.endsWith(":")) this.scheduleSearch();
        },
        onSensitiveSearchToggle() {
            localStorage.setItem(ENV_VALUES_KEY, this.includeEnvValues ? "1" : "0");
            if (!this.includeEnvValues) {
                // Une requête saisie pendant le mode sensible ne doit jamais être
                // rejouée en mode normal, où elle pourrait finir dans l'historique.
                this.query = "";
                this.results = [];
                this.selectedUid = "";
                this.truncated = false;
                this.snapshotSearchTruncated = false;
                this.loading = false;
                return;
            }
            this.runSearch();
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
        navigationTerm(result: SearchResult): string {
            if (result.type === "env") return result.title;
            const image = this.query.match(/(?:^|\s)image:([^\s]+)/i)?.[1];
            if (image) return image;
            const port = this.query.match(/(?:^|\s)port:([^\s]+)/i)?.[1];
            if (port) return port;
            return this.query.split(/\s+/).find(token => !/^(?:type|stack|instance|is):/i.test(token)) ?? "";
        },
        activate(result: SearchResult) {
            const currentQuery = this.query.trim();
            if (!this.includeEnvValues && currentQuery.length >= 2) this.rememberSearch(currentQuery);
            if (result.type === "config" && result.route) {
                this.$router.push(result.route);
                this.close();
                return;
            }
            if ((result.type === "stack" || result.type === "compose" || result.type === "env") && result.stackName) {
                const base = `/compose/${encodeURIComponent(result.stackName)}`;
                const path = result.endpoint ? `${base}/${encodeURIComponent(result.endpoint)}` : base;
                const route = result.line && result.source ? {
                    path,
                    query: {
                        gsSource: result.source,
                        gsLine: String(result.line),
                        gsTerm: this.navigationTerm(result),
                    },
                } : { path };
                this.$router.push(route);
                this.close();
                return;
            }
            if (result.type === "backup") {
                if (result.endpoint) {
                    const agentUrl = this.$root.agentList?.[result.endpoint]?.url;
                    if (agentUrl) {
                        const url = new URL("watcher/backup", `${agentUrl.replace(/\/?$/, "/")}`);
                        if (result.snapshotId) url.searchParams.set("snapshot", result.snapshotId);
                        window.open(url.toString(), "_blank", "noopener,noreferrer");
                    }
                } else {
                    this.$router.push({ path: "/watcher/backup", query: result.snapshotId ? { snapshot: result.snapshotId } : {} });
                }
                this.close();
            }
        },
        diagnosticLabel(result: SearchResult) {
            if (!result.diagnostic) return "";
            const key = `globalSearch.diagnostic.${result.diagnostic}`;
            return this.$t(key, { count: result.diagnosticCount ?? 0 });
        },
        shortSnapshot(snapshotId?: string) {
            return snapshotId ? snapshotId.slice(0, 12) : "";
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
    padding: min(9vh, 85px) 16px 24px;
    background: rgba(4, 10, 18, .72);
    backdrop-filter: blur(4px);
}
:global(.global-search-dialog) {
    width: min(860px, 100%);
    max-height: min(790px, calc(100vh - 110px));
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
:global(.global-search-favorite-btn.active) { color: #eab308; }
:global(.global-search-toolbar) { display: flex; gap: .75rem; align-items: center; justify-content: space-between; padding: .55rem 1rem; border-bottom: 1px solid var(--border-color); }
:global(.global-search-filters) { display: flex; flex-wrap: wrap; gap: .35rem; }
:global(.global-search-filter) { border: 1px solid var(--border-color); border-radius: var(--radius-pill); padding: .22rem .6rem; background: transparent; color: var(--text-muted); font-size: var(--fs-xs); }
:global(.global-search-filter.active) { border-color: var(--primary-strong); background: var(--primary-soft); color: var(--primary-strong); }
:global(.global-search-instance) { width: min(210px, 38%); }
:global(.global-search-advanced) { display: flex; flex-wrap: wrap; gap: .55rem 1rem; align-items: center; padding: .48rem 1rem; border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-size: var(--fs-xs); }
:global(.global-search-option) { display: inline-flex; gap: .35rem; align-items: center; cursor: pointer; }
:global(.global-search-sensitive-note) { color: var(--warning); }
:global(.global-search-operators) { display: flex; align-items: center; gap: .3rem; overflow-x: auto; padding: .42rem 1rem; border-bottom: 1px solid var(--border-color); scrollbar-width: thin; }
:global(.global-search-operators__label) { flex: 0 0 auto; color: var(--text-muted); font-size: var(--fs-xs); margin-right: .2rem; }
:global(.global-search-operator) { flex: 0 0 auto; border: 1px solid var(--border-color); border-radius: var(--radius-pill); padding: .18rem .48rem; background: var(--bg-raised); color: var(--text-muted); font-family: var(--font-mono); font-size: var(--fs-xs); }
:global(.global-search-operator:hover) { border-color: var(--primary-strong); color: var(--primary-strong); }
:global(.global-search-results) { overflow-y: auto; padding: .55rem; }
:global(.global-search-group-title) { padding: .55rem .7rem .3rem; color: var(--text-muted); font-size: var(--fs-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
:global(.global-search-saved-section) { margin-bottom: .45rem; }
:global(.global-search-saved) { width: 100%; display: flex; gap: .65rem; align-items: center; border: 0; border-radius: var(--radius-md); padding: .55rem .7rem; background: transparent; color: var(--text-color); text-align: left; }
:global(.global-search-saved:hover) { background: var(--bg-raised); }
:global(.global-search-saved svg) { color: var(--text-muted); }
:global(.global-search-result) { width: 100%; display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: .55rem; align-items: start; border: 0; border-radius: var(--radius-md); padding: .65rem .7rem; background: transparent; color: var(--text-color); text-align: left; }
:global(.global-search-result:hover), :global(.global-search-result.selected) { background: var(--bg-raised); }
:global(.global-search-result__icon) { display: flex; justify-content: center; padding-top: .15rem; color: var(--primary-strong); }
:global(.global-search-result__body) { min-width: 0; display: flex; flex-wrap: wrap; gap: .18rem .5rem; align-items: baseline; }
:global(.global-search-result__title-row) { width: 100%; min-width: 0; display: flex; align-items: baseline; justify-content: space-between; gap: .6rem; }
:global(.global-search-result__title-row strong) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
:global(.global-search-result__instance), :global(.global-search-result__meta) { color: var(--text-muted); font-size: var(--fs-xs); }
:global(.global-search-result__badge) { border-radius: var(--radius-pill); padding: .08rem .4rem; background: var(--primary-soft); color: var(--primary-strong); font-size: var(--fs-xs); }
:global(.global-search-result__excerpt) { width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: .12rem .35rem; border-radius: var(--radius-sm); background: var(--bg-raised); color: var(--text-color); font-size: var(--fs-xs); }
:global(.global-search-empty) { min-height: 160px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .65rem; color: var(--text-muted); }
:global(.global-search-footer) { display: flex; justify-content: space-between; gap: 1rem; padding: .55rem 1rem; border-top: 1px solid var(--border-color); color: var(--text-muted); font-size: var(--fs-xs); }
@media (max-width: 1240px) {
    .global-search-trigger__label { display: none; }
}
@media (max-width: 767px) {
    :global(.global-search-backdrop) { padding: 12px; }
    :global(.global-search-dialog) { max-height: calc(100vh - 24px); }
    :global(.global-search-toolbar) { align-items: flex-start; flex-direction: column; }
    :global(.global-search-instance) { width: 100%; }
    :global(.global-search-advanced) { align-items: flex-start; flex-direction: column; }
    :global(.global-search-footer) { display: none; }
}
</style>
