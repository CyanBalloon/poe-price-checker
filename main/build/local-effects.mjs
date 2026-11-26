import path from "node:path";
import fs from "node:fs";
import esbuild from "esbuild";

export async function buildLocalEffects(mainDir) {
  const dist = path.join(mainDir, "dist");
  await esbuild.build({ entryPoints: [path.join(mainDir, "src/local-effects/preload.ts")], platform: "node",
    bundle: true, external: ["electron"], outfile: path.join(dist, "effects-preload.js") });
  if (process.platform !== "win32") return;
  const destination = path.join(dist, "local-effects");
  fs.cpSync(path.join(mainDir, "build/effect-tools"), destination, { recursive: true });
  await esbuild.build({ entryPoints: [path.join(mainDir, "src/local-effects/worker.mjs")], bundle: true,
    platform: "node", format: "esm", target: "node22", outfile: path.join(destination, "worker.mjs"),
    banner: { js: 'import { createRequire as workerRequire } from "node:module"; const require = workerRequire(import.meta.url);' } });
  fs.copyFileSync(path.join(mainDir, "..", "LICENSE"), path.join(destination, "application-LICENSE.txt"));
  for (const name of ["ooz-wasm", "tex-decoder", "bireader", "pngjs"]) {
    fs.copyFileSync(path.join(mainDir, "node_modules", name, "LICENSE"), path.join(destination, name + "-LICENSE.txt"));
  }
}
