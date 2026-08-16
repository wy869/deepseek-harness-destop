# 生成 DeepSeek Harness 桌面图标 icon.ico（256x256，PNG 压缩的 ICO 容器）
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File make-icon.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$outIco = Join-Path $PSScriptRoot "icon.ico"
$outPng = Join-Path $PSScriptRoot "icon.png"

$size = 256
$bmp = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::Transparent)

# ---- 圆角矩形渐变底 ----
$m = 6
$inner = $size - (2 * $m)          # 244
$r = 52
$d = 2 * $r                        # 104
$path = [System.Drawing.Drawing2D.GraphicsPath]::new()
$path.AddArc($m, $m, $d, $d, 180, 90)
$path.AddArc(($size - $m - $d), $m, $d, $d, 270, 90)
$path.AddArc(($size - $m - $d), ($size - $m - $d), $d, $d, 0, 90)
$path.AddArc($m, ($size - $m - $d), $d, $d, 90, 90)
$path.CloseFigure()

$rect = [System.Drawing.Rectangle]::new($m, $m, $inner, $inner)
$c1 = [System.Drawing.Color]::FromArgb(255, 84, 116, 255)   # 顶部亮蓝
$c2 = [System.Drawing.Color]::FromArgb(255, 26, 54, 196)    # 底部深蓝
$brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $rect, $c1, $c2, [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
$g.FillPath($brush, $path)
$brush.Dispose()

# ---- 顶部高光 ----
$hiRect = [System.Drawing.RectangleF]::new($m, $m, $inner, ($inner / 2))
$hiBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $hiRect,
    [System.Drawing.Color]::FromArgb(60, 255, 255, 255),
    [System.Drawing.Color]::FromArgb(0, 255, 255, 255),
    [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
$g.FillRectangle($hiBrush, $hiRect)
$hiBrush.Dispose()

# ---- 居中文字 "DS" ----
$font = [System.Drawing.Font]::new("Segoe UI", 108, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$sf = [System.Drawing.StringFormat]::new()
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$textRect = [System.Drawing.RectangleF]::new(0, -8, $size, $size)
$g.DrawString("DS", $font, [System.Drawing.Brushes]::White, $textRect, $sf)
$font.Dispose()
$sf.Dispose()
$g.Dispose()

# ---- 输出 PNG ----
$bmp.Save($outPng, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

# ---- 将 PNG 封装为 ICO ----
$png = [System.IO.File]::ReadAllBytes($outPng)
$ico = [System.Collections.Generic.List[byte]]::new()

# ICONDIR (6 bytes)
$ico.Add(0); $ico.Add(0)          # reserved
$ico.Add(1); $ico.Add(0)          # type = icon
$ico.Add(1); $ico.Add(0)          # count = 1

# ICONDIRENTRY (16 bytes)
$ico.Add(0)                        # width  = 0 (256)
$ico.Add(0)                        # height = 0 (256)
$ico.Add(0)                        # color count
$ico.Add(0)                        # reserved
$ico.Add(1); $ico.Add(0)           # planes
$ico.Add(32); $ico.Add(0)          # bit count = 32
$len = $png.Length
$ico.Add([byte]($len -band 0xFF))
$ico.Add([byte](($len -shr 8) -band 0xFF))
$ico.Add([byte](($len -shr 16) -band 0xFF))
$ico.Add([byte](($len -shr 24) -band 0xFF))
$ico.Add(22); $ico.Add(0); $ico.Add(0); $ico.Add(0)  # offset = 22

$ico.AddRange($png)
[System.IO.File]::WriteAllBytes($outIco, $ico.ToArray())

Write-Output "已生成：$outIco"
Write-Output "已生成：$outPng"
