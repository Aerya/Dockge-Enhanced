<template>
    <div class="shadow-box big-padding mb-3 container">
        <div class="row">
            <div class="col-12">
                <h4>{{ name }}</h4>
                <div class="image mb-2">
                    <span class="me-1">{{ imageName }}:</span><span class="tag">{{ imageTag }}</span>
                    <a
                        v-if="registryUrl"
                        :href="registryUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="image-registry-link ms-2"
                        :title="registryUrl"
                    >
                        <font-awesome-icon icon="external-link-square-alt" />
                    </a>
                    <span v-if="imageUpdate" class="container-image-update ms-2" :title="imageUpdateTitle">
                        <font-awesome-icon icon="arrow-circle-up" class="me-1" />{{ $t("containerImageUpdateAvailable") }}
                    </span>
                </div>
                <div v-if="!isEditMode && autoUpdate" class="container-auto-update mb-2">
                    <label class="container-auto-update-label" :for="`auto-update-${name}`">
                        {{ $t("watcher.status.autoUpdate") }}
                    </label>
                    <select
                        :id="`auto-update-${name}`"
                        class="form-select form-select-sm container-auto-update-select"
                        :value="autoUpdate.mode"
                        :disabled="autoUpdateSaving"
                        @change="changeAutoUpdateMode"
                    >
                        <option value="off">{{ $t("watcher.status.auOff") }}</option>
                        <option value="ignored">{{ $t("watcher.status.auIgnored") }}</option>
                        <option value="immediate">{{ $t("watcher.status.auImmediate") }}</option>
                        <option value="scheduled">{{ $t("watcher.status.auScheduled") }}</option>
                    </select>
                    <input
                        v-if="autoUpdate.mode === 'scheduled'"
                        type="time"
                        class="form-control form-control-sm container-auto-update-time"
                        :value="autoUpdate.time"
                        :disabled="autoUpdateSaving"
                        @change="changeAutoUpdateTime"
                    />
                    <span v-if="autoUpdate.updating" class="container-auto-update-state updating">
                        <font-awesome-icon icon="spinner" spin /> {{ $t("watcher.status.auUpdating") }}
                    </span>
                    <span v-else-if="autoUpdate.pending" class="container-auto-update-state pending">
                        {{ $t("watcher.status.auPending") }}
                    </span>
                </div>
                <div v-if="!isEditMode">
                    <span class="badge me-1" :class="bgStyle">{{ status }}</span>

                    <a v-for="port in (ports ?? envsubstService.ports)" :key="port" :href="parsePort(port).url" target="_blank">
                        <span class="badge me-1 bg-secondary">{{ parsePort(port).display }}</span>
                    </a>

                    <span v-if="startedAt" class="container-started-at ms-1">
                        <font-awesome-icon icon="rotate" />
                        {{ relativeTime(startedAt) }}
                    </span>
                    <ContainerStatsBadge v-if="showResourceStats" :stack-name="stackName" :service-name="name" />
                </div>
                <div v-if="!isEditMode && (volumeLoading || volumeUsage.length > 0)" class="container-volumes mt-2">
                    <div class="container-volumes-title">
                        <span>
                            <font-awesome-icon icon="hard-drive" class="me-1" />{{ $t("stackVolumeUsage") }}
                            <span v-if="volumeLoading" class="spinner-border spinner-border-sm ms-1" />
                        </span>
                        <button
                            type="button"
                            class="btn btn-sm btn-link container-volume-refresh"
                            :title="$t('refresh')"
                            :disabled="volumeLoading"
                            @click="$emit('refresh-volume-usage')"
                        >
                            <font-awesome-icon icon="sync" />
                        </button>
                    </div>
                    <button
                        v-for="volume in volumeUsage"
                        :key="volume.source + volume.destination"
                        type="button"
                        class="container-volume-row"
                        :title="volume.source"
                        @click="openVolumeBrowser(volume.destination)"
                    >
                        <code>{{ volume.destination }}</code>
                        <span class="container-volume-name">{{ volume.type === "volume" ? (volume.name || volume.source) : volume.source }}</span>
                        <strong>
                            <template v-if="volume.size !== null">{{ formatBytes(volume.size) }}</template>
                            <template v-else>{{ $t("notAvailableShort") }}</template>
                        </strong>
                    </button>
                </div>
                <div v-if="!isEditMode" class="container-action-bar mt-3" :class="{ 'container-action-bar--labeled': containerActionLabels }">
                    <button v-if="status !== 'running' && status !== 'healthy'" class="btn btn-sm btn-primary container-action" :title="$t('startStack')" :aria-label="$t('startStack')" :disabled="actionProcessing" @click="runAction('start')"><font-awesome-icon icon="play" /><span>{{ $t("startStack") }}</span></button>
                    <button v-if="status === 'running' || status === 'healthy'" class="btn btn-sm btn-normal container-action" :title="$t('stopStack')" :aria-label="$t('stopStack')" :disabled="actionProcessing" @click="runAction('stop')"><font-awesome-icon icon="stop" /><span>{{ $t("stopStack") }}</span></button>
                    <button class="btn btn-sm btn-normal container-action" :title="$t('restartStack')" :aria-label="$t('restartStack')" :disabled="actionProcessing" @click="runAction('restart')"><font-awesome-icon icon="arrows-rotate" /><span>{{ $t("restartStack") }}</span></button>
                    <button class="btn btn-sm btn-normal container-action" :title="$t('updateStack')" :aria-label="$t('updateStack')" :disabled="actionProcessing" @click="runAction('update')"><font-awesome-icon icon="cloud-arrow-down" /><span>{{ $t("updateStack") }}</span></button>
                    <button class="btn btn-sm btn-normal container-action" :title="$t('recreateStack')" :aria-label="$t('recreateStack')" :disabled="actionProcessing" @click="runAction('recreate')"><font-awesome-icon icon="recycle" /><span>{{ $t("recreateStack") }}</span></button>
                    <button class="btn btn-sm btn-normal container-action" :title="$t('pullAndRecreateStack')" :aria-label="$t('pullAndRecreateStack')" :disabled="actionProcessing" @click="runAction('pull-recreate')"><font-awesome-icon icon="boxes-stacked" /><span>{{ $t("pullAndRecreateStack") }}</span></button>
                    <button class="btn btn-sm container-action" :class="showSchedule ? 'btn-primary' : 'btn-normal'" :title="$t('stackScheduler.action')" :aria-label="$t('stackScheduler.action')" @click="showSchedule = !showSchedule"><font-awesome-icon icon="calendar-days" /><span>{{ $t("stackScheduler.action") }}</span></button>
                    <button class="btn btn-sm container-action" :class="containerActionLabels ? 'btn-primary' : 'btn-normal'" :title="$t('stackActionLabels')" :aria-label="$t('stackActionLabels')" @click="$emit('container-action-labels-change', !containerActionLabels)"><font-awesome-icon icon="list" /><span>{{ $t("stackActionLabels") }}</span></button>
                    <router-link class="btn btn-sm btn-normal container-action" :to="terminalRouteLink" :aria-label="$t('terminal')" disabled=""><font-awesome-icon icon="terminal" /><span>{{ $t("terminal") }}</span></router-link>
                    <a v-if="dozzleUrl" class="btn btn-sm btn-normal container-action" :href="dozzleContainerUrl" target="_blank" rel="noopener noreferrer" aria-label="Dozzle"><font-awesome-icon icon="stream" /><span>Dozzle</span></a>
                </div>
                <div v-if="!isEditMode && showSchedule" class="container-schedule mt-3">
                    <StackScheduleEditor :stack-name="`${stackName}::${name}`" compact :show-heading="false" />
                </div>
            </div>
        </div>

        <VolumeBrowser
            v-if="!isEditMode"
            ref="volumeBrowser"
            :stack-name="stackName"
            :service-name="name"
            :endpoint="endpoint"
        />

        <div v-if="isEditMode" class="mt-2">
            <button class="btn btn-normal me-2" @click="showConfig = !showConfig">
                <font-awesome-icon icon="edit" />
                {{ $t("Edit") }}
            </button>
            <button v-if="false" class="btn btn-normal me-2">{{ $t("rename") }}</button>
            <button class="btn btn-danger me-2" @click="remove">
                <font-awesome-icon icon="trash" />
                {{ $t("deleteContainer") }}
            </button>
        </div>

        <transition name="slide-fade" appear>
            <div v-if="isEditMode && showConfig" class="config mt-3">
                <!-- Image -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $t("dockerImage") }}
                    </label>
                    <div class="input-group mb-3">
                        <input
                            v-model="service.image"
                            class="form-control"
                            list="image-datalist"
                        />
                    </div>

                    <!-- TODO: Search online: https://hub.docker.com/api/content/v1/products/search?q=louislam%2Fuptime&source=community&page=1&page_size=4 -->
                    <datalist id="image-datalist">
                        <option value="louislam/uptime-kuma:1" />
                    </datalist>
                    <div class="form-text"></div>
                </div>

                <!-- Ports -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $tc("port", 2) }}
                    </label>
                    <ArrayInput name="ports" :display-name="$t('port')" placeholder="HOST:CONTAINER" />
                </div>

                <!-- Volumes -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $tc("volume", 2) }}
                    </label>
                    <ArrayInput name="volumes" :display-name="$t('volume')" placeholder="HOST:CONTAINER" />
                </div>

                <!-- Restart Policy -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $t("restartPolicy") }}
                    </label>
                    <select v-model="service.restart" class="form-select">
                        <option value="always">{{ $t("restartPolicyAlways") }}</option>
                        <option value="unless-stopped">{{ $t("restartPolicyUnlessStopped") }}</option>
                        <option value="on-failure">{{ $t("restartPolicyOnFailure") }}</option>
                        <option value="no">{{ $t("restartPolicyNo") }}</option>
                    </select>
                </div>

                <!-- Environment Variables -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $tc("environmentVariable", 2) }}
                    </label>
                    <ArrayInput name="environment" :display-name="$t('environmentVariable')" placeholder="KEY=VALUE" />
                </div>

                <!-- Container Name -->
                <div v-if="false" class="mb-4">
                    <label class="form-label">
                        {{ $t("containerName") }}
                    </label>
                    <div class="input-group mb-3">
                        <input
                            v-model="service.container_name"
                            class="form-control"
                        />
                    </div>
                    <div class="form-text"></div>
                </div>

                <!-- Network -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $tc("network", 2) }}
                    </label>

                    <div v-if="networkList.length === 0 && service.networks && service.networks.length > 0" class="text-warning mb-3">
                        {{ $t("NoNetworksAvailable") }}
                    </div>

                    <ArraySelect name="networks" :display-name="$t('network')" :placeholder="$t('Network name...')" :options="networkList" />
                </div>

                <!-- Depends on -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $t("dependsOn") }}
                    </label>
                    <ArrayInput name="depends_on" :display-name="$t('dependsOn')" :placeholder="$t(`containerName`)" />
                </div>
            </div>
        </transition>
    </div>
