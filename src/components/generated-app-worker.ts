/// <reference lib="webworker" />

import QUICKJS_RELEASE_SYNC from "@jitl/quickjs-singlefile-browser-release-sync";
import {
  newQuickJSWASMModuleFromVariant,
  type QuickJSContext,
  type QuickJSHandle,
  type QuickJSRuntime,
} from "quickjs-emscripten-core";

const PROTOCOL_VERSION = 1;
const SDK_VERSION = "1";
const MEMORY_LIMIT_BYTES = 96 * 1024 * 1024;
const STACK_LIMIT_BYTES = 1024 * 1024;
const TURN_DEADLINE_MS = 1_500;
const MAX_EVENT_LOOP_TURNS = 80;
const MAX_MESSAGE_BYTES = 64_000;
const MAX_CONTEXT_BYTES = 1_000_000;
const MAX_JAVASCRIPT_BYTES = 2_750_000;
const MAX_GUEST_BYTES = 1_500_000;
const OPERATIONS = new Set([
  "app.data.get",
  "records.list",
  "records.create",
  "records.update",
  "records.delete",
  "dot.reminder.create",
]);
const MUTATIONS = new Set([
  "records.create",
  "records.update",
  "records.delete",
  "dot.reminder.create",
]);

type HostMessage = {
  type: string;
  channel_token?: string;
  javascript?: string;
  context?: unknown;
  request_id?: string;
  ok?: boolean;
  result?: unknown;
  error?: unknown;
  node_id?: string;
  event_type?: string;
  value?: string;
  checked?: boolean;
  fields?: Record<string, string | boolean>;
};

type GuestMessage = {
  type?: unknown;
  request?: unknown;
  html?: unknown;
  message?: unknown;
};

type GuestControls = {
  initialize: QuickJSHandle;
  step: QuickJSHandle;
  drain: QuickJSHandle;
  context: QuickJSHandle;
  response: QuickJSHandle;
  interaction: QuickJSHandle;
};

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
let channelToken: string | null = null;
let runtime: QuickJSRuntime | null = null;
let vm: QuickJSContext | null = null;
let controls: GuestControls | null = null;
let initialized = false;
let deadline = Number.POSITIVE_INFINITY;
let runtimeNonce: string | null = null;
const issuedGestureNonces = new Set<string>();

function send(type: string, payload: Record<string, unknown> = {}) {
  if (!channelToken) return;
  workerScope.postMessage({
    type,
    protocol_version: PROTOCOL_VERSION,
    sdk_version: SDK_VERSION,
    channel_token: channelToken,
    ...payload,
  });
}

