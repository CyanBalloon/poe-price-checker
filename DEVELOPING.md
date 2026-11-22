# Developing PoE Price Checker

Use Node.js 24, npm and Git on Windows. The desktop build compiles its hotkey helper with the Windows .NET Framework C# compiler.

## Run the desktop app

From the checkout you want to run, open a PowerShell terminal and launch:

```powershell
.\dev_standalone.bat
```

The launcher installs missing dependencies, generates the item indexes, and starts Electron with this checkout’s Vite server. Each checkout uses its own development profile in `main/dist/dev-profile`. Press Ctrl+C in the terminal to end the session.

## Build the Windows release

```powershell
npm ci --prefix renderer
npm ci --prefix main
npm run build --prefix renderer
npm run build --prefix main
npm run package --prefix main -- --win --x64 --publish never
```

The installer, portable executable, installer blockmap and update manifest are in `main/dist/`. The unpacked application in `main/dist/win-unpacked/` runs the same packaged code.

## Preview the project site

```powershell
npm ci --prefix docs
npm run docs:dev --prefix docs
```

Use `npm run docs:build --prefix docs` to generate the static site for GitHub Pages.
