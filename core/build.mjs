import esbuild from "esbuild";

await esbuild.build({
    entryPoints: ["src/index.ts"],
    outdir: "dist",
    platform: "node",
    bundle: true,
    sourcemap: true,
    format: "esm",
    loader: { ".wasm": "file" },
    external: ["@codemirror/*"],
});
