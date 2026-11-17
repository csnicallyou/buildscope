import { useState } from "react";
import {
  nodePath,
  type ConstructionRecord,
  type OfKind,
  ofKind,
} from "./construction";
export default function ConstructionTree({
  records,
  scope,
  query,
  onOpen,
  onEdit,
  onModel,
  admin,
}: {
  records: ConstructionRecord[];
  scope: string;
  query: string;
  onOpen: (id: string) => void;
  onEdit: (r: OfKind<"node">) => void;
  onModel: (model: string, ids: string[]) => void;
  admin: boolean;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const nodes = ofKind(records, "node");
  const matches = (n: OfKind<"node">, seen = new Set<string>()): boolean => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return (
      !query ||
      n.payload.title
        .toLocaleLowerCase("ru")
        .includes(query.toLocaleLowerCase("ru")) ||
      nodes.some((c) => c.payload.parentId === n.id && matches(c, seen))
    );
  };
  const render = (n: OfKind<"node">, depth: number): React.ReactNode => {
    const children = nodes.filter(
      (c) => c.payload.parentId === n.id && matches(c),
    );
    return (
      <div key={n.id} className="construction-tree-node">
        <article className="cm-object-row">
          <button
            className="tree-expand"
            aria-label={`${collapsed[n.id] ? "Развернуть" : "Свернуть"} ${n.payload.title}`}
            disabled={!children.length}
            onClick={() => setCollapsed((v) => ({ ...v, [n.id]: !v[n.id] }))}
          >
            {children.length ? (collapsed[n.id] ? "▸" : "▾") : "·"}
          </button>
          <div>
            <h3>
              <button onClick={() => onOpen(n.id)}>{n.payload.title}</button>
            </h3>
            <small>{nodePath(records, n.id)}</small>
          </div>
          <div className="cm-row-actions">
            <button onClick={() => onOpen(n.id)}>Открыть участок</button>
            {n.payload.model && (
              <button
                onClick={() => onModel(n.payload.model, n.payload.elementIds)}
              >
                Показать в модели
              </button>
            )}
            <button onClick={() => onEdit(n)}>
              {admin ? "Изменить объект" : "Свойства"}
            </button>
          </div>
        </article>
        {(!collapsed[n.id] || !!query) && children.length > 0 && depth < 10 && (
          <div className="construction-tree-children">
            {children.map((c) => render(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };
  const roots = scope
    ? nodes.filter((n) => n.id === scope)
    : nodes.filter((n) => !n.payload.parentId);
  return (
    <div className="construction-tree">
      {roots.filter((n) => matches(n)).map((n) => render(n, 0))}
      {!roots.some((n) => matches(n)) && (
        <p>Объекты по этому запросу не найдены.</p>
      )}
    </div>
  );
}
