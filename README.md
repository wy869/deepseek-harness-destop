# DeepSeek Harness 桌面版（Electron）

一个基于 **Electron** 的 DeepSeek Harness 本地桌面软件：双击图标即可在**原生窗口**中打开
DeepSeek Harness，不依赖任何浏览器，无标签页、无地址栏。

## 特性

- 🖥️ **原生窗口**：Electron 内置 Chromium，与 QQ浏览器 / Edge / Chrome 完全无关。
- 🐋 **启动动画**：DeepSeek 鲸鱼图标 + 「DeepSeek Harness」动画进度条。
- 🔁 **随窗口启停**：打开软件自动启动 `dsh web`（默认 `127.0.0.1:3080`）；关闭窗口自动结束后台进程，3080 端口随之释放。
- 🔑 **首次配置**：首次使用弹出输入框，联网校验 DeepSeek API Key 并保存到 `~\.dsh\.credentials.yaml`。
- ⚙️ **可配置**：端口、工作区、窗口大小位置、API 地址均可在 `config.json` 调整。

## 系统要求

- Windows 10 / 11（64 位）
- Node.js（`node.exe` 需在 PATH 中）
- DeepSeek Harness 已初始化（存在 `DSH_HOME` 配置档）
- DeepSeek API Key（首次使用时输入并校验）

## 安装

```bat
:: 1) 恢复 Electron 运行时（仅首次/从源码安装时需要）
cd app
npm install

:: 2) 创建桌面 / 开始菜单快捷方式
cd ..
install.cmd
```

或直接双击 `install.cmd`（若 `app\node_modules\electron` 已就绪）。

## 使用

双击桌面「DeepSeek Harness」图标：
首次使用会要求输入 API Key（校验后保存），随后显示启动动画并弹出原生窗口。
关闭窗口即停止后台服务，下次点击自动重启。

## 目录结构

```
desktop/
├─ app/
│  ├─ main.js            # Electron 主进程（首次配置 → 后端启停 → 窗口生命周期）
│  ├─ splash.html        # 启动动画页面
│  └─ package.json       # Electron 依赖（npm install 恢复 node_modules）
├─ install.cmd / install.ps1     # 安装（生成快捷方式）
├─ uninstall.cmd / uninstall.ps1 # 卸载（删除快捷方式）
├─ prompt-key.ps1        # 首次使用 API Key 输入框
├─ config.json           # 用户配置
├─ icon.ico / icon.png   # DeepSeek 官方鲸鱼图标
├─ launcher.js / launcher.vbs / splash.ps1  # 旧版浏览器启动器（备用）
├─ README.txt            # 快速说明
└─ 安装使用说明书.html     # 完整说明书
```

## 配置（config.json）

| 字段 | 默认值 | 说明 |
|---|---|---|
| `host` | `127.0.0.1` | 服务监听地址 |
| `port` | `3080` | 服务端口 |
| `workspace` | `E:\Deepseek Harness` | 冷启动时默认工作区 |
| `windowWidth` / `windowHeight` | `1440` / `900` | 窗口尺寸 |
| `windowPositionX` / `windowPositionY` | `80` / `40` | 窗口位置 |
| `apiBaseUrl` | `https://api.deepseek.com` | DeepSeek API 地址 |
| `keyEnv` | `DEEPSEEK_API_KEY` | 凭据键名 |

## 日志

- `%LOCALAPPDATA%\DeepSeekHarness\launcher.log` —— 应用日志
- `%LOCALAPPDATA%\DeepSeekHarness\server.log` —— 后台服务日志

## 原理

Electron 主进程：
1. 首次使用校验/保存 API Key；
2. 显示启动动画；
3. 检测 `127.0.0.1:3080`，未监听则启动 `dsh web` 并等待就绪；
4. 打开原生窗口加载该地址，关闭启动动画；
5. 窗口关闭 → 结束后台 `dsh web` → 退出。
