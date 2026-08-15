# DeepSeek Harness 桌面版 —— 卸载脚本（仅删除快捷方式，不删除程序文件）
$ErrorActionPreference = "SilentlyContinue"

$desktop = [Environment]::GetFolderPath("Desktop")
$desktopLnk = Join-Path $desktop "DeepSeek Harness.lnk"
if (Test-Path $desktopLnk) { Remove-Item $desktopLnk -Force; Write-Host "[OK] 已删除桌面快捷方式" -ForegroundColor Green }

$startMenu = [Environment]::GetFolderPath("Programs")
$startMenuDir = Join-Path $startMenu "DeepSeek Harness"
if (Test-Path $startMenuDir) { Remove-Item $startMenuDir -Recurse -Force; Write-Host "[OK] 已删除开始菜单快捷方式" -ForegroundColor Green }

Write-Host "卸载完成（程序文件保留在：$PSScriptRoot）" -ForegroundColor Cyan
