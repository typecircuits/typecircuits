import path from "node:path";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import yaml from "@modyfi/vite-plugin-yaml";

// https://vite.dev/config/
export default defineConfig({
    plugins: [svelte(), tailwindcss(), yaml()],
    resolve: {
        alias: {
            "@": path.resolve("./src"),
        },
    },
});
