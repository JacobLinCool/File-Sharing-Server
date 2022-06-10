import { defineConfig } from "tsup";

export default defineConfig(() => ({
    entry: ["src/index.ts"],
    outDir: "../../dist/backend",
    target: "node16",
    format: ["esm"],
    clean: true,
    splitting: false,
    minify: false,
    dts: false,
    shims: true,
}));
