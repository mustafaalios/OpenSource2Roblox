import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import type { PathSuggestion } from "@shared/contracts";
import { runConversion } from "./converterRunner";
import { getSettings, saveSettings } from "./settings";
import { getSetupChecks, installRequirement } from "./setupChecks";
import { scanSourceGames, validateSourceGame } from "./steam";
import { getPathSuggestions, normalizeWindowsPath } from "./pathSuggestions";

const isDev = process.env.NODE_ENV === "development";
let mainWindow: BrowserWindow | null = null;

if (isDev) {
  app.setPath("userData", path.join(app.getPath("appData"), "Source2Roblox Studio Dev"));
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: "#11110f",
    title: "Source2Roblox Studio",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

ipcMain.handle("games:scan", () => scanSourceGames());

ipcMain.handle("games:validate", (_event, gameDir: string) =>
  validateSourceGame(gameDir, "manual"),
);

ipcMain.handle("setup:checks", async () => getSetupChecks(scanSourceGames()));

ipcMain.handle("setup:install", async (_event, id: Parameters<typeof installRequirement>[0]) =>
  installRequirement(id),
);

ipcMain.handle("settings:get", () => getSettings());

ipcMain.handle("settings:save", (_event, settings: unknown) =>
  saveSettings(settings as Parameters<typeof saveSettings>[0]),
);

ipcMain.handle("conversion:run", async (_event, job: unknown) => {
  if (!mainWindow) {
    throw new Error("Main window is not ready.");
  }

  return runConversion(job as Parameters<typeof runConversion>[0], mainWindow);
});

ipcMain.handle("shell:openExternal", async (_event, url: string) => {
  await shell.openExternal(url);
});

ipcMain.handle("shell:openPath", async (_event, targetPath: string) => {
  mkdirSync(targetPath, { recursive: true });
  await shell.openPath(targetPath);
});

ipcMain.handle("shell:revealPath", (_event, targetPath: string) => {
  shell.showItemInFolder(targetPath);
});

ipcMain.handle("studio:openFile", async (_event, targetPath: string) => {
  const localAppData = process.env.LOCALAPPDATA ?? "";
  const candidates = [
    path.join(localAppData, "Microsoft", "WinGet", "Links", "RobloxStudioModManager.exe"),
    path.join(localAppData, "Roblox Studio Mod Manager", "RobloxStudioModManager.exe"),
  ];
  const managerPath = candidates.find((candidate) => existsSync(candidate));

  if (!managerPath) {
    throw new Error("Roblox Studio Mod Manager could not be found. Run setup again and install it first.");
  }

  const child = spawn(managerPath, [targetPath], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });

  child.unref();
});

ipcMain.handle("fs:pathSuggestions", (_event, query: string): PathSuggestion[] => {
  return getPathSuggestions(query);
});

function getDialogDefaultPath(defaultPath?: string): string | undefined {
  const normalizedPath = defaultPath ? normalizeWindowsPath(defaultPath) : undefined;

  if (!normalizedPath || !existsSync(normalizedPath)) {
    return undefined;
  }

  try {
    return statSync(normalizedPath).isDirectory() ? normalizedPath : path.dirname(normalizedPath);
  } catch {
    return undefined;
  }
}

ipcMain.handle("dialog:browseFolder", async (_event, defaultPath?: string) => {
  if (!mainWindow) {
    return null;
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: getDialogDefaultPath(defaultPath),
    properties: ["openDirectory"],
    title: "Choose a Source game folder",
  });

  return result.canceled ? null : (result.filePaths[0] ?? null);
});

ipcMain.handle("dialog:browseFile", async (_event, defaultPath?: string) => {
  if (!mainWindow) {
    return null;
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: getDialogDefaultPath(defaultPath),
    filters: [
      { name: "Valve texture files", extensions: ["vtf"] },
      { name: "All files", extensions: ["*"] },
    ],
    properties: ["openFile"],
    title: "Choose a VTF texture",
  });

  return result.canceled ? null : (result.filePaths[0] ?? null);
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

if (isDev) {
  const currentFile = fileURLToPath(import.meta.url);
  process.env.APP_ROOT = path.dirname(currentFile);
}
