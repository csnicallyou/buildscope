import { z } from "zod";
const text = z.string().trim().max(4000),
  title = text.min(1).max(180),
  id = z.string().max(180);
const quantity = z.number().finite().nonnegative().nullable();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T12:00:00Z");
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === v;
  }, "Укажите существующую дату");
const moment = z
  .string()
  .refine(
    (v) =>
      !v ||
      (/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(v) &&
        date.safeParse(v.slice(0, 10)).success &&
        Number.isFinite(Date.parse(v + "+03:00"))),
    "Укажите дату и время",
  );
const base = { title, brigade: text, nodeId: id.nullable() };
export const fieldPayloads = [
  z.object({
    kind: z.literal("contractor"),
    ...base,
    contact: text,
    phone: text,
    active: z.boolean(),
    note: text,
  }),
  z.object({
    kind: z.literal("machine"),
    ...base,
    plate: title,
    owner: title,
    active: z.boolean(),
    note: text,
  }),
  z.object({
    kind: z.literal("waybill"),
    ...base,
    date,
    shift: z.enum(["День", "Ночь"]),
    machineId: id.min(1),
    orderId: id.nullable(),
    source: title,
    hours: quantity,
    startAt: moment,
    endAt: moment,
    allocations: z
      .array(z.object({ nodeId: id.nullable(), work: title, hours: quantity }))
      .max(200),
    status: z.enum(["draft", "received", "checked"]),
    note: text,
  }),
  z.object({
    kind: z.literal("request"),
    ...base,
    date,
    resource: z.enum(["material", "machine"]),
    quantity,
    unit: title,
    source: title,
    status: z.enum(["draft", "approved", "ordered", "received", "cancelled"]),
    note: text,
  }),
  z.object({
    kind: z.literal("proposal"),
    ...base,
    date,
    shift: z.enum(["День", "Ночь"]),
    contractorId: id.nullable(),
    quantity,
    unit: title,
    equipment: text,
    source: title,
    status: z.enum(["proposed", "approved", "rejected"]),
    note: text,
  }),
] as const;
export const fieldSchema = z.discriminatedUnion("kind", fieldPayloads);
export type FieldPayload = z.infer<typeof fieldSchema>;
export type FieldKind = FieldPayload["kind"];
export const fieldLabels: Record<FieldKind, string> = {
  contractor: "Подрядчики",
  machine: "Техника",
  waybill: "Путевые листы",
  request: "Заявки",
  proposal: "Предложения работ",
};
export const fieldStatusLabels: Record<string, string> = {
  draft: "Черновик",
  received: "Получено",
  checked: "Проверено",
  approved: "Согласовано",
  ordered: "Заказано / назначено",
  cancelled: "Отменено",
  proposed: "Предложено",
  rejected: "Отклонено",
};
export function blankField(
  kind: FieldKind,
  date: string,
  brigade: string,
  nodeId: string | null,
): FieldPayload {
  const base = { title: "", brigade, nodeId };
  switch (kind) {
    case "contractor":
      return { kind, ...base, contact: "", phone: "", active: true, note: "" };
    case "machine":
      return { kind, ...base, plate: "", owner: "", active: true, note: "" };
    case "waybill":
      return {
        kind,
        ...base,
        date,
        shift: "День",
        machineId: "",
        orderId: null,
        source: "",
        hours: null,
        startAt: "",
        endAt: "",
        allocations: [],
        status: "draft",
        note: "",
      };
    case "request":
      return {
        kind,
        ...base,
        date,
        resource: "material",
        quantity: null,
        unit: "м³",
        source: "",
        status: "draft",
        note: "",
      };
    case "proposal":
      return {
        kind,
        ...base,
        date,
        shift: "День",
        contractorId: null,
        quantity: null,
        unit: "м³",
        equipment: "",
        source: "",
        status: "proposed",
        note: "",
      };
  }
}
