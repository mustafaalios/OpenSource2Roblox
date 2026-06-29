import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  BridgeApi,
  ConversionJob,
  ConverterEvent,
  SetupCheckId,
} from "@shared/contracts";

const api: BridgeApi = {
  scanGames: () => ipcRenderer.invoke("games:scan"),
  validateGamePath: (gameDir: string) => ipcRenderer.invoke("games:validate", gameDir),
  getSetupChecks: () => ipcRenderer.invoke("setup:checks"),
  installRequirement: (id: SetupCheckId) => ipcRenderer.invoke("setup:install", id),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke("settings:save", settings),
  runConversion: (job: ConversionJob) => ipcRenderer.invoke("conversion:run", job),
  onConverterEvent: (handler: (event: ConverterEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: ConverterEvent): void => {
      handler(payload);
    };

    ipcRenderer.on("converter:event", listener);

    return () => {
      ipcRenderer.off("converter:event", listener);
    };
  },
  openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url),
  openPath: (path: string) => ipcRenderer.invoke("shell:openPath", path),
  revealPath: (path: string) => ipcRenderer.invoke("shell:revealPath", path),
  openInStudio: (path: string) => ipcRenderer.invoke("studio:openFile", path),
  browseForFolder: (defaultPath?: string) => ipcRenderer.invoke("dialog:browseFolder", defaultPath),
  browseForFile: (defaultPath?: string) => ipcRenderer.invoke("dialog:browseFile", defaultPath),
  getPathSuggestions: (query: string) => ipcRenderer.invoke("fs:pathSuggestions", query),
};

contextBridge.exposeInMainWorld("source2Roblox", api);
