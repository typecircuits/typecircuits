/// <reference types="vitest/config" />

import path from "node:path";
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import wasm from "vite-plugin-wasm";
import tailwindcss from "@tailwindcss/vite";
import yaml from "@modyfi/vite-plugin-yaml";

// https://vite.dev/config/
export default defineConfig(() => ({
    plugins: [svelte(), wasm(), tailwindcss(), yaml(), crossOriginIsolation()],
    resolve: {
        alias: {
            "@": path.resolve("./src"),
        },
    },
    test: {
        resolveSnapshotPath: (testPath, snapExtension) => testPath + snapExtension,
        passWithNoTests: true,
    },
}));

const configureServer = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((_req, res, next) => {
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
        next();
    });
};

const crossOriginIsolation = (): Plugin => ({
    name: "cross-origin-isolation",
    configureServer,
    configurePreviewServer: configureServer,
});
