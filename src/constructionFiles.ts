import { api } from "./workspaceClient";
import { recordSchema, type ConstructionRecord } from "./construction";
export async function uploadConstructionFile(
  record: ConstructionRecord,
  file: File,
) {
  if (file.size > 25 * 1024 * 1024)
    throw Error(
      "Файл больше 25 МБ. Сократите видео или загрузите отдельный фрагмент.",
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const result = await api<{ record: unknown }>(
    `/api/construction/${record.id}/file`,
    "POST",
    { revision: record.revision, name: file.name, base64: btoa(binary) },
  );
  return recordSchema.parse(result.record);
}
