import { app } from "electron";
import { autoUpdater, type UpdateDownloadedEvent } from "electron-updater";
import path from "node:path";
import type { ServerEvents } from "./server";
import type { UpdateInfo } from "../../ipc/types";
import { restartPortable } from "./portable-update";

export class AppUpdater {
  private automatic = false;
  private checkedAtStartup = false;
  private downloaded?: UpdateDownloadedEvent;
  private _info: UpdateInfo = { state: "initial" };
  private readonly portable = process.platform === "win32" ? process.env.PORTABLE_EXECUTABLE_FILE : undefined;

  get info() { return this._info; }

  private setInfo(info: UpdateInfo) {
    this._info = info;
    this.server.sendEventTo("broadcast", { name: "MAIN->CLIENT::updater-state", payload: info });
  }

  constructor(private server: ServerEvents) {
    if (!app.isPackaged || process.argv.includes("--no-updates") || process.platform === "darwin") {
      this._info = { state: "unavailable", reason: !app.isPackaged ? "development" :
        process.argv.includes("--no-updates") ? "disabled" : "unsupported" };
      return;
    }

    // Both editions use electron-updater's release discovery, cache and checksum verification.
    if (this.portable) {
      autoUpdater.updateConfigPath = path.join(process.resourcesPath, "portable-update.yml");
      autoUpdater.disableDifferentialDownload = true;
    }
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on("update-available", ({ version }) => {
      this.setInfo({ state: "update-available", version });
      if (this.automatic) void this.download();
    });
    autoUpdater.on("update-not-available", () => this.setInfo({ state: "update-not-available" }));
    autoUpdater.on("download-progress", ({ percent }) => {
      if (this.info.state === "downloading") {
        const progress = Math.floor(percent);
        if (progress !== this.info.percent) this.setInfo({ ...this.info, percent: progress });
      }
    });
    autoUpdater.on("update-downloaded", (event) => {
      this.downloaded = event;
      this.setInfo({ state: "update-downloaded", version: event.version });
    });
    autoUpdater.on("error", (error) => this.fail(error));

    this.server.onEventAnyClient("CLIENT->MAIN::user-action", ({ action }) => {
      if (action === "check-for-update") void this.check();
      if (action === "download-update") void this.download();
      if (action === "update-and-restart") void this.install();
    });
    setInterval(() => { if (this.automatic) void this.check(); }, 16 * 60 * 60 * 1000).unref();
  }

  updateSettings(enabled: boolean) {
    this.automatic = enabled;
  }

  checkAtStartup() {
    if (!this.checkedAtStartup && this.automatic) {
      this.checkedAtStartup = true;
      void this.check();
    }
  }

  private fail(error: unknown) {
    console.error("App update failed:", error);
    this.setInfo({ state: "error" });
  }

  private async check() {
    if (!["initial", "error", "update-not-available", "update-available"].includes(this.info.state)) return;
    this.setInfo({ state: "checking-for-update" });
    try {
      const result = await autoUpdater.checkForUpdates();
      if (!result && this.info.state === "checking-for-update") this.setInfo({ state: "unavailable", reason: "unsupported" });
    } catch (error) {
      this.fail(error);
    }
  }

  private async download() {
    if (this.info.state !== "update-available") return;
    this.setInfo({ state: "downloading", version: this.info.version, percent: 0 });
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      this.fail(error);
    }
  }

  private async install() {
    if (this.info.state !== "update-downloaded" || !this.downloaded) return;
    this.setInfo({ state: "installing" });
    try {
      if (this.portable) {
        await restartPortable(this.portable, this.downloaded);
        app.quit();
      } else {
        autoUpdater.quitAndInstall(true, true);
      }
    } catch (error) {
      this.fail(error);
    }
  }
}
