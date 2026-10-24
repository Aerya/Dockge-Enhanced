<template>
    <section class="my-4">
        <h5>{{ $t('access.users') }}</h5>
        <p class="form-text">{{ $t('access.adminHelp') }}</p>
        <p v-if="error" class="alert alert-warning" role="alert">{{ error }}</p>
        <div v-for="user in users" :key="user.id" class="d-flex flex-wrap align-items-center gap-2 mb-2">
            <strong>{{ user.username }}</strong>
            <span>{{ user.role === 'admin' ? $t('access.admin') : user.active ? $t('access.restricted') : $t('access.disabled') }}</span>
            <button v-if="user.role === 'restricted'" class="btn btn-sm btn-normal" @click="edit(user)">{{ $t('Edit') }}</button>
        </div>
        <button class="btn btn-sm btn-normal mb-3" @click="edit()">{{ $t('access.create') }}</button>
        <form v-if="draft" @submit.prevent="save">
            <label class="d-block mb-2">{{ $t('Username') }}<input v-model="draft.username" class="form-control" required pattern="[a-zA-Z0-9_.-]{1,64}" autocomplete="off"></label>
            <label class="d-block mb-2">{{ $t('access.password') }}<input v-model="draft.password" class="form-control" type="password" :required="!draft.id" autocomplete="new-password" maxlength="256"></label>
            <label class="d-block mb-2"><input v-model="draft.active" type="checkbox" class="form-check-input me-2">{{ $t('access.enabled') }}</label>
            <p class="small">{{ $t('access.selectStacks') }}</p>
            <div class="user-stack-list mb-3">
                <div v-for="item in stackOptions" :key="item.key" class="mb-3">
                    <label class="d-block mb-1"><input v-model="selectedStacks" type="checkbox" :value="item.key" class="form-check-input me-2" @change="ensurePermissions(item.key)">{{ item.label }}</label>
                    <div v-if="selectedStacks.includes(item.key)" class="d-flex flex-wrap gap-3 ms-3">
                        <label v-for="permission in permissions" :key="permission"><input v-model="permissionsByStack[item.key]" type="checkbox" :value="permission" :disabled="permission === 'view'" class="form-check-input me-1">{{ $t(`access.${permission}`) }}</label>
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
        draft: null,
        permissionsByStack: {},
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
            // Preserve grants while an agent is offline; never silently drop them.
            for (const grant of this.draft?.grants || []) {
                const key = JSON.stringify([ grant.endpoint, grant.stack ]);
                if (!options.has(key)) {
                    options.set(key, { key,
                        label: `${grant.endpoint || this.$t("localInstance")} / ${grant.stack}` });
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
        },
        edit(user) {
            this.draft = user ? { ...user,
                password: "" } : { username: "",
                password: "",
                active: true,
                grants: [] };
            this.selectedStacks = this.draft.grants.map(grant => JSON.stringify([ grant.endpoint, grant.stack ]));
            this.permissionsByStack = Object.fromEntries(this.draft.grants.map(grant => [ JSON.stringify([ grant.endpoint, grant.stack ]), [ ...grant.permissions ]]));
        },
        ensurePermissions(key) {
            this.permissionsByStack[key] ||= [ "view" ];
        },
        save() {
            this.saving = true;
            this.error = "";
            const grants = this.selectedStacks.map(key => {
                const [ endpoint, stack ] = JSON.parse(key);
                return { endpoint,
                    stack,
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
