import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as esbuild from "esbuild";

const directory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(directory, "..");
const outputPath = resolve(projectRoot, "public/dot-generated-app-guest.js");
const workerOutputPath = resolve(projectRoot, "public/dot-generated-app-worker.js");

const result = await esbuild.build({
  entryPoints: [resolve(projectRoot, "src/generated-app-guest/runtime-guest.mjs")],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: true,
  legalComments: "none",
  sourcemap: false,
  logLevel: "silent",
  banner: {
    js: `globalThis.atob ||= (input) => {
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      let bits = 0, value = 0, output = "";
      for (const char of String(input).replace(/=+$/, "")) {
        const index = alphabet.indexOf(char);
        if (index < 0) continue;
        value = (value << 6) | index;
        bits += 6;
        if (bits >= 8) { bits -= 8; output += String.fromCharCode((value >> bits) & 255); }
      }
      return output;
    };`,
  },
});

const output = result.outputFiles[0];
if (!output) throw new Error("could not bundle generated app guest");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, output.contents);

await esbuild.build({
  entryPoints: [resolve(projectRoot, "src/components/generated-app-worker.ts")],
  bundle: true,
  write: true,
  outfile: workerOutputPath,
  format: "esm",
  platform: "browser",
  target: "es2020",
  minify: true,
  legalComments: "none",
  sourcemap: false,
  logLevel: "silent",
});
