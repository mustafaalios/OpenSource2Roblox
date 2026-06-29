import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { PathSuggestion } from "@shared/contracts";

export function normalizeWindowsPath(value: string): string {
  return value.trim().replaceAll("/", path.sep);
}

function toDisplayPath(value: string): string {
  return value.replaceAll("\\", "/");
}

function getSuggestionBase(query: string): { directory: string; filter: string } | null {
  const normalized = normalizeWindowsPath(query);

  if (!normalized) {
    return null;
  }

  if (existsSync(normalized)) {
    try {
      if (statSync(normalized).isDirectory()) {
        return { directory: normalized, filter: "" };
      }
    } catch {
      return null;
    }
  }

  const parsed = path.win32.parse(normalized);

  if (normalized.toLowerCase() === parsed.root.toLowerCase()) {
    return { directory: parsed.root, filter: "" };
  }

  const directory = path.dirname(normalized);

  if (!directory || directory === "." || !existsSync(directory)) {
    return null;
  }

  return { directory, filter: path.basename(normalized).toLowerCase() };
}

export function getPathSuggestions(query: string): PathSuggestion[] {
  const base = getSuggestionBase(query);

  if (!base) {
    return [];
  }

  try {
    return readdirSync(base.directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.toLowerCase().startsWith(base.filter))
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, 12)
      .map((entry) => ({
        name: entry.name,
        path: toDisplayPath(path.join(base.directory, entry.name)),
      }));
  } catch {
    return [];
  }
}
