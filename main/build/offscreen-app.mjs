import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import asar from "@electron/asar";
import { _electron as electron } from "playwright-core";

const switchName = "poe-offscreen-test";

export async function withOffscreenApp(executablePath, run, existingProfile) {
  const directory = path.dirname(path.resolve(executablePath));
  const resources = process.platform === "darwin" ? path.join(directory, "..", "Resources") : path.join(directory, "resources");
  // Older packages ignore the switch and immediately focus their normal window.
  const main = asar.extractFile(path.join(resources, "app.asar"), "main.js");
  if (!main.includes(switchName)) throw new Error("This build predates offscreen testing. Rebuild the unpacked app to run this check.");

  const profile = existingProfile ?? await mkdtemp(path.join(os.tmpdir(), "poe-offscreen-"));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({
      executablePath,
      args: [`--${switchName}`, `--user-data-dir=${profile}`, "--no-updates", "--force-color-profile=srgb"],
      env,
    });
    const page = await app.firstWindow();
    const window = await app.browserWindow(page);
    const state = await window.evaluate(win => ({
      offscreen: win.webContents.isOffscreen(), visible: win.isVisible(), focusable: win.isFocusable(), focused: win.isFocused(),
    }));
    assert.deepEqual(state, { offscreen: true, visible: false, focusable: false, focused: false });
    return await run({ app, page, window });
  } finally {
    try {
      await app?.close();
    } finally {
      if (!existingProfile) await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
    }
  }
}
