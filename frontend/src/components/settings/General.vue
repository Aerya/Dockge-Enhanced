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

            <!-- Stats par stack -->
            <div class="mb-4">
                <div class="form-check form-switch">
                    <input
                        id="stackStatsEnabled"
                        v-model="localStackStatsEnabled"
                        class="form-check-input"
                        type="checkbox"
                        role="switch"
                    />
                    <label class="form-check-label" for="stackStatsEnabled">
                        Afficher les stats CPU / RAM par stack
                    </label>
                </div>
                <div class="form-text">Affiche la consommation de chaque compose dans la liste (mis à jour toutes les 10 s).</div>
            </div>

            <!-- Partition disque à surveiller -->
            <div class="mb-4">
                <label class="form-label" for="diskPartition">
                    <font-awesome-icon icon="floppy-disk" class="me-1" /> Partition disque surveillée
                </label>
                <input
                    id="diskPartition"
                    v-model="settings.diskPartition"
                    class="form-control"
                    placeholder="/"
                    style="max-width: 260px"
                />
                <div class="form-text">Partition affichée dans la barre de navigation (ex : <code>/</code>, <code>/mnt/data</code>).</div>
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
import { ref, watch } from "vue";
import { timezoneList } from "../../util-frontend";
import { stackStatsEnabled } from "../../composables/useStackStats";

export default {
    components: {

    },

    setup() {
        // Copie locale liée au toggle UI — on sync avec le ref global au save
        const localStackStatsEnabled = ref(stackStatsEnabled.value);
        watch(localStackStatsEnabled, (val) => {
            stackStatsEnabled.value = val;
            localStorage.setItem("stackStatsEnabled", String(val));
        });
        return { localStackStatsEnabled };
    },

    data() {
        return {
            timezoneList: timezoneList(),
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

    methods: {
        /** Save the settings */
        saveGeneral() {
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

