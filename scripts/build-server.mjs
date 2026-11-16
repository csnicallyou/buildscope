import { build } from "esbuild";
await build({
  entryPoints: ["server/index.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  outfile: ".deploy/release/server/index.mjs",
  sourcemap: false,
});
