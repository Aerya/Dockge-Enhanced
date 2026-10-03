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

            <!-- Server Timezone -->
            <div v-if="false" class="mb-4">
                <label for="timezone" class="form-label">
                    {{ $t("Server Timezone") }}
                </label>
                <select id="timezone" v-model="settings.serverTimezone" class="form-select">
                    <option value="UTC">UTC</option>
                    <option
                        v-for="(timezone, index) in timezoneList"
                        :key="index"
                        :value="timezone.value"
                    >
                        {{ timezone.name }}
                    </option>
                </select>
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

import dayjs from "dayjs";
import { parseDocument } from "yaml";

const defaultComposeTemplate = "services:\n  nginx:\n    image: nginx:latest\n    restart: unless-stopped\n    ports:\n      - \"8080:80\"\n";

export default {
    components: {

    },

    setup() {
        return {};
    },

    data() {
        return {
            timezoneList: [],
            composeTemplateDraft: defaultComposeTemplate,
            templateError: "",
        };
    },

    watch: {
        settingsLoaded: {
            immediate: true,
            handler(loaded) {
                if (loaded) {
                    this.composeTemplateDraft = this.settings.composeTemplate || defaultComposeTemplate;
                }
            },
        },
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

    methods: {
        /** Save the settings */
        saveGeneral() {
            const doc = parseDocument(this.composeTemplateDraft);
            if (doc.errors.length || !doc.has("services") || this.composeTemplateDraft.length > 65536) {
                this.templateError = this.$t("composeTemplate.invalid");
                return;
            }
            this.templateError = "";
            this.settings.composeTemplate = this.composeTemplateDraft;
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
