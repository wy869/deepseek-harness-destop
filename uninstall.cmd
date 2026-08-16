@echo off
rem DeepSeek Harness Desktop - uninstall (remove shortcuts only)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1"
echo.
pause
