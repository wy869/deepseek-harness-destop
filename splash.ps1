# DeepSeek Harness 启动动画（Splash）
# 无边框圆角置顶窗口：深蓝渐变背景 + DeepSeek 鲸鱼图标 + "DeepSeek Harness" + 动画进度条。
# 由 launcher.js 启动；窗口打开后由 launcher 结束本进程，或 30 秒后自动关闭。
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$iconPath = Join-Path $PSScriptRoot "icon.png"

$W = 520
$H = 360

$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.ClientSize = New-Object System.Drawing.Size($W, $H)
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.DoubleBuffered = $true

# ---- 圆角 ----
$radius = 22
$d = 2 * $radius
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc(0, 0, $d, $d, 180, 90)
$path.AddArc($W - $d, 0, $d, $d, 270, 90)
$path.AddArc($W - $d, $H - $d, $d, $d, 0, 90)
$path.AddArc(0, $H - $d, $d, $d, 90, 90)
$path.CloseFigure()
$form.Region = New-Object System.Drawing.Region($path)

# ---- 渐变背景 ----
$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

$rect = New-Object System.Drawing.Rectangle(0, 0, $W, $H)
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect,
    [System.Drawing.Color]::FromArgb(255, 23, 28, 52),
    [System.Drawing.Color]::FromArgb(255, 8, 10, 20),
    [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
$g.FillRectangle($bgBrush, $rect)
$bgBrush.Dispose()

# 顶部蓝色光晕
$glowRect = New-Object System.Drawing.RectangleF(0, 0, $W, 220)
$glow = New-Object System.Drawing.Drawing2D.LinearGradientBrush($glowRect,
    [System.Drawing.Color]::FromArgb(90, 77, 107, 254),
    [System.Drawing.Color]::FromArgb(0, 77, 107, 254),
    [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
$g.FillRectangle($glow, $glowRect)
$glow.Dispose()

# 鲸鱼图标后方的柔光
$centerGlow = New-Object System.Drawing.Drawing2D.GraphicsPath
$centerGlow.AddEllipse(($W / 2 - 92), 66, 184, 184)
$pgb = New-Object System.Drawing.Drawing2D.PathGradientBrush($centerGlow)
$pgb.CenterColor = [System.Drawing.Color]::FromArgb(60, 100, 130, 255)
$pgb.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 100, 130, 255))
$g.FillPath($pgb, $centerGlow)
$pgb.Dispose()
$centerGlow.Dispose()

$g.Dispose()
$form.BackgroundImage = $bmp
$form.BackgroundImageLayout = [System.Windows.Forms.ImageLayout]::None

# ---- 鲸鱼图标 ----
$pic = New-Object System.Windows.Forms.PictureBox
if (Test-Path $iconPath) {
    $pic.Image = [System.Drawing.Image]::FromFile($iconPath)
}
$pic.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
$pic.Size = New-Object System.Drawing.Size(128, 128)
$pic.Location = New-Object System.Drawing.Point(($W - 128) / 2, 92)
$pic.BackColor = [System.Drawing.Color]::Transparent
$form.Controls.Add($pic)

# ---- 标题 ----
$title = New-Object System.Windows.Forms.Label
$title.Text = "DeepSeek Harness"
$title.ForeColor = [System.Drawing.Color]::White
$title.Font = New-Object System.Drawing.Font("Segoe UI", 24, [System.Drawing.FontStyle]::Bold)
$title.Size = New-Object System.Drawing.Size($W, 48)
$title.Location = New-Object System.Drawing.Point(0, 232)
$title.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
$title.BackColor = [System.Drawing.Color]::Transparent
$form.Controls.Add($title)

# ---- 副标题（动画省略号） ----
$sub = New-Object System.Windows.Forms.Label
$sub.ForeColor = [System.Drawing.Color]::FromArgb(255, 152, 164, 192)
$sub.Font = New-Object System.Drawing.Font("Segoe UI", 11)
$sub.Size = New-Object System.Drawing.Size($W, 26)
$sub.Location = New-Object System.Drawing.Point(0, 280)
$sub.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
$sub.BackColor = [System.Drawing.Color]::Transparent
$form.Controls.Add($sub)

# ---- 自绘进度条 ----
$bar = New-Object System.Windows.Forms.PictureBox
$bar.Size = New-Object System.Drawing.Size(320, 4)
$bar.Location = New-Object System.Drawing.Point(($W - 320) / 2, 318)
$bar.BackColor = [System.Drawing.Color]::Transparent

$script:barOffset = 0
$bar.Add_Paint({
    param($s, $e)
    $g2 = $e.Graphics
    $g2.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $bw = 320
    $bh = 4
    $track = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Rectangle(0, 0, $bw, $bh)),
        [System.Drawing.Color]::FromArgb(255, 44, 52, 80),
        [System.Drawing.Color]::FromArgb(255, 44, 52, 80), 0)
    $g2.FillRectangle($track, 0, 0, $bw, $bh)
    $track.Dispose()
    $x = ($script:barOffset % ($bw + 100)) - 100
    $hl = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Rectangle($x, 0, 100, $bh)),
        [System.Drawing.Color]::FromArgb(0, 77, 107, 254),
        [System.Drawing.Color]::FromArgb(255, 130, 158, 255), 0)
    $g2.FillRectangle($hl, $x, 0, 100, $bh)
    $hl.Dispose()
})
$form.Controls.Add($bar)

# ---- 动画计时器 ----
$script:dotPhase = 0
$anim = New-Object System.Windows.Forms.Timer
$anim.Interval = 120
$anim.Add_Tick({
    $script:barOffset += 8
    $script:dotPhase = ($script:dotPhase + 1) % 4
    $sub.Text = "正在启动" + ("." * $script:dotPhase)
    $bar.Invalidate()
})
$anim.Start()

# ---- 30 秒兜底自动关闭 ----
$autoClose = New-Object System.Windows.Forms.Timer
$autoClose.Interval = 30000
$autoClose.Add_Tick({ $form.Close() })
$autoClose.Start()

$form.Show()
[System.Windows.Forms.Application]::Run($form)
