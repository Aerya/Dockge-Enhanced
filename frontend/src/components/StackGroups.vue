<template>
    <div class="stack-groups">
        <button v-if="error && !busy" type="button" class="btn btn-sm" @click="error = ''; load()">{{ $t('stackGroups.retry') }}</button>
        <fieldset :disabled="!ready || busy" class="border-0 p-0 m-0">
            <div class="d-flex align-items-center gap-2 px-2 py-1">
                <label class="small d-flex align-items-center gap-2">
                    <input type="checkbox" class="form-check-input mt-0" :checked="preferences.enabled" :disabled="!username" @change="setEnabled($event.target.checked)" />
                    {{ $t('stackGroups.title') }}
                </label>
                <button v-if="username" type="button" class="btn btn-sm ms-auto" :aria-expanded="editing" @click="editing = !editing">{{ $t('stackGroups.manage') }}</button>
            </div>
            <p v-if="error" class="text-warning small px-2" role="alert">{{ $t(error) }}</p>
            <p v-if="legacy.groups.length" class="small px-2">
                {{ $t('stackGroups.importHint') }}
                <button type="button" class="btn btn-sm" @click="importLegacy">{{ $t('stackGroups.import') }}</button>
            </p>
            <section v-if="editing" class="group-editor p-2" :aria-label="$t('stackGroups.manage')">
                <p class="small text-muted">{{ $t('stackGroups.local') }}</p>
                <form class="d-flex gap-1 mb-2" @submit.prevent="addGroup">
                    <input v-model="newName" maxlength="80" class="form-control form-control-sm" :aria-label="$t('stackGroups.name')" :placeholder="$t('stackGroups.name')" />
                    <button class="btn btn-sm btn-primary" :disabled="!newName.trim() || preferences.groups.length >= 100">{{ $t('stackGroups.add') }}</button>
                </form>
                <p class="small text-muted">{{ $t('stackGroups.hierarchyHelp') }}</p>
                <div v-for="group in preferences.groups" :key="group.id" class="group-edit-row mb-2">
                    <input :value="group.name" maxlength="80" class="form-control form-control-sm" :aria-label="$t('stackGroups.name')" @change="renameGroup(group.id, $event.target.value)" />
                    <select class="form-select form-select-sm" :value="group.parentId || ''" :aria-label="$t('stackGroups.parent')" @change="reparent(group.id, $event.target.value)">
                        <option value="">{{ $t('stackGroups.root') }}</option>
                        <option v-for="parent in parentOptions(group.id)" :key="parent.id" :value="parent.id">{{ groupPath(parent.id) }}</option>
                    </select>
                    <button type="button" class="btn btn-sm btn-outline-danger" :title="$t('stackGroups.removeHint')" @click="removeGroup(group.id)">{{ $t('stackGroups.remove') }}</button>
                </div>
                <input v-model="assignmentSearch" class="form-control form-control-sm my-2" :aria-label="$t('stackGroups.find')" :placeholder="$t('stackGroups.find')" />
                <div class="group-assignments">
                    <label v-for="stack in assignmentStacks" :key="identity(stack)" class="d-block small mb-2">
                        <span>{{ stack.displayName || stack.name }} · {{ endpointLabel(stack.endpoint || '') }}</span>
                        <select class="form-select form-select-sm" :value="groupFor(stack)" @change="assign(stack, $event.target.value)">
                            <option value="">{{ $t('stackGroups.ungrouped') }}</option>
                            <option v-for="group in preferences.groups" :key="group.id" :value="group.id">{{ groupPath(group.id) }}</option>
                        </select>
                    </label>
                </div>
            </section>
        </fieldset>
        <template v-if="preferences.enabled">
            <section v-for="group in visibleGroups" :key="group.id" class="custom-stack-group" :style="{ marginInlineStart: `${group.depth * 0.65}rem` }">
                <button v-if="group.id" type="button" class="group-heading" :disabled="!ready || busy" :aria-expanded="!group.collapsed" @click="toggle(group.id)">
                    <span aria-hidden="true">{{ group.collapsed ? '▸' : '▾' }}</span>
                    <span class="group-name">{{ group.name }}</span>
                    <span class="badge bg-secondary">{{ group.descendantStacks.length }}</span>
                    <span v-if="notRunning(group.descendantStacks)" class="badge bg-warning text-dark" :title="$t('stackGroups.notRunning')">{{ notRunning(group.descendantStacks) }}</span>
                </button>
                <div v-else class="group-heading">{{ $t('stackGroups.ungrouped') }} <span class="badge bg-secondary">{{ group.stacks.length }}</span></div>
                <template v-if="!group.collapsed">
                    <slot v-for="stack in group.stacks" :key="identity(stack)" name="stack" :stack="stack" />
                </template>
            </section>
        </template>
        <slot v-if="!preferences.enabled" />
    </div>
