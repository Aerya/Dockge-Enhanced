<template>
    <button
        class="btn btn-sm btn-normal container-action"
        :class="{ labeled: showLabels }"
        :title="$t('containerFiles.title')"
        :aria-label="$t('containerFiles.title')"
        @click="open"
    >
        <font-awesome-icon icon="folder-open" /><span>{{
            $t("containerFiles.title")
        }}</span>
    </button>
    <BModal
        v-model="visible"
        :title="$t('containerFiles.title')"
        size="xl"
        hide-footer
        @hidden="clear"
    >
        <p class="alert alert-warning">{{ $t("containerFiles.warning") }}</p>
        <p class="small">{{ $t("containerFiles.requirements") }}</p>
        <label class="d-block mb-2">{{ $t("containerFiles.container") }}
            <select
                v-model="id"
                class="form-select"
                :disabled="busy"
                @change="load('/')"
            >
                <option
                    v-for="instance in choices"
                    :key="instance.id"
                    :value="instance.id"
                >
                    {{ instance.name }} · {{ instance.id.slice(0, 12) }} ·
                    {{ instance.state }}
                </option>
            </select>
        </label>
        <form class="d-flex gap-2 mb-3" @submit.prevent="load(path)">
            <input
                v-model="path"
                class="form-control"
                :aria-label="$t('containerFiles.path')"
                :disabled="busy"
            />
            <button class="btn btn-normal" :disabled="busy || !id">
                {{ $t("containerFiles.go") }}
            </button>
        </form>
        <p v-if="busy" role="status">{{ $t("loading") }}</p>
        <p v-if="error" class="alert alert-danger" role="alert">
            {{ $t(error) }}
        </p>
        <template v-if="file">
            <div class="d-flex flex-wrap gap-2 mb-2">
                <button
                    class="btn btn-normal"
                    :disabled="busy"
                    @click="load(directory)"
                >
                    {{ $t("containerFiles.back") }}
                </button>
                <button class="btn btn-normal" @click="download">
                    {{ $t("containerFiles.download") }}
                </button>
                <code>{{ file.path }}</code><span>{{ file.size }} B</span>
            </div>
            <pre v-if="preview !== null" class="file-preview">{{
                preview
            }}</pre>
            <p v-else>{{ $t("containerFiles.binary") }}</p>
        </template>
        <template v-else>
            <button
                class="btn btn-sm btn-normal mb-2"
                :disabled="busy || directory === '/'"
                @click="load(parent)"
            >
                ..
            </button>
            <p v-if="truncated" class="alert alert-warning">
                {{ $t("containerFiles.truncated") }}
            </p>
            <div class="table-responsive">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>{{ $t("name") }}</th>
                            <th>{{ $t("containerFiles.type") }}</th>
                            <th>{{ $t("containerFiles.size") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="entry in entries" :key="entry.name">
                            <td>
                                <button
                                    class="btn btn-link text-start p-0"
                                    :disabled="busy || entry.type === 'other'"
                                    @click="select(entry)"
                                >
                                    {{ entry.name }}
                                </button><button
                                    v-if="entry.type === 'link'"
                                    class="btn btn-sm btn-normal ms-2"
                                    :disabled="busy"
                                    @click="select({ ...entry, type: 'file' })"
                                >
                                    {{ $t("containerFiles.readLink") }}
                                </button>
                            </td>
                            <td>{{ $t("containerFiles." + entry.type) }}</td>
                            <td>{{ entry.size }} B</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </template>
    </BModal>
</template>
<script>
import { BModal } from "bootstrap-vue-next";
export default {
    components: { BModal },
    props: {
        showLabels: { type: Boolean,
            default: false },
        stackName: { type: String,
            required: true },
        serviceName: { type: String,
            required: true },
        endpoint: { type: String,
            default: "" },
    },
    data: () => ({
        visible: false,
        busy: false,
        error: "",
        choices: [],
        id: "",
        path: "/",
        directory: "/",
        entries: [],
        truncated: false,
        file: null,
        generation: 0,
        deadline: null,
    }),
    computed: {
        parent() {
            return this.directory.split("/").slice(0, -1).join("/") || "/";
        },
        preview() {
            if (!this.file) {
                return null;
            }
            const bytes = Uint8Array.from(atob(this.file.content), (c) =>
                c.charCodeAt(0),
            );
            if (bytes.includes(0)) {
                return null;
            }
            try {
                return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
            } catch {
                return null;
            }
        },
    },
    watch: {
        stackName() {
            this.visible = false;
            this.clear();
        },
        endpoint() {
            this.visible = false;
            this.clear();
        },
    },
    beforeUnmount() {
        this.clear();
    },
    methods: {
        clear() {
            this.generation++;
            clearTimeout(this.deadline);
            this.busy = false;
            this.file = null;
            this.entries = [];
            this.error = "";
        },
        request(event, input, done) {
            this.busy = true;
            this.error = "";
            const generation = ++this.generation;
            clearTimeout(this.deadline);
            this.deadline = setTimeout(() => {
                if (generation === this.generation) {
                    this.generation++;
                    this.busy = false;
                    this.error = "containerFiles.unavailable";
                }
            }, 35000);
            this.$root.emitAgent(this.endpoint, event, input, (result) => {
                if (generation !== this.generation) {
                    return;
                }
                clearTimeout(this.deadline);
                this.busy = false;
                if (!result?.ok) {
                    this.error = result?.msg || "containerFiles.unavailable";
                    return;
                }
                done(result);
            });
        },
        open() {
            this.clear();
            this.visible = true;
            this.request("containerInstances", this.stackName, (result) => {
                this.choices = result.instances.filter(
                    (instance) => instance.service === this.serviceName,
                );
                this.id =
                    this.choices.find(
                        (instance) => instance.state === "running",
                    )?.id ||
                    this.choices[0]?.id ||
                    "";
                if (this.id) {
                    this.load("/");
                } else {
                    this.error = "containerFiles.stopped";
                }
            });
        },
        load(path) {
            this.request(
                "containerFilesRead",
                { stack: this.stackName,
                    id: this.id,
                    path,
                    action: "list" },
                (result) => {
                    this.file = null;
                    this.directory = result.data.path;
                    this.path = result.data.path;
                    this.entries = result.data.entries;
                    this.truncated = result.data.truncated;
                },
            );
        },
        select(entry) {
            const path = this.directory.replace(/\/$/, "") + "/" + entry.name;
            if (entry.type === "directory") {
                this.load(path);
                return;
            }
            if (entry.type === "link") {
                this.load(path);
                return;
            }
            this.request(
                "containerFilesRead",
                { stack: this.stackName,
                    id: this.id,
                    path,
                    action: "read" },
                (result) => {
                    this.file = result.data;
                },
            );
        },
        download() {
            const bytes = Uint8Array.from(atob(this.file.content), (c) =>
                c.charCodeAt(0),
            );
            const url = URL.createObjectURL(
                new Blob([ bytes ], { type: "application/octet-stream" }),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = this.file.path.split("/").at(-1) || "download";
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
    },
};
</script>
<style scoped>
.container-action { display: inline-flex; align-items: center; justify-content: center; min-width: 2.35rem; min-height: 2.15rem; gap: .2rem; }
.container-action span { display: none; }
.container-action.labeled { flex-direction: column; min-width: 5rem; min-height: 3.5rem; padding: .3rem .45rem; }
.container-action.labeled span { display: block; max-width: 7rem; font-size: var(--fs-xs); line-height: 1.05; white-space: normal; text-align: center; }
.file-preview {
    max-height: 50vh;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}
</style>
