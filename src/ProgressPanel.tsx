import type { SharedOrder } from "./workspaceTypes";
import { progressGroups } from "./workProgress";
const f = (v: number | null) =>
  v === null
    ? "Не определён"
    : v.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
export default function ProgressPanel({ orders }: { orders: SharedOrder[] }) {
  const groups = progressGroups(orders);
  return (
    <section className="schedule progress-panel">
      <h1>Ход работ</h1>
      <p>
        Остаток рассчитан по сданным нарядам и потребности модели. Неизвестный
        факт не заменяется нулём. Разные единицы и основания не складываются.
      </p>
      {!groups.length ? (
        <p>Выдайте первый наряд по выбранным объектам модели.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Объект</th>
                <th>Работа</th>
                <th>Единица</th>
                <th>Нужно по модели</th>
                <th>Заявлено в сданных нарядах</th>
                <th>Проверено</th>
                <th>Проверенный остаток</th>
                <th>Остаток по заявленному</th>
                <th>План в работе</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.key}>
                  <td data-label="Объект">{g.target}</td>
                  <td data-label="Работа">{g.work}</td>
                  <td data-label="Единица">{g.unit}</td>
                  <td data-label="Нужно по модели">{f(g.need)}</td>
                  <td data-label="Заявлено">
                    {g.conflict
                      ? "Разные основания"
                      : g.hasActuals
                        ? `${f(g.actual)}${g.actualIncomplete ? " + не заполнено" : ""}`
                        : g.actualIncomplete
                          ? "Не заполнен"
                          : "Нет сданного факта"}
                  </td>
                  <td data-label="Проверено">
                    {g.conflict
                      ? "Разные основания"
                      : g.hasVerified
                        ? `${f(g.verified)}${g.verifiedIncomplete ? " + не проверено" : ""}`
                        : "Не проверено"}
                  </td>
                  <td data-label="Проверенный остаток">
                    {f(g.verifiedRemaining)}
                  </td>
                  <td data-label="Остаток по заявленному">{f(g.remaining)}</td>
                  <td data-label="План в работе">{f(g.reserved)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
