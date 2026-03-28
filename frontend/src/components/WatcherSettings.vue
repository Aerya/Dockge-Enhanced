<template>
    <div>
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h1 class="mb-0">
                <font-awesome-icon icon="shield-alt" /> {{ $t('watcher.title') }}
            </h1>
            <!-- Bouton bascule FR / EN -->
            <div class="lang-toggle">
                <button class="lang-btn" :class="{ active: watcherLang === 'fr' }" @click="setWatcherLang('fr')" title="Français">
                    🇫🇷
                </button>
                <button class="lang-btn" :class="{ active: watcherLang === 'en' }" @click="setWatcherLang('en')" title="English">
                    🇬🇧
                </button>
            </div>
        </div>

        <div class="shadow-box shadow-box-settings">
            <!-- ═══ TAB BAR ═══ -->
            <ul class="nav nav-pills mb-4">
                <li class="nav-item">
                    <button class="nav-link" :class="{ active: tab === 'images' }" @click="tab = 'images'">
                        <font-awesome-icon icon="sync-alt" class="me-1" />{{ $t('watcher.tab.images') }}
                    </button>
                </li>
                <li class="nav-item">
                    <button class="nav-link" :class="{ active: tab === 'trivy' }" @click="tab = 'trivy'">
                        <font-awesome-icon icon="bug" class="me-1" />{{ $t('watcher.tab.security') }}
                    </button>
                </li>
                <li class="nav-item">
                    <button class="nav-link" :class="{ active: tab === 'backup' }" @click="tab = 'backup'">
                        <font-awesome-icon icon="archive" class="me-1" />{{ $t('watcher.tab.backup') }}
                    </button>
                </li>
            </ul>

            <!-- ═══ TAB: IMAGES ═══ -->
            <div v-show="tab === 'images'">

                <!-- IMAGE WATCHER CONFIG -->
                <div class="shadow-box big-padding mb-4">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h5 class="settings-subheading mb-0">
                            <font-awesome-icon icon="sync-alt" class="me-2" />{{ $t('watcher.img.heading') }}
                        </h5>
                        <div class="form-check form-switch mb-0">
                            <input v-model="imgSettings.enabled" class="form-check-input" type="checkbox"
                                id="imgEnabled" role="switch" />
                            <label class="form-check-label" for="imgEnabled">
                                <span :class="imgSettings.enabled ? 'text-success' : ''">
                                    {{ imgSettings.enabled ? $t('watcher.img.enabled') : $t('watcher.img.disabled') }}
                                </span>
                            </label>
                        </div>
                    </div>

                    <div class="row g-3">
                        <!-- Webhooks Discord -->
                        <div class="col-12">
                            <label class="form-label">{{ $t('watcher.img.webhooks') }}</label>
                            <div v-for="(wh, idx) in imgSettings.discordWebhooks" :key="idx"
                                class="d-flex align-items-center gap-2 mb-2">
                                <span class="form-control form-control-sm text-truncate" style="font-family:monospace;font-size:.78rem">
                                    {{ wh.replace(/(\/[^/]{6})[^/]+$/, '$1***') }}
                                </span>
                                <button class="btn btn-sm btn-normal" @click="testWebhook(wh, 'img')" :disabled="testingImg">
                                    <span v-if="testingImg" class="spinner-border spinner-border-sm" />
                                    <span v-else><font-awesome-icon icon="paper-plane" /></span>
                                </button>
                                <button class="btn btn-sm btn-outline-danger" @click="removeImgWebhook(idx)">
                                    <font-awesome-icon icon="trash" />
                                </button>
                            </div>
                            <p v-if="imgSettings.discordWebhooks.length === 0" class="form-text fst-italic mb-2">
                                {{ $t('watcher.img.noWebhook') }}
                            </p>
                            <div class="input-group">
                                <input v-model="imgWebhook" type="password" class="form-control form-control-sm"
                                    :placeholder="$t('watcher.img.webhookPlaceholder')" autocomplete="off" />
                                <button class="btn btn-sm btn-success" @click="addImgWebhook" :disabled="!imgWebhook">
                                    <font-awesome-icon icon="plus" class="me-1" />{{ $t('watcher.img.addWebhook') }}
                                </button>
                            </div>
                        </div>

                        <!-- Intervalle -->
                        <div class="col-lg-3">
                            <label class="form-label">{{ $t('watcher.img.frequency') }}</label>
                            <select v-model.number="imgSettings.intervalHours" class="form-select">
                                <option :value="1">{{ $t('watcher.img.every1h') }}</option>
                                <option :value="3">{{ $t('watcher.img.every3h') }}</option>
                                <option :value="6">{{ $t('watcher.img.every6h') }}</option>
                                <option :value="12">{{ $t('watcher.img.every12h') }}</option>
                                <option :value="24">{{ $t('watcher.img.every24h') }}</option>
                            </select>
                        </div>

                        <!-- Actions -->
                        <div class="col-12 d-flex gap-2 flex-wrap">
                            <button class="btn btn-primary" @click="saveImgSettings" :disabled="saving">
                                <span v-if="saving" class="spinner-border spinner-border-sm me-1" />
                                <font-awesome-icon v-else icon="save" class="me-1" />{{ $t('watcher.img.save') }}
                            </button>
                            <button class="btn btn-normal" @click="runCheck" :disabled="running">
                                <span v-if="running" class="spinner-border spinner-border-sm me-1" />
                                <font-awesome-icon v-else icon="play" class="me-1" />{{ $t('watcher.img.checkNow') }}
                            </button>
                        </div>
                    </div>
                </div>

                <!-- CREDENTIALS -->
                <div class="shadow-box big-padding mb-4">
                    <h5 class="settings-subheading mb-3">
                        <font-awesome-icon icon="key" class="me-2" />{{ $t('watcher.creds.heading') }}
                    </h5>
                    <p class="form-text mb-3" v-html="$t('watcher.creds.hint')"></p>

                    <div v-if="credentials.length > 0" class="mb-3">
                        <div v-for="cred in credentials" :key="cred.registry"
                            class="d-flex align-items-center gap-3 p-2 rounded mb-2"
                            style="background: rgba(255,255,255,0.04);">
                            <span class="badge bg-secondary">{{ cred.registry }}</span>
                            <span class="form-text">{{ cred.username }}</span>
                            <span class="form-text">Token : ***</span>
                            <button class="btn btn-sm btn-outline-danger ms-auto" @click="removeCred(cred.registry)">
                                <font-awesome-icon icon="trash" />
                            </button>
                        </div>
                    </div>
                    <p v-else class="form-text fst-italic">{{ $t('watcher.creds.none') }}</p>

                    <div class="row g-2 align-items-end">
                        <div class="col-md-3">
                            <label class="form-label small">{{ $t('watcher.creds.registry') }}</label>
                            <input v-model="newCred.registry" type="text" class="form-control form-control-sm"
                                placeholder="ghcr.io" />
                        </div>
                        <div class="col-md-3">
                            <label class="form-label small">{{ $t('watcher.creds.username') }}</label>
                            <input v-model="newCred.username" type="text" class="form-control form-control-sm"
                                placeholder="monpseudo" autocomplete="off" />
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small">{{ $t('watcher.creds.token') }}</label>
                            <input v-model="newCred.token" type="password" class="form-control form-control-sm"
                                placeholder="ghp_xxxxx" autocomplete="new-password" />
                        </div>
                        <div class="col-md-2">
                            <button class="btn btn-sm btn-success w-100" @click="addCred"
                                :disabled="!newCred.registry || !newCred.username || !newCred.token">
                                <font-awesome-icon icon="plus" class="me-1" />{{ $t('watcher.creds.add') }}
                            </button>
                        </div>
                    </div>
                </div>

                <!-- STATUS TABLE -->
                <div class="shadow-box big-padding mb-4">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h5 class="settings-subheading mb-0">
                            <font-awesome-icon icon="table" class="me-2" />{{ $t('watcher.status.heading') }}
                        </h5>
                        <div class="d-flex align-items-center gap-3">
                            <small class="form-text">{{ $t('watcher.status.lastCheck') }} : {{ lastCheckDisplay }}</small>
                            <button class="btn btn-sm btn-normal" @click="loadStatus">
                                <font-awesome-icon icon="sync" />
                            </button>
                        </div>
                    </div>

                    <div v-if="imageStatuses.length === 0" class="text-center form-text fst-italic py-3">
                        {{ $t('watcher.status.noData') }}
                    </div>
                    <div v-else class="table-responsive">
                        <table class="table table-hover mb-0">
                            <thead>
                                <tr>
                                    <th>{{ $t('watcher.status.stack') }}</th>
                                    <th>{{ $t('watcher.status.image') }}</th>
                                    <th>{{ $t('watcher.status.state') }}</th>
                                    <th>{{ $t('watcher.status.localDigest') }}</th>
                                    <th>{{ $t('watcher.status.remoteDigest') }}</th>
                                    <th>{{ $t('watcher.status.checkedAt') }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="s in imageStatuses" :key="s.stack + s.image">
                                    <td><span class="badge bg-secondary">{{ s.stack }}</span></td>
                                    <td>
                                        <code>{{ s.image }}</code>
                                        <button class="btn btn-sm btn-link p-0 ms-2" style="font-size:.75rem;opacity:.7"
                                            @click="searchImage(s.image)">
                                            {{ $t('watcher.status.searchProject') }}
                                        </button>
                                    </td>
                                    <td>
                                        <span v-if="s.error" class="badge bg-danger" :title="s.error">
                                            <font-awesome-icon icon="exclamation-triangle" class="me-1" />{{ $t('watcher.status.error') }}
                                        </span>
                                        <span v-else-if="s.hasUpdate" class="badge bg-warning text-dark">
                                            <font-awesome-icon icon="arrow-circle-up" class="me-1" />{{ $t('watcher.status.updateAvailable') }}
                                        </span>
                                        <span v-else class="badge bg-success">
                                            <font-awesome-icon icon="check-circle" class="me-1" />{{ $t('watcher.status.upToDate') }}
                                        </span>
                                    </td>
                                    <td><code class="small">{{ s.localDigest ? s.localDigest.slice(7, 19) + '…' : '—' }}</code></td>
                                    <td><code class="small">{{ s.remoteDigest ? s.remoteDigest.slice(7, 19) + '…' : '—' }}</code></td>
                                    <td class="small form-text">{{ s.lastChecked ? new Date(s.lastChecked).toLocaleString() : '—' }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- ═══ TAB: TRIVY ═══ -->
            <div v-show="tab === 'trivy'">
                <div class="shadow-box big-padding mb-4">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h5 class="settings-subheading mb-0">
                            <font-awesome-icon icon="bug" class="me-2" />{{ $t('watcher.trivy.heading') }}
                        </h5>
                        <div class="form-check form-switch mb-0">
                            <input v-model="trivySettings.enabled" class="form-check-input" type="checkbox"
                                id="trivyEnabled" role="switch" />
                            <label class="form-check-label" for="trivyEnabled">
                                <span :class="trivySettings.enabled ? 'text-success' : ''">
                                    {{ trivySettings.enabled ? $t('watcher.trivy.enabled') : $t('watcher.trivy.disabled') }}
                                </span>
                            </label>
                        </div>
                    </div>

                    <div class="row g-3">
                        <div class="col-12">
                            <label class="form-label">{{ $t('watcher.trivy.webhooks') }}</label>
                            <div v-for="(wh, idx) in trivySettings.discordWebhooks" :key="idx"
                                class="d-flex align-items-center gap-2 mb-2">
                                <span class="form-control form-control-sm text-truncate" style="font-family:monospace;font-size:.78rem">
                                    {{ wh.replace(/(\/[^/]{6})[^/]+$/, '$1***') }}
                                </span>
                                <button class="btn btn-sm btn-normal" @click="testWebhook(wh, 'trivy')" :disabled="testingTrivy">
                                    <span v-if="testingTrivy" class="spinner-border spinner-border-sm" />
                                    <span v-else><font-awesome-icon icon="paper-plane" /></span>
                                </button>
                                <button class="btn btn-sm btn-outline-danger" @click="removeTrivyWebhook(idx)">
                                    <font-awesome-icon icon="trash" />
                                </button>
                            </div>
                            <p v-if="trivySettings.discordWebhooks.length === 0" class="form-text fst-italic mb-2">
                                {{ $t('watcher.trivy.noWebhook') }}
                            </p>
                            <div class="input-group">
                                <input v-model="trivyWebhook" type="password" class="form-control form-control-sm"
                                    :placeholder="$t('watcher.img.webhookPlaceholder')" autocomplete="off" />
                                <button class="btn btn-sm btn-success" @click="addTrivyWebhook" :disabled="!trivyWebhook">
                                    <font-awesome-icon icon="plus" class="me-1" />{{ $t('watcher.img.addWebhook') }}
                                </button>
                            </div>
                        </div>

                        <div class="col-lg-2">
                            <label class="form-label">{{ $t('watcher.trivy.interval') }}</label>
                            <select v-model.number="trivySettings.intervalHours" class="form-select">
                                <option :value="12">12h</option>
                                <option :value="24">24h</option>
                                <option :value="72">3 days</option>
                                <option :value="168">7 days</option>
                            </select>
                        </div>

                        <div class="col-lg-3">
                            <label class="form-label">{{ $t('watcher.trivy.minSeverity') }}</label>
                            <select v-model="trivySettings.minSeverityAlert" class="form-select">
                                <option value="LOW">{{ $t('watcher.trivy.low') }}</option>
                                <option value="MEDIUM">{{ $t('watcher.trivy.medium') }}</option>
                                <option value="HIGH">{{ $t('watcher.trivy.high') }}</option>
                                <option value="CRITICAL">{{ $t('watcher.trivy.critical') }}</option>
                            </select>
                        </div>

                        <div class="col-12 d-flex gap-4 flex-wrap">
                            <div class="form-check">
                                <input v-model="trivySettings.ignoreUnfixed" type="checkbox"
                                    class="form-check-input" id="ignoreUnfixed" />
                                <label class="form-check-label" for="ignoreUnfixed">
                                    {{ $t('watcher.trivy.ignoreUnfixed') }}
                                </label>
                            </div>
                        </div>

                        <div class="col-12">
                            <small style="color:#9ca3af">{{ $t('watcher.trivy.dockerInfo') }}</small>
                        </div>

                        <div class="col-12 d-flex gap-2 flex-wrap">
                            <button class="btn btn-primary" @click="saveTrivySettings" :disabled="savingTrivy">
                                <span v-if="savingTrivy" class="spinner-border spinner-border-sm me-1" />
                                <font-awesome-icon v-else icon="save" class="me-1" />{{ $t('watcher.trivy.save') }}
                            </button>
                            <button class="btn btn-warning" @click="runScanAndRefresh()" :disabled="scanning">
                                <span v-if="scanning" class="spinner-border spinner-border-sm me-1" />
                                <font-awesome-icon v-else icon="shield-alt" class="me-1" />{{ $t('watcher.trivy.scanNow') }}
                            </button>
                        </div>
                    </div>
                </div>

                <!-- TRIVY STATUS -->
                <div class="shadow-box big-padding mb-4">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h5 class="settings-subheading mb-0">
                            <font-awesome-icon icon="shield-alt" class="me-2" />{{ $t('watcher.trivy.status.heading') }}
                        </h5>
                        <div class="d-flex align-items-center gap-3">
                            <small v-if="trivyStatus.lastScanAt" class="form-text">
                                {{ $t('watcher.trivy.status.lastScan') }} :
                                {{ new Date(trivyStatus.lastScanAt).toLocaleString() }}
                            </small>
                            <button class="btn btn-sm btn-normal" @click="loadTrivyStatus">
                                <font-awesome-icon icon="sync" />
                            </button>
                        </div>
                    </div>

                    <div v-if="trivyStatus.running" class="text-center py-3 text-warning">
                        <span class="spinner-border spinner-border-sm me-2" />
                        {{ $t('watcher.trivy.status.running') }}
                    </div>
                    <div v-else-if="!trivyStatus.lastScanAt" class="text-center form-text fst-italic py-3">
                        {{ $t('watcher.trivy.status.never') }}
                    </div>
                    <div v-else class="table-responsive">
                        <table class="table mb-0">
                            <thead>
                                <tr>
                                    <th>{{ $t('watcher.trivy.status.stack') }}</th>
                                    <th>{{ $t('watcher.trivy.status.image') }}</th>
                                    <th>{{ $t('watcher.trivy.status.maxSeverity') }}</th>
                                    <th>{{ $t('watcher.trivy.status.vulns') }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="r in trivyStatus.lastResults" :key="r.image + r.stack">
                                    <td><span class="badge bg-secondary">{{ r.stack }}</span></td>
                                    <td><code class="small">{{ r.image }}</code></td>
                                    <td>
                                        <span v-if="r.error" class="badge bg-danger" :title="r.error">
                                            <font-awesome-icon icon="exclamation-triangle" class="me-1" />Erreur
                                        </span>
                                        <span v-else-if="r.maxSeverity === 'UNKNOWN' && !r.counts?.CRITICAL && !r.counts?.HIGH && !r.counts?.MEDIUM && !r.counts?.LOW"
                                            class="badge bg-success">
                                            <font-awesome-icon icon="check-circle" class="me-1" />{{ $t('watcher.trivy.status.ok') }}
                                        </span>
                                        <span v-else class="badge"
                                            :class="{
                                                'bg-danger': r.maxSeverity === 'CRITICAL',
                                                'bg-warning text-dark': r.maxSeverity === 'HIGH',
                                                'bg-primary': r.maxSeverity === 'MEDIUM',
                                                'bg-info text-dark': r.maxSeverity === 'LOW',
                                                'bg-secondary': r.maxSeverity === 'UNKNOWN',
                                            }">
                                            {{ r.maxSeverity }}
                                        </span>
                                    </td>
                                    <td class="small">
                                        <span v-if="r.counts">
                                            <span v-if="r.counts.CRITICAL" class="me-2">🔴 {{ r.counts.CRITICAL }}</span>
                                            <span v-if="r.counts.HIGH" class="me-2">🟠 {{ r.counts.HIGH }}</span>
                                            <span v-if="r.counts.MEDIUM" class="me-2">🟡 {{ r.counts.MEDIUM }}</span>
                                            <span v-if="r.counts.LOW" class="me-2">🔵 {{ r.counts.LOW }}</span>
                                            <span v-if="!r.counts.CRITICAL && !r.counts.HIGH && !r.counts.MEDIUM && !r.counts.LOW" class="text-muted">—</span>
                                        </span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- ═══ TAB: BACKUP ═══ -->
            <BackupTab v-if="tab === 'backup'" />
        </div>

        <!-- TOAST -->
        <Transition name="slide-fade">
            <div v-if="toast.msg" class="toast-float" :class="toast.ok ? 'toast-ok' : 'toast-err'">
                {{ toast.msg }}
            </div>
        </Transition>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n/dist/vue-i18n.esm-browser.prod.js";
import BackupTab from "./BackupTab.vue";

// ─── Types ────────────────────────────────────────────────────────

interface Cred { registry: string; username: string; token: string }
interface ImgSettings { enabled: boolean; intervalHours: number; discordWebhooks: string[] }
interface TrivySettings {
    enabled: boolean; intervalHours: number; discordWebhooks: string[];
    minSeverityAlert: string; ignoreUnfixed: boolean;
}
interface ImageStatus {
    image: string; stack: string;
    localDigest: string; remoteDigest: string;
    hasUpdate: boolean; lastChecked: string; error?: string;
}

interface TrivyScanResult {
    image: string; stack: string;
    maxSeverity: string;
    counts: Record<string, number>;
    error?: string;
}

interface TrivyStatus {
    running: boolean;
    lastScanAt: string | null;
    scannedCount: number;
    lastResults: TrivyScanResult[];
}

// ─── State ────────────────────────────────────────────────────────

const { t, locale, setLocaleMessage } = useI18n();

// ─── Gestion de la langue locale à la page watcher ────────────────────
// On lit / écrit dans localStorage.watcherLang (indépendant du reste de l'app)
// mais on met aussi à jour locale de i18n pour que $t() fonctionne.
const SUPPORTED = ['fr', 'en'] as const;
type SupportedLang = typeof SUPPORTED[number];

function resolveWatcherLang(): SupportedLang {
    const stored = localStorage.getItem('watcherLang') as SupportedLang | null;
    if (stored && SUPPORTED.includes(stored)) return stored;
    const appLocale = (localStorage.getItem('locale') ?? 'en').substring(0, 2);
    return appLocale === 'fr' ? 'fr' : 'en';
}

const watcherLang = ref<SupportedLang>(resolveWatcherLang());

async function setWatcherLang(lang: SupportedLang) {
    watcherLang.value = lang;
    localStorage.setItem('watcherLang', lang);
    const mod = await import(`../lang/${lang}.json`);
    setLocaleMessage(lang, mod.default ?? mod);
    locale.value = lang;
}

// Applique la langue initiale au montage
onMounted(async () => {
    await setWatcherLang(watcherLang.value);
});

const tab = ref("images");

const imgSettings = ref<ImgSettings>({ enabled: false, intervalHours: 6, discordWebhooks: [] });
const imgWebhook = ref("");
const trivySettings = ref<TrivySettings>({
    enabled: false, intervalHours: 24, discordWebhooks: [],
    minSeverityAlert: "HIGH", ignoreUnfixed: false,
});
const trivyWebhook = ref("");
const credentials = ref<Cred[]>([]);
const newCred = ref<Cred>({ registry: "", username: "", token: "" });
const imageStatuses = ref<ImageStatus[]>([]);

const trivyStatus = ref<TrivyStatus>({ running: false, lastScanAt: null, scannedCount: 0, lastResults: [] });

// ─── Recherche DuckDuckGo pour une image ──────────────────────────
function searchImage(image: string): void {
    const noTag = image.replace(/:[\w.-]+$/, "");
    window.open(`https://duckduckgo.com/?q=${encodeURIComponent(noTag)}`, "_blank");
}

const saving = ref(false);
const savingTrivy = ref(false);
const running = ref(false);
const scanning = ref(false);
const testingImg = ref(false);
const testingTrivy = ref(false);
const toast = ref({ msg: "", ok: true });

let pollTimer: ReturnType<typeof setInterval> | null = null;

const lastCheckDisplay = computed(() => {
    if (!imageStatuses.value.length) return t('watcher.status.never');
    const dates = imageStatuses.value.map(s => new Date(s.lastChecked).getTime()).filter(Boolean);
    if (!dates.length) return '—';
    return new Date(Math.max(...dates)).toLocaleString();
});

// ─── API ──────────────────────────────────────────────────────────

const API = "/api/watcher";
async function api(method: string, path: string, body?: unknown) {
    const token = localStorage.getItem("token") ?? "";
    const res = await fetch(API + path, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
}

function showToast(msg: string, ok = true) {
    toast.value = { msg, ok };
    setTimeout(() => (toast.value.msg = ""), 3500);
}

// ─── Init & polling ───────────────────────────────────────────────

onMounted(async () => {
    const [imgRes, trivyRes, statusRes, trivyStatusRes] = await Promise.all([
        api("GET", "/image/settings"),
        api("GET", "/trivy/settings"),
        api("GET", "/image/status"),
        api("GET", "/trivy/status"),
    ]);
    if (imgRes.ok) {
        imgSettings.value = {
            enabled:         imgRes.data.enabled,
            intervalHours:   imgRes.data.intervalHours,
            discordWebhooks: imgRes.data.discordWebhooks ?? [],
        };
        credentials.value = imgRes.data.credentials ?? [];
    }
    if (trivyRes.ok) trivySettings.value = trivyRes.data;
    if (statusRes.ok) imageStatuses.value = statusRes.data;
    if (trivyStatusRes.ok) trivyStatus.value = trivyStatusRes.data;
    pollTimer = setInterval(loadStatus, 10000);
});

onUnmounted(() => { if (pollTimer) clearInterval(pollTimer); });

async function loadStatus() {
    const res = await api("GET", "/image/status");
    if (res.ok) imageStatuses.value = res.data;
}

// ─── Actions ──────────────────────────────────────────────────────

function addImgWebhook() {
    const url = imgWebhook.value.trim();
    if (!url || imgSettings.value.discordWebhooks.includes(url)) return;
    imgSettings.value.discordWebhooks.push(url);
    imgWebhook.value = "";
}
function removeImgWebhook(idx: number) {
    imgSettings.value.discordWebhooks.splice(idx, 1);
}
function addTrivyWebhook() {
    const url = trivyWebhook.value.trim();
    if (!url || trivySettings.value.discordWebhooks.includes(url)) return;
    trivySettings.value.discordWebhooks.push(url);
    trivyWebhook.value = "";
}
function removeTrivyWebhook(idx: number) {
    trivySettings.value.discordWebhooks.splice(idx, 1);
}

async function saveImgSettings() {
    saving.value = true;
    try {
        const res = await api("POST", "/image/settings", { ...imgSettings.value });
        showToast(res.ok ? t('watcher.img.saved') : `❌ ${res.message}`, res.ok);
    } finally { saving.value = false; }
}

async function saveTrivySettings() {
    savingTrivy.value = true;
    try {
        const res = await api("POST", "/trivy/settings", { ...trivySettings.value });
        showToast(res.ok ? t('watcher.trivy.saved') : `❌ ${res.message}`, res.ok);
    } finally { savingTrivy.value = false; }
}

async function runCheck() {
    running.value = true;
    try {
        await api("POST", "/image/run");
        showToast(t('watcher.img.checking'));
    } finally { running.value = false; }
}

async function loadTrivyStatus() {
    const res = await api("GET", "/trivy/status");
    if (res.ok) trivyStatus.value = res.data;
}

async function runScan(image?: string) {
    scanning.value = true;
    try {
        await api("POST", "/trivy/run", image ? { image } : {});
        showToast(t('watcher.trivy.scanning'));
    } finally { scanning.value = false; }
}

async function runScanAndRefresh(image?: string) {
    await runScan(image);
    // Polling du statut toutes les 3s pendant 2 minutes max
    let attempts = 0;
    const poll = setInterval(async () => {
        await loadTrivyStatus();
        attempts++;
        if (!trivyStatus.value.running || attempts >= 40) clearInterval(poll);
    }, 3000);
}

async function testWebhook(url: string, context: "img" | "trivy") {
    if (context === "img") testingImg.value = true;
    else testingTrivy.value = true;
    try {
        const res = await api("POST", "/discord/test", { webhookUrl: url });
        showToast(res.ok ? t('watcher.discord.testOk') : t('watcher.discord.testFail'), res.ok);
    } finally {
        if (context === "img") testingImg.value = false;
        else testingTrivy.value = false;
    }
}

async function addCred() {
    const res = await api("POST", "/image/credentials", { ...newCred.value });
    if (res.ok) {
        credentials.value = credentials.value
            .filter(c => c.registry !== newCred.value.registry)
            .concat({ ...newCred.value, token: "***" });
        newCred.value = { registry: "", username: "", token: "" };
        showToast(t('watcher.creds.added'));
    } else {
        showToast(`❌ ${res.message}`, false);
    }
}

async function removeCred(registry: string) {
    const res = await api("DELETE", `/image/credentials/${registry}`);
    if (res.ok) {
        credentials.value = credentials.value.filter(c => c.registry !== registry);
        showToast(t('watcher.creds.removed'));
    }
}
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.form-control::placeholder,
.form-control-sm::placeholder {
    color: #9ca3af !important;
    opacity: 1;
}

.shadow-box-settings {
    padding: 20px;
    min-height: calc(100vh - 155px);
}

.lang-toggle {
    display: flex;
    gap: .35rem;
    background: rgba(255,255,255,.06);
    border-radius: 50rem;
    padding: 3px 5px;
    border: 1px solid rgba(255,255,255,.1);
}

.lang-btn {
    background: none;
    border: none;
    font-size: 1.15rem;
    line-height: 1;
    padding: 2px 5px;
    border-radius: 50rem;
    cursor: pointer;
    opacity: .45;
    transition: opacity .15s, background .15s;
    &:hover { opacity: .8; }
    &.active {
        opacity: 1;
        background: rgba(255,255,255,.12);
    }
}

.settings-subheading {
    font-size: 1.1rem;
    font-weight: 600;
}

.table th {
    font-size: .72rem;
    text-transform: uppercase;
    letter-spacing: .05em;
    opacity: .55;
    border-bottom-color: $dark-border-color;
}

.table td {
    vertical-align: middle;
    border-bottom-color: $dark-border-color;
}

// Toast
.toast-float {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    z-index: 9999;
    padding: .65rem 1.25rem;
    border-radius: 50rem;
    font-size: .875rem;
    font-weight: 500;
    box-shadow: 0 4px 16px rgba(0, 0, 0, .4);
}

.toast-ok {
    background: #166534;
    color: #bbf7d0;
    border: 1px solid #15803d;
}

.toast-err {
    background: #7f1d1d;
    color: #fecaca;
    border: 1px solid #b91c1c;
}
</style>
