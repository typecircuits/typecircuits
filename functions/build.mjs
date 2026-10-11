import esbuild from "esbuild";
import metaUrl from "@chialab/esbuild-plugin-meta-url";

await esbuild.build({
    entryPoints: ["src/index.ts"],
    outfile: "dist/api/index.mjs",
    platform: "node",
    bundle: true,
    sourcemap: true,
    format: "esm",
    plugins: [metaUrl()],
    external: ["core"],
});
