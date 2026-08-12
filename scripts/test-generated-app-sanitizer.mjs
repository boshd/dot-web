import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import * as esbuild from "esbuild";

const result = await esbuild.build({
  entryPoints: [resolve("src/lib/generated-app-sanitizer.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  write: false,
  logLevel: "silent",
});
const output = result.outputFiles[0];
if (!output) throw new Error("sanitizer test bundle was not emitted");

const directory = await mkdtemp(join(tmpdir(), "dot-sanitizer-"));
try {
  const modulePath = join(directory, "sanitizer.mjs");
  await writeFile(modulePath, output.contents);
  const { sanitizeGeneratedAppCss, sanitizeGeneratedAppStaticHtml } = await import(
    pathToFileURL(modulePath).href
  );

  const fragment = sanitizeGeneratedAppStaticHtml(
    '<main class="planner"><h1>birthday plan</h1><button data-dot-node-id="dot_node_7">add</button></main>',
  );
  assert.match(fragment, /^<main/);
  assert.match(fragment, /birthday plan/);
  assert.match(fragment, /data-dot-node-id="dot_node_7"/);

  const completeDocument = sanitizeGeneratedAppStaticHtml(
    '<html><body><section>still visible</section></body></html>',
  );
  assert.match(completeDocument, /<section>still visible<\/section>/);
  assert.doesNotMatch(completeDocument, /<(?:html|body)\b/i);

  const hostile = sanitizeGeneratedAppStaticHtml(
    '<script>globalThis.pwned = true</script><a href="https://evil.test" onclick="pwn()">safe text</a>',
  );
  assert.doesNotMatch(hostile, /script|onclick|href/i);
  assert.match(hostile, /safe text/);

  assert.equal(sanitizeGeneratedAppCss(".card { color: tomato; }"), ".card { color: tomato; }");
  assert.equal(
    sanitizeGeneratedAppCss("* { scroll-behavior: auto; }"),
    "* { scroll-behavior: auto; }",
  );
  assert.equal(sanitizeGeneratedAppCss(".card { background: url(https://evil.test/x); }"), "");
  assert.equal(sanitizeGeneratedAppCss(".card { behavior: url(evil.htc); }"), "");
} finally {
  await rm(directory, { recursive: true, force: true });
}
