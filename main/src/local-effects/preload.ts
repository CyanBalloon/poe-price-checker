import { contextBridge, ipcRenderer } from "electron";
import type { LocalItemEffects } from "../../../ipc/local-effects";

if (process.isMainFrame && process.platform === "win32") {
  const api: LocalItemEffects = {
    status: async () => await ipcRenderer.invoke("local-effects:status"),
    chooseFolder: async () => await ipcRenderer.invoke("local-effects:choose"),
    resource: async (revision, name) => await ipcRenderer.invoke("local-effects:resource", revision, name),
    frame: async (revision, id) => await ipcRenderer.invoke("local-effects:frame", revision, id),
    saveFrame: async (revision, id, bytes) => await ipcRenderer.invoke("local-effects:save", revision, id, bytes),
  };
  contextBridge.exposeInMainWorld("localItemEffects", api);
}
