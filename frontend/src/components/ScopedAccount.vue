<template>
    <details class="shadow-box p-3 mb-3">
        <summary>{{ $t('access.myAccount') }} · {{ $root.username }}</summary>
        <button class="btn btn-normal my-3" @click="$refs.factors.show()">{{ $t('twoFactor.settings') }}</button>
        <form class="account-password" @submit.prevent="save">
            <h2 class="h5">{{ $t('Change Password') }}</h2>
            <label class="d-block mb-2">{{ $t('Current Password') }}<input v-model="currentPassword" type="password" class="form-control" autocomplete="current-password" required maxlength="256"></label>
            <label class="d-block mb-2">{{ $t('New Password') }}<input v-model="newPassword" type="password" class="form-control" autocomplete="new-password" required maxlength="256"></label>
            <label class="d-block mb-2">{{ $t('Repeat New Password') }}<input v-model="repeatPassword" type="password" class="form-control" autocomplete="new-password" required maxlength="256"></label>
            <label class="d-block mb-2">{{ $t('access.securityCode') }}<input v-model="code" class="form-control" autocomplete="one-time-code" maxlength="35"></label>
            <p v-if="error" role="alert" class="text-danger">{{ error }}</p>
            <p v-if="saved" role="status">{{ $t('access.done') }}</p>
            <button class="btn btn-primary" :disabled="busy || !$root.socketIO.connected">{{ $t('Save') }}</button>
        </form>
        <TwoFADialog ref="factors" />
    </details>
</template>
<script>
import TwoFADialog from "./TwoFADialog.vue";
export default {
    components: { TwoFADialog },
    data: () => ({ currentPassword: "",
        newPassword: "",
        repeatPassword: "",
        code: "",
        busy: false,
        error: "",
        saved: false }),
    methods: {
        save() {
            this.error = "";
            this.saved = false;
            if (this.newPassword !== this.repeatPassword) {
                this.error = this.$t("passwordNotMatchMsg");
                return;
            }
            this.busy = true;
            this.$root.getSocket().timeout(15000).emit("scopedPassword", { currentPassword: this.currentPassword,
                newPassword: this.newPassword,
                code: this.code }, (error, reply) => {
                this.busy = false;
                if (error || !reply?.ok) {
                    this.error = this.$t("access.accountFailed");
                    return;
                }
                this.$root.storage().token = reply.token;
                this.$root.socketIO.token = reply.token;
                this.currentPassword = this.newPassword = this.repeatPassword = this.code = "";
                this.saved = true;
            });
        },
    },
};
</script>
<style scoped>
.account-password { max-width: 30rem; }
</style>
