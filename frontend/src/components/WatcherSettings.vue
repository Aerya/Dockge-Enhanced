<template>
    <div>
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h1 class="mb-0">
                <font-awesome-icon icon="bolt" /> {{ $t("watcher.title") }}
            </h1>
        </div>

        <RemoteInstanceLinks
            class="mb-3"
            :agents="$root.agentList"
            :path="`/watcher/${currentTab}`"
        />

        <div class="shadow-box shadow-box-settings">
            <!-- ═══ TAB BAR ═══ -->
            <div class="watcher-tab-bar mb-4">
                <button
                    class="watcher-tab"
                    :class="{ active: currentTab === 'images' }"
                    @click="$router.push('/watcher/images')"
                >
                    <font-awesome-icon icon="sync-alt" class="watcher-tab-icon" />
                    <span>{{ $t("watcher.tab.images") }}</span>
                </button>
                <button
                    class="watcher-tab"
                    :class="{ active: currentTab === 'scheduler' }"
                    @click="$router.push('/watcher/scheduler')"
                >
                    <font-awesome-icon icon="calendar-days" class="watcher-tab-icon" />
                    <span>{{ $t("watcher.tab.scheduler") }}</span>
                </button>
                <button
                    class="watcher-tab"
                    :class="{ active: currentTab === 'trivy' }"
                    @click="$router.push('/watcher/trivy')"
                >
                    <font-awesome-icon icon="bug" class="watcher-tab-icon" />
                    <span>{{ $t("watcher.tab.security") }}</span>
                </button>
                <button
                    class="watcher-tab"
                    :class="{ active: currentTab === 'backup' }"
                    @click="$router.push('/watcher/backup')"
                >
                    <font-awesome-icon icon="archive" class="watcher-tab-icon" />
                    <span>{{ $t("watcher.tab.backup") }}</span>
                </button>
                <button
                    class="watcher-tab"
                    :class="{ active: currentTab === 'resources' }"
                    @click="$router.push('/watcher/resources')"
                >
                    <font-awesome-icon icon="cube" class="watcher-tab-icon" />
                    <span>{{ $t("watcher.tab.resources") }}</span>
                </button>
                <button
                    class="watcher-tab"
                    :class="{ active: currentTab === 'notifications' }"
                    @click="$router.push('/watcher/notifications')"
                >
                    <font-awesome-icon icon="bell" class="watcher-tab-icon" />
                    <span>{{ $t("watcher.tab.notifications") }}</span>
                </button>
                <button
                    class="watcher-tab"
                    :class="{ active: currentTab === 'monitoring' }"
                    @click="$router.push('/watcher/monitoring')"
                >
                    <font-awesome-icon icon="chart-line" class="watcher-tab-icon" />
                    <span>{{ $t("watcher.tab.monitoring") }}</span>
                </button>
                <button
                    class="watcher-tab"
                    :class="{ active: currentTab === 'audit' }"
                    @click="$router.push('/watcher/audit')"
                >
                    <font-awesome-icon icon="history" class="watcher-tab-icon" />
                    <span>{{ $t("watcher.tab.audit") }}</span>
                </button>
            </div>

            <!-- ═══ ACTIVE TAB (child route) ═══ -->
            <router-view v-slot="{ Component }">
                <component :is="Component" v-bind="tabBindings" />
            </router-view>
        </div>

        <!-- TOAST -->
        <Transition name="slide-fade">
            <div
                v-if="toast.msg"
                class="toast-float"
                :class="toast.ok ? 'toast-ok' : 'toast-err'"
            >
                {{ toast.msg }}
            </div>
        </Transition>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n/dist/vue-i18n.esm-browser.prod.js";
import RemoteInstanceLinks from "./RemoteInstanceLinks.vue";
import { initServerTz } from "../composables/useServerTz";
import { watcherApi } from "./watcher/shared";
import type { AppriseSettings, Cred, ImgSettings, TrivySettings } from "./watcher/shared";

const { locale, setLocaleMessage } = useI18n();

// ─── Langue : suit la langue globale de l'application ─────────────────────
// Plus de bascule FR/EN propre à cette page : on s'assure simplement que
// les messages de la langue globale sont chargés (fallback "en" sinon).
onMounted(async () => {
    const lang = locale.value || "en";
    if (lang !== "en") {
        try {
            const mod = await import(`../lang/${lang}.json`);
            setLocaleMessage(lang, mod.default ?? mod);
        } catch {
            /* fallbackLocale: "en" prend le relais */
        }
    }
    // Nettoie les anciennes clés de langue propres à cette page
    localStorage.removeItem("watcherLang");
    localStorage.removeItem("watcherLocale");
});

// ─── Onglets (routes enfants /watcher/:tab) ─────────────────────

const route = useRoute();

const currentTab = computed(() => {
    const name = String(route.name ?? "");
    return name.startsWith("watcher-") ? name.slice("watcher-".length) : "images";
});

// ─── État partagé entre onglets ───────────────────────────────────
// imgSettings / trivySettings : édités par les onglets Images/Trivy
// (configuration) et Notifications (webhooks Discord).
// appriseSettings / backupWebhooks : consommés par l'onglet Notifications,
// assemblés ici depuis les réponses des endpoints de settings.

const imgSettings = ref<ImgSettings>({
    enabled: false,
    intervalHours: 6,
    discordWebhooks: [],
    autoUpdateConfig: {},
    pendingAutoUpdates: [],
    imagePlatform: "",
});
const trivySettings = ref<TrivySettings>({
    enabled: false,
    intervalHours: 24,
    discordWebhooks: [],
    minSeverityAlert: "HIGH",
    ignoreUnfixed: false,
    scanTimeoutMinutes: 10,
    ignoredCVEs: [],
});
const credentials = ref<Cred[]>([]);
const appriseSettings = ref<AppriseSettings>({
    serverUrl: "",
    imagesUrls: [],
    trivyUrls: [],
    backupUrls: [],
});
const backupWebhooks = ref<string[]>([]);

