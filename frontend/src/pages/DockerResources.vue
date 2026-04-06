<template>
    <div>
        <!-- ═══ HEADER ═══ -->
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h1 class="mb-0">
                <font-awesome-icon icon="cube" /> {{ t.title }}
            </h1>
            <div class="lang-toggle">
                <button class="lang-btn" :class="{ active: lang === 'fr' }" @click="setLang('fr')" title="Français">
                    🇫🇷
                </button>
                <button class="lang-btn" :class="{ active: lang === 'en' }" @click="setLang('en')" title="English">
                    🇬🇧
                </button>
            </div>
        </div>

        <div class="shadow-box shadow-box-settings">

            <!-- ═══ TAB BAR ═══ -->
            <ul class="nav nav-pills mb-4">
                <li class="nav-item">
                    <button class="nav-link" :class="{ active: tab === 'images' }" @click="tab = 'images'">
                        <font-awesome-icon icon="images" class="me-1" />{{ t.tab.images }}
                        <span v-if="!loadingImages" class="ms-1 badge rounded-pill"
                            :class="imgBadgeClass">{{ images.length }}</span>
                    </button>
                </li>
                <li class="nav-item">
                    <button class="nav-link" :class="{ active: tab === 'volumes' }" @click="tab = 'volumes'">
                        <font-awesome-icon icon="database" class="me-1" />{{ t.tab.volumes }}
                        <span v-if="!loadingVolumes" class="ms-1 badge rounded-pill"
                            :class="volBadgeClass">{{ volumes.length }}</span>
                    </button>
                </li>
                <li class="nav-item">
                    <button class="nav-link" :class="{ active: tab === 'containers' }" @click="tab = 'containers'">
                        <font-awesome-icon icon="layer-group" class="me-1" />{{ t.tab.containers }}
                        <span v-if="!loadingContainers" class="ms-1 badge rounded-pill"
                            :class="ctrBadgeClass">{{ containers.length }}</span>
                    </button>
                </li>
            </ul>

            <!-- ═══ TAB: IMAGES ═══ -->
            <div v-show="tab === 'images'">

                <!-- Barre d'actions + stats -->
                <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
                    <button class="btn btn-normal btn-sm" @click="loadImages" :disabled="loadingImages">
                        <span v-if="loadingImages" class="spinner-border spinner-border-sm me-1" />
                        <font-awesome-icon v-else icon="arrows-rotate" class="me-1" />{{ t.images.refresh }}
                    </button>
                    <button class="btn btn-outline-danger btn-sm" @click="pruneImages" :disabled="pruningImages">
                        <span v-if="pruningImages" class="spinner-border spinner-border-sm me-1" />
                        <font-awesome-icon v-else icon="trash" class="me-1" />{{ t.images.pruneBtn }}
                    </button>
                    <button v-if="someImagesSelected" class="btn btn-danger btn-sm"
                        @click="deleteSelectedImages">
                        <font-awesome-icon icon="trash" class="me-1" />{{ t.images.deleteSelected }}
                        <span class="badge bg-white text-danger ms-1">{{ selectedImages.size }}</span>
                    </button>
                    <div v-if="!loadingImages" class="ms-auto text-muted small">
                        <span class="me-3">{{ images.length }} {{ t.images.total }}</span>
                        <span v-if="unusedImagesCount > 0" class="me-2 text-secondary">
                            {{ unusedImagesCount }} {{ t.images.unused }}
                        </span>
                        <span v-if="danglingCount > 0" class="text-danger">
                            {{ danglingCount }} {{ t.images.dangling }}
                        </span>
                    </div>
                </div>

                <!-- Loading / Error -->
                <div v-if="loadingImages" class="text-center py-4 text-muted">
                    <span class="spinner-border spinner-border-sm me-2" />{{ t.loading }}
                </div>
                <div v-else-if="imageError" class="alert alert-danger py-2">
                    <font-awesome-icon icon="exclamation-triangle" class="me-1" />{{ imageError }}
                </div>

                <!-- Table images -->
                <div v-else-if="images.length > 0" class="table-responsive">
                    <table class="table resources-table">
                        <thead>
                            <tr>
                                <th style="width:36px">
                                    <input type="checkbox"
                                        class="form-check-input"
                                        :checked="allDeletableSelected"
                                        :indeterminate.prop="someImagesSelected && !allDeletableSelected"
                                        @change="toggleSelectAllImages"
                                        title="Tout sélectionner / désélectionner"
                                    />
                                </th>
                                <th>{{ t.images.cols.image }}</th>
                                <th>{{ t.images.cols.size }}</th>
                                <th>{{ t.images.cols.created }}</th>
                                <th>{{ t.images.cols.status }}</th>
                                <th>{{ t.images.cols.containers }}</th>
                                <th class="text-end">{{ t.images.cols.action }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="img in images" :key="img.id"
                                :class="rowClass(img.status, img.dockgeStacks)">
                                <td>
                                    <input v-if="img.status !== 'running'"
                                        type="checkbox"
                                        class="form-check-input"
                                        :checked="selectedImages.has(imgKey(img))"
                                        @change="toggleSelectImage(img)"
                                    />
                                </td>
                                <td>
                                    <div class="fw-semibold font-monospace small">
                                        <span v-if="img.repository !== '<none>'">
                                            {{ img.repository }}<span class="text-muted">:{{ img.tag }}</span>
                                        </span>
                                        <span v-else>
                                            <span class="text-muted fst-italic">{{ img.id }}</span>
                                            <span class="ms-2 badge bg-secondary" style="font-family:sans-serif;font-size:.65rem;font-style:normal">ancienne image</span>
                                        </span>
                                    </div>
                                </td>
                                <td class="small text-muted align-middle">{{ img.size }}</td>
                                <td class="small text-muted align-middle">{{ img.createdSince }}</td>
                                <td class="align-middle">
                                    <span class="badge" :class="statusBadge(img.status)">
                                        {{ t.images.status[img.status] ?? img.status }}
                                    </span>
                                </td>
                                <td class="align-middle">
                                    <div v-if="img.containers.length === 0" class="text-muted small">—</div>
                                    <div v-else>
                                        <span v-for="c in img.containers.slice(0, 3)" :key="c.id"
                                            class="badge me-1 mb-1"
                                            :class="c.stackName ? 'badge-stack' : 'bg-secondary'">
                                            <font-awesome-icon v-if="c.stackName" icon="layer-group" class="me-1" />
                                            {{ c.stackName ? `${c.stackName}/${c.service ?? c.name}` : c.name }}
                                        </span>
                                        <span v-if="img.containers.length > 3" class="text-muted small">
                                            +{{ img.containers.length - 3 }}
                                        </span>
                                    </div>
                                </td>
                                <td class="align-middle text-end">
                                    <button v-if="img.status !== 'running'"
                                        class="btn btn-sm"
                                        :class="img.status === 'stopped' ? 'btn-warning' : 'btn-outline-danger'"
                                        @click="askDeleteImage(img)">
                                        <font-awesome-icon icon="trash" />
                                    </button>
                                    <span v-else class="text-muted small">—</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div v-else class="text-center text-muted py-4">{{ t.images.noImages }}</div>
            </div>

            <!-- ═══ TAB: VOLUMES ═══ -->
            <div v-show="tab === 'volumes'">

                <!-- Barre d'actions + stats -->
                <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
                    <button class="btn btn-normal btn-sm" @click="loadVolumes" :disabled="loadingVolumes">
                        <span v-if="loadingVolumes" class="spinner-border spinner-border-sm me-1" />
                        <font-awesome-icon v-else icon="arrows-rotate" class="me-1" />{{ t.volumes.refresh }}
                    </button>
                    <button class="btn btn-outline-danger btn-sm" @click="pruneVolumes" :disabled="pruningVolumes">
                        <span v-if="pruningVolumes" class="spinner-border spinner-border-sm me-1" />
                        <font-awesome-icon v-else icon="trash" class="me-1" />{{ t.volumes.pruneBtn }}
                    </button>
                    <div v-if="!loadingVolumes" class="ms-auto text-muted small">
                        <span class="me-3">{{ volumes.length }} {{ t.volumes.total }}</span>
                        <span v-if="unusedVolumesCount > 0" class="text-secondary">
                            {{ unusedVolumesCount }} {{ t.volumes.unused }}
                        </span>
                    </div>
                </div>

                <!-- Loading / Error -->
                <div v-if="loadingVolumes" class="text-center py-4 text-muted">
                    <span class="spinner-border spinner-border-sm me-2" />{{ t.loading }}
                </div>
                <div v-else-if="volumeError" class="alert alert-danger py-2">
                    <font-awesome-icon icon="exclamation-triangle" class="me-1" />{{ volumeError }}
                </div>

                <!-- Table volumes -->
                <div v-else-if="volumes.length > 0" class="table-responsive">
                    <table class="table resources-table">
                        <thead>
                            <tr>
                                <th>{{ t.volumes.cols.name }}</th>
                                <th>{{ t.volumes.cols.driver }}</th>
                                <th>{{ t.volumes.cols.status }}</th>
                                <th>{{ t.volumes.cols.containers }}</th>
                                <th class="text-end">{{ t.volumes.cols.action }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="vol in volumes" :key="vol.name"
                                :class="rowClass(vol.status, vol.dockgeStacks)">
                                <td>
                                    <div class="fw-semibold font-monospace small">{{ vol.name }}</div>
                                    <div v-if="vol.dockgeStacks.length > 0" class="small text-warning-emphasis">
                                        <font-awesome-icon icon="exclamation-triangle" class="me-1" />
                                        {{ t.dockge }}: {{ vol.dockgeStacks.join(", ") }}
                                    </div>
                                </td>
                                <td class="small text-muted align-middle">{{ vol.driver }}</td>
                                <td class="align-middle">
                                    <span class="badge" :class="statusBadge(vol.status)">
                                        {{ t.volumes.status[vol.status] ?? vol.status }}
                                    </span>
                                </td>
                                <td class="align-middle">
                                    <div v-if="vol.containers.length === 0" class="text-muted small">—</div>
                                    <div v-else>
                                        <span v-for="c in vol.containers.slice(0, 3)" :key="c.id"
                                            class="badge me-1 mb-1"
                                            :class="c.stackName ? 'badge-stack' : 'bg-secondary'">
                                            <font-awesome-icon v-if="c.stackName" icon="layer-group" class="me-1" />
                                            {{ c.stackName ? `${c.stackName}/${c.service ?? c.name}` : c.name }}
                                        </span>
                                        <span v-if="vol.containers.length > 3" class="text-muted small">
                                            +{{ vol.containers.length - 3 }}
                                        </span>
                                    </div>
                                </td>
                                <td class="align-middle text-end">
                                    <button v-if="vol.status !== 'running'"
                                        class="btn btn-sm"
                                        :class="vol.status === 'stopped' ? 'btn-warning' : 'btn-outline-danger'"
                                        @click="askDeleteVolume(vol)">
                                        <font-awesome-icon icon="trash" />
                                    </button>
                                    <span v-else class="text-muted small">—</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div v-else class="text-center text-muted py-4">{{ t.volumes.noVolumes }}</div>
            </div>

            <!-- ═══ TAB: CONTAINERS ═══ -->
            <div v-show="tab === 'containers'">

                <!-- Barre d'actions + stats -->
                <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
                    <button class="btn btn-normal btn-sm" @click="loadContainers" :disabled="loadingContainers">
                        <span v-if="loadingContainers" class="spinner-border spinner-border-sm me-1" />
                        <font-awesome-icon v-else icon="arrows-rotate" class="me-1" />{{ t.containers.refresh }}
                    </button>
                    <div v-if="!loadingContainers" class="ms-auto text-muted small">
                        <span class="me-3">{{ containers.length }} {{ t.containers.total }}</span>
                        <span v-if="orphanCount > 0" class="text-warning">
                            {{ orphanCount }} {{ t.containers.orphan }}
                        </span>
                    </div>
                </div>

                <!-- Info -->
                <div v-if="!loadingContainers && orphanCount > 0" class="alert alert-warning py-2 small mb-3">
                    <font-awesome-icon icon="exclamation-triangle" class="me-1" />
                    {{ t.containers.orphanHint }}
                </div>

                <!-- Loading / Error -->
                <div v-if="loadingContainers" class="text-center py-4 text-muted">
                    <span class="spinner-border spinner-border-sm me-2" />{{ t.loading }}
                </div>
                <div v-else-if="containerError" class="alert alert-danger py-2">
                    <font-awesome-icon icon="exclamation-triangle" class="me-1" />{{ containerError }}
                </div>

                <!-- Table containers -->
                <div v-else-if="containers.length > 0" class="table-responsive">
                    <table class="table resources-table">
                        <thead>
                            <tr>
                                <th>{{ t.containers.cols.name }}</th>
                                <th>{{ t.containers.cols.image }}</th>
                                <th>{{ t.containers.cols.status }}</th>
                                <th class="text-end">{{ t.containers.cols.action }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="ctr in containers" :key="ctr.id"
                                :class="ctr.state === 'running' ? 'row-orphan-running' : 'row-stopped'">
                                <td>
                                    <div class="fw-semibold font-monospace small">{{ ctr.name || ctr.id }}</div>
                                    <div class="text-muted" style="font-size:.7rem">{{ ctr.id }}</div>
                                </td>
                                <td class="small text-muted align-middle">{{ ctr.image }}</td>
                                <td class="align-middle">
                                    <span class="badge" :class="statusBadge(ctr.state)">
                                        {{ t.containers.state[ctr.state] ?? ctr.status }}
                                    </span>
                                </td>
                                <td class="align-middle text-end">
                                    <div class="d-flex gap-1 justify-content-end">
                                        <button v-if="ctr.state === 'running'"
                                            class="btn btn-sm btn-warning"
                                            :disabled="stoppingContainer === ctr.id"
                                            @click="stopContainer(ctr)">
                                            <span v-if="stoppingContainer === ctr.id" class="spinner-border spinner-border-sm" />
                                            <font-awesome-icon v-else icon="stop" />
                                        </button>
                                        <button v-if="ctr.state !== 'running'"
                                            class="btn btn-sm btn-outline-danger"
                                            @click="askDeleteContainer(ctr)">
                                            <font-awesome-icon icon="trash" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div v-else class="text-center text-muted py-4">{{ t.containers.noContainers }}</div>
            </div>

        </div><!-- /shadow-box -->

        <!-- ═══ MODALE CONFIRM 1 ═══ -->
        <div v-if="confirmStep >= 1" class="modal-overlay" @click.self="cancelDelete">
            <div class="modal-card shadow-box">
                <h5 class="mb-3">
                    <font-awesome-icon icon="exclamation-triangle" class="text-warning me-2" />
                    {{ t.confirm1Title }}
                </h5>
                <p class="mb-2">
                    {{ t.confirm1Body }}
                    <strong class="font-monospace">{{ pendingItem?.label }}</strong>
                </p>
                <div v-if="pendingItem?.status === 'stopped' || pendingItem?.status === 'exited'" class="alert alert-warning py-2 small mb-3">
                    <font-awesome-icon icon="exclamation-triangle" class="me-1" />
                    {{ pendingItem?.type === 'image' ? t.images.confirm1Warning : pendingItem?.type === 'volume' ? t.volumes.confirm1Warning : t.containers.confirm1Warning }}
                    <div v-if="pendingItem?.dockgeStacks?.length > 0" class="mt-1">
                        <strong>{{ t.stack }}:</strong> {{ pendingItem.dockgeStacks.join(", ") }}
                    </div>
                </div>
                <div class="d-flex gap-2 justify-content-end">
                    <button class="btn btn-sm btn-normal" @click="cancelDelete">{{ t.cancelBtn }}</button>
                    <button class="btn btn-sm btn-warning" @click="confirmStep1">{{ t.confirmBtn }}</button>
                </div>
            </div>
        </div>

        <!-- ═══ MODALE CONFIRM 2 (double confirmation) ═══ -->
        <div v-if="confirmStep === 2" class="modal-overlay" @click.self="cancelDelete">
            <div class="modal-card shadow-box">
                <h5 class="mb-3 text-danger">
                    <font-awesome-icon icon="exclamation-triangle" class="me-2" />
                    {{ t.confirm2Title }}
                </h5>
                <p class="mb-3">
                    {{ pendingItem?.type === 'image' ? t.images.confirm2Body : pendingItem?.type === 'volume' ? t.volumes.confirm2Body : t.containers.confirm2Body }}
                </p>
                <div class="d-flex gap-2 justify-content-end">
                    <button class="btn btn-sm btn-normal" @click="cancelDelete">{{ t.cancelBtn }}</button>
                    <button class="btn btn-sm btn-danger" @click="executeDelete">{{ t.confirmBtn }}</button>
                </div>
            </div>
        </div>

        <!-- ═══ TOAST ═══ -->
        <transition name="slide-fade">
            <div v-if="toast.show" class="toast-notify" :class="toast.ok ? 'toast-ok' : 'toast-err'">
                <font-awesome-icon :icon="toast.ok ? 'check-circle' : 'exclamation-circle'" class="me-2" />
                {{ toast.msg }}
            </div>
        </transition>
    </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from "vue";

// ─── Types ────────────────────────────────────────────────────────

interface ContainerRef {
    id: string;
    name: string;
    state: string;
    status: string;
    stackName?: string;
    service?: string;
}

interface DockerImage {
    id: string;
    repository: string;
    tag: string;
    size: string;
    createdSince: string;
    status: string;
    containers: ContainerRef[];
    dockgeStacks: string[];
}

interface DockerVolume {
    name: string;
    driver: string;
    mountpoint: string;
    status: string;
    containers: ContainerRef[];
    dockgeStacks: string[];
}

interface DockerContainer {
    id: string;
    name: string;
    image: string;
    state: string;
    status: string;
    createdSince: string;
    stackName?: string;
    service?: string;
}

interface PendingItem {
    type: "image" | "volume" | "container";
    label: string;
    status: string;
    dockgeStacks: string[];
    id?: string;   // image id / container id
    name?: string; // volume name
}

// ─── i18n inline ─────────────────────────────────────────────────

const i18n = {
    fr: {
        title: "Ressources Docker",
        tab: { images: "Images", volumes: "Volumes", containers: "Hors Dockge" },
        images: {
            heading: "Images Docker",
            refresh: "Rafraîchir",
            pruneBtn: "Purger les images orphelines",
            pruneConfirm: "Supprimer toutes les images orphelines (sans tag) ? Note : des couches intermédiaires non listées seront également supprimées.",
            total: "images",
            unused: "inutilisées",
            dangling: "orphelines",
            cols: { image: "Image", size: "Taille", created: "Construit", status: "Utilisation", containers: "Conteneurs", action: "" },
            status: { running: "En cours", stopped: "Arrêtée", unused: "Inutilisée", dangling: "Orpheline (sans tag)" } as Record<string, string>,
            confirm1Warning: "Cette image est utilisée par des conteneurs arrêtés.",
            confirm2Body: "⚠️ Suppression irréversible. Les données liées pourraient être perdues.",
            noImages: "Aucune image trouvée.",
            deleteSelected: "Supprimer la sélection",
            deleteSelectedConfirm: (n: number) => `Supprimer ${n} image(s) sélectionnée(s) ?`,
        },
        volumes: {
            heading: "Volumes Docker",
            refresh: "Rafraîchir",
            pruneBtn: "Supprimer les inutilisés",
            pruneConfirm: "Supprimer tous les volumes non utilisés par un conteneur actif ?",
            total: "volumes",
            unused: "inutilisés",
            cols: { name: "Nom", driver: "Driver", status: "Statut", containers: "Conteneurs", action: "" },
            status: { running: "En cours", stopped: "Arrêté", unused: "Inutilisé" } as Record<string, string>,
            confirm1Warning: "Ce volume est référencé par des conteneurs arrêtés.",
            confirm2Body: "⚠️ Suppression irréversible. Toutes les données du volume seront définitivement perdues.",
            noVolumes: "Aucun volume trouvé.",
        },
        containers: {
            refresh: "Rafraîchir",
            total: "conteneurs",
            orphan: "hors Dockge",
            orphanHint: "Ces conteneurs fonctionnent en dehors de Dockge. Arrêtez-les puis supprimez-les pour libérer les ressources.",
            noStack: "Hors Dockge",
            noContainers: "Aucun conteneur trouvé.",
            cols: { name: "Nom", image: "Image", status: "État", stack: "Stack", action: "" },
            state: { running: "En cours", exited: "Arrêté", created: "Créé", paused: "Pausé", restarting: "Redémarrage", removing: "Suppression", dead: "Mort" } as Record<string, string>,
            confirm1Warning: "Ce conteneur sera définitivement supprimé.",
            confirm2Body: "⚠️ Suppression irréversible du conteneur.",
        },
        confirm1Title: "Confirmer la suppression",
        confirm1Body: "Supprimer :",
        confirm2Title: "Confirmation finale",
        confirmBtn: "Oui, supprimer",
        cancelBtn: "Annuler",
        loading: "Chargement...",
        errorLoad: "Erreur de chargement.",
        stack: "Stack Dockge",
        dockge: "Stack Dockge",
    },
    en: {
        title: "Docker Resources",
        tab: { images: "Images", volumes: "Volumes", containers: "Unmanaged" },
        images: {
            heading: "Docker Images",
            refresh: "Refresh",
            pruneBtn: "Remove dangling",
            pruneConfirm: "Remove all untagged (dangling) images? Note: unlisted intermediate layers will also be removed.",
            total: "images",
            unused: "unused",
            dangling: "dangling",
            cols: { image: "Image", size: "Size", created: "Built", status: "Usage", containers: "Containers", action: "" },
            status: { running: "Running", stopped: "Stopped", unused: "Unused", dangling: "Dangling (untagged)" } as Record<string, string>,
            confirm1Warning: "This image is used by stopped containers.",
            confirm2Body: "⚠️ This action is irreversible. Related data may be lost.",
            noImages: "No images found.",
            deleteSelected: "Delete selected",
            deleteSelectedConfirm: (n: number) => `Delete ${n} selected image(s)?`,
        },
        volumes: {
            heading: "Docker Volumes",
            refresh: "Refresh",
            pruneBtn: "Remove unused",
            pruneConfirm: "Remove all volumes not used by a running container?",
            total: "volumes",
            unused: "unused",
            cols: { name: "Name", driver: "Driver", status: "Status", containers: "Containers", action: "" },
            status: { running: "Running", stopped: "Stopped", unused: "Unused" } as Record<string, string>,
            confirm1Warning: "This volume is referenced by stopped containers.",
            confirm2Body: "⚠️ This action is irreversible. All volume data will be permanently lost.",
            noVolumes: "No volumes found.",
        },
        containers: {
            refresh: "Refresh",
            total: "containers",
            orphan: "outside Dockge",
            orphanHint: "These containers run outside of Dockge. Stop them then delete to free resources.",
            noStack: "Outside Dockge",
            noContainers: "No containers found.",
            cols: { name: "Name", image: "Image", status: "State", stack: "Stack", action: "" },
            state: { running: "Running", exited: "Stopped", created: "Created", paused: "Paused", restarting: "Restarting", removing: "Removing", dead: "Dead" } as Record<string, string>,
            confirm1Warning: "This container will be permanently deleted.",
            confirm2Body: "⚠️ This action is irreversible.",
        },
        confirm1Title: "Confirm deletion",
        confirm1Body: "Delete:",
        confirm2Title: "Final confirmation",
        confirmBtn: "Yes, delete",
        cancelBtn: "Cancel",
        loading: "Loading...",
        errorLoad: "Error loading data.",
        stack: "Dockge Stack",
        dockge: "Dockge Stack",
    },
};

// ─── State ────────────────────────────────────────────────────────

const lang = ref<"fr" | "en">("fr");
const tab = ref<"images" | "volumes" | "containers">("images");

const images = ref<DockerImage[]>([]);
const volumes = ref<DockerVolume[]>([]);
const containers = ref<DockerContainer[]>([]);
const loadingImages = ref(false);
const loadingVolumes = ref(false);
const loadingContainers = ref(false);
const pruningImages = ref(false);
const pruningVolumes = ref(false);
const imageError = ref("");
const volumeError = ref("");
const containerError = ref("");
const stoppingContainer = ref<string | null>(null);

const confirmStep = ref(0); // 0 = rien, 1 = première modale, 2 = deuxième modale
const pendingItem = ref<PendingItem | null>(null);

const selectedImages = ref<Set<string>>(new Set());

const toast = ref({ show: false, ok: true, msg: "" });
let toastTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Computed ─────────────────────────────────────────────────────

const t = computed(() => i18n[lang.value]);

const unusedImagesCount = computed(() =>
    images.value.filter(i => i.status === "unused" || i.status === "dangling").length);

// ─── Sélection multiple images ────────────────────────────────────

function imgKey(img: DockerImage): string {
    return img.repository !== "<none>" ? `${img.repository}:${img.tag}` : img.id;
}

const deletableImages = computed(() => images.value.filter(i => i.status !== "running"));

const allDeletableSelected = computed(() =>
    deletableImages.value.length > 0 &&
    deletableImages.value.every(img => selectedImages.value.has(imgKey(img)))
);

const someImagesSelected = computed(() => selectedImages.value.size > 0);
const danglingCount = computed(() =>
    images.value.filter(i => i.status === "dangling").length);
const unusedVolumesCount = computed(() =>
    volumes.value.filter(v => v.status === "unused").length);

const imgBadgeClass = computed(() => {
    if (danglingCount.value > 0) return "bg-danger";
    if (unusedImagesCount.value > 0) return "bg-secondary";
    return "bg-success";
});
const volBadgeClass = computed(() => {
    if (unusedVolumesCount.value > 0) return "bg-secondary";
    return "bg-success";
});
const orphanCount = computed(() => containers.value.length);
const ctrBadgeClass = computed(() => {
    if (orphanCount.value > 0) return "bg-warning text-dark";
    return "bg-success";
});

// ─── Lang ─────────────────────────────────────────────────────────

function setLang(l: "fr" | "en") {
    lang.value = l;
    localStorage.setItem("dockerResourcesLang", l);
}

// ─── API ──────────────────────────────────────────────────────────

function token(): string {
    return localStorage.getItem("token") ?? "";
}

async function api(method: string, path: string, body?: unknown) {
    const res = await fetch(`/api/docker/${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token()}`,
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
}

async function loadImages() {
    loadingImages.value = true;
    imageError.value = "";
    try {
        const data = await api("GET", "images");
        if (data.ok) {
            images.value = data.images;
            selectedImages.value.clear();
        } else {
            imageError.value = data.message ?? t.value.errorLoad;
        }
    } catch {
        imageError.value = t.value.errorLoad;
    } finally {
        loadingImages.value = false;
    }
}

function toggleSelectImage(img: DockerImage) {
    const key = imgKey(img);
    const next = new Set(selectedImages.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selectedImages.value = next;
}

function toggleSelectAllImages() {
    if (allDeletableSelected.value) {
        selectedImages.value = new Set();
    } else {
        selectedImages.value = new Set(deletableImages.value.map(imgKey));
    }
}

async function deleteSelectedImages() {
    const keys = [...selectedImages.value];
    if (keys.length === 0) return;
    if (!confirm(t.value.images.deleteSelectedConfirm(keys.length))) return;

    let ok = 0, fail = 0;
    for (const key of keys) {
        const img = images.value.find(i => imgKey(i) === key);
        const force = img?.status === "stopped";
        try {
            const data = await api("DELETE", `images/${encodeURIComponent(key)}${force ? "?force=true" : ""}`);
            if (data.ok) ok++; else fail++;
        } catch { fail++; }
    }
    selectedImages.value = new Set();
    await loadImages();
    showToast(fail === 0, fail === 0
        ? `${ok} image(s) supprimée(s)`
        : `${ok} supprimée(s), ${fail} échec(s)`
    );
}

async function loadVolumes() {
    loadingVolumes.value = true;
    volumeError.value = "";
    try {
        const data = await api("GET", "volumes");
        if (data.ok) {
            volumes.value = data.volumes;
        } else {
            volumeError.value = data.message ?? t.value.errorLoad;
        }
    } catch {
        volumeError.value = t.value.errorLoad;
    } finally {
        loadingVolumes.value = false;
    }
}

async function pruneImages() {
    if (!confirm(t.value.images.pruneConfirm)) return;
    pruningImages.value = true;
    try {
        const data = await api("POST", "images/prune");
        showToast(data.ok, data.message ?? "");
        if (data.ok) await loadImages();
    } finally {
        pruningImages.value = false;
    }
}

async function pruneVolumes() {
    if (!confirm(t.value.volumes.pruneConfirm)) return;
    pruningVolumes.value = true;
    try {
        const data = await api("POST", "volumes/prune");
        showToast(data.ok, data.message ?? "");
        if (data.ok) await loadVolumes();
    } finally {
        pruningVolumes.value = false;
    }
}

async function loadContainers() {
    loadingContainers.value = true;
    containerError.value = "";
    try {
        const data = await api("GET", "containers");
        if (data.ok) {
            // On ne garde que les conteneurs hors Dockge (pas de stack compose)
            containers.value = data.containers.filter((c: DockerContainer) => !c.stackName);
        } else {
            containerError.value = data.message ?? t.value.errorLoad;
        }
    } catch {
        containerError.value = t.value.errorLoad;
    } finally {
        loadingContainers.value = false;
    }
}

async function stopContainer(ctr: DockerContainer) {
    stoppingContainer.value = ctr.id;
    try {
        const data = await api("POST", `containers/${encodeURIComponent(ctr.id)}/stop`);
        showToast(data.ok, data.message ?? "");
        if (data.ok) await loadContainers();
    } finally {
        stoppingContainer.value = null;
    }
}

function askDeleteContainer(ctr: DockerContainer) {
    pendingItem.value = {
        type: "container",
        label: ctr.name || ctr.id,
        status: ctr.state,
        dockgeStacks: ctr.stackName ? [ctr.stackName] : [],
        id: ctr.id,
    };
    confirmStep.value = 1;
}

// ─── Suppression ──────────────────────────────────────────────────

function askDeleteImage(img: DockerImage) {
    pendingItem.value = {
        type: "image",
        label: img.repository !== "<none>" ? `${img.repository}:${img.tag}` : img.id,
        status: img.status,
        dockgeStacks: img.dockgeStacks,
        id: img.id,
    };
    confirmStep.value = 1;
}

function askDeleteVolume(vol: DockerVolume) {
    pendingItem.value = {
        type: "volume",
        label: vol.name,
        status: vol.status,
        dockgeStacks: vol.dockgeStacks,
        name: vol.name,
    };
    confirmStep.value = 1;
}

function confirmStep1() {
    // Stopped → double confirmation. Autres → exécution directe.
    if (pendingItem.value?.status === "stopped") {
        confirmStep.value = 2;
    } else {
        executeDelete();
    }
}

async function executeDelete() {
    const item = pendingItem.value;
    if (!item) return;
    confirmStep.value = 0;

    try {
        let data: any;
        if (item.type === "image") {
            const force = item.status === "stopped";
            // Use repo:tag when available to avoid "referenced in multiple repositories" error
            const deleteTarget = item.label !== item.id ? (item.label ?? item.id ?? "") : (item.id ?? "");
            data = await api("DELETE", `images/${encodeURIComponent(deleteTarget)}${force ? "?force=true" : ""}`);
        } else if (item.type === "volume") {
            data = await api("DELETE", `volumes/${encodeURIComponent(item.name ?? "")}`);
        } else {
            data = await api("DELETE", `containers/${encodeURIComponent(item.id ?? "")}`);
        }
        showToast(data.ok, data.message ?? "");
        if (data.ok) {
            if (item.type === "image") await loadImages();
            else if (item.type === "volume") await loadVolumes();
            else await loadContainers();
        }
    } catch {
        showToast(false, t.value.errorLoad);
    } finally {
        pendingItem.value = null;
    }
}

function cancelDelete() {
    confirmStep.value = 0;
    pendingItem.value = null;
}

// ─── Helpers UI ───────────────────────────────────────────────────

function statusBadge(status: string): string {
    switch (status) {
        case "running": return "bg-success";
        case "stopped": return "bg-warning text-dark";
        case "dangling": return "bg-danger";
        default: return "bg-secondary";
    }
}

function rowClass(status: string, dockgeStacks: string[]): string {
    if (status === "stopped" && dockgeStacks.length > 0) return "row-stopped-dockge";
    if (status === "stopped") return "row-stopped";
    if (status === "dangling") return "row-dangling";
    return "";
}

function showToast(ok: boolean, msg: string) {
    if (toastTimer) clearTimeout(toastTimer);
    toast.value = { show: true, ok, msg };
    toastTimer = setTimeout(() => { toast.value.show = false; }, 4000);
}

// ─── Lifecycle ────────────────────────────────────────────────────

onMounted(() => {
    const saved = localStorage.getItem("dockerResourcesLang");
    if (saved === "fr" || saved === "en") lang.value = saved;
    else {
        const appLang = localStorage.getItem("lang") ?? "fr";
        lang.value = appLang.startsWith("fr") ? "fr" : "en";
    }
    loadImages();
    loadVolumes();
    loadContainers();
});
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

// ── Lang toggle (identique à WatcherSettings) ────────────────────
.lang-toggle {
    display: flex;
    gap: 4px;
}
.lang-btn {
    background: none;
    border: 1px solid transparent;
    border-radius: 6px;
    font-size: 1.4rem;
    cursor: pointer;
    padding: 2px 6px;
    opacity: 0.45;
    transition: opacity 0.15s, border-color 0.15s;
    &:hover { opacity: 0.8; }
    &.active {
        opacity: 1;
        border-color: $primary;
    }
}

// ── Table ────────────────────────────────────────────────────────
.resources-table {
    font-size: 0.875rem;
    --bs-table-bg: transparent;
    --bs-table-color: #e5e7eb;

    th {
        font-size: 0.75rem;
        letter-spacing: .04em;
        color: #9ca3af;
        border-bottom: 1px solid rgba(255,255,255,.1);
        opacity: 1;
    }

    > :not(caption) > * > * {
        color: #e5e7eb;
        border-bottom-color: rgba(255,255,255,.06);
    }

    // Hover : fond subtil sans écraser le texte
    tbody tr:hover td {
        background-color: rgba(255, 255, 255, 0.06) !important;
        color: #e5e7eb !important;
    }

    // text-muted dans Bootstrap dark → gris quasi-noir, on force un gris lisible
    .text-muted {
        color: #9ca3af !important;
    }

    // Ligne : conteneur Dockge arrêté → orange à gauche
    .row-stopped-dockge td:first-child {
        border-left: 3px solid #f5a623;
    }
    .row-stopped td:first-child {
        border-left: 3px solid #ffc107;
    }
    .row-dangling td:first-child {
        border-left: 3px solid #dc3545;
    }
    // Ligne : conteneur orphelin en cours → rouge-orange
    .row-orphan-running td:first-child {
        border-left: 3px solid #ef4444;
    }
}

// ── Badge stack Dockge ───────────────────────────────────────────
.badge-stack {
    background-color: rgba(245, 166, 35, 0.2);
    color: #f5a623;
    border: 1px solid rgba(245, 166, 35, 0.4);
}

// ── Modales ──────────────────────────────────────────────────────
.modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
}
.modal-card {
    min-width: 340px;
    max-width: 480px;
    width: 90%;
    padding: 1.5rem;
    border-radius: 16px;
}

// ── Toast ────────────────────────────────────────────────────────
.toast-notify {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9999;
    padding: 12px 20px;
    border-radius: 10px;
    font-size: 0.9rem;
    font-weight: 500;
    color: #fff;
    box-shadow: 0 4px 20px rgba(0,0,0,.3);
    &.toast-ok  { background: #28a745; }
    &.toast-err { background: #dc3545; }
}
.slide-fade-enter-active, .slide-fade-leave-active { transition: all .3s ease; }
.slide-fade-enter-from, .slide-fade-leave-to { transform: translateY(16px); opacity: 0; }

// ── Dark mode ────────────────────────────────────────────────────
.dark {
    .resources-table {
        tr:hover td {
            background-color: rgba(255, 255, 255, 0.06) !important;
            color: #e5e7eb !important;
        }
    }
    .modal-card {
        background-color: $dark-bg;
        color: $dark-font-color;
    }
}
</style>
