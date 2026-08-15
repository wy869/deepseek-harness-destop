"use strict";
/**
 * DeepSeek Harness 桌面版 —— Electron 原生窗口
 *
 * 生命周期：
 *   1. 首次使用校验/保存 DeepSeek API Key。
 *   2. 显示启动动画（splash.html）。
 *   3. 启动 `dsh web`（若 127.0.0.1:3080 未监听）并等待就绪。
 *   4. 打开原生窗口加载 http://127.0.0.1:3080，关闭启动动画。
 *   5. 窗口关闭 → 结束后台 dsh web → 退出；下次打开自动重启。
 */
const { app, BrowserWindow, dialog } = require("electron");
const { spawn, spawnSync, execFileSync } = require("node:child_process");
const net = require("node:net");
const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const APP_DIR = __dirname;
const DESKTOP_DIR = path.join(APP_DIR, "..");
const LOCAL_APP_DATA = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
const DATA_DIR = path.join(LOCAL_APP_DATA, "DeepSeekHarness");
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
const CRED_FILE = path.join(DSH_HOME, ".credentials.yaml");
const ICON_ICO = path.join(DESKTOP_DIR, "icon.ico");
const PROMPT_KEY_PS1 = path.join(DESKTOP_DIR, "prompt-key.ps1");

const DEFAULTS = {
  host: "127.0.0.1",
  port: 3080,
  workspace: "E:\\Deepseek Harness",
  windowWidth: 1440,
  windowHeight: 900,
  windowPositionX: 80,
  windowPositionY: 40,
  apiBaseUrl: "https://api.deepseek.com",
  keyEnv: "DEEPSEEK_API_KEY",
};

let config = Object.assign({}, DEFAULTS);
try {
  const cfgPath = path.join(DESKTOP_DIR, "config.json");
  if (fs.existsSync(cfgPath)) config = Object.assign(config, JSON.parse(fs.readFileSync(cfgPath, "utf8")));
} catch (_) {}
config.url = `http://${config.host}:${config.port}`;

