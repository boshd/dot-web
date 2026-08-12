const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function firebaseBearerToken() {
  const { getFirebaseAuth } = await import("@/components/benji-auth-provider");
  return getFirebaseAuth()?.currentUser?.getIdToken().catch(() => undefined);
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type DotAppTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info";

export type DotAppValue = JsonPrimitive | { bind: string; fallback?: JsonPrimitive };

export type DotAppAction = {
  operation: string;
  payload?: Record<string, JsonValue>;
  confirm?: {
    title: string;
    description?: string;
    button_label?: string;
  };
};

export type DotAppField = {
  name: string;
  label: string;
  type:
    | "text"
    | "textarea"
    | "number"
    | "integer"
    | "currency"
    | "date"
    | "time"
    | "email"
    | "select"
    | "checkbox"
    | "object"
    | "array";
  placeholder?: string;
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
  default_value?: JsonPrimitive;
};

export type DotAppTableColumn = {
  key: string;
  label: string;
  align?: "start" | "center" | "end";
  format?: "text" | "number" | "currency" | "date" | "status";
};

export type DotAppNode = {
  id: string;
  type:
    | "page"
    | "hero"
    | "section"
    | "stack"
    | "cluster"
    | "grid"
    | "card"
    | "heading"
    | "text"
    | "badge"
    | "button"
    | "metric"
    | "progress"
    | "callout"
    | "divider"
    | "list"
    | "table"
    | "timeline"
    | "kanban"
    | "form"
    | "empty"
    | "sparkline";
  children?: DotAppNode[];
  title?: DotAppValue;
  subtitle?: DotAppValue;
  body?: DotAppValue;
  value?: DotAppValue;
  label?: DotAppValue;
  overline?: DotAppValue;
  source?: string;
  tone?: DotAppTone;
  size?: "sm" | "md" | "lg" | "xl";
  align?: "start" | "center" | "end" | "between";
  gap?: "tight" | "normal" | "loose";
  columns?: 1 | 2 | 3 | 4;
  variant?: "plain" | "soft" | "outline" | "elevated" | "accent";
  format?: "text" | "number" | "currency" | "percent" | "date";
  currency?: string;
  min?: number;
  max?: number;
  items?: Array<Record<string, JsonValue>>;
  item_title?: string;
  item_detail?: string;
  item_meta?: string;
  table_columns?: DotAppTableColumn[];
  lanes?: Array<{ key: string; label: string; tone?: DotAppTone }>;
  fields?: DotAppField[];
  submit_label?: string;
  action?: DotAppAction;
  empty_title?: string;
  empty_body?: string;
  points?: number[];
};

export type DotAppDocument = {
  schema_version: 1;
  root: DotAppNode;
  data?: Record<string, JsonValue>;
  theme?: {
    accent?: "coral" | "sage" | "ocean" | "plum" | "gold" | "sky";
    density?: "compact" | "comfortable" | "spacious";
    radius?: "soft" | "round" | "sharp";
  };
};

export type GeneratedAppV2BrowserBundle = {
  format: "iife";
  javascript: string;
  css: string;
  sha256: string;
  sdk_version: "2";
  static_html: string;
};

export async function verifyGeneratedAppV2BrowserBundle(
  bundle: GeneratedAppV2BrowserBundle,
) {
  if (!globalThis.crypto?.subtle) return false;
  try {
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${bundle.javascript}\0${bundle.css}`),
    );
    const actual = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
    return actual === bundle.sha256;
  } catch {
    return false;
  }
}

export type GeneratedAppV2Artifact = {
  kind: "code";
  schema_version: 1;
  document: DotAppDocument;
  browser_bundle: GeneratedAppV2BrowserBundle;
};

export type GeneratedAppV2Access = {
  mode: "private" | "shared" | "public";
  state: "granted" | "permission_required" | "denied";
  role: "owner" | "editor" | "member" | "viewer" | "guest" | null;
  can_edit: boolean;
  capabilities: string[];
};

export type GeneratedAppV2Build = {
  status: "queued" | "planning" | "generating" | "testing" | "repairing" | "deploying" | "failed";
  stage: string | null;
  message: string | null;
  updated_at: string | null;
};

export type GeneratedAppV2Revision = {
  id: string;
  version: number;
  runtime_version: string;
  manifest: Record<string, JsonValue>;
  artifact: GeneratedAppV2Artifact;
};

export type GeneratedAppV2 = {
  id: string;
  title: string;
  description: string;
  status: "building" | "ready" | "failed" | "archived";
  access: GeneratedAppV2Access;
  active_revision: GeneratedAppV2Revision | null;
  build: GeneratedAppV2Build | null;
  updated_at: string | null;
};

const APP_SESSION_PREFIX = "dot-app-session:";
const APP_SHARED_HANDOFF_PREFIX = "dot-app-shared-handoff:";

function appSessionKey(appId: string) {
  return `${APP_SESSION_PREFIX}${appId}`;
}

function sharedHandoffKey(appId: string) {
  return `${APP_SHARED_HANDOFF_PREFIX}${appId}`;
}

export function storeGeneratedAppV2SharedHandoff(appId: string, ticket: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    sharedHandoffKey(appId),
    // Server handoffs last seven days. Keep this slightly shorter so a saved link is
    // never offered after the authoritative ticket has expired.
    JSON.stringify({ ticket, expires_at: Date.now() + (7 * 24 - 1) * 60 * 60 * 1_000 }),
  );
}

export function generatedAppV2SharedHandoff(appId: string) {
  if (typeof window === "undefined") return undefined;
  const stored = window.localStorage.getItem(sharedHandoffKey(appId));
  if (!stored) return undefined;
  try {
    const value = JSON.parse(stored) as { ticket?: unknown; expires_at?: unknown };
    if (
      typeof value.ticket !== "string" ||
      typeof value.expires_at !== "number" ||
      value.expires_at <= Date.now()
    ) {
      window.localStorage.removeItem(sharedHandoffKey(appId));
      return undefined;
    }
    return value.ticket;
  } catch {
    window.localStorage.removeItem(sharedHandoffKey(appId));
    return undefined;
  }
}

export function generatedAppV2Session(appId: string) {
  if (typeof window === "undefined") return undefined;
  const stored = window.localStorage.getItem(appSessionKey(appId));
  if (!stored) return undefined;
  try {
    const value = JSON.parse(stored) as { token?: unknown; expires_at?: unknown };
    if (typeof value.token !== "string") return undefined;
    if (typeof value.expires_at === "string" && new Date(value.expires_at).getTime() <= Date.now()) {
      window.localStorage.removeItem(appSessionKey(appId));
      return undefined;
    }
    return value.token;
  } catch {
    window.localStorage.removeItem(appSessionKey(appId));
    return undefined;
  }
}

function storeGeneratedAppV2Session(appId: string, session: string, expiresAt?: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    appSessionKey(appId),
    JSON.stringify({ token: session, expires_at: expiresAt ?? null }),
  );
}

function copyGeneratedAppV2Session(fromAppId: string, toAppId: string) {
  if (typeof window === "undefined" || fromAppId === toAppId) return;
  const stored = window.localStorage.getItem(appSessionKey(fromAppId));
  if (stored) window.localStorage.setItem(appSessionKey(toAppId), stored);
}

export class GeneratedAppV2ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

const nodeTypes = new Set<DotAppNode["type"]>([
  "page", "hero", "section", "stack", "cluster", "grid", "card", "heading", "text",
  "badge", "button", "metric", "progress", "callout", "divider", "list", "table",
  "timeline", "kanban", "form", "empty", "sparkline",
]);

function validDocument(value: Record<string, unknown>): value is unknown & DotAppDocument {
  if (value.schema_version !== 1 || !isObject(value.root)) return false;
  const ids = new Set<string>();
  let count = 0;

  function visit(node: Record<string, unknown>, depth: number): boolean {
    count += 1;
    if (count > 250 || depth > 12) return false;
    if (
      typeof node.id !== "string" ||
      node.id.length < 1 ||
      node.id.length > 128 ||
      ids.has(node.id) ||
      typeof node.type !== "string" ||
      !nodeTypes.has(node.type as DotAppNode["type"])
    ) return false;
    ids.add(node.id);
    if (node.children !== undefined) {
      if (!Array.isArray(node.children) || node.children.length > 100) return false;
      if (!node.children.every((child) => isObject(child) && visit(child, depth + 1))) return false;
    }
    if (
      node.items !== undefined &&
      (!Array.isArray(node.items) || node.items.length > 1_000 || !node.items.every(isObject))
    ) return false;
    if (
      node.fields !== undefined &&
      (!Array.isArray(node.fields) || node.fields.length > 50 || !node.fields.every((field) =>
        isObject(field) && typeof field.name === "string" && typeof field.label === "string" && typeof field.type === "string"
      ))
    ) return false;
    if (
      node.table_columns !== undefined &&
      (!Array.isArray(node.table_columns) || node.table_columns.length > 30 || !node.table_columns.every((column) =>
        isObject(column) && typeof column.key === "string" && typeof column.label === "string"
      ))
    ) return false;
    if (
      node.lanes !== undefined &&
      (!Array.isArray(node.lanes) || node.lanes.length > 20 || !node.lanes.every((lane) =>
        isObject(lane) && typeof lane.key === "string" && typeof lane.label === "string"
      ))
    ) return false;
    if (
      node.points !== undefined &&
      (!Array.isArray(node.points) || node.points.length > 500 || !node.points.every((point) => typeof point === "number" && Number.isFinite(point)))
    ) return false;
    if (
      node.action !== undefined &&
      (!isObject(node.action) || typeof node.action.operation !== "string")
    ) return false;
    return true;
  }

  return visit(value.root, 0);
}

function normalizeArtifact(value: unknown): GeneratedAppV2Artifact | null {
  if (!isObject(value)) return null;
  const payload = isObject(value.payload) ? value.payload : value;
  const document = isObject(payload.document)
    ? payload.document
    : isObject(payload.render_document)
      ? payload.render_document
      : null;
  if (!document || !validDocument(document)) return null;
  const bundleValue = isObject(payload.browser_bundle) ? payload.browser_bundle : null;
  const browserBundle = bundleValue &&
    bundleValue.format === "iife" &&
    typeof bundleValue.javascript === "string" &&
    bundleValue.javascript.length <= 3_000_000 &&
    typeof bundleValue.css === "string" &&
    bundleValue.css.length <= 400_000 &&
    typeof bundleValue.sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(bundleValue.sha256) &&
    typeof bundleValue.static_html === "string" &&
    bundleValue.static_html.length > 0 &&
    new TextEncoder().encode(bundleValue.static_html).byteLength <= 256_000 &&
    bundleValue.sdk_version === "2"
    ? {
        format: "iife" as const,
        javascript: bundleValue.javascript,
        css: bundleValue.css,
        sha256: bundleValue.sha256,
        sdk_version: "2" as const,
        static_html: bundleValue.static_html,
      }
    : null;
  if (!browserBundle) return null;
  return {
    kind: "code",
    schema_version: 1,
    document: document as unknown as DotAppDocument,
    browser_bundle: browserBundle,
  };
}

export function normalizeGeneratedAppV2(payload: unknown): GeneratedAppV2 {
  if (!isObject(payload)) throw new GeneratedAppV2ApiError("Dot returned an invalid app.", 502);
  const appValue = isObject(payload.app) ? payload.app : payload;
  const accessValue = isObject(payload.access)
    ? payload.access
    : isObject(appValue.access)
      ? appValue.access
      : {};
  const revisionValue = isObject(payload.active_revision)
    ? payload.active_revision
    : isObject(appValue.active_revision)
      ? appValue.active_revision
      : isObject(payload.current_revision)
      ? payload.current_revision
      : null;
  const artifact = revisionValue ? normalizeArtifact(revisionValue.artifact) : null;
  const buildValue = isObject(payload.build)
    ? payload.build
    : isObject(payload.latest_build)
      ? payload.latest_build
      : null;

  const rawAccessState = accessValue.state;
  const normalizedAccessState = rawAccessState === "authorized"
    ? "granted"
    : rawAccessState === "ticket_required"
      ? "permission_required"
      : rawAccessState;

  const accessState = enumValue(
    normalizedAccessState,
    ["granted", "permission_required", "denied"] as const,
    payload.status === "permission_required" ? "permission_required" : "granted",
  );
  const rawStatus = enumValue(
    appValue.status,
    ["building", "ready", "failed", "archived", "permission_required"] as const,
    artifact ? "ready" : "building",
  );
  const status = artifact
    ? "ready"
    : buildValue?.status === "failed"
      ? "failed"
      : rawStatus === "archived"
        ? "archived"
        : rawStatus === "permission_required"
          ? "ready"
          : "building";

  return {
    id: stringValue(appValue.id, stringValue(appValue.public_id)),
    title: stringValue(appValue.title, "Dot app"),
    description: stringValue(appValue.description),
    status,
    access: {
      mode: enumValue(
        accessValue.mode ?? appValue.access_mode,
        ["private", "shared", "public", "private_link", "collaborative_link"] as const,
        "private",
      ).replace("_link", "").replace("collaborative", "shared") as GeneratedAppV2Access["mode"],
      state: accessState,
      role: enumValue(
        accessValue.role,
        ["owner", "editor", "member", "viewer", "guest", "none"] as const,
        "none",
      ) === "none"
        ? null
        : (accessValue.role as GeneratedAppV2Access["role"]),
      can_edit: accessValue.can_edit === true,
      capabilities: Array.isArray(accessValue.capabilities)
        ? accessValue.capabilities.filter((value): value is string => typeof value === "string")
        : [],
    },
    active_revision: revisionValue && artifact
      ? {
          id: stringValue(revisionValue.id),
          version: Number.isInteger(revisionValue.version)
            ? Number(revisionValue.version)
            : Number.isInteger(revisionValue.revision_number)
              ? Number(revisionValue.revision_number)
              : 1,
          runtime_version: stringValue(revisionValue.runtime_version, stringValue(revisionValue.sdk_version, "2")),
          manifest: isObject(revisionValue.manifest)
            ? revisionValue.manifest as Record<string, JsonValue>
            : {},
          artifact,
        }
      : null,
    build: buildValue
      ? {
          status: enumValue(
            buildValue.status === "claimed" ? "generating" : buildValue.status,
            ["queued", "planning", "generating", "testing", "repairing", "deploying", "failed", "succeeded"] as const,
            "generating",
          ) === "succeeded" ? "deploying" : enumValue(
            buildValue.status === "claimed" ? "generating" : buildValue.status,
            ["queued", "planning", "generating", "testing", "repairing", "deploying", "failed"] as const,
            "generating",
          ),
          stage: nullableString(buildValue.stage),
          message: nullableString(buildValue.message) ?? nullableString(buildValue.error),
          updated_at: nullableString(buildValue.updated_at),
        }
      : null,
    updated_at: nullableString(appValue.updated_at),
  };
}


async function errorFromResponse(response: Response) {
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const detail = isObject(payload?.detail) ? payload?.detail : null;
  const message = stringValue(detail?.message, stringValue(payload?.detail, "Dot couldn’t load this app."));
  const code = stringValue(detail?.code, stringValue(payload?.code)) || undefined;
  return new GeneratedAppV2ApiError(message, response.status, code);
}

async function appRequest(
  path: string,
  options: RequestInit = {},
  appSession?: string,
  captureSessionForAppId?: string,
) {
  const bearer = await firebaseBearerToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(appSession ? { "X-Dot-App-Session": appSession } : {}),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) throw await errorFromResponse(response);
  const returnedSession = response.headers.get("X-Dot-App-Session");
  if (captureSessionForAppId && returnedSession) {
    storeGeneratedAppV2Session(captureSessionForAppId, returnedSession);
  }
  return response.json() as Promise<unknown>;
}

export async function loadGeneratedAppV2(appId: string) {
  const payload = await appRequest(
    `/api/v1/apps/v2/${encodeURIComponent(appId)}`,
    {},
    generatedAppV2Session(appId),
  );
  const app = normalizeGeneratedAppV2(payload);
  copyGeneratedAppV2Session(appId, app.id);
  return app;
}

export async function invokeGeneratedAppV2(input: {
  publicId: string;
  appId: string;
  operation: string;
  payload?: Record<string, JsonValue>;
}) {
  if (!isRuntimeOperation(input.operation)) {
    throw new GeneratedAppV2ApiError("This app action isn't supported.", 422);
  }
  await executeGeneratedAppV2Action({
    publicId: input.publicId,
    appId: input.appId,
    operation: input.operation,
    payload: input.payload,
  });
  return loadGeneratedAppV2(input.publicId);
}

export type GeneratedAppV2ActionResult = {
  operation: string;
  data: JsonValue;
  meta: Record<string, JsonValue>;
};

export type GeneratedAppV2RuntimeOperation =
  | "app.data.get"
  | "records.list"
  | "records.create"
  | "records.update"
  | "records.delete"
  | "dot.reminder.create";

export async function executeGeneratedAppV2Action(input: {
  publicId: string;
  appId: string;
  operation: GeneratedAppV2RuntimeOperation;
  payload?: Record<string, JsonValue>;
  idempotencyKey?: string;
}): Promise<GeneratedAppV2ActionResult> {
  const response = await appRequest(
    `/api/v1/apps/v2/${encodeURIComponent(input.appId)}/actions`,
    {
      method: "POST",
      body: JSON.stringify({
        operation: input.operation,
        args: input.payload ?? {},
        ...(input.operation === "records.list"
          ? {}
          : { idempotency_key: input.idempotencyKey ?? crypto.randomUUID() }),
      }),
    },
    generatedAppV2Session(input.appId) ?? generatedAppV2Session(input.publicId),
  );
  if (!isObject(response) || typeof response.operation !== "string") {
    throw new GeneratedAppV2ApiError("Dot returned an invalid app action.", 502);
  }
  const data = response.data;
  if (!isJsonValue(data)) {
    throw new GeneratedAppV2ApiError("Dot returned invalid app data.", 502);
  }
  const meta = isJsonObject(response.meta)
    ? response.meta
    : {};
  return { operation: response.operation, data, meta };
}

export async function queryGeneratedAppV2Records(input: {
  publicId: string;
  appId: string;
  entity: string;
}) {
  const response = await executeGeneratedAppV2Action({
    ...input,
    operation: "records.list",
    payload: { entity: input.entity, limit: 100, offset: 0 },
  });
  if (!Array.isArray(response.data)) return [];
  return response.data.filter(isJsonObject).map((record) => {
    const data = isObject(record.data) ? record.data : {};
    return {
      ...data,
      id: stringValue(record.id),
      _record_id: stringValue(record.id),
      _record_version: typeof record.version === "number" ? record.version : 1,
    } satisfies Record<string, JsonValue>;
  });
}

function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 12) return false;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 2_000 && value.every((item) => isJsonValue(item, depth + 1));
  if (!isObject(value) || Object.keys(value).length > 500) return false;
  return Object.values(value).every((item) => isJsonValue(item, depth + 1));
}

function isJsonObject(value: unknown): value is Record<string, JsonValue> {
  return isObject(value) && isJsonValue(value);
}

function isRuntimeOperation(value: string): value is GeneratedAppV2RuntimeOperation {
  return value === "app.data.get" ||
    value === "records.list" ||
    value === "records.create" ||
    value === "records.update" ||
    value === "records.delete" ||
    value === "dot.reminder.create";
}

export async function redeemGeneratedAppV2Handoff(appId: string, ticket: string) {
  const response = await appRequest(
    `/api/v1/apps/v2/${encodeURIComponent(appId)}/sessions/redeem`,
    { method: "POST", body: JSON.stringify({ ticket }) },
    undefined,
    appId,
  );
  if (isObject(response)) {
    const token = stringValue(response.session_token, stringValue(response.token));
    if (token) storeGeneratedAppV2Session(appId, token, stringValue(response.expires_at) || undefined);
  }
}
