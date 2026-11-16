import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { cwd } from "node:process";
import { Buffer } from "node:buffer";
const bundled = await build({
  stdin: {
    contents:
      "export {createKzh} from './src/kzh'; export {createKzhDetails} from './src/details'; export {parseProject,toCSV,toSourceCSV} from './src/model';",
    resolveDir: cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { createKzh, createKzhDetails, parseProject, toCSV, toSourceCSV } =
  await import(
    "data:text/javascript;base64," +
      Buffer.from(bundled.outputFiles[0].text).toString("base64")
  );
await mkdir("output/projects", { recursive: true });
for (const [name, projectInput] of [
  ["pavilion", createKzh("pavilion")],
  ["canopy-plan", createKzh("canopy")],
  ["canopy-sections", createKzh("canopy", "sections")],
  ["bent-details", createKzhDetails()],
]) {
  const project = parseProject(JSON.stringify(projectInput));
  await writeFile(
    `output/projects/${name}.buildscope.json`,
    JSON.stringify(project, null, 2) + "\n",
    "utf8",
  );
  await writeFile(
    `output/projects/${name}-geometry.csv`,
    toCSV(project),
    "utf8",
  );
  await writeFile(
    `output/projects/${name}-source-schedules.csv`,
    toSourceCSV(project),
    "utf8",
  );
}
