import {
  manualWorkRow,
  type additionalSchema,
  type reviewSchema,
} from "./orderReview";
import type { z } from "zod";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  parseWorkOrders,
  serializeWorkOrders,
  workOrdersStorageKey,
  type SavedWorkOrder,
} from "./workOrderArchive";
import type { WorkDraft } from "./workOrders";
import {
  api,
  parseOrders,
  parseSession,
  clientOrder,
  parseDraft,
  ApiError,
} from "./workspaceClient";
import {
  sharedOrderSchema,
  type SharedOrder,
  type WorkspaceUser,
} from "./workspaceTypes";
export function useWorkspace(
  draft: WorkDraft,
  setDraft: Dispatch<SetStateAction<WorkDraft>>,
) {
  const [mode, setMode] = useState<"loading" | "local" | "server" | "error">(
    "loading",
  );
  const [user, setUser] = useState<WorkspaceUser | null>(null);
  const [shared, setShared] = useState<SharedOrder[]>([]);
  const [orders, setOrders] = useState<SavedWorkOrder[]>([]);
  const [error, setError] = useState("");
  const [draftStatus, setDraftStatus] = useState("");
  const [recovery, setRecovery] = useState<WorkDraft | null>(null);
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const draftRevision = useRef(0),
    lastSavedDraft = useRef(""),
    draftLoaded = useRef(false),
    draftPaused = useRef(false),
    saveQueue = useRef(Promise.resolve());
  const setRemote = useCallback((values: SharedOrder[]) => {
    setShared(values);
    setOrders(values.map(clientOrder));
  }, []);
  const refresh = useCallback(async () => {
    try {
      setRemote(parseOrders(await api("/api/orders")));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось обновить наряды");
    }
  }, [setRemote]);
  const reloadDraft = useCallback(async () => {
    try {
      const result = parseDraft(await api("/api/draft"));
      draftRevision.current = result.revision;
      if (result.draft) lastSavedDraft.current = JSON.stringify(result.draft);
      if (result.draft) setDraft(result.draft);
      draftLoaded.current = true;
      draftPaused.current = false;
      setDraftStatus("Черновик загружен с сервера");
    } catch (e) {
      setDraftStatus(e instanceof Error ? e.message : "Черновик не загружен");
    }
  }, [setDraft]);
  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const res = await fetch("/api/health", {
          signal: AbortSignal.timeout(8000),
        });
        const health = (await res.json().catch(() => null)) as {
          service?: string;
        } | null;
        if (health?.service !== "buildscope-workspace") {
          if (import.meta.env.VITE_WORKSPACE_API === "required")
            throw Error(
              "Общая база недоступна. Локальная копия не заменяет серверные данные.",
            );
          if (!disposed) {
            setMode("local");
            setOrders(
              parseWorkOrders(localStorage.getItem(workOrdersStorageKey)),
            );
          }
          return;
        }
        const signed = parseSession(await api("/api/session"));
        if (!signed) {
          window.location.assign("/login");
          return;
        }
        if (disposed) return;
        setUser(signed);
        setMode("server");
        await refresh();
        if (signed.role === "admin") {
          const remote = parseDraft(await api("/api/draft"));
          if (disposed) return;
          draftRevision.current = remote.revision;
          if (remote.draft)
            lastSavedDraft.current = JSON.stringify(remote.draft);
          draftLoaded.current = true;
          const cache = localStorage.getItem(
            `buildscope.draft-recovery:${signed.id}`,
          );
          if (cache)
            try {
              const saved = JSON.parse(cache) as WorkDraft;
              if (
                JSON.stringify(saved) !== JSON.stringify(remote.draft) &&
                saved.rows?.length
              )
                setRecovery(saved);
            } catch {
              /* Invalid local recovery is not uploaded. */
            }
          if (remote.draft) setDraft(remote.draft);
          setDraftStatus("Черновик на сервере");
        }
      } catch (e) {
        if (!disposed) {
          setMode("error");
          setError(
            e instanceof Error
              ? e.message
              : "Не удалось подключиться к серверу",
          );
        }
      }
    })();
    return () => {
      disposed = true;
    };
  }, [refresh, setDraft]);
  useEffect(() => {
    if (mode !== "server") return;
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 30000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [mode, refresh]);
  useEffect(() => {
    if (
      mode !== "server" ||
      user?.role !== "admin" ||
      !draftLoaded.current ||
      draftPaused.current ||
      JSON.stringify(draft) === lastSavedDraft.current
    )
      return;
    try {
      localStorage.setItem(
        `buildscope.draft-recovery:${user.id}`,
        JSON.stringify(draft),
      );
    } catch {
      /* Server persistence remains available if browser cache is full. */
    }
    setDraftStatus("Сохранение черновика…");
    const timer = setTimeout(() => {
      saveQueue.current = saveQueue.current.then(async () => {
        if (draftPaused.current) return;
        try {
          const result = parseDraft(
            await api("/api/draft", "PUT", {
              draft,
              revision: draftRevision.current,
            }),
          );
          draftRevision.current = result.revision;
          lastSavedDraft.current = JSON.stringify(draft);
          if (JSON.stringify(latestDraft.current) === JSON.stringify(draft))
            setDraftStatus("Черновик сохранён на сервере");
        } catch (e) {
          draftPaused.current = true;
          setDraftStatus(
            e instanceof Error ? e.message : "Не удалось сохранить черновик",
          );
        }
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [mode, user, draft]);
  useEffect(() => {
    if (mode !== "local") return;
    const listener = (event: StorageEvent) => {
      if (event.key === workOrdersStorageKey)
        try {
          setOrders(parseWorkOrders(event.newValue));
        } catch {
          setError(
            "Не удалось прочитать обновлённый архив. Прежние данные сохранены.",
          );
        }
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, [mode]);
  const save = async (
    order: SavedWorkOrder,
  ): Promise<SavedWorkOrder | null> => {
    try {
      if (mode === "server") {
        const result = await api<{ saved: unknown }>("/api/orders", "POST", {
          order,
          revision: order.serverRevision ?? null,
        });
        const saved = sharedOrderSchema.parse(result.saved);
        setShared((prev) => [
          saved,
          ...prev.filter((o) => o.order.id !== saved.order.id),
        ]);
        const next = clientOrder(saved);
        setOrders((prev) => [next, ...prev.filter((o) => o.id !== next.id)]);
        setError("");
        return next;
      }
      if (mode !== "local") throw Error("Дождитесь подключения к базе данных");
      const current = parseWorkOrders(
        localStorage.getItem(workOrdersStorageKey),
      );
      if (
        current.some(
          (o) =>
            o.id === order.id &&
            o.submittedAt &&
            o.submittedAt !== order.submittedAt,
        )
      )
        throw Error(
          "Наряд уже сдан в другом окне. Откройте актуальную запись.",
        );
      const previous = current.find((o) => o.id === order.id);
      order = {
        ...order,
        draft: {
          ...order.draft,
          rows: order.draft.rows.map((row) => {
            const old = previous?.draft.rows.find((r) => r.id === row.id);
            return old && old.actual !== row.actual
              ? {
                  ...row,
                  verifiedActual: null,
                  verificationBasis: "",
                  verifiedAt: "",
                  verifiedBy: "",
                }
              : row;
          }),
        },
      };
      const next = [order, ...current.filter((o) => o.id !== order.id)];
      localStorage.setItem(workOrdersStorageKey, serializeWorkOrders(next));
      setOrders(next);
      setError("");
      return order;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Не удалось сохранить наряд. Прежние данные не удалены.",
      );
      if (e instanceof ApiError && e.status === 409) {
        try {
          setRemote(parseOrders(await api("/api/orders")));
        } catch {
          /* Keep the original conflict visible. */
        }
      }
      return null;
    }
  };
  const action = async (
    id: string,
    action: "accept" | "reopen" | "replan",
    reason = "",
    order?: SavedWorkOrder,
  ) => {
    const current = shared.find((o) => o.order.id === id);
    if (!current) return null;
    try {
      const result = await api<{ saved: unknown }>(
        `/api/orders/${encodeURIComponent(id)}/action`,
        "POST",
        {
          action,
          reason,
          order,
          revision: order?.serverRevision ?? current.revision,
        },
      );
      const saved = sharedOrderSchema.parse(result.saved);
      await refresh();
      return clientOrder(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось изменить наряд");
      return null;
    }
  };
  const saveSignatures = async (
    order: SavedWorkOrder,
  ): Promise<SavedWorkOrder | null> => {
    try {
      if (mode !== "server" || !order.serverRevision)
        throw Error("Для проверки подписей подключитесь к общей базе");
      const result = await api<{ saved: unknown }>(
        `/api/orders/${encodeURIComponent(order.id)}/signatures`,
        "PUT",
        {
          revision: order.serverRevision,
          checks: order.draft.crew.map((p) => ({
            id: p.id,
            startSignatureNoteId: p.startSignatureNoteId ?? null,
            endSignatureNoteId: p.endSignatureNoteId ?? null,
            startSignatureStatus: p.startSignatureStatus,
            endSignatureStatus: p.endSignatureStatus,
          })),
        },
      );
      const saved = sharedOrderSchema.parse(result.saved);
      await refresh();
      return clientOrder(saved);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Не удалось сохранить проверку подписей",
      );
      return null;
    }
  };
  const review = async (
    order: SavedWorkOrder,
    rows: z.infer<typeof reviewSchema>["rows"],
  ) => {
    try {
      if (mode === "local")
        return await save({
          ...order,
          draft: {
            ...order.draft,
            rows: order.draft.rows.map((r) => {
              const c = rows.find((x) => x.id === r.id)!;
              return {
                ...r,
                verifiedActual: c.value,
                verificationBasis: c.basis,
                verifiedAt: new Date().toISOString(),
                verifiedBy: "Координатор (локально)",
              };
            }),
          },
        });
      const result = await api<{ saved: unknown }>(
        `/api/orders/${encodeURIComponent(order.id)}/review`,
        "PUT",
        { revision: order.serverRevision, rows },
      );
      const saved = sharedOrderSchema.parse(result.saved);
      await refresh();
      return clientOrder(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Проверка не сохранена");
      return null;
    }
  };
  const additional = async (
    order: SavedWorkOrder,
    fields: Omit<z.infer<typeof additionalSchema>, "revision">,
  ) => {
    try {
      if (mode === "local") {
        const row = manualWorkRow(
          order.draft,
          fields.work,
          fields.unit,
          fields.target,
        );
        row.additional = {
          basis: fields.basis,
          addedAt: new Date().toISOString(),
          addedBy: "Координатор (локально)",
        };
        return await save({
          ...order,
          draft: { ...order.draft, rows: [...order.draft.rows, row] },
        });
      }
      const result = await api<{ saved: unknown }>(
        `/api/orders/${encodeURIComponent(order.id)}/additional`,
        "POST",
        { revision: order.serverRevision, ...fields },
      );
      const saved = sharedOrderSchema.parse(result.saved);
      await refresh();
      return clientOrder(saved);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Дополнительная работа не сохранена",
      );
      return null;
    }
  };
  const importLocal = async () => {
    try {
      const values = parseWorkOrders(
        localStorage.getItem(workOrdersStorageKey),
      );
      await api("/api/import", "POST", { orders: values });
      await refresh();
      setError("");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось перенести архив");
      return false;
    }
  };
  const allShared = useMemo(
    () =>
      mode === "server"
        ? shared
        : orders.map(
            (order) =>
              ({
                order,
                revision: 1,
                stage: order.submittedAt ? "submitted" : "issued",
                updatedAt: order.createdAt,
                updatedBy: "Локальный архив",
              }) as SharedOrder,
          ),
    [mode, shared, orders],
  );
  return {
    mode,
    user,
    orders,
    error,
    shared: allShared,
    save,
    saveSignatures,
    review,
    additional,
    action,
    refresh,
    importLocal,
    draftStatus,
    reloadDraft,
    recovery,
    restoreRecovery: () => {
      if (recovery) {
        setDraft(recovery);
        setRecovery(null);
        draftPaused.current = false;
      }
    },
  };
}