</template>

<script>
import { assignStackGroup, groupVisibleStacks, importStackGroups, parseStackGroups, stackGroupStorageKey, stackIdentity, canReparentStackGroup, stackGroupPath } from "../stack-groups";
import { RUNNING } from "../../../common/util-common";

export default {
    props: {
        stacks: { type: Array,
            required: true },
        availableStacks: { type: Array,
            required: true },
        username: { type: String,
            default: "" },
        searching: { type: Boolean,
            default: false },
        endpointLabel: { type: Function,
            required: true },
    },
    data: () => ({ preferences: parseStackGroups(null),
        legacy: parseStackGroups(null),
        revision: 0,
        generation: 0,
        ready: false,
        busy: false,
        reloadPending: false,
        editing: false,
        newName: "",
        assignmentSearch: "",
        error: "" }),
    computed: {
        visibleGroups() {
            return groupVisibleStacks(this.stacks, this.preferences.groups, this.searching);
        },
        assignmentStacks() {
            const query = this.assignmentSearch.toLocaleLowerCase();
            return this.availableStacks.filter(stack => `${stack.displayName || stack.name} ${this.endpointLabel(stack.endpoint || "")}`.toLocaleLowerCase().includes(query));
        },
    },
    watch: {
        username: { immediate: true,
            handler() {
                this.generation++;
                this.preferences = parseStackGroups(null);
                this.legacy = parseStackGroups(null);
                this.revision = 0;
                this.ready = false;
                this.busy = false;
                this.editing = false;
                this.reloadPending = false;
                this.newName = "";
                this.assignmentSearch = "";
                this.error = "";
                try {
                    this.legacy = parseStackGroups(this.username ? localStorage.getItem(stackGroupStorageKey(this.username)) : null);
                } catch { /* Server preferences work without browser storage. */ }
                return this.load();
            } },
    },
    mounted() {
        this.$root.getSocket().on("stackGroups:changed", this.refresh);
        this.$root.getSocket().on("userAccess", this.refresh);
        this.$root.getSocket().on("disconnect", this.disconnected);
        window.addEventListener("focus", this.refresh);
    },
    beforeUnmount() {
        this.generation++;
        this.$root.getSocket().off("stackGroups:changed", this.refresh);
        this.$root.getSocket().off("userAccess", this.refresh);
        this.$root.getSocket().off("disconnect", this.disconnected);
        window.removeEventListener("focus", this.refresh);
    },
    methods: {
        identity: stackIdentity,
        request(event, ...args) {
            return new Promise((resolve, reject) => {
                const socket = this.$root.getSocket();
                if (!socket.connected) {
                    reject(new Error("stackGroups.storageError"));
                    return;
                }
                socket.timeout(10000).emit(event, ...args, (error, result) => {
                    if (error || !result?.ok) {
                        reject(new Error(result?.msg || "stackGroups.storageError"));
                    } else {
                        resolve(result.config);
                    }
                });
            });
        },
        disconnected() {
            this.generation++;
            this.ready = false;
            this.busy = false;
        },
        refresh() {
            if (this.busy) {
                this.reloadPending = true;
            } else {
                this.load();
            }
        },
        async load() {
            if (!this.username) {
                return;
            }
            const generation = ++this.generation;
            try {
                const config = await this.request("stackGroups:get");
                if (generation !== this.generation) {
                    return;
                }
                this.preferences = config.preferences;
                this.revision = config.revision;
                this.ready = true;
            } catch {
                if (generation === this.generation) {
                    this.ready = false;
                    this.error = "stackGroups.storageError";
                }
            }
        },
        async save(next, importing = false) {
            if (!this.username || !this.ready || this.busy) {
                return false;
            }
            const generation = ++this.generation;
            this.busy = true;
            this.error = "";
            let saved = false;
            try {
                const config = await this.request("stackGroups:save", {
                    revision: this.revision,
                    preferences: JSON.parse(JSON.stringify(next)),
                });
                if (generation !== this.generation) {
                    return false;
                }
                this.preferences = config.preferences;
                this.revision = config.revision;
                saved = true;
                if (importing) {
                    this.legacy = parseStackGroups(null);
                    try {
                        localStorage.removeItem(stackGroupStorageKey(this.username));
                    } catch { /* Import stays idempotent if local cleanup fails. */ }
                }
            } catch (error) {
                if (generation !== this.generation) {
                    return false;
                }
                this.error = error.message === "stackGroups.conflict" ? error.message : "stackGroups.storageError";
                this.reloadPending = true;
            } finally {
                if (generation === this.generation) {
                    this.busy = false;
                }
            }
            if (generation === this.generation && this.reloadPending) {
                this.reloadPending = false;
                await this.load();
            }
            return saved;
        },
        setEnabled(enabled) {
            return this.save({ ...this.preferences,
                enabled });
        },
        async addGroup() {
            const name = this.newName.trim();
            if (!name || this.preferences.groups.length >= 100) {
                return;
            }
            const next = parseStackGroups(JSON.stringify(this.preferences));
            next.groups.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                name,
                collapsed: false,
                members: [] });
            next.enabled = true;
            if (await this.save(next)) {
                this.newName = "";
            }
        },
        renameGroup(id, name) {
            const next = parseStackGroups(JSON.stringify(this.preferences));
            const group = next.groups.find(item => item.id === id);
            if (group && name.trim()) {
                group.name = name.trim().slice(0, 80);
            }
            return this.save(next);
        },
        removeGroup(id) {
            return this.save({ ...this.preferences,
                groups: this.preferences.groups.filter(group => group.id !== id).map(group => {
                    const copy = { ...group };
                    if (copy.parentId === id) {
                        delete copy.parentId;
                    }
                    return copy;
                }) });
        },
        groupPath(id) {
            return stackGroupPath(this.preferences.groups, id);
        },
        parentOptions(id) {
            return this.preferences.groups.filter(group => canReparentStackGroup(this.preferences.groups, id, group.id));
        },
        reparent(id, parentId) {
            if (!canReparentStackGroup(this.preferences.groups, id, parentId)) {
                return;
            }
            const next = parseStackGroups(JSON.stringify(this.preferences));
            const group = next.groups.find(item => item.id === id);
            if (parentId) {
                group.parentId = parentId;
            } else {
                delete group.parentId;
            }
            return this.save(next);
        },
        groupFor(stack) {
            return this.preferences.groups.find(group => group.members.includes(stackIdentity(stack)))?.id || "";
        },
        assign(stack, id) {
            return this.save({ ...this.preferences,
                groups: assignStackGroup(this.preferences.groups, stack, id) });
        },
        toggle(id) {
            const next = parseStackGroups(JSON.stringify(this.preferences));
            const group = next.groups.find(item => item.id === id);
            if (group) {
                group.collapsed = !group.collapsed;
            }
            return this.save(next);
        },
        importLegacy() {
            try {
                return this.save(importStackGroups(JSON.parse(JSON.stringify(this.preferences)), JSON.parse(JSON.stringify(this.legacy))), true);
            } catch {
                this.error = "stackGroups.importLimit";
            }
        },
        notRunning(stacks) {
            return stacks.filter(stack => stack.status !== RUNNING).length;
        },
    },
};
</script>

<style scoped>
.group-editor { border: 1px solid var(--bs-border-color); border-radius: .5rem; }
.group-edit-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .25rem; }
.group-edit-row select { grid-row: 2; grid-column: 1 / -1; }
.group-assignments { max-height: 18rem; overflow-y: auto; }
.group-heading { display: flex; align-items: center; gap: .5rem; width: 100%; padding: .6rem; border: 0; background: transparent; color: inherit; text-align: left; }
.group-name { flex: 1; overflow-wrap: anywhere; }
.custom-stack-group + .custom-stack-group { border-top: 1px solid var(--bs-border-color); }
</style>
