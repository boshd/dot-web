import { parseHTML } from "linkedom/worker";

const PROTOCOL_VERSION = 1;
const SDK_VERSION = "1";
const MAX_TIMER_CALLBACKS_PER_STEP = 100;
const MAX_OUTBOUND_MESSAGES = 100;
const MAX_RENDER_NODES = 5_000;
const MAX_RENDER_BYTES = 256_000;
const MAX_JSON_DEPTH = 12;
const MAX_JSON_NODES = 2_000;

// Generated code shares the QuickJS realm with this bridge. Capture every intrinsic used by
// trusted code before the generated bundle can replace JSON methods or poison prototypes.
const reflectApply = Reflect.apply;
const objectCreate = Object.create;
const objectDefineProperties = Object.defineProperties;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectKeys = Object.keys;
const objectPrototype = Object.prototype;
const arrayFrom = Array.from;
const arrayIsArray = Array.isArray;
const arrayPushMethod = Array.prototype.push;
const arrayShiftMethod = Array.prototype.shift;
const arraySpliceMethod = Array.prototype.splice;
const stringCodePointAtMethod = String.prototype.codePointAt;
const stringPadStartMethod = String.prototype.padStart;
const stringReplaceMethod = String.prototype.replace;
const stringSliceMethod = String.prototype.slice;
const stringTrimMethod = String.prototype.trim;
const mapDeleteMethod = Map.prototype.delete;
const mapEntriesMethod = Map.prototype.entries;
const mapGetMethod = Map.prototype.get;
const mapSetMethod = Map.prototype.set;
const setHasMethod = Set.prototype.has;
const weakMapGetMethod = WeakMap.prototype.get;
const weakMapSetMethod = WeakMap.prototype.set;
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const stringConvert = String;
const numberConvert = Number;
const errorConstructor = Error;
const promiseResolve = Promise.resolve.bind(Promise);
const dateNow = Date.now;
const numberIsFinite = Number.isFinite;
const mathMax = Math.max;

const arrayPush = (target, value) => reflectApply(arrayPushMethod, target, [value]);
const arrayShift = (target) => reflectApply(arrayShiftMethod, target, []);
const arraySpliceAll = (target) => reflectApply(arraySpliceMethod, target, [0, target.length]);
const stringCodePointAt = (value, index) => reflectApply(stringCodePointAtMethod, value, [index]);
const stringPadStart = (value, length, fill) => reflectApply(stringPadStartMethod, value, [length, fill]);
const stringReplace = (value, pattern, replacement) => reflectApply(stringReplaceMethod, value, [pattern, replacement]);
const stringSlice = (value, start, end) => reflectApply(stringSliceMethod, value, [start, end]);
const stringTrim = (value) => reflectApply(stringTrimMethod, value, []);
const mapDelete = (target, key) => reflectApply(mapDeleteMethod, target, [key]);
const mapEntries = (target) => reflectApply(mapEntriesMethod, target, []);
const mapGet = (target, key) => reflectApply(mapGetMethod, target, [key]);
const mapSet = (target, key, value) => reflectApply(mapSetMethod, target, [key, value]);
const setHas = (target, value) => reflectApply(setHasMethod, target, [value]);
const weakMapGet = (target, key) => reflectApply(weakMapGetMethod, target, [key]);
const weakMapSet = (target, key, value) => reflectApply(weakMapSetMethod, target, [key, value]);
const safeNow = () => reflectApply(dateNow, Date, []);

const MUTATIONS = objectFreeze(new Set([
  "records.create",
  "records.update",
  "records.delete",
  "dot.reminder.create",
]));

const state = {
  activeGesture: null,
  context: undefined,
  errors: [],
  outbound: [],
  pendingRequests: new Map(),
  ready: false,
  runtimeNonce: null,
};

