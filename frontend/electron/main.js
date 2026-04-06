const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

const DEV_PORT = 3000;
let mainWindow;
let nextProcess;

function waitForServer(url, retries = 30, delay = 1000) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      http.get(url, (res) => {
        if (res.statusCode < 500) resolve();
        else if (n > 0) setTimeout(() => attempt(n - 1), delay);
        else reject(new Error("Server başlamadı"));
      }).on("error", () => {
        if (n > 0) setTimeout(() => attempt(n - 1), delay);
        else reject(new Error("Server bağlantı hatası"));
      });
    };
    attempt(retries);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0a0a",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, "../public/favicon.ico"),
  });

  mainWindow.loadURL(`http://localhost:${DEV_PORT}`);

  // Dış linkleri tarayıcıda aç
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  // Next.js dev server'ı başlat
  const nextBin = path.join(__dirname, "../node_modules/.bin/next");
  nextProcess = spawn(nextBin, ["dev"], {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
    shell: true,
  });

  console.log("Next.js başlatılıyor...");
  try {
    await waitForServer(`http://localhost:${DEV_PORT}`);
    console.log("Next.js hazır, pencere açılıyor...");
  } catch (e) {
    console.error("Next.js başlamadı:", e.message);
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (nextProcess) nextProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (nextProcess) nextProcess.kill();
});
