<template>
    <div>
        <!-- Apprise -->
        <div class="shadow-box big-padding mb-4">
            <div class="d-flex align-items-center gap-2 mb-1">
                <font-awesome-icon icon="bell" />
                <h5 class="settings-subheading mb-0">
                    <a href="https://github.com/caronc/apprise" target="_blank" rel="noopener" class="apprise-link">Apprise</a>
                </h5>
                <small class="form-text ms-2">{{ $t("watcher.apprise.global") }}</small>
            </div>

            <div class="row g-3">
                <div class="col-md-6">
                    <label class="form-label small">{{ $t("watcher.apprise.serverUrl") }}</label>
                    <input
                        v-model="appriseSettings.serverUrl"
                        type="url"
                        class="form-control form-control-sm"
                        :placeholder="$t('watcher.apprise.serverUrlPlaceholder')"
                        autocomplete="off"
                    />
                </div>
                <div class="col-12 d-flex gap-2 flex-wrap">
                    <button class="btn btn-primary btn-sm" :disabled="savingApprise" @click.stop="saveAppriseSettings">
                        <span v-if="savingApprise" class="spinner-border spinner-border-sm me-1" />
                        <font-awesome-icon v-else icon="save" class="me-1" />{{ $t("watcher.apprise.save") }}
                    </button>
                    <button class="btn btn-normal btn-sm" :disabled="testingApprise || !appriseSettings.serverUrl" @click.stop="testApprise">
                        <span v-if="testingApprise" class="spinner-border spinner-border-sm me-1" />
                        <font-awesome-icon v-else icon="paper-plane" class="me-1" />{{ $t("watcher.apprise.test") }}
                    </button>
                </div>
            </div>
        </div>

        <!-- Notifications — Surveillance images -->
        <div class="shadow-box big-padding mb-4">
            <h5 class="settings-subheading mb-3">
                <font-awesome-icon icon="sync-alt" class="me-2" />{{ $t("watcher.img.heading") }}
            </h5>

            <p class="notif-provider-label">Discord</p>
            <div v-for="(wh, idx) in imgSettings.discordWebhooks ?? []" :key="idx" class="d-flex align-items-center gap-2 mb-2">
                <span class="form-control form-control-sm text-truncate notif-url-display">{{ wh }}</span>
                <button class="btn btn-sm btn-normal" :disabled="testingImg" @click="testWebhook(wh, 'img')">
                    <span v-if="testingImg" class="spinner-border spinner-border-sm" />
                    <font-awesome-icon v-else icon="paper-plane" />
                </button>
                <button class="btn btn-sm btn-outline-danger" @click="removeImgWebhook(idx)">
                    <font-awesome-icon icon="trash" />
                </button>
            </div>
            <p v-if="!imgSettings.discordWebhooks?.length" class="form-text fst-italic mb-2">{{ $t("watcher.img.noWebhook") }}</p>
            <div class="input-group mb-3">
                <input v-model="imgWebhook" type="password" class="form-control form-control-sm" :placeholder="$t('watcher.img.webhookPlaceholder')" autocomplete="off" />
                <button class="btn btn-sm btn-success" :disabled="!imgWebhook" @click="addImgWebhook">
                    <font-awesome-icon icon="plus" />
                </button>
            </div>

            <p class="notif-provider-label">Apprise</p>
            <div v-for="(url, idx) in appriseSettings.imagesUrls" :key="idx" class="d-flex align-items-center gap-2 mb-2">
                <span class="form-control form-control-sm text-truncate notif-url-display">{{ url }}</span>
                <button class="btn btn-sm btn-outline-danger" @click="removeAppriseUrl('imagesUrls', idx)">
                    <font-awesome-icon icon="trash" />
                </button>
            </div>
            <p v-if="!appriseSettings.imagesUrls.length" class="form-text fst-italic mb-2">{{ $t("watcher.apprise.noUrl") }}</p>
            <div class="input-group mb-3">
                <input v-model="newAppriseImagesUrl" type="text" class="form-control form-control-sm" :placeholder="$t('watcher.apprise.urlPlaceholder')" autocomplete="off" />
                <button class="btn btn-sm btn-success" :disabled="!newAppriseImagesUrl" @click="addAppriseUrl('imagesUrls')">
                    <font-awesome-icon icon="plus" />
                </button>
            </div>

            <div class="d-flex align-items-center gap-3 flex-wrap">
                <button class="btn btn-primary btn-sm" :disabled="savingImgNotif" @click="saveImgNotif">
                    <span v-if="savingImgNotif" class="spinner-border spinner-border-sm me-1" />
                    <font-awesome-icon v-else icon="save" class="me-1" />{{ $t("watcher.apprise.save") }}
                </button>
                <button class="btn btn-normal btn-sm" :disabled="testingAppriseImages || !appriseSettings.serverUrl || !appriseSettings.imagesUrls.length" @click="testAppriseSection('images')">
                    <span v-if="testingAppriseImages" class="spinner-border spinner-border-sm me-1" />
                    <font-awesome-icon v-else icon="paper-plane" class="me-1" />{{ $t("watcher.apprise.test") }}
                </button>
            </div>
        </div>

        <!-- Notifications — Sécurité (Trivy) -->
        <div class="shadow-box big-padding mb-4">
            <h5 class="settings-subheading mb-3">
                <font-awesome-icon icon="bug" class="me-2" />{{ $t("watcher.trivy.heading") }}
            </h5>

            <p class="notif-provider-label">Discord</p>
            <div v-for="(wh, idx) in trivySettings.discordWebhooks ?? []" :key="idx" class="d-flex align-items-center gap-2 mb-2">
                <span class="form-control form-control-sm text-truncate notif-url-display">{{ wh }}</span>
                <button class="btn btn-sm btn-normal" :disabled="testingTrivy" @click="testWebhook(wh, 'trivy')">
                    <span v-if="testingTrivy" class="spinner-border spinner-border-sm" />
                    <font-awesome-icon v-else icon="paper-plane" />
                </button>
                <button class="btn btn-sm btn-outline-danger" @click="removeTrivyWebhook(idx)">
                    <font-awesome-icon icon="trash" />
                </button>
            </div>
            <p v-if="!trivySettings.discordWebhooks?.length" class="form-text fst-italic mb-2">{{ $t("watcher.trivy.noWebhook") }}</p>
            <div class="input-group mb-3">
                <input v-model="trivyWebhook" type="password" class="form-control form-control-sm" :placeholder="$t('watcher.img.webhookPlaceholder')" autocomplete="off" />
                <button class="btn btn-sm btn-success" :disabled="!trivyWebhook" @click="addTrivyWebhook">
                    <font-awesome-icon icon="plus" />
                </button>
            </div>

            <p class="notif-provider-label">Apprise</p>
            <div v-for="(url, idx) in appriseSettings.trivyUrls" :key="idx" class="d-flex align-items-center gap-2 mb-2">
                <span class="form-control form-control-sm text-truncate notif-url-display">{{ url }}</span>
                <button class="btn btn-sm btn-outline-danger" @click="removeAppriseUrl('trivyUrls', idx)">
                    <font-awesome-icon icon="trash" />
                </button>
            </div>
            <p v-if="!appriseSettings.trivyUrls.length" class="form-text fst-italic mb-2">{{ $t("watcher.apprise.noUrl") }}</p>
            <div class="input-group mb-3">
                <input v-model="newAppriseTrivyUrl" type="text" class="form-control form-control-sm" :placeholder="$t('watcher.apprise.urlPlaceholder')" autocomplete="off" />
                <button class="btn btn-sm btn-success" :disabled="!newAppriseTrivyUrl" @click="addAppriseUrl('trivyUrls')">
                    <font-awesome-icon icon="plus" />
                </button>
            </div>

            <div class="d-flex align-items-center gap-3 flex-wrap">
                <button class="btn btn-primary btn-sm" :disabled="savingTrivyNotif" @click="saveTrivyNotif">
                    <span v-if="savingTrivyNotif" class="spinner-border spinner-border-sm me-1" />
                    <font-awesome-icon v-else icon="save" class="me-1" />{{ $t("watcher.apprise.save") }}
                </button>
                <button class="btn btn-normal btn-sm" :disabled="testingAppriseTrivy || !appriseSettings.serverUrl || !appriseSettings.trivyUrls.length" @click="testAppriseSection('trivy')">
                    <span v-if="testingAppriseTrivy" class="spinner-border spinner-border-sm me-1" />
                    <font-awesome-icon v-else icon="paper-plane" class="me-1" />{{ $t("watcher.apprise.test") }}
                </button>
            </div>
        </div>

        <!-- Notifications — Sauvegarde -->
        <div class="shadow-box big-padding mb-4">
            <h5 class="settings-subheading mb-3">
                <font-awesome-icon icon="archive" class="me-2" />{{ $t("watcher.tab.backup") }}
            </h5>

            <p class="notif-provider-label">Discord</p>
            <div v-for="(wh, idx) in backupWebhooks" :key="idx" class="d-flex align-items-center gap-2 mb-2">
                <span class="form-control form-control-sm text-truncate notif-url-display">{{ wh }}</span>
                <button class="btn btn-sm btn-normal" :disabled="backupTestingWh" @click="testBackupWebhook(wh)">
                    <span v-if="backupTestingWh" class="spinner-border spinner-border-sm" />
                    <font-awesome-icon v-else icon="paper-plane" />
                </button>
                <button class="btn btn-sm btn-outline-danger" @click="removeBackupWebhook(idx)">
                    <font-awesome-icon icon="trash" />
                </button>
            </div>
            <p v-if="!backupWebhooks.length" class="form-text fst-italic mb-2">{{ $t("watcher.backup.noWebhook") }}</p>
            <div class="input-group mb-3">
                <input v-model="backupNewWebhook" type="password" class="form-control form-control-sm" :placeholder="$t('watcher.img.webhookPlaceholder')" autocomplete="off" />
                <button class="btn btn-sm btn-success" :disabled="!backupNewWebhook" @click="addBackupWebhook">
                    <font-awesome-icon icon="plus" />
                </button>
            </div>

            <p class="notif-provider-label">Apprise</p>
            <div v-for="(url, idx) in appriseSettings.backupUrls" :key="idx" class="d-flex align-items-center gap-2 mb-2">
                <span class="form-control form-control-sm text-truncate notif-url-display">{{ url }}</span>
                <button class="btn btn-sm btn-outline-danger" @click="removeAppriseUrl('backupUrls', idx)">
                    <font-awesome-icon icon="trash" />
                </button>
            </div>
            <p v-if="!appriseSettings.backupUrls.length" class="form-text fst-italic mb-2">{{ $t("watcher.apprise.noUrl") }}</p>
            <div class="input-group mb-3">
                <input v-model="newAppriseBackupUrl" type="text" class="form-control form-control-sm" :placeholder="$t('watcher.apprise.urlPlaceholder')" autocomplete="off" />
                <button class="btn btn-sm btn-success" :disabled="!newAppriseBackupUrl" @click="addAppriseUrl('backupUrls')">
                    <font-awesome-icon icon="plus" />
                </button>
            </div>

            <div class="d-flex align-items-center gap-3 flex-wrap">
                <button class="btn btn-primary btn-sm" :disabled="savingBackupNotif" @click="saveBackupNotif">
                    <span v-if="savingBackupNotif" class="spinner-border spinner-border-sm me-1" />
                    <font-awesome-icon v-else icon="save" class="me-1" />{{ $t("watcher.apprise.save") }}
                </button>
                <button class="btn btn-normal btn-sm" :disabled="testingAppriseBackup || !appriseSettings.serverUrl || !appriseSettings.backupUrls.length" @click="testAppriseSection('backup')">
                    <span v-if="testingAppriseBackup" class="spinner-border spinner-border-sm me-1" />
                    <font-awesome-icon v-else icon="paper-plane" class="me-1" />{{ $t("watcher.apprise.test") }}
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n/dist/vue-i18n.esm-browser.prod.js";
import { watcherApi } from "./shared";
import type { AppriseSettings, ImgSettings, TrivySettings } from "./shared";

