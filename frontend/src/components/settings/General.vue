<template>
    <div>
        <form class="my-4" autocomplete="off" @submit.prevent="saveGeneral">
            <!-- Client side Timezone -->
            <div v-if="false" class="mb-4">
                <label for="timezone" class="form-label">
                    {{ $t("Display Timezone") }}
                </label>
                <select id="timezone" v-model="$root.userTimezone" class="form-select">
                    <option value="auto">
                        {{ $t("Auto") }}: {{ guessTimezone }}
                    </option>
                    <option
                        v-for="(timezone, index) in timezoneList"
                        :key="index"
                        :value="timezone.value"
                    >
                        {{ timezone.name }}
                    </option>
                </select>
            </div>

            <div class="mb-4">
                <label for="scheduling-timezone" class="form-label">
                    {{ $t("schedulingTimezone.label") }}
                </label>
                <select id="scheduling-timezone" v-model="settings.schedulingTimezone" class="form-select">
                    <option value="UTC">UTC</option>
                    <option v-if="settings.schedulingTimezone && !timezoneList.some(zone => zone.value === settings.schedulingTimezone) && settings.schedulingTimezone !== 'UTC'" :value="settings.schedulingTimezone">{{ settings.schedulingTimezone }}</option>
                    <option
                        v-for="(timezone, index) in timezoneList"
                        :key="index"
                        :value="timezone.value"
                    >
                        {{ timezone.name }}
                    </option>
                </select>
                <div class="form-text">{{ $t("schedulingTimezone.help") }}</div>
            </div>

            <div class="mb-4">
                <label class="form-label" for="port-link-address-mode">{{ $t("portLinks.label") }}</label>
                <select id="port-link-address-mode" v-model="settings.portLinkAddressMode" class="form-select">
                    <option value="hostname">{{ $t("portLinks.hostname") }}</option>
                    <option value="ip">{{ $t("portLinks.ip") }}</option>
                </select>
                <div class="form-text">{{ $t("portLinks.help") }}</div>
                <template v-if="settings.portLinkAddressMode === 'ip'">
                    <label class="form-label mt-2" for="port-link-ip">{{ $t("portLinks.explicitIp") }}</label>
                    <input id="port-link-ip" v-model="settings.portLinkIp" class="form-control" type="text" :placeholder="$t('portLinks.automatic')" />
                    <div class="form-text">{{ $t("portLinks.ipHelp") }}</div>
                </template>
            </div>

            <!-- Primary Hostname -->
            <div class="mb-4">
                <label class="form-label" for="primaryBaseURL">
                    {{ $t("primaryHostname") }}
                </label>

                <div class="input-group mb-3">
                    <input
                        v-model="settings.primaryHostname"
                        class="form-control"
                        :placeholder="$t(`CurrentHostname`)"
                    />
                    <button class="btn btn-outline-primary" type="button" @click="autoGetPrimaryHostname">
                        {{ $t("autoGet") }}
                    </button>
                </div>

                <div class="form-text"></div>
            </div>

            <div class="mb-4">
                <label class="form-label" for="default-compose-template">{{ $t("composeTemplate.heading") }}</label>
                <textarea id="default-compose-template" v-model="composeTemplateDraft" class="form-control font-monospace" rows="10" maxlength="65536" spellcheck="false" />
                <div class="form-text">{{ $t("composeTemplate.help") }}</div>
                <div v-if="templateError" class="text-danger mt-1" role="alert">{{ templateError }}</div>
            </div>

            <div class="mb-4">
                <label class="form-label" for="default-env-template">{{ $t("composeTemplate.envHeading") }}</label>
                <textarea id="default-env-template" v-model="composeEnvTemplateDraft" class="form-control font-monospace" rows="6" maxlength="65536" spellcheck="false" />
                <div class="form-text">{{ $t("composeTemplate.envHelp") }}</div>
            </div>

            <!-- Save Button -->
            <div>
                <button class="btn btn-primary" type="submit">
                    {{ $t("Save") }}
                </button>
            </div>
        </form>
    </div>
</template>

<script>

import { DEFAULT_COMPOSE_ENV, MAX_COMPOSE_TEMPLATE_BYTES } from "../../../../common/compose-templates";
import dayjs from "dayjs";
import { parseDocument } from "yaml";
import { timezoneList } from "../../util-frontend";

const defaultComposeTemplate = "services:\n  nginx:\n    image: nginx:latest\n    restart: unless-stopped\n    ports:\n      - \"8080:80\"\n";

export default {
    components: {

    },

    setup() {
        return {};
    },

    data() {
        return {
            timezoneList: timezoneList().filter(zone => zone.value !== "UTC"),
            originalSchedulingTimezone: "",
            composeTemplateDraft: defaultComposeTemplate,
            composeEnvTemplateDraft: DEFAULT_COMPOSE_ENV,
            templateError: "",
        };
    },

    computed: {
        settings() {
            return this.$parent.$parent.$parent.settings;
        },
        saveSettings() {
            return this.$parent.$parent.$parent.saveSettings;
        },
        settingsLoaded() {
            return this.$parent.$parent.$parent.settingsLoaded;
        },
        guessTimezone() {
            return dayjs.tz.guess();
        }
    },

    watch: {
        settingsLoaded: {
            immediate: true,
            handler(loaded) {
                if (loaded) {
                    this.composeTemplateDraft = this.settings.composeTemplate || defaultComposeTemplate;
                    this.composeEnvTemplateDraft = this.settings.composeEnvTemplate ?? DEFAULT_COMPOSE_ENV;
                    this.originalSchedulingTimezone = this.settings.schedulingTimezone;
                }
            },
        },
    },

    methods: {
        /** Save the settings */
        saveGeneral() {
            if (new TextEncoder().encode(this.composeEnvTemplateDraft).length > MAX_COMPOSE_TEMPLATE_BYTES || this.composeEnvTemplateDraft.includes("\0")) {
                this.templateError = this.$t("composeTemplate.envInvalid");
                return;
            }
            const doc = parseDocument(this.composeTemplateDraft);
            if (doc.errors.length || !doc.has("services") || new TextEncoder().encode(this.composeTemplateDraft).length > MAX_COMPOSE_TEMPLATE_BYTES) {
                this.templateError = this.$t("composeTemplate.invalid");
                return;
            }
            this.templateError = "";
            if (this.settings.schedulingTimezone !== this.originalSchedulingTimezone &&
                !window.confirm(this.$t("schedulingTimezone.confirm", { timezone: this.settings.schedulingTimezone }))) {
                return;
            }
            this.settings.composeTemplate = this.composeTemplateDraft;
            this.settings.composeEnvTemplate = this.composeEnvTemplateDraft;
            localStorage.timezone = this.$root.userTimezone;
            this.saveSettings();
        },
        /** Get the base URL of the application */
        autoGetPrimaryHostname() {
            this.settings.primaryHostname = location.hostname;
        },
    },
};
</script>
