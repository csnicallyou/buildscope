import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Box,
  Building2,
  ChevronRight,
  ClipboardList,
  FileClock,
  MapPin,
  Plus,
  ShieldAlert,
  UsersRound,
  PenLine,
} from "lucide-react";
import { ofKind, inNode } from "./construction";
import { useConstruction } from "./useConstruction";
import type { SharedOrder } from "./workspaceTypes";
import type { SavedWorkOrder } from "./workOrderArchive";
import { orderSignals, type OrderSignal } from "./operations";
import PortfolioMap from "./PortfolioMap";

export type SiteContext = {
  id: string;
  title: string;
  nodeIds: string[];
  model: string;
  elementIds: string[];
};

export default function OperationsHome({
  enabled,
  orders,
  shared,
  modelName,
  onOpen,
  onManage,
  onModel,
  onOrders,
  onIssue,
}: {
  enabled: boolean;
  orders: SavedWorkOrder[];
  shared: SharedOrder[];
  modelName: string;
  onOpen: (site: SiteContext) => void;
  onManage: () => void;
  onModel: () => void;
  onOrders: (signal: OrderSignal) => void;
  onIssue: () => void;
}) {
  const { records, error, loading } = useConstruction(enabled);
  const sites = useMemo(
    () => ofKind(records, "node").filter((r) => !r.payload.parentId),
    [records],
  );
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const site = sites.find((s) => s.id === selected) ?? sites[0];
  const openSite = (id: string) => {
    const target = sites.find((s) => s.id === id);
    if (!target) return;
    setSelected(id);
    onOpen({
      id: target.id,
      title: target.payload.title,
      nodeIds: ofKind(records, "node")
        .filter((r) => inNode(records, r.id, target.id))
        .map((r) => r.id),
      model: target.payload.model,
      elementIds: target.payload.elementIds,
    });
  };
  const siteOrders = site
    ? orders.filter((o) => inNode(records, o.draft.nodeId ?? null, site.id))
    : [];
  const issues = ofKind(records, "issue").filter(
    (r) => r.payload.status !== "closed",
  );
  const stats = [
    {
      title: "Нет сведений о выходе",
      value: orders.filter((o) => orderSignals(o, shared).attendance).length,
      icon: UsersRound,
      signal: "attendance" as const,
      tone: "blue",
    },
    {
      title: "Не сданы отчёты",
      value: orders.filter((o) => !o.submittedAt).length,
      icon: ClipboardList,
      signal: "reports" as const,
      tone: "orange",
    },
    {
      title: "Ожидают приёмки",
      value: orders.filter((o) => orderSignals(o, shared).review).length,
      icon: FileClock,
      signal: "review" as const,
      tone: "blue",
    },
    {
      title: "Проверить подписи",
      value: orders.filter((o) => orderSignals(o, shared).signatures).length,
      icon: PenLine,
      signal: "signatures" as const,
      tone: "purple",
    },
  ];
  return (
    <section className="operations-home" aria-label="Карта объектов">
      <header className="operations-heading">
        <div>
          <p>Рабочее пространство координатора</p>
          <h1>Объекты строительства</h1>
        </div>
        <button className="primary" onClick={onManage}>
          <Plus size={16} /> Объект
        </button>
      </header>
      <div className="operations-kpis">
        {stats.map(({ title, value, icon: Icon, signal, tone }) => (
          <button
            className={`operation-kpi ${tone}`}
            key={signal}
            title={`${title}: ${value}`}
            aria-label={`${title}: ${value}`}
            onClick={() => onOrders(signal)}
          >
            <Icon size={21} />
            <span>
              <span className="kpi-label">{title}</span>
              <strong>{value}</strong>
            </span>
            <ChevronRight size={15} />
          </button>
        ))}
        <button
          className="operation-kpi red"
          title="Критические проблемы"
          aria-label="Критические проблемы"
          onClick={onIssue}
        >
          <ShieldAlert size={21} />
          <span>
            <span className="kpi-label">Критические проблемы</span>
            <strong>
              {issues.filter((r) => r.payload.severity === "critical").length}
            </strong>
          </span>
          <ChevronRight size={15} />
        </button>
      </div>
      <p className="operations-scope-note">
        По выбранной рабочей дате и смене. Проверить сведения можно в разделе
        «Контроль смены».
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="portfolio-layout">
        <aside className="portfolio-list">
          <header>
            <strong>
              Объекты <span>{sites.length}</span>
            </strong>
            <Building2 size={17} />
          </header>
          <label className="portfolio-search">
            <MapPin size={16} />
            <input
              aria-label="Найти объект"
              placeholder="Найти объект…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {loading && <p>Загрузка объектов…</p>}
          {sites
            .filter((s) =>
              s.payload.title.toLowerCase().includes(search.toLowerCase()),
            )
            .map((s) => (
              <button
                key={s.id}
                className={`portfolio-site ${site?.id === s.id ? "selected" : ""}`}
                title={`Открыть объект: ${s.payload.title}`}
                onClick={() => openSite(s.id)}
              >
                <span className="site-dot" />
                <span>
                  <strong>{s.payload.title}</strong>
                  <small>
                    {s.payload.location ? "Положение указано" : "Без координат"}
                  </small>
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
          {!sites.length && (
            <div className="portfolio-empty">
              <Building2 size={27} />
              <strong>Добавьте первую станцию</strong>
              <p>
                {enabled
                  ? "Создайте объект и его участки. Наряды, документы и модель можно связать с ними."
                  : "Для общего списка объектов войдите на сервер. Локальная инженерная модель доступна сейчас."}
              </p>
              <button onClick={onManage}>
                Объекты и участки <ArrowUpRight size={15} />
              </button>
            </div>
          )}
          <div className="portfolio-local-model">
            <Box size={20} />
            <strong>Инженерная модель</strong>
            <span>{modelName}</span>
            <button onClick={onModel}>
              Открыть 3D <ArrowUpRight size={15} />
            </button>
          </div>
        </aside>
        <PortfolioMap
          sites={sites}
          selected={site?.id ?? ""}
          onSelect={openSite}
        />
        <aside className="portfolio-preview">
          <div className="site-preview-cover">
            <Building2 size={38} />
            <span>{site ? "Строительный объект" : "Начало работы"}</span>
          </div>
          <h2>{site?.payload.title ?? "Вся стройка — в одном месте"}</h2>
          {site?.payload.description ? (
            <details className="site-source-details">
              <summary>Сведения об объекте и источники</summary>
              <p>{site.payload.description}</p>
            </details>
          ) : (
            <p>
              Соберите объекты, наряды и документы. Выбирайте станцию слева или
              на карте, чтобы открыть её рабочее пространство.
            </p>
          )}
          <div className="preview-counts">
            <div>
              <strong>{siteOrders.length}</strong>
              <span>нарядов</span>
            </div>
            <div>
              <strong>{siteOrders.filter((o) => o.submittedAt).length}</strong>
              <span>отчётов сдано</span>
            </div>
            <div>
              <strong>
                {site
                  ? issues.filter((r) =>
                      inNode(records, r.payload.nodeId, site.id),
                    ).length
                  : issues.length}
              </strong>
              <span>проблем</span>
            </div>
          </div>
          <h3>Ежедневная работа</h3>
          <button className="preview-link" onClick={() => onOrders("all")}>
            <ClipboardList size={18} />
            <span>
              Наряды и фактическое выполнение
              <small>План, табель, фотографии и сдача</small>
            </span>
            <ChevronRight size={16} />
          </button>
          <button className="preview-link" onClick={onModel}>
            <Box size={18} />
            <span>
              Инженерная 3D-модель
              <small>Конструкции, материалы и устройство</small>
            </span>
            <ChevronRight size={16} />
          </button>
          <div className="preview-bottom">
            <small>
              {site?.payload.location
                ? `${site.payload.location.lat}, ${site.payload.location.lng}`
                : "Координаты объекта не указаны"}
            </small>
            <button
              className="primary"
              onClick={() => (site ? openSite(site.id) : onManage())}
            >
              {site ? "Открыть объект" : "Настроить объекты"}
              <ArrowUpRight size={17} />
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
