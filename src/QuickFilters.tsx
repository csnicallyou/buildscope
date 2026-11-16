import { useState } from "react";
import type { Project } from "./model";
import { useStore } from "./store";
import { emptyFilters, barKindLabels, allBarKinds } from "./viewRules";
export default function QuickFilters({
  project,
  onCompare,
  canCompare,
}: {
  project: Project;
  onCompare: () => void;
  canCompare: boolean;
}) {
  const s = useStore(),
    [open, setOpen] = useState(false);
  const active = !!(
    s.filters.category ||
    s.filters.material ||
    s.filters.unverified
  );
  const update = (patch: Partial<typeof s.filters>) =>
    s.set({
      filters: { ...s.filters, ...patch },
      auditIds: null,
      cameraRevision: s.cameraRevision + 1,
    });
  return (
    <div className="quick-filters">
      <div className="quick-filter-bar">
        <button
          aria-expanded={open}
          className={active ? "active" : ""}
          onClick={() => setOpen(!open)}
        >
          Фильтры{active ? " · включены" : ""}
        </button>
        <label>
          <input
            type="checkbox"
            checked={s.dimensions}
            onChange={(e) => s.set({ dimensions: e.target.checked })}
          />
          Размеры
        </label>
        {project.document && (
          <button disabled={!canCompare} onClick={onCompare}>
            Чертёж рядом
          </button>
        )}
      </div>
      {open && (
        <div className="filter-fields">
          <label>
            Тип{" "}
            <select
              aria-label="Фильтр по типу"
              value={s.filters.category}
              onChange={(e) => update({ category: e.target.value })}
            >
              <option value="">Все типы</option>
              {[...new Set(project.elements.map((e) => e.category))].map(
                (c) => (
                  <option key={c}>{c}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Материал{" "}
            <select
              aria-label="Фильтр по материалу"
              value={s.filters.material}
              onChange={(e) => update({ material: e.target.value })}
            >
              <option value="">Все материалы</option>
              {[...new Set(project.elements.map((e) => e.material))].map(
                (m) => (
                  <option key={m}>{m}</option>
                ),
              )}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={s.filters.unverified}
              onChange={(e) => update({ unverified: e.target.checked })}
            />
            Только неуточнённое
          </label>
          <button
            onClick={() =>
              s.set({
                filters: emptyFilters,
                auditIds: null,
                cameraRevision: s.cameraRevision + 1,
              })
            }
          >
            Сбросить фильтры
          </button>
          <small>
            Фильтры показывают тела, а выбор и калькулятор учитывают сборку
            целиком. Неуточнённое включает допущения и незаданный класс
            материала.
          </small>
        </div>
      )}
      {(s.rebar || s.openedObject) && (
        <fieldset className="rebar-kinds">
          <legend>Арматура · схема</legend>
          <label>
            <input
              type="checkbox"
              checked={s.hideConcrete}
              onChange={(e) =>
                s.set({
                  hideConcrete: e.target.checked,
                  rebar: true,
                  cameraRevision: s.cameraRevision + 1,
                })
              }
            />
            Скрыть бетон
          </label>
          {allBarKinds.map((kind) => (
            <label key={kind}>
              <input
                type="checkbox"
                checked={s.rebarKinds.includes(kind)}
                onChange={() =>
                  s.set({
                    rebar: true,
                    rebarKinds: s.rebarKinds.includes(kind)
                      ? s.rebarKinds.filter((k) => k !== kind)
                      : [...s.rebarKinds, kind],
                    cameraRevision: s.cameraRevision + 1,
                  })
                }
              />
              {barKindLabels[kind]}
            </label>
          ))}
          <button
            onClick={() =>
              s.set({
                rebar: true,
                rebarKinds: allBarKinds,
                hideConcrete: false,
                opacity: 0.2,
                cameraRevision: s.cameraRevision + 1,
              })
            }
          >
            Вся схема
          </button>
        </fieldset>
      )}
    </div>
  );
}
