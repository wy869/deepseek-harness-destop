# DeepSeek Harness 首次使用：弹出 API Key 输入框（掩码显示）
# 由 launcher.js 调用；输出用户输入的 Key（取消或留空则不输出）
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = "DeepSeek Harness - 首次使用"
$form.Size = New-Object System.Drawing.Size(500, 190)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false

$label = New-Object System.Windows.Forms.Label
$label.Text = "请输入你的 DeepSeek API Key（sk-...）："
$label.Location = New-Object System.Drawing.Point(20, 22)
$label.Size = New-Object System.Drawing.Size(450, 28)
$form.Controls.Add($label)

$textbox = New-Object System.Windows.Forms.TextBox
$textbox.Location = New-Object System.Drawing.Point(20, 58)
$textbox.Size = New-Object System.Drawing.Size(440, 24)
$textbox.UseSystemPasswordChar = $true
$form.Controls.Add($textbox)

$ok = New-Object System.Windows.Forms.Button
$ok.Text = "确定"
$ok.Location = New-Object System.Drawing.Point(250, 100)
$ok.Size = New-Object System.Drawing.Size(100, 32)
$ok.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.Controls.Add($ok)

$cancel = New-Object System.Windows.Forms.Button
$cancel.Text = "取消"
$cancel.Location = New-Object System.Drawing.Point(360, 100)
$cancel.Size = New-Object System.Drawing.Size(100, 32)
$cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$form.Controls.Add($cancel)

$form.AcceptButton = $ok
$form.CancelButton = $cancel
$form.Add_Shown({ $textbox.Focus() })

$result = $form.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK -and $textbox.Text.Trim() -ne "") {
    Write-Output $textbox.Text.Trim()
}
