import { z } from "zod";
import { savedSchema } from "./workOrderArchive";
export const roleSchema = z.enum(["admin", "foreman", "viewer"]);
export type Role = z.infer<typeof roleSchema>;
export const userSchema = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string(),
  role: roleSchema,
  brigade: z.string().nullable(),
  active: z.boolean(),
});
export type WorkspaceUser = z.infer<typeof userSchema>;
export const stageSchema = z.enum(["issued", "submitted", "accepted"]);
export const sharedOrderSchema = z.object({
  order: savedSchema,
  revision: z.number().int().positive(),
  stage: stageSchema,
  updatedAt: z.string(),
  updatedBy: z.string(),
});
export type SharedOrder = z.infer<typeof sharedOrderSchema>;
export const noteSchema = z.object({
  id: z.string(),
  model: z.string(),
  elementId: z.string(),
  orderId: z.string().nullable(),
  text: z.string(),
  author: z.string(),
  brigade: z.string(),
  createdAt: z.string(),
  imageId: z.string().nullable(),
});
export type ObjectNote = z.infer<typeof noteSchema>;
export const eventSchema = z.object({
  id: z.number(),
  orderId: z.string(),
  revision: z.number(),
  action: z.string(),
  reason: z.string(),
  actor: z.string(),
  createdAt: z.string(),
  snapshot: savedSchema.nullable(),
});
export type WorkEvent = z.infer<typeof eventSchema>;
export type WorkStatus = "assigned" | "in-progress" | "submitted" | "accepted";
export const statusLabels: Record<WorkStatus, string> = {
  assigned: "Назначено",
  "in-progress": "Выполняется",
  submitted: "Сдано",
  accepted: "Принято",
};
export const statusColors: Record<WorkStatus, string> = {
  assigned: "#79a8d3",
  "in-progress": "#d9ad58",
  submitted: "#72bba4",
  accepted: "#a5b6d7",
};
