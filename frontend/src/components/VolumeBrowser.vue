<template>
    <BModal v-model="visible" size="xl" :title="modalTitle" :ok-only="true" :ok-title="$t('close')" @hidden="onHidden">
        <div v-if="error" class="alert alert-danger py-2">{{ error }}</div>

        <!-- Vue éditeur -->
        <div v-if="editing">
            <div class="vb-toolbar mb-2">
                <button class="btn btn-sm btn-normal me-2" @click="closeEditor">
                    <font-awesome-icon icon="chevron-right" flip="horizontal" class="me-1" />{{ $t("back") }}
                </button>
                <code class="vb-editing-path">{{ editing.path }}</code>
                <div class="ms-auto">
                    <button class="btn btn-sm btn-primary" :disabled="saving || !editing.dirty" @click="saveFile">
                        <font-awesome-icon icon="floppy-disk" class="me-1" />{{ $t("Save") }}
                    </button>
                </div>
            </div>
            <div class="shadow-box vb-editor-box">
                <code-mirror
                    v-model="editing.content"
                    :extensions="extensions"
                    minimal
                    wrap="true"
                    dark="true"
                    tab="true"
                    @change="editing.dirty = true"
                />
            </div>
        </div>

        <!-- Vue navigation -->
        <div v-else>
            <!-- Sélecteur de volume -->
            <div class="mb-2">
                <span class="form-text me-2">{{ $t("volumeBrowserVolume") }}</span>
                <span v-if="mounts.length === 0 && !loading" class="form-text fst-italic">{{ $t("volumeBrowserNoVolume") }}</span>
                <button
                    v-for="m in mounts"
                    :key="m.destination"
                    class="btn btn-sm me-2 mb-1"
                    :class="m.destination === rootPath ? 'btn-primary' : 'btn-normal'"
                    :title="m.source + (m.rw ? '' : ' (ro)')"
                    @click="openMount(m)"
                >
                    <font-awesome-icon icon="folder" class="me-1" />{{ m.destination }}
                    <span v-if="!m.rw" class="badge bg-secondary ms-1">ro</span>
                </button>
            </div>

            <!-- Fil d'Ariane -->
            <div v-if="rootPath" class="vb-breadcrumb mb-2">
                <span v-for="(crumb, i) in breadcrumbs" :key="i">
                    <a href="#" @click.prevent="goTo(crumb.path)">{{ crumb.label }}</a>
                    <span v-if="i < breadcrumbs.length - 1" class="vb-sep">/</span>
                </span>
            </div>

            <div v-if="loading" class="text-center py-3">
                <font-awesome-icon icon="spinner" spin /> {{ $t("loading") }}
            </div>

            <div v-else-if="rootPath" class="vb-list">
                <div v-if="entries.length === 0" class="form-text fst-italic py-2">{{ $t("volumeBrowserEmpty") }}</div>
                <div
                    v-for="entry in entries"
                    :key="entry.name"
                    class="vb-row"
                    @click="onEntryClick(entry)"
                >
                    <font-awesome-icon :icon="entry.type === 'dir' ? 'folder' : 'file'" class="me-2" :class="entry.type === 'dir' ? 'vb-dir' : 'vb-file'" />
                    <span>{{ entry.name }}</span>
                </div>
            </div>
        </div>
    </BModal>
</template>

<script>
import { BModal } from "bootstrap-vue-next";
import CodeMirror from "vue-codemirror6";
import { dracula as editorTheme } from "thememirror";
import { lineNumbers } from "@codemirror/view";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";

