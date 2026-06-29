import { BrowserWindow } from "electron";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { ConversionJob, ConverterEvent, RunResult } from "@shared/contracts";
import { conversionJobSchema } from "@shared/validation";
import { getConverterExePath, getRobloxContentPath, getUserDataPath } from "./paths";
import { addHistoryItem } from "./settings";
import { collectOutputArtifacts, translateConverterEventPaths } from "./outputArtifacts";

function toCliJob(job: ConversionJob): Record<string, string> {
  const cliJob: Record<string, string> = {
    output: job.outputRoot,
  };

  if (job.gameDir.trim().length > 0) {
    cliJob.game = job.gameDir;
  }

  if (job.mode === "map" && job.mapName) {
    cliJob.map = job.mapName;
  }

  if (job.mode === "model" && job.modelPath) {
    cliJob.model = job.modelPath;
  }

  if (job.mode === "texture" && job.texturePath) {
    cliJob.vtf = job.texturePath;
  }

  if (job.mode === "advanced") {
    if (job.mapName) cliJob.map = job.mapName;
    if (job.modelPath) cliJob.model = job.modelPath;
    if (job.texturePath) cliJob.vtf = job.texturePath;
  }

  if (job.uploadAssets) {
    cliJob.upload = "true";
  }

  if (job.uploadMeshes) {
    cliJob.uploadMeshes = "true";
  }

  if (job.robloxCreatorType) {
    cliJob.robloxCreatorType = job.robloxCreatorType;
  }

  if (job.robloxCreatorId) {
    cliJob.robloxCreatorId = job.robloxCreatorId;
  }

  return cliJob;
}

function parseLine(line: string): ConverterEvent {
  const trimmed = line.trim();

  if (trimmed.startsWith("S2R_EVENT ")) {
    try {
      return JSON.parse(trimmed.slice("S2R_EVENT ".length)) as ConverterEvent;
    } catch {
      return {
        type: "raw",
        message: trimmed,
        timestamp: new Date().toISOString(),
      };
    }
  }

  return {
    type: "raw",
    message: trimmed,
    timestamp: new Date().toISOString(),
  };
}

function removeAssetCacheFiles(targetPath: string): void {
  if (!existsSync(targetPath)) {
    return;
  }

  const stats = statSync(targetPath);

  if (stats.isDirectory()) {
    for (const entry of readdirSync(targetPath, { withFileTypes: true })) {
      removeAssetCacheFiles(path.join(targetPath, entry.name));
    }

    return;
  }

  if (targetPath.toLowerCase().endsWith(".asset")) {
    rmSync(targetPath, { force: true });
  }
}

function copyWithoutAssetCache(source: string, destination: string): void {
  if (source.toLowerCase().endsWith(".asset")) {
    return;
  }

  const stats = statSync(source);

  if (stats.isDirectory()) {
    mkdirSync(destination, { recursive: true });

    for (const entry of readdirSync(source, { withFileTypes: true })) {
      copyWithoutAssetCache(path.join(source, entry.name), path.join(destination, entry.name));
    }

    return;
  }

  mkdirSync(path.dirname(destination), { recursive: true });
  cpSync(source, destination, { force: true });
}

function mirrorGeneratedOutputs(
  events: ConverterEvent[],
  deploymentRoot: string,
  outputRoot: string,
): void {
  const generatedPaths = new Set<string>();

  for (const event of events) {
    for (const key of ["path", "objPath"]) {
      const generatedPath = event.data?.[key];

      if (typeof generatedPath === "string") {
        generatedPaths.add(generatedPath);
      }
    }
  }

  for (const generatedPath of generatedPaths) {
    if (!existsSync(generatedPath)) {
      continue;
    }

    const relativePath = path.relative(deploymentRoot, generatedPath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      continue;
    }

    const destination = path.join(outputRoot, relativePath);
    removeAssetCacheFiles(destination);

    copyWithoutAssetCache(generatedPath, destination);
  }
}

export async function runConversion(
  jobInput: ConversionJob,
  window: BrowserWindow,
): Promise<RunResult> {
  const job = conversionJobSchema.parse(jobInput);
  const runId = randomUUID();
  const runDir = getUserDataPath("runs", runId);
  const events: ConverterEvent[] = [];
  const converterEvents: ConverterEvent[] = [];
  const jobPath = path.join(runDir, "job.json");
  const deploymentRoot = path.join(getRobloxContentPath(), "source");

  mkdirSync(runDir, { recursive: true });
  mkdirSync(job.outputRoot, { recursive: true });
  mkdirSync(deploymentRoot, { recursive: true });
  writeFileSync(
    jobPath,
    JSON.stringify(toCliJob({ ...job, outputRoot: deploymentRoot }), null, 2),
    "utf8",
  );

  const emit = (event: ConverterEvent, fromConverter = false): void => {
    if (fromConverter) {
      converterEvents.push(event);
    }

    const visibleEvent = fromConverter
      ? translateConverterEventPaths(event, deploymentRoot, job.outputRoot)
      : event;

    events.push(visibleEvent);
    window.webContents.send("converter:event", visibleEvent);
  };

  return new Promise((resolve) => {
    const child = spawn(getConverterExePath(), ["-job", jobPath], {
      windowsHide: true,
      cwd: path.dirname(getConverterExePath()),
      env: {
        ...process.env,
        S2R_ROBLOX_API_KEY: job.robloxApiKey ?? "",
      },
    });

    const handleOutput = (chunk: Buffer): void => {
      for (const line of chunk.toString("utf8").split(/\r?\n/)) {
        if (line.trim().length > 0) {
          emit(parseLine(line), true);
        }
      }
    };

    child.stdout.on("data", handleOutput);
    child.stderr.on("data", handleOutput);

    child.on("error", (error) => {
      emit({
        type: "error",
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    });

    child.on("close", (exitCode) => {
      let finalExitCode = exitCode;
      let artifacts: RunResult["artifacts"] = [];

      if (exitCode === 0) {
        try {
          mirrorGeneratedOutputs(converterEvents, deploymentRoot, job.outputRoot);
          artifacts = collectOutputArtifacts(job, converterEvents, deploymentRoot, job.outputRoot);
          emit({
            type: "output",
            message: `Copied completed export to ${job.outputRoot}`,
            timestamp: new Date().toISOString(),
            data: { path: job.outputRoot },
          });
        } catch (error) {
          finalExitCode = 1;
          emit({
            type: "error",
            message: `Conversion succeeded, but the Documents copy failed: ${error instanceof Error ? error.message : String(error)}`,
            timestamp: new Date().toISOString(),
          });
        }
      }

      const status = finalExitCode === 0 ? "completed" : "failed";

      addHistoryItem({
        id: runId,
        createdAt: new Date().toISOString(),
        mode: job.mode,
        gameDir: job.gameDir,
        outputRoot: job.outputRoot,
        status,
      });

      resolve({
        runId,
        exitCode: finalExitCode,
        events,
        artifacts,
      });
    });
  });
}
