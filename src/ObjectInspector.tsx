import { Box, ExternalLink, Layers3 } from "lucide-react";
import { elementQuantities, type Element } from "./model";
import {
  materialAmounts,
  objectItems,
  steelSchemeAmount,
  type ModelObject,
  type SceneItem,
} from "./objects";
const f = (n: number) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: 3 });

export function Materials({
  elements,
  partsOnly = false,
}: {
  elements: Element[];
  partsOnly?: boolean;
}) {
  return (
    <section
      className="property-section material-amounts"
      data-testid="material-amounts"
    >
      <h3>Материалы и количества</h3>
      {materialAmounts(elements, !partsOnly).map((r) => (
        <div className="material-card" key={`${r.name}:${r.unit}:${r.basis}`}>
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
            {r.unknown > 0 ? ` · ${r.unknown} без расчётного количества` : ""}
          </small>
        </div>
      ))}
      {elements.some((e) => e.material.startsWith("Бетон")) && (
        <p className="quantity-note">
          Бетон — готовая смесь. Расход цемента отдельно не задан. Объём бетона
          считается без вычета арматуры.
        </p>
      )}
    </section>
  );
}

export function ObjectInspector({
  object,
  onOpen,
  onHide,
  onIsolate,
  onSource,
  hidden,
  isolated,
}: {
  object: ModelObject;
  onOpen: () => void;
  onHide: () => void;
  onIsolate: () => void;
  onSource: () => void;
  hidden: boolean;
  isolated: boolean;
}) {
  const e = object.root;
  const knownVolumes = materialAmounts(object.members, false).filter(
    (r) => r.unit === "м³" && !r.unknown,
  );
  const excluded = ["envelope", "diagram"].includes(
    e.evidence?.representation ?? "",
  );
  return (
    <>
      <div className="selected-heading">
        <span className="category">Объект целиком · {e.category}</span>
        <h2>{e.mark}</h2>
        <p>{e.name}</p>
      </div>
      <div className="selection-actions">
        <button className="open-object" onClick={onOpen}>
          <ExternalLink size={17} />
          Открыть отдельно
        </button>
      </div>
      <div className="selection-actions">
        <button onClick={onHide}>
          {hidden ? "Показать объект" : "Скрыть объект"}
        </button>
        <button className={isolated ? "active" : ""} onClick={onIsolate}>
          Изолировать
        </button>
      </div>
      <section className="property-section">
        <h3>
          <Box size={15} />
          Состав объекта
        </h3>
        <dl>
          <dt>Основное тело</dt>
          <dd data-testid="element-volume">
            {excluded ? "Не определён" : `${f(elementQuantities(e).volume)} м³`}
          </dd>
          {e.evidence?.reportedVolume !== undefined && (
            <>
              <dt>Тело в спецификации</dt>
              <dd>{f(e.evidence.reportedVolume)} м³</dd>
            </>
          )}
          <dt>Тел и слоёв</dt>
          <dd>{object.members.length}</dd>
          <dt>Объём определённых тел</dt>
          <dd>
            {knownVolumes.length
              ? `${f(knownVolumes.reduce((sum, r) => sum + r.value, 0))} м³`
              : "Не определён"}
          </dd>
          <dt>Частей в отдельном виде</dt>
          <dd>{objectItems(object).length}</dd>
        </dl>
        <p>
          Нажатие выбирает весь объект. Откройте его отдельно, чтобы разобрать и
          исследовать части.
        </p>
      </section>
      <Materials elements={object.members} />
      <section className="property-section">
        <h3>
          <Layers3 size={15} />
          Входит в объект
        </h3>
        {object.members.map((m) => (
          <p key={m.id}>
            {m.name} · {m.material}
          </p>
        ))}
        <button onClick={onSource}>Источник и замечания</button>
      </section>
    </>
  );
}

export function SteelInspector({ item }: { item: SceneItem }) {
  const q = steelSchemeAmount(item.bars ?? []);
  const anchors = item.label.startsWith("Анкер");
  const position = item.label.startsWith("Основная")
    ? "1"
    : item.label.split("·")[0].trim();
  const grades = [
    ...new Set(
      item.element.evidence?.reinforcement
        ?.filter((r) => r.position === position)
        .map((r) => r.grade),
    ),
  ];
  return (
    <>
      <div className="selected-heading">
        <span className="category">Часть объекта · схема</span>
        <h2>{item.label}</h2>
        <p>{item.element.name}</p>
      </div>
      <section className="property-section">
        <h3>Материал и количество части</h3>
        <dl>
          <dt>Материал</dt>
          <dd>
            {anchors
              ? "Сталь · анкеры M24"
              : grades.length
                ? `Сталь ${grades.join(" / ")}`
                : "Арматурная сталь · класс не задан"}
          </dd>
          <dt>Показано стержней</dt>
          <dd>{q.count} шт.</dd>
          <dt>Длина в схеме</dt>
          <dd>{f(q.length)} м</dd>
          <dt>Объём в схеме</dt>
          <dd>
            {q.volume.toLocaleString("ru-RU", { maximumFractionDigits: 6 })} м³
          </dd>
          <dt>Диаметры</dt>
          <dd>
            {[...new Set(item.bars?.map((b) => b.diameter * 1000))].join(" / ")}{" "}
            мм
          </dd>
        </dl>
        <p>
          Количество относится к показанной схеме. Оно не заменяет полную
          спецификацию изготовительной арматуры.
        </p>
      </section>
      {!anchors && (
        <section className="property-section">
          <h3>Спецификация на весь {item.element.mark}</h3>
          {item.element.evidence?.reinforcement?.map((r, i) => (
            <div className="material-card" key={i}>
              <span>
                {r.position} · Сталь {r.grade} · Ø{r.diameter}
              </span>
              <strong>
                {r.totalMass === null
                  ? "Масса не задана"
                  : `${f(r.totalMass)} кг`}
              </strong>
              <small>
                {r.count === null ? "Количество — по длине" : `${r.count} шт.`}{" "}
                · PDF {r.page}
              </small>
            </div>
          ))}
          <p>
            Эти массы относятся ко всему исходному элементу, а не только к
            выбранной сетке.
          </p>
        </section>
      )}
    </>
  );
}
