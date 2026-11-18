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
const reinforcementReviews = [];
for (const [name, projectInput] of [
  ["pavilion", createKzh("pavilion")],
  ["canopy-plan", createKzh("canopy")],
  ["canopy-sections", createKzh("canopy", "sections")],
  ["bent-details", createKzhDetails()],
]) {
  const project = parseProject(JSON.stringify(projectInput));
  const marks = new Set();
  for (const e of project.elements) {
    const review = e.evidence?.reinforcementReview;
    if (!review || marks.has(e.mark)) continue;
    marks.add(e.mark);
    reinforcementReviews.push({
      project: name,
      mark: e.mark,
      ...review,
      positions: e.evidence.reinforcement.map((r) => ({
        position: r.position,
        specificationPage: r.page,
        specificationCount: r.count,
        shownCount: (e.evidence.bars ?? []).filter(
          (b) => b.drawing?.position === r.position,
        ).length,
      })),
    });
  }
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
await writeFile(
  "output/projects/reinforcement-review.json",
  JSON.stringify(reinforcementReviews, null, 2) + "\n",
  "utf8",
);
