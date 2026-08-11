import type {
  GeneratedAppDetail,
  GeneratedAppModule,
  GeneratedAppRecord,
} from "@/lib/api";

export type RuntimeModuleType =
  | "overview"
  | "todos"
  | "guests"
  | "planner"
  | "expenses"
  | "split"
  | "metric"
  | "notes"
  | "collection"
  | "unknown";

export type RuntimeModule = {
  id: string;
  type: RuntimeModuleType;
  rawType: string;
  title: string;
  description: string;
  settings: Record<string, unknown>;
  legacy: boolean;
};

const moduleAliases: Record<string, RuntimeModuleType> = {
  overview: "overview",
  summary: "overview",
  hero: "overview",
  todos: "todos",
  todo: "todos",
  todo_list: "todos",
  checklist: "todos",
  tasks: "todos",
  guest_list: "guests",
  guests: "guests",
  rsvp: "guests",
  rsvp_list: "guests",
  itinerary: "planner",
  planner: "planner",
  schedule: "planner",
  timeline: "planner",
  expenses: "expenses",
  expense_log: "expenses",
  budget: "expenses",
  expense_splitter: "split",
  split_expenses: "split",
  metric: "metric",
  metrics: "metric",
  metric_tracker: "metric",
  progress: "metric",
  notes: "notes",
  note_list: "notes",
  collection: "collection",
  database: "collection",
  tracker: "collection",
};

const defaultTitles: Record<RuntimeModuleType, string> = {
  overview: "Overview",
  todos: "To-dos",
  guests: "Guests",
  planner: "Plan",
  expenses: "Expenses",
  split: "Settle up",
  metric: "Progress",
  notes: "Notes",
  collection: "Items",
  unknown: "Details",
};

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function numberValue(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

export function objectValue(value: unknown) {
  return object(value);
}

export function objectList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(object).filter((item) => Object.keys(item).length) : [];
}

export function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function humanize(value: string) {
  return value
    .replaceAll("-", "_")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeType(value: string): RuntimeModuleType {
  return moduleAliases[value.trim().toLowerCase().replaceAll("-", "_")] ?? "unknown";
}

function normalizeModule(module: GeneratedAppModule, index: number): RuntimeModule {
  const rawType = stringValue(module.type, "unknown");
  const settings = object(module.settings);
  const normalizedType = normalizeType(rawType);
  const type =
    normalizedType === "expenses" && stringValue(settings.mode) === "split"
      ? "split"
      : normalizedType;
  return {
    id: stringValue(module.id, `section-${index + 1}`),
    type,
    rawType,
    title: stringValue(module.title, defaultTitles[type] || humanize(rawType)),
    description: stringValue(module.description),
    settings,
    legacy: false,
  };
}

function legacyModule(app: GeneratedAppDetail): RuntimeModule {
  const rawType = app.template;
  const type = normalizeType(rawType);
  const configured = app.specification.modules?.[0];
  return {
    id: configured?.id || rawType,
    type,
    rawType,
    title: configured?.title || defaultTitles[type] || humanize(rawType),
    description: stringValue(configured?.description),
    settings: configured ? object(configured.settings) : object(app.specification.settings),
    legacy: true,
  };
}

export function runtimeModules(app: GeneratedAppDetail): RuntimeModule[] {
  const configured = app.specification.modules;
  if (
    app.template !== "workspace" ||
    !Array.isArray(configured) ||
    configured.length === 0
  ) {
    return [legacyModule(app)];
  }

  const seen = new Set<string>();
  return configured.map(normalizeModule).map((module, index) => {
    let id = module.id;
    while (seen.has(id)) id = `${module.id}-${index + 1}`;
    seen.add(id);
    return { ...module, id };
  });
}

export function recordModuleId(record: GeneratedAppRecord) {
  return stringValue(record.module_id) || stringValue(record.data.module_id);
}

function acceptedKinds(module: RuntimeModule) {
  const configuredKind = stringValue(module.settings.record_kind);
  if (configuredKind) return [configuredKind];
  return {
    overview: [],
    todos: ["todo", "item", "task"],
    guests: ["guest", "rsvp"],
    planner: ["itinerary_item", "plan", "event"],
    expenses: ["expense"],
    split: ["participant", "expense"],
    metric: ["measurement", "metric_entry"],
    notes: ["note"],
    collection: ["entry"],
    unknown: stringList(module.settings.record_kinds),
  }[module.type];
}

export function primaryRecordKind(module: RuntimeModule) {
  const configured = stringValue(module.settings.record_kind);
  if (configured) return configured;
  return {
    overview: "",
    todos: module.legacy ? "item" : "todo",
    guests: "guest",
    planner: "itinerary_item",
    expenses: "expense",
    split: "expense",
    metric: "measurement",
    notes: "note",
    collection: "entry",
    unknown: "record",
  }[module.type];
}

export function recordsForModule(
  app: GeneratedAppDetail,
  module: RuntimeModule,
  modules: RuntimeModule[],
) {
  const accepted = acceptedKinds(module);
  return app.records.filter((record) => {
    const explicitModuleId = recordModuleId(record);
    if (explicitModuleId) return explicitModuleId === module.id;
    if (!accepted.includes(record.kind)) return false;
    if (module.legacy) return true;
    return modules.filter((candidate) => acceptedKinds(candidate).includes(record.kind)).length === 1;
  });
}

export function moduleAnchor(module: RuntimeModule) {
  return `module-${module.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}
