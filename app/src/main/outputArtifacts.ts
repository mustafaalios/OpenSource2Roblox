import { existsSync } from "node:fs";
import path from "node:path";
import type { ConversionJob, ConverterEvent, OutputArtifact } from "@shared/contracts";

const artifactLabels: Record<string, string> = {
  ".rbxl": "Roblox place",
  ".rbxm": "Roblox model",
  ".obj": "3D model",
  ".mtl": "Material library",
  ".png": "Texture image",
};

function replacePath(value: string, sourceRoot: string, outputRoot: string): string {
  const escapedRoots = [sourceRoot, sourceRoot.replaceAll("\\", "/")]
    .filter((root, index, roots) => roots.indexOf(root) === index)
    .map((root) => root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  return escapedRoots.reduce(
    (result, escapedRoot) => result.replace(new RegExp(escapedRoot, "gi"), outputRoot),
    value,
  );
}

export function translateConverterEventPaths(
  event: ConverterEvent,
  deploymentRoot: string,
  outputRoot: string,
): ConverterEvent {
  const data = event.data
    ? Object.fromEntries(
        Object.entries(event.data).map(([key, value]) => [
          key,
          typeof value === "string" ? replacePath(value, deploymentRoot, outputRoot) : value,
        ]),
      )
    : undefined;

  return {
    ...event,
    message: replacePath(event.message, deploymentRoot, outputRoot),
    data,
  };
}

function toOutputPath(sourcePath: string, deploymentRoot: string, outputRoot: string): string | null {
  const relativePath = path.relative(deploymentRoot, sourcePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return path.join(outputRoot, relativePath);
}

function getWrittenPath(message: string): string | null {
  return message.match(/^Wrote:?\s+(.+)$/i)?.[1]?.trim() ?? null;
}

export function collectOutputArtifacts(
  job: ConversionJob,
  events: ConverterEvent[],
  deploymentRoot: string,
  outputRoot: string,
): OutputArtifact[] {
  const candidates = new Set<string>();

  if (job.mapName) {
    const mapEvent = events.find(
      (event) => event.type === "output" && event.message === "Map export complete." && typeof event.data?.path === "string",
    );

    if (typeof mapEvent?.data?.path === "string") {
      candidates.add(path.join(mapEvent.data.path, `${job.mapName}.rbxl`));
    }
  }

  if (job.modelPath) {
    for (const event of events) {
      const writtenPath = getWrittenPath(event.message);

      if (writtenPath && [".rbxm", ".obj", ".mtl"].includes(path.extname(writtenPath).toLowerCase())) {
        candidates.add(writtenPath);
      }
    }
  }

  if (job.texturePath) {
    for (const event of events) {
      const writtenPath = getWrittenPath(event.message);

      if (writtenPath && path.extname(writtenPath).toLowerCase() === ".png") {
        candidates.add(writtenPath);
      }
    }
  }

  return [...candidates]
    .map((sourcePath) => toOutputPath(sourcePath, deploymentRoot, outputRoot))
    .filter((artifactPath): artifactPath is string => Boolean(artifactPath && existsSync(artifactPath)))
    .map((artifactPath) => ({
      path: artifactPath,
      name: path.basename(artifactPath),
      kind: artifactLabels[path.extname(artifactPath).toLowerCase()] ?? "Output file",
    }));
}