const toast = ref({ msg: "",
    ok: true });

function showToast(msg: string, ok = true) {
    toast.value = { msg,
        ok };
    setTimeout(() => (toast.value.msg = ""), 3500);
}

// v-model / listeners passés à l'onglet actif via le router-view.
// Seuls les onglets qui déclarent ces defineModel/emit les reçoivent,
// pour éviter tout attribut fallthrough sur les autres onglets.
const tabBindings = computed(() => {
    switch (route.name) {
        case "watcher-images":
            return {
                "imgSettings": imgSettings.value,
                "onUpdate:imgSettings": (v: ImgSettings) => (imgSettings.value = v),
                "credentials": credentials.value,
                "onUpdate:credentials": (v: Cred[]) => (credentials.value = v),
                "onToast": showToast,
            };
        case "watcher-trivy":
            return {
                "trivySettings": trivySettings.value,
                "onUpdate:trivySettings": (v: TrivySettings) => (trivySettings.value = v),
                "onToast": showToast,
            };
        case "watcher-notifications":
            return {
                "appriseSettings": appriseSettings.value,
                "onUpdate:appriseSettings": (v: AppriseSettings) => (appriseSettings.value = v),
                "imgSettings": imgSettings.value,
                "onUpdate:imgSettings": (v: ImgSettings) => (imgSettings.value = v),
                "trivySettings": trivySettings.value,
                "onUpdate:trivySettings": (v: TrivySettings) => (trivySettings.value = v),
                "backupWebhooks": backupWebhooks.value,
                "onUpdate:backupWebhooks": (v: string[]) => (backupWebhooks.value = v),
                "onToast": showToast,
            };
        default:
            return {};
    }
});

// ─── Init ─────────────────────────────────────────────────────────

onMounted(async () => {
    await initServerTz(watcherApi);
    const [ imgRes, trivyRes, backupRes ] = await Promise.all([
        watcherApi("GET", "/image/settings"),
        watcherApi("GET", "/trivy/settings"),
        watcherApi("GET", "/backup/settings"),
    ]);
    // serverUrl Apprise partagé (stocké dans watcher-settings / image)
    // URLs Apprise séparées par watcher
    appriseSettings.value = {
        serverUrl: imgRes.ok ? (imgRes.data?.appriseServerUrl ?? "") : "",
        imagesUrls: imgRes.ok ? (Array.isArray(imgRes.data?.appriseUrls) ? imgRes.data.appriseUrls : []) : [],
        trivyUrls: trivyRes.ok ? (Array.isArray(trivyRes.data?.appriseUrls) ? trivyRes.data.appriseUrls : []) : [],
        backupUrls: backupRes.ok ? (Array.isArray(backupRes.data?.appriseUrls) ? backupRes.data.appriseUrls : []) : [],
    };
    if (imgRes.ok) {
        imgSettings.value = {
            enabled: imgRes.data.enabled,
            intervalHours: imgRes.data.intervalHours,
            discordWebhooks: imgRes.data.discordWebhooks ?? [],
            autoUpdateConfig: imgRes.data.autoUpdateConfig ?? {},
            pendingAutoUpdates: imgRes.data.pendingAutoUpdates ?? [],
            imagePlatform: imgRes.data.imagePlatform ?? "",
        };
        credentials.value = imgRes.data.credentials ?? [];
    }
    if (trivyRes.ok) {
        trivySettings.value = {
            ...trivySettings.value,
            ...trivyRes.data,
            discordWebhooks: Array.isArray(trivyRes.data.discordWebhooks)
                ? trivyRes.data.discordWebhooks
                : trivySettings.value.discordWebhooks,
        };
    }
    if (backupRes.ok) {
        backupWebhooks.value = backupRes.data.discordWebhooks ?? [];
    }
});
</script>

<style lang="scss" scoped>

// ─── Onglets ─────────────────────────────────────────────────────
.watcher-tab-bar {
    display: flex;
    gap: 0.25rem;
    overflow-x: auto;
    background: var(--bg-raised);
    border-radius: var(--radius-md);
    padding: 5px;
    border: 1px solid var(--border-color);
}

.watcher-tab {
    flex: 0 0 auto;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0.4rem 0.9rem;
    border: none;
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--text-muted);
    font-size: var(--fs-md);
    font-weight: 500;
    letter-spacing: 0.02em;
    white-space: nowrap;
    cursor: pointer;
    transition:
        background 0.15s,
        color 0.15s,
        box-shadow 0.15s;

    .watcher-tab-icon {
        font-size: 0.9rem; // taille optique vs label, entre fs-md et fs-base
    }

    &:hover:not(.active) {
        background: var(--bg-raised);
        color: var(--text-color);
    }

    &.active {
        background: var(--primary-soft);
        color: var(--primary-strong);
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 25%, transparent);
    }
}

.shadow-box-settings {
    padding: 20px;
    min-height: calc(100vh - 155px);
}

// Toast
.toast-float {
    position: fixed;
    right: 1.25rem;
    bottom: 1.5rem;
    z-index: 9999;
    padding: 0.6rem 1rem;
    border-radius: var(--radius-md);
    font-size: var(--fs-md);
    color: #fff;
    box-shadow: var(--shadow-popover);

    &.toast-ok {
        background: var(--success);
    }

    &.toast-err {
        background: var(--danger);
    }

    @media (max-width: $bp-mobile) {
        bottom: var(--space-4);
    }
}
</style>
