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
        // Default Dark
        if (! this.userTheme) {
            this.userTheme = "dark";
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

