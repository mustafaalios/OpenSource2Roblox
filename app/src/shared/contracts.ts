export type ConversionMode = "map" | "model" | "texture" | "advanced";

export type HealthState = "ok" | "warning" | "missing";

export interface GameInfo {
  id: string;
  name: string;
  gameDir: string;
  gameInfoPath: string;
  source: "steam" | "common" | "manual";
  maps: string[];
  iconPath?: string;
  iconUrl?: string;
}

export interface PathSuggestion {
  path: string;
  name: string;
}

export type SetupCheckId = "dotnet472" | "modManager" | "sourceGame" | "robloxCredentials";

export interface SetupCheck {
  id: SetupCheckId;
  label: string;
  state: HealthState;
  detail: string;
  actionUrl?: string;
  canInstall?: boolean;
  installLabel?: string;
}

export interface InstallResult {
  ok: boolean;
  method: "winget" | "browser" | "none";
  message: string;
}

export interface ConversionJob {
  gameDir: string;
  mode: ConversionMode;
  mapName?: string;
  modelPath?: string;
  texturePath?: string;
  outputRoot: string;
  uploadAssets?: boolean;
  uploadMeshes?: boolean;
  robloxApiKey?: string;
  robloxCreatorType?: "user" | "group";
  robloxCreatorId?: string;
}

export interface ConverterEvent {
  type: "start" | "progress" | "output" | "error" | "done" | "raw";
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface RunResult {
  runId: string;
  exitCode: number | null;
  events: ConverterEvent[];
  artifacts: OutputArtifact[];
}

export interface OutputArtifact {
  path: string;
  name: string;
  kind: string;
}

export interface OutputHistoryItem {
  id: string;
  createdAt: string;
  mode: ConversionMode;
  gameDir: string;
  outputRoot: string;
  status: "completed" | "failed";
}

export interface AppSettings {
  outputRoot: string;
  uploadAssets: boolean;
  uploadMeshes: boolean;
  robloxApiKey: string;
  robloxCreatorType: "user" | "group";
  robloxCreatorId: string;
}

export interface BridgeApi {
  scanGames: () => Promise<GameInfo[]>;
  validateGamePath: (gameDir: string) => Promise<GameInfo | null>;
  getSetupChecks: () => Promise<SetupCheck[]>;
  installRequirement: (id: SetupCheckId) => Promise<InstallResult>;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<AppSettings>;
  runConversion: (job: ConversionJob) => Promise<RunResult>;
  onConverterEvent: (handler: (event: ConverterEvent) => void) => () => void;
  openExternal: (url: string) => Promise<void>;
  openPath: (path: string) => Promise<void>;
  revealPath: (path: string) => Promise<void>;
  openInStudio: (path: string) => Promise<void>;
  browseForFolder: (defaultPath?: string) => Promise<string | null>;
  browseForFile: (defaultPath?: string) => Promise<string | null>;
  getPathSuggestions: (query: string) => Promise<PathSuggestion[]>;
}
