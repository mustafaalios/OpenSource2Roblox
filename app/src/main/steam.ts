import { existsSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { GameInfo } from "@shared/contracts";

const sourceGameHints = [
  "Half-Life 2",
  "Half-Life 2 Deathmatch",
  "Counter-Strike Source",
  "GarrysMod",
  "Portal",
  "Portal 2",
  "Team Fortress 2",
  "Left 4 Dead",
  "Left 4 Dead 2",
];

const sourceGameHintLookup = new Map(sourceGameHints.map((title) => [title.toLowerCase(), title]));

function normalizeGameId(gameDir: string): string {
  return path.resolve(gameDir).replaceAll("\\", "/").toLowerCase();
}

function getFriendlyGameName(gameDir: string, fallback?: string): string {
  if (fallback) {
    return fallback;
  }

  const folder = path.basename(gameDir);
  const parent = path.basename(path.dirname(gameDir));
  const parentTitle = sourceGameHintLookup.get(parent.toLowerCase());

  if (parentTitle && folder.toLowerCase() === parent.toLowerCase()) {
    return parentTitle;
  }

  return sourceGameHintLookup.get(folder.toLowerCase()) ?? folder;
}

export function parseSteamLibraryFolders(vdf: string): string[] {
  const libraries = new Set<string>();
  const pathMatches = vdf.matchAll(/"path"\s+"([^"]+)"/g);

  for (const match of pathMatches) {
    const rawPath = match[1];

    if (rawPath) {
      libraries.add(rawPath.replace(/\\\\/g, "\\"));
    }
  }

  return [...libraries];
}

interface SteamAppManifest {
  appId: string;
  installDir: string;
  name: string;
}

function parseSteamAppManifest(acf: string): SteamAppManifest | null {
  const appId = acf.match(/"appid"\s+"([^"]+)"/i)?.[1];
  const installDir = acf.match(/"installdir"\s+"([^"]+)"/i)?.[1];
  const name = acf.match(/"name"\s+"([^"]+)"/i)?.[1];

  if (!appId || !installDir || !name) {
    return null;
  }

  return { appId, installDir, name };
}

function readSteamAppManifests(library: string): Map<string, SteamAppManifest> {
  const manifests = new Map<string, SteamAppManifest>();
  const steamapps = path.join(library, "steamapps");

  if (!existsSync(steamapps)) {
    return manifests;
  }

  for (const entry of readdirSync(steamapps)) {
    if (!/^appmanifest_\d+\.acf$/i.test(entry)) {
      continue;
    }

    const manifest = parseSteamAppManifest(readFileSync(path.join(steamapps, entry), "utf8"));

    if (manifest) {
      manifests.set(manifest.installDir.toLowerCase(), manifest);
      manifests.set(manifest.name.toLowerCase(), manifest);
    }
  }

  return manifests;
}

function getSteamLibraryForGameDir(gameDir: string): string | undefined {
  const normalized = path.resolve(gameDir);
  const parts = normalized.split(/[\\/]/);
  const steamappsIndex = parts.findIndex((part) => part.toLowerCase() === "steamapps");
  const commonIndex = steamappsIndex + 1;

  if (steamappsIndex <= 0 || parts[commonIndex]?.toLowerCase() !== "common") {
    return undefined;
  }

  return parts.slice(0, steamappsIndex).join(path.sep);
}

function getSteamInstallDirForGameDir(gameDir: string): string | undefined {
  const normalized = path.resolve(gameDir);
  const parts = normalized.split(/[\\/]/);
  const commonIndex = parts.findIndex((part) => part.toLowerCase() === "common");

  return commonIndex >= 0 ? parts[commonIndex + 1] : undefined;
}

export function getLikelySteamRoots(): string[] {
  const roots = new Set<string>();
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  const programFiles = process.env.ProgramFiles;

  if (programFilesX86) {
    roots.add(path.join(programFilesX86, "Steam"));
  }

  if (programFiles) {
    roots.add(path.join(programFiles, "Steam"));
  }

  roots.add(path.join(os.homedir(), "Steam"));

  return [...roots];
}

export function discoverSteamLibraries(): string[] {
  const libraries = new Set<string>();

  for (const root of getLikelySteamRoots()) {
    if (!existsSync(root)) {
      continue;
    }

    libraries.add(root);

    const vdfPath = path.join(root, "steamapps", "libraryfolders.vdf");

    if (!existsSync(vdfPath)) {
      continue;
    }

    const vdf = readFileSync(vdfPath, "utf8");

    for (const library of parseSteamLibraryFolders(vdf)) {
      libraries.add(library);
    }
  }

  return [...libraries];
}

