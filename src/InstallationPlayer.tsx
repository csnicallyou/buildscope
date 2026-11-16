import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, RotateCcw, SkipBack, SkipForward, X } from "lucide-react";
import type { Element } from "./model";
import type { SceneItem } from "./objects";
import { workFrame, stepStart, type InstallationPlan } from "./installation";
import InstallationScene from "./InstallationScene";
import { dimensionData } from "./dimensionData";
import QuantityBadges from "./QuantityBadges";
import { elementQuantityStatus } from "./quality";
const f = (n: number) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
export default function InstallationPlayer({
  item,
  members,
  plan,
  onClose,
  schemeLevels,
}: {
  item: SceneItem;
  members: Element[];
  plan: InstallationPlan;
  onClose: () => void;
  schemeLevels: boolean;
}) {
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
      aria-label="Устройство выбранной части"
      data-testid="installation-player"
      data-phase={frame.step.phase}
      data-playing={playing}
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
        <p
          className="installation-explanation"
          data-testid="installation-explanation"
        >
          {frame.step.description}
        </p>
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
