<template>
    <section class="my-4">
        <h5>{{ $t('access.users') }}</h5>
        <p class="form-text">{{ $t('access.adminHelp') }}</p>
        <p v-if="error" class="alert alert-warning" role="alert">{{ error }}</p>
        <div v-for="user in users" :key="user.id" class="d-flex flex-wrap align-items-center gap-2 mb-2">
            <strong>{{ user.username }}</strong>
            <span>{{ user.role === 'admin' ? $t('access.admin') : user.active ? $t('access.restricted') : $t('access.disabled') }}</span>
            <button v-if="user.role === 'restricted'" class="btn btn-sm btn-normal" @click="edit(user)">{{ $t('Edit') }}</button>
            <button v-if="user.role === 'restricted'" class="btn btn-sm btn-normal" @click="beginAccountAction(user, 'reset2fa')">{{ $t('access.reset2fa') }}</button>
            <button v-if="user.role === 'restricted'" class="btn btn-sm btn-outline-danger" @click="beginAccountAction(user, 'delete')">{{ $t('access.deleteAccount') }}</button>
        </div>
        <button class="btn btn-sm btn-normal mb-3" @click="edit()">{{ $t('access.create') }}</button>
        <form v-if="accountAction" class="border rounded p-3 mb-3" @submit.prevent="performAccountAction">
            <p>{{ $t(accountAction.action === 'delete' ? 'access.deleteAccount' : 'access.reset2fa') }} : <strong>{{ accountAction.username }}</strong></p>
            <label class="d-block mb-2">{{ $t('Current Password') }}<input v-model="accountAction.password" type="password" autocomplete="current-password" class="form-control" required></label>
            <label class="d-block mb-2">{{ $t('access.securityCode') }}<input v-model="accountAction.code" autocomplete="one-time-code" class="form-control" maxlength="35"></label>
            <label class="d-block mb-2"><input v-model="accountAction.confirm" type="checkbox" required class="form-check-input me-2">{{ $t('access.confirmAccountAction') }}</label>
            <button class="btn btn-danger" :disabled="saving">{{ $t('Save') }}</button>
            <button type="button" class="btn btn-normal ms-2" @click="accountAction = null">{{ $t('cancel') }}</button>
        </form>
        <form v-if="draft" @submit.prevent="save">
            <label class="d-block mb-2">{{ $t('Username') }}<input v-model="draft.username" class="form-control" required pattern="[a-zA-Z0-9_.-]{1,64}" autocomplete="off"></label>
            <label class="d-block mb-2">{{ $t('access.password') }}<input v-model="draft.password" class="form-control" type="password" :required="!draft.id" autocomplete="new-password" maxlength="256"></label>
            <label class="d-block mb-2"><input v-model="draft.active" type="checkbox" class="form-check-input me-2">{{ $t('access.enabled') }}</label>
            <p class="small">{{ $t('access.selectStacks') }}</p>
            <div class="user-stack-list mb-3">
                <div v-for="item in stackOptions" :key="item.key" class="mb-3">
                    <label class="d-block mb-1"><input v-model="selectedStacks" type="checkbox" :value="item.key" class="form-check-input me-2" @change="ensurePermissions(item.key)">{{ item.label }}</label>
                    <div v-if="JSON.parse(item.key).length === 2 && !isContainerKey(item.key)" class="d-flex gap-2 mb-2">
                        <input v-model="serviceDrafts[item.key]" class="form-control form-control-sm" :aria-label="$t('access.service')" :placeholder="$t('access.service')" pattern="[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}">
                        <button type="button" class="btn btn-sm btn-normal" @click="addService(item.key)">{{ $t('access.addService') }}</button>
                    </div>
                    <div v-if="selectedStacks.includes(item.key)" class="d-flex flex-wrap gap-3 ms-3">
                        <label v-for="permission in permissionsFor(item.key)" :key="permission"><input v-model="permissionsByStack[item.key]" type="checkbox" :value="permission" :disabled="permission === 'view'" class="form-check-input me-1">{{ $t(`access.${permission}`) }}</label>
                    </div>
                </div>
            </div>
            <button class="btn btn-primary" :disabled="saving">{{ $t('Save') }}</button>
            <button type="button" class="btn btn-normal ms-2" @click="draft = null">{{ $t('cancel') }}</button>
        </form>
    </section>
