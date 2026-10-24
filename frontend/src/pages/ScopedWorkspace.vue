<template>
    <main class="container py-4">
        <div class="d-flex flex-wrap justify-content-between gap-2 mb-3">
            <h1 class="h3">{{ $t('access.workspace') }}</h1>
            <button class="btn btn-normal" @click="$root.logout()">{{ $t('Logout') }}</button>
        </div>
        <p class="text-muted">{{ $t('access.scopeHelp') }}</p>
        <p v-if="error" class="alert alert-warning" role="alert">{{ error }}</p>
        <p v-if="!grants.length">{{ $t('access.empty') }}</p>
        <section v-for="grant in grants" :key="key(grant)" class="shadow-box p-3 mb-3">
            <h2 class="h5">{{ states[key(grant)]?.displayName || grant.stack }}</h2>
            <p class="small text-muted">{{ grant.endpoint || $t('localInstance') }} · {{ grant.stack }}<span v-if="states[key(grant)]"> · {{ $t(statusNameShort(states[key(grant)].status)) }}</span></p>
            <div class="d-flex flex-wrap gap-2">
                <button v-for="permission in grant.permissions" :key="permission" class="btn btn-sm btn-normal" :disabled="busy || !$root.socketIO.connected" @click="run(grant, permission)">{{ $t(`access.${permission}`) }}</button>
            </div>
            <pre v-if="logs[key(grant)] !== undefined" class="scoped-logs mt-3 p-2">{{ logs[key(grant)] || $t('access.noLogs') }}</pre>
        </section>
    </main>
</template>
<script>
import { statusNameShort } from "../../../common/util-common";
export default {
    data: () => ({ grants: [],
        states: {},
        logs: {},
        error: "",
        busy: false }),
    // userAccess arrives after authentication, unlike the transport connect event.
    watch: { "$root.userAccess"() {
        this.load();
    } },
    mounted() {
        this.load();
    },
    methods: {
        statusNameShort,
        key(grant) {
            return JSON.stringify([ grant.endpoint, grant.stack ]);
        },
        load() {
            this.states = {};
            this.logs = {};
            this.error = "";
            this.$root.getSocket().timeout(10000).emit("scopedList", (error, result) => {
                this.grants = !error && result?.ok ? result.data : [];
                if (error || !result?.ok) {
                    this.error = this.$t("access.denied");
                }
            });
        },
        run(grant, permission) {
            if (![ "view", "logs" ].includes(permission) && !window.confirm(this.$t("access.confirm", { action: this.$t(`access.${permission}`),
                stack: grant.stack }))) {
                return;
            }
            this.busy = true;
            this.error = "";
            this.$root.getSocket().timeout(31 * 60 * 1000).emit("scopedRequest", { endpoint: grant.endpoint,
                stack: grant.stack,
                permission }, (error, result) => {
                this.busy = false;
                if (error || !result?.ok) {
                    this.error = this.$t("access.operationFailed");
                    return;
                }
                if (permission === "view") {
                    this.states[this.key(grant)] = result.data;
                } else if (permission === "logs") {
                    this.logs[this.key(grant)] = result.data.logs;
                } else {
                    this.$root.toastRes({ ok: true,
                        msg: "access.done",
                        msgi18n: true });
                }
            });
        },
    },
};
</script>
<style scoped>
.scoped-logs { max-height: 24rem; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: .8rem; }
</style>
