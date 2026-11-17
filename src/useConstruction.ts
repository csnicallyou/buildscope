import { useEffect, useState, useCallback } from "react";
import { z } from "zod";
import { api } from "./workspaceClient";
import {
  recordSchema,
  type ConstructionRecord,
  type Payload,
} from "./construction";
export function useConstruction(enabled: boolean) {
  const [records, setRecords] = useState<ConstructionRecord[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      setRecords(
        z
          .object({ records: z.array(recordSchema) })
          .parse(await api("/api/construction")).records,
      );
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось загрузить данные стройки",
      );
    } finally {
      setLoading(false);
    }
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    void refresh();
    const interval = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 30000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", focus);
    };
  }, [enabled, refresh]);
  const save = async (payload: Payload, old: ConstructionRecord | null) => {
    if (!enabled) throw Error("Для сохранения нужен вход на общий сервер");
    const result = recordSchema.parse(
      (
        await api<{ record: unknown }>("/api/construction", "POST", {
          payload,
          id: old?.id ?? null,
          revision: old?.revision ?? null,
        })
      ).record,
    );
    await refresh();
    return result;
  };
  return { records, error, loading, refresh, save };
}
