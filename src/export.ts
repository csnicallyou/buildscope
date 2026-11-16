import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
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
    for (const p of e.parts) {
      const mesh = new Mesh(
        new BoxGeometry(...p.size),
        new MeshStandardMaterial({ color: e.color }),
      );
      mesh.position.set(...p.offset);
      group.add(mesh);
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
