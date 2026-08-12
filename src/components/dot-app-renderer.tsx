"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";

import type {
  DotAppAction,
  DotAppDocument,
  DotAppField,
  DotAppNode,
  DotAppTableColumn,
  DotAppValue,
  JsonPrimitive,
  JsonValue,
} from "@/lib/generated-app-v2";
import {
  cx,
  dotAppStyles as styles,
  KitBadge,
  KitButton,
  KitCallout,
  KitCard,
  KitProgress,
} from "@/components/dot-app-kit";

type RuntimeActionHandler = (action: DotAppAction, payload?: Record<string, JsonValue>) => Promise<void>;

type RenderContext = {
  document: DotAppDocument;
  onAction: RuntimeActionHandler;
  busyOperation: string | null;
};

function isObject(value: unknown): value is Record<string, JsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readPath(source: unknown, path: string | undefined): unknown {
  if (!path) return undefined;
  const cleanPath = path.replace(/^\$\.?/, "");
  return cleanPath.split(".").filter(Boolean).reduce<unknown>((current, part) => {
    if (Array.isArray(current) && /^\d+$/.test(part)) return current[Number(part)];
    return isObject(current) ? current[part] : undefined;
  }, source);
}

function resolveValue(value: DotAppValue | undefined, data: Record<string, JsonValue> = {}): JsonPrimitive {
  if (value === undefined) return "";
  if (isObject(value) && typeof value.bind === "string") {
    const resolved = readPath(data, value.bind);
    return typeof resolved === "string" || typeof resolved === "number" || typeof resolved === "boolean" || resolved === null
      ? resolved
      : (value.fallback ?? "");
  }
  return value as JsonPrimitive;
}

function textValue(value: DotAppValue | undefined, data?: Record<string, JsonValue>) {
  const resolved = resolveValue(value, data);
  if (resolved === null) return "";
  if (typeof resolved === "boolean") return resolved ? "yes" : "no";
  return String(resolved);
}

function numericValue(value: DotAppValue | undefined, data?: Record<string, JsonValue>) {
  const resolved = resolveValue(value, data);
  const numeric = Number(resolved);
  return Number.isFinite(numeric) ? numeric : 0;
}

function records(node: DotAppNode, data: Record<string, JsonValue>): Array<Record<string, JsonValue>> {
  const source = readPath(data, node.source);
  if (Array.isArray(source)) return source.filter(isObject);
  return Array.isArray(node.items) ? node.items : [];
}

function rowValue(row: Record<string, JsonValue>, path: string | undefined) {
  if (!path) return "";
  const value = readPath(row, path);
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  return "";
}

function formatValue(
  value: JsonPrimitive,
  format: DotAppNode["format"] | DotAppTableColumn["format"] = "text",
  currency = "USD",
) {
  if (value === null || value === "") return "—";
  if (format === "currency") {
    const numeric = Number(value);
    return Number.isFinite(numeric)
      ? new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(numeric)
      : String(value);
  }
  if (format === "percent") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `${Math.round(numeric)}%` : String(value);
  }
  if (format === "number") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? new Intl.NumberFormat().format(numeric) : String(value);
  }
  if (format === "date") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime())
      ? String(value)
      : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
  }
  return String(value);
}

function children(node: DotAppNode, context: RenderContext) {
  return node.children?.map((child) => <Node key={child.id} node={child} context={context} />);
}

function Sparkline({ points = [] }: { points?: number[] }) {
  const safe = points.filter(Number.isFinite);
  if (safe.length < 2) return <div className={styles.unsupported}>not enough data yet</div>;
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const range = max - min || 1;
  const coords = safe.map((point, index) => ({
    x: (index / (safe.length - 1)) * 100,
    y: 48 - ((point - min) / range) * 42,
  }));
  const line = coords.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  const area = `${line} L100,54 L0,54 Z`;
  return (
    <svg viewBox="0 0 100 54" preserveAspectRatio="none" className={styles.sparkline} aria-label="Trend">
      <path d={area} className={styles.sparklineArea} />
      <path d={line} className={styles.sparklineLine} />
    </svg>
  );
}

