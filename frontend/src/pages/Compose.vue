<template>
    <transition name="slide-fade" appear>
        <div class="compose-page" :class="{ 'logs-fullscreen-active': logsFullscreen }">
            <h1 v-if="isAdd" class="mb-3">{{ $t("compose") }}</h1>
            <h1 v-else class="mb-3">
                <Uptime :stack="globalStack" :pill="true" /> {{ stack.name }}
                <span v-if="$root.agentCount > 1" class="agent-name">
                    (<a
                        v-if="remoteStackUrl"
                        :href="remoteStackUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                    >{{ endpointDisplay }}</a><template v-else>{{ endpointDisplay }}</template>)
                </span>
                <RemoteInstanceLinks
                    v-if="endpoint && !isAdd"
                    class="stack-remote-link"
                    :agents="$root.agentList"
                    :endpoint="endpoint"
                    :path="`/compose/${encodeURIComponent(stack.name)}`"
                />
                <div v-if="lastUpdated || lastStartedAt" class="stack-meta-bar">
                    <span v-if="lastUpdated" class="stack-meta-item" :title="new Date(lastUpdated).toLocaleString()">
                        <font-awesome-icon icon="clock" class="me-1" />{{ $t('updatedAt') }} {{ relativeTime(lastUpdated) }}
                    </span>
                    <span v-if="lastStartedAt" class="stack-meta-item" :title="new Date(lastStartedAt).toLocaleString()">
                        <font-awesome-icon icon="rotate" class="me-1" />{{ $t('restartedAt') }} {{ relativeTime(lastStartedAt) }}
                    </span>
                </div>
            </h1>

            <StackReplicationStatus
                v-if="!isAdd && stack.isManagedByDockge && $root.agentCount > 1"
                ref="stackReplicationStatus"
                :source-endpoint="endpoint"
                :source-stack-name="stack.name"
                @edit="openStackReplication"
            />
            <PendingStackMoveStatus
                v-if="!isAdd && stack.isManagedByDockge"
                ref="pendingStackMoveStatus"
                :source-endpoint="endpoint"
                :source-stack-name="stack.name"
            />

            <div v-if="stack.isManagedByDockge" class="mb-3">
                <div class="stack-action-bar" :class="{ 'stack-action-bar--labeled': stackActionLabels }" role="toolbar" :aria-label="$t('stackActions')">
                    <button v-if="isEditMode" class="btn btn-primary stack-action" :title="$t('deployStack')" :aria-label="$t('deployStack')" :disabled="processing" @click="deployStack">
                        <font-awesome-icon icon="rocket" />
                        <span class="stack-action-label">{{ $t("deployStack") }}</span>
                    </button>

                    <button v-if="isEditMode" class="btn btn-normal stack-action" :title="$t('saveStackDraft')" :aria-label="$t('saveStackDraft')" :disabled="processing" @click="saveStack">
                        <font-awesome-icon icon="save" />
                        <span class="stack-action-label">{{ $t("saveStackDraft") }}</span>
                    </button>

                    <button v-if="isEditMode && !isAdd" class="btn btn-normal stack-action" :title="$t('discardStack')" :aria-label="$t('discardStack')" :disabled="processing" @click="discardStack">
                        <font-awesome-icon icon="undo" />
                        <span class="stack-action-label">{{ $t("discardStack") }}</span>
                    </button>

                    <button v-if="!isEditMode" class="btn btn-secondary stack-action" :title="$t('editStack')" :aria-label="$t('editStack')" :disabled="processing" @click="enableEditMode">
                        <font-awesome-icon icon="pen" />
                        <span class="stack-action-label">{{ $t("editStack") }}</span>
                    </button>

                    <button v-if="!isEditMode && !active" class="btn btn-primary stack-action" :title="$t('startStack')" :aria-label="$t('startStack')" :disabled="processing" @click="startStack">
                        <font-awesome-icon icon="play" />
                        <span class="stack-action-label">{{ $t("startStack") }}</span>
                    </button>

                    <button v-if="!isEditMode && active" class="btn btn-normal stack-action" :title="$t('restartStack')" :aria-label="$t('restartStack')" :disabled="processing" @click="restartStack">
                        <font-awesome-icon icon="arrows-rotate" />
                        <span class="stack-action-label">{{ $t("restartStack") }}</span>
                    </button>

                    <button v-if="!isEditMode" class="btn btn-normal stack-action" :title="$t('updateStack')" :aria-label="$t('updateStack')" :disabled="processing" @click="updateStack">
                        <font-awesome-icon icon="cloud-arrow-down" />
                        <span class="stack-action-label">{{ $t("updateStack") }}</span>
                    </button>

                    <button v-if="!isEditMode" class="btn btn-normal stack-action" :title="$t('recreateStack')" :aria-label="$t('recreateStack')" :disabled="processing" @click="recreateStack">
                        <font-awesome-icon icon="recycle" />
                        <span class="stack-action-label">{{ $t("recreateStack") }}</span>
                    </button>

                    <button v-if="!isEditMode" class="btn btn-normal stack-action" :title="$t('pullAndRecreateStack')" :aria-label="$t('pullAndRecreateStack')" :disabled="processing" @click="pullAndRecreateStack">
                        <font-awesome-icon icon="boxes-stacked" />
                        <span class="stack-action-label">{{ $t("pullAndRecreateStack") }}</span>
                    </button>

                    <button v-if="!isEditMode && buildServices.length > 0" class="btn btn-normal stack-action" :title="$t('buildAndRecreateStack')" :aria-label="$t('buildAndRecreateStack')" :disabled="processing" @click="buildAndRecreateStack">
                        <font-awesome-icon icon="hammer" />
                        <span class="stack-action-label">{{ $t("buildAndRecreateStack") }}</span>
                    </button>

                    <button v-if="!isEditMode && active" class="btn btn-normal stack-action" :title="$t('stopStack')" :aria-label="$t('stopStack')" :disabled="processing" @click="stopStack">
                        <font-awesome-icon icon="stop" />
                        <span class="stack-action-label">{{ $t("stopStack") }}</span>
                    </button>

                    <button v-if="!isEditMode && !isAdd && !endpoint" type="button" class="btn stack-action" :class="showStackSchedule ? 'btn-primary' : 'btn-normal'" :title="$t('stackScheduler.action')" :aria-label="$t('stackScheduler.action')" @click="showStackSchedule = !showStackSchedule">
                        <font-awesome-icon icon="calendar-days" />
                        <span class="stack-action-label">{{ $t("stackScheduler.action") }}</span>
                    </button>

                    <button v-if="$root.agentCount > 1 && !isEditMode" class="btn btn-normal stack-action" :title="$t('stackTransfer.copyAction')" :aria-label="$t('stackTransfer.copyAction')" :disabled="processing" @click="openStackTransfer('copy')">
                        <font-awesome-icon icon="copy" />
                        <span class="stack-action-label">{{ $t("stackTransfer.copyAction") }}</span>
                    </button>

                    <button v-if="$root.agentCount > 1 && !isEditMode" class="btn btn-normal stack-action" :title="$t('stackTransfer.moveAction')" :aria-label="$t('stackTransfer.moveAction')" :disabled="processing" @click="openStackTransfer('move')">
                        <font-awesome-icon icon="clone" />
                        <span class="stack-action-label">{{ $t("stackTransfer.moveAction") }}</span>
                    </button>

                    <button v-if="$root.agentCount > 1 && !isEditMode" class="btn btn-normal stack-action" :title="$t('stackReplication.configure')" :aria-label="$t('stackReplication.configure')" :disabled="processing" @click="openStackReplication()">
                        <font-awesome-icon icon="database" />
                        <span class="stack-action-label">{{ $t("stackReplication.configure") }}</span>
                    </button>

                    <button v-if="!isEditMode" class="btn btn-normal stack-action" :title="$t('downStack')" :aria-label="$t('downStack')" :disabled="processing" @click="downStack">
                        <font-awesome-icon icon="ban" />
                        <span class="stack-action-label">{{ $t("downStack") }}</span>
                    </button>

                    <button v-if="!isEditMode" class="btn btn-danger stack-action" :title="$t('deleteStack')" :aria-label="$t('deleteStack')" :disabled="processing" @click="showDeleteDialog = !showDeleteDialog">
                        <font-awesome-icon icon="trash" />
                        <span class="stack-action-label">{{ $t("deleteStack") }}</span>
                    </button>

                    <button type="button" class="btn stack-action" :class="stackActionLabels ? 'btn-primary' : 'btn-normal'" :title="$t('stackActionLabels')" :aria-label="$t('stackActionLabels')" @click="stackActionLabels = !stackActionLabels">
                        <font-awesome-icon icon="list" />
                        <span class="stack-action-label">{{ $t("stackActionLabels") }}</span>
                    </button>
                    <button type="button" class="btn stack-action" :class="showStackNote ? 'btn-primary' : 'btn-normal'" :title="$t('showStackNote')" :aria-label="$t('showStackNote')" @click="showStackNote = !showStackNote">
                        <font-awesome-icon icon="note-sticky" />
                        <span class="stack-action-label">{{ $t("showStackNote") }}</span>
                    </button>
                    <button v-if="!endpoint" type="button" class="btn stack-action" :class="showStackGit ? 'btn-primary' : 'btn-normal'" :title="$t('showStackGit')" :aria-label="$t('showStackGit')" @click="showStackGit = !showStackGit">
                        <font-awesome-icon icon="code-branch" />
                        <span class="stack-action-label">{{ $t("showStackGit") }}</span>
                    </button>
                </div>
                <div v-if="showStackSchedule && schedulerEnabled && !isEditMode && !isAdd && !endpoint" class="stack-scheduler-inline mt-3">
                    <div class="stack-scheduler-inline-title">
                        <font-awesome-icon icon="calendar-days" class="me-1" />{{ $t("stackScheduler.heading") }}
                    </div>
                    <StackScheduleEditor :stack-name="stack.name" compact :show-heading="false" />
                </div>
            </div>

            <!-- URLs -->
            <div v-if="urls.length > 0" class="mb-3">
                <a v-for="(url, index) in urls" :key="index" target="_blank" :href="url.url">
                    <span class="badge bg-secondary me-2">{{ url.display }}</span>
                </a>
            </div>

            <div v-if="showStackNote && !isAdd && stack.isManagedByDockge" class="shadow-box stack-note-panel mb-3">
                <button
                    class="stack-note-toggle"
                    type="button"
                    :aria-expanded="noteExpanded"
                    @click="noteExpanded = !noteExpanded"
                >
                    <span class="settings-subheading mb-0">
                        <font-awesome-icon icon="note-sticky" class="me-2" />{{ $t("stackNote.heading") }}
                    </span>
                    <font-awesome-icon icon="chevron-down" class="stack-note-chevron" :class="{ 'is-expanded': noteExpanded }" />
                </button>
                <div v-show="noteExpanded" class="stack-note-content">
                    <textarea
                        v-model="stack.note"
                        class="form-control stack-note-input"
                        rows="4"
                        maxlength="10000"
                        :placeholder="$t('stackNote.placeholder')"
                    />
                    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-2">
                        <div class="form-text text-warning mt-0">{{ $t("stackNote.secretWarning") }}</div>
                        <button class="btn btn-sm btn-primary" type="button" :disabled="noteSaving" @click="saveStackNote">
                            <font-awesome-icon :icon="noteSaving ? 'spinner' : 'save'" :spin="noteSaving" class="me-1" />{{ $t("Save") }}
                        </button>
                    </div>
                </div>
            </div>

            <StackGitPanel
                v-if="showStackGit && !isAdd && stack.isManagedByDockge && !endpoint"
                :stack-name="stack.name"
            />

            <!-- Progress Terminal -->
            <transition name="slide-fade" appear>
                <Terminal
                    v-show="showProgressTerminal"
                    ref="progressTerminal"
                    class="mb-3 terminal progress-terminal"
                    :name="terminalName"
                    :endpoint="endpoint"
                    :rows="progressTerminalRows"
                    @has-data="showProgressTerminal = true; submitted = true;"
                ></Terminal>
            </transition>

            <div
                v-if="stack.isManagedByDockge"
                ref="composeWorkspace"
                class="compose-workspace"
                :class="{ 'compose-collapsed': composeEffectivelyCollapsed }"
                :style="composeWorkspaceStyle"
            >
                <div class="compose-runtime-pane">
                    <!-- General -->
                    <div v-if="isAdd">
                        <h4 class="mb-3">{{ $t("general") }}</h4>
                        <div class="shadow-box big-padding mb-3">
                            <!-- Stack Name -->
                            <div>
                                <label for="name" class="form-label">{{ $t("stackName") }}</label>
                                <input id="name" v-model="stack.name" type="text" class="form-control" required @blur="stackNameToLowercase">
                                <div class="form-text">{{ $t("Lowercase only") }}</div>
                            </div>

                            <!-- Endpoint -->
                            <div class="mt-3">
                                <label for="name" class="form-label">{{ $t("dockgeAgent") }}</label>
                                <select v-model="stack.endpoint" class="form-select">
                                    <option v-for="(agent, endpoint) in $root.agentList" :key="endpoint" :value="endpoint" :disabled="$root.agentStatusList[endpoint] != 'online'">
                                        {{ agentOptionLabel(endpoint) }}
                                    </option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Containers -->
                    <button
                        type="button"
                        class="containers-toggle mb-3"
                        :aria-expanded="containersExpanded"
                        :aria-label="$t(containersExpanded ? 'collapseContainers' : 'expandContainers')"
                        aria-controls="stack-containers"
                        :title="$t(containersExpanded ? 'collapseContainers' : 'expandContainers')"
                        @click="toggleContainers"
                    >
                        <span class="containers-toggle-title">
                            {{ $tc("container", 2) }}
                            <span class="containers-count">{{ containerCount }}</span>
                        </span>
                        <span class="containers-toggle-status">
                            <span
                                v-for="item in containerStatusSummary"
                                :key="item.state"
                                class="container-status-summary"
                                :class="containerStatusClass(item.state)"
                            >
                                {{ item.count }} {{ $tc(item.labelKey, item.count) }}
                            </span>
                            <font-awesome-icon :icon="containersExpanded ? 'chevron-down' : 'chevron-right'" />
                        </span>
                    </button>

                    <div v-show="containersExpanded" id="stack-containers">
                        <div v-if="isEditMode" class="input-group mb-3">
                            <input
                                v-model="newContainerName"
                                :placeholder="$t(`New Container Name...`)"
                                class="form-control"
                                @keyup.enter="addContainer"
                            />
                            <button class="btn btn-primary" @click="addContainer">
                                {{ $t("addContainer") }}
                            </button>
                        </div>

                        <div ref="containerList">
                            <Container
                                v-for="(service, name) in jsonConfig.services"
                                :key="name"
                                :name="name"
                                :is-edit-mode="isEditMode"
                                :first="name === Object.keys(jsonConfig.services)[0]"
                                :status="serviceStatusList[name]?.state"
                                :ports="serviceStatusList[name]?.ports"
                                :started-at="serviceStatusList[name]?.startedAt ?? null"
                                :image-update="imageUpdateForService(name)"
                                :auto-update="autoUpdateForService(name)"
                                :auto-update-saving="autoUpdateSaving[name] === true"
                                :volume-usage="volumeUsageForService(name)"
                                :volume-loading="volumeUsageLoading"
                                :action-processing="serviceActionProcessing[name] === true"
                                :stack-name="stack.name"
                                :endpoint="endpoint"
                                :show-resource-stats="!endpoint"
                                :dozzle-url="dozzleUrl"
                                :container-action-labels="containerActionLabels"
                                @container-action-labels-change="containerActionLabels = $event"
                                @auto-update-change="setServiceAutoUpdate(name, $event)"
                                @refresh-volume-usage="loadVolumeUsage"
                                @service-action="runServiceAction(name, $event)"
                            />
                        </div>
                    </div>

                    <button v-if="false && isEditMode && jsonConfig.services && Object.keys(jsonConfig.services).length > 0" class="btn btn-normal mb-3" @click="addContainer">{{ $t("addContainer") }}</button>

                    <!-- General -->
                    <div v-if="isEditMode">
                        <h4 class="mb-3">{{ $t("extra") }}</h4>
                        <div class="shadow-box big-padding mb-3">
                            <!-- URLs -->
                            <div class="mb-4">
                                <label class="form-label">
                                    {{ $tc("url", 2) }}
                                </label>
                                <ArrayInput name="urls" :display-name="$t('url')" placeholder="https://" object-type="x-dockge" />
                            </div>
                        </div>
                    </div>

                    <!-- Combined Terminal Output -->
                    <div v-show="!isEditMode" class="logs-panel" :class="{ 'logs-fullscreen': logsFullscreen }">
                        <div class="terminal-toolbar mb-3">
                            <h4 class="mb-0">{{ $t("stackLogs") }}</h4>
                            <div class="terminal-toolbar-right">
                                <div class="terminal-log-since">
                                    <label class="form-label mb-0 small text-muted" for="log-since-select">{{ $t("logSince") }}</label>
                                    <select
                                        id="log-since-select"
                                        v-model="selectedLogSince"
                                        class="form-select form-select-sm"
                                        @change="joinSelectedLogTerminal"
                                    >
                                        <option value="">{{ $t("logSinceTail") }}</option>
                                        <option value="24h">{{ $t("logSince24h") }}</option>
                                        <option value="72h">{{ $t("logSince3d") }}</option>
                                        <option value="168h">{{ $t("logSince7d") }}</option>
                                        <option value="336h">{{ $t("logSince14d") }}</option>
                                    </select>
                                </div>
                                <div class="terminal-log-since">
                                    <label class="form-label mb-0 small text-muted" for="terminal-scale-select">{{ $t("logPanelSize") }}</label>
                                    <select id="terminal-scale-select" v-model="terminalScale" class="form-select form-select-sm" @change="resizeCombinedTerminal">
                                        <option value="1">x1</option>
                                        <option value="1.5">x1,5</option>
                                        <option value="2">x2</option>
                                    </select>
                                </div>
                                <div v-if="logServiceOptions.length > 0" class="terminal-service-filter">
                                    <label class="form-label mb-0 small text-muted" for="log-service-select">{{ $t("logService") }}</label>
                                    <select
                                        id="log-service-select"
                                        v-model="selectedLogService"
                                        class="form-select form-select-sm"
                                        @change="joinSelectedLogTerminal"
                                    >
                                        <option value="">{{ $t("logServiceAll") }}</option>
                                        <option v-for="service in logServiceOptions" :key="service" :value="service">
                                            {{ service }}
                                        </option>
                                    </select>
                                </div>
                                <div class="terminal-log-search input-group input-group-sm">
                                    <span class="input-group-text"><font-awesome-icon icon="search" /></span>
                                    <input
                                        v-model="logSearch"
                                        type="search"
                                        class="form-control"
                                        :placeholder="$t('logSearchPlaceholder')"
                                        @input="scheduleLogSearch"
                                        @keyup.enter="searchLogs(false)"
                                    />
                                    <button class="btn btn-normal" :title="$t('logSearchPrevious')" @click="searchLogs(true)">
                                        <font-awesome-icon icon="chevron-up" />
                                    </button>
                                    <button class="btn btn-normal" :title="$t('logSearchNext')" @click="searchLogs(false)">
                                        <font-awesome-icon icon="chevron-down" />
                                    </button>
                                </div>
                                <button
                                    class="btn btn-sm"
                                    :class="logTimestamps ? 'btn-primary' : 'btn-normal'"
                                    :title="$t('logTimestampsToggle')"
                                    style="font-size:0.78rem; padding: 2px 8px;"
                                    @click="toggleLogTimestamps"
                                >
                                    <font-awesome-icon icon="clock" class="me-1" />{{ $t('logTimestamps') }}
                                </button>
                                <button
                                    class="btn btn-sm"
                                    :class="logLineWrap ? 'btn-primary' : 'btn-normal'"
                                    :title="$t('logLineWrapToggle')"
                                    style="font-size:0.78rem; padding: 2px 8px;"
                                    @click="toggleLogLineWrap"
                                >
                                    <font-awesome-icon icon="stream" class="me-1" />{{ $t(logLineWrap ? 'logLineWrapOn' : 'logLineWrapOff') }}
                                </button>
                                <button
                                    class="btn btn-sm btn-normal"
                                    :title="$t(logsFullscreen ? 'logsExitFullscreen' : 'logsFullscreen')"
                                    @click="toggleLogsFullscreen"
                                >
                                    <font-awesome-icon :icon="logsFullscreen ? 'compress' : 'expand'" />
                                </button>
                                <button
                                    class="btn btn-sm btn-normal"
                                    :title="$t(composeCollapsed ? 'composeRestore' : 'composeCollapse')"
                                    @click="toggleComposeCollapsed"
                                >
                                    <font-awesome-icon :icon="composeCollapsed ? 'chevron-left' : 'chevron-right'" />
                                </button>
                            </div>
                        </div>
                        <Terminal
                            :key="selectedLogTerminalName"
                            ref="combinedTerminal"
                            class="mb-3 terminal combined-terminal"
                            :class="{ 'logs-expanded': !containersExpanded, 'logs-no-wrap': !logLineWrap }"
                            :name="selectedLogTerminalName"
                            :endpoint="endpoint"
                            :rows="combinedTerminalRows"
                            :cols="combinedTerminalCols"
                            :wrap-lines="logLineWrap"
                            :style="{ height: `${315 * Number(terminalScale)}px` }"
                        ></Terminal>
                    </div>

                </div>
                <div
                    v-if="!composeEffectivelyCollapsed"
                    class="compose-resize-handle"
                    role="separator"
                    aria-orientation="vertical"
                    :aria-label="$t('composeResize')"
                    aria-valuemin="25"
                    aria-valuemax="75"
                    :aria-valuenow="composePaneWidth"
                    tabindex="0"
                    @pointerdown="startComposeResize"
                    @keydown.left.prevent="resizeComposeBy(5)"
                    @keydown.right.prevent="resizeComposeBy(-5)"
                >
                    <span></span>
                </div>
                <div v-show="!composeEffectivelyCollapsed" class="compose-editor-pane">
                    <div class="editor-header mb-3">
                        <h4 class="mb-0">{{ stack.composeFileName }}</h4>
                        <div class="editor-header-actions">
                            <button type="button" class="btn btn-sm btn-normal editor-fullscreen-btn" :title="$t('copyRawCompose')" @click="copyRawCompose">
                                <font-awesome-icon icon="copy" />
                            </button>
                            <button v-if="!isEditMode" type="button" class="btn btn-sm btn-normal editor-fullscreen-btn" :title="$t('composeCollapse')" @click="toggleComposeCollapsed">
                                <font-awesome-icon icon="chevron-right" />
                            </button>
                            <button type="button" class="btn btn-sm btn-normal editor-fullscreen-btn" :title="$t('toggleFullscreen')" @click="toggleFullscreen('yaml')">
                                <font-awesome-icon :icon="fullscreenEditor === 'yaml' ? 'compress' : 'expand'" />
                            </button>
                        </div>
                    </div>

                    <!-- YAML editor -->
                    <div class="shadow-box mb-3 editor-box" :class="{'edit-mode' : isEditMode, 'editor-fullscreen': fullscreenEditor === 'yaml'}">
                        <button v-if="fullscreenEditor === 'yaml'" type="button" class="btn btn-sm btn-normal editor-fullscreen-close" :title="$t('toggleFullscreen')" @click="toggleFullscreen('yaml')">
                            <font-awesome-icon icon="compress" />
                        </button>
                        <code-mirror
                            ref="yamlEditor"
                            v-model="stack.composeYAML"
                            :extensions="extensions"
                            minimal
                            wrap="true"
                            dark="true"
                            tab="true"
                            :disabled="!isEditMode"
                            :hasFocus="editorFocus"
                            @change="yamlCodeChange"
                        />
                    </div>
                    <div v-if="isEditMode" class="mb-3">
                        {{ yamlError }}
                    </div>

                    <!-- Override editor -->
                    <div v-if="isEditMode">
                        <div class="editor-header mb-3">
                            <h4 class="mb-0">compose.override.yaml</h4>
                            <button type="button" class="btn btn-sm btn-normal editor-fullscreen-btn" :title="$t('toggleFullscreen')" @click="toggleFullscreen('override')">
                                <font-awesome-icon :icon="fullscreenEditor === 'override' ? 'compress' : 'expand'" />
                            </button>
                        </div>
                        <div class="form-text mb-2">{{ $t("composeOverrideHint") }}</div>
                        <div class="shadow-box mb-3 editor-box" :class="{'edit-mode' : isEditMode, 'editor-fullscreen': fullscreenEditor === 'override'}">
                            <button v-if="fullscreenEditor === 'override'" type="button" class="btn btn-sm btn-normal editor-fullscreen-close" :title="$t('toggleFullscreen')" @click="toggleFullscreen('override')">
                                <font-awesome-icon icon="compress" />
                            </button>
                            <code-mirror
                                ref="overrideEditor"
                                v-model="stack.composeOverrideYAML"
                                :extensions="extensions"
                                minimal
                                wrap="true"
                                dark="true"
                                tab="true"
                                :disabled="!isEditMode"
                                :hasFocus="editorFocus"
                            />
                        </div>
                    </div>

                    <!-- ENV editor -->
                    <div v-if="isEditMode">
                        <div class="editor-header mb-3">
                            <h4 class="mb-0">.env</h4>
                            <button type="button" class="btn btn-sm btn-normal editor-fullscreen-btn" :title="$t('toggleFullscreen')" @click="toggleFullscreen('env')">
                                <font-awesome-icon :icon="fullscreenEditor === 'env' ? 'compress' : 'expand'" />
                            </button>
                        </div>
                        <div class="shadow-box mb-3 editor-box" :class="{'edit-mode' : isEditMode, 'editor-fullscreen': fullscreenEditor === 'env'}">
                            <button v-if="fullscreenEditor === 'env'" type="button" class="btn btn-sm btn-normal editor-fullscreen-close" :title="$t('toggleFullscreen')" @click="toggleFullscreen('env')">
                                <font-awesome-icon icon="compress" />
                            </button>
                            <code-mirror
                                ref="envEditor"
                                v-model="stack.composeENV"
                                :extensions="extensionsEnv"
                                minimal
                                wrap="true"
                                dark="true"
                                tab="true"
                                :disabled="!isEditMode"
                                :hasFocus="editorFocus"
                                @change="yamlCodeChange"
                            />
                        </div>
                    </div>

                    <div v-if="isEditMode">
                        <PlugNPiNLabelAssistant
                            v-if="plugNPiNEnabled && !endpoint && logServiceOptions.length > 0"
                            :services="logServiceOptions"
                            @apply="applyPlugNPiNLabels"
                        />

                        <!-- Volumes -->
                        <div v-if="false">
                            <h4 class="mb-3">{{ $tc("volume", 2) }}</h4>
                            <div class="shadow-box big-padding mb-3">
                            </div>
                        </div>

                        <!-- Networks -->
                        <h4 class="mb-3">{{ $tc("network", 2) }}</h4>
                        <div class="shadow-box big-padding mb-3">
                            <NetworkInput />
                        </div>
                    </div>

                    <!-- <div class="shadow-box big-padding mb-3">
                        <div class="mb-3">
                            <label for="name" class="form-label"> Search Templates</label>
                            <input id="name" v-model="name" type="text" class="form-control" placeholder="Search..." required>
                        </div>

                        <prism-editor v-if="false" v-model="yamlConfig" class="yaml-editor" :highlight="highlighter" line-numbers @input="yamlCodeChange"></prism-editor>
                    </div>-->
                </div>
            </div>

            <div v-if="!stack.isManagedByDockge && !processing">
                {{ $t("stackNotManagedByDockgeMsg") }}
            </div>

            <!-- Stack transfer -->
            <StackTransferModal
                v-if="!isAdd && stack.name"
                ref="stackTransferModal"
                :stack="stack"
                :endpoint="endpoint"
                @completed="stackTransferCompleted"
            />

            <!-- Delete Dialog -->
            <BModal v-model="showDeleteDialog" :cancelTitle="$t('cancel')" :okTitle="$t('deleteStack')" okVariant="danger" @ok="deleteDialog">
                <p>{{ $t("deleteStackMsg") }}</p>
                <div class="form-check mt-3">
                    <input id="delete-remove-files" v-model="deleteRemoveFiles" type="checkbox" class="form-check-input">
                    <label class="form-check-label" for="delete-remove-files">
                        {{ $t("deleteStackRemoveFiles") }}
                    </label>
                    <div class="form-text">{{ $t("deleteStackRemoveFilesHint") }}</div>
                </div>
                <div class="form-check mt-2">
                    <input id="delete-force" v-model="deleteForce" type="checkbox" class="form-check-input">
                    <label class="form-check-label" for="delete-force">
                        {{ $t("deleteStackForce") }}
                    </label>
                    <div class="form-text">{{ $t("deleteStackForceHint") }}</div>
                </div>
            </BModal>
        </div>
    </transition>
</template>

<script>
import CodeMirror from "vue-codemirror6";
import { yaml } from "@codemirror/lang-yaml";
import { python } from "@codemirror/lang-python";
import { dracula as editorTheme } from "thememirror";
import { lineNumbers, EditorView, keymap } from "@codemirror/view";
import { foldGutter, foldKeymap } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { parseDocument, Document } from "yaml";
import { yamlVariableHighlight, setDefinedVars } from "../composables/codemirrorVariables";

import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import {
    COMBINED_TERMINAL_COLS,
    COMBINED_TERMINAL_ROWS,
    copyYAMLComments, envsubstYAML,
    getCombinedTerminalName,
    getComposeTerminalName,
    getStackLogsTerminalName,
    PROGRESS_TERMINAL_ROWS,
    RUNNING
} from "../../../common/util-common";
import { BModal } from "bootstrap-vue-next";
import NetworkInput from "../components/NetworkInput.vue";
import dotenv from "dotenv";
import { ref } from "vue";
import { setLowPower, POLL, isVisible } from "../composables/useLowPower";
import { useImageStatus } from "../composables/useImageStatus";
import StackScheduleEditor from "../components/StackScheduleEditor.vue";
import StackTransferModal from "../components/StackTransferModal.vue";
import StackReplicationStatus from "../components/StackReplicationStatus.vue";
import PendingStackMoveStatus from "../components/PendingStackMoveStatus.vue";
import RemoteInstanceLinks from "../components/RemoteInstanceLinks.vue";
import PlugNPiNLabelAssistant from "../components/PlugNPiNLabelAssistant.vue";
import StackGitPanel from "../components/StackGitPanel.vue";
import { applyPlugNPiNLabelsToCompose, PlugNPiNSequenceLabelsError } from "../plugnpin-labels";
import { useStackSchedules } from "../composables/useStackSchedules";

const template = `
services:
  nginx:
    image: nginx:latest
    restart: unless-stopped
    ports:
      - "8080:80"
`;
const envDefault = "# VARIABLE=value #comment";

let yamlErrorTimeout = null;

let serviceStatusTimeout = null;

export default {
    components: {
        NetworkInput,
        FontAwesomeIcon,
        CodeMirror,
        BModal,
        StackScheduleEditor,
        StackTransferModal,
        StackReplicationStatus,
        PendingStackMoveStatus,
        RemoteInstanceLinks,
        PlugNPiNLabelAssistant,
        StackGitPanel,
    },
    beforeRouteUpdate(to, from, next) {
        this.containersExpanded = true;
        this.exitConfirm(next);
    },
    beforeRouteLeave(to, from, next) {
        this.exitConfirm(next);
    },
    setup() {
        const { enabled: schedulerEnabled } = useStackSchedules();
        const editorFocus = ref(false);
        const {
            statusCache: imageStatuses,
            autoUpdateFor,
            setAutoUpdateMode: saveAutoUpdateMode,
        } = useImageStatus();

        const focusEffectHandler = (state, focusing) => {
            editorFocus.value = focusing;
            return null;
        };

        // Extensions communes : repli de code, recherche, auto-fermeture des
        // crochets, mise en évidence des sélections.
        const commonEditing = [
            foldGutter(),
            closeBrackets(),
            highlightSelectionMatches(),
            keymap.of([ ...closeBracketsKeymap, ...searchKeymap, ...foldKeymap ]),
        ];

        const extensions = [
            editorTheme,
            yaml(),
            lineNumbers(),
            ...commonEditing,
            yamlVariableHighlight,
            EditorView.focusChangeEffect.of(focusEffectHandler)
        ];

        const extensionsEnv = [
            editorTheme,
            python(),
            lineNumbers(),
            ...commonEditing,
            yamlVariableHighlight,
            EditorView.focusChangeEffect.of(focusEffectHandler)
        ];

        return { extensions,
            extensionsEnv,
            editorFocus,
            imageStatuses,
            autoUpdateFor,
            saveAutoUpdateMode,
            schedulerEnabled };
    },
    yamlDoc: null,  // For keeping the yaml comments
    data() {
        return {
            jsonConfig: {},
            envsubstJSONConfig: {},
            yamlError: "",
            processing: true,
            showProgressTerminal: false,
            progressTerminalRows: PROGRESS_TERMINAL_ROWS,
            combinedTerminalRows: COMBINED_TERMINAL_ROWS,
            combinedTerminalCols: COMBINED_TERMINAL_COLS,
            stack: {

            },
            serviceStatusList: {},
            lastUpdated: null,
            lastStartedAt: null,
            logTimestamps: false,
            logLineWrap: localStorage.getItem("logLineWrap") !== "false",
            isEditMode: false,
            submitted: false,
            showDeleteDialog: false,
            deleteRemoveFiles: true,
            deleteForce: false,
            fullscreenEditor: null,
            newContainerName: "",
            stopServiceStatusTimeout: false,
            selectedLogService: "",
            joinedLogService: "",
            selectedLogSince: "",
            joinedLogSince: "",
            terminalScale: localStorage.getItem("terminalScale") || "1",
            containerActionLabels: localStorage.getItem("containerActionLabels") === "1",
            logSearch: "",
            logSearchTimer: null,
            volumeUsage: [],
            volumeUsageLoading: false,
            containersExpanded: true,
            autoUpdateSaving: {},
            serviceActionProcessing: {},
            stackActionLabels: localStorage.getItem("stackActionLabels") === "1",
            showStackNote: localStorage.getItem("showStackNote") === "1",
            showStackGit: localStorage.getItem("showStackGit") === "1",
            showStackSchedule: false,
            dozzleUrl: "",
            plugNPiNEnabled: false,
            noteSaving: false,
            noteExpanded: false,
            composePaneWidth: Math.min(75, Math.max(25, Number(localStorage.getItem("composePaneWidth")) || 50)),
            composeCollapsed: localStorage.getItem("composeCollapsed") === "1",
            logsFullscreen: false,
            composeResizing: false,
        };
    },
    computed: {
        composeWorkspaceStyle() {
            if (this.composeEffectivelyCollapsed) {
                return { gridTemplateColumns: "minmax(0, 1fr)" };
            }
            return {
                gridTemplateColumns: `minmax(0, ${100 - this.composePaneWidth}fr) 10px minmax(0, ${this.composePaneWidth}fr)`,
            };
        },
        composeEffectivelyCollapsed() {
            return this.composeCollapsed && !this.isEditMode;
        },
        endpointDisplay() {
            return this.$root.endpointDisplayFunction(this.endpoint);
        },
        remoteStackUrl() {
            const agentUrl = this.$root.agentList[this.endpoint]?.url;
            if (!this.endpoint || !agentUrl || !this.stack.name) {
                return "";
            }
            return new URL(`compose/${encodeURIComponent(this.stack.name)}`, agentUrl.replace(/\/?$/, "/")).toString();
        },

        urls() {
            if (!this.envsubstJSONConfig["x-dockge"] || !this.envsubstJSONConfig["x-dockge"].urls || !Array.isArray(this.envsubstJSONConfig["x-dockge"].urls)) {
                return [];
            }

            let urls = [];
            for (const url of this.envsubstJSONConfig["x-dockge"].urls) {
                let display;
                try {
                    let obj = new URL(url);
                    let pathname = obj.pathname;
                    if (pathname === "/") {
                        pathname = "";
                    }
                    display = obj.host + pathname + obj.search;
                } catch (e) {
                    display = url;
                }

                urls.push({
                    display,
                    url,
                });
            }
            return urls;
        },

        isAdd() {
            return this.$route.path === "/compose" && !this.submitted;
        },

        /**
         * Get the stack from the global stack list, because it may contain more real-time data like status
         * @return {*}
         */
        globalStack() {
            return this.$root.completeStackList[this.stack.name + "_" + this.endpoint];
        },

        status() {
            return this.globalStack?.status;
        },

        active() {
            return this.status === RUNNING;
        },

        buildServices() {
            const services = this.jsonConfig?.services;
            if (!services || Array.isArray(services) || typeof services !== "object") {
                return this.stack.buildServices ?? [];
            }
            return Object.entries(services)
                .filter(([, service]) => service && typeof service === "object" && Object.prototype.hasOwnProperty.call(service, "build") && service.build !== null)
                .map(([ name ]) => name)
                .sort();
        },

        terminalName() {
            if (!this.stack.name) {
                return "";
            }
            return getComposeTerminalName(this.endpoint, this.stack.name);
        },

        combinedTerminalName() {
            if (!this.stack.name) {
                return "";
            }
            return getCombinedTerminalName(this.endpoint, this.stack.name);
        },

        selectedLogTerminalName() {
            if (!this.stack.name) {
                return "";
            }
            const base = getStackLogsTerminalName(this.endpoint, this.stack.name, this.selectedLogService);
            const since = this.selectedLogSince ? "-since-" + this.selectedLogSince.replace(/[^a-zA-Z0-9_-]/g, "") : "";
            return this.logTimestamps ? base + since + "_ts" : base + since;
        },

        logServiceOptions() {
            if (!this.jsonConfig.services || typeof this.jsonConfig.services !== "object") {
                return [];
            }
            return Object.keys(this.jsonConfig.services);
        },

        containerCount() {
            return Object.keys(this.jsonConfig.services ?? {}).length;
        },

        containerStatusSummary() {
            const counts = {};
            for (const serviceName of Object.keys(this.jsonConfig.services ?? {})) {
                const state = this.serviceStatusList[serviceName]?.state ?? "unknown";
                const category = {
                    healthy: "healthy",
                    running: "noHealthcheck",
                    unhealthy: "unhealthy",
                    starting: "starting",
                    restarting: "restarting",
                    exited: "stopped",
                    dead: "stopped",
                    created: "stopped",
                    paused: "paused",
                }[state] ?? "unknown";
                counts[category] = (counts[category] ?? 0) + 1;
            }

            const categories = [
                [ "healthy", "containerStatusHealthy" ],
                [ "noHealthcheck", "containerStatusNoHealthcheck" ],
                [ "unhealthy", "containerStatusUnhealthy" ],
                [ "starting", "containerStatusStarting" ],
                [ "restarting", "containerStatusRestarting" ],
                [ "stopped", "containerStatusStopped" ],
                [ "paused", "containerStatusPaused" ],
                [ "unknown", "containerStatusUnknown" ],
            ];
            return categories
                .filter(([ state ]) => counts[state])
                .map(([ state, labelKey ]) => ({
                    state,
                    labelKey,
                    count: counts[state],
                }));
        },

        networks() {
            return this.jsonConfig.networks;
        },

        endpoint() {
            return this.stack.endpoint || this.$route.params.endpoint || "";
        },

        url() {
            if (this.stack.endpoint) {
                return `/compose/${this.stack.name}/${this.stack.endpoint}`;
            } else {
                return `/compose/${this.stack.name}`;
            }
        },
    },
    watch: {
        stackActionLabels(value) {
            localStorage.setItem("stackActionLabels", value ? "1" : "0");
        },
        showStackNote(value) {
            localStorage.setItem("showStackNote", value ? "1" : "0");
        },
        showStackGit(value) {
            localStorage.setItem("showStackGit", value ? "1" : "0");
        },
        containerActionLabels(value) {
            localStorage.setItem("containerActionLabels", value ? "1" : "0");
        },
        "stack.composeYAML": {
            handler() {
                if (this.editorFocus) {
                    console.debug("yaml code changed");
                    this.yamlCodeChange();
                }
            },
            deep: true,
        },

        "stack.composeENV": {
            handler() {
                if (this.editorFocus) {
                    console.debug("env code changed");
                    this.yamlCodeChange();
                }
            },
            deep: true,
        },

        jsonConfig: {
            handler() {
                if (!this.editorFocus) {
                    console.debug("jsonConfig changed");

                    let doc = new Document(this.jsonConfig);

                    // Stick back the yaml comments
                    if (this.yamlDoc) {
                        copyYAMLComments(doc, this.yamlDoc);
                    }

                    this.stack.composeYAML = doc.toString();
                    this.yamlDoc = doc;
                }
            },
            deep: true,
        },

        $route(to, from) {

        }
    },
    mounted() {
        this.loadPlugNPiNIntegrationStatus();
        this.loadDozzleStatus();
        if (this.isAdd) {
            this.processing = false;
            this.isEditMode = true;

            let composeYAML;
            let composeENV;

            if (this.$root.composeTemplate) {
                composeYAML = this.$root.composeTemplate;
                this.$root.composeTemplate = "";
            } else {
                composeYAML = template;
            }
            if (this.$root.envTemplate) {
                composeENV = this.$root.envTemplate;
                this.$root.envTemplate = "";
            } else {
                composeENV = envDefault;
            }

            // Default Values
            this.stack = {
                name: "",
                composeYAML,
                composeENV,
                composeOverrideYAML: "",
                note: "",
                isManagedByDockge: true,
                endpoint: "",
            };

            this.yamlCodeChange();

        } else {
            this.stack.name = this.$route.params.stackName;
            this.loadStack();
        }

        this.requestServiceStatus();
        document.addEventListener("visibilitychange", this.onVisibilityServiceStatus);
        window.addEventListener("keydown", this.handleWorkspaceEscape);
    },
    unmounted() {
        document.removeEventListener("visibilitychange", this.onVisibilityServiceStatus);
        window.removeEventListener("keydown", this.handleWorkspaceEscape);
        this.stopComposeResize();
        clearTimeout(serviceStatusTimeout);
        if (this.logSearchTimer) {
            clearTimeout(this.logSearchTimer);
        }
    },
    methods: {
        toggleLogsFullscreen() {
            this.logsFullscreen = !this.logsFullscreen;
            this.$nextTick(this.resizeCombinedTerminal);
        },
        toggleComposeCollapsed() {
            this.composeCollapsed = !this.composeCollapsed;
            localStorage.setItem("composeCollapsed", this.composeCollapsed ? "1" : "0");
            this.$nextTick(this.resizeCombinedTerminal);
        },
        handleWorkspaceEscape(event) {
            if (event.key !== "Escape") {
                return;
            }
            if (this.logsFullscreen) {
                this.logsFullscreen = false;
                this.$nextTick(this.resizeCombinedTerminal);
            }
        },
        startComposeResize(event) {
            if (window.innerWidth < 992) {
                return;
            }
            event.preventDefault();
            this.composeResizing = true;
            document.body.classList.add("compose-resizing");
            window.addEventListener("pointermove", this.moveComposeResize);
            window.addEventListener("pointerup", this.stopComposeResize, { once: true });
        },
        moveComposeResize(event) {
            if (!this.composeResizing) {
                return;
            }
            const bounds = this.$refs.composeWorkspace?.getBoundingClientRect();
            if (!bounds?.width) {
                return;
            }
            const editorWidth = ((bounds.right - event.clientX) / bounds.width) * 100;
            this.composePaneWidth = Math.min(75, Math.max(25, Math.round(editorWidth)));
            this.resizeCombinedTerminal();
        },
        stopComposeResize() {
            if (this.composeResizing) {
                localStorage.setItem("composePaneWidth", String(this.composePaneWidth));
            }
            this.composeResizing = false;
            document.body.classList.remove("compose-resizing");
            window.removeEventListener("pointermove", this.moveComposeResize);
            window.removeEventListener("pointerup", this.stopComposeResize);
        },
        resizeComposeBy(delta) {
            this.composePaneWidth = Math.min(75, Math.max(25, this.composePaneWidth + delta));
            localStorage.setItem("composePaneWidth", String(this.composePaneWidth));
            this.$nextTick(this.resizeCombinedTerminal);
        },
        async copyRawCompose() {
            const content = this.stack.composeYAML || "";
            try {
                await navigator.clipboard.writeText(content);
            } catch {
                const textarea = document.createElement("textarea");
                textarea.value = content;
                textarea.style.position = "fixed";
                textarea.style.opacity = "0";
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand("copy");
                textarea.remove();
            }
            this.$root.toastSuccess(this.$t("rawComposeCopied"));
        },
        async loadDozzleStatus() {
            try {
                const token = this.$root.getAuthToken();
                const [settingsResponse, statusResponse] = await Promise.all([
                    fetch("/api/watcher/dozzle/settings", { headers: { "Authorization": `Bearer ${token}` } }),
                    fetch("/api/watcher/dozzle/status", { headers: { "Authorization": `Bearer ${token}` } }),
                ]);
                const settings = await settingsResponse.json();
                const status = await statusResponse.json();
                if (settings.data?.enabled && status.status === "running") {
                    this.dozzleUrl = settings.data.customUrl?.trim() || `http://${window.location.hostname}:${settings.data.port}`;
                }
            } catch {
                this.dozzleUrl = "";
            }
        },
        async loadPlugNPiNIntegrationStatus() {
            try {
                const token = this.$root.getAuthToken();
                const response = await fetch("/api/integrations/plugnpin/settings", {
                    headers: { "Authorization": `Bearer ${token}` },
                });
                if (!response.ok) {
                    return;
                }
                const payload = await response.json();
                this.plugNPiNEnabled = payload.ok === true && payload.data?.enabled === true;
            } catch {
                // The optional integration must never affect the Compose page.
                this.plugNPiNEnabled = false;
            }
        },

        applyPlugNPiNLabels({ service, labels }) {
            try {
                this.stack.composeYAML = applyPlugNPiNLabelsToCompose(this.stack.composeYAML, service, labels);
                this.yamlCodeChange();
                this.$root.toastSuccess(this.$t("plugnpin.labels.applied"));
            } catch (error) {
                if (error instanceof PlugNPiNSequenceLabelsError) {
                    this.$root.toastError(this.$t("plugnpin.labels.sequenceUnsupported"));
                    return;
                }
                this.$root.toastError(error instanceof Error ? error.message : String(error));
            }
        },

        agentOptionLabel(endpoint) {
            const name = this.$root.endpointDisplayFunction(endpoint);
            const status = this.$root.agentStatusList[endpoint];
            const statusLabel = status === "online"
                ? this.$t("agentOnline")
                : status === "offline"
                    ? this.$t("agentOffline")
                    : status ? this.$t(status) : "";
            const technical = endpoint
                ? name !== endpoint ? endpoint : ""
                : this.$t("localInstance");
            return [ name, technical, statusLabel ].filter(Boolean).join(" — ");
        },

        relativeTime(iso) {
            if (!iso) {
                return null;
            }
            const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
            if (diff < 60) {
                return `${diff}s`;
            }
            if (diff < 3600) {
                return `${Math.floor(diff / 60)} min`;
            }
            if (diff < 86400) {
                return `${Math.floor(diff / 3600)} h`;
            }
            return `${Math.floor(diff / 86400)} j`;
        },

        startServiceStatusTimeout() {
            clearTimeout(serviceStatusTimeout);
            // Cadence selon le mode low-power (5 s / 30 s)
            serviceStatusTimeout = setTimeout(async () => {
                this.requestServiceStatus();
            }, POLL.service());
        },

        requestServiceStatus() {
            // Do not request if it is add mode
            if (this.isAdd) {
                return;
            }

            // Onglet caché : on ne sollicite pas docker (pause), on se contente
            // de re-planifier ; le retour de visibilité forcera un refresh.
            if (!isVisible()) {
                if (!this.stopServiceStatusTimeout) {
                    this.startServiceStatusTimeout();
                }
                return;
            }

            this.$root.emitAgent(this.endpoint, "serviceStatusList", this.stack.name, (res) => {
                if (res.ok) {
                    this.serviceStatusList = res.serviceStatusList;
                    this.lastUpdated = res.lastUpdated ?? null;
                    this.lastStartedAt = res.lastStartedAt ?? null;
                    setLowPower(res.lowPowerMode);
                }
                if (!this.stopServiceStatusTimeout) {
                    this.startServiceStatusTimeout();
                }
            });
        },

        onVisibilityServiceStatus() {
            // Retour de visibilité : refresh immédiat
            if (isVisible() && !this.stopServiceStatusTimeout && !this.isAdd) {
                this.requestServiceStatus();
            }
        },

        exitConfirm(next) {
            if (this.isEditMode) {
                if (confirm(this.$t("confirmLeaveStack"))) {
                    this.exitAction();
                    next();
                } else {
                    next(false);
                }
            } else {
                this.exitAction();
                next();
            }
        },

        exitAction() {
            console.log("exitAction");
            this.stopServiceStatusTimeout = true;
            clearTimeout(serviceStatusTimeout);

            // Leave Combined Terminal
            console.debug("leaveCombinedTerminal", this.endpoint, this.stack.name);
            this.$root.emitAgent(this.endpoint, "leaveCombinedTerminal", this.stack.name, () => {});
            if (this.joinedLogService !== undefined) {
                this.$root.emitAgent(this.endpoint, "leaveStackLogsTerminal", this.stack.name, this.joinedLogService, this.logTimestamps, this.joinedLogSince, () => {});
            }
        },

        bindTerminal() {
            this.$refs.progressTerminal?.bind(this.endpoint, this.terminalName);
            // Rejoint le bon terminal logs (avec ou sans timestamps selon l'état actuel)
            this.joinSelectedLogTerminal();
        },

        joinSelectedLogTerminal() {
            if (!this.stack.name) {
                return;
            }

            const previousService = this.joinedLogService;
            const previousSince = this.joinedLogSince;
            const nextService = this.selectedLogService;
            const nextSince = this.selectedLogSince;

            if (previousService !== undefined) {
                this.$root.emitAgent(this.endpoint, "leaveStackLogsTerminal", this.stack.name, previousService, this.logTimestamps, previousSince, () => {});
            }

            this.$root.emitAgent(this.endpoint, "joinStackLogsTerminal", this.stack.name, nextService, this.logTimestamps, nextSince, (res) => {
                if (res.ok) {
                    this.joinedLogService = nextService;
                    this.joinedLogSince = nextSince;
                    this.$nextTick(() => {
                        this.$refs.combinedTerminal?.bind(this.endpoint, this.selectedLogTerminalName);
                    });
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        toggleLogTimestamps() {
            // Quitte l'ancien terminal (état ACTUEL avant bascule) et rejoint le nouveau
            const currentTs = this.logTimestamps;
            if (this.joinedLogService !== undefined) {
                this.$root.emitAgent(this.endpoint, "leaveStackLogsTerminal", this.stack.name, this.joinedLogService, currentTs, this.joinedLogSince, () => {});
            }
            this.logTimestamps = !currentTs;
            this.joinSelectedLogTerminal();
        },

        toggleLogLineWrap() {
            this.logLineWrap = !this.logLineWrap;
            localStorage.setItem("logLineWrap", String(this.logLineWrap));
        },

        searchLogs(previous) {
            const found = this.$refs.combinedTerminal?.search(this.logSearch, previous);
            if (this.logSearch && found === false) {
                this.$root.toastError(this.$t("logSearchNoMatch"));
            }
        },

        scheduleLogSearch() {
            if (this.logSearchTimer) {
                clearTimeout(this.logSearchTimer);
            }
            this.logSearchTimer = setTimeout(() => {
                this.logSearchTimer = null;
                this.$refs.combinedTerminal?.search(this.logSearch, false);
            }, 250);
        },

        loadVolumeUsage() {
            if (!this.stack.name) {
                return;
            }
            this.volumeUsageLoading = true;
            this.$root.emitAgent(this.endpoint, "getStackVolumeUsage", this.stack.name, (res) => {
                this.volumeUsageLoading = false;
                if (res.ok) {
                    this.volumeUsage = res.data ?? [];
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        volumeUsageForService(serviceName) {
            return this.volumeUsage
                .filter((item) => item.service === serviceName)
                .flatMap((item) => item.mounts ?? []);
        },

        toggleContainers() {
            this.containersExpanded = !this.containersExpanded;
            this.$nextTick(() => {
                this.$refs.combinedTerminal?.updateTerminalSize();
            });
        },

        containerStatusClass(state) {
            if (state === "healthy" || state === "noHealthcheck") {
                return "status-ok";
            }
            if (state === "unhealthy" || state === "stopped") {
                return "status-error";
            }
            if (state === "starting" || state === "restarting") {
                return "status-warning";
            }
            return "status-neutral";
        },

        normalizeLogServiceSelection() {
            if (this.selectedLogService && !this.logServiceOptions.includes(this.selectedLogService)) {
                this.selectedLogService = "";
                this.joinSelectedLogTerminal();
            }
        },

        imageUpdateForService(serviceName) {
            const image = this.envsubstJSONConfig?.services?.[serviceName]?.image;
            if (!image || !this.stack.name) {
                return null;
            }

            return this.imageStatuses.find((status) =>
                status.stack === this.stack.name
                && status.image === image
                && status.hasUpdate
                && !status.error
            ) ?? null;
        },

        autoUpdateForService(serviceName) {
            const image = this.envsubstJSONConfig?.services?.[serviceName]?.image;
            if (!image || !this.stack.name || this.endpoint) {
                return null;
            }
            return this.autoUpdateFor(this.stack.name, image);
        },

        async setServiceAutoUpdate(serviceName, { mode, time }) {
            const image = this.envsubstJSONConfig?.services?.[serviceName]?.image;
            if (!image || !this.stack.name) {
                return;
            }

            this.autoUpdateSaving[serviceName] = true;
            const result = await this.saveAutoUpdateMode(this.stack.name, image, mode, time);
            this.autoUpdateSaving[serviceName] = false;
            this.$root.toastRes({
                ok: result.ok,
                msg: result.ok ? this.$t("watcher.status.autoUpdateSaved") : result.message,
            });
        },

        runServiceAction(serviceName, action) {
            if ([ "recreate", "pull-recreate" ].includes(action) && !confirm(this.$t(action === "recreate" ? "recreateStackMsg" : "pullAndRecreateStackMsg"))) {
                return;
            }
            this.serviceActionProcessing[serviceName] = true;
            this.$root.emitAgent(this.endpoint, "serviceAction", this.stack.name, serviceName, action, (res) => {
                this.serviceActionProcessing[serviceName] = false;
                this.$root.toastRes(res);
                if (res.ok) {
                    this.loadStack();
                }
            });
        },

        resizeCombinedTerminal() {
            localStorage.setItem("terminalScale", this.terminalScale);
            this.$nextTick(() => this.$refs.combinedTerminal?.updateTerminalSize());
        },

        loadStack() {
            this.processing = true;
            this.$root.emitAgent(this.endpoint, "getStack", this.stack.name, (res) => {
                if (res.ok) {
                    this.stack = res.stack;
                    this.yamlCodeChange();
                    this.processing = false;
                    this.bindTerminal();
                    this.loadVolumeUsage();
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        deployStack() {
            this.processing = true;

            if (!this.jsonConfig.services) {
                this.$root.toastError("No services found in compose.yaml");
                this.processing = false;
                return;
            }

            // Check if services is object
            if (typeof this.jsonConfig.services !== "object") {
                this.$root.toastError("Services must be an object");
                this.processing = false;
                return;
            }

            let serviceNameList = Object.keys(this.jsonConfig.services);

            // Set the stack name if empty, use the first container name
            if (!this.stack.name && serviceNameList.length > 0) {
                let serviceName = serviceNameList[0];
                let service = this.jsonConfig.services[serviceName];

                if (service && service.container_name) {
                    this.stack.name = service.container_name;
                } else {
                    this.stack.name = serviceName;
                }
            }

            this.bindTerminal();

            this.$root.emitAgent(this.stack.endpoint, "deployStack", this.stack.name, this.stack.composeYAML, this.stack.composeENV, this.isAdd, this.stack.composeOverrideYAML ?? "", (res) => {
                this.processing = false;
                this.$root.toastRes(res);

                if (res.ok) {
                    this.isEditMode = false;
                    this.$router.push(this.url);
                }
            });
        },

        saveStack() {
            this.processing = true;

            this.$root.emitAgent(this.stack.endpoint, "saveStack", this.stack.name, this.stack.composeYAML, this.stack.composeENV, this.isAdd, this.stack.composeOverrideYAML ?? "", (res) => {
                this.processing = false;
                this.$root.toastRes(res);

                if (res.ok) {
                    this.isEditMode = false;
                    this.$router.push(this.url);
                }
            });
        },

        startStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "startStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        stopStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "stopStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        downStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "downStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        restartStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "restartStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        recreateStack() {
            if (!confirm(this.$t("recreateStackMsg"))) {
                return;
            }
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "recreateStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        updateStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "updateStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        pullAndRecreateStack() {
            if (!confirm(this.$t("pullAndRecreateStackMsg"))) {
                return;
            }
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "pullAndRecreateStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        buildAndRecreateStack() {
            if (!confirm(this.$t("buildAndRecreateStackMsg", { services: this.buildServices.join(", ") }))) {
                return;
            }
            this.processing = true;
            this.$root.emitAgent(this.endpoint, "buildAndRecreateStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        saveStackNote() {
            this.noteSaving = true;
            this.$root.emitAgent(this.endpoint, "saveStackNote", this.stack.name, this.stack.note ?? "", (res) => {
                this.noteSaving = false;
                this.$root.toastRes(res);
                if (res.ok) {
                    this.stack.note = res.note;
                }
            });
        },

        openStackTransfer(operation) {
            this.$refs.stackTransferModal?.open(operation);
        },

        openStackReplication(policy = null) {
            if (policy) {
                this.$refs.stackTransferModal?.open("replicate", policy);
                return;
            }
            this.$root.getSocket().emit("listStackReplications", this.endpoint, this.stack.name, response => {
                this.$refs.stackTransferModal?.open("replicate", response?.ok ? response.data[0] || null : null);
            });
        },

        stackTransferCompleted() {
            this.$refs.stackReplicationStatus?.load();
            this.$refs.pendingStackMoveStatus?.load();
        },

        deleteDialog() {
            const options = {
                removeFiles: this.deleteRemoveFiles,
                force: this.deleteForce,
            };
            this.$root.emitAgent(this.endpoint, "deleteStack", this.stack.name, options, (res) => {
                this.$root.toastRes(res);
                if (res.ok) {
                    if (options.removeFiles) {
                        this.$router.push("/");
                    } else {
                        // Fichiers conservés : la stack reste éditable, on recharge
                        this.discardStack();
                    }
                }
            });
        },

        toggleFullscreen(target) {
            this.fullscreenEditor = (this.fullscreenEditor === target) ? null : target;
            // Laisse CodeMirror se redimensionner après le changement de layout
            this.$nextTick(() => {
                window.dispatchEvent(new Event("resize"));
            });
        },

        /**
         * Pousse la liste des variables définies (.env) vers les éditeurs
         * CodeMirror pour la coloration définie/non définie.
         */
        applyDefinedVars() {
            let names = [];
            try {
                names = Object.keys(dotenv.parse(this.stack.composeENV || ""));
            } catch (e) {
                names = [];
            }
            for (const refName of [ "yamlEditor", "overrideEditor", "envEditor" ]) {
                const cm = this.$refs[refName];
                if (!cm) {
                    continue;
                }
                // `view` peut être exposé directement ou via une ref selon le contexte
                const view = (cm.view && cm.view.dispatch) ? cm.view : cm.view?.value;
                if (view && view.dispatch) {
                    view.dispatch({ effects: setDefinedVars.of(names) });
                }
            }
        },

        discardStack() {
            this.loadStack();
            this.isEditMode = false;
        },

        yamlToJSON(yaml) {
            let doc = parseDocument(yaml);
            if (doc.errors.length > 0) {
                throw doc.errors[0];
            }

            const config = doc.toJS() ?? {};

            // Check data types
            // "services" must be an object
            if (!config.services) {
                config.services = {};
            }

            if (Array.isArray(config.services) || typeof config.services !== "object") {
                throw new Error("Services must be an object");
            }

            return {
                config,
                doc,
            };
        },

        yamlCodeChange() {
            try {
                let { config, doc } = this.yamlToJSON(this.stack.composeYAML);

                this.yamlDoc = doc;
                this.jsonConfig = config;
                this.normalizeLogServiceSelection();

                let env = dotenv.parse(this.stack.composeENV);
                let envYAML = envsubstYAML(this.stack.composeYAML, env);
                this.envsubstJSONConfig = this.yamlToJSON(envYAML).config;

                clearTimeout(yamlErrorTimeout);
                this.yamlError = "";

                // Met à jour la coloration des variables définies/non définies
                this.$nextTick(() => this.applyDefinedVars());
            } catch (e) {
                clearTimeout(yamlErrorTimeout);

                if (this.yamlError) {
                    this.yamlError = e.message;

                } else {
                    yamlErrorTimeout = setTimeout(() => {
                        this.yamlError = e.message;
                    }, 3000);
                }
            }
        },

        enableEditMode() {
            this.containersExpanded = true;
            this.isEditMode = true;
        },

        checkYAML() {

        },

        addContainer() {
            this.checkYAML();

            if (this.jsonConfig.services[this.newContainerName]) {
                this.$root.toastError("Container name already exists");
                return;
            }

            if (!this.newContainerName) {
                this.$root.toastError("Container name cannot be empty");
                return;
            }

            this.jsonConfig.services[this.newContainerName] = {
                restart: "unless-stopped",
            };
            this.newContainerName = "";
            let element = this.$refs.containerList.lastElementChild;
            element.scrollIntoView({
                block: "start",
                behavior: "smooth"
            });
        },

        stackNameToLowercase() {
            this.stack.name = this.stack?.name?.toLowerCase();
        },

    }
};
</script>

<style scoped lang="scss">
@import "../styles/vars.scss";

.terminal {
    height: 200px;
}

.stack-action-bar {
    display: flex;
    flex-wrap: wrap;
    gap: .45rem;
}

.stack-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.65rem;
    height: 2.45rem;
    padding: 0;
    border-radius: .55rem;
    font-size: 1rem;
}

.stack-action-label {
    display: none;
}

.stack-action-bar--labeled .stack-action {
    flex-direction: column;
    gap: .18rem;
    width: auto;
    min-width: 5.5rem;
    min-height: 3.75rem;
    height: auto;
    padding: .35rem .5rem;
}

.stack-action-bar--labeled .stack-action-label {
    display: block;
    max-width: 7.5rem;
    font-size: .66rem;
    font-weight: 500;
    line-height: 1.05;
    text-align: center;
    white-space: normal;
}

.stack-scheduler-inline {
    padding: 8px 12px;
    border: 1px solid rgba(127, 127, 127, 0.18);
    border-radius: 8px;
}

.stack-scheduler-inline-title {
    color: $dark-font-color3;
    font-size: 0.78rem;
    font-weight: 600;
}

.stack-note-panel {
    padding: 0;
}

.stack-note-toggle {
    display: flex;
    width: 100%;
    min-height: 48px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
}

.stack-note-toggle:hover .settings-subheading,
.stack-note-toggle:focus-visible .settings-subheading {
    color: $primary;
}

.stack-note-toggle:focus-visible {
    outline: 2px solid $primary;
    outline-offset: -2px;
}

.stack-note-chevron {
    color: $dark-font-color3;
    transition: transform 0.2s ease;
}

.stack-note-chevron.is-expanded {
    transform: rotate(180deg);
}

.stack-note-content {
    padding: 0 16px 16px;
}

.stack-note-input::placeholder {
    color: #9ca3af;
    opacity: 1;
}

/* Terminal de progression (deploy/restart/update) : plus haut pour afficher
   davantage de conteneurs avant que Docker Compose ne tronque en "... N more".
   Docker Compose se cale sur le nombre de lignes du PTY (≈ hauteur de l'encart). */
.progress-terminal {
    height: 360px;
    :deep(.main-terminal) {
        overflow-y: auto;
    }
}

.compose-page {
    font-size: .94rem;

    :deep(.shadow-box) {
        padding: 12px;
    }

    :deep(.mb-3) {
        margin-bottom: .7rem !important;
    }

    :deep(.big-padding) {
        padding: 14px;
    }
}

.compose-workspace {
    display: grid;
    align-items: start;
    width: 100%;
}

.compose-runtime-pane,
.compose-editor-pane {
    min-width: 0;
}

.compose-resize-handle {
    align-self: stretch;
    min-height: 240px;
    cursor: col-resize;
    display: flex;
    justify-content: center;
    touch-action: none;
    outline: none;

    span {
        width: 3px;
        height: 100%;
        min-height: 240px;
        border-radius: 2px;
        background: rgba(127, 127, 127, .28);
        transition: width .15s ease, background-color .15s ease;
    }

    &:hover span,
    &:focus-visible span {
        width: 5px;
        background: $primary;
    }
}

:global(body.compose-resizing) {
    cursor: col-resize;
    user-select: none;
}

@media (max-width: 991.98px) {
    .compose-workspace {
        display: block;
    }

    .compose-resize-handle {
        display: none;
    }

    .compose-editor-pane {
        margin-top: .75rem;
    }
}

.terminal-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px 14px;
    gap: 12px;
    flex-wrap: wrap;
}

.containers-toggle {
    width: 100%;
    min-height: 34px;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    text-align: left;
}

.containers-toggle:hover .containers-toggle-title {
    color: $primary;
}

.containers-toggle-title {
    font-size: 1.25rem;
    font-weight: 500;
}

.containers-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    margin-left: 6px;
    padding: 0 7px;
    border-radius: 50rem;
    font-size: 0.75rem;
    color: $dark-font-color3;
    background: rgba(127, 127, 127, 0.14);
}

.containers-toggle-status {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    color: $dark-font-color3;
    font-size: 0.75rem;
}

.container-status-summary::before {
    content: "";
    display: inline-block;
    width: 7px;
    height: 7px;
    margin-right: 4px;
    border-radius: 50%;
    background: #6b7280;
}

.container-status-summary.status-ok::before {
    background: #16a34a;
}

.container-status-summary.status-error::before {
    background: #dc2626;
}

.container-status-summary.status-warning::before {
    background: #f8a306;
}

.combined-terminal {
    height: 315px;
    width: 100%;
    padding: 0;
    overflow: hidden;
}

.combined-terminal.logs-no-wrap {
    overflow-x: auto;
    overflow-y: hidden;
}

.combined-terminal.logs-expanded {
    height: clamp(340px, 38vh, 420px);
}

.logs-panel.logs-fullscreen {
    position: fixed;
    inset: 0;
    z-index: 1055;
    padding: 12px;
    overflow: hidden;
    background: #fff;

    .dark & {
        background: $dark-bg;
    }

    .combined-terminal {
        height: calc(100vh - 102px) !important;
        margin-bottom: 0 !important;
    }
}

@media (max-width: 575px) {
    .container-status-summary {
        display: none;
    }

    .combined-terminal.logs-expanded {
        height: min(45vh, 360px);
    }
}

.terminal-toolbar-right {
    display: grid;
    grid-template-columns: minmax(180px, 1.2fr) minmax(110px, .7fr) minmax(150px, 1fr);
    align-items: end;
    gap: 8px;
    width: 100%;
}

.terminal-service-filter,
.terminal-log-since {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;

    .form-label {
        color: #9ca3af !important;
    }

    .form-select {
        width: 100%;
    }
}

.terminal-log-search {
    grid-column: 1 / span 2;
    width: 100%;
}

.terminal-toolbar-right > .btn {
    justify-self: start;
}

@media (max-width: 991.98px) {
    .terminal-toolbar {
        align-items: stretch;
    }

    .terminal-toolbar > h4 {
        width: 100%;
    }

    .terminal-toolbar-right {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }

    .terminal-service-filter {
        grid-column: 1 / -1;
    }

    .terminal-log-search {
        grid-column: 1 / -1;
        width: 100%;
    }

    .terminal-toolbar-right > .btn {
        justify-self: start;
    }

}

@media (max-width: 575.98px) {
    .terminal-toolbar-right {
        grid-template-columns: 1fr;
    }

    .terminal-log-search {
        grid-column: 1;
    }

    .terminal-service-filter {
        grid-column: 1;
    }
}

.stack-meta-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-top: 4px;
}

.stack-meta-item {
    font-size: 0.78rem;
    font-weight: 400;
    color: #9ca3af;
    cursor: default;
}

.editor-box {
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
}

.editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.editor-header-actions {
    display: flex;
    align-items: center;
    gap: 5px;
}

.editor-fullscreen-btn {
    font-size: 0.78rem;
    padding: 2px 10px;
}

.editor-box {
    position: relative;
}

.editor-box.editor-fullscreen {
    position: fixed;
    inset: 0;
    z-index: 1050;
    margin: 0;
    border-radius: 0;
    overflow: auto;
    padding: 32px 16px 16px;

    :deep(.cm-editor) {
        height: 100vh;
    }
}

.editor-fullscreen-close {
    position: absolute;
    top: 8px;
    right: 12px;
    z-index: 1060;
    font-size: 0.78rem;
    padding: 2px 10px;
}

.agent-name {
    font-size: 13px;
    color: $dark-font-color3;
}
</style>