</template>
<script>
import { USER_PERMISSIONS } from "../../../../common/user-access";
export default {
    data: () => ({ users: [],
        containers: [],
        draft: null,
        accountAction: null,
        permissionsByStack: {},
        serviceDrafts: {},
        serviceScopes: [],
        selectedStacks: [],
        error: "",
        saving: false,
        permissions: USER_PERMISSIONS }),
    computed: {
        stackOptions() {
            const options = new Map();
            for (const stack of Object.values(this.$root.completeStackList)) {
                const endpoint = stack.endpoint || "";
                const key = JSON.stringify([ endpoint, stack.name ]);
                options.set(key, { key,
                    label: `${this.$root.agentList[endpoint]?.displayName || endpoint || this.$t("localInstance")} / ${stack.displayName || stack.name}` });
            }
            // Standalone containers are local-only and keyed as a stack with the @container: prefix.
            for (const name of this.containers) {
                const key = JSON.stringify([ "", `@container:${name}` ]);
                options.set(key, { key,
                    label: `${this.$t("localInstance")} / ${name} (${this.$t("access.standaloneContainer")})` });
            }
            // Preserve grants while an agent is offline; never silently drop them.
            for (const grant of [ ...(this.draft?.grants || []), ...this.serviceScopes ]) {
                const key = JSON.stringify([ grant.endpoint, grant.stack, ...(grant.service ? [ grant.service ] : []) ]);
                if (!options.has(key)) {
                    options.set(key, { key,
                        label: `${grant.endpoint || this.$t("localInstance")} / ${grant.stack}${grant.service ? ` / ${grant.service}` : ""}` });
                }
            }
            return [ ...options.values() ];
        },
    },
    mounted() {
        this.load();
    },
    methods: {
        load() {
            this.$root.getSocket().timeout(10000).emit("usersList", (error, result) => {
                if (error || !result?.ok) {
                    this.error = this.$t("access.denied");
                } else {
                    this.users = result.data;
                }
            });
            this.$root.getSocket().timeout(10000).emit("scopedContainerCandidates", (error, result) => {
                this.containers = !error && result?.ok ? result.data : [];
            });
        },
        isContainerKey(key) {
            return JSON.parse(key)[1]?.startsWith("@container:") === true;
        },
        permissionsFor(key) {
            // A standalone container has no Compose definition to update or recreate.
            return this.isContainerKey(key) ? this.permissions.filter(permission => ![ "update", "recreate" ].includes(permission)) : this.permissions;
        },
        edit(user) {
            this.accountAction = null;
            this.serviceScopes = [];
            this.serviceDrafts = {};
            this.draft = user ? { ...user,
                password: "" } : { username: "",
                password: "",
                active: true,
                grants: [] };
            this.selectedStacks = this.draft.grants.map(grant => JSON.stringify([ grant.endpoint, grant.stack, ...(grant.service ? [ grant.service ] : []) ]));
            this.permissionsByStack = Object.fromEntries(this.draft.grants.map(grant => [ JSON.stringify([ grant.endpoint, grant.stack, ...(grant.service ? [ grant.service ] : []) ]), [ ...grant.permissions ]]));
        },
        addService(key) {
            const service = this.serviceDrafts[key]?.trim();
            if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(service || "")) {
                this.error = this.$t("access.invalid");
                return;
            }
            const [ endpoint, stack ] = JSON.parse(key);
            const serviceKey = JSON.stringify([ endpoint, stack, service ]);
            this.serviceScopes.push({ endpoint,
                stack,
                service });
            if (!this.selectedStacks.includes(serviceKey)) {
                this.selectedStacks.push(serviceKey);
            }
            this.ensurePermissions(serviceKey);
            this.serviceDrafts[key] = "";
        },
        ensurePermissions(key) {
            this.permissionsByStack[key] ||= [ "view" ];
        },
        beginAccountAction(user, action) {
            this.draft = null;
            this.accountAction = { id: user.id,
                username: user.username,
                action,
                password: "",
                code: "",
                confirm: false };
        },
        performAccountAction() {
            this.saving = true;
            this.error = "";
            this.$root.getSocket().timeout(15000).emit("usersAccountAction", this.accountAction, (error, reply) => {
                this.saving = false;
                if (error || !reply?.ok) {
                    this.error = this.$t("access.accountFailed");
                } else {
                    this.accountAction = null;
                    this.load();
                }
            });
        },
        save() {
            this.saving = true;
            this.error = "";
            const grants = this.selectedStacks.map(key => {
                const [ endpoint, stack, service ] = JSON.parse(key);
                return { endpoint,
                    stack,
                    ...(service ? { service } : {}),
                    permissions: this.permissionsByStack[key] || [ "view" ] };
            });
            this.$root.getSocket().timeout(10000).emit("usersSave", { ...this.draft,
                grants }, (error, result) => {
                this.saving = false;
                if (error || !result?.ok) {
                    this.error = this.$t("access.saveFailed");
                } else {
                    this.draft = null;
                    this.load();
                }
            });
        },
    },
};
</script>
<style scoped>
.user-stack-list { max-height: 18rem; overflow: auto; }
</style>
