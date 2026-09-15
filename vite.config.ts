/// <reference types="vitest/config" />

import path from "node:path";
import { defineConfig, loadEnv, type Plugin, type PreviewServer, type ViteDevServer } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import wasm from "vite-plugin-wasm";
import tailwindcss from "@tailwindcss/vite";
import yaml from "@modyfi/vite-plugin-yaml";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");

    return {
        plugins: [
            svelte(),
            wasm(),
            tailwindcss(),
            yaml(),
            crossOriginIsolation(),
            sentryVitePlugin({
                org: env.SENTRY_ORG,
                project: env.SENTRY_PROJECT,
                authToken: env.SENTRY_AUTH_TOKEN,
            }),
        ],
        resolve: {
            alias: {
                "@": path.resolve("./src"),
            },
        },
        build: {
            sourcemap: true,
        },
        test: {
            resolveSnapshotPath: (testPath, snapExtension) => testPath + snapExtension,
            passWithNoTests: true,
        },
    };
});

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
