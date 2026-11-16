import { create } from "zustand";
import { demo, type Project, type Vec3 } from "./model";
import { hasObjects, objectFor } from "./objects";
type State = {
  project: Project;
  selected: string | null;
  openedObject: string | null;
  calculatorOpen: boolean;
  calculatedObjects: string[];
  hidden: string[];
  isolated: string | null;
  offsets: Record<string, Vec3>;
  exploded: boolean;
  wire: boolean;
  opacity: number;
  section: boolean;
  cut: number;
  measure: boolean;
  points: Vec3[];
  theme: "dark" | "light";
  view: "iso" | "top" | "front" | "side";
  ortho: boolean;
  cameraRevision: number;
  rebar: boolean;
  set: (patch: Partial<Omit<State, "set" | "load" | "reset">>) => void;
  load: (p: Project) => void;
  reset: () => void;
  select: (id: string) => void;
  openObject: (id: string | null) => void;
};
export const useStore = create<State>((set, get) => ({
  project: demo(),
  selected: null,
  openedObject: null,
  calculatorOpen: false,
  calculatedObjects: [],
  hidden: [],
  isolated: null,
  offsets: {},
  exploded: false,
  wire: false,
  opacity: 1,
  section: false,
  cut: 0,
  measure: false,
  points: [],
  theme: "dark",
  view: "iso",
  ortho: false,
  cameraRevision: 0,
  rebar: false,
  set,
  select: (id) => {
    const s = get();
    if (hasObjects(s.project) && !s.openedObject) {
      const root = objectFor(s.project, id)?.id;
      if (root) {
        const removing = s.calculatedObjects.includes(root);
        set({
          selected: removing ? null : root,
          calculatedObjects: removing
            ? s.calculatedObjects.filter((x) => x !== root)
            : [...s.calculatedObjects, root],
        });
      }
      return;
    }
    set({
      selected:
        !s.openedObject && hasObjects(s.project)
          ? (objectFor(s.project, id)?.id ?? id)
          : id,
    });
  },
  openObject: (id) =>
    set((s) => ({
      openedObject: id,
      calculatorOpen: false,
      selected: id ? null : s.openedObject,
      hidden: [],
      isolated: null,
      offsets: {},
      exploded: false,
      measure: false,
      points: [],
      section: false,
      rebar: !!id,
      opacity: id ? 0.35 : 1,
      cameraRevision: s.cameraRevision + 1,
    })),
  load: (project) =>
    set({
      project,
      selected: null,
      openedObject: null,
      calculatorOpen: false,
      calculatedObjects: [],
      hidden: [],
      isolated: null,
      offsets: {},
      exploded: false,
      points: [],
      section: false,
      measure: false,
      rebar: false,
      opacity: 1,
    }),
  reset: () =>
    set({
      offsets: {},
      exploded: false,
      hidden: [],
      isolated: null,
      points: [],
    }),
}));
export function displayPosition(
  position: Vec3,
  offset: Vec3 = [0, 0, 0],
  exploded = false,
  layer = 0,
): Vec3 {
  return [
    position[0] + offset[0],
    position[1] + offset[1] + (exploded ? layer * 1.6 : 0),
    position[2] + offset[2],
  ];
}
