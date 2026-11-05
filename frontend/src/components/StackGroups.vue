<template>
    <div class="stack-groups">
        <div class="d-flex align-items-center gap-2 px-2 py-1">
            <label class="small d-flex align-items-center gap-2">
                <input type="checkbox" class="form-check-input mt-0" :checked="preferences.enabled" :disabled="!username" @change="setEnabled($event.target.checked)" />
                {{ $t('stackGroups.title') }}
            </label>
            <button v-if="username" type="button" class="btn btn-sm ms-auto" :aria-expanded="editing" @click="editing = !editing">{{ $t('stackGroups.manage') }}</button>
        </div>
        <p v-if="storageError" class="text-warning small px-2" role="alert">{{ $t('stackGroups.storageError') }}</p>
        <section v-if="editing" class="group-editor p-2" :aria-label="$t('stackGroups.manage')">
            <p class="small text-muted">{{ $t('stackGroups.local') }}</p>
            <form class="d-flex gap-1 mb-2" @submit.prevent="addGroup">
                <input v-model="newName" maxlength="80" class="form-control form-control-sm" :aria-label="$t('stackGroups.name')" :placeholder="$t('stackGroups.name')" />
                <button class="btn btn-sm btn-primary" :disabled="!newName.trim() || preferences.groups.length >= 100">{{ $t('stackGroups.add') }}</button>
            </form>
            <div v-for="group in preferences.groups" :key="group.id" class="d-flex gap-1 mb-1">
                <input :value="group.name" maxlength="80" class="form-control form-control-sm" :aria-label="$t('stackGroups.name')" @change="renameGroup(group.id, $event.target.value)" />
                <button type="button" class="btn btn-sm btn-outline-danger" :title="$t('stackGroups.removeHint')" @click="removeGroup(group.id)">{{ $t('stackGroups.remove') }}</button>
            </div>
            <input v-model="assignmentSearch" class="form-control form-control-sm my-2" :aria-label="$t('stackGroups.find')" :placeholder="$t('stackGroups.find')" />
            <div class="group-assignments">
                <label v-for="stack in assignmentStacks" :key="identity(stack)" class="d-block small mb-2">
                    <span>{{ stack.displayName || stack.name }} · {{ endpointLabel(stack.endpoint || '') }}</span>
                    <select class="form-select form-select-sm" :value="groupFor(stack)" @change="assign(stack, $event.target.value)">
                        <option value="">{{ $t('stackGroups.ungrouped') }}</option>
                        <option v-for="group in preferences.groups" :key="group.id" :value="group.id">{{ group.name }}</option>
                    </select>
                </label>
            </div>
        </section>
        <template v-if="preferences.enabled">
            <section v-for="group in visibleGroups" :key="group.id" class="custom-stack-group">
                <button v-if="group.id" type="button" class="group-heading" :aria-expanded="!group.collapsed" @click="toggle(group.id)">
                    <span aria-hidden="true">{{ group.collapsed ? '▸' : '▾' }}</span>
                    <span class="group-name">{{ group.name }}</span>
                    <span class="badge bg-secondary">{{ group.stacks.length }}</span>
                    <span v-if="notRunning(group.stacks)" class="badge bg-warning text-dark" :title="$t('stackGroups.notRunning')">{{ notRunning(group.stacks) }}</span>
                </button>
                <div v-else class="group-heading">{{ $t('stackGroups.ungrouped') }} <span class="badge bg-secondary">{{ group.stacks.length }}</span></div>
                <template v-if="!group.collapsed">
                    <slot v-for="stack in group.stacks" :key="identity(stack)" name="stack" :stack="stack" />
                </template>
            </section>
        </template>
        <slot v-else />
    </div>
</template>

<script>
import { assignStackGroup, groupVisibleStacks, parseStackGroups, stackGroupStorageKey, stackIdentity } from "../stack-groups";
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
        editing: false,
        newName: "",
        assignmentSearch: "",
        storageError: false }),
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
                this.editing = false;
                this.load();
            } },
    },
    mounted() {
        window.addEventListener("storage", this.sync);
    },
    beforeUnmount() {
        window.removeEventListener("storage", this.sync);
    },
    methods: {
        identity: stackIdentity,
        load() {
            this.storageError = false;
            try {
                this.preferences = parseStackGroups(this.username ? localStorage.getItem(stackGroupStorageKey(this.username)) : null);
            } catch {
                this.preferences = parseStackGroups(null);
                this.storageError = true;
            }
        },
        sync(event) {
            if (event.key === null || event.key === stackGroupStorageKey(this.username)) {
                this.load();
            }
        },
        save() {
            if (!this.username) {
                return;
            }
            try {
                localStorage.setItem(stackGroupStorageKey(this.username), JSON.stringify(this.preferences));
                this.storageError = false;
            } catch {
                this.storageError = true;
            }
        },
        setEnabled(enabled) {
            this.preferences.enabled = enabled;
            this.save();
        },
        addGroup() {
            const name = this.newName.trim();
            if (!name || this.preferences.groups.length >= 100) {
                return;
            }
            this.preferences.groups.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                name,
                collapsed: false,
                members: [] });
            this.newName = "";
            this.preferences.enabled = true;
            this.save();
        },
        renameGroup(id, name) {
            const group = this.preferences.groups.find(item => item.id === id);
            if (group && name.trim()) {
                group.name = name.trim().slice(0, 80);
            }
            this.save();
        },
        removeGroup(id) {
            this.preferences.groups = this.preferences.groups.filter(group => group.id !== id);
            this.save();
        },
        groupFor(stack) {
            return this.preferences.groups.find(group => group.members.includes(stackIdentity(stack)))?.id || "";
        },
        assign(stack, id) {
            this.preferences.groups = assignStackGroup(this.preferences.groups, stack, id);
            this.save();
        },
        toggle(id) {
            const group = this.preferences.groups.find(item => item.id === id);
            if (group) {
                group.collapsed = !group.collapsed;
            }
            this.save();
        },
        notRunning(stacks) {
            return stacks.filter(stack => stack.status !== RUNNING).length;
        },
    },
};
</script>

<style scoped>
.group-editor { border: 1px solid var(--bs-border-color); border-radius: .5rem; }
.group-assignments { max-height: 18rem; overflow-y: auto; }
.group-heading { display: flex; align-items: center; gap: .5rem; width: 100%; padding: .6rem; border: 0; background: transparent; color: inherit; text-align: left; }
.group-name { flex: 1; overflow-wrap: anywhere; }
.custom-stack-group + .custom-stack-group { border-top: 1px solid var(--bs-border-color); }
</style>
