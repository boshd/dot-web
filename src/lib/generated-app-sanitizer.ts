import { DOMParser } from "linkedom";

const MAX_STATIC_HTML_BYTES = 256_000;
const MAX_STATIC_NODES = 5_000;

const ALLOWED_TAGS = new Set([
  "a", "article", "aside", "b", "blockquote", "br", "button", "caption", "code", "col",
  "colgroup", "dd", "del", "details", "div", "dl", "dt", "em", "fieldset", "figcaption",
  "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "i",
  "input", "label", "legend", "li", "main", "mark", "meter", "nav", "ol", "option", "output",
  "p", "pre", "progress", "section", "select", "small", "span", "strong", "sub", "summary",
  "sup", "table", "tbody", "td", "textarea", "tfoot", "th", "thead", "time", "tr", "u", "ul",
  "circle", "clippath", "defs", "ellipse", "g", "lineargradient", "line", "path", "polygon",
  "polyline", "rect", "stop", "svg", "text", "tspan",
]);

const DROP_WITH_CONTENT = new Set([
  "base", "canvas", "embed", "iframe", "link", "meta", "noscript", "object", "picture", "script",
  "source", "style", "template", "video", "audio",
]);

const ALLOWED_ATTRIBUTES = new Set([
  "abbr", "aria-atomic", "aria-busy", "aria-checked", "aria-controls", "aria-current",
  "aria-describedby", "aria-disabled", "aria-expanded", "aria-haspopup", "aria-hidden", "aria-label",
  "aria-labelledby", "aria-live", "aria-pressed", "aria-readonly", "aria-required", "aria-selected",
  "aria-valuemax", "aria-valuemin", "aria-valuenow", "aria-valuetext", "autocomplete", "checked",
  "class", "colspan", "datetime", "disabled", "for", "height", "id", "max", "maxlength", "min",
  "minlength", "multiple", "name", "open", "placeholder", "readonly", "required", "role", "rows",
  "rowspan", "selected", "size", "step", "title", "type", "value", "width",
  "clip-path", "cx", "cy", "d", "fill", "fill-opacity", "gradienttransform", "gradientunits", "offset",
  "opacity", "pathlength", "points", "preserveaspectratio", "r", "rx", "ry", "spreadmethod",
  "stop-color", "stop-opacity", "stroke", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap",
  "stroke-linejoin", "stroke-miterlimit", "stroke-opacity", "stroke-width", "transform", "viewbox",
  "vector-effect", "x", "x1", "x2", "y", "y1", "y2",
]);

const SAFE_INPUT_TYPES = new Set([
  "button", "checkbox", "date", "datetime-local", "email", "month", "number", "radio", "range",
  "reset", "search", "submit", "tel", "text", "time", "week",
]);

function safeAttribute(name: string, value: string, tag: string): string | null {
  const lower = name.toLowerCase();
  if (lower.startsWith("on") || lower === "formaction") return null;
  if (lower === "style") {
    if (
      value.length > 4_000 ||
      /\\|@import\b|url\s*\(|image-set\s*\(|src\s*\(|expression\s*\(|(?:^|[;{])\s*behavior\s*:|(?:https?:)?\/\/|(?:javascript|data|blob|file)\s*:/i.test(value)
    ) return null;
    return value;
  }
  if (lower === "data-dot-node-id") {
    return /^dot_node_\d{1,10}$/.test(value) ? value : null;
  }
  if (!ALLOWED_ATTRIBUTES.has(lower)) return null;
  if (["fill", "stroke", "clip-path"].includes(lower)) {
    if (value.includes("\\")) return null;
    if (/url\s*\(/i.test(value)) {
      return /^url\(#[a-zA-Z][a-zA-Z0-9_-]{0,127}\)$/.test(value) ? value : null;
    }
  }
  if (lower === "type" && tag === "input") {
    return SAFE_INPUT_TYPES.has(value.toLowerCase()) ? value.toLowerCase() : "text";
  }
  return value.slice(0, 2_000);
}

export function sanitizeGeneratedAppStaticHtml(raw: string) {
  if (!raw.trim()) throw new Error("Generated app returned no view");
  if (new TextEncoder().encode(raw).byteLength > MAX_STATIC_HTML_BYTES) {
    throw new Error("Generated app view is too large");
  }

  // linkedom treats a bare fragment as the document element and leaves document.body
  // empty. Parsing through a template preserves fragments without executing anything.
  const document = new DOMParser().parseFromString(
    "<!doctype html><html><head></head><body></body></html>",
    "text/html",
  );
  const template = document.createElement("template", {});
  template.innerHTML = raw;
  const root = template.content as DocumentFragment;
  let nodes = 0;
  for (const element of Array.from(root.querySelectorAll("*"))) {
    nodes += 1;
    if (nodes > MAX_STATIC_NODES) throw new Error("Generated app view has too many elements");
    const tag = element.localName.toLowerCase();
    if (DROP_WITH_CONTENT.has(tag)) {
      element.remove();
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      const parent = element.parentNode;
      if (parent) {
        for (const child of Array.from(element.childNodes)) parent.insertBefore(child, element);
        parent.removeChild(element);
      }
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const value = safeAttribute(attribute.name, attribute.value, tag);
      if (value === null) element.removeAttribute(attribute.name);
      else element.setAttribute(attribute.name, value);
    }
    if (tag === "a") {
      element.removeAttribute("href");
      element.removeAttribute("target");
      element.removeAttribute("rel");
    }
    if (tag === "form") {
      element.removeAttribute("action");
      element.removeAttribute("method");
    }
  }
  // linkedom caches template.innerHTML, so serialize the mutated fragment nodes.
  return Array.from(root.childNodes).map((node) => node.toString()).join("");
}

export function sanitizeGeneratedAppCss(css: string) {
  if (
    css.length > 350_000 ||
    /@import\b|url\s*\(|image-set\s*\(|src\s*\(|expression\s*\(|(?:^|[;{])\s*behavior\s*:|javascript\s*:/i.test(css)
  ) return "";
  return css;
}
