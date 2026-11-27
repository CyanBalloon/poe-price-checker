import path from "path";
import { BrowserWindow, dialog, shell, Menu, app, screen } from "electron";
import fs from "fs";
import { trustEffectsWindow } from "../local-effects/service";
import { appIconPath } from "../app-icon";

import type { ServerEvents } from "../server";
import type { Logger } from "../RemoteLogger";
import type { GameWindow } from "./GameWindow";

export function createStandaloneWindow(options: Electron.BrowserWindowConstructorOptions) {
  return new BrowserWindow({
    icon: appIconPath,
    title: "PoE Price Checker",
    ...(process.platform === "win32" && {
      titleBarStyle: "hidden",
      titleBarOverlay: { color: "#00000000", symbolColor: "#c6cad0", height: 56 },
    }),
    ...options,
    webPreferences: {
      preload: path.join(__dirname, "effects-preload.js"),
      allowRunningInsecureContent: false,
      webviewTag: true,
      spellcheck: false,
      ...options.webPreferences,
    },
  });
}

export class AppWindow {
  public isInteractable = false;
  public wasUsedRecently = true;
  public window?: BrowserWindow;

  constructor(
    private server: ServerEvents,
    private logger: Logger,
    private poeWindow: GameWindow,
  ) {
    this.poeWindow.on("active-change", this.handlePoeWindowActiveChange);
    this.poeWindow.onAttach(this.handleOverlayAttached);

    const isStandalone = true;

    const windowState = {
      width: 1280,
      height: 800,
      x: undefined as number | undefined,
      y: undefined as number | undefined,
    };

    const statePath = path.join(
      app.getPath("userData"),
      "apt-data",
      "standalone-window-state.json",
    );

    if (isStandalone) {
      try {
        const data = fs.readFileSync(statePath, "utf8");
        const parsed = JSON.parse(data);
        if (typeof parsed.width === "number" && typeof parsed.height === "number") {
          windowState.width = parsed.width;
          windowState.height = parsed.height;
        }
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          const displays = screen.getAllDisplays();
          const isVisible = displays.some((display) => {
            const bounds = display.bounds;
            return (
              parsed.x >= bounds.x &&
              parsed.x < bounds.x + bounds.width &&
              parsed.y >= bounds.y &&
              parsed.y < bounds.y + bounds.height
            );
          });
          if (isVisible) {
            windowState.x = parsed.x;
            windowState.y = parsed.y;
          }
        }
      } catch {}
    }

    this.window = createStandaloneWindow({
      width: isStandalone ? windowState.width : 800,
      height: isStandalone ? windowState.height : 600,
      x: isStandalone ? windowState.x : undefined,
      y: isStandalone ? windowState.y : undefined,
      skipTaskbar: false,
      show: false,
    });
    this.window.once("ready-to-show", () => this.showWindow());

    if (isStandalone) {
      let isQuitting = false;
      app.on("before-quit", () => {
        isQuitting = true;
      });

      let saveTimeout: NodeJS.Timeout | undefined;
      const saveState = () => {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          if (!this.window) return;
          try {
            const bounds = this.window.getBounds();
            fs.writeFileSync(statePath, JSON.stringify({
              width: bounds.width,
              height: bounds.height,
              x: bounds.x,
              y: bounds.y,
            }), "utf8");
          } catch {}
        }, 500);
      };

      this.window.on("resize", saveState);
      this.window.on("move", saveState);
      this.window.on("close", (e) => {
        if (!isQuitting) {
          e.preventDefault();
          this.window!.hide();
        }
        if (saveTimeout) clearTimeout(saveTimeout);
        if (!this.window) return;
        try {
          const bounds = this.window.getBounds();
          fs.writeFileSync(statePath, JSON.stringify({
            width: bounds.width,
            height: bounds.height,
            x: bounds.x,
            y: bounds.y,
          }), "utf8");
        } catch {}
      });
    }

    this.window.setMenu(process.platform === "win32" ? null : Menu.buildFromTemplate([
      { role: "editMenu" }, { role: "reload" }, { role: "toggleDevTools" },
    ]));

    this.window.webContents.on("before-input-event", this.handleExtraCommands);
    this.window.webContents.on(
      "did-attach-webview",
      (_, webviewWebContents) => {
        webviewWebContents.on("before-input-event", this.handleExtraCommands);
      },
    );

    this.window.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);
      return { action: "deny" };
    });
  }

  loadAppPage(port: number, rendererUrl?: string) {
    const isStandalone = true;
    const baseUrl =
      rendererUrl ?? (process.env.VITE_DEV_SERVER_URL || `http://localhost:${port}/index.html`);
    const url = isStandalone ? `${baseUrl}?mode=standalone` : baseUrl;
    console.log("Loading URL:", url);
    console.log("Window visibility before load:", this.window?.isVisible());

    if (!this.window) {
      shell.openExternal(url);
      return;
    }

    trustEffectsWindow(this.window, url);
    this.window.loadURL(url);
    if (process.env.VITE_DEV_SERVER_URL && !rendererUrl) {
      this.window.webContents.openDevTools({ mode: "detach", activate: false });
    }
  }

  updateOpts(windowTitle: string) {
    this.poeWindow.attach(undefined, windowTitle);
  }

  showWindow() {
    // Windows can display the checker without taking the game's keyboard focus.
    if (process.platform === "win32") this.window?.showInactive();
    else this.window?.show();
  }

  focusWindow() {
    const window = this.window;
    if (!window || window.isFocused()) return;

    if (window.isMinimized()) window.restore();
    window.show();
  }

  private handleExtraCommands = (
    event: Electron.Event,
    input: Electron.Input,
  ) => {
    if (input.type !== "keyDown" || process.platform !== "win32") return;

    let { code, control: ctrlKey, shift: shiftKey, alt: altKey } = input;

    if (code.startsWith("Key")) {
      code = code.slice("Key".length);
    } else if (code.startsWith("Digit")) {
      code = code.slice("Digit".length);
    }

    if (shiftKey && altKey) code = `Shift + Alt + ${code}`;
    else if (ctrlKey && shiftKey) code = `Ctrl + Shift + ${code}`;
    else if (ctrlKey && altKey) code = `Ctrl + Alt + ${code}`;
    else if (altKey) code = `Alt + ${code}`;
    else if (ctrlKey) code = `Ctrl + ${code}`;
    else if (shiftKey) code = `Shift + ${code}`;

    switch (code) {
      case "Ctrl + R":
      case "F5":
        event.preventDefault();
        this.window?.webContents.reload();
        break;
      case "Ctrl + Shift + I":
      case "F12":
        event.preventDefault();
        this.window?.webContents.toggleDevTools();
        break;
      case "Escape":
      case "Ctrl + W": {
        break;
      }
    }
  };

  private handleOverlayAttached = (hasAccess?: boolean) => {
    if (hasAccess === false) {
      this.logger.write(
        "error [Overlay] PoE2 is running with administrator rights",
      );

      dialog.showErrorBox(
        "PoE2 window - No access",
        // ----------------------
        "Path of Exile 2 is running with administrator rights.\n" +
          "\n" +
          "You need to restart PoE Price Checker with administrator rights.",
      );
    }
  };

  private handlePoeWindowActiveChange = (isActive: boolean) => {
    if (isActive && this.isInteractable) {
      this.isInteractable = false;
    }
  };
}
