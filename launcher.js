#!/usr/bin/env node
/**
 * DeepSeek Harness 桌面版启动器（支持所有浏览器）
 *
 * 职责：
 *   1. 检查 DeepSeek Harness Web 服务是否已在运行（默认 http://127.0.0.1:3080）。
 *   2. 若未运行，则以守护进程方式启动 `dsh web`（工作目录为工作区），等待就绪。
 *   3. 自动检测系统已安装/默认的浏览器，用「应用模式」打开一个独立窗口：
 *        - Chromium 系（Chrome / Edge / QQ浏览器 / 360 / Brave / Opera / Vivaldi 等）
 *          -> 使用 --app 参数，打开无标签页、无地址栏的独立窗口（不会额外拉起普通浏览器窗口）。
 *        - Firefox -> 使用 -new-window 打开新窗口。
 *        - 其它   -> 直接以该 URL 打开。
 *
 * 可用 `config.json` 的 browser 字段指定浏览器：
 *   "auto"（默认，自动检测默认浏览器）、"default"（强制系统默认）、
 *   或具体 id："chrome" / "edge" / "firefox" / "brave" / "qq" / "360" / "opera" / "vivaldi" / "sogou"，
 *   或直接填写浏览器可执行文件的完整路径。
 *
 * 该脚本由桌面快捷方式 -> launcher.vbs 隐藏调用，也可用 `node launcher.js` 手动运行。
 * 支持 `--dry-run` 参数：只做检查并打印将要执行的动作，不真正打开窗口/启动服务。
 */
"use strict";

const { spawn, execFileSync } = require("node:child_process");
const net = require("node:net");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// ---------------------------------------------------------------------------
// 配置解析：内置默认值 + 同目录下可选的 config.json 覆盖
// ---------------------------------------------------------------------------
const APP_DIR = __dirname;
const LOCAL_APP_DATA = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
const DATA_DIR = path.join(LOCAL_APP_DATA, "DeepSeekHarness");
const LOG_FILE = path.join(DATA_DIR, "launcher.log");

const DEFAULTS = {
  host: "127.0.0.1",
  port: 3080,
  workspace: "E:\\Deepseek Harness",
  windowWidth: 1440,
  windowHeight: 900,
  windowPositionX: 80,
  windowPositionY: 40,
  browser: "auto",      // auto | default | <浏览器 id> | <可执行文件完整路径>
  browserFamily: "",    // 仅自定义路径时可选：chromium | firefox | other
};

let config = Object.assign({}, DEFAULTS);
const CONFIG_PATH = path.join(APP_DIR, "config.json");
if (fs.existsSync(CONFIG_PATH)) {
  try {
    const user = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    config = Object.assign(config, user);
  } catch (err) {
    log(`警告：读取 config.json 失败（${err.message}），使用默认配置`);
  }
}

config.url = `http://${config.host}:${config.port}`;

// dsh CLI 的稳定安装位置（位于用户的 DSH_HOME 配置档 node_modules 中）
function defaultDshBin() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
  return path.join(home, "profiles", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
}
const DSH_BIN = config.dshBin || defaultDshBin();

// ---------------------------------------------------------------------------
// 浏览器检测
// ---------------------------------------------------------------------------
const PF = process.env.ProgramFiles || "C:\\Program Files";
const PF86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
const LOCAL = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");

