@echo off
setlocal
cd /d "%~dp0"
echo Starting PoE Price Checker from "%CD%"

if not exist "renderer\node_modules\vite\package.json" goto install
if not exist "main\node_modules\electron\package.json" goto install
goto launch

:install
call npm run install:all
if errorlevel 1 exit /b %ERRORLEVEL%

:launch
call npm run dev:standalone
exit /b %ERRORLEVEL%
