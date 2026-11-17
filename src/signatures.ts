export type SignaturePhase = "start" | "end";
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
