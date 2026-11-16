import { create } from "zustand";
import { demo, type Project, type Vec3 } from "./model";
import { hasObjects, objectFor } from "./objects";
type State = {
  project: Project;
  selected: string | null;
  openedObject: string | null;
  calculatorOpen: boolean;
  calculatedObjects: string[];
  onlySelected: boolean;
  mobilePanel: "none" | "tree" | "inspector";
  mobileExpanded: boolean;
  groupVisibility: { hidden: string[]; isolated: string | null } | null;
  toggleOnlySelected: () => void;
  clearSelection: () => void;
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
  onlySelected: false,
  mobilePanel: "none",
  mobileExpanded: false,
  groupVisibility: null,
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
  toggleOnlySelected: () => {
    const s = get();
    if (!s.onlySelected && !s.calculatedObjects.length) return;
    set(
      s.onlySelected
        ? {
            onlySelected: false,
            hidden: s.groupVisibility?.hidden ?? [],
            isolated: s.groupVisibility?.isolated ?? null,
            groupVisibility: null,
            cameraRevision: s.cameraRevision + 1,
          }
        : {
            onlySelected: true,
            groupVisibility: { hidden: s.hidden, isolated: s.isolated },
            hidden: [],
            isolated: null,
            cameraRevision: s.cameraRevision + 1,
          },
    );
  },
  clearSelection: () => {
    const s = get();
    set({
      calculatedObjects: [],
      selected: null,
      onlySelected: false,
      groupVisibility: null,
      hidden: s.groupVisibility?.hidden ?? s.hidden,
      isolated: s.groupVisibility?.isolated ?? s.isolated,
      cameraRevision: s.cameraRevision + 1,
    });
  },
  select: (id) => {
    const s = get();
    if (hasObjects(s.project) && !s.openedObject) {
      const root = objectFor(s.project, id)?.id;
      if (root) {
        const removing = s.calculatedObjects.includes(root);
        set({
          selected: removing ? null : root,
          ...(removing && s.calculatedObjects.length === 1 && s.onlySelected
            ? {
                onlySelected: false,
                groupVisibility: null,
                hidden: s.groupVisibility?.hidden ?? [],
                isolated: s.groupVisibility?.isolated ?? null,
              }
            : {}),
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
      onlySelected: false,
      groupVisibility: null,
      mobilePanel: "none",
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
      onlySelected: false,
      groupVisibility: null,
      mobilePanel: "none",
      mobileExpanded: false,
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
      onlySelected: false,
      groupVisibility: null,
      cameraRevision: get().cameraRevision + 1,
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
