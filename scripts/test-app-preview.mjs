import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import * as esbuild from "esbuild";

const result = await esbuild.build({
  entryPoints: [resolve("src/lib/app-preview.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  write: false,
  logLevel: "silent",
});
const output = result.outputFiles[0];
if (!output) throw new Error("app-preview test bundle was not emitted");

const directory = await mkdtemp(join(tmpdir(), "dot-app-preview-"));
try {
  const modulePath = join(directory, "app-preview.mjs");
  await writeFile(modulePath, output.contents);
  const { FALLBACK_APP_PREVIEW, appInitials, buildAppPageMetadata } = await import(
    pathToFileURL(modulePath).href
  );

  assert.equal(appInitials("Portugal Trip Hub"), "PT");
  assert.equal(appInitials("Packing"), "P");
  assert.equal(appInitials("A packing list"), "PL");
  assert.equal(appInitials("Trip to Portugal"), "TP");
  assert.equal(appInitials(""), "D");
  assert.equal(appInitials("   "), "D");
  assert.equal(appInitials("🎉"), "D");

  const metadata = buildAppPageMetadata("app_public_id_example_01", {
    title: "Portugal Trip Hub",
    description: "Keep the week organized.",
  });
  assert.equal(metadata.title, "Portugal Trip Hub · Dot");
  assert.equal(metadata.description, "Keep the week organized.");
  assert.equal(metadata.openGraph?.siteName, "Dot");
  assert.equal(metadata.openGraph?.title, "Portugal Trip Hub");
  assert.equal(metadata.twitter?.card, "summary_large_image");
  assert.equal(metadata.appleWebApp?.title, "Portugal Trip Hub");
  assert.equal(metadata.robots?.index, false);
  assert.equal(
    metadata.manifest,
    "/a/app_public_id_example_01/manifest.webmanifest",
  );
  assert.equal(String(metadata.metadataBase), "https://app.textdot.co/");

  const fallback = buildAppPageMetadata("missing", FALLBACK_APP_PREVIEW);
  assert.equal(fallback.title, "Dot app");
  assert.equal(fallback.appleWebApp?.title, "Dot app");
} finally {
  await rm(directory, { recursive: true, force: true });
}
