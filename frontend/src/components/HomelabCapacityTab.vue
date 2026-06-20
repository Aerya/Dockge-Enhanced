<template>
  <div class="capacity-tab">
    <div class="shadow-box big-padding mb-4">
      <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
        <div>
          <h5 class="settings-subheading mb-1">
            <font-awesome-icon icon="database" class="me-2" />{{ t("watcher.capacity.heading") }}
          </h5>
          <p class="capacity-muted mb-0">{{ t("watcher.capacity.hint") }}</p>
        </div>
        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-normal" :disabled="loading" @click="loadSummary">
            <font-awesome-icon icon="sync" class="me-1" />{{ t("watcher.capacity.refresh") }}
          </button>
          <button class="btn btn-primary" :disabled="scanning" @click="runScan">
            <font-awesome-icon v-if="scanning" icon="spinner" spin class="me-1" />
            <font-awesome-icon v-else icon="play" class="me-1" />
            {{ t("watcher.capacity.scanNow") }}
          </button>
        </div>
      </div>

      <div class="row g-3 align-items-end">
        <div class="col-12">
          <div class="form-check form-switch mb-0">
            <input id="capacityEnabled" v-model="settings.enabled" class="form-check-input" type="checkbox" role="switch" />
            <label class="form-check-label fw-semibold" for="capacityEnabled">
              {{ t("watcher.capacity.enabled") }}
            </label>
          </div>
          <small class="capacity-muted">{{ t("watcher.capacity.enabledHint") }}</small>
        </div>

        <div class="col-md-4 col-xl-2">
          <label class="form-label">{{ t("watcher.capacity.interval") }}</label>
          <select v-model.number="settings.intervalHours" class="form-select">
            <option :value="24">{{ t("watcher.capacity.every24h") }}</option>
            <option :value="48">{{ t("watcher.capacity.every48h") }}</option>
            <option :value="168">{{ t("watcher.capacity.every7d") }}</option>
          </select>
        </div>
        <div class="col-md-4 col-xl-2">
          <label class="form-label">{{ t("watcher.capacity.historyDays") }}</label>
          <input v-model.number="settings.historyDays" min="1" max="3650" type="number" class="form-control" />
        </div>
        <div class="col-md-4 col-xl-2">
          <label class="form-label">{{ t("watcher.capacity.oldImageDays") }}</label>
          <input v-model.number="settings.oldImageDays" min="1" max="3650" type="number" class="form-control" />
        </div>
        <div class="col-md-6 col-xl-3">
          <div class="form-check">
            <input id="capacityLowPower" v-model="settings.runInLowPower" class="form-check-input" type="checkbox" />
            <label class="form-check-label" for="capacityLowPower">{{ t("watcher.capacity.runInLowPower") }}</label>
          </div>
          <small class="capacity-muted">{{ t("watcher.capacity.runInLowPowerHint") }}</small>
        </div>
        <div class="col-md-6 col-xl-3">
          <div class="form-check">
            <input id="capacityBinds" v-model="settings.includeBindMounts" class="form-check-input" type="checkbox" />
            <label class="form-check-label" for="capacityBinds">{{ t("watcher.capacity.includeBindMounts") }}</label>
          </div>
          <small class="capacity-muted">{{ t("watcher.capacity.includeBindMountsHint") }}</small>
        </div>
        <div class="col-12">
          <button class="btn btn-primary" :disabled="saving" @click="saveSettings">
            <font-awesome-icon v-if="saving" icon="spinner" spin class="me-1" />
            <font-awesome-icon v-else icon="save" class="me-1" />
            {{ t("watcher.capacity.save") }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>

    <div class="capacity-grid mb-4">
      <div class="capacity-card">
        <span>{{ t("watcher.capacity.tracked") }}</span>
        <strong>{{ formatBytes(snapshot?.totals.totalKnownBytes ?? null) }}</strong>
      </div>
      <div class="capacity-card">
        <span>{{ t("watcher.capacity.growth7d") }}</span>
        <strong :class="growthClass(growth?.sevenDaysBytes ?? null)">{{ formatDelta(growth?.sevenDaysBytes ?? null) }}</strong>
      </div>
      <div class="capacity-card">
        <span>{{ t("watcher.capacity.orphanVolumes") }}</span>
        <strong>{{ orphanVolumes.length }}</strong>
      </div>
      <div class="capacity-card">
        <span>{{ t("watcher.capacity.oldUnusedImages") }}</span>
        <strong>{{ oldUnusedImages.length }}</strong>
      </div>
      <div class="capacity-card">
        <span>{{ t("watcher.capacity.lastScan") }}</span>
        <strong>{{ snapshot ? fmtDate(snapshot.timestamp) : t("watcher.capacity.never") }}</strong>
      </div>
      <div class="capacity-card">
        <span>{{ t("watcher.capacity.nextScan") }}</span>
        <strong>{{ settings.nextRun ? fmtDate(settings.nextRun) : "-" }}</strong>
      </div>
    </div>

    <div class="shadow-box big-padding mb-4">
      <div class="row g-3 align-items-end">
        <div class="col-lg-5">
          <label class="form-label">{{ t("watcher.capacity.search") }}</label>
          <input v-model.trim="query" class="form-control" :placeholder="t('watcher.capacity.searchPlaceholder')" />
        </div>
        <div class="col-lg-7 capacity-muted">
          {{ t("watcher.capacity.snapshotMeta", {
            volumes: snapshot?.totals.volumes ?? 0,
            images: snapshot?.totals.images ?? 0,
            containers: snapshot?.totals.containers ?? 0,
            duration: snapshot?.durationMs ?? 0,
          }) }}
        </div>
      </div>
    </div>

    <div v-if="!snapshot && !loading" class="shadow-box big-padding capacity-muted">
      {{ t("watcher.capacity.empty") }}
    </div>

    <template v-if="snapshot">
      <CapacityTable :title="t('watcher.capacity.stacks')" :items="filteredStacks" :columns="stackColumns" />
      <CapacityTable :title="t('watcher.capacity.volumes')" :items="filteredVolumes" :columns="volumeColumns" />
      <CapacityTable :title="t('watcher.capacity.images')" :items="filteredImages" :columns="imageColumns" />
      <CapacityTable :title="t('watcher.capacity.containers')" :items="filteredContainers" :columns="containerColumns" />

      <div v-if="snapshot.warnings.length" class="shadow-box big-padding mt-4">
        <h5 class="settings-subheading mb-3">{{ t("watcher.capacity.warnings") }}</h5>
        <ul class="capacity-muted mb-0">
          <li v-for="warning in snapshot.warnings.slice(0, 15)" :key="warning">{{ warning }}</li>
        </ul>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n/dist/vue-i18n.esm-browser.prod.js";
import { fmtDate } from "../composables/useServerTz";

type Status = "running" | "stopped" | "orphan" | "used" | "unused" | "dangling" | "old-unused";

interface Settings {
  enabled: boolean;
  intervalHours: 24 | 48 | 168;
  historyDays: number;
  runInLowPower: boolean;
  includeBindMounts: boolean;
  oldImageDays: number;
  lastScanAt?: string;
  lastScanDurationMs?: number;
  lastScanResult?: string;
  nextRun?: string | null;
  running?: boolean;
}

interface StackItem {
  name: string;
  services: string[];
  containers: number;
  volumeBytes: number;
  imageBytes: number;
  logBytes: number;
  totalKnownBytes: number;
  unknownVolumes: number;
}

interface VolumeItem {
  name: string;
  driver?: string;
  mountpoint?: string;
  sizeBytes: number | null;
  status: Status;
  containers: string[];
  stacks: string[];
  services: string[];
  warning?: string;
}

interface ImageItem {
  id: string;
  name: string;
  size: string;
  sizeBytes: number | null;
  ageDays: number | null;
  status: Status;
  containers: string[];
  stacks: string[];
}

interface ContainerItem {
  id: string;
  name: string;
  image: string;
  state: string;
  stackName?: string;
  service?: string;
  logBytes: number | null;
  writableBytes: number | null;
}

interface Snapshot {
  timestamp: string;
  durationMs: number;
  totals: {
    totalKnownBytes: number;
    volumes: number;
    images: number;
    containers: number;
  };
  stacks: StackItem[];
  volumes: VolumeItem[];
  images: ImageItem[];
  containers: ContainerItem[];
  warnings: string[];
}

interface Summary {
  settings: Settings;
  snapshot: Snapshot | null;
  growth: {
    sincePreviousBytes: number | null;
    sevenDaysBytes: number | null;
    previousAt: string | null;
    sevenDaysAt: string | null;
  };
}

type Column<T> = {
  key: string;
  label: string;
  value: (item: T) => string;
  class?: (item: T) => string;
};

const { t } = useI18n();
const API = "/api/capacity";

const loading = ref(false);
const saving = ref(false);
const scanning = ref(false);
const error = ref("");
const query = ref("");
const settings = ref<Settings>({
  enabled: false,
  intervalHours: 24,
  historyDays: 30,
  runInLowPower: false,
  includeBindMounts: false,
  oldImageDays: 90,
});
const snapshot = ref<Snapshot | null>(null);
const growth = ref<Summary["growth"] | null>(null);

const orphanVolumes = computed(() => snapshot.value?.volumes.filter(item => item.status === "orphan") ?? []);
const oldUnusedImages = computed(() => snapshot.value?.images.filter(item => item.status === "old-unused") ?? []);

const filteredStacks = computed(() => filterItems(snapshot.value?.stacks ?? [], stackSearch));
const filteredVolumes = computed(() => filterItems(snapshot.value?.volumes ?? [], volumeSearch));
const filteredImages = computed(() => filterItems(snapshot.value?.images ?? [], imageSearch));
const filteredContainers = computed(() => filterItems(snapshot.value?.containers ?? [], containerSearch));

const stackColumns = computed<Column<StackItem>[]>(() => [
  { key: "name", label: t("watcher.capacity.col.stack"), value: item => item.name },
  { key: "total", label: t("watcher.capacity.col.total"), value: item => formatBytes(item.totalKnownBytes) },
  { key: "volumes", label: t("watcher.capacity.col.volumes"), value: item => formatBytes(item.volumeBytes) },
  { key: "images", label: t("watcher.capacity.col.images"), value: item => formatBytes(item.imageBytes) },
  { key: "logs", label: t("watcher.capacity.col.logs"), value: item => formatBytes(item.logBytes) },
  { key: "unknown", label: t("watcher.capacity.col.unknown"), value: item => String(item.unknownVolumes), class: item => item.unknownVolumes > 0 ? "text-warning" : "" },
]);

const volumeColumns = computed<Column<VolumeItem>[]>(() => [
  { key: "name", label: t("watcher.capacity.col.volume"), value: item => item.name },
  { key: "size", label: t("watcher.capacity.col.size"), value: item => formatBytes(item.sizeBytes), class: item => item.sizeBytes === null ? "text-warning" : "" },
  { key: "status", label: t("watcher.capacity.col.status"), value: item => statusLabel(item.status), class: item => statusClass(item.status) },
  { key: "stacks", label: t("watcher.capacity.col.stack"), value: item => item.stacks.join(", ") || "-" },
  { key: "containers", label: t("watcher.capacity.col.containers"), value: item => item.containers.join(", ") || "-" },
]);

const imageColumns = computed<Column<ImageItem>[]>(() => [
  { key: "name", label: t("watcher.capacity.col.image"), value: item => item.name },
  { key: "size", label: t("watcher.capacity.col.size"), value: item => formatBytes(item.sizeBytes) },
  { key: "age", label: t("watcher.capacity.col.age"), value: item => item.ageDays === null ? "-" : `${item.ageDays} j` },
  { key: "status", label: t("watcher.capacity.col.status"), value: item => statusLabel(item.status), class: item => statusClass(item.status) },
  { key: "stacks", label: t("watcher.capacity.col.stack"), value: item => item.stacks.join(", ") || "-" },
]);

const containerColumns = computed<Column<ContainerItem>[]>(() => [
  { key: "name", label: t("watcher.capacity.col.container"), value: item => item.name },
  { key: "stack", label: t("watcher.capacity.col.stack"), value: item => [item.stackName, item.service].filter(Boolean).join(" / ") || "-" },
  { key: "logs", label: t("watcher.capacity.col.logs"), value: item => formatBytes(item.logBytes), class: item => item.logBytes === null ? "text-warning" : "" },
  { key: "writable", label: t("watcher.capacity.col.writable"), value: item => formatBytes(item.writableBytes) },
  { key: "image", label: t("watcher.capacity.col.image"), value: item => item.image },
]);

const CapacityTable = defineComponent({
  props: {
    title: { type: String, required: true },
    items: { type: Array, required: true },
    columns: { type: Array, required: true },
  },
  setup(props) {
    return () => h("div", { class: "shadow-box big-padding mb-4" }, [
      h("div", { class: "d-flex justify-content-between align-items-center mb-3" }, [
        h("h5", { class: "settings-subheading mb-0" }, props.title),
        h("span", { class: "capacity-muted" }, `${props.items.length}`),
      ]),
      h("div", { class: "table-responsive" }, [
        h("table", { class: "table table-sm align-middle capacity-table" }, [
          h("thead", [
            h("tr", (props.columns as Column<unknown>[]).map(column => h("th", { key: column.key }, column.label))),
          ]),
          h("tbody", (props.items as unknown[]).slice(0, 50).map((item, index) =>
            h("tr", { key: index }, (props.columns as Column<unknown>[]).map(column =>
              h("td", { key: column.key, class: column.class?.(item) }, column.value(item))
            ))
          )),
        ]),
      ]),
    ]);
  },
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

async function loadSummary() {
  loading.value = true;
  error.value = "";
  try {
    const data = await api("/summary");
    applySummary(data.data as Summary);
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}

async function saveSettings() {
  saving.value = true;
  error.value = "";
  try {
    const data = await api("/settings", {
      method: "POST",
      body: JSON.stringify(settings.value),
    });
    applySummary(data.data as Summary);
  } catch (e) {
    error.value = String(e);
  } finally {
    saving.value = false;
  }
}

async function runScan() {
  scanning.value = true;
  error.value = "";
  try {
    const data = await api("/scan", { method: "POST" });
    applySummary(data.data as Summary);
  } catch (e) {
    error.value = String(e);
  } finally {
    scanning.value = false;
  }
}

function applySummary(summary: Summary) {
  settings.value = { ...settings.value, ...summary.settings };
  snapshot.value = summary.snapshot;
  growth.value = summary.growth;
}

function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined) return t("watcher.capacity.unknown");
  if (value === 0) return "0 B";
  const units = [ "B", "Kio", "Mio", "Gio", "Tio", "Pio" ];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit++;
  }
  return `${amount >= 10 || unit === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unit]}`;
}

function formatDelta(value: number | null): string {
  if (value === null) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatBytes(value)}`;
}

function growthClass(value: number | null): string {
  if (value === null || value === 0) return "";
  return value > 0 ? "text-warning" : "text-success";
}

function statusLabel(status: Status): string {
  return t(`watcher.capacity.status.${status}`);
}

function statusClass(status: Status): string {
  if (status === "orphan" || status === "old-unused" || status === "dangling") return "text-warning";
  if (status === "running" || status === "used") return "text-success";
  return "";
}

function filterItems<T>(items: T[], buildSearch: (item: T) => string): T[] {
  const q = query.value.toLowerCase();
  if (!q) return items.slice(0, 50);
  return items.filter(item => buildSearch(item).includes(q)).slice(0, 50);
}

function stackSearch(item: StackItem): string {
  return `${item.name} ${item.services.join(" ")}`.toLowerCase();
}

function volumeSearch(item: VolumeItem): string {
  return `${item.name} ${item.stacks.join(" ")} ${item.containers.join(" ")} ${item.mountpoint ?? ""}`.toLowerCase();
}

function imageSearch(item: ImageItem): string {
  return `${item.name} ${item.stacks.join(" ")} ${item.containers.join(" ")}`.toLowerCase();
}

function containerSearch(item: ContainerItem): string {
  return `${item.name} ${item.image} ${item.stackName ?? ""} ${item.service ?? ""}`.toLowerCase();
}

onMounted(loadSummary);
</script>

<style scoped>
.capacity-muted {
  color: #cbd5e1;
}

.capacity-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.capacity-card {
  padding: 14px 16px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
}

.capacity-card span {
  display: block;
  color: #cbd5e1;
  font-size: 0.78rem;
  margin-bottom: 6px;
}

.capacity-card strong {
  color: #f8fafc;
  font-size: 1rem;
}

.capacity-table {
  min-width: 860px;
  --bs-table-bg: transparent;
  --bs-table-color: #e5e7eb;
  --bs-table-border-color: rgba(148, 163, 184, 0.28);
  color: #e5e7eb;
}

.capacity-table th {
  color: #f8fafc;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom-color: rgba(148, 163, 184, 0.38);
}

.capacity-table td {
  color: #e5e7eb;
  border-top-color: rgba(148, 163, 184, 0.18);
  overflow-wrap: anywhere;
}
</style>
