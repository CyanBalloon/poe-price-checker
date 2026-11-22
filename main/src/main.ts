"use strict";

import { app, systemPreferences, BrowserWindow, session } from "electron";
import { uIOhook } from "uiohook-napi";
import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { startServer, eventPipe, server } from "./server";
import { Logger } from "./RemoteLogger";
import { GameWindow } from "./windowing/GameWindow";
import { AppWindow } from "./windowing/AppWindow";
import { GameConfig } from "./host-files/GameConfig";
import { Shortcuts } from "./shortcuts/Shortcuts";
import { AppUpdater } from "./AppUpdater";
import { AppTray } from "./AppTray";

import { GameLogWatcher } from "./host-files/GameLogWatcher";
import { HttpProxy } from "./proxy";
import { installExtension, VUEJS_DEVTOOLS } from "electron-devtools-installer";
import { FileWriter } from "./host-files/FileWriter";
import { startDevRenderer } from "./dev-renderer";

// Existing installations keep their settings, saved window position and sign-in session.
if (app.isPackaged && !app.commandLine.hasSwitch("user-data-dir")) {
  const previousProfile = path.join(app.getPath("appData"), "poe2-price-checker");
  if (existsSync(previousProfile)) {
    app.setPath("userData", previousProfile);
    app.setPath("sessionData", previousProfile);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.exit();
}

app.disableHardwareAcceleration();

app.enableSandbox();
let tray: AppTray;

(async () => {
  if (process.platform === "darwin") {
    async function ensureAccessibilityPermission(): Promise<boolean> {
      if (systemPreferences.isTrustedAccessibilityClient(false)) return true;

      // Trigger the system prompt
      systemPreferences.isTrustedAccessibilityClient(true);

      const maxWaitTime = 15000; // 15 seconds
      const startTime = Date.now();

      return await new Promise((resolve) => {
        const interval = setInterval(() => {
          if (systemPreferences.isTrustedAccessibilityClient(false)) {
            clearInterval(interval);
            resolve(true);
          }

          // Stop waiting if time runs out
          if (Date.now() - startTime > maxWaitTime) {
            clearInterval(interval);
            resolve(false);
          }
        }, 1000);
      });
    }
    const hasPermission = await ensureAccessibilityPermission();
    if (!hasPermission) {
      console.warn("Accessibility permission not granted, exiting");
      app.quit();
      return;
    }
    console.log("Accessibility permission granted, starting app");
  }

  app.on("ready", async () => {
    tray = new AppTray(eventPipe);
    const logger = new Logger(eventPipe);
    const gameConfig = new GameConfig(eventPipe, logger);
    const poeWindow = new GameWindow();
    const appUpdater = new AppUpdater(eventPipe);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _httpProxy = new HttpProxy(server, logger);
    const fileWriter = new FileWriter(eventPipe, logger);
    const gameLogWatcher = new GameLogWatcher(eventPipe, logger, fileWriter);

    if (process.env.VITE_DEV_SERVER_URL && !process.env.EXILE_TRADE_COMBINED_DEV) {
      try {
        await installExtension(VUEJS_DEVTOOLS);
        logger.write("info Vue Devtools installed");
      } catch (error) {
        logger.write(`error installing Vue Devtools: ${error}`);
        console.log(`error installing Vue Devtools: ${error}`);
      }
    }
    process.addListener("uncaughtException", (err) => {
      logger.write(`error [uncaughtException] ${err.message}, ${err.stack}`);
    });
    process.addListener("unhandledRejection", (reason) => {
      logger.write(`error [unhandledRejection] ${(reason as Error).stack}`);
    });

    setTimeout(
      async () => {
        const appWindow = new AppWindow(eventPipe, logger, poeWindow);
        tray.onShow = () => appWindow.showWindow();

        const shortcuts = await Shortcuts.create(
          logger,
          appWindow,
          poeWindow,
          gameConfig,
          eventPipe,
        );
        eventPipe.onEventAnyClient(
          "CLIENT->MAIN::update-host-config",
          (cfg) => {
            appWindow.updateOpts(cfg.windowTitle);
            shortcuts.updateActions(
              cfg.shortcuts,
              cfg.stashScroll,
              cfg.logKeys,
              cfg.restoreClipboard,
              cfg.language,
              cfg.destroyHotkeyEnabled,
              cfg.autoClickerEnabled,
            );
            gameLogWatcher.restart(cfg.clientLog ?? "", cfg.readClientLog);
            gameConfig.readConfig(cfg.gameConfig ?? "");
            appUpdater.updateSettings(cfg.autoUpdater);
            appUpdater.checkAtStartup();
            fileWriter.restart(cfg.libraryAlpha, cfg.libraryOutputPath);
          },
        );

        let loginWindow: BrowserWindow | null = null;

        session.defaultSession.cookies.on("changed", async (event, cookie, cause, removed) => {
          if (cookie.name === "POESESSID") {
            const cookies = await session.defaultSession.cookies.get({ name: "POESESSID" });
            if (cookies.length === 0) {
              eventPipe.sendEventTo("broadcast", {
                name: "MAIN->CLIENT::auth-state",
                payload: { isLoggedIn: false },
              } as any);
            }
          }
        });

        eventPipe.onEventAnyClient("CLIENT->MAIN::user-action", async (e) => {
          if (e.action === "poe-login") {
            if (loginWindow && !loginWindow.isDestroyed()) {
              loginWindow.focus();
              return;
            }
            loginWindow = new BrowserWindow({
              width: 700,
              height: 750,
              title: "Log in to Path of Exile",
              autoHideMenuBar: true,
              webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
              },
            });
            loginWindow.webContents.on("did-finish-load", async () => {
              try {
                if (!loginWindow) return;
                const loggedIn = await loginWindow.webContents.executeJavaScript(`
                  (() => {
                    const hasLogoutLink = !!Array.from(document.querySelectorAll('a')).find(a => a.href.includes('/login/logout') || a.href.includes('/logout'));
                    const hasAccountLink = !!Array.from(document.querySelectorAll('a')).find(a => a.href.includes('/my-account') || a.href.includes('/account/view-profile'));
                    return hasLogoutLink || hasAccountLink;
                  })()
                `);
                if (loggedIn) {
                  eventPipe.sendEventTo("broadcast", {
                    name: "MAIN->CLIENT::auth-state",
                    payload: { isLoggedIn: true },
                  } as any);
                  loginWindow.close();
                }
              } catch (err) {
                console.error("Error executing JS check:", err);
              }
            });
            loginWindow.loadURL("https://www.pathofexile.com/login");
            loginWindow.on("closed", () => {
              loginWindow = null;
            });
          } else if (e.action === "poe-logout") {
            await session.defaultSession.cookies.remove("https://www.pathofexile.com", "POESESSID");
            if (loginWindow && !loginWindow.isDestroyed()) {
              loginWindow.close();
            }
          }
        });
        uIOhook.start();
        console.log("uIOhook started");
        const combinedDev = process.env.EXILE_TRADE_COMBINED_DEV;
        let port: number;
        let rendererUrl: string | undefined;
        try {
          port = await startServer(appUpdater, logger, combinedDev ? 0 : undefined);
          if (combinedDev) {
            rendererUrl = await startDevRenderer(port);
          }
        } catch (error) {
          console.error("Could not start PoE Price Checker:", error);
          app.exit(1);
          return;
        }
        // TODO: move up (currently crashes)
        logger.write(`info ${os.type()} ${os.release} / v${app.getVersion()}`);
        appWindow.loadAppPage(port, rendererUrl);
        appWindow.showWindow();
        tray.serverPort = port;
      },
      // fixes(linux): window is black instead of transparent
      process.platform === "linux" ? 1000 : 0,
    );
  });
})();
