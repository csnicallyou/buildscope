import {
  Building2,
  Box,
  CalendarDays,
  ClipboardList,
  Package,
  Files,
  Menu,
} from "lucide-react";
export default function WorkbenchNavigation({
  active,
  onHome,
  onModel,
  onShifts,
  onOrders,
  onResources,
  onDocuments,
  onMore,
}: {
  active: string;
  onHome: () => void;
  onModel: () => void;
  onShifts: () => void;
  onOrders: () => void;
  onResources: () => void;
  onDocuments: () => void;
  onMore: () => void;
}) {
  const links = [
    ["home", "Объекты", Building2, onHome],
    ["model", "Модель", Box, onModel],
    ["shifts", "Смены", CalendarDays, onShifts],
    ["orders", "Наряды", ClipboardList, onOrders],
    ["resources", "Ресурсы", Package, onResources],
    ["documents", "Документы", Files, onDocuments],
  ] as const;
  return (
    <nav className="workbench-primary" aria-label="Основная навигация">
      {links.map(([key, label, Icon, action]) => (
        <button
          key={key}
          className={active === key ? "active" : ""}
          aria-current={active === key ? "page" : undefined}
          onClick={action}
        >
          <Icon size={21} />
          <span>{label}</span>
        </button>
      ))}
      <button className="workbench-more" onClick={onMore}>
        <Menu size={21} />
        <span>Все разделы</span>
      </button>
    </nav>
  );
}
