# Source2Roblox Studio

Source2Roblox Studio is a Windows desktop app for converting supported Source Engine content into Roblox-ready files. It wraps a maintained Source2Roblox converter with setup checks, game detection, conversion controls, logs, and Roblox Open Cloud asset uploads.

## Features

- Detects Steam Source game installs and validates manual game folders.
- Converts maps, models, and VTF textures through a guided desktop interface.
- Checks required setup items before conversion.
- Uploads generated textures through Roblox Open Cloud when credentials are configured.
- Shows conversion logs, output files, and quick actions for opening generated content.

## Requirements

- Windows 10 or newer.
- [Bun](https://bun.sh/) for development.
- .NET Framework 4.7.2 runtime.
- Roblox Studio Mod Manager.
- A compatible Source game with `gameinfo.txt`.
- A Roblox Open Cloud API key with Assets read and write permissions.

The app checks these requirements on first launch and helps install or configure missing items.

## Development

```powershell
bun install
bun run converter:build
bun run dev
```

Run checks before opening a pull request:

```powershell
bun test
bun run build
bun run converter:build
```

Create a Windows installer:

```powershell
bun run package
```

The installer is written to `release/`.

## AI Note

A small amount of AI help was used for frontend polish and a bit of C# cleanup. It was not the whole project, so please do not throw stones at a man for using a little bit of codex.

## Releases

Releases are created from `main` when `package.json` is bumped to a version that does not already have a matching GitHub release tag.

1. Update `package.json`.
2. Update `CHANGELOG.md`.
3. Merge the pull request into `main`.
4. The release workflow builds the app and uploads the Windows installer.

## Known Limitations

- Windows is the only supported platform.
- The progress bar is an estimate because the converter cannot know every upload duration ahead of time.
- Generated textures are not cached, so running the same conversion again can upload duplicate Roblox assets.
- Roblox may reject some generated mesh data. Failed mesh uploads fall back to local preview paths when possible.

## Legal

Only convert and upload content you have permission to use. This matters especially for public or monetized Roblox experiences.
