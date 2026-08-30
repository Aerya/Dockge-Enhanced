import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import Components from "unplugin-vue-components/vite";
import { BootstrapVueNextResolver } from "unplugin-vue-components/resolvers";
import viteCompression from "vite-plugin-compression";
import "vue";

const viteCompressionFilter = /\.(js|mjs|json|css|html|svg)$/i;

// https://vitejs.dev/config/
export default defineConfig({
    server: {
        port: 5000,
    },
    define: {
        "FRONTEND_VERSION": JSON.stringify(process.env.npm_package_version),
    },
    root: "./frontend",
    css: {
        preprocessorOptions: {
            scss: {
                // Auto-inject compile-time vars (breakpoints, Bootstrap overrides)
                // into every SCSS block so components don't need manual @import.
                additionalData: "@import \"/src/styles/vars.scss\"; @import \"/src/styles/shared.scss\";",
            },
        },
    },
    build: {
        outDir: "../frontend-dist",
    },
    plugins: [
        vue(),
        Components({
            resolvers: [ BootstrapVueNextResolver() ],
        }),
        viteCompression({
            algorithm: "gzip",
            filter: viteCompressionFilter,
        }),
        viteCompression({
            algorithm: "brotliCompress",
            filter: viteCompressionFilter,
        }),
    ],
});
