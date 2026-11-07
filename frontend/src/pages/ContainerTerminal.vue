<template>
    <transition name="slide-fade" appear>
        <div>
            <router-link :to="backTo" class="back-link">
                <font-awesome-icon icon="chevron-left" /> {{ $t("back") }}
            </router-link>
            <h1 class="mb-3">{{ $t("terminal") }} - {{ serviceName }} ({{ stackName }})</h1>

            <div class="mb-3">
                <label v-if="shellSession">
                    {{ $t("containerShell.choose") }}
                    <select class="form-select" :value="$route.params.type" @change="$router.push(shellRoute($event.target.value))">
                        <option value="default">{{ $t("containerShell.default") }} ({{ defaultShell }})</option>
                        <option v-for="choice in choices" :key="choice" :value="choice">{{ choice }}</option>
                    </select>
                </label>
                <router-link v-else-if="ready" :to="shellRoute('sh')" class="btn btn-normal me-2">{{ $t("Switch to sh") }}</router-link>
                <p v-if="ready && !shellSession" class="small text-muted">{{ $t("containerShell.legacy") }}</p>
                <p v-if="actualShell" class="small">{{ $t("containerShell.active") }}: {{ actualShell }}<span v-if="fallback"> — {{ $t("containerShell.fallback") }}</span></p>
            </div>

            <Terminal v-if="ready" :key="terminalName + shell" class="terminal" :rows="20" mode="interactive" :name="terminalName" :stack-name="stackName" :service-name="serviceName" :shell="shell" :shell-session="shellSession" :endpoint="endpoint" @shell-ready="shellReady"></Terminal>
        </div>
    </transition>
</template>

<script>
import { getContainerExecTerminalName } from "../../../common/util-common";
import { CONTAINER_SHELLS, shellTerminalName, validContainerShell } from "../../../common/container-shell";

export default {
    components: {
    },
    data() {
        return {
            ready: false,
            shellSession: false,
            defaultShell: "sh",
            actualShell: "",
            fallback: false,
            generation: 0,
            optionsTimer: null,
        };
    },
    computed: {
        stackName() {
            return this.$route.params.stackName;
        },
        endpoint() {
            return this.$route.params.endpoint || "";
        },
        shell() {
            return !this.shellSession && this.$route.params.type === "default" ? "bash" : this.$route.params.type;
        },
        choices() {
            return [ ...new Set([ ...CONTAINER_SHELLS, this.defaultShell, this.$route.params.type ].filter(value => value !== "default" && validContainerShell(value))) ];
        },
        serviceName() {
            return this.$route.params.serviceName;
        },
        backTo() {
            let path = `/compose/${encodeURIComponent(this.stackName)}`;
            if (this.endpoint) {
                path += `/${encodeURIComponent(this.endpoint)}`;
            }
            return path;
        },
        terminalName() {
            const base = getContainerExecTerminalName(this.endpoint, this.stackName, this.serviceName, 0);
            return this.shellSession ? shellTerminalName(base, this.shell) : base;
        },
    },
    watch: {
        endpoint: { immediate: true,
            handler() {
                this.loadOptions();
            } },
        shell() {
            this.actualShell = "";
            this.fallback = false;
        },
    },
    beforeUnmount() {
        this.generation++;
        clearTimeout(this.optionsTimer);
    },
    methods: {
        shellRoute(shell) {
            return { name: this.endpoint ? "containerTerminalEndpoint" : "containerTerminal",
                params: { stackName: this.stackName,
                    serviceName: this.serviceName,
                    type: shell,
                    ...(this.endpoint ? { endpoint: this.endpoint } : {}) } };
        },
        loadOptions() {
            const generation = ++this.generation;
            clearTimeout(this.optionsTimer);
            this.ready = false;
            this.shellSession = false;
            this.actualShell = "";
            this.optionsTimer = setTimeout(() => {
                if (generation === this.generation) {
                    this.ready = true;
                }
            }, 3000);
            this.$root.emitAgent(this.endpoint, "containerShellOptions", result => {
                if (generation !== this.generation || this.ready) {
                    return;
                }
                clearTimeout(this.optionsTimer);
                this.shellSession = result?.ok === true && validContainerShell(result.defaultShell);
                this.defaultShell = this.shellSession ? result.defaultShell : "sh";
                this.ready = true;
            });
        },
        shellReady(result) {
            this.actualShell = result.shell || "";
            this.fallback = result.fallback === true;
        },
    }
};
</script>

<style scoped lang="scss">
.back-link {
    display: inline-block;
    margin-bottom: 0.5rem;
    font-size: var(--fs-sm);
    color: var(--text-muted);
    text-decoration: none;

    &:hover {
        color: var(--text-color);
    }
}

.terminal {
    height: min(410px, 60vh);
}
</style>
