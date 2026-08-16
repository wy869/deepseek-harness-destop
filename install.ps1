# DeepSeek Harness 桌面版 —— 安装脚本
# 在桌面与开始菜单创建快捷方式，并校验依赖。
$ErrorActionPreference = "Stop"

$appDir = $PSScriptRoot
$vbs = Join-Path $appDir "launcher.vbs"
$icon = Join-Path $appDir "icon.ico"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  DeepSeek Harness 桌面版 安装" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

# ---- 依赖校验 ----
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "[警告] 未在 PATH 中找到 node.exe，启动器可能无法工作。" -ForegroundColor Yellow
} else {
    Write-Host "[OK] Node.js：$($node.Source)" -ForegroundColor Green
}

$pf86 = ${env:ProgramFiles(x86)}; if (-not $pf86) { $pf86 = "C:\Program Files (x86)" }
$edgeCandidates = @(
    (Join-Path $pf86 "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe")
)
$edge = $edgeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($edge) { Write-Host "[OK] Microsoft Edge：$edge" -ForegroundColor Green }
else { Write-Host "[警告] 未找到 Microsoft Edge，应用窗口将无法打开。" -ForegroundColor Yellow }

if (Test-Path $vbs) { Write-Host "[OK] 启动入口：$vbs" -ForegroundColor Green }
if (Test-Path $icon) { Write-Host "[OK] 图标：$icon" -ForegroundColor Green }

# ---- 创建快捷方式 ----
function New-AppShortcut([string]$lnkPath) {
    $ws = New-Object -ComObject WScript.Shell
    $lnk = $ws.CreateShortcut($lnkPath)
    $lnk.TargetPath = Join-Path $env:SystemRoot "System32\wscript.exe"
    $lnk.Arguments = '"' + $vbs + '"'
    $lnk.WorkingDirectory = $appDir
    $lnk.IconLocation = $icon + ",0"
    $lnk.Description = "DeepSeek Harness 桌面版"
    $lnk.Save()
}

$desktop = [Environment]::GetFolderPath("Desktop")
$desktopLnk = Join-Path $desktop "DeepSeek Harness.lnk"
New-AppShortcut $desktopLnk
Write-Host "[OK] 已创建桌面快捷方式：$desktopLnk" -ForegroundColor Green

$startMenu = [Environment]::GetFolderPath("Programs")
$startMenuDir = Join-Path $startMenu "DeepSeek Harness"
New-Item -ItemType Directory -Force -Path $startMenuDir | Out-Null
$startLnk = Join-Path $startMenuDir "DeepSeek Harness.lnk"
New-AppShortcut $startLnk
Write-Host "[OK] 已创建开始菜单快捷方式：$startLnk" -ForegroundColor Green

Write-Host ""
Write-Host "安装完成。现在可以双击桌面上的 “DeepSeek Harness” 图标启动。" -ForegroundColor Green
Write-Host "首次点击会自动启动后台服务（约数秒后弹出应用窗口）。" -ForegroundColor DarkGray
