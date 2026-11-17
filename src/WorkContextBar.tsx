import { CalendarDays, Moon, Sun } from "lucide-react";
import type { OfKind } from "./construction";
export default function WorkContextBar({
  sites,
  siteId,
  date,
  shift,
  onSite,
  onDate,
  onShift,
}: {
  sites: OfKind<"node">[];
  siteId: string;
  date: string;
  shift: "День" | "Ночь";
  onSite: (id: string) => void;
  onDate: (date: string) => void;
  onShift: (shift: "День" | "Ночь") => void;
}) {
  const end = new Date(date + "T12:00:00Z");
  end.setUTCDate(end.getUTCDate() + 1);
  return (
    <section className="work-context-bar" aria-label="Рабочий контекст">
      <label className="context-site">
        <span>Объект строительства</span>
        <select
          aria-label="Текущая станция"
          value={siteId}
          onChange={(e) => onSite(e.target.value)}
        >
          <option value="">Все объекты</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.payload.title}
            </option>
          ))}
        </select>
      </label>
      <label className="context-date">
        <CalendarDays size={18} />
        <span className="sr-only">Рабочая дата</span>
        <input
          aria-label="Рабочая дата"
          type="date"
          value={date}
          onChange={(e) => {
            if (e.target.value) onDate(e.target.value);
          }}
        />
      </label>
      <div className="context-shift" aria-label="Рабочая смена">
        {(["День", "Ночь"] as const).map((x) => (
          <button key={x} aria-pressed={shift === x} onClick={() => onShift(x)}>
            {x === "День" ? <Sun size={16} /> : <Moon size={16} />}
            <span>{x}</span>
          </button>
        ))}
      </div>
      {shift === "Ночь" && Number.isFinite(+end) && (
        <small className="context-night">
          {date.slice(8)} →{" "}
          {end.toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "short",
            timeZone: "Europe/Moscow",
          })}
        </small>
      )}
    </section>
  );
}
