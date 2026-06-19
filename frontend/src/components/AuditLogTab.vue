<template>
  <div class="audit-log">
    <div class="shadow-box big-padding mb-4">
      <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
        <div>
          <h5 class="settings-subheading mb-1">
            <font-awesome-icon icon="history" class="me-2" />{{ $t("watcher.audit.heading") }}
          </h5>
          <p class="audit-muted mb-0">{{ $t("watcher.audit.hint") }}</p>
        </div>
        <button class="btn btn-primary" :disabled="savingSettings" @click="saveSettings">
          <font-awesome-icon v-if="savingSettings" icon="spinner" spin class="me-1" />
          <font-awesome-icon v-else icon="save" class="me-1" />
          {{ $t("watcher.audit.saveRetention") }}
        </button>
      </div>

      <div class="row g-3 align-items-end">
        <div class="col-md-4 col-xl-3">
          <label class="form-label">{{ $t("watcher.audit.retention") }}</label>
          <select v-model="retentionMode" class="form-select">
            <option value="30">30 {{ $t("watcher.audit.days") }}</option>
            <option value="90">90 {{ $t("watcher.audit.days") }}</option>
            <option value="180">180 {{ $t("watcher.audit.days") }}</option>
            <option value="365">365 {{ $t("watcher.audit.days") }}</option>
            <option value="custom">{{ $t("watcher.audit.custom") }}</option>
            <option value="unlimited">{{ $t("watcher.audit.unlimited") }}</option>
          </select>
        </div>
        <div v-if="retentionMode === 'custom'" class="col-md-3 col-xl-2">
          <label class="form-label">{{ $t("watcher.audit.customDays") }}</label>
          <input v-model.number="customRetentionDays" min="1" max="3650" type="number" class="form-control" />
        </div>
      </div>
    </div>

    <div class="shadow-box big-padding mb-4">
      <div class="row g-3 align-items-end">
        <div class="col-lg-4">
          <label class="form-label">{{ $t("watcher.audit.search") }}</label>
          <input
            v-model.trim="filters.q"
            class="form-control"
            :placeholder="$t('watcher.audit.searchPlaceholder')"
            @keyup.enter="reload"
          />
        </div>
        <div class="col-md-4 col-lg-2">
          <label class="form-label">{{ $t("watcher.audit.action") }}</label>
          <select v-model="filters.action" class="form-select">
            <option value="">{{ $t("watcher.audit.all") }}</option>
            <option v-for="action in facets.actions" :key="action" :value="action">{{ action }}</option>
          </select>
        </div>
        <div class="col-md-4 col-lg-2">
          <label class="form-label">{{ $t("watcher.audit.category") }}</label>
          <select v-model="filters.category" class="form-select">
            <option value="">{{ $t("watcher.audit.all") }}</option>
            <option v-for="category in facets.categories" :key="category" :value="category">{{ category }}</option>
          </select>
        </div>
        <div class="col-md-4 col-lg-2">
          <label class="form-label">{{ $t("watcher.audit.status") }}</label>
          <select v-model="filters.status" class="form-select">
            <option value="">{{ $t("watcher.audit.all") }}</option>
            <option value="success">{{ $t("watcher.audit.success") }}</option>
            <option value="failure">{{ $t("watcher.audit.failure") }}</option>
          </select>
        </div>
        <div class="col-md-6 col-lg-2">
          <label class="form-label">{{ $t("watcher.audit.from") }}</label>
          <input v-model="filters.from" type="date" class="form-control" />
        </div>
        <div class="col-md-6 col-lg-2">
          <label class="form-label">{{ $t("watcher.audit.to") }}</label>
          <input v-model="filters.to" type="date" class="form-control" />
        </div>
        <div class="col-lg-4 d-flex gap-2">
          <button class="btn btn-primary" :disabled="loading" @click="reload">
            <font-awesome-icon v-if="loading" icon="spinner" spin class="me-1" />
            <font-awesome-icon v-else icon="search" class="me-1" />
            {{ $t("watcher.audit.apply") }}
          </button>
          <button class="btn btn-outline-secondary" @click="clearFilters">
            {{ $t("watcher.audit.clear") }}
          </button>
        </div>
      </div>
    </div>

    <div class="shadow-box big-padding">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h5 class="settings-subheading mb-0">{{ $t("watcher.audit.entries") }}</h5>
        <span class="audit-muted">{{ $t("watcher.audit.total", { count: total }) }}</span>
      </div>

      <div v-if="error" class="alert alert-danger">{{ error }}</div>
      <div v-else-if="!loading && entries.length === 0" class="audit-muted py-3">
        {{ $t("watcher.audit.empty") }}
      </div>
      <div v-else class="table-responsive">
        <table class="table table-sm align-middle audit-table">
          <thead>
            <tr>
              <th>{{ $t("watcher.audit.date") }}</th>
              <th>{{ $t("watcher.audit.user") }}</th>
              <th>{{ $t("watcher.audit.action") }}</th>
              <th>{{ $t("watcher.audit.target") }}</th>
              <th>{{ $t("watcher.audit.status") }}</th>
              <th>{{ $t("watcher.audit.message") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in entries" :key="entry.id">
              <td class="audit-date">{{ fmtDate(entry.timestamp) }}</td>
              <td>{{ entry.username || "system" }}</td>
              <td><code>{{ entry.action }}</code></td>
              <td>
                <span class="audit-target-type">{{ entry.targetType }}</span>
                <span v-if="entry.target"> {{ entry.target }}</span>
              </td>
              <td>
                <span class="badge" :class="entry.status === 'failure' ? 'bg-danger' : 'bg-success'">
                  {{ entry.status === "failure" ? $t("watcher.audit.failure") : $t("watcher.audit.success") }}
                </span>
              </td>
              <td class="audit-message">
                <span>{{ entry.message || "-" }}</span>
                <details v-if="entry.metadata" class="mt-1">
                  <summary>{{ $t("watcher.audit.details") }}</summary>
                  <pre>{{ formatMetadata(entry.metadata) }}</pre>
                </details>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="d-flex justify-content-between align-items-center mt-3">
        <button class="btn btn-outline-secondary" :disabled="offset === 0 || loading" @click="previousPage">
          {{ $t("watcher.audit.previous") }}
        </button>
        <span class="audit-muted">{{ pageLabel }}</span>
        <button class="btn btn-outline-secondary" :disabled="offset + limit >= total || loading" @click="nextPage">
          {{ $t("watcher.audit.next") }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { fmtDate } from "../composables/useServerTz";

interface AuditEntry {
  id: number;
  timestamp: string;
  username?: string | null;
  action: string;
  category: string;
  targetType?: string | null;
  target?: string | null;
  status: "success" | "failure";
  message?: string | null;
  metadata?: unknown;
}

const API = "/api/audit";
const limit = 15;

const loading = ref(false);
const savingSettings = ref(false);
const error = ref("");
const entries = ref<AuditEntry[]>([]);
const total = ref(0);
const offset = ref(0);
const retentionMode = ref("180");
const customRetentionDays = ref(180);
const facets = reactive<{ actions: string[]; categories: string[] }>({ actions: [], categories: [] });
const filters = reactive({
  q: "",
  action: "",
  category: "",
  status: "",
  from: "",
  to: "",
});

const pageLabel = computed(() => {
  if (total.value === 0) {
    return "0 / 0";
  }
  return `${offset.value + 1}-${Math.min(offset.value + limit, total.value)} / ${total.value}`;
});

watch([() => filters.action, () => filters.category, () => filters.status, () => filters.from, () => filters.to], () => {
  reload();
});

function getToken() {
  return localStorage.getItem("token") ?? sessionStorage.getItem("token") ?? "";
}

async function api(path: string, options: RequestInit = {}) {
  const token = getToken();
  const sep = path.includes("?") ? "&" : "?";
  const url = token ? `${API}${path}${sep}token=${encodeURIComponent(token)}` : `${API}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || res.statusText);
  }
  return data;
}

async function loadSettings() {
  const data = await api("/settings");
  const retentionDays = data.data?.retentionDays ?? null;
  if (retentionDays === null) {
    retentionMode.value = "unlimited";
  } else if ([30, 90, 180, 365].includes(Number(retentionDays))) {
    retentionMode.value = String(retentionDays);
  } else {
    retentionMode.value = "custom";
    customRetentionDays.value = Number(retentionDays);
  }
}

async function saveSettings() {
  savingSettings.value = true;
  error.value = "";
  try {
    const retentionDays = retentionMode.value === "unlimited"
      ? null
      : retentionMode.value === "custom"
        ? customRetentionDays.value
        : Number(retentionMode.value);
    await api("/settings", {
      method: "POST",
      body: JSON.stringify({ retentionDays }),
    });
    await Promise.all([loadSettings(), reload()]);
  } catch (e) {
    error.value = String(e);
  } finally {
    savingSettings.value = false;
  }
}

async function loadFacets() {
  const data = await api("/facets");
  facets.actions = data.data?.actions ?? [];
  facets.categories = data.data?.categories ?? [];
}

async function reload() {
  offset.value = 0;
  await loadEntries();
}

async function loadEntries() {
  loading.value = true;
  error.value = "";
  try {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String(offset.value));
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params.set(key, value);
      }
    }
    const data = await api(`/entries?${params.toString()}`);
    entries.value = data.entries ?? [];
    total.value = Number(data.total ?? 0);
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}

function clearFilters() {
  filters.q = "";
  filters.action = "";
  filters.category = "";
  filters.status = "";
  filters.from = "";
  filters.to = "";
  reload();
}

function previousPage() {
  offset.value = Math.max(0, offset.value - limit);
  loadEntries();
}

function nextPage() {
  offset.value += limit;
  loadEntries();
}

function formatMetadata(metadata: unknown) {
  return JSON.stringify(metadata, null, 2);
}

onMounted(async () => {
  await Promise.all([loadSettings(), loadFacets(), loadEntries()]);
});
</script>

<style scoped>
.audit-table {
  min-width: 980px;
  --bs-table-bg: transparent;
  --bs-table-color: #e5e7eb;
  --bs-table-border-color: rgba(148, 163, 184, 0.28);
  color: #e5e7eb;
}

.audit-table th {
  color: #f8fafc;
  border-bottom-color: rgba(148, 163, 184, 0.38);
}

.audit-table td {
  color: #e5e7eb;
  border-top-color: rgba(148, 163, 184, 0.18);
}

.audit-muted {
  color: #cbd5e1;
}

.audit-target-type {
  color: #93c5fd;
  font-size: 0.82rem;
  font-weight: 600;
}

.audit-date {
  white-space: nowrap;
}

.audit-message {
  max-width: 420px;
  overflow-wrap: anywhere;
}

details pre {
  margin: 0.5rem 0 0;
  max-height: 180px;
  overflow: auto;
  font-size: 0.78rem;
}
</style>
