/// <reference types="svelte" />
/// <reference types="vite/client" />
/// <reference types="@modyfi/vite-plugin-yaml/modules" />

declare module "*.wasm" {
    const module: any;
    export default module;
}