const appriseSettings = defineModel<AppriseSettings>("appriseSettings", { required: true });
const imgSettings = defineModel<ImgSettings>("imgSettings", { required: true });
const trivySettings = defineModel<TrivySettings>("trivySettings", { required: true });
const backupWebhooks = defineModel<string[]>("backupWebhooks", { required: true });
const emit = defineEmits<{
    (e: "toast", msg: string, ok?: boolean): void;
}>();

const { t } = useI18n();

// ─── State ────────────────────────────────────────────────────────

const imgWebhook = ref("");
const trivyWebhook = ref("");
const backupNewWebhook = ref("");

const newAppriseImagesUrl = ref("");
const newAppriseTrivyUrl = ref("");
const newAppriseBackupUrl = ref("");
const savingApprise = ref(false);
const testingApprise = ref(false);
const testingAppriseImages = ref(false);
const testingAppriseTrivy = ref(false);
const testingAppriseBackup = ref(false);

const backupTestingWh = ref(false);
const savingBackupNotif = ref(false);
const savingImgNotif = ref(false);
const savingTrivyNotif = ref(false);

const testingImg = ref(false);
const testingTrivy = ref(false);

function showToast(msg: string, ok = true) {
    emit("toast", msg, ok);
}

// ─── Webhooks Discord ─────────────────────────────────────────────

