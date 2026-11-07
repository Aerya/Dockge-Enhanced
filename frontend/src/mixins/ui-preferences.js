import { defaultUiPreferences } from "../../../common/ui-preferences";
import { loadHiddenConsole } from "../console-navigation";

export default {
    data: () => ({
        uiPreferences: defaultUiPreferences(),
        uiPreferencesRevision: 0,
        uiPreferencesLoaded: false,
        uiPreferencesSaving: false,
        uiPreferencesError: "",
        uiPreferencesGeneration: 0,
    }),
    watch: {
        username() {
            this.uiPreferences = defaultUiPreferences();
            this.uiPreferencesLoaded = false;
            this.loadUiPreferences();
        },
        loggedIn() { this.loadUiPreferences(); },
        "userAccess.role"() { this.loadUiPreferences(); },
        "socketIO.connected"() { this.loadUiPreferences(); },
    },
    mounted() {
        this.getSocket().on("uiPreferences:changed", this.loadUiPreferences);
        this.loadUiPreferences();
    },
    beforeUnmount() {
        this.uiPreferencesGeneration++;
        this.getSocket().off("uiPreferences:changed", this.loadUiPreferences);
    },
    methods: {
        navigationVisible(id) {
            if ([ "home", "enhanced" ].includes(id)) {
                return true;
            }
            if (!this.uiPreferencesLoaded) {
                return id !== "console" || !this.hideConsoleNavigation;
            }
            return !this.uiPreferences.hiddenNavigation.includes(id);
        },
        loadUiPreferences() {
            const generation = ++this.uiPreferencesGeneration;
            this.uiPreferencesSaving = false;
            this.uiPreferencesLoaded = false;
            if (!this.loggedIn || this.userAccess?.role !== "admin") {
                return;
            }
            this.getSocket().timeout(10000).emit("uiPreferences:get", (error, result) => {
                if (generation !== this.uiPreferencesGeneration) {
                    return;
                }
                if (error || !result?.ok) {
                    this.uiPreferencesError = result?.msg || "uiPreferences.unavailable";
                    return;
                }
                this.uiPreferences = result.config.preferences;
                this.uiPreferencesRevision = result.config.revision;
                // Keep the pre-existing per-browser Console choice until the first database save.
                if (!result.config.revision && loadHiddenConsole(localStorage, this.username)) {
                    this.uiPreferences.hiddenNavigation = [ "console" ];
                }
                this.uiPreferencesError = "";
                this.uiPreferencesLoaded = true;
            });
        },
        saveUiPreferences(preferences) {
            if (!this.uiPreferencesLoaded || this.uiPreferencesSaving) {
                return;
            }
            const generation = this.uiPreferencesGeneration;
            this.uiPreferencesSaving = true;
            this.getSocket().timeout(10000).emit("uiPreferences:save", {
                revision: this.uiPreferencesRevision, preferences,
            }, (error, result) => {
                if (generation !== this.uiPreferencesGeneration) {
                    return;
                }
                this.uiPreferencesSaving = false;
                if (error || !result?.ok) {
                    this.toastError(this.$t(result?.msg || "uiPreferences.unavailable"));
                    this.loadUiPreferences();
                    return;
                }
                this.uiPreferences = result.config.preferences;
                this.uiPreferencesRevision = result.config.revision;
            });
        },
        setNavigationVisible(id, visible) {
            const hidden = this.uiPreferences.hiddenNavigation.filter(item => item !== id);
            this.saveUiPreferences({ ...this.uiPreferences, hiddenNavigation: visible ? hidden : [ ...hidden, id ] });
        },
        setCatalogSourceEnabled(id, enabled) {
            const disabled = this.uiPreferences.disabledCatalogSources.filter(item => item !== id);
            this.saveUiPreferences({ ...this.uiPreferences, disabledCatalogSources: enabled ? disabled : [ ...disabled, id ] });
        },
    },
};