function bytes(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function guestError(context: QuickJSContext, handle: QuickJSHandle) {
  try {
    const dumped = context.dump(handle);
    if (dumped && typeof dumped === "object") {
      const error = dumped as { stack?: unknown; message?: unknown };
      return String(error.stack || error.message || JSON.stringify(dumped));
    }
    return String(dumped);
  } catch {
    return "generated app runtime failed";
  }
}

function evaluate(context: QuickJSContext, code: string, filename: string) {
  const result = context.evalCode(code, filename);
  if (result.error) {
    const message = guestError(context, result.error);
    result.error.dispose();
    throw new Error(message);
  }
  result.value.dispose();
}

function callString(context: QuickJSContext, handle: QuickJSHandle, value?: string) {
  const argument = value === undefined ? null : context.newString(value);
  try {
    const result = argument
      ? context.callFunction(handle, context.undefined, argument)
      : context.callFunction(handle, context.undefined);
    if (result.error) {
      const message = guestError(context, result.error);
      result.error.dispose();
      throw new Error(message);
    }
    const output = context.getString(result.value);
    result.value.dispose();
    return output;
  } finally {
    argument?.dispose();
  }
}

function callNumber(context: QuickJSContext, handle: QuickJSHandle) {
  const result = context.callFunction(handle, context.undefined);
  if (result.error) {
    const message = guestError(context, result.error);
    result.error.dispose();
    throw new Error(message);
  }
  const output = context.getNumber(result.value);
  result.value.dispose();
  return output;
}

function drainEventLoop() {
  if (!runtime || !vm || !controls) return;
  for (let turn = 0; turn < MAX_EVENT_LOOP_TURNS; turn += 1) {
    const pending = runtime.executePendingJobs(100);
    if (pending.error) {
      const message = guestError(pending.error.context, pending.error);
      pending.error.dispose();
      throw new Error(message);
    }
    const jobs = pending.value;
    pending.dispose();
    const timers = callNumber(vm, controls.step);
    if (jobs === 0 && timers === 0 && !runtime.hasPendingJob()) return;
  }
  throw new Error("generated app event loop did not settle");
}

function parseGuestMessages(encoded: string): GuestMessage[] {
  if (bytes(encoded) > 1_100_000) throw new Error("generated app produced too much output");
  const parsed: unknown = JSON.parse(encoded);
  if (!Array.isArray(parsed) || parsed.length > 120) {
    throw new Error("generated app produced an invalid output envelope");
  }
  return parsed.filter(
    (value): value is GuestMessage => value !== null && typeof value === "object" && !Array.isArray(value),
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function trustedGuestRequest(value: unknown): Record<string, unknown> {
  if (!runtimeNonce || !isObject(value)) throw new Error("generated app emitted an invalid request");
  const operation = value.operation;
  const requestId = value.request_id;
  const idempotencyKey = value.idempotency_key;
  if (
    value.type !== "dot.app.request" ||
    value.protocol_version !== PROTOCOL_VERSION ||
    value.sdk_version !== SDK_VERSION ||
    typeof operation !== "string" ||
    !OPERATIONS.has(operation) ||
    typeof requestId !== "string" ||
    !requestId.startsWith(`${runtimeNonce}_req_`) ||
    !/^[a-zA-Z0-9_-]{16,128}$/.test(requestId) ||
    (idempotencyKey !== undefined && (
      typeof idempotencyKey !== "string" ||
      !idempotencyKey.startsWith(`${runtimeNonce}_idem_`) ||
      idempotencyKey.length > 160
    ))
  ) throw new Error("generated app request failed runtime validation");

  if (MUTATIONS.has(operation)) {
    const gestureNonce = value.gesture_nonce;
    if (typeof gestureNonce !== "string" || !issuedGestureNonces.delete(gestureNonce)) {
      throw new Error("generated app mutation was not bound to a user gesture");
    }
  }
  return {
    type: "dot.app.request",
    protocol_version: PROTOCOL_VERSION,
    sdk_version: SDK_VERSION,
    request_id: requestId,
    operation,
    args: value.args,
    ...(typeof idempotencyKey === "string" ? { idempotency_key: idempotencyKey } : {}),
  };
}

function flush() {
  if (!vm || !controls) return;
  drainEventLoop();
  for (const message of parseGuestMessages(callString(vm, controls.drain))) {
    if (message.type === "dot.worker.ready") send("dot.worker.ready");
    else if (message.type === "dot.worker.render" && typeof message.html === "string") {
      send("dot.worker.render", { html: message.html });
    } else if (message.type === "dot.worker.request" && message.request) {
      send("dot.worker.request", { request: trustedGuestRequest(message.request) });
    } else if (message.type === "dot.worker.error") {
      send("dot.worker.error", {
        message: typeof message.message === "string"
          ? message.message.slice(0, 800)
          : "generated app reported a runtime error",
      });
    }
  }
}

function callControl(handle: QuickJSHandle, payload: unknown, maxBytes = MAX_MESSAGE_BYTES) {
  if (!vm) return;
  const encoded = JSON.stringify(payload);
  if (bytes(encoded) > maxBytes) throw new Error("generated app message is too large");
  deadline = Date.now() + TURN_DEADLINE_MS;
  try {
    callString(vm, handle, encoded);
    flush();
  } finally {
    deadline = Number.POSITIVE_INFINITY;
  }
}

async function loadGuest() {
  const response = await fetch("/dot-generated-app-guest.js", {
    cache: "force-cache",
    credentials: "omit",
    redirect: "error",
  });
  if (!response.ok) throw new Error("generated app guest is unavailable");
  const guest = await response.text();
  if (bytes(guest) > MAX_GUEST_BYTES) throw new Error("generated app guest is invalid");
  return guest;
}

function dispose() {
  if (controls) {
    for (const handle of Object.values(controls)) {
      try { handle.dispose(); } catch {}
    }
  }
  controls = null;
  try { vm?.dispose(); } catch {}
  vm = null;
  try { runtime?.dispose(); } catch {}
  runtime = null;
}

async function start(message: HostMessage) {
  if (
    initialized ||
    typeof message.channel_token !== "string" ||
    typeof message.javascript !== "string" ||
    bytes(message.javascript) > MAX_JAVASCRIPT_BYTES
  ) return;
  initialized = true;
  channelToken = message.channel_token;
  runtimeNonce = `dot_${crypto.randomUUID().replaceAll("-", "_")}`;
  try {
    const [QuickJS, guest] = await Promise.all([
      newQuickJSWASMModuleFromVariant(QUICKJS_RELEASE_SYNC),
      loadGuest(),
    ]);
    runtime = QuickJS.newRuntime();
    runtime.setMemoryLimit(MEMORY_LIMIT_BYTES);
    runtime.setMaxStackSize(STACK_LIMIT_BYTES);
    runtime.setInterruptHandler(() => Date.now() >= deadline);
    vm = runtime.newContext();
    deadline = Date.now() + TURN_DEADLINE_MS;
    try {
      evaluate(vm, guest, "dot-runtime-guest.js");
    } finally {
      deadline = Number.POSITIVE_INFINITY;
    }
    controls = {
      initialize: vm.getProp(vm.global, "__dotRuntimeInitialize"),
      step: vm.getProp(vm.global, "__dotRuntimeStep"),
      drain: vm.getProp(vm.global, "__dotRuntimeDrain"),
      context: vm.getProp(vm.global, "__dotRuntimeContext"),
      response: vm.getProp(vm.global, "__dotRuntimeResponse"),
      interaction: vm.getProp(vm.global, "__dotRuntimeInteraction"),
    };
    evaluate(vm, `(() => {
      delete globalThis.__dotRuntimeInitialize;
      delete globalThis.__dotRuntimeStep;
      delete globalThis.__dotRuntimeDrain;
      delete globalThis.__dotRuntimeContext;
      delete globalThis.__dotRuntimeResponse;
      delete globalThis.__dotRuntimeInteraction;
    })()`, "dot-runtime-lockdown.js");
    callString(vm, controls.initialize, JSON.stringify({ runtime_nonce: runtimeNonce }));
    if (message.context !== undefined) callControl(controls.context, message.context, MAX_CONTEXT_BYTES);
    deadline = Date.now() + TURN_DEADLINE_MS;
    evaluate(vm, message.javascript, "dot-generated-app.js");
    flush();
    deadline = Number.POSITIVE_INFINITY;
  } catch (error) {
    send("dot.worker.error", {
      message: error instanceof Error ? error.message.slice(0, 800) : "generated app failed to start",
    });
    dispose();
  }
}

workerScope.addEventListener("message", (event: MessageEvent<HostMessage>) => {
  const message = event.data;
  if (message?.type === "dot.host.init") {
    void start(message);
    return;
  }
  if (!controls || !channelToken || message?.channel_token !== channelToken) return;
  try {
    if (message.type === "dot.host.context") {
      callControl(controls.context, message.context, MAX_CONTEXT_BYTES);
    } else if (message.type === "dot.host.response") callControl(controls.response, {
      request_id: message.request_id,
      ok: message.ok,
      result: message.result,
      error: message.error,
    }, MAX_CONTEXT_BYTES);
    else if (message.type === "dot.host.event") {
      const gestureNonce = `gesture_${crypto.randomUUID().replaceAll("-", "_")}`;
      issuedGestureNonces.add(gestureNonce);
      try {
        callControl(controls.interaction, {
          node_id: message.node_id,
          event_type: message.event_type,
          value: message.value,
          checked: message.checked,
          fields: message.fields,
          gesture_nonce: gestureNonce,
        });
      } finally {
        // A nonce can authorize at most one mutation during this exact event dispatch.
        issuedGestureNonces.delete(gestureNonce);
      }
    }
  } catch (error) {
    send("dot.worker.error", {
      message: error instanceof Error ? error.message.slice(0, 800) : "generated app action failed",
    });
    dispose();
  }
});

workerScope.addEventListener("error", () => dispose());

export {};
