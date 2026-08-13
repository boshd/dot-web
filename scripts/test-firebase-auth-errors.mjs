import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import * as esbuild from "esbuild";

const result = await esbuild.build({
  entryPoints: [resolve("src/lib/firebase-auth-errors.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  write: false,
  logLevel: "silent",
});
const output = result.outputFiles[0];
if (!output) throw new Error("firebase-auth-errors test bundle was not emitted");

const directory = await mkdtemp(join(tmpdir(), "dot-auth-errors-"));
try {
  const modulePath = join(directory, "firebase-auth-errors.mjs");
  await writeFile(modulePath, output.contents);
  const { firebaseAuthErrorMessage } = await import(pathToFileURL(modulePath).href);
  const fallback = "I couldn’t start sign-in. Try again in a moment.";

  assert.equal(
    firebaseAuthErrorMessage({ code: "auth/unauthorized-domain" }, fallback),
    "This web address hasn’t been authorized for Dot sign-in yet.",
  );
  assert.equal(
    firebaseAuthErrorMessage({ code: "auth/invalid-app-credential" }, fallback),
    "Sign-in couldn’t complete the security check. Refresh and try again.",
  );
  assert.equal(
    firebaseAuthErrorMessage({ code: "auth/argument-error" }, fallback),
    "Sign-in couldn’t start the security check. Refresh and try again.",
  );
  assert.equal(
    firebaseAuthErrorMessage({ code: "auth/operation-not-allowed" }, fallback),
    "That sign-in method isn’t available right now. Try the other one.",
  );
  assert.equal(
    firebaseAuthErrorMessage(new Error("nope"), fallback),
    fallback,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
