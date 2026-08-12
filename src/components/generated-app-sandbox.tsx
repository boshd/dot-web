"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { dotAppStyles as styles } from "@/components/dot-app-kit";
import type {
  GeneratedAppV2BrowserBundle,
  GeneratedAppV2RuntimeOperation,
  JsonValue,
} from "@/lib/generated-app-v2";
import {
  sanitizeGeneratedAppCss,
  sanitizeGeneratedAppStaticHtml,
} from "@/lib/generated-app-sanitizer";

const PROTOCOL_VERSION = 1;
const SDK_VERSION = "1";
const MAX_MESSAGE_BYTES = 64_000;
const MAX_CONCURRENT_REQUESTS = 6;
const MAX_REQUESTS_PER_MINUTE = 90;

const OPERATIONS = new Set([
  "app.data.get",
  "records.list",
  "records.create",
  "records.update",
  "records.delete",
  "dot.reminder.create",
] as const);

const SHADOW_CONTAINMENT_CSS = `
:host {
  display: block !important;
  position: relative !important;
  isolation: isolate !important;
  contain: layout paint style !important;
  width: 100% !important;
  min-height: 560px !important;
  overflow: clip !important;
  background: var(--app-paper, #f5f4ef) !important;
  color: var(--app-ink, #171714) !important;
}
*, *::before, *::after { box-sizing: border-box; }
`;

type RuntimeOperation = GeneratedAppV2RuntimeOperation;

type RuntimeRequest = {
  requestId: string;
  operation: RuntimeOperation;
  args: Record<string, JsonValue>;
  idempotencyKey?: string;
};

type WorkerEnvelope = {
  type?: unknown;
  protocol_version?: unknown;
  sdk_version?: unknown;
  channel_token?: unknown;
  request?: unknown;
  html?: unknown;
  message?: unknown;
};

type WorkerEventPayload = {
  node_id: string;
  event_type: "click" | "input" | "change" | "submit";
  value?: string;
  checked?: boolean;
  fields?: Record<string, string | boolean>;
};

type GeneratedAppSandboxProps = {
  bundle: GeneratedAppV2BrowserBundle;
  context: JsonValue;
  title: string;
  capabilities: string[];
  onRequest: (
    operation: RuntimeOperation,
    args: Record<string, JsonValue>,
    idempotencyKey?: string,
  ) => Promise<JsonValue>;
  onFallback: () => void;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSafeJson(value: unknown, depth = 0): value is JsonValue {
  if (depth > 10) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    return value.length <= 500 && value.every((item) => isSafeJson(item, depth + 1));
  }
  if (!isObject(value) || Object.keys(value).length > 200) return false;
  return Object.entries(value).every(
    ([key, item]) =>
      !["__proto__", "prototype", "constructor"].includes(key) && isSafeJson(item, depth + 1),
  );
}

function safeArgs(value: unknown): Record<string, JsonValue> | null {
  if (!isObject(value) || !isSafeJson(value)) return null;
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_MESSAGE_BYTES) return null;
  } catch {
    return null;
  }
  return value as Record<string, JsonValue>;
}

function validEntity(value: JsonValue | undefined): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(value);
}

function validVersion(value: JsonValue | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function validRecordId(value: JsonValue | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value);
}

function validReminderArgs(args: Record<string, JsonValue>) {
  if (Object.keys(args).some((key) => ![
    "title", "goal", "run_at", "timezone", "recurrence",
  ].includes(key))) return false;
  if (typeof args.title !== "string" || !args.title.trim() || args.title.length > 160) return false;
  if (typeof args.goal !== "string" || !args.goal.trim() || args.goal.length > 500) return false;
  if (
    typeof args.run_at !== "string" ||
    args.run_at.length > 64 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(args.run_at) ||
    !Number.isFinite(Date.parse(args.run_at))
  ) return false;
  if (typeof args.timezone !== "string" || !args.timezone || args.timezone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: args.timezone });
  } catch {
    return false;
  }
  return args.recurrence === "once" || args.recurrence === "daily" || args.recurrence === "weekly";
}

function validateOperationArgs(operation: RuntimeOperation, args: Record<string, JsonValue>) {
  if (operation === "app.data.get") return Object.keys(args).length === 0;
  if (operation === "records.list") {
    if (!validEntity(args.entity)) return false;
    const limit = args.limit ?? 50;
    const offset = args.offset ?? 0;
    return (
      typeof limit === "number" && Number.isInteger(limit) && limit >= 1 && limit <= 100 &&
      typeof offset === "number" && Number.isInteger(offset) && offset >= 0
    );
  }
  if (operation === "records.create") {
    return validEntity(args.entity) && isObject(args.data) && isSafeJson(args.data);
  }
  if (operation === "dot.reminder.create") return validReminderArgs(args);
  if (!validRecordId(args.record_id) || !validVersion(args.expected_version)) return false;
  return operation === "records.delete" || (isObject(args.data) && isSafeJson(args.data));
}

