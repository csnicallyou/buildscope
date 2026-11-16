import { create } from "zustand";
import { demo, type Project, type Vec3 } from "./model";
import { hasObjects, objectFor } from "./objects";
import type { WorkStatus } from "./workspaceTypes";
import {
  emptyFilters,
  allBarKinds,
  type ViewFilters,
  type BarKind,
} from "./viewRules";
type State = {
  project: Project;
  selected: string | null;
  openedObject: string | null;
  calculatorOpen: boolean;
  calculatedObjects: string[];
  multipleSelection: boolean;
  setMultipleSelection: (enabled: boolean) => void;
  removeFromSelection: (id: string) => void;
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
  cutAxis: "x" | "y" | "z";
  dimensions: boolean;
  filters: ViewFilters;
  auditIds: string[] | null;
  hideConcrete: boolean;
  rebarKinds: BarKind[];
  measure: boolean;
  points: Vec3[];
  theme: "dark" | "light";
  workStatusColors: boolean;
  workStatuses: Record<string,WorkStatus>;
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
  multipleSelection: false,
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
  cutAxis: "x",
  dimensions: true,
  filters: emptyFilters,
  auditIds: null,
  hideConcrete: false,
  rebarKinds: allBarKinds,
  measure: false,
  points: [],
  theme: "dark",
  workStatusColors: false,
  workStatuses: {},
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
  setMultipleSelection: (enabled) => {
    const s = get();
    if (s.openedObject) return;
    const focus =
      s.selected && s.calculatedObjects.includes(s.selected)
        ? s.selected
        : (s.calculatedObjects.at(-1) ?? null);
    set(
      enabled
        ? { multipleSelection: true, measure: false, points: [] }
        : {
            multipleSelection: false,
            selected: focus,
            calculatedObjects: focus ? [focus] : [],
            calculatorOpen: false,
            onlySelected: false,
            groupVisibility: null,
            hidden: s.groupVisibility?.hidden ?? s.hidden,
            isolated: s.groupVisibility?.isolated ?? s.isolated,
          },
    );
  },
  removeFromSelection: (id) => {
    const s = get();
    const remaining = s.calculatedObjects.filter((x) => x !== id);
    set({
      calculatedObjects: remaining,
      selected:
        s.selected && remaining.includes(s.selected)
          ? s.selected
          : (remaining.at(-1) ?? null),
      ...(!remaining.length && s.onlySelected
        ? {
            onlySelected: false,
            groupVisibility: null,
            hidden: s.groupVisibility?.hidden ?? [],
            isolated: s.groupVisibility?.isolated ?? null,
          }
        : {}),
    });
  },
  select: (id) => {
    const s = get();
    if (hasObjects(s.project) && !s.openedObject) {
      const root = objectFor(s.project, id)?.id;
      if (root) {
        if (!s.multipleSelection)
          set({ selected: root, calculatedObjects: [root] });
        else if (s.calculatedObjects.includes(root))
          s.removeFromSelection(root);
        else
          set({
            selected: root,
            calculatedObjects: [...s.calculatedObjects, root],
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
      multipleSelection: false,
      calculatorOpen: false,
      onlySelected: false,
      groupVisibility: null,
      mobilePanel: "none",
      selected: id ? null : s.openedObject,
      ...(!id && s.openedObject ? { calculatedObjects: [s.openedObject] } : {}),
      hidden: [],
      isolated: null,
      offsets: {},
      exploded: false,
      measure: false,
      points: [],
      section: false,
      auditIds: null,
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
      multipleSelection: false,
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
      filters: emptyFilters,
      auditIds: null,
      hideConcrete: false,
      rebarKinds: allBarKinds,
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
      auditIds: null,
      filters: emptyFilters,
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
