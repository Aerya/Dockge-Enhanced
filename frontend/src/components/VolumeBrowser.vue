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
                    :extensions="editorExtensions"
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

            <!-- Fil d'Ariane + actions -->
            <div v-if="rootPath" class="vb-actions mb-2">
                <div class="vb-breadcrumb">
                    <span v-for="(crumb, i) in breadcrumbs" :key="i">
                        <a href="#" @click.prevent="goTo(crumb.path)">{{ crumb.label }}</a>
                        <span v-if="i < breadcrumbs.length - 1" class="vb-sep">/</span>
                    </span>
                </div>
                <div class="vb-actions-btns">
                    <button class="btn btn-sm btn-normal" :title="$t('volumeNewFile')" @click="createEntry('file')">
                        <font-awesome-icon icon="file" /> +
                    </button>
                    <button class="btn btn-sm btn-normal" :title="$t('volumeNewFolder')" @click="createEntry('dir')">
                        <font-awesome-icon icon="folder" /> +
                    </button>
                    <button class="btn btn-sm btn-normal" :title="$t('volumeUpload')" @click="triggerUpload">
                        <font-awesome-icon icon="upload" />
                    </button>
                    <input ref="uploadInput" type="file" class="d-none" @change="onUploadChange" />
                </div>
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
                    <span class="vb-name">{{ entry.name }}</span>
                    <span class="vb-row-actions">
                        <button class="btn btn-sm btn-link p-0 me-2" :title="$t('rename')" @click.stop="renameEntry(entry)">
                            <font-awesome-icon icon="pen" />
                        </button>
                        <button class="btn btn-sm btn-link p-0 text-danger" :title="$t('Delete')" @click.stop="deleteEntry(entry)">
                            <font-awesome-icon icon="trash" />
                        </button>
                    </span>
                </div>
            </div>
        </div>
    </BModal>
</template>

<script>
import { BModal } from "bootstrap-vue-next";
import CodeMirror from "vue-codemirror6";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { yaml } from "@codemirror/lang-yaml";
import { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
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
        editorExtensions() {
            const extensions = [ editorTheme, lineNumbers() ];
            const fileName = this.editing?.path?.split("/").pop()?.toLowerCase() ?? "";
            const extension = fileName.includes(".") ? fileName.split(".").pop() : "";

            if ([ "yaml", "yml" ].includes(extension)) {
                extensions.push(yaml());
            } else if ([ "json", "jsonc" ].includes(extension)) {
                extensions.push(json());
            } else if (extension === "py") {
                extensions.push(python());
            } else if ([ "sh", "bash", "zsh" ].includes(extension) || [ ".bashrc", ".zshrc", "dockerfile" ].includes(fileName)) {
                extensions.push(StreamLanguage.define(shell));
            } else if ([ "js", "mjs", "cjs", "jsx" ].includes(extension)) {
                extensions.push(javascript({ jsx: extension === "jsx" }));
            } else if ([ "ts", "mts", "cts", "tsx" ].includes(extension)) {
                extensions.push(javascript({
                    typescript: true,
                    jsx: extension === "tsx",
                }));
            }

            return extensions;
        },
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
            const crumbs = [{
                label: this.rootPath,
                path: this.rootPath,
            }];
            let acc = this.rootPath;
            for (const p of parts) {
                acc = acc.replace(/\/+$/, "") + "/" + p;
                crumbs.push({
                    label: p,
                    path: acc,
                });
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

        fullPath(name) {
            const sep = this.currentPath.endsWith("/") ? "" : "/";
            return this.currentPath + sep + name;
        },

        createEntry(kind) {
            const label = kind === "dir" ? this.$t("volumeNewFolder") : this.$t("volumeNewFile");
            const name = prompt(label);
            if (!name) {
                return;
            }
            this.$root.emitAgent(this.endpoint, "volumeCreate", this.stackName, this.serviceName, this.currentPath, name, kind, (res) => {
                this.$root.toastRes(res);
                if (res.ok) {
                    this.loadDir();
                }
            });
        },

        renameEntry(entry) {
            const newName = prompt(this.$t("rename"), entry.name);
            if (!newName || newName === entry.name) {
                return;
            }
            this.$root.emitAgent(this.endpoint, "volumeRename", this.stackName, this.serviceName, this.fullPath(entry.name), newName, (res) => {
                this.$root.toastRes(res);
                if (res.ok) {
                    this.loadDir();
                }
            });
        },

        deleteEntry(entry) {
            if (!confirm(this.$t("volumeDeleteConfirm", { name: entry.name }))) {
                return;
            }
            this.$root.emitAgent(this.endpoint, "volumeDelete", this.stackName, this.serviceName, this.fullPath(entry.name), (res) => {
                this.$root.toastRes(res);
                if (res.ok) {
                    this.loadDir();
                }
            });
        },

        triggerUpload() {
            this.$refs.uploadInput?.click();
        },

        onUploadChange(event) {
            const file = event.target.files && event.target.files[0];
            event.target.value = "";
            if (!file) {
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                // reader.result = "data:...;base64,XXXX" → on garde la partie base64
                const result = String(reader.result);
                const base64 = result.includes(",") ? result.split(",")[1] : result;
                this.$root.emitAgent(this.endpoint, "volumeUpload", this.stackName, this.serviceName, this.currentPath, file.name, base64, (res) => {
                    this.$root.toastRes(res);
                    if (res.ok) {
                        this.loadDir();
                    }
                });
            };
            reader.readAsDataURL(file);
        },
    },
};
</script>

<style scoped lang="scss">
@import "../styles/vars.scss";

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

.vb-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
}

.vb-actions-btns {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
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
    display: flex;
    align-items: center;
    padding: 5px 8px;
    cursor: pointer;
    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
    &:hover {
        background: rgba(0, 0, 0, 0.05);
        .vb-row-actions {
            opacity: 1;
        }
    }
}

.vb-name {
    flex: 1;
    word-break: break-all;
    color: #212529;

    .dark & {
        color: $dark-font-color;
    }
}

.vb-row-actions {
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.1s;
}

.vb-dir {
    color: #f0b429;
}

.vb-file {
    color: #6c757d;

    .dark & {
        color: #9ca3af;
    }
}
</style>
