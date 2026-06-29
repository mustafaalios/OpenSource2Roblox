import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getPathSuggestions } from "./pathSuggestions";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("getPathSuggestions", () => {
  test("updates matches from a partially typed forward-slash path", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "s2r-paths-"));
    temporaryDirectories.push(root);
    mkdirSync(path.join(root, "Portal"));
    mkdirSync(path.join(root, "Portal 2"));
    mkdirSync(path.join(root, "Half-Life 2"));

    const query = `${root.replaceAll("\\", "/")}/Por`;
    const suggestions = getPathSuggestions(query);

    expect(suggestions.map((suggestion) => suggestion.name)).toEqual(["Portal", "Portal 2"]);
    expect(suggestions.every((suggestion) => !suggestion.path.includes("\\"))).toBe(true);
  });

  test("lists child folders when the typed path exists", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "s2r-paths-"));
    temporaryDirectories.push(root);
    mkdirSync(path.join(root, "portal"));

    expect(getPathSuggestions(root).map((suggestion) => suggestion.name)).toContain("portal");
  });
});