function defaultDshBin() {
  return path.join(DSH_HOME, "profiles", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
}
const DSH_BIN = config.dshBin || defaultDshBin();

// ---------------------------------------------------------------------------
// 日志
// ---------------------------------------------------------------------------
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(path.join(DATA_DIR, "launcher.log"), line + "\n");
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// API Key
// ---------------------------------------------------------------------------
function getConfiguredApiKey() {
  if (process.env[config.keyEnv]) return process.env[config.keyEnv].trim();
  if (fs.existsSync(CRED_FILE)) {
    try {
      const m = fs.readFileSync(CRED_FILE, "utf8").match(new RegExp("^" + config.keyEnv + "\\s*:\\s*[\"']?([^\"'\\r\\n]+)[\"']?\\s*$", "m"));
      if (m && m[1].trim()) return m[1].trim();
    } catch (_) {}
  }
  return null;
}

function promptApiKey() {
  if (!fs.existsSync(PROMPT_KEY_PS1)) return null;
  try {
    const out = execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", PROMPT_KEY_PS1], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    const key = (out || "").trim();
    return key || null;
  } catch (e) {
    log(`弹出输入框失败：${e.message}`);
    return null;
  }
}

function requestJson(base, key, urlPath) {
  return new Promise((resolve) => {
    const req = https.get(base + urlPath, { headers: { Authorization: "Bearer " + key, "User-Agent": "dsh-desktop" } }, (res) => {
      const code = res.statusCode;
      res.resume();
      resolve(code);
    });
    req.setTimeout(8000, () => { req.destroy(); resolve(0); });
    req.on("error", () => resolve(0));
  });
}

async function validateApiKey(key) {
  const base = config.apiBaseUrl.replace(/\/+$/, "");
  let code = await requestJson(base, key, "/models");
  if (code === 200) return { ok: true };
  if (code === 401 || code === 403) return { ok: false, reason: "invalid" };
  code = await requestJson(base, key, "/user/balance");
  if (code === 200) return { ok: true };
  if (code === 401 || code === 403) return { ok: false, reason: "invalid" };
  if (code === 0) return { ok: false, reason: "network" };
  return { ok: false, reason: "http_" + code };
}

function storeApiKey(key) {
  let lines = [];
  if (fs.existsSync(CRED_FILE)) {
    try { lines = fs.readFileSync(CRED_FILE, "utf8").split(/\r?\n/); } catch (_) {}
  }
  let found = false;
  lines = lines.map((line) => {
    if (new RegExp("^" + config.keyEnv + "\\s*:").test(line)) { found = true; return config.keyEnv + ": " + key; }
    return line;
  });
  if (!found) {
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    lines.push(config.keyEnv + ": " + key);
  }
  fs.mkdirSync(path.dirname(CRED_FILE), { recursive: true });
  fs.writeFileSync(CRED_FILE, lines.join("\n") + "\n", { mode: 0o600 });
}

async function ensureApiKey() {
  if (getConfiguredApiKey()) return true;
  log("未检测到 API Key，进入首次使用配置");
  for (let i = 0; i < 3; i++) {
    const key = promptApiKey();
    if (!key) {
      await dialog.showMessageBox({ type: "warning", title: "DeepSeek Harness", message: "未输入 API Key，本次取消启动。", buttons: ["确定"] });
      return false;
    }
    if (!/^sk-[\w-]{8,}$/i.test(key)) {
      await dialog.showMessageBox({ type: "warning", title: "DeepSeek Harness", message: "格式不正确：DeepSeek API Key 应以 sk- 开头。", buttons: ["确定"] });
      continue;
    }
    const res = await validateApiKey(key);
    if (res.ok) {
      storeApiKey(key);
      log("API Key 校验通过，已保存到 " + CRED_FILE);
      await dialog.showMessageBox({ type: "info", title: "DeepSeek Harness", message: "API Key 校验通过，已保存。", buttons: ["确定"] });
      return true;
    }
    if (res.reason === "invalid") await dialog.showMessageBox({ type: "error", title: "DeepSeek Harness", message: "API Key 无效（认证失败 401）。请检查后重试。", buttons: ["确定"] });
    else if (res.reason === "network") await dialog.showMessageBox({ type: "error", title: "DeepSeek Harness", message: "无法连接 " + config.apiBaseUrl + "，请检查网络后重试。", buttons: ["确定"] });
    else await dialog.showMessageBox({ type: "error", title: "DeepSeek Harness", message: "校验失败：" + res.reason + "。请重试。", buttons: ["确定"] });
  }
  await dialog.showMessageBox({ type: "error", title: "DeepSeek Harness", message: "多次校验失败，本次启动已取消。", buttons: ["确定"] });
  return false;
}

// ---------------------------------------------------------------------------
// 端口 / 服务
// ---------------------------------------------------------------------------
function portInUse(host, port) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port, timeout: 1500 });
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("timeout", () => { s.destroy(); resolve(false); });
    s.once("error", () => resolve(false));
  });
}
function httpProbe(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => { res.resume(); resolve(true); });
    req.setTimeout(1500, () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
  });
}
async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await httpProbe(url)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function findNode() {
  try {
    const out = execFileSync("where", ["node"], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    const first = out.split(/\r?\n/).map((l) => l.trim()).find((l) => /node\.exe$/i.test(l));
    if (first) return first;
  } catch (_) {}
  const candidates = [
    path.join(process.env.ProgramFiles || "C:\\Program Files", "nodejs", "node.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "nodejs", "node.exe"),
    "E:\\Node.js\\node.exe",
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return "node";
}
const NODE_EXE = findNode();

function serverCommand() {
  if (fs.existsSync(DSH_BIN)) {
    return { cmd: NODE_EXE, args: [DSH_BIN, "web"], label: `node "${DSH_BIN}" web` };
  }
  return { cmd: process.env.ComSpec || "cmd.exe", args: ["/c", "npx", "@deepseek-ai/dsh", "web"], label: "npx @deepseek-ai/dsh web" };
}

function startServer() {
  const { cmd, args, label } = serverCommand();
  let workspace = config.workspace;
  if (!fs.existsSync(workspace)) workspace = os.homedir();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const outFd = fs.openSync(path.join(DATA_DIR, "server.log"), "a");
  const env = Object.assign({}, process.env);
  if (!env.DSH_HOME) env.DSH_HOME = DSH_HOME;
  log(`启动服务：${label}（工作区 ${workspace}）`);
  const child = spawn(cmd, args, { cwd: workspace, detached: false, stdio: ["ignore", outFd, outFd], windowsHide: true, env });
  child.on("error", (err) => log(`启动服务失败：${err.message}`));
  fs.closeSync(outFd);
  return child;
}

function killServerTree(child) {
  if (!child) return;
  const pid = child.pid;
  if (child.exitCode !== null || child.signalCode !== null) return;
  log(`停止后端进程（PID ${pid}）`);
  try { spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); } catch (_) {}
  try { child.kill(); } catch (_) {}
}

// ---------------------------------------------------------------------------
// 窗口
// ---------------------------------------------------------------------------
let serverChild = null;
let splashWin = null;
let mainWin = null;

function createSplash() {
  splashWin = new BrowserWindow({
    width: 520,
    height: 360,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    icon: ICON_ICO,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  splashWin.setAlwaysOnTop(true, "screen-saver");
  splashWin.loadFile(path.join(APP_DIR, "splash.html"));
  splashWin.on("closed", () => { splashWin = null; });
}

function closeSplash() {
  if (splashWin && !splashWin.isDestroyed()) splashWin.close();
}

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: config.windowWidth,
    height: config.windowHeight,
    x: config.windowPositionX,
    y: config.windowPositionY,
    icon: ICON_ICO,
    title: "DeepSeek Harness",
    autoHideMenuBar: true,
    show: false,
    backgroundColor: "#10141f",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  mainWin.loadURL(config.url);
  mainWin.once("ready-to-show", () => { log("主窗口就绪"); mainWin.show(); closeSplash(); });
  mainWin.webContents.on("render-process-gone", (e, details) => { log("渲染进程退出：" + details.reason); });
  mainWin.webContents.on("did-fail-load", (e, code, desc) => { log("页面加载失败：" + code + " " + desc); });
  mainWin.on("closed", () => { log("主窗口已关闭"); mainWin = null; });
  log("主窗口已创建，加载 " + config.url);
}

function killServer() {
  if (serverChild) {
    killServerTree(serverChild);
    serverChild = null;
  }
}

process.on("uncaughtException", (err) => log("未捕获异常：" + (err && err.stack ? err.stack : err)));
process.on("unhandledRejection", (reason) => log("未处理的 Promise 拒绝：" + reason));

app.whenReady().then(async () => {
  log("--- Electron 启动 ---");

  if (!(await ensureApiKey())) { app.quit(); return; }

  createSplash();

  const up = await portInUse(config.host, config.port);
  log(`端口 ${config.host}:${config.port} 状态：${up ? "已监听" : "未监听"}`);
  if (!up) {
    serverChild = startServer();
    const ready = await waitForServer(config.url, 60000);
    if (!ready) {
      log("错误：等待服务就绪超时（60s）");
      closeSplash();
      killServer();
      await dialog.showMessageBox({ type: "error", title: "DeepSeek Harness", message: "后台服务启动超时，请查看日志：\n" + path.join(DATA_DIR, "server.log"), buttons: ["确定"] });
      app.quit();
      return;
    }
    log("服务已就绪");
  } else {
    log("服务已在运行（本应用未拥有它，关闭时不会停止它）");
  }

  createMainWindow();
  setTimeout(closeSplash, 15000); // 兜底
});

app.on("window-all-closed", () => {
  killServer();
  app.quit();
});

app.on("before-quit", () => {
  killServer();
});

process.on("exit", () => {
  killServer();
});
