import { build } from "esbuild";
await build({
  entryPoints: ["server/browser-fixture.ts"],
  outfile: ".deploy/browser-fixture.mjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
});
await import("../.deploy/browser-fixture.mjs");
