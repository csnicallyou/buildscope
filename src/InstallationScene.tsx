import { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  PerspectiveCamera,
  Edges,
  Line,
} from "@react-three/drei";
import {
  CanvasTexture,
  Plane,
  Vector3,
  Mesh,
  MeshBasicMaterial,
  DoubleSide,
  Raycaster,
} from "three";
import { elementBounds, type Element, type Vec3 } from "./model";
import type { Bar } from "./engineering";
import type { SceneItem } from "./objects";
import { elementGeometries, barsGeometry } from "./geometry";
import { dimensionData } from "./dimensionData";
import { DimensionLabel } from "./Dimensions";
import SectionCap from "./SectionCap";
import {
  boardMotion,
  fillAmount,
  ease,
  workFrame,
  type InstallationPlan,
} from "./installation";
function Body({
  element,
  opacity = 1,
  fill = 1,
  position = [0, 0, 0],
  ghost = false,
  worldShift = [0, 0, 0],
}: {
  element: Element;
  opacity?: number;
  fill?: number;
  position?: Vec3;
  ghost?: boolean;
  worldShift?: Vec3;
}) {
  const gs = useMemo(() => elementGeometries(element), [element]);
  useEffect(() => () => gs.forEach((g) => g.geometry.dispose()), [gs]);
  const b = useMemo(() => {
    const min = Math.min(
      ...gs.map((g) => {
        g.geometry.computeBoundingBox();
        return g.geometry.boundingBox!.min.y + g.offset[1];
      }),
    );
    const max = Math.max(
      ...gs.map((g) => g.geometry.boundingBox!.max.y + g.offset[1]),
    );
    return { min, max };
  }, [gs]);
  const cut = b.min + (b.max - b.min) * fill + position[1] + worldShift[1];
  const plane = useMemo(() => new Plane(new Vector3(0, -1, 0), cut), [cut]);
  if (fill <= 0) return null;
  return (
    <group position={position}>
      {gs.map((g, i) => (
        <group key={i}>
          <mesh geometry={g.geometry} position={g.offset}>
            <meshStandardMaterial
              color={ghost ? "#81a6ad" : element.color}
              roughness={0.92}
              transparent={opacity < 1}
              opacity={opacity}
              depthWrite={opacity === 1}
              clippingPlanes={fill < 1 ? [plane] : []}
              onUpdate={(m) => {
                m.needsUpdate = true;
              }}
            />
            {ghost && (
              <Edges
                color="#65888e"
                threshold={25}
                transparent
                opacity={0.25}
              />
            )}
          </mesh>
          {!ghost && fill < 1 && (
            <SectionCap
              geometry={g.geometry}
              offset={g.offset}
              worldPosition={position.map((v, a) => v + worldShift[a]) as Vec3}
              axis="y"
              cut={cut}
              plane={plane}
              order={20 + i * 3}
              onClick={() => {}}
              color={element.color}
            />
          )}
        </group>
      ))}
    </group>
  );
}
function Steel({
  bars,
  progress,
  lift,
}: {
  bars: Bar[];
  progress: number;
  lift: number;
}) {
  const gs = useMemo(() => bars.map((b) => barsGeometry([b])), [bars]);
  useEffect(() => () => gs.forEach((g) => g?.dispose()), [gs]);
  return (
    <group>
      {gs.map((g, i) => {
        const p = ease(progress * 1.5 - (i / Math.max(1, gs.length)) * 0.5);
        return g && p > 0 ? (
          <mesh key={i} geometry={g} position={[0, (1 - p) * lift, 0]}>
            <meshStandardMaterial
              color="#e8b768"
              roughness={0.55}
              metalness={0.3}
            />
          </mesh>
        ) : null;
      })}
    </group>
  );
}
function Formwork({ plan, time }: { plan: InstallationPlan; time: number }) {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#bc8a53";
    ctx.fillRect(0, 0, 256, 64);
    for (let y = 2; y < 64; y += 3) {
      ctx.strokeStyle = y % 2 ? "#916335" : "#d0a06b";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let x = 0; x <= 256; x += 8) {
        const z = y + Math.sin(x * 0.04 + y) * 1.4;
        if (x === 0) ctx.moveTo(x, z);
        else ctx.lineTo(x, z);
      }
      ctx.stroke();
    }
    return new CanvasTexture(c);
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group>
      {plan.boards.map((b, i) => {
        const motion = boardMotion(plan, time, i);
        if (!motion.visible) return null;
        const off = 1 - motion.amount;
        return (
          <mesh
            key={i}
            position={[
              b.position[0] + b.outward[0] * off * 0.55,
              b.position[1] + off * 0.6,
              b.position[2] + b.outward[2] * off * 0.55,
            ]}
            rotation={[0, b.rotation, off * 0.15]}
          >
            <boxGeometry args={b.size} />
            <meshStandardMaterial
              map={texture}
              color="#efcf9e"
              roughness={0.94}
            />
            <Edges color="#754f32" />
          </mesh>
        );
      })}
    </group>
  );
}
function PourStream({
  element,
  plan,
  fill,
}: {
  element: Element;
  plan: InstallationPlan;
  fill: number;
}) {
  const point = useMemo(() => {
    const gs = elementGeometries(element),
      material = new MeshBasicMaterial({ side: DoubleSide }),
      ray = new Raycaster();
    let found: Vec3 | null = null;
    for (const xf of [0.5, 0.2, 0.8, 0.05, 0.95]) {
      for (const zf of [0.5, 0.2, 0.8]) {
        const x = plan.bounds.min[0] + plan.size[0] * xf,
          z = plan.bounds.min[2] + plan.size[2] * zf;
        ray.set(
          new Vector3(x, plan.bounds.max[1] + 1, z),
          new Vector3(0, -1, 0),
        );
        for (const g of gs) {
          const mesh = new Mesh(g.geometry, material);
          mesh.position.set(...g.offset);
          mesh.updateMatrixWorld();
          const hit = ray.intersectObject(mesh)[0];
          if (hit) {
            found = [x, hit.point.y, z];
            break;
          }
        }
        if (found) break;
      }
      if (found) break;
    }
    gs.forEach((g) => g.geometry.dispose());
    material.dispose();
    return found;
  }, [element, plan]);
  if (!point || fill <= 0 || fill >= 1) return null;
  const bottom = plan.bounds.min[1] + plan.size[1] * fill,
    top =
      plan.bounds.max[1] + Math.min(0.6, Math.max(0.3, plan.size[0] * 0.15)),
    height = top - bottom;
  return (
    <mesh position={[point[0], (bottom + top) / 2, point[2]]}>
      <cylinderGeometry args={[0.025, 0.04, height, 8]} />
      <meshStandardMaterial
        color={plan.kind === "bulk" ? "#b5ac8e" : "#b6c1bc"}
        roughness={1}
      />
    </mesh>
  );
}
function Camera({ plan }: { plan: InstallationPlan }) {
  const { camera, size } = useThree();
  const ref = useRef<import("three-stdlib").OrbitControls>(null);
  useEffect(() => {
    const radius = Math.max(0.5, Math.hypot(...plan.size));
    const distance =
      (radius * (size.width / size.height < 1.25 ? 1.6 : 1.25)) /
      Math.min(1, size.width / size.height);
    const target = new Vector3(0, plan.size[1] * 0.5, 0);
    camera.position
      .copy(target)
      .add(new Vector3(1, 0.85, 1).normalize().multiplyScalar(distance));
    camera.lookAt(target);
    ref.current?.target.copy(target);
    ref.current?.update();
  }, [camera, size, plan]);
  return (
    <OrbitControls
      ref={ref}
      makeDefault
      minDistance={0.1}
      maxDistance={Math.max(10, Math.hypot(...plan.size) * 12)}
    />
  );
}
function Scene({
  item,
  members,
  plan,
  time,
  dimensions,
}: {
  item: SceneItem;
  members: Element[];
  plan: InstallationPlan;
  time: number;
  dimensions: boolean;
}) {
  const e = item.element,
    frame = workFrame(plan, time),
    phase = frame.step.phase,
    fill = fillAmount(plan, time);
  const center: Vec3 = [
    (plan.bounds.min[0] + plan.bounds.max[0]) / 2,
    plan.bounds.min[1],
    (plan.bounds.min[2] + plan.bounds.max[2]) / 2,
  ];
  const steelPhase =
    plan.kind === "concrete"
      ? phase === "reinforce"
        ? frame.progress
        : ["pour", "level", "wait", "strip", "ready"].includes(phase)
          ? 1
          : 0
      : phase === "place"
        ? frame.progress
        : phase === "ready"
          ? 1
          : 0;
  const lift = Math.max(0.5, plan.size[1] * 1.2);
  const placement =
    phase === "place" ? ease(frame.progress) : phase === "ready" ? 1 : 0;
  const dims = useMemo(() => dimensionData(item), [item]);
  const bars =
    item.kind === "steel" ? (item.bars ?? []) : (e.evidence?.bars ?? []);
  return (
    <>
      <PerspectiveCamera makeDefault fov={42} near={0.005} far={10000} />
      <Camera plan={plan} />
      <ambientLight intensity={1.8} />
      <directionalLight position={[5, 10, 4]} intensity={2.5} />
      <gridHelper
        args={[
          Math.max(8, plan.size[0] * 3, plan.size[2] * 3),
          24,
          "#38545c",
          "#263e47",
        ]}
        position={[0, -0.04, 0]}
      />
      <group position={center.map((v) => -v) as Vec3}>
        {members
          .filter(
            (m) =>
              m.id !== e.id &&
              !["diagram", "envelope"].includes(
                m.evidence?.representation ?? "",
              ),
          )
          .map((m) => {
            // Supporting parts provide context without concealing the part being installed.
            const g = elementBounds(m).max[1];
            if (g + m.position[1] > plan.bounds.min[1] + e.position[1] + 0.03)
              return null;
            return (
              <Body
                key={m.id}
                element={m}
                opacity={0.13}
                ghost
                position={m.position.map((v, a) => v - e.position[a]) as Vec3}
              />
            );
          })}
        <Body element={e} ghost opacity={0.055} />
        {plan.kind === "concrete" || plan.kind === "bulk" ? (
          <>
            <Body
              element={e}
              fill={fill}
              worldShift={center.map((v) => -v) as Vec3}
            />
            {plan.kind === "concrete" && <Formwork plan={plan} time={time} />}
            <PourStream element={e} plan={plan} fill={fill} />
            {plan.kind === "concrete" && (
              <Steel bars={bars} progress={steelPhase} lift={lift} />
            )}
            {(phase === "level" || phase === "compact") && (
              <mesh
                position={[
                  (plan.bounds.min[0] + plan.bounds.max[0]) / 2,
                  plan.bounds.max[1] + 0.025,
                  plan.bounds.min[2] + frame.progress * plan.size[2],
                ]}
              >
                <boxGeometry args={[plan.size[0] + 0.08, 0.04, 0.08]} />
                <meshStandardMaterial
                  color={phase === "compact" ? "#d3b976" : "#b89a67"}
                  roughness={0.85}
                />
              </mesh>
            )}
          </>
        ) : plan.kind === "steel" && item.kind === "steel" ? (
          <Steel bars={bars} progress={steelPhase} lift={lift} />
        ) : (
          placement > 0 && (
            <Body element={e} position={[0, (1 - placement) * lift, 0]} />
          )
        )}
        {dimensions &&
          [...dims.segments, ...dims.cutouts].map((seg, i) => (
            <group key={i}>
              <Line
                points={[seg.from, seg.to]}
                color="#e8bd78"
                lineWidth={1}
                depthTest={false}
              />
              {i < dims.segments.length && (
                <DimensionLabel
                  text={seg.label}
                  position={seg.from.map((v, a) => (v + seg.to[a]) / 2) as Vec3}
                />
              )}
            </group>
          ))}
      </group>
    </>
  );
}
export default function InstallationScene(props: {
  item: SceneItem;
  members: Element[];
  plan: InstallationPlan;
  time: number;
  dimensions: boolean;
}) {
  return (
    <Canvas
      className="installation-canvas"
      gl={{
        antialias: true,
        stencil: true,
        localClippingEnabled: true,
        preserveDrawingBuffer: true,
      }}
      dpr={[1, 2]}
      style={{ background: "#142832" }}
    >
      <Scene {...props} />
    </Canvas>
  );
}
