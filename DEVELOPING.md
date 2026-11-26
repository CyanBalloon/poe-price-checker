# Developing PoE Price Checker

Use Node.js 24, npm and Git on Windows. The desktop build compiles its hotkey helper with the Windows .NET Framework C# compiler.

## Run the desktop app

From the checkout you want to run, open a PowerShell terminal and launch:

```powershell
.\dev_standalone.bat
```

The launcher installs missing dependencies, generates the item indexes, and starts Electron with this checkout’s Vite server. Each checkout uses its own development profile in `main/dist/dev-profile`. Press Ctrl+C in the terminal to end the session.

The first socketed PoE1 preview loads the 213 × 175 socket sheet directly from GGG’s CDN. The installer includes only the URL. If the sheet is unavailable or its dimensions change, the preview draws the sockets and links locally. To test with a local sheet, place it at `renderer/local-art/poe1-sockets.png` and set `VITE_POE1_SOCKET_SPRITE=/local-art/poe1-sockets.png` in `renderer/.env.development.local`.

## Build the Windows release

```powershell
npm ci --prefix renderer
npm ci --prefix main
npm run build --prefix renderer
npm run build --prefix main
npm run package --prefix main -- --win --x64 --publish never
```

The installer, portable executable, installer blockmap and update manifest are in `main/dist/`. The unpacked application in `main/dist/win-unpacked/` runs the same packaged code.

Run `npm run check:toolbar --prefix main -- "dist/win-unpacked/PoE Price Checker.exe" dist/toolbar-previews` before publishing a toolbar change. The check renders the packaged app offscreen with a temporary profile, checks the logo and title at five window widths in both games, and saves screenshots for visual review. Use `withOffscreenApp` from `main/build/offscreen-app.mjs` for other packaged UI checks so they leave desktop focus, hotkeys, and the running app alone.

## Local PoE1 item effects

The Windows app detects the standalone game archive or a Steam library. For a custom installation, choose the game folder under **Settings → Appearance → PoE 1 item animations**. The switch defaults to on. Turning it off immediately uses static item art and preserves the cache. The worker opens the game files read-only and translates effects in memory using the tools listed in `main/build/effect-tools/NOTICE.txt`.

The app saves finished preview frames under `local-item-effects` in the Electron user profile. Each installation has a random AES-256-GCM key wrapped by Windows DPAPI. The 64 MiB frame cache is tied to the game and app versions. Cached frames can display while live rendering starts or supply the still image for reduced motion.

The worker also saves an encrypted index for each PoE1 installation. It contains bundle locations and file lookup metadata. On later launches the worker checks the game archive's file identity, size and timestamps before reusing the index. Patching or replacing the standalone archive or Steam bundle index triggers a rebuild on the next use. Updating the checker alone preserves the index.

```powershell
npm run check:effect-cache --prefix main
npm run check:local-effects --prefix main -- "dist/win-unpacked/PoE Price Checker.exe"
```

The second check uses an installed copy of PoE1 and runs the packaged app twice offscreen with a temporary profile.

## Preview the project site

```powershell
npm ci --prefix docs
npm run docs:dev --prefix docs
```

Use `npm run docs:build --prefix docs` to generate the static site for GitHub Pages.
