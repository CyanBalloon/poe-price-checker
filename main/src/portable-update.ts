import { app } from "electron";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import type { UpdateDownloadedEvent } from "electron-updater";

export async function restartPortable(target: string, update: UpdateDownloadedEvent) {
  const expectedName = `poe-price-checker-${update.version}.exe`;
  const file = update.files.find(entry => entry.url === expectedName);
  if (!file || path.basename(update.downloadedFile) !== expectedName) {
    throw new Error("The release does not contain the expected portable executable");
  }
  const directory = path.dirname(target);
  const stage = await mkdtemp(path.join(directory, ".poe-update-"));
  try {
    const next = path.join(stage, "next.exe");
    await copyFile(update.downloadedFile, next);
    const digest = createHash("sha512");
    for await (const chunk of createReadStream(next)) digest.update(chunk);
    if (digest.digest("base64") !== file.sha512) throw new Error("Portable update checksum mismatch");

    // The portable launcher removes its extraction directory as it exits.
    // Keep the worker in electron-updater's cache so it can finish the swap.
    const helper = path.join(path.dirname(path.dirname(update.downloadedFile)), "portable-updater.exe");
    await copyFile(path.join(process.resourcesPath, "portable-updater.exe"), helper);
    const worker = spawn(helper, [target, stage, String(process.pid), app.commandLine.getSwitchValue("user-data-dir")], {
      cwd: directory, detached: true, windowsHide: true, stdio: ["ignore", "pipe", "ignore"],
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { worker.kill(); reject(new Error("Portable updater did not start")); }, 15000);
      worker.once("error", error => { clearTimeout(timeout); reject(error); });
      worker.once("exit", () => { clearTimeout(timeout); reject(new Error("Portable updater exited before restart")); });
      const output = createInterface({ input: worker.stdout });
      output.once("line", (line) => {
        if (line === "ready") { clearTimeout(timeout); resolve(); }
        output.close();
      });
    });
    worker.stdout.destroy();
    worker.unref();
  } catch (error) {
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
}
