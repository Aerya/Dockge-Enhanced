import { defineComponent } from "vue";
import { normalizePalette } from "../theme-palettes";
import { loadCompactInterface, saveCompactInterface } from "../interface-density";
import { loadHiddenConsole, saveHiddenConsole } from "../console-navigation";

export default defineComponent({
    data() {
        return {
            system: (window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light",
            userTheme: localStorage.theme,
            dayPalette: normalizePalette(localStorage.dayPalette, "light"),
            nightPalette: normalizePalette(localStorage.nightPalette, "dark"),
            compactInterface: false,
            hideConsoleNavigation: false,
        };
    },

    computed: {
        theme() {
            if (this.userTheme === "auto") {
                return this.system;
            }
            return this.userTheme;
        },

        isDark() {
            return this.theme === "dark";
        },

        activePalette() {
            return this.isDark ? this.nightPalette : this.dayPalette;
        }
    },

    watch: {
        username(value) {
            this.compactInterface = loadCompactInterface(localStorage, value);
            this.hideConsoleNavigation = loadHiddenConsole(localStorage, value);
        },

        hideConsoleNavigation(value) {
            saveHiddenConsole(localStorage, this.username, value);
        },

        compactInterface(value) {
            saveCompactInterface(localStorage, this.username, value);
        },
        userTheme(to, from) {
            localStorage.theme = to;
        },

        dayPalette(to) {
            this.dayPalette = normalizePalette(to, "light");
            localStorage.dayPalette = this.dayPalette;
        },

        nightPalette(to) {
            this.nightPalette = normalizePalette(to, "dark");
            localStorage.nightPalette = this.nightPalette;
        },

        activePalette() {
            this.applyPalette();
        },

        styleElapsedTime(to, from) {
            localStorage.styleElapsedTime = to;
        },

        theme(to, from) {
            document.body.classList.remove(from);
            document.body.classList.add(this.theme);
            this.applyPalette();
            this.updateThemeColorMeta();
        },
    },

    mounted() {
        // Default: follow the OS theme (light during the day, dark at night)
        if (! this.userTheme) {
            this.userTheme = "auto";
        }

        // Follow OS theme changes while set to "auto"
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
            this.system = e.matches ? "dark" : "light";
        });

        document.body.classList.add(this.theme);
        this.applyPalette();
        this.updateThemeColorMeta();
    },

    methods: {
        /**
         * Toggle between light and dark theme (explicit user choice,
         * overrides "auto" until changed back in Settings → Appearance)
         * @returns {void}
         */
        toggleTheme() {
            this.userTheme = this.theme === "dark" ? "light" : "dark";
        },

        applyPalette() {
            document.body.dataset.palette = this.activePalette;
            document.documentElement.style.colorScheme = this.theme;
            this.updateThemeColorMeta();
        },

        /**
         * Update the theme color meta tag
         * @returns {void}
         */
        updateThemeColorMeta() {
            const background = getComputedStyle(document.body).getPropertyValue("--bg-body").trim();
            document.querySelector("#theme-color")?.setAttribute("content", background || (this.isDark ? "#090c10" : "#ffffff"));
        }
    }
});
