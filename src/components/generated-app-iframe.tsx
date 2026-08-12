"use client";

import { useEffect, useId, useRef, useState } from "react";

import { dotAppStyles as styles } from "@/components/dot-app-kit";
import type {
  GeneratedAppV2BrowserBundle,
  GeneratedAppV2RuntimeOperation,
  JsonValue,
} from "@/lib/generated-app-v2";
import { sanitizeGeneratedAppCss } from "@/lib/generated-app-sanitizer";

const PROTOCOL_VERSION = 1;
const SDK_VERSION = "2";
const MAX_MESSAGE_BYTES = 64_000;
const MAX_CONCURRENT_REQUESTS = 6;
const MAX_REQUESTS_PER_MINUTE = 90;
const MAX_HEIGHT = 10_000;

const OPERATIONS = new Set<GeneratedAppV2RuntimeOperation>([
  "app.data.get",
  "records.list",
  "records.create",
  "records.update",
  "records.delete",
  "dot.reminder.create",
]);

type RuntimeRequest = {
  requestId: string;
  operation: GeneratedAppV2RuntimeOperation;
  args: Record<string, JsonValue>;
  idempotencyKey?: string;
  gestureId?: string;
};

type GeneratedAppIframeProps = {
  bundle: GeneratedAppV2BrowserBundle;
  context: JsonValue;
  title: string;
  capabilities: string[];
  onRequest: (
    operation: GeneratedAppV2RuntimeOperation,
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

function validateOperationArgs(
  operation: GeneratedAppV2RuntimeOperation,
  args: Record<string, JsonValue>,
) {
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
    !OPERATIONS.has(value.operation as GeneratedAppV2RuntimeOperation)
  ) return null;
  const rawArgs = safeArgs(value.args);
  if (!rawArgs) return null;
  const operation = value.operation as GeneratedAppV2RuntimeOperation;
  const args = operation === "records.list" && typeof rawArgs.limit === "number"
    ? { ...rawArgs, limit: Math.min(100, Math.max(1, Math.trunc(rawArgs.limit))) }
    : rawArgs;
  if (!validateOperationArgs(operation, args)) {
    return null;
  }
  const idempotencyKey = value.idempotency_key;
  if (
    idempotencyKey !== undefined &&
    (typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 160)
  ) return null;
  return {
    requestId: value.request_id,
    operation,
    args,
    idempotencyKey: idempotencyKey as string | undefined,
    gestureId: typeof value.gesture_id === "string" ? value.gesture_id : undefined,
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

function escapeInlineScript(value: string) {
  return value.replaceAll("</script", "<\\/script").replaceAll("<!--", "<\\!--");
}

function escapeInlineStyle(value: string) {
  return value.replace(/<\/style/gi, "<\\/style").replaceAll("<!--", "<\\!--");
}

function iframeDocument(
  bundle: GeneratedAppV2BrowserBundle,
  context: JsonValue,
  channelToken: string,
) {
  const bootstrap = `
    (() => {
      const channelToken = ${JSON.stringify(channelToken)};
      const bundleCode = ${JSON.stringify(bundle.javascript)};
      const queuedMessages = [];
      const readOnlyOperations = new Set(["app.data.get", "records.list"]);
      const call = Reflect.apply.bind(Reflect.apply);
      const defer = queueMicrotask.bind(window);
      const expireGesture = setTimeout.bind(window);
      const newGestureId = crypto.randomUUID.bind(crypto);
      const portPostMessage = MessagePort.prototype.postMessage;
      let hostPort = null;
      let appStarted = false;
      let currentGesture = null;

      const relay = (message) => {
        if (hostPort) call(portPostMessage, hostPort, [message]);
        else queuedMessages.push(message);
      };
      const reportError = (value) => {
        const error = value instanceof Error ? value : new Error(String(value || "app failed"));
        relay({
          type: "dot.app.error",
          protocol_version: ${PROTOCOL_VERSION},
          sdk_version: ${JSON.stringify(SDK_VERSION)},
          channel_token: channelToken,
          error: { name: error.name, message: error.message },
        });
      };
      const issueGesture = (event) => {
        if (!event.isTrusted) return;
        // One physical click can produce both click and submit events. Preserve
        // the same gesture even after an onClick handler consumes it, so that a
        // single tap can never authorize a second mutation from onSubmit.
        if (event.type === "submit" && currentGesture) return;
        const gesture = { id: newGestureId(), used: false };
        currentGesture = gesture;
        expireGesture(() => {
          if (currentGesture === gesture) currentGesture = null;
        }, 0);
      };
      for (const eventName of ["click", "submit", "change"]) {
        document.addEventListener(eventName, issueGesture, true);
      }

      const receiveGuestMessage = (message) => {
        if (!message || typeof message !== "object") return;
        if (
          message.channel_token !== channelToken ||
          message.protocol_version !== ${PROTOCOL_VERSION} ||
          message.sdk_version !== ${JSON.stringify(SDK_VERSION)}
        ) return;
        const outgoing = { ...message };
        delete outgoing.gesture_id;
        if (outgoing.type === "dot.app.request" && !readOnlyOperations.has(outgoing.operation)) {
          if (currentGesture && !currentGesture.used) {
            currentGesture.used = true;
            outgoing.gesture_id = currentGesture.id;
          }
        }
        relay(outgoing);
      };
      Object.defineProperty(window, "__DOT_APP_POST__", {
        configurable: false,
        enumerable: false,
        writable: false,
        value: receiveGuestMessage,
      });

      const startApp = () => {
        if (appStarted) return;
        appStarted = true;
        const script = document.createElement("script");
        script.textContent = bundleCode;
        script.addEventListener("error", () => reportError("app script failed to start"));
        document.body.appendChild(script);
      };

      window.addEventListener("message", (event) => {
        if (
          event.source !== window.parent ||
          !event.data ||
          event.data.type !== "dot.host.port" ||
          event.data.channel_token !== channelToken ||
          event.ports.length !== 1 ||
          hostPort
        ) return;
        hostPort = event.ports[0];
        hostPort.onmessage = (portEvent) => {
          const message = portEvent.data;
          if (!message || typeof message !== "object" || message.channel_token !== channelToken) return;
          window.dispatchEvent(new MessageEvent("message", {
            data: message,
            source: window.parent,
          }));
        };
        hostPort.start();
        while (queuedMessages.length) call(portPostMessage, hostPort, [queuedMessages.shift()]);
        // Start generated code only after this event has fully dispatched. It
        // never sees the transferred port, which remains in this closure.
        defer(startApp);
      });

      window.addEventListener("error", (event) => reportError(event.error || event.message));
      window.addEventListener("unhandledrejection", (event) => reportError(event.reason));
      Object.defineProperty(window, "__DOT_APP_CHANNEL_TOKEN__", {
        configurable: false,
        enumerable: false,
        writable: false,
        value: channelToken,
      });
      window.__DOT_APP_CONTEXT__ = { data: ${JSON.stringify(context)} };
    })();
  `;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; navigate-to 'none'">
<style>${escapeInlineStyle(sanitizeGeneratedAppCss(bundle.css))}</style>
</head><body><div id="dot-app-root"></div>
<script>${escapeInlineScript(bootstrap)}</script>
</body></html>`;
}

export function GeneratedAppIframe({
  bundle,
  context,
  title,
  capabilities,
  onRequest,
  onFallback,
}: GeneratedAppIframeProps) {
  const runtimeId = useId();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const contextRef = useRef(context);
  const requestHandlerRef = useRef(onRequest);
  const capabilitiesRef = useRef(capabilities);
  const fallbackRef = useRef(onFallback);
  const connectionRef = useRef<{ id: string; port: MessagePort } | null>(null);
  const inFlightRef = useRef(new Set<string>());
  const requestTimesRef = useRef<number[]>([]);
  const usedGesturesRef = useRef(new Set<string>());
  const [ready, setReady] = useState(false);
  const [height, setHeight] = useState(640);
  const [runtime] = useState(() => {
    // useId is stable across server rendering and hydration. The token scopes
    // messages, while the unexposed MessagePort is the actual security boundary.
    const token = `dot_${runtimeId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
    return { token, srcDoc: iframeDocument(bundle, context, token) };
  });

  useEffect(() => {
    requestHandlerRef.current = onRequest;
    capabilitiesRef.current = capabilities;
    fallbackRef.current = onFallback;
  }, [capabilities, onFallback, onRequest]);

  useEffect(() => () => {
    connectionRef.current?.port.close();
    connectionRef.current = null;
  }, []);

  function connectFrame() {
    const frame = frameRef.current;
    if (!frame?.contentWindow) return;
    connectionRef.current?.port.close();
    const channel = new MessageChannel();
    const connection = { id: crypto.randomUUID(), port: channel.port1 };
    connectionRef.current = connection;
    inFlightRef.current.clear();
    usedGesturesRef.current.clear();
    setReady(false);
    const channelToken = runtime.token;
    const respond = (requestId: string, payload: Record<string, unknown>) => {
      if (connectionRef.current?.id !== connection.id) return;
      connection.port.postMessage({
        type: "dot.app.response",
        protocol_version: PROTOCOL_VERSION,
        sdk_version: SDK_VERSION,
        channel_token: channelToken,
        request_id: requestId,
        ...payload,
      });
    };
    connection.port.onmessage = async (event: MessageEvent) => {
      if (connectionRef.current?.id !== connection.id || !isObject(event.data)) return;
      const message = event.data;
      if (
        message.channel_token !== channelToken ||
        message.protocol_version !== PROTOCOL_VERSION ||
        message.sdk_version !== SDK_VERSION
      ) return;
      if (message.type === "dot.app.ready") {
        setReady(true);
        return;
      }
      if (message.type === "dot.app.resize" && typeof message.height === "number") {
        setHeight(Math.max(560, Math.min(MAX_HEIGHT, Math.ceil(message.height))));
        return;
      }
      if (message.type === "dot.app.error") {
        fallbackRef.current();
        return;
      }
      if (message.type !== "dot.app.request") return;
      const request = runtimeRequest(message);
      if (!request) return;
      const mutation = !["app.data.get", "records.list"].includes(request.operation);
      if (mutation) {
        if (!request.gestureId || usedGesturesRef.current.has(request.gestureId)) {
          respond(request.requestId, {
            ok: false,
            error: {
              code: "user_gesture_required",
              message: "Changes must come directly from a tap or form submission",
            },
          });
          return;
        }
        usedGesturesRef.current.add(request.gestureId);
      }
      if (
        request.operation === "dot.reminder.create" &&
        !capabilitiesRef.current.includes("dot.reminder.create")
      ) {
        respond(request.requestId, {
          ok: false,
          error: { code: "capability_denied", message: "This app doesn't have reminder access" },
        });
        return;
      }
      if (request.operation === "records.delete" && !window.confirm("delete this item?")) {
        respond(request.requestId, {
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
          respond(request.requestId, {
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
        inFlightRef.current.size >= MAX_CONCURRENT_REQUESTS ||
        inFlightRef.current.has(request.requestId)
      ) {
        respond(request.requestId, {
          ok: false,
          error: { code: "rate_limited", message: "That app is doing too much at once" },
        });
        return;
      }
      requestTimesRef.current.push(now);
      inFlightRef.current.add(request.requestId);
      try {
        const result = await requestHandlerRef.current(
          request.operation,
          request.args,
          request.idempotencyKey,
        );
        respond(request.requestId, { ok: true, result });
      } catch (error) {
        respond(request.requestId, { ok: false, error: responseError(error) });
      } finally {
        inFlightRef.current.delete(request.requestId);
      }
    };
    connection.port.start();
    frame.contentWindow.postMessage({
      type: "dot.host.port",
      channel_token: channelToken,
    }, "*", [channel.port2]);
    connection.port.postMessage({
      type: "dot.app.context",
      protocol_version: PROTOCOL_VERSION,
      sdk_version: SDK_VERSION,
      channel_token: channelToken,
      data: contextRef.current,
    });
  }

  useEffect(() => {
    contextRef.current = context;
    connectionRef.current?.port.postMessage({
      type: "dot.app.context",
      protocol_version: PROTOCOL_VERSION,
      sdk_version: SDK_VERSION,
      channel_token: runtime.token,
      data: context,
    });
  }, [context, runtime.token]);

  return (
    <div className={styles.sandboxHost} aria-busy={!ready}>
      {!ready && <div className={styles.sandboxLoading}>opening the custom view…</div>}
      <iframe
        ref={frameRef}
        className={styles.sandboxFrame}
        title={title}
        sandbox="allow-scripts allow-forms"
        allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; clipboard-read 'none'; clipboard-write 'none'"
        referrerPolicy="no-referrer"
        srcDoc={runtime.srcDoc}
        style={{ height }}
        onLoad={connectFrame}
      />
    </div>
  );
}