function runtimeRequest(value: unknown): RuntimeRequest | null {
  if (!isObject(value)) return null;
  if (
    value.type !== "dot.app.request" ||
    value.protocol_version !== PROTOCOL_VERSION ||
    value.sdk_version !== SDK_VERSION ||
    typeof value.request_id !== "string" ||
    !/^[a-zA-Z0-9_-]{8,128}$/.test(value.request_id) ||
    typeof value.operation !== "string" ||
    !OPERATIONS.has(value.operation as RuntimeOperation)
  ) return null;
  const args = safeArgs(value.args);
  if (!args || !validateOperationArgs(value.operation as RuntimeOperation, args)) return null;
  const idempotencyKey = value.idempotency_key;
  if (
    idempotencyKey !== undefined &&
    (typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 160)
  ) return null;
  return {
    requestId: value.request_id,
    operation: value.operation as RuntimeOperation,
    args,
    idempotencyKey: idempotencyKey as string | undefined,
  };
}

function responseError(error: unknown) {
  if (error instanceof Error) {
    return {
      code: error.name && error.name !== "Error" ? error.name.slice(0, 80) : "action_failed",
      message: error.message.slice(0, 300),
    };
  }
  return { code: "action_failed", message: "Dot couldn't complete that app action" };
}

function eventPayload(
  event: Event,
  root: ShadowRoot,
  eventType: WorkerEventPayload["event_type"],
) {
  const rawTarget = event.target as Element | null;
  const node = eventType === "submit"
    ? rawTarget?.closest?.("form[data-dot-node-id]")
    : eventType === "click"
      ? rawTarget?.closest?.(
          "button[data-dot-node-id], input[type='button'][data-dot-node-id], input[type='submit'][data-dot-node-id], a[data-dot-node-id], [role='button'][data-dot-node-id]",
        )
      : rawTarget?.closest?.("input[data-dot-node-id], textarea[data-dot-node-id], select[data-dot-node-id]");
  if (!node || !root.contains(node)) return null;
  const nodeId = node.getAttribute("data-dot-node-id");
  if (!nodeId) return null;
  const control = rawTarget as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  const payload: WorkerEventPayload = { node_id: nodeId, event_type: eventType };
  if (control && "value" in control) payload.value = control.value;
  if (control && "checked" in control) payload.checked = control.checked;
  if (eventType === "submit" && node instanceof HTMLFormElement) {
    const fields = Object.create(null) as Record<string, string | boolean>;
    for (const [name, value] of new FormData(node).entries()) {
      if (typeof value === "string" && Object.keys(fields).length < 100) fields[name] = value.slice(0, 2_000);
    }
    for (const checkbox of Array.from(node.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name]'))) {
      fields[checkbox.name] = checkbox.checked;
    }
    payload.fields = fields;
  }
  return payload;
}

