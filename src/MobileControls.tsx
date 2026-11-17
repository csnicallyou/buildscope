import {
  Box,
  Calculator,
  ListTree,
  X,
  ChevronUp,
  ChevronDown,
  GripHorizontal,
  ClipboardList,
  Building2,
  CalendarDays,
} from "lucide-react";
import { useRef } from "react";
import { useStore } from "./store";

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
  onHome,
  onShifts,
  onMore,
  homeActive,
  shiftsActive,
}: {
  onModel: () => void;
  onWorkOrder: () => void;
  modelActive: boolean;
  workOrderActive: boolean;
  managementActive?: boolean;
  onManagement?: (view: "overview" | "objects" | "planning") => void;
  onHome?: () => void;
  onShifts?: () => void;
  onMore?: () => void;
  homeActive?: boolean;
  shiftsActive?: boolean;
}) {
  const s = useStore();
  return (
    <>
      <nav
        className="mobile-dock personal-dock"
        aria-label="Управление стройкой"
      >
        <button aria-pressed={homeActive} onClick={onHome}>
          <Building2 size={20} />
          Объекты
        </button>
        <button
          aria-pressed={modelActive}
          onClick={() =>
            modelActive ? s.set({ mobilePanel: "none" }) : onModel()
          }
        >
          <Box size={20} />
          Модель
        </button>
        <button aria-pressed={shiftsActive} onClick={onShifts}>
          <CalendarDays size={20} />
          Смены
        </button>
        <button
          aria-label="Открыть наряды"
          aria-pressed={workOrderActive}
          onClick={onWorkOrder}
        >
          <ClipboardList size={20} />
          Наряды
        </button>
        <button aria-label="Все разделы" onClick={onMore}>
          <ListTree size={20} />
          Ещё
        </button>
      </nav>
      {modelActive && (
        <nav className="model-panel-tabs" aria-label="Панели просмотра">
          <button
            aria-pressed={s.mobilePanel === "none"}
            onClick={() =>
              s.set({ mobilePanel: "none", mobileExpanded: false })
            }
          >
            Модель
          </button>
          <button
            aria-pressed={s.mobilePanel === "tree"}
            onClick={() =>
              s.set({ mobilePanel: "tree", mobileExpanded: false })
            }
          >
            <ListTree size={16} />
            Конструкции
          </button>
          <button
            aria-pressed={s.mobilePanel === "inspector" && !s.calculatorOpen}
            onClick={() =>
              s.set({
                mobilePanel: "inspector",
                calculatorOpen: false,
                mobileExpanded: false,
              })
            }
          >
            <Box size={16} />
            Свойства
          </button>
          <button
            aria-pressed={s.mobilePanel === "inspector" && s.calculatorOpen}
            onClick={() =>
              s.set({
                mobilePanel: "inspector",
                calculatorOpen: true,
                mobileExpanded: false,
              })
            }
          >
            <Calculator size={16} />
            Расчёт {s.calculatedObjects.length || ""}
          </button>
        </nav>
      )}
    </>
  );
}
