import { z } from "zod";
import type { SharedOrder } from "./workspaceTypes";
const text = z.string().trim().max(4000);
const title = text.min(1).max(180);
const id = z.string().max(180);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === v;
  }, "Укажите существующую дату");
const ref = {
  nodeId: id.nullable(),
  model: z.string().max(180),
  elementIds: z.array(id).max(500),
};
export const payloadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("node"),
    title,
    level: z.enum(["site", "object", "zone", "structure", "part"]),
    parentId: id.nullable(),
    model: z.string().max(180),
    elementIds: z.array(id).max(500),
    description: text,
  }),
  z.object({
    kind: z.literal("crew"),
    title,
    leader: text,
    members: z.array(z.object({ name: title, role: text })).max(200),
    active: z.boolean(),
    description: text,
  }),
  z.object({
    kind: z.literal("task"),
    title,
    ...ref,
    start: date,
    end: date,
    shift: z.enum(["День", "Ночь"]),
    brigade: title,
    owner: text,
    status: z.enum(["planned", "active", "done", "blocked"]),
    dependsOn: z.array(id).max(100),
    reason: text,
  }),
  z.object({
    kind: z.literal("movement"),
    title,
    ...ref,
    brigade: title,
    date,
    direction: z.enum(["opening", "receipt", "consume"]),
    quantity: z.number().finite().positive(),
    unit: z.enum(["м³", "м²", "м", "т", "кг", "шт.", "л"]),
    basis: title,
    voided: z.boolean(),
    reason: text,
  }),
  z.object({
    kind: z.literal("issue"),
    title,
    ...ref,
    brigade: title,
    owner: title,
    due: date,
    severity: z.enum(["normal", "critical"]),
    status: z.enum(["open", "corrected", "closed"]),
    description: text,
    evidence: text,
  }),
  z.object({
    kind: z.literal("document"),
    title,
    ...ref,
    brigade: text,
    number: title,
    edition: title,
    category: z.enum(["drawing", "executive", "certificate", "photo", "other"]),
    date,
    supersedes: id.nullable(),
    description: text,
  }),
]);
export type Payload = z.infer<typeof payloadSchema>;
export type Kind = Payload["kind"];
export const recordSchema = z.object({
  id,
  revision: z.number().int().positive(),
  payload: payloadSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  author: z.string(),
  file: z
    .object({ id, name: z.string(), size: z.number(), hash: z.string() })
    .nullable(),
});
export type ConstructionRecord = z.infer<typeof recordSchema>;
export type OfKind<K extends Kind> = ConstructionRecord & {
  payload: Extract<Payload, { kind: K }>;
};
export const ofKind = <K extends Kind>(
  records: ConstructionRecord[],
  kind: K,
) => records.filter((r): r is OfKind<K> => r.payload.kind === kind);
export const levelLabels = {
  site: "Стройка",
  object: "Объект",
  zone: "Участок / оси",
  structure: "Конструкция",
  part: "Часть",
};
export const taskLabels = {
  planned: "Запланировано",
  active: "В работе",
  done: "Выполнено",
  blocked: "Заблокировано",
};
export function nodePath(records: ConstructionRecord[], nodeId: string | null) {
  const names: string[] = [],
    seen = new Set<string>();
  let current = records.find((r) => r.id === nodeId);
  while (current?.payload.kind === "node" && !seen.has(current.id)) {
    names.unshift(current.payload.title);
    seen.add(current.id);
    current = records.find(
      (r) =>
        r.id ===
        (current!.payload as Extract<Payload, { kind: "node" }>).parentId,
    );
  }
  return names.join(" / ") || "Без участка";
}
export function inNode(
  records: ConstructionRecord[],
  nodeId: string | null,
  scope: string,
) {
  if (!scope) return true;
  let current = nodeId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    if (current === scope) return true;
    seen.add(current);
    const r = records.find((r) => r.id === current);
    current = r?.payload.kind === "node" ? r.payload.parentId : null;
  }
  return false;
}
export function inventory(records: ConstructionRecord[]) {
  const sums = new Map<
    string,
    {
      title: string;
      unit: string;
      nodeId: string | null;
      incoming: number;
      consumed: number;
      balance: number;
    }
  >();
  for (const { payload: p } of ofKind(records, "movement")) {
    if (p.voided) continue;
    const key = JSON.stringify([
      p.nodeId,
      p.title.toLocaleLowerCase("ru"),
      p.unit,
    ]);
    const row = sums.get(key) ?? {
      title: p.title,
      unit: p.unit,
      nodeId: p.nodeId,
      incoming: 0,
      consumed: 0,
      balance: 0,
    };
    if (p.direction === "consume") row.consumed += p.quantity;
    else row.incoming += p.quantity;
    row.balance = row.incoming - row.consumed;
    sums.set(key, row);
  }
  return [...sums.values()];
}
export function blockers(task: OfKind<"task">, records: ConstructionRecord[]) {
  const dependencies = task.payload.dependsOn.filter((id) => {
    const r = records.find((r) => r.id === id);
    return r?.payload.kind !== "task" || r.payload.status !== "done";
  });
  const critical = ofKind(records, "issue")
    .filter(
      (i) =>
        i.payload.status !== "closed" &&
        i.payload.severity === "critical" &&
        ((i.payload.nodeId &&
          inNode(records, task.payload.nodeId, i.payload.nodeId)) ||
          (!i.payload.nodeId &&
            i.payload.model &&
            i.payload.model === task.payload.model &&
            i.payload.elementIds.some((id) =>
              task.payload.elementIds.includes(id),
            ))),
    )
    .map((i) => i.id);
  return [...dependencies, ...critical];
}
export function constructionSummary(
  records: ConstructionRecord[],
  orders: SharedOrder[],
  today: string,
  allRecords: ConstructionRecord[] = records,
) {
  const tasks = ofKind(records, "task"),
    issues = ofKind(records, "issue");
  return {
    active: tasks.filter((t) => t.payload.status === "active"),
    overdue: tasks.filter(
      (t) => t.payload.end < today && t.payload.status !== "done",
    ),
    blocked: tasks.filter(
      (t) => t.payload.status === "blocked" || blockers(t, allRecords).length,
    ),
    issues: issues.filter((i) => i.payload.status !== "closed"),
    review: orders.filter((o) => o.stage === "submitted"),
    shifts: orders.filter((o) => o.order.draft.date === today),
    crews: ofKind(records, "crew").filter((c) => c.payload.active),
  };
}
export function blankPayload(
  kind: Kind,
  today: string,
  nodeId: string | null,
  brigade: string,
  model = "",
  elementIds: string[] = [],
): Payload {
  const common = { title: "", nodeId, model, elementIds };
  switch (kind) {
    case "node":
      return {
        kind,
        title: "",
        level: nodeId ? "zone" : "site",
        parentId: nodeId,
        model,
        elementIds,
        description: "",
      };
    case "crew":
      return {
        kind,
        title: brigade,
        leader: "",
        members: [],
        active: true,
        description: "",
      };
    case "task":
      return {
        kind,
        ...common,
        start: today,
        end: today,
        shift: "День",
        brigade,
        owner: "",
        status: "planned",
        dependsOn: [],
        reason: "",
      };
    case "movement":
      return {
        kind,
        ...common,
        brigade,
        date: today,
        direction: "receipt",
        quantity: 0,
        unit: "м³",
        basis: "",
        voided: false,
        reason: "",
      };
    case "issue":
      return {
        kind,
        ...common,
        brigade,
        owner: "",
        due: today,
        severity: "normal",
        status: "open",
        description: "",
        evidence: "",
      };
    case "document":
      return {
        kind,
        ...common,
        brigade,
        number: "",
        edition: "1",
        category: "drawing",
        date: today,
        supersedes: null,
        description: "",
      };
  }
}
