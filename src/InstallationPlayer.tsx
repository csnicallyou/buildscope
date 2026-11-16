import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, RotateCcw, SkipBack, SkipForward, X } from "lucide-react";
import type { Element } from "./model";
import type { SceneItem } from "./objects";
import { workFrame, stepStart, type InstallationPlan } from "./installation";
import {
  constructionSources,
  defaultInstallationOptions,
  toolNames,
} from "./constructionKnowledge";
import { installationPlan } from "./installation";
import InstallationScene from "./InstallationScene";
import { dimensionData } from "./dimensionData";
import QuantityBadges from "./QuantityBadges";
import { elementQuantityStatus } from "./quality";
const f = (n: number) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
export default function InstallationPlayer({
  item,
  members,
  plan: initialPlan,
  onClose,
  schemeLevels,
}: {
  item: SceneItem;
  members: Element[];
  plan: InstallationPlan;
  onClose: () => void;
  schemeLevels: boolean;
}) {
  const [options, setOptions] = useState(() =>
    defaultInstallationOptions(/подготовка|подбет/i.test(item.element.name)),
  );
  const plan = useMemo(
    () => installationPlan(item, options) ?? initialPlan,
    [item, options, initialPlan],
  );
  const changeOptions = (patch: Partial<typeof options>) => {
    setOptions((o) => ({ ...o, ...patch }));
    setTime(0);
    setPlaying(false);
  };
  const [time, setTime] = useState(0),
    [playing, setPlaying] = useState(
      () => !matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
    [speed, setSpeed] = useState(1),
    [dimensions, setDimensions] = useState(true);
  const profileDimensions = useMemo(
    () => [...new Set(dimensionData(item).cutouts.map((s) => s.label))],
    [item],
  );
  const close = useRef<HTMLButtonElement>(null),
    frame = workFrame(plan, time);
  useEffect(() => {
    close.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, []);
  useEffect(() => {
    if (time >= plan.duration) setPlaying(false);
  }, [time, plan.duration]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0,
      last = performance.now(),
      lastPaint = last;
    const tick = (now: number) => {
      const delta = Math.min(0.1, (now - last) / 1000) * speed;
      last = now;
      setTime((t) => Math.min(plan.duration, t + delta));
      lastPaint = now;
      raf = requestAnimationFrame(next);
    };
    const next = (now: number) => {
      if (now - lastPaint >= 30) tick(now);
      else raf = requestAnimationFrame(next);
    };
    raf = requestAnimationFrame(next);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, plan.duration]);
  const jump = (index: number) => {
    setPlaying(false);
    setTime(stepStart(plan, index));
  };
  return (
    <section
      className="installation-player"
      role="dialog"
      aria-modal="true"
      aria-label="Устройство выбранной части"
      data-testid="installation-player"
      data-phase={frame.step.phase}
      data-playing={playing}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const controls = [
          ...e.currentTarget.querySelectorAll<HTMLElement>(
            "button:not(:disabled), select, input, summary, a[href]",
          ),
        ].filter((n) => n.getClientRects().length > 0);
        const first = controls[0],
          last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }}
    >
      <header className="installation-heading">
        <div>
          <span>Устройство части</span>
          <strong>
            {item.kind === "steel" ? item.label : item.element.name}
          </strong>
        </div>
        <button ref={close} aria-label="Завершить анимацию" onClick={onClose}>
          <X size={17} />
          <span>Закрыть</span>
        </button>
      </header>
      <div className="installation-stage">
        <InstallationScene
          item={item}
          members={members}
          plan={plan}
          time={time}
          dimensions={dimensions}
        />
        <span className="installation-scene-note">{plan.note}</span>
      </div>
      <div className="installation-controls">
        <div className="installation-step">
          <span>
            {frame.index + 1} / {plan.steps.length}
          </span>
          <label>
            <span className="sr-only">Этап устройства</span>
            <select
              aria-label="Этап устройства"
              value={frame.index}
              onChange={(e) => jump(+e.target.value)}
            >
              {plan.steps.map((s, i) => (
                <option key={s.phase} value={i}>
                  {i + 1}. {s.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <details className="installation-description">
          <summary>Пояснение этапа и инструменты</summary>
          <p
            className="installation-explanation"
            data-testid="installation-explanation"
          >
            {frame.step.description}
          </p>
          <p className="installation-tool-list">
            Инструменты:{" "}
            {(frame.step.phase === "tie" && /анкер/i.test(item.label)
              ? ["Монтажный шаблон (схема)", "Ключ"]
              : (toolNames[frame.step.phase] ?? [])
            ).join(", ")}
          </p>
        </details>
        <div className="installation-transport">
          <button
            aria-label="Предыдущий этап"
            disabled={frame.index === 0}
            onClick={() => jump(frame.index - 1)}
          >
            <SkipBack size={17} />
          </button>
          <button
            className="installation-play"
            aria-label={playing ? "Пауза анимации" : "Продолжить анимацию"}
            onClick={() => {
              if (time >= plan.duration) setTime(0);
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause size={17} /> : <Play size={17} />}
            <span>{playing ? "Пауза" : frame.ended ? "Сначала" : "Пуск"}</span>
          </button>
          <button
            aria-label="Следующий этап"
            disabled={frame.index === plan.steps.length - 1}
            onClick={() => jump(frame.index + 1)}
          >
            <SkipForward size={17} />
          </button>
          <button
            aria-label="Повторить анимацию"
            onClick={() => {
              setTime(0);
              setPlaying(true);
            }}
          >
            <RotateCcw size={16} />
          </button>
          <label className="installation-speed">
            Темп{" "}
            <select
              aria-label="Скорость анимации"
              value={speed}
              onChange={(e) => setSpeed(+e.target.value)}
            >
              <option value={0.5}>0,5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
            </select>
          </label>
          <label className="installation-dimensions">
            <input
              type="checkbox"
              checked={dimensions}
              onChange={(e) => setDimensions(e.target.checked)}
            />
            Размеры этапа
          </label>
        </div>
        <input
          className="installation-timeline"
          aria-label="Ход устройства"
          type="range"
          min={0}
          max={plan.duration}
          step={0.05}
          value={time}
          onChange={(e) => {
            setPlaying(false);
            setTime(+e.target.value);
          }}
        />
        {plan.kind === "concrete" && (
          <details className="installation-method">
            <summary>Варианты технологии и источники</summary>
            <label>
              <input
                type="checkbox"
                aria-label="Разделительная плёнка под бетоном"
                checked={options.baseFilm}
                onChange={(e) => changeOptions({ baseFilm: e.target.checked })}
              />
              Нижняя плёнка — вариант по проекту/ППР
            </label>
            <label>
              <input
                type="checkbox"
                aria-label="Укрытие бетона плёнкой"
                checked={options.curingCover}
                onChange={(e) =>
                  changeOptions({ curingCover: e.target.checked })
                }
              />
              Верхнее укрытие для ухода — пример
            </label>
            <label>
              Уплотнение
              <select
                aria-label="Способ уплотнения бетона"
                value={options.vibration}
                onChange={(e) =>
                  changeOptions({
                    vibration: e.target.value as "surface" | "internal",
                  })
                }
              >
                <option value="surface">Виброрейка — пример</option>
                <option value="internal">Глубинный вибратор — пример</option>
              </select>
            </label>
            <p>
              Это технологические варианты, не добавленные проектные слои.
              Толщина плёнки, нахлёсты, крепёж и режимы не назначаются. Нижняя
              плёнка, гидроизоляция и верхнее укрытие выполняют разные задачи.
            </p>
            {constructionSources.map((s) => (
              <p key={s.id}>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.title}
                </a>
                <small>{s.scope}</small>
              </p>
            ))}
          </details>
        )}
        {plan.kind === "bulk" && (
          <p className="installation-tool-source">
            <a
              href={constructionSources[2].url}
              target="_blank"
              rel="noreferrer"
            >
              Оборудование уплотнения: Wacker Neuson
            </a>
          </p>
        )}
        <div className="installation-metrics">
          <span>{plan.quantity}</span>
          <QuantityBadges
            statuses={[
              item.kind === "steel"
                ? "scheme"
                : elementQuantityStatus(item.element),
            ]}
          />
          <span data-testid="installation-size">
            {plan.size
              .map((v, a) => `${["X", "Y", "Z"][a]} ${f(v)} м`)
              .join(" · ")}
          </span>
          {profileDimensions.length > 0 && (
            <span>{profileDimensions.join(" · ")}</span>
          )}
          <span>
            {schemeLevels ? "Отметки схемы" : "Отметки"}:{" "}
            {f(item.element.position[1] + plan.bounds.min[1])} /{" "}
            {f(item.element.position[1] + plan.bounds.max[1])} м
          </span>
        </div>
      </div>
    </section>
  );
}
