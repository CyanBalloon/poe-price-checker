import { app, BrowserWindow, dialog, ipcMain, safeStorage, type IpcMainInvokeEvent } from "electron";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { Worker } from "node:worker_threads";
import { discoverGame, gameSource, type GameSource } from "./installation";
import { PreviewCache } from "./preview-cache";
import type { EffectStatus } from "../../../ipc/local-effects";

const windows = new Map<number, string>();
export function trustEffectsWindow(win: BrowserWindow, url: string) {
  const origin = new URL(url).origin;
  const id = win.webContents.id;
  windows.set(id, origin);
  win.once("closed", () => windows.delete(id));
}

function trusted(event: IpcMainInvokeEvent) {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame || new URL(frame.url).origin !== windows.get(event.sender.id))
    throw Error("Item effects are available only inside the app");
}

class Resources {
  private worker: Worker;
  private next = 0;
  private pending = new Map<number, (value: Uint8Array | null) => void>();
  private requests = new Map<string, Promise<Uint8Array | null>>();
  constructor(file: string, indexCache: { directory: string; key: Buffer } | undefined, onClose: () => void) {
    const directory = app.isPackaged ? path.join(process.resourcesPath, "local-effects") : path.join(__dirname, "local-effects");
    this.worker = new Worker(path.join(directory, "worker.mjs"), { workerData: { file, tools: directory, indexCache } });
    this.worker.on("message", ({ id, data, error }) => {
      if (error) console.warn("[Local item effects]", error);
      this.pending.get(id)?.(data ?? null);
      this.pending.delete(id);
    });
    this.worker.on("error", error => { console.warn("[Local item effects]", error.message); });
    this.worker.once("exit", () => {
      for (const finish of this.pending.values()) finish(null);
      this.pending.clear();
      onClose();
    });
  }

  async read(name: string) {
    const previous = this.requests.get(name);
    if (previous) return await previous;
    const id = ++this.next;
    const result = new Promise<Uint8Array | null>(resolve => {
      this.pending.set(id, resolve);
      this.worker.postMessage({ id, key: name });
    }).finally(() => this.requests.delete(name));
    this.requests.set(name, result);
    return await result;
  }

  close() { void this.worker.terminate(); }
}

export function registerLocalEffects() {
  if (process.platform !== "win32") return;
  const profile = app.getPath("userData");
  const location = process.env.PORTABLE_EXECUTABLE_FILE ?? (app.isPackaged ? process.execPath : app.getAppPath());
  const scope = createHash("sha256").update(path.resolve(location).toLowerCase()).digest("hex");
  const directory = path.join(profile, "local-item-effects", scope);
  const preference = path.join(directory, "game-folder.json");
  let cached: PreviewCache | undefined;
  let nextCacheAttempt = 0;
  let current: GameSource | undefined, refresh: Promise<GameSource | undefined> | undefined;
  let worker: Resources | undefined; let checked = 0; let generation = 0;

  function cache() {
    if (cached || Date.now() < nextCacheAttempt) return cached;
    try { cached = new PreviewCache(directory, scope, safeStorage); }
    catch (error) {
      nextCacheAttempt = Date.now() + 60_000;
      console.warn("[Local item effects] Preview cache unavailable", (error as Error).message);
    }
    return cached;
  }
  function use(found?: GameSource) {
    const source = found && { ...found, revision: createHash("sha256").update(found.revision + "/" + app.getVersion()).digest("hex") };
    if (source?.revision !== current?.revision || source?.fileIdentity !== current?.fileIdentity) { worker?.close(); worker = undefined; }
    current = source;
    checked = Date.now();
    return source;
  }
  async function source() {
    if (Date.now() - checked < 5000) return current;
    if (!refresh) {
      const epoch = generation;
      const pending = (async () => {
        let folder = current?.folder;
        if (!folder) {
          try { folder = JSON.parse(await fs.readFile(preference, "utf8")); } catch { /* Auto-detect on first use. */ }
        }
        const found = await discoverGame(typeof folder === "string" ? folder : undefined);
        return epoch === generation ? use(found) : current;
      })().finally(() => { if (refresh === pending) refresh = undefined; });
      refresh = pending;
    }
    return await refresh;
  }
  function status(source?: GameSource): EffectStatus {
    return { supported: true, folder: source?.folder, revision: source?.revision };
  }
  ipcMain.handle("local-effects:status", async event => {
    trusted(event);
    return status(await source());
  });
  ipcMain.handle("local-effects:choose", async event => {
    trusted(event);
    const win = BrowserWindow.fromWebContents(event.sender)!;
    const selection = await dialog.showOpenDialog(win, { title: "Choose your Path of Exile 1 installation", properties: ["openDirectory"] });
    if (selection.canceled) return status(await source());
    const selected = await gameSource(selection.filePaths[0]);
    if (!selected) throw Error("Choose the Path of Exile 1 installation folder containing the game executable.");
    await fs.mkdir(directory, { recursive: true });
    const temporary = preference + "." + randomUUID();
    try {
      await fs.writeFile(temporary, JSON.stringify(selected.folder), { flag: "wx" });
      await fs.rename(temporary, preference);
    } finally { await fs.rm(temporary, { force: true }); }
    generation++;
    return status(use(selected));
  });
  ipcMain.handle("local-effects:resource", async (event, revision: string, name: string) => {
    trusted(event);
    if (typeof name !== "string" || name.length > 340 || !/^(shader|lookup|sprite|backdrop)\/[a-z0-9_. '/()-]+$/.test(name)) return null;
    const game = await source();
    if (!game || game.revision !== revision) return null;
    if (!worker) {
      const key = cache()?.archiveIndexKey();
      const instance = new Resources(game.file, key && { directory, key }, () => { if (worker === instance) worker = undefined; });
      worker = instance;
    }
    return await worker.read(name);
  });
  ipcMain.handle("local-effects:frame", async (event, revision: string, id: string) => {
    trusted(event);
    if ((await source())?.revision !== revision) return null;
    return cache()?.get(revision, id) ?? null;
  });
  ipcMain.handle("local-effects:save", async (event, revision: string, id: string, bytes: Uint8Array) => {
    trusted(event);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > 2 * 1024 * 1024 || (await source())?.revision !== revision) return;
    cache()?.put(revision, id, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  });
  app.once("before-quit", () => { worker?.close(); cached?.close(); });
}
