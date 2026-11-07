<template>
    <section v-if="progress" class="shadow-box p-3 mb-3" aria-live="polite">
        <h5>
            {{ $t("deployment.title") }} —
            {{ $t("deployment." + progress.state) }}
        </h5>
        <p class="small">
            {{ new Date(progress.startedAt).toLocaleString() }} ·
            {{ $t("deployment.explanation") }}
        </p>
        <ol class="deployment-steps">
            <li v-for="step in phases" :key="step">
                <span>{{ stepState(step) }}</span>
                {{ $t("deployment." + step) }}
            </li>
        </ol>
        <p v-if="progress.state === 'interrupted'" class="alert alert-warning">
            {{ $t("deployment.interruptedHelp") }}
        </p>
        <p v-if="error" class="alert alert-warning">{{ $t(error) }}</p>
        <details v-if="progress.output">
            <summary>{{ $t("deployment.console") }}</summary>
            <p class="small">{{ $t("deployment.consoleWarning") }}</p>
            <pre class="deployment-console">{{ cleanOutput }}</pre>
        </details>
        <p v-else-if="progress.state !== 'running'" class="small">
            {{ $t("deployment.noConsole") }}
        </p>
        <div
            v-if="
                progress.saved &&
                    ['failed', 'interrupted'].includes(progress.state)
            "
        >
            <label class="d-block"><input v-model="confirmed" type="checkbox" />
                {{ $t("deployment.confirmRetry") }}</label>
            <button
                class="btn btn-normal mt-2"
                :disabled="!confirmed || retrying"
                @click="retry"
            >
                {{ $t("deployment.retry") }}
            </button>
        </div>
        <button v-if="error" class="btn btn-sm btn-normal mt-2" @click="poll">
            {{ $t("refresh") }}
        </button>
    </section>
</template>
<script>
export default {
    props: {
        stackName: { type: String,
            required: true },
        endpoint: { type: String,
            default: "" },
    },
    data: () => ({
        progress: null,
        error: "",
        confirmed: false,
        retrying: false,
        timer: null,
        deadline: null,
        generation: 0,
        failures: 0,
        disposed: false,
    }),
    computed: {
        endpointState() {
            return this.$root.agentStatusList?.[this.endpoint];
        },
        phases: () => [ "save", "prerequisites", "compose", "metadata" ],
        cleanOutput() {
            return (this.progress?.output || "").replace(
                /\u001b\[[0-9;?]*[A-Za-z]/g,
                "",
            );
        },
    },
    watch: {
        stackName: {
            immediate: true,
            handler() {
                this.reset();
            },
        },
        endpoint() {
            this.reset();
        },
        "$root.socketIO.connected"(connected) {
            if (connected) {
                this.failures = 0;
                this.poll();
            }
        },
        "$root.userAccess"(access) {
            if (access?.role === "admin") {
                this.failures = 0;
                this.poll();
            }
        },
        endpointState(state) {
            if (state === "online") {
                this.failures = 0;
                this.poll();
            }
        },
    },
    beforeUnmount() {
        this.disposed = true;
        this.generation++;
        clearTimeout(this.timer);
        clearTimeout(this.deadline);
    },
    methods: {
        reset() {
            this.generation++;
            this.progress = null;
            this.confirmed = false;
            this.retrying = false;
            this.failures = 0;
            this.error = "";
            clearTimeout(this.timer);
            clearTimeout(this.deadline);
            if (this.stackName) {
                this.poll();
            }
        },
        stepState(phase) {
            const step = this.progress.steps.find(
                (step) => step.phase === phase,
            );
            return step?.finishedAt
                ? "✓"
                : step
                    ? this.progress.state === "running"
                        ? "…"
                        : "!"
                    : "○";
        },
        poll() {
            if (this.disposed) {
                return;
            }
            clearTimeout(this.timer);
            clearTimeout(this.deadline);
            const generation = ++this.generation;
            const next = () => {
                this.timer = setTimeout(
                    () => this.poll(),
                    this.progress?.state === "running" ? 2000 : 10000,
                );
            };
            this.deadline = setTimeout(() => {
                if (generation !== this.generation) {
                    return;
                }
                this.generation++;
                this.failures++;
                this.error = "deployment.unavailable";
                // Bound retries against old/offline agents, without reloading the page.
                if (this.failures < 3) {
                    next();
                }
            }, 8000);
            this.$root.emitAgent(
                this.endpoint,
                "deploymentStatus",
                this.stackName,
                (result) => {
                    if (generation !== this.generation) {
                        return;
                    }
                    clearTimeout(this.deadline);
                    if (result?.ok) {
                        if (this.progress?.id !== result.progress?.id) {
                            this.confirmed = false;
                            this.retrying = false;
                        }
                        this.progress = result.progress;
                        if (this.progress?.state !== "running") {
                            this.retrying = false;
                        }
                        this.error = "";
                        this.failures = 0;
                        next();
                    } else {
                        this.error = result?.msg || "deployment.unavailable";
                        this.failures++;
                        if (this.failures < 3) {
                            next();
                        }
                    }
                },
            );
        },
        retry() {
            this.retrying = true;
            this.confirmed = false;
            const stackName = this.stackName;
            const endpoint = this.endpoint;
            this.$root.emitAgent(
                this.endpoint,
                "deploymentRetry",
                this.stackName,
                this.progress.id,
                (result) => {
                    if (
                        this.stackName !== stackName ||
                        this.endpoint !== endpoint
                    ) {
                        return;
                    }
                    this.retrying = false;
                    if (!result?.ok) {
                        this.error = result?.msg || "deployment.unavailable";
                    }
                    this.poll();
                },
            );
            this.poll();
        },
    },
};
</script>
<style scoped>
.deployment-steps {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 24px;
    list-style: none;
    padding: 0;
}
.deployment-console {
    max-height: 260px;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}
</style>
