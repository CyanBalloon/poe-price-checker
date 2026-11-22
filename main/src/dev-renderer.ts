import { fork } from "node:child_process";
import path from "node:path";
import { app } from "electron";

export function startDevRenderer(backendPort: number): Promise<string> {
  const rendererRoot = path.resolve(app.getAppPath(), "..", "renderer");
  const child = fork(path.join(rendererRoot, "dev-server.mjs"), {
    cwd: rendererRoot,
    execPath: "node",
    execArgv: [],
    env: { ...process.env, EXILE_TRADE_DEV_BACKEND_PORT: String(backendPort) },
  });
  app.once("will-quit", () => {
    if (child.connected) child.disconnect();
  });

  return new Promise((resolve, reject) => {
    child.once("message", (url: string) => resolve(url));
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      reject(new Error("Renderer exited with " + (signal ?? code)));
    });
  });
}
