import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Group,
  CanvasTexture,
  Sprite,
  Vector3,
  PerspectiveCamera,
  OrthographicCamera,
} from "three";
import { Line } from "@react-three/drei";
import { dimensionData, type DimensionSegment } from "./dimensionData";
import { useStore, displayPosition } from "./store";
import type { SceneItem } from "./objects";
import type { Vec3 } from "./model";
export function DimensionLabel({
  text,
  position,
}: {
  text: string;
  position: Vec3;
}) {
  const ref = useRef<Sprite>(null),
    { camera, size } = useThree();
  const scratch = useMemo(() => new Vector3(), []);
  const { texture, aspect } = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = Math.max(192, Math.ceil(text.length * 25 + 24));
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#182e39ed";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#d2aa6b";
    ctx.strokeRect(1, 1, c.width - 2, c.height - 2);
    ctx.font = "26px Segoe UI";
    ctx.fillStyle = "#ffe3b6";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, c.width / 2, 32);
    return { texture: new CanvasTexture(c), aspect: c.width / c.height };
  }, [text]);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.getWorldPosition(scratch);
    scratch.applyMatrix4(camera.matrixWorldInverse);
    const pixelsPerUnit =
      camera instanceof PerspectiveCamera
        ? size.height /
          (2 *
            Math.tan((camera.fov * Math.PI) / 360) *
            Math.max(0.01, Math.abs(scratch.z)))
        : size.height /
          (((camera as OrthographicCamera).top -
            (camera as OrthographicCamera).bottom) /
            (camera as OrthographicCamera).zoom);
    const h = 20 / pixelsPerUnit;
    ref.current.scale.set(h * aspect, h, 1);
  });
  return (
    <sprite ref={ref} position={position} renderOrder={1000000}>
      <spriteMaterial map={texture} depthTest={false} depthWrite={false} />
    </sprite>
  );
}
function DimensionLine({
  segment,
  gap,
}: {
  segment: DimensionSegment;
  gap: number;
}) {
  const midpoint = segment.from.map((v, a) => (v + segment.to[a]) / 2) as Vec3;
  const direction = segment.to.map((v, a) => v - segment.from[a]);
  const tick: Vec3 =
    Math.abs(direction[1]) > 1e-6 ? [gap * 0.18, 0, 0] : [0, gap * 0.18, 0];
  return (
    <>
      <Line
        points={[segment.from, segment.to]}
        color="#e8bd78"
        lineWidth={1}
        depthTest={false}
      />
      {[segment.from, segment.to].map((p, i) => (
        <Line
          key={i}
          points={[
            p.map((v, a) => v - tick[a]) as Vec3,
            p.map((v, a) => v + tick[a]) as Vec3,
          ]}
          color="#e8bd78"
          lineWidth={1}
          depthTest={false}
        />
      ))}
      <DimensionLabel text={segment.label} position={midpoint} />
    </>
  );
}
export default function Dimensions({
  item,
  layer,
}: {
  item: SceneItem;
  layer: number;
}) {
  const s = useStore(),
    d = useMemo(() => dimensionData(item), [item]);
  const pos = displayPosition(
    item.element.position,
    s.offsets[item.id],
    s.exploded,
    layer,
  );
  const group = useRef<Group>(null);
  const { camera, size } = useThree();
  useFrame(() => {
    const projected = [d.bounds.min[0], d.bounds.max[0]].flatMap((x) =>
      [d.bounds.min[1], d.bounds.max[1]].flatMap((y) =>
        [d.bounds.min[2], d.bounds.max[2]].map((z) =>
          new Vector3(x + pos[0], y + pos[1], z + pos[2]).project(camera),
        ),
      ),
    );
    const width =
      ((Math.max(...projected.map((p) => p.x)) -
        Math.min(...projected.map((p) => p.x))) *
        size.width) /
      2;
    const height =
      ((Math.max(...projected.map((p) => p.y)) -
        Math.min(...projected.map((p) => p.y))) *
        size.height) /
      2;
    if (group.current) group.current.visible = Math.max(width, height) > 140;
  });
  return (
    <group ref={group} position={pos}>
      {[...d.segments, ...d.cutouts].map((segment, i) => (
        <DimensionLine key={i} segment={segment} gap={d.gap} />
      ))}
    </group>
  );
}
