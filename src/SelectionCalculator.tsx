import { Calculator, Download, X } from "lucide-react";
import { useStore } from "./store";
import { visibleItems, modelObjects } from "./objects";
import { calculateSelection, calculationCSV } from "./calculator";
import { download } from "./export";
import { useMemo } from "react";

const f = (n: number) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
export default function SelectionCalculator() {
  const s = useStore();
  const c = useMemo(
    () => calculateSelection(s.project, s.calculatedObjects),
    [s.project, s.calculatedObjects],
  );
  const visible = new Set(
    visibleItems(s.project, null, s.hidden, s.isolated).map(
      (item) => item.element.id,
    ),
  );
  const hiddenCount = c.objects.filter(
    (o) => !o.members.some((e) => visible.has(e.id)),
  ).length;
  return (
    <div className="selection-calculator" data-testid="selection-calculator">
      <div className="selected-heading">
        <span className="category">
          <Calculator size={15} />
          Сумма выбранных объектов
        </span>
        <h2 aria-live="polite">В расчёте: {c.objects.length}</h2>
        <p>{c.elements.length} тел и слоёв · каждый объект целиком</p>
      </div>
      <section className="property-section calculator-actions">
        <p>
          Нажимайте объекты в 3D или отмечайте их в списке. Повторное нажатие
          убирает объект из расчёта.
        </p>
        <button
          onClick={() => {
            const added = modelObjects(s.project)
              .filter((o) => o.members.some((e) => visible.has(e.id)))
              .map((o) => o.id);
            s.set({
              calculatedObjects: [
                ...new Set([...s.calculatedObjects, ...added]),
              ],
            });
          }}
        >
          Добавить видимые
        </button>
        <button
          disabled={!c.objects.length}
          onClick={() => s.set({ calculatedObjects: [] })}
        >
          Очистить выбор
        </button>
        <small>
          «Видимые» — показанные в модели, с учётом скрытия и изоляции.
          Положение камеры не меняет расчёт.
        </small>
      </section>
      {!c.objects.length ? (
        <section className="property-section calculator-empty">
          <h3>Выберите объекты для расчёта</h3>
          <p>
            Например, отметьте два фундамента — здесь появится суммарный расход
            бетона, щебня, стали и количество анкеров.
          </p>
        </section>
      ) : (
        <>
          <section
            className="property-section"
            data-testid="calculation-materials"
          >
            <h3>Итого материалов</h3>
            {c.materials.map((r) => (
              <div className="material-card" key={`${r.name}:${r.unit}`}>
                <span>{r.name}</span>
                <strong>
                  {r.unknown
                    ? r.value
                      ? `${f(r.value)} ${r.unit} + не определено`
                      : "Не определено"
                    : `${f(r.value)} ${r.unit}`}
                </strong>
                <small>
                  {r.basis}
                  {r.unknown ? ` · ${r.unknown} поз. без количества` : ""}
                </small>
              </div>
            ))}
            {c.assumptions > 0 && (
              <p className="calculation-caution">
                Принятые условия: {c.assumptions} тел. В том числе объёмы щебня
                по модели с одинаковыми откосами; расхождение с ведомостью PDF
                остаётся.
              </p>
            )}
            <p className="quantity-note">
              Сталь — по имеющимся спецификациям, анкеры — по схеме. Общие
              работы и связи PDF без привязки к объектам сюда не входят. Бетон
              без вычета арматуры; цемент без рецептуры не рассчитывается.
            </p>
            <button
              onClick={() =>
                download(
                  calculationCSV(s.project, s.calculatedObjects),
                  "buildscope-selection.csv",
                  "text/csv;charset=utf-8",
                )
              }
            >
              <Download size={15} />
              Скачать расчёт CSV
            </button>
          </section>
          <section className="property-section calculation-objects">
            <h3>Включённые объекты</h3>
            {hiddenCount > 0 && (
              <p>
                Скрыто выбранных объектов: {hiddenCount}. Они остаются в
                расчёте; для исключения снимите отметку.
              </p>
            )}
            {c.objects.map((o) => (
              <div className="calculation-object" key={o.id}>
                <span>
                  {o.root.name}
                  <small>{o.members.length} тел и слоёв</small>
                </span>
                <button
                  aria-label={`Убрать из расчёта ${o.root.name}`}
                  onClick={() =>
                    s.set({
                      calculatedObjects: s.calculatedObjects.filter(
                        (id) => id !== o.id,
                      ),
                    })
                  }
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </section>
        </>
      )}
      <section className="property-section">
        <button onClick={() => s.set({ calculatorOpen: false })}>
          Закрыть калькулятор
        </button>
        <p className="quantity-note">
          Выбор хранится до смены проекта. Разборка, смещения и скрытие не
          меняют количества выбранных объектов.
        </p>
      </section>
    </div>
  );
}