const BROWSERS = [
  {
    id: "edge", name: "Microsoft Edge", family: "chromium",
    paths: [
      path.join(PF86, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(PF, "Microsoft", "Edge", "Application", "msedge.exe"),
    ],
  },
  {
    id: "chrome", name: "Google Chrome", family: "chromium",
    paths: [
      path.join(PF, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(PF86, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(LOCAL, "Google", "Chrome", "Application", "chrome.exe"),
    ],
  },
  {
    id: "qq", name: "QQ浏览器", family: "chromium",
    paths: [
      path.join(PF, "Tencent", "QQBrowser", "QQBrowser.exe"),
      path.join(PF86, "Tencent", "QQBrowser", "QQBrowser.exe"),
    ],
  },
  {
    id: "firefox", name: "Mozilla Firefox", family: "firefox",
    paths: [
      path.join(PF, "Mozilla Firefox", "firefox.exe"),
      path.join(PF86, "Mozilla Firefox", "firefox.exe"),
    ],
  },
  {
    id: "brave", name: "Brave", family: "chromium",
    paths: [
      path.join(PF, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
      path.join(LOCAL, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
    ],
  },
  {
    id: "opera", name: "Opera", family: "chromium",
    paths: [
      path.join(LOCAL, "Programs", "Opera", "launcher.exe"),
      path.join(PF, "Opera", "launcher.exe"),
    ],
  },
  {
    id: "vivaldi", name: "Vivaldi", family: "chromium",
    paths: [
      path.join(LOCAL, "Vivaldi", "Application", "vivaldi.exe"),
      path.join(PF, "Vivaldi", "Application", "vivaldi.exe"),
    ],
  },
  {
    id: "360", name: "360浏览器", family: "chromium",
    paths: [
      path.join(LOCAL, "360Chrome", "Chrome", "Application", "360chrome.exe"),
      path.join(PF86, "360", "360se6", "Application", "360se.exe"),
      path.join(PF, "360", "360se6", "Application", "360se.exe"),
    ],
  },
  {
    id: "sogou", name: "搜狗浏览器", family: "chromium",
    paths: [
      path.join(PF86, "SogouExplorer", "SogouExplorer.exe"),
      path.join(PF, "SogouExplorer", "SogouExplorer.exe"),
    ],
  },
];

function findBrowserById(id) {
  const entry = BROWSERS.find((b) => b.id === id);
  if (!entry) return null;
  for (const p of entry.paths) {
    if (fs.existsSync(p)) return { id: entry.id, name: entry.name, family: entry.family, path: p };
  }
  return null;
}

function installedBrowsers() {
  const out = [];
  for (const b of BROWSERS) {
    const found = findBrowserById(b.id);
    if (found) out.push(found);
  }
  return out;
}

function readDefaultProgId() {
  try {
    const out = execFileSync(
      "reg",
      ["query", "HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice", "/v", "ProgId"],
      { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }
    );
    const m = out.match(/ProgId\s+REG_SZ\s+([^\s]+)/);
    return m ? m[1] : null;
  } catch (_) {
    return null;
  }
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
  if (p.includes("chrome")) return "chrome"; // 放在最后，避免误匹配 360chrome 等
  return null;
}

function resolveBrowser() {
  const pref = String(config.browser || "auto").trim();

  // 自定义可执行文件路径
  if (pref && (/[\\/]/.test(pref) || /\.exe$/i.test(pref))) {
    if (fs.existsSync(pref)) {
      return {
        id: "custom",
        name: path.basename(pref),
        family: (config.browserFamily || "other").toLowerCase(),
        path: pref,
      };
    }
    log(`警告：自定义浏览器路径不存在：${pref}`);
  }

  const list = installedBrowsers();
  const byId = (id) => list.find((b) => b.id === id) || null;

  // 明确指定浏览器 id
  if (pref && pref !== "auto" && pref !== "default") {
    const b = byId(pref.toLowerCase());
    if (b) return b;
    log(`警告：未找到浏览器 "${pref}"，回退自动检测`);
  }

  // 系统默认浏览器
  if (pref === "default" || pref === "auto") {
    const defId = progIdToBrowserId(readDefaultProgId());
    if (defId) {
      const b = byId(defId);
      if (b) {
        log(`已检测到默认浏览器：${b.name}`);
        return b;
      }
    }
  }

  // 回退：优先 Chromium 系，最后 Firefox
  const order = ["edge", "chrome", "qq", "360", "sogou", "brave", "opera", "vivaldi", "firefox"];
  for (const id of order) {
    const b = byId(id);
    if (b) {
      log(`未识别默认浏览器，使用：${b.name}`);
      return b;
    }
  }
  return null;
}

function buildBrowserArgs(browser) {
  const url = config.url;
  if (browser.family === "firefox") {
    return ["-new-window", url];
  }
  if (browser.family === "chromium") {
    return [
      `--app=${url}`,
      "--no-first-run",
      "--no-default-browser-check",
      `--window-size=${config.windowWidth},${config.windowHeight}`,
      `--window-position=${config.windowPositionX},${config.windowPositionY}`,
    ];
  }
  // 其它浏览器：直接打开 URL
  return [url];
}

// ---------------------------------------------------------------------------
// 日志
// ---------------------------------------------------------------------------
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch (_) {
    /* 忽略日志写入失败 */
  }
  if (!process.argv.includes("--silent")) {
    try {
      process.stdout.write(line + "\n");
    } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// 端口 / 服务就绪检测
// ---------------------------------------------------------------------------
function portInUse(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 1500 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

function httpProbe(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(true);
    });
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
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
// 启动 `dsh web`（守护进程，脱离本启动器生命周期）
// ---------------------------------------------------------------------------
function startServer() {
  if (!fs.existsSync(DSH_BIN)) {
    throw new Error(`未找到 dsh CLI：${DSH_BIN}`);
  }
  let workspace = config.workspace;
  if (!fs.existsSync(workspace)) {
    log(`工作区不存在（${workspace}），回退到用户主目录`);
    workspace = os.homedir();
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const outFd = fs.openSync(path.join(DATA_DIR, "server.log"), "a");
  const env = Object.assign({}, process.env);
  if (!env.DSH_HOME) env.DSH_HOME = path.join(os.homedir(), ".dsh");

  log(`启动服务：node "${DSH_BIN}" web（工作区 ${workspace}）`);
  const child = spawn(process.execPath, [DSH_BIN, "web"], {
    cwd: workspace,
    detached: true,
    stdio: ["ignore", outFd, outFd],
    windowsHide: true,
    env,
  });
  child.on("error", (err) => log(`启动服务失败：${err.message}`));
  child.unref();
  fs.closeSync(outFd);
  return child;
}

// ---------------------------------------------------------------------------
// 打开浏览器窗口（Chromium 应用模式 / Firefox 新窗口 / 其它直接打开）
// ---------------------------------------------------------------------------
function openWindow() {
  const browser = resolveBrowser();
  if (!browser) {
    throw new Error("未找到任何已安装的浏览器，请在 config.json 中手动指定 browser 路径");
  }
  const args = buildBrowserArgs(browser);
  log(`打开窗口：${browser.path} [${browser.name}/${browser.family}] ${args.join(" ")}`);
  const child = spawn(browser.path, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.on("error", (err) => log(`打开窗口失败：${err.message}`));
  child.unref();
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  log(`--- 启动（${dryRun ? "dry-run" : "正式"}）---`);

  const up = await portInUse(config.host, config.port);
  log(`端口 ${config.host}:${config.port} 状态：${up ? "已监听" : "未监听"}`);

  if (up) {
    log("服务已在运行，直接打开窗口");
  } else {
    log("服务未运行，准备启动 dsh web ...");
    if (dryRun) {
      log(`[dry-run] 将执行：node "${DSH_BIN}" web（工作区 ${config.workspace}）`);
    } else {
      try {
        startServer();
      } catch (err) {
        log(`错误：${err.message}`);
        process.exit(1);
      }
      const ready = await waitForServer(config.url, 60000);
      if (!ready) {
        log("错误：等待服务就绪超时（60s），请查看 server.log");
        process.exit(1);
      }
      log("服务已就绪");
    }
  }

  if (dryRun) {
    const b = resolveBrowser();
    log(`[dry-run] 将使用浏览器：${b ? `${b.name}（${b.path}）` : "（未找到）"}`);
    log(`[dry-run] 将打开窗口：${config.url}`);
    return;
  }
  openWindow();
  log("启动完成");
}

main().catch((err) => {
  log(`未预期错误：${err && err.stack ? err.stack : err}`);
  process.exit(1);
});
