import { defineComponent } from "vue";

export default defineComponent({
    data() {
        return {
            system: (window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light",
            userTheme: localStorage.theme,
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
        }
    },

    watch: {
        userTheme(to, from) {
            localStorage.theme = to;
        },

        styleElapsedTime(to, from) {
            localStorage.styleElapsedTime = to;
        },

        theme(to, from) {
            document.body.classList.remove(from);
            document.body.classList.add(this.theme);
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

        /**
         * Update the theme color meta tag
         * @returns {void}
         */
        updateThemeColorMeta() {
            if (this.theme === "dark") {
                document.querySelector("#theme-color").setAttribute("content", "#090c10");
            } else {
                document.querySelector("#theme-color").setAttribute("content", "#f6f8fa");
            }
        }
    }
});

