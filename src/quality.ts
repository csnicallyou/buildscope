import type { Element } from "./model";
export type QuantityStatus =
  "dimensioned" | "nominal" | "assumed" | "source" | "scheme" | "unknown";
export const quantityStatuses: Record<
  QuantityStatus,
  { label: string; detail: string }
> = {
  dimensioned: {
    label: "По размерам",
    detail: "Рассчитано по геометрии восстановленного тела.",
  },
  nominal: {
    label: "Номинальное",
    detail:
      "Номинальная форма; заводская деталировка и подрезки могут отличаться.",
  },
  assumed: {
    label: "С допущением",
    detail:
      "В расчёте есть принятое условие. Оно указано в свойствах и отчёте.",
  },
  source: {
    label: "Из ведомости",
    detail:
      "Значение переписано из исходной спецификации; не заменяет геометрический расчёт.",
  },
  scheme: {
    label: "По схеме",
    detail:
      "Количество относится к показанной схеме, а не к полной изготовительной модели.",
  },
  unknown: {
    label: "Нужно уточнить",
    detail:
      "Для полного количества не хватает данных; неизвестное не считается нулём.",
  },
};
export function elementQuantityStatus(e: Element): QuantityStatus {
  if (["diagram", "envelope"].includes(e.evidence?.representation ?? ""))
    return "unknown";
  if (["assumed", "unknown"].includes(e.confidence)) return "assumed";
  if (e.evidence?.representation === "nominal") return "nominal";
  return "dimensioned";
}