function addImgWebhook() {
    const url = imgWebhook.value.trim();
    if (!url || imgSettings.value.discordWebhooks.includes(url)) {
        return;
    }
    imgSettings.value.discordWebhooks.push(url);
    imgWebhook.value = "";
}

function removeImgWebhook(idx: number) {
    imgSettings.value.discordWebhooks.splice(idx, 1);
}

function addTrivyWebhook() {
    const url = trivyWebhook.value.trim();
    if (!url || trivySettings.value.discordWebhooks.includes(url)) {
        return;
    }
    trivySettings.value.discordWebhooks.push(url);
    trivyWebhook.value = "";
}

function removeTrivyWebhook(idx: number) {
    trivySettings.value.discordWebhooks.splice(idx, 1);
}

function addBackupWebhook() {
    const url = backupNewWebhook.value.trim();
    if (!url || backupWebhooks.value.includes(url)) {
        return;
    }
    backupWebhooks.value.push(url);
    backupNewWebhook.value = "";
}

function removeBackupWebhook(idx: number) {
    backupWebhooks.value.splice(idx, 1);
}

async function testBackupWebhook(url: string) {
    backupTestingWh.value = true;
    try {
        const res = await watcherApi("POST", "/discord/test", { webhookUrl: url });
        showToast(
            res.ok ? t("watcher.discord.testOk") : t("watcher.discord.testFail"),
            res.ok,
        );
    } finally {
        backupTestingWh.value = false;
    }
}