const { window } = parseHTML(
  '<!doctype html><html><head></head><body><div id="dot-app-root"></div></body></html>',
);
const root = window.document.getElementById("dot-app-root");
const timerQueue = new Map();
const nodeIds = new WeakMap();
const documentQuerySelector = window.document.querySelector.bind(window.document);
const rootQuerySelectorAll = root.querySelectorAll.bind(root);
const windowDispatchEvent = window.dispatchEvent.bind(window);
const windowAddEventListener = window.addEventListener.bind(window);
const elementQuerySelectorMethod = window.Element.prototype.querySelector;
const elementSetAttributeMethod = window.Element.prototype.setAttribute;
const eventConstructor = window.Event;
let domPrototype = root;
let rootInnerHTMLGetter;
let targetDispatchEventMethod;
while (domPrototype) {
  const innerHTMLDescriptor = objectGetOwnPropertyDescriptor(domPrototype, "innerHTML");
  if (!rootInnerHTMLGetter && typeof innerHTMLDescriptor?.get === "function") {
    rootInnerHTMLGetter = innerHTMLDescriptor.get;
  }
  const dispatchDescriptor = objectGetOwnPropertyDescriptor(domPrototype, "dispatchEvent");
  if (!targetDispatchEventMethod && typeof dispatchDescriptor?.value === "function") {
    targetDispatchEventMethod = dispatchDescriptor.value;
  }
  domPrototype = objectGetPrototypeOf(domPrototype);
}
let nextTimerId = 1;
let nextNodeId = 1;
let nextRequestId = 1;
let nextIdempotencyId = 1;

function ownData(value, name) {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return undefined;
  const descriptor = objectGetOwnPropertyDescriptor(value, name);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function safeJsonCopy(value, depth = 0, budget = { nodes: 0 }) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return numberIsFinite(value) ? value : null;
  if (value === undefined) return undefined;
  if (typeof value !== "object" || depth > MAX_JSON_DEPTH || budget.nodes >= MAX_JSON_NODES) {
    throw new errorConstructor("generated app request contains invalid data");
  }
  budget.nodes += 1;
  if (arrayIsArray(value)) {
    const result = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = objectGetOwnPropertyDescriptor(value, stringConvert(index));
      const item = descriptor && "value" in descriptor
        ? safeJsonCopy(descriptor.value, depth + 1, budget)
        : null;
      arrayPush(result, item === undefined ? null : item);
    }
    return result;
  }
  const prototype = objectGetPrototypeOf(value);
  if (prototype !== objectPrototype && prototype !== null) {
    throw new errorConstructor("generated app request contains an unsupported object");
  }
  const result = objectCreate(null);
  const descriptors = objectGetOwnPropertyDescriptors(value);
  for (const key of objectKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !("value" in descriptor)) continue;
    const item = safeJsonCopy(descriptor.value, depth + 1, budget);
    if (item !== undefined) result[key] = item;
  }
  return result;
}

