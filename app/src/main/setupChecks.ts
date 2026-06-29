import { existsSync } from "node:fs";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { dialog, shell } from "electron";
import type { GameInfo, InstallResult, SetupCheck, SetupCheckId } from "@shared/contracts";
import { getSettings } from "./settings";

const execFileAsync = promisify(execFile);

async function hasDotNet472(): Promise<boolean> {
  if (process.platform !== "win32") {
    return false;
  }

  try {
    const { stdout } = await execFileAsync("reg", [
      "query",
      "HKLM\\SOFTWARE\\Microsoft\\NET Framework Setup\\NDP\\v4\\Full",
      "/v",
      "Release",
    ]);
    const release = Number.parseInt(
      stdout.match(/Release\s+REG_DWORD\s+0x([0-9a-f]+)/i)?.[1] ?? "0",
      16,
    );

    return release >= 461808;
  } catch {
    return false;
  }
}

async function hasRobloxStudioModManager(): Promise<boolean> {
  const localAppData = process.env.LOCALAPPDATA;
  const candidates = [
    localAppData ? `${localAppData}\\Roblox Studio Mod Manager\\RobloxStudioModManager.exe` : "",
    localAppData ? `${localAppData}\\Microsoft\\WinGet\\Links\\RobloxStudioModManager.exe` : "",
    localAppData
      ? `${localAppData}\\Microsoft\\WinGet\\Packages\\MaximumADHD.RobloxStudioModManager_Microsoft.Winget.Source_8wekyb3d8bbwe\\RobloxStudioModManager.exe`
      : "",
    `${process.env.USERPROFILE ?? ""}\\Downloads\\RobloxStudioModManager.exe`,
  ];

  return candidates.some((candidate) => candidate.length > 0 && existsSync(candidate));
}

async function hasWinget(): Promise<boolean> {
  try {
    await execFileAsync("winget", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

function getWingetPackageId(args: string[]): string | null {
  const idIndex = args.indexOf("--id");

  return idIndex >= 0 ? (args[idIndex + 1] ?? null) : null;
}

function isStaleWingetInstallOutput(output: string): boolean {
  const normalized = output.toLowerCase();

  return (
    normalized.includes("found an existing package already installed") &&
    normalized.includes("no available upgrade found")
  );
}

function runWinget(args: string[]): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn("winget", args, {
      windowsHide: false,
      shell: true,
    });

    let output = "";

    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      resolve({ code: 1, output: error.message });
    });

    child.on("close", (code) => {
      resolve({ code, output });
    });
  });
}

async function runWingetInstall(args: string[]): Promise<InstallResult> {
  const firstInstall = await runWinget(args);
  const firstOutput = firstInstall.output.trim();

  if (firstInstall.code === 0 && !isStaleWingetInstallOutput(firstOutput)) {
    return { ok: true, method: "winget", message: "Installer finished." };
  }

  const packageId = getWingetPackageId(args);

  if (packageId && isStaleWingetInstallOutput(firstOutput)) {
    const uninstall = await runWinget([
      "uninstall",
      "--id",
      packageId,
      "--exact",
      "--accept-source-agreements",
    ]);
    const reinstall = await runWinget(args);
    const reinstallOutput = reinstall.output.trim();

    return {
      ok: reinstall.code === 0,
      method: "winget",
      message:
        reinstall.code === 0
          ? "winget had stale install data, so it was reset and installed again."
          : reinstallOutput ||
            uninstall.output.trim() ||
            `Installer exited with code ${reinstall.code}.`,
    };
  }

  return {
    ok: firstInstall.code === 0,
    method: "winget",
    message: firstOutput || `Installer exited with code ${firstInstall.code}.`,
  };
}

const installCatalog: Record<
  SetupCheckId,
  {
    confirm: string;
    wingetArgs?: string[];
    fallbackUrl?: string;
  }
