import { describe, expect, test } from "bun:test";
import { parseSteamLibraryFolders, parseVpkDirMaps } from "./steam";

describe("parseSteamLibraryFolders", () => {
  test("reads modern Steam library path entries", () => {
    const vdf = `
      "libraryfolders"
      {
        "0"
        {
          "path" "C:\\\\Program Files (x86)\\\\Steam"
        }
        "1"
        {
          "path" "D:\\\\SteamLibrary"
        }
      }
    `;

    expect(parseSteamLibraryFolders(vdf)).toEqual([
      "C:\\Program Files (x86)\\Steam",
      "D:\\SteamLibrary",
    ]);
  });

  test("returns an empty list when no path entries exist", () => {
    expect(parseSteamLibraryFolders('"libraryfolders" { }')).toEqual([]);
  });
});

describe("parseVpkDirMaps", () => {
  test("reads map names from a VPK directory tree", () => {
    const parts: Buffer[] = [];
    const pushString = (value: string): void => {
      parts.push(Buffer.from(`${value}\0`, "utf8"));
    };
    const pushEntry = (): void => {
      const entry = Buffer.alloc(18);
      entry.writeUInt16LE(0xffff, 16);
      parts.push(entry);
    };

    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x55aa1234, 0);
    header.writeUInt32LE(1, 4);

    parts.push(header);
    pushString("bsp");
    pushString("maps");
    pushString("d1_trainstation_01");
    pushEntry();
    pushString("background1");
    pushEntry();
    pushString("");
    pushString("");
    pushString("vmt");
    pushString("materials");
    pushString("not_a_map");
    pushEntry();
    pushString("");
    pushString("");
    pushString("");

    expect(parseVpkDirMaps(Buffer.concat(parts))).toEqual(["background1", "d1_trainstation_01"]);
  });
});
