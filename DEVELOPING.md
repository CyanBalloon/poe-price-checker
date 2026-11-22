# Developing Poe2 Price Checker

This document covers how to compile, build, and debug Poe2 Price Checker from source.

## Prerequisites
- Node.js (v18+)
- Python (for data parsing scripts)
- Git

## Getting Started

1. Clone the repository.
2. Run `npm install` in both the `/main` and `/renderer` directories.

## Developer Workflow

Run the standalone desktop app from the checkout you want to work on.

```powershell
.\dev_standalone.bat
```

The launcher installs missing dependencies and runs `npm run dev:standalone`. Electron starts a Vite server for that checkout and waits for its URL. The terminal prints the URL once the app opens. Press `Ctrl+C` in the launch terminal to stop the session.

Each checkout uses a separate development profile in `main/dist/dev-profile`, including its settings and sign-in session. Vite uses an available port so development sessions in other checkouts can stay running.

For the split-server workflow, run `npm run dev:renderer` in one terminal and `npm run dev:main` in another. That workflow uses ports 5176 and 8584.

## Building for Production

The project uses `electron-builder` to package the application into an installer `.exe` file for Windows.

1. Ensure all changes are saved.
2. Run the provided build script as an administrator (required for `electron-builder` symlinks):
   ```bash
   build_dist.bat
   ```
   
This script will:
- Install all dependencies.
- Rebuild native modules (`npmRebuild: true`) to match the Electron V8 headers.
- Compile the frontend UI.
- Package the application into `/main/dist/`:
  - `Poe2 Price Checker Setup 1.0.2.exe` (NSIS Setup Installer)
  - `Poe2 Price Checker 1.0.2.exe` (Portable Executable)
  - `latest.yml` (Update descriptor metadata for the installer version)

Both executable formats will be built and placed under the `/main/dist/` directory.