function utf8ByteLength(value) {
  let bytes = 0;
  for (const character of value) {
    const codePoint = stringCodePointAt(character, 0);
    if (codePoint <= 0x7f) bytes += 1;
    else if (codePoint <= 0x7ff) bytes += 2;
    else if (codePoint <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

function errorText(value) {
  if (value && typeof value === "object") {
    const stack = ownData(value, "stack");
    const message = ownData(value, "message");
    if (typeof stack === "string") return stack;
    if (typeof message === "string") return message;
  }
  try { return stringConvert(value); } catch { return "generated app runtime error"; }
}

function capture(value) {
  if (state.errors.length >= 12) return;
  arrayPush(state.errors, stringSlice(errorText(value), 0, 800));
}

function enqueue(message) {
  if (state.outbound.length >= MAX_OUTBOUND_MESSAGES) {
    capture("generated app emitted too many messages");
    return;
  }
  arrayPush(state.outbound, message);
}

function scheduleTimer(callback, delay = 0, repeat = false, args = []) {
  const id = nextTimerId++;
  mapSet(timerQueue, id, {
    callback,
    delay: mathMax(0, numberConvert(delay) || 0),
    repeat,
    args,
  });
  return id;
}

function clearTimer(id) {
  mapDelete(timerQueue, numberConvert(id));
}

function runTimers() {
  let ran = 0;
  const entries = arrayFrom(mapEntries(timerQueue));
  for (const entry of entries) {
    const id = entry[0];
    const timer = entry[1];
    if (timer.delay > 100) continue;
    if (ran >= MAX_TIMER_CALLBACKS_PER_STEP) {
      capture("generated app scheduled too many timer callbacks");
      break;
    }
    if (!timer.repeat) mapDelete(timerQueue, id);
    try {
      reflectApply(timer.callback, undefined, timer.args);
    } catch (error) {
      capture(error);
    }
    ran += 1;
  }
  return ran;
}

function messageEvent(data, source) {
  const event = new eventConstructor("message");
  objectDefineProperties(event, {
    data: { configurable: true, enumerable: true, value: data },
    source: { configurable: true, enumerable: true, value: source },
  });
  return event;
}

function dispatchWindowMessage(data, source) {
  windowDispatchEvent(messageEvent(data, source));
}

function rejectRequest(requestId, code, message) {
  dispatchWindowMessage({
    type: "dot.app.response",
    protocol_version: PROTOCOL_VERSION,
    sdk_version: SDK_VERSION,
    request_id: requestId,
    ok: false,
    error: { code, message },
  }, bridgeParent);
}

function hostRequest(message, operation, guestRequestId, gestureNonce) {
  const hostRequestId = `${state.runtimeNonce}_req_${nextRequestId++}`;
  mapSet(state.pendingRequests, hostRequestId, guestRequestId);
  const request = {
    type: "dot.app.request",
    protocol_version: PROTOCOL_VERSION,
    sdk_version: SDK_VERSION,
    request_id: hostRequestId,
    operation,
    args: safeJsonCopy(ownData(message, "args") ?? objectCreate(null)),
  };
  const suppliedIdempotency = ownData(message, "idempotency_key");
  if (typeof suppliedIdempotency === "string" || setHas(MUTATIONS, operation)) {
    request.idempotency_key = `${state.runtimeNonce}_idem_${nextIdempotencyId++}`;
  }
  if (gestureNonce) request.gesture_nonce = gestureNonce;
  return request;
}

const bridgeParent = objectFreeze({
  postMessage(message) {
    if (!message || typeof message !== "object") return;
    const type = ownData(message, "type");
    if (type === "dot.app.ready") {
      state.ready = true;
      enqueue({ type: "dot.worker.ready" });
      return;
    }
    if (type === "dot.app.resize") return;
    if (type === "dot.app.error") {
      const error = ownData(message, "error");
      const reported = ownData(error, "message");
      capture(typeof reported === "string" ? reported : "app reported a runtime error");
      enqueue({ type: "dot.worker.error", message: typeof reported === "string" ? reported : undefined });
      return;
    }
    if (type !== "dot.app.request") return;
    const operation = ownData(message, "operation");
    const guestRequestId = ownData(message, "request_id");
    if (
      typeof operation !== "string" ||
      typeof guestRequestId !== "string" ||
      guestRequestId.length < 1 ||
      guestRequestId.length > 256
    ) {
      capture("app emitted an invalid request");
      return;
    }
    let gestureNonce;
    if (setHas(MUTATIONS, operation)) {
      const gesture = state.activeGesture;
      if (!gesture || gesture.used || safeNow() > gesture.expiresAt) {
        rejectRequest(guestRequestId, "user_gesture_required", "Changes must come from a user gesture");
        return;
      }
      gesture.used = true;
      gestureNonce = gesture.nonce;
    }
    try {
      enqueue({
        type: "dot.worker.request",
        request: hostRequest(message, operation, guestRequestId, gestureNonce),
      });
    } catch (error) {
      capture(error);
      rejectRequest(guestRequestId, "invalid_request", "That app action contains invalid data");
    }
  },
});

const appContext = { data: state.context };
objectDefineProperties(window, {
  parent: { configurable: false, writable: false, value: bridgeParent },
  postMessage: { configurable: false, writable: false, value: () => undefined },
  __DOT_APP_CONTEXT__: {
    configurable: false,
    writable: false,
    value: appContext,
  },
});

const safeConsole = objectFreeze({
  log() {},
  info() {},
  debug() {},
  warn() {},
  error(...args) {
    let message = "";
    for (const value of args) message += `${message ? " " : ""}${errorText(value)}`;
    capture(message);
  },
});

const globals = {
  window,
  self: window,
  document: window.document,
  navigator: objectFreeze({ userAgent: "DotAppRuntime/QuickJS", language: "en" }),
  location: objectFreeze({
    href: "https://generated.invalid/",
    origin: "https://generated.invalid",
    protocol: "https:",
  }),
  console: safeConsole,
  Node: window.Node,
  Element: window.Element,
  HTMLElement: window.HTMLElement,
  SVGElement: window.SVGElement,
  DocumentFragment: window.DocumentFragment,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MutationObserver: window.MutationObserver,
  getComputedStyle: () => ({ display: "block", getPropertyValue: () => "" }),
  setTimeout: (callback, delay, ...args) => scheduleTimer(callback, delay, false, args),
  clearTimeout: clearTimer,
  setInterval: (callback, delay, ...args) => scheduleTimer(callback, delay, true, args),
  clearInterval: clearTimer,
  setImmediate: (callback, ...args) => scheduleTimer(callback, 0, false, args),
  clearImmediate: clearTimer,
  queueMicrotask: (callback) => promiseResolve().then(callback),
  requestAnimationFrame: (callback) => scheduleTimer(() => callback(safeNow()), 0),
  cancelAnimationFrame: clearTimer,
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
  crypto: objectFreeze({
    randomUUID() {
      const suffix = stringPadStart(stringConvert(nextNodeId++), 12, "0");
      return `00000000-0000-4000-8000-${suffix}`;
    },
  }),
};

Object.assign(globalThis, globals);
Object.assign(window, globals);

for (const name of [
  "fetch", "XMLHttpRequest", "WebSocket", "EventSource", "Worker", "SharedWorker",
  "BroadcastChannel", "WebAssembly", "process", "require", "module", "Deno", "Bun",
  "indexedDB", "localStorage", "sessionStorage", "caches", "SharedArrayBuffer",
]) {
  try { delete globalThis[name]; } catch { globalThis[name] = undefined; }
  try { delete window[name]; } catch { window[name] = undefined; }
}

windowAddEventListener("error", (event) => capture(ownData(event, "error") || ownData(event, "message") || "window error"));
windowAddEventListener("unhandledrejection", (event) => capture(ownData(event, "reason") || "rejected promise"));

function renderSnapshot() {
  if (!root) return null;
  const elements = arrayFrom(rootQuerySelectorAll("*"));
  if (elements.length > MAX_RENDER_NODES) throw new errorConstructor("generated app rendered too many elements");
  for (const element of elements) {
    let nodeId = weakMapGet(nodeIds, element);
    if (!nodeId) {
      nodeId = `dot_node_${nextNodeId++}`;
      weakMapSet(nodeIds, element, nodeId);
    }
    reflectApply(elementSetAttributeMethod, element, ["data-dot-node-id", nodeId]);
  }
  const html = reflectApply(rootInnerHTMLGetter, root, []);
  if (utf8ByteLength(html) > MAX_RENDER_BYTES) {
    throw new errorConstructor("generated app rendered too much content");
  }
  return html;
}

function drain() {
  const messages = arraySpliceAll(state.outbound);
  if (state.errors.length) {
    arrayPush(messages, { type: "dot.worker.error", message: arrayShift(state.errors) });
  }
  const html = renderSnapshot();
  if (state.ready && typeof html === "string" && stringTrim(html)) {
    arrayPush(messages, { type: "dot.worker.render", html });
  }
  return jsonStringify(messages);
}

function step() {
  return runTimers();
}

function initialize(encoded) {
  const data = jsonParse(encoded);
  const runtimeNonce = ownData(data, "runtime_nonce");
  if (
    state.runtimeNonce ||
    typeof runtimeNonce !== "string" ||
    !/^[a-zA-Z0-9_-]{16,96}$/.test(runtimeNonce)
  ) throw new errorConstructor("generated app runtime nonce is invalid");
  state.runtimeNonce = runtimeNonce;
  return true;
}

function context(encoded) {
  const data = jsonParse(encoded);
  state.context = data;
  appContext.data = data;
  dispatchWindowMessage({
    type: "dot.app.context",
    protocol_version: PROTOCOL_VERSION,
    sdk_version: SDK_VERSION,
    data,
  }, bridgeParent);
}

function response(encoded) {
  const message = jsonParse(encoded);
  const hostRequestId = ownData(message, "request_id");
  if (typeof hostRequestId !== "string") return;
  const guestRequestId = mapGet(state.pendingRequests, hostRequestId);
  if (typeof guestRequestId !== "string") return;
  mapDelete(state.pendingRequests, hostRequestId);
  dispatchWindowMessage({
    type: "dot.app.response",
    protocol_version: PROTOCOL_VERSION,
    sdk_version: SDK_VERSION,
    request_id: guestRequestId,
    ok: ownData(message, "ok"),
    result: ownData(message, "result"),
    error: ownData(message, "error"),
  }, bridgeParent);
}

function interaction(encoded) {
  const message = jsonParse(encoded);
  const nodeIdValue = ownData(message, "node_id");
  const gestureNonce = ownData(message, "gesture_nonce");
  if (
    typeof nodeIdValue !== "string" ||
    typeof gestureNonce !== "string" ||
    !/^[a-zA-Z0-9_-]{16,128}$/.test(gestureNonce)
  ) return false;
  const nodeId = stringReplace(nodeIdValue, /[^a-zA-Z0-9_-]/g, "");
  const target = documentQuerySelector(`[data-dot-node-id="${nodeId}"]`);
  if (!target) return false;
  const fields = ownData(message, "fields");
  if (fields && typeof fields === "object") {
    const descriptors = objectGetOwnPropertyDescriptors(fields);
    for (const name of objectKeys(descriptors)) {
      const descriptor = descriptors[name];
      if (!("value" in descriptor)) continue;
      const safeName = stringReplace(name, /[^a-zA-Z0-9_-]/g, "");
      const field = reflectApply(elementQuerySelectorMethod, target, [`[name="${safeName}"]`]);
      if (!field) continue;
      if (typeof descriptor.value === "boolean") field.checked = descriptor.value;
      else field.value = stringConvert(descriptor.value);
    }
  }
  const value = ownData(message, "value");
  const checked = ownData(message, "checked");
  if (typeof value === "string") target.value = value;
  if (typeof checked === "boolean") target.checked = checked;
  const eventType = ownData(message, "event_type");
  const gesture = { nonce: gestureNonce, expiresAt: safeNow() + 4_000, used: false };
  state.activeGesture = gesture;
  try {
    reflectApply(targetDispatchEventMethod, target, [new eventConstructor(
      typeof eventType === "string" ? eventType : "click",
      { bubbles: true, cancelable: true },
    )]);
  } finally {
    // The capability is bound to this synchronous event dispatch, not a four-second ambient flag.
    if (state.activeGesture === gesture) state.activeGesture = null;
  }
  return true;
}

// Freezing the core prototypes is defense in depth. Trusted bridge code above uses captured
// operations, so replacing globals is also insufficient to forge requests or test output.
for (const intrinsic of [
  Object.prototype,
  Array.prototype,
  Function.prototype,
  String.prototype,
  Number.prototype,
  Boolean.prototype,
  RegExp.prototype,
  Date.prototype,
  Map.prototype,
  Set.prototype,
  WeakMap.prototype,
  Promise.prototype,
  JSON,
  Reflect,
]) {
  try { objectFreeze(intrinsic); } catch {}
}
domPrototype = objectGetPrototypeOf(root);
while (domPrototype && domPrototype !== objectPrototype) {
  try { objectFreeze(domPrototype); } catch {}
  domPrototype = objectGetPrototypeOf(domPrototype);
}

objectDefineProperties(globalThis, {
  __dotRuntimeInitialize: { configurable: true, writable: false, value: initialize },
  __dotRuntimeStep: { configurable: true, writable: false, value: step },
  __dotRuntimeDrain: { configurable: true, writable: false, value: drain },
  __dotRuntimeContext: { configurable: true, writable: false, value: context },
  __dotRuntimeResponse: { configurable: true, writable: false, value: response },
  __dotRuntimeInteraction: { configurable: true, writable: false, value: interaction },
});
