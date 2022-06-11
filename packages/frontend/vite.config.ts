import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [vue()],
    build: {
        sourcemap: true,
        outDir: "../../dist/frontend",
    },
    server: {
        proxy: {
            "/ws": "ws://localhost:3001",
            "/store/": "http://localhost:3001",
            "/upload/": "http://localhost:3001",
            "/delete/": "http://localhost:3001",
            "/mkdir/": "http://localhost:3001",
        },
    },
});
