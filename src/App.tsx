import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
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
} from "lucide-react";
import Viewer from "./Viewer";
import { useStore } from "./store";
import {
  demo,
  parseProject,
  elementQuantities,
  elementBounds,
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
  const [tab, setTab] = useState<
    "model" | "schedule" | "drawing" | "reinforcement" | "source"
  >("model");
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
  const selected = s.project.elements.find((e) => e.id === s.selected);
  const q = useMemo(
    () => (selected ? elementQuantities(selected) : null),
    [selected],
  );
  const summary = useMemo(() => totals(s.project.elements), [s.project]);
  const hasQuantities = Object.keys(summary).length > 0 || !s.project.document;
  const selectedBounds = selected ? elementBounds(selected) : null;
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
  const groups = [...new Set(s.project.elements.map((e) => e.category))];
  const volume = Object.values(summary).reduce((a, b) => a + b, 0);
  const offset = selected ? (s.offsets[selected.id] ?? [0, 0, 0]) : [0, 0, 0];
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
    <div className={`app ${s.theme}`}>
      <header className="header">
        <div className="brand">
          <Box size={27} />
          <strong>BuildScope</strong>
          <span>0.2</span>
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
                toCSV(s.project),
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
          setTab("source");
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
      <div className="workspace">
        <aside className="tree-panel">
          <div className="panel-heading">
            <span>Конструкции</span>
            <span className="muted">{s.project.elements.length}</span>
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
              const elements = s.project.elements.filter(
                (e) =>
                  e.category === group &&
                  `${e.name} ${e.mark}`
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
                    {elements.map((e) => (
                      <div
                        key={e.id}
                        className={`tree-row ${s.selected === e.id ? "selected" : ""} ${s.hidden.includes(e.id) ? "hidden-row" : ""}`}
                      >
                        <button
                          className="element-button"
                          onClick={() => {
                            s.set({ selected: e.id });
                            setTab("model");
                          }}
                        >
                          <span
                            className="swatch"
                            style={{ background: e.color }}
                          />
                          <span>
                            {e.mark}
                            <small>{e.name}</small>
                          </span>
                        </button>
                        <button
                          className="visibility"
                          aria-label={`Видимость ${e.mark}`}
                          aria-pressed={!s.hidden.includes(e.id)}
                          onClick={() => hide(e.id)}
                        >
                          {s.hidden.includes(e.id) ? (
                            <EyeOff size={14} />
                          ) : (
                            <Eye size={14} />
                          )}
                        </button>
                      </div>
                    ))}
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
                onClick={() => s.set({ section: !s.section })}
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
            <label>
              <input
                type="checkbox"
                checked={s.wire}
                onChange={(e) => s.set({ wire: e.target.checked })}
              />
              Каркас
            </label>
            {s.project.document && (
              <label>
                <input
                  type="checkbox"
                  checked={s.rebar}
                  onChange={(e) =>
                    s.set({
                      rebar: e.target.checked,
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
                Сечение X, м{" "}
                <input
                  aria-label="Положение разреза"
                  type="range"
                  min={-length}
                  max={length}
                  step={0.1}
                  value={s.cut}
                  onChange={(e) => s.set({ cut: +e.target.value })}
                />
                {fmt(s.cut)}
              </label>
            )}
          </div>
          <div className="viewport">
            {tab === "model" ? (
              <>
                <Viewer />
                <div className="viewport-heading">
                  <span>{s.project.name}</span>
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
              </>
            ) : tab === "reinforcement" ? (
              <ReinforcementPanel project={s.project} selected={selected} />
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
                        toSourceCSV(s.project),
                        "kzh-source-schedules.csv",
                        "text/csv;charset=utf-8",
                      )
                    }
                  >
                    Экспорт ведомостей PDF в CSV
                  </button>
                )}
                <p>Весь проект · исходная геометрия · {projectNotice}</p>
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
                            s.project.elements.filter(
                              (e) => e.material === material,
                            ).length
                          }
                        </td>
                        <td>{fmt(v)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Всего</th>
                      <td>{s.project.elements.length}</td>
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
                {s.project.document && (
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
                        {s.project.document.materials.map((r, i) => (
                          <tr key={i}>
                            <td>{r.name}</td>
                            <td>{r.unit}</td>
                            <td>{r.page}</td>
                            <td>{fmt(r.value)}</td>
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
                      toCSV(s.project),
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
                s.project.elements.filter(
                  (e) =>
                    !s.hidden.includes(e.id) &&
                    (!s.isolated || s.isolated === e.id),
                ).length
              }{" "}
              / {s.project.elements.length} элементов
            </span>
            <span title="Итог геометрии, включая номинальные тела. Схемы исключены.">
              Σ геом. {hasQuantities ? fmt(volume) : "—"} м³
            </span>
            <button
              onClick={() => {
                void exportGLB(s.project)
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
          <div className="panel-heading">
            Свойства элемента
            <Box size={16} />
          </div>
          {selected && q ? (
            <>
              <div className="selected-heading">
                <span className="category">{selected.category}</span>
                <h2>{selected.mark}</h2>
                <p>{selected.name}</p>
              </div>
              <div className="selection-actions">
                <button onClick={() => hide(selected.id)}>
                  <EyeOff size={15} />
                  {s.hidden.includes(selected.id) ? "Показать" : "Скрыть"}
                </button>
                <button
                  className={s.isolated ? "active" : ""}
                  onClick={() =>
                    s.set({ isolated: s.isolated ? null : selected.id })
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
                  <dt>Объём</dt>
                  <dd data-testid="element-volume">
                    {quantitiesExcluded
                      ? "Не определён"
                      : fmt(q.volume) + " м³"}
                  </dd>
                  <dt>Площадь поверхности</dt>
                  <dd>
                    {quantitiesExcluded ? "Не определена" : fmt(q.area) + " м²"}
                  </dd>
                  {selected.evidence?.reportedVolume !== undefined && (
                    <>
                      <dt>В спецификации</dt>
                      <dd>{fmt(selected.evidence.reportedVolume)} м³</dd>
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
                            offsets: { ...s.offsets, [selected.id]: next },
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
                        setPdfPage(selected.evidence!.pages[0]);
                        setTab("source");
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
              <h2>Исследуйте конструкцию</h2>
              <p>
                Выберите элемент в 3D-модели или дереве, чтобы увидеть его
                размеры, материал и отметки.
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
