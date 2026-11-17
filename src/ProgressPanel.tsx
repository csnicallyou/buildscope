import type { SharedOrder } from "./workspaceTypes";
import { progressGroups } from "./workProgress";
const f = (v: number | null) =>
  v === null
    ? "Не определён"
    : v.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
export default function ProgressPanel({ orders }: { orders: SharedOrder[] }) {
  const groups = progressGroups(orders);
  return (
    <section className="schedule">
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
                  <td>{g.target}</td>
                  <td>{g.work}</td>
                  <td>{g.unit}</td>
                  <td>{f(g.need)}</td>
                  <td>
                    {g.conflict
                      ? "Разные основания"
                      : g.hasActuals
                        ? `${f(g.actual)}${g.actualIncomplete ? " + не заполнено" : ""}`
                        : g.actualIncomplete
                          ? "Не заполнен"
                          : "Нет сданного факта"}
                  </td>
                  <td>
                    {g.conflict
                      ? "Разные основания"
                      : g.hasVerified
                        ? `${f(g.verified)}${g.verifiedIncomplete ? " + не проверено" : ""}`
                        : "Не проверено"}
                  </td>
                  <td>{f(g.verifiedRemaining)}</td>
                  <td>{f(g.remaining)}</td>
                  <td>{f(g.reserved)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
