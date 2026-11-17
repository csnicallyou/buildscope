import { z } from "zod";
import {
  reportErrors,
  workTypes,
  type WorkDraft,
  type WorkId,
} from "./workOrders";

export const workOrdersStorageKey = "buildscope.work-orders.v1";
const quantity = z.number().finite().nonnegative().nullable();
const text = z.string().max(20000);
const workRow = z.object({
  verifiedActual: quantity.optional(),
  verificationBasis: text.optional(),
  verifiedAt: text.optional(),
  verifiedBy: text.optional(),
  additional: z
    .object({ basis: text.min(1), addedAt: text, addedBy: text })
    .optional(),
  id: text,
  date: text,
  site: text,
  shift: text,
  contractor: text,
  zone: text,
  axes: text,
  workId: z
    .string()
    .refine((id) => workTypes.some((w) => w.id === id))
    .transform((id) => id as WorkId),
  work: text,
  plan: quantity,
  unit: text,
  actual: quantity,
  equipment: text,
  brand: text,
  plate: text,
  note: text,
  target: text,
  elementIds: z.array(text),
  project: text,
  basis: text,
  modelPlan: quantity,
  modelNeed: z
    .object({ value: quantity, unit: text, basis: text })
    .nullable()
    .optional(),
  completed: z.boolean().optional(),
  quantityElementIds: z.array(text).optional(),
});
const draftSchema = z.object({
  plannedPeople: z.number().int().nonnegative().nullable().optional(),
  reportedPeople: z.number().int().nonnegative().nullable().optional(),
  proposalId: text.nullable().optional(),
  nodeId: text.nullable().optional(),
  taskId: text.nullable().optional(),
  brigade: text,
  date: text,
  site: text,
  shift: text,
  contractor: text,
  zone: text,
  rows: z.array(workRow).max(500),
  crew: z
    .array(
      z.object({
        id: text,
        date: text,
        site: text,
        contractor: text,
        shift: text,
        name: text,
        startSignatureStatus: z
          .enum(["unchecked", "present", "missing", "illegible"])
          .optional(),
        endSignatureStatus: z
          .enum(["unchecked", "present", "missing", "illegible"])
          .optional(),
        startSignatureNoteId: z.string().min(1).max(200).nullable().optional(),
        endSignatureNoteId: z.string().min(1).max(200).nullable().optional(),
        start: text,
        end: text,
        breakMinutes: z.number().finite().nonnegative(),
        note: text,
      }),
    )
    .max(200),
});
export const savedSchema = z.object({
  id: z.string().min(1),
  createdAt: text,
  submittedAt: text.nullable(),
  draft: draftSchema,
});
const archiveSchema = z.object({
  version: z.literal(1),
  orders: z.array(savedSchema),
});
export type SavedWorkOrder = z.infer<typeof savedSchema> & {
  serverRevision?: number;
};
export function parseWorkOrders(raw: string | null): SavedWorkOrder[] {
  return raw ? archiveSchema.parse(JSON.parse(raw) as unknown).orders : [];
}
export function serializeWorkOrders(orders: SavedWorkOrder[]) {
  return JSON.stringify(archiveSchema.parse({ version: 1, orders }));
}
export function issueWorkOrder(draft: WorkDraft): SavedWorkOrder {
  const errors = reportErrors(draft);
  if (errors.length) throw Error(errors.join("; "));
  if (!draft.rows.length) throw Error("Добавьте хотя бы одну работу в наряд");
  if (draft.rows.some((r) => r.date !== draft.date || r.shift !== draft.shift))
    throw Error(
      "Один наряд относится к одной дате и смене. Уточните параметры строк.",
    );
  return savedSchema.parse({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    submittedAt: null,
    draft: {
      ...structuredClone(draft),
      reportedPeople: null,
      crew: draft.crew.map((r) => ({
        ...structuredClone(r),
        start: "",
        end: "",
        breakMinutes: 0,
        startSignatureNoteId: null,
        endSignatureNoteId: null,
        startSignatureStatus: "unchecked",
        endSignatureStatus: "unchecked",
      })),
      rows: draft.rows.map((r) => ({
        ...structuredClone(r),
        actual: null,
        verifiedActual: null,
        verificationBasis: "",
        verifiedAt: "",
        verifiedBy: "",
        completed: false,
      })),
    },
  });
}
export function handoffErrors(order: SavedWorkOrder): string[] {
  return [
    ...reportErrors(order.draft),
    ...order.draft.crew.flatMap((person, i) =>
      !!person.start !== !!person.end
        ? [`Табель ${i + 1}: перед сдачей укажите начало и конец смены`]
        : [],
    ),
    ...order.draft.rows.flatMap((row, i) =>
      row.completed && row.actual === null
        ? [`Работа ${i + 1}: укажите факт выполненной работы`]
        : [],
    ),
  ];
}
export function submitWorkOrder(order: SavedWorkOrder): SavedWorkOrder {
  const errors = handoffErrors(order);
  if (errors.length) throw Error(errors.join("; "));
  const submitted = savedSchema.parse({
    ...order,
    submittedAt: new Date().toISOString(),
  });
  return { ...submitted, serverRevision: order.serverRevision };
}
