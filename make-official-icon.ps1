# 使用 DeepSeek 官方鲸鱼 Logo 生成桌面图标 icon.ico
# 输入：deepseek-official.png（官方 Logo，白底）
# 处理：白色背景透明化 -> 裁剪到鲸鱼边界 -> 缩放到 256x256 -> 封装为 ICO
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$dir = $PSScriptRoot
$src = Join-Path $dir "deepseek-official.png"
$outPng = Join-Path $dir "icon.png"
$outIco = Join-Path $dir "icon.ico"

$srcImg = [System.Drawing.Bitmap]::FromFile($src)
$W = $srcImg.Width
$H = $srcImg.Height
Write-Output ("源图尺寸：{0} x {1}" -f $W, $H)

# ---- 1) 白色背景透明化 ----
$tmp = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($tmp)
$g.Clear([System.Drawing.Color]::Transparent)
$ia = New-Object System.Drawing.Imaging.ImageAttributes
$lo = [System.Drawing.Color]::FromArgb(238, 238, 238)
$hi = [System.Drawing.Color]::FromArgb(255, 255, 255)
$ia.SetColorKey($lo, $hi)
$srcRect = New-Object System.Drawing.Rectangle(0, 0, $W, $H)
$g.DrawImage($srcImg, $srcRect, 0, 0, $W, $H, [System.Drawing.GraphicsUnit]::Pixel, $ia)
$g.Dispose()
$srcImg.Dispose()

# ---- 2) 找到不透明像素的边界框 ----
$minX = $W; $minY = $H; $maxX = -1; $maxY = -1
for ($y = 0; $y -lt $H; $y++) {
    for ($x = 0; $x -lt $W; $x++) {
        $a = $tmp.GetPixel($x, $y).A
        if ($a -gt 16) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}
Write-Output ("鲸鱼边界：x[{0}..{1}] y[{2}..{3}]" -f $minX, $maxX, $minY, $maxY)

# ---- 3) 裁剪（加约 3% 边距）并缩放到 256 ----
$cw = $maxX - $minX + 1
$ch = $maxY - $minY + 1
$pad = [int][Math]::Max($cw, $ch) * 0.03
$minX = [Math]::Max(0, $minX - $pad)
$minY = [Math]::Max(0, $minY - $pad)
$maxX = [Math]::Min($W - 1, $maxX + $pad)
$maxY = [Math]::Min($H - 1, $maxY + $pad)
$cw = $maxX - $minX + 1
$ch = $maxY - $minY + 1

$size = 256
$final = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g2 = [System.Drawing.Graphics]::FromImage($final)
$g2.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g2.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g2.Clear([System.Drawing.Color]::Transparent)
$destRect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
$srcRect = New-Object System.Drawing.Rectangle($minX, $minY, $cw, $ch)
$g2.DrawImage($tmp, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
$g2.Dispose()
$tmp.Dispose()

$final.Save($outPng, [System.Drawing.Imaging.ImageFormat]::Png)
$final.Dispose()

# ---- 4) 封装为 ICO ----
$png = [System.IO.File]::ReadAllBytes($outPng)
$ico = [System.Collections.Generic.List[byte]]::new()
$ico.Add(0); $ico.Add(0)
$ico.Add(1); $ico.Add(0)
$ico.Add(1); $ico.Add(0)
$ico.Add(0); $ico.Add(0); $ico.Add(0); $ico.Add(0)
$ico.Add(1); $ico.Add(0)
$ico.Add(32); $ico.Add(0)
$len = $png.Length
$ico.Add([byte]($len -band 0xFF))
$ico.Add([byte](($len -shr 8) -band 0xFF))
$ico.Add([byte](($len -shr 16) -band 0xFF))
$ico.Add([byte](($len -shr 24) -band 0xFF))
$ico.Add(22); $ico.Add(0); $ico.Add(0); $ico.Add(0)
$ico.AddRange($png)
[System.IO.File]::WriteAllBytes($outIco, $ico.ToArray())

Write-Output "已生成：$outPng"
Write-Output "已生成：$outIco"
