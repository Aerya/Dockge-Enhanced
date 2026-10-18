<template>
    <div ref="element" class="modal fade" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
        <div class="modal-dialog modal-dialog-scrollable">
            <form class="modal-content" @submit.prevent="run(uri ? 'enable' : 'prepare')">
                <div class="modal-header">
                    <h5 class="modal-title">{{ $t('twoFactor.title') }}</h5>
                    <button type="button" class="btn-close" :disabled="busy || (codes.length > 0 && !saved)" :aria-label="$t('twoFactor.close')" @click="close" />
                </div>
                <div class="modal-body">
                    <p v-if="error" role="alert" class="alert alert-danger">{{ $t(error) }}</p>
                    <p v-if="loading">{{ $t('twoFactor.loading') }}</p>
                    <template v-else-if="codes.length">
                        <p class="alert alert-warning">{{ $t('twoFactor.saveCodes') }}</p>
                        <ul class="recovery-codes"><li v-for="item in codes" :key="item"><code>{{ item }}</code></li></ul>
                        <button type="button" class="btn btn-outline-primary mb-3" @click="download">{{ $t('twoFactor.downloadCodes') }}</button>
                        <div class="form-check">
                            <input id="twofa-saved" v-model="saved" class="form-check-input" type="checkbox">
                            <label class="form-check-label" for="twofa-saved">{{ $t('twoFactor.codesSaved') }}</label>
                        </div>
                    </template>
                    <template v-else-if="ready">
                        <p>{{ $t(enabled ? 'twoFactor.enabled' : 'twoFactor.description') }}</p>
                        <p v-if="enabled">{{ $t('twoFactor.remaining', { count: remaining }) }}</p>
                        <label for="twofa-password" class="form-label">{{ $t('twoFactor.password') }}</label>
                        <input id="twofa-password" v-model="password" class="form-control mb-3" type="password" autocomplete="current-password" required :disabled="busy">
                        <template v-if="uri">
                            <div class="text-center"><VueQrcode :value="uri" :width="210" :color="{ light: '#ffffff', dark: '#000000' }" /></div>
                            <details class="mb-3"><summary>{{ $t('twoFactor.showSecret') }}</summary><code class="text-break">{{ uri }}</code></details>
                        </template>
                        <template v-if="enabled || uri">
                            <label for="twofa-code" class="form-label">{{ $t(enabled ? 'twoFactor.loginCode' : 'twoFactor.totpCode') }}</label>
                            <input id="twofa-code" v-model="code" class="form-control mb-3" type="text" :maxlength="enabled ? 35 : 6" autocomplete="one-time-code" :disabled="busy">
                        </template>
                        <template v-if="enabled">
                            <button type="button" class="btn btn-outline-primary mb-3" :disabled="busy || !password || !code" @click="run('regenerate')">{{ $t('twoFactor.regenerate') }}</button>
                            <div class="form-check mb-3">
                                <input id="twofa-disable-confirm" v-model="confirmDisable" type="checkbox" class="form-check-input">
                                <label for="twofa-disable-confirm" class="form-check-label">{{ $t('twoFactor.confirmDisable') }}</label>
                            </div>
                            <button type="button" class="btn btn-danger" :disabled="busy || !password || !code || !confirmDisable" @click="run('disable')">{{ $t('twoFactor.disable') }}</button>
                        </template>
                        <button v-else type="submit" class="btn btn-primary" :disabled="busy || !password || (!!uri && code.length !== 6)">{{ $t(uri ? 'twoFactor.save' : 'twoFactor.enable') }}</button>
                    </template>
                </div>
                <div v-if="codes.length" class="modal-footer"><button type="button" class="btn btn-primary" :disabled="!saved" @click="close">{{ $t('twoFactor.close') }}</button></div>
            </form>
        </div>
    </div>
</template>

<script setup lang="ts">
import { getCurrentInstance, onMounted, onUnmounted, ref } from "vue";
import { Modal } from "bootstrap";
import type { Socket } from "socket.io-client";
import VueQrcode from "vue-qrcode";

interface Root {
    getSocket(): Socket;
    storage(): { token: string };
    socketIO: { token: string };
}
interface Reply {
    ok: boolean;
    msg?: string;
    uri?: string;
    enabled?: boolean;
    recoveryRemaining?: number;
    recoveryCodes?: string[];
    token?: string;
}
const root = getCurrentInstance()!.proxy!.$root as unknown as Root;
const element = ref<HTMLElement>();
const password = ref("");
const code = ref("");
const uri = ref("");
const codes = ref<string[]>([]);
const enabled = ref(false);
const remaining = ref(0);
const busy = ref(false);
const loading = ref(false);
const ready = ref(false);
const error = ref("");
const saved = ref(false);
const confirmDisable = ref(false);
let modal: Modal;

function clear() {
    password.value = "";
    code.value = "";
    uri.value = "";
    codes.value = [];
    saved.value = false;
    confirmDisable.value = false;
}
function request(action: string): Promise<Reply> {
    return new Promise((resolve, reject) => {
        root.getSocket().timeout(15000).emit(`twoFactor:${action}`, { password: password.value,
            code: code.value }, (err: Error | null, reply: Reply) => {
            if (err || !reply?.ok) {
                reject(new Error(reply?.msg || "twoFactor.unavailable"));
            } else {
                resolve(reply);
            }
        });
    });
}
async function show() {
    clear();
    error.value = "";
    ready.value = false;
    loading.value = true;
    modal.show();
    try {
        const reply = await request("status");
        enabled.value = !!reply.enabled;
        remaining.value = reply.recoveryRemaining ?? 0;
        ready.value = true;
    } catch (err) {
        error.value = err instanceof Error ? err.message : "twoFactor.unavailable";
    } finally {
        loading.value = false;
    }
}
async function run(action: string) {
    if (busy.value || !ready.value) {
        return;
    }
    busy.value = true;
    error.value = "";
    try {
        const reply = await request(action);
        if (reply.token) {
            root.storage().token = reply.token;
            root.socketIO.token = reply.token;
        }
        if (action === "prepare") {
            uri.value = reply.uri ?? "";
        } else {
            clear();
            enabled.value = !!reply.enabled;
            remaining.value = reply.recoveryRemaining ?? 0;
            codes.value = reply.recoveryCodes ?? [];
        }
    } catch (err) {
        error.value = err instanceof Error ? err.message : "twoFactor.unavailable";
    } finally {
        busy.value = false;
    }
}
function close() {
    if (busy.value || (codes.value.length && !saved.value)) {
        return;
    }
    root.getSocket().emit("twoFactor:cancel", {}, () => {});
    modal.hide();
    clear();
}
function download() {
    const url = URL.createObjectURL(new Blob([ "Dockge-Enhanced — recovery codes\n\n" + codes.value.join("\n") ], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "dockge-enhanced-recovery-codes.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
onMounted(() => {
    modal = new Modal(element.value!);
});
onUnmounted(() => {
    clear();
    modal?.dispose();
});
defineExpose({ show });
</script>

<style scoped>
.recovery-codes { padding-left: 1.2rem; }
.recovery-codes code { overflow-wrap: anywhere; }
</style>
