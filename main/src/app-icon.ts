import path from "node:path";

export const appIconPath = path.join(
  __dirname, process.env.STATIC!, process.platform === "win32" ? "windows-icon.ico" : "icon.png",
);
