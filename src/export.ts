import { Group, Mesh, MeshStandardMaterial } from "three";
import { elementGeometries, barsGeometry } from "./geometry";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import type { Project } from "./model";
export function download(
  data: BlobPart,
  name: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportGLB(project: Project) {
  const root = new Group();
  for (const e of project.elements) {
    const group = new Group();
    group.name = e.mark;
    group.position.set(...e.position);
    group.userData = { ...e };
    for (const p of elementGeometries(e)) {
      const mesh = new Mesh(
        p.geometry,
        new MeshStandardMaterial({ color: e.color }),
      );
      mesh.position.set(...p.offset);
      group.add(mesh);
    }
    if (e.evidence?.bars) {
      const geometry = barsGeometry(e.evidence.bars);
      if (geometry) {
        const mesh = new Mesh(
          geometry,
          new MeshStandardMaterial({ color: "#dba45b" }),
        );
        mesh.name = "Армирование · схема";
        group.add(mesh);
      }
    }
    root.add(group);
  }
  try {
    const result = await new GLTFExporter().parseAsync(root, { binary: true });
    if (!(result instanceof ArrayBuffer))
      throw new Error("Не удалось создать GLB");
    download(result, "buildscope.glb", "model/gltf-binary");
  } finally {
    root.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        (o.material as MeshStandardMaterial).dispose();
      }
    });
  }
}
