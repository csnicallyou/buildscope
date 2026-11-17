import type { ConstructionRecord, Payload } from "../src/construction";
import { ofKind } from "../src/construction";
import { WorkspaceError } from "./database";
import type { WorkspaceDatabase } from "./database";
import type { WorkspaceUser } from "../src/workspaceTypes";
export function validateField(
  store: WorkspaceDatabase,
  user: WorkspaceUser,
  p: Payload,
  id: string,
  records: ConstructionRecord[],
) {
  const previous = records.find((r) => r.id === id);
  if (p.kind === "document" && p.orderId) {
    const order = store.get(user, p.orderId).order;
    if (
      p.brigade !== order.draft.brigade ||
      p.nodeId !== (order.draft.nodeId ?? null)
    )
      throw new WorkspaceError(
        400,
        "Вложение должно относиться к бригаде и участку выбранного наряда.",
      );
  }
  if (
    p.kind === "machine" &&
    ofKind(records, "machine").some(
      (r) =>
        r.id !== id &&
        r.payload.plate.toLocaleLowerCase() === p.plate.toLocaleLowerCase(),
    )
  )
    throw new WorkspaceError(
      409,
      "Техника с таким номером уже зарегистрирована.",
    );
  if (
    p.kind === "contractor" &&
    ofKind(records, "contractor").some(
      (r) =>
        r.id !== id &&
        r.payload.title.toLocaleLowerCase() === p.title.toLocaleLowerCase(),
    )
  )
    throw new WorkspaceError(
      409,
      "Подрядчик с таким названием уже зарегистрирован.",
    );
  if (p.kind === "waybill") {
    const machine = ofKind(records, "machine").find(
      (r) => r.id === p.machineId,
    );
    if (
      !machine ||
      (machine.payload.brigade && machine.payload.brigade !== p.brigade)
    )
      throw new WorkspaceError(
        400,
        "Выберите технику, доступную этой бригаде.",
      );
    if (p.orderId) {
      const order = store.get(user, p.orderId).order;
      if (
        order.draft.brigade !== p.brigade ||
        order.draft.date !== p.date ||
        order.draft.shift !== p.shift
      )
        throw new WorkspaceError(
          400,
          "Путевой лист и наряд должны относиться к одной бригаде, дате и смене.",
        );
    }
    if (p.startAt && p.endAt && p.endAt <= p.startAt)
      throw new WorkspaceError(
        400,
        "Окончание должно быть позже начала с учётом календарной даты.",
      );
    if (
      p.allocations.some(
        (a) =>
          a.nodeId && !ofKind(records, "node").some((n) => n.id === a.nodeId),
      )
    )
      throw new WorkspaceError(
        400,
        "Один из участков путевого листа не существует.",
      );
    if (
      p.status === "checked" &&
      (!previous?.file ||
        p.hours === null ||
        !p.allocations.length ||
        p.allocations.some((a) => a.hours === null))
    )
      throw new WorkspaceError(
        400,
        "Для проверки приложите оригинал путевого листа, укажите часы и распределение по участкам. Итоги не обязаны совпадать автоматически.",
      );
    if (
      ofKind(records, "waybill").some(
        (r) =>
          r.id !== id &&
          r.payload.machineId === p.machineId &&
          r.payload.title === p.title &&
          r.payload.date === p.date &&
          r.payload.shift === p.shift,
      )
    )
      throw new WorkspaceError(
        409,
        "Путевой лист с этим номером на эту смену уже сохранён.",
      );
  }
  if (
    p.kind === "proposal" &&
    p.contractorId &&
    !ofKind(records, "contractor").some((r) => r.id === p.contractorId)
  )
    throw new WorkspaceError(400, "Выбранный подрядчик не существует.");
  if (p.kind === "request") {
    const from =
      previous?.payload.kind === "request" ? previous.payload.status : "new";
    const transitions: Record<string, string[]> = {
      new: ["draft"],
      draft: ["draft", "approved", "cancelled"],
      approved: ["approved", "ordered", "cancelled"],
      ordered: ["ordered", "received", "cancelled"],
      received: ["received"],
      cancelled: ["cancelled"],
    };
    if (!transitions[from]?.includes(p.status))
      throw new WorkspaceError(
        409,
        "Сначала согласуйте заявку, затем отметьте заказ/назначение и получение.",
      );
    if (p.status !== "draft" && p.status !== "cancelled" && p.quantity === null)
      throw new WorkspaceError(
        400,
        "Для согласования и исполнения укажите количество.",
      );
  }
  if (
    ((p.kind === "request" && p.status === "cancelled") ||
      (p.kind === "proposal" && p.status === "rejected")) &&
    p.note.length < 3
  )
    throw new WorkspaceError(400, "Укажите причину отмены или отклонения.");
}
