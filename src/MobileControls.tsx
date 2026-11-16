import {
  Box,
  Calculator,
  ListTree,
  X,
  ChevronUp,
  ChevronDown,
  GripHorizontal,
  ClipboardList,
} from "lucide-react";
import { useRef } from "react";
import { useStore } from "./store";
import { hasObjects } from "./objects";

export function MobilePanelHandle() {
  const s = useStore();
  const start = useRef(0);
  return (
    <div className="mobile-sheet-tools">
      <button
        className="sheet-grip"
        aria-label="Изменить высоту панели"
        onPointerDown={(e) => {
          start.current = e.clientY;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerUp={(e) => {
          const dy = e.clientY - start.current;
          if (dy < -35) s.set({ mobileExpanded: true });
          else if (dy > 35) s.set({ mobileExpanded: false });
        }}
      >
        <GripHorizontal size={26} />
      </button>
      <button
        aria-label={s.mobileExpanded ? "Уменьшить панель" : "Развернуть панель"}
        onClick={() => s.set({ mobileExpanded: !s.mobileExpanded })}
      >
        {s.mobileExpanded ? <ChevronDown size={19} /> : <ChevronUp size={19} />}
      </button>
      <button
        aria-label="Свернуть панель"
        onClick={() => s.set({ mobilePanel: "none" })}
      >
        <X size={20} />
      </button>
    </div>
  );
}
export default function MobileControls({
  onModel,
  onWorkOrder,
  modelActive,
  workOrderActive,
}: {
  onModel: () => void;
  onWorkOrder: () => void;
  modelActive: boolean;
  workOrderActive: boolean;
}) {
  const s = useStore();
  return (
    <nav className="mobile-dock" aria-label="Панели просмотра">
      <button
        aria-pressed={modelActive && s.mobilePanel === "none"}
        onClick={() => {
          s.set({ mobilePanel: "none" });
          onModel();
        }}
      >
        <Box size={19} />
        Модель
      </button>
      <button
        aria-label="Открыть наряды"
        aria-pressed={workOrderActive}
        onClick={onWorkOrder}
      >
        <ClipboardList size={19} /> Наряды
      </button>
      <button
        aria-pressed={s.mobilePanel === "tree"}
        onClick={() =>
          s.set({ mobilePanel: s.mobilePanel === "tree" ? "none" : "tree" })
        }
      >
        <ListTree size={19} />
        Конструкции
      </button>
      <button
        aria-pressed={s.mobilePanel === "inspector" && !s.calculatorOpen}
        onClick={() => {
          s.set({
            mobilePanel: "inspector",
            calculatorOpen: false,
            mobileExpanded: false,
          });
          onModel();
        }}
      >
        <Box size={19} />
        Свойства
      </button>
      <button
        disabled={!!s.openedObject || !hasObjects(s.project)}
        aria-pressed={s.mobilePanel === "inspector" && s.calculatorOpen}
        onClick={() => {
          s.set({
            mobilePanel: "inspector",
            calculatorOpen: true,
            mobileExpanded: false,
          });
          onModel();
        }}
      >
        <Calculator size={19} />
        Расчёт
        {s.calculatedObjects.length > 0 && (
          <span>{s.calculatedObjects.length}</span>
        )}
      </button>
    </nav>
  );
}
