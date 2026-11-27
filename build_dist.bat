@echo off
cd /d "%~dp0"
echo ===================================================
echo Building PoE Price Checker Executable...
echo ===================================================
echo.

echo [1/4] Compiling frontend (Renderer)...
call npm run build --prefix renderer
if %errorlevel% neq 0 (
    echo Frontend build failed!
    pause
    exit /b %errorlevel%
)

echo.
echo [2/4] Compiling backend (Main)...
call npm run build --prefix main
if %errorlevel% neq 0 (
    echo Backend build failed!
    pause
    exit /b %errorlevel%
)

echo.
echo [3/4] Packaging Executables (Electron Builder)...
echo (This may take a few minutes as it downloads dependencies)
call npm run package --prefix main -- --win --x64 --publish never
if %errorlevel% neq 0 (
    echo Packaging failed!
    pause
    exit /b %errorlevel%
)

echo.
echo [4/4] Updating the PoE Price Checker ^(Latest^) Start menu shortcut...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-latest-shortcut.ps1"
if %errorlevel% neq 0 (
    echo Start menu shortcut update failed!
    pause
    exit /b %errorlevel%
)

echo.
echo ===================================================
echo SUCCESS! 
echo Your compiled executables are located in:
echo main\dist\
echo ===================================================
pause
