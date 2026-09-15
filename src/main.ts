import { mount } from "svelte";
import App from "./App.svelte";
import * as Sentry from "@sentry/browser";
import "@xyflow/svelte/dist/style.css";
import "@/style.css";

if (import.meta.env.VITE_SENTRY_DSN) {
    Sentry.init({
        dsn: import.meta.env.VITE_SENTRY_DSN,
        enabled: import.meta.env.PROD,
        dataCollection: {
            userInfo: false,
            httpBodies: [],
        },
        integrations: [
            Sentry.feedbackIntegration({
                colorScheme: "system",
                autoInject: false,
            }),
        ],
    });
}

const app = mount(App, {
    target: document.getElementById("app")!,
});

export default app;
