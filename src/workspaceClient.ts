import { z } from "zod";
import {
  sharedOrderSchema,
  userSchema,
  type SharedOrder,
} from "./workspaceTypes";
import { savedSchema, type SavedWorkOrder } from "./workOrderArchive";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T = unknown>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value: unknown = await res.json().catch(() => null);
  if (!res.ok)
    throw new ApiError(
      res.status,
      z.object({ error: z.string() }).safeParse(value).data?.error ??
        "Сервер недоступен. Изменения не подтверждены.",
    );
  return value as T;
}
export const parseSession = (value: unknown) =>
  z.object({ user: userSchema.nullable() }).parse(value).user;
export const parseOrders = (value: unknown) =>
  z.object({ orders: z.array(sharedOrderSchema) }).parse(value).orders;
export const clientOrder = (value: SharedOrder): SavedWorkOrder => ({
  ...value.order,
  serverRevision: value.revision,
});
export const parseDraft = (value: unknown) =>
  z
    .object({
      draft: savedSchema.shape.draft.nullable(),
      revision: z.number().int(),
      updatedAt: z.string().nullable(),
    })
    .parse(value);
