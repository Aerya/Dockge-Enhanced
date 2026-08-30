<template>
    <div>
        <h1 v-show="show" class="mb-3">
            {{ $t("Settings") }}
        </h1>

        <div class="shadow-box shadow-box-settings">
            <div class="row">
                <div v-if="showSubMenu" class="settings-menu col-lg-3 col-md-5">
                    <router-link
                        v-for="(item, key) in subMenus"
                        :key="key"
                        :to="`/settings/${key}`"
                    >
                        <div class="menu-item">
                            {{ item.title }}
                        </div>
                    </router-link>
                </div>
                <div class="settings-content col-lg-9 col-md-7">
                    <div v-if="currentPage" class="settings-content-header">
                        {{ subMenus[currentPage].title }}
                    </div>
                    <div class="mx-3">
                        <router-view v-slot="{ Component }">
                            <transition name="slide-fade" appear>
                                <component :is="Component" />
                            </transition>
                        </router-view>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
export default {
    data() {
        return {
            show: true,
            settings: {},
            settingsLoaded: false,
        };
    },

    computed: {
        currentPage() {
            const name = this.$route.name;
            if (typeof name === "string" && name.startsWith("settings-")) {
                return name.slice("settings-".length);
            }
            return null;
        },

        showSubMenu() {
            // On mobile the settings sections live directly in the
            // navigation drawer, so the side menu is desktop-only.
            return !this.$root.isMobile;
        },

        subMenus() {
            return {
                general: {
                    title: this.$t("general"),
                },
                appearance: {
                    title: this.$t("Appearance"),
                },
                security: {
                    title: this.$t("Security"),
                },
                globalEnv: {
                    title: this.$t("GlobalEnv"),
                },
                integrations: {
                    title: this.$t("Integrations"),
                },
                automation: {
                    title: this.$t("automation.heading"),
                },
                about: {
                    title: this.$t("About"),
                },
            };
        },
    },

    watch: {
        "$root.isMobile"() {
            this.loadGeneralPage();
        }
    },

    mounted() {
        this.loadSettings();
        this.loadGeneralPage();
    },

    methods: {

        /**
         * Redirect bare /settings to the general page
         */
        loadGeneralPage() {
            if (!this.currentPage) {
                this.$router.push("/settings/general");
            }
        },

        /** Load settings from server */
        loadSettings() {
            this.$root.getSocket().emit("getSettings", (res) => {
                this.settings = res.data;
                if (this.settings.checkUpdate === undefined) {
                    this.settings.checkUpdate = true;
                }
                this.settingsLoaded = true;
            });
        },

        /**
         * Callback for saving settings
         * @callback saveSettingsCB
         * @param {Object} res Result of operation
         */

        /**
         * Save Settings
         * @param {saveSettingsCB} [callback]
         * @param {string} [currentPassword] Only need for disableAuth to true
         */
        saveSettings(callback, currentPassword) {
            let valid = this.validateSettings();
            if (valid.success) {
                this.$root.getSocket().emit("setSettings", this.settings, currentPassword, (res) => {
                    this.$root.toastRes(res);
                    this.loadSettings();

                    if (callback) {
                        callback();
                    }
                });
            } else {
                this.$root.toastError(valid.msg);
            }
        },

        /**
         * Ensure settings are valid
         * @returns {Object} Contains success state and error msg
         */
        validateSettings() {
            if (this.settings.keepDataPeriodDays < 0) {
                return {
                    success: false,
                    msg: this.$t("dataRetentionTimeError"),
                };
            }
            return {
                success: true,
                msg: "",
            };
        },
    }
};
</script>

<style lang="scss" scoped>

.shadow-box-settings {
    padding: 20px;
    min-height: calc(100vh - 155px);
}

footer {
    color: var(--text-muted);
    font-size: var(--fs-sm);
    margin-top: 20px;
    padding-bottom: 30px;
    text-align: center;
}

.settings-menu {
    a {
        text-decoration: none !important;
    }

    .menu-item {
        border-radius: var(--radius-md);
        margin: 0.5em;
        padding: 0.7em 1em;
        cursor: pointer;
        border-left-width: 0;
        transition: all ease-in-out 0.1s;
    }

    .menu-item:hover {
        background: var(--primary-soft);
    }

    .active .menu-item {
        background: var(--primary-soft);
        border-left: 4px solid var(--primary);
        border-top-left-radius: 0;
        border-bottom-left-radius: 0;
    }
}

.settings-content {
    .settings-content-header {
        width: calc(100% + 20px);
        border-bottom: 1px solid var(--border-color);
        border-radius: 0 var(--radius-md) 0 0;
        margin-top: -20px;
        margin-right: -20px;
        padding: 12.5px 1em;
        font-size: var(--fs-xl);

        .dark & {
            background: var(--bg-raised);
            border-bottom: 0;
        }
    }
}
</style>