function ListNode({ node, context }: { node: DotAppNode; context: RenderContext }) {
  const items = records(node, context.document.data ?? {});
  if (!items.length) return <EmptyNode node={node} />;
  return (
    <div className={styles.list}>
      {items.map((item, index) => (
        <div className={styles.listItem} key={String(item.id ?? index)}>
          <div>
            <div className={styles.listTitle}>{rowValue(item, node.item_title || "title")}</div>
            {(node.item_detail || item.description) && (
              <div className={styles.listDetail}>{rowValue(item, node.item_detail || "description")}</div>
            )}
          </div>
          {(node.item_meta || item.status) && (
            <div className={styles.listMeta}>{rowValue(item, node.item_meta || "status")}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function TableNode({ node, context }: { node: DotAppNode; context: RenderContext }) {
  const items = records(node, context.document.data ?? {});
  const columns = node.table_columns ?? [];
  if (!items.length) return <EmptyNode node={node} />;
  if (!columns.length) return <div className={styles.unsupported}>this table has no columns</div>;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>{columns.map((column) => <th key={column.key} className={column.align === "center" ? styles.alignCenter : column.align === "end" ? styles.alignEnd : undefined}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={String(item.id ?? index)}>
              {columns.map((column) => {
                const raw = readPath(item, column.key);
                const primitive = typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean" || raw === null ? raw : "";
                return <td key={column.key} className={column.align === "center" ? styles.alignCenter : column.align === "end" ? styles.alignEnd : undefined}>{column.format === "status" ? <KitBadge tone="neutral">{String(primitive || "—")}</KitBadge> : formatValue(primitive, column.format)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TimelineNode({ node, context }: { node: DotAppNode; context: RenderContext }) {
  const items = records(node, context.document.data ?? {});
  if (!items.length) return <EmptyNode node={node} />;
  return (
    <div className={styles.timeline}>
      {items.map((item, index) => (
        <div className={styles.timelineItem} key={String(item.id ?? index)}>
          <div className={styles.timelineRail}><div className={styles.timelineDot} /></div>
          <div>
            <div className={styles.listTitle}>{rowValue(item, node.item_title || "title")}</div>
            <div className={styles.listDetail}>{rowValue(item, node.item_detail || "description")}</div>
          </div>
          <div className={styles.listMeta}>{rowValue(item, node.item_meta || "time")}</div>
        </div>
      ))}
    </div>
  );
}

function KanbanNode({ node, context }: { node: DotAppNode; context: RenderContext }) {
  const items = records(node, context.document.data ?? {});
  const lanes = node.lanes ?? [];
  return (
    <div className={styles.kanban}>
      {lanes.map((lane) => {
        const laneItems = items.filter((item) => String(item.lane ?? item.status ?? "") === lane.key);
        return (
          <div className={styles.lane} key={lane.key}>
            <div className={styles.laneHeader}><KitBadge tone={lane.tone}>{lane.label}</KitBadge><span className={styles.laneCount}>{laneItems.length}</span></div>
            <div className={styles.laneCards}>
              {laneItems.map((item, index) => (
                <div className={styles.laneCard} key={String(item.id ?? index)}>
                  <div className={styles.listTitle}>{rowValue(item, node.item_title || "title")}</div>
                  <div className={styles.listDetail}>{rowValue(item, node.item_detail || "description")}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function fieldDefault(field: DotAppField): JsonPrimitive {
  if (field.default_value !== undefined) return field.default_value;
  return field.type === "checkbox" ? false : "";
}

function FormNode({ node, context }: { node: DotAppNode; context: RenderContext }) {
  const fields = useMemo(() => node.fields ?? [], [node.fields]);
  const [values, setValues] = useState<Record<string, JsonPrimitive>>(() => Object.fromEntries(fields.map((field) => [field.name, fieldDefault(field)])));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!node.action) return;
    await context.onAction(node.action, values);
    setValues(Object.fromEntries(fields.map((field) => [field.name, fieldDefault(field)])));
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <div className={styles.formGrid}>
        {fields.map((field) => (
          <label className={cx(styles.field, field.type === "textarea" && styles.fieldWide)} key={field.name}>
            {field.type === "checkbox" ? (
              <span className={styles.checkField}>
                <input type="checkbox" checked={values[field.name] === true} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.checked }))} />
                <span className={styles.fieldLabel}>{field.label}</span>
              </span>
            ) : (
              <>
                <span className={styles.fieldLabel}>{field.label}</span>
                {field.type === "textarea" ? (
                  <textarea className={styles.fieldTextarea} required={field.required} placeholder={field.placeholder} value={String(values[field.name] ?? "")} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} />
                ) : field.type === "select" ? (
                  <select className={styles.fieldSelect} required={field.required} value={String(values[field.name] ?? "")} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}>
                    <option value="">{field.placeholder || "Choose one"}</option>
                    {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                ) : (
                  <input
                    className={styles.fieldInput}
                    type={field.type === "currency" ? "number" : field.type}
                    inputMode={field.type === "currency" ? "decimal" : undefined}
                    step={field.type === "currency" ? "0.01" : undefined}
                    required={field.required}
                    placeholder={field.placeholder}
                    value={String(values[field.name] ?? "")}
                    onChange={(event) => setValues((current) => ({ ...current, [field.name]: field.type === "number" || field.type === "currency" ? (event.target.value === "" ? "" : Number(event.target.value)) : event.target.value }))}
                  />
                )}
              </>
            )}
          </label>
        ))}
      </div>
      {node.action && <KitButton type="submit" disabled={context.busyOperation === node.action.operation}>{context.busyOperation === node.action.operation ? "saving…" : node.submit_label || "save"}</KitButton>}
    </form>
  );
}

function EmptyNode({ node }: { node: DotAppNode }) {
  return (
    <div className={styles.empty}>
      <div>
        <div className={styles.emptyMark} />
        <p className={styles.emptyTitle}>{node.empty_title || "Nothing here yet"}</p>
        <p className={styles.emptyBody}>{node.empty_body || "Add the first one when you’re ready."}</p>
      </div>
    </div>
  );
}

function Node({ node, context }: { node: DotAppNode; context: RenderContext }): ReactNode {
  const data = context.document.data ?? {};
  switch (node.type) {
    case "page": return <div className={styles.page}>{children(node, context)}</div>;
    case "hero": return <section className={styles.hero}><div><p className={styles.heroOverline}>{textValue(node.overline, data)}</p><h1 className={styles.heroTitle}>{textValue(node.title, data)}</h1><p className={styles.heroBody}>{textValue(node.body ?? node.subtitle, data)}</p></div>{children(node, context)}</section>;
    case "section": return <section className={styles.section}><header className={styles.sectionHeader}><div><p className={styles.sectionOverline}>{textValue(node.overline, data)}</p><h2 className={styles.sectionTitle}>{textValue(node.title, data)}</h2><p className={styles.sectionBody}>{textValue(node.body ?? node.subtitle, data)}</p></div></header>{children(node, context)}</section>;
    case "stack": return <div className={styles.stack} data-gap={node.gap ?? "normal"}>{children(node, context)}</div>;
    case "cluster": return <div className={styles.cluster} data-gap={node.gap ?? "normal"} data-align={node.align ?? "start"}>{children(node, context)}</div>;
    case "grid": return <div className={styles.grid} data-columns={node.columns ?? 2} data-gap={node.gap ?? "normal"}>{children(node, context)}</div>;
    case "card": return <KitCard variant={node.variant}>{children(node, context)}</KitCard>;
    case "heading": return <h3 className={styles.heading} data-size={node.size ?? "md"}>{textValue(node.value ?? node.title, data)}</h3>;
    case "text": return <p className={styles.text} data-size={node.size ?? "md"}>{textValue(node.value ?? node.body, data)}</p>;
    case "badge": return <KitBadge tone={node.tone}>{textValue(node.value ?? node.label, data)}</KitBadge>;
    case "button": return node.action ? <KitButton variant={node.variant === "plain" || node.variant === "soft" || node.variant === "outline" || node.variant === "accent" ? node.variant : "accent"} disabled={context.busyOperation === node.action.operation} onClick={() => void context.onAction(node.action!)}>{context.busyOperation === node.action.operation ? "working…" : textValue(node.label ?? node.value, data)}</KitButton> : null;
    case "metric": return <KitCard variant={node.variant}><div className={styles.metric}><div><div className={styles.metricLabel}>{textValue(node.label, data)}</div><div className={styles.metricValue}>{formatValue(resolveValue(node.value, data), node.format, node.currency)}</div></div><div className={styles.metricDetail}>{textValue(node.subtitle ?? node.body, data)}</div></div></KitCard>;
    case "progress": {
      const min = node.min ?? 0;
      const max = node.max ?? 100;
      const value = numericValue(node.value, data);
      const percent = max === min ? 0 : ((value - min) / (max - min)) * 100;
      return <KitProgress label={textValue(node.label, data)} value={percent} detail={textValue(node.subtitle, data) || undefined} />;
    }
    case "callout": return <KitCallout title={textValue(node.title, data)} body={textValue(node.body, data)} tone={node.tone} />;
    case "divider": return <hr className={styles.divider} />;
    case "list": return <ListNode node={node} context={context} />;
    case "table": return <TableNode node={node} context={context} />;
    case "timeline": return <TimelineNode node={node} context={context} />;
    case "kanban": return <KanbanNode node={node} context={context} />;
    case "form": return <FormNode node={node} context={context} />;
    case "empty": return <EmptyNode node={node} />;
    case "sparkline": {
      const source = readPath(data, node.source);
      const points = Array.isArray(source) ? source.filter((point): point is number => typeof point === "number") : node.points;
      return <Sparkline points={points} />;
    }
    default: return <div className={styles.unsupported}>unsupported app element</div>;
  }
}

export function DotAppRenderer({
  document,
  onAction,
  busyOperation,
}: {
  document: DotAppDocument;
  onAction: RuntimeActionHandler;
  busyOperation: string | null;
}) {
  return <Node node={document.root} context={{ document, onAction, busyOperation }} />;
}
