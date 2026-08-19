<template>
    <div>
        <!-- ═══ HEADER ═══ -->
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h1 class="mb-0">
                <font-awesome-icon icon="cube" /> {{ $t("dockerResources.title") }}
            </h1>
        </div>

        <div class="shadow-box shadow-box-settings">

            <!-- ═══ TAB BAR ═══ -->
            <ul class="nav nav-pills mb-4">
                <li class="nav-item">
                    <button class="nav-link" :class="{ active: tab === 'images' }" @click="tab = 'images'">
                        <font-awesome-icon icon="images" class="me-1" />{{ $t("dockerResources.tab.images") }}
                        <span v-if="!loadingImages" class="ms-1 badge rounded-pill"
                            :class="imgBadgeClass">{{ images.length }}</span>
                    </button>
                </li>
                <li class="nav-item">
                    <button class="nav-link" :class="{ active: tab === 'volumes' }" @click="tab = 'volumes'">
                        <font-awesome-icon icon="database" class="me-1" />{{ $t("dockerResources.tab.volumes") }}
                        <span v-if="!loadingVolumes" class="ms-1 badge rounded-pill"
                            :class="volBadgeClass">{{ volumes.length }}</span>
                    </button>
                </li>
                <li class="nav-item">
                    <button class="nav-link" :class="{ active: tab === 'containers' }" @click="tab = 'containers'">
                        <font-awesome-icon icon="layer-group" class="me-1" />{{ $t("dockerResources.tab.containers") }}
                        <span v-if="!loadingContainers" class="ms-1 badge rounded-pill"
                            :class="ctrBadgeClass">{{ containers.length }}</span>
                    </button>
                </li>
                <li class="nav-item">
                    <button class="nav-link" :class="{ active: tab === 'networks' }" @click="tab = 'networks'">
                        <font-awesome-icon icon="diagram-project" class="me-1" />{{ $t("dockerResources.tab.networks") }}
                        <span v-if="!loadingNetworks" class="ms-1 badge rounded-pill bg-success">{{ networks.length }}</span>
                    </button>
                </li>
            </ul>

            <div class="input-group input-group-sm mb-4 resource-search">
                <span class="input-group-text">
                    <font-awesome-icon icon="search" />
                </span>
                <input
                    v-model.trim="resourceFilter"
                    class="form-control"
                    type="search"
                    :placeholder="$t('dockerResources.searchPlaceholder')"
                />
                <button
                    v-if="resourceFilter"
                    class="btn btn-outline-secondary"
                    type="button"
                    :title="$t('dockerResources.clearSearch')"
                    @click="resourceFilter = ''"
                >
                    <font-awesome-icon icon="times" />
                </button>
            </div>

            <!-- ═══ TAB: IMAGES ═══ -->
            <div v-show="tab === 'images'">

                <!-- Barre d'actions + stats -->
                <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
                    <button class="btn btn-normal btn-sm" @click="loadImages" :disabled="loadingImages">
                        <span v-if="loadingImages" class="spinner-border spinner-border-sm me-1" />
                        <font-awesome-icon v-else icon="arrows-rotate" class="me-1" />{{ $t("dockerResources.images.refresh") }}
                    </button>
                    <button class="btn btn-outline-danger btn-sm" @click="pruneImages" :disabled="pruningImages">
                        <span v-if="pruningImages" class="spinner-border spinner-border-sm me-1" />
                        <font-awesome-icon v-else icon="trash" class="me-1" />{{ $t("dockerResources.images.pruneBtn") }}
                    </button>
                    <button class="btn btn-outline-warning btn-sm" @click="pruneUnusedImages" :disabled="pruningUnusedImages">
                        <span v-if="pruningUnusedImages" class="spinner-border spinner-border-sm me-1" />
                        <font-awesome-icon v-else icon="trash" class="me-1" />{{ $t("dockerResources.images.pruneUnusedBtn") }}
                    </button>
                    <button v-if="someImagesSelected" class="btn btn-danger btn-sm"
                        @click="deleteSelectedImages">
                        <font-awesome-icon icon="trash" class="me-1" />{{ $t("dockerResources.images.deleteSelected") }}
                        <span class="badge bg-white text-danger ms-1">{{ selectedImages.size }}</span>
                    </button>
                    <div v-if="!loadingImages" class="ms-auto text-muted small">
                        <span class="me-3">{{ images.length }} {{ $t("dockerResources.images.total") }}</span>
                        <span v-if="unusedImagesCount > 0" class="me-2 text-secondary">
                            {{ unusedImagesCount }} {{ $t("dockerResources.images.unused") }}
                        </span>
                        <span v-if="danglingCount > 0" class="text-danger">
                            {{ danglingCount }} {{ $t("dockerResources.images.dangling") }}
                        </span>
                    </div>
                </div>

                <!-- ── Panneau auto-prune ─────────────────────────── -->
                <div v-if="autoPruneLoaded" class="auto-prune-panel mb-3">
                    <button class="btn btn-link btn-sm p-0 text-decoration-none ap-toggle-btn"
                        @click="autoPruneOpen = !autoPruneOpen">
                        <font-awesome-icon :icon="autoPruneOpen ? 'chevron-down' : 'chevron-right'" class="me-1" />
                        {{ $t("dockerResources.autoPrune.heading") }}
                        <span v-if="autoPrune.danglingEnabled" class="badge bg-success ms-2 text-xs">
                            {{ $t("dockerResources.autoPrune.danglingHeading") }}
                        </span>
                        <span v-if="autoPrune.unusedEnabled" class="badge bg-info text-dark ms-1 text-xs">
                            {{ $t("dockerResources.autoPrune.unusedHeading") }}
                        </span>
                    </button>

                    <div v-show="autoPruneOpen" class="auto-prune-body mt-2 p-3">
                        <div class="auto-prune-sections">

                            <!-- ── Section 1 : Orphelines (dangling) ──────── -->
                            <div class="auto-prune-section">
                                <div class="auto-prune-section-title">{{ $t("dockerResources.autoPrune.danglingHeading") }}</div>

                                <div class="form-check form-switch mb-2">
                                    <input class="form-check-input" type="checkbox" id="danglingToggle"
                                        v-model="autoPrune.danglingEnabled" @change="saveAutoPrune">
                                    <label class="form-check-label ap-label" for="danglingToggle">
                                        {{ $t("dockerResources.autoPrune.enable") }}
                                    </label>
                                </div>

                                <div v-if="autoPrune.danglingEnabled" class="d-flex flex-wrap align-items-center gap-2 mb-2">
                                    <select class="form-select form-select-sm ap-select"
                                        v-model.number="autoPrune.danglingIntervalHours" @change="saveAutoPrune"
                                        :disabled="savingPrune">
                                        <option :value="24">{{ $t("dockerResources.autoPrune.intervals.24") }}</option>
                                        <option :value="48">{{ $t("dockerResources.autoPrune.intervals.48") }}</option>
                                        <option :value="168">{{ $t("dockerResources.autoPrune.intervals.168") }}</option>
                                    </select>
                                    <button class="btn btn-outline-secondary btn-sm"
                                        @click="runDanglingPruneNow" :disabled="runningDanglingPrune">
                                        <span v-if="runningDanglingPrune" class="spinner-border spinner-border-sm me-1" />
                                        <font-awesome-icon v-else icon="play" class="me-1" />
                                        {{ runningDanglingPrune ? $t("dockerResources.autoPrune.running") : $t("dockerResources.autoPrune.runNow") }}
                                    </button>
                                </div>

                                <div v-if="autoPrune.danglingEnabled" class="ap-meta">
                                    <div>{{ $t("dockerResources.autoPrune.lastRun") }} :
                                        <strong>{{ fmtDate(autoPrune.lastDanglingRun) }}</strong>
                                        <span v-if="autoPrune.lastDanglingResult" class="ms-1">({{ autoPrune.lastDanglingResult }})</span>
                                    </div>
                                    <div>{{ $t("dockerResources.autoPrune.nextRun") }} :
                                        <strong>{{ fmtDate(autoPrune.nextDanglingRun) }}</strong>
                                    </div>
                                </div>
                            </div>

                            <!-- ── Section 2 : Inutilisées (unused tagged) ── -->
                            <div class="auto-prune-section">
                                <div class="auto-prune-section-title">{{ $t("dockerResources.autoPrune.unusedHeading") }}</div>

                                <div class="form-check form-switch mb-2">
                                    <input class="form-check-input" type="checkbox" id="unusedToggle"
                                        v-model="autoPrune.unusedEnabled" @change="saveAutoPrune">
                                    <label class="form-check-label ap-label" for="unusedToggle">
                                        {{ $t("dockerResources.autoPrune.enable") }}
                                    </label>
                                </div>

                                <div v-if="autoPrune.unusedEnabled" class="d-flex flex-wrap align-items-center gap-2 mb-2">
                                    <select class="form-select form-select-sm ap-select"
                                        v-model.number="autoPrune.unusedIntervalHours" @change="saveAutoPrune"
                                        :disabled="savingPrune">
                                        <option :value="24">{{ $t("dockerResources.autoPrune.intervals.24") }}</option>
                                        <option :value="48">{{ $t("dockerResources.autoPrune.intervals.48") }}</option>
                                        <option :value="168">{{ $t("dockerResources.autoPrune.intervals.168") }}</option>
                                    </select>
                                    <button class="btn btn-outline-secondary btn-sm"
                                        @click="runUnusedPruneNow" :disabled="runningUnusedPrune">
                                        <span v-if="runningUnusedPrune" class="spinner-border spinner-border-sm me-1" />
                                        <font-awesome-icon v-else icon="play" class="me-1" />
                                        {{ runningUnusedPrune ? $t("dockerResources.autoPrune.running") : $t("dockerResources.autoPrune.runNow") }}
                                    </button>
                                </div>

                                <div v-if="autoPrune.unusedEnabled" class="ap-meta mb-3">
                                    <div>{{ $t("dockerResources.autoPrune.lastRun") }} :
                                        <strong>{{ fmtDate(autoPrune.lastUnusedRun) }}</strong>
                                        <span v-if="autoPrune.lastUnusedResult" class="ms-1">({{ autoPrune.lastUnusedResult }})</span>
                                    </div>
                                    <div>{{ $t("dockerResources.autoPrune.nextRun") }} :
                                        <strong>{{ fmtDate(autoPrune.nextUnusedRun) }}</strong>
                                    </div>
                                </div>

                                <!-- Exclusions -->
                                <div class="ap-exclusions">
                                    <div class="ap-exclusions-label">
                                        {{ $t("dockerResources.autoPrune.exclusions") }}
                                        <span v-if="autoPrune.unusedExclusions.length > 0"
                                            class="badge bg-secondary ms-1">{{ autoPrune.unusedExclusions.length }}</span>
                                    </div>
                                    <p v-if="autoPrune.unusedExclusions.length === 0" class="fst-italic ap-meta mb-1">
                                        {{ $t("dockerResources.autoPrune.noExclusions") }}
                                    </p>
                                    <div v-else class="d-flex flex-wrap gap-2 mb-2">
                                        <span v-for="ex in autoPrune.unusedExclusions" :key="ex"
                                            class="badge ap-exclusion-badge d-flex align-items-center gap-1">
                                            <code class="ap-exclusion-code">{{ ex }}</code>
                                            <button class="btn-close btn-close-white"
                                                style="font-size:.5rem"
                                                :title="$t('dockerResources.autoPrune.removeExclusion')"
                                                @click="removeUnusedExclusion(ex)" />
                                        </span>
                                    </div>
                                    <p class="ap-hint mb-0">
                                        <font-awesome-icon icon="circle-info" class="me-1" />{{ $t("dockerResources.autoPrune.excludeHint") }}
                                    </p>
                                </div>
                            </div>

                        </div><!-- /auto-prune-sections -->
                    </div>
                </div>

                <!-- Loading / Error -->
                <div v-if="loadingImages" class="text-center py-4 text-muted">
                    <span class="spinner-border spinner-border-sm me-2" />{{ $t("dockerResources.loading") }}
                </div>
                <div v-else-if="imageError" class="alert alert-danger py-2">
                    <font-awesome-icon icon="exclamation-triangle" class="me-1" />{{ imageError }}
                </div>

                <!-- Table images -->
                <div v-else-if="filteredImages.length > 0" class="table-responsive">
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
                                <th>{{ $t("dockerResources.images.cols.image") }}</th>
                                <th class="th-sortable" @click="toggleImgSizeSort" style="cursor:pointer;user-select:none;white-space:nowrap">
                                    {{ $t("dockerResources.images.cols.size") }}
                                    <span class="sort-indicator">
                                        <span :style="{ opacity: imgSizeSort === 'desc' ? 1 : 0.25 }">▼</span>
                                        <span :style="{ opacity: imgSizeSort === 'asc'  ? 1 : 0.25 }">▲</span>
                                    </span>
                                </th>
                                <th>{{ $t("dockerResources.images.cols.created") }}</th>
                                <th>{{ $t("dockerResources.images.cols.status") }}</th>
                                <th>{{ $t("dockerResources.images.cols.containers") }}</th>
                                <th class="text-end">{{ $t("dockerResources.images.cols.action") }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="img in sortedImages" :key="img.id"
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
                                            <span class="ms-2 badge bg-secondary old-image-badge">ancienne image</span>
                                        </span>
                                    </div>
                                </td>
                                <td class="small text-muted align-middle">{{ img.size }}</td>
                                <td class="small text-muted align-middle">{{ img.createdSince }}</td>
                                <td class="align-middle">
                                    <span class="badge" :class="statusBadge(img.status)">
                                        {{ tr("dockerResources.images.status." + img.status, img.status) }}
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
                                    <div class="d-flex justify-content-end gap-1">
                                        <!-- Bouton exclure de l'auto-prune (images inutilisées taguées uniquement) -->
                                        <button v-if="img.status === 'unused' && autoPruneLoaded"
                                            class="btn btn-sm"
                                            :class="isExcludedFromUnusedPrune(img) ? 'btn-secondary' : 'btn-outline-secondary'"
                                            :title="isExcludedFromUnusedPrune(img) ? $t('dockerResources.autoPrune.removeExclusion') : $t('dockerResources.autoPrune.excludeBtn')"
                                            @click="isExcludedFromUnusedPrune(img)
                                                ? removeUnusedExclusion(`${img.repository}:${img.tag}`)
                                                : addUnusedExclusion(`${img.repository}:${img.tag}`)">
                                            <font-awesome-icon :icon="isExcludedFromUnusedPrune(img) ? 'eye' : 'ban'" />
                                        </button>
                                        <!-- Bouton supprimer -->
                                        <button v-if="img.status !== 'running'"
                                            class="btn btn-sm"
                                            :class="img.status === 'stopped' ? 'btn-warning' : 'btn-outline-danger'"
                                            @click="askDeleteImage(img)">
                                            <font-awesome-icon icon="trash" />
                                        </button>
                                        <span v-else class="text-muted small">—</span>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div v-else class="text-center text-muted py-4">
                    {{ resourceFilter ? $t("dockerResources.noSearchMatch") : $t("dockerResources.images.noImages") }}
                </div>
            </div>

            <!-- ═══ TAB: VOLUMES ═══ -->
            <div v-show="tab === 'volumes'">

                <!-- Barre d'actions + stats -->
                <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
                    <button class="btn btn-normal btn-sm" @click="loadVolumes" :disabled="loadingVolumes">
                        <span v-if="loadingVolumes" class="spinner-border spinner-border-sm me-1" />
                        <font-awesome-icon v-else icon="arrows-rotate" class="me-1" />{{ $t("dockerResources.volumes.refresh") }}
                    </button>
                    <button class="btn btn-outline-danger btn-sm" @click="pruneVolumes" :disabled="pruningVolumes">
                        <span v-if="pruningVolumes" class="spinner-border spinner-border-sm me-1" />
                        <font-awesome-icon v-else icon="trash" class="me-1" />{{ $t("dockerResources.volumes.pruneBtn") }}
                    </button>
                    <div v-if="!loadingVolumes" class="ms-auto text-muted small">
                        <span class="me-3">{{ volumes.length }} {{ $t("dockerResources.volumes.total") }}</span>
                        <span v-if="unusedVolumesCount > 0" class="text-secondary">
                            {{ unusedVolumesCount }} {{ $t("dockerResources.volumes.unused") }}
                        </span>
                    </div>
                </div>

                <!-- Loading / Error -->
                <div v-if="loadingVolumes" class="text-center py-4 text-muted">
                    <span class="spinner-border spinner-border-sm me-2" />{{ $t("dockerResources.loading") }}
                </div>
                <div v-else-if="volumeError" class="alert alert-danger py-2">
                    <font-awesome-icon icon="exclamation-triangle" class="me-1" />{{ volumeError }}
                </div>

                <!-- Table volumes -->
                <div v-else-if="filteredVolumes.length > 0" class="table-responsive">
                    <table class="table resources-table">
                        <thead>
                            <tr>
                                <th>{{ $t("dockerResources.volumes.cols.name") }}</th>
                                <th>{{ $t("dockerResources.volumes.cols.driver") }}</th>
                                <th>{{ $t("dockerResources.volumes.cols.status") }}</th>
                                <th>{{ $t("dockerResources.volumes.cols.containers") }}</th>
                                <th class="text-end">{{ $t("dockerResources.volumes.cols.action") }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="vol in filteredVolumes" :key="vol.name"
                                :class="rowClass(vol.status, vol.dockgeStacks)">
                                <td>
                                    <div class="fw-semibold font-monospace small">{{ vol.name }}</div>
                                    <div v-if="vol.dockgeStacks.length > 0" class="small text-warning-emphasis">
                                        <font-awesome-icon icon="exclamation-triangle" class="me-1" />
                                        {{ $t("dockerResources.dockge") }}: {{ vol.dockgeStacks.join(", ") }}
                                    </div>
                                </td>
                                <td class="small text-muted align-middle">{{ vol.driver }}</td>
                                <td class="align-middle">
                                    <span class="badge" :class="statusBadge(vol.status)">
                                        {{ tr("dockerResources.volumes.status." + vol.status, vol.status) }}
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
                <div v-else class="text-center text-muted py-4">
                    {{ resourceFilter ? $t("dockerResources.noSearchMatch") : $t("dockerResources.volumes.noVolumes") }}
                </div>
            </div>

            <!-- ═══ TAB: CONTAINERS ═══ -->
            <div v-show="tab === 'containers'">

                <!-- Barre d'actions + stats -->
                <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
                    <button class="btn btn-normal btn-sm" @click="loadContainers" :disabled="loadingContainers">
                        <span v-if="loadingContainers" class="spinner-border spinner-border-sm me-1" />
                        <font-awesome-icon v-else icon="arrows-rotate" class="me-1" />{{ $t("dockerResources.containers.refresh") }}
                    </button>
                    <div v-if="!loadingContainers" class="ms-auto text-muted small">
                        <span class="me-3">{{ containers.length }} {{ $t("dockerResources.containers.total") }}</span>
                        <span v-if="orphanCount > 0" class="text-warning">
                            {{ orphanCount }} {{ $t("dockerResources.containers.orphan") }}
                        </span>
                    </div>
                </div>

                <!-- Info -->
                <div v-if="!loadingContainers && orphanCount > 0" class="alert alert-warning py-2 small mb-3">
                    <font-awesome-icon icon="exclamation-triangle" class="me-1" />
                    {{ $t("dockerResources.containers.orphanHint") }}
                </div>

                <!-- Loading / Error -->
                <div v-if="loadingContainers" class="text-center py-4 text-muted">
                    <span class="spinner-border spinner-border-sm me-2" />{{ $t("dockerResources.loading") }}
                </div>
                <div v-else-if="containerError" class="alert alert-danger py-2">
                    <font-awesome-icon icon="exclamation-triangle" class="me-1" />{{ containerError }}
                </div>

                <!-- Table containers -->
                <div v-else-if="filteredContainers.length > 0" class="table-responsive">
                    <table class="table resources-table">
                        <thead>
                            <tr>
                                <th>{{ $t("dockerResources.containers.cols.name") }}</th>
                                <th>{{ $t("dockerResources.containers.cols.image") }}</th>
                                <th>{{ $t("dockerResources.containers.cols.status") }}</th>
                                <th class="text-end">{{ $t("dockerResources.containers.cols.action") }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="ctr in filteredContainers" :key="ctr.id"
                                :class="ctr.state === 'running' ? 'row-orphan-running' : 'row-stopped'">
                                <td>
                                    <div class="fw-semibold font-monospace small">{{ ctr.name || ctr.id }}</div>
                                    <div class="text-muted text-xs">{{ ctr.id }}</div>
                                </td>
                                <td class="small text-muted align-middle">{{ ctr.image }}</td>
                                <td class="align-middle">
                                    <span class="badge" :class="statusBadge(ctr.state)">
                                        {{ tr("dockerResources.containers.state." + ctr.state, ctr.status) }}
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
                <div v-else class="text-center text-muted py-4">
                    {{ resourceFilter ? $t("dockerResources.noSearchMatch") : $t("dockerResources.containers.noContainers") }}
                </div>
            </div>

            <!-- ═══ TAB: NETWORKS ═══ -->
            <div v-show="tab === 'networks'">
                <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
                    <button class="btn btn-normal btn-sm" :disabled="loadingNetworks" @click="loadNetworks">
                        <span v-if="loadingNetworks" class="spinner-border spinner-border-sm me-1" />
                        <font-awesome-icon v-else icon="arrows-rotate" class="me-1" />{{ $t("dockerResources.networks.refresh") }}
                    </button>
                    <button class="btn btn-primary btn-sm" @click="networkCreateOpen = !networkCreateOpen">
                        <font-awesome-icon icon="plus" class="me-1" />{{ $t("dockerResources.networks.create") }}
                    </button>
                </div>

                <form v-if="networkCreateOpen" class="row g-2 p-3 mb-3 network-create" @submit.prevent="createNetwork">
                    <div class="col-md-4">
                        <label class="form-label">{{ $t("dockerResources.networks.name") }}</label>
                        <input v-model.trim="networkForm.name" class="form-control form-control-sm" required>
                    </div>
                    <div class="col-md-2">
                        <label class="form-label">{{ $t("dockerResources.networks.driver") }}</label>
                        <select v-model="networkForm.driver" class="form-select form-select-sm">
                            <option value="bridge">bridge</option>
                            <option value="macvlan">macvlan</option>
                            <option value="ipvlan">ipvlan</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label">{{ $t("dockerResources.networks.subnet") }}</label>
                        <input v-model.trim="networkForm.subnet" class="form-control form-control-sm" placeholder="172.28.0.0/16">
                    </div>
                    <div class="col-md-3">
                        <label class="form-label">{{ $t("dockerResources.networks.gateway") }}</label>
                        <input v-model.trim="networkForm.gateway" class="form-control form-control-sm" placeholder="172.28.0.1">
                    </div>
                    <div v-if="networkForm.driver !== 'bridge'" class="col-md-4">
                        <label class="form-label">{{ $t("dockerResources.networks.parent") }}</label>
                        <input v-model.trim="networkForm.parent" class="form-control form-control-sm" placeholder="eth0">
                    </div>
                    <div class="col-md-4 d-flex align-items-end">
                        <label class="form-check mb-1">
                            <input v-model="networkForm.internal" class="form-check-input" type="checkbox">
                            <span class="form-check-label">{{ $t("dockerResources.networks.internal") }}</span>
                        </label>
                    </div>
                    <div class="col-12">
                        <button class="btn btn-sm btn-primary" :disabled="networkBusy">
                            {{ $t("dockerResources.networks.create") }}
                        </button>
                    </div>
                </form>

                <div v-if="networkError" class="alert alert-danger py-2">{{ networkError }}</div>
                <div v-else-if="loadingNetworks" class="text-center py-4 text-muted">
                    <span class="spinner-border spinner-border-sm me-2" />{{ $t("dockerResources.loading") }}
                </div>
                <div v-else-if="filteredNetworks.length > 0" class="table-responsive">
                    <table class="table resources-table">
                        <thead>
                            <tr>
                                <th>{{ $t("dockerResources.networks.name") }}</th>
                                <th>{{ $t("dockerResources.networks.driver") }}</th>
                                <th>{{ $t("dockerResources.networks.scope") }}</th>
                                <th>{{ $t("dockerResources.networks.containers") }}</th>
                                <th class="text-end" />
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="network in filteredNetworks" :key="network.id">
                                <td>
                                    <strong class="font-monospace">{{ network.name }}</strong>
                                    <div class="mt-1">
                                        <span v-if="network.dockerManaged" class="badge bg-secondary me-1">Docker</span>
                                        <span v-if="network.composeProject" class="badge badge-stack me-1">Compose: {{ network.composeProject }}</span>
                                        <span v-if="network.dockgeManaged" class="badge bg-primary">Dockge Enhanced</span>
                                        <span v-if="network.internal" class="badge bg-warning text-dark ms-1">{{ $t("dockerResources.networks.internal") }}</span>
                                    </div>
                                    <small v-if="network.ipam.length" class="text-muted">{{ network.ipam.map(item => item.Subnet).filter(Boolean).join(", ") }}</small>
                                </td>
                                <td>{{ network.driver }}</td>
                                <td>{{ network.scope }}</td>
                                <td>
                                    <div v-if="network.containers.length === 0" class="text-muted">—</div>
                                    <div v-for="container in network.containers" :key="container.id" class="d-flex align-items-center gap-2 mb-1">
                                        <span class="badge bg-secondary">{{ container.name }}</span>
                                        <small class="text-muted">{{ container.ipv4 }}</small>
                                        <button class="btn btn-sm btn-outline-warning py-0" @click="disconnectNetwork(network, container)">
                                            {{ $t("dockerResources.networks.disconnect") }}
                                        </button>
                                    </div>
                                    <div class="input-group input-group-sm mt-2">
                                        <input v-model.trim="networkConnectInputs[network.name]" class="form-control" :placeholder="$t('dockerResources.networks.containerName')">
                                        <button class="btn btn-outline-success" @click="connectNetwork(network)">
                                            {{ $t("dockerResources.networks.connect") }}
                                        </button>
                                    </div>
                                </td>
                                <td class="text-end">
                                    <button v-if="!network.dockerManaged && network.containers.length === 0" class="btn btn-sm btn-outline-danger" @click="deleteNetwork(network)">
                                        <font-awesome-icon icon="trash" />
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div v-else class="text-center text-muted py-4">
                    {{ resourceFilter ? $t("dockerResources.noSearchMatch") : $t("dockerResources.networks.empty") }}
                </div>
            </div>

        </div><!-- /shadow-box -->

        <!-- ═══ MODALE CONFIRM 1 ═══ -->
        <div v-if="confirmStep >= 1" class="modal-overlay" @click.self="cancelDelete">
            <div class="modal-card shadow-box">
                <h5 class="mb-3">
                    <font-awesome-icon icon="exclamation-triangle" class="text-warning me-2" />
                    {{ $t("dockerResources.confirm1Title") }}
                </h5>
                <p class="mb-2">
                    {{ $t("dockerResources.confirm1Body") }}
                    <strong class="font-monospace">{{ pendingItem?.label }}</strong>
                </p>
                <div v-if="pendingItem?.status === 'stopped' || pendingItem?.status === 'exited'" class="alert alert-warning py-2 small mb-3">
                    <font-awesome-icon icon="exclamation-triangle" class="me-1" />
                    {{ pendingItem?.type === 'image' ? $t("dockerResources.images.confirm1Warning") : pendingItem?.type === 'volume' ? $t("dockerResources.volumes.confirm1Warning") : $t("dockerResources.containers.confirm1Warning") }}
                    <div v-if="pendingItem?.dockgeStacks?.length > 0" class="mt-1">
                        <strong>{{ $t("dockerResources.stack") }}:</strong> {{ pendingItem.dockgeStacks.join(", ") }}
                    </div>
                </div>
                <div class="d-flex gap-2 justify-content-end">
                    <button class="btn btn-sm btn-normal" @click="cancelDelete">{{ $t("dockerResources.cancelBtn") }}</button>
                    <button class="btn btn-sm btn-warning" @click="confirmStep1">{{ $t("dockerResources.confirmBtn") }}</button>
                </div>
            </div>
        </div>

        <!-- ═══ MODALE CONFIRM 2 (double confirmation) ═══ -->
        <div v-if="confirmStep === 2" class="modal-overlay" @click.self="cancelDelete">
            <div class="modal-card shadow-box">
                <h5 class="mb-3 text-danger">
                    <font-awesome-icon icon="exclamation-triangle" class="me-2" />
                    {{ $t("dockerResources.confirm2Title") }}
                </h5>
                <p class="mb-3">
                    {{ pendingItem?.type === 'image' ? $t("dockerResources.images.confirm2Body") : pendingItem?.type === 'volume' ? $t("dockerResources.volumes.confirm2Body") : $t("dockerResources.containers.confirm2Body") }}
                </p>
                <div class="d-flex gap-2 justify-content-end">
                    <button class="btn btn-sm btn-normal" @click="cancelDelete">{{ $t("dockerResources.cancelBtn") }}</button>
                    <button class="btn btn-sm btn-danger" @click="executeDelete">{{ $t("dockerResources.confirmBtn") }}</button>
                </div>
            </div>
        </div>

        <!-- ═══ TOAST ═══ -->
        <transition name="slide-fade">
            <div v-if="toast.show" class="toast-float" :class="toast.ok ? 'toast-ok' : 'toast-err'">
                <font-awesome-icon :icon="toast.ok ? 'check-circle' : 'exclamation-circle'" class="me-2" />
                {{ toast.msg }}
            </div>
        </transition>
    </div>
</template>

<script lang="ts" setup>
import { ref, computed, watch, onMounted } from "vue";
import { useI18n } from "vue-i18n/dist/vue-i18n.esm-browser.prod.js";

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

interface DockerNetwork {
    id: string;
    name: string;
    driver: string;
    scope: string;
    internal: boolean;
    dockerManaged: boolean;
    composeProject?: string | null;
    dockgeManaged: boolean;
    containers: Array<{ id: string; name: string; ipv4: string; ipv6: string }>;
    ipam: Array<{ Subnet?: string; Gateway?: string }>;
}

interface PendingItem {
    type: "image" | "volume" | "container";
    label: string;
    status: string;
    dockgeStacks: string[];
    id?: string;   // image id / container id
    name?: string; // volume name
}

// ─── State ────────────────────────────────────────────────────────

const { t, te } = useI18n();

// Traduit une clé dynamique (statut/état), retombe sur la valeur brute si absente.
function tr(key: string, fallback: string): string {
    return te(key) ? t(key) : fallback;
}

const tab = ref<"images" | "volumes" | "containers" | "networks">("images");

const images = ref<DockerImage[]>([]);
const volumes = ref<DockerVolume[]>([]);
const containers = ref<DockerContainer[]>([]);
const networks = ref<DockerNetwork[]>([]);
const resourceFilter = ref("");
const loadingImages = ref(false);
const loadingVolumes = ref(false);
const loadingContainers = ref(false);
const loadingNetworks = ref(false);
const pruningImages = ref(false);
const pruningUnusedImages = ref(false);
const pruningVolumes = ref(false);
const imageError = ref("");
const volumeError = ref("");
const containerError = ref("");
const networkError = ref("");
const stoppingContainer = ref<string | null>(null);
const networkBusy = ref(false);
const networkCreateOpen = ref(false);
const networkConnectInputs = ref<Record<string, string>>({});
const networkForm = ref({
    name: "",
    driver: "bridge",
    subnet: "",
    gateway: "",
    parent: "",
    internal: false,
});

const confirmStep = ref(0); // 0 = rien, 1 = première modale, 2 = deuxième modale
const pendingItem = ref<PendingItem | null>(null);

const selectedImages = ref<Set<string>>(new Set());

const toast = ref({ show: false, ok: true, msg: "" });
let toastTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Auto-prune ───────────────────────────────────────────────────

interface AutoPruneSettings {
    // Mode orphelines (dangling)
    danglingEnabled:       boolean;
    danglingIntervalHours: 24 | 48 | 168;
    lastDanglingRun?:      string;
    lastDanglingResult?:   string;
    nextDanglingRun?:      string | null;
    // Mode inutilisées (unused tagged)
    unusedEnabled:         boolean;
    unusedIntervalHours:   24 | 48 | 168;
    unusedExclusions:      string[];
    lastUnusedRun?:        string;
    lastUnusedResult?:     string;
    nextUnusedRun?:        string | null;
}

const autoPrune = ref<AutoPruneSettings>({
    danglingEnabled:       false,
    danglingIntervalHours: 24,
    unusedEnabled:         false,
    unusedIntervalHours:   168,
    unusedExclusions:      [],
});
const autoPruneOpen        = ref(false);
const autoPruneLoaded      = ref(false);
const savingPrune          = ref(false);
const runningDanglingPrune = ref(false);
const runningUnusedPrune   = ref(false);

// ─── Computed ─────────────────────────────────────────────────────

const normalizedResourceFilter = computed(() => resourceFilter.value.toLowerCase());

const filteredImages = computed(() => {
    const q = normalizedResourceFilter.value;
    if (!q) return images.value;
    return images.value.filter((image) => [
        image.repository,
        image.tag,
        image.id,
        ...image.dockgeStacks,
        ...image.containers.flatMap((container) => [
            container.name,
            container.stackName ?? "",
            container.service ?? "",
        ]),
    ].some((value) => value.toLowerCase().includes(q)));
});

const filteredVolumes = computed(() => {
    const q = normalizedResourceFilter.value;
    if (!q) return volumes.value;
    return volumes.value.filter((volume) => [
        volume.name,
        volume.driver,
        ...volume.dockgeStacks,
        ...volume.containers.flatMap((container) => [
            container.name,
            container.stackName ?? "",
            container.service ?? "",
        ]),
    ].some((value) => value.toLowerCase().includes(q)));
});

const filteredContainers = computed(() => {
    const q = normalizedResourceFilter.value;
    if (!q) return containers.value;
    return containers.value.filter((container) => [
        container.name,
        container.id,
        container.image,
        container.stackName ?? "",
        container.service ?? "",
    ].some((value) => value.toLowerCase().includes(q)));
});

const filteredNetworks = computed(() => {
    const q = normalizedResourceFilter.value;
    if (!q) return networks.value;
    return networks.value.filter(network => [
        network.name,
        network.driver,
        network.scope,
        network.composeProject ?? "",
        ...network.containers.map(container => container.name),
    ].some(value => value.toLowerCase().includes(q)));
});

const unusedImagesCount = computed(() =>
    images.value.filter(i => i.status === "unused" || i.status === "dangling").length);

// ─── Sélection multiple images ────────────────────────────────────

function imgKey(img: DockerImage): string {
    return img.repository !== "<none>" ? `${img.repository}:${img.tag}` : img.id;
}

const deletableImages = computed(() => filteredImages.value.filter(i => i.status !== "running"));

const allDeletableSelected = computed(() =>
    deletableImages.value.length > 0 &&
    deletableImages.value.every(img => selectedImages.value.has(imgKey(img)))
);

const someImagesSelected = computed(() => selectedImages.value.size > 0);
const danglingCount = computed(() =>
    images.value.filter(i => i.status === "dangling").length);
const unusedVolumesCount = computed(() =>
    volumes.value.filter(v => v.status === "unused").length);

// ─── Tri par taille ───────────────────────────────────────────────

const imgSizeSort = ref<"asc" | "desc" | null>(null);

function parseImageSize(s: string): number {
    const m = (s ?? "").trim().match(/^([\d.]+)\s*([A-Za-z]+)$/);
    if (!m) return 0;
    const val = parseFloat(m[1]);
    const units: Record<string, number> = {
        B: 1,
        kB: 1e3, KB: 1e3,
        MB: 1e6, MiB: 1024 ** 2,
        GB: 1e9, GiB: 1024 ** 3,
        TB: 1e12, TiB: 1024 ** 4,
    };
    return val * (units[m[2]] ?? 1);
}

const sortedImages = computed(() => {
    if (!imgSizeSort.value) return filteredImages.value;
    return [...filteredImages.value].sort((a, b) => {
        const diff = parseImageSize(a.size) - parseImageSize(b.size);
        return imgSizeSort.value === "asc" ? diff : -diff;
    });
});

function toggleImgSizeSort() {
    if (imgSizeSort.value === null)   imgSizeSort.value = "desc";
    else if (imgSizeSort.value === "desc") imgSizeSort.value = "asc";
    else imgSizeSort.value = null;
}

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

watch(tab, (selected) => {
    if (selected === "networks" && networks.value.length === 0 && !loadingNetworks.value) {
        loadNetworks();
    }
});

// ─── API ──────────────────────────────────────────────────────────

function token(): string {
    return localStorage.getItem("token") ?? sessionStorage.getItem("token") ?? "";
}

async function api(method: string, path: string, body?: unknown) {
    const t = token();
    const base = `/api/docker/${path}`;
    const sep  = base.includes("?") ? "&" : "?";
    const url  = t ? `${base}${sep}token=${encodeURIComponent(t)}` : base;
    const res = await fetch(url, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(t ? { "Authorization": `Bearer ${t}` } : {}),
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
            imageError.value = data.message ?? t("dockerResources.errorLoad");
        }
    } catch {
        imageError.value = t("dockerResources.errorLoad");
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
    if (!confirm(t("dockerResources.images.deleteSelectedConfirm", { n: keys.length }))) return;

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
            volumeError.value = data.message ?? t("dockerResources.errorLoad");
        }
    } catch {
        volumeError.value = t("dockerResources.errorLoad");
    } finally {
        loadingVolumes.value = false;
    }
}

async function pruneImages() {
    if (!confirm(t("dockerResources.images.pruneConfirm"))) return;
    pruningImages.value = true;
    try {
        const data = await api("POST", "images/prune");
        showToast(data.ok, data.message ?? "");
        if (data.ok) await loadImages();
    } finally {
        pruningImages.value = false;
    }
}

async function pruneUnusedImages() {
    if (!confirm(t("dockerResources.images.pruneUnusedConfirm"))) return;
    pruningUnusedImages.value = true;
    try {
        const data = await api("POST", "images/prune-unused");
        showToast(data.ok, data.message ?? "");
        if (data.ok) await loadImages();
    } finally {
        pruningUnusedImages.value = false;
    }
}

async function pruneVolumes() {
    if (!confirm(t("dockerResources.volumes.pruneConfirm"))) return;
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
            containerError.value = data.message ?? t("dockerResources.errorLoad");
        }
    } catch {
        containerError.value = t("dockerResources.errorLoad");
    } finally {
        loadingContainers.value = false;
    }
}