async function testWebhook(url: string, context: "img" | "trivy") {
    if (context === "img") {
        testingImg.value = true;
    } else {
        testingTrivy.value = true;
    }
    try {
        const res = await watcherApi("POST", "/discord/test", { webhookUrl: url });
        showToast(
            res.ok ? t("watcher.discord.testOk") : t("watcher.discord.testFail"),
            res.ok,
        );
    } finally {
        if (context === "img") {
            testingImg.value = false;
        } else {
            testingTrivy.value = false;
        }
    }
}

// ─── Sauvegardes notifs ───────────────────────────────────────────

// Sauvegarde notifs Backup (Discord + Apprise + langue)
async function saveBackupNotif() {
    savingBackupNotif.value = true;
    try {
        const res = await watcherApi("POST", "/backup/settings", {
            discordWebhooks: backupWebhooks.value,
            appriseUrls: appriseSettings.value.backupUrls,
        });
        showToast(res.ok ? t("watcher.backup.saved") : `❌ ${res.message}`, res.ok);
    } finally {
        savingBackupNotif.value = false;
    }
}

// Sauvegarde notifs Images (Discord + Apprise + langue)
async function saveImgNotif() {
    savingImgNotif.value = true;
    try {
        const res = await watcherApi("POST", "/image/settings", {
            discordWebhooks: imgSettings.value.discordWebhooks,
            appriseUrls: appriseSettings.value.imagesUrls,
        });
        showToast(res.ok ? t("watcher.img.saved") : `❌ ${res.message}`, res.ok);
    } finally {
        savingImgNotif.value = false;
    }
}