export function discoverMaps(gameDir: string): string[] {
  const maps = new Set<string>();
  const mapsDir = path.join(gameDir, "maps");

  if (existsSync(mapsDir)) {
    for (const entry of readdirSync(mapsDir)) {
      if (entry.toLowerCase().endsWith(".bsp")) {
        maps.add(path.basename(entry, path.extname(entry)));
      }
    }
  }

  for (const entry of readdirSync(gameDir)) {
    if (!entry.toLowerCase().endsWith("_dir.vpk")) {
      continue;
    }

    for (const map of parseVpkDirMaps(readFileSync(path.join(gameDir, entry)))) {
      maps.add(map);
    }
  }

  return [...maps].sort((a, b) => a.localeCompare(b));
}

function readNullTerminatedString(buffer: Buffer, offset: number): { value: string; nextOffset: number } {
  let end = offset;

  while (end < buffer.length && buffer[end] !== 0) {
    end += 1;
  }

  return {
    value: buffer.toString("utf8", offset, end),
    nextOffset: Math.min(end + 1, buffer.length),
  };
}

export function parseVpkDirMaps(buffer: Buffer): string[] {
  const maps = new Set<string>();

  if (buffer.length < 12 || buffer.readUInt32LE(0) !== 0x55aa1234) {
    return [];
  }

  const version = buffer.readUInt32LE(4);
  let offset = version === 2 ? 28 : 12;

  if (version !== 1 && version !== 2) {
    return [];
  }

  while (offset < buffer.length) {
    const ext = readNullTerminatedString(buffer, offset);
    offset = ext.nextOffset;

    if (!ext.value) {
      break;
    }

    while (offset < buffer.length) {
      const dir = readNullTerminatedString(buffer, offset);
      offset = dir.nextOffset;

      if (!dir.value) {
        break;
      }

      while (offset < buffer.length) {
        const file = readNullTerminatedString(buffer, offset);
        offset = file.nextOffset;

        if (!file.value) {
          break;
        }

        if (ext.value.toLowerCase() === "bsp" && dir.value.replaceAll("\\", "/").toLowerCase() === "maps") {
          maps.add(file.value);
        }

        offset += 18;

        if (offset > buffer.length) {
          return [...maps].sort((a, b) => a.localeCompare(b));
        }
      }
    }
  }

  return [...maps].sort((a, b) => a.localeCompare(b));
}

export function validateSourceGame(
  gameDir: string,
  source: GameInfo["source"] = "manual",
  name?: string,
  iconPath?: string,
  iconUrl?: string,
): GameInfo | null {
  const gameInfoPath = path.join(gameDir, "gameinfo.txt");

  if (!existsSync(gameInfoPath)) {
    return null;
  }

  return {
    id: normalizeGameId(gameDir),
    name: getFriendlyGameName(gameDir, name),
    gameDir,
    gameInfoPath,
    source,
    maps: discoverMaps(gameDir),
    iconPath,
    iconUrl,
  };
}

export function scanSourceGames(): GameInfo[] {
  const games = new Map<string, GameInfo>();
  const manifestsByLibrary = new Map<string, Map<string, SteamAppManifest>>();

  const addGame = (gameDir: string, name?: string): void => {
    const library = getSteamLibraryForGameDir(gameDir);
    const installDir = getSteamInstallDirForGameDir(gameDir);
    const manifests = library ? manifestsByLibrary.get(library) : undefined;
    const manifest =
      (installDir ? manifests?.get(installDir.toLowerCase()) : undefined) ??
      (name ? manifests?.get(name.toLowerCase()) : undefined);
    const game = validateSourceGame(gameDir, "steam", name ?? manifest?.name);

    if (game) {
      const existing = games.get(game.id);

      games.set(game.id, {
        ...game,
        name: getFriendlyGameName(gameDir, name ?? existing?.name),
      });
    }
  };

  for (const library of discoverSteamLibraries()) {
    if (!manifestsByLibrary.has(library)) {
      manifestsByLibrary.set(library, readSteamAppManifests(library));
    }

    const commonDir = path.join(library, "steamapps", "common");

    if (!existsSync(commonDir)) {
      continue;
    }

    for (const title of sourceGameHints) {
      const gameRoot = path.join(commonDir, title);

      if (!existsSync(gameRoot)) {
        continue;
      }

      for (const child of readdirSync(gameRoot, { withFileTypes: true })) {
        if (!child.isDirectory()) {
          continue;
        }

        addGame(path.join(gameRoot, child.name), title);
      }
    }

    for (const title of readdirSync(commonDir)) {
      const gameRoot = path.join(commonDir, title);

      if (!existsSync(gameRoot)) {
        continue;
      }

      addGame(gameRoot, title);

      for (const child of readdirSync(gameRoot, { withFileTypes: true })) {
        if (child.isDirectory()) {
          addGame(path.join(gameRoot, child.name), title);
        }
      }
    }
  }

  return [...games.values()].sort((a, b) => a.name.localeCompare(b.name));
}