export function GeneratedAppSandbox({
  bundle,
  context,
  title,
  capabilities,
  onRequest,
  onFallback,
}: GeneratedAppSandboxProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<ShadowRoot | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const tokenRef = useRef(crypto.randomUUID());
  const requestHandlerRef = useRef(onRequest);
  const capabilitiesRef = useRef(capabilities);
  const fallbackRef = useRef(onFallback);
  const inFlightRef = useRef(new Set<string>());
  const requestTimesRef = useRef<number[]>([]);
  const [ready, setReady] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [renderedHtml, setRenderedHtml] = useState<string | null>(() => {
    try { return sanitizeGeneratedAppStaticHtml(bundle.static_html); } catch { return null; }
  });
  const css = useMemo(() => sanitizeGeneratedAppCss(bundle.css), [bundle.css]);

  useEffect(() => {
    requestHandlerRef.current = onRequest;
    capabilitiesRef.current = capabilities;
    fallbackRef.current = onFallback;
  }, [capabilities, onFallback, onRequest]);

  useEffect(() => {
    const channelToken = tokenRef.current;
    let worker: Worker;
    try {
      worker = new Worker("/dot-generated-app-worker.js", { type: "module" });
    } catch {
      fallbackRef.current();
      return;
    }
    const inFlight = inFlightRef.current;
    workerRef.current = worker;
    let active = true;

    async function handleRequest(requestValue: unknown) {
      const request = runtimeRequest(requestValue);
      if (!request || !active) return;
      if (
        request.operation === "dot.reminder.create" &&
        !capabilitiesRef.current.includes("dot.reminder.create")
      ) {
        worker.postMessage({
          type: "dot.host.response",
          channel_token: channelToken,
          request_id: request.requestId,
          ok: false,
          error: { code: "capability_denied", message: "This app doesn't have reminder access" },
        });
        return;
      }
      if (request.operation === "records.delete" && !window.confirm("delete this item?")) {
        worker.postMessage({
          type: "dot.host.response",
          channel_token: channelToken,
          request_id: request.requestId,
          ok: false,
          error: { code: "user_cancelled", message: "Delete cancelled" },
        });
        return;
      }
      if (request.operation === "dot.reminder.create") {
        const when = new Date(String(request.args.run_at)).toLocaleString();
        const reminder = String(request.args.goal);
        if (!window.confirm(
          `set “${String(request.args.title)}” for ${when}?\n\nDot will send this reminder (it won't run tools or take other actions):\n${reminder}`,
        )) {
          worker.postMessage({
            type: "dot.host.response",
            channel_token: channelToken,
            request_id: request.requestId,
            ok: false,
            error: { code: "user_cancelled", message: "Reminder cancelled" },
          });
          return;
        }
      }
      const now = Date.now();
      requestTimesRef.current = requestTimesRef.current.filter((value) => value > now - 60_000);
      if (
        requestTimesRef.current.length >= MAX_REQUESTS_PER_MINUTE ||
        inFlight.size >= MAX_CONCURRENT_REQUESTS ||
        inFlight.has(request.requestId)
      ) return;
      requestTimesRef.current.push(now);
      inFlight.add(request.requestId);
      try {
        const result = await requestHandlerRef.current(
          request.operation,
          request.args,
          request.idempotencyKey,
        );
        worker.postMessage({
          type: "dot.host.response",
          channel_token: channelToken,
          request_id: request.requestId,
          ok: true,
          result,
        });
      } catch (error) {
        worker.postMessage({
          type: "dot.host.response",
          channel_token: channelToken,
          request_id: request.requestId,
          ok: false,
          error: responseError(error),
        });
      } finally {
        inFlight.delete(request.requestId);
      }
    }

    worker.addEventListener("message", (event: MessageEvent<WorkerEnvelope>) => {
      const message = event.data;
      if (
        !active ||
        !message ||
        message.channel_token !== channelToken ||
        message.protocol_version !== PROTOCOL_VERSION ||
        message.sdk_version !== SDK_VERSION
      ) return;
      if (message.type === "dot.worker.ready") {
        setReady(true);
        return;
      }
      if (message.type === "dot.worker.render" && typeof message.html === "string") {
        try {
          setRenderedHtml(sanitizeGeneratedAppStaticHtml(message.html));
          setReady(true);
        } catch {
          fallbackRef.current();
        }
        return;
      }
      if (message.type === "dot.worker.request") void handleRequest(message.request);
      else if (message.type === "dot.worker.error") {
        fallbackRef.current();
        setFeedback(typeof message.message === "string" ? message.message.slice(0, 300) : "this view needs a repair");
      }
    });
    worker.addEventListener("error", () => {
      fallbackRef.current();
      setFeedback("this custom view needs a repair");
    });
    try {
      worker.postMessage({
        type: "dot.host.init",
        channel_token: channelToken,
        javascript: bundle.javascript,
        context,
      });
    } catch {
      fallbackRef.current();
    }
    return () => {
      active = false;
      worker.terminate();
      workerRef.current = null;
      inFlight.clear();
    };
  }, [bundle.javascript, context]);

  useEffect(() => {
    workerRef.current?.postMessage({
      type: "dot.host.context",
      channel_token: tokenRef.current,
      context,
    });
  }, [context]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !renderedHtml) return;
    const root = shadowRef.current ?? host.attachShadow({ mode: "closed" });
    shadowRef.current = root;

    const generatedStyle = document.createElement("style");
    generatedStyle.textContent = css;
    const containmentStyle = document.createElement("style");
    containmentStyle.textContent = SHADOW_CONTAINMENT_CSS;
    const content = document.createElement("div");
    content.innerHTML = renderedHtml;
    root.replaceChildren(generatedStyle, containmentStyle, content);

    function relay(eventType: WorkerEventPayload["event_type"]) {
      return (event: Event) => {
        if (eventType === "submit") event.preventDefault();
        const payload = eventPayload(event, root, eventType);
        if (!payload) return;
        workerRef.current?.postMessage({
          type: "dot.host.event",
          channel_token: tokenRef.current,
          ...payload,
        });
      };
    }

    const listeners = {
      click: relay("click"),
      input: relay("input"),
      change: relay("change"),
      submit: relay("submit"),
    };
    for (const [eventType, listener] of Object.entries(listeners)) {
      root.addEventListener(eventType, listener);
    }
    return () => {
      for (const [eventType, listener] of Object.entries(listeners)) {
        root.removeEventListener(eventType, listener);
      }
    };
  }, [css, renderedHtml]);

  return (
    <div className={styles.sandboxHost} aria-busy={!ready}>
      {!ready && <div className={styles.sandboxLoading}>opening the custom view…</div>}
      {renderedHtml && (
        <div
          ref={hostRef}
          className={styles.sandboxStatic}
          aria-label={title}
        />
      )}
      {feedback && <p className={styles.sandboxFeedback} role="status">{feedback}</p>}
    </div>
  );
}
