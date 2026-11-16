import { create } from "zustand";
import { demo, type Project, type Vec3 } from "./model";
type State = {
  project: Project;
  selected: string | null;
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
  set: (patch: Partial<Omit<State, "set" | "load" | "reset">>) => void;
  load: (p: Project) => void;
  reset: () => void;
};
export const useStore = create<State>((set) => ({
  project: demo(),
  selected: null,
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
  set,
  load: (project) =>
    set({
      project,
      selected: null,
      hidden: [],
      isolated: null,
      offsets: {},
      exploded: false,
      points: [],
      section: false,
      measure: false,
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