async function loadNetworks() {
    loadingNetworks.value = true;
    networkError.value = "";
    try {
        const data = await api("GET", "networks");
        if (data.ok) {
            networks.value = data.networks;
        } else {
            networkError.value = data.message ?? t("dockerResources.errorLoad");
        }
    } catch {
        networkError.value = t("dockerResources.errorLoad");
    } finally {
        loadingNetworks.value = false;
    }
}

async function createNetwork() {
    networkBusy.value = true;
    try {
        const data = await api("POST", "networks", networkForm.value);
        showToast(data.ok, data.message ?? "");
        if (data.ok) {
            networkForm.value = { name: "", driver: "bridge", subnet: "", gateway: "", parent: "", internal: false };
            networkCreateOpen.value = false;
            await loadNetworks();
        }
    } finally {
        networkBusy.value = false;
    }
}

async function deleteNetwork(network: DockerNetwork) {
    if (!confirm(t("dockerResources.networks.deleteConfirm", { name: network.name }))) return;
    const data = await api("DELETE", `networks/${encodeURIComponent(network.name)}`, { confirmed: true });
    showToast(data.ok, data.message ?? "");
    if (data.ok) await loadNetworks();
}

async function connectNetwork(network: DockerNetwork) {
    const container = networkConnectInputs.value[network.name]?.trim();
    if (!container || !confirm(t("dockerResources.networks.connectConfirm", { container, network: network.name }))) return;
    const data = await api("POST", `networks/${encodeURIComponent(network.name)}/connect`, { container, confirmed: true });
    showToast(data.ok, data.message ?? "");
    if (data.ok) {
        networkConnectInputs.value[network.name] = "";
        await loadNetworks();
    }
}

