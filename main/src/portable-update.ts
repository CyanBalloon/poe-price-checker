import { app } from "electron";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import type { UpdateDownloadedEvent } from "electron-updater";

// The NSIS portable launcher holds its own executable open until Electron exits.
// A separate Windows process waits for the lock, swaps files on the same volume,
// and starts the original filename. Paths are data, never PowerShell source.
const replaceAndRestart = `
$ErrorActionPreference = 'Stop'
$target = $env:POE_UPDATE_TARGET
$stage = $env:POE_UPDATE_STAGE
$next = [IO.Path]::Combine($stage, 'next.exe')
$backup = [IO.Path]::Combine($stage, 'previous.exe')
$original = [Diagnostics.Process]::GetProcessById([int]$env:POE_UPDATE_PID)
[Console]::WriteLine('ready')
[Console]::Out.Flush()
try {
  if (!$original.WaitForExit(60000)) { throw "The application did not close in time." }
  $until = [DateTime]::UtcNow.AddSeconds(45)
  while ($true) {
    try { [IO.File]::Replace($next, $target, $backup, $true); break }
    catch [IO.IOException] {
      if ([DateTime]::UtcNow -ge $until) { throw }
      Start-Sleep -Milliseconds 250
    }
  }
  $launch = New-Object Diagnostics.ProcessStartInfo
  $launch.FileName = $target
  $launch.WorkingDirectory = [IO.Path]::GetDirectoryName($target)
  if ($env:POE_UPDATE_PROFILE) { $launch.Arguments = '--user-data-dir="' + $env:POE_UPDATE_PROFILE + '"' }
  try { [Diagnostics.Process]::Start($launch) | Out-Null }
  catch {
    [IO.File]::Replace($backup, $target, $next, $true)
    throw
  }
  [IO.File]::Delete($backup)
} catch {
  Add-Type -AssemblyName System.Windows.Forms
  [Windows.Forms.MessageBox]::Show("Could not update " + $target + [Environment]::NewLine + $_.Exception.Message, 'PoE Price Checker') | Out-Null
} finally {
  [IO.File]::Delete($next)
  if (![IO.File]::Exists($backup)) { [IO.Directory]::Delete($stage) }
}
`;

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

    const worker = spawn(path.join(process.env.SystemRoot!, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", replaceAndRestart], {
        cwd: directory, windowsHide: true, stdio: ["ignore", "pipe", "ignore"],
        env: { ...process.env, POE_UPDATE_TARGET: target, POE_UPDATE_STAGE: stage,
          POE_UPDATE_PID: String(process.pid), POE_UPDATE_PROFILE: app.commandLine.getSwitchValue("user-data-dir") },
      });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { worker.kill(); reject(new Error("Portable updater did not start")); }, 15000);
      worker.once("error", error => { clearTimeout(timeout); reject(error); });
      worker.once("exit", () => { clearTimeout(timeout); reject(new Error("Portable updater exited before restart")); });
      worker.stdout.once("data", (line: Buffer) => {
        if (line.toString().trim() === "ready") { clearTimeout(timeout); resolve(); }
      });
    });
    worker.stdout.destroy();
    worker.unref();
  } catch (error) {
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
}
