import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  X,
  ClipboardCheck,
  ChevronRight,
  ChevronsUpDown,
  ExternalLink,
  File,
  FolderOpen,
  Home,
  Loader2,
  Play,
  RefreshCcw,
  Settings as SettingsIcon,
  TerminalSquare,
  Wrench,
} from "lucide-react";
import type {
  AppSettings,
  ConversionJob,
  ConversionMode,
  ConverterEvent,
  GameInfo,
  InstallResult,
  PathSuggestion,
  RunResult,
  SetupCheck,
} from "@shared/contracts";
import "./styles/app.css";

type View = "setup" | "home" | "settings";

const modeLabels: Record<ConversionMode, string> = {
  map: "Map",
  model: "Model",
  texture: "Texture",
  advanced: "Advanced",
};

function classNames(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function getNumericData(event: ConverterEvent, key: string): number | null {
  const value = event.data?.[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRunProgress(events: ConverterEvent[]): {
  label: string;
  detail: string;
  percent: number;
  current?: number;
  total?: number;
} | null {
  if (events.length === 0) {
    return null;
  }

  const latest = events.at(-1);

  if (!latest) {
    return null;
  }
  const hasDone = events.some((event) => event.type === "done");
  const hasStarted = events.some((event) => event.type === "start");
  const hasCopy = events.some((event) => event.message.toLowerCase().includes("copied completed export"));

  if (hasCopy) {
    return {
      label: "Export ready",
      detail: "Copied completed files to your output folder.",
      percent: 100,
    };
  }

  if (hasDone) {
    return {
      label: "Saving output",
      detail: "Final files are being collected.",
      percent: 98,
    };
  }

  for (const event of [...events].reverse()) {
    const current = getNumericData(event, "current");
    const total = getNumericData(event, "total");

    if (current !== null && total !== null && total > 0) {
      const phase = typeof event.data?.phase === "string" ? event.data.phase : "";
      const phaseRatio = Math.min(1, Math.max(0, current / total));
      const percent =
        phase === "uploads"
          ? 72 + phaseRatio * 24
          : phase === "clumping"
            ? 12 + phaseRatio * 56
            : phaseRatio * 90;

      return {
        label: phase === "uploads" ? "Uploading Roblox assets" : event.message.replace(/\s+\d+\/\d+\.?$/, ""),
        detail: `${current}/${total}`,
        percent,
        current,
        total,
      };
    }

    const clump = event.message.match(/Clumping faces\D+(\d+)\/(\d+)/i);

    if (clump) {
      return {
        label: "Building map geometry",
        detail: `${clump[1]}/${clump[2]}`,
        percent: 12 + (Number(clump[1]) / Number(clump[2])) * 56,
        current: Number(clump[1]),
        total: Number(clump[2]),
      };
    }
  }

  if (latest.type === "error") {
    return {
      label: "Conversion failed",
      detail: latest.message,
      percent: 100,
    };
  }

  if (hasStarted) {
    return {
      label: "Preparing conversion",
      detail: latest.message,
      percent: 8,
    };
  }

  return {
    label: "Starting conversion",
    detail: latest.message,
    percent: 3,
  };
}

function getEventProgressPercent(event: ConverterEvent): number | null {
  const current = getNumericData(event, "current");
  const total = getNumericData(event, "total");

  if (current !== null && total !== null && total > 0) {
    const phase = typeof event.data?.phase === "string" ? event.data.phase : "";
    const phaseRatio = Math.min(1, Math.max(0, current / total));

    if (phase === "uploads") {
      return 72 + phaseRatio * 24;
    }

    if (phase === "clumping") {
      return 12 + phaseRatio * 56;
    }

    return phaseRatio * 90;
  }

  const clump = event.message.match(/Clumping faces\D+(\d+)\/(\d+)/i);

  if (clump) {
    return 12 + (Number(clump[1]) / Number(clump[2])) * 56;
  }

  if (event.message.toLowerCase().includes("copied completed export")) {
    return 100;
  }

  if (event.type === "done") {
    return 98;
  }

  if (event.type === "start") {
    return 8;
  }

  return null;
}

function getMaxRunProgressPercent(events: ConverterEvent[]): number {
  return events.reduce((max, event) => {
    const percent = getEventProgressPercent(event);
    return percent === null ? max : Math.max(max, percent);
  }, 0);
}

function StepStatus({ check }: { check: SetupCheck }) {
  return (
    <span className={classNames("step-status", `step-status-${check.state}`)}>
      {check.state === "ok" ? "Ready" : check.state === "warning" ? "Optional" : "Missing"}
    </span>
  );
}

function getSetupHint(checks: SetupCheck[], checking: boolean, installing: string | null): string {
  if (installing) {
    return "Waiting for the installer. Windows may show a permission prompt.";
  }

  if (checking) {
    return "Checking your system...";
  }

  const missing = checks.find((check) => check.state === "missing" && check.id !== "sourceGame");

  if (missing) {
    return `${missing.label} needs attention before conversion.`;
  }

  const game = checks.find((check) => check.id === "sourceGame");

  if (game?.state !== "ok") {
    return "Pick a Source game folder on the home screen when you are ready.";
  }

  return "Everything important is ready.";
}

function SetupView({
  checks,
  checking,
  installing,
  settings,
  onInstall,
  onRefresh,
  onBrowseGame,
  onSaveCredentials,
  onContinue,
  installResult,
}: {
  checks: SetupCheck[];
  checking: boolean;
  installing: string | null;
  settings: AppSettings | null;
  onInstall: (check: SetupCheck) => void;
  onRefresh: () => void;
  onBrowseGame: () => void;
  onSaveCredentials: (settings: AppSettings) => Promise<void>;
  onContinue: () => void;
  installResult: InstallResult | null;
}) {
  const [robloxApiKey, setRobloxApiKey] = useState(settings?.robloxApiKey ?? "");
  const [robloxCreatorType, setRobloxCreatorType] = useState<"user" | "group">(
    settings?.robloxCreatorType ?? "user",
  );
  const [robloxCreatorId, setRobloxCreatorId] = useState(settings?.robloxCreatorId ?? "");
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [credentialsMessage, setCredentialsMessage] = useState("");
  const setupComplete = checks.length > 0 && checks.every((check) => check.state === "ok");
  const completed = checks.filter((check) => check.state === "ok").length;
  const hint = getSetupHint(checks, checking, installing);

  useEffect(() => {
    setRobloxApiKey(settings?.robloxApiKey ?? "");
    setRobloxCreatorType(settings?.robloxCreatorType ?? "user");
    setRobloxCreatorId(settings?.robloxCreatorId ?? "");
  }, [settings]);

  return (
    <section className="setup-view">
      <div className="intro-copy">
        <h1>Ready in a few checks.</h1>
        <p>{hint}</p>
        <div
          className="setup-progress"
          aria-label={`${completed} of ${checks.length || 3} checks ready`}
        >
          <span style={{ width: `${checks.length ? (completed / checks.length) * 100 : 0}%` }} />
        </div>
      </div>

      <div className={classNames("setup-card", checking && "is-checking")}>
        {checks.map((check, index) => (
          <article
            className={classNames("setup-step", check.state === "ok" && "step-ready")}
            key={check.id}
          >
            <div className="step-number">{index + 1}</div>
            <div className="step-body">
              <div className="step-title">
                <h2>{check.label}</h2>
                <StepStatus check={check} />
              </div>
              <p>{check.detail}</p>
              <div className="step-actions">
                {check.id === "robloxCredentials" && check.state !== "ok" && settings ? (
                  <div className="setup-credentials">
                    <div className="api-help">
                      <strong>How to make the key</strong>
                      <p>
                        Open Creator Dashboard credentials, create an Open Cloud API key, then add
                        Assets under Access Permissions. Enable both Read and Write before copying
                        the key here.
                      </p>
                      <button
                        className="ghost-button"
                        onClick={() =>
                          window.source2Roblox.openExternal(
                            "https://create.roblox.com/dashboard/credentials",
                          )
                        }
                      >
                        Open credentials <ExternalLink size={14} />
                      </button>
                    </div>
                    <input
                      type="password"
                      value={robloxApiKey}
                      onChange={(event) => setRobloxApiKey(event.target.value)}
                      placeholder="Open Cloud API key"
                    />
                    <div className="settings-two">
                      <select
                        value={robloxCreatorType}
                        onChange={(event) =>
                          setRobloxCreatorType(event.target.value as "user" | "group")
                        }
                      >
                        <option value="user">User</option>
                        <option value="group">Group</option>
                      </select>
                      <input
                        value={robloxCreatorId}
                        onChange={(event) => setRobloxCreatorId(event.target.value)}
                        placeholder={robloxCreatorType === "user" ? "User ID" : "Group ID"}
                      />
                    </div>
                    <button
                      className="green-button"
                      disabled={savingCredentials}
                      onClick={async () => {
                        setSavingCredentials(true);
                        setCredentialsMessage("");

                        try {
                          await onSaveCredentials({
                            ...settings,
                            robloxApiKey,
                            robloxCreatorType,
                            robloxCreatorId,
                            uploadAssets: true,
                          });
                          setCredentialsMessage("Saved. Checking credentials now...");
                        } finally {
                          setSavingCredentials(false);
                        }
                      }}
                    >
                      {savingCredentials ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
                      {savingCredentials ? "Saving..." : "Save credentials"}
                    </button>
                    {credentialsMessage ? (
                      <p className="save-feedback">{credentialsMessage}</p>
                    ) : null}
                  </div>
                ) : null}
                {check.canInstall ? (
                  <button
                    className="green-button"
                    onClick={() => onInstall(check)}
                    disabled={installing === check.id}
                  >
                    {installing === check.id ? (
                      <Loader2 className="spin" size={15} />
                    ) : (
                      <Wrench size={15} />
                    )}
                    {installing === check.id ? "Installing..." : (check.installLabel ?? "Install")}
                  </button>
                ) : null}
                {check.id === "sourceGame" && check.state !== "ok" ? (
                  <button className="ghost-button" onClick={() => onBrowseGame()}>
                    <FolderOpen size={14} />
                    Browse
                  </button>
                ) : null}
                {check.actionUrl ? (
                  <button
                    className="ghost-button"
                    onClick={() => window.source2Roblox.openExternal(check.actionUrl!)}
                  >
                    Details <ExternalLink size={14} />
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        ))}

        {installResult ? <p className="install-result">{installResult.message}</p> : null}

        <div className="setup-footer">
          <button className="ghost-button" onClick={onRefresh} disabled={checking}>
            <RefreshCcw size={15} />
            Check again
          </button>
          <button className="green-button" onClick={onContinue} disabled={!setupComplete}>
            Continue <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </section>
  );
}

function HomeView({
  games,
  settings,
  selectedGame,
  gameDir,
  events,
  result,
  running,
  onSelectGame,
  onGameDirChange,
  onBrowseGame,
  onRun,
}: {
  games: GameInfo[];
  settings: AppSettings | null;
  selectedGame: GameInfo | null;
  gameDir: string;
  events: ConverterEvent[];
  result: RunResult | null;
  running: boolean;
  onSelectGame: (game: GameInfo | null) => void;
  onGameDirChange: (gameDir: string) => void;
  onBrowseGame: (defaultPath?: string) => void;
  onRun: (job: ConversionJob) => void;
}) {
  const [mode, setMode] = useState<ConversionMode>("map");
  const [mapName, setMapName] = useState("");
  const [modelPath, setModelPath] = useState("");
  const [texturePath, setTexturePath] = useState("");
  const [showGameMenu, setShowGameMenu] = useState(false);
  const [logExpanded, setLogExpanded] = useState(false);
  const [pathSuggestions, setPathSuggestions] = useState<PathSuggestion[]>([]);
  const fullLogRef = useRef<HTMLDivElement | null>(null);
  const shouldFollowLogRef = useRef(true);
  const runProgress = useMemo(() => getRunProgress(events), [events]);
  const maxRunProgressPercent = useMemo(() => getMaxRunProgressPercent(events), [events]);
  const visibleMiniEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          event.type !== "raw" ||
          (!event.message.startsWith("Queued ") && !event.message.includes(" with Roblox")),
      ),
    [events],
  );
  const runProgressPercent = runProgress
    ? Math.min(100, Math.max(0, runProgress.percent, maxRunProgressPercent))
    : 0;

  const activeGame =
    selectedGame && selectedGame.gameDir.replaceAll("\\", "/") === gameDir.replaceAll("\\", "/")
      ? selectedGame
      : null;
  const maps = activeGame?.maps ?? [];
  const gameSuggestions = games.filter((game) => {
    const query = gameDir.toLowerCase();

    return game.gameDir.toLowerCase().includes(query) || game.name.toLowerCase().includes(query);
  });
  const folderSuggestions = pathSuggestions.filter(
    (suggestion) =>
      !gameSuggestions.some((game) => game.gameDir.toLowerCase() === suggestion.path.toLowerCase()),
  );
  const needsSourceGame = mode !== "texture";

  useEffect(() => {
    let cancelled = false;

    if (gameDir.trim().length === 0) {
      setPathSuggestions([]);
      return;
    }

    const timer = window.setTimeout(() => {
      window.source2Roblox.getPathSuggestions(gameDir).then((suggestions) => {
        if (!cancelled) {
          setPathSuggestions(suggestions);
        }
      });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [gameDir]);

  useEffect(() => {
    setMapName((current) => (maps.includes(current) ? current : (maps[0] ?? "")));
  }, [maps.join("\0")]);

  useEffect(() => {
    if (!logExpanded || !fullLogRef.current || !shouldFollowLogRef.current) {
      return;
    }

    fullLogRef.current.scrollTo({
      top: fullLogRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [events.length, logExpanded]);

  const canRun =
    Boolean(settings?.outputRoot) &&
    (!needsSourceGame || gameDir.length > 0) &&
    ((mode === "map" && mapName.length > 0) ||
      (mode === "model" && modelPath.length > 0) ||
      (mode === "texture" && texturePath.length > 0) ||
      (mode === "advanced" &&
        (mapName.length > 0 || modelPath.length > 0 || texturePath.length > 0)));

  const submit = (): void => {
    if (!settings || !canRun) {
      return;
    }

    onRun({
      gameDir: mode === "texture" ? "" : gameDir,
      mode,
      mapName: mapName || undefined,
      modelPath: modelPath || undefined,
      texturePath: texturePath || undefined,
      outputRoot: settings.outputRoot,
      uploadAssets: settings.uploadAssets,
      uploadMeshes: settings.uploadMeshes,
      robloxApiKey: settings.robloxApiKey,
      robloxCreatorType: settings.robloxCreatorType,
      robloxCreatorId: settings.robloxCreatorId,
    });
  };

  const expandedLog = logExpanded
    ? createPortal(
        <div className="log-overlay" role="dialog" aria-modal="true" aria-label="Expanded run log">
          <div className="expanded-log-panel">
            <div className="expanded-log-header">
              <div>
                <p className="accent">Run log</p>
                <h2>Conversion output</h2>
              </div>
              <button
                className="log-close-button"
                onClick={() => setLogExpanded(false)}
                title="Close log"
              >
                <X size={17} />
              </button>
            </div>

            <div
              className="expanded-log-body"
              ref={fullLogRef}
              onScroll={(event) => {
                const target = event.currentTarget;
                const distanceFromBottom =
                  target.scrollHeight - target.scrollTop - target.clientHeight;

                shouldFollowLogRef.current = distanceFromBottom < 36;
              }}
            >
              {events.map((event, index) => (
                <article
                  key={`${event.timestamp}-${index}`}
                  className={classNames("full-log-row", `full-log-${event.type}`)}
                >
                  <time>{new Date(event.timestamp).toLocaleTimeString()}</time>
                  <span className="log-type">{event.type}</span>
                  <code>{event.message}</code>
                </article>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
    <section className="home-grid">
      <div className="home-main">
        <div className="section-heading">
          <h1>Convert Source maps into Roblox files.</h1>
        </div>

        <div className="mode-row">
          {(Object.keys(modeLabels) as ConversionMode[]).map((item) => (
            <button
              key={item}
              className={classNames(mode === item && "active")}
              onClick={() => setMode(item)}
            >
              {modeLabels[item]}
            </button>
          ))}
        </div>

        <div className="field-group">
          {needsSourceGame ? (
            <label>
              <span>Source game</span>
              <div className="inline-field">
                <div className="combo-box">
                  <input
                    value={gameDir}
                    onChange={(event) => {
                      onGameDirChange(event.target.value);
                      onSelectGame(null);
                      setShowGameMenu(true);
                    }}
                    onFocus={() => setShowGameMenu(true)}
                    onBlur={() => window.setTimeout(() => setShowGameMenu(false), 120)}
                    placeholder="Folder with gameinfo.txt"
                  />
                  <button
                    className="combo-toggle"
                    onClick={() => setShowGameMenu((current) => !current)}
                    title="Show detected games"
                  >
                    <ChevronsUpDown size={14} />
                  </button>
                  {showGameMenu && (gameSuggestions.length > 0 || folderSuggestions.length > 0) ? (
                    <div className="combo-menu">
                      {gameSuggestions.length > 0 ? (
                        <p className="combo-section">Compatible games</p>
                      ) : null}
                      {gameSuggestions.map((game) => (
                        <button
                          key={game.id}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            onSelectGame(game);
                            setShowGameMenu(false);
                          }}
                        >
                          <strong>{game.name}</strong>
                          <span>{game.gameDir}</span>
                        </button>
                      ))}
                      {folderSuggestions.length > 0 ? (
                        <p className="combo-section">Folders</p>
                      ) : null}
                      {folderSuggestions.map((suggestion) => (
                        <button
                          key={suggestion.path}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            const normalizedSuggestion = suggestion.path
                              .replaceAll("\\", "/")
                              .toLowerCase();
                            const matchingGame =
                              games.find(
                                (game) =>
                                  game.gameDir.replaceAll("\\", "/").toLowerCase() ===
                                  normalizedSuggestion,
                              ) ?? null;

                            onGameDirChange(suggestion.path);
                            onSelectGame(matchingGame);
                            setShowGameMenu(true);
                          }}
                        >
                          <strong>{suggestion.name}</strong>
                          <span>{suggestion.path}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button
                  className="square-button"
                  onClick={() => onBrowseGame(gameDir)}
                  title="Browse for folder"
                >
                  <FolderOpen size={16} />
                </button>
              </div>
            </label>
          ) : null}

          {(mode === "map" || mode === "advanced") && (
            <label>
              <span>Map name</span>
              <input
                list="maps"
                value={mapName}
                onChange={(event) => setMapName(event.target.value)}
                placeholder="d1_trainstation_01"
              />
              <datalist id="maps">
                {maps.map((map) => (
                  <option key={map} value={map} />
                ))}
              </datalist>
            </label>
          )}

          {(mode === "model" || mode === "advanced") && (
            <label>
              <span>Model path or name</span>
              <input
                value={modelPath}
                onChange={(event) => setModelPath(event.target.value)}
                placeholder="gman_high"
              />
            </label>
          )}

          {(mode === "texture" || mode === "advanced") && (
            <label>
              <span>VTF path</span>
              <div className="inline-field">
                <input
                  value={texturePath}
                  onChange={(event) => setTexturePath(event.target.value)}
                  placeholder="C:/path/to/texture.vtf"
                />
                <button
                  className="square-button"
                  onClick={async () => {
                    const file = await window.source2Roblox.browseForFile(texturePath || gameDir);

                    if (file) {
                      setTexturePath(file);
                    }
                  }}
                  title="Browse for VTF"
                >
                  <FolderOpen size={16} />
                </button>
              </div>
            </label>
          )}
        </div>

        <button className="run-button" onClick={submit} disabled={!canRun || running}>
          {running ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
          Run conversion
        </button>

        {running || runProgress ? (
          <div className="run-progress-card">
            <div className="run-progress-meta">
              <span>{runProgress?.label ?? "Preparing conversion..."}</span>
              {runProgress ? <strong>{Math.round(runProgressPercent)}%</strong> : null}
            </div>
            {runProgress?.detail ? <p className="run-progress-detail">{runProgress.detail}</p> : null}
            <div className={classNames("run-progress-bar", !runProgress && "is-indeterminate")}>
              <span style={{ width: runProgress ? `${runProgressPercent}%` : undefined }} />
            </div>
            <p className="run-progress-note">
              This is a rough estimate. It is not accurate. If the bar hangs on the same
              percentage for a while, it probably means it is uploading assets and the bar is in
              the wrong state. I sadly cannot make this bar more accurate, but it should still be a
              rough estimate.
            </p>
          </div>
        ) : null}

        {result?.exitCode === 0 && result.artifacts.length > 0 ? (
          <section className="conversion-results" aria-label="Generated files">
            <div className="results-heading">
              <Check size={16} />
              <div>
                <h2>Conversion complete</h2>
                <p>{result.artifacts.length} {result.artifacts.length === 1 ? "file" : "files"} ready</p>
              </div>
            </div>
            <div className="artifact-list">
              {result.artifacts.map((artifact) => (
                <button key={artifact.path} onClick={() => window.source2Roblox.revealPath(artifact.path)} title={artifact.path}>
                  <File size={17} />
                  <span>
                    <strong>{artifact.name}</strong>
                    <small>{artifact.kind}</small>
                  </span>
                  <FolderOpen size={15} />
                </button>
              ))}
            </div>
            {result.artifacts.some((artifact) => artifact.path.toLowerCase().endsWith(".rbxl")) ? (
              <>
                <div className="local-preview-note">
                  <strong>Local preview export</strong>
                  <span>
                    Textures and meshes use local Studio files. Edit mode can preview them; Play/client
                    mode needs uploaded Roblox asset IDs.
                  </span>
                </div>
                <button
                  className="studio-button"
                  onClick={() => {
                    const place = result.artifacts.find((artifact) => artifact.path.toLowerCase().endsWith(".rbxl"));

                    if (place) {
                      void window.source2Roblox.openInStudio(place.path);
                    }
                  }}
                >
                  <Play size={15} />
                  Open edit preview
                </button>
              </>
            ) : null}
          </section>
        ) : null}
      </div>

      <aside className="side-panel">
        <div>
          <p className="accent">Games</p>
          <div className="game-stack">
            {games.length === 0 ? (
              <p className="muted">No Steam game mounts found yet. Browse manually.</p>
            ) : (
              games.slice(0, 5).map((game) => (
                <button
                  key={game.id}
                  className={classNames("game-choice", selectedGame?.id === game.id && "selected")}
                  onClick={() => onSelectGame(game)}
                >
                  <span>
                    <strong>{game.name}</strong>
                    <small>{game.maps.length} maps</small>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div>
          <p className="accent">Output</p>
          <button
            className="path-button"
            onClick={() =>
              settings?.outputRoot && window.source2Roblox.openPath(settings.outputRoot)
            }
          >
            <span>{settings?.outputRoot ?? "Loading..."}</span>
          </button>
        </div>

        <div>
          <p className="accent">Run log</p>
          <div className="mini-log">
            {visibleMiniEvents.length === 0 ? (
              <span className="muted">Logs appear here after a run.</span>
            ) : (
              visibleMiniEvents.slice(-8).map((event, index) => (
                <p
                  key={`${event.timestamp}-${index}`}
                  className={classNames("log-row", event.type === "error" && "log-error")}
                >
                  <span title={event.message}>{event.message}</span>
                </p>
              ))
            )}
          </div>
          <div className="log-actions">
            {result ? (
              <span className={classNames("exit-code", result.exitCode === 0 ? "ok" : "bad")}>
                exit {result.exitCode}
              </span>
            ) : (
              <span />
            )}
            <button
              className="ghost-link"
              disabled={events.length === 0}
              onClick={() => {
                shouldFollowLogRef.current = true;
                setLogExpanded((current) => !current);
              }}
            >
              {logExpanded ? "Collapse" : "Expand"}
            </button>
          </div>

        </div>
      </aside>
    </section>
      {expandedLog}
    </>
  );
}

function SettingsView({
  settings,
  onSave,
}: {
  settings: AppSettings | null;
  onSave: (settings: AppSettings) => Promise<void>;
}) {
  const [outputRoot, setOutputRoot] = useState(settings?.outputRoot ?? "");
  const [uploadAssets, setUploadAssets] = useState(settings?.uploadAssets ?? false);
  const [uploadMeshes, setUploadMeshes] = useState(settings?.uploadMeshes ?? false);
  const [robloxApiKey, setRobloxApiKey] = useState(settings?.robloxApiKey ?? "");
  const [robloxCreatorType, setRobloxCreatorType] = useState<"user" | "group">(
    settings?.robloxCreatorType ?? "user",
  );
  const [robloxCreatorId, setRobloxCreatorId] = useState(settings?.robloxCreatorId ?? "");
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    setOutputRoot(settings?.outputRoot ?? "");
    setUploadAssets(settings?.uploadAssets ?? false);
    setUploadMeshes(settings?.uploadMeshes ?? false);
    setRobloxApiKey(settings?.robloxApiKey ?? "");
    setRobloxCreatorType(settings?.robloxCreatorType ?? "user");
    setRobloxCreatorId(settings?.robloxCreatorId ?? "");
  }, [settings]);

  return (
    <section className="settings-view">
      <div className="section-heading">
        <h1>Settings</h1>
      </div>
      <div className="settings-card">
        <label>
          <span>Output folder</span>
          <input value={outputRoot} onChange={(event) => setOutputRoot(event.target.value)} />
        </label>

        <div className="settings-split">
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={uploadAssets}
              onChange={(event) => setUploadAssets(event.target.checked)}
            />
            <span>Upload textures to Roblox</span>
          </label>
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={uploadMeshes}
              onChange={(event) => setUploadMeshes(event.target.checked)}
              disabled={!uploadAssets}
            />
            <span>Try uploading generated meshes</span>
          </label>
        </div>

        <label>
          <span>Open Cloud API key</span>
          <input
            type="password"
            value={robloxApiKey}
            onChange={(event) => setRobloxApiKey(event.target.value)}
            placeholder="Needs asset:read and asset:write"
          />
        </label>

        <div className="api-help">
          <strong>API key setup</strong>
          <p>
            In Creator Dashboard, create an Open Cloud API key. Under Access Permissions, add
            Assets and enable Read plus Write. Then paste the key here and enter the matching User
            ID or Group ID.
          </p>
          <button
            className="ghost-button"
            onClick={() =>
              window.source2Roblox.openExternal("https://create.roblox.com/dashboard/credentials")
            }
          >
            Open credentials <ExternalLink size={14} />
          </button>
        </div>

        <div className="settings-two">
          <label>
            <span>Creator</span>
            <select
              value={robloxCreatorType}
              onChange={(event) => setRobloxCreatorType(event.target.value as "user" | "group")}
            >
              <option value="user">User</option>
              <option value="group">Group</option>
            </select>
          </label>
          <label>
            <span>{robloxCreatorType === "user" ? "User ID" : "Group ID"}</span>
            <input
              value={robloxCreatorId}
              onChange={(event) => setRobloxCreatorId(event.target.value)}
              placeholder="123456789"
            />
          </label>
        </div>

        <p className="settings-note">
          Textures are uploaded with Roblox Open Cloud. Mesh uploads can take longer and may be
          rejected by Roblox, so failed meshes fall back to local preview paths.
        </p>

        <button
          className="green-button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            setSavedMessage("");

            try {
              await onSave({
                outputRoot,
                uploadAssets,
                uploadMeshes,
                robloxApiKey,
                robloxCreatorType,
                robloxCreatorId,
              });
              setSavedMessage("Saved.");
              window.setTimeout(() => setSavedMessage(""), 2200);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
          {saving ? "Saving..." : "Save"}
        </button>
        {savedMessage ? <p className="save-feedback">{savedMessage}</p> : null}
      </div>
    </section>
  );
}

export default function App() {
  const [view, setView] = useState<View>("home");
  const [checks, setChecks] = useState<SetupCheck[]>([]);
  const [games, setGames] = useState<GameInfo[]>([]);
  const [selectedGame, setSelectedGame] = useState<GameInfo | null>(null);
  const [gameDir, setGameDir] = useState("");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [events, setEvents] = useState<ConverterEvent[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installResult, setInstallResult] = useState<InstallResult | null>(null);
  const [pollUntil, setPollUntil] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);
  const hasInitializedGame = useRef(false);

  const readyCount = useMemo(() => checks.filter((check) => check.state === "ok").length, [checks]);
  const setupComplete = useMemo(
    () => checks.length > 0 && checks.every((check) => check.state === "ok"),
    [checks],
  );

  const refresh = async (): Promise<void> => {
    const startedAt = Date.now();
    setChecking(true);

    try {
      const [nextGames, nextSettings, nextChecks] = await Promise.all([
        window.source2Roblox.scanGames(),
        window.source2Roblox.getSettings(),
        window.source2Roblox.getSetupChecks(),
      ]);

      setGames(nextGames);
      setSettings(nextSettings);
      setChecks(nextChecks);
      if (!hasInitializedGame.current) {
        const initialGame = nextGames[0] ?? null;
        setSelectedGame(initialGame);
        setGameDir(initialGame?.gameDir ?? "");
        hasInitializedGame.current = true;
      }

      const nextSetupComplete = nextChecks.every((check) => check.state === "ok");

      if (nextSetupComplete) {
        setView((current) => (current === "setup" ? "home" : current));
      } else {
        setView("setup");
      }
      setInitialized(true);
    } finally {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, 2000 - elapsed);

      if (remaining > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remaining));
      }

      setChecking(false);
    }
  };

  useEffect(() => {
    const unsubscribe = window.source2Roblox.onConverterEvent((event) => {
      setEvents((current) => [...current, event]);
    });

    void refresh();

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!hasInitializedGame.current || !gameDir.trim()) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const game = await window.source2Roblox.validateGamePath(gameDir);

      if (cancelled) {
        return;
      }

      setSelectedGame(game);

      if (game) {
        setGames((current) => [game, ...current.filter((item) => item.id !== game.id)]);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [gameDir]);

  useEffect(() => {
    if (!installing && pollUntil === null) {
      return;
    }

    const timer = window.setInterval(() => {
      void refresh();

      if (!installing && pollUntil !== null && Date.now() > pollUntil) {
        setPollUntil(null);
      }
    }, 10000);

    return () => window.clearInterval(timer);
  }, [installing, pollUntil]);

  const installCheck = async (check: SetupCheck): Promise<void> => {
    setInstalling(check.id);
    setInstallResult({
      ok: true,
      method: "none",
      message: `Starting ${check.label}. The app will keep checking automatically.`,
    });
    setPollUntil(Date.now() + 180000);

    try {
      setInstallResult(await window.source2Roblox.installRequirement(check.id));
      await refresh();
    } finally {
      setInstalling(null);
      setPollUntil(Date.now() + 180000);
    }
  };

  const browseForGame = async (defaultPath?: string): Promise<void> => {
    const folder = await window.source2Roblox.browseForFolder(defaultPath);

    if (!folder) {
      return;
    }

    setGameDir(folder.replaceAll("\\", "/"));
    const game = await window.source2Roblox.validateGamePath(folder);

    if (game) {
      setGames((current) => [game, ...current.filter((item) => item.id !== game.id)]);
      setSelectedGame(game);
      setChecks((current) =>
        current.map((check) =>
          check.id === "sourceGame"
            ? {
                ...check,
                state: "ok",
                detail: `Using ${game.name}.`,
                canInstall: false,
              }
            : check,
        ),
      );
    } else {
      setSelectedGame(null);
    }
  };

  const runJob = async (job: ConversionJob): Promise<void> => {
    setRunning(true);
    setEvents([]);
    setResult(null);

    try {
      setResult(await window.source2Roblox.runConversion(job));
    } finally {
      setRunning(false);
      await refresh();
    }
  };

  const saveSettings = async (nextSettings: AppSettings): Promise<void> => {
    setSettings(await window.source2Roblox.saveSettings(nextSettings));
    await refresh();
  };

  return (
    <main className="app">
      <nav className="nav">
        <div className="nav-links">
          {initialized && !setupComplete ? (
            <button
              className={classNames(view === "setup" && "active")}
              onClick={() => setView("setup")}
            >
              <ClipboardCheck size={15} />
              Setup {readyCount}/{checks.length || 3}
            </button>
          ) : null}
          <button
            className={classNames(view === "home" && "active")}
            onClick={() => setupComplete && setView("home")}
            disabled={!initialized || !setupComplete}
          >
            <Home size={15} />
            Home
          </button>
          <button
            className={classNames(view === "settings" && "active")}
            onClick={() => setupComplete && setView("settings")}
            disabled={!initialized || !setupComplete}
          >
            <SettingsIcon size={15} />
            Settings
          </button>
        </div>
      </nav>

      {view === "setup" && (
        <SetupView
          checks={checks}
          checking={checking}
          installing={installing}
          settings={settings}
          installResult={installResult}
          onInstall={installCheck}
          onRefresh={refresh}
          onBrowseGame={browseForGame}
          onSaveCredentials={async (nextSettings) => {
            setSettings(await window.source2Roblox.saveSettings(nextSettings));
            await refresh();
          }}
          onContinue={() => setView("home")}
        />
      )}

      {view === "home" && (
        <HomeView
          games={games}
          settings={settings}
          selectedGame={selectedGame}
          gameDir={gameDir}
          events={events}
          result={result}
          running={running}
          onSelectGame={(game) => {
            setSelectedGame(game);

            if (game) {
              setGameDir(game.gameDir.replaceAll("\\", "/"));
            }
          }}
          onGameDirChange={(nextGameDir) => {
            setGameDir(nextGameDir);
            setSelectedGame(null);
          }}
          onBrowseGame={browseForGame}
          onRun={runJob}
        />
      )}

      {view === "settings" && <SettingsView settings={settings} onSave={saveSettings} />}

      <footer className="footer">
        <button
          onClick={() =>
            window.source2Roblox.openExternal("https://github.com/MaximumADHD/Source2Roblox")
          }
        >
          <TerminalSquare size={14} />
          Source2Roblox
        </button>
      </footer>
    </main>
  );
}
