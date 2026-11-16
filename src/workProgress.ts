import { operationKey, workTypes, type WorkRow } from "./workOrders";
import type { SavedWorkOrder } from "./workOrderArchive";
import type { SharedOrder, WorkStatus } from "./workspaceTypes";
import { objectFor } from "./objects";
import type { Project } from "./model";
export const unitKey = (unit: string) =>
  ({ "м³": "м3", "м²": "м2", тн: "т" })[
    unit.trim().toLowerCase().replace(/\.$/, "")
  ] ?? unit.trim().toLowerCase().replace(/\.$/, "");
export const modelKeyForRow = (row: WorkRow) =>
  row.elementIds.length &&
  row.elementIds.every((id) => id.startsWith("canopy-"))
    ? "kzh-canopy"
    : row.elementIds.length &&
        row.elementIds.every((id) => id.startsWith("pavilion-"))
      ? "kzh-pavilion"
      : `custom:${row.project}`;
export const rowOperation = (row: WorkRow) =>
  /^Бетонирование\s/i.test(
    workTypes.find((w) => w.id === row.workId)?.label ?? row.work,
  ) && !/подбет/i.test(row.work)
    ? "concrete"
    : operationKey(row.workId);
export const rowIds = (row: WorkRow) =>
  row.quantityElementIds?.length ? row.quantityElementIds : row.elementIds;
export const projectModelKey = (p: Project) =>
  p.elements.length && p.elements.every((e) => e.id.startsWith("canopy-"))
    ? "kzh-canopy"
    : p.elements.length && p.elements.every((e) => e.id.startsWith("pavilion-"))
      ? "kzh-pavilion"
      : `custom:${p.name}`;
const overlaps = (a: WorkRow, b: WorkRow) =>
  modelKeyForRow(a) === modelKeyForRow(b) &&
  rowOperation(a) === rowOperation(b) &&
  rowIds(a).some((id) => rowIds(b).includes(id));
type Entry = { row: WorkRow; shared: SharedOrder };
export type ProgressGroup = {
  key: string;
  rows: Entry[];
  work: string;
  target: string;
  unit: string;
  need: number | null;
  actual: number;
  actualIncomplete: boolean;
  hasActuals: boolean;
  remaining: number | null;
  reserved: number | null;
  conflict: boolean;
};
export function progressGroups(orders: SharedOrder[]): ProgressGroup[] {
  const groups: Entry[][] = [];
  for (const shared of orders)
    for (const row of shared.order.draft.rows) {
      const matching = groups.filter((g) =>
        g.some((e) => overlaps(e.row, row)),
      );
      if (!matching.length) groups.push([{ row, shared }]);
      else {
        const merged = [...matching.flat(), { row, shared }];
        for (const g of matching) groups.splice(groups.indexOf(g), 1);
        groups.push(merged);
      }
    }
  return groups.map((entries) => {
    const first = entries[0].row;
    const units = new Set(entries.map((e) => unitKey(e.row.unit)));
    const needs = entries
      .map((e) =>
        e.row.modelNeed && unitKey(e.row.modelNeed.unit) === unitKey(first.unit)
          ? e.row.modelNeed.value
          : null,
      )
      .filter((v): v is number => v !== null);
    const conflict =
      units.size > 1 ||
      needs.some((v) => Math.abs(v - needs[0]) > 1e-6 * Math.max(1, v));
    const need = conflict || !needs.length ? null : needs[0];
    const actual = entries
      .filter((e) => e.shared.stage !== "issued")
      .reduce((n, e) => n + (e.row.actual ?? 0), 0);
    const actualIncomplete = entries.some(
      (e) => e.shared.stage !== "issued" && e.row.actual === null,
    );
    const hasActuals = entries.some(
      (e) => e.shared.stage !== "issued" && e.row.actual !== null,
    );
    const active = entries.filter((e) => e.shared.stage === "issued");
    return {
      key: `${modelKeyForRow(first)}:${rowOperation(first)}:${[...rowIds(first)].sort().join("|")}`,
      rows: entries,
      work: first.work,
      target: first.target,
      unit: first.unit,
      need,
      actual,
      actualIncomplete,
      hasActuals,
      remaining:
        need === null || actualIncomplete ? null : Math.max(0, need - actual),
      conflict,
      reserved:
        conflict || active.some((e) => e.row.plan === null)
          ? null
          : active.reduce((n, e) => n + e.row.plan!, 0),
    };
  });
}
export function allocationErrors(
  candidate: SavedWorkOrder,
  existing: SharedOrder[],
): string[] {
  const entry: SharedOrder = {
    order: candidate,
    revision: 1,
    stage: "issued",
    updatedAt: "",
    updatedBy: "",
  };
  const errors: string[] = [];
  for (const group of progressGroups([
    ...existing.filter((o) => o.order.id !== candidate.id),
    entry,
  ])) {
    const newRows = group.rows.filter((e) => e.shared === entry);
    if (!newRows.length) continue;
    const old = group.rows.filter((e) => e.shared !== entry);
    if (old.some((e) => e.shared.stage !== "issued" && e.row.actual === null)) {
      errors.push(
        `${group.target}: в предыдущем сданном наряде не заполнен факт; уточните его перед назначением остатка.`,
      );
      continue;
    }
    if (group.conflict) {
      errors.push(
        `${group.target}: различаются единицы или основания потребности; уточните план и модель.`,
      );
      continue;
    }
    if (
      (old.some((e) => e.shared.stage === "issued" && e.row.plan === null) ||
        newRows.some((e) => e.row.plan === null)) &&
      old.some((e) => e.shared.stage === "issued")
    ) {
      errors.push(
        `${group.target}: эта работа уже назначена в другом несданном наряде; уточните объём перед повторным назначением.`,
      );
      continue;
    }
    if (group.need !== null) {
      const reservations = group.rows
        .filter((e) => e.shared.stage === "issued")
        .reduce(
          (n, e) => n + (e.row.plan ?? Math.max(0, group.need! - group.actual)),
          0,
        );
      if (
        group.actual + reservations >
        group.need + 1e-6 * Math.max(1, group.need)
      )
        errors.push(
          `${group.target}: план вместе с уже сданным объёмом превышает потребность по модели.`,
        );
    } else if (old.length && newRows.some((e) => e.row.plan === null))
      errors.push(
        `${group.target}: повторная работа без определённого плана требует уточнения объёма.`,
      );
  }
  return [...new Set(errors)];
}
export function objectWorkStatuses(
  project: Project,
  orders: SharedOrder[],
): Record<string, WorkStatus> {
  const map = new Map<string, WorkStatus[]>();
  for (const shared of orders)
    for (const row of shared.order.draft.rows) {
      const status: WorkStatus =
        shared.stage === "accepted"
          ? "accepted"
          : shared.stage === "submitted"
            ? "submitted"
            : row.actual !== null || row.completed
              ? "in-progress"
              : "assigned";
      for (const id of rowIds(row)) {
        const root = objectFor(project, id)?.id;
        if (root) map.set(root, [...(map.get(root) ?? []), status]);
      }
    }
  return Object.fromEntries(
    [...map].map(([id, statuses]) => [
      id,
      statuses.every((s) => s === "accepted")
        ? "accepted"
        : statuses.includes("in-progress")
          ? "in-progress"
          : statuses.includes("assigned")
            ? "assigned"
            : "submitted",
    ]),
  );
}
