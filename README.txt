DeepSeek Harness 桌面版
================================================

这是什么？
------------------------------------------------
一个“桌面版”启动器：双击桌面图标即可打开 DeepSeek Harness，
在独立的桌面窗口中使用（无需打开浏览器、无标签页/地址栏）。

它做了什么？
------------------------------------------------
1. 首次使用：检测本机是否已配置 DeepSeek API Key；
   未配置则弹出输入框，联网校验后保存到 ~\.dsh\.credentials.yaml。
2. 显示“DeepSeek Harness”启动动画（鲸鱼图标 + 进度条）。
3. 检测后台 Web 服务是否在运行（默认 http://127.0.0.1:3080）。
4. 若未运行，自动启动 `dsh web`（等价于 npx @deepseek-ai/dsh web）并等待就绪。
5. 用浏览器“应用模式”打开独立窗口（不会新开普通浏览器窗口）。
6. 关闭窗口后，自动结束后台 dsh web 进程并释放窗口；
   下次点击图标时自动重新启动。

如何安装？
------------------------------------------------
双击运行  install.cmd  （或  install.ps1）
会在「桌面」和「开始菜单」各创建一个 “DeepSeek Harness” 快捷方式。

如何启动？
------------------------------------------------
双击桌面上的 “DeepSeek Harness” 图标即可。
首次使用会先弹出输入框要求输入 DeepSeek API Key（校验通过后保存），
然后自动启动后台服务，通常数秒后弹出应用窗口。

卸载？
------------------------------------------------
双击运行  uninstall.cmd  会删除快捷方式（保留程序文件）。

配置（可选）
------------------------------------------------
编辑同目录下的 config.json 可调整：
  - port           服务端口（默认 3080）
  - workspace      新会话的默认工作区目录
  - windowWidth / windowHeight / windowPositionX / windowPositionY
                  应用窗口大小与位置
  - browser        用哪个浏览器打开：auto（自动检测默认浏览器）/ 具体 id
                  （chrome/edge/firefox/qq/360 等）/ 或浏览器可执行文件路径
  - browserFamily  仅自定义路径时：chromium / firefox / other
  - apiBaseUrl     API Key 校验与模型调用的地址（默认 https://api.deepseek.com）
  - keyEnv         凭据键名（默认 DEEPSEEK_API_KEY）

文件说明
------------------------------------------------
  launcher.js            核心启动器（首次配置 → 启动 → 打开窗口 → 关闭清理）
  launcher.vbs           隐藏控制台的启动入口（桌面快捷方式指向它）
  start.cmd              带控制台的调试入口
  prompt-key.ps1         首次使用弹出 API Key 输入框（掩码显示）
  splash.ps1             启动动画（DeepSeek 图标 + DeepSeek Harness）
  install.cmd            安装（生成快捷方式）
  uninstall.cmd          卸载（删除快捷方式）
  icon.ico               应用图标（DeepSeek 官方鲸鱼 Logo）
  deepseek-official.png  官方 Logo 源图
  make-official-icon.ps1 用官方 Logo 重新生成图标
  make-icon.ps1          生成「DS」风格替代图标
  config.json            用户配置
  安装使用说明书.html/pdf  完整的安装与使用说明书

日志位置
------------------------------------------------
  %LOCALAPPDATA%\DeepSeekHarness\launcher.log   启动器日志
  %LOCALAPPDATA%\DeepSeekHarness\server.log     后台服务日志

依赖
------------------------------------------------
  - Node.js（node.exe 需在 PATH 中）
  - 任意现代浏览器（Chrome / Edge / QQ浏览器 / 360 / Firefox / Brave 等）
  - DeepSeek Harness 已安装（DSH_HOME 配置档中存在 dsh CLI）
  - DeepSeek API Key（首次使用时输入并校验）

================================================