// Sauvegarde notifs Trivy (Discord + Apprise + langue)
async function saveTrivyNotif() {
    savingTrivyNotif.value = true;
    try {
        const res = await watcherApi("POST", "/trivy/settings", {
            discordWebhooks: trivySettings.value.discordWebhooks,
            appriseUrls: appriseSettings.value.trivyUrls,
        });
        showToast(res.ok ? t("watcher.trivy.saved") : `❌ ${res.message}`, res.ok);
    } finally {
        savingTrivyNotif.value = false;
    }
}

// ─── Apprise ─────────────────────────────────────────────────────

type AppriseChannel = "imagesUrls" | "trivyUrls" | "backupUrls";

function addAppriseUrl(channel: AppriseChannel) {
    const inputMap: Record<AppriseChannel, typeof newAppriseImagesUrl> = {
        imagesUrls: newAppriseImagesUrl,
        trivyUrls: newAppriseTrivyUrl,
        backupUrls: newAppriseBackupUrl,
    };
    const inputRef = inputMap[channel];
    const url = inputRef.value.trim();
    if (!url || appriseSettings.value[channel].includes(url)) {
        return;
    }
    appriseSettings.value[channel].push(url);
    inputRef.value = "";
}

function removeAppriseUrl(channel: AppriseChannel, idx: number) {
    appriseSettings.value[channel].splice(idx, 1);
}

// Sauvegarde uniquement l'URL serveur Apprise (partagée)
async function saveAppriseSettings() {
    savingApprise.value = true;
    try {
        const res = await watcherApi("POST", "/image/settings", {
            appriseServerUrl: appriseSettings.value.serverUrl,
        });
        showToast(res.ok ? t("watcher.apprise.saved") : `❌ ${res.message}`, res.ok);
    } finally {
        savingApprise.value = false;
    }
}

async function testApprise() {
    testingApprise.value = true;
    try {
        // Teste avec les premières URLs disponibles (images > trivy > backup)
        const testUrls =
            appriseSettings.value.imagesUrls.length > 0 ? appriseSettings.value.imagesUrls :
                appriseSettings.value.trivyUrls.length > 0 ? appriseSettings.value.trivyUrls :
                    appriseSettings.value.backupUrls;
        const res = await watcherApi("POST", "/apprise/test", {
            serverUrl: appriseSettings.value.serverUrl,
            urls: testUrls,
        });
        showToast(
            res.ok ? t("watcher.apprise.testOk") : t("watcher.apprise.testFail"),
            res.ok,
        );
    } finally {
        testingApprise.value = false;
    }
}

async function testAppriseSection(section: "images" | "trivy" | "backup") {
    if (!appriseSettings.value.serverUrl) {
        return;
    }
    const urlMap = {
        images: appriseSettings.value.imagesUrls,
        trivy: appriseSettings.value.trivyUrls,
        backup: appriseSettings.value.backupUrls,
    };
    const flagMap = {
        images: testingAppriseImages,
        trivy: testingAppriseTrivy,
        backup: testingAppriseBackup,
    };
    const urls = urlMap[section];
    if (!urls.length) {
        return;
    }
    flagMap[section].value = true;
    try {
        const res = await watcherApi("POST", "/apprise/test", {
            serverUrl: appriseSettings.value.serverUrl,
            urls,
        });
        showToast(
            res.ok ? t("watcher.apprise.testOk") : t("watcher.apprise.testFail"),
            res.ok,
        );
    } finally {
        flagMap[section].value = false;
    }
}
</script>

<style lang="scss" scoped>

.settings-subheading {
    font-size: var(--fs-lg);
    font-weight: 600;
}

.apprise-link {
    color: inherit;
    text-decoration: none;

    &:hover {
        text-decoration: underline;
    }
}

.notif-provider-label {
    font-size: var(--fs-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    margin-bottom: 0.5rem;
}

.notif-url-display {
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
}

.form-control::placeholder,
.form-control-sm::placeholder {
    color: var(--text-muted) !important;
    opacity: 1;
}
</style>
