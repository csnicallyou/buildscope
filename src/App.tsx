import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Play,
  ChevronDown,
  Eye,
  EyeOff,
  Focus,
  Layers3,
  Ruler,
  Scissors,
  RotateCcw,
  Sun,
  Moon,
  Download,
  FolderOpen,
  Save,
  Search,
  Maximize,
  Move3D,
  FileBox,
  Calculator,
  X,
} from "lucide-react";
import Viewer from "./Viewer";
import WorkOrderPanel from "./WorkOrderPanel";
import { initialWorkDraft } from "./workOrders";
import InstallationPlayer from "./InstallationPlayer";
import { installationPlan } from "./installation";
import SelectionCalculator from "./SelectionCalculator";
import MobileControls, { MobilePanelHandle } from "./MobileControls";
import QuantityBadges from "./QuantityBadges";
import { elementQuantityStatus } from "./quality";
import { useStore, displayPosition } from "./store";
import QuickFilters from "./QuickFilters";
import DrawingComparison from "./DrawingComparison";
import InspectionPanel from "./InspectionPanel";
import { type InspectionResult, type Finding } from "./inspection";
import { sceneOptions, matchesFilters, isConcrete } from "./viewRules";
import {
  demo,
  parseProject,
  elementQuantities,
  totals,
  toCSV,
  toSourceCSV,
  type Vec3,
} from "./model";
import { download, exportGLB } from "./export";
import { dxfImporter, type Drawing } from "./importers";
import { createKzh, type Assembly } from "./kzh";
import { ReinforcementPanel, SourcePanel } from "./DocumentPanels";
import { createKzhDetails } from "./details";
import {
  hasObjects,
  modelObjects,
  objectFor,
  sceneItems,
  itemBounds,
  itemLayer,
  visibleItems,
} from "./objects";
import { calculateSelection } from "./calculator";
import { Materials, ObjectInspector, SteelInspector } from "./ObjectInspector";
const fmt = (n: number) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
const confidence = {
  assumed: "Предполагаемые",
  drawing: "Из чертежа",
  computed: "Вычисленные",
  manual: "Введены вручную",
  unknown: "Неизвестные",
};
function DrawingView({ drawing: d }: { drawing: Drawing }) {
  const bounds = d.segments
    .flat()
    .reduce(
      (a, p) => [
        Math.min(a[0], p[0]),
        Math.min(a[1], p[1]),
        Math.max(a[2], p[0]),
        Math.max(a[3], p[1]),
      ],
      [Infinity, Infinity, -Infinity, -Infinity],
    );
  const [minX, minY] = bounds,
    w = bounds[2] - minX || 1,
    h = bounds[3] - minY || 1;
  const pad = Math.max(w, h) * 0.05;
  return (
    <div className="drawing">
      <svg
        viewBox={`${minX - pad} ${-minY - h - pad} ${w + pad * 2} ${h + pad * 2}`}
        aria-label="Чертёж DXF"
      >
        <g
          transform="scale(1,-1)"
          stroke="currentColor"
          strokeWidth={Math.max(w, h) / 900}
          fill="none"
        >
          {d.segments.map((s, i) => (
            <line key={i} x1={s[0][0]} y1={s[0][1]} x2={s[1][0]} y2={s[1][1]} />
          ))}
        </g>
      </svg>
      <aside>
        {d.name} · {d.segments.length} отрезков · INSUNITS: {d.units}
        <br />
        {d.warnings.join(" ")}
      </aside>
    </div>
  );
}
export default function App() {
  const s = useStore();
  const [search, setSearch] = useState("");
  const [workDraft, setWorkDraft] = useState(initialWorkDraft);
  const [mobileTools, setMobileTools] = useState(false);
  const [tab, setTab] = useState<
    | "model"
    | "schedule"
    | "drawing"
    | "reinforcement"
    | "source"
    | "audit"
    | "workorder"
  >("model");
  useEffect(() => {
    if (tab !== "model") useStore.getState().set({ mobilePanel: "none" });
  }, [tab]);
  useEffect(() => {
    if (tab === "workorder" && s.mobilePanel !== "none") setTab("model");
  }, [tab, s.mobilePanel]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [inspection, setInspection] = useState<InspectionResult | null>(null);
  useEffect(() => {
    setInspection(null);
    setCompareOpen(false);
  }, [s.project]);
  const [variant, setVariant] = useState<"plan" | "sections">("plan");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null),
    [pdfPage, setPdfPage] = useState(1);
  const pdf = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    },
    [pdfUrl],
  );
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [message, setMessage] = useState(
    "Модель готова. Проверьте источники и замечания комплекта.",
  );
  const [length, setLength] = useState(36);
  const file = useRef<HTMLInputElement>(null),
    dxf = useRef<HTMLInputElement>(null);
  const objects = useMemo(() => modelObjects(s.project), [s.project]);
  const opened = objects.find((o) => o.id === s.openedObject);
  const items = useMemo(
    () => sceneItems(s.project, s.openedObject),
    [s.project, s.openedObject],
  );
  const selectedItem = items.find((item) => item.id === s.selected);
  const plan = useMemo(
    () => (opened && selectedItem ? installationPlan(selectedItem) : null),
    [opened, selectedItem],
  );
  const [work, setWork] = useState<{
    itemId: string;
    objectId: string;
    project: typeof s.project;
    previousPanel: typeof s.mobilePanel;
  } | null>(null);
  const workActive = !!(
    work &&
    plan &&
    selectedItem &&
    work.itemId === selectedItem.id &&
    work.objectId === opened?.id &&
    work.project === s.project &&
    s.mobilePanel === "none" &&
    tab === "model"
  );
  useEffect(() => {
    if (work && !workActive) setWork(null);
  }, [work, workActive]);
  const startWork = () => {
    if (!opened || !selectedItem || !plan) return;
    setWork({
      itemId: selectedItem.id,
      objectId: opened.id,
      project: s.project,
      previousPanel: s.mobilePanel,
    });
    s.set({ mobilePanel: "none" });
    setTab("model");
  };
  const closeWork = useCallback(() => {
    setWork(null);
    if (
      work?.project === useStore.getState().project &&
      work?.objectId === opened?.id
    )
      useStore.getState().set({ mobilePanel: work.previousPanel });
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLButtonElement>('[data-testid="start-installation"]')
        ?.focus(),
    );
  }, [work, opened]);
  const selected = selectedItem?.element;
  const selectedObject =
    !opened && hasObjects(s.project) && selected
      ? objectFor(s.project, selected.id)
      : null;
  const baseTreeItems = opened
    ? items
    : hasObjects(s.project)
      ? objects.map((o) => ({
          id: o.id,
          element: o.root,
          label: o.root.name,
          kind: "body" as const,
          layer: 0,
        }))
      : items;
  const treeItems = opened
    ? baseTreeItems
    : baseTreeItems.filter((item) => {
        const members = objects.find((o) => o.id === item.id)?.members ?? [
          item.element,
        ];
        return s.auditIds
          ? members.some((e) => s.auditIds!.includes(e.id))
          : members.some((e) => matchesFilters(e, s.filters));
      });
  const visibleScene = useMemo(
    () =>
      visibleItems(
        s.project,
        s.openedObject,
        s.hidden,
        s.isolated,
        s.onlySelected ? s.calculatedObjects : null,
        sceneOptions(s),
      ),
    [
      s.project,
      s.openedObject,
      s.hidden,
      s.isolated,
      s.onlySelected,
      s.calculatedObjects,
      s.filters,
      s.auditIds,
      s.hideConcrete,
      s.rebar,
      s.rebarKinds,
    ],
  );
  const visibleElements = [
    ...new Map(
      visibleScene
        .filter(
          (item) =>
            item.kind === "body" &&
            !(s.hideConcrete && !s.auditIds && isConcrete(item.element)),
        )
        .map((item) => [item.element.id, item.element]),
    ).values(),
  ];
  const filtersActive = !!(
    s.filters.category ||
    s.filters.material ||
    s.filters.unverified
  );
  const openComparison = () => {
    if (!selected?.evidence) return;
    setPdfPage(
      selected.evidence.pages.find((p) => p >= 27) ??
        selected.evidence.pages[0] ??
        4,
    );
    setCompareOpen(true);
    setTab("model");
    s.set({ mobilePanel: "none" });
  };
  useEffect(() => {
    if (compareOpen && selected?.evidence)
      setPdfPage(
        selected.evidence.pages.find((p) => p >= 27) ??
          selected.evidence.pages[0] ??
          4,
      );
  }, [compareOpen, selected]);
  const focusFinding = (finding: Finding) => {
    s.set({
      auditIds: finding.ids,
      selected: finding.ids[0],
      mobilePanel: "none",
      cameraRevision: s.cameraRevision + 1,
    });
    setTab("model");
  };
  const cutIndex = s.cutAxis === "x" ? 0 : s.cutAxis === "y" ? 1 : 2;
  const sceneBounds = visibleScene.map((item) => {
    const b = itemBounds(item),
      pos = displayPosition(
        item.element.position,
        s.offsets[item.id],
        s.exploded,
        itemLayer(item, s.openedObject),
      );
    return {
      id: item.id,
      min: b.min.map((v, a) => v + pos[a]),
      max: b.max.map((v, a) => v + pos[a]),
    };
  });
  const centerForCut = (k: number) => {
    const focused = sceneBounds.find((b) => b.id === s.selected);
    const bounds = focused ? [focused] : sceneBounds;
    return bounds.length
      ? (Math.min(...bounds.map((b) => b.min[k])) +
          Math.max(...bounds.map((b) => b.max[k]))) /
          2
      : 0;
  };
  const cutExtents = sceneBounds.map((b) => ({
    min: b.min[cutIndex],
    max: b.max[cutIndex],
  }));
  const cutMin = cutExtents.length
    ? Math.min(...cutExtents.map((b) => b.min)) - 0.01
    : -1;
  const cutMax = cutExtents.length
    ? Math.max(...cutExtents.map((b) => b.max)) + 0.01
    : 1;
  const selectionCalculation = useMemo(
    () => calculateSelection(s.project, s.calculatedObjects),
    [s.project, s.calculatedObjects],
  );
  const scopeElements =
    opened?.members ??
    (s.onlySelected
      ? selectionCalculation.elements
      : s.auditIds || filtersActive
        ? visibleElements
        : s.project.elements);
  const scopeProject =
    opened || s.onlySelected || s.auditIds || filtersActive
      ? {
          ...s.project,
          name: opened
            ? opened.root.name
            : s.onlySelected
              ? "Выбранные объекты"
              : s.auditIds
                ? "Проверяемые тела"
                : "По фильтру",
          elements: scopeElements,
          document: s.project.document
            ? {
                ...s.project.document,
                materials: [],
                additionalReinforcement: [],
              }
            : undefined,
        }
      : s.project;
  const q = useMemo(
    () => (selected ? elementQuantities(selected) : null),
    [selected],
  );
  const summary = useMemo(() => totals(scopeElements), [scopeElements]);
  const hasQuantities = Object.keys(summary).length > 0 || !s.project.document;
  const selectedBounds = selectedItem ? itemBounds(selectedItem) : null;
  const quantitiesExcluded =
    selected?.evidence?.representation === "diagram" ||
    selected?.evidence?.representation === "envelope";
  const openAssembly = (assembly: Assembly, newVariant = variant) => {
    s.load(createKzh(assembly, newVariant));
    s.set({ view: "iso", ortho: false });
    setTab("model");
    setSearch("");
    setMessage(
      "Загружена ручная реконструкция КЖ. Неустранённые расхождения — в разделе «Источник».",
    );
  };
  const projectNotice =
    s.project.elements.length > 0 &&
    s.project.elements.every((e) => e.confidence === "assumed")
      ? "Условные размеры"
      : s.project.elements.some(
            (e) => e.confidence === "assumed" || e.confidence === "unknown",
          )
        ? "Есть непроверенные данные"
        : "Проверяйте источники";
  const groups = [...new Set(treeItems.map((item) => item.element.category))];
  const volume = Object.values(summary).reduce((a, b) => a + b, 0);
  const offset = selected
    ? (s.offsets[selectedItem!.id] ?? [0, 0, 0])
    : [0, 0, 0];
  function hide(id: string) {
    s.set({
      hidden: s.hidden.includes(id)
        ? s.hidden.filter((x) => x !== id)
        : [...s.hidden, id],
    });
  }
  async function loadFile(input: HTMLInputElement, kind: "project" | "dxf") {
    const f = input.files?.[0];
    if (!f) return;
    try {
      if (f.size > 20 * 1024 * 1024) throw new Error("Лимит файла 20 МБ");
      const text = await f.text();
      if (kind === "project") {
        s.load(parseProject(text));
        setTab("model");
        setMessage(`Проект «${f.name}» загружен`);
      } else {
        setDrawing(dxfImporter.parse(text, f.name));
        setTab("drawing");
        setMessage("DXF импортирован как чертёж");
      }
    } catch (e) {
      setMessage(
        `Ошибка: ${e instanceof Error ? e.message : "Файл не прочитан"}`,
      );
    } finally {
      input.value = "";
    }
  }
  function save() {
    download(JSON.stringify(s.project, null, 2), "buildscope.json");
    setMessage("Проект сохранён в JSON");
  }
  return (
    <div
      className={`app ${tab === "workorder" ? "work-order-active" : ""} ${workActive ? "installation-active" : ""} ${s.theme} mobile-${s.mobilePanel} ${s.mobileExpanded ? "mobile-expanded" : ""} ${mobileTools ? "mobile-tools-open" : ""}`}
    >
      <header className="header">
        <div className="brand">
          <Box size={27} />
          <strong>BuildScope</strong>
          <span>0.8</span>
        </div>
        <div className="project-name">
          {s.project.name}
          <small>Локальный проект / исходная геометрия</small>
        </div>
        <div className="file-actions">
          <button onClick={() => file.current?.click()}>
            <FolderOpen size={16} />
            Открыть
          </button>
          <button onClick={save}>
            <Save size={16} />
            Сохранить
          </button>
          <button
            className="primary"
            onClick={() => {
              download(
                toCSV(scopeProject),
                "buildscope.csv",
                "text/csv;charset=utf-8",
              );
              setMessage("Ведомость экспортирована");
            }}
          >
            <Download size={16} />
            CSV
          </button>
          <button
            aria-label="Сменить тему"
            onClick={() =>
              s.set({ theme: s.theme === "dark" ? "light" : "dark" })
            }
          >
            {s.theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>
      <div className="project-switcher">
        <span>Комплект КЖ1.5</span>
        <button
          className={
            s.project.document?.assembly === "Каталог гнутых деталей"
              ? "active"
              : ""
          }
          onClick={() => {
            s.load(createKzhDetails());
            setTab("model");
            setSearch("");
          }}
        >
          Гнутые детали
        </button>
        <button
          className={
            s.project.document?.assembly === "Кассовый павильон" ? "active" : ""
          }
          onClick={() => openAssembly("pavilion")}
        >
          Кассовый павильон
        </button>
        <button
          className={
            s.project.document?.assembly.includes("Навес") ? "active" : ""
          }
          onClick={() => openAssembly("canopy")}
        >
          Навес «сухие ноги»
        </button>
        {s.project.document?.assembly.includes("Навес") && (
          <label>
            Отметки{" "}
            <select
              aria-label="Вариант отметок"
              value={s.project.document.variant ?? variant}
              onChange={(e) => {
                const v = e.target.value as "plan" | "sections";
                setVariant(v);
                openAssembly("canopy", v);
              }}
            >
              <option value="plan">По плану</option>
              <option value="sections">По разрезам</option>
            </select>
          </label>
        )}
        <button className="source-shortcut" onClick={() => setTab("source")}>
          Источники и расхождения
        </button>
      </div>
      <input
        hidden
        type="file"
        accept=".pdf"
        ref={pdf}
        aria-label="Исходный PDF"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > 50 * 1024 * 1024) {
            setMessage("Ошибка: лимит PDF 50 МБ");
            return;
          }
          setPdfUrl(URL.createObjectURL(f));
          setTab(compareOpen ? "model" : "source");
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={file}
        type="file"
        accept=".json"
        aria-label="Загрузить JSON"
        onChange={(e) => void loadFile(e.currentTarget, "project")}
      />
      <input
        hidden
        ref={dxf}
        type="file"
        accept=".dxf"
        aria-label="Загрузить DXF"
        onChange={(e) => void loadFile(e.currentTarget, "dxf")}
      />
      {s.mobilePanel === "tree" && (
        <button
          className="mobile-tree-backdrop"
          aria-label="Закрыть список конструкций"
          onClick={() => s.set({ mobilePanel: "none" })}
        />
      )}
      <div className="workspace">
        <aside className="tree-panel">
          <div className="panel-heading">
            <span>
              {s.calculatorOpen
                ? "Объекты для расчёта"
                : opened
                  ? "Части объекта"
                  : "Конструкции"}
            </span>
            <span className="muted">{treeItems.length}</span>
            <button
              className="mobile-close-button"
              aria-label="Скрыть список"
              onClick={() => s.set({ mobilePanel: "none" })}
            >
              <X size={20} />
            </button>
          </div>
          <label className="search">
            <Search size={15} />
            <input
              placeholder="Найти элемент…"
              aria-label="Поиск конструкций"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="tree-root">
            <Layers3 size={17} />
            <strong>{s.project.name}</strong>
          </div>
          <div className="tree-scroll">
            {groups.map((group) => {
              const elements = treeItems.filter(
                (item) =>
                  item.element.category === group &&
                  `${item.element.mark} ${item.label} ${
                    !opened
                      ? (objectFor(s.project, item.id)
                          ?.members.map((m) => m.name)
                          .join(" ") ?? "")
                      : ""
                  }`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              );
              return (
                elements.length > 0 && (
                  <details open={group !== "Пути"} key={group}>
                    <summary>
                      <ChevronDown size={13} />
                      {group}
                      <span>{elements.length}</span>
                    </summary>
                    {elements.map((item) => {
                      const e = item.element;
                      return (
                        <div
                          key={item.id}
                          className={`tree-row ${!opened && s.calculatedObjects.includes(item.id) ? "in-calculation" : ""} ${s.selected === item.id ? "selected" : ""} ${s.hidden.includes(item.id) ? "hidden-row" : ""}`}
                        >
                          {!opened && hasObjects(s.project) && (
                            <label className="calculation-check">
                              <input
                                type="checkbox"
                                aria-label={`В расчёт ${item.label}`}
                                checked={s.calculatedObjects.includes(item.id)}
                                onChange={() => s.select(item.id)}
                              />
                            </label>
                          )}
                          <button
                            className="element-button"
                            onClick={() => {
                              s.select(item.id);
                              setTab("model");
                            }}
                          >
                            <span
                              className="swatch"
                              style={{ background: e.color }}
                            />
                            <span>
                              {item.kind === "steel" ? "Арматура" : e.mark}
                              <small>{item.label}</small>
                            </span>
                          </button>
                          <button
                            className="visibility"
                            aria-label={`Видимость ${item.kind === "steel" ? item.label : e.mark}`}
                            aria-pressed={!s.hidden.includes(item.id)}
                            onClick={() => hide(item.id)}
                          >
                            {s.hidden.includes(item.id) ? (
                              <EyeOff size={14} />
                            ) : (
                              <Eye size={14} />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </details>
                )
              );
            })}
          </div>
          <div className="model-params">
            <label>
              Длина демо, м{" "}
              <input
                aria-label="Длина платформы"
                type="number"
                min={12}
                max={120}
                step={6}
                value={length}
                onChange={(e) => setLength(Number(e.target.value))}
              />
            </label>
            <button
              onClick={() => {
                try {
                  s.load(demo(length));
                  setMessage("Создана новая условная модель");
                } catch (e) {
                  setMessage((e as Error).message);
                }
              }}
            >
              Создать демо
            </button>
            <small>
              Создаёт новый проект. Сохраните текущий JSON перед заменой.
            </small>
          </div>
          <button
            className="import-button"
            onClick={() => dxf.current?.click()}
          >
            <FileBox size={17} />
            Импорт чертежа DXF
          </button>
        </aside>
        <main className="main">
          <nav className="tabs">
            <button
              className={tab === "workorder" ? "active" : ""}
              onClick={() => {
                s.set({ mobilePanel: "none" });
                setTab("workorder");
              }}
            >
              Наряд
            </button>
            <button
              className={tab === "model" ? "active" : ""}
              onClick={() => setTab("model")}
            >
              3D-модель
            </button>
            <button
              className={tab === "schedule" ? "active" : ""}
              onClick={() => setTab("schedule")}
            >
              Ведомость материалов
            </button>
            {s.project.document && (
              <>
                <button
                  className={tab === "reinforcement" ? "active" : ""}
                  onClick={() => setTab("reinforcement")}
                >
                  Армирование
                </button>
                <button
                  className={tab === "source" ? "active" : ""}
                  onClick={() => setTab("source")}
                >
                  Источник
                </button>
              </>
            )}
            <button
              className={tab === "audit" ? "active" : ""}
              onClick={() => setTab("audit")}
            >
              Проверка модели
            </button>
            {drawing && (
              <button
                className={tab === "drawing" ? "active" : ""}
                onClick={() => setTab("drawing")}
              >
                Чертёж DXF
              </button>
            )}
            <span className="demo-badge">{projectNotice}</span>
          </nav>
          {tab === "model" && (
            <QuickFilters
              project={s.project}
              onCompare={openComparison}
              canCompare={!!selected?.evidence}
            />
          )}
          {s.auditIds && tab === "model" && (
            <div className="audit-focus">
              <strong>Проверка · {s.auditIds.length} тел</strong>
              <button
                onClick={() =>
                  s.set({
                    auditIds: null,
                    cameraRevision: s.cameraRevision + 1,
                  })
                }
              >
                Вернуться к обычному виду
              </button>
              <button onClick={() => setTab("audit")}>К замечаниям</button>
            </div>
          )}
          {opened && (
            <div className="object-navigation">
              <button
                onClick={() => {
                  s.openObject(null);
                  setSearch("");
                }}
              >
                ← Ко всем объектам
              </button>
              <span>
                {opened.root.mark} · {opened.root.name}
              </span>
              <small>Отдельный вид · {items.length} частей</small>
              <button
                onClick={() => {
                  s.set({
                    selected: null,
                    isolated: null,
                    hidden: [],
                    offsets: {},
                    cameraRevision: s.cameraRevision + 1,
                  });
                }}
              >
                Показать все части
              </button>
            </div>
          )}
          <div className="mobile-model-tools">
            <label>
              Вид{" "}
              <select
                aria-label="Вид модели"
                value={s.view}
                onChange={(e) =>
                  s.set({
                    view: e.target.value as typeof s.view,
                    cameraRevision: s.cameraRevision + 1,
                  })
                }
              >
                <option value="iso">Изометрия</option>
                <option value="top">Сверху</option>
                <option value="front">Спереди</option>
                <option value="side">Сбоку</option>
              </select>
            </label>
            <button
              aria-pressed={mobileTools}
              onClick={() => setMobileTools(!mobileTools)}
            >
              Инструменты
            </button>
          </div>
          <div className="toolbar">
            <div className="tool-group">
              {(["iso", "top", "front", "side"] as const).map((v, i) => (
                <button
                  key={v}
                  className={s.view === v ? "active" : ""}
                  onClick={() => {
                    s.set({ view: v, cameraRevision: s.cameraRevision + 1 });
                    setTab("model");
                  }}
                >
                  {["Изометрия", "Сверху", "Спереди", "Сбоку"][i]}
                </button>
              ))}
              <button
                className={s.ortho ? "active" : ""}
                onClick={() => s.set({ ortho: !s.ortho })}
              >
                {s.ortho ? "Орто" : "Перспектива"}
              </button>
            </div>
            <div className="tool-group">
              <button
                aria-pressed={s.measure}
                className={s.measure ? "active" : ""}
                onClick={() => s.set({ measure: !s.measure, points: [] })}
              >
                <Ruler size={16} />
                Замер
              </button>
              <button
                aria-pressed={s.section}
                className={s.section ? "active" : ""}
                onClick={() =>
                  s.set({
                    section: !s.section,
                    cut: !s.section ? centerForCut(cutIndex) : s.cut,
                  })
                }
              >
                <Scissors size={16} />
                Разрез
              </button>
              <button
                aria-pressed={s.exploded}
                className={s.exploded ? "active" : ""}
                onClick={() => s.set({ exploded: !s.exploded })}
              >
                <Layers3 size={16} />
                Разобрать
              </button>
              <button
                title="Сбросить перемещения и видимость"
                aria-label="Сбросить перемещения"
                onClick={() => {
                  s.reset();
                  setMessage("Перемещения и видимость сброшены");
                }}
              >
                <RotateCcw size={16} />
              </button>
            </div>
          </div>
          <div className="view-controls">
            {!opened && hasObjects(s.project) && (
              <button
                className={
                  s.calculatorOpen
                    ? "active calculator-toggle"
                    : "calculator-toggle"
                }
                aria-label="Калькулятор материалов"
                aria-pressed={s.calculatorOpen}
                onClick={() => {
                  s.set({
                    calculatorOpen: !s.calculatorOpen,
                    mobilePanel: !s.calculatorOpen ? "inspector" : "none",
                    mobileExpanded: false,
                    measure: false,
                    points: [],
                    selected: null,
                    calculatedObjects:
                      !s.calculatorOpen && selectedObject
                        ? [
                            ...new Set([
                              ...s.calculatedObjects,
                              selectedObject.id,
                            ]),
                          ]
                        : s.calculatedObjects,
                  });
                  setTab("model");
                }}
              >
                <Calculator size={16} />
                Калькулятор
                {s.calculatedObjects.length > 0 && (
                  <span>{s.calculatedObjects.length}</span>
                )}
              </button>
            )}
            {s.calculatorOpen && (
              <button
                className="calculator-result-link"
                onClick={() => {
                  s.set({ mobilePanel: "inspector" });
                  if (window.innerWidth > 850)
                    document
                      .querySelector(".inspector")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                К итогам ↓
              </button>
            )}
            <label>
              <input
                type="checkbox"
                checked={s.wire}
                onChange={(e) => s.set({ wire: e.target.checked })}
              />
              Каркас
            </label>
            {s.project.document && !opened && (
              <label>
                <input
                  type="checkbox"
                  checked={s.rebar}
                  onChange={(e) =>
                    s.set({
                      rebar: e.target.checked,
                      hideConcrete: e.target.checked ? s.hideConcrete : false,
                      opacity: e.target.checked ? 0.2 : 1,
                    })
                  }
                />
                Схема арматуры
              </label>
            )}
            <label>
              Непрозрачность{" "}
              <input
                aria-label="Непрозрачность"
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={s.opacity}
                onChange={(e) => s.set({ opacity: +e.target.value })}
              />
            </label>
            {s.section && (
              <label>
                <select
                  aria-label="Ось разреза"
                  value={s.cutAxis}
                  onChange={(e) => {
                    const axis = e.target.value as "x" | "y" | "z",
                      k = axis === "x" ? 0 : axis === "y" ? 1 : 2;
                    s.set({
                      cutAxis: axis,
                      cut: centerForCut(k),
                    });
                  }}
                >
                  <option value="x">X</option>
                  <option value="y">Y</option>
                  <option value="z">Z</option>
                </select>{" "}
                Сечение, м{" "}
                <input
                  aria-label="Положение разреза"
                  type="range"
                  min={cutMin}
                  max={cutMax}
                  step={0.01}
                  value={s.cut}
                  onChange={(e) => s.set({ cut: +e.target.value })}
                />
                {fmt(s.cut)}
              </label>
            )}
          </div>
          {!opened && hasObjects(s.project) && (
            <div className="multi-selection-bar">
              <strong data-testid="selection-count" aria-live="polite">
                Выбрано: {s.calculatedObjects.length}
              </strong>
              <span>
                Нажимайте объекты подряд. Повторное нажатие снимает выбор.
              </span>
              <button
                disabled={!s.calculatedObjects.length}
                onClick={() => {
                  s.set({
                    calculatorOpen: true,
                    mobilePanel: "inspector",
                    mobileExpanded: false,
                    measure: false,
                    points: [],
                  });
                  setTab("model");
                }}
              >
                Рассчитать выбранные
              </button>
              <button
                disabled={!s.calculatedObjects.length && !s.onlySelected}
                aria-pressed={s.onlySelected}
                onClick={s.toggleOnlySelected}
              >
                {s.onlySelected
                  ? "Вернуть весь проект"
                  : "Показать только выбранные"}
              </button>
              <button
                disabled={!s.calculatedObjects.length}
                onClick={() => s.clearSelection()}
              >
                Снять весь выбор
              </button>
            </div>
          )}
          <div
            className={`viewport ${tab === "model" && compareOpen ? "model-and-drawing" : ""}`}
          >
            {tab === "model" ? (
              <>
                <div className="model-stage">
                  <Viewer paused={workActive} />
                  <div className="viewport-heading">
                    <span>{opened ? opened.root.name : s.project.name}</span>
                    {s.calculatorOpen && (
                      <strong className="calculation-hint">
                        В расчёте: {s.calculatedObjects.length} · нажимайте
                        объекты для выбора
                      </strong>
                    )}
                    <small>
                      {s.ortho ? "Ортографическая" : "Перспективная"} проекция ·
                      метры
                    </small>
                  </div>
                  <div className="viewport-bottom">
                    <span>
                      {s.measure
                        ? "Выберите две точки на поверхностях. Замер учитывает временное положение."
                        : "ЛКМ — вращение / выбор · ПКМ — перемещение · колесо — масштаб"}
                    </span>
                    <button
                      title="Вернуть изометрию"
                      onClick={() =>
                        s.set({
                          view: "iso",
                          cameraRevision: s.cameraRevision + 1,
                        })
                      }
                    >
                      <Maximize size={16} />
                    </button>
                  </div>
                </div>
                {workActive && selectedItem && opened && plan && (
                  <InstallationPlayer
                    item={selectedItem}
                    members={opened.members}
                    plan={plan}
                    onClose={closeWork}
                    schemeLevels={s.project.document?.zeroAbsolute === null}
                  />
                )}
                {compareOpen && (
                  <DrawingComparison
                    project={s.project}
                    selected={selected}
                    url={pdfUrl}
                    page={pdfPage}
                    onPage={setPdfPage}
                    onOpen={() => pdf.current?.click()}
                    onClose={() => setCompareOpen(false)}
                  />
                )}
              </>
            ) : tab === "workorder" ? (
              <WorkOrderPanel
                project={s.project}
                opened={s.openedObject}
                selected={s.selected}
                selectedRoots={s.calculatedObjects}
                draft={workDraft}
                onDraft={setWorkDraft}
                onFocus={(id) => {
                  const object = objectFor(s.project, id);
                  if (object) {
                    s.openObject(object.id);
                    useStore.getState().set({
                      selected: id,
                      mobilePanel: "none",
                      cameraRevision: useStore.getState().cameraRevision + 1,
                    });
                    setSearch("");
                    setTab("model");
                  }
                }}
              />
            ) : tab === "audit" ? (
              <InspectionPanel
                project={s.project}
                visible={visibleElements}
                result={inspection}
                onResult={setInspection}
                onFocus={focusFinding}
              />
            ) : tab === "reinforcement" ? (
              <ReinforcementPanel project={scopeProject} selected={selected} />
            ) : tab === "source" ? (
              <SourcePanel
                project={s.project}
                pdfUrl={pdfUrl}
                page={pdfPage}
                onPage={setPdfPage}
                onOpen={() => pdf.current?.click()}
              />
            ) : tab === "drawing" && drawing ? (
              <DrawingView drawing={drawing} />
            ) : (
              <section className="schedule">
                <h1>Ведомость материалов</h1>
                {s.project.document && (
                  <button
                    onClick={() =>
                      download(
                        toSourceCSV(scopeProject),
                        "kzh-source-schedules.csv",
                        "text/csv;charset=utf-8",
                      )
                    }
                  >
                    Экспорт ведомостей PDF в CSV
                  </button>
                )}
                <p>
                  {opened ? opened.root.name : "Весь проект"} · исходная
                  геометрия · {projectNotice}
                </p>
                {opened && <Materials elements={scopeElements} />}
                {s.project.document && (
                  <p>
                    Объёмы геометрии, включая номинальные ФЛ/ФБС. Схемы и
                    огибающие слоёв исключены. Значения ведомости PDF приведены
                    отдельно.
                  </p>
                )}
                <table>
                  <thead>
                    <tr>
                      <th>Материал</th>
                      <th>Элементы</th>
                      <th>Объём, м³</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(summary).map(([material, v]) => (
                      <tr key={material}>
                        <td>{material}</td>
                        <td>
                          {
                            scopeElements.filter((e) => e.material === material)
                              .length
                          }
                        </td>
                        <td>
                          {fmt(v)}
                          {scopeElements.some(
                            (e) =>
                              e.material === material &&
                              ["diagram", "envelope"].includes(
                                e.evidence?.representation ?? "",
                              ),
                          )
                            ? " + не определено"
                            : ""}
                          <QuantityBadges
                            statuses={scopeElements
                              .filter((e) => e.material === material)
                              .map(elementQuantityStatus)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Всего</th>
                      <td>{scopeElements.length}</td>
                      <td data-testid="total-volume">
                        {hasQuantities ? fmt(volume) : "—"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                <p>
                  Объёмы пересекающихся частей одного элемента объединяются.
                  Пересечения разных элементов не вычитаются.
                </p>
                {s.project.document && !opened && (
                  <>
                    <h2>По ведомостям исходного PDF</h2>
                    <table>
                      <thead>
                        <tr>
                          <th>Материал / работа</th>
                          <th>Ед.</th>
                          <th>PDF</th>
                          <th>Количество</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scopeProject.document!.materials.map((r, i) => (
                          <tr key={i}>
                            <td>{r.name}</td>
                            <td>{r.unit}</td>
                            <td>{r.page}</td>
                            <td>
                              {fmt(r.value)}
                              <QuantityBadges statuses={["source"]} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p>
                      Эти количества не прибавляются к геометрическим: это
                      независимые данные источника. Толщина обмазки не задана;
                      площади не превращаются в выдуманные объёмы.
                    </p>
                  </>
                )}
                <button
                  onClick={() =>
                    download(
                      toCSV(scopeProject),
                      "buildscope.csv",
                      "text/csv;charset=utf-8",
                    )
                  }
                >
                  <Download size={16} />
                  Скачать подробную ведомость
                </button>
              </section>
            )}
          </div>
          <div className="model-footer">
            <span>
              <i />
              Модель готова
            </span>
            <span>
              {
                visibleItems(
                  s.project,
                  s.openedObject,
                  s.hidden,
                  s.isolated,
                  s.onlySelected ? s.calculatedObjects : null,
                  sceneOptions(s),
                ).length
              }{" "}
              / {items.length} {opened ? "частей" : "элементов"}
            </span>
            <span title="Итог геометрии, включая номинальные тела. Схемы исключены.">
              {s.auditIds
                ? "Проверка:"
                : filtersActive && !s.onlySelected
                  ? "По фильтру:"
                  : s.onlySelected
                    ? "Выбор:"
                    : s.calculatorOpen
                      ? "Вся модель:"
                      : "Σ геом."}{" "}
              {hasQuantities ? fmt(volume) : "—"} м³
            </span>
            <button
              onClick={() => {
                void exportGLB(scopeProject)
                  .then(() =>
                    setMessage("Исходная модель экспортирована в GLB"),
                  )
                  .catch((e) => setMessage(`Ошибка GLB: ${e.message}`));
              }}
            >
              Экспорт GLB <Download size={13} />
            </button>
          </div>
        </main>
        <aside className="inspector">
          <MobilePanelHandle />
          <div className="panel-heading">
            {s.calculatorOpen
              ? "Калькулятор материалов"
              : selectedObject
                ? "Свойства объекта"
                : opened
                  ? "Свойства части"
                  : "Свойства элемента"}
            <Box size={16} />
          </div>
          {s.calculatorOpen ? (
            <SelectionCalculator />
          ) : selectedObject ? (
            <ObjectInspector
              object={selectedObject}
              onCompare={openComparison}
              onOpen={() => {
                s.openObject(selectedObject.id);
                setSearch("");
                setTab("model");
              }}
              onHide={() => hide(selectedObject.id)}
              hidden={s.hidden.includes(selectedObject.id)}
              onIsolate={() =>
                s.set({
                  isolated: s.isolated ? null : selectedObject.id,
                  cameraRevision: s.cameraRevision + 1,
                })
              }
              isolated={!!s.isolated}
              onSource={() => {
                setPdfPage(selectedObject.root.evidence?.pages[0] ?? 1);
                setTab("source");
              }}
            />
          ) : selectedItem?.kind === "steel" ? (
            <>
              {plan && (
                <div className="part-installation-action">
                  <button data-testid="start-installation" onClick={startWork}>
                    <Play size={16} />
                    Показать устройство
                  </button>
                </div>
              )}
              <SteelInspector item={selectedItem} />
              <div className="selection-actions">
                <button onClick={() => hide(selectedItem.id)}>
                  {s.hidden.includes(selectedItem.id)
                    ? "Показать часть"
                    : "Скрыть часть"}
                </button>
                <button
                  onClick={() =>
                    s.set({
                      isolated: s.isolated ? null : selectedItem.id,
                      cameraRevision: s.cameraRevision + 1,
                    })
                  }
                >
                  Изолировать
                </button>
              </div>
            </>
          ) : selected && q ? (
            <>
              <div className="selected-heading">
                <span className="category">{selected.category}</span>
                <h2>{selected.mark}</h2>
                <p>{selected.name}</p>
              </div>
              {opened && plan && (
                <div className="part-installation-action">
                  <button data-testid="start-installation" onClick={startWork}>
                    <Play size={16} />
                    Показать устройство
                  </button>
                  <small>Шаги, размеры и материалы выбранной части</small>
                </div>
              )}
              {opened && !plan && (
                <p className="installation-unavailable">
                  Сценарий устройства недоступен: контур этой части не
                  восстановлен или не поддерживается.
                </p>
              )}
              <div className="selection-actions">
                <button onClick={() => hide(selectedItem!.id)}>
                  <EyeOff size={15} />
                  {s.hidden.includes(selectedItem!.id) ? "Показать" : "Скрыть"}
                </button>
                <button
                  className={s.isolated ? "active" : ""}
                  onClick={() =>
                    s.set({
                      isolated: s.isolated ? null : selectedItem!.id,
                      cameraRevision: s.cameraRevision + 1,
                    })
                  }
                >
                  <Focus size={15} />
                  Изолировать
                </button>
              </div>
              <section className="property-section">
                <h3>Инженерные данные</h3>
                <dl>
                  <dt>Материал</dt>
                  <dd>{selected.material}</dd>
                  <dt>
                    {selected.material === "Щебень" &&
                    selected.confidence === "assumed"
                      ? "Объём (расчётный)"
                      : "Объём"}
                  </dt>
                  <dd>
                    <span data-testid="element-volume">
                      {quantitiesExcluded
                        ? "Не определён"
                        : fmt(q.volume) + " м³"}
                    </span>
                    <QuantityBadges
                      statuses={[elementQuantityStatus(selected)]}
                    />
                  </dd>
                  <dt>Площадь поверхности</dt>
                  <dd>
                    {quantitiesExcluded ? "Не определена" : fmt(q.area) + " м²"}
                    <QuantityBadges
                      statuses={[elementQuantityStatus(selected)]}
                    />
                  </dd>
                  {selected.evidence?.reportedVolume !== undefined && (
                    <>
                      <dt>В спецификации</dt>
                      <dd>
                        {fmt(selected.evidence.reportedVolume)} м³
                        <QuantityBadges statuses={["source"]} />
                      </dd>
                    </>
                  )}
                  <dt>Количество</dt>
                  <dd>1 шт.</dd>
                  <dt>Частей тела</dt>
                  <dd>
                    {selected.shape ? "Профиль / тело" : selected.parts.length}
                  </dd>
                  <dt>ID</dt>
                  <dd>{selected.id}</dd>
                </dl>
              </section>
              {opened && <Materials elements={[selected]} partsOnly />}
              <section className="property-section">
                <h3>Проектные координаты, м</h3>
                <div className="xyz">
                  {selected.position.map((v, i) => (
                    <div key={i}>
                      <span>{["X", "Y ↑", "Z"][i]}</span>
                      <strong>{fmt(v)}</strong>
                    </div>
                  ))}
                </div>
                <dl>
                  <dt>Низ / верх</dt>
                  <dd>
                    {fmt(selected.position[1] + selectedBounds!.min[1])} /{" "}
                    {fmt(selected.position[1] + selectedBounds!.max[1])}
                  </dd>
                </dl>
                <details>
                  <summary>Размеры частей, м</summary>
                  {selected.shape && (
                    <p>
                      Габарит:{" "}
                      {selectedBounds!.max
                        .map((v, i) => fmt(v - selectedBounds!.min[i]))
                        .join(" × ")}
                      . Геометрия:{" "}
                      {selected.shape.kind === "extrusion"
                        ? "экструзия профиля"
                        : selected.shape.kind === "bar"
                          ? "гнутый стержень"
                          : "замкнутое тело"}
                      .
                    </p>
                  )}
                  {selected.parts.map((p, i) => (
                    <p key={i}>
                      {i + 1}: {p.size.map(fmt).join(" × ")}
                    </p>
                  ))}
                </details>
              </section>
              <section className="property-section">
                <h3>
                  <Move3D size={15} />
                  Временное перемещение, м
                </h3>
                <div className="offsets">
                  {offset.map((v, i) => (
                    <label key={i}>
                      {["X", "Y", "Z"][i]}
                      <input
                        aria-label={`Смещение ${["X", "Y", "Z"][i]}`}
                        type="number"
                        step={0.1}
                        value={v}
                        onChange={(event) => {
                          const next = [...offset] as Vec3;
                          const n = Number(event.target.value);
                          if (!Number.isFinite(n)) return;
                          next[i] = n;
                          s.set({
                            offsets: { ...s.offsets, [selectedItem!.id]: next },
                          });
                        }}
                      />
                    </label>
                  ))}
                </div>
                <small>
                  Только для просмотра. Расчёты и проектные координаты
                  сохраняются.
                </small>
              </section>
              <section className="property-section source">
                <h3>Происхождение данных</h3>
                <span className="confidence">
                  {confidence[selected.confidence]}
                </span>
                <p>{selected.source}</p>
                {selected.evidence && (
                  <>
                    <p>
                      Представление:{" "}
                      {
                        {
                          dimensioned: "по размерам",
                          nominal: "номинальное",
                          diagram: "схема · без расчётного объёма",
                          envelope: "огибающая · без расчётного объёма",
                        }[selected.evidence.representation]
                      }
                    </p>
                    <button
                      onClick={() => {
                        openComparison();
                      }}
                    >
                      PDF: страницы {selected.evidence.pages.join(", ")}
                    </button>
                    {selected.evidence.reinforcement && (
                      <button onClick={() => setTab("reinforcement")}>
                        Спецификация армирования
                      </button>
                    )}
                    {selected.evidence.notes.map((note, i) => (
                      <p key={i}>{note}</p>
                    ))}
                  </>
                )}
                <small>
                  Объём и площадь вычислены по геометрии. Точность зависит от
                  исходных данных.
                </small>
              </section>
            </>
          ) : (
            <div className="empty-selection">
              <Box size={42} strokeWidth={1} />
              <h2>
                {opened ? "Исследуйте части объекта" : "Исследуйте конструкцию"}
              </h2>
              <p>
                {opened
                  ? "Выберите часть в модели или списке. Кнопка «Разобрать» раздвигает тело, подготовку и схемы арматуры; количества сохраняются."
                  : "Выберите объект целиком, посмотрите материалы и нажмите «Открыть отдельно», чтобы исследовать его части."}
              </p>
              <div className="legend">
                {[
                  ["#aababc", "Железобетон"],
                  ["#528c8f", "Металлоконструкции"],
                  ["#82908e", "Основание"],
                ].map(([c, n]) => (
                  <span key={n}>
                    <i style={{ background: c }} />
                    {n}
                  </span>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
      <MobileControls onModel={() => setTab("model")} />
      <footer
        className={`status ${message.startsWith("Ошибка") ? "error" : ""}`}
        role="status"
      >
        <span>{message}</span>
        <span>
          Y — высота · единицы: м · формат проекта v{s.project.version}
        </span>
      </footer>
    </div>
  );
}
