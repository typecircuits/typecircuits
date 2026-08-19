/// <reference types="vitest/config" />

import path from "node:path";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import wasm from "vite-plugin-wasm";
import tailwindcss from "@tailwindcss/vite";
import yaml from "@modyfi/vite-plugin-yaml";

// https://vite.dev/config/
export default defineConfig({
    plugins: [svelte(), wasm(), tailwindcss(), yaml()],
    resolve: {
        alias: {
            "@": path.resolve("./src"),
        },
    },
    test: {
        resolveSnapshotPath: (testPath, snapExtension) => testPath + snapExtension,
        passWithNoTests: true,
    },
});
