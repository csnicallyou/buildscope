import { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  OrbitControls,
  PerspectiveCamera,
  OrthographicCamera,
  GizmoHelper,
  GizmoViewport,
  Line,
  Edges,
} from "@react-three/drei";
import { Box3, Plane, Vector3, CanvasTexture } from "three";
import type { OrbitControls as Controls } from "three-stdlib";
import { useStore, displayPosition } from "./store";
import {
  itemBounds,
  itemLayer,
  objectFor,
  visibleItems,
  type SceneItem,
} from "./objects";
import { sceneOptions, isConcrete, filteredBars } from "./viewRules";
import Dimensions from "./Dimensions";
import { dimensionData } from "./dimensionData";
import SectionCap from "./SectionCap";
import { Fragment } from "react";
import { elementGeometries, barsGeometry } from "./geometry";
function Camera({ paused }: { paused: boolean }) {
  const {
    view,
    ortho,
    project,
    cameraRevision,
    openedObject,
    exploded,
    onlySelected,
    calculatedObjects,
    filters,
    auditIds,
    hideConcrete,
    rebar,
    rebarKinds,
  } = useStore();
  const viewKey = JSON.stringify({
    filters,
    auditIds,
    hideConcrete,
    rebar,
    rebarKinds,
  });
  const selectionKey = onlySelected ? calculatedObjects.join("|") : "";
  const controls = useRef<Controls>(null);
  const { camera, size } = useThree();
  const saved = useRef<{
    position: Vector3;
    up: Vector3;
    quaternion: import("three").Quaternion;
    target: Vector3;
    zoom: number;
    project: typeof project;
    width: number;
    height: number;
    viewStamp: string;
  } | null>(null);
  const resumedAt = useRef(0);
  const viewStamp = JSON.stringify([
    view,
    ortho,
    cameraRevision,
    openedObject,
    exploded,
    onlySelected,
    selectionKey,
    viewKey,
  ]);
  useEffect(() => {
    if (paused) {
      if (!saved.current) {
        saved.current = {
          position: camera.position.clone(),
          up: camera.up.clone(),
          quaternion: camera.quaternion.clone(),
          target: controls.current?.target.clone() ?? new Vector3(),
          zoom: "zoom" in camera ? Number(camera.zoom) : 1,
          project,
          width: size.width,
          height: size.height,
          viewStamp,
        };
        const c = controls.current;
        if (c) {
          const damping = c.enableDamping;
          c.enableDamping = false;
          c.update();
          c.enableDamping = damping;
          camera.position.copy(saved.current.position);
          camera.quaternion.copy(saved.current.quaternion);
        }
      }
      resumedAt.current = 0;
      return;
    }
    if (saved.current) {
      const previous = saved.current;
      if (!resumedAt.current) resumedAt.current = performance.now();
      const canRestore =
        previous.project === project &&
        previous.viewStamp === viewStamp &&
        performance.now() - resumedAt.current < 500;
      if (
        !canRestore ||
        (size.width === previous.width && size.height === previous.height)
      )
        saved.current = null;
      if (canRestore) {
        camera.position.copy(previous.position);
        camera.up.copy(previous.up);
        camera.quaternion.copy(previous.quaternion);
        if ("zoom" in camera) {
          camera.zoom = previous.zoom;
          camera.updateProjectionMatrix();
        }
        controls.current?.target.copy(previous.target);
        controls.current?.update();
        return;
      }
    }

    const bounds = new Box3();
    const state = useStore.getState();
    for (const item of visibleItems(
      project,
      openedObject,
      state.hidden,
      state.isolated,
      state.onlySelected ? state.calculatedObjects : null,
      sceneOptions(state),
    )) {
      const e = item.element;
      const position = displayPosition(
        e.position,
        state.offsets[item.id],
        state.exploded,
        itemLayer(item, openedObject),
      );
      const b = itemBounds(item);
      for (const corner of [b.min, b.max])
        bounds.expandByPoint(
          new Vector3(
            ...(corner.map((v, a) => v + position[a]) as [
              number,
              number,
              number,
            ]),
          ),
        );
    }
    if (bounds.isEmpty())
      bounds.set(new Vector3(-5, -5, -5), new Vector3(5, 5, 5));
    const center = bounds.getCenter(new Vector3());
    const diameter = Math.max(0.3, bounds.getSize(new Vector3()).length());
    const distance = (diameter * 1.5) / Math.min(1, size.width / size.height);
    const positions = {
      iso: [1, 0.8, 1],
      top: [0, 1, 0.0001],
      front: [0, 0, 1],
      side: [1, 0, 0],
    };
    camera.position
      .copy(center)
      .add(
        new Vector3(...(positions[view] as [number, number, number]))
          .normalize()
          .multiplyScalar(distance),
      );
    camera.up.set(0, 1, 0);
    camera.lookAt(center);
    if ("isOrthographicCamera" in camera) {
      (camera as import("three").OrthographicCamera).zoom =
        Math.min(size.width, size.height) / (diameter * 1.15);
      camera.updateProjectionMatrix();
    }
    controls.current?.target.copy(center);
    controls.current?.update();
  }, [
    view,
    ortho,
    camera,
    project,
    size,
    cameraRevision,
    openedObject,
    exploded,
    onlySelected,
    selectionKey,
    viewKey,
    paused,
    viewStamp,
  ]);
  return (
    <OrbitControls
      ref={controls}
      enabled={!paused}
      makeDefault
      minDistance={0.05}
      maxDistance={5000}
    />
  );
}
function Part({ item, index }: { item: SceneItem; index: number }) {
  const e = item.element;
  const s = useStore();
  const geometries = useMemo(
    () => (item.kind === "steel" ? [] : elementGeometries(e)),
    [e, item.kind],
  );
  const steel = useMemo(
    () =>
      item.kind === "steel"
        ? barsGeometry(filteredBars(item.bars ?? [], s.rebarKinds))
        : !s.openedObject && s.rebar && e.evidence?.bars
          ? barsGeometry(filteredBars(e.evidence.bars, s.rebarKinds))
          : null,
    [e, item, s.rebar, s.openedObject, s.rebarKinds],
  );
  useEffect(
    () => () => {
      geometries.forEach((g) => g.geometry.dispose());
    },
    [geometries],
  );
  useEffect(
    () => () => {
      steel?.dispose();
    },
    [steel],
  );
  const pos = displayPosition(
    e.position,
    s.offsets[item.id],
    s.exploded,
    itemLayer(item, s.openedObject),
  );
  const planes = useMemo(
    () =>
      s.section
        ? [
            new Plane(
              new Vector3(
                s.cutAxis === "x" ? -1 : 0,
                s.cutAxis === "y" ? -1 : 0,
                s.cutAxis === "z" ? -1 : 0,
              ),
              s.cut,
            ),
          ]
        : [],
    [s.section, s.cut, s.cutAxis],
  );
  const objectId = objectFor(s.project, e.id)?.id ?? e.id;
  const inCalculation =
    !s.openedObject &&
    s.calculatedObjects.includes(objectId) &&
    (s.calculatorOpen ||
      s.calculatedObjects.length > 1 ||
      s.selected !== objectId);
  const auditHighlighted = !!s.auditIds?.includes(e.id);
  const hiddenConcrete = s.hideConcrete && !s.auditIds && isConcrete(e);
  const highlighted =
    s.selected === item.id ||
    (!s.openedObject && s.selected === objectFor(s.project, e.id)?.id);
  function click(event: ThreeEvent<MouseEvent>) {
    if (
      s.section &&
      event.point.getComponent(
        s.cutAxis === "x" ? 0 : s.cutAxis === "y" ? 1 : 2,
      ) >
        s.cut + 1e-6
    )
      return;
    event.stopPropagation();
    if (s.measure) {
      const p = event.point;
      s.set({
        points: [...(s.points.length === 2 ? [] : s.points), [p.x, p.y, p.z]],
      });
    } else s.select(item.id);
  }
  return (
    <group position={pos}>
      {!hiddenConcrete &&
        geometries.map((p, i) => (
          <Fragment key={i}>
            <mesh
              key={i}
              position={p.offset}
              onClick={click}
              userData={{ id: e.id }}
              geometry={p.geometry}
            >
              <meshStandardMaterial
                key={`${s.opacity < 1}-${s.wire}-${s.section}`}
                onUpdate={(material) => {
                  material.needsUpdate = true;
                }}
                color={
                  auditHighlighted
                    ? "#d897c5"
                    : inCalculation
                      ? "#5ccbb7"
                      : highlighted
                        ? "#f4b85d"
                        : e.color
                }
                roughness={0.82}
                metalness={e.material === "Сталь" ? 0.35 : 0}
                transparent={s.opacity < 1}
                opacity={s.opacity}
                depthWrite={s.opacity > 0.99}
                wireframe={s.wire}
                clippingPlanes={planes}
              />
              {!s.section && !s.wire && (
                <Edges
                  threshold={20}
                  color={
                    inCalculation
                      ? "#c8fff0"
                      : highlighted
                        ? "#fff0c5"
                        : "#3e5558"
                  }
                />
              )}
            </mesh>
            {s.section && !s.wire && (
              <SectionCap
                geometry={p.geometry}
                offset={p.offset}
                worldPosition={pos}
                axis={s.cutAxis}
                cut={s.cut}
                plane={planes[0]}
                order={10 + index * 200 + i * 3}
                onClick={click}
              />
            )}
          </Fragment>
        ))}
      {steel && (
        <mesh geometry={steel} onClick={click}>
          <meshStandardMaterial
            color={
              inCalculation ? "#c8fff0" : highlighted ? "#ffcf76" : "#dba45b"
            }
            roughness={0.5}
            metalness={0.3}
            clippingPlanes={planes}
          />
        </mesh>
      )}
    </group>
  );
}
function Scene({ paused }: { paused: boolean }) {
  const s = useStore();
  const items = useMemo(
    () =>
      visibleItems(
        s.project,
        s.openedObject,
        s.hidden,
        s.isolated,
        s.onlySelected ? s.calculatedObjects : null,
        sceneOptions(s),
      ),
    [
      s.project,
      s.openedObject,
      s.hidden,
      s.isolated,
      s.onlySelected,
      s.calculatedObjects,
      s.filters,
      s.auditIds,
      s.hideConcrete,
      s.rebar,
      s.rebarKinds,
    ],
  );
  const gridY = useMemo(
    () =>
      Math.min(
        -0.85,
        ...items.map(
          (item) => itemBounds(item).min[1] + item.element.position[1] - 0.15,
        ),
      ),
    [items],
  );
  return (
    <>
      {s.ortho ? (
        <OrthographicCamera
          makeDefault
          position={[35, 28, 35]}
          near={0.01}
          far={10000}
        />
      ) : (
        <PerspectiveCamera
          makeDefault
          fov={42}
          position={[35, 28, 35]}
          near={0.01}
          far={10000}
        />
      )}
      <Camera paused={paused} />
      <ambientLight intensity={1.7} />
      <directionalLight position={[10, 25, 8]} intensity={2.4} />
      <gridHelper
        args={[
          160,
          80,
          s.theme === "dark" ? "#38525c" : "#b0c2c6",
          s.theme === "dark" ? "#243a44" : "#d2dfe0",
        ]}
        position={[0, gridY, 0]}
      />
      {s.project.document &&
        !s.isolated &&
        !s.openedObject &&
        !s.onlySelected &&
        !s.auditIds && <EngineeringAxes />}
      {items.map((item, index) => (
        <Part key={item.id} item={item} index={index} />
      ))}
      {s.dimensions && items.find((item) => item.id === s.selected) && (
        <Dimensions
          item={items.find((item) => item.id === s.selected)!}
          layer={itemLayer(
            items.find((item) => item.id === s.selected)!,
            s.openedObject,
          )}
        />
      )}
      {s.points.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshBasicMaterial color="#ffbe59" />
        </mesh>
      ))}
      {s.points.length === 2 && (
        <>
          <Line points={s.points} color="#ffbe59" lineWidth={2} />
        </>
      )}
      <GizmoHelper alignment="bottom-right" margin={[65, 65]}>
        <GizmoViewport
          axisColors={["#c97b72", "#88b491", "#77a6d1"]}
          labelColor="white"
        />
      </GizmoHelper>
    </>
  );
}
function EngineeringAxes() {
  const doc = useStore((s) => s.project.document)!;
  const xs = doc.axes.x,
    zs = doc.axes.z;
  const xmin = Math.min(...xs.map((a) => a.value)),
    xmax = Math.max(...xs.map((a) => a.value)),
    zmin = Math.min(...zs.map((a) => a.value)),
    zmax = Math.max(...zs.map((a) => a.value));
  return (
    <group>
      {xs.map(({ label, value }) => (
        <group key={"x" + label}>
          <Line
            points={[
              [value, 0.08, zmin - 2],
              [value, 0.08, zmax + 2],
            ]}
            color="#63919b"
            lineWidth={0.6}
            dashed
            dashSize={0.4}
            gapSize={0.2}
          />
          <AxisLabel position={[value, 0.08, zmax + 2]} label={label} />
        </group>
      ))}
      {zs.map(({ label, value }) => (
        <group key={"z" + label}>
          <Line
            points={[
              [xmin - 2, 0.08, value],
              [xmax + 2, 0.08, value],
            ]}
            color="#63919b"
            lineWidth={0.6}
            dashed
            dashSize={0.4}
            gapSize={0.2}
          />
          <AxisLabel position={[xmin - 2, 0.08, value]} label={label} />
        </group>
      ))}
    </group>
  );
}
function AxisLabel({
  position,
  label,
}: {
  position: [number, number, number];
  label: string;
}) {
  const theme = useStore((s) => s.theme);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const c = canvas.getContext("2d")!;
    c.beginPath();
    c.arc(32, 32, 29, 0, Math.PI * 2);
    c.fillStyle = theme === "dark" ? "#1d323c" : "#ffffff";
    c.fill();
    c.strokeStyle = "#63919b";
    c.lineWidth = 2;
    c.stroke();
    c.font = "28px Segoe UI";
    c.fillStyle = theme === "dark" ? "#dce5e8" : "#273e48";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(label, 32, 33);
    return new CanvasTexture(canvas);
  }, [label, theme]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={position} scale={[0.7, 0.7, 1]} renderOrder={100}>
      <spriteMaterial map={texture} depthTest={false} depthWrite={false} />
    </sprite>
  );
}
export default function Viewer({ paused = false }: { paused?: boolean }) {
  const theme = useStore((s) => s.theme);
  const points = useStore((s) => s.points);
  const state = useStore();
  const focused = visibleItems(
    state.project,
    state.openedObject,
    state.hidden,
    state.isolated,
    state.onlySelected ? state.calculatedObjects : null,
    sceneOptions(state),
  ).find((item) => item.id === state.selected);
  const dims = focused && state.dimensions ? dimensionData(focused) : null;
  return (
    <>
      <Canvas
        frameloop={paused ? "never" : "always"}
        gl={{
          antialias: true,
          stencil: true,
          localClippingEnabled: true,
          preserveDrawingBuffer: true,
        }}
        dpr={[1, 2]}
        style={{ background: theme === "dark" ? "#142832" : "#e5edef" }}
        onPointerMissed={() => useStore.getState().set({ selected: null })}
      >
        <Scene paused={paused} />
      </Canvas>
      {dims && (
        <div className="dimension-summary" data-testid="selected-dimensions">
          <strong>Габариты модели</strong>
          <span>
            {dims.size
              .map(
                (n, i) =>
                  `${["X", "Y", "Z"][i]} ${n.toLocaleString("ru-RU", { maximumFractionDigits: 3 })} м`,
              )
              .join(" · ")}
          </span>
          {dims.cutouts.length > 0 && (
            <span>
              Вырезы/профиль:{" "}
              {[...new Set(dims.cutouts.map((s) => s.label))].join("; ")}
            </span>
          )}
          <small>
            {state.project.document?.zeroAbsolute === null
              ? "Отметки схемы:"
              : "Проектные отметки:"}{" "}
            {dims.levels.bottom.toLocaleString("ru-RU", {
              maximumFractionDigits: 3,
            })}{" "}
            /{" "}
            {dims.levels.top.toLocaleString("ru-RU", {
              maximumFractionDigits: 3,
            })}{" "}
            м
          </small>
        </div>
      )}
      {points.length === 2 && (
        <div className="measurement-result">
          <span className="measure-label">
            {Math.hypot(...points[0].map((v, i) => v - points[1][i])).toFixed(
              3,
            )}{" "}
            м
          </span>
        </div>
      )}
    </>
  );
}