</template>

<script>
import { defineComponent } from "vue";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { parseDockerPort, imageRegistryUrl, resolveEndpointHostname } from "../../../common/util-common";
import VolumeBrowser from "./VolumeBrowser.vue";
import ContainerStatsBadge from "./ContainerStatsBadge.vue";
import StackScheduleEditor from "./StackScheduleEditor.vue";

export default defineComponent({
    components: {
        FontAwesomeIcon,
        VolumeBrowser,
        ContainerStatsBadge,
        StackScheduleEditor,
    },
    props: {
        name: {
            type: String,
            required: true,
        },
        isEditMode: {
            type: Boolean,
            default: false,
        },
        first: {
            type: Boolean,
            default: false,
        },
        status: {
            type: String,
            default: "N/A",
        },
        ports: {
            type: Array,
            default: null
        },
        startedAt: {
            type: String,
            default: null
        },
        imageUpdate: {
            type: Object,
            default: null
        },
        autoUpdate: {
            type: Object,
            default: null
        },
        autoUpdateSaving: {
            type: Boolean,
            default: false
        },
        volumeUsage: {
            type: Array,
            default: () => []
        },
        volumeLoading: {
            type: Boolean,
            default: false
        },
        actionProcessing: {
            type: Boolean,
            default: false,
        },
        stackName: {
            type: String,
            default: "",
        },
        endpoint: {
            type: String,
            default: "",
        },
        showResourceStats: {
            type: Boolean,
            default: false,
        },
        dozzleUrl: { type: String, default: "" }
        ,
        containerActionLabels: { type: Boolean, default: false }
    },
    emits: [
        "auto-update-change",
        "refresh-volume-usage",
        "service-action",
        "container-action-labels-change",
    ],
    data() {
        return {
            showConfig: false,
            showSchedule: false,
        };
    },
    computed: {

        dozzleContainerUrl() {
            const base = this.dozzleUrl.replace(/\/$/, "");
            const containerName = this.service.container_name || `${this.stackName}-${this.name}-1`;
            return `${base}/show?name=${encodeURIComponent(containerName)}`;
        },

        networkList() {
            let list = [];
            for (const networkName in this.jsonObject.networks) {
                list.push(networkName);
            }
            return list;
        },

        bgStyle() {
            if (this.status === "running" || this.status === "healthy") {
                return "bg-primary";
            } else if (this.status === "unhealthy") {
                return "bg-danger";
            } else {
                return "bg-secondary";
            }
        },

        terminalRouteLink() {
            if (this.endpoint) {
                return {
                    name: "containerTerminalEndpoint",
                    params: {
                        endpoint: this.endpoint,
                        stackName: this.stackName,
                        serviceName: this.name,
                        type: "bash",
                    },
                };
            } else {
                return {
                    name: "containerTerminal",
                    params: {
                        stackName: this.stackName,
                        serviceName: this.name,
                        type: "bash",
                    },
                };
            }
        },

        stack() {
            return this.$parent.$parent.stack;
        },

        service() {
            if (!this.jsonObject.services[this.name]) {
                return {};
            }
            return this.jsonObject.services[this.name];
        },

        jsonObject() {
            return this.$parent.$parent.jsonConfig;
        },

        envsubstJSONConfig() {
            return this.$parent.$parent.envsubstJSONConfig;
        },

        envsubstService() {
            if (!this.envsubstJSONConfig.services[this.name]) {
                return {};
            }
            return this.envsubstJSONConfig.services[this.name];
        },

        imageName() {
            if (this.envsubstService.image) {
                return this.envsubstService.image.split(":")[0];
            } else {
                return "";
            }
        },

        imageTag() {
            if (this.envsubstService.image) {
                let tag = this.envsubstService.image.split(":")[1];

                if (tag) {
                    return tag;
                } else {
                    return "latest";
                }
            } else {
                return "";
            }
        },

        imageUpdateTitle() {
            if (!this.imageUpdate) {
                return "";
            }
            return `${this.imageUpdate.image}: ${this.$t("watcher.status.updateAvailable")}`;
        },

        registryUrl() {
            if (!this.envsubstService.image) {
                return null;
            }
            return imageRegistryUrl(this.envsubstService.image);
        },
    },
    mounted() {
        if (this.first) {
            //this.showConfig = true;
        }
    },
    methods: {
        changeAutoUpdateMode(event) {
            const mode = event.target.value;
            this.$emit("auto-update-change", {
                mode,
                time: mode === "scheduled" ? this.autoUpdate.time : undefined,
            });
        },
        runAction(action) {
            this.$emit("service-action", action);
        },
        changeAutoUpdateTime(event) {
            this.$emit("auto-update-change", {
                mode: "scheduled",
                time: event.target.value,
            });
        },
        parsePort(port) {
            const hostname = resolveEndpointHostname(this.endpoint, this.$root.agentList[this.endpoint]?.url, location.hostname, location.protocol);
            return parseDockerPort(port, hostname);
        },
        remove() {
            delete this.jsonObject.services[this.name];
        },
        openVolumeBrowser(destination = "") {
            this.$refs.volumeBrowser?.open(destination);
        },
        formatBytes(bytes) {
            if (bytes >= 1024 ** 4) {
                return (bytes / 1024 ** 4).toFixed(1) + " TB";
            }
            if (bytes >= 1024 ** 3) {
                return (bytes / 1024 ** 3).toFixed(1) + " GB";
            }
            if (bytes >= 1024 ** 2) {
                return Math.round(bytes / 1024 ** 2) + " MB";
            }
            if (bytes >= 1024) {
                return Math.round(bytes / 1024) + " KB";
            }
            return bytes + " B";
        },
        relativeTime(iso) {
            if (!iso) {
                return null;
            }
            const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
            if (diff < 60) {
                return this.$t("timeUnit.second", [ diff ]);
            }
            if (diff < 3600) {
                return this.$t("timeUnit.minute", [ Math.floor(diff / 60) ]);
            }
            if (diff < 86400) {
                return this.$t("timeUnit.hour", [ Math.floor(diff / 3600) ]);
            }
            return this.$t("timeUnit.day", [ Math.floor(diff / 86400) ]);
        },
    }
});
</script>

