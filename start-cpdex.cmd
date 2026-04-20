@echo off
setlocal
cd /d "%~dp0"

echo Starting cpdex...
powershell -ExecutionPolicy Bypass -File ".\scripts\start-local.ps1" -OpenAdmin
if errorlevel 1 (
  echo.
  echo Failed to start cpdex. Please check the error above.
)

echo.
echo Startup complete. You can close this window.
pause
endlocal
