import type { Element } from "./model";
import type { Bar } from "./engineering";
import { elementQuantityStatus } from "./quality";
export type ViewFilters = {
  category: string;
  material: string;
  unverified: boolean;
};
export const emptyFilters: ViewFilters = {
  category: "",
  material: "",
  unverified: false,
};
export type BarKind = "grid" | "stirrup" | "anchor" | "other";
export const allBarKinds: BarKind[] = ["grid", "stirrup", "anchor", "other"];
export const barKindLabels: Record<BarKind, string> = {
  grid: "Сетки",
  stirrup: "Хомуты и скобы",
  anchor: "Анкеры",
  other: "Продольные и прочие",
};
export function barKind(label: string): BarKind {
  if (/анкер|M24/i.test(label)) return "anchor";
  if (/сетк/i.test(label)) return "grid";
  if (/хомут|скоб|^[ХX]\d|^Ск\d/i.test(label)) return "stirrup";
  return "other";
}
export const isConcrete = (e: Element) => /бетон/i.test(e.material);
export const needsReview = (e: Element) =>
  !e.material.trim() ||
  ["assumed", "unknown"].includes(elementQuantityStatus(e)) ||
  /не задан|неизвест/i.test(e.material);
export function matchesFilters(e: Element, filters: ViewFilters) {
  return (
    (!filters.category || e.category === filters.category) &&
    (!filters.material || e.material === filters.material) &&
    (!filters.unverified || needsReview(e))
  );
}
export function filteredBars(bars: Bar[], kinds: BarKind[]) {
  return bars.filter((b) => kinds.includes(barKind(b.label)));
}
export type SceneOptions = {
  filters: ViewFilters;
  auditIds: string[] | null;
  hideConcrete: boolean;
  rebar: boolean;
  rebarKinds: BarKind[];
};
export function sceneOptions(s: SceneOptions): SceneOptions {
  return {
    filters: s.filters,
    auditIds: s.auditIds,
    hideConcrete: s.hideConcrete,
    rebar: s.rebar,
    rebarKinds: s.rebarKinds,
  };
}
