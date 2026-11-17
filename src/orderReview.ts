import { z } from "zod";
import type { WorkDraft, WorkRow } from "./workOrders";
export const reviewSchema = z.object({
  revision: z.number().int().positive(),
  rows: z
    .array(
      z.object({
        id: z.string().min(1),
        value: z.number().finite().nonnegative().nullable(),
        basis: z.string().trim().max(4000),
      }),
    )
    .max(500),
});
export const additionalSchema = z.object({
  revision: z.number().int().positive(),
  work: z.string().trim().min(1).max(1000),
  unit: z.string().trim().min(1).max(100),
  basis: z.string().trim().min(3).max(4000),
  target: z.string().trim().max(1000),
});
export function manualWorkRow(
  draft: WorkDraft,
  work: string,
  unit: string,
  target: string,
  plan: number | null = null,
): WorkRow {
  return {
    id: crypto.randomUUID(),
    date: draft.date,
    site: draft.site,
    shift: draft.shift,
    contractor: draft.contractor,
    zone: draft.zone,
    axes: "",
    workId: "other",
    work,
    plan,
    unit,
    actual: null,
    equipment: "",
    brand: "",
    plate: "",
    note: "",
    target: target || draft.zone || draft.site,
    elementIds: [],
    project: "",
    basis: "Введено координатором без 3D-привязки",
    modelPlan: null,
    modelNeed: null,
  };
}
export const verifiedValue = (row: WorkRow) => row.verifiedActual ?? null;