> = {
  dotnet472: {
    confirm:
      "Install .NET Framework 4.7.2 Developer Pack? Windows may ask for administrator permission.",
    wingetArgs: [
      "install",
      "--id",
      "Microsoft.DotNet.Framework.DeveloperPack_4",
      "--version",
      "4.7.2",
      "--accept-package-agreements",
      "--accept-source-agreements",
    ],
    fallbackUrl: "https://dotnet.microsoft.com/en-us/download/dotnet-framework/net472",
  },
  modManager: {
    confirm:
      "Install Roblox Studio Mod Manager? It downloads and launches Roblox Studio builds, so Windows or antivirus may show prompts.",
    wingetArgs: [
      "install",
      "--id",
      "MaximumADHD.RobloxStudioModManager",
      "--accept-package-agreements",
      "--accept-source-agreements",
    ],
    fallbackUrl: "https://github.com/MaximumADHD/Roblox-Studio-Mod-Manager/releases",
  },
  sourceGame: {
    confirm: "Open Steam so you can install or manage a Source game?",
    fallbackUrl: "steam://open/games",
  },
  robloxCredentials: {
    confirm: "Open Roblox Creator Dashboard credentials?",
    fallbackUrl: "https://create.roblox.com/dashboard/credentials",
  },
};

export async function installRequirement(id: SetupCheckId): Promise<InstallResult> {
  const item = installCatalog[id];

  const confirmation = await dialog.showMessageBox({
    type: "question",
    buttons: ["Install / Open", "Cancel"],
    defaultId: 0,
    cancelId: 1,
    title: "Permission required",
    message: item.confirm,
  });

  if (confirmation.response !== 0) {
    return { ok: false, method: "none", message: "Cancelled." };
  }

  if (item.wingetArgs && (await hasWinget())) {
    return runWingetInstall(item.wingetArgs);
  }

  if (item.fallbackUrl) {
    await shell.openExternal(item.fallbackUrl);
    return {
      ok: true,
      method: "browser",
      message: "winget is not available, so the official install page was opened instead.",
    };
  }

  return { ok: false, method: "none", message: "No installer is available for this requirement." };
}

export async function getSetupChecks(games: GameInfo[]): Promise<SetupCheck[]> {
  const dotnetOk = await hasDotNet472();
  const modManagerOk = await hasRobloxStudioModManager();
  const settings = getSettings();
  const hasRobloxCredentials =
    settings.robloxApiKey.trim().length > 0 && settings.robloxCreatorId.trim().length > 0;
  const gameNames = games
    .map((game) => game.name.split(" / ")[0] ?? game.name)
    .filter((name, index, all) => all.indexOf(name) === index);

  return [
    {
      id: "dotnet472",
      label: ".NET Framework 4.7.2",
      state: dotnetOk ? "ok" : "missing",
      detail: dotnetOk ? "Runtime detected." : "Required for the bundled converter.",
      actionUrl: "https://dotnet.microsoft.com/en-us/download/dotnet-framework/net472",
      canInstall: !dotnetOk,
      installLabel: "Install .NET",
    },
    {
      id: "modManager",
      label: "Roblox Studio Mod Manager",
      state: modManagerOk ? "ok" : "missing",
      detail: modManagerOk
        ? "Mod manager found."
        : "Needed to launch Studio with generated local content.",
      actionUrl: "https://github.com/MaximumADHD/Roblox-Studio-Mod-Manager/releases",
      canInstall: !modManagerOk,
      installLabel: "Install manager",
    },
    {
      id: "sourceGame",
      label: "Source game",
      state: games.length > 0 ? "ok" : "missing",
      detail:
        games.length > 0
          ? `Compatible installed games: ${gameNames.slice(0, 6).join(", ")}${gameNames.length > 6 ? ", and more" : ""}.`
          : "No compatible Source games found yet. Browse to a folder with gameinfo.txt.",
      canInstall: games.length === 0,
      installLabel: "Open Steam",
    },
    {
      id: "robloxCredentials",
      label: "Roblox upload credentials",
      state: hasRobloxCredentials ? "ok" : "missing",
      detail: hasRobloxCredentials
        ? "Open Cloud credentials are saved."
        : "Required for texture uploads. Create an Open Cloud key with Assets read and write permissions.",
      actionUrl: "https://create.roblox.com/dashboard/credentials",
      canInstall: !hasRobloxCredentials,
      installLabel: "Open dashboard",
    },
  ];
}
