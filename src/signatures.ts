export type SignaturePhase = "start" | "end";
export type SignatureStatus = "unchecked" | "present" | "missing" | "illegible";
export const signatureStatusFields = {
  start: "startSignatureStatus",
  end: "endSignatureStatus",
} as const;
export const signatureStatusLabels: Record<SignatureStatus, string> = {
  unchecked: "Не проверено",
  present: "Есть",
  missing: "Отсутствует",
  illegible: "Неразборчива",
};
export function signatureStatus(
  person: {
    startSignatureStatus?: SignatureStatus;
    endSignatureStatus?: SignatureStatus;
    startSignatureNoteId?: string | null;
    endSignatureNoteId?: string | null;
  },
  phase: SignaturePhase,
): SignatureStatus {
  const state = person[signatureStatusFields[phase]];
  return state && state !== "unchecked"
    ? state
    : person[signatureFields[phase]]
      ? "present"
      : "unchecked";
}
export const signatureModels = {
  start: "shift-signatures-start",
  end: "shift-signatures-end",
} as const;
export const signatureFields = {
  start: "startSignatureNoteId",
  end: "endSignatureNoteId",
} as const;
export const signatureLabels = {
  start: "Выход на смену",
  end: "Окончание смены",
} as const;
export function signatureSummary(
  people: Parameters<typeof signatureStatus>[0][],
) {
  if (!people.length) return "Нет поимённого списка";
  const values = people.flatMap((p) =>
    (["start", "end"] as const).map((phase) => signatureStatus(p, phase)),
  );
  const labels = (["unchecked", "missing", "illegible"] as const)
    .map((s) => ({ state: s, count: values.filter((v) => v === s).length }))
    .filter((x) => x.count > 0)
    .map((x) => `${signatureStatusLabels[x.state]}: ${x.count}`);
  return labels.length ? labels.join("; ") : "Все подписи есть";
}
