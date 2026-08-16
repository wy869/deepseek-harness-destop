#!/usr/bin/env node
/**
 * DeepSeek Harness 桌面版启动器（带生命周期管理 + 首次使用 API Key 校验）
 *
 * 职责：
 *   1. 首次使用：检测是否已配置 DeepSeek API Key；未配置则弹出输入框，
 *      校验（调用 api.deepseek.com）后保存到 $DSH_HOME/.credentials.yaml。
 *   2. 检测后台服务（默认 http://127.0.0.1:3080）；未运行则启动 `dsh web`
 *      （等价于 `npx @deepseek-ai/dsh web`），等待就绪。
 *   3. 用浏览器「应用模式」打开独立窗口，并持续等待。
 *   4. 窗口关闭后，若后端是本启动器启动的，则杀死后端进程树并释放窗口，随后退出。
 *
 * 该脚本由桌面快捷方式 -> launcher.vbs 隐藏调用；也可 `node launcher.js` 手动运行。
 * 支持 `--dry-run`：只做检查并打印将要执行的动作，不真正改动任何东西。
 */
"use strict";

const { spawn, spawnSync, execFileSync } = require("node:child_process");
const net = require("node:net");
const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// ---------------------------------------------------------------------------
// 配置解析
// ---------------------------------------------------------------------------
const APP_DIR = __dirname;
const LOCAL_APP_DATA = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
const DATA_DIR = path.join(LOCAL_APP_DATA, "DeepSeekHarness");
const LOG_FILE = path.join(DATA_DIR, "launcher.log");
const LOCK_FILE = path.join(DATA_DIR, "app.lock");
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
const CRED_FILE = path.join(DSH_HOME, ".credentials.yaml");

const DEFAULTS = {
  host: "127.0.0.1",
  port: 3080,
  workspace: "E:\\Deepseek Harness",
  windowWidth: 1440,
  windowHeight: 900,
  windowPositionX: 80,
  windowPositionY: 40,
  browser: "auto",
  browserFamily: "",
  apiBaseUrl: "https://api.deepseek.com",
  keyEnv: "DEEPSEEK_API_KEY",
};

