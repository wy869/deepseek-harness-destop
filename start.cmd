@echo off
rem DeepSeek Harness 桌面版 —— 手动/调试入口（带控制台输出）
rem 双击本文件或桌面快捷方式均可；日志另存于 %LOCALAPPDATA%\DeepSeekHarness\launcher.log
node "%~dp0launcher.js" %*
if errorlevel 1 (
    echo.
    echo [错误] 启动失败，请查看日志：%LOCALAPPDATA%\DeepSeekHarness\launcher.log
    pause
)
