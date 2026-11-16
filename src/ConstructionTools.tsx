import { useMemo, useEffect } from "react";
import { Line } from "@react-three/drei";
import {
  Shape,
  Path,
  ShapeGeometry,
  Vector3,
  Quaternion,
  DoubleSide,
  Plane,
} from "three";
import type { Element, Vec3 } from "./model";
import type { Bar } from "./engineering";
import { footprintPolygons, pointInFootprint } from "./footprints";
import {
  workFrame,
  ease,
  boardMotion,
  type InstallationPlan,
} from "./installation";
function Stick({
  a,
  b,
  width = 0.025,
  color = "#b18b59",
}: {
  a: Vec3;
  b: Vec3;
  width?: number;
  color?: string;
}) {
  const d = new Vector3(...b).sub(new Vector3(...a)),
    q = new Quaternion().setFromUnitVectors(
      new Vector3(0, 1, 0),
      d.clone().normalize(),
    );
  return (
    <mesh position={a.map((v, i) => (v + b[i]) / 2) as Vec3} quaternion={q}>
      <boxGeometry args={[width, d.length(), width]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}
function Film({
  element,
  y,
  reveal,
  shift,
  roll = false,
}: {
  element: Element;
  y: number;
  reveal: number;
  shift: Vec3;
  roll?: boolean;
}) {
  const geometry = useMemo(() => {
    const shapes = footprintPolygons(element).map((poly) => {
      const s = new Shape();
      poly[0].forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
      s.closePath();
      for (const ring of poly.slice(1)) {
        const h = new Path();
        ring.forEach(([x, z], i) => (i ? h.lineTo(x, -z) : h.moveTo(x, -z)));
        h.closePath();
        s.holes.push(h);
      }
      return s;
    });
    const g = new ShapeGeometry(shapes);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [element]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!,
    cut = bounds.min.x + (bounds.max.x - bounds.min.x) * reveal + shift[0];
  if (reveal <= 0) return null;
  return (
    <group>
      {roll && reveal < 1 && (
        <mesh
          position={[
            cut - shift[0],
            y + 0.05,
            (bounds.min.z + bounds.max.z) / 2,
          ]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry
            args={[0.05, 0.05, bounds.max.z - bounds.min.z, 16]}
          />
          <meshStandardMaterial color="#cbe9e6" roughness={0.6} />
        </mesh>
      )}
      <mesh geometry={geometry} position={[0, y, 0]}>
        <meshStandardMaterial
          color="#a5d8e1"
          transparent
          opacity={0.4}
          depthWrite={false}
          side={DoubleSide}
          roughness={0.5}
          clippingPlanes={
            reveal < 1 ? [new Plane(new Vector3(-1, 0, 0), cut)] : []
          }
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
    </group>
  );
}
function PlateCompactor({
  position,
  progress,
}: {
  position: Vec3;
  progress: number;
}) {
  return (
    <group
      position={position}
      rotation={[0, 0, Math.sin(progress * 170) * 0.008]}
    >
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[0.36, 0.07, 0.46]} />
        <meshStandardMaterial color="#a4a9a1" metalness={0.5} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[0.24, 0.22, 0.25]} />
        <meshStandardMaterial color="#e1b35d" />
      </mesh>
      <mesh position={[0, 0.31, 0]}>
        <boxGeometry args={[0.2, 0.1, 0.2]} />
        <meshStandardMaterial color="#334047" />
      </mesh>
      {[-0.14, 0.14].map((x) => (
        <Stick
          key={x}
          a={[x, 0.12, 0.15]}
          b={[x, 0.72, 0.55]}
          width={0.025}
          color="#596c72"
        />
      ))}
      <Stick
        a={[-0.14, 0.72, 0.55]}
        b={[0.14, 0.72, 0.55]}
        width={0.04}
        color="#24343b"
      />
    </group>
  );
}
function Screwdriver({
  position,
  progress,
}: {
  position: Vec3;
  progress: number;
}) {
  return (
    <group
      position={position}
      rotation={[0, 0, Math.sin(progress * 60) * 0.04]}
    >
      <mesh>
        <boxGeometry args={[0.13, 0.1, 0.07]} />
        <meshStandardMaterial color="#46958c" />
      </mesh>
      <mesh position={[-0.03, -0.1, 0]}>
        <boxGeometry args={[0.06, 0.16, 0.055]} />
        <meshStandardMaterial color="#30444b" />
      </mesh>
      <Stick a={[0.06, 0, 0]} b={[0.22, 0, 0]} width={0.012} color="#b9c0ba" />
    </group>
  );
}
function Hook({ position, progress }: { position: Vec3; progress: number }) {
  return (
    <group position={position} rotation={[0, progress * 16, 0]}>
      <Stick a={[0, 0.03, 0]} b={[0, 0.28, 0]} width={0.018} color="#b4c4c7" />
      <mesh position={[0, 0.32, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.12, 8]} />
        <meshStandardMaterial color="#ad7950" />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.04, 0.004, 6, 12]} />
        <meshStandardMaterial color="#c6b8a1" metalness={0.6} />
      </mesh>
    </group>
  );
}
export default function ConstructionTools({
  element,
  bars,
  plan,
  time,
  shift,
}: {
  element: Element;
  bars: Bar[];
  plan: InstallationPlan;
  time: number;
  shift: Vec3;
}) {
  const { step, progress: p } = workFrame(plan, time),
    phase = step.phase,
    b = plan.bounds,
    size = plan.size,
    top = b.max[1],
    bottom = b.min[1];
  const polys = useMemo(() => footprintPolygons(element), [element]);
  const points = useMemo(() => {
    const out: Vec3[] = [];
    for (const zf of [0.2, 0.5, 0.8])
      for (const xf of [0.2, 0.5, 0.8]) {
        const x = b.min[0] + size[0] * xf,
          z = b.min[2] + size[2] * zf;
        if (pointInFootprint(polys, x, z)) out.push([x, top, z]);
      }
    return out.length
      ? out
      : [[b.min[0] + size[0] * 0.1, top, b.min[2] + size[2] * 0.1] as Vec3];
  }, [b, size, polys, top]);
  const vibrationPoints = useMemo(() => {
    const out: Vec3[] = [];
    for (let zi = 1; zi < 10; zi++)
      for (let xi = 1; xi < 10; xi++) {
        const x = b.min[0] + (size[0] * (xi + 0.17)) / 10,
          z = b.min[2] + (size[2] * (zi + 0.17)) / 10;
        if (!pointInFootprint(polys, x, z)) continue;
        const clear = bars.every((bar) =>
          bar.points.slice(1).every((q, i) => {
            const a = bar.points[i],
              dx = q[0] - a[0],
              dz = q[2] - a[2],
              length = dx * dx + dz * dz,
              t = length
                ? Math.max(
                    0,
                    Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / length),
                  )
                : 0;
            return (
              Math.hypot(x - a[0] - t * dx, z - a[2] - t * dz) >
              0.05 + bar.diameter / 2
            );
          }),
        );
        if (clear) out.push([x, top, z]);
      }
    return out.filter(
      (_, i) => i % Math.max(1, Math.ceil(out.length / 9)) === 0,
    );
  }, [b, size, polys, bars, top]);
  const vibrationPoint =
    vibrationPoints[
      Math.min(
        vibrationPoints.length - 1,
        Math.floor(p * vibrationPoints.length),
      )
    ];
  const point =
    points[Math.min(points.length - 1, Math.floor(p * points.length))];
  const formVisible =
    plan.kind === "concrete" &&
    plan.boards.length &&
    !["layout", "base", "film", "ready"].includes(phase);
  const selectedBoard =
    plan.boards[
      Math.min(plan.boards.length - 1, Math.floor(p * plan.boards.length))
    ];
  const showBase = plan.options.baseFilm && !["layout", "base"].includes(phase),
    showCover = plan.options.curingCover && ["care", "wait"].includes(phase);
  const isConcrete = plan.kind === "concrete";
  const survey = ["layout", "check", "wait"].includes(phase);
  const x = b.min[0] - 0.35,
    z = b.max[2] + 0.35,
    h = bottom + 0.65;
  const rayEnd: Vec3 = [b.min[0] + p * size[0], bottom, b.min[2]];
  const vibrator = phase === "vibrate",
    surface = plan.options.vibration === "surface";
  const toolScale = Math.min(1, Math.max(0.45, Math.max(size[0], size[2]) / 3));
  const dip = (Math.sin(p * Math.PI * 10) + 1) / 2;
  const bare = phase === "base";
  const ties = phase === "tie" || (phase === "reinforce" && p > 0.6);
  const barPoint = bars[0]?.points[0] ?? point;
  const anchors =
    bars.length > 0 && bars.every((b) => /анкер|M24/i.test(b.label));
  const heads = bars.flatMap((b) => b.points),
    headY = heads.length ? Math.max(...heads.map((p) => p[1])) : top;
  const xmin = heads.length ? Math.min(...heads.map((p) => p[0])) : b.min[0],
    xmax = heads.length ? Math.max(...heads.map((p) => p[0])) : b.max[0];
  const zmin = heads.length ? Math.min(...heads.map((p) => p[2])) : b.min[2],
    zmax = heads.length ? Math.max(...heads.map((p) => p[2])) : b.max[2];
  const prepFilm = showBase ? (
    <Film
      element={element}
      y={bottom - 0.006}
      reveal={phase === "film" ? ease(p) : 1}
      shift={shift}
      roll={phase === "film"}
    />
  ) : null;
  return (
    <group>
      {isConcrete && prepFilm}
      {showCover && (
        <Film
          element={element}
          y={top + 0.008}
          reveal={phase === "care" ? ease(p) : 1}
          shift={shift}
          roll={phase === "care"}
        />
      )}
      {survey && (
        <group>
          <mesh position={[x, h, z]}>
            <boxGeometry args={[0.16, 0.1, 0.12]} />
            <meshStandardMaterial color="#c8b16b" />
          </mesh>
          {[0, 2.094, 4.189].map((a) => (
            <Stick
              key={a}
              a={[x + Math.cos(a) * 0.25, bottom, z + Math.sin(a) * 0.25]}
              b={[x, h - 0.05, z]}
              width={0.018}
              color="#b3bfc0"
            />
          ))}
          <Line
            points={[[x, h, z], rayEnd]}
            color="#79d6bb"
            lineWidth={1}
            dashed
            dashSize={0.08}
            gapSize={0.08}
          />
          <Stick
            a={rayEnd}
            b={[rayEnd[0], top + 0.3, rayEnd[2]]}
            width={0.025}
            color="#f1e7d0"
          />
        </group>
      )}
      {bare && (
        <group
          position={[point[0], bottom + 0.04, point[2]]}
          rotation={[0.4, 0, Math.sin(p * 20) * 0.2]}
        >
          <Stick a={[0, 0, 0]} b={[0, 0.65, 0.25]} width={0.025} />
          <mesh rotation={[0.4, 0, 0]}>
            <boxGeometry args={[0.18, 0.025, 0.22]} />
            <meshStandardMaterial color="#a1b0b1" metalness={0.5} />
          </mesh>
        </group>
      )}
      {formVisible &&
        plan.boards
          .filter((_, i) => i % 2 === 0)
          .map((board, j) => {
            const i = j * 2,
              m = boardMotion(plan, time, i);
            if (!m.visible || m.amount < 0.95) return null;
            const n = board.outward,
              a = board.position;
            return (
              <group key={i}>
                <Stick
                  a={[a[0] + n[0] * 0.07, bottom - 0.07, a[2] + n[2] * 0.07]}
                  b={[a[0] + n[0] * 0.07, top + 0.12, a[2] + n[2] * 0.07]}
                  width={0.035}
                />
                <Stick
                  a={[a[0] + n[0] * 0.4, bottom, a[2] + n[2] * 0.4]}
                  b={[
                    a[0] + n[0] * 0.07,
                    bottom + size[1] * 0.7,
                    a[2] + n[2] * 0.07,
                  ]}
                  width={0.025}
                />
              </group>
            );
          })}
      {phase === "boards" && selectedBoard && (
        <Screwdriver
          position={[
            selectedBoard.position[0] + selectedBoard.outward[0] * 0.15,
            selectedBoard.position[1] + 0.05,
            selectedBoard.position[2] + selectedBoard.outward[2] * 0.15,
          ]}
          progress={p}
        />
      )}
      {phase === "seal" && selectedBoard && (
        <group position={selectedBoard.position}>
          <Stick a={[0, 0, 0]} b={[0, 0.3, 0.1]} width={0.02} color="#a4b8b8" />
          <mesh position={[0, -0.03, 0]}>
            <boxGeometry args={[0.1, 0.07, 0.04]} />
            <meshStandardMaterial color="#9daed1" />
          </mesh>
        </group>
      )}
      {phase === "reinforce" &&
        points.map((a, i) => (
          <mesh key={i} position={[a[0], bottom + 0.02, a[2]]}>
            <boxGeometry args={[0.06, 0.04, 0.06]} />
            <meshStandardMaterial color="#596d6c" />
          </mesh>
        ))}
      {ties && !anchors && <Hook position={barPoint} progress={p} />}
      {ties && anchors && (
        <group>
          <Stick
            a={[xmin, headY + 0.02, zmin]}
            b={[xmax, headY + 0.02, zmin]}
            color="#9cabb2"
          />
          <Stick
            a={[xmin, headY + 0.02, zmax]}
            b={[xmax, headY + 0.02, zmax]}
            color="#9cabb2"
          />
          <Stick
            a={[xmin, headY + 0.02, zmin]}
            b={[xmin, headY + 0.02, zmax]}
            color="#9cabb2"
          />
          <Stick
            a={[xmax, headY + 0.02, zmin]}
            b={[xmax, headY + 0.02, zmax]}
            color="#9cabb2"
          />
        </group>
      )}
      {phase === "compact" && (
        <group scale={toolScale}>
          <PlateCompactor
            position={point.map((v) => v / toolScale) as Vec3}
            progress={p}
          />
        </group>
      )}
      {vibrator && !surface && vibrationPoint && (
        <group
          position={[
            vibrationPoint[0],
            top + 0.22 - dip * Math.min(0.2, size[1] * 0.3),
            vibrationPoint[2],
          ]}
        >
          <Stick
            a={[0, -Math.min(size[1] * 0.65, 0.35), 0]}
            b={[0, 0.25, 0]}
            width={0.025}
            color="#c1caca"
          />
          <Line
            points={[
              [0, 0.25, 0],
              [0.15, 0.5, 0.1],
              [0.4, 0.45, 0.25],
            ]}
            color="#3a4c55"
            lineWidth={5}
          />
        </group>
      )}
      {(phase === "level" || (vibrator && surface)) && (
        <group position={[point[0], top + 0.03, point[2]]}>
          <mesh>
            <boxGeometry args={[Math.min(size[0] * 0.8, 2), 0.045, 0.1]} />
            <meshStandardMaterial color="#b1b8ac" metalness={0.3} />
          </mesh>
          {vibrator && (
            <mesh position={[0, 0.13, 0]}>
              <boxGeometry args={[0.2, 0.2, 0.18]} />
              <meshStandardMaterial color="#d7b563" />
            </mesh>
          )}
          <Stick
            a={[0, 0.04, 0]}
            b={[0, 0.65, 0.3]}
            width={0.025}
            color="#536b73"
          />
        </group>
      )}
    </group>
  );
}