let config = Object.assign({}, DEFAULTS);
const CONFIG_PATH = path.join(APP_DIR, "config.json");
if (fs.existsSync(CONFIG_PATH)) {
  try {
    config = Object.assign(config, JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")));
  } catch (err) {
    log(`警告：读取 config.json 失败（${err.message}），使用默认配置`);
  }
}
config.url = `http://${config.host}:${config.port}`;

function defaultDshBin() {
  return path.join(DSH_HOME, "profiles", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
}
const DSH_BIN = config.dshBin || defaultDshBin();

// ---------------------------------------------------------------------------
// 浏览器检测
// ---------------------------------------------------------------------------
const PF = process.env.ProgramFiles || "C:\\Program Files";
const PF86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
const LOCAL = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");

const BROWSERS = [
  { id: "edge", name: "Microsoft Edge", family: "chromium", paths: [
    path.join(PF86, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(PF, "Microsoft", "Edge", "Application", "msedge.exe") ] },
  { id: "chrome", name: "Google Chrome", family: "chromium", paths: [
    path.join(PF, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(PF86, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(LOCAL, "Google", "Chrome", "Application", "chrome.exe") ] },
  { id: "qq", name: "QQ浏览器", family: "chromium", paths: [
    path.join(PF, "Tencent", "QQBrowser", "QQBrowser.exe"),
    path.join(PF86, "Tencent", "QQBrowser", "QQBrowser.exe") ] },
  { id: "firefox", name: "Mozilla Firefox", family: "firefox", paths: [
    path.join(PF, "Mozilla Firefox", "firefox.exe"),
    path.join(PF86, "Mozilla Firefox", "firefox.exe") ] },
  { id: "brave", name: "Brave", family: "chromium", paths: [
    path.join(PF, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
    path.join(LOCAL, "BraveSoftware", "Brave-Browser", "Application", "brave.exe") ] },
  { id: "opera", name: "Opera", family: "chromium", paths: [
    path.join(LOCAL, "Programs", "Opera", "launcher.exe"),
    path.join(PF, "Opera", "launcher.exe") ] },
  { id: "vivaldi", name: "Vivaldi", family: "chromium", paths: [
    path.join(LOCAL, "Vivaldi", "Application", "vivaldi.exe"),
    path.join(PF, "Vivaldi", "Application", "vivaldi.exe") ] },
  { id: "360", name: "360浏览器", family: "chromium", paths: [
    path.join(LOCAL, "360Chrome", "Chrome", "Application", "360chrome.exe"),
    path.join(PF86, "360", "360se6", "Application", "360se.exe"),
    path.join(PF, "360", "360se6", "Application", "360se.exe") ] },
  { id: "sogou", name: "搜狗浏览器", family: "chromium", paths: [
    path.join(PF86, "SogouExplorer", "SogouExplorer.exe"),
    path.join(PF, "SogouExplorer", "SogouExplorer.exe") ] },
];

function findBrowserById(id) {
  const entry = BROWSERS.find((b) => b.id === id);
  if (!entry) return null;
  for (const p of entry.paths) if (fs.existsSync(p)) return { id: entry.id, name: entry.name, family: entry.family, path: p };
  return null;
}
function installedBrowsers() {
  const out = [];
  for (const b of BROWSERS) { const f = findBrowserById(b.id); if (f) out.push(f); }
  return out;
}
function readDefaultProgId() {
  try {
    const out = execFileSync("reg", ["query", "HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice", "/v", "ProgId"], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    const m = out.match(/ProgId\s+REG_SZ\s+([^\s]+)/);
    return m ? m[1] : null;
  } catch (_) { return null; }
}
function progIdToBrowserId(progId) {
  if (!progId) return null;
  const p = progId.toLowerCase();
  if (p.includes("firefox")) return "firefox";
  if (p.includes("msedge") || p.includes("edge")) return "edge";
  if (p.includes("brave")) return "brave";
  if (p.includes("opera")) return "opera";
  if (p.includes("vivaldi")) return "vivaldi";
  if (p.includes("360")) return "360";
  if (p.includes("qq") || p.includes("tencent")) return "qq";
  if (p.includes("sogou")) return "sogou";
  if (p.includes("chrome")) return "chrome";
  return null;
}
function resolveBrowser() {
  const pref = String(config.browser || "auto").trim();
  if (pref && (/[\\/]/.test(pref) || /\.exe$/i.test(pref))) {
    if (fs.existsSync(pref)) return { id: "custom", name: path.basename(pref), family: (config.browserFamily || "other").toLowerCase(), path: pref };
    log(`警告：自定义浏览器路径不存在：${pref}`);
  }
  const list = installedBrowsers();
  const byId = (id) => list.find((b) => b.id === id) || null;
  if (pref && pref !== "auto" && pref !== "default") {
    const b = byId(pref.toLowerCase());
    if (b) return b;
    log(`警告：未找到浏览器 "${pref}"，回退自动检测`);
  }
  if (pref === "default" || pref === "auto") {
    const defId = progIdToBrowserId(readDefaultProgId());
    if (defId) { const b = byId(defId); if (b) { log(`已检测到默认浏览器：${b.name}`); return b; } }
  }
  const order = ["edge", "chrome", "qq", "360", "sogou", "brave", "opera", "vivaldi", "firefox"];
  for (const id of order) { const b = byId(id); if (b) { log(`未识别默认浏览器，使用：${b.name}`); return b; } }
  return null;
}

// ---------------------------------------------------------------------------
// 日志
// ---------------------------------------------------------------------------
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch (_) {}
  if (!process.argv.includes("--silent")) {
    try { process.stdout.write(line + "\n"); } catch (_) {}
  }
}

function showMessage(text, title = "DeepSeek Harness") {
  try {
    execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
      "Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.MessageBox]::Show($env:DSH_MSG_TEXT, $env:DSH_MSG_TITLE, 'OK', 'Information')"],
      { env: Object.assign({}, process.env, { DSH_MSG_TEXT: text, DSH_MSG_TITLE: title }), windowsHide: true, stdio: "ignore" });
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// 端口 / 服务就绪检测
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

// ---------------------------------------------------------------------------
// API Key：读取 / 提示 / 校验 / 保存
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
  const ps1 = path.join(APP_DIR, "prompt-key.ps1");
  if (!fs.existsSync(ps1)) {
    showMessage("缺少 prompt-key.ps1，无法弹出输入框。请手动在 " + CRED_FILE + " 中写入 " + config.keyEnv + "。");
    return null;
  }
  try {
    const out = execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    const key = (out || "").trim();
    return key || null;
  } catch (e) {
    log(`弹出输入框失败：${e.message}`);
    return null;
  }
}

function requestJson(base, key, urlPath) {
  return new Promise((resolve) => {
    const req = https.get(base + urlPath, {
      headers: { Authorization: "Bearer " + key, "User-Agent": "dsh-desktop-launcher" },
    }, (res) => {
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
      showMessage("未输入 API Key，本次取消启动。");
      return false;
    }
    if (!/^sk-[\w-]{8,}$/i.test(key)) {
      showMessage("格式不正确：DeepSeek API Key 应以 sk- 开头。", "DeepSeek Harness");
      continue;
    }
    const res = await validateApiKey(key);
    if (res.ok) {
      storeApiKey(key);
      log("API Key 校验通过，已保存到 " + CRED_FILE);
      showMessage("API Key 校验通过，已保存。", "DeepSeek Harness");
      return true;
    }
    if (res.reason === "invalid") showMessage("API Key 无效（认证失败 401）。请检查后重试。", "DeepSeek Harness");
    else if (res.reason === "network") showMessage("无法连接 " + config.apiBaseUrl + "，请检查网络后重试。", "DeepSeek Harness");
    else showMessage("校验失败：" + res.reason + "。请重试。", "DeepSeek Harness");
  }
  showMessage("多次校验失败，本次启动已取消。", "DeepSeek Harness");
  return false;
}

// ---------------------------------------------------------------------------
// 单实例锁
// ---------------------------------------------------------------------------
function isPidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
}
function acquireLock() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(LOCK_FILE)) {
      const pid = parseInt(fs.readFileSync(LOCK_FILE, "utf8").trim(), 10);
      if (pid && pid !== process.pid && isPidAlive(pid)) return false;
    }
    fs.writeFileSync(LOCK_FILE, String(process.pid));
    return true;
  } catch (_) { return true; }
}
function releaseLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
}

// ---------------------------------------------------------------------------
// 后端服务生命周期
// ---------------------------------------------------------------------------
let ownedServerChild = null;

function serverCommand() {
  if (fs.existsSync(DSH_BIN)) {
    return { cmd: process.execPath, args: [DSH_BIN, "web"], label: `node "${DSH_BIN}" web` };
  }
  return { cmd: process.env.ComSpec || "cmd.exe", args: ["/c", "npx", "@deepseek-ai/dsh", "web"], label: "npx @deepseek-ai/dsh web" };
}

function startServer() {
  const { cmd, args, label } = serverCommand();
  let workspace = config.workspace;
  if (!fs.existsSync(workspace)) { log(`工作区不存在（${workspace}），回退到用户主目录`); workspace = os.homedir(); }
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

process.on("exit", () => {
  if (ownedServerChild) killServerTree(ownedServerChild);
});

// ---------------------------------------------------------------------------
// 启动动画（Splash）
// ---------------------------------------------------------------------------
function showSplash() {
  const ps1 = path.join(APP_DIR, "splash.ps1");
  if (!fs.existsSync(ps1)) return null;
  try {
    const child = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1], { stdio: "ignore", windowsHide: true, detached: true });
    child.unref();
    return child.pid;
  } catch (e) {
    log(`启动动画显示失败：${e.message}`);
    return null;
  }
}

function closeSplash(pid) {
  if (!pid) return;
  try { spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// 打开窗口并等待关闭
// ---------------------------------------------------------------------------
function buildBrowserArgs(browser) {
  const url = config.url;
  if (browser.family === "firefox") return ["-new-window", url];
  if (browser.family === "chromium") {
    return [
      `--app=${url}`,
      "--no-first-run",
      "--no-default-browser-check",
      `--window-size=${config.windowWidth},${config.windowHeight}`,
      `--window-position=${config.windowPositionX},${config.windowPositionY}`,
    ];
  }
  return [url];
}

function openWindowAndWait(browser, onOpened) {
  return new Promise((resolve) => {
    const args = buildBrowserArgs(browser);
    const finalArgs = args.slice();
    if (browser.family === "chromium") {
      const profileDir = path.join(DATA_DIR, "AppProfile");
      try {
        fs.mkdirSync(profileDir, { recursive: true });
        const firstRun = path.join(profileDir, "First Run");
        if (!fs.existsSync(firstRun)) fs.writeFileSync(firstRun, "");
      } catch (_) {}
      finalArgs.push(`--user-data-dir=${profileDir}`);
      finalArgs.push("--disable-background-mode");
      finalArgs.push("--disable-background-networking");
      finalArgs.push("--disable-features=msEdgeStartupBoost");
    }
    log(`打开窗口：${browser.path} [${browser.name}/${browser.family}] ${finalArgs.join(" ")}`);

    const started = Date.now();
    let child;
    try {
      child = spawn(browser.path, finalArgs, { stdio: "ignore", windowsHide: true });
    } catch (err) {
      log(`打开窗口失败：${err.message}`);
      resolve({ delegated: false });
      return;
    }
    if (onOpened) onOpened();
    let settled = false;
    const finish = (delegated) => { if (!settled) { settled = true; resolve({ delegated }); } };
    child.on("error", (err) => { log(`窗口进程错误：${err.message}`); finish(false); });
    child.on("exit", (code) => {
      const elapsed = Date.now() - started;
      if (elapsed < 2500) {
        log(`浏览器主进程快速退出（${elapsed}ms, code ${code}），可能已委托现有实例，不跟踪窗口生命周期`);
        finish(true);
      } else {
        log(`窗口已关闭（进程退出, code ${code}）`);
        finish(false);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  log(`--- 启动（${dryRun ? "dry-run" : "正式"}）---`);

  // 1) 首次使用：API Key
  const hasKey = !!getConfiguredApiKey();
  log(`API Key 状态：${hasKey ? "已配置" : "未配置"}`);
  if (!hasKey) {
    if (dryRun) {
      log("[dry-run] 将弹出输入框要求输入 API Key，校验并保存到 " + CRED_FILE);
    } else if (!(await ensureApiKey())) {
      log("API Key 未就绪，退出");
      return;
    }
  }

  // 2) 单实例
  if (!dryRun && !acquireLock()) {
    log("检测到应用已在运行，本次不再重复启动");
    return;
  }

  // 2.5) 显示启动动画
  let splashPid = null;
  const closeSplashNow = () => { closeSplash(splashPid); splashPid = null; };
  if (!dryRun) splashPid = showSplash();

  // 3) 后端服务
  const up = await portInUse(config.host, config.port);
  log(`端口 ${config.host}:${config.port} 状态：${up ? "已监听" : "未监听"}`);
  if (!up) {
    if (dryRun) {
      log(`[dry-run] 将执行：${serverCommand().label}（工作区 ${config.workspace}）`);
    } else {
      ownedServerChild = startServer();
      const ready = await waitForServer(config.url, 60000);
      if (!ready) {
        log("错误：等待服务就绪超时（60s），请查看 server.log");
        killServerTree(ownedServerChild);
        ownedServerChild = null;
        closeSplashNow();
        releaseLock();
        return;
      }
      log("服务已就绪");
    }
  } else {
    log("服务已在运行（本启动器未拥有它，窗口关闭时不会停止它）");
  }

  // 4) 打开窗口
  const browser = resolveBrowser();
  if (!browser) {
    log("错误：未找到任何浏览器");
    if (ownedServerChild) { killServerTree(ownedServerChild); ownedServerChild = null; }
    closeSplashNow();
    releaseLock();
    return;
  }
  if (dryRun) {
    log(`[dry-run] 将使用浏览器：${browser.name}（${browser.path}），打开 ${config.url}`);
    closeSplashNow();
    releaseLock();
    return;
  }

  const result = await openWindowAndWait(browser, () => {
    // 窗口已拉起，稍候关闭启动动画
    setTimeout(closeSplashNow, 1200);
  });
  closeSplashNow(); // 兜底

  // 5) 窗口关闭 -> 清理后端
  if (!result.delegated && ownedServerChild) {
    killServerTree(ownedServerChild);
    ownedServerChild = null;
  } else if (result.delegated && ownedServerChild) {
    log("警告：浏览器委托给现有实例，无法感知窗口关闭，后端将保持运行（可在任务管理器中结束）");
    ownedServerChild = null; // 不再持有，避免退出时误杀
  }
  releaseLock();
  log("本次会话结束");
}

main().catch((err) => {
  log(`未预期错误：${err && err.stack ? err.stack : err}`);
  try { if (ownedServerChild) killServerTree(ownedServerChild); } catch (_) {}
  releaseLock();
  process.exit(1);
});
