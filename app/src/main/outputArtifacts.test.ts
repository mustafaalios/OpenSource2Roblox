import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ConversionJob, ConverterEvent } from "@shared/contracts";
import { collectOutputArtifacts, translateConverterEventPaths } from "./outputArtifacts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("map jobs expose the final rbxl without listing internal support files", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "s2r-artifacts-"));
  temporaryDirectories.push(root);
  const deployment = path.join(root, "deployment");
  const output = path.join(root, "output");
  const maps = path.join(deployment, "portal", "maps");
  const outputMaps = path.join(output, "portal", "maps");
  mkdirSync(outputMaps, { recursive: true });
  writeFileSync(path.join(outputMaps, "background1.rbxl"), "place");

  const job: ConversionJob = {
    gameDir: "portal",
    mode: "map",
    mapName: "background1",
    outputRoot: output,
  };
  const events: ConverterEvent[] = [
    {
      type: "raw",
      message: `Wrote ${path.join(deployment, "portal", "prop.rbxm")}`,
      timestamp: "now",
    },
    { type: "output", message: "Map export complete.", timestamp: "now", data: { path: maps } },
  ];

  expect(collectOutputArtifacts(job, events, deployment, output)).toEqual([
    {
      path: path.join(outputMaps, "background1.rbxl"),
      name: "background1.rbxl",
      kind: "Roblox place",
    },
  ]);
});

describe("model jobs", () => {
  test("expose the Roblox model and auxiliary OBJ files", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "s2r-artifacts-"));
    temporaryDirectories.push(root);
    const deployment = path.join(root, "deployment");
    const output = path.join(root, "output");
    const sourceFiles = [
      path.join(deployment, "portal", "models", "gman_high.rbxm"),
      path.join(deployment, "SourceModels", "gman_high", "gman_high.obj"),
    ];

    for (const sourceFile of sourceFiles) {
      const outputFile = path.join(output, path.relative(deployment, sourceFile));
      mkdirSync(path.dirname(outputFile), { recursive: true });
      writeFileSync(outputFile, "artifact");
    }

    const job: ConversionJob = {
      gameDir: "portal",
      mode: "model",
      modelPath: "gman_high",
      outputRoot: output,
    };
    const events: ConverterEvent[] = sourceFiles.map((sourceFile) => ({
      type: "raw",
      message: `Wrote: ${sourceFile}`,
      timestamp: "now",
    }));

    expect(
      collectOutputArtifacts(job, events, deployment, output).map((artifact) => artifact.name),
    ).toEqual(["gman_high.rbxm", "gman_high.obj"]);
  });
});

test("user-facing logs show the output folder instead of Studio's staging folder", () => {
  const event: ConverterEvent = {
    type: "raw",
    message:
      "Wrote C:\\Users\\test\\AppData\\Local\\Roblox Studio\\content\\source\\portal/models/map.mesh",
    timestamp: "now",
    data: { path: "C:/Users/test/AppData/Local/Roblox Studio/content/source/portal/maps" },
  };

  expect(
    translateConverterEventPaths(
      event,
      "C:\\Users\\test\\AppData\\Local\\Roblox Studio\\content\\source",
      "C:\\Users\\test\\Documents\\Roblox Studio\\Source2Roblox Exports",
    ),
  ).toMatchObject({
    message:
      "Wrote C:\\Users\\test\\Documents\\Roblox Studio\\Source2Roblox Exports\\portal/models/map.mesh",
    data: { path: "C:\\Users\\test\\Documents\\Roblox Studio\\Source2Roblox Exports/portal/maps" },
  });
});
