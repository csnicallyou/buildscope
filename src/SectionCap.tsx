import { useEffect, useMemo, useRef } from "react";
import {
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
  DoubleSide,
  BackSide,
  FrontSide,
  AlwaysStencilFunc,
  NotEqualStencilFunc,
  IncrementWrapStencilOp,
  DecrementWrapStencilOp,
  ReplaceStencilOp,
  type BufferGeometry,
  type Plane,
  type Intersection,
} from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { Vec3 } from "./model";

export function pointInsideMesh(mesh: Mesh, point: Vector3) {
  const ray = new Raycaster(
    point.clone().add(new Vector3(1e-7, 0, 0)),
    new Vector3(1, 0, 0),
  );
  const hits = ray.intersectObject(mesh, false);
  let count = 0,
    last = -Infinity;
  for (const hit of hits)
    if (hit.distance - last > 1e-6) {
      count++;
      last = hit.distance;
    }
  return count % 2 === 1;
}
export default function SectionCap({
  geometry,
  offset,
  worldPosition,
  axis,
  cut,
  plane,
  order,
  onClick,
}: {
  geometry: BufferGeometry;
  offset: Vec3;
  worldPosition: Vec3;
  axis: "x" | "y" | "z";
  cut: number;
  plane: Plane;
  order: number;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const ref = useRef<Mesh>(null);
  const test = useMemo(() => {
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const mesh = new Mesh(geometry, material);
    return { mesh, material };
  }, [geometry]);
  useEffect(() => () => test.material.dispose(), [test]);
  const b = useMemo(() => {
    geometry.computeBoundingBox();
    return geometry.boundingBox!.clone();
  }, [geometry]);
  const k = axis === "x" ? 0 : axis === "y" ? 1 : 2;
  if (
    cut <= b.min.getComponent(k) + offset[k] + worldPosition[k] + 1e-7 ||
    cut >= b.max.getComponent(k) + offset[k] + worldPosition[k] - 1e-7
  )
    return null;
  const size = b.getSize(new Vector3()),
    center = b.getCenter(new Vector3()).add(new Vector3(...offset));
  center.setComponent(k, cut - worldPosition[k]);
  test.mesh.matrixWorld.makeTranslation(
    ...(offset.map((v, a) => v + worldPosition[a]) as Vec3),
  );
  const rotation: Vec3 =
    axis === "x"
      ? [0, Math.PI / 2, 0]
      : axis === "y"
        ? [-Math.PI / 2, 0, 0]
        : [0, 0, 0];
  const widths =
    axis === "x"
      ? [size.z, size.y]
      : axis === "y"
        ? [size.x, size.z]
        : [size.x, size.y];
  return (
    <>
      <mesh geometry={geometry} position={offset} renderOrder={order}>
        <meshBasicMaterial
          side={BackSide}
          clippingPlanes={[plane]}
          depthWrite={false}
          depthTest={false}
          colorWrite={false}
          stencilWrite
          stencilFunc={AlwaysStencilFunc}
          stencilFail={IncrementWrapStencilOp}
          stencilZFail={IncrementWrapStencilOp}
          stencilZPass={IncrementWrapStencilOp}
        />
      </mesh>
      <mesh geometry={geometry} position={offset} renderOrder={order + 1}>
        <meshBasicMaterial
          side={FrontSide}
          clippingPlanes={[plane]}
          depthWrite={false}
          depthTest={false}
          colorWrite={false}
          stencilWrite
          stencilFunc={AlwaysStencilFunc}
          stencilFail={DecrementWrapStencilOp}
          stencilZFail={DecrementWrapStencilOp}
          stencilZPass={DecrementWrapStencilOp}
        />
      </mesh>
      <mesh
        ref={ref}
        position={center}
        rotation={rotation}
        renderOrder={order + 2}
        onClick={onClick}
        onAfterRender={(renderer) => renderer.clearStencil()}
        raycast={(raycaster, intersections) => {
          if (!ref.current) return;
          const hits: Intersection[] = [];
          Mesh.prototype.raycast.call(ref.current, raycaster, hits);
          for (const hit of hits)
            if (pointInsideMesh(test.mesh, hit.point)) intersections.push(hit);
        }}
      >
        <planeGeometry args={[widths[0] + 0.002, widths[1] + 0.002]} />
        <meshStandardMaterial
          color="#e2a45d"
          side={DoubleSide}
          roughness={0.9}
          stencilWrite
          stencilRef={0}
          stencilFunc={NotEqualStencilFunc}
          stencilFail={ReplaceStencilOp}
          stencilZFail={ReplaceStencilOp}
          stencilZPass={ReplaceStencilOp}
        />
      </mesh>
    </>
  );
}