export default {
    components: {
        BModal,
        CodeMirror,
        FontAwesomeIcon,
    },
    props: {
        stackName: {
            type: String,
            required: true,
        },
        serviceName: {
            type: String,
            required: true,
        },
        endpoint: {
            type: String,
            default: "",
        },
    },
    setup() {
        const extensions = [ editorTheme, lineNumbers() ];
        return { extensions };
    },
    data() {
        return {
            visible: false,
            loading: false,
            saving: false,
            error: "",
            mounts: [],
            rootPath: "",
            currentPath: "",
            entries: [],
            editing: null,
        };
    },
    computed: {
        modalTitle() {
            return `${this.serviceName} — ${this.$t("volumeBrowserTitle")}`;
        },
        breadcrumbs() {
            if (!this.rootPath) {
                return [];
            }
            // Segments depuis la racine du volume jusqu'au dossier courant
            const rel = this.currentPath.slice(this.rootPath.length).replace(/^\/+/, "");
            const parts = rel ? rel.split("/").filter(Boolean) : [];
            const crumbs = [ { label: this.rootPath, path: this.rootPath } ];
            let acc = this.rootPath;
            for (const p of parts) {
                acc = acc.replace(/\/+$/, "") + "/" + p;
                crumbs.push({ label: p, path: acc });
            }
            return crumbs;
        },
    },
    methods: {
        open() {
            this.visible = true;
            this.error = "";
            this.editing = null;
            this.rootPath = "";
            this.currentPath = "";
            this.entries = [];
            this.loadMounts();
        },
        onHidden() {
            this.editing = null;
        },
        loadMounts() {
            this.loading = true;
            this.$root.emitAgent(this.endpoint, "volumeMounts", this.stackName, this.serviceName, (res) => {
                this.loading = false;
                if (res.ok) {
                    this.mounts = res.mounts ?? [];
                    if (this.mounts.length === 1) {
                        this.openMount(this.mounts[0]);
                    }
                } else {
                    this.error = res.msg ?? "Error";
                }
            });
        },
        openMount(m) {
            this.rootPath = m.destination;
            this.goTo(m.destination);
        },
        goTo(dirPath) {
            this.currentPath = dirPath;
            this.loadDir();
        },
        loadDir() {
            this.loading = true;
            this.error = "";
            this.$root.emitAgent(this.endpoint, "volumeListDir", this.stackName, this.serviceName, this.currentPath, (res) => {
                this.loading = false;
                if (res.ok) {
                    this.entries = res.entries ?? [];
                } else {
                    this.error = res.msg ?? "Error";
                }
            });
        },
        onEntryClick(entry) {
            const sep = this.currentPath.endsWith("/") ? "" : "/";
            const fullPath = this.currentPath + sep + entry.name;
            if (entry.type === "dir") {
                this.goTo(fullPath);
            } else {
                this.openFile(fullPath);
            }
        },
        openFile(filePath) {
            this.loading = true;
            this.error = "";
            this.$root.emitAgent(this.endpoint, "volumeReadFile", this.stackName, this.serviceName, filePath, (res) => {
                this.loading = false;
                if (res.ok) {
                    this.editing = {
                        path: filePath,
                        content: res.content ?? "",
                        dirty: false,
                    };
                } else {
                    this.error = res.msg ?? "Error";
                }
            });
        },
        saveFile() {
            if (!this.editing) {
                return;
            }
            this.saving = true;
            this.$root.emitAgent(this.endpoint, "volumeWriteFile", this.stackName, this.serviceName, this.editing.path, this.editing.content, (res) => {
                this.saving = false;
                this.$root.toastRes(res);
                if (res.ok) {
                    this.editing.dirty = false;
                }
            });
        },
        closeEditor() {
            if (this.editing && this.editing.dirty && !confirm(this.$t("volumeBrowserDiscard"))) {
                return;
            }
            this.editing = null;
        },
    },
};
</script>

<style scoped lang="scss">
.vb-toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
}

.vb-editing-path {
    font-size: 0.8rem;
    word-break: break-all;
}

.vb-editor-box {
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    max-height: 60vh;
    overflow: auto;
}

.vb-breadcrumb {
    font-size: 0.85rem;
    a {
        text-decoration: none;
    }
    .vb-sep {
        margin: 0 4px;
        opacity: 0.5;
    }
}

.vb-list {
    max-height: 55vh;
    overflow-y: auto;
    border-top: 1px solid rgba(0, 0, 0, 0.08);
}

.vb-row {
    padding: 5px 8px;
    cursor: pointer;
    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
    &:hover {
        background: rgba(0, 0, 0, 0.05);
    }
}

.vb-dir {
    color: #f0b429;
}

.vb-file {
    color: #6c757d;
}
</style>
