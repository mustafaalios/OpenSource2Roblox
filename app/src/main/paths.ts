import { app } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";

function getLocalAppDataPath(): string {
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return process.env.LOCALAPPDATA;
  }

  return app.getPath("appData");
}

export function getDefaultOutputRoot(): string {
  return path.join(app.getPath("documents"), "Roblox Studio", "Source2Roblox Exports");
}

export function getLegacyRoamingOutputRoot(): string {
  return path.join(app.getPath("appData"), "Roblox Studio", "content", "source");
}

export function getLegacyLocalOutputRoot(): string {
  return path.join(getLocalAppDataPath(), "Roblox Studio", "content", "source");
}

export function getConverterExePath(): string {
  const packagedPath = path.join(process.resourcesPath, "converter", "Source2Roblox.exe");
  const devPath = path.resolve("vendor", "Source2Roblox", "bin", "Release", "Source2Roblox.exe");

  return existsSync(packagedPath) ? packagedPath : devPath;
}

export function getRobloxContentPath(): string {
  return path.join(getLocalAppDataPath(), "Roblox Studio", "content");
}

export function getUserDataPath(...segments: string[]): string {
  return path.join(app.getPath("userData"), ...segments);
}
