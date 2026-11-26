import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export interface GameSource { folder: string; file: string; revision: string; fileIdentity: string }
export async function gameSource(folder: string): Promise<GameSource | undefined> {
  if (!folder || !path.isAbsolute(folder) || /Path of Exile 2$/i.test(path.basename(folder))) return;
  const names = await fs.readdir(folder).catch(() => [] as string[]);
  if (!names.some(name => /^PathOfExile(?:_x64)?(?:Steam|EGS)?\.exe$/i.test(name))) return;
  for (const relative of ["Content.ggpk", "Bundles2/_.index.bin"]) {
    const file = path.join(folder, relative);
    const stat = await fs.stat(file, { bigint: true }).catch(() => undefined);
    if (!stat?.isFile()) continue;
    const revision = createHash("sha256").update(["inventory-v1", file.toLowerCase(), stat.size, stat.mtimeNs].join("|")).digest("hex");
    return { folder, file, revision, fileIdentity: [stat.dev, stat.ino, stat.ctimeNs].join("/") };
  }
}

async function steamFolders() {
  const directories = new Set<string>();
  const env = process.env;
  for (const home of [env["ProgramFiles(x86)"], env.ProgramFiles]) if (home) directories.add(path.join(home, "Steam"));
  try {
    const reg = path.join(env.SystemRoot ?? "C:\\Windows", "System32", "reg.exe");
    const { stdout } = await promisify(execFile)(reg, ["query", "HKCU\\Software\\Valve\\Steam", "/v", "SteamPath"], { windowsHide: true, timeout: 2000 });
    const installed = /SteamPath\s+REG_SZ\s+([^\r\n]+)/i.exec(stdout)?.[1];
    if (installed) directories.add(installed.trim());
  } catch { /* A standalone installation does not need Steam. */ }
  for (const steam of [...directories]) {
    const manifest = await fs.readFile(path.join(steam, "steamapps", "libraryfolders.vdf"), "utf8").catch(() => "");
    for (const match of manifest.matchAll(/"path"\s*"([^"]+)"/gi)) directories.add(match[1].replace(/\\\\/g, "\\"));
  }
  return [...directories].map(steam => path.join(steam, "steamapps", "common", "Path of Exile"));
}

export async function discoverGame(preferred?: string) {
  if (preferred) { const found = await gameSource(preferred); if (found) return found; }
  for (const home of [process.env["ProgramFiles(x86)"], process.env.ProgramFiles]) {
    if (!home) continue;
    const found = await gameSource(path.join(home, "Grinding Gear Games", "Path of Exile"));
    if (found) return found;
  }
  for (const folder of await steamFolders()) {
    const found = await gameSource(folder);
    if (found) return found;
  }
}
