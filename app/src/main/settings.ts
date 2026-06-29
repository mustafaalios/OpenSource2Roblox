import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { AppSettings, OutputHistoryItem } from "@shared/contracts";
import { appSettingsSchema } from "@shared/validation";
import { getDefaultOutputRoot, getLegacyLocalOutputRoot, getLegacyRoamingOutputRoot, getUserDataPath } from "./paths";

interface StoreShape {
  settings: AppSettings;
  history: OutputHistoryItem[];
}

const defaultStore: StoreShape = {
  settings: {
    outputRoot: "",
    uploadAssets: true,
    uploadMeshes: false,
    robloxApiKey: "",
    robloxCreatorType: "user",
    robloxCreatorId: "",
  },
  history: [],
};

function getStorePath(): string {
  return getUserDataPath("settings.json");
}

function readStore(): StoreShape {
  const storePath = getStorePath();

  if (!existsSync(storePath)) {
    return defaultStore;
  }

  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8")) as Partial<StoreShape>;

    return {
      settings: {
        ...defaultStore.settings,
        ...parsed.settings,
      },
      history: parsed.history ?? [],
    };
  } catch {
    return defaultStore;
  }
}

function writeStore(store: StoreShape): void {
  const storePath = getStorePath();

  mkdirSync(getUserDataPath(), { recursive: true });
  writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");
}

export function getSettings(): AppSettings {
  const saved = readStore().settings;
  const hasUploadCredentials =
    saved.robloxApiKey.trim().length > 0 && saved.robloxCreatorId.trim().length > 0;
  const outputRoot =
    !saved.outputRoot ||
    saved.outputRoot === getLegacyRoamingOutputRoot() ||
    saved.outputRoot === getLegacyLocalOutputRoot()
      ? getDefaultOutputRoot()
      : saved.outputRoot;

  mkdirSync(outputRoot, { recursive: true });

  return appSettingsSchema.parse({
    ...saved,
    outputRoot,
    uploadAssets: saved.uploadAssets || hasUploadCredentials,
  });
}

export function saveSettings(settings: AppSettings): AppSettings {
  const parsed = appSettingsSchema.parse(settings);
  const store = readStore();

  mkdirSync(parsed.outputRoot, { recursive: true });

  writeStore({
    ...store,
    settings: parsed,
  });

  return parsed;
}

export function getHistory(): OutputHistoryItem[] {
  return readStore().history;
}

export function addHistoryItem(item: OutputHistoryItem): void {
  const store = readStore();

  writeStore({
    ...store,
    history: [item, ...store.history].slice(0, 30),
  });
}
