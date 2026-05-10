import { mkdir, rm, copyFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = path.join(root, "dist");
const debug = process.argv.includes("--debug");

const entries = [
  {
    input: "content/content-script.js",
    output: "content/content-script.js",
    name: "VideoPitchTunerContent"
  },
  {
    input: "popup/popup.js",
    output: "popup/popup.js",
    name: "VideoPitchTunerPopup"
  },
  {
    input: "audio/pitch-shift-worklet.js",
    output: "audio/pitch-shift-worklet.js",
    name: "VideoPitchTunerPitchShiftWorklet"
  }
];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await copyStaticFiles();

for (const entry of entries) {
  await buildEntry(entry);
}

async function buildEntry(entry) {
  await build({
    root,
    configFile: false,
    define: {
      __DEBUG__: JSON.stringify(debug)
    },
    build: {
      emptyOutDir: false,
      minify: debug ? false : "esbuild",
      sourcemap: debug,
      target: "es2020",
      outDir: dist,
      lib: {
        entry: path.join(root, entry.input),
        name: entry.name,
        formats: ["iife"],
        fileName: () => entry.output
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true
        }
      }
    }
  });
}

async function copyStaticFiles() {
  await copyFile(path.join(root, "manifest.json"), path.join(dist, "manifest.json"));

  await mkdir(path.join(dist, "popup"), { recursive: true });
  await copyFile(path.join(root, "popup", "popup.html"), path.join(dist, "popup", "popup.html"));
  await copyFile(path.join(root, "popup", "popup.css"), path.join(dist, "popup", "popup.css"));

  await mkdir(path.join(dist, "icons"), { recursive: true });
  for (const icon of await readdir(path.join(root, "icons"))) {
    await copyFile(path.join(root, "icons", icon), path.join(dist, "icons", icon));
  }
}