async function disconnectNetwork(network: DockerNetwork, container: { id: string; name: string }) {
    if (!confirm(t("dockerResources.networks.disconnectConfirm", { container: container.name, network: network.name }))) return;
    const data = await api("POST", `networks/${encodeURIComponent(network.name)}/disconnect`, {
        container: container.id,
        confirmed: true,
    });
    showToast(data.ok, data.message ?? "");
    if (data.ok) await loadNetworks();
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
        showToast(false, t("dockerResources.errorLoad"));
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

// ─── Auto-prune API ───────────────────────────────────────────────

async function loadAutoPrune() {
    try {
        const data = await api("GET", "auto-prune/settings");
        if (data.ok) { autoPrune.value = data.data; autoPruneLoaded.value = true; }
    } catch { /* silencieux */ }
}

async function saveAutoPrune() {
    savingPrune.value = true;
    try {
        await api("POST", "auto-prune/settings", {
            danglingEnabled:       autoPrune.value.danglingEnabled,
            danglingIntervalHours: autoPrune.value.danglingIntervalHours,
            unusedEnabled:         autoPrune.value.unusedEnabled,
            unusedIntervalHours:   autoPrune.value.unusedIntervalHours,
        });
        await loadAutoPrune();
    } finally {
        savingPrune.value = false;
    }
}

async function addUnusedExclusion(nameTag: string) {
    await api("POST", "auto-prune/exclusions/unused", { nameTag });
    await loadAutoPrune();
}

async function removeUnusedExclusion(nameTag: string) {
    await api("DELETE", `auto-prune/exclusions/unused/${encodeURIComponent(nameTag)}`);
    await loadAutoPrune();
}

async function runDanglingPruneNow() {
    runningDanglingPrune.value = true;
    try {
        const data = await api("POST", "auto-prune/run/dangling");
        showToast(data.ok, data.summary ?? data.message ?? "");
        if (data.ok) { await loadImages(); await loadAutoPrune(); }
    } finally {
        runningDanglingPrune.value = false;
    }
}

async function runUnusedPruneNow() {
    runningUnusedPrune.value = true;
    try {
        const data = await api("POST", "auto-prune/run/unused");
        showToast(data.ok, data.summary ?? data.message ?? "");
        if (data.ok) { await loadImages(); await loadAutoPrune(); }
    } finally {
        runningUnusedPrune.value = false;
    }
}

function isExcludedFromUnusedPrune(img: DockerImage): boolean {
    const nameTag = `${img.repository}:${img.tag}`;
    return autoPrune.value.unusedExclusions.includes(nameTag);
}

function fmtDate(iso?: string | null): string {
    if (!iso) return t("dockerResources.autoPrune.never");
    return new Date(iso).toLocaleString();
}

// ─── Lifecycle ────────────────────────────────────────────────────

onMounted(() => {
    // Nettoie l'ancienne clé de langue propre à cette page
    localStorage.removeItem("dockerResourcesLang");
    loadImages();
    loadVolumes();
    loadContainers();
    loadAutoPrune();
});
</script>

<style lang="scss" scoped>

// ── Table ────────────────────────────────────────────────────────
.th-sortable:hover {
    .dark & { color: var(--text-color); }
}
.sort-indicator { font-size: var(--fs-xs); margin-left: 3px; letter-spacing: -2px; }

.resources-table {
    font-size: var(--fs-md);
    @include data-table;

    // Ligne : conteneur Dockge arrêté → orange à gauche
    .row-stopped-dockge td:first-child {
        border-left: 3px solid var(--warning);
    }
    .row-stopped td:first-child {
        border-left: 3px solid var(--warning);
    }
    .row-dangling td:first-child {
        border-left: 3px solid var(--danger);
    }
    // Ligne : conteneur orphelin en cours → rouge-orange
    .row-orphan-running td:first-child {
        border-left: 3px solid var(--danger);
    }
}

// ── Auto-prune panel ─────────────────────────────────────────────
.auto-prune-panel {
    .ap-toggle-btn {
        .dark & {
            color: var(--text-muted);
            &:hover { color: var(--text-color); }
        }
    }
}

.auto-prune-body {
    border-radius: var(--radius-sm);

    .dark & {
        background-color: var(--bg-input);
        border: 1px solid var(--border-color);
        color: var(--text-color);
    }
}

.auto-prune-sections {
    display: flex;
    gap: 1.5rem;
    flex-wrap: wrap;
}

.auto-prune-section {
    flex: 1;
    min-width: 260px;
}

.auto-prune-section-title {
    font-size: var(--fs-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 0.75rem;
    padding-bottom: 0.35rem;
    border-bottom: 1px solid var(--border-color);

    .dark & {
        color: var(--text-muted);
    }
}

.ap-label {
    .dark & { color: var(--text-color) !important; }
}

.ap-select {
    width: auto;

    &:focus {
        border-color: var(--primary);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 25%, transparent);
    }

    .dark & {
        background-color: var(--bg-input);
        border-color: var(--border-color);
        color: var(--text-color);
    }
}

.ap-meta {
    font-size: var(--fs-sm);
    line-height: 1.6;

    .dark & {
        color: var(--text-muted);
        strong { color: var(--text-color); }
    }
}

.ap-exclusions {
    border-top: 1px solid var(--border-color);
    padding-top: 0.6rem;
    margin-top: 0.4rem;
}

.ap-exclusions-label {
    font-size: var(--fs-sm);
    font-weight: 600;
    margin-bottom: 0.4rem;

    .dark & { color: var(--text-color); }
}

.ap-exclusion-badge {
    background-color: var(--bg-raised);
    border: 1px solid var(--border-color);
    font-weight: normal;
    font-size: var(--fs-sm);
}

.ap-exclusion-code {
    color: var(--primary);
    background: none;
    font-size: var(--fs-xs);
}

.ap-hint {
    font-size: var(--fs-sm);
    color: var(--text-muted);
    font-style: italic;
}

// ── Badge stack Dockge ───────────────────────────────────────────
.badge-stack {
    background-color: var(--warning-soft);
    color: var(--warning);
    border: 1px solid color-mix(in srgb, var(--warning) 40%, transparent);
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
    min-width: min(340px, 100%);
    max-width: 480px;
    width: 90%;
    padding: 1.5rem;
    border-radius: var(--radius-lg);
}

// ── Toast ────────────────────────────────────────────────────────
.toast-float {
    position: fixed;
    right: 1.25rem;
    bottom: 1.5rem;
    z-index: 9999;
    padding: .6rem 1rem;
    border-radius: var(--radius-md);
    font-size: var(--fs-md);
    color: var(--primary-text);
    box-shadow: var(--shadow-popover);

    &.toast-ok { background: var(--success); }
    &.toast-err { background: var(--danger); }

    @media (max-width: $bp-mobile) { bottom: var(--space-4); }
}
.slide-fade-enter-active, .slide-fade-leave-active { transition: all .3s ease; }
.slide-fade-enter-from, .slide-fade-leave-to { transform: translateY(16px); opacity: 0; }

// ── Helpers ──────────────────────────────────────────────────────
.text-xs {
    font-size: var(--fs-xs);
}

.old-image-badge {
    font-family: var(--font-sans);
    font-size: var(--fs-xs);
    font-style: normal;
}
</style>
