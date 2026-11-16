import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import type { Element } from "./model";
import { elementGeometries, barsGeometry } from "./geometry";

// An independent view of the selected bodies: neither the user's camera nor
// their temporary displacements/visibility are changed to make the report.
export function renderReportPreview(elements: Element[]): string {
  const renderer = new WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(1200, 700);
  const scene = new Scene();
  scene.background = new Color("#edf3f4");
  const root = new Group();
  scene.add(root);
  try {
    for (const e of elements) {
      const group = new Group();
      group.position.set(...e.position);
      root.add(group);
      for (const p of elementGeometries(e)) {
        const mesh = new Mesh(
          p.geometry,
          new MeshStandardMaterial({ color: e.color, roughness: 0.85 }),
        );
        mesh.position.set(...p.offset);
        const edges = new LineSegments(
          new EdgesGeometry(p.geometry, 20),
          new LineBasicMaterial({ color: "#526b74" }),
        );
        mesh.add(edges);
        group.add(mesh);
      }
      if (e.evidence?.bars) {
        const geometry = barsGeometry(
          e.evidence.bars.filter((bar) => bar.label.startsWith("Анкер")),
        );
        if (geometry)
          group.add(
            new Mesh(geometry, new MeshStandardMaterial({ color: "#b88837" })),
          );
      }
    }
    const bounds = new Box3().setFromObject(root),
      center = bounds.getCenter(new Vector3());
    const diameter = Math.max(0.3, bounds.getSize(new Vector3()).length());
    const camera = new PerspectiveCamera(42, 1200 / 700, 0.01, 10000);
    camera.position
      .copy(center)
      .add(new Vector3(1, 0.85, 1).normalize().multiplyScalar(diameter * 1.5));
    camera.lookAt(center);
    scene.add(new AmbientLight("white", 2));
    const light = new DirectionalLight("white", 2.3);
    light.position.copy(center).add(new Vector3(10, 25, 12));
    light.target.position.copy(center);
    scene.add(light, light.target);
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/png");
  } finally {
    root.traverse((o) => {
      if (o instanceof Mesh || o instanceof LineSegments) {
        o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach((m) => m.dispose());
      }
    });
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
