import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export default function PdfCanvas({
  url,
  page,
}: {
  url: string;
  page: number;
}) {
  const holder = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null),
    [width, setWidth] = useState(400),
    [zoom, setZoom] = useState(1),
    [state, setState] = useState("Загрузка PDF…");
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (holder.current)
        setWidth(Math.max(120, holder.current.clientWidth - 20));
    });
    if (holder.current) observer.observe(holder.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    let task:
      ReturnType<(typeof import("pdfjs-dist"))["getDocument"]> | undefined;
    setDoc(null);
    setState("Загрузка PDF…");
    void import("pdfjs-dist")
      .then((pdfjs) => {
        if (!active) return;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        task = pdfjs.getDocument({
          url,
          useSystemFonts: true,
        });
        return task.promise;
      })
      .then((loaded) => {
        if (active && loaded) {
          setDoc(loaded);
          setState("PDF открыт");
        }
      })
      .catch(() => {
        if (active)
          setState("Не удалось прочитать PDF. Выберите исходный файл ещё раз.");
      });
    return () => {
      active = false;
      void task?.destroy();
    };
  }, [url]);
  useEffect(() => {
    if (!doc) return;
    let active = true,
      render: RenderTask | undefined;
    if (page > doc.numPages) {
      setState(
        `В файле ${doc.numPages} страниц, запрошена ${page}. Проверьте исходный файл.`,
      );
      return;
    }
    setState("Отрисовка листа…");
    void doc
      .getPage(page)
      .then(async (p) => {
        if (!active || !canvas.current) return;
        const viewport = p.getViewport({ scale: 1 }),
          scale = (width / viewport.width) * zoom,
          scaled = p.getViewport({ scale }),
          dpr = Math.min(2, window.devicePixelRatio || 1),
          c = canvas.current;
        c.width = Math.ceil(scaled.width * dpr);
        c.height = Math.ceil(scaled.height * dpr);
        c.style.width = `${scaled.width}px`;
        c.style.height = `${scaled.height}px`;
        render = p.render({
          canvas: c,
          canvasContext: c.getContext("2d")!,
          viewport: scaled,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        await render.promise;
        if (active) setState(`Страница ${page} из ${doc.numPages}`);
      })
      .catch((e: unknown) => {
        if (
          active &&
          !(e instanceof Error && e.name === "RenderingCancelledException")
        )
          setState("Не удалось отрисовать страницу. Повторите выбор листа.");
      });
    return () => {
      active = false;
      render?.cancel();
    };
  }, [doc, page, width, zoom]);
  return (
    <div className="pdf-canvas-view">
      <div className="pdf-zoom">
        <button
          aria-label="Уменьшить чертёж"
          disabled={zoom <= 0.75}
          onClick={() => setZoom(Math.max(0.75, zoom - 0.25))}
        >
          −
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          aria-label="Увеличить чертёж"
          disabled={zoom >= 3}
          onClick={() => setZoom(Math.min(3, zoom + 0.25))}
        >
          +
        </button>
        <span role="status" data-testid="pdf-page-status">
          {state}
        </span>
      </div>
      <div className="pdf-canvas-scroll" ref={holder}>
        <canvas ref={canvas} aria-label={`Чертёж PDF, страница ${page}`} />
      </div>
    </div>
  );
}