<style scoped lang="scss">
.container {
    .container-action-bar {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: .3rem;
        justify-content: flex-start;
    }

    .container-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 2.35rem;
        min-height: 2.15rem;
        gap: .2rem;

        span { display: none; }
    }

    .container-action-bar--labeled .container-action {
        flex-direction: column;
        min-width: 5rem;
        min-height: 3.5rem;
        padding: .3rem .45rem;

        span {
            display: block;
            max-width: 7rem;
            font-size: var(--fs-xs);
            line-height: 1.05;
            white-space: normal;
            text-align: center;
        }
    }

    .container-schedule {
        padding: 0 10px;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
    }
    .image {
        font-size: var(--fs-sm);
        color: var(--text-muted);
        .tag {
            color: var(--text-muted);
        }
    }

    .image-registry-link {
        color: var(--text-muted);
        opacity: 0.65;
        text-decoration: none;
        font-size: var(--fs-xs);
        vertical-align: middle;

        &:hover {
            opacity: 1;
            color: var(--primary-strong);
        }
    }

    .container-image-update {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 2px 7px;
        border-radius: var(--radius-pill);
        font-size: var(--fs-xs);
        font-weight: 600;
        line-height: 1;
        color: var(--warning);
        background: var(--warning-soft);
        border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);
        vertical-align: middle;
    }

    .container-auto-update {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
    }

    .container-auto-update-label,
    .container-auto-update-state {
        font-size: var(--fs-xs);
        color: var(--text-muted);
    }

    .container-auto-update-select {
        width: auto;
        min-width: 118px;
        padding-top: 2px;
        padding-bottom: 2px;
        font-size: var(--fs-xs);
    }

    .container-auto-update-time {
        width: 104px;
        padding-top: 2px;
        padding-bottom: 2px;
        font-size: var(--fs-xs);
    }

    .container-auto-update-state.pending {
        color: var(--warning);
    }

    .container-auto-update-state.updating {
        color: var(--primary-strong);
    }

    .container-volumes {
        display: grid;
        gap: 4px;
        max-width: 100%;
    }

    .container-volumes-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        color: var(--text-muted);
        font-size: var(--fs-xs);
        font-weight: 600;
    }

    .container-volume-refresh {
        padding: 0;
        line-height: 1;
        color: inherit;
        text-decoration: none;
    }

    .container-volume-row {
        display: grid;
        grid-template-columns: minmax(72px, auto) minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        width: 100%;
        max-width: 100%;
        padding: 4px 8px;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        background: var(--bg-raised);
        color: inherit;
        text-align: left;
        font-size: var(--fs-xs);

        &:hover {
            border-color: var(--primary-strong);
            background: var(--primary-soft);
        }

        code,
        .container-volume-name {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    }

    @media (max-width: $bp-phone) {
        .container-action-bar { align-items: flex-start; }
    }
}

.container-started-at {
    font-size: var(--fs-xs);
    color: var(--text-muted);
    vertical-align: middle;
}
</style>
