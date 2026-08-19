import { defineComponent } from "vue";

/**
 * Reactive mobile breakpoint (single shared resize listener on the root app).
 * Keeps $root.isMobile / $root.windowWidth in sync with the viewport and
 * mirrors the state as a "mobile" class on <body>. Breakpoint matches
 * $bp-mobile (767.98px) in vars.scss — JS and CSS must agree.
 */
export default defineComponent({
    data() {
        return {
            windowWidth: window.innerWidth,
        };
    },

    computed: {
        isMobile(): boolean {
            return this.windowWidth <= 767.98;
        },
    },

    watch: {
        isMobile(mobile: boolean) {
            document.body.classList.toggle("mobile", mobile);
        },
    },

    mounted() {
        document.body.classList.toggle("mobile", this.isMobile);
        window.addEventListener("resize", this.onWindowResize);
    },

    unmounted() {
        window.removeEventListener("resize", this.onWindowResize);
        document.body.classList.remove("mobile");
    },

    methods: {
        /**
         * Update the reactive viewport width
         * @returns {void}
         */
        onWindowResize() {
            this.windowWidth = window.innerWidth;
        },
    },
});
